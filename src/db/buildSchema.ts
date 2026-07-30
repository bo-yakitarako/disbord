import dayjs from 'dayjs';
import { relations, sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { readModelMeta, type ColumnMeta, type ModelClass, type ModelMeta, type RelateMeta } from './decorators';

export type { ModelClass } from './decorators';

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
function buildTableColumns(
  meta: ModelMeta,
  dbNames: Map<string, string>,
  tableNameByModel: Map<ModelClass, string>,
  tables: Record<string, any>,
) {
  const columns: Record<string, any> = { id: buildIdColumn(meta) };

  const relatesByProperty = new Map(meta.relates.map((relate) => [relate.property, relate] as const));
  for (const [property, colMeta] of collectColumnDefs(meta)) {
    let builder = createColumnBuilder(dbNames.get(property)!, colMeta);
    const relate = relatesByProperty.get(property);
    if (relate) {
      const targetTableName = tableNameByModel.get(relate.target())!;
      builder = builder.references(() => tables[targetTableName]!.id, {
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

export function buildSchema(models: ModelClass[]): Record<string, unknown> {
  const metas = models.map((model) => ({ model, meta: readModelMeta(model) }));
  const tableNameByModel = new Map(metas.map(({ model, meta }) => [model, meta.tableName] as const));

  const tables: Record<string, any> = {};
  for (const { meta } of metas) {
    const dbNames = resolveDbNames(meta);
    const columns = buildTableColumns(meta, dbNames, tableNameByModel, tables);
    tables[meta.tableName] = sqliteTable(meta.tableName, columns as any, buildExtraConfig(meta, dbNames) as any);
  }

  const relationsSchema = buildRelationsSchema(metas, tables, tableNameByModel);
  return { ...tables, ...relationsSchema };
}
