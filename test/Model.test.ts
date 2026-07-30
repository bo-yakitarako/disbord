import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import dayjs, { type Dayjs } from 'dayjs';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { buildSchema } from '../src/db/buildSchema';
import { createDbClient } from '../src/db/client';
import { Column, Table, type ModelClass } from '../src/db/decorators';
import { Model } from '../src/db/Model';

@Table('jobs')
class Job extends Model {
  @Column('text')
  accessor sample!: string;

  @Column('integer', { mode: 'timestamp_ms' })
  accessor scheduledAt!: Dayjs;
}

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-model-'));
  const dbUrl = `file:${join(dir, 'test.db')}`;

  const schema = buildSchema([Job as unknown as ModelClass]);
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
