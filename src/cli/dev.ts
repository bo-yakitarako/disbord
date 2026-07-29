import { mkdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommands } from './commands';
import { spawnWithDotenvx } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { generateMainSource, scanEventFiles } from './generate';
import { runMigrate } from './migrate';
import { readBotConfig } from './readBotConfig';
import { spawnStudioProcess } from './studio';

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function runStartupStep(label: string, run: () => Promise<number>): Promise<void> {
  const exitCode = await run();
  if (exitCode !== 0) {
    throw new Error(`disbord: ${label}に失敗しました（終了コード ${exitCode}）`);
  }
}

/**
 * migrate/commands pushと違い、studioは開発の便宜のためのおまけなので失敗しても`disbord dev`自体は
 * 継続する(runStartupStepのようにthrowしない)。ここで失敗を握りつぶして警告ログのみ出す。
 */
function trySpawnStudio(cwd: string): ReturnType<typeof spawnStudioProcess> | undefined {
  try {
    return spawnStudioProcess(cwd);
  } catch (error) {
    console.error(`disbord: studioの起動に失敗しました（${error instanceof Error ? error.message : error}）`);
    return undefined;
  }
}

export async function runDev(cwd: string = process.cwd()): Promise<void> {
  const eventsDir = join(cwd, 'src/events');
  const mainPath = join(cwd, '.disbord/main.ts');

  mkdirSync(join(cwd, '.disbord'), { recursive: true });

  const config = await readBotConfig(cwd);
  const dbEnabled = Boolean(config.db?.enable);
  const coreClassName = config.coreClass?.enable ? config.coreClass.className : undefined;

  // `.disbord/`ごと削除されていても`disbord.config.ts`/env/配下だけからdisbord.d.tsを
  // 完全に再構築できるようにする(`disbord enable`/`disable`/`env`を手動実行しなくても
  // 開発を始められるようにするため)。
  regenerateDisbordDtsFromConfig(cwd, config);

  await runStartupStep('slashCommandの登録(commands push)', () => runCommands('push', 'development', cwd));
  if (dbEnabled) {
    await runStartupStep('migrate', () => runMigrate(false, cwd));
  }

  let lastEventNames = scanEventFiles(eventsDir);
  writeFileSync(mainPath, generateMainSource(lastEventNames, { origin: 'dev', dbEnabled, coreClassName }));

  const child = spawnWithDotenvx(cwd, 'development', ['bun', '--watch', '.disbord/main.ts']);
  const studioChild = dbEnabled ? trySpawnStudio(cwd) : undefined;

  const watcher = watch(eventsDir, () => {
    let eventNames: string[];
    try {
      eventNames = scanEventFiles(eventsDir);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return;
    }
    if (arraysEqual(eventNames, lastEventNames)) return;
    lastEventNames = eventNames;
    writeFileSync(mainPath, generateMainSource(eventNames, { origin: 'dev', dbEnabled, coreClassName }));
    console.log('disbord: src/events/ の構成が変わったため .disbord/main.ts を再生成しました');
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    watcher.close();
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 3000);
    const forceKillStudio = studioChild ? setTimeout(() => studioChild.kill('SIGKILL'), 3000) : undefined;
    child.kill(signal);
    studioChild?.kill(signal);
    await Promise.all([child.exited, studioChild?.exited]);
    clearTimeout(forceKill);
    if (forceKillStudio) clearTimeout(forceKillStudio);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await child.exited;
  watcher.close();
  studioChild?.kill();
}
