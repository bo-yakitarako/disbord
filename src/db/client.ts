import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { setDbState } from './state';

const LOCAL_DB_PATH = 'file:.disbord/dev.db';

export function createDbClient<S extends Record<string, unknown>>(
  schema: S,
  options?: { url?: string; authToken?: string },
): LibSQLDatabase<S> {
  const url = options?.url ?? process.env.TURSO_DATABASE_URL;
  const client = url
    ? createClient({ url, authToken: options?.authToken ?? process.env.TURSO_AUTH_TOKEN })
    : createClient({ url: LOCAL_DB_PATH });
  const db = drizzle(client, { schema });
  setDbState({ db: db as unknown as LibSQLDatabase<Record<string, unknown>>, schema });
  return db;
}
