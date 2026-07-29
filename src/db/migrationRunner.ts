import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from '@libsql/client';

const TRACKING_TABLE = '__disbord_migrations';

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
    await client.executeMultiple(sql);
    await client.execute({
      sql: `INSERT INTO ${TRACKING_TABLE} (filename, applied_at) VALUES (?, ?)`,
      args: [file, Date.now()],
    });
    appliedNow.push(file);
  }
  return appliedNow;
}
