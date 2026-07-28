import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../config';

export async function readBotConfig(cwd: string): Promise<Config> {
  const module = await import(pathToFileURL(resolve(cwd, 'disbord.config.ts')).href);
  return module.default as Config;
}
