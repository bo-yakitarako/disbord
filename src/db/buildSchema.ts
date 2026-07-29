import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { readModelMeta, type ColumnMeta, type ModelClass, type ModelMeta, type RelateMeta } from './decorators';

export type { ModelClass } from './decorators';

export function toSnakeCase(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function relationPropertyName(property: string): string {
  return property.endsWith('Id') ? property.slice(0, -'Id'.length) : property;
}

function createColumnBuilder(dbName: string, colMeta: ColumnMeta): any {
  const options = colMeta.options;
  let builder: any;
  if (colMeta.type === 'text') {
    builder = options.enum ? text(dbName, { enum: options.enum as [string, ...string[]] }) : text(dbName);
  } else if (colMeta.type === 'integer') {
    builder = options.mode ? integer(dbName, { mode: options.mode }) : integer(dbName);
  } else {
    builder = real(dbName);
  }
  if (!options.nullable) {
    builder = builder.notNull();
  }
  if (options.default !== undefined) {
    builder =
      typeof options.default === 'function'
        ? builder.$defaultFn(options.default as () => unknown)
        : builder.default(options.default);
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

function buildTableColumns(
  meta: ModelMeta,
  dbNames: Map<string, string>,
  tableNameByModel: Map<ModelClass, string>,
  tables: Record<string, any>,
) {
  const columns: Record<string, any> = {
    id: buildIdColumn(meta),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  };

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
