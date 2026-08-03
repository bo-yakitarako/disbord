import dayjs from 'dayjs';
import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
  type AnySQLiteTable,
  type SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import { readModelMeta, type ColumnMeta, type ModelClass, type ModelMeta, type RelateMeta } from './decorators';
import type { BaseProps, Model } from './Model';

export type { ModelClass } from './decorators';

/**
 * `M`が`Model<Data>`を継承したクラスなら、その`Data`（`namespace Xxx { export type Data }`が
 * `disbord migrate`等で自動生成する型）を取り出す。`@Relate(() => User as unknown as ModelClass)`
 * のように型を消して渡している箇所は`ModelClass`止まりで`Data`が引けないため、その場合は
 * `Record<string, unknown>`にフォールバックする(buildTable自体の呼び出しは常に実クラスを渡す
 * ため、生成されたschema.tsでは通常フォールバックしない)。
 */
type ModelDataOf<M extends ModelClass> = InstanceType<M> extends Model<infer D> ? D : Record<string, unknown>;

type TableRowOf<M extends ModelClass> = BaseProps & ModelDataOf<M>;

/**
 * `buildTable()`の戻り値を「実際にどのdrizzleビルダーで組み立てたか」ではなく、
 * `Model<Data>`のData型が持つ各プロパティのJS上の値の型だけから機械的に組み立てる。
 * `timestamp_ms`カラムのData型は`Date | Dayjs`（create()/update()の入力を広く受けるため）
 * だが、DBから読み出した値は常に`Date`なので、select結果の型としてはやや広め（安全側）になる。
 */
type TableColumnsOf<M extends ModelClass> = {
  [K in keyof TableRowOf<M>]: AnySQLiteColumn<{
    name: K & string;
    data: TableRowOf<M>[K];
  }>;
};

export type TableOf<M extends ModelClass> = SQLiteTableWithColumns<{
  name: string;
  schema: undefined;
  columns: TableColumnsOf<M>;
  dialect: 'sqlite';
}>;

