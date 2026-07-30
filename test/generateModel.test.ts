import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateModelFileContent, runGenerateModel } from '../src/cli/generateModel';

const DB_ENABLED_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  db: { enable: true },
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

const DB_DISABLED_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

function tableNameOf(className: string): string {
  const content = generateModelFileContent(className);
  const match = /@Table\('([^']+)'\)/.exec(content);
  return match![1]!;
}

describe('generateModelFileContent', () => {
  test('Modelを継承し@Tableでクラス名を小文字始まりにした複数形のテーブル名を指定する', () => {
    const content = generateModelFileContent('Job');
    expect(content).toContain(`import { Column, Model, Table } from 'disbord';`);
    expect(content).toContain(`@Table('jobs')`);
    expect(content).toContain('export class Job extends Model {');
  });

  test('通常は末尾にsを付ける', () => {
    expect(tableNameOf('User')).toBe('users');
  });

  test('複数の単語からなる名前はsnake_caseにしてから複数形にする', () => {
    expect(tableNameOf('WorkTime')).toBe('work_times');
    expect(tableNameOf('OrderItem')).toBe('order_items');
    expect(tableNameOf('UserCategory')).toBe('user_categories');
  });

  test('s/x/z/ch/shで終わる名前はesを付ける', () => {
    expect(tableNameOf('Class')).toBe('classes');
    expect(tableNameOf('Status')).toBe('statuses');
    expect(tableNameOf('Box')).toBe('boxes');
    expect(tableNameOf('Quiz')).toBe('quizes');
    expect(tableNameOf('Church')).toBe('churches');
    expect(tableNameOf('Wish')).toBe('wishes');
  });

  test('子音+yで終わる名前はyをiesに変える', () => {
    expect(tableNameOf('Category')).toBe('categories');
    expect(tableNameOf('Company')).toBe('companies');
  });

  test('母音+yで終わる名前はそのままsを付ける', () => {
    expect(tableNameOf('Toy')).toBe('toys');
  });

  test('f/feで終わる名前はvesに変える', () => {
    expect(tableNameOf('Leaf')).toBe('leaves');
    expect(tableNameOf('Life')).toBe('lives');
  });

  test('子音+oで終わる名前はesを付ける', () => {
    expect(tableNameOf('Hero')).toBe('heroes');
  });

  test('サンプルのcolumnを含む(staticではなくinstanceのaccessor)。Data型はModel側がクラス定義から直接推定するためnamespaceブロックは一切含まない', () => {
    const content = generateModelFileContent('Job');
    expect(content).toContain(`@Column('text')`);
    expect(content).toContain('accessor sample!: string;');
    expect(content).not.toContain('static accessor');
    expect(content).not.toContain('public get sample()');
    expect(content).not.toContain('namespace Job');
  });
});

describe('runGenerateModel', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'disbord-generate-model-'));
    writeFileSync(join(dir, 'disbord.config.ts'), DB_ENABLED_CONFIG);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('generateModelFileContentの内容をそのままsrc/db/models/<Name>.tsへ書き出す(動的import・追記は不要)', async () => {
    await runGenerateModel('Job', dir);

    const content = readFileSync(join(dir, 'src/db/models/Job.ts'), 'utf-8');
    expect(content).toBe(generateModelFileContent('Job'));
    expect(content).not.toContain('namespace Job');
  });

  test('既に存在する場合は上書きせずthrow', async () => {
    await runGenerateModel('Job', dir);
    await expect(runGenerateModel('Job', dir)).rejects.toThrow();
  });

  test('disbord.config.tsでdb.enableが有効になっていない場合はthrow(ファイルも生成しない)', async () => {
    writeFileSync(join(dir, 'disbord.config.ts'), DB_DISABLED_CONFIG);

    await expect(runGenerateModel('Job', dir)).rejects.toThrow();
    expect(() => readFileSync(join(dir, 'src/db/models/Job.ts'), 'utf-8')).toThrow();
  });
});
