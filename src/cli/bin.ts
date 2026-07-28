#!/usr/bin/env bun
import { parseBuildArgs, runBuild } from './build';
import { parseCommandsArgs, runCommands } from './commands';
import { runDev } from './dev';
import { parseEnvArgs, runEnvToggle } from './env';
import { runGenerateEvent } from './generateEvent';
import { parseMigrateArgs, runMigrate } from './migrate';

const IMPLEMENTED_COMMANDS = [
  'dev',
  'build',
  'commands push',
  'commands delete',
  'env',
  'generate event',
  'migrate',
];

// oxlint-disable-next-line complexity
async function dispatch(): Promise<number> {
  const [command, sub, ...rest] = Bun.argv.slice(2);

  if (command === 'dev') {
    await runDev();
    return 0;
  }

  if (command === 'build') {
    const { external } = parseBuildArgs([sub, ...rest]);
    await runBuild(process.cwd(), { external });
    return 0;
  }

  if (command === 'commands') {
    const { action, envTarget } = parseCommandsArgs([sub, ...rest]);
    return runCommands(action, envTarget, process.cwd());
  }

  if (command === 'env') {
    const { envTarget } = parseEnvArgs([sub, ...rest]);
    return runEnvToggle(envTarget, process.cwd());
  }

  if (command === 'generate') {
    if (sub !== 'event' || !rest[0]) {
      throw new Error('disbord: 使い方: disbord generate event <name>');
    }
    await runGenerateEvent(rest[0], process.cwd());
    return 0;
  }

  if (command === 'migrate') {
    const { production } = parseMigrateArgs([sub, ...rest]);
    return runMigrate(production, process.cwd());
  }

  const known = ['dev', 'build', 'env', 'commands push', 'commands delete', 'generate event', 'migrate'];
  const label = command ?? '(no command)';
  throw new Error(
    `disbord: unknown or not-yet-implemented command "${label}".\n` +
      `実装済み: ${IMPLEMENTED_COMMANDS.join(', ')}\n` +
      `未実装（Phase 2で順次対応予定）: ${known.filter((c) => !IMPLEMENTED_COMMANDS.includes(c)).join(', ')}`,
  );
}

async function main() {
  try {
    process.exit(await dispatch());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
