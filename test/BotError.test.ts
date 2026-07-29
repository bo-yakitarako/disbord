import { describe, expect, test } from 'bun:test';
import { MessageFlags } from 'discord.js';
import { BotError, handleBotError } from '../src/BotError';

function fakeInteraction(overrides: { deferred?: boolean; replied?: boolean } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    deferred: overrides.deferred ?? false,
    replied: overrides.replied ?? false,
    reply: async (...args: unknown[]) => {
      calls.push({ method: 'reply', args });
    },
    followUp: async (...args: unknown[]) => {
      calls.push({ method: 'followUp', args });
    },
    calls,
  };
}

describe('handleBotError', () => {
  test('BotErrorでない場合はそのままrethrowする', async () => {
    const interaction = fakeInteraction();
    await expect(handleBotError(new Error('普通のエラー'), interaction as never, '固定メッセージ')).rejects.toThrow(
      '普通のエラー',
    );
  });

  test('BotErrorに自前のmessageがある場合はそちらを優先し、botErrorMessageは使わない', async () => {
    const interaction = fakeInteraction();
    await handleBotError(new BotError('個別のエラーメッセージ'), interaction as never, '固定メッセージ');

    expect(interaction.calls).toEqual([
      { method: 'reply', args: [{ content: '個別のエラーメッセージ', flags: MessageFlags.Ephemeral }] },
    ]);
  });

  test('BotErrorにmessageがない場合はbotErrorMessage(固定文字列)にfallbackする', async () => {
    const interaction = fakeInteraction();
    await handleBotError(new BotError(), interaction as never, '固定メッセージ');

    expect(interaction.calls).toEqual([
      { method: 'reply', args: [{ content: '固定メッセージ', flags: MessageFlags.Ephemeral }] },
    ]);
  });

  test('BotErrorにmessageがない場合はbotErrorMessage(関数)にもfallbackする', async () => {
    const interaction = fakeInteraction();
    await handleBotError(new BotError(), interaction as never, (error) => `動的: ${error.constructor.name}`);

    expect(interaction.calls).toEqual([
      { method: 'reply', args: [{ content: '動的: BotError', flags: MessageFlags.Ephemeral }] },
    ]);
  });

  test('deferred/replied済みの場合はfollowUpを使う', async () => {
    const interaction = fakeInteraction({ replied: true });
    await handleBotError(new BotError('返信済み後のエラー'), interaction as never, '固定メッセージ');

    expect(interaction.calls).toEqual([
      { method: 'followUp', args: [{ content: '返信済み後のエラー', flags: MessageFlags.Ephemeral }] },
    ]);
  });
});
