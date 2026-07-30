import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config';
import { collectEnvKeyTypes } from './envTypes';
import { scanComponentFiles } from './generate';
import { generateDisbordDts } from './scaffold';

/**
 * `disbord enable`/`disable`/`env`/`dev`/`build`のいずれからも呼ばれる共通の再生成処理。
 * `.disbord/`ごと削除されても`disbord.config.ts`（className含む）とenv/配下だけから
 * 完全に再構築できることが前提のため、既存の`.disbord/disbord.d.ts`は一切参照しない。
 * env/配下のキー一覧は呼び出しの都度読み直す(disbord.config.tsと違いここもユーザー編集を
 * 想定しないため、db/coreClassの状態と同様に毎回最新化する)。
 */
export function regenerateDisbordDts(
  cwd: string,
  db: boolean,
  coreClass: boolean,
  coreClassName: string | undefined,
): void {
  mkdirSync(join(cwd, '.disbord'), { recursive: true });
  const envKeys = collectEnvKeyTypes(cwd);
  const { hasButtons, hasSelectMenus } = scanComponentFiles(join(cwd, 'src/components'));
  writeFileSync(
    join(cwd, '.disbord/disbord.d.ts'),
    generateDisbordDts({ db, coreClass, coreClassName, envKeys, buttons: hasButtons, selectMenus: hasSelectMenus }),
  );
}

/**
 * `disbord.config.ts`を読み込み済みで、その内容がそのまま現在の状態を表す呼び出し元
 * （`dev`/`build`/`env`）向けの薄いラッパー。`enable`/`disable`は今まさに書き換え中の
 * 状態（旧`config`にはまだ反映されていないdb/coreClassの新しい有効状態）を扱うため、
 * こちらではなく`regenerateDisbordDts`を直接使う。
 */
export function regenerateDisbordDtsFromConfig(cwd: string, config: Config): void {
  regenerateDisbordDts(cwd, Boolean(config.db?.enable), Boolean(config.coreClass?.enable), config.coreClass?.className);
}
