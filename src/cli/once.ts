import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnWithDotenvx, type EnvTarget } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { scanComponentFiles } from './generate';
import { generateOnceMainSource } from './generateOnceMain';
import { readBotConfig } from './readBotConfig';
import { regenerateSchemaFile } from './schemaGen';

const RESERVED_ONCE_NAME = 'main';

export function parseOnceArgs(args: (string | undefined)[]): { production: boolean } {
  let production = false;
  for (const arg of args) {
    if (arg === '--production') {
      production = true;
      continue;
    }
    if (arg !== undefined) {
      throw new Error(`disbord: 不明な引数 "${arg}"`);
    }
  }
  return { production };
}

export async function runOnce(name: string, production: boolean, cwd: string): Promise<number> {
  if (name === RESERVED_ONCE_NAME) {
    throw new Error(
      `disbord: ${RESERVED_ONCE_NAME}は予約済みです。${RESERVED_ONCE_NAME}はdist/${RESERVED_ONCE_NAME}.js（bot本体のエントリ）と衝突するため、once配下に置けません。`,
    );
  }

  if (!existsSync(join(cwd, `src/once/${name}.ts`))) {
    throw new Error(
      `disbord: src/once/${name}.ts が見つかりません（disbord generate once ${name} で生成してください）`,
    );
  }

  mkdirSync(join(cwd, '.disbord/once'), { recursive: true });

  const config = await readBotConfig(cwd);
  const dbEnabled = Boolean(config.db?.enable);
  const coreClassName = config.coreClass?.enable ? config.coreClass.className : undefined;
  const { hasButtons, hasSelectMenus } = scanComponentFiles(join(cwd, 'src/components'));

  // `.disbord/`ごと削除されていても単体で完結できるようにする。
  regenerateDisbordDtsFromConfig(cwd, config);
  if (dbEnabled) {
    await regenerateSchemaFile(cwd);
  }

  const mainPath = join(cwd, `.disbord/once/${name}.ts`);
  writeFileSync(
    mainPath,
    generateOnceMainSource(name, { origin: 'once', dbEnabled, coreClassName, hasButtons, hasSelectMenus }),
  );

  const envTarget: EnvTarget = production ? 'production' : 'development';
  const child = spawnWithDotenvx(cwd, envTarget, ['bun', mainPath]);
  await child.exited;
  return child.exitCode ?? 1;
}
