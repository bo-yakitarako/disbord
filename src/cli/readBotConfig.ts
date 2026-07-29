import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../config';

export async function readBotConfig(cwd: string): Promise<Config> {
  const configPath = resolve(cwd, 'disbord.config.ts');
  const source = readFileSync(configPath, 'utf-8');

  // Bunの動的importはURLのクエリ文字列を無視して同一パスをキャッシュし続ける(Node.jsと異なり
  // クエリでのキャッシュバスティングが効かないことを実機確認済み)。1プロセス1コマンド実行が
  // 前提の他CLIコマンドでは問題にならないが、`disbord enable`/`disable`はdisbord.config.tsを
  // 書き換えた直後に読み直す可能性があるため、毎回内容をユニークな一時ファイルへコピーしてimportする。
  const tmpDir = mkdtempSync(join(tmpdir(), 'disbord-config-'));
  const tmpPath = join(tmpDir, 'disbord.config.ts');
  writeFileSync(tmpPath, source);
  try {
    const module = await import(pathToFileURL(tmpPath).href);
    return module.default as Config;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
