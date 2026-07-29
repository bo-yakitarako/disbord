import { MessageFlags, type RepliableInteraction } from 'discord.js';

export class BotError extends Error {}

export type BotErrorMessage = string | ((error: Error) => string);

export async function handleBotError(
  error: unknown,
  interaction: RepliableInteraction,
  botErrorMessage: BotErrorMessage,
) {
  if (!(error instanceof BotError)) {
    throw error;
  }
  const content = error.message || (typeof botErrorMessage === 'function' ? botErrorMessage(error) : botErrorMessage);
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
