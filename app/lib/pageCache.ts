const TTL_MS = 5 * 60 * 1000;

type Entry<T> = { data: T; ts: number };
const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}
