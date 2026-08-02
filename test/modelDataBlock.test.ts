import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dayjs } from 'dayjs';
import {
  buildDataTypeLiteral,
  DATA_BLOCK_MARKER,
  regenerateModelDataBlocks,
  renderDataBlock,
  rewriteModelDataBlocks,
  withDataBlock,
} from '../src/cli/modelDataBlock';
import { scanModelFiles } from '../src/cli/scanModelFiles';
import { Column, readModelMeta, Relate, Table, type ModelClass } from '../src/db/decorators';
import { Model } from '../src/db/Model';

@Table('users')
class User extends Model<User.Data> {
  @Column('text')
  accessor email!: string;
}
namespace User {
  export type Data = { email: string };
}

@Table('jobs')
class Job extends Model<Job.Data> {
  @Relate(() => User as unknown as ModelClass, { onDelete: 'cascade' })
  accessor userId!: string;

  @Column('text', { enum: ['working', 'resting'] })
  accessor status!: string;

  @Column('integer', { mode: 'boolean' })
  accessor archived!: boolean;

  @Column('integer', { mode: 'timestamp_ms' })
  accessor actedAt!: Dayjs;

  @Column('integer')
  accessor priority!: number;

  @Column('real')
  accessor score!: number;
}
namespace Job {
  export type Data = {
    userId: string;
    status: string;
    archived: boolean;
    actedAt: Date;
    priority: number;
    score: number;
  };
}

@Table('reminders')
class Reminder extends Model<Reminder.Data> {
  @Column('text', { default: 'pending' })
  accessor status!: string;

  @Column('text')
  accessor title!: string;

  @Column('integer', { mode: 'boolean', default: true })
  accessor archived!: boolean;

  @Column('integer', { mode: 'timestamp_ms', default: 'now' })
  accessor firedAt!: Dayjs;
}
namespace Reminder {
  export type Data = { status?: string; title: string; archived?: boolean; firedAt?: Date | Dayjs };
}

describe('buildDataTypeLiteral', () => {
  test('columns/relatesが空なら空オブジェクト型', () => {
    expect(buildDataTypeLiteral({ columns: [], relates: [] })).toBe('{  }');
  });

  test('text→string, @Relate→stringにマッピングする', () => {
    const meta = readModelMeta(User as unknown as ModelClass);
    expect(buildDataTypeLiteral(meta)).toBe('{ email: string }');
  });

  test('integer(mode無し)/real→number, mode:boolean→boolean, mode:timestamp_ms→Date | Dayjsにマッピングし、宣言順に並べる(@Relateは末尾)', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(buildDataTypeLiteral(meta)).toBe(
      '{ status: string; archived: boolean; actedAt: Date | Dayjs; priority: number; score: number; userId: string }',
    );
  });

  test('@Columnにdefaultが指定されているカラムは?付きのoptionalにする(create()呼び出し時に省略できるようにするため)', () => {
    const meta = readModelMeta(Reminder as unknown as ModelClass);
    expect(buildDataTypeLiteral(meta)).toBe(
      '{ status?: string; title: string; archived?: boolean; firedAt?: Date | Dayjs }',
    );
  });
});

describe('renderDataBlock', () => {
  test('マーカーに続けてnamespaceブロックを1つ生成する', () => {
    const block = renderDataBlock([{ exportName: 'User', typeLiteral: '{ email: string }' }]);
    expect(block).toBe(`${DATA_BLOCK_MARKER}\nexport namespace User {\n  export type Data = { email: string };\n}\n`);
  });

  test('複数モデルは空行区切りで並べる', () => {
    const block = renderDataBlock([
      { exportName: 'User', typeLiteral: '{ email: string }' },
      { exportName: 'Job', typeLiteral: '{ userId: string }' },
    ]);
    expect(block).toContain(
      'export namespace User {\n  export type Data = { email: string };\n}\n\nexport namespace Job {',
    );
  });
});

