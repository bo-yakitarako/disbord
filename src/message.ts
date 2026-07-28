import type { Message as DiscordMessage, OmitPartialGroupDMChannel } from 'discord.js';

/**
 * discord.jsの`messageCreate`イベントが実際に渡す型のエイリアス
 * (`ClientEvents['messageCreate']`は`[message: OmitPartialGroupDMChannel<Message>]`)。
 * `disbord generate event messageCreate`が生成する`src/events/messageCreate.ts`は
 * `import type { Message } from 'disbord'`でこれを使う。
 */
export type Message = OmitPartialGroupDMChannel<DiscordMessage>;
