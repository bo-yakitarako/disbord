import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction as DiscordChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { wrapChatInputCommandInteraction } from './interaction';
import type { SlashCommandOption, SlashCommandRegistration } from './types';

function addOption(builder: SlashCommandBuilder, option: SlashCommandOption) {
  const description = option.description ?? option.name;
  const required = option.required ?? false;
  if (option.type === 'string') {
    builder.addStringOption((o) => o.setName(option.name).setDescription(description).setRequired(required));
    return;
  }
  if (option.type === 'number') {
    builder.addNumberOption((o) => o.setName(option.name).setDescription(description).setRequired(required));
    return;
  }
  builder.addBooleanOption((o) => o.setName(option.name).setDescription(description).setRequired(required));
}

function buildSlashCommandData(key: string, def: SlashCommandRegistration[string]) {
  if (typeof def === 'function') {
    return new SlashCommandBuilder().setName(key).setDescription(key);
  }
  const builder = new SlashCommandBuilder().setName(key).setDescription(def.description ?? key);
  for (const option of def.options ?? []) {
    addOption(builder, option);
  }
  return builder;
}

export function collectSlashCommandsData(
  registration: SlashCommandRegistration,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return Object.entries(registration).map(([key, def]) => buildSlashCommandData(key, def).toJSON());
}

export async function routeSlashCommandInteraction(
  interaction: DiscordChatInputCommandInteraction,
  registration: SlashCommandRegistration,
): Promise<void> {
  const wrapped = wrapChatInputCommandInteraction(interaction);
  const entry = registration[interaction.commandName];
  if (!entry) {
    throw new Error(`disbord: unknown slash command "${interaction.commandName}"`);
  }
  const execute = typeof entry === 'function' ? entry : entry.execute;
  await execute(wrapped);
}
