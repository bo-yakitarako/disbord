import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import dayjs, { type Dayjs } from 'dayjs';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { buildSchema, buildTable } from '../src/db/buildSchema';
import { createDbClient } from '../src/db/client';
import { Column, Table, type ModelClass } from '../src/db/decorators';
import { Model } from '../src/db/Model';

@Table('jobs')
class Job extends Model<Job.Data> {
  @Column('text')
  accessor sample!: string;

  @Column('integer', { mode: 'timestamp_ms' })
  accessor scheduledAt!: Dayjs;

  /**
   * `Data`をクラス自身の型引数として渡す設計（`this`の多相性に依存しない）が効いているかの
   * 実地検証。`this.update(...)`をモデル自身のメソッド内から`this`経由で呼ぶパターンは、
   * `Partial<Omit<this, keyof Model>>`のような`this`越しのマップ/条件型では解決できない
   * （TypeScriptの既知の制限。実機確認済み）。
   */
  async touch(sample: string) {
    await this.update({ sample });
  }
}
namespace Job {
  export type Data = { sample: string; scheduledAt: Date | Dayjs };
}

@Table('reminders')
class Reminder extends Model<Reminder.Data> {
  @Column('text', { default: 'pending' })
  accessor status!: string;

  @Column('text')
  accessor title!: string;
}
namespace Reminder {
  export type Data = { status?: string; title: string };
}

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-model-'));
  const dbUrl = `file:${join(dir, 'test.db')}`;

  const schema = buildSchema(([Job, Reminder] as unknown as ModelClass[]).map(buildTable));
  const cur = await generateSQLiteDrizzleJson(schema);
  const prev = await generateSQLiteDrizzleJson({});
  const statements = await generateSQLiteMigration(prev, cur);

  const setupClient = createClient({ url: dbUrl });
  await setupClient.executeMultiple(statements.join('\n'));

  createDbClient(schema, { url: dbUrl });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * drizzleのtimestamp_msカラムは書き込み時に`value.getTime()`を直接呼ぶため、Dayjsインスタンスを
 * そのまま渡すと`value.getTime is not a function`で壊れる(実機確認済み)。既存モデルから読み取った
 * Dayjs値(例: `job.scheduledAt`)をそのまま次のcreate()/update()/find()へ渡し回すのは自然な使い方
 * のため、Model側でDayjs→Dateへ正規化してからdrizzleに渡す(Model.ts のnormalizeDayjsValues参照)。
 */
describe('ModelのDayjs正規化', () => {
  test('create()にDayjsインスタンスを渡してもエラーにならず、読み取り時は引き続きDayjsになる', async () => {
    const scheduledAt = dayjs('2026-02-01T00:00:00.000Z');
    const job = await Job.create({ sample: 'x', scheduledAt } as never);

    expect(dayjs.isDayjs(job.scheduledAt)).toBe(true);
    expect(job.scheduledAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  test('create()にDateを渡す従来通りの使い方も引き続き動く', async () => {
    const job = await Job.create({ sample: 'x', scheduledAt: new Date('2026-02-01T00:00:00.000Z') } as never);
    expect(job.scheduledAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  test('find()の検索条件にDayjsインスタンスを渡しても正しく一致する', async () => {
    const scheduledAt = dayjs('2026-02-01T00:00:00.000Z');
    const job = await Job.create({ sample: 'x', scheduledAt } as never);

    const found = await Job.find({ scheduledAt } as never);
    expect(found?.id).toBe(job.id);
  });

  test('update()にDayjsインスタンスを渡しても正しく更新される', async () => {
    const job = await Job.create({ sample: 'x', scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never);

    await job.update({ scheduledAt: dayjs('2026-03-01T00:00:00.000Z') } as never);

    const refetched = await Job.find({ id: job.id });
    expect(refetched?.scheduledAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  test('updateAll()の条件・更新データにDayjsインスタンスを渡しても正しく動く', async () => {
    await Job.create({ sample: 'x', scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never);

    await Job.updateAll(
      { scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never,
      { scheduledAt: dayjs('2026-04-01T00:00:00.000Z') } as never,
    );

    const updated = await Job.find({ sample: 'x' });
    expect(updated?.scheduledAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('モデル自身のメソッド内からのthis.update()呼び出し', () => {
  test('this.update(...)をキャスト無しで呼び出せ、実際に更新される', async () => {
    const job = await Job.create({ sample: 'x', scheduledAt: dayjs() });
    await job.touch('y');
    expect(job.sample).toBe('y');

    const refetched = await Job.find({ id: job.id });
    expect(refetched?.sample).toBe('y');
  });
});

describe('Model.exists()', () => {
  test('条件に一致するレコードが存在すればtrueを返す', async () => {
    const job = await Job.create({ sample: 'x', scheduledAt: dayjs('2026-02-01T00:00:00.000Z') } as never);

    expect(await Job.exists({ id: job.id })).toBe(true);
    expect(await Job.exists({ sample: 'x' })).toBe(true);
  });

  test('条件に一致するレコードが存在しなければfalseを返す', async () => {
    await Job.create({ sample: 'x', scheduledAt: dayjs('2026-02-01T00:00:00.000Z') } as never);

    expect(await Job.exists({ sample: 'unknown' })).toBe(false);
  });

  test('条件を指定しなければテーブルに1件でもレコードがあればtrueを返す', async () => {
    expect(await Reminder.exists()).toBe(false);

    await Reminder.create({ title: 'foo' });
    expect(await Reminder.exists()).toBe(true);
  });
});

describe('Model.findDistinct()', () => {
  test('指定したカラムの重複を排除したプレーンなオブジェクト配列を返す', async () => {
    await Reminder.create({ status: 'pending', title: 'foo' });
    await Reminder.create({ status: 'pending', title: 'bar' });
    await Reminder.create({ status: 'done', title: 'baz' });

    const statuses = await Reminder.findDistinct(['status']);

    expect(statuses).toHaveLength(2);
    expect(new Set(statuses.map((row) => row.status))).toEqual(new Set(['pending', 'done']));
  });

  test('query条件で絞り込める', async () => {
    await Reminder.create({ status: 'pending', title: 'foo' });
    await Reminder.create({ status: 'pending', title: 'bar' });
    await Reminder.create({ status: 'done', title: 'baz' });

    const statuses = await Reminder.findDistinct(['status'], { status: 'pending' });

    expect(statuses).toEqual([{ status: 'pending' }]);
  });

  test('複数カラムを指定すると、その組み合わせで重複を排除する', async () => {
    await Job.create({ sample: 'x', scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never);
    await Job.create({ sample: 'x', scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never);
    await Job.create({ sample: 'y', scheduledAt: dayjs('2026-01-01T00:00:00.000Z') } as never);

    const rows = await Job.findDistinct(['sample']);

    expect(new Set(rows.map((row) => row.sample))).toEqual(new Set(['x', 'y']));
    expect(rows).toHaveLength(2);
  });
});

describe('@Columnにdefaultが指定されたカラムの省略', () => {
  test('create()呼び出し時にキャスト無しで省略でき、DB側のdefault値が入る', async () => {
    const reminder = await Reminder.create({ title: 'foo' });
    expect(reminder.status).toBe('pending');
    expect(reminder.title).toBe('foo');
  });
});
