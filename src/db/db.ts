import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { RegistryOf } from '../registry';
import { getDbState } from './state';

type Schema = RegistryOf<'schema', Record<string, unknown>>;

export const db = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDbState().db, prop, receiver);
    },
  },
) as LibSQLDatabase<Schema>;
