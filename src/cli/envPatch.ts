import { KEY_LINE_PATTERN, parseEnvKeys } from './envTypes';

/**
 * `env/.env.{development,production}`へキーを追記する(`disbord enable db`等)。
 * 既に存在するキーは重複追加しない(冪等)。dotenvxの暗号化状態を問わずキー名は常に
 * 平文で残る(envTypes.ts参照)ため、暗号化済みファイルへの追記も安全。
 */
export function addEnvKeys(content: string, keys: string[]): string {
  const existing = new Set(parseEnvKeys(content));
  const missing = keys.filter((key) => !existing.has(key));
  if (missing.length === 0) return content;

  const suffix = missing.map((key) => `${key}=\n`).join('');
  if (content === '') return suffix;
  return content.endsWith('\n') ? content + suffix : `${content}\n${suffix}`;
}

/**
 * `env/.env.{development,production}`からキーを除去する(`disbord disable db`等)。
 * 値が暗号化済み(`encrypted:...`)でもキー名自体は平文のままのため、行頭一致だけで判定できる。
 */
export function removeEnvKeys(content: string, keys: string[]): string {
  const keySet = new Set(keys);
  return content
    .split('\n')
    .filter((line) => {
      const match = line.trim().match(KEY_LINE_PATTERN);
      return !(match && keySet.has(match[1]!));
    })
    .join('\n');
}
