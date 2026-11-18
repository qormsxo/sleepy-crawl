import { fixtureAdapter } from './fixture';
import { clienAdapter, fmkoreaAdapter, humorunivAdapter, invenAdapter, ruliwebAdapter, todayhumorAdapter } from './sites';
import type { SourceAdapter } from './types';

const adapters: Record<string, SourceAdapter> = {
  fixture: fixtureAdapter,
  todayhumor: todayhumorAdapter,
  fmkorea: fmkoreaAdapter,
  ruliweb: ruliwebAdapter,
  inven: invenAdapter,
  clien: clienAdapter,
  humoruniv: humorunivAdapter,
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
