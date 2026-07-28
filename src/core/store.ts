import type { RepliableInteraction } from 'discord.js';
import type { InstanceLevel } from '../config';

export function resolveInstanceKey(interaction: RepliableInteraction, instanceLevel: InstanceLevel): string | null {
  switch (instanceLevel) {
    case 'guild':
      return interaction.guildId;
    case 'channel':
      return interaction.channelId;
    case 'user':
      return interaction.user.id;
    case 'global':
      return '__global__';
    case 'category': {
      const channel = interaction.channel;
      if (channel === null || !('parentId' in channel)) {
        return null;
      }
      return channel.parentId;
    }
  }
}

export type CoreStore<T> = {
  get(interaction: RepliableInteraction): T | null;
  create(interaction: RepliableInteraction, instance: T): T | null;
  remove(interaction: RepliableInteraction): void;
};

export function createCoreStore<T>(instanceLevel: InstanceLevel): CoreStore<T> {
  const instances = new Map<string, T>();
  return {
    get(interaction) {
      const key = resolveInstanceKey(interaction, instanceLevel);
      return key === null ? null : (instances.get(key) ?? null);
    },
    create(interaction, instance) {
      const key = resolveInstanceKey(interaction, instanceLevel);
      if (key === null) {
        return null;
      }
      instances.set(key, instance);
      return instance;
    },
    remove(interaction) {
      const key = resolveInstanceKey(interaction, instanceLevel);
      if (key !== null) {
        instances.delete(key);
      }
    },
  };
}
