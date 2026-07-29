import type { ClientOptions } from 'discord.js';
import type { BotErrorMessage } from './BotError';

export type InstanceLevel = 'guild' | 'category' | 'channel' | 'user' | 'global';

export type Config = {
  token?: string;
  clientId?: string;
  guildId?: string;
  intents: ClientOptions['intents'];
  coreClass?: {
    enable: true;
    className: string;
    nullMessage: string;
    instanceInvalidMessage: string;
    instanceLevel?: InstanceLevel;
  };
  db?: {
    enable: true;
    tursoDatabaseUrl?: string;
    tursoAuthToken?: string;
  };
  botErrorMessage: BotErrorMessage;
  argsSplitter?: string;
};
