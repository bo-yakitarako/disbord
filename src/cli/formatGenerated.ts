import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function resolveOxfmtBin(cwd: string): string | undefined {
  let pkgJsonPath: string;
  try {
    pkgJsonPath = Bun.resolveSync('oxfmt/package.json', cwd);
  } catch {
    return undefined;
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { bin?: Record<string, string> };
  const relBinPath = pkg.bin?.oxfmt;
  return relBinPath ? join(dirname(pkgJsonPath), relBinPath) : undefined;
}

/**
 * `disbord generate *`系が生成した1ファイルだけをoxfmtで整形する。oxfmtはbotプロジェクト側の
 * devDependencyのため、未インストール（`bun install`未実行等）ならoxfmtBinが解決できず
 * 黙ってskipする（整形は付随的な処理であり、生成コマンド自体の成否には影響させない）。
 */
export async function formatGeneratedFile(cwd: string, filePath: string): Promise<void> {
  const oxfmtBin = resolveOxfmtBin(cwd);
  if (!oxfmtBin) return;
  const child = Bun.spawn(['bun', oxfmtBin, '--write', filePath], { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  await child.exited;
}
