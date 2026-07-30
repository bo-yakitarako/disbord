import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOnceArgs, runOnce } from '../src/cli/once';

describe('parseOnceArgs', () => {
  test('引数なし時はproduction: false', () => {
    expect(parseOnceArgs([])).toEqual({ production: false });
    expect(parseOnceArgs([undefined])).toEqual({ production: false });
  });

  test('--productionでproduction: true', () => {
    expect(parseOnceArgs(['--production'])).toEqual({ production: true });
  });

  test('未知の引数はthrow', () => {
    expect(() => parseOnceArgs(['--foo'])).toThrow();
  });
});

describe('runOnce', () => {
  test('src/once/<name>.tsが存在しない場合はthrow(disbord.config.tsの読み込みより前にfail-fastする)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-once-'));
    try {
      await expect(runOnce('notice', false, dir)).rejects.toThrow(/src\/once\/notice\.ts が見つかりません/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('mainは予約済みでthrow(dist/main.jsと衝突するため、ファイル存在チェックより前にfail-fastする)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-once-'));
    try {
      await expect(runOnce('main', false, dir)).rejects.toThrow(/予約済み/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
