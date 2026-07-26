import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { buildCommandsBody, type CommandsAction } from './commands';

async function main() {
  const [action] = process.argv.slice(2) as [CommandsAction];
  const cwd = process.cwd();

  const config = (await import(pathToFileURL(resolve(cwd, 'disbord.config.ts')).href)).default;
  const slashCommands = (await import(pathToFileURL(resolve(cwd, 'src/components/slashCommands.ts')).href)).default;

  const TOKEN = process.env[config.token ?? 'TOKEN'];
  const CLIENT_ID = process.env[config.clientId ?? 'CLIENT_ID'];

  const body = buildCommandsBody(action, slashCommands);
  const rest = new REST().setToken(TOKEN!);
  await rest.put(Routes.applicationCommands(CLIENT_ID!), { body });

  console.log(
    action === 'delete'
      ? 'disbord: 登録済みslashCommandを削除しました'
      : `disbord: slashCommandを${body.length}件登録しました`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
