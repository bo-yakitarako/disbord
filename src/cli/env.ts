import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvx, type EnvTarget } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { readBotConfig } from './readBotConfig';

/**
 * `disbord env`(toggle)・`disbord env encrypt`・`disbord env decrypt`共通の引数パーサー。
 * 対象はdevelopment/productionの二択のみ(`disbord migrate --production`と同じ流儀)のため、
 * `--env development|production`ではなく`--production`(省略時development)の形にしている。
 * `--all`はdevelopment/production両方を対象にする指定(lefthookのpre-commitから1回で
 * 両方確実に処理したい用途のために追加)。`--production`と同時指定した場合はどちらを
 * 優先すべきか一意に決まらないためエラーにする。
 */
export function parseEnvArgs(args: (string | undefined)[]): { envTarget: EnvTarget; all: boolean } {
  let envTarget: EnvTarget = 'development';
  let all = false;
  let productionSpecified = false;
  for (const arg of args) {
    if (arg === '--production') {
      envTarget = 'production';
      productionSpecified = true;
      continue;
    }
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg !== undefined) {
      throw new Error(`disbord: 不明な引数 "${arg}"`);
    }
  }
  if (all && productionSpecified) {
    throw new Error('disbord: --allと--productionは同時に指定できません');
  }
  return { envTarget, all };
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

async function runEnvToggleForTarget(envTarget: EnvTarget, cwd: string): Promise<number> {
  const envFile = `env/.env.${envTarget}`;
  const keysFile = `env/.env.keys.${envTarget}`;

  assertEnvFileExists(cwd, envFile);
  const content = readFileSync(join(cwd, envFile), 'utf-8');

  const action = isEncryptedContent(content) ? 'decrypt' : 'encrypt';
  const child = spawnDotenvx(cwd, [action, '-f', envFile, '-fk', keysFile]);
  await child.exited;
  return child.exitCode ?? 1;
}

export async function runEnvToggle(envTarget: EnvTarget, cwd: string): Promise<number> {
  const exitCode = await runEnvToggleForTarget(envTarget, cwd);
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}

/**
 * `--all`指定時、development/productionを並列にtoggleする。それぞれ現在の暗号化状態に
 * 応じてencrypt/decryptが独立に決まる(例: developmentは平文→暗号化、productionは
 * 既に暗号化済み→復号、のような非対称な結果になり得る)。
 */
export async function runEnvToggleAll(cwd: string): Promise<number> {
  const exitCode = await runAllTargets((envTarget) => runEnvToggleForTarget(envTarget, cwd));
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
async function runEnvActionForTarget(
  action: 'encrypt' | 'decrypt',
  envTarget: EnvTarget,
  cwd: string,
): Promise<number> {
  const envFile = `env/.env.${envTarget}`;
  const keysFile = `env/.env.keys.${envTarget}`;

  assertEnvFileExists(cwd, envFile);

  const child = spawnDotenvx(cwd, [action, '-f', envFile, '-fk', keysFile]);
  await child.exited;
  return child.exitCode ?? 1;
}

export async function runEnvAction(action: 'encrypt' | 'decrypt', envTarget: EnvTarget, cwd: string): Promise<number> {
  const exitCode = await runEnvActionForTarget(action, envTarget, cwd);
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}

export async function runEnvActionAll(action: 'encrypt' | 'decrypt', cwd: string): Promise<number> {
  const exitCode = await runAllTargets((envTarget) => runEnvActionForTarget(action, envTarget, cwd));
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}

/**
 * development/productionを並列実行し、両方成功(0)なら0、そうでなければ最初に見つかった
 * 非ゼロの終了コードを返す(`Promise.all`の実行順序に依らずdevelopmentを優先する)。
 */
async function runAllTargets(fn: (envTarget: EnvTarget) => Promise<number>): Promise<number> {
  const [devCode, prodCode] = await Promise.all([fn('development'), fn('production')]);
  return devCode === 0 && prodCode === 0 ? 0 : devCode !== 0 ? devCode : prodCode;
}
