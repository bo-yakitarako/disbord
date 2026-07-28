import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanModelFiles } from '../src/cli/scanModelFiles';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-models-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scanModelFiles', () => {
  test('src/db/models/が存在しない場合は自動生成し、空配列を返す(.disbord/やmigrations/と同じ流儀)', async () => {
    const modelsDir = join(dir, 'src/db/models');
    expect(existsSync(modelsDir)).toBe(false);

    const models = await scanModelFiles(modelsDir);

    expect(existsSync(modelsDir)).toBe(true);
    expect(models).toEqual([]);
  });

  test('@Tableが付いたexportだけをモデルとして収集する', async () => {
    const modelsDir = join(dir, 'src/db/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(
      join(modelsDir, 'User.ts'),
      `import { Table, Column } from '${join(import.meta.dir, '..', 'src/index.ts')}';\n\n` +
        `export const notAModel = 'plain export';\n\n` +
        `@Table('users')\nexport class User {\n  @Column('text')\n  accessor email!: string;\n}\n`,
    );

    const models = await scanModelFiles(modelsDir);

    expect(models).toHaveLength(1);
    expect(models[0]!.exportName).toBe('User');
    expect(models[0]!.fileName).toBe('User');
    expect((models[0]!.modelClass as unknown as { _tableName: string })._tableName).toBe('users');
  });
});
