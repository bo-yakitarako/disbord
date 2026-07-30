import dayjs, { type Dayjs } from 'dayjs';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { getDbState } from './state';

export type BaseProps = { id: string; createdAt: Date; updatedAt: Date };

/**
 * `@Column({ mode: 'timestamp_ms' })`のaccessorはgetter越しにDayjsでラップされるため、
 * `accessor actedAt!: Dayjs;`のように「読み取り時の型」をそのまま宣言する。だがDB書き込み・
 * create()の入力はdrizzleが`.getTime()`を呼べる生の`Date`が必要（Dayjsインスタンスのまま渡すと
 * `value.getTime is not a function`で壊れる。実機確認済み）。
 * 一方で「既存モデルから読み取ったDayjs値をそのままcreate()/update()に渡し回す」のは
 * 自然な使い方のため、型上はDate/Dayjsの両方を受け付け、実行時にnormalizeDayjsValuesで
 * Dayjs→Dateへ変換してからdrizzleに渡す。
 */
type UnwrapDayjs<T> = { [K in keyof T]: T[K] extends Dayjs ? Date | Dayjs : T[K] };

/**
 * data中のDayjsインスタンスを生のDateへ変換する。@Column(timestamp_ms)のプロパティ名を
 * メタデータから引く必要はなく、値がdayjs.isDayjs()かどうかだけで判定できる。
 */
function normalizeDayjsValues<T extends Record<string, unknown>>(data: T): T {
  const normalized: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(normalized)) {
    if (dayjs.isDayjs(value)) {
      normalized[key] = value.toDate();
    }
  }
  return normalized as T;
}

/**
 * サブクラス自身の宣言（`@Column`/`@Relate`のaccessor）だけをModel本体のメンバから除いて
 * 取り出す。namespace Xxx { export type Data = ... } のような生成・書き戻しは一切不要で、
 * クラス定義から直接（構造的に）導出できる。
 */
type ModelData<C extends Model> = UnwrapDayjs<Omit<C, keyof Model>>;

type ModelClass<C extends Model> = {
  new (data: BaseProps & Record<string, unknown>): C;
  tableName: string;
  table: Record<string, unknown>;
};

type QueryClient = Record<
  string,
  {
    findFirst: (config?: unknown) => Promise<unknown>;
    findMany: (config?: unknown) => Promise<unknown[]>;
  }
>;

function isNullish(value: unknown) {
  return value === undefined || value === null;
}

function buildWhereClause(table: Record<string, unknown>, query: Record<string, unknown>) {
  const columns = getTableColumns(table as never);
  const conditions = Object.entries(query)
    .filter((entry) => !isNullish(entry[1]))
    .map(([key, value]) => eq(columns[key as keyof typeof columns] as never, value as never));

  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions);
}

export abstract class Model {
  protected static _tableName: string;
  protected _data: BaseProps & Record<string, unknown>;

  constructor(data: BaseProps & Record<string, unknown>) {
    this._data = data;
  }

  public get id() {
    return this._data.id;
  }

  public get createdAt() {
    return dayjs(this._data.createdAt);
  }

  public get updatedAt() {
    return dayjs(this._data.updatedAt);
  }

  public static get tableName(): string {
    return this._tableName;
  }

  public static get table(): Record<string, unknown> {
    return getDbState().schema[this.tableName] as Record<string, unknown>;
  }

  public static async create<C extends Model>(this: ModelClass<C>, data: ModelData<C>): Promise<C> {
    const now = new Date();
    const [inserted] = (await getDbState()
      .db.insert(this.table as never)
      .values({ ...normalizeDayjsValues(data as Record<string, unknown>), createdAt: now, updatedAt: now } as never)
      .returning()) as unknown[];

    if (!inserted) {
      throw new Error('Failed to insert record');
    }
    return new this(inserted as never);
  }

  public static async find<C extends Model>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<C | null> {
    const where = buildWhereClause(this.table, normalizeDayjsValues(query as Record<string, unknown>));
    const data = await (getDbState().db.query as QueryClient)[this.tableName]!.findFirst(where ? { where } : undefined);
    if (!data) {
      return null;
    }
    return new this(data as never);
  }

  public static async findMany<C extends Model>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<C[]> {
    const where = buildWhereClause(this.table, normalizeDayjsValues(query as Record<string, unknown>));
    const rows = await (getDbState().db.query as QueryClient)[this.tableName]!.findMany(where ? { where } : undefined);
    return rows.map((row) => new this(row as never));
  }

  public static async updateAll<C extends Model>(
    this: ModelClass<C>,
    condition: Partial<BaseProps & ModelData<C>>,
    data: Partial<ModelData<C>>,
  ) {
    const where = buildWhereClause(this.table, normalizeDayjsValues(condition as Record<string, unknown>));
    if (!where) {
      throw new Error('updateAll requires at least one condition');
    }

    await getDbState()
      .db.update(this.table as never)
      .set({ ...normalizeDayjsValues(data as Record<string, unknown>), updatedAt: new Date() } as never)
      .where(where);
  }

  public set(data: Partial<ModelData<this>>) {
    this._data = { ...this._data, ...normalizeDayjsValues(data as Record<string, unknown>) };
  }

  public async save() {
    this._data.updatedAt = new Date();
    const { id, ...rest } = this._data;
    const table = (this.constructor as typeof Model).table;
    const columns = getTableColumns(table as never) as Record<string, unknown>;

    await getDbState()
      .db.update(table as never)
      .set(rest as never)
      .where(eq(columns.id as never, id));
  }

  public async update(data: Partial<ModelData<this>>) {
    this.set(data);
    await this.save();
  }

  public async delete() {
    const table = (this.constructor as typeof Model).table;
    const columns = getTableColumns(table as never) as Record<string, unknown>;
    await getDbState()
      .db.delete(table as never)
      .where(eq(columns.id as never, this.id));
  }
}
