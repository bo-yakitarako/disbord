import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from '@libsql/client';

const TRACKING_TABLE = '__disbord_migrations';

/**
 * migrationファイルは複数のstatementをこの区切り文字列で結合して書き出される。
 * ここで同じ定数を使ってsplitし戻し、1ファイル1トランザクションで`client.migrate()`に
 * 個別のstatementの配列として渡す。
 */
export const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

/**
 * SQLiteは列の型・制約変更に`__new_xxx`テーブルを作ってdata移行→DROP→RENAMEする
 * (drizzle-kitが生成する、SQLite公式ドキュメント推奨の12-step recreate)。`executeMultiple`は
 * 明示的にトランザクションでラップしない(既存行がNOT NULL制約に違反する等で)ため、
 * 例えば移行元のINSERT...SELECTが失敗すると`__new_xxx`テーブルと元テーブルの両方が
 * 残ったまま止まってしまう不具合が実際に起きた。`client.migrate()`はbatch全体を1トランザクションで
 * 実行し失敗時に丸ごとロールバックするため、1ファイル分のstatementをまとめてこちらに渡す。
 */
export async function applyPendingMigrations(client: Client, migrationsDir: string): Promise<string[]> {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (filename TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`,
  );

  const appliedResult = await client.execute(`SELECT filename FROM ${TRACKING_TABLE}`);
  const applied = new Set(appliedResult.rows.map((row) => row.filename as string));

  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const statements = sql
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    await client.migrate(statements);
    await client.execute({
      sql: `INSERT INTO ${TRACKING_TABLE} (filename, applied_at) VALUES (?, ?)`,
      args: [file, Date.now()],
    });
    appliedNow.push(file);
  }
  return appliedNow;
}
