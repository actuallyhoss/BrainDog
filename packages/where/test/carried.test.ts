/**
 * What the browser's engine got right, carried into the record's parser, and the day words a figure's window is said in.
 *
 * FOUR CHECKS WERE THE BROWSER'S BEFORE ITS ENGINE WENT (H.361): a money literal read in its currency's own units, an
 * instant compared by the day, a field, a value and a ref spelled the way a screen spells them, and a count of every
 * match when no row is asked for. `where.ts` in the app now reads this package's parser, so each of the four is held
 * here once, against a real record, where a regression would otherwise pass every browser test.
 *
 * AND A DAY WORD CARRIES AN OFFSET (H.271): `bom-1m` is the start of last month, so last month's spending is one
 * sentence. The printer and the parser are one table (`daySaid`), pinned here at a month end, where `eom-1m` read as
 * "a month before the last day" and as "the last day of last month" are different days.
 *
 * THE PROOF RUNS AGAINST THE KERNEL, imported by path as `sentence-compare.test.ts` does: `where` declares no
 * dependency on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { daySaid, parseWhere, resolveDay } from '../src/sentence.ts';
import type { Schema } from '../src/index.ts';
import { openRecord, type Declaration, type Kernel } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const at = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/* ── the day words, with an offset ───────────────────────────────────────── */

test('A DAY WORD CARRIES AN OFFSET: bom-1m is the first of last month, eom-1m its last, boy-1y the first of last year', () => {
  for (const [word, now, day] of [
    ['bom-1m', '2026-10-09', '2026-09-01'],
    ['eom-1m', '2026-10-09', '2026-09-30'],
    ['boy-1y', '2026-10-09', '2025-01-01'],
    ['eoy-1y', '2026-10-09', '2025-12-31'],
    ['bow-1w', '2026-10-09', '2026-09-28'],
    ['bom+1m', '2026-12-15', '2027-01-01'],
    ['bom-3m', '2026-01-15', '2025-10-01'],
    ['eom+5d', '2026-10-09', '2026-11-05'],
    ['boy+1m', '2026-05-05', '2026-02-01'],
  ] as const)
    assert.equal(resolveDay(word, at(now)), day, `${word} on ${now}`);
});

test('AT A MONTH END the end of last month is its last day, not a month before this one', () => {
  /* 30 September: a month before is 30 August, and the end of last month is the 31st. */
  assert.equal(resolveDay('eom-1m', at('2026-09-30')), '2026-08-31');
  assert.equal(resolveDay('eom-1m', at('2026-03-31')), '2026-02-28');
  assert.equal(resolveDay('eom-1m', at('2028-03-01')), '2028-02-29');
  /* AND THE START IS THE SAME DAY BOTH WAYS, which is why the risk the scope names cannot bite it. */
  assert.equal(resolveDay('bom-1m', at('2026-03-31')), '2026-02-01');
});

test('THE PRINTER SAYS IT, and what it says parses back to the same day', () => {
  assert.equal(daySaid('bom-1m'), 'the start of last month');
  assert.equal(daySaid('eom-1m'), 'the end of last month');
  assert.equal(daySaid('boy-1y'), 'the start of last year');
  assert.equal(daySaid('bom'), 'the start of this month');
  assert.equal(daySaid('bom-3m'), 'the start of the month 3 months ago');
  assert.equal(daySaid('eom+5d'), '5 days after the end of this month');
  assert.equal(daySaid('+30d'), '30 days from now');
  assert.equal(daySaid('today'), null);
  for (const word of ['bom-1m', 'eom-1m', 'boy-1y', 'eoy+1y', 'bow-2w', 'bom-3m', 'eom+5d', 'boy+1m', 'bom', 'eoy', '+30d', '-1w']) {
    const said = daySaid(word)!;
    assert.equal(resolveDay(said, NOW), resolveDay(word, NOW), `${word} printed as "${said}"`);
  }
  /* A LINK CARRIES FOUR WORDS AT MOST (`wordFor` in the app), so the phrase reads without its "the" too. */
  assert.equal(resolveDay('start of last month', NOW), '2026-09-01');
});

test('ONE SPELLING A DAY: a phrase the printer would not say, and a year with no word to hang on, are refused', () => {
  assert.equal(resolveDay('the start of the month 1 month ago', NOW), null);
  assert.equal(resolveDay('1 month before the start of this month', NOW), null);
  assert.equal(resolveDay('the end of this week', NOW), null);
  assert.equal(resolveDay('+2y', NOW), null);
  assert.equal(resolveDay('bom-1q', NOW), null);
  assert.equal(resolveDay('today-1d', NOW), null);
});

