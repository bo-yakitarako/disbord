import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_BUNDLE_BANNER, parseBuildArgs } from '../src/cli/build';

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
