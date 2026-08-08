import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addTimerEntry } from './configPatch';
import { formatGeneratedFile } from './formatGenerated';
import { hasSshDeployWorkflow } from './generateWorkflow';

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

  // SSH+systemdデプロイ(`disbord generate workflow ssh`)を使っていない状態でtimerを登録しても
  // 参照先のsystemd timerユニットが無く意味を持たないため、`.github/workflows/deploy.yaml`が
  // SSHデプロイ用として既に存在する場合のみデフォルト値を登録する。それ以外のケースではtimerを
  // 明示的に設定するまでdeploy.yamlのデプロイ対象に含めない(手動実行専用として扱う)。
  if (hasSshDeployWorkflow(cwd)) {
    const configPath = join(cwd, 'disbord.config.ts');
    writeFileSync(configPath, addTimerEntry(readFileSync(configPath, 'utf-8'), name));
    console.log(`disbord: src/once/${name}.ts を生成し、disbord.config.tsのtimerに${name}を追加しました`);
  } else {
    console.log(`disbord: src/once/${name}.ts を生成しました`);
  }
}
