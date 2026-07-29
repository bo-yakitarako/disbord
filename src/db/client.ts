import { mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { setDbState } from './state';

const LOCAL_DB_PATH = 'file:.disbord/db/dev.db';

export function createDbClient<S extends Record<string, unknown>>(
  schema: S,
  options?: { url?: string; authToken?: string },
): LibSQLDatabase<S> {
  const url = options?.url ?? process.env.TURSO_DATABASE_URL;
  // @libsql/clientはfile: URLの親ディレクトリを自動生成しない(実機確認済み: `ConnectionFailed`で落ちる)ため、
  // ローカルsqlite利用時は`.disbord/db/`の存在をここで保証する。
  if (!url) mkdirSync('.disbord/db', { recursive: true });
  const client = url
    ? createClient({ url, authToken: options?.authToken ?? process.env.TURSO_AUTH_TOKEN })
    : createClient({ url: LOCAL_DB_PATH });
  const db = drizzle(client, { schema });
  setDbState({ db: db as unknown as LibSQLDatabase<Record<string, unknown>>, schema });
  return db;
}
