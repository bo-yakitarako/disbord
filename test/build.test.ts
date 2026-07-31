import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDistMiseToml, BUILD_BUNDLE_BANNER, parseBuildArgs, stripDotenvxEnvHeader } from '../src/cli/build';

describe('parseBuildArgs', () => {
  test('引数なし時はexternalが空配列', () => {
    expect(parseBuildArgs([])).toEqual({ external: [] });
    expect(parseBuildArgs([undefined])).toEqual({ external: [] });
  });

  test('--externalを1つ指定できる', () => {
    expect(parseBuildArgs(['--external', '@libsql/client'])).toEqual({ external: ['@libsql/client'] });
  });

  test('--externalを複数回指定すると全て集める(bun buildと同じ挙動)', () => {
    expect(parseBuildArgs(['--external', 'sharp', '--external', '@libsql/client'])).toEqual({
      external: ['sharp', '@libsql/client'],
    });
  });

  test('--externalに値が無い場合はthrow', () => {
    expect(() => parseBuildArgs(['--external'])).toThrow();
  });

  test('未知の余分な引数はthrow', () => {
    expect(() => parseBuildArgs(['--foo'])).toThrow();
  });
});

describe('BUILD_BUNDLE_BANNER', () => {
  test('runBuildが使うのと同じbannerオプションでbundleするとMIT LICENSE表記が先頭に付与される', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-build-banner-'));
    try {
      const entry = join(dir, 'entry.ts');
      await writeFile(entry, 'console.log("disbord");\n');

      const result = await Bun.build({
        entrypoints: [entry],
        outdir: join(dir, 'dist'),
        target: 'bun',
        minify: true,
        banner: BUILD_BUNDLE_BANNER,
      });

      expect(result.success).toBe(true);
      const output = await result.outputs[0]?.text();
      expect(output).toContain(BUILD_BUNDLE_BANNER);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('buildDistMiseToml', () => {
  const BASE_MISE_TOML = `[tools]\nbun = "1.3.13"\n`;

  test('onceスクリプトが無ければ[tasks.main]だけ追記する', () => {
    expect(buildDistMiseToml(BASE_MISE_TOML, [])).toBe(
      `[tools]\nbun = "1.3.13"\n\n[tasks.main]\nrun = 'bun main.js'\n`,
    );
  });

  test('onceスクリプトの数だけ[tasks.<name>]を追記する(mise run <name>でsystemd oneshotから起動する)', () => {
    expect(buildDistMiseToml(BASE_MISE_TOML, ['notice', 'cleanup'])).toBe(
      `[tools]\nbun = "1.3.13"\n\n[tasks.main]\nrun = 'bun main.js'\n\n[tasks.notice]\nrun = 'bun notice.js'\n\n[tasks.cleanup]\nrun = 'bun cleanup.js'\n`,
    );
  });
});

describe('stripDotenvxEnvHeader', () => {
  test('dotenvxの公開鍵バナー・DOTENV_PUBLIC_KEY行・# .env.*コメント行を取り除き、KEY=VALUE部分だけを残す', () => {
    // dotenvx decrypt --stdoutは実際に末尾が改行2つ(空行1つ分)になる(実機確認済み)。
    // それも1つに揃えられることをここで検証する。
    const decrypted = [
      '#/-------------------[DOTENV_PUBLIC_KEY]--------------------/',
      '#/            public-key encryption for .env files          /',
      '#/       [how it works](https://dotenvx.com/encryption)     /',
      '#/----------------------------------------------------------/',
      'DOTENV_PUBLIC_KEY_PRODUCTION="03319d23a48f83afddf87818b85c70956da82d374a47bc70213180a05fb104541a" # -fk ../.env.keys',
      '',
      '# .env.production',
      'TOKEN=abc123',
      'CLIENT_ID=xyz789',
      '',
      '',
    ].join('\n');

    expect(stripDotenvxEnvHeader(decrypted)).toBe('TOKEN=abc123\nCLIENT_ID=xyz789\n');
  });

  test('# .env.*行が見つからない場合も末尾の改行は1つに揃える(将来dotenvxの出力形式が変わった場合のフォールバック)', () => {
    expect(stripDotenvxEnvHeader('TOKEN=abc123\nCLIENT_ID=xyz789\n\n\n')).toBe('TOKEN=abc123\nCLIENT_ID=xyz789\n');
  });
});
