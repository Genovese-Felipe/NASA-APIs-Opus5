export type StorageScope = 'local' | 'session';

function resolveStorage(scope: StorageScope): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return scope === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function storageGet(scope: StorageScope, key: string): string | null {
  try {
    return resolveStorage(scope)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageSet(scope: StorageScope, key: string, value: string): boolean {
  try {
    const storage = resolveStorage(scope);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(scope: StorageScope, key: string): boolean {
  try {
    const storage = resolveStorage(scope);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
