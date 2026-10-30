/**
 * The sidebar's week waits for the screen's own reads, and its money figures are held a few minutes: one figure a
 * project, asked first on every open and again on every move of the record, held the screen's reads up behind it in
 * the record's one thread.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { saveCopy } from '../record/boot-copy.ts';
import type { Shell } from '../record/boot-live.ts';
import { keepWeek, keptWeek, MONEY_HELD_MS, readWeek, WEEK_KEPT_KEY, type SideRow, type Week } from './side-read.ts';

const row = (seq: number, name: string): SideRow => ({ key: `things#${seq}`, seq, name, href: `/r/things/${seq}`, mark: '', hue: null, lane: 'play' }) as unknown as SideRow;

test('the money figures are asked once for the same projects within the hold, and again after it', async () => {
  const asked: string[] = [];
  const was = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === 'string' ? init.body : '';
    asked.push(`${url} ${body}`);
    const metrics = /metric/u.test(url);
    const value = metrics ? { readings: {}, refused: {} } : { rows: [], cursor: null };
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const play = [row(1, 'Kiln'), row(2, 'Portage')];
    const base = 'https://week.example/api';
    const t = 1_000_000;
    await readWeek(base, 'things', play, t);
    const first = asked.filter((a) => /metric/u.test(a)).length;
    assert.ok(first > 0, 'the first week asks the figures');
    await readWeek(base, 'things', play, t + 60_000);
    assert.equal(asked.filter((a) => /metric/u.test(a)).length, first, 'a minute later they are held');
    await readWeek(base, 'things', play, t + MONEY_HELD_MS + 1);
    assert.ok(asked.filter((a) => /metric/u.test(a)).length > first, 'past the hold they are asked again');
  } finally {
    globalThis.fetch = was;
  }
});

test('the sidebar asks its week once the screen has rested', () => {
  const bar = readFileSync(new URL('./SideBar.svelte', import.meta.url), 'utf8');
  assert.match(bar, /await rested\(\);\s+if \(n !== asked\) return;\s+const w = await readWeek\(/u);
});

function store(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return { held, getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v), removeItem: (k) => void held.delete(k) };
}
const shellFor = (person: string) => ({ live: true, me: { person, level: 'owner', owner: true, lists: null, levels: {} } }) as unknown as Shell;

test('A SHARED DEVICE: the week kept for the owner is never drawn for the member who signs in next (review 3, P1)', () => {
  const base = 'https://week.example/api';
  const now = Date.UTC(2026, 9, 30, 9);
  const s = store();
  const owners: Week = new Map([['things#1', { late: 3, moved: true }]]);
  saveCopy(base, shellFor('p_owner'), now, s);
  keepWeek(base, owners, now, s);
  assert.deepEqual(keptWeek(base, now, s), owners, 'drawn again for the same person');
  assert.deepEqual(keptWeek('https://other.example/api', now, s), new Map(), "another record's is not drawn");
  /* SIGN-OUT DROPS THE SHELL, and the week is out of reach with it. */
  s.removeItem('braindog.boot-copy');
  assert.deepEqual(keptWeek(base, now, s), new Map());
  assert.equal(s.held.has(WEEK_KEPT_KEY), false, 'a week with no shell beside it is dropped');
  /* THE MEMBER SIGNS IN: the owner's week, kept again, is dropped at their first read, and nothing is kept for nobody. */
  saveCopy(base, shellFor('p_owner'), now, s);
  keepWeek(base, owners, now, s);
  saveCopy(base, shellFor('p_member'), now, s);
  assert.deepEqual(keptWeek(base, now, s), new Map());
  assert.equal(s.held.has(WEEK_KEPT_KEY), false);
  s.removeItem('braindog.boot-copy');
  keepWeek(base, owners, now, s);
  assert.equal(s.held.has(WEEK_KEPT_KEY), false, 'no shell, no person to keep it for');
});

test('THE OLD WEEK, every record by base for whoever was signed in, is dropped at the first read', () => {
  const base = 'https://week.example/api';
  const now = Date.UTC(2026, 9, 30, 9);
  const s = store();
  saveCopy(base, shellFor('p_owner'), now, s);
  s.setItem(WEEK_KEPT_KEY, JSON.stringify({ [base]: { 'things#1': { late: 2, moved: false } } }));
  assert.deepEqual(keptWeek(base, now, s), new Map());
  assert.equal(s.held.has(WEEK_KEPT_KEY), false);
  s.setItem(WEEK_KEPT_KEY, '{not json');
  assert.deepEqual(keptWeek(base, now, s), new Map());
  assert.equal(s.held.has(WEEK_KEPT_KEY), false);
});
