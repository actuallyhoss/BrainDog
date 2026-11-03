/**
 * The "Removed" part of Add-ons, in words: when each went, what of it stays, and the way back. Invented add-on and
 * list names only (Orchard, Hives, Ledgers).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogueIndex } from '@braindog/declare/catalogue';
import { readRemoved, removedLines, stayedSaid, versionSaid, wayBack, whenSaid, type Caller, type Removed } from './removed.ts';

/* NOON ON THE PERSON'S OWN CALENDAR, so no time zone moves a day across midnight. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NOW = at(2026, 10, 15);
const iso = (t: number) => new Date(t).toISOString();

const orchard = (stayed: Removed['stayed'], removed_at = iso(at(2026, 10, 3))): Removed => ({ id: 'orchard', title: 'Orchard', version: '1.2.0', removed_at, stayed, back: true });

test('one list: the count and the list by name', () => {
  assert.equal(stayedSaid([{ list: 'Hives', rows: 41 }]), 'Your 41 items stay in Hives.');
  assert.equal(stayedSaid([{ list: 'Hives', rows: 1 }]), 'Your 1 item stays in Hives.');
  /* A LIST THAT HELD NOTHING IS NOT NAMED. */
  assert.equal(stayedSaid([{ list: 'Hives', rows: 3 }, { list: 'Ledgers', rows: 0 }]), 'Your 3 items stay in Hives.');
});

test('two lists are both named, and many are counted', () => {
  assert.equal(stayedSaid([{ list: 'Hives', rows: 30 }, { list: 'Ledgers', rows: 11 }]), 'Your 41 items stay in Hives and Ledgers.');
  const four = ['Hives', 'Ledgers', 'Sheds', 'Ponds'].map((list) => ({ list, rows: 2 }));
  assert.equal(stayedSaid(four), 'Your 8 items stay in 4 lists.');
  assert.equal(stayedSaid([{ list: 'Hives', rows: 1200 }]), 'Your 1,200 items stay in Hives.');
});

test('nothing in it is said as nothing', () => {
  assert.equal(stayedSaid([]), 'Nothing was in it.');
  assert.equal(stayedSaid([{ list: 'Hives', rows: 0 }]), 'Nothing was in it.');
});

test('the day is said in words, never as the timestamp', () => {
  assert.equal(whenSaid(iso(at(2026, 10, 3)), NOW), 'Removed 3 Oct');
  assert.equal(whenSaid(iso(NOW - 3_600_000), NOW), 'Removed today');
  assert.equal(whenSaid(iso(at(2026, 10, 14)), NOW), 'Removed yesterday');
  assert.equal(whenSaid(iso(at(2025, 12, 20)), at(2026, 1, 5)), 'Removed 20 Dec 2025');
  assert.equal(whenSaid('not a day', NOW), 'Removed');
});

test('each removed add-on gets its two lines', () => {
  const lines = removedLines([orchard([{ list: 'Hives', rows: 41 }])], NOW);
  assert.deepEqual(lines, [{ id: 'orchard', title: 'Orchard', when: 'Removed 3 Oct', stayed: 'Your 41 items stay in Hives.' }]);
  for (const l of lines) assert.doesNotMatch(`${l.when} ${l.stayed}`, /—|\brows?\b|\d{4}-\d{2}-\d{2}T/u);
});

const caller = (answer: unknown, seen: string[] = []): Caller => ({
  call: async <T,>(name: string) => {
    seen.push(name);
    return answer as { ok: true; value: T };
  },
});

test('the read answers what the record lists, by name', async () => {
  const seen: string[] = [];
  const rows = [orchard([{ list: 'Hives', rows: 41 }])];
  assert.deepEqual(await readRemoved(caller({ ok: true, value: rows }, seen)), rows);
  assert.deepEqual(seen, ['packsRemoved']);
});

test('a refusal, a throw, or no client reads as nothing removed', async () => {
  assert.deepEqual(await readRemoved(caller({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such method.' } })), []);
  assert.deepEqual(await readRemoved(caller({ ok: true, value: { not: 'a list' } })), []);
  assert.deepEqual(await readRemoved({ call: async () => Promise.reject(new Error('offline')) }), []);
  assert.deepEqual(await readRemoved(null), []);
});

test('an answer it cannot say is left out, and a nameless list is never said by its id', async () => {
  const value = [{ id: '' }, { id: 'orchard', removed_at: iso(NOW), stayed: [{ list: '', rows: 4 }, { list: 'Hives', rows: 2 }] }];
  const [one, ...rest] = await readRemoved(caller({ ok: true, value }));
  assert.equal(rest.length, 0);
  assert.deepEqual(one?.stayed, [{ list: 'Hives', rows: 2 }]);
  assert.equal(one?.back, true);
});

const kennel = {
  format: 1,
  name: 'Test shelf',
  entries: [
    { kind: 'pack', id: 'orchard', title: 'Orchard', versions: [{ version: '1.3.0' }, { version: '1.2.0', yanked: 'bad' }] },
    { kind: 'usecase', id: 'beekeeper', title: 'Beekeeper', versions: [{ version: '2.0.0' }] },
  ],
} as unknown as CatalogueIndex;

test('a module this build ships comes back here, at the version it ships', () => {
  assert.deepEqual(wayBack({ id: 'hives-core', version: '1.0.0' }, new Map([['hives-core', '1.1.0']]), null), { kind: 'here', newest: '1.1.0' });
});

test('anything else opens its own page, with the newest version the screen can get', () => {
  assert.deepEqual(wayBack({ id: 'orchard', version: '1.2.0' }, new Map(), kennel), { kind: 'page', href: '/plugins/orchard?kind=pack', newest: '1.3.0' });
  assert.deepEqual(wayBack({ id: 'usecase-beekeeper', version: '2.0.0' }, new Map(), kennel), { kind: 'page', href: '/plugins/beekeeper', newest: '2.0.0' });
  assert.deepEqual(wayBack({ id: 'orchard', version: '1.2.0' }, new Map(), null), { kind: 'page', href: '/plugins/orchard?kind=pack', newest: null });
});

test('a version that is gone is said in one line', () => {
  assert.equal(versionSaid('1.2.0', '1.3.0'), 'Version 1.2.0 is no longer here, so Put back brings 1.3.0, the newest there is.');
  assert.equal(versionSaid('1.2.0', '1.2.0'), null);
  assert.equal(versionSaid('1.2.0', null), null);
});
