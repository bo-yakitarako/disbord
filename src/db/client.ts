import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { setDbState } from './state';

const LOCAL_DB_PATH = 'file:.disbord/db/dev.db';

export function createDbClient<S extends Record<string, unknown>>(
  schema: S,
  options?: { url?: string; authToken?: string; localDbPath?: string },
): LibSQLDatabase<S> {
  const url = options?.url ?? process.env.TURSO_DATABASE_URL;
  const localDbPath = options?.localDbPath ?? LOCAL_DB_PATH;
  // @libsql/clientはfile: URLの親ディレクトリを自動生成しない(実機確認済み: `ConnectionFailed`で落ちる)ため、
  // ローカルsqlite利用時は解決後のパスの親ディレクトリの存在をここで保証する。
  if (!url) mkdirSync(dirname(localDbPath.replace(/^file:/, '')), { recursive: true });
  const client = url
    ? createClient({ url, authToken: options?.authToken ?? process.env.TURSO_AUTH_TOKEN })
    : createClient({ url: localDbPath.startsWith('file:') ? localDbPath : pathToFileURL(localDbPath).href });
  const db = drizzle(client, { schema });
  setDbState({ db: db as unknown as LibSQLDatabase<Record<string, unknown>>, schema });
  return db;
}
