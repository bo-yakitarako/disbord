import { join } from 'node:path';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { collectSlashCommandsData } from '../components/slashCommands';
import type { SlashCommandRegistration } from '../components/types';
import { spawnWithDotenvx, type EnvTarget } from './dotenvxSpawn';

export type CommandsAction = 'push' | 'delete';

/**
 * `disbord commands push|delete [--env development|production]` の引数解析。
 * 実際のDiscord REST APIを書き換える操作のため、不正な指定は何もspawnせずここでthrowする。
 */
export function parseCommandsArgs(args: (string | undefined)[]): { action: CommandsAction; envTarget: EnvTarget } {
  const [action, ...rest] = args;
  if (action !== 'push' && action !== 'delete') {
    throw new Error(`disbord: "commands"の後には"push"か"delete"を指定してください（指定値: ${action ?? '(なし)'}）`);
  }

  let envTarget: EnvTarget = 'development';
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--env') {
      const value = rest[i + 1];
      if (value !== 'development' && value !== 'production') {
        throw new Error(`disbord: --envは"development"か"production"を指定してください（指定値: ${value ?? '(なし)'}）`);
      }
      envTarget = value;
      i++;
      continue;
    }
    throw new Error(`disbord: 不明な引数 "${rest[i]}"`);
  }

  return { action, envTarget };
}

export function buildCommandsBody(
  action: CommandsAction,
  registration: SlashCommandRegistration,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return action === 'delete' ? [] : collectSlashCommandsData(registration);
}

const commandsRunnerPath = join(import.meta.dir, 'commandsRunner.ts');

export async function runCommands(action: CommandsAction, envTarget: EnvTarget, cwd: string): Promise<number> {
  const child = spawnWithDotenvx(cwd, envTarget, ['bun', commandsRunnerPath, action]);
  await child.exited;
  return child.exitCode ?? 1;
}
