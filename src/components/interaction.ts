import {
  MessageFlags,
  type ButtonInteraction as DiscordButtonInteraction,
  type ChatInputCommandInteraction as DiscordChatInputCommandInteraction,
  type StringSelectMenuInteraction as DiscordStringSelectMenuInteraction,
} from 'discord.js';

type Repliable = { reply: (...args: never[]) => Promise<unknown> };
type Ephemeral<T extends Repliable> = T['reply'];

function withEphemeral<T extends Repliable>(interaction: T): T & { ephemeral: Ephemeral<T> } {
  const ephemeral = (async (options: unknown) => {
    const base = typeof options === 'string' ? { content: options } : ((options ?? {}) as Record<string, unknown>);
    const existingFlags = typeof base.flags === 'number' ? base.flags : 0;
    return interaction.reply({
      ...base,
      flags: existingFlags | MessageFlags.Ephemeral,
    } as never);
  }) as Ephemeral<T>;
  return Object.assign(interaction, { ephemeral });
}

export type ButtonInteraction = DiscordButtonInteraction & {
  ephemeral: Ephemeral<DiscordButtonInteraction>;
};
export type StringSelectMenuInteraction = DiscordStringSelectMenuInteraction & {
  ephemeral: Ephemeral<DiscordStringSelectMenuInteraction>;
};
export type ChatInputCommandInteraction = DiscordChatInputCommandInteraction & {
  ephemeral: Ephemeral<DiscordChatInputCommandInteraction>;
};
export type RepliableInteraction = ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction;

export function wrapButtonInteraction(interaction: DiscordButtonInteraction): ButtonInteraction {
  return withEphemeral(interaction);
}

export function wrapSelectMenuInteraction(
  interaction: DiscordStringSelectMenuInteraction,
): StringSelectMenuInteraction {
  return withEphemeral(interaction);
}

export function wrapChatInputCommandInteraction(
  interaction: DiscordChatInputCommandInteraction,
): ChatInputCommandInteraction {
  return withEphemeral(interaction);
}
