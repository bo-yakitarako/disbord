import { describe, expect, test } from 'bun:test';
import { addDbToPackageJson, removeDbFromPackageJson, type PackageJsonLike } from '../src/cli/packageJsonPatch';

function basePkg(): PackageJsonLike {
  return {
    name: 'my-bot',
    scripts: {
      dev: 'disbord dev',
      env: 'disbord env',
      help: 'disbord help',
    },
    dependencies: {
      disbord: '^0.0.2',
      'discord.js': '^14.27.0',
    },
  };
}

describe('addDbToPackageJson', () => {
  test('gen:model・migrate・model:type・studioスクリプトをこの順でhelpの直前に挿入する', () => {
    const result = addDbToPackageJson(basePkg());
    expect(Object.keys(result.scripts!)).toEqual([
      'dev',
      'env',
      'gen:model',
      'migrate',
      'model:type',
      'studio',
      'help',
    ]);
    expect(result.scripts!['gen:model']).toBe('disbord generate model');
    expect(result.scripts!.migrate).toBe('disbord migrate');
    expect(result.scripts!['model:type']).toBe('disbord model type');
    expect(result.scripts!.studio).toBe('disbord studio');
  });

  test('db関連の依存を追加する', () => {
    const result = addDbToPackageJson(basePkg());
    expect(result.dependencies!['@libsql/client']).toBe('^0.17.2');
    expect(result.dependencies!.dayjs).toBe('^1.11.19');
    expect(result.dependencies!['drizzle-kit']).toBe('^0.31.10');
    expect(result.dependencies!['drizzle-orm']).toBe('^0.45.1');
  });

  test('既存のdependencies/scriptsは保持する', () => {
    const result = addDbToPackageJson(basePkg());
    expect(result.dependencies!.disbord).toBe('^0.0.2');
    expect(result.scripts!.dev).toBe('disbord dev');
  });
});

describe('removeDbFromPackageJson', () => {
  test('addDbToPackageJsonした内容を元に戻す(gen:model・migrateスクリプトとdb依存を除去)', () => {
    const withDb = addDbToPackageJson(basePkg());
    const result = removeDbFromPackageJson(withDb);
    expect(result.scripts).toEqual(basePkg().scripts);
    expect(result.dependencies).toEqual(basePkg().dependencies);
  });

  test('db依存が無い状態で呼んでもエラーにならない', () => {
    expect(() => removeDbFromPackageJson(basePkg())).not.toThrow();
  });
});
