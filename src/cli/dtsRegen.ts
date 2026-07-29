import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectEnvKeyTypes } from './envTypes';
import { generateDisbordDts } from './scaffold';

/**
 * disbord.d.tsは`disbord.config.ts`と違い都度丸ごと再生成する運用のため、既存のcore importから
 * クラス名を逆算する必要がある(dbだけをenable/disableする際も、既にcoreClassが有効ならクラス名を
 * 保ったまま再生成しなければならない)。
 */
export function extractCoreClassNameFromDts(source: string): string | undefined {
  const match = source.match(/^import type \{ (\w+) \} from '@\/\1';$/m);
  return match?.[1];
}

/**
 * `disbord enable`/`disable`/`env`のいずれからも呼ばれる共通の再生成処理。
 * env/配下のキー一覧は呼び出しの都度読み直す(disbord.config.tsと違いここも
 * ユーザー編集を想定しないため、db/coreClassの状態と同様に毎回最新化する)。
 */
export function regenerateDisbordDts(
  cwd: string,
  db: boolean,
  coreClass: boolean,
  coreClassName: string | undefined,
): void {
  mkdirSync(join(cwd, '.disbord'), { recursive: true });
  const envKeys = collectEnvKeyTypes(cwd);
  writeFileSync(join(cwd, '.disbord/disbord.d.ts'), generateDisbordDts({ db, coreClass, coreClassName, envKeys }));
}
