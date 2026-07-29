import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB_DEPENDENCIES, DB_GEN_MODEL_SCRIPT, DB_MIGRATE_SCRIPT } from './scaffold';

export type PackageJsonLike = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};

export function readPackageJson(cwd: string): PackageJsonLike {
  return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as PackageJsonLike;
}

export function writePackageJson(cwd: string, pkg: PackageJsonLike): void {
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * gen:model/migrateスクリプトはhelpの直前(生成テンプレの並び順)に、この順で挿入する。
 * どちらもdb.enable前提のコマンド(`disbord generate model`/`disbord migrate`自体もdb.enableが
 * 無効ならエラーで落とす。generateModel.ts/migrateRunner.ts参照)のため、scripts自体もdb有効時のみ持つ。
 * DB_DEPENDENCIESはdisbord/scaffoldの依存表を参照する(base package.json生成側と実体を共有)。
 */
export function addDbToPackageJson(pkg: PackageJsonLike): PackageJsonLike {
  const { help, ...restScripts } = pkg.scripts ?? {};
  const dbScripts = {
    [DB_GEN_MODEL_SCRIPT.name]: DB_GEN_MODEL_SCRIPT.command,
    [DB_MIGRATE_SCRIPT.name]: DB_MIGRATE_SCRIPT.command,
  };
  const scripts = help !== undefined ? { ...restScripts, ...dbScripts, help } : { ...restScripts, ...dbScripts };

  return {
    ...pkg,
    scripts,
    dependencies: { ...pkg.dependencies, ...DB_DEPENDENCIES },
  };
}

export function removeDbFromPackageJson(pkg: PackageJsonLike): PackageJsonLike {
  const scripts = { ...pkg.scripts };
  delete scripts[DB_GEN_MODEL_SCRIPT.name];
  delete scripts[DB_MIGRATE_SCRIPT.name];

  const dependencies = { ...pkg.dependencies };
  for (const name of Object.keys(DB_DEPENDENCIES)) {
    delete dependencies[name];
  }

  return { ...pkg, scripts, dependencies };
}
