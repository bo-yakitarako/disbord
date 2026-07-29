import { describe, expect, test } from 'bun:test';
import type { RepliableInteraction } from 'discord.js';
import { coreStore } from '../src/core/coreStore';
import { createCoreStore, type CoreStore } from '../src/core/store';

function fakeInteraction(channelId: string): RepliableInteraction {
  return { guildId: null, channelId, user: { id: 'user-1' }, channel: null } as unknown as RepliableInteraction;
}

/**
 * coreStoreはRegistry['core']（.disbord/disbord.d.ts）を参照して型解決される
 * (未定義ならnever)。disbord自身のリポジトリ内にはその宣言がないため、
 * テストでは実際のbotプロジェクトを模してキャストする。
 */
function typedCoreStore<T>() {
  return coreStore as unknown as CoreStore<T>;
}

describe('coreStore', () => {
  test('createCoreStoreが生成したstoreはグローバルに登録され、coreStore越しに同じインスタンスへアクセスできる', () => {
    const instance = { hello: () => 'はろー' };
    const store = createCoreStore<{ hello(): string }>('channel', () => instance, 'ここでは使えません');
    const wrapped = typedCoreStore<{ hello(): string }>();
    const interaction = fakeInteraction('channel-core-1');

    expect(wrapped.get(interaction)).toBeNull();
    store.create(interaction);
    expect(wrapped.get(interaction)).toBe(instance);
  });

  test('coreStore.create/removeもグローバル登録されたstoreへ反映される(new Coreを書かず呼べる)', () => {
    createCoreStore<{ value: number }>('channel', () => ({ value: 1 }), 'ここでは使えません');
    const wrapped = typedCoreStore<{ value: number }>();
    const interaction = fakeInteraction('channel-core-2');

    wrapped.create(interaction);
    expect(wrapped.get(interaction)).toEqual({ value: 1 });

    wrapped.remove(interaction);
    expect(wrapped.get(interaction)).toBeNull();
  });

  test('createCoreStoreを呼び直すとcoreStoreの参照先も新しいstoreへ切り替わる', () => {
    createCoreStore<{ value: number }>('channel', () => ({ value: 1 }), 'ここでは使えません');
    const wrapped = typedCoreStore<{ value: number }>();
    const interaction = fakeInteraction('channel-core-3');
    wrapped.create(interaction);

    createCoreStore<{ value: number }>('channel', () => ({ value: 1 }), 'ここでは使えません');
    expect(wrapped.get(interaction)).toBeNull();
  });
});
