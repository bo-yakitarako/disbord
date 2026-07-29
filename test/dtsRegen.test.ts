import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regenerateDisbordDts, regenerateDisbordDtsFromConfig } from '../src/cli/dtsRegen';
import type { Config } from '../src/config';

describe('regenerateDisbordDts', () => {
  test('.disbord/が存在しなくてもmkdirして書き出す(disbord dev/build/enable/disable/envのいずれもこれで完結する)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-dtsregen-'));
    try {
      regenerateDisbordDts(dir, false, false, undefined);
      expect(readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8')).toContain('declare module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('env/配下のキーも都度読み直して反映する', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-dtsregen-'));
    try {
      mkdirSync(join(dir, 'env'), { recursive: true });
      writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=a\n');
      writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=a\n');

      regenerateDisbordDts(dir, false, false, undefined);

      expect(readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8')).toContain('TOKEN: string;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('regenerateDisbordDtsFromConfig', () => {
  const BASE: Config = { intents: ['Guilds'], botErrorMessage: 'エラー' };

  test('db/coreClass無効時はRegistryのschema/coreフィールドを含まない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-dtsregen-'));
    try {
      regenerateDisbordDtsFromConfig(dir, BASE);
      const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
      expect(dts).not.toContain('schema');
      expect(dts).not.toContain('core:');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('.disbord/disbord.d.tsが存在しなくても、configのcoreClass.classNameだけから正しいimportを組み立てる(.disbord/ごと削除された状態からの復元を想定)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-dtsregen-'));
    try {
      const config: Config = {
        ...BASE,
        coreClass: { enable: true, className: 'Game', nullMessage: 'エラー' },
        db: { enable: true },
      };

      regenerateDisbordDtsFromConfig(dir, config);

      const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
      expect(dts).toContain(`from '@/Game'`);
      expect(dts).toContain('core: InstanceType<typeof Game>;');
      expect(dts).toContain(`from '@/db/schema'`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
