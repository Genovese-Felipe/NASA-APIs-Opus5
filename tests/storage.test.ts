import { afterEach, describe, expect, it } from 'vitest';
import { storageGet, storageRemove, storageSet } from '../src/storage';

const localDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
const sessionDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

afterEach(() => {
  if (localDescriptor) Object.defineProperty(window, 'localStorage', localDescriptor);
  if (sessionDescriptor) Object.defineProperty(window, 'sessionStorage', sessionDescriptor);
});

describe('sandbox-safe storage', () => {
  it('reads, writes, and removes when storage is available', () => {
    expect(storageSet('local', 'opus5-test', 'signal')).toBe(true);
    expect(storageGet('local', 'opus5-test')).toBe('signal');
    expect(storageRemove('local', 'opus5-test')).toBe(true);
    expect(storageGet('local', 'opus5-test')).toBeNull();
  });

  it('never throws when a sandbox blocks both storage areas', () => {
    const blocked = { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } };
    Object.defineProperty(window, 'localStorage', blocked);
    Object.defineProperty(window, 'sessionStorage', blocked);

    expect(storageGet('local', 'x')).toBeNull();
    expect(storageSet('local', 'x', 'y')).toBe(false);
    expect(storageRemove('session', 'x')).toBe(false);
  });
});
