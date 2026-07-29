import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config';
import { buildCoreClassConfigBlock, buildDbConfigBlock, insertConfigBlock } from './configPatch';
import { extractCoreClassNameFromDts, regenerateDisbordDts } from './dtsRegen';
import { addDbToPackageJson, readPackageJson, writePackageJson } from './packageJsonPatch';
import { CORE_CLASS_NAME_PATTERN, promptCoreClassName } from './prompt';
import { readBotConfig } from './readBotConfig';
import { DEFAULT_CORE_CLASS_NAME, generateCoreStub } from './scaffold';

export type EnableArgs = { target: 'db' } | { target: 'core-class'; name: string | undefined };

/**
 * `disbord enable db` / `disbord enable core-class [ClassName]`の引数解析。
 * db/core-classは同時に指定できず、1回の呼び出しにつき1つだけ有効化する
 * (両方有効化したい場合は`disbord enable db`→`disbord enable core-class`のように2回実行する)。
 */
export function parseEnableArgs(args: (string | undefined)[]): EnableArgs {
  const [target, name, ...rest] = args;

  if (target === undefined) {
    throw new Error('disbord: 使い方: disbord enable db | disbord enable core-class [ClassName]');
  }
  const extraArg = rest.find((arg) => arg !== undefined);
  if (extraArg !== undefined) {
    throw new Error(`disbord: 不明な引数 "${extraArg}"`);
  }

  if (target === 'db') {
    if (name !== undefined) {
      throw new Error(`disbord: 不明な引数 "${name}"`);
    }
    return { target: 'db' };
  }

  if (target === 'core-class') {
    if (name !== undefined && !CORE_CLASS_NAME_PATTERN.test(name)) {
      throw new Error(`disbord: Coreクラスの名前が不正です（"${name}"）。クラス名として使える文字列を指定してください`);
    }
    return { target: 'core-class', name };
  }

  throw new Error(`disbord: 不明な引数 "${target}"（dbかcore-classを指定してください）`);
}

async function enableDb(cwd: string, config: Config): Promise<void> {
  if (config.db?.enable) {
    throw new Error('disbord: dbは既に有効です');
  }

  const configPath = join(cwd, 'disbord.config.ts');
  writeFileSync(configPath, insertConfigBlock(readFileSync(configPath, 'utf-8'), buildDbConfigBlock()));
  writePackageJson(cwd, addDbToPackageJson(readPackageJson(cwd)));

  const coreClassEnabled = Boolean(config.coreClass?.enable);
  const dtsPath = join(cwd, '.disbord/disbord.d.ts');
  const existingDts = existsSync(dtsPath) ? readFileSync(dtsPath, 'utf-8') : '';
  regenerateDisbordDts(
    cwd,
    true,
    coreClassEnabled,
    coreClassEnabled ? extractCoreClassNameFromDts(existingDts) : undefined,
  );

  console.log('disbord: db を有効化しました');
}

async function enableCoreClass(cwd: string, config: Config, name: string | undefined): Promise<void> {
  if (config.coreClass?.enable) {
    throw new Error('disbord: coreClassは既に有効です');
  }

  const coreClassName = name ?? promptCoreClassName(DEFAULT_CORE_CLASS_NAME);

  const configPath = join(cwd, 'disbord.config.ts');
  writeFileSync(configPath, insertConfigBlock(readFileSync(configPath, 'utf-8'), buildCoreClassConfigBlock()));
  writeFileSync(join(cwd, `src/${coreClassName}.ts`), generateCoreStub(coreClassName));
  regenerateDisbordDts(cwd, Boolean(config.db?.enable), true, coreClassName);

  console.log('disbord: coreClass を有効化しました');
}

export async function runEnable(cwd: string, args: EnableArgs): Promise<void> {
  const config = await readBotConfig(cwd);
  if (args.target === 'db') {
    await enableDb(cwd, config);
  } else {
    await enableCoreClass(cwd, config, args.name);
  }
}
