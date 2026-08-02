import dayjs, { type Dayjs } from 'dayjs';

export type ModelClass = (abstract new (...args: any[]) => unknown) & { tableName: string };

export type ColumnType = 'text' | 'integer' | 'real';
export type ColumnMode = 'boolean' | 'timestamp_ms' | 'number';

type BaseColumnOptions = {
  name?: string;
  nullable?: boolean;
  unique?: boolean;
};

/**
 * `default`は固定値か関数を渡せる。固定値はDB側の`DEFAULT`句、関数はdrizzle-orm（JS側）が
 * INSERT時に評価する値になる（後者は生SQLのINSERTには効かない）。
 */
export type TextColumnOptions = BaseColumnOptions & {
  mode?: undefined;
  enum?: readonly string[];
  default?: string | (() => string);
};

export type RealColumnOptions = BaseColumnOptions & {
  mode?: undefined;
  default?: number | (() => number);
};

export type IntegerColumnOptions =
  | (BaseColumnOptions & { mode?: 'number'; default?: number | (() => number) })
  | (BaseColumnOptions & { mode: 'boolean'; default?: boolean | (() => boolean) })
  | (BaseColumnOptions & {
      mode: 'timestamp_ms';
      /**
       * 固定値・関数に加え、特別な値`'now'`も指定できる。DB側の
       * `DEFAULT (unixepoch('subsec') * 1000)`（挿入時刻のミリ秒unix時間）になる。
       * accessorの読み取り型に合わせて`Date`ではなく`Dayjs`で指定する
       * （実際にDBへ渡す際はDayjs→Dateへ変換される）。
       */
      default?: 'now' | Dayjs | (() => Dayjs);
    });

export type ColumnOptions = TextColumnOptions | RealColumnOptions | IntegerColumnOptions;

export type RelateOptions = {
  onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action';
  onUpdate?: 'cascade' | 'set null' | 'restrict' | 'no action';
  nullable?: boolean;
  relationName?: string;
  inverseRelationName?: string;
};

export type ColumnMeta =
  | { property: string; type: 'text'; options: TextColumnOptions }
  | { property: string; type: 'real'; options: RealColumnOptions }
  | { property: string; type: 'integer'; options: IntegerColumnOptions };
export type MarkerMeta = { properties: string[]; name?: string };
export type RelateMeta = { property: string; target: () => ModelClass; options: RelateOptions };

export type ModelMeta = {
  tableName: string;
  columns: ColumnMeta[];
  primaryKeys: string[];
  uniques: MarkerMeta[];
  indexes: MarkerMeta[];
  relates: RelateMeta[];
};

const COLUMNS = Symbol('disbord:columns');
const PRIMARY_KEYS = Symbol('disbord:primaryKeys');
const UNIQUES = Symbol('disbord:uniques');
const INDEXES = Symbol('disbord:indexes');
const RELATES = Symbol('disbord:relates');

type MetadataBag = Record<symbol, unknown>;
type AnyClass = abstract new (...args: any[]) => unknown;

function push<T>(metadata: MetadataBag, key: symbol, entry: T): void {
  const list = (metadata[key] ??= []) as T[];
  list.push(entry);
}

/**
 * Modelインスタンスごとのカラム値を保持する内部ストレージ。`@Column`/`@Relate`の
 * accessorもModel本体のid/createdAt/updatedAtも、インスタンスのプロパティとしては
 * 持たずここに集約する（save()/set()がDB行全体をまとめて読み書きする都合上、
 * フィールドごとに独立したストレージへ分散させるよりフラットな1オブジェクトの方が扱いやすい）。
 */
const columnStore = new WeakMap<object, Record<string, unknown>>();

export function getColumnBag(instance: object): Record<string, unknown> {
  return columnStore.get(instance) ?? {};
}

export function setColumnBag(instance: object, data: Record<string, unknown>): void {
  columnStore.set(instance, data);
}

export function mergeColumnBag(instance: object, data: Record<string, unknown>): void {
  columnStore.set(instance, { ...getColumnBag(instance), ...data });
}

