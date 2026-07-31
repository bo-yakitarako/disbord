import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addTimerEntry } from './configPatch';
import { formatGeneratedFile } from './formatGenerated';

const RESERVED_ONCE_NAME = 'main';

export function generateOnceFileContent(): string {
  return `import type { Client } from 'discord.js';

export default async function (client: Client<true>) {
  //
}
`;
}

export async function runGenerateOnce(name: string, cwd: string): Promise<void> {
  if (name === RESERVED_ONCE_NAME) {
    throw new Error(
      `disbord: ${RESERVED_ONCE_NAME}は予約済みです。${RESERVED_ONCE_NAME}はdist/${RESERVED_ONCE_NAME}.js（bot本体のエントリ）と衝突するため、once配下に生成できません。`,
    );
  }

  const targetPath = join(cwd, `src/once/${name}.ts`);
  if (existsSync(targetPath)) {
    throw new Error(`disbord: src/once/${name}.ts は既に存在します（上書きしません）`);
  }

  mkdirSync(join(cwd, 'src/once'), { recursive: true });
  writeFileSync(targetPath, generateOnceFileContent());
  await formatGeneratedFile(cwd, targetPath);

  // `disbord generate workflow ssh`がtimer付きonceスクリプトのsystemd timerユニットを
  // 生成する際の実行スケジュール値として参照するため、生成と同時にデフォルト値を登録しておく。
  const configPath = join(cwd, 'disbord.config.ts');
  writeFileSync(configPath, addTimerEntry(readFileSync(configPath, 'utf-8'), name));

  console.log(`disbord: src/once/${name}.ts を生成し、disbord.config.tsのtimerに${name}を追加しました`);
}
