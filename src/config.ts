import type { ClientOptions } from 'discord.js';
import type { BotErrorMessage } from './BotError';

export type InstanceLevel = 'guild' | 'category' | 'channel' | 'user' | 'global';

export type Config = {
  token?: string;
  clientId?: string;
  intents: ClientOptions['intents'];
  coreClass?: {
    enable: true;
    nullMessage: string;
    instanceLevel?: InstanceLevel;
  };
  db?: {
    enable: true;
    tursoDatabaseUrl?: string;
    tursoAuthToken?: string;
  };
  botErrorMessage: BotErrorMessage;
};
