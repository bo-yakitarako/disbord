import { describe, expect, test } from 'bun:test';
import { addEnvKeys, removeEnvKeys } from '../src/cli/envPatch';

describe('addEnvKeys', () => {
  test('末尾に空値キーを追記する', () => {
    expect(addEnvKeys('TOKEN=\nCLIENT_ID=\n', ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'])).toBe(
      'TOKEN=\nCLIENT_ID=\nTURSO_DATABASE_URL=\nTURSO_AUTH_TOKEN=\n',
    );
  });

  test('既に存在するキーは重複追加しない(冪等)', () => {
    expect(addEnvKeys('TOKEN=\nTURSO_DATABASE_URL=xxx\n', ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'])).toBe(
      'TOKEN=\nTURSO_DATABASE_URL=xxx\nTURSO_AUTH_TOKEN=\n',
    );
  });

  test('末尾に改行がない場合も改行を挟んで追記する', () => {
    expect(addEnvKeys('TOKEN=', ['GUILD_ID'])).toBe('TOKEN=\nGUILD_ID=\n');
  });

  test('空文字列に追記する場合はそのまま追加分のみになる', () => {
    expect(addEnvKeys('', ['TOKEN'])).toBe('TOKEN=\n');
  });

  test('追加対象キーが全て既存の場合は内容を変更しない', () => {
    const content = 'TOKEN=abc\n';
    expect(addEnvKeys(content, ['TOKEN'])).toBe(content);
  });

  test('暗号化済み(encrypted:...)の値でもキー名判定に影響しない', () => {
    const content = 'TOKEN="encrypted:BO3IgV09BJzkb8UMJ0zsXzprdRckHZg0otTt5+f5IAq7fUAwqTKY"\n';
    expect(addEnvKeys(content, ['TOKEN', 'TURSO_DATABASE_URL'])).toBe(`${content}TURSO_DATABASE_URL=\n`);
  });
});

describe('removeEnvKeys', () => {
  test('指定したキーの行だけを取り除く', () => {
    expect(
      removeEnvKeys('TOKEN=\nTURSO_DATABASE_URL=\nTURSO_AUTH_TOKEN=\n', ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']),
    ).toBe('TOKEN=\n');
  });

  test('該当キーが存在しない場合は内容を変更しない', () => {
    const content = 'TOKEN=\nCLIENT_ID=\n';
    expect(removeEnvKeys(content, ['TURSO_DATABASE_URL'])).toBe(content);
  });

  test('暗号化済み(encrypted:...)の値でも該当キーの行を除去できる', () => {
    const content = 'TOKEN="encrypted:xxx"\nTURSO_DATABASE_URL="encrypted:yyy"\n';
    expect(removeEnvKeys(content, ['TURSO_DATABASE_URL'])).toBe('TOKEN="encrypted:xxx"\n');
  });
});
