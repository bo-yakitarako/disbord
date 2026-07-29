import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEncryptedContent, parseEnvArgs, regenerateEnvTypes } from '../src/cli/env';
import { generateDisbordDts } from '../src/cli/scaffold';

describe('parseEnvArgs', () => {
  test('引数なし時はdevelopmentにfallbackする', () => {
    expect(parseEnvArgs([])).toEqual({ envTarget: 'development' });
    expect(parseEnvArgs([undefined])).toEqual({ envTarget: 'development' });
  });

  test('--envでenvTargetを明示できる', () => {
    expect(parseEnvArgs(['--env', 'production'])).toEqual({ envTarget: 'production' });
  });

  test('development/production以外の--env値はthrow', () => {
    expect(() => parseEnvArgs(['--env', 'staging'])).toThrow();
    expect(() => parseEnvArgs(['--env'])).toThrow();
  });

  test('未知の余分な引数はthrow', () => {
    expect(() => parseEnvArgs(['--force'])).toThrow();
    expect(() => parseEnvArgs(['push'])).toThrow();
  });
});

describe('isEncryptedContent', () => {
  test('DOTENV_PUBLIC_KEYを含む暗号化済みファイルはtrue', () => {
    const encrypted = [
      '#/-------------------[DOTENV_PUBLIC_KEY]--------------------/',
      'DOTENV_PUBLIC_KEY="024e2b8b8a255ae067dcf0410c4835022aba54b01f3cd8d0b6c9a691cc0ae6daac"',
      'TOKEN=encrypted:BO3IgV09BJzkb8UMJ0zsXzprdRckHZg0otTt5+f5IAq7fUAwqTKY',
    ].join('\n');
    expect(isEncryptedContent(encrypted)).toBe(true);
  });

  test('平文の内容はfalse', () => {
    expect(isEncryptedContent('TOKEN=fake.invalid.token\nCLIENT_ID=123456789012345678\n')).toBe(false);
  });

  test('decrypt後もDOTENV_PUBLIC_KEYヘッダーだけ残るケースはfalse(実際のdotenvx decryptの挙動)', () => {
    const decryptedButHeaderRemains = [
      '#/-------------------[DOTENV_PUBLIC_KEY]--------------------/',
      'DOTENV_PUBLIC_KEY_DEVELOPMENT="03cb1adcd87e7c6789858dfcd28aa66413957d45144d10b8ec27a3fb5dfaa586ed" # -fk .env.keys.development',
      '',
      'TOKEN=fake.invalid.token',
      'CLIENT_ID=123456789012345678',
    ].join('\n');
    expect(isEncryptedContent(decryptedButHeaderRemains)).toBe(false);
  });
});

describe('regenerateEnvTypes', () => {
  const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

  test('development/production両方にあるキーはrequired、片方だけのキーはoptionalとしてdisbord.d.tsに反映する', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-env-'));
    try {
      writeFileSync(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      mkdirSync(join(dir, '.disbord'), { recursive: true });
      writeFileSync(join(dir, '.disbord/disbord.d.ts'), generateDisbordDts({ db: false, coreClass: false }));
      mkdirSync(join(dir, 'env'), { recursive: true });
      writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=a\nCLIENT_ID=b\nDEV_ONLY=c\n');
      writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=a\nCLIENT_ID=b\n');

      await regenerateEnvTypes(dir);

      const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
      expect(dts).toContain('namespace NodeJS');
      expect(dts).toContain('TOKEN: string;');
      expect(dts).toContain('CLIENT_ID: string;');
      expect(dts).toContain('DEV_ONLY?: string;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const CONFIG_WITH_CORE_CLASS_AND_DB = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  coreClass: { enable: true, className: 'Game', nullMessage: 'エラー' },
  db: { enable: true },
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

  test('既存のcoreClass/db設定(className含む)を保ったまま再生成する', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-env-'));
    try {
      writeFileSync(join(dir, 'disbord.config.ts'), CONFIG_WITH_CORE_CLASS_AND_DB);
      mkdirSync(join(dir, '.disbord'), { recursive: true });
      writeFileSync(
        join(dir, '.disbord/disbord.d.ts'),
        generateDisbordDts({ db: true, coreClass: true, coreClassName: 'Game' }),
      );
      mkdirSync(join(dir, 'env'), { recursive: true });
      writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=a\n');
      writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=a\n');

      await regenerateEnvTypes(dir);

      const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
      expect(dts).toContain(`from '@/Game'`);
      expect(dts).toContain(`from './db/schema'`);
      expect(dts).toContain('TOKEN: string;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('.disbord/ごと削除されていても、disbord.config.ts(className含む)とenv/だけから正しく再生成できる', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-env-'));
    try {
      writeFileSync(join(dir, 'disbord.config.ts'), CONFIG_WITH_CORE_CLASS_AND_DB);
      mkdirSync(join(dir, 'env'), { recursive: true });
      writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=a\n');
      writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=a\n');
      // .disbord/自体を意図的に作らない(disbord.d.tsの過去の内容に一切依存しないことを確認する)

      await regenerateEnvTypes(dir);

      const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
      expect(dts).toContain(`from '@/Game'`);
      expect(dts).toContain(`from './db/schema'`);
      expect(dts).toContain('TOKEN: string;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
