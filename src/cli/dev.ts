import { mkdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnWithDotenvx } from './dotenvxSpawn';
import { generateMainSource, scanEventFiles } from './generate';

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function runDev(cwd: string = process.cwd()): Promise<void> {
  const eventsDir = join(cwd, 'src/events');
  const mainPath = join(cwd, '.disbord/main.ts');

  mkdirSync(join(cwd, '.disbord'), { recursive: true });

  let lastEventNames = scanEventFiles(eventsDir);
  writeFileSync(mainPath, generateMainSource(lastEventNames));

  const child = spawnWithDotenvx(cwd, 'development', ['bun', '--watch', '.disbord/main.ts']);

  // src/events/ のファイル増減(=static importの行が変わるケース)だけを検知して再生成する。
  // 既存イベントファイルの中身編集やdisbord.config.ts/componentsの変更はbun --watch自身が
  // ロード済みモジュールグラフの変化として検知・再起動するため、ここでは扱わない。
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
    writeFileSync(mainPath, generateMainSource(eventNames));
    console.log('disbord: src/events/ の構成が変わったため .disbord/main.ts を再生成しました');
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    watcher.close();
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.kill(signal);
    await child.exited;
    clearTimeout(forceKill);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await child.exited;
  watcher.close();
}
