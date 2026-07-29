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
  test('.disbord/db/schema.tsを生成する(src/db/schema.tsではなくgitignore対象の.disbord配下)', async () => {
    await regenerateSchemaFile(dir);

    expect(existsSync(join(dir, '.disbord/db/schema.ts'))).toBe(true);
    expect(existsSync(join(dir, 'src/db/schema.ts'))).toBe(false);
  });

  test('モデルのimportパスは.disbord/db/から見た相対パスになる', async () => {
    await regenerateSchemaFile(dir);

    const content = readFileSync(join(dir, '.disbord/db/schema.ts'), 'utf-8');
    expect(content).toContain(`import { User } from '../../src/db/models/User';`);
    expect(content).toContain('export const schema = buildSchema([User]);');
  });

  test('src/db/models/のモデルファイルは書き換えない(namespaceブロックの再生成はmigrateの責務)', async () => {
    const before = readFileSync(join(dir, 'src/db/models/User.ts'), 'utf-8');
    await regenerateSchemaFile(dir);
    expect(readFileSync(join(dir, 'src/db/models/User.ts'), 'utf-8')).toBe(before);
  });
});
