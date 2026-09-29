/**
 * Two equal legs are a tie, and a tie the rows cannot be told apart in is not a guess.
 *
 * `nearestOf` leaves a row unpaired when two candidates are equally near, so that which of two credits hid a payment
 * never depends on the order a bank printed them in. It also fired where every way of matching the legs hides the same
 * money. One: an EGP 100,000.00 move sent as two halves of 50,000.00 because of a daily limit, four rows on one day,
 * CIB to HSBC, and nothing paired: Spent and Received each read 100,000.00. Two: EGP 5,000.00 CIB to HSBC twice, each
 * landing the next day, and the two middle legs each stood a day from two candidates, so nothing paired and Spent read
 * 10,000.00.
 *
 * THE RULE THE REPAIR TAKES. The legs that mirror one another, followed from row to row, are one set. When a tie stands
 * in it and the set holds as many legs one way as the other, they are matched in day order, first out with first in,
 * which on a line is the matching whose days are nearest in total, and the same one whatever order the rows were
 * written in. When the counts differ some leg is left over and which one is a guess, so the set is refused as before
 * (`pairs-undo.test.ts`, A TIE IS NOT GUESSED).
 *
 * EVERY FIGURE HERE IS READ THE WAY THE LEDGER PAGE READS IT, as `pairs-undo.test.ts` reads it: `k.list` with Money's
 * `spent-30d` and `received-30d` sentences minus the date window.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const BANK = { actor: 'ingest:bank' };
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    state: 'state',
    done: ['cleared', 'void'],
    pairs: { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved', where: { field: 'state', is: 'cleared' } },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
};

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function ledger(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([LEDGER])).ok);
  return k;
}

type Line = { what: string; on: string; direction: 'in' | 'out'; pounds: number; account: string };
const line = (k: Kernel, l: Line): Entry =>
  made(k.create('ledger', { what: l.what, on: l.on, direction: l.direction, amount: { amount: l.pounds * 100, currency: 'EGP' }, account: l.account }, BANK));

/** Money's `spent-30d` or `received-30d` without the window, in whole pounds. */
const total = (k: Kernel, direction: 'in' | 'out'): number =>
  (made(k.list({ register: 'ledger', where: `state is cleared, moved is false, direction is ${direction}`, limit: 500 })) as unknown as { rows: Entry[] }).rows.reduce(
    (n, r) => n + (r.fields.amount as { amount: number }).amount / 100,
    0,
  );

/** Every row's partner by its `what`, so a failure prints the ledger as a person reads it. */
const partners = (k: Kernel, ids: Record<string, string>): Record<string, string | null> => {
  const name = new Map(Object.entries(ids).map(([what, id]) => [id, what]));
  return Object.fromEntries(
    Object.entries(ids).map(([what, id]) => {
      const to = k.get(id)!.fields._pair;
      return [what, typeof to === 'string' ? (name.get(to) ?? to) : null];
    }),
  );
};

/** Writes the lines in the order given and answers each one's id by its `what`. */
const write = (k: Kernel, lines: readonly Line[]): Record<string, string> => Object.fromEntries(lines.map((l) => [l.what, line(k, l).id]));

const SPLIT: readonly Line[] = [
  { what: 'CIB OUT 1', on: DAY(0), direction: 'out', pounds: 50_000, account: 'cib' },
  { what: 'CIB OUT 2', on: DAY(0), direction: 'out', pounds: 50_000, account: 'cib' },
  { what: 'HSBC IN 1', on: DAY(0), direction: 'in', pounds: 50_000, account: 'hsbc' },
  { what: 'HSBC IN 2', on: DAY(0), direction: 'in', pounds: 50_000, account: 'hsbc' },
];

test('ONE MOVE SENT AS TWO EQUAL HALVES ON ONE DAY PAIRS BOTH HALVES, in whichever order the two banks list them', async () => {
  for (const order of [
    [0, 1, 2, 3],
    [2, 3, 0, 1],
    [0, 2, 1, 3],
    [3, 1, 2, 0],
  ]) {
    const k = await ledger();
    const ids = write(
      k,
      order.map((i) => SPLIT[i]!),
    );
    const got = partners(k, ids);
    /* Before the repair every value here was null and both figures read 100,000. */
    for (const [what, to] of Object.entries(got)) {
      assert.notEqual(to, null, `${order.join(', ')}: ${what} was left unpaired, ${JSON.stringify(got)}`);
      assert.equal(got[to!], what, `${order.join(', ')}: ${what} names ${to}, which does not name it back`);
      assert.notEqual(what.slice(0, 4), to!.slice(0, 4), `${what} was paired inside its own bank`);
    }
    assert.equal(total(k, 'out'), 0, `${order.join(', ')}: EGP 100,000.00 that only moved read as spent`);
    assert.equal(total(k, 'in'), 0);
  }
});

test('TWO EQUAL TOP-UPS A DAY APART PAIR IN DAY ORDER, each out with the in that followed it', async () => {
  const k = await ledger();
  const ids = write(k, [
    { what: 'CIB OUT A', on: DAY(-10), direction: 'out', pounds: 5_000, account: 'cib' },
    { what: 'HSBC IN A', on: DAY(-9), direction: 'in', pounds: 5_000, account: 'hsbc' },
    { what: 'CIB OUT B', on: DAY(-8), direction: 'out', pounds: 5_000, account: 'cib' },
    { what: 'HSBC IN B', on: DAY(-7), direction: 'in', pounds: 5_000, account: 'hsbc' },
  ]);
  /* Before the repair all four were null and Spent read 10,000: the middle legs were each a day from two rows. */
  assert.deepEqual(partners(k, ids), { 'CIB OUT A': 'HSBC IN A', 'HSBC IN A': 'CIB OUT A', 'CIB OUT B': 'HSBC IN B', 'HSBC IN B': 'CIB OUT B' });
  assert.equal(total(k, 'out'), 0);
});

