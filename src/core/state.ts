import type { CoreStore } from './store';

let state: CoreStore<unknown> | undefined;

export function setCoreStoreState(next: CoreStore<unknown>) {
  state = next;
}

export function getCoreStoreState(): CoreStore<unknown> {
  if (!state) {
    throw new Error(
      'disbord: coreClass store is not initialized yet. disbord.config.tsのcoreClass.enableを確認してください。',
    );
  }
  return state;
}