export function dataGetter(
  property: string,
  options: { dayjs?: boolean } = {},
): { get(this: any): any; set(this: any): void } {
  return {
    get(this: any) {
      const value = getColumnBag(this)[property];
      return options.dayjs && value != null ? dayjs(value as any) : value;
    },
    set(this: any) {
      throw new Error(
        `disbord: ${property} は読み取り専用です。値を変更するには Model の set()/update() を使ってください`,
      );
    },
  };
}

type ColumnDecorator = (
  target: unknown,
  context: ClassAccessorDecoratorContext,
) => { get(this: any): any; set(this: any): void };

export function Column(type: 'text', options?: TextColumnOptions): ColumnDecorator;
export function Column(type: 'real', options?: RealColumnOptions): ColumnDecorator;
export function Column(type: 'integer', options?: IntegerColumnOptions): ColumnDecorator;
export function Column(type: ColumnType, options: ColumnOptions = {}): ColumnDecorator {
  return function (_target: unknown, context: ClassAccessorDecoratorContext) {
    const metadata = context.metadata as MetadataBag;
    const property = String(context.name);
    push<ColumnMeta>(metadata, COLUMNS, { property, type, options } as ColumnMeta);
    if (options.unique) {
      push<MarkerMeta>(metadata, UNIQUES, { properties: [property] });
    }
    return dataGetter(property, { dayjs: options.mode === 'timestamp_ms' });
  };
}

export function PrimaryKey() {
  return function (_target: unknown, context: ClassAccessorDecoratorContext): void {
    push<string>(context.metadata as MetadataBag, PRIMARY_KEYS, String(context.name));
  };
}

export function Unique(name?: string) {
  return function (_target: unknown, context: ClassAccessorDecoratorContext): void {
    push<MarkerMeta>(context.metadata as MetadataBag, UNIQUES, { properties: [String(context.name)], name });
  };
}

export function Index(name?: string) {
  return function (_target: unknown, context: ClassAccessorDecoratorContext): void {
    push<MarkerMeta>(context.metadata as MetadataBag, INDEXES, { properties: [String(context.name)], name });
  };
}

export function CompoundUnique(properties: string[], name?: string) {
  return function <T extends AnyClass>(_value: T, context: ClassDecoratorContext<T>): void {
    push<MarkerMeta>(context.metadata as MetadataBag, UNIQUES, { properties, name });
  };
}

export function CompoundIndex(properties: string[], name?: string) {
  return function <T extends AnyClass>(_value: T, context: ClassDecoratorContext<T>): void {
    push<MarkerMeta>(context.metadata as MetadataBag, INDEXES, { properties, name });
  };
}

export function Relate(target: () => ModelClass, options: RelateOptions = {}) {
  return function (_target: unknown, context: ClassAccessorDecoratorContext) {
    const property = String(context.name);
    push<RelateMeta>(context.metadata as MetadataBag, RELATES, { property, target, options });
    return dataGetter(property);
  };
}

type TableRegistration = { tableName: string; metadata: MetadataBag };

const modelRegistry = new WeakMap<AnyClass, TableRegistration>();

export function Table(tableName: string) {
  return function <T extends AnyClass>(value: T, context: ClassDecoratorContext<T>): T {
    modelRegistry.set(value, { tableName, metadata: context.metadata as MetadataBag });
    (value as unknown as { _tableName: string })._tableName = tableName;
    return value;
  };
}

export function readModelMeta(modelClass: ModelClass): ModelMeta {
  const registration = modelRegistry.get(modelClass as unknown as AnyClass);
  if (!registration) {
    throw new Error(`disbord: ${modelClass.name} に @Table() が付いていません`);
  }
  const metadata = registration.metadata;
  return {
    tableName: registration.tableName,
    columns: (metadata[COLUMNS] as ColumnMeta[] | undefined) ?? [],
    primaryKeys: (metadata[PRIMARY_KEYS] as string[] | undefined) ?? [],
    uniques: (metadata[UNIQUES] as MarkerMeta[] | undefined) ?? [],
    indexes: (metadata[INDEXES] as MarkerMeta[] | undefined) ?? [],
    relates: (metadata[RELATES] as RelateMeta[] | undefined) ?? [],
  };
}
