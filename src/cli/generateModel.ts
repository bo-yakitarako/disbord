import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toSnakeCase } from '../db/buildSchema';
import { readModelMeta, type ModelClass } from '../db/decorators';
import { buildDataTypeLiteral, renderDataBlock, withDataBlock } from './modelDataBlock';
import { readBotConfig } from './readBotConfig';

function pluralize(word: string): string {
  const lower = word.toLowerCase();

  if (/(s|x|z|ch|sh)$/.test(lower)) {
    return `${word}es`;
  }
  if (/[^aeiou]y$/.test(lower)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (lower.endsWith('fe')) {
    return `${word.slice(0, -2)}ves`;
  }
  if (lower.endsWith('f')) {
    return `${word.slice(0, -1)}ves`;
  }
  if (/[^aeiou]o$/.test(lower)) {
    return `${word}es`;
  }
  return `${word}s`;
}

function toTableName(className: string): string {
  const camel = className.charAt(0).toLowerCase() + className.slice(1);
  return pluralize(toSnakeCase(camel));
}

/**
 * `namespace ${name} { export type Data = ... }`はここでは書かない。
 * `disbord migrate`と同じ仕組み（modelDataBlock.ts）で、書き出し直後にこのファイル自身を
 * 動的importして@Column/@Relateのメタデータから機械的に末尾へ追記する。
 */
export function generateModelFileContent(name: string): string {
  const tableName = toTableName(name);
  return `import { Column, Model, Table } from 'disbord';

@Table('${tableName}')
export class ${name} extends Model<${name}.Data> {
  @Column('text')
  accessor sample!: string;
}
`;
}

export async function runGenerateModel(name: string, cwd: string): Promise<void> {
  const config = await readBotConfig(cwd);
  if (!config.db?.enable) {
    throw new Error('disbord: disbord.config.tsでdb.enableが有効になっていません');
  }

  const targetPath = join(cwd, `src/db/models/${name}.ts`);
  if (existsSync(targetPath)) {
    throw new Error(`disbord: src/db/models/${name}.ts は既に存在します（上書きしません）`);
  }

  mkdirSync(join(cwd, 'src/db/models'), { recursive: true });
  writeFileSync(targetPath, generateModelFileContent(name));

  const module: Record<string, unknown> = await import(pathToFileURL(targetPath).href);
  const modelClass = module[name] as ModelClass;
  const meta = readModelMeta(modelClass);
  const block = renderDataBlock([{ exportName: name, typeLiteral: buildDataTypeLiteral(meta) }]);
  writeFileSync(targetPath, withDataBlock(readFileSync(targetPath, 'utf-8'), block));

  console.log(`disbord: src/db/models/${name}.ts を生成しました`);
}
