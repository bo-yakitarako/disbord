import { describe, expect, test } from 'bun:test';
import dayjs, { type Dayjs } from 'dayjs';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { createTableRelationsHelpers, Many, One } from 'drizzle-orm';
import { buildSchema } from '../src/db/buildSchema';
import { Column, CompoundIndex, Index, Relate, Table, Unique, type ModelClass } from '../src/db/decorators';
import { Model } from '../src/db/Model';

@Table('users')
class User extends Model {
  @Unique()
  @Column('text')
  accessor email!: string;

  @Column('text')
  accessor name!: string;
}

@Table('jobs')
class Job extends Model {
  @Relate(() => User as unknown as ModelClass, { onDelete: 'cascade' })
  accessor userId!: string;

  @Column('text')
  accessor name!: string;
}

@Table('workTimes')
@CompoundIndex(['userId', 'jobId'])
class WorkTime extends Model {
  @Relate(() => User as unknown as ModelClass, { onDelete: 'cascade' })
  accessor userId!: string;

  @Relate(() => Job as unknown as ModelClass, { onDelete: 'set null', nullable: true })
  accessor jobId!: string;

  @Index()
  @Column('integer', { mode: 'timestamp_ms' })
  accessor actedAt!: Dayjs;

  @Column('text', { enum: ['working', 'resting', 'workOff'] })
  accessor status!: string;
}

const models = [User, Job, WorkTime] as unknown as ModelClass[];

async function migrationSqlFor(schema: Record<string, unknown>): Promise<string> {
  const prev = await generateSQLiteDrizzleJson({});
  const cur = await generateSQLiteDrizzleJson(schema);
  return (await generateSQLiteMigration(prev, cur)).join('\n');
}

describe('buildSchema', () => {
  test('各モデルごとにテーブルとrelationsを1つずつ生成する', () => {
    const schema = buildSchema(models);
    expect(Object.keys(schema).sort()).toEqual(
      ['jobs', 'jobsRelations', 'users', 'usersRelations', 'workTimes', 'workTimesRelations'].sort(),
    );
  });

  test('全モデル共通でid/createdAt/updatedAtが自動付与される', async () => {
    const sql = await migrationSqlFor(buildSchema([User] as unknown as ModelClass[]));
    expect(sql).toContain('`id` text PRIMARY KEY NOT NULL');
    expect(sql).toContain('`created_at` integer NOT NULL');
    expect(sql).toContain('`updated_at` integer NOT NULL');
  });

  test('カラム順はid→モデル自身が宣言したカラム(宣言順)→created_at→updated_atになる', async () => {
    const sql = await migrationSqlFor(buildSchema([User] as unknown as ModelClass[]));
    const idIdx = sql.indexOf('`id`');
    const emailIdx = sql.indexOf('`email`');
    const nameIdx = sql.indexOf('`name`');
    const createdAtIdx = sql.indexOf('`created_at`');
    const updatedAtIdx = sql.indexOf('`updated_at`');

    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeLessThan(emailIdx);
    expect(emailIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(createdAtIdx);
    expect(createdAtIdx).toBeLessThan(updatedAtIdx);
  });

  test('@Relateは.references()によるFOREIGN KEYを生成する', async () => {
    const sql = await migrationSqlFor(buildSchema(models));
    expect(sql).toContain('FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade');
    expect(sql).toContain('FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null');
  });

  test('@Uniqueは単一カラムのUNIQUE制約を生成する', async () => {
    const sql = await migrationSqlFor(buildSchema(models));
    expect(sql).toContain('CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`)');
  });

  test('@Indexは単一カラムのindexを、@CompoundIndexは複数カラムのindexを生成する(index名もカラム名同様snake_case)', async () => {
    const sql = await migrationSqlFor(buildSchema(models));
    expect(sql).toContain('CREATE INDEX `workTimes_acted_at_idx` ON `workTimes` (`acted_at`)');
    expect(sql).toContain('CREATE INDEX `workTimes_user_id_job_id_idx` ON `workTimes` (`user_id`,`job_id`)');
  });

  test('@Relateは参照先(belongs-to)と逆側(has-many)の双方向relations()を生成する', () => {
    const schema = buildSchema(models);
    const usersRelations = schema.usersRelations as { table: unknown; config: (h: unknown) => Record<string, unknown> };
    const jobsRelations = schema.jobsRelations as { table: unknown; config: (h: unknown) => Record<string, unknown> };

    const usersConfig = usersRelations.config(createTableRelationsHelpers(usersRelations.table as never));
    expect(Object.keys(usersConfig).sort()).toEqual(['jobs', 'workTimes']);
    expect(usersConfig.jobs).toBeInstanceOf(Many);
    expect(usersConfig.workTimes).toBeInstanceOf(Many);

    const jobsConfig = jobsRelations.config(createTableRelationsHelpers(jobsRelations.table as never));
    expect(Object.keys(jobsConfig).sort()).toEqual(['user', 'workTimes']);
    expect(jobsConfig.user).toBeInstanceOf(One);
    expect(jobsConfig.workTimes).toBeInstanceOf(Many);
  });

  test('モデルが1つもない場合は空スキーマを返す', () => {
    expect(buildSchema([])).toEqual({});
  });

  test('差分がない2回目のbuildSchemaはmigration文を生成しない', async () => {
    const schema = buildSchema(models);
    const prev = await generateSQLiteDrizzleJson(schema);
    const cur = await generateSQLiteDrizzleJson(buildSchema(models));
    const statements = await generateSQLiteMigration(prev, cur);
    expect(statements).toEqual([]);
  });
});

describe("mode: 'timestamp_ms'でdefault: 'now'を指定した場合", () => {
  @Table('reminders')
  class Reminder extends Model {
    @Column('integer', { mode: 'timestamp_ms', default: 'now' })
    accessor firedAt!: Dayjs;
  }

  test("DB側のDEFAULT (unixepoch('subsec') * 1000)（挿入時刻・ミリ秒精度）になる", async () => {
    const sql = await migrationSqlFor(buildSchema([Reminder] as unknown as ModelClass[]));
    expect(sql).toContain(`\`fired_at\` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL`);
  });

  @Table('notes')
  class Note extends Model {
    @Column('text', { default: 'now' })
    accessor label!: string;
  }

  test("mode: 'timestamp_ms'以外では'now'は単なる文字列リテラルのdefaultとして扱われる(特別扱いしない)", async () => {
    const sql = await migrationSqlFor(buildSchema([Note] as unknown as ModelClass[]));
    expect(sql).toContain("`label` text DEFAULT 'now' NOT NULL");
    expect(sql).not.toContain('unixepoch');
  });

  @Table('alarms')
  class Alarm extends Model {
    @Column('integer', { mode: 'timestamp_ms', default: dayjs('2026-01-01T00:00:00.000Z') })
    accessor firedAt!: Dayjs;
  }

  test('固定値のDayjsを指定した場合、ミリ秒unix時間の整数リテラルがDEFAULTになる(生のDateを渡すとJSON文字列化されて壊れるため変換する)', async () => {
    const sql = await migrationSqlFor(buildSchema([Alarm] as unknown as ModelClass[]));
    expect(sql).toContain('`fired_at` integer DEFAULT 1767225600000 NOT NULL');
  });
});
