import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import type { Config } from '../config';

const TRACKING_TABLE = '__disbord_migrations';

/**
 * デプロイ先ホスト上でTursoが未設定の場合に本番DBとして使うローカルsqliteファイル。
 * `disbord build`が生成する`dist/migrate.js`（SSH経由でデプロイ先ホスト上で実行される）
 * 専用のフォールバック先で、CLIの`disbord migrate --production`（Turso必須のまま）とは別物。
 */
export const PRODUCTION_LOCAL_DB_PATH = 'file:prd.db';

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

/**
 * `dist/migrate.js`（`disbord build`が生成し、SSH経由でデプロイ先ホスト上で実行される想定）専用の
 * migration実行ロジック。`config.db.tursoDatabaseUrl`/`TURSO_DATABASE_URL`が無い場合、CLIの
 * `disbord migrate --production`と違いthrowせず、デプロイ先ホスト上のローカルsqlite
 * (`PRODUCTION_LOCAL_DB_PATH`)へフォールバックする（既にファイルがあれば差分migrationの適用のみ）。
 */
export async function runProductionMigration(config: Config, migrationsDir: string): Promise<string[]> {
  const url = config.db?.tursoDatabaseUrl ?? process.env.TURSO_DATABASE_URL ?? PRODUCTION_LOCAL_DB_PATH;
  const authToken =
    url === PRODUCTION_LOCAL_DB_PATH ? undefined : (config.db?.tursoAuthToken ?? process.env.TURSO_AUTH_TOKEN);
  const client = createClient({ url, authToken });
  return applyPendingMigrations(client, migrationsDir);
}