export function toSnakeCase(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function relationPropertyName(property: string): string {
  return property.endsWith('Id') ? property.slice(0, -'Id'.length) : property;
}

/**
 * `mode: 'timestamp_ms'`のカラムに限り`default: 'now'`をDB側の`DEFAULT (unixepoch('subsec') * 1000)`
 * （挿入時刻・ミリ秒精度）へ変換する。それ以外の型/modeでは'now'をただの文字列リテラルの
 * default値として扱う(明示的に対応を絞ることで、意図しない型のカラムに紛れ込んでも
 * 黙って壊れた変換をしないようにする)。
 */
function isTimestampMsColumn(colMeta: ColumnMeta): boolean {
  return colMeta.type === 'integer' && colMeta.options.mode === 'timestamp_ms';
}

/**
 * `mode: 'timestamp_ms'`のカラムに限り`default: 'now'`をDB側の`DEFAULT (unixepoch('subsec') * 1000)`
 * （挿入時刻・ミリ秒精度）へ変換する。それ以外の型/modeでは'now'をただの文字列リテラルの
 * default値として扱う(明示的に対応を絞ることで、意図しない型のカラムに紛れ込んでも
 * 黙って壊れた変換をしないようにする)。
 */
function isNowDefault(colMeta: ColumnMeta): boolean {
  return isTimestampMsColumn(colMeta) && colMeta.options.default === 'now';
}

/**
 * `mode: 'timestamp_ms'`のdefaultはaccessorの読み取り型に合わせてDayjsで指定できるが、
 * drizzleに渡す値は`.getTime()`を呼べる生の`Date`が必要（Dayjsインスタンスのままだと
 * `value.getTime is not a function`で壊れる）。値・関数どちらの場合もDayjsだけDateへ変換する。
 */
function normalizeDefaultValue(value: unknown): unknown {
  return dayjs.isDayjs(value) ? value.toDate() : value;
}

function createColumnBuilder(dbName: string, colMeta: ColumnMeta): any {
  let builder: any;
  if (colMeta.type === 'text') {
    builder = colMeta.options.enum
      ? text(dbName, { enum: colMeta.options.enum as [string, ...string[]] })
      : text(dbName);
  } else if (colMeta.type === 'integer') {
    builder = colMeta.options.mode ? integer(dbName, { mode: colMeta.options.mode }) : integer(dbName);
  } else {
    builder = real(dbName);
  }

  const options = colMeta.options;
  if (!options.nullable) {
    builder = builder.notNull();
  }
  if (isNowDefault(colMeta)) {
    builder = builder.default(sql`(unixepoch('subsec') * 1000)`);
  } else if (typeof options.default === 'function') {
    builder = builder.$defaultFn(() => normalizeDefaultValue((options.default as () => unknown)()));
  } else if (options.default !== undefined) {
    const value = normalizeDefaultValue(options.default);
    // timestamp_msの固定値defaultはdrizzleに生のDateを渡すと`DEFAULT '"2026-..."'`のような
    // JSON文字列がDDLに埋め込まれてしまう(実機確認済み: SQLiteの生INSERTで壊れた値になる)ため、
    // ミリ秒unix時間のリテラルを直接SQL式として埋め込む。
    builder =
      isTimestampMsColumn(colMeta) && value instanceof Date
        ? builder.default(sql.raw(String(value.getTime())))
        : builder.default(value);
  }
  return builder;
}

function collectColumnDefs(meta: ModelMeta): Map<string, ColumnMeta> {
  const defs = new Map(meta.columns.map((column) => [column.property, column] as const));
  for (const relate of meta.relates) {
    if (!defs.has(relate.property)) {
      defs.set(relate.property, {
        property: relate.property,
        type: 'text',
        options: { nullable: relate.options.nullable },
      });
    }
  }
  return defs;
}

function buildIdColumn(meta: ModelMeta): any {
  const base = text('id')
    .$defaultFn(() => crypto.randomUUID())
    .notNull();
  return meta.primaryKeys.length > 0 ? base.unique() : base.primaryKey();
}

/**
 * `buildTable()`が組み立てたテーブルをモデルクラスから引けるようにする登録簿。
 * `.references()`に渡すコールバックはdrizzleが遅延評価するため、参照先が自分より後に
 * `buildTable()`される場合（相互参照・自己参照）でも、実際に評価される頃には登録済みになる。
 */
const modelTables = new WeakMap<ModelClass, AnySQLiteTable>();
const tableRegistrations = new WeakMap<AnySQLiteTable, { model: ModelClass; meta: ModelMeta }>();

function resolveTargetTable(model: ModelClass): AnySQLiteTable {
  const table = modelTables.get(model);
  if (!table) {
    throw new Error(`disbord: ${model.name}のテーブルが見つかりません。先にbuildTable(${model.name})を呼んでください`);
  }
  return table;
}

function resolveDbNames(meta: ModelMeta): Map<string, string> {
  const names = new Map<string, string>([
    ['id', 'id'],
    ['createdAt', 'created_at'],
    ['updatedAt', 'updated_at'],
  ]);
  for (const [property, colMeta] of collectColumnDefs(meta)) {
    names.set(property, colMeta.options.name ?? toSnakeCase(property));
  }
  return names;
}

/**
 * カラム順は`id`→モデル自身が宣言したカラム→`created_at`/`updated_at`にする
 * (オブジェクトのkey挿入順がそのままCREATE TABLEの列順になるため、この並びで組み立てる)。
 */
function buildTableColumns(meta: ModelMeta, dbNames: Map<string, string>) {
  const columns: Record<string, any> = { id: buildIdColumn(meta) };

  const relatesByProperty = new Map(meta.relates.map((relate) => [relate.property, relate] as const));
  for (const [property, colMeta] of collectColumnDefs(meta)) {
    let builder = createColumnBuilder(dbNames.get(property)!, colMeta);
    const relate = relatesByProperty.get(property);
    if (relate) {
      builder = builder.references(() => (resolveTargetTable(relate.target()) as any).id, {
        onDelete: relate.options.onDelete,
        onUpdate: relate.options.onUpdate,
      });
    }
    columns[property] = builder;
  }

  columns.createdAt = integer('created_at', { mode: 'timestamp_ms' }).notNull();
  columns.updatedAt = integer('updated_at', { mode: 'timestamp_ms' }).notNull();
  return columns;
}

function buildExtraConfig(meta: ModelMeta, dbNames: Map<string, string>) {
  return (t: Record<string, any>): unknown[] => {
    const entries: unknown[] = [];
    for (const idx of meta.indexes) {
      const name = idx.name ?? `${meta.tableName}_${idx.properties.map((p) => dbNames.get(p)!).join('_')}_idx`;
      entries.push(index(name).on(...(idx.properties.map((p) => t[p]) as [any, ...any[]])));
    }
    for (const uq of meta.uniques) {
      const name = uq.name ?? `${meta.tableName}_${uq.properties.map((p) => dbNames.get(p)!).join('_')}_unique`;
      entries.push(unique(name).on(...(uq.properties.map((p) => t[p]) as [any, ...any[]])));
    }
    if (meta.primaryKeys.length > 0) {
      entries.push(primaryKey({ columns: meta.primaryKeys.map((p) => t[p]) as [any, ...any[]] }));
    }
    return entries;
  };
}

function buildRelationsSchema(
  metas: { meta: ModelMeta }[],
  tables: Record<string, any>,
  tableNameByModel: Map<ModelClass, string>,
): Record<string, unknown> {
  const relatesBySourceTable = new Map<string, RelateMeta[]>();
  const inverseBySourceTable = new Map<string, { relate: RelateMeta; fromTableName: string }[]>();

  for (const { meta } of metas) {
    for (const relate of meta.relates) {
      const targetTableName = tableNameByModel.get(relate.target())!;

      const forward = relatesBySourceTable.get(meta.tableName) ?? [];
      forward.push(relate);
      relatesBySourceTable.set(meta.tableName, forward);

      const inverse = inverseBySourceTable.get(targetTableName) ?? [];
      inverse.push({ relate, fromTableName: meta.tableName });
      inverseBySourceTable.set(targetTableName, inverse);
    }
  }

  const result: Record<string, unknown> = {};
  const involvedTableNames = new Set([...relatesBySourceTable.keys(), ...inverseBySourceTable.keys()]);

  for (const tableName of involvedTableNames) {
    const forward = relatesBySourceTable.get(tableName) ?? [];
    const inverse = inverseBySourceTable.get(tableName) ?? [];

    result[`${tableName}Relations`] = relations(tables[tableName], ((helpers: any) => {
      const config: Record<string, unknown> = {};
      for (const relate of forward) {
        const targetTableName = tableNameByModel.get(relate.target())!;
        const key = relate.options.relationName ?? relationPropertyName(relate.property);
        config[key] = helpers.one(tables[targetTableName], {
          fields: [tables[tableName][relate.property]],
          references: [tables[targetTableName].id],
        });
      }
      for (const { relate, fromTableName } of inverse) {
        const key = relate.options.inverseRelationName ?? fromTableName;
        config[key] = helpers.many(tables[fromTableName]);
      }
      return config;
    }) as any);
  }

  return result;
}

/**
 * モデルクラス1つにつき1つのテーブルを組み立てる。他のモデルへの`@Relate`は`buildSchema()`で
 * まとめて渡された時点で解決されるため、ここでは呼び出し順を気にせず個別に呼び出せる
 * （相互参照・自己参照はmodelTables/`resolveTargetTable`の遅延解決で対応する）。
 */
export function buildTable<M extends ModelClass>(model: M): TableOf<M> {
  const meta = readModelMeta(model);
  const dbNames = resolveDbNames(meta);
  const columns = buildTableColumns(meta, dbNames);
  const table = sqliteTable(meta.tableName, columns as any, buildExtraConfig(meta, dbNames) as any) as AnySQLiteTable;
  modelTables.set(model, table);
  tableRegistrations.set(table, { model, meta });
  return table as unknown as TableOf<M>;
}

/**
 * `buildTable()`で作った個々のテーブルを受け取り、relations()を含む完全なdrizzleスキーマに
 * まとめる。テーブルからモデルのメタデータを引くため、渡すテーブルは必ず`buildTable()`の
 * 戻り値でなければならない。
 */
export function buildSchema(tables: AnySQLiteTable[]): Record<string, unknown> {
  const metas = tables.map((table) => {
    const registration = tableRegistrations.get(table);
    if (!registration) {
      throw new Error('disbord: buildSchema()にはbuildTable()で作成したテーブルを渡してください');
    }
    return registration;
  });
  const tableNameByModel = new Map(metas.map(({ model, meta }) => [model, meta.tableName] as const));
  const tablesByName = Object.fromEntries(metas.map(({ meta }, i) => [meta.tableName, tables[i]]));

  const relationsSchema = buildRelationsSchema(metas, tablesByName, tableNameByModel);
  return { ...tablesByName, ...relationsSchema };
}
