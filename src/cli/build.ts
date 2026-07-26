import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvxCapture } from './dotenvxSpawn';
import { generateMainSource, scanEventFiles } from './generate';

/**
 * `disbord build [--external <pkg>]...` の引数解析。`bun build --external`と同じく複数指定可。
 */
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
  writeFileSync(join(cwd, '.disbord/main.ts'), generateMainSource(eventNames, { registerCommands: false }));

  const result = await Bun.build({
    entrypoints: [join(cwd, '.disbord/main.ts')],
    outdir: join(cwd, 'dist'),
    target: 'bun',
    minify: true,
    external: options.external ?? [],
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
