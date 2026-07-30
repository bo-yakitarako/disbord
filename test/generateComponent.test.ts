import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateComponentFileContent, runGenerateComponent } from '../src/cli/generateComponent';
import { generateButtonsStub, generateSelectMenusStub } from '../src/cli/scaffold';

describe('generateComponentFileContent', () => {
  test('button指定時はgenerateButtonsStubと同じ内容', () => {
    expect(generateComponentFileContent('button')).toBe(generateButtonsStub());
  });

  test('selectMenu指定時はgenerateSelectMenusStubと同じ内容', () => {
    expect(generateComponentFileContent('selectMenu')).toBe(generateSelectMenusStub());
  });
});

describe('runGenerateComponent', () => {
  test('button指定でsrc/components/buttons.tsを生成する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-component-'));
    try {
      await runGenerateComponent('button', dir);
      const targetPath = join(dir, 'src/components/buttons.ts');
      expect(existsSync(targetPath)).toBe(true);
      expect(await readFile(targetPath, 'utf-8')).toBe(generateButtonsStub());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('selectMenu指定でsrc/components/selectMenus.tsを生成する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-component-'));
    try {
      await runGenerateComponent('selectMenu', dir);
      const targetPath = join(dir, 'src/components/selectMenus.ts');
      expect(existsSync(targetPath)).toBe(true);
      expect(await readFile(targetPath, 'utf-8')).toBe(generateSelectMenusStub());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('既に存在する場合は上書きせずthrowする', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-component-'));
    try {
      await runGenerateComponent('button', dir);
      await expect(runGenerateComponent('button', dir)).rejects.toThrow(/既に存在します/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('buttonとselectMenuは独立に生成できる(片方だけ存在しても他方の生成は妨げない)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-component-'));
    try {
      await runGenerateComponent('button', dir);
      await runGenerateComponent('selectMenu', dir);
      expect(existsSync(join(dir, 'src/components/buttons.ts'))).toBe(true);
      expect(existsSync(join(dir, 'src/components/selectMenus.ts'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
