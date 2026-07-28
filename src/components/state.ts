import type { ButtonRegistration, SelectMenuRegistration } from './types';

type ComponentsState = {
  buttons: ButtonRegistration<any>;
  selectMenus: SelectMenuRegistration<any>;
};

let state: ComponentsState | undefined;

export function setComponentsState(next: ComponentsState) {
  state = next;
}

/**
 * makeButtonRow/makeSelectMenuRowがregistrationを暗黙解決するための実行時singleton。
 * 実体注入(setComponentsState呼び出し)は.disbord/main.tsの起動処理が担う。
 * それより前にmakeButtonRow等が使われた場合はここで気づけるように例外を投げる。
 */
export function getComponentsState(): ComponentsState {
  if (!state) {
    throw new Error('disbord: components is not initialized yet. .disbord/main.tsの起動処理を確認してください。');
  }
  return state;
}
