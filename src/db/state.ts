import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type DbState = { db: LibSQLDatabase<Record<string, unknown>>; schema: Record<string, unknown> };

let state: DbState | undefined;

export function setDbState(next: DbState) {
  state = next;
}

/**
 * schemaの実体注入(createDbClient呼び出し)はcreate-disbord-app/CLIが生成するbootstrapの役目。
 * それより前にdb/Modelが使われた場合はここで気づけるように例外を投げる。
 */
export function getDbState(): DbState {
  if (!state) {
    throw new Error('disbord: db is not initialized yet. createDbClient(schema) をbot起動時に呼び出してください。');
  }
  return state;
}
