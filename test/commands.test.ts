import { describe, expect, test } from 'bun:test';
import { buildCommandsBody, parseCommandsArgs } from '../src/cli/commands';
import { collectSlashCommandsData } from '../src/components/slashCommands';
import type { SlashCommandRegistration } from '../src/components/types';

const sampleRegistration: SlashCommandRegistration = {
  ping: {
    description: 'pong',
    async execute(interaction) {
      await interaction.reply('pong');
    },
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
