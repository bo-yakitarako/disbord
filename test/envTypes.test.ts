import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectEnvKeyTypes, computeEnvKeyTypes, parseEnvKeys, readEnvKeys } from '../src/cli/envTypes';

describe('parseEnvKeys', () => {
  test('平文envから宣言順に依らずキー名だけを拾う', () => {
    expect(parseEnvKeys('TOKEN=fake.invalid.token\nCLIENT_ID=123456789012345678\n')).toEqual(['TOKEN', 'CLIENT_ID']);
  });

  test('暗号化済み(encrypted:...)でもキー名自体は平文のまま拾える', () => {
    const encrypted = [
      '#/-------------------[DOTENV_PUBLIC_KEY]--------------------/',
      'DOTENV_PUBLIC_KEY="024e2b8b8a255ae067dcf0410c4835022aba54b01f3cd8d0b6c9a691cc0ae6daac"',
      'TOKEN="encrypted:BO3IgV09BJzkb8UMJ0zsXzprdRckHZg0otTt5+f5IAq7fUAwqTKY"',
    ].join('\n');
    expect(parseEnvKeys(encrypted)).toEqual(['TOKEN']);
  });

  test('DOTENV_PUBLIC_KEY*はdotenvxのメタキーのため除外する', () => {
    const content = 'DOTENV_PUBLIC_KEY_DEVELOPMENT="03cb1a..." # -fk .env.keys.development\nTOKEN=fake.invalid.token\n';
    expect(parseEnvKeys(content)).toEqual(['TOKEN']);
  });

  test('空行・コメント行は無視する', () => {
    expect(parseEnvKeys('\n# comment\nTOKEN=fake.invalid.token\n\n')).toEqual(['TOKEN']);
  });
});

describe('computeEnvKeyTypes', () => {
  test('development/production両方にあるキーはrequired', () => {
    expect(computeEnvKeyTypes(['TOKEN', 'CLIENT_ID'], ['TOKEN', 'CLIENT_ID'])).toEqual([
      { key: 'CLIENT_ID', required: true },
      { key: 'TOKEN', required: true },
    ]);
  });

  test('片方にしかないキーはoptional', () => {
    expect(computeEnvKeyTypes(['TOKEN', 'DEV_ONLY'], ['TOKEN', 'PROD_ONLY'])).toEqual([
      { key: 'DEV_ONLY', required: false },
      { key: 'PROD_ONLY', required: false },
      { key: 'TOKEN', required: true },
    ]);
  });

  test('キー名のアルファベット順にソートされる', () => {
    const result = computeEnvKeyTypes(['ZKEY', 'AKEY'], ['ZKEY', 'AKEY']);
    expect(result.map((r) => r.key)).toEqual(['AKEY', 'ZKEY']);
  });
});

describe('readEnvKeys / collectEnvKeyTypes', () => {
  let dir: string;

  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), 'disbord-envtypes-'));
    mkdirSync(join(dir, 'env'), { recursive: true });
  };
  const teardown = () => rmSync(dir, { recursive: true, force: true });

  test('ファイルが存在しない場合は空配列', () => {
    setup();
    expect(readEnvKeys(dir, 'development')).toEqual([]);
    teardown();
  });

  test('development/productionの両ファイルからキー差分を計算する', () => {
    setup();
    writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=a\nCLIENT_ID=b\nDEV_ONLY=c\n');
    writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=a\nCLIENT_ID=b\nTURSO_DATABASE_URL=d\n');

    expect(collectEnvKeyTypes(dir)).toEqual([
      { key: 'CLIENT_ID', required: true },
      { key: 'DEV_ONLY', required: false },
      { key: 'TOKEN', required: true },
      { key: 'TURSO_DATABASE_URL', required: false },
    ]);
    teardown();
  });
});
