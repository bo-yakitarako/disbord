import type { RegistryOf } from '../registry';
import { getCoreStoreState } from './state';
import type { CoreStore } from './store';

type Core = RegistryOf<'core', never>;

export const coreStore = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      return Reflect.get(getCoreStoreState(), prop, receiver);
    },
  },
) as CoreStore<Core>;
