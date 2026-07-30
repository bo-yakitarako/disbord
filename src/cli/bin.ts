#!/usr/bin/env bun
import { parseBuildArgs, runBuild } from './build';
import { parseCommandsArgs, runCommands } from './commands';
import { runDev } from './dev';
import { parseDisableArgs, runDisable } from './disable';
import { parseEnableArgs, runEnable } from './enable';
import { parseEnvArgs, runEnvAction, runEnvActionAll, runEnvToggle, runEnvToggleAll } from './env';
import { runGenerateEvent } from './generateEvent';
import { runGenerateModel } from './generateModel';
import { runGenerateOnce } from './generateOnce';
import { buildHelpText } from './help';
import { parseMigrateArgs, runMigrate } from './migrate';
import { parseOnceArgs, runOnce } from './once';
import { readBotConfig } from './readBotConfig';
import { runStudio } from './studio';
import { getDisbordVersion } from './version';

async function resolveDbEnabled(cwd: string): Promise<boolean> {
  try {
    const config = await readBotConfig(cwd);
    return Boolean(config.db?.enable);
  } catch {
    return false;
  }
}

const IMPLEMENTED_COMMANDS = [
  'dev',
  'build',
  'commands push',
  'commands delete',
  'env',
  'env encrypt',
  'env decrypt',
  'generate event',
  'generate model',
  'generate once',
  'once',
  'migrate',
  'studio',
  'enable',
  'disable',
];

// oxlint-disable-next-line complexity
async function dispatch(): Promise<number> {
  const [command, sub, ...rest] = Bun.argv.slice(2);

  if (command === '--version' || command === '-v') {
    console.log(getDisbordVersion());
    return 0;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    const dbEnabled = await resolveDbEnabled(process.cwd());
    console.log(buildHelpText({ dbEnabled }));
    return 0;
  }

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
    if (sub === 'encrypt' || sub === 'decrypt') {
      const { envTarget, all } = parseEnvArgs(rest);
      return all ? runEnvActionAll(sub, process.cwd()) : runEnvAction(sub, envTarget, process.cwd());
    }
    const { envTarget, all } = parseEnvArgs([sub, ...rest]);
    return all ? runEnvToggleAll(process.cwd()) : runEnvToggle(envTarget, process.cwd());
  }

  if (command === 'generate') {
    if (sub === 'event' && rest[0]) {
      await runGenerateEvent(rest[0], process.cwd());
      return 0;
    }
    if (sub === 'model' && rest[0]) {
      await runGenerateModel(rest[0], process.cwd());
      return 0;
    }
    if (sub === 'once' && rest[0]) {
      await runGenerateOnce(rest[0], process.cwd());
      return 0;
    }
    throw new Error(
      'disbord: 使い方: disbord generate event <name> | disbord generate model <Name> | disbord generate once <name>',
    );
  }

  if (command === 'once') {
    if (!sub) {
      throw new Error('disbord: 使い方: disbord once <name> [--production]');
    }
    const { production } = parseOnceArgs(rest);
    return runOnce(sub, production, process.cwd());
  }

  if (command === 'migrate') {
    const { production } = parseMigrateArgs([sub, ...rest]);
    return runMigrate(production, process.cwd());
  }

  if (command === 'studio') {
    return runStudio(process.cwd());
  }

  if (command === 'enable') {
    const args = parseEnableArgs([sub, ...rest]);
    await runEnable(process.cwd(), args);
    return 0;
  }

  if (command === 'disable') {
    const args = parseDisableArgs([sub, ...rest]);
    await runDisable(process.cwd(), args);
    return 0;
  }

  const known = [
    'dev',
    'build',
    'env',
    'env encrypt',
    'env decrypt',
    'commands push',
    'commands delete',
    'generate event',
    'generate model',
    'generate once',
    'once',
    'migrate',
    'studio',
    'enable',
    'disable',
  ];
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
