import { afterEach, describe, expect, test } from 'bun:test';
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
});
