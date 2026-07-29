import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config';
import { removeConfigBlock } from './configPatch';
import { applyCoreParamRewrite } from './coreParamCodemod';
import { regenerateDisbordDts } from './dtsRegen';
import { readPackageJson, removeDbFromPackageJson, writePackageJson } from './packageJsonPatch';
import { promptYesNo } from './prompt';
import { readBotConfig } from './readBotConfig';

export type DisableArgs = { target: 'db' } | { target: 'core-class' };

export function confirmMessage(target: DisableArgs['target']): string {
  return target === 'db'
    ? 'migrationやdb以下のファイル群は消去されます。よろしいですか？'
    : 'Coreクラスは消去されます。よろしいですか？';
}

/**
 * `disbord disable db` / `disbord disable core-class`の引数解析。
 * enableと同様、1回の呼び出しにつき1つだけ無効化する。
 */
export function parseDisableArgs(args: (string | undefined)[]): DisableArgs {
  const [target, ...rest] = args;

  if (target === undefined) {
    throw new Error('disbord: 使い方: disbord disable db | disbord disable core-class');
  }
  const extraArg = rest.find((arg) => arg !== undefined);
  if (extraArg !== undefined) {
    throw new Error(`disbord: 不明な引数 "${extraArg}"`);
  }
  if (target !== 'db' && target !== 'core-class') {
    throw new Error(`disbord: 不明な引数 "${target}"（dbかcore-classを指定してください）`);
  }

  return { target };
}

function disableDb(cwd: string, config: Config): void {
  const configPath = join(cwd, 'disbord.config.ts');
  writeFileSync(configPath, removeConfigBlock(readFileSync(configPath, 'utf-8'), 'db'));
  writePackageJson(cwd, removeDbFromPackageJson(readPackageJson(cwd)));

  rmSync(join(cwd, 'src/db/models'), { recursive: true, force: true });
  rmSync(join(cwd, 'src/db/schema.ts'), { force: true });
  rmSync(join(cwd, 'migrations'), { recursive: true, force: true });
  rmSync(join(cwd, '.disbord/dev.db'), { force: true });

  regenerateDisbordDts(cwd, false, Boolean(config.coreClass?.enable), config.coreClass?.className);

  console.log('disbord: db を無効化しました');
}

function disableCoreClass(cwd: string, config: Config): void {
  const coreClassName = config.coreClass?.className;

  const configPath = join(cwd, 'disbord.config.ts');
  writeFileSync(configPath, removeConfigBlock(readFileSync(configPath, 'utf-8'), 'coreClass'));

  if (coreClassName !== undefined) {
    rmSync(join(cwd, `src/${coreClassName}.ts`), { force: true });
  }

  regenerateDisbordDts(cwd, Boolean(config.db?.enable), false, undefined);

  // 有効化時に挿入したcore引数を除去し、既存button/selectMenuのexecuteの引数ズレを防ぐ。
  applyCoreParamRewrite(cwd, { mode: 'remove' });

  console.log('disbord: coreClass を無効化しました');
}

/**
 * `confirm`はテスト用の差し込み口(既定は実際のプロンプト)。falseを返した場合は
 * 何も削除・変更せずキャンセルする。
 */
export async function runDisable(
  cwd: string,
  args: DisableArgs,
  confirm: () => boolean = () => promptYesNo(confirmMessage(args.target)),
): Promise<void> {
  const config = await readBotConfig(cwd);

  if (args.target === 'db' && !config.db?.enable) {
    throw new Error('disbord: dbは有効になっていません');
  }
  if (args.target === 'core-class' && !config.coreClass?.enable) {
    throw new Error('disbord: coreClassは有効になっていません');
  }

  if (!confirm()) {
    console.log('disbord: キャンセルしました');
    return;
  }

  if (args.target === 'db') {
    disableDb(cwd, config);
  } else {
    disableCoreClass(cwd, config);
  }
}
