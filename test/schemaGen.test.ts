import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regenerateSchemaFile } from '../src/cli/schemaGen';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-schemagen-'));
  mkdirSync(join(dir, 'src/db/models'), { recursive: true });
  writeFileSync(
    join(dir, 'src/db/models/User.ts'),
    `import { Table, Column } from '${join(import.meta.dir, '..', 'src/index.ts')}';\n\n` +
      `@Table('users')\nexport class User {\n  @Column('text')\n  accessor displayName!: string;\n}\n`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('regenerateSchemaFile', () => {
  test('src/db/schema.tsを生成する(.disbord配下ではなくgit管理対象のsrc/db直下に置く)', async () => {
    await regenerateSchemaFile(dir);

    expect(existsSync(join(dir, 'src/db/schema.ts'))).toBe(true);
    expect(existsSync(join(dir, '.disbord/db/schema.ts'))).toBe(false);
  });

  test('モデルのimportパスは@/db/models/*のエイリアスになり、buildTable/buildSchemaの2段構成になる', async () => {
    await regenerateSchemaFile(dir);

    const content = readFileSync(join(dir, 'src/db/schema.ts'), 'utf-8');
    expect(content).toContain(`import { buildSchema, buildTable } from 'disbord';`);
    expect(content).toContain(`import { User } from '@/db/models/User';`);
    expect(content).toContain('export const user = buildTable(User);');
    expect(content).toContain('export const schema = buildSchema([user]);');
  });

  test('src/db/models/のモデルファイルは書き換えない(namespaceブロックの再生成はmigrateの責務)', async () => {
    const before = readFileSync(join(dir, 'src/db/models/User.ts'), 'utf-8');
    await regenerateSchemaFile(dir);
    expect(readFileSync(join(dir, 'src/db/models/User.ts'), 'utf-8')).toBe(before);
  });
});
