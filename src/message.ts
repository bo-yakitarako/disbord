import type { Message as DiscordMessage, OmitPartialGroupDMChannel } from 'discord.js';

export type Message = OmitPartialGroupDMChannel<DiscordMessage>;
