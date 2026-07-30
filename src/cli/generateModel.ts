import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toSnakeCase } from '../db/buildSchema';
import { formatGeneratedFile } from './formatGenerated';
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
 * Data型（Model.create()等の入力型）はnamespace/型ブロックとしてファイルへ書き戻す必要はない。
 * `class ${name} extends Model`のアクセサ宣言自体から構造的に導出されるため、
 * 生成後の動的import・追記は不要。
 */
export function generateModelFileContent(name: string): string {
  const tableName = toTableName(name);
  return `import { Column, Model, Table } from 'disbord';

@Table('${tableName}')
export class ${name} extends Model {
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
  await formatGeneratedFile(cwd, targetPath);

  console.log(`disbord: src/db/models/${name}.ts を生成しました`);
}
