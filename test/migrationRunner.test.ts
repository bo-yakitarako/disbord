import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPendingMigrations } from '../src/db/migrationRunner';

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
    writeFileSync(
      join(dir, '20260102000000.sql'),
      'CREATE TABLE jobs (id text PRIMARY KEY);',
    );

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
});
