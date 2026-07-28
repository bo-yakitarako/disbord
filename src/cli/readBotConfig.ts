import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../config';

/**
 * bot側プロジェクトの disbord.config.ts を絶対パス経由で動的importする。
 * commandsRunner.tsと同じ手法(disbordパッケージ自身の場所ではなく、cwd基準で解決する必要があるため)。
 */
export async function readBotConfig(cwd: string): Promise<Config> {
  const module = await import(pathToFileURL(resolve(cwd, 'disbord.config.ts')).href);
  return module.default as Config;
}
