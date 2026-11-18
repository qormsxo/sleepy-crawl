import { fixtureAdapter } from './fixture';
import type { SourceAdapter } from './types';

const adapters: Record<string, SourceAdapter> = {
  fixture: fixtureAdapter,
};

const DEV_ONLY = new Set(['fixture']);

export function getAdapter(key: string): SourceAdapter {
  if (DEV_ONLY.has(key) && process.env.NODE_ENV === 'production') {
    throw new Error(`adapter "${key}" is disabled in production`);
  }
  const adapter = adapters[key];
  if (!adapter) throw new Error(`unknown adapter "${key}"`);
  return adapter;
}
