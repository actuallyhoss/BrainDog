/**
 * Filtering, searching and sorting — the three places a typed record can lie quietly.
 *
 * None of these throw when they are wrong. A filter that drops a row shows a shorter list, and a
 * shorter list looks exactly like a correct answer. A sort that compares money as text puts GBP 99
 * above GBP 480 and the column still looks sorted, because every column of numbers looks sorted
 * from a distance. These are the failures you only catch by asserting the order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyFilters, sortRows } from './api.ts';
import type { Entry } from './schema.ts';

const rows = (...fields: Record<string, unknown>[]): Entry[] =>
  fields.map((f, i) => ({ seq: i + 1, fields: f }) as Entry);

const seqs = (out: Entry[]) => out.map((e) => e.seq);

/* ── sorting ─────────────────────────────────────────────────────────────── */

test('money sorts by magnitude, because it is an integer and not a label', () => {
  // The classic: as text, "480000" sorts before "96000". As money, GBP 960 is the smaller.
  const out = sortRows('obligations', rows({ amount: 480_000 }, { amount: 96_000 }, { amount: 1_910_000 }), 'amount', 'asc');
  assert.deepEqual(out.map((e) => e.fields.amount), [96_000, 480_000, 1_910_000]);
});

test('days sort chronologically', () => {
  const out = sortRows('obligations', rows({ due: '2026-11-05' }, { due: '2026-07-27' }, { due: '2027-01-28' }), 'due', 'asc');
  assert.deepEqual(out.map((e) => e.fields.due), ['2026-07-27', '2026-11-05', '2027-01-28']);
});

test('descending is the exact reverse, not a different order', () => {
  const given = rows({ amount: 300 }, { amount: 100 }, { amount: 200 });
  const up = sortRows('obligations', given, 'amount', 'asc').map((e) => e.fields.amount);
  const down = sortRows('obligations', given, 'amount', 'desc').map((e) => e.fields.amount);
  assert.deepEqual(down, [...up].reverse());
});

test('a missing value sorts last in BOTH directions', () => {
  // Nulls last either way is the right behaviour and the easy one to get wrong: flipping the sign
  // on a null comparison sends the empty rows to the top the moment somebody clicks the header
  // twice, which reads as the list breaking.
  for (const dir of ['asc', 'desc'] as const) {
    const out = sortRows('obligations', rows({ amount: 200 }, { amount: null }, { amount: 100 }), 'amount', dir);
    assert.equal(out[out.length - 1]?.fields.amount, null, `an empty row floated to the top in ${dir}`);
  }
});

test('ties break by seq, so the order is stable and the same every time', () => {
  const out = sortRows('obligations', rows({ amount: 100 }, { amount: 100 }, { amount: 100 }), 'amount', 'asc');
  assert.deepEqual(seqs(out), [1, 2, 3]);
});

test('sorting does not mutate what it was given', () => {
  const given = rows({ amount: 300 }, { amount: 100 });
  sortRows('obligations', given, 'amount', 'asc');
  assert.deepEqual(seqs(given), [1, 2], 'the caller’s array was reordered underneath it');
});

test('text sorts the way a person reads a list, not the way a byte compares', () => {
  // `<` on strings compares UTF-16 code units: every capital sorts before every lowercase, so
  // "Zebra" lands above "apple", and anything accented lands after "z". A column of party names is
  // exactly where that shows.
  const out = sortRows('people', rows({ name: 'apple' }, { name: 'Zebra' }, { name: 'Ökonkwo' }, { name: 'Banks' }), 'name', 'asc');
  assert.deepEqual(out.map((e) => e.fields.name), ['apple', 'Banks', 'Ökonkwo', 'Zebra']);
});

/* ── filtering ───────────────────────────────────────────────────────────── */

const OBL = rows(
  { state: 'open', direction: 'owed_to_me', due: '2026-07-27' },
  { state: 'paid', direction: 'owed_to_me', due: '2026-09-14' },
  { state: 'open', direction: 'owed_by_me', due: '2026-11-05' },
);

test('`in` keeps a row matching any of its values', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: ['open', 'paid'] }])), [1, 2, 3]);
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: ['paid'] }])), [2]);
});

test('an empty `in` keeps nothing, which is what the reader asked for', () => {
  // Not "keeps everything". A filter chip showing zero selected values and a full list underneath
  // is a filter that silently ignored you.
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: [] }])), []);
});

test('before and after are exclusive of the day named', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'due', op: 'before', values: ['2026-09-14'] }])), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'due', op: 'after', values: ['2026-09-14'] }])), [3]);
});

test('two filters are AND, never OR', () => {
  const out = applyFilters('obligations', OBL, [
    { field: 'state', op: 'in', values: ['open'] },
    { field: 'direction', op: 'in', values: ['owed_to_me'] },
  ]);
  assert.deepEqual(seqs(out), [1]);
});

test('no filters and no query is the whole list, untouched', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [])), [1, 2, 3]);
});

/* ── search ──────────────────────────────────────────────────────────────── */

test('search matches what is on the screen, not what is in the row', () => {
  // A DELIBERATE CHOICE with a real consequence: the query runs against `display()`, so a person
  // who reads "GBP 4,800.00" and types "4,800" finds it. Typing the stored minor units does not,
  // and should not — nobody has ever read 480000 off this screen.
  const money = rows({ amount: { amount: 480_000, currency: 'GBP' } }, { amount: { amount: 96_000, currency: 'GBP' } });
  assert.deepEqual(seqs(applyFilters('obligations', money, [], '4,800')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', money, [], '480000')), []);
});

test('search is case-insensitive', () => {
  const people = rows({ name: 'Halden Type Co' }, { name: 'Pell & Vine' });
  assert.deepEqual(seqs(applyFilters('people', people, [], 'HALDEN')), [1]);
  assert.deepEqual(seqs(applyFilters('people', people, [], 'halden')), [1]);
});

test('search reaches an enum by the words it shows, not the identifier it stores', () => {
  // `owed_to_me` renders as "owed to me", so that is what a person types.
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [], 'owed to me')), [1, 2]);
});

test('a filter and a query are both applied', () => {
  const out = applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: ['open'] }], 'owed to me');
  assert.deepEqual(seqs(out), [1]);
});
