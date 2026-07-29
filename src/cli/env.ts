import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvx, type EnvTarget } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { readBotConfig } from './readBotConfig';

/**
 * `disbord env`(toggle)・`disbord env encrypt`・`disbord env decrypt`共通の引数パーサー。
 * 対象はdevelopment/productionの二択のみ(`disbord migrate --production`と同じ流儀)のため、
 * `--env development|production`ではなく`--production`(省略時development)の形にしている。
 */
export function parseEnvArgs(args: (string | undefined)[]): { envTarget: EnvTarget } {
  let envTarget: EnvTarget = 'development';
  for (const arg of args) {
    if (arg === '--production') {
      envTarget = 'production';
      continue;
    }
    if (arg !== undefined) {
      throw new Error(`disbord: 不明な引数 "${arg}"`);
    }
  }
  return { envTarget };
}

export function isEncryptedContent(content: string): boolean {
  return /=\s*"?encrypted:/.test(content);
}

/**
 * development/productionのenvキー一覧が変わりうる操作のため、toggleが成功した後は
 * disbord.d.tsのprocess.env型（NodeJS.ProcessEnv augmentation）も併せて最新化する。
 */
export async function regenerateEnvTypes(cwd: string): Promise<void> {
  regenerateDisbordDtsFromConfig(cwd, await readBotConfig(cwd));
}

function assertEnvFileExists(cwd: string, envFile: string): void {
  try {
    readFileSync(join(cwd, envFile), 'utf-8');
  } catch (error) {
    throw new Error(`disbord: ${envFile} が見つかりません`, { cause: error });
  }
}

export async function runEnvToggle(envTarget: EnvTarget, cwd: string): Promise<number> {
  const envFile = `env/.env.${envTarget}`;
  const keysFile = `env/.env.keys.${envTarget}`;

  assertEnvFileExists(cwd, envFile);
  const content = readFileSync(join(cwd, envFile), 'utf-8');

  const action = isEncryptedContent(content) ? 'decrypt' : 'encrypt';
  const child = spawnDotenvx(cwd, [action, '-f', envFile, '-fk', keysFile]);
  await child.exited;
  const exitCode = child.exitCode ?? 1;
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}

/**
 * `disbord env`(toggle)と違い、暗号化/復号どちらかを固定で実行する
 * `disbord env encrypt`/`disbord env decrypt`用。既に目的の状態でもdotenvx自身が
 * べき等に扱う(何もしない)ため、ここでは現在の暗号化状態を判定・分岐しない。
 */
export async function runEnvAction(action: 'encrypt' | 'decrypt', envTarget: EnvTarget, cwd: string): Promise<number> {
  const envFile = `env/.env.${envTarget}`;
  const keysFile = `env/.env.keys.${envTarget}`;

  assertEnvFileExists(cwd, envFile);

  const child = spawnDotenvx(cwd, [action, '-f', envFile, '-fk', keysFile]);
  await child.exited;
  const exitCode = child.exitCode ?? 1;
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}
