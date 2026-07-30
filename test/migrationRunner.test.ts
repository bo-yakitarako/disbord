import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { applyPendingMigrations, STATEMENT_BREAKPOINT } from '../src/db/migrationRunner';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-migrations-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('applyPendingMigrations', () => {
  test('migrationsディレクトリ内の.sqlをファイル名昇順に適用する', async () => {
    writeFileSync(join(dir, '20260101000000.sql'), 'CREATE TABLE users (id text PRIMARY KEY);');
    writeFileSync(join(dir, '20260102000000.sql'), 'CREATE TABLE jobs (id text PRIMARY KEY);');

    const client = createClient({ url: ':memory:' });
    const applied = await applyPendingMigrations(client, dir);

    expect(applied).toEqual(['20260101000000.sql', '20260102000000.sql']);
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    expect(tables.rows.map((r) => r.name)).toEqual(['__disbord_migrations', 'jobs', 'users']);
  });

  test('2回目の実行では未適用ファイルが無ければ何もしない(冪等)', async () => {
    writeFileSync(join(dir, '20260101000000.sql'), 'CREATE TABLE users (id text PRIMARY KEY);');
    const client = createClient({ url: ':memory:' });

    await applyPendingMigrations(client, dir);
    const second = await applyPendingMigrations(client, dir);

    expect(second).toEqual([]);
  });

  test('後から追加されたmigrationファイルだけが追加適用される', async () => {
    writeFileSync(join(dir, '20260101000000.sql'), 'CREATE TABLE users (id text PRIMARY KEY);');
    const client = createClient({ url: ':memory:' });
    await applyPendingMigrations(client, dir);

    writeFileSync(join(dir, '20260102000000.sql'), 'CREATE TABLE jobs (id text PRIMARY KEY);');
    const applied = await applyPendingMigrations(client, dir);

    expect(applied).toEqual(['20260102000000.sql']);
  });

  test('migrationsディレクトリが存在しない場合は空配列を返す', async () => {
    const client = createClient({ url: ':memory:' });
    const applied = await applyPendingMigrations(client, join(dir, 'not-exists'));
    expect(applied).toEqual([]);
  });

  test('nullable→NOT NULLのようなテーブル作り直しmigrationが既存NULL行で失敗しても、__new_ prefixのテーブルが残らずロールバックされる(実際に踏んだ不具合の再現)', async () => {
    const client = createClient({ url: ':memory:' });
    await client.executeMultiple('CREATE TABLE jobs (id text PRIMARY KEY, sample text);');
    await client.execute("INSERT INTO jobs (id, sample) VALUES ('1', NULL);");

    const recreateStatements = [
      'PRAGMA foreign_keys=OFF;',
      'CREATE TABLE `__new_jobs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`sample` text NOT NULL\n);',
      'INSERT INTO `__new_jobs`("id", "sample") SELECT "id", "sample" FROM `jobs`;',
      'DROP TABLE `jobs`;',
      'ALTER TABLE `__new_jobs` RENAME TO `jobs`;',
      'PRAGMA foreign_keys=ON;',
    ];
    writeFileSync(join(dir, '20260101000000.sql'), recreateStatements.join(`\n${STATEMENT_BREAKPOINT}\n`));

    await expect(applyPendingMigrations(client, dir)).rejects.toThrow(/NOT NULL constraint failed/);

    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    expect(tables.rows.map((r) => r.name)).not.toContain('__new_jobs');
    expect(tables.rows.map((r) => r.name)).toContain('jobs');

    const rows = await client.execute('SELECT * FROM jobs');
    expect(rows.rows.map((r) => ({ id: r.id, sample: r.sample }))).toEqual([{ id: '1', sample: null }]);

    // 失敗したmigrationファイルは適用済み扱いにならず、次回も同じファイルを再試行できる
    const trackingRows = await client.execute('SELECT filename FROM __disbord_migrations');
    expect(trackingRows.rows).toEqual([]);
  });
});