/* ── against a real record ───────────────────────────────────────────────── */

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const SPEND: Declaration = {
  id: 'register.spend',
  kind: 'register',
  body: {
    id: 'spend',
    name: 'Spending',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, label: 'Merchant' },
      { id: 'state', type: 'enum', values: ['open', 'owed_to_me'], labels: { owed_to_me: 'Owed to me' } },
      { id: 'amount', type: 'money' },
      { id: 'on', type: 'day' },
      { id: 'seen', type: 'instant' },
      { id: 'thing', type: 'ref', to: 'things' },
    ],
  } as never,
};

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([THINGS, SPEND]);
  assert.ok(out.ok, JSON.stringify(out));
  const kiln = k.create('things', { name: 'Kiln' }, { actor: 'p_1' });
  assert.ok(kiln.ok);
  assert.ok(k.create('things', { name: 'Loom' }, { actor: 'p_1' }).ok);
  const thing = kiln.ok ? kiln.value.id : '';
  for (const fields of [
    { what: 'Uber', state: 'open', amount: { amount: 10_000, currency: 'EGP' }, on: '2026-08-31', seen: '2026-08-31T23:30:00.000Z' },
    { what: 'Lyft', state: 'open', amount: { amount: 10_000, currency: 'GBP' }, on: '2026-09-01', seen: '2026-09-01T00:10:00.000Z', thing },
    { what: 'Rent', state: 'owed_to_me', amount: { amount: 25_000, currency: 'EGP' }, on: '2026-09-15', seen: '2026-09-15T11:57:00.000Z', thing },
    { what: 'Cafe', state: 'open', amount: { amount: 9_999, currency: 'EGP' }, on: '2026-09-30', seen: '2026-09-30T23:59:00.000Z' },
    { what: 'Taxi', state: 'open', amount: { amount: 500, currency: 'JPY' }, on: '2026-10-01', seen: '2026-10-01T00:00:00.000Z' },
  ])
    assert.ok(k.create('spend', fields, { actor: 'p_1' }).ok, fields.what);
  return k;
}

const listed = (k: Kernel, where: string, limit = 50): string => {
  const out = k.list({ register: 'spend', where: where as never, limit });
  if (!out.ok) return `refused ${'refusal' in out ? `${out.refusal.code}: ${out.refusal.fix}` : 'with a conflict'}`;
  return out.value.rows.map((r) => String(r.fields.what)).sort().join(' ');
};

test("LAST MONTH'S SPENDING IN ONE SENTENCE: the two words read the rows the two dates written out read", async () => {
  const k = await seeded();
  const words = listed(k, 'on at least bom-1m, on before bom');
  assert.equal(words, 'Cafe Lyft Rent');
  assert.equal(words, listed(k, 'on at least 2026-09-01, on before 2026-10-01'));
  assert.equal(listed(k, 'on at least the start of last month, on at most the end of last month'), words);
});

test('CHECK 1, MONEY: a literal is read in its own units, and never compared across currencies', async () => {
  const k = await seeded();
  assert.equal(listed(k, 'amount at least EGP 100'), 'Rent Uber');
  assert.equal(listed(k, 'amount at least 100 egp'), 'Rent Uber');
  assert.equal(listed(k, 'amount at least EGP 99.99'), 'Cafe Rent Uber');
  /* A YEN HAS NO MINOR UNIT: JPY 500 is 500, not 50,000. */
  assert.equal(listed(k, 'amount at least JPY 500'), 'Taxi');
  assert.match(listed(k, 'amount at least 100'), /^refused MONEY_LITERAL_NEEDS_CURRENCY/);
  assert.match(listed(k, 'amount at least JPY 12.5'), /^refused VALUE_MALFORMED/);
  assert.match(listed(k, 'amount at least XYZ 1'), /^refused CURRENCY_UNKNOWN/);
});

test('CHECK 2, AN INSTANT IS ASKED ABOUT BY THE DAY: `on` holds the whole day, `before` and `after` leave it out', async () => {
  const k = await seeded();
  assert.equal(listed(k, 'seen on 2026-09-01'), 'Lyft');
  assert.equal(listed(k, 'seen on 2026-09-30'), 'Cafe');
  assert.equal(listed(k, 'seen after 2026-09-30'), 'Taxi');
  assert.equal(listed(k, 'seen before 2026-09-01'), 'Uber');
  assert.equal(listed(k, 'seen at least bom-1m, seen at most eom-1m'), 'Cafe Lyft Rent');
});

test('CHECK 3, THE SPELLINGS A SCREEN USES: a field by its label, a value in any case, a ref by name or by number', async () => {
  const k = await seeded();
  assert.equal(listed(k, 'Merchant contains uber'), 'Uber');
  assert.equal(listed(k, 'state is Owed to me'), 'Rent');
  assert.equal(listed(k, 'state is OWED TO ME'), 'Rent');
  assert.equal(listed(k, 'state is owed_to_me'), 'Rent');
  assert.equal(listed(k, 'thing is Kiln'), 'Lyft Rent');
  assert.equal(listed(k, 'thing is things#1'), 'Lyft Rent');
  assert.equal(listed(k, 'thing is things#2'), '');
  assert.match(listed(k, 'thing is things#9'), /^refused REF_UNKNOWN/);
});

test('CHECK 4, THE COUNT IS EVERY MATCH: `matched` is the whole count whatever page is asked for, limit 0 among them', async () => {
  /* THE KERNEL READS limit 0 AS NO LIMIT GIVEN and answers its first page with the count, so a caller after the count
     alone reads `matched` and leaves the rows. What is held is the number: never the page's length. */
  const k = await seeded();
  for (const [where, n] of [
    ['state is open', 4],
    ['on at least bom-1m, on before bom', 3],
    ['amount at least EGP 100', 2],
  ] as const)
    for (const limit of [0, 1]) {
      const out = k.list({ register: 'spend', where: where as never, limit });
      assert.ok(out.ok, where);
      if (!out.ok) continue;
      assert.equal(out.value.matched, n, `${where}, limit ${limit}`);
      if (limit === 1) assert.equal(out.value.rows.length, 1, where);
    }
});

test('THE PARSER WITH NO RECORD SAYS THE SAME DAY, so a page, a rule and an agent read one grammar', () => {
  const schema: Schema = { register: 'spend', fields: { on: { type: 'day' } } };
  const read = parseWhere('on at least bom-1m, on before bom', schema, { nowMs: NOW });
  assert.deepEqual(read.bad, []);
  assert.deepEqual(read.predicate, { all: [{ field: 'on', gte: '2026-09-01' }, { field: 'on', before: '2026-10-01' }] });
});
