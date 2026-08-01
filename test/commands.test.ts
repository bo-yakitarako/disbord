import { describe, expect, test } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Routes } from 'discord.js';
import { buildCommandsBody, buildCommandsRoute, parseCommandsArgs } from '../src/cli/commands';
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

  test('--productionでenvTargetを明示できる', () => {
    expect(parseCommandsArgs(['delete', '--production'])).toEqual({
      action: 'delete',
      envTarget: 'production',
    });
  });

  test('push/delete以外のactionはthrow', () => {
    expect(() => parseCommandsArgs(['foo'])).toThrow();
    expect(() => parseCommandsArgs([undefined])).toThrow();
  });

  test('未知の余分な引数はthrow', () => {
    expect(() => parseCommandsArgs(['push', '--guild', '123'])).toThrow();
    expect(() => parseCommandsArgs(['push', '--env', 'production'])).toThrow();
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

describe('buildCommandsRoute', () => {
  test('guildIdが解決できない場合はglobal登録のroute', () => {
    expect(buildCommandsRoute('123456789012345678', undefined)).toBe(Routes.applicationCommands('123456789012345678'));
  });

  test('guildIdが解決できた場合はguild単位登録のroute(反映が即時)', () => {
    expect(buildCommandsRoute('123456789012345678', '987654321098765432')).toBe(
      Routes.applicationGuildCommands('123456789012345678', '987654321098765432'),
    );
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

  test('optionのtypeがdiscord.jsのApplicationCommandOptionTypeの値に正しくマッピングされる(number: 10, integer: 4はinteraction.options.getInteger()/getNumber()の型検証で区別される値のため取り違えるとthrowする)', () => {
    const registration: SlashCommandRegistration = {
      test: {
        options: [
          { type: 'string', name: 'str' },
          { type: 'number', name: 'num' },
          { type: 'integer', name: 'int' },
          { type: 'boolean', name: 'bool' },
        ],
        execute: async () => {},
      },
    };
    const data = collectSlashCommandsData(registration);
    const options = data.find((c) => c.name === 'test')!.options!;
    const typeOf = (name: string) => options.find((o) => o.name === name)!.type;
    expect(typeOf('str')).toBe(3);
    expect(typeOf('num')).toBe(10);
    expect(typeOf('int')).toBe(4);
    expect(typeOf('bool')).toBe(5);
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
