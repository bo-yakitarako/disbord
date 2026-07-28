import { describe, expect, test } from 'bun:test';
import { makeButtonRow } from '../src/components/buttons';
import { makeSelectMenuRow } from '../src/components/selectMenus';
import { getComponentsState, setComponentsState } from '../src/components/state';
import type { ButtonRegistration, SelectMenuRegistration } from '../src/components/types';

describe('setComponentsState / getComponentsState', () => {
  test('注入した値をそのまま返す', () => {
    const buttons: ButtonRegistration = {};
    const selectMenus: SelectMenuRegistration = {};
    setComponentsState({ buttons, selectMenus });
    expect(getComponentsState()).toEqual({ buttons, selectMenus });
  });
});

describe('makeButtonRow (registrationを渡さない糖衣構文)', () => {
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

    // 非augmented環境のフォールバック型(ButtonRegistration<any>)は関数コンポーネントの
    // 引数タプルまでは厳密に絞り込めないため、実行時挙動の検証としてキャストする
    // (実際のbotではsrc/disbord.d.tsのmodule augmentation経由でここが厳密に型付けされる)。
    const row = makeButtonRow(['counter', 3] as never);
    const json = row.toJSON() as { components: { custom_id: string; label: string }[] };
    expect(json.components[0]!.label).toBe('カウント3');
    expect(json.components[0]!.custom_id).toContain('3');
  });
});

describe('makeSelectMenuRow (registrationを渡さない糖衣構文)', () => {
  test('setComponentsStateで注入したselectMenus registrationを暗黙解決して組み立てる', () => {
    const selectMenus: SelectMenuRegistration = {
      pick: { component: { options: [{ label: 'A', value: 'a' }] }, async execute() {} },
    };
    setComponentsState({ buttons: {}, selectMenus });

    const row = makeSelectMenuRow('pick');
    const json = row.toJSON() as { components: { custom_id: string }[] };
    expect(json.components[0]!.custom_id).toBe('pick');
  });
});
