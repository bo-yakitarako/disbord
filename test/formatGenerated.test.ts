import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatGeneratedFile } from '../src/cli/formatGenerated';

const MESSY_SOURCE = `export default async function(client) {
    console.log( client.user.tag )
}
`;

describe('formatGeneratedFile', () => {
  test('oxfmtがcwd配下のnode_modulesに解決できる場合は指定ファイルだけを整形する', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-format-generated-'));
    try {
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(join(import.meta.dir, '../node_modules/oxfmt'), join(dir, 'node_modules/oxfmt'));

      const targetPath = join(dir, 'messy.ts');
      writeFileSync(targetPath, MESSY_SOURCE);

      await formatGeneratedFile(dir, targetPath);

      const formatted = await Bun.file(targetPath).text();
      expect(formatted).toBe(`export default async function (client) {\n  console.log(client.user.tag);\n}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oxfmtが解決できない場合(bun install未実行等)は何もせず黙ってskipする', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-format-generated-'));
    try {
      const targetPath = join(dir, 'messy.ts');
      writeFileSync(targetPath, MESSY_SOURCE);

      await expect(formatGeneratedFile(dir, targetPath)).resolves.toBeUndefined();

      const unchanged = await Bun.file(targetPath).text();
      expect(unchanged).toBe(MESSY_SOURCE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
