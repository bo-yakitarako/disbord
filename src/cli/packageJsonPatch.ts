import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB_DEPENDENCIES, DB_MIGRATE_SCRIPT } from './scaffold';

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
 * migrateスクリプトはhelpの直前(生成テンプレの並び順)に挿入する。
 * DB_DEPENDENCIESはdisbord/scaffoldの依存表を参照する(base package.json生成側と実体を共有)。
 */
export function addDbToPackageJson(pkg: PackageJsonLike): PackageJsonLike {
  const { help, ...restScripts } = pkg.scripts ?? {};
  const scripts =
    help !== undefined
      ? { ...restScripts, [DB_MIGRATE_SCRIPT.name]: DB_MIGRATE_SCRIPT.command, help }
      : { ...restScripts, [DB_MIGRATE_SCRIPT.name]: DB_MIGRATE_SCRIPT.command };

  return {
    ...pkg,
    scripts,
    dependencies: { ...pkg.dependencies, ...DB_DEPENDENCIES },
  };
}

export function removeDbFromPackageJson(pkg: PackageJsonLike): PackageJsonLike {
  const scripts = { ...pkg.scripts };
  delete scripts[DB_MIGRATE_SCRIPT.name];

  const dependencies = { ...pkg.dependencies };
  for (const name of Object.keys(DB_DEPENDENCIES)) {
    delete dependencies[name];
  }

  return { ...pkg, scripts, dependencies };
}
