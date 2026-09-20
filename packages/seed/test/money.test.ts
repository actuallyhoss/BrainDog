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

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Arrived, type Declaration, type Kernel, type Leg } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { CATEGORIES, INSTALLMENTS, LOOKUPS, METRICS, NOW, OBLIGATIONS, PAGES, REGISTERS, RECURRING_ITEMS, RULES, SNAPSHOTS, day, firstPartyDocument, installSeed } from '../src/index.ts';
import { MONEY_HOME_SETTING, MONEY_INGESTS, MONEY_METRICS, MONEY_TARGET_SETTINGS, nightOf } from '../src/modules/money.ts';
import { USE_CASES } from '../src/usecases/index.ts';

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

/* ── an upgrade a record that already holds the pack can take ────────────── */

/**
 * The real door: `normalise`, `plan`, `install`, over a kernel, the way the record installs a pack.
 *
 * NOT `k.install(declarations)`, WHICH IS THE OTHER DOOR AND ANSWERS A DIFFERENT QUESTION. A bare
 * install writes declarations; `plan` is what compares a pack with what a record already holds, and
 * `REQUIRED_ON_POPULATED` lives on that comparison and nowhere else. A test that took the short way
 * in would have installed 1.3.0 over 1.2.0 without noticing that no customer can.
 */
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

type Landed = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

const said = (out: Landed): string => (out.ok ? '' : `${out.refusal?.code} at ${out.refusal?.at}: ${out.refusal?.fix}`);

async function put(k: Kernel, doc: unknown): Promise<Landed> {
  const read = await normalise(doc, { kind: 'local' });
  assert.ok(read.ok, sayOf(read));
  const pack = read.value as Pack;
  const diff = await plan(pack, stateOf(k));
  return (await install(pack, diff, hostFor(k), diff.planHash)) as Landed;
}

const document = (id: string): Record<string, unknown> => firstPartyDocument(id, { seeds: [] })!;

/**
 * money-core's `snapshots` as 1.2.0 declared it: `on` as the title, and no `what` at all.
 *
 * BUILT BY TAKING THE FIELD BACK OUT RATHER THAN BY PASTING AN OLD BODY, so the two documents differ
 * in exactly the one thing this test is about. Everything else the version added is left in place:
 * `accounts.last4` and `owed-by-you` are additions no record refuses, and including them in the
 * older document keeps the diff down to the field whose requirement is the question.
 */
function asTwelve(doc: Record<string, unknown>): Record<string, unknown> {
  const declarations = (doc.declarations as Record<string, unknown>[]).map((d) =>
    d.register !== 'snapshots'
      ? d
      : {
          ...d,
          title: 'on',
          mobile: (d.mobile as string[]).map((f) => (f === 'what' ? 'on' : f)),
          fields: (d.fields as Record<string, unknown>[]).filter((f) => f.id !== 'what'),
        },
  );
  return { ...doc, version: '1.2.0', declarations };
}

test('money-core 1.3.0 INSTALLS OVER 1.2.0 ON A RECORD THAT ALREADY HOLDS A SNAPSHOT, which is the upgrade every such record is offered', async () => {
  /**
   * A REQUIRED FIELD ADDED TO A POPULATED LIST IS REFUSED AT THE DOOR, and `snapshots.what` was one.
   *
   * `declare`'s `unreadable` records a `required: true` with no `default` where the installed body
   * had neither, and `install` answers `REQUIRED_ON_POPULATED`: *"Ship a default or a fill rule."*
   * So a person on 1.2.0 with one night in the register could not take 1.3.0, and the sentence they
   * would have seen names a field they have never heard of on a list a nightly job writes.
   *
   * AND THE THREE REPAIRS THE REFUSAL OFFERS WERE WEIGHED AND TWO OF THEM ARE NOT REACHABLE HERE.
   * A `default` is one stored constant, so every night before the upgrade would be named the same
   * thing, which is worse than unnamed. A fill rule does not clear the refusal at all: `unreadable`
   * looks at `default` and nothing else, and a rule runs after an install that never happens; the
   * only template `fill` could write is `{{on}}`, the STORED day, so the upgraded rows would read
   * `2026-08-04` under a list whose new rows read `4 Aug 2026`. `derived: true` is the kernel's own
   * flag, *set by nothing today*, and it refuses every write, so the seed could not fill it either.
   * What is left is the honest one: the title is optional, the nightly writer always names the
   * night, and a night written before 1.3.0 keeps the date it has always had.
   */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  for (const id of ['portfolio', 'people']) assert.ok((await put(k, document(id))).ok, id);

  const twelve = await put(k, asTwelve(document('money-core')));
  assert.ok(twelve.ok, `1.2.0 did not install: ${said(twelve)}`);

  const night = k.create('snapshots', { on: '2026-08-04', cash: { amount: 985_000, currency: 'GBP' }, taken: 'nightly' } as never, { actor: 'p_test' });
  assert.ok(night.ok, sayOf(night));
  assert.equal(k.count('snapshots'), 1);

  const three = await put(k, document('money-core'));
  assert.ok(three.ok, `a record on 1.2.0 with one snapshot cannot take 1.3.0: ${said(three)}`);

  /* AND THE NIGHT THAT WAS THERE IS STILL THERE, which is the other half of the upgrade: a field
     added to a populated list may not cost a row. */
  assert.equal(k.count('snapshots'), 1);
  assert.equal(k.get('snapshots#1')!.fields.on, '2026-08-04');

  /* AND A NIGHT WRITTEN AFTER THE UPGRADE CARRIES ITS NAME, so the field is worth having. */
  const named = k.create('snapshots', { what: nightOf('2026-08-05'), on: '2026-08-05', cash: { amount: 1, currency: 'GBP' }, taken: 'nightly' } as never, { actor: 'p_test' });
  assert.ok(named.ok, sayOf(named));
  assert.equal(k.get('snapshots#2')!.fields.what, '5 Aug 2026');
});

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

  /* READ OVER `obligations` BECAUSE THAT IS WHERE THE FIGURE READS TODAY, and the point this test
     makes is about the FACTOR rather than about the list: a yearly insurance counted whole is
     twelve times what leaves in a month. It survives the list changing, which it may. */
  const factor = (o: { repeats?: unknown }): number => LOOKUPS.per_month![String(o.repeats)] ?? 0;
  const live = OBLIGATIONS.filter((o) => o.state !== 'written_off' && o.direction === 'owed_by_me' && factor(o) > 0);
  const share = live.reduce((n, o) => n + Math.round(minor(o.amount) * factor(o)), 0);
  assert.equal(reading(k, 'every-month-out'), share);

  /* THE SAME ROWS ADDED WITHOUT THE FACTOR, which is what a figure that forgot the frequency would
     say. The yearly and the quarterly rows are the whole of the gap, and it is most of the number. */
  const naive = live.reduce((n, o) => n + minor(o.amount), 0);
  assert.ok(naive > share * 1.5, `the naive sum is ${naive} against ${share}, so the sample no longer shows the mistake`);

  /* THE OTHER DIRECTION READS TOO, because a page that can only say what leaves is half a page. */
  const incoming = OBLIGATIONS.filter((o) => o.state !== 'written_off' && o.direction === 'owed_to_me' && factor(o) > 0);
  assert.ok(incoming.length > 0, 'the sample holds no repeating income, so the other direction proves nothing');
  assert.equal(reading(k, 'every-month-in'), incoming.reduce((n, o) => n + Math.round(minor(o.amount) * factor(o)), 0));
});

