import { describe, expect, test } from 'bun:test';
import { isEncryptedContent, parseEnvArgs } from '../src/cli/env';

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
