import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnvTarget } from './dotenvxSpawn';

export type EnvKeyType = { key: string; required: boolean };

const KEY_LINE_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * dotenvxの平文/暗号化どちらの状態でもキー名自体は常に平文で残る
 * （値だけが`encrypted:...`に置き換わる）ため、暗号化状態を気にせずキーだけ拾える。
 * `DOTENV_PUBLIC_KEY*`はdotenvxが埋め込むメタキーであり、bot側のprocess.envには載らないため除外する。
 */
export function parseEnvKeys(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = trimmed.match(KEY_LINE_PATTERN);
    const key = match?.[1];
    if (key === undefined || key.startsWith('DOTENV_PUBLIC_KEY')) continue;
    keys.push(key);
  }
  return keys;
}

export function readEnvKeys(cwd: string, envTarget: EnvTarget): string[] {
  const path = join(cwd, `env/.env.${envTarget}`);
  if (!existsSync(path)) return [];
  return parseEnvKeys(readFileSync(path, 'utf-8'));
}

/**
 * development/production両方にあるキーは必ず存在する前提のため`required`、
 * 片方にしかないキーは`optional`（disbord.d.ts側で`?`付きの型になる）。
 */
export function computeEnvKeyTypes(devKeys: string[], prodKeys: string[]): EnvKeyType[] {
  const devSet = new Set(devKeys);
  const prodSet = new Set(prodKeys);
  const allKeys = Array.from(new Set([...devKeys, ...prodKeys])).sort();
  return allKeys.map((key) => ({ key, required: devSet.has(key) && prodSet.has(key) }));
}

export function collectEnvKeyTypes(cwd: string): EnvKeyType[] {
  return computeEnvKeyTypes(readEnvKeys(cwd, 'development'), readEnvKeys(cwd, 'production'));
}