test('A CHAIN OF THREE MOVES IS MATCHED END TO END WHEN ITS LAST LEG ARRIVES, though the first move is no neighbour of that leg', async () => {
  const k = await ledger();
  const chain: Line[] = [0, 1, 2].flatMap((n) => [
    { what: `OUT ${n}`, on: DAY(2 * n), direction: 'out' as const, pounds: 1_000, account: 'cib' },
    { what: `IN ${n}`, on: DAY(2 * n + 1), direction: 'in' as const, pounds: 1_000, account: 'hsbc' },
  ]);
  const ids = write(k, chain);
  /* THE WHOLE SET IS SETTLED AGAIN, NOT ONLY THE WRITTEN ROW'S NEIGHBOURS. `IN 2` is five days from `OUT 0`, outside
     the window, and neither `OUT 0` nor `IN 0` was paired before it arrived, so no `_pair` leads there either. With the
     set taken out of what `settle` follows, measured: those two stayed null, and Spent and Received read 1,000 each. */
  assert.deepEqual(partners(k, ids), { 'OUT 0': 'IN 0', 'IN 0': 'OUT 0', 'OUT 1': 'IN 1', 'IN 1': 'OUT 1', 'OUT 2': 'IN 2', 'IN 2': 'OUT 2' });
  assert.equal(total(k, 'out'), 0);
  assert.equal(total(k, 'in'), 0);
});

test('LEGS ON ONE DAY IN DIFFERENT ACCOUNTS GET ONE ANSWER IN EVERY ORDER, and none is paired inside its own account', async () => {
  /* TWO MOVES OF THE SAME SIZE ON ONE DAY, NBE to CIB and CIB to HSBC, so the CIB out may not take the CIB in. Every in
     is tied between the two outs. Ordering one day's legs by `seq` alone made the answer the banks' listing order:
     measured, three orders paired all four and the order listing the CIB in before the HSBC in paired none, so Spent
     read 0 or 1,400 on the same four rows. With the account ordered before `seq` every order reads 1,400 and pairs
     none: first with first puts the two CIB legs together, so the set is answered leg by leg and every in is tied. That
     is the counted side, and a matching that finds the one valid pairing here is a larger change than this one. */
  const L: readonly Line[] = [
    { what: 'CIB OUT', on: DAY(0), direction: 'out', pounds: 700, account: 'cib' },
    { what: 'NBE OUT', on: DAY(0), direction: 'out', pounds: 700, account: 'nbe' },
    { what: 'HSBC IN', on: DAY(0), direction: 'in', pounds: 700, account: 'hsbc' },
    { what: 'CIB IN', on: DAY(0), direction: 'in', pounds: 700, account: 'cib' },
  ];
  const answers = new Set<string>();
  for (const order of [
    [0, 1, 2, 3],
    [0, 1, 3, 2],
    [3, 2, 1, 0],
    [1, 0, 3, 2],
  ]) {
    const k = await ledger();
    const got = partners(
      k,
      write(
        k,
        order.map((i) => L[i]!),
      ),
    );
    for (const [what, to] of Object.entries(got)) if (to !== null) assert.notEqual(what.split(' ')[0], to.split(' ')[0], `${what} was paired inside its own bank`);
    answers.add(JSON.stringify({ ...Object.fromEntries(Object.entries(got).sort()), spent: total(k, 'out') }));
  }
  assert.equal(answers.size, 1, [...answers].join('\n'));
});

test('COUNTS THAT DIFFER ARE STILL A GUESS: three equal outs and two equal ins on one day pair nothing', async () => {
  const k = await ledger();
  const ids = write(k, [
    ...[1, 2, 3].map((n) => ({ what: `CIB OUT ${n}`, on: DAY(0), direction: 'out' as const, pounds: 50_000, account: 'cib' })),
    ...[1, 2].map((n) => ({ what: `HSBC IN ${n}`, on: DAY(0), direction: 'in' as const, pounds: 50_000, account: 'hsbc' })),
  ]);
  /* Which out is the one left over is not in the ledger, so none is taken, as `A TIE IS NOT GUESSED` holds for one. */
  for (const [what, to] of Object.entries(partners(k, ids))) assert.equal(to, null, `${what} was paired by a guess`);
  assert.equal(total(k, 'out'), 150_000);
  assert.equal(total(k, 'in'), 100_000);
});

test('A HALF DELETED PUTS THE SET BACK TO A GUESS, and the half that was paired with it is counted again with the rest', async () => {
  const k = await ledger();
  const ids = write(k, SPLIT);
  assert.equal(total(k, 'out'), 0);
  made(k.update('ledger', ids['HSBC IN 2']!, { deleted_at: 'now' }, BANK));
  /* Two outs and one in: the in is equally near both, so all three count, and no row still names the deleted one. */
  const left = { 'CIB OUT 1': ids['CIB OUT 1']!, 'CIB OUT 2': ids['CIB OUT 2']!, 'HSBC IN 1': ids['HSBC IN 1']! };
  for (const [what, to] of Object.entries(partners(k, left))) assert.equal(to, null, `${what} kept a pair after the half was deleted`);
  for (const id of Object.values(left)) assert.equal(k.get(id)!.fields.moved, false);
  assert.equal(total(k, 'out'), 100_000);
  assert.equal(total(k, 'in'), 50_000);
});
