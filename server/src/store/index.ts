import { config } from '../config';
import { CallStore } from './types';
import { FileStore } from './fileStore';
import { PostgresStore } from './postgresStore';

export * from './types';

let store: CallStore | null = null;

export function getStore(): CallStore {
  if (!store) {
    store = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new FileStore(config.dataDir);
  }
  return store;
}

export const storeKind = () => (config.databaseUrl ? 'postgres' : 'file');
