import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvx, type EnvTarget } from './dotenvxSpawn';

/**
 * `disbord env [--env development|production]` の引数解析。
 * commandsと違いaction動詞を取らない(toggleそのものが唯一の動作)ため検証はこれだけ。
 */
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

/**
 * `DOTENV_PUBLIC_KEY`のヘッダーはdecrypt後も残り続ける(実ファイルで確認済み)ため状態判定には使えない。
 * 各値が`encrypted:`prefixを持つかどうかで判定する。
 */
export function isEncryptedContent(content: string): boolean {
  return /=\s*"?encrypted:/.test(content);
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
  return child.exitCode ?? 1;
}
