#!/usr/bin/env bun
import { parseBuildArgs, runBuild } from './build';
import { parseCommandsArgs, runCommands } from './commands';
import { runDev } from './dev';
import { parseEnvArgs, runEnvToggle } from './env';
import { runGenerateEvent } from './generateEvent';

const IMPLEMENTED_COMMANDS = ['dev', 'build', 'commands push', 'commands delete', 'env', 'generate event'];

// oxlint-disable-next-line complexity
async function main() {
  const [command, sub, ...rest] = Bun.argv.slice(2);

  if (command === 'dev') {
    await runDev();
    return;
  }

  if (command === 'build') {
    let external: ReturnType<typeof parseBuildArgs>['external'];
    try {
      ({ external } = parseBuildArgs([sub, ...rest]));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await runBuild(process.cwd(), { external });
    return;
  }

  if (command === 'commands') {
    let action: ReturnType<typeof parseCommandsArgs>['action'];
    let envTarget: ReturnType<typeof parseCommandsArgs>['envTarget'];
    try {
      ({ action, envTarget } = parseCommandsArgs([sub, ...rest]));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    const exitCode = await runCommands(action, envTarget, process.cwd());
    process.exit(exitCode);
  }

  if (command === 'env') {
    let envTarget: ReturnType<typeof parseEnvArgs>['envTarget'];
    try {
      ({ envTarget } = parseEnvArgs([sub, ...rest]));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    const exitCode = await runEnvToggle(envTarget, process.cwd());
    process.exit(exitCode);
  }

  if (command === 'generate') {
    if (sub !== 'event' || !rest[0]) {
      console.error('disbord: 使い方: disbord generate event <name>');
      process.exit(1);
    }
    await runGenerateEvent(rest[0], process.cwd());
    return;
  }

  const known = ['dev', 'build', 'env', 'commands push', 'commands delete', 'generate event'];
  const label = command ?? '(no command)';
  console.error(
    `disbord: unknown or not-yet-implemented command "${label}".\n` +
      `実装済み: ${IMPLEMENTED_COMMANDS.join(', ')}\n` +
      `未実装（Phase 2で順次対応予定）: ${known.filter((c) => !IMPLEMENTED_COMMANDS.includes(c)).join(', ')}`,
  );
  process.exit(1);
}

void main();
