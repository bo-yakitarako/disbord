import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvx, type EnvTarget } from './dotenvxSpawn';
import { extractCoreClassNameFromDts, regenerateDisbordDts } from './dtsRegen';
import { readBotConfig } from './readBotConfig';

export function parseEnvArgs(args: (string | undefined)[]): { envTarget: EnvTarget } {
  let envTarget: EnvTarget = 'development';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      const value = args[i + 1];
      if (value !== 'development' && value !== 'production') {
        throw new Error(
          `disbord: --envは"development"か"production"を指定してください（指定値: ${value ?? '(なし)'}）`,
        );
      }
      envTarget = value;
      i++;
      continue;
    }
    if (args[i] !== undefined) {
      throw new Error(`disbord: 不明な引数 "${args[i]}"`);
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
  const config = await readBotConfig(cwd);
  const dtsPath = join(cwd, '.disbord/disbord.d.ts');
  const existingDts = existsSync(dtsPath) ? readFileSync(dtsPath, 'utf-8') : '';
  const coreClassEnabled = Boolean(config.coreClass?.enable);
  regenerateDisbordDts(
    cwd,
    Boolean(config.db?.enable),
    coreClassEnabled,
    coreClassEnabled ? extractCoreClassNameFromDts(existingDts) : undefined,
  );
}

export async function runEnvToggle(envTarget: EnvTarget, cwd: string): Promise<number> {
  const envFile = `env/.env.${envTarget}`;
  const keysFile = `env/.env.keys.${envTarget}`;

  let content: string;
  try {
    content = readFileSync(join(cwd, envFile), 'utf-8');
  } catch (error) {
    throw new Error(`disbord: ${envFile} が見つかりません`, { cause: error });
  }

  const action = isEncryptedContent(content) ? 'decrypt' : 'encrypt';
  const child = spawnDotenvx(cwd, [action, '-f', envFile, '-fk', keysFile]);
  await child.exited;
  const exitCode = child.exitCode ?? 1;
  if (exitCode === 0) {
    await regenerateEnvTypes(cwd);
  }
  return exitCode;
}
