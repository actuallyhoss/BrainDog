import { describe, expect, it } from 'vitest';

import { COPY_KEY, COPY_MS, dropCopy, drawnFrom, readCopy, saveCopy } from './boot-copy.ts';
import type { Shell } from './boot-live.ts';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const shell = (over: Record<string, unknown> = {}): Shell =>
  ({ live: true, index: { name: 'Acme' }, pen: [{ id: 'x' }], me: { person: 'p', level: 'owner', owner: true, lists: ['a'], records: [] }, ...over }) as unknown as Shell;

describe('boot copy', () => {
  it('keeps and reads a shell for the same record, drawn only', () => {
    const s = mem();
    saveCopy('/app/acme', shell(), 1000, s);
    const got = readCopy('/app/acme', 2000, s)!;
    expect(got.stale).toBe(true);
    expect(got.me.level).toBe('read');
    expect(got.me.owner).toBe(false);
    expect(got.pen).toEqual([]);
    expect(got.index.name).toBe('Acme');
  });
  it('does not draw another record, an old copy or a bad one', () => {
    const s = mem();
    saveCopy('/app/acme', shell(), 1000, s);
    expect(readCopy('/app/kiln', 2000, s)).toBeNull();
    expect(readCopy('/app/acme', 1000 + COPY_MS, s)).toBeNull();
    expect(s.m.has(COPY_KEY)).toBe(false);
    s.setItem(COPY_KEY, '{nope');
    expect(readCopy('/app/acme', 2000, s)).toBeNull();
    expect(s.m.has(COPY_KEY)).toBe(false);
  });
  it('never keeps a refused or unanswered shell, and drops on request', () => {
    const s = mem();
    saveCopy('/app/acme', shell({ refused: { code: 'X', fix: 'y' } }), 1, s);
    saveCopy('/app/acme', shell({ live: false }), 1, s);
    expect(s.m.size).toBe(0);
    saveCopy('/app/acme', shell(), 1, s);
    dropCopy(s);
    expect(s.m.size).toBe(0);
  });
  it('survives storage that throws', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    const bad = { getItem: boom, setItem: boom, removeItem: boom };
    expect(() => saveCopy('/a', shell(), 1, bad)).not.toThrow();
    expect(readCopy('/a', 1, bad)).toBeNull();
    expect(drawnFrom(shell()).stale).toBe(true);
  });
});
