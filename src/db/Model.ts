import dayjs, { type Dayjs } from 'dayjs';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { dataGetter, getColumnBag, mergeColumnBag, setColumnBag } from './decorators';
import { getDbState } from './state';

export type BaseProps = { id: string; createdAt: Date; updatedAt: Date };

/**
 * data中のDayjsインスタンスを生のDateへ変換する。`@Column(timestamp_ms)`のaccessorは
 * getter越しにDayjsでラップして返すため、「既存モデルから読み取ったDayjs値をそのまま
 * create()/update()に渡し回す」のが自然な使い方になる。だがDB書き込みはdrizzleが
 * `.getTime()`を呼べる生の`Date`を要求する（Dayjsインスタンスのまま渡すと
 * `value.getTime is not a function`で壊れる。実機確認済み）ため、渡す直前にここで変換する。
 * @Column(timestamp_ms)のプロパティ名をメタデータから引く必要はなく、値が
 * dayjs.isDayjs()かどうかだけで判定できる。
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
 * `class Job extends Model<Job.Data>`のように、サブクラス自身が`Data`を型引数として
 * 渡す。`Data`はクラス自身の型引数として`extends`時点で確定するため、`this`の多相性に
 * 依存せずに済む（`Partial<Omit<this, keyof Model>>`のような`this`越しのマップ/条件型は、
 * クラス自身のメソッド内から`this.update(...)`のように呼ぶとTypeScriptが解決できない
 * 既知の制限があり、実機で確認済み。`Data`をただの型引数にすることでこの制限を回避する）。
 * `namespace Job { export type Data = ... }`は`disbord generate model`/`disbord migrate`/
 * `disbord model type`が`@Column`/`@Relate`のメタデータから自動生成する（手書き不要）。
 * timestamp_msカラムは`Data`側で最初から`Date | Dayjs`として生成されるため、
 * `ModelData`自身がDayjsを特別扱いする必要はない（modelDataBlock.ts参照）。
 */
type ModelData<C extends Model<any>> = C extends Model<infer T> ? T : never;

type ModelClass<C extends Model<any>> = {
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

/**
 * `id`/`createdAt`/`updatedAt`は`@Column`のようなメタデータ登録は不要
 * （buildSchema.tsで専用のカラムとして組み立てるため）だが、サブクラスの
 * `@Column`付きaccessorと同じくインスタンスのカラム値ストレージ越しの読み取りに
 * したいので、dataGetterだけを流用してaccessorのget/setを差し替える。
 */
function baseColumn(property: keyof BaseProps, options: { dayjs?: boolean } = {}) {
  return function (_target: unknown, _context: ClassAccessorDecoratorContext) {
    return dataGetter(property, options);
  };
}

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

export abstract class Model<Data extends Record<string, unknown> = Record<string, unknown>> {
  protected static _tableName: string;

  @baseColumn('id')
  accessor id!: string;

  @baseColumn('createdAt', { dayjs: true })
  accessor createdAt!: Dayjs;

  @baseColumn('updatedAt', { dayjs: true })
  accessor updatedAt!: Dayjs;

  constructor(data: BaseProps & Record<string, unknown>) {
    setColumnBag(this, data);
  }

  public static get tableName(): string {
    return this._tableName;
  }

  public static get table(): Record<string, unknown> {
    return getDbState().schema[this.tableName] as Record<string, unknown>;
  }

  public static async create<C extends Model<any>>(this: ModelClass<C>, data: ModelData<C>): Promise<C> {
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

  public static async find<C extends Model<any>>(
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

  public static async exists<C extends Model<any>>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<boolean> {
    const where = buildWhereClause(this.table, normalizeDayjsValues(query as Record<string, unknown>));
    const result = await getDbState().db.get<{ found: number }>(
      sql`select exists(select 1 from ${this.table} ${where ? sql`where ${where}` : sql``}) as found`,
    );
    return result?.found === 1;
  }

  public static async findMany<C extends Model<any>>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<C[]> {
    const where = buildWhereClause(this.table, normalizeDayjsValues(query as Record<string, unknown>));
    const rows = await (getDbState().db.query as QueryClient)[this.tableName]!.findMany(where ? { where } : undefined);
    return rows.map((row) => new this(row as never));
  }

  public static async findDistinct<C extends Model<any>, K extends keyof ModelData<C>>(
    this: ModelClass<C>,
    columns: K[],
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<Pick<ModelData<C>, K>[]> {
    const where = buildWhereClause(this.table, normalizeDayjsValues(query as Record<string, unknown>));
    const tableColumns = getTableColumns(this.table as never) as Record<string, unknown>;
    const selection = Object.fromEntries(columns.map((column) => [column, tableColumns[column as string]]));

    const builder = getDbState()
      .db.selectDistinct(selection as never)
      .from(this.table as never);
    const rows = await (where ? builder.where(where) : builder);
    return rows as Pick<ModelData<C>, K>[];
  }

  public static async updateAll<C extends Model<any>>(
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

  public set(data: Partial<Data>) {
    mergeColumnBag(this, normalizeDayjsValues(data as Record<string, unknown>));
  }

  public async save() {
    mergeColumnBag(this, { updatedAt: new Date() });
    const { id, ...rest } = getColumnBag(this);
    const table = (this.constructor as typeof Model).table;
    const columns = getTableColumns(table as never) as Record<string, unknown>;

    await getDbState()
      .db.update(table as never)
      .set(rest as never)
      .where(eq(columns.id as never, id));
  }

  public async update(data: Partial<Data>) {
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
