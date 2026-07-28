import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type DbState = { db: LibSQLDatabase<Record<string, unknown>>; schema: Record<string, unknown> };

let state: DbState | undefined;

export function setDbState(next: DbState) {
  state = next;
}

export function getDbState(): DbState {
  if (!state) {
    throw new Error('disbord: db is not initialized yet. createDbClient(schema) をbot起動時に呼び出してください。');
  }
  return state;
}
