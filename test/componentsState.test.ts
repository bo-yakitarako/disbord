import { describe, expect, test } from 'bun:test';
import { makeButtonRow, routeButtonInteraction } from '../src/components/buttons';
import { makeSelectMenuRow, routeSelectMenuInteraction } from '../src/components/selectMenus';
import { getComponentsState, setComponentsState } from '../src/components/state';
import type { ButtonRegistration, SelectMenuRegistration } from '../src/components/types';

describe('setComponentsState / getComponentsState', () => {
  test('注入した値をそのまま返す', () => {
    const buttons: ButtonRegistration = {};
    const selectMenus: SelectMenuRegistration = {};
    setComponentsState({ buttons, selectMenus });
    expect(getComponentsState()).toEqual({ buttons, selectMenus });
  });

  test('buttons/selectMenusは任意(両方省略してもthrowしない)', () => {
    setComponentsState({ argsSplitter: '-' });
    expect(getComponentsState()).toEqual({ argsSplitter: '-' });
  });
});

describe('makeButtonRow (registrationを渡さない糖衣構文)', () => {
  test('buttons.tsが未生成(setComponentsStateにbuttonsが渡されていない)場合はわかりやすいエラーでthrowする', () => {
    setComponentsState({ selectMenus: {} });
    expect(() => makeButtonRow('sample' as never)).toThrow(/disbord generate component button/);
  });

  test('setComponentsStateで注入したbuttons registrationを暗黙解決して組み立てる', () => {
    const buttons: ButtonRegistration = {
      sample: { component: { label: 'サンプル', style: 'primary' }, async execute() {} },
    };
    setComponentsState({ buttons, selectMenus: {} });

    const row = makeButtonRow('sample');
    const json = row.toJSON() as { components: { custom_id: string; label: string }[] };
    expect(json.components).toHaveLength(1);
    expect(json.components[0]!.custom_id).toBe('sample');
    expect(json.components[0]!.label).toBe('サンプル');
  });

  test('関数コンポーネントには引数を渡せる(customIdに引数が埋め込まれる)', () => {
    const buttons: ButtonRegistration = {
      counter: { component: (n: number) => ({ label: `カウント${n}`, args: [n] }), async execute() {} },
    };
    setComponentsState({ buttons, selectMenus: {} });

    const row = makeButtonRow(['counter', 3] as never);
    const json = row.toJSON() as { components: { custom_id: string; label: string }[] };
    expect(json.components[0]!.label).toBe('カウント3');
    expect(json.components[0]!.custom_id).toContain('3');
  });

  test('componentのargsフィールドがある場合はデフォルトのハイフン区切りでcustomIdに埋め込まれる', () => {
    const buttons: ButtonRegistration = {
      grid: { component: (n: number) => ({ label: `${n}`, args: [n] }), async execute() {} },
    };
    setComponentsState({ buttons, selectMenus: {} });

    const row = makeButtonRow(['grid', 3] as never);
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('grid-3');
  });

  test('entryのargsSplitterが指定されていればそちらで区切る', () => {
    const buttons: ButtonRegistration = {
      grid: {
        component: (n: number) => ({ label: `${n}`, args: [n] }),
        argsSplitter: ':',
        async execute() {},
      },
    };
    setComponentsState({ buttons, selectMenus: {} });

    const row = makeButtonRow(['grid', 3] as never);
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('grid:3');
  });

  test('entry未指定時はsetComponentsStateのグローバルargsSplitterが使われる', () => {
    const buttons: ButtonRegistration = {
      grid: { component: (n: number) => ({ label: `${n}`, args: [n] }), async execute() {} },
    };
    setComponentsState({ buttons, selectMenus: {}, argsSplitter: ':' });

    const row = makeButtonRow(['grid', 3] as never);
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('grid:3');
  });
});

describe('routeButtonInteraction', () => {
  test('customIdをkey/argsに復元してexecuteへargsを渡す', async () => {
    const received: string[] = [];
    const buttons: ButtonRegistration = {
      grid: {
        component: { label: 'grid' },
        async execute(_interaction, ...args: string[]) {
          received.push(...args);
        },
      },
    };
    await routeButtonInteraction({ customId: 'grid-3-x', reply: async () => {} } as never, buttons);
    expect(received).toEqual(['3', 'x']);
  });

  test('entryのargsSplitterに応じてcustomIdを分解する', async () => {
    const received: string[] = [];
    const buttons: ButtonRegistration = {
      grid: {
        component: { label: 'grid' },
        argsSplitter: ':',
        async execute(_interaction, ...args: string[]) {
          received.push(...args);
        },
      },
    };
    await routeButtonInteraction({ customId: 'grid:3:x', reply: async () => {} } as never, buttons);
    expect(received).toEqual(['3', 'x']);
  });

  test('optionsで渡したグローバルargsSplitterが適用される', async () => {
    const received: string[] = [];
    const buttons: ButtonRegistration = {
      grid: {
        component: { label: 'grid' },
        async execute(_interaction, ...args: string[]) {
          received.push(...args);
        },
      },
    };
    await routeButtonInteraction({ customId: 'grid:3', reply: async () => {} } as never, buttons, undefined, {
      argsSplitter: ':',
    });
    expect(received).toEqual(['3']);
  });

  test('未登録のcustomIdはthrow', async () => {
    const buttons: ButtonRegistration = {
      grid: { component: { label: 'grid' }, async execute() {} },
    };
    await expect(
      routeButtonInteraction({ customId: 'unknown-1', reply: async () => {} } as never, buttons),
    ).rejects.toThrow(/unknown button customId/);
  });
});

describe('makeSelectMenuRow (registrationを渡さない糖衣構文)', () => {
  test('selectMenus.tsが未生成(setComponentsStateにselectMenusが渡されていない)場合はわかりやすいエラーでthrowする', () => {
    setComponentsState({ buttons: {} });
    expect(() => makeSelectMenuRow('pick' as never)).toThrow(/disbord generate component selectMenu/);
  });

  test('setComponentsStateで注入したselectMenus registrationを暗黙解決して組み立てる', () => {
    const selectMenus: SelectMenuRegistration = {
      pick: { component: { options: [{ label: 'A', value: 'a' }] }, async execute() {} },
    };
    setComponentsState({ buttons: {}, selectMenus });

    const row = makeSelectMenuRow('pick');
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('pick');
  });

  test('componentのargsフィールドがある場合はcustomIdに埋め込まれる', () => {
    const selectMenus: SelectMenuRegistration = {
      page: {
        component: (n: number) => ({ options: [{ label: 'A', value: 'a' }], args: [n] }),
        async execute() {},
      },
    };
    setComponentsState({ buttons: {}, selectMenus });

    const row = makeSelectMenuRow('page', 2);
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('page-2');
  });
});

describe('routeSelectMenuInteraction', () => {
  test('customIdをkey/argsに復元してexecuteへargsを渡す', async () => {
    const received: string[] = [];
    const selectMenus: SelectMenuRegistration = {
      page: {
        component: { options: [{ label: 'A', value: 'a' }] },
        argsSplitter: ':',
        async execute(_interaction, ...args: string[]) {
          received.push(...args);
        },
      },
    };
    await routeSelectMenuInteraction(
      { customId: 'page:2', values: ['a'], reply: async () => {} } as never,
      selectMenus,
    );
    expect(received).toEqual(['2']);
  });
});
