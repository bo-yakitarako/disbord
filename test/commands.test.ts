import { describe, expect, test } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { buildCommandsBody, parseCommandsArgs } from '../src/cli/commands';
import { collectSlashCommandsData, routeSlashCommandInteraction } from '../src/components/slashCommands';
import type { SlashCommandRegistration } from '../src/components/types';

const sampleRegistration: SlashCommandRegistration = {
  ping: {
    description: 'pong',
    async execute(interaction) {
      await interaction.reply('pong');
    },
  },
  short: async (interaction) => {
    await interaction.reply('short pong');
  },
};

describe('parseCommandsArgs', () => {
  test('pushのみ指定時はdevelopmentにfallbackする', () => {
    expect(parseCommandsArgs(['push'])).toEqual({ action: 'push', envTarget: 'development' });
  });

  test('--envでenvTargetを明示できる', () => {
    expect(parseCommandsArgs(['delete', '--env', 'production'])).toEqual({
      action: 'delete',
      envTarget: 'production',
    });
  });

  test('push/delete以外のactionはthrow', () => {
    expect(() => parseCommandsArgs(['foo'])).toThrow();
    expect(() => parseCommandsArgs([undefined])).toThrow();
  });

  test('development/production以外の--env値はthrow', () => {
    expect(() => parseCommandsArgs(['push', '--env', 'staging'])).toThrow();
    expect(() => parseCommandsArgs(['push', '--env'])).toThrow();
  });

  test('未知の余分な引数はthrow', () => {
    expect(() => parseCommandsArgs(['push', '--guild', '123'])).toThrow();
  });
});

describe('buildCommandsBody', () => {
  test('deleteは常に空配列', () => {
    expect(buildCommandsBody('delete', sampleRegistration)).toEqual([]);
  });

  test('pushはcollectSlashCommandsDataの結果と一致する', () => {
    expect(buildCommandsBody('push', sampleRegistration)).toEqual(collectSlashCommandsData(sampleRegistration));
  });
});

describe('collectSlashCommandsData', () => {
  test('execute関数を直接指定した場合はキー名がdescriptionになりoptionsは付かない', () => {
    const data = collectSlashCommandsData(sampleRegistration);
    expect(data.find((c) => c.name === 'short')).toMatchObject({
      name: 'short',
      description: 'short',
      options: [],
    });
  });
});

describe('routeSlashCommandInteraction', () => {
  function fakeInteraction(commandName: string, reply: (content: unknown) => Promise<void>) {
    return { commandName, reply } as unknown as ChatInputCommandInteraction;
  }

  test('オブジェクト形のexecuteが呼ばれる', async () => {
    const replies: unknown[] = [];
    const interaction = fakeInteraction('ping', async (content) => {
      replies.push(content);
    });
    await routeSlashCommandInteraction(interaction, sampleRegistration);
    expect(replies).toEqual(['pong']);
  });

  test('関数直接指定形のexecuteが呼ばれる', async () => {
    const replies: unknown[] = [];
    const interaction = fakeInteraction('short', async (content) => {
      replies.push(content);
    });
    await routeSlashCommandInteraction(interaction, sampleRegistration);
    expect(replies).toEqual(['short pong']);
  });

  test('未知のcommandNameはthrow', () => {
    const interaction = fakeInteraction('unknown', async () => {});
    expect(routeSlashCommandInteraction(interaction, sampleRegistration)).rejects.toThrow();
  });
});
