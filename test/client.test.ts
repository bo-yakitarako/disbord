import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDbClient } from '../src/db/client';
import { getDbState } from '../src/db/state';

const originalUrl = process.env.TURSO_DATABASE_URL;
const originalToken = process.env.TURSO_AUTH_TOKEN;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.TURSO_DATABASE_URL;
  else process.env.TURSO_DATABASE_URL = originalUrl;
  if (originalToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
  else process.env.TURSO_AUTH_TOKEN = originalToken;
});

describe('createDbClient', () => {
  test('options.urlが指定されている場合はprocess.env.TURSO_DATABASE_URLより優先される(disbord.config.tsのdb.tursoDatabaseUrl経由の値を想定)', () => {
    process.env.TURSO_DATABASE_URL = 'file:should-not-be-used.db';

    createDbClient({}, { url: ':memory:' });

    expect(getDbState().db).toBeDefined();
  });

  test('url未指定(ローカルsqlite)の場合、.disbord/db/が無くても自動生成してdev.dbを作成する(@libsql/clientは親ディレクトリを自動生成しないため。実機確認済み)', () => {
    delete process.env.TURSO_DATABASE_URL;
    const dir = mkdtempSync(join(tmpdir(), 'disbord-client-'));
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      createDbClient({});
      expect(existsSync(join(dir, '.disbord/db/dev.db'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
