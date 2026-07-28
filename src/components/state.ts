import type { ButtonRegistration, SelectMenuRegistration } from './types';

type ComponentsState = {
  buttons: ButtonRegistration<any>;
  selectMenus: SelectMenuRegistration<any>;
};

let state: ComponentsState | undefined;

export function setComponentsState(next: ComponentsState) {
  state = next;
}

export function getComponentsState(): ComponentsState {
  if (!state) {
    throw new Error('disbord: components is not initialized yet. .disbord/main.tsの起動処理を確認してください。');
  }
  return state;
}
