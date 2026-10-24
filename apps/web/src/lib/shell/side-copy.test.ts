import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saveCopy } from '../record/boot-copy.ts';
import type { Shell } from '../record/boot-live.ts';
import { keepSide, keptSide, SIDE_COPY_KEY, type SideCopy } from './side-copy.ts';

const BASE = 'https://x.test/api';
const NOW = Date.UTC(2026, 9, 24, 9);

function store(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return { held, getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v), removeItem: (k) => void held.delete(k) };
}
const shellFor = (person: string) => ({ live: true, me: { person, level: 'owner', owner: true, lists: null, levels: {} } }) as unknown as Shell;

const COPY: SideCopy = {
  list: 'things',
  rows: [{ key: 'things#1', seq: 1, name: 'Kiln', href: '/r/things/1', mark: 'flame', hue: 3, lane: 'earning' }],
  values: ['earning', 'parked', 'retired'],
  done: ['retired'],
  labels: { parked: 'Parked' },
};

test('THE LAST LIST IS DRAWN AGAIN for the same record and person, beside the shell this browser keeps', () => {
  const s = store();
  saveCopy(BASE, shellFor('p_1'), NOW, s);
  keepSide(BASE, COPY, NOW, s);
  assert.deepEqual(keptSide(BASE, NOW, s), COPY);
  assert.equal(keptSide('https://other.test/api', NOW, s), null, "another record's list is never drawn");
});

test('NEVER WITHOUT THE SHELL BESIDE IT: a sign-out drops that, and a list kept for somebody else is dropped', () => {
  const s = store();
  keepSide(BASE, COPY, NOW, s);
  assert.equal(s.held.has(SIDE_COPY_KEY), false, 'nothing is kept with no shell to keep it beside');
  saveCopy(BASE, shellFor('p_1'), NOW, s);
  keepSide(BASE, COPY, NOW, s);
  s.removeItem('braindog.boot-copy');
  assert.equal(keptSide(BASE, NOW, s), null);
  saveCopy(BASE, shellFor('p_2'), NOW, s);
  assert.equal(keptSide(BASE, NOW, s), null);
  assert.equal(s.held.has(SIDE_COPY_KEY), false);
});

test('AN ODD ENTRY IS NOT DRAWN, and a row missing what it draws by is left out', () => {
  const s = store();
  saveCopy(BASE, shellFor('p_1'), NOW, s);
  s.setItem(SIDE_COPY_KEY, '{not json');
  assert.equal(keptSide(BASE, NOW, s), null);
  keepSide(BASE, { ...COPY, rows: [...COPY.rows, { key: 'things#2' } as never] }, NOW, s);
  assert.deepEqual(keptSide(BASE, NOW, s)?.rows, COPY.rows);
});
