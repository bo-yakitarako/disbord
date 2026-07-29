import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import type { Config } from '../config';
import { buildSchema } from '../db/buildSchema';
import { readModelMeta } from '../db/decorators';
import { applyPendingMigrations } from '../db/migrationRunner';
import { buildDataTypeLiteral, renderDataBlock, withDataBlock } from './modelDataBlock';
import { readBotConfig } from './readBotConfig';
import { scanModelFiles, type ScannedModel } from './scanModelFiles';
import { writeSchemaFile } from './schemaGen';

const LOCAL_DB_PATH = 'file:.disbord/db/dev.db';

function timestampId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 各モデルファイル末尾の`namespace Xxx { export type Data = ... }`を、現在の@Column/@Relate
 * メタデータから再生成して書き戻す。TypeScriptのnamespace-classマージが同一ファイル内でしか
 * 成立しないため、disbord.d.ts側ではなくモデルファイル自身をここで書き換える（modelDataBlock.ts参照）。
 */
function rewriteModelDataBlocks(modelsDir: string, models: ScannedModel[]): void {
  const modelsByFile = new Map<string, ScannedModel[]>();
  for (const model of models) {
    const fileModels = modelsByFile.get(model.fileName) ?? [];
    fileModels.push(model);
    modelsByFile.set(model.fileName, fileModels);
  }

  for (const [fileName, fileModels] of modelsByFile) {
    const filePath = join(modelsDir, `${fileName}.ts`);
    const block = renderDataBlock(
      fileModels.map((model) => ({
        exportName: model.exportName,
        typeLiteral: buildDataTypeLiteral(readModelMeta(model.modelClass)),
      })),
    );
    const source = readFileSync(filePath, 'utf-8');
    const next = withDataBlock(source, block);
    if (next !== source) {
      writeFileSync(filePath, next);
    }
  }
}

async function runDevMigrate(cwd: string): Promise<void> {
  const modelsDir = join(cwd, 'src/db/models');
  const migrationsDir = join(cwd, 'migrations');
  const snapshotPath = join(migrationsDir, '_snapshot.json');

  const models = await scanModelFiles(modelsDir);
  rewriteModelDataBlocks(modelsDir, models);
  writeSchemaFile(cwd, models);

  const schema = buildSchema(models.map((m) => m.modelClass));
  const cur = await generateSQLiteDrizzleJson(schema);

  mkdirSync(migrationsDir, { recursive: true });
  const prev = existsSync(snapshotPath)
    ? JSON.parse(readFileSync(snapshotPath, 'utf-8'))
    : await generateSQLiteDrizzleJson({});
  const statements = await generateSQLiteMigration(prev, cur);

  if (statements.length > 0) {
    const fileName = `${timestampId()}.sql`;
    writeFileSync(join(migrationsDir, fileName), statements.join('\n--> statement-breakpoint\n'));
    writeFileSync(snapshotPath, JSON.stringify(cur, null, 2));
    console.log(`disbord: migrations/${fileName} を生成しました`);
  } else {
    console.log('disbord: スキーマに変更はありません');
  }

  mkdirSync(join(cwd, '.disbord/db'), { recursive: true });
  const client = createClient({ url: LOCAL_DB_PATH });
  const applied = await applyPendingMigrations(client, migrationsDir);
  console.log(
    applied.length > 0
      ? `disbord: ローカルDBに${applied.length}件のmigrationを適用しました（${applied.join(', ')}）`
      : 'disbord: 未適用のmigrationはありませんでした',
  );
}

async function runProductionMigrate(cwd: string, config: Config): Promise<void> {
  const migrationsDir = join(cwd, 'migrations');
  const url = config.db?.tursoDatabaseUrl ?? process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error('disbord: TURSO_DATABASE_URLが設定されていません（env/.env.productionを確認してください）');
  }
  const authToken = config.db?.tursoAuthToken ?? process.env.TURSO_AUTH_TOKEN;
  const client = createClient({ url, authToken });
  const applied = await applyPendingMigrations(client, migrationsDir);
  console.log(
    applied.length > 0
      ? `disbord: 本番DBに${applied.length}件のmigrationを適用しました（${applied.join(', ')}）`
      : 'disbord: 未適用のmigrationはありませんでした',
  );
}

async function main() {
  const production = process.argv.includes('--production');
  const cwd = process.cwd();

  const config = await readBotConfig(cwd);
  if (!config.db?.enable) {
    throw new Error('disbord: disbord.config.tsでdb.enableが有効になっていません');
  }

  if (production) {
    await runProductionMigrate(cwd, config);
  } else {
    await runDevMigrate(cwd);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
