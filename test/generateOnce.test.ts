import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateOnceFileContent, runGenerateOnce } from '../src/cli/generateOnce';

describe('generateOnceFileContent', () => {
  test('Client<true>を引数に取るdefault export関数のひな形を返す(src/events/ready.tsと同じ形)', () => {
    const content = generateOnceFileContent();
    expect(content).toContain(`import type { Client } from 'discord.js';`);
    expect(content).toContain('export default async function (client: Client<true>) {');
  });

  test('client.destroy()は書かない(実実行ファイル.disbord/once/配下が自動で呼ぶため)', () => {
    expect(generateOnceFileContent()).not.toContain('destroy');
  });
});

describe('runGenerateOnce', () => {
  test('src/once/<name>.tsを生成する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await runGenerateOnce('notice', dir);
      const targetPath = join(dir, 'src/once/notice.ts');
      expect(existsSync(targetPath)).toBe(true);
      const content = await readFile(targetPath, 'utf-8');
      expect(content).toBe(generateOnceFileContent());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('既に存在する場合は上書きせずthrowする', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await runGenerateOnce('notice', dir);
      await expect(runGenerateOnce('notice', dir)).rejects.toThrow(/既に存在します/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('mainは予約済みでthrowする(dist/main.jsと衝突するため)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await expect(runGenerateOnce('main', dir)).rejects.toThrow(/予約済み/);
      expect(existsSync(join(dir, 'src/once/main.ts'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
