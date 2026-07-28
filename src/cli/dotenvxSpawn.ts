import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type EnvTarget = 'development' | 'production';

/**
 * dotenvxはPATH上のCLIバイナリではなく、disbordのnpm依存`@dotenvx/dotenvx`から解決する。
 * `import.meta.dir`(disbord自身のsrc/cli/)基準で解決するため、bot側がmise等でdotenvxを
 * 別途用意する必要はない。
 */
function resolveDotenvxBin(): string {
  let pkgJsonPath: string;
  try {
    pkgJsonPath = Bun.resolveSync('@dotenvx/dotenvx/package.json', import.meta.dir);
  } catch (error) {
    throw new Error(
      'disbord: @dotenvx/dotenvxが見つかりません。disbordの依存関係が正しくインストールされているか確認してください（bun install等）。',
      { cause: error },
    );
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { bin?: Record<string, string> };
  const relBinPath = pkg.bin?.dotenvx;
  if (!relBinPath) {
    throw new Error('disbord: @dotenvx/dotenvxのbinエントリが見つかりませんでした');
  }
  return join(dirname(pkgJsonPath), relBinPath);
}

export function spawnDotenvx(cwd: string, args: string[]) {
  return Bun.spawn(['bun', resolveDotenvxBin(), ...args], { cwd, stdio: ['inherit', 'inherit', 'inherit'] });
}

/**
 * `dotenvx run -f env/.env.<target> -fk env/.env.keys.<target> -- <command>` をspawnする。
 */
export function spawnWithDotenvx(cwd: string, envTarget: EnvTarget, command: string[]) {
  return spawnDotenvx(cwd, [
    'run',
    '-f',
    `env/.env.${envTarget}`,
    '-fk',
    `env/.env.keys.${envTarget}`,
    '--',
    ...command,
  ]);
}

function spawnDotenvxWithPipedStdout(cwd: string, args: string[]) {
  return Bun.spawn(['bun', resolveDotenvxBin(), ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'inherit' });
}

/**
 * dotenvxをspawnし標準出力を文字列として回収する（`decrypt --stdout`で元ファイルを変更せず
 * 復号済み内容だけを取り出す用途）。stderrは進捗表示のため親にinheritする。
 */
export async function spawnDotenvxCapture(cwd: string, args: string[]): Promise<{ text: string; exitCode: number }> {
  const child = spawnDotenvxWithPipedStdout(cwd, args);
  const [text, exitCode] = await Promise.all([child.stdout.text(), child.exited]);
  return { text, exitCode };
}
