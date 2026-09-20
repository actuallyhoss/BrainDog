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

import { openRecord, type Arrived, type Declaration, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { CATEGORIES, INSTALLMENTS, LOOKUPS, METRICS, NOW, OBLIGATIONS, REGISTERS, RECURRING_ITEMS, RULES, SNAPSHOTS, day, installSeed } from '../src/index.ts';
import { MONEY_INGESTS, nightOf } from '../src/modules/money.ts';

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
  const twice = k.create('snapshots', { what: taken.fields.what, on: taken.fields.on, cash: taken.fields.cash, taken: 'nightly' } as never, { actor: 'p_test' });
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

/* ── the four figures a night holds ──────────────────────────────────────── */

test('A NIGHT IS NAMED THE WAY A DAY IS PRINTED, so its rows can be found by the name they are shown under', async () => {
  const k = await seeded();

  /* THE TITLE IS SEARCHABLE AND `on` IS NOT, which is the whole of the fix: the kernel indexes the
     STORED value of a field, and a `day` stores `2026-08-04` where every screen prints `4 Aug 2026`.
     Declaring `search: true` on `on` made the browser and the record project different text for
     `snapshots#1`, measured, so the title is a text field holding the printed spelling. */
  const decl = REGISTERS.snapshots!;
  assert.equal(decl.title, 'what');
  assert.deepEqual(decl.fields.filter((f) => f.search === true).map((f) => f.id), ['what'], 'snapshots declares something other than its title as searchable');

  /* AND THE SPELLING IS `packages/render`'S. The seed may not depend on the renderer, so `nightOf` is
     a second copy of `day()`'s three parts, and this is what holds the two together. */
  assert.equal(nightOf('2026-08-04'), '4 Aug 2026');
  assert.equal(nightOf('2026-12-31'), '31 Dec 2026');
  assert.equal(nightOf('not-a-day'), 'not-a-day');
  /* AND THE GUARD HOLDS FOR THE HALF-DAYS, WHICH IS WHERE IT DID NOT. Checking the three parts for
     `undefined` catches `not-a-day`, which has no dashes, and misses every string that has two: a
     day of `xx` printed `NaN Aug 2026` and a year of `yyyy` printed `4 Aug yyyy`, both measured, and
     both of them the `Invalid Date` on screen the guard exists to stop. */
  for (const said of ['2026-08-xx', 'yyyy-08-04', '2026-08-', '2026-13-01', '04/08/2026', ''])
    assert.equal(nightOf(said), said, `${JSON.stringify(said)} was dressed up as a day`);

  for (const s of SNAPSHOTS) assert.equal(s.what, nightOf(String(s.on)), `${String(s.on)}: the night is named something other than its own day`);
  assert.equal(k.get('snapshots#1')!.fields.what, nightOf(String(SNAPSHOTS[0]!.on)));
});

test('THE WHOLE BOOK YOU OWE IS A FIGURE NOW, and it is the receivable one with the direction turned round', async () => {
  const k = await seeded();

  const live = OBLIGATIONS.filter((o) => o.state === 'open' || o.state === 'part');
  const byMe = live.filter((o) => o.direction === 'owed_by_me').reduce((n, o) => n + minor(o.amount), 0);
  assert.equal(reading(k, 'owed-by-you'), byMe);

  /* IT IS NOT `overdue`, WHICH IS ONLY THE PART ALREADY LATE, and the gap is most of the book: a
     snapshot filled from `overdue` would have understated what is owed by everything not yet due. */
  const late = reading(k, 'overdue')!;
  assert.ok(byMe > late * 1.5, `the payable book is ${byMe} and the late part is ${late}, so the sample no longer shows the difference`);

  /* AND ALL FOUR FIGURES A SNAPSHOT HOLDS HAVE ONE NOW, which is what a nightly writer reads. */
  assert.equal(typeof reading(k, 'cash-now'), 'number');
  assert.equal(typeof reading(k, 'owed-to-you'), 'number');
  const last = SNAPSHOTS.at(-1)!;
  assert.equal(minor(last.net), minor(last.cash) + minor(last.owed_to_me) - minor(last.owed_by_me));
});

/* ── a bank message becomes a row ────────────────────────────────────────── */

const INGESTS: Declaration[] = Object.values(MONEY_INGESTS).map((body) => ({ id: `ingest.${body.ingest}`, kind: 'ingest' as const, body: body as never }));

const CHARGE = 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.';
const CREDIT = 'HSBC: Your card ending 4471 was credited GBP 5,005.00 from NILE REALTY on 29/08/26.';

const forward = (k: Kernel, body: string, sha256: string) =>
  k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Card transaction' }, body, sha256 });

const arrived = (out: unknown): Arrived => {
  const r = out as { ok: boolean; value: Arrived; refusal?: { code: string; fix: string } };
  assert.ok(r.ok, r.ok ? '' : `${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value;
};

test('A FORWARDED BANK MESSAGE BECOMES A LEDGER ROW, in both directions and with no model in it', async () => {
  const k = await seeded();
  assert.ok((await k.install(INGESTS)).ok, 'the patterns do not install');
  const before = k.count('transactions');

  const out = arrived(forward(k, CHARGE, 'sms-1'));
  assert.equal(out.state, 'matched', out.reason ?? '');
  assert.equal(out.ingest, 'bank-card-out');
  /* `exact` OR NOTHING WAS WRITTEN. A chosen or defaulted field files the arrival at `proposed`,
     which opens a suggestion and leaves the ledger empty, so this is the assertion that says the
     five forms are five straight reads rather than five guesses. */
  assert.equal(out.confidence, 'exact');
  assert.equal(k.count('transactions'), before + 1);

  const charge = k.get(out.wrote[0]!)!;
  assert.equal(charge.fields.what, 'FENWICK CLOUD');
  assert.equal(charge.fields.direction, 'out');
  assert.deepEqual(charge.fields.amount, { amount: 4_299, currency: 'GBP' }, 'the card digits were read as the amount, or the money is not in minor units');
  assert.equal(charge.fields.on, '2026-09-18');
  /* THE ACCOUNT IS THE CARD, resolved by the four digits the message names — the one required field
     no forwarded alert could fill before `accounts.last4` existed. */
  assert.equal(charge.fields.account, k.get('accounts#3')?.id, 'the lookup did not land on the company card');

  const back = arrived(forward(k, CREDIT, 'sms-2'));
  assert.equal(back.state, 'matched', back.reason ?? '');
  assert.equal(back.ingest, 'bank-card-in');
  const paid = k.get(back.wrote[0]!)!;
  assert.equal(paid.fields.what, 'NILE REALTY');
  assert.equal(paid.fields.direction, 'in');
  assert.deepEqual(paid.fields.amount, { amount: 500_500, currency: 'GBP' });
  assert.equal(paid.fields.on, '2026-08-29');
});

test('AND AN ARRIVAL NOBODY UNDERSTANDS IS STILL STORED, which is the rule these patterns may not weaken', async () => {
  const k = await seeded();
  assert.ok((await k.install(INGESTS)).ok);
  const before = k.count('transactions');

  /* A THIRD WORDING, from a bank nothing here has a pattern for. It is not dropped and it is not
     guessed at: `untriaged` is the state a proposal is later made from. */
  const strange = arrived(forward(k, 'Monzo: You spent 12.00 at THE KILN yesterday.', 'sms-3'));
  assert.equal(strange.state, 'untriaged');
  assert.equal(strange.ingest, null);
  assert.equal(k.count('transactions'), before, 'a message nothing recognised wrote a row anyway');

  /* AND A REFUND RECOGNISES ITSELF AND IS NOT A CHARGE. `07 §2` names it: the skip list is why the
     charge pattern does not write money back out again the wrong way round. */
  const refund = arrived(forward(k, 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. This reverses a refund.', 'sms-4'));
  assert.equal(refund.state, 'skipped');
  assert.equal(refund.ingest, 'bank-card-out');
  assert.equal(k.count('transactions'), before, 'a skipped arrival wrote a row');

  /* AND AN ACCOUNT NOBODY HOLDS IS A QUESTION RATHER THAN A GUESS. `transactions.account` is a
     required ref and `lookup:` has nothing to land on, so the arrival goes to `review` naming the
     field it could not read, and the ledger stays as it was. */
  const nowhere = arrived(forward(k, 'HSBC: Your card ending 0000 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26.', 'sms-5'));
  assert.equal(nowhere.state, 'review');
  assert.equal(nowhere.confidence, 'needs-review');
  assert.equal(k.count('transactions'), before, 'an account nothing matched still wrote a row');
});

test('A MESSAGE THAT NAMES BOTH VERBS IS CLAIMED BY THE FIRST PATTERN, which is what splitting on the verb does not prevent', async () => {
  const k = await seeded();
  assert.ok((await k.install(INGESTS)).ok);
  const before = k.count('transactions');

  /**
   * MEASURED, BECAUSE THE DECLARATION READS AS THOUGH THE TWO PATTERNS WERE EXCLUSIVE AND THEY ARE NOT.
   *
   * `bank-card-out` wants `debited` and `bank-card-in` wants `credited`, and a body carrying both
   * satisfies both `match:` clauses. `arrive` takes the first that matches, which is the order
   * `MONEY_INGESTS` is written in, so such a message is filed as a payment OUT at `exact` and the
   * credit half is never read. No bank alert in the sample names both verbs; a statement digest
   * that did would be filed one way round with no sign that the other was possible. This is here so
   * that a wording which makes it possible is a test going red rather than a wrong row in the book.
   */
  const both = arrived(forward(k, 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26, and credited GBP 1.00 from NILE REALTY on 18/09/26.', 'sms-both'));
  assert.equal(both.state, 'matched');
  assert.equal(both.ingest, 'bank-card-out', 'the arm that claims a two-verb message changed');
  assert.equal(both.confidence, 'exact');
  assert.equal(k.count('transactions'), before + 1, 'both arms wrote, so one movement became two rows');
  assert.equal(k.get(both.wrote[0]!)!.fields.direction, 'out');
  assert.deepEqual(Object.keys(MONEY_INGESTS), ['bank-card-out', 'bank-card-in'], 'the declared order is what decides this, so it is part of the assertion');
});

test('THE SAME BYTES TWICE ARE ONE ROW, and the same movement in two wordings is what the near key is for', async () => {
  const k = await seeded();
  assert.ok((await k.install(INGESTS)).ok);
  const before = k.count('transactions');

  assert.equal(arrived(forward(k, CHARGE, 'sms-1')).state, 'matched');
  /* A REDELIVERY IS THE ORDINARY CASE. Every webhook sender retries and most mail servers do too, and
     the raw's own `sha256` is what makes the second one free: the record hands back what it did the
     first time rather than doing it again, so one charge is one row and not two. */
  const twice = arrived(forward(k, CHARGE, 'sms-1'));
  assert.equal(twice.redelivered, true, 'the same bytes were read as a new arrival');
  assert.equal(k.count('transactions'), before + 1, 'a redelivery wrote a second charge');

  /**
   * AND THE OTHER HALF IS DECLARED AND CANNOT BE MEASURED FROM HERE, which is worth saying rather
   * than leaving as a gap in this file.
   *
   * `SAME_MOVEMENT` is `07 §2`'s near key: same account, same amount, the day within one either way,
   * the first twelve characters of the description equal — so `FENWICK CLOUD` and `FENWICK CLOUD LTD`
   * a day apart are one charge. `existingRow` answers the near form only when a `duplicate` reader is
   * injected, and `@braindog/record` injects `isDuplicate` from `@braindog/extract` for exactly this
   * sentence. A bare `openRecord`, which is what this file opens, carries no reader and therefore
   * writes the second copy: measured here, 38 rows where the near key would leave 37. `packages/seed`
   * may not depend on `@braindog/extract` — `tools/gates/graph.mjs` holds that edge — so what this
   * asserts is the key the declaration carries, and `packages/record` is where the comparison runs.
   */
  const near = MONEY_INGESTS['bank-card-out']!.dedupe;
  assert.deepEqual(near, { near: { on: ['amount', 'account'], day: 'on', prefix: { field: 'what', chars: 12 } } });
  assert.equal(MONEY_INGESTS['bank-card-in']!.dedupe, near, 'the two patterns dedupe on different keys, so one bank would write both rows');
});
