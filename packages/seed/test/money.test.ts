/**
 * The four registers that make a ledger readable, on a real record: what money is for, what comes
 * round, what is being paid in parts, and what the whole position was on a night.
 *
 * EACH TEST HERE IS ABOUT AN ARITHMETIC THAT WAS WRONG OR IMPOSSIBLE BEFORE IT. A repeating item and
 * a quarterly one added together is three units summed as one; a plan's total typed beside its parts
 * is two answers to one question; a night written twice is a line with a step in it that nothing
 * happened on. Every one of those is a refusal or a factor table here rather than a convention.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { CATEGORIES, INSTALLMENTS, LOOKUPS, METRICS, NOW, RECURRING_ITEMS, RULES, SNAPSHOTS, day, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const minor = (v: unknown): number => (v as { amount: number }).amount;

const reading = (k: Kernel, id: string): number | null => {
  const out = k.metric(METRICS[id] as never);
  assert.ok(out.ok, `${id}: ${sayOf(out)}`);
  return out.value.value;
};

test('A CATEGORY IS A ROW AND A SECOND OF THE SAME NAME IS REFUSED, naming the row that already holds it', async () => {
  const k = await seeded();
  assert.equal(k.count('categories'), CATEGORIES.length);

  const again = k.create('categories', { name: 'Software', direction: 'out', state: 'live' } as never, { actor: 'p_test' });
  assert.ok(refused(again), 'a second Software was written');
  assert.equal(again.refusal.code, 'ALREADY_KNOWN');
});

test('A REPEATING ITEM IS COUNTED AT ITS MONTHLY SHARE, and the naive sum of the same rows is wrong', async () => {
  const k = await seeded();
  assert.equal(k.count('recurring'), RECURRING_ITEMS.length);

  const live = RECURRING_ITEMS.filter((r) => r.state === 'live' && r.direction === 'out');
  const share = live.reduce((n, r) => n + minor(r.amount) * (LOOKUPS.per_month![String(r.every)] ?? 0), 0);
  assert.equal(reading(k, 'recurring-out-month'), Math.round(share));

  /* THE SAME ROWS ADDED WITHOUT THE FACTOR, which is what a figure that forgot `every` would say. The
     yearly insurance and the quarterly VAT are the whole of the gap, and it is most of the number. */
  const naive = live.reduce((n, r) => n + minor(r.amount), 0);
  assert.ok(naive > share * 1.5, `the naive sum is ${naive} against ${share}, so the sample no longer shows the mistake`);

  /* THE OTHER DIRECTION READS TOO, because a page that can only say what leaves is half a page. */
  const incoming = RECURRING_ITEMS.filter((r) => r.state === 'live' && r.direction === 'in');
  assert.equal(reading(k, 'recurring-in-month'), incoming.reduce((n, r) => n + minor(r.amount) * (LOOKUPS.per_month![String(r.every)] ?? 0), 0));
});

test('A PLAN IS THE SUM OF ITS PARTS, so what is left cannot disagree with the rows it is left of', async () => {
  const k = await seeded();
  assert.equal(k.count('installments'), INSTALLMENTS.length);

  const openOut = INSTALLMENTS.filter((i) => i.state === 'open' && i.direction === 'out');
  assert.equal(reading(k, 'installments-left'), openOut.reduce((n, i) => n + minor(i.amount), 0));

  /* AND THE PARTS ARE A PLAN. Two plans, eight parts and four, each part placed inside its own by
     `number` of `parts`, and the sum of a plan's rows is the plan's total with nowhere to drift to. */
  const press = INSTALLMENTS.filter((i) => i.plan === 'Proofing press');
  assert.equal(press.length, 8);
  assert.deepEqual(press.map((i) => i.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(press.map((i) => i.parts)).size, 1, 'the parts of one plan disagree about how many there are');
  assert.equal(press.reduce((n, i) => n + minor(i.amount), 0), 1_500_000);

  /* AND WHAT FALLS DUE INSIDE THE MONTH IS MONEY GOING OUT, WHICH THE FIGURE HAD NOT SAID. An
     instalment plan runs both ways here: the press is paid in eight parts out and the Halden licence
     arrives in four parts in. Without `direction is out` the figure summed the two, and reading it on
     this record gave 615000 where 375000 is going out, because the licence part due today is 240000
     of money coming the other way. `installments-left` beside it had the clause; this one did not. */
  const dueSoon = INSTALLMENTS.filter((i) => i.state === 'open' && i.direction === 'out' && String(i.due) < day(31));
  assert.ok(
    INSTALLMENTS.some((i) => i.state === 'open' && i.direction === 'in' && String(i.due) < day(31)),
    'no incoming instalment falls inside the window, so the direction clause proves nothing',
  );
  assert.equal(reading(k, 'installments-due-30d'), dueSoon.reduce((n, i) => n + minor(i.amount), 0));
});

test('A NIGHT IS WRITTEN ONCE, and its four figures are one position rather than four series', async () => {
  const k = await seeded();
  assert.equal(k.count('snapshots'), SNAPSHOTS.length);

  for (const s of SNAPSHOTS)
    assert.equal(minor(s.net), minor(s.cash) + minor(s.owed_to_me) - minor(s.owed_by_me), `${String(s.on)}: net is not cash plus what is owed to you less what you owe`);

  /* EXACTLY ONCE. A nightly job that runs twice is the ordinary case, not the odd one, and the record
     refuses the second rather than drawing a line with a step in it that nothing happened on. */
  const taken = k.get('snapshots#1')!;
  const twice = k.create('snapshots', { on: taken.fields.on, cash: taken.fields.cash, taken: 'nightly' } as never, { actor: 'p_test' });
  assert.ok(refused(twice), 'the night was written a second time');
  assert.equal(twice.refusal.code, 'ALREADY_KNOWN');
});

test('AN INSTALMENT DUE IS TOLD AND NOT ASKED, so the gate keeps only the questions that have an answer', async () => {
  const k = await seeded();

  /* IT ALREADY RAN, and `suppressed` is how the record says so: every row it matches carries the
     `once_per` marker from the install, so running it again would fire on none of them. */
  const out = k.dryRun(RULES['installment-due-soon'] as never);
  assert.ok(out.ok, sayOf(out));
  assert.ok(out.value.matches > 0, 'no instalment is due inside the week, so the rule demonstrates nothing');
  assert.equal(out.value.suppressed, out.value.matches, 'the rule did not fire over the seeded rows');

  /* AND IT PUT NOTHING ON DECIDE. The two rules above it ask, because there is a choice; this one
     tells, because there is not, and the count of open questions is how that is checked. */
  const open = k.governance('suggestion', { status: 'open' });
  assert.ok(open.ok, sayOf(open));
  const asked = open.value.map((q) => String((q as { opened_by?: unknown }).opened_by ?? '')).filter((by) => by.startsWith('rule:'));
  assert.deepEqual([...new Set(asked)].sort(), ['rule:cash-stale', 'rule:invoice-late'], 'a money rule started asking, or stopped');
});