test('ONE FIGURE ANSWERS WHAT GOES OUT EVERY MONTH, where two used to and they disagreed', async () => {
  /**
   * TWO FIGURES OVER TWO LISTS ANSWERED THIS, AND THEY DISAGREED ON THE SHIPPED SAMPLE.
   *
   * `every-month-out` summed `obligations` where `repeats` is monthly, quarterly or yearly, at
   * `per_month`, and read 1041616. `recurring-out-month` summed `recurring` where the state is live
   * and the direction is out, at the same factors, and read 919633. Both were on his screen, the
   * first on Overview as "Every month" and the second on Ledger as "Repeating, out", and two
   * numbers that should agree and do not is worse than one number missing, because a reader has no
   * way to tell which is the record's answer. THAT IS WHAT THIS TEST HOLDS: one figure per answer.
   *
   * WHICH LIST IT READS IS A SEPARATE QUESTION AND IT IS NOT SETTLED HERE. The case for `recurring`
   * is good and is written out at the declaration: the importer writes that list, `next_due` moves
   * as each one goes out, and `ends` says when it stops, so a real imported record has the better
   * data there. It was pointed at `recurring` and pointed back, because no use case seeds that list
   * and all three figures then answered zero on every demo record, and reseeding is blocked on
   * `recurring.category` being a ref where `obligations.category` is a closed enum, with no seed row
   * anywhere writing a ref. The decision is in `loop/BACKLOG.md`. This test asserts the dedupe,
   * which is settled, and deliberately does not assert the source, which is not.
   */
  const k = await seeded();

  const share = (m: { value: unknown }): boolean => JSON.stringify(m.value).includes('per_month');
  const monthly = Object.values(MONEY_METRICS).filter(share);
  assert.deepEqual(
    monthly.map((m) => m.metric).sort(),
    ['every-month-by-category', 'every-month-in', 'every-month-out'],
    'two figures are summing monthly shares over two different lists',
  );
  /* ONE LIST BETWEEN THEM, WHICHEVER IT IS. This is the assertion that would have caught the
     original defect, and it survives the source question being reopened either way. */
  assert.equal(new Set(monthly.map((m) => m.source)).size, 1, 'the monthly figures read more than one list again');

  const factor = (r: { repeats?: unknown }): number => LOOKUPS.per_month![String(r.repeats)] ?? 0;
  /* ROUNDED PER ROW AND THEN SUMMED, WHICH IS NOT THE SAME AS SUMMING AND ROUNDING ONCE. Measured:
     summing first gives 1041617 against the figure's 1041616, one penny out. A yearly amount at a
     twelfth rarely divides, so every row carries a fraction and the order the rounding happens in
     decides where the penny lands. The figure rounds each share, so the test does too. */
  const monthlyOut = OBLIGATIONS.filter((o) => o.state !== 'written_off' && o.direction === 'owed_by_me' && factor(o) > 0)
    .reduce((n, o) => n + Math.round(minor(o.amount) * factor(o)), 0);
  assert.ok(monthlyOut > 0, 'the sample holds no repeating cost, so this proves nothing');
  assert.equal(reading(k, 'every-month-out'), monthlyOut);

  /* AND THE PARTS ARE THE WHOLE, which is what the Overview draws beside it: every live repeating
     cost in the sample carries a category, so the grouped figure adds up to the ungrouped one. */
  const grouped = k.metric(METRICS['every-month-by-category'] as never);
  assert.ok(grouped.ok, sayOf(grouped));
  assert.equal(grouped.value.groups?.reduce((n, g) => n + (g.value ?? 0), 0), Math.round(monthlyOut));
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

/** The patterns as a record installs them, which is the same map `ingestDeclarations()` walks. */
const ingests = (): Declaration[] =>
  Object.values(MONEY_INGESTS).map((body) => ({ id: `ingest.${body.ingest}`, kind: 'ingest' as const, body: body as never }));

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
  assert.ok((await k.install(ingests())).ok, 'the patterns do not install');
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
  assert.ok((await k.install(ingests())).ok);
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

test('A MESSAGE THAT NAMES BOTH VERBS IS CLAIMED BY NEITHER PATTERN, because a sign nothing decides may not be written at exact', async () => {
  const k = await seeded();
  assert.ok((await k.install(ingests())).ok);
  const before = k.count('transactions');

  /**
   * MEASURED, AND IT WAS THE WORST OUTCOME THIS LAYER HAS.
   *
   * `bank-card-out` wanted `debited` and `bank-card-in` wanted `credited`, and a body carrying both
   * satisfied both `match:` clauses. `arrive` takes the first that matches, which is the order
   * `MONEY_INGESTS` is written in, so a statement digest naming both was filed as a payment OUT at
   * `exact` and the credit half was never read. A wrong sign at `exact` is worse than no row,
   * because `exact` is the one confidence nothing downstream doubts: no suggestion is opened, no
   * reason is stored against the arrival, and the ledger looks ordinary.
   *
   * SO EACH PATTERN NOW REFUSES THE OTHER'S VERB, and a message that names both matches nothing. It
   * lands where the Monzo wording lands — `untriaged`, bytes and all, on a screen a person reads —
   * which is also where `arrive` counts it towards the three arrivals that earn a drafted pattern.
   * Nothing is guessed, and the declared ORDER of the two stops deciding anything at all.
   */
  const both = arrived(forward(k, 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26, and credited GBP 1.00 from NILE REALTY on 18/09/26.', 'sms-both'));
  assert.equal(both.state, 'untriaged');
  assert.equal(both.ingest, null, 'an arm still claims a message that says two things');
  assert.equal(k.count('transactions'), before, 'an ambiguous message wrote a row');

  /* AND EACH VERB ON ITS OWN IS STILL A STRAIGHT READ, which is what exclusivity may not cost. */
  assert.equal(arrived(forward(k, CHARGE, 'sms-out')).ingest, 'bank-card-out');
  assert.equal(arrived(forward(k, CREDIT, 'sms-in')).ingest, 'bank-card-in');
});

test('AN ALERT IN A CURRENCY THAT IS NOT STERLING IS READ, because the amount is anchored on the verb and not on a currency code', async () => {
  /**
   * MEASURED ON A RECORD: `MOVEMENT` ANCHORED THE AMOUNT ON THE LITERAL `GBP`.
   *
   * An anchor that is nowhere in the text yields no slices at all, so an alert reading
   * `debited EGP 42.99` read NO amount and the arrival went to `review` saying
   * *"bank-card-out could not read amount, on out of this one"* over a message that plainly carried
   * both. He banks in EGP, USD and GBP, so two of the three currencies he holds were unreadable and
   * the third was readable only by accident of the pack having been written in sterling.
   *
   * THE VERB IS THE ANCHOR NOW, which each pattern's `match:` has already guaranteed is in the body,
   * so the slice starts at the figure whatever currency it is in.
   */
  const k = await seeded();
  assert.ok((await k.install(ingests())).ok, 'the patterns do not install');
  const before = k.count('transactions');

  const out = arrived(forward(k, 'HSBC: Your card ending 4471 was debited EGP 42.99 at FENWICK CLOUD on 29/08/26.', 'sms-egp'));
  assert.equal(out.state, 'matched', out.reason ?? '');
  assert.equal(out.confidence, 'exact');
  assert.equal(k.count('transactions'), before + 1);

  const row = k.get(out.wrote[0]!)!;
  assert.equal((row.fields.amount as { amount: number }).amount, 4_299, 'the figure beside a foreign code was not read');
  assert.equal(row.fields.on, '2026-08-29');
  assert.equal(row.fields.what, 'FENWICK CLOUD');

  /**
   * AND THE CODE ON THE ROW IS THE DECLARED ONE HERE, WHICH IS AS CLOSE AS A BARE RECORD GETS.
   *
   * `money.currency` is the code to fall back on when the text names none, and on a real record
   * `@braindog/record` injects `scanMoney` from `@braindog/extract`, where a code printed beside the
   * figure WINS over the declared one because it is the one that moved the money. A bare kernel has
   * no such reader wired and falls back every time. This package may not depend on
   * `@braindog/extract` — `tools/gates/graph.mjs` holds that edge, same as the dedupe test below —
   * so what is asserted here is the half that is provable from here: the figure is read at all, and
   * no pattern anchors on a code again.
   */
  assert.equal((row.fields.amount as { currency: string }).currency, 'GBP', 'a bare record read something other than the declared fallback');
  const forms = Object.values(MONEY_INGESTS).flatMap((body) =>
    Object.entries(body.extract ?? {}).map(([field, form]) => [`${body.ingest}.${field}`, (form as { money?: { after?: string; currency?: string } }).money] as const),
  );
  const monies = forms.filter(([, money]) => money);
  assert.equal(monies.length, 2, 'the two patterns no longer read one amount each');
  for (const [where, money] of monies)
    assert.ok(!/^[A-Z]{3}$/u.test((money!.after ?? '').trim()), `${where} anchors on a currency code, so an alert in any other currency reads nothing`);
  assert.equal(new Set(monies.map(([, money]) => money!.currency)).size, 1, 'the two patterns fall back on two different currencies');

  /**
   * AND THE HOME CURRENCY SETTING STILL HAS NO DEFAULT, which is the other half of the same choice.
   *
   * A default of `GBP` was tried here, because the fallback above and the setting are both about
   * what currency this record is in, and it was measured wrong: `founder-poll.test.ts` holds a
   * record with an Egyptian account and a dollar account and asserts Cash now reads `null` until
   * somebody chooses, and with the default in place it read 2808560. A figure converted at a rate
   * nobody asked for is indistinguishable from one a person chose, so the question stays open until
   * it is answered and the patterns keep a fallback of their own.
   */
  assert.equal((MONEY_HOME_SETTING.home_currency as { default?: string }).default, undefined);
});

test('THE SAME BYTES TWICE ARE ONE ROW, and the same movement in two wordings is what the near key is for', async () => {
  const k = await seeded();
  assert.ok((await k.install(ingests())).ok);
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

/* ── every list that holds a dated amount is in the cash walk ────────────── */

/**
 * The money page's walk, read off the declaration rather than retyped here.
 *
 * THE DEFECT BELOW WAS A MISSING ENTRY IN `from:`, so a test carrying its own copy of the legs could
 * not have seen it: it would have walked the four legs it wrote down and reported a healthy runway
 * while the page on screen walked two.
 */
const cashWalk = (): { from: Leg[]; horizon: number } => {
  const blocks = PAGES.money!.blocks as readonly { kind?: string; from?: unknown; horizon?: unknown }[];
  const block = blocks.find((b) => b.kind === 'forecast');
  assert.ok(block, 'the money page draws a cash walk');
  assert.ok(Array.isArray(block.from) && typeof block.horizon === 'number', 'and the walk names its legs and its horizon');
  return { from: block.from as Leg[], horizon: block.horizon as number };
};

/** What one leg of a walk moves over the horizon, in minor units, and how many steps it moves it in. */
function contribution(k: Kernel, opening: number, legs: readonly Leg[], horizon: number, register: string) {
  const out = k.runway(opening, legs, horizon);
  assert.ok(out.ok, sayOf(out));
  assert.deepEqual(out.value.refusals, [], 'a walk that refuses is money missing from the answer');
  const mine = out.value.steps.filter((s) => s.source === register);
  return { steps: mine.length, total: mine.reduce((n, s) => n + s.delta, 0), walk: out.value };
}

test('AN INSTALMENT IS A DATED AMOUNT AND THE WALK HAD NEVER READ ONE, so the balance it drew stood GBP 2,700.00 above the record', async () => {
  const k = await seeded();
  const opening = reading(k, 'cash-now');
  assert.ok(opening !== null);
  const { from, horizon } = cashWalk();

  assert.ok(from.some((leg) => leg.register === 'installments'), 'the cash walk reads the instalments list');

  /* ONE ROW A DATED PART, WHICH IS WHY THIS LEG CARRIES NO `every:`. `installments` is already
     expanded: the proofing press is eight rows on eight days, and a frequency over the top of that
     would charge it eight times eight. The step count below is the assertion of exactly that. */
  const ahead = INSTALLMENTS.filter((row) => row.state === 'open');
  const expected = ahead.reduce((n, row) => n + (row.direction === 'in' ? 1 : -1) * minor(row.amount), 0);

  const got = contribution(k, opening, from, horizon, 'installments');
  assert.equal(got.steps, ahead.length, 'every open part is one step, and a part wearing a frequency would be many');
  assert.equal(got.total, expected);
  /* MEASURED ON THE SHIPPED RECORD: four parts of the proofing press leaving at GBP 1,875.00 and two
     of the Halden licence arriving at GBP 2,400.00, GBP 2,700.00 net out that was in no cash walk. */
  assert.equal(expected, -270_000);

  const without = contribution(k, opening, from.filter((leg) => leg.register !== 'installments'), horizon, 'installments');
  assert.equal(without.steps, 0, 'and with the leg taken out the same walk sees none of it');
  assert.equal(
    (without.walk.steps.at(-1)?.balance ?? opening) - (got.walk.steps.at(-1)?.balance ?? opening),
    270_000,
    'the walk without the leg ends better off than the record does, which is the direction a runway must never be wrong in',
  );
  /* AND THE CROSSING DAY DOES NOT MOVE, WHICH IS WORTH KNOWING AND IS WHY THIS TEST SAYS BALANCE AND
     NOT DAYS. Measured over the 365 day horizon: 30 October, 57 days, with the leg and without it,
     because the same obligation crosses on that day either way. What the missing leg cost was the
     line and the thirty-day bridge under it rather than the headline figure, so a reader who repairs
     this block expecting the runway to shorten has the wrong expectation. */
  assert.equal(got.walk.crossed?.day, without.walk.crossed?.day, 'the six parts land either side of a crossing they do not cause, on this record');
  assert.equal(got.walk.days, without.walk.days, 'so the days figure beside the chart reads the same, and the balance under it does not');

  /* THE THIRTY-DAY BRIDGE IS THIS WALK OVER A SHORTER HORIZON. A leg added to one and not the other
     is two answers about the same thirty days, one block apart on one screen. */
  const bridge = (PAGES.money!.blocks as readonly { kind?: string; from?: unknown }[]).find((b) => b.kind === 'bridge');
  assert.ok(bridge, 'the money page draws a thirty-day bridge');
  assert.equal(bridge.from, from, 'the bridge and the walk are handed the ONE array, not two copies a deepEqual holds level');
});

/**
 * EVERY BLOCK ON `/p/money` THAT SPEAKS ABOUT THE NEXT THIRTY DAYS, READ OFF THE DRAWN PAGE.
 *
 * THE DEFECT THIS IS WRITTEN AGAINST WAS TWO ANSWERS TO ONE QUESTION. `ca30d210` added the
 * `installments` leg to the walk and to the bridge and left the two tiles above the bridge reading
 * `obligations` alone, so the page said "Coming in, 30 days: GBP 9,090.00" in the hero and "Coming
 * in: GBP 11,490.00" one block under it, and "Going out, 30 days: GBP 38,880.00" over "Going out:
 * GBP 42,741.00". Its own commit message is the argument: two blocks on one screen disagreeing about
 * the same month is worse than either number alone.
 *
 * AND THE TILES CANNOT BE MADE TO WALK, which is a fact about the shape and not a thing left undone.
 * `MetricDecl.source` is one `register.<id>` and a `split` names one register too, so three of the
 * four blocks below can only ever read `obligations` while the bridge reads three lists. What the
 * page can do is stop saying the same words twice: the three narrow blocks say whose money they
 * count, and this test holds each of them to the penny against the leg of the walk it is a part of.
 *
 * THE LEGS ARE NAMED HERE ON PURPOSE. A fourth leg added to `CASH_LEGS` turns this red, which is the
 * moment somebody has to decide what the tiles say about it, rather than the moment the two figures
 * quietly drift apart again.
 */
test('THE TILES, THE SPLIT AND THE BRIDGE ON `/p/money` ARE A PART AND A WHOLE, and no two of them answer one question twice', async () => {
  const k = await seeded();

  const stat = blockOf(k, 'money', 'Right now');
  const tile = (metric: string) => {
    const cell = stat.readings?.find((r) => r.metric === metric);
    assert.ok(cell?.reading, `the hero draws ${metric}`);
    assert.equal(cell.reading.unit, 'GBP');
    return { value: cell.reading.value!, label: cell.label };
  };
  const owedIn = tile('in-30d');
  const owedOut = tile('out-30d');

  /* THE WORDS FIRST. `copy.bridgeIn` and `copy.bridgeOut` are "Coming in" and "Going out", and a
     tile wearing those over a different number is the finding. These two say which list they read. */
  assert.deepEqual(
    [owedIn.label, owedOut.label],
    ['Owed to you, 30 days', 'Owed by you, 30 days'],
    'a tile that reads one register may not wear the words of the walk that reads three',
  );

  const bridge = blockOf(k, 'money', 'The next 30 days');
  const steps = bridge.walk?.steps;
  assert.ok(steps && steps.length > 0, 'the bridge draws its walk');
  const sum = (of: (s: { source: string; delta: number }) => boolean) => steps.filter(of).reduce((n, s) => n + s.delta, 0);

  /* THE THREE LISTS THAT HOLD A DATED AMOUNT ON THIS RECORD. `bridgeRows` sums the positive and the
     negative steps of exactly this walk, so these two are the two figures a reader sees on it. */
  assert.deepEqual([...new Set(steps.map((s) => s.source))].sort(), ['installments', 'obligations', 'services']);
  const bridgeIn = sum((s) => s.delta > 0);
  const bridgeOut = -sum((s) => s.delta < 0);
  assert.equal(bridgeIn, 1_149_000, 'GBP 11,490.00 arrives inside thirty days on the shipped record');
  assert.equal(bridgeOut, 4_274_100, 'and GBP 42,741.00 leaves');

  /* EACH TILE IS ITS LEG OF THAT WALK, TO THE PENNY, and that is the whole claim the new words make. */
  assert.equal(owedIn.value, sum((s) => s.source === 'obligations' && s.delta > 0), 'Owed to you is the obligations leg of the bridge');
  assert.equal(owedOut.value, -sum((s) => s.source === 'obligations' && s.delta < 0), 'Owed by you is the obligations leg of the bridge');
  assert.equal(owedIn.value, 909_000);
  assert.equal(owedOut.value, 3_888_000);

  /* AND THE SPLIT UNDER THEM IS THE OUT TILE BROKEN UP, never a third total. */
  const split = blockOf(k, 'money', 'Owed by you, 30 days, by what it is for');
  assert.equal(
    split.rows.reduce((n, r) => n + minor(r.fields.amount), 0),
    owedOut.value,
    'the categories under the bridge add to the tile over it',
  );

  /* WHAT THE THREE NARROW BLOCKS CANNOT REACH, MEASURED RATHER THAN IMPLIED: the parts of a plan,
     which `installments-due-30d` does name, and GBP 111.00 of subscriptions, which no figure on this
     page names at all. Naming that hole is the point of writing the arithmetic out. */
  assert.equal(bridgeIn - owedIn.value, 240_000, 'one part of the Halden licence arrives inside the thirty days');
  assert.equal(bridgeOut - owedOut.value - reading(k, 'installments-due-30d')!, 11_100, 'and GBP 111.00 of it is the subscriptions leg');
  assert.equal(reading(k, 'installments-due-30d'), 375_000, 'two parts of the proofing press leave inside them');
});

/**
 * EVERY CELL ON EVERY DECLARED PAGE THAT READS `in-30d` OR `out-30d`, HELD TO THE FIGURE'S OWN NAME.
 *
 * THE TWO TILES ON `/p/money` WERE RENAMED BY `491e7e05` AND THREE MORE PLACES WERE LEFT SAYING THE
 * OLD THING, found afterwards by grepping rather than by anything going red, which is the gap this
 * closes. Both of the founder's dashboards put "Going out, 30 days" over `out-30d`, which is the
 * bridge's words over a figure that reads one predicate (`direction is owed by me`), and neither of
 * those pages draws a walk, so nothing on them could contradict and nothing did. A label nobody can
 * see is wrong is the kind that survives a rename.
 *
 * SO THE GUARD IS OVER THE DECLARATIONS RATHER THAN OVER ONE PAGE: `MONEY_PAGES`, and every use
 * case's own pages, which is where all three of the ones that were left live. No use case renames
 * either figure today, which is why the house name is the whole of the expectation; the day one does,
 * this is where the label and the name have to be brought back together on purpose.
 */
test('NO PAGE LABELS THE THIRTY-DAY FIGURES MORE WIDELY THAN THEY READ, wherever the page is declared', () => {
  type Cell = { metric?: unknown; label?: unknown };
  type Page = { page?: unknown; blocks?: { cells?: Cell[] }[] };
  const nameOf = (metric: string): string => String((METRICS[metric] as { name?: unknown } | undefined)?.name);
  const cells: { where: string; metric: string; label: string }[] = [];
  const walk = (where: string, pages: readonly Page[]) => {
    for (const p of pages)
      for (const b of p.blocks ?? [])
        for (const c of b.cells ?? [])
          if (c.metric === 'in-30d' || c.metric === 'out-30d') cells.push({ where: `${where} /${String(p.page)}`, metric: c.metric, label: String(c.label) });
  };
  walk('money-core', Object.values(PAGES) as readonly Page[]);
  for (const u of USE_CASES) walk(u.usecase, ((u.pack?.declarations ?? []) as Page[]).filter((d) => d.page !== undefined));

  /* THE COUNT IS ASSERTED BECAUSE A SWEEP THAT FINDS NOTHING PASSES EVERY LOOP BELOW IT. Six today:
     the two tiles on `/p/money`, and two on each of the founder's Overview and Dashboard. */
  assert.ok(cells.length >= 6, `only ${cells.length} cells read these two figures, so the sweep found the wrong declarations`);
  const founder = cells.filter((c) => c.where.startsWith('founder '));
  assert.equal(founder.length, 4, 'the two founder dashboards are not both in the sweep');
  for (const c of cells) assert.equal(c.label, nameOf(c.metric), `${c.where} labels ${c.metric} "${c.label}" where the figure is called "${nameOf(c.metric)}"`);

  /* AND THE CEILING ON `out-30d` IS WORDED FOR THE SAME FIGURE, because a person reading "Most going
     out in 30 days" over a box that caps what is OWED sets it against money the figure never counts.
     The test above it proves the rename costs nobody their saved sum. */
  assert.equal(MONEY_TARGET_SETTINGS['out-30d']?.label, 'Most owed by you in 30 days');
});

/**
 * A SETTING IS FOUND BY ITS KEY AND NOT BY ITS LABEL, WHICH IS THE OPPOSITE OF WHAT WAS WRITTEN DOWN.
 *
 * `491e7e05` LEFT THE `out-30d` CEILING CALLED "Most going out in 30 days" and gave the reason as
 * "a setting a person has already saved is found by the words they saved it under". The record does
 * not work that way. A saved value is written under `most_out_30d`, the key the figure names in
 * `target.setting`, and the label is text the settings screen prints beside the box: `packConfig`
 * reads the values by key and the manifest supplies the words over them.
 *
 * MEASURED HERE RATHER THAN READ OFF THE CODE, both because the claim it corrects was also read off
 * the code and because the door matters: `normalise`, `plan`, `install`, the way a record that
 * already holds money-core is offered a new version of it. A ceiling of GBP 1,110.00 is saved, the
 * pack is installed again with the old wording back on that one setting, and the ceiling is still
 * there afterwards under the new words. So renaming the label costs nobody their sum, and the reason
 * the old wording was kept was not a reason.
 */
test('RENAMING A SETTING LABEL KEEPS THE CEILING A PERSON SAVED, because the key is the identity and the label is only words', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  for (const id of ['portfolio', 'people']) assert.ok((await put(k, document(id))).ok, id);
  assert.ok((await put(k, document('money-core'))).ok, 'money-core did not install');

  const ceiling = { amount: 111_000, currency: 'GBP' };
  const saved = k.setPackConfig('money-core', { most_out_30d: ceiling }, { actor: 'p_test' });
  assert.ok(saved.ok, sayOf(saved));
  assert.deepEqual(saved.value.changed, ['most_out_30d']);

  const doc = document('money-core');
  const config = { ...(doc.config as Record<string, Record<string, unknown>>) };
  const now = String(config.most_out_30d?.label);
  assert.notEqual(now, 'Most going out in 30 days', 'the label is still the old wording, so this test changes nothing');
  config.most_out_30d = { ...config.most_out_30d!, label: 'Most going out in 30 days' };
  const back = await put(k, { ...doc, version: '1.4.0', config });
  assert.ok(back.ok, `the relabelled pack did not install: ${said(back)}`);

  const read = k.packConfig('money-core');
  assert.ok(read.ok, sayOf(read));
  assert.deepEqual(read.value.values.most_out_30d, ceiling, 'a label change took the saved ceiling with it');
  assert.equal(read.value.config.most_out_30d?.label, 'Most going out in 30 days', 'the words over the box are the ones the manifest brought');
});

/**
 * WHY THERE IS NO `recurring` LEG, kept as a measurement rather than as a memory.
 *
 * The obvious reading of "every list that holds a dated amount" adds `recurring` too, and on this
 * record that is a second copy of money the walk already has. The five names below are one amount,
 * on one day, at one cycle, written in both lists, and adding the leg moved the crossing day from
 * 30 October to 1 October on money that does not exist. This test builds the leg and proves it.
 */
test('A REPEATING OBLIGATION AND A REPEATING ITEM ARE THE SAME MONEY HERE, so the walk reads one of the two lists and not both', async () => {
  const k = await seeded();
  const opening = reading(k, 'cash-now');
  assert.ok(opening !== null);
  const { from, horizon } = cashWalk();

  assert.ok(!from.some((leg) => leg.register === 'recurring'), 'the walk does not add the repeating list on top of the obligations already carrying it');

  /* THE LEG AS IT WOULD BE WRITTEN, with the two field names that differ: `recurring` dates from
     `next_due` and cycles on `every`, where `obligations` dates from `due` and cycles on `repeats`. */
  const repeating: Leg = {
    register: 'recurring',
    on: 'next_due',
    amount: 'amount',
    where: 'state is live',
    incoming: { field: 'direction', is: 'in' },
    every: { field: 'every', months: { monthly: 1, quarterly: 3, yearly: 12 } },
  };
  const both = contribution(k, opening, [...from, repeating], horizon, 'recurring');
  assert.equal(both.total, -9_919_600, 'the repeating list moves this much over the horizon');

  const byLabel = (register: string): Map<string, number> => {
    const out = new Map<string, number>();
    for (const s of both.walk.steps) if (s.source === register) out.set(s.label, (out.get(s.label) ?? 0) + s.delta);
    return out;
  };
  const items = byLabel('recurring');
  const promises = byLabel('obligations');
  /* THE SAME MONEY UNDER TWO DESCRIPTIONS. The obligation is the one the walk keeps, because
     `every-month-out` reads `obligations.repeats` for a reason already argued in `money.ts` and
     because no use case seeds `recurring` at all. */
  const shared: readonly (readonly [string, string])[] = [
    ['Studio rent', 'Studio rent'],
    ['Kiln storefront payout', 'Kiln storefront payout'],
    ['Backend contract, S. Marchetti', 'Backend contract, September'],
    ['VAT', 'VAT quarter to 31 Aug'],
    ['Studio insurance', 'Studio insurance, annual'],
  ];
  let twice = 0;
  for (const [item, promise] of shared) {
    const a = items.get(item);
    const b = promises.get(promise);
    assert.ok(a !== undefined, `${item} is in the repeating list`);
    assert.ok(b !== undefined, `${promise} is in the obligations`);
    assert.equal(a, b, `${item} and ${promise} are the same money over the horizon`);
    twice += a;
  }
  assert.equal(twice, -9_822_400, 'and that is all but a hundredth of what the leg would add');
  assert.equal(both.total - twice, -97_200, 'what only the repeating list holds is the two plans no obligation carries');
});

/* ── the two blocks on the Ledger that read a list of their own ──────────── */

/**
 * A block of the Ledger page as the record draws it, found by the words over it.
 *
 * READ OFF THE DRAWN PAGE AND NOT OFF THE DECLARATION, because both facts below are a missing clause
 * in a `where:` and a test carrying its own copy of the filter would ask its own question and pass
 * while the screen answered something else.
 */
type DrawnBlock = {
  heading?: string;
  matched: number;
  refusals: readonly unknown[];
  rows: readonly { fields: Record<string, unknown> }[];
  readings?: readonly { metric: string; label?: string; reading: { value: number | null; unit: string | null } | null }[];
  walk?: { steps: readonly { source: string; delta: number; label: string }[] };
};

const blockOf = (k: Kernel, slug: string, heading: string): DrawnBlock => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  const block = (out.value as { blocks: readonly DrawnBlock[] }).blocks.find((b) => b.heading === heading);
  assert.ok(block, `${slug} draws a block headed ${heading}`);
  assert.deepEqual(block.refusals, [], 'a block that refuses is a heading over a blank rectangle');
  return block;
};

const drawn = (k: Kernel, slug: string, heading: string): { matched: number; rows: readonly { fields: Record<string, unknown> }[] } => {
  const block = blockOf(k, slug, heading);
  return { matched: block.matched, rows: block.rows };
};

test('A HEADING THAT SAYS PAY OVER TWO ROWS OF MONEY COMING IN, because the table beside the figure never got the clause the figure has', async () => {
  const k = await seeded();
  const table = drawn(k, 'ledger', 'Still to pay, in parts');

  /* THE SHIPPED RECORD, MEASURED BEFORE THE CLAUSE: six open parts under the heading, four of the
     proofing press leaving at GBP 1,875.00 and two of the Halden licence ARRIVING at GBP 2,400.00.
     `installments-left` and `installments-due-30d` both read this list and both say `direction is
     out`; the table under the same word never did. */
  const open = INSTALLMENTS.filter((row) => row.state === 'open');
  assert.equal(open.length, 6, 'the sample stopped having six open parts');
  assert.equal(open.filter((row) => row.direction === 'in').length, 2, 'and two of them stopped being money coming in');

  assert.equal(table.matched, 4, 'the table draws what is still to PAY, and a receipt is not one');
  assert.deepEqual(
    table.rows.map((r) => r.fields.direction),
    ['out', 'out', 'out', 'out'],
    'every row under a heading that says pay is money going out',
  );
  assert.deepEqual(
    table.rows.map((r) => r.fields.what).filter((what) => String(what).startsWith('Halden')),
    [],
    'the Halden licence is money he is owed, and it was listed as money he owes',
  );
});

/**
 * WHAT `ends` COSTS THE SPLIT, AND WHY THE RECORDED REPAIR FOR IT IS NOT WRITTEN HERE.
 *
 * The finding this pins is real and its repair is not writable, which is three measurements and not
 * an opinion. `loop/BACKLOG.md` records `ends is empty or ends after today`.
 *
 *   1. AS A SENTENCE IT IS A REFUSAL. Clauses are ANDed on the comma and `or` reads over the VALUES
 *      of one field, so the record answers `VALUE_MALFORMED: empty is not a value ends can hold`.
 *      The last four lines of this test are that answer, so nobody has to try it again.
 *   2. AS A TREE IT IS A BLANK BLOCK. `{ any: [{ field: 'ends', empty: true }, { field: 'ends',
 *      after: 'today' }] }` compiles and filters correctly in the kernel, and `apps/web`, which is a
 *      synchronous mock over this package and draws the same seed pages, refuses a `where:` that is
 *      not a string: `compile` hands back one refusal and no clauses and `matches` then answers false
 *      for every row. Measured against that engine, the split would draw nought rows under its
 *      heading and a refusal beside it, which is worse than the number it draws now.
 *   3. AND `ends is empty` ALONE, THE ONE CLAUSE THE SENTENCE DOES SUPPORT, IS WORSE THAN NOTHING.
 *      The importer skips a stream that ended before the export (`apps/cli/src/legacy.ts:916`) and
 *      writes `ends` only when it is still ahead, so on the one real record every row carrying an
 *      `ends` at all is a schedule that IS still running. That clause drops exactly those.
 *
 * SO THE REPAIR WENT WHERE THE ROW IS, AND IT IS `recurring-ended`: `when: 'state is live, ends
 * before today'`, `then: [{ move: 'ended' }]`, swept hourly by `rulesAboutTime` because its `when:`
 * names a relative day and it declares `once_per`. The test below drives that sweep over a clock
 * that moves, rather than asserting the declaration exists: a rule that only ever fired on a write
 * would be exactly the rule this list already had.
 *
 * AND THE TILE IN THE SAME FINDING IS ALREADY OUT OF IT. "Repeating, out" reads `every-month-out`
 * over `obligations`, which has no `ends` field at all: the two `recurring-*` figures the finding was
 * written against stopped existing in `62511a98`, which deleted both and pointed the tile at
 * `every-month-out` in the same hunk. THE HASH THIS COMMENT FIRST CARRIED, `d76cd016`, IS THE WRONG
 * ONE and was corrected by reading the commits rather than the account of them: `git show d76cd016
 * --stat -- packages/seed/src/modules/money.ts` is empty, so it changed no line of this module, and it
 * is older than `29c58c9e`, the commit that wrote the finding down. One block on one screen still
 * reads this list.
 */
test('A SCHEDULE ENDS ON ITS LAST DAY BECAUSE AN HOURLY SWEEP ENDS IT, and the sentence that would have dropped it from the filter is not one this grammar can say', async () => {
  /* A CLOCK THAT MOVES, WHICH IS THE WHOLE TEST. A rule that fires when the row is written would
     have caught nothing here: the row below is written while its end day is still ahead, exactly as
     the importer writes one, and it is the PASSING of that day with nobody touching the row that
     `rulesAboutTime` exists for. Every other test in this file opens the record at `NOW`. */
  let now = NOW;
  const k = await openRecord(openSqlite(), { now: () => now });
  const installed = await installSeed(k);
  assert.ok(installed.ok, sayOf(installed));

  /* THE SAMPLE HIDES THE SHAPE because its one stopped row was hand-set to `ended`. This is the
     shape a real record has: the importer writes `ends` only when it is ahead and skips a stream
     that stopped before the export (`apps/cli/src/legacy.ts:916`), so what a record accumulates
     is live rows whose end day goes past while nothing writes to them. */
  const stopped = k.create(
    'recurring',
    {
      what: 'Tallow studio pass',
      direction: 'out',
      amount: { amount: 24_900, currency: 'GBP' },
      every: 'monthly',
      next_due: day(3),
      started: day(-600),
      ends: day(3),
      state: 'live',
    },
    { actor: 'p_test' },
  );
  assert.ok(stopped.ok, sayOf(stopped));
  const passId = (stopped.value as { id: string }).id;
  const stateOfPass = () => (k.get(passId) as { fields: Record<string, unknown> }).fields.state;

  const split = () => {
    const block = drawn(k, 'ledger', 'Every month, by what it is for');
    return { matched: block.matched, total: block.rows.reduce((n, r) => n + minor(r.fields.amount), 0), rows: block.rows };
  };

  /* MEASURED ON THE SHIPPED RECORD PLUS THAT ONE ROW: five rows and GBP 6,940.00 a month, of which
     GBP 249.00 is the pass. While its day is ahead that is the right answer. */
  assert.equal(split().matched, 5);
  assert.equal(split().total, 694_000);

  /* THE LAST DAY ITSELF, SWEPT, BECAUSE `before` IS EXCLUSIVE AND A SCHEDULE'S LAST DAY IS ITS OWN.
     `ends` is `day(3)`, so this is the day the pass names as its last, and the payment on it is still
     owed. Measured: the rule does not match, the row stays live, and no `once_per` marker is claimed,
     which is why the sweep four days on below still fires. `ends before +1d` in place of `ends before
     today` would end the schedule on the morning of a payment it still owes, and without this step
     nothing in this test would have said so. */
  now = NOW + 3 * 86_400_000;
  k.purge();
  assert.equal(stateOfPass(), 'live', 'a schedule is live on the last day it names');
  assert.equal(split().matched, 5, 'and the split still counts it, because that month is still owed');

  /* FOUR DAYS ON, WHICH IS THE DAY AFTER ITS LAST, AND NOBODY HAS TOUCHED THE ROW. This is the defect
     as a record lives it: the split has no clause about `ends`, so on its own it goes on counting a
     schedule that stopped, at its full monthly share, for ever. */
  now = NOW + 4 * 86_400_000;
  assert.equal(split().matched, 5, 'the split says nothing about `ends`, so the day passing changes nothing on its own');
  assert.equal(split().total, 694_000);

  /* THE HOURLY SWEEP, DRIVEN. `purge()` is `sweepRecord`, which calls `rulesAboutTime`, which reads
     every rule whose `when:` names a relative day and which declares `once_per` — `recurring-ended`
     is one — and applies it in bulk over its register. */
  k.purge();

  assert.equal(split().matched, 4, 'the stopped schedule is out of the split');
  assert.equal(split().total, 669_100, 'GBP 6,691.00 a month, which is GBP 249.00 less than before the sweep');
  assert.deepEqual(
    split().rows.filter((r) => r.fields.what === 'Tallow studio pass'),
    [],
    'and it is out because the row moved, not because a filter learned to hide it',
  );

  /* THE ROW ITSELF, because a split is a sum and a sum can be right for the wrong reason. `paused`
     would pass every assertion above this one: the split reads `state is live` and would drop the row
     either way, and the state the rule moves it to is only visible here. */
  assert.ok(k.get(passId), 'the row is still there, ended rather than removed');
  assert.equal(stateOfPass(), 'ended');

  /* AND THE REPAIR AS IT WAS RECORDED IS STILL A REFUSAL, which is why the rule was written instead
     of the filter. `or` in this grammar is over the VALUES of one field, so the clause is read as
     `ends is <the words empty or ends after today>`. Pinned so nobody tries it again. */
  const said = k.list({ register: 'recurring', where: 'state is live, direction is out, every is monthly, ends is empty or ends after today', limit: 50 });
  assert.ok(refused(said), 'the recorded repair parses, and it must not');
  assert.equal(said.refusal.code, 'VALUE_MALFORMED');
  assert.match(String(said.refusal.fix), /empty is not a value ends can hold/);
});
