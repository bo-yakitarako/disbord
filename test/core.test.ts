import { describe, expect, test } from 'bun:test';
import type { RepliableInteraction } from 'discord.js';
import { BotError } from '../src/BotError';
import { createCoreStore, resolveInstanceKey } from '../src/core/store';

function fakeInteraction(overrides: {
  guildId?: string | null;
  channelId?: string | null;
  userId?: string;
  channel?: { parentId: string | null } | null;
}): RepliableInteraction {
  return {
    guildId: overrides.guildId ?? null,
    channelId: overrides.channelId ?? null,
    user: { id: overrides.userId ?? 'user-1' },
    channel: overrides.channel ?? null,
  } as unknown as RepliableInteraction;
}

describe('resolveInstanceKey', () => {
  test('guild単位はguildIdを返す', () => {
    const interaction = fakeInteraction({ guildId: 'guild-1' });
    expect(resolveInstanceKey(interaction, 'guild')).toBe('guild-1');
  });

  test('guild単位でDM(guildIdなし)の場合はnull', () => {
    const interaction = fakeInteraction({ guildId: null });
    expect(resolveInstanceKey(interaction, 'guild')).toBeNull();
  });

  test('channel単位はchannelIdを返す', () => {
    const interaction = fakeInteraction({ channelId: 'channel-1' });
    expect(resolveInstanceKey(interaction, 'channel')).toBe('channel-1');
  });

  test('user単位はuser.idを返す', () => {
    const interaction = fakeInteraction({ userId: 'user-42' });
    expect(resolveInstanceKey(interaction, 'user')).toBe('user-42');
  });

  test('global単位は固定キーを返す', () => {
    const interaction = fakeInteraction({});
    expect(resolveInstanceKey(interaction, 'global')).toBe('__global__');
  });

  test('category単位はchannelのparentIdを返す', () => {
    const interaction = fakeInteraction({ channel: { parentId: 'category-1' } });
    expect(resolveInstanceKey(interaction, 'category')).toBe('category-1');
  });

  test('category単位でchannelが取得できない場合はnull', () => {
    const interaction = fakeInteraction({ channel: null });
    expect(resolveInstanceKey(interaction, 'category')).toBeNull();
  });
});

describe('createCoreStore', () => {
  test('createしたインスタンス(factoryが返す値)をgetで取得できる', () => {
    const instance = { hello: () => 'はろー' };
    const store = createCoreStore<{ hello(): string }>('channel', () => instance, 'ここでは使えません');
    const interaction = fakeInteraction({ channelId: 'channel-1' });

    expect(store.get(interaction)).toBeNull();
    expect(store.create(interaction)).toBe(instance);
    expect(store.get(interaction)).toBe(instance);
  });

  test('createのたびにfactoryが呼ばれ、新しいインスタンスに置き換わる', () => {
    let constructedCount = 0;
    const store = createCoreStore<{ id: number }>('channel', () => ({ id: ++constructedCount }), 'ここでは使えません');
    const interaction = fakeInteraction({ channelId: 'channel-factory' });

    expect(store.create(interaction)).toEqual({ id: 1 });
    expect(store.create(interaction)).toEqual({ id: 2 });
    expect(store.get(interaction)).toEqual({ id: 2 });
  });

  test('removeするとgetがnullを返す', () => {
    const store = createCoreStore<{ value: number }>('channel', () => ({ value: 1 }), 'ここでは使えません');
    const interaction = fakeInteraction({ channelId: 'channel-2' });
    store.create(interaction);

    store.remove(interaction);

    expect(store.get(interaction)).toBeNull();
  });

  test('別々のキー(channelId違い)は独立して保持される', () => {
    let constructedCount = 0;
    const store = createCoreStore<{ value: number }>(
      'channel',
      () => ({ value: ++constructedCount }),
      'ここでは使えません',
    );
    const a = fakeInteraction({ channelId: 'channel-a' });
    const b = fakeInteraction({ channelId: 'channel-b' });
    store.create(a);
    store.create(b);

    expect(store.get(a)).toEqual({ value: 1 });
    expect(store.get(b)).toEqual({ value: 2 });
  });

  test('キーが解決できない場合createはBotError(instanceInvalidMessage)をthrowし保存しない(非同期処理も構築失敗もないため、createの成功時の戻り値はnull unionを持たずTのみで確定できる)', () => {
    const store = createCoreStore<{ value: number }>('guild', () => ({ value: 1 }), 'ギルド専用だよ');
    const interaction = fakeInteraction({ guildId: null });

    expect(() => store.create(interaction)).toThrow(BotError);
    expect(() => store.create(interaction)).toThrow('ギルド専用だよ');
    expect(store.get(interaction)).toBeNull();
  });

  test('factory/instanceInvalidMessageがない場合createはthrowする(coreClass.enable無効時にコード上createCoreStoreを直接呼ぶような誤用への防御)', () => {
    const store = createCoreStore<{ id: string }>('channel');
    const interaction = fakeInteraction({ channelId: 'channel-no-factory' });

    expect(() => store.create(interaction)).toThrow();
  });
});
