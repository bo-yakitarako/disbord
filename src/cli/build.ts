import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvxCapture } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { generateMainSource, scanEventFiles } from './generate';
import { readBotConfig } from './readBotConfig';
import { regenerateSchemaFile } from './schemaGen';

export function parseBuildArgs(args: (string | undefined)[]): { external: string[] } {
  const external: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--external') {
      const value = args[i + 1];
      if (value === undefined) {
        throw new Error('disbord: --externalには値を指定してください');
      }
      external.push(value);
      i++;
      continue;
    }
    if (args[i] !== undefined) {
      throw new Error(`disbord: 不明な引数 "${args[i]}"`);
    }
  }
  return { external };
}

export async function runBuild(cwd: string, options: { external?: string[] } = {}): Promise<void> {
  const eventNames = scanEventFiles(join(cwd, 'src/events'));
  mkdirSync(join(cwd, '.disbord'), { recursive: true });

  const config = await readBotConfig(cwd);
  const dbEnabled = Boolean(config.db?.enable);
  const coreClassName = config.coreClass?.enable ? config.coreClass.className : undefined;

  // dev.tsと同様、`.disbord/`ごと削除されていてもbuild単体でdisbord.d.tsを再構築できるようにする。
  regenerateDisbordDtsFromConfig(cwd, config);
  // schema.tsも`.disbord/`配下(gitignore対象)のため、`disbord migrate`未実行のクリーンな
  // チェックアウトから`disbord build`だけを叩いても.disbord/main.tsのbundleが解決できるようにする。
  if (dbEnabled) {
    await regenerateSchemaFile(cwd);
  }

  writeFileSync(
    join(cwd, '.disbord/main.ts'),
    generateMainSource(eventNames, { origin: 'build', dbEnabled, coreClassName }),
  );

  const external = new Set(options.external ?? []);
  if (dbEnabled) {
    external.add('@libsql/client');
  }

  const result = await Bun.build({
    entrypoints: [join(cwd, '.disbord/main.ts')],
    outdir: join(cwd, 'dist'),
    target: 'bun',
    minify: true,
    external: [...external],
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error('disbord: bun buildに失敗しました');
  }

  const { text, exitCode } = await spawnDotenvxCapture(cwd, [
    'decrypt',
    '-f',
    'env/.env.production',
    '-fk',
    'env/.env.keys.production',
    '--stdout',
  ]);
  if (exitCode !== 0) {
    throw new Error('disbord: env/.env.production の復号に失敗しました（存在確認・dotenvx導入状況を確認してください）');
  }
  writeFileSync(join(cwd, 'dist/.env'), text);

  console.log(`disbord: dist/main.js（${eventNames.length}イベント同梱・minify済み）と dist/.env を生成しました`);
}