describe('withDataBlock', () => {
  test('マーカーが無ければ末尾にそのまま追記する', () => {
    const source = `import { Column, Model, Table } from 'disbord';\n\n@Table('users')\nexport class User extends Model<User.Data> {}\n`;
    const block = `${DATA_BLOCK_MARKER}\nexport namespace User {\n  export type Data = { email: string };\n}\n`;

    const result = withDataBlock(source, block);

    expect(result).toBe(`${source.trimEnd()}\n\n${block}`);
  });

  test('既存のマーカー以降(前回生成分)を取り除いてから付け直す(再生成のたびに増殖しない)', () => {
    const head = `import { Column, Model, Table } from 'disbord';\n\n@Table('users')\nexport class User extends Model<User.Data> {}`;
    const oldBlock = `${DATA_BLOCK_MARKER}\nexport namespace User {\n  export type Data = { email: string };\n}\n`;
    const source = `${head}\n\n${oldBlock}`;
    const newBlock = `${DATA_BLOCK_MARKER}\nexport namespace User {\n  export type Data = { email: string; name: string };\n}\n`;

    const result = withDataBlock(source, newBlock);

    expect(result).toBe(`${head}\n\n${newBlock}`);
    expect(result.match(new RegExp('namespace User', 'g'))).toHaveLength(1);
  });
});

describe('rewriteModelDataBlocks / regenerateModelDataBlocks', () => {
  let dir: string;

  beforeEach(() => {
    // 生成物は`import ... from 'disbord'`という裸のspecifierを含むため、動的importでの
    // node_modules解決が本物のworkspace root(このリポジトリ直下のnode_modules/disbord)まで
    // 辿り着けるよう、OS標準のtmpdirではなくリポジトリ配下にtmp dirを作る。
    dir = mkdtempSync(join(import.meta.dir, '.tmp-model-data-block-'));
    mkdirSync(join(dir, 'src/db/models'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('1ファイルに複数モデルクラスがあってもファイル単位で1ブロックにまとめる', async () => {
    const modelsDir = join(dir, 'src/db/models');
    writeFileSync(
      join(modelsDir, 'Both.ts'),
      `import { Column, Model, Table } from 'disbord';\n\n` +
        `@Table('as')\nexport class A extends Model<A.Data> {\n  @Column('text')\n  accessor name!: string;\n}\n\n` +
        `@Table('bs')\nexport class B extends Model<B.Data> {\n  @Column('text')\n  accessor title!: string;\n}\n`,
    );

    const models = await scanModelFiles(modelsDir);
    await rewriteModelDataBlocks(dir, modelsDir, models);

    const content = readFileSync(join(modelsDir, 'Both.ts'), 'utf-8');
    expect(content).toContain('export namespace A {\n  export type Data = { name: string };\n}');
    expect(content).toContain('export namespace B {\n  export type Data = { title: string };\n}');
    expect(content.match(new RegExp(DATA_BLOCK_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });

  test('内容に変化が無ければファイルを書き換えない(mtimeが変わらない)', async () => {
    const modelsDir = join(dir, 'src/db/models');
    const filePath = join(modelsDir, 'Job.ts');
    writeFileSync(
      filePath,
      `import { Column, Model, Table } from 'disbord';\n\n@Table('jobs')\nexport class Job extends Model<Job.Data> {\n  @Column('text')\n  accessor sample!: string;\n}\n`,
    );

    const models = await scanModelFiles(modelsDir);
    await rewriteModelDataBlocks(dir, modelsDir, models);
    const firstWrite = readFileSync(filePath, 'utf-8');

    await rewriteModelDataBlocks(dir, modelsDir, models);
    const secondWrite = readFileSync(filePath, 'utf-8');

    expect(secondWrite).toBe(firstWrite);
  });

  test('regenerateModelDataBlocksはsrc/db/models/をスキャンして書き戻し、スキャンしたモデル一覧を返す', async () => {
    writeFileSync(
      join(dir, 'src/db/models/Job.ts'),
      `import { Column, Model, Table } from 'disbord';\n\n@Table('jobs')\nexport class Job extends Model<Job.Data> {\n  @Column('text')\n  accessor sample!: string;\n}\n`,
    );

    const models = await regenerateModelDataBlocks(dir);

    expect(models).toHaveLength(1);
    expect(models[0]!.exportName).toBe('Job');
    const content = readFileSync(join(dir, 'src/db/models/Job.ts'), 'utf-8');
    expect(content).toContain('export type Data = { sample: string };');
  });
});
