export type EnvTarget = 'development' | 'production';

/**
 * dotenvx CLIバイナリ（mise等でPATHに用意されている想定。npm版ライブラリは使わない）をspawnする。
 */
export function spawnDotenvx(cwd: string, args: string[]) {
  try {
    return Bun.spawn(['dotenvx', ...args], { cwd, stdio: ['inherit', 'inherit', 'inherit'] });
  } catch (error) {
    throw new Error(
      'disbord: failed to spawn dotenvx. dotenvxがPATHに存在するか確認してください（`mise install`等）。',
      { cause: error },
    );
  }
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
  try {
    return Bun.spawn(['dotenvx', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'inherit' });
  } catch (error) {
    throw new Error(
      'disbord: failed to spawn dotenvx. dotenvxがPATHに存在するか確認してください（`mise install`等）。',
      { cause: error },
    );
  }
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
