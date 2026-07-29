import { describe, expect, test } from 'bun:test';
import type { Dayjs } from 'dayjs';
import { buildDataTypeLiteral, DATA_BLOCK_MARKER, renderDataBlock, withDataBlock } from '../src/cli/modelDataBlock';
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

describe('buildDataTypeLiteral', () => {
  test('columns/relatesが空なら空オブジェクト型', () => {
    expect(buildDataTypeLiteral({ columns: [], relates: [] })).toBe('{  }');
  });

  test('text→string, @Relate→stringにマッピングする', () => {
    const meta = readModelMeta(User as unknown as ModelClass);
    expect(buildDataTypeLiteral(meta)).toBe('{ email: string }');
  });

  test('integer(mode無し)/real→number, mode:boolean→boolean, mode:timestamp_ms→Dateにマッピングし、宣言順に並べる(@Relateは末尾)', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(buildDataTypeLiteral(meta)).toBe(
      '{ status: string; archived: boolean; actedAt: Date; priority: number; score: number; userId: string }',
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
