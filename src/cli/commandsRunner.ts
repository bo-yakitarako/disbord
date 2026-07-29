import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST } from 'discord.js';
import { buildCommandsBody, buildCommandsRoute, type CommandsAction } from './commands';

async function main() {
  const [action] = process.argv.slice(2) as [CommandsAction];
  const cwd = process.cwd();

  const config = (await import(pathToFileURL(resolve(cwd, 'disbord.config.ts')).href)).default;
  const slashCommands = (await import(pathToFileURL(resolve(cwd, 'src/components/slashCommands.ts')).href)).default;

  const TOKEN = config.token ?? process.env.TOKEN;
  const CLIENT_ID = config.clientId ?? process.env.CLIENT_ID;
  const GUILD_ID = config.guildId ?? process.env.GUILD_ID;

  const body = buildCommandsBody(action, slashCommands);
  const rest = new REST().setToken(TOKEN!);
  await rest.put(buildCommandsRoute(CLIENT_ID!, GUILD_ID), { body });

  console.log(
    action === 'delete'
      ? 'disbord: 登録済みslashCommandを削除しました'
      : `disbord: slashCommandを${body.length}件登録しました${GUILD_ID ? `（guild: ${GUILD_ID}）` : ''}`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
