import { describe, expect, test } from 'bun:test';
import type { RepliableInteraction } from 'discord.js';
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
  test('createしたインスタンスをgetで取得できる', () => {
    const store = createCoreStore<{ hello(): string }>('channel');
    const interaction = fakeInteraction({ channelId: 'channel-1' });
    const instance = { hello: () => 'はろー' };

    expect(store.get(interaction)).toBeNull();
    expect(store.create(interaction, instance)).toBe(instance);
    expect(store.get(interaction)).toBe(instance);
  });

  test('removeするとgetがnullを返す', () => {
    const store = createCoreStore<{ value: number }>('channel');
    const interaction = fakeInteraction({ channelId: 'channel-2' });
    store.create(interaction, { value: 1 });

    store.remove(interaction);

    expect(store.get(interaction)).toBeNull();
  });

  test('別々のキー(channelId違い)は独立して保持される', () => {
    const store = createCoreStore<{ value: number }>('channel');
    const a = fakeInteraction({ channelId: 'channel-a' });
    const b = fakeInteraction({ channelId: 'channel-b' });
    store.create(a, { value: 1 });
    store.create(b, { value: 2 });

    expect(store.get(a)).toEqual({ value: 1 });
    expect(store.get(b)).toEqual({ value: 2 });
  });

  test('キーが解決できない場合createはnullを返し保存しない', () => {
    const store = createCoreStore<{ value: number }>('guild');
    const interaction = fakeInteraction({ guildId: null });

    expect(store.create(interaction, { value: 1 })).toBeNull();
    expect(store.get(interaction)).toBeNull();
  });
});
