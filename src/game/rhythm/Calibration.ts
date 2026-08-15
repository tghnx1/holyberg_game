import { DEFAULT_INPUT_OFFSET_MS, INPUT_OFFSET_STORAGE_KEY } from './constants';

export function readInputOffsetMs(storage?: Pick<Storage, 'getItem'>): number {
  if (!storage) return DEFAULT_INPUT_OFFSET_MS;
  const parsed = Number(storage.getItem(INPUT_OFFSET_STORAGE_KEY));
  return Number.isFinite(parsed) ? parsed : DEFAULT_INPUT_OFFSET_MS;
}
