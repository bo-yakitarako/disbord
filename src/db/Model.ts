import dayjs from 'dayjs';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { getDbState } from './state';

type Document = Record<string, unknown>;
export type BaseProps = { id: string; createdAt: Date; updatedAt: Date };

type ModelData<C extends Model<Document>> = C extends Model<infer T> ? T : never;

type ModelClass<C extends Model<Document>> = {
  new (data: BaseProps & ModelData<C>): C;
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

export abstract class Model<T extends Document = Document> {
  protected static _tableName: string;
  protected _data: BaseProps & T;

  constructor(data: BaseProps & T) {
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

  public static async create<C extends Model<Document>>(this: ModelClass<C>, data: ModelData<C>): Promise<C> {
    const now = new Date();
    const [inserted] = (await getDbState()
      .db.insert(this.table as never)
      .values({ ...data, createdAt: now, updatedAt: now } as never)
      .returning()) as unknown[];

    if (!inserted) {
      throw new Error('Failed to insert record');
    }
    return new this(inserted as never);
  }

  public static async find<C extends Model<Document>>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<C | null> {
    const where = buildWhereClause(this.table, query as Record<string, unknown>);
    const data = await (getDbState().db.query as QueryClient)[this.tableName]!.findFirst(where ? { where } : undefined);
    if (!data) {
      return null;
    }
    return new this(data as never);
  }

  public static async findMany<C extends Model<Document>>(
    this: ModelClass<C>,
    query: Partial<BaseProps & ModelData<C>> = {},
  ): Promise<C[]> {
    const where = buildWhereClause(this.table, query as Record<string, unknown>);
    const rows = await (getDbState().db.query as QueryClient)[this.tableName]!.findMany(where ? { where } : undefined);
    return rows.map((row) => new this(row as never));
  }

  public static async updateAll<C extends Model<Document>>(
    this: ModelClass<C>,
    condition: Partial<BaseProps & ModelData<C>>,
    data: Partial<ModelData<C>>,
  ) {
    const where = buildWhereClause(this.table, condition as Record<string, unknown>);
    if (!where) {
      throw new Error('updateAll requires at least one condition');
    }

    await getDbState()
      .db.update(this.table as never)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(where);
  }

  public set(data: Partial<T>) {
    this._data = { ...this._data, ...data };
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

  public async update(data: Partial<T>) {
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
