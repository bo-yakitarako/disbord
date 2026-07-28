import { join } from 'node:path';
import { spawnWithDotenvx } from './dotenvxSpawn';

export function parseMigrateArgs(args: (string | undefined)[]): { production: boolean } {
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

const migrateRunnerPath = join(import.meta.dir, 'migrateRunner.ts');

export async function runMigrate(production: boolean, cwd: string): Promise<number> {
  const child = spawnWithDotenvx(cwd, production ? 'production' : 'development', [
    'bun',
    migrateRunnerPath,
    ...(production ? ['--production'] : []),
  ]);
  await child.exited;
  return child.exitCode ?? 1;
}
