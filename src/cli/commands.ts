import { join } from 'node:path';
import { Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { collectSlashCommandsData } from '../components/slashCommands';
import type { SlashCommandRegistration } from '../components/types';
import { spawnWithDotenvx, type EnvTarget } from './dotenvxSpawn';

export type CommandsAction = 'push' | 'delete';

/**
 * 対象はdevelopment/productionの二択のみのため、`disbord migrate`/`disbord env`と同じ流儀で
 * `--env development|production`ではなく`--production`(省略時development)の形にしている。
 */
export function parseCommandsArgs(args: (string | undefined)[]): { action: CommandsAction; envTarget: EnvTarget } {
  const [action, ...rest] = args;
  if (action !== 'push' && action !== 'delete') {
    throw new Error(`disbord: "commands"の後には"push"か"delete"を指定してください（指定値: ${action ?? '(なし)'}）`);
  }

  let envTarget: EnvTarget = 'development';
  for (const arg of rest) {
    if (arg === '--production') {
      envTarget = 'production';
      continue;
    }
    if (arg !== undefined) {
      throw new Error(`disbord: 不明な引数 "${arg}"`);
    }
  }

  return { action, envTarget };
}

export function buildCommandsBody(
  action: CommandsAction,
  registration: SlashCommandRegistration,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return action === 'delete' ? [] : collectSlashCommandsData(registration);
}

/**
 * `GUILD_ID`が解決できた場合はguild単位(反映が即時。開発向き)、なければglobal
 * (反映まで最大1時間。従来通りの挙動)で登録する。
 */
export function buildCommandsRoute(clientId: string, guildId: string | undefined) {
  return guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
}

const commandsRunnerPath = join(import.meta.dir, 'commandsRunner.ts');

export async function runCommands(action: CommandsAction, envTarget: EnvTarget, cwd: string): Promise<number> {
  const child = spawnWithDotenvx(cwd, envTarget, ['bun', commandsRunnerPath, action]);
  await child.exited;
  return child.exitCode ?? 1;
}
