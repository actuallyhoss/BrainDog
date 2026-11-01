/**
 * The four registers that make a ledger readable, on a real record: what money is for, what comes
 * round, what is being paid in parts, and what the whole position was on a night.
 *
 * EACH TEST HERE IS ABOUT AN ARITHMETIC THAT WAS WRONG OR IMPOSSIBLE BEFORE IT. A repeating item and
 * a quarterly one added together is three units summed as one; a plan's total typed beside its parts
 * is two answers to one question; a night written twice is a line with a step in it that nothing
 * happened on. Every one of those is a refusal or a factor table here rather than a convention.
 *
 * AND money-core 3.0.0's SHAPE: one page called Money over the same lists, cash rolled
 * forward from each account's newest balance, what repeats walked from `recurring` at every cadence, and every money
 * figure in the currency the record chose. The card alerts are `packs/card-alerts` now, and their tests went with them.
 */

import { ADDON_LEG_LISTS, withoutLegs } from '../src/modules/held-legs.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel, type Leg } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { ACCOUNTS, CATEGORIES, INSTALLMENTS, LOOKUPS, METRICS, NOW, OBLIGATIONS, PAGES, REGISTERS, RECURRING_ITEMS, RULES, SNAPSHOTS, cashPoints, cashSeries, day, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';
import { MONEY_METRICS, MONEY_PAGES, MONEY_TARGET_SETTINGS, nightOf } from '../src/modules/money.ts';
import { BUDGET } from '../src/modules/money/pages/parts/budget.ts';
import { SPENDING } from '../src/modules/money/pages/parts/spending.ts';
import { USE_CASES } from '../src/usecases/index.ts';
import { CASH_AHEAD, readCashAhead } from './money-walk-page.ts';

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

/**
 * The repeating lines a monthly figure counts, as the sample writes them: live, one way, and not past their last day
 * (`LIVE_LINES` in `modules/money.ts`).
 */
const lines = (direction: 'in' | 'out') =>
  RECURRING_ITEMS.filter((r) => r.state === 'live' && r.direction === direction && (typeof r.ends !== 'string' || r.ends >= day(0)));

/**
 * A line's monthly share, ROUNDED PER ROW AND THEN SUMMED, as the figure rounds each share: a yearly amount at a twelfth
 * rarely divides, so the order the rounding happens in decides where the penny lands.
 */
const monthly = (rows: readonly { amount?: unknown; every?: unknown }[]): number =>
  rows.reduce((n, r) => n + Math.round(minor(r.amount) * (LOOKUPS.per_month![String(r.every)] ?? 0)), 0);

test('A REPEATING ITEM IS COUNTED AT ITS MONTHLY SHARE, and the naive sum of the same rows is wrong', async () => {
  const k = await seeded();
  assert.equal(k.count('recurring'), RECURRING_ITEMS.length);

  /* THE FACTOR IS THE POINT: a yearly insurance counted whole is twelve times what leaves in a month, and a weekly
     cleaner counted once is a quarter of it. Every cadence the list offers has a share, so none is a silent zero. */
  const out = lines('out');
  assert.ok(out.some((r) => r.every === 'weekly') && out.some((r) => r.every === 'yearly'), 'the sample stopped holding a weekly and a yearly line');
  for (const every of ['weekly', 'fortnightly', 'twice_monthly', 'monthly', 'quarterly', 'yearly'])
    assert.ok((LOOKUPS.per_month![every] ?? 0) > 0, `${every} is counted at nothing a month`);
  assert.equal(reading(k, 'every-month-out'), monthly(out));

  /* THE SAME ROWS ADDED WITHOUT THE FACTOR, which is what a figure that forgot the frequency would say. */
  const naive = out.reduce((n, r) => n + minor(r.amount), 0);
  assert.notEqual(naive, monthly(out), 'the sample no longer shows the mistake');

  /* THE OTHER DIRECTION READS TOO, because a page that can only say what leaves is half a page. */
  assert.ok(lines('in').length > 0, 'the sample holds no repeating income, so the other direction proves nothing');
  assert.equal(reading(k, 'every-month-in'), monthly(lines('in')));
});

test('ONE LIST ANSWERS WHAT REPEATS, and the parts of the monthly figure are the whole of it', async () => {
  /* ONE FIGURE PER ANSWER, OVER ONE LIST. Two figures over `obligations.repeats` and `recurring` answered this once and
     disagreed on the sample, and since money-core 3.0.0 the list is `recurring` for the figures and the walk alike. */
  const k = await seeded();

  const share = (m: { value: unknown }): boolean => JSON.stringify(m.value).includes('per_month');
  const byShare = Object.values(MONEY_METRICS).filter(share);
  assert.deepEqual(byShare.map((m) => m.metric).sort(), ['every-month-by-category', 'every-month-in', 'every-month-out']);
  assert.deepEqual([...new Set(byShare.map((m) => m.source))], ['register.recurring'], 'a monthly figure reads another list');

  /* AND THE PARTS ARE THE WHOLE, which is what the Money page draws: every live repeating cost in the sample carries a
     category, so the grouped figure adds up to the ungrouped one. */
  const grouped = k.metric(METRICS['every-month-by-category'] as never);
  assert.ok(grouped.ok, sayOf(grouped));
  assert.equal(grouped.value.groups?.reduce((n, g) => n + (g.value ?? 0), 0), reading(k, 'every-month-out'));
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
  assert.deepEqual([...new Set(asked)].sort(), ['rule:invoice-late', 'rule:recurring-missed'], 'a money rule started asking, or stopped');
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

/* THE HOME CURRENCY HAS NO DEFAULT: `money-settings.test.ts` holds that on a record with an Egyptian account and a
   dollar account, where Cash now reads nothing until somebody chooses. */

/* ── every list that holds a dated amount is in the cash walk ────────────── */

/**
 * Cash ahead's walk, which Money declares for the pages that place it, read off the declaration rather than retyped here.
 *
 * THE DEFECT BELOW WAS A MISSING ENTRY IN `from:`, so a test carrying its own copy of the legs could
 * not have seen it: it would have walked the four legs it wrote down and reported a healthy runway
 * while the page on screen walked two.
 */
const cashWalk = (): { from: Leg[]; horizon: number } => {
  const block = CASH_AHEAD;
  assert.ok(Array.isArray(block.from) && typeof block.horizon === 'number', 'the walk names its legs and its horizon');
  /* AS A RECORD WITHOUT AN ADD-ON IS GIVEN IT: a leg over a list only an add-on holds is left out of the page it installs. */
  return { from: (block.from as Leg[]).filter((leg) => !ADDON_LEG_LISTS.has(leg.register)), horizon: block.horizon };
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
  /* THREE MONTHS, WHERE EVERY OPEN PART OF THE SAMPLE FALLS: Cash ahead opens on ten weeks since money-core 3.17.0
     (money-ten-weeks-100), which leaves two of them past its end, and the walk is the same walk at any length. */
  const { from } = cashWalk();
  const horizon = 90;

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

  /* THE THIRTY-DAY FIGURES ARE THIS WALK OVER A SHORTER HORIZON. A leg added to one and not the other is two answers
     about the same thirty days. The bridge that walked them on the page went in REC-B23; the figures a use case's page
     draws still read the walk, so they are held to it here. */
  for (const id of ['arriving-30d', 'leaving-30d'])
    assert.deepEqual(
      (METRICS[id] as { legs?: unknown }).legs,
      from.filter((leg) => !ADDON_LEG_LISTS.has(leg.register)),
      `${id} and the walk are handed the same legs, less a leg over a list only an add-on holds`,
    );
});

/**
 * EVERY BLOCK ON `/p/money` THAT SPEAKS ABOUT THE NEXT THIRTY DAYS, READ OFF THE DRAWN PAGE.
 *
 * THE DEFECT THIS IS WRITTEN AGAINST WAS TWO ANSWERS TO ONE QUESTION: tiles that read one list above a bridge that
 * walked three, so "Coming in, 30 days" in the hero and "Coming in" one block under it were two numbers. Since
 * money-core 3.0.0 the tiles are figures over the walk itself (`source: forecast.runway`, `legs:` the page's own
 * `CASH_LEGS`), so they may wear the walk's words, and this holds them to the bridge to the penny.
 */
test('THE THIRTY-DAY FIGURES AND THE WALK OF THIRTY DAYS ADD UP THE SAME MOVEMENTS, so no two of them answer one question twice', async () => {
  const k = await seeded();

  /* THE FIGURES AND NOT THE TILES, SINCE money-core 3.3.0: the Money page says the thirty days once, as the bridge, and
     no longer draws the two walk figures beside Cash now. They are still declared, and a use case's page draws them
     (`founder`), so they are still held to the bridge to the penny. */
  const figure = (metric: string) => ({ value: reading(k, metric), label: String((METRICS[metric] as { name?: unknown }).name) });
  const arriving = figure('arriving-30d');
  const leaving = figure('leaving-30d');
  assert.deepEqual([arriving.label, leaving.label], ['To come in, next 30 days', 'Bills and usual spending, next 30 days']);
  /* AND NO TILE ON MONEY SAYS THE LINE'S FIGURES AGAIN, SINCE money-core 3.4.0: What you have went into the line. The one
     figure tile, Runs out since 3.11.0, says when the money runs out, which the line no longer says. */
  const line = (MONEY_PAGES.money!.blocks as { kind: string; lead?: boolean; body?: string }[]).filter((b) => b.kind === 'note' && b.lead).map((b) => String(b.body)).join(' ');
  for (const b of MONEY_PAGES.money!.blocks as { kind: string; cells?: { metric: string }[] }[])
    for (const c of b.cells ?? []) assert.ok(!line.includes(`{{${c.metric}}}`), `a tile beside the line says ${c.metric} again`);

  /* THE WALK OF THE NEXT THIRTY DAYS, SINCE REC-B23 OFF THE PAGE: Cash ahead's own legs from Cash now over thirty days,
     which is what the bridge walked, so the two figures are still held to the walk to the penny. */
  const opening = reading(k, 'cash-now');
  assert.ok(opening !== null);
  const walked = k.runway(opening, cashWalk().from, 30);
  assert.ok(walked.ok, sayOf(walked));
  assert.deepEqual(walked.value.refusals, [], 'a walk that refuses is money missing from the answer');
  const steps = walked.value.steps;
  assert.ok(steps.length > 0, 'nothing is dated in the next thirty days');
  const sum = (of: (s: { source: string; delta: number }) => boolean) => steps.filter(of).reduce((n, s) => n + s.delta, 0);

  /* WHAT REPEATS IS IN THE WALK NOW, from `recurring`, beside the bills and the parts of a plan. */
  assert.ok(steps.some((s) => s.source === 'recurring'), 'nothing that repeats moves in the next thirty days');
  assert.equal(arriving.value, sum((s) => s.delta > 0), 'Coming in is the money in of the thirty-day walk');
  assert.equal(leaving.value, -sum((s) => s.delta < 0), 'Going out is the money out of the thirty-day walk');
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
 *
 * AND THE WALK'S OWN TWO SINCE money-core 3.0.0, `arriving-30d` and `leaving-30d`, which the Money page leads with:
 * they wear the walk's words because they read the walk.
 */
test('NO PAGE LABELS THE THIRTY-DAY FIGURES MORE WIDELY THAN THEY READ, wherever the page is declared', () => {
  type Cell = { metric?: unknown; label?: unknown };
  type Page = { page?: unknown; blocks?: { cells?: Cell[] }[] };
  const THIRTY = ['in-30d', 'out-30d', 'arriving-30d', 'leaving-30d'];
  const nameOf = (metric: string): string => String((METRICS[metric] as { name?: unknown } | undefined)?.name);
  const cells: { where: string; metric: string; label: string }[] = [];
  const walk = (where: string, pages: readonly Page[]) => {
    for (const p of pages)
      for (const b of p.blocks ?? [])
        for (const c of b.cells ?? [])
          if (typeof c.metric === 'string' && THIRTY.includes(c.metric)) cells.push({ where: `${where} /${String(p.page)}`, metric: c.metric, label: String(c.label) });
  };
  walk('money-core', Object.values(PAGES) as readonly Page[]);
  for (const u of USE_CASES) walk(u.usecase, ((u.pack?.declarations ?? []) as Page[]).filter((d) => d.page !== undefined));

  /* THE COUNTS ARE ASSERTED BECAUSE A SWEEP THAT FINDS NOTHING PASSES EVERY LOOP BELOW IT: the walk's two tiles on
     `/p/money`, and the same two on each of the founder's Overview and Dashboard, which since founder 1.7.0 lead with
     the money there is and no longer with who owes whom. */
  /* THE HERO'S TWO SINCE money-core 3.29.0, the walk's own words, where there was one (leaving) under Every month on
     `/p/money` from 3.27.0: what goes out in the next thirty days under Every month, in the walk's
     own words, as Today's money tile says it: none from 3.3.0, when the bridge said the thirty days there, and the
     bridge has been off Money since. */
  assert.deepEqual(
    cells.filter((c) => c.where === 'money-core /money').map((c) => [c.metric, c.label]),
    [['arriving-30d', 'In, next 30 days'], ['leaving-30d', 'Out, next 30 days']],
    'the Money page says the thirty days twice again',
  );
  /* AND NONE ON THE FOUNDER'S DASHBOARD SINCE founder 1.16.0, which drew the walk's two under the cash
     Home's line had just said: the money is Home's and Money's, and the Dashboard is the numbers. */
  assert.equal(cells.filter((c) => c.where.startsWith('founder ')).length, 0, "the founder's Dashboard says Home's money again");

  /* SO NO PAGE DECLARES ONE TODAY, and the sweep is driven over a page made up for the purpose, wearing the bridge's
     words over the figure that reads one predicate, which it has to find and the loop under it has to refuse. */
  const declared = cells.length;
  walk('made-up', [{ page: 'made-up', blocks: [{ cells: [{ metric: 'out-30d', label: 'Going out, 30 days' }] }] }]);
  const made = cells.splice(declared);
  assert.equal(made.length, 1, 'the sweep does not find a cell over out-30d');
  assert.notEqual(made[0]!.label, nameOf(made[0]!.metric), 'the made-up label is the wrong one, so the loop under it would refuse it');
  for (const c of cells) assert.equal(c.label, nameOf(c.metric), `${c.where} labels ${c.metric} "${c.label}" where the figure is called "${nameOf(c.metric)}"`);

  /* AND THE CEILING ON `out-30d` IS WORDED FOR THE SAME FIGURE, because a person reading "Most going
     out in 30 days" over a box that caps what is OWED sets it against money the figure never counts.
     The test above it proves the rename costs nobody their saved sum. */
  assert.equal(MONEY_TARGET_SETTINGS['out-30d']?.label, 'Most payables due in 30 days');
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
 * WHAT REPEATS HAS ONE HOME, `recurring`, AND THE WALK READS IT THERE, SINCE money-core 3.0.0.
 *
 * The walk read `obligations.repeats` and left `recurring` out, so a salary typed into Repeating never reached Cash
 * ahead; and an import may write each stream as a bill that repeats and as a line of `recurring`, so walking
 * both would count it twice. A bill is walked once, on its day, when it does not say it repeats; a bill that does keeps
 * the word on its row and is walked from its line instead.
 */
test('WHAT REPEATS IS WALKED FROM ONE LIST AT EVERY CADENCE, and a bill that says it repeats is kept and walked no more', async () => {
  const k = await seeded();
  const opening = reading(k, 'cash-now');
  assert.ok(opening !== null);
  const { from, horizon } = cashWalk();
  assert.ok(from.some((leg) => leg.register === 'recurring'), 'the cash walk does not read the repeating list');

  /* A WEEK IS SEVEN DAYS whatever month it falls in, so the cleaner's steps are a week apart all year. A YEAR AND NOT THE
     LENGTH THE CHART OPENS ON, which is three months since money-core 3.7.0, with a year a press away. */
  const walked = contribution(k, opening, from, 365, 'recurring').walk.steps.filter((s) => s.source === 'recurring');
  const cleaning = walked.filter((s) => s.label === 'Studio cleaning');
  assert.ok(cleaning.length >= 50, `a weekly line stepped ${cleaning.length} times in a year`);
  for (let i = 1; i < cleaning.length; i++)
    assert.equal((Date.parse(cleaning[i]!.day) - Date.parse(cleaning[i - 1]!.day)) / 86_400_000, 7, 'a weekly step landed off its week');
  /* AND A LINE THAT HAS STOPPED MOVES NOTHING. */
  assert.deepEqual(walked.filter((s) => s.label === 'Hobnail plan'), [], 'an ended line is still walked');

  /* A BILL THAT SAYS IT REPEATS KEEPS THE WORD AND IS WALKED NO MORE; one that does not is walked once, on its day. */
  const repeating = k.create('obligations', { what: 'Printer lease', direction: 'owed_by_me', amount: { amount: 12_300, currency: 'GBP' }, due: day(5), state: 'open', repeats: 'monthly' } as never, { actor: 'p_test' });
  assert.ok(repeating.ok, sayOf(repeating));
  const once = k.create('obligations', { what: 'Printer toner', direction: 'owed_by_me', amount: { amount: 4_560, currency: 'GBP' }, due: day(6), state: 'open' } as never, { actor: 'p_test' });
  assert.ok(once.ok, sayOf(once));
  const bills = contribution(k, opening, from, horizon, 'obligations').walk.steps.filter((s) => s.source === 'obligations');
  assert.deepEqual(bills.filter((s) => s.label === 'Printer lease'), [], 'a bill that repeats was walked as well as its line');
  assert.deepEqual(bills.filter((s) => s.label === 'Printer toner').map((s) => [s.day, s.delta]), [[day(6), -4_560]]);
  assert.equal(k.get((repeating.value as { id: string }).id)!.fields.repeats, 'monthly', 'the word the bill said was taken off it');
});

test('MONEY ON ITS WAY IS WALKED IN ON THE DAY IT ARRIVES, and it is not cash until then', async () => {
  const k = await seeded();
  const before = reading(k, 'cash-now');
  assert.ok(before !== null);
  const made = k.create(
    'accounts',
    { name: 'Payout in transit', kind: 'bank', balance: { amount: 54_321, currency: 'GBP' }, as_of: day(0), liquid: false, arrives: day(10) } as never,
    { actor: 'p_test' },
  );
  assert.ok(made.ok, sayOf(made));
  assert.equal(reading(k, 'cash-now'), before, 'money on its way was counted as cash now');

  const { from, horizon } = cashWalk();
  const landed = contribution(k, before, from, horizon, 'accounts').walk.steps.filter((s) => s.source === 'accounts');
  assert.deepEqual(landed.map((s) => [s.day, s.delta]), [[day(10), 54_321]], 'the payout does not land on its day');
});

test('CASH NOW MOVES WITH WHAT MOVED, from each account\'s newest balance, and a balance check restarts the account', async () => {
  const k = await seeded();
  const current = k.get('accounts#1')!;
  const reserve = k.get('accounts#2')!;
  const before = reading(k, 'cash-now')!;
  /* NOTHING IN THE SAMPLE MOVED ON A LIQUID ACCOUNT AFTER THE DAY ITS BALANCE WAS TYPED, so the figure starts as the
     balances as typed, and every change below is one this test made. */
  assert.equal(before, ACCOUNTS.filter((a) => a.liquid === true).reduce((n, a) => n + minor(a.balance), 0));

  /* A PAYMENT CLEARED TODAY, after the current account's balance was typed yesterday, comes off it. */
  const paid = k.create('transactions', { what: 'TEST PAYMENT', on: day(0), direction: 'out', amount: { amount: 12_345, currency: 'GBP' }, account: current.id, state: 'cleared' } as never, { actor: 'p_test' });
  assert.ok(paid.ok, sayOf(paid));
  assert.equal(reading(k, 'cash-now'), before - 12_345);

  /* A PENDING ONE IS NOT A FACT YET, and it moves nothing. */
  const pending = k.create('transactions', { what: 'TEST HOLD', on: day(0), direction: 'out', amount: { amount: 1_000, currency: 'GBP' }, account: current.id, state: 'pending' } as never, { actor: 'p_test' });
  assert.ok(pending.ok, sayOf(pending));
  assert.equal(reading(k, 'cash-now'), before - 12_345);

  /* A BALANCE CHECK NEWER THAN THE RESERVE'S OWN DAY RESTARTS THE RESERVE FROM IT (`balances`, the new list). */
  const checked = k.create('balances', { account: reserve.id, balance: { amount: 2_000_000, currency: 'GBP' }, as_of: day(-3), source: 'Statement' } as never, { actor: 'p_test' });
  assert.ok(checked.ok, sayOf(checked));
  assert.equal(reading(k, 'cash-now'), before - 12_345 - minor(reserve.fields.balance) + 2_000_000);
});

test('A BILL MARKED PAID SAYS THE DAY IT WAS PAID, because the record writes it, and reopened it says nothing', async () => {
  const k = await seeded();
  const bill = k.get('obligations#1')!;
  assert.equal(bill.fields.state, 'open');
  assert.equal(REGISTERS.obligations!.finished, 'settled');

  const paid = k.update('obligations', bill.id, { state: 'paid' }, { actor: 'p_test' });
  assert.ok(paid.ok, sayOf(paid));
  assert.equal(k.get(bill.id)!.fields.settled, day(0), 'the history of money in and out reads a day nothing wrote');

  const reopened = k.update('obligations', bill.id, { state: 'open' }, { actor: 'p_test' });
  assert.ok(reopened.ok, sayOf(reopened));
  const settled = k.get(bill.id)!.fields.settled;
  assert.ok(settled === null || settled === undefined, 'a reopened bill still says it was paid');
});

/* ── the Money page as the record draws it ───────────────────────────────── */

/**
 * A block of the Money page as the record draws it, found by the words over it.
 *
 * READ OFF THE DRAWN PAGE AND NOT OFF THE DECLARATION, because a test carrying its own copy of a block would ask its
 * own question and pass while the screen answered something else.
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
  /* BY ITS KIND WHERE IT WEARS NO HEADING, as the walk of the next thirty days has not since money-core 3.13.0. */
  const block = (out.value as { blocks: readonly (DrawnBlock & { kind?: string })[] }).blocks.find((b) => (b.heading ?? b.kind) === heading);
  assert.ok(block, `${slug} draws a block headed ${heading}`);
  assert.deepEqual(block.refusals, [], 'a block that refuses is a heading over a blank rectangle');
  return block;
};

/**
 * ONE PAGE CALLED MONEY, IN THE ORDER A PERSON READS IT: what the money is doing, what there is beside where it is going,
 * what needs the person, what falls due and its arithmetic, where the money sits and goes, and what happened. Overview,
 * Ledger and the house Home retire, and a page holds no rows, so nothing goes with them.
 *
 * FEWER, BIGGER TILES SINCE money-core 3.3.0: the thirty-day tiles beside Cash now, the accounts as cards, the table of
 * what is coming up and the feed of what agents did are gone, each said once elsewhere on the page or in History.
 */
test('MONEY IS ONE PAGE, and every block on it answers on the sample without a refusal', async () => {
  assert.deepEqual(
    Object.keys(MONEY_PAGES),
    ['money', 'money-book', 'money-plan', 'money-rules', 'money-account', 'money-bill', 'money-accounts', 'money-ledger', 'money-budgets', 'money-coming', 'money-forecast', 'money-reports', 'money-payees'],
    'money-core declares a page besides Money, one a book, one a plan, one of its filing rules, one an account, one a bill, and since 3.29.0 a page per job of the section',
  );
  const page = MONEY_PAGES.money!;
  assert.equal(page.title, 'Money');
  assert.ok(!(page.requires as string[]).includes('register.people'), 'Money needs People again');
  const headings = (page.blocks as { heading?: string }[]).map((b) => b.heading);
  assert.deepEqual(headings, [
    /* WITH NO ACCOUNT YET: the line asking for one, and what is due and what repeats, while either is held. */
    undefined,
    'Bills and invoices',
    'Repeating',
    /* THE LINE, WHICH CARRIES NO HEADING: it is the sentence in the page's headline tile, in four forms, one of which a
       record draws: what is late and the card, the same ending on the year, the same asking for a bill, and the line
       for two books. */
    undefined,
    undefined,
    undefined,
    undefined,
    'Add an account',
    /* THE HERO, SINCE money-core 3.29.0: Cash now with the walk ahead drawn small, and the four answers under it. */
    undefined,
    /* WHAT NEEDS A LOOK, UNDER THE HERO SINCE money-core 3.34.0, each drawn only while it is true: whether Cash now adds
       up, then an old balance. Heads up closed the page in a box of its own until then. */
    'Cash now does not add up',
    undefined,
    /* OVER TIME, SINCE money-core 3.31.0: net worth's line once it has a week of nights, cash's until then; one draws. */
    'Over time',
    'Over time',
    /* THE BOARD, in pairs: what comes up, what was spent this month, the accounts and the Ledger, then the plans paid in parts. */
    'Coming up',
    'Spent this month',
    'Accounts',
    'Ledger',
    'Instalments',
    /* AND THE BUDGETS AT A GLANCE, SINCE money-core 3.31.0, with no note under it since 3.34.0. */
    "This month's budgets",
  ]);
  /* NO SIDE COLUMN AND NO FOLD: the hero takes the row and the tiles under it pair as one board. */
  const blocks = page.blocks as { heading?: string; area?: string; fold?: boolean; box?: boolean }[];
  assert.equal((page as { layout?: unknown }).layout, undefined);
  assert.deepEqual(blocks.filter((b) => b.area !== undefined).map((b) => b.heading), []);
  assert.deepEqual(blocks.filter((b) => b.fold === true).map((b) => b.heading), []);
  /* AND NO BOX SINCE money-core 3.34.0: Heads up went, and its lines stand under the hero. */
  assert.deepEqual(blocks.filter((b) => b.box === true).map((b) => b.heading), []);
  /* NO LAW ON A PAGE EVERYBODY DRAWS: the late notes say what is late in words any record's owner reads. */
  assert.ok(!JSON.stringify(page).includes('Statutory'), 'a note speaks for one country');

  const k = await seeded();
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  for (const b of (out.value as { blocks: readonly DrawnBlock[] }).blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)} is refused`);
  assert.ok(!k.page('ledger').ok, 'the Ledger page is still on the record');

  /* THE CASH WALK'S LENGTHS AND CONTROLS ARE HELD IN `money-page.test.ts`, with the page's other blocks. */

  /* AND IT LEAVES ITS OWN SENTENCE TO THE PAGE, while the line over it is drawn (money-core 3.6.0). */
  const drawn = (out.value as { blocks: readonly DrawnBlock[] }).blocks as readonly (DrawnBlock & {
    kind?: string;
    lead?: boolean;
    drawn?: boolean;
    headline?: string;
    readings?: readonly { metric: string; reading: { value: number | null; verdict?: string } | null; target?: unknown }[];
  })[];
  assert.ok(drawn.some((b) => b.kind === 'note' && b.lead === true && b.drawn !== false), 'the sample draws no line over Money, so this asks nothing');

  /* THE HERO SAYS HOW LONG THE MONEY LASTS WITH NOTHING COMING IN, AND WHY, SINCE money-core 3.27.0 (Lasts until 3.29.0) (the day the walk goes
     under since 3.12.0, the count of days from 3.11.0; Runs out until 3.17.0). The sample's cash is above nought, so the
     calm tile is drawn with no tone. Its sentence says the day the money with nothing in lasts to and what falls due
     then, and, since the sample's walk with what comes in also goes under inside the year, that day too, which is the
     count's own: today and the days the money lasts. */
  const runs = drawn.find((b) => b.kind === 'stat' && b.lead === true)! as (typeof drawn)[number] & { tone?: string; cells?: { metric: string; note?: string }[]; values?: Record<string, unknown> };
  assert.notEqual(runs.drawn, false, 'the sample runs out inside the year and draws no hero');
  assert.equal(runs.tone, undefined, 'cash above nought is drawn in the danger colour');
  assert.ok(runs.cells?.some((c) => c.metric === 'lasts-no-income'));
  const days = reading(k, 'runway-days');
  const dry = runs.readings?.find((c) => c.metric === 'lasts-no-income')?.reading?.value;
  assert.ok(typeof days === 'number' && typeof dry === 'number', `no days to hold the tile to: ${String(days)}, ${String(dry)}`);
  assert.ok(dry <= days, 'money with nothing coming in lasts longer than money with what comes in');
  const on = reading(k, 'runs-out-on');
  assert.equal(on, Math.floor(NOW / 86_400_000) + days, 'the day is not the count of days from today');
  assert.equal(runs.values?.['lasts-no-income.on'], new Date(NOW + dry * 86_400_000).toISOString().slice(0, 10), 'the sentence does not say the day the days end on');
  assert.equal((METRICS['runs-out-on'] as { format?: string }).format, 'day');
});

/**
 * ROOM FOR WHERE THE MONEY WENT (money-wire-70). A page declares twenty-four blocks at the most
 * (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`) and Money stood at twenty-four, so the two tiles came in for two
 * that went: the folded History heading, which stood over one chart, and Being chased. Nothing above Heads up moved,
 * because that is the page a person reads each morning.
 */
test('MONEY HOLDS NO MORE BLOCKS THAN A PAGE MAY, and its home is the hero and one board', async () => {
  const blocks = MONEY_PAGES.money!.blocks as readonly { kind: string; heading?: string; span?: number; lead?: boolean; area?: string }[];
  assert.ok(blocks.length <= 24, `Money declares ${blocks.length} blocks, and a page declares 24 at the most`);

  /* THE SPENDING IS ON MONEY AGAIN, AS SPENT THIS MONTH, and the budgets are a page of their own. */
  assert.ok(blocks.includes(SPENDING[0] as never), 'Spent this month is not on Money');
  assert.ok(!blocks.includes(BUDGET[0] as never), 'Budgets is back on Money');
  /* THE LINE A PASSED BUDGET WRITES IS NOT PLACED YET: no page writes it (budget-tile-70), and a block that draws
     nothing would cost a tile that does. When this fails the page reader has learnt it or somebody placed it early. */
  assert.ok(!blocks.includes(BUDGET[1] as never), "the passed-budget line is on Money before a page can write it");

  /* WHAT LEADS THE PAGE: with no account the line asking for one and what is held, then the line, the box to add an
     account, the hero, what needs a look under it (since money-core 3.34.0), and then the board. */
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.heading, b.area]),
    [
      ['note', undefined, undefined],
      ['timeline', 'Bills and invoices', undefined],
      ['timeline', 'Repeating', undefined],
      ['note', undefined, undefined],
      ['note', undefined, undefined],
      ['note', undefined, undefined],
      ['note', undefined, undefined],
      ['capture', 'Add an account', undefined],
      ['stat', undefined, undefined],
      ['stat', 'Cash now does not add up', undefined],
      ['note', undefined, undefined],
      /* OVER TIME, SINCE money-core 3.31.0, in its two forms, one of which draws. */
      ['stat', 'Over time', undefined],
      ['stat', 'Over time', undefined],
      ['timeline', 'Coming up', undefined],
      ['bar', 'Spent this month', undefined],
      ['bar', 'Accounts', undefined],
      ['timeline', 'Ledger', undefined],
      ['progress', 'Instalments', undefined],
      ['progress', "This month's budgets", undefined],
    ],
  );
  assert.deepEqual(blocks.map((b, i) => (b.lead === true ? i : -1)).filter((i) => i >= 0), [0, 3, 4, 5, 6, 8]);

  /* AND THE RECORD TAKES THE PAGE AND DRAWS IT ON THE SAMPLE WITHOUT A REFUSAL. */
  const k = await seeded();
  for (const heading of ['Spent this month', 'Coming up', 'Ledger']) blockOf(k, 'money', heading);
});

/**
 * NO ROW OF MONEY IS LEFT HALF EMPTY, WHATEVER IS HIDDEN, since money-core 3.3.0. Every tile is drawn on its own figure,
 * so the sample is one of thousands of pages a record can draw: each figure a `when:` reads is set to nought, one or two
 * in turn, every tile is drawn or not as its `when:` says, and every row the page lays out, greedily as the page does,
 * is the whole twelve.
 */
test('NO ROW OF MONEY IS LEFT HALF EMPTY, whichever of its tiles a record draws', () => {
  type When = { metric: string; gt?: number; gte?: number; lt?: number };
  /* THE MAIN COLUMN, SINCE money-core 3.11.0: the side column is one stack, and a block's span means nothing in it. */
  const blocks = (MONEY_PAGES.money!.blocks as { heading?: string; span?: number; when?: When; area?: string }[]).filter((b) => b.area !== 'rail');
  const gates = [...new Set(blocks.flatMap((b) => (b.when ? [b.when.metric] : [])))];
  const shown = (w: When | undefined, at: Record<string, number>): boolean => {
    if (w === undefined) return true;
    const v = at[w.metric]!;
    return (w.gt === undefined || v > w.gt) && (w.gte === undefined || v >= w.gte) && (w.lt === undefined || v < w.lt);
  };
  for (let n = 0; n < 3 ** gates.length; n++) {
    const at = Object.fromEntries(gates.map((g, i) => [g, Math.floor(n / 3 ** i) % 3]));
    const drawn = blocks.filter((b) => shown(b.when, at));
    let width = 0;
    for (const b of drawn) {
      const span = b.span ?? 12;
      if (width + span > 12) {
        assert.equal(width, 12, `a row is ${width} of 12 before ${String(b.heading)} with ${JSON.stringify(at)}`);
        width = 0;
      }
      width += span;
    }
    assert.equal(width, 12, `the last row is ${width} of 12 with ${JSON.stringify(at)}`);
  }
});

/**
 * THE LOOK, AS THE DECLARATION SAYS IT: a glyph on every tile's heading, the headline figure beside its walk, and words
 * a finance app uses. Read off both pages Money declares, because a book's page is drawn in the same look.
 */
test('EVERY MONEY TILE WEARS A GLYPH, the headline sits beside its walk, and no word on either page says who owes whom', () => {
  type Block = { kind: string; heading?: string; icon?: string; span?: number; body?: string; empty?: string; unset?: string; cells?: { label?: string; note?: string }[] };
  for (const [slug, page] of Object.entries(MONEY_PAGES)) {
    const blocks = page.blocks as Block[];
    for (const b of blocks) if (b.heading !== undefined) assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${slug}: ${b.heading} wears no glyph`);
    const lineAlone = blocks.length === 1 && blocks[0]!.kind === 'note';

    /* A BOOK'S PAGE: FOUR TWELFTHS AND EIGHT, ONE ROW, the figure and the line it walks, read as one question. MONEY'S:
       the walk the whole width under the line, since money-core 3.4.0, with no tile beside it saying the line again. */
    const stat = blocks.findIndex((b) => b.kind === 'stat');
    const walk = blocks.findIndex((b) => b.kind === 'forecast');
    /* MONEY'S, SINCE money-core 3.11.0: the walk the whole main column, and the figure first in the side column beside
       it, straight after it. */
    /* A PLAN'S PAGE WALKS NO CASH (`money-plan`, money-core 3.17.0): it has no headline row to hold to. */
    if (walk < 0) {
      /* NOR AN ACCOUNT'S OR A BILL'S (money-core 3.19.0): each is one thing, said first, and not a walk of the money. */
      /* NOR MONEY'S HOME, SINCE money-core 3.29.0: its hero draws the walk small beside Cash now, and the chart is Forecast's.
         NOR THE SECTION'S PAGES THAT ARE STILL THEIR LINE ALONE. */
      /* NOR BUDGETS, REPORTS OR PAYEES (money-core 3.29.0): each is a job of the section, and Cash ahead is Money's and
         Forecast's. */
      /* NOR THE ACCOUNTS AND THE LEDGER: each is a list of what there is and what moved. */
      /* NOR COMING UP (money-core 3.29.0): what falls due, by week, beside the Forecast page that walks it. */
      assert.ok(['money', 'money-plan', 'money-rules', 'money-account', 'money-bill', 'money-budgets', 'money-reports', 'money-payees', 'money-accounts', 'money-ledger', 'money-coming'].includes(slug) || lineAlone, `${slug}: the page draws no Cash ahead`);
    } else if ((page as { layout?: unknown }).layout !== undefined) {
      assert.equal(blocks[walk]!.span, 12, `${slug}: Cash ahead is not the whole main column`);
      assert.equal((blocks[stat] as { area?: string }).area, 'rail', `${slug}: the figure is not in the side column`);
      assert.equal(stat, walk + 1, `${slug}: something stands between the walk and the figure beside it`);
      /* THE LINE IS ONE OF TWO SINCE money-core 3.17.0, one a record draws: its cash with one book, where it is kept with two. */
      assert.ok(
        blocks.slice(1, walk).every((b) => b.kind === 'bar' || b.kind === 'capture' || (b.kind === 'note' && (b as { lead?: boolean }).lead === true)),
        `${slug}: something stands between the line and its walk`,
      );
    } else if (stat >= 0 && stat < walk) {
      assert.equal(blocks[stat]!.span, 4, `${slug}: the headline tile is not a third of the row`);
      assert.equal(blocks[walk]!.span, 8, `${slug}: Cash ahead does not fill the rest of the headline's row`);
      assert.equal(walk, stat + 1, `${slug}: something stands between the headline and its walk`);
    } else {
      /* A BOOK'S PAGE SINCE money-core 3.34.0: no What you have tile, and Cash ahead is the hero, the whole row. */
      assert.equal(blocks[walk]!.span, 12, `${slug}: Cash ahead is not the whole width`);
      /* ONLY WHAT TAKES THE LINE'S OR THE WALK'S PLACE: a book's bar for the line, the box for a first account, and the
         lines a page opens on. */
      assert.ok(
        blocks.slice(1, walk).every((b) => b.kind === 'bar' || b.kind === 'capture' || (b.kind === 'note' && (b as { lead?: boolean }).lead === true)),
        `${slug}: something stands between the line and its walk`,
      );
    }

    /* WHAT A PERSON READS, AND ONLY THAT: a `where:` is the record's grammar, and `direction is owed to me` is an id. */
    const read = blocks.flatMap((b) => [b.heading, b.body, b.empty, b.unset, ...(b.cells ?? []).flatMap((c) => [c.label, c.note])]).filter((t): t is string => typeof t === 'string');
    /* A PLAN'S PAGE READS TEN SINCE ITS LEAD BECAME ONE SENTENCE (plan-lead-sentence-70), where four figures had a label each. */
    /* AN ACCOUNT'S AND A BILL'S PAGE READ TWO AND THREE (money-core 3.19.0): one card, and a heading or two under it. */
    /* A SECTION'S PAGE THAT IS STILL ITS LINE ALONE READS ONE (money-core 3.29.0), and is held to more once it has blocks. */
    const least = slug === 'money-rules' || slug === 'money-ledger' ? 8 : slug === 'money-account' ? 2 : slug === 'money-bill' ? 2 : lineAlone ? 1 : 10;
    assert.ok(read.length >= least, `${slug}: the sweep read almost nothing, so it proves nothing`);
    for (const t of read) assert.doesNotMatch(t, /\bowe[ds]?\b|\byou owe\b|\bowing\b/iu, `${slug} says "${t}"`);
  }

  /* AND THE FIGURES AND SETTINGS SAY IT IN THE SAME WORDS, wherever a figure or a ceiling is listed. */
  for (const m of Object.values(MONEY_METRICS)) assert.doesNotMatch(String(m.name), /\bowe[ds]?\b/iu, `${m.metric} is called ${String(m.name)}`);
  for (const [metric, s] of Object.entries(MONEY_TARGET_SETTINGS)) assert.doesNotMatch(s.label, /\bowe[ds]?\b/iu, `${metric}'s ceiling is called ${s.label}`);
  for (const f of REGISTERS.snapshots!.fields) assert.doesNotMatch(String(f.label ?? ''), /\bowe[ds]?\b/iu, `a night's ${f.id} is called ${String(f.label)}`);
});

/**
 * THE HEADLINE LINE, SINCE money-core 3.3.0: said on every record that keeps one set of money, from the figures the
 * tiles draw, with the day count only while the walk goes under (the writer leaves a clause out when its figure has no
 * value). And what is paid in parts is one track a plan (money-core 3.2.0).
 */
test('MONEY OPENS WITH ONE LINE OF WHAT THE MONEY IS DOING, and what is paid in parts is one track a plan', async () => {
  const k = await seeded();
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const blocks = (out.value as { blocks: readonly (DrawnBlock & { kind: string; lead?: boolean; drawn?: boolean; body?: string; values?: Record<string, unknown> })[] }).blocks;

  /* THE LINE IS THE FIRST BLOCK, AND IT READS THE FIGURES THE TILES DRAW. */
  const lead = blocks[0]!;
  assert.deepEqual([lead.kind, lead.lead], ['note', true]);
  assert.notEqual(lead.drawn, false, 'a record with one set of money reads no line about it');
  /* NO DAY COUNT IN IT SINCE money-core 3.11.0: Runs out says it, beside the walk. */
  /* AND HOW FAR CASH MOVED ON A MONTH AGO, since the sample holds its nights from the moment it is made (`cashPoints`). */
  /* AND NOT HOW LONG IT LASTS WITH NO INCOME, which the Lasts tile says beside the day on what is due since the redesign (money F3): the line said it from money-core 3.17.0 (money-lasts-no-income-95). */
  /* EACH CURRENCY APART, AND THE ACCOUNTS THE ACCOUNTS TILE LISTS, SINCE money-core 3.27.0: the sample keeps one
     currency, so nothing is said converted, and every account it counts as cash holds money. */
  /* AND SINCE money-core 3.33.0 (AF4) THE BILLS THAT ARE LATE, OR THE LOW POINT WITH NOTHING LATE, BEFORE THE CARD. */
  /* AND SINCE money-core 3.34.0 THE INVOICES LATE COMING IN, with the part of a plan that is late riding at the start of
     each sentence about what is late. */
  const LINE_SAYS = ['card-to-pay', 'card-to-pay-on', 'overdue', 'late-in', 'runway-days.low', 'runway-days.low_on'];
  for (const k of Object.keys(lead.values ?? {})) assert.ok(LINE_SAYS.includes(k) || k.startsWith('installments-late.'), `the line says ${k}`);
  assert.ok(Object.hasOwn(lead.values ?? {}, 'card-to-pay'));
  /* HOW MUCH, AND HOW FAR IT MOVED, ARE THE HERO'S SINCE money-core 3.29.0, drawn under the line in the figure's own size. */
  const hero = blocks.find((b) => b.kind === 'stat' && b.lead === true)!;
  assert.deepEqual(Object.keys(hero.values ?? {}).filter((v) => v.startsWith('cash-now.')).sort(), ['cash-now.moved']);
  const monthAgo = cashSeries().find((p) => p.at === new Date(NOW - 30 * 86_400_000).toISOString().slice(0, 10))!.value;
  const moved = Math.round(((reading(k, 'cash-now')! - monthAgo) / monthAgo) * 100);
  assert.ok(moved < 0, 'the sample held less a month ago, so this proves no sign');
  /* IN WORDS: "6% down on a month ago", where it said "−6%". */
  assert.equal(hero.values?.['cash-now.moved'], `${-moved}% down`);
  /* THE LINE IS ONLY WHAT NEEDS DOING SINCE money-core 3.29.1: the part that is late, then the card to pay. */
  /* WHAT HURTS MOST FIRST SINCE money-core 3.33.0 (AF4): the bills that are late, or the low point, then the card. */
  const said = lead.body?.split(/(?<=\.)\s+/u) ?? [];
  assert.equal(said.at(-1), '{{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}.');
  assert.equal(reading(k, 'installments-late'), 0, 'the sample has no part late');
  if (said.length > 1)
    assert.match(
      said[0]!,
      /^(?:\{\{installments-late\.first\}\} is \{\{bad:late\}\}|Bills \{\{bad:late\}\}: \[\{\{overdue\}\}\]\(\/r\/obligations\?[^)]+\) to pay\.|Invoices \{\{bad:late\}\}: \[\{\{late-in\}\}\]\(\/r\/obligations\?[^)]+\) to come in\.|Cash falls to \{\{runway-days\.low\}\})/u,
    );

  /* THE LINE'S FIGURES REMEMBER THEIR NIGHTS, so Cash ahead draws how cash moved up to today and a book's tile its line. */
  for (const metric of ['cash-now', 'runway-days'])
    assert.equal((MONEY_METRICS[metric] as { snapshot?: { into: string } }).snapshot?.into, `series.${metric}`, `${metric} remembers no night`);

  /* ONE TRACK A PLAN, EACH FROM THE TWO COUNTS BY PLAN: the parts that go out and are not cancelled, and the paid of them. */
  const parts = blockOf(k, 'money', 'Instalments') as Omit<DrawnBlock, 'readings'> & { readings?: readonly { metric: string; reading: { groups?: { key: string; value: number | null }[] } | null }[] };
  const leaving = INSTALLMENTS.filter((r) => r.direction === 'out' && r.state !== 'cancelled');
  const counted = (rows: typeof leaving) => Object.fromEntries([...new Set(rows.map((r) => String(r.plan)))].map((p) => [p, rows.filter((r) => String(r.plan) === p).length]));
  const byPlan = (id: string) => Object.fromEntries((parts.readings?.find((c) => c.metric === id)?.reading?.groups ?? []).map((g) => [g.key, g.value]));
  assert.deepEqual(byPlan('installments-total-by-plan'), counted(leaving));
  assert.deepEqual(byPlan('installments-paid-by-plan'), counted(leaving.filter((r) => r.state === 'paid')), 'the paid parts are what each track fills with');
});

/**
 * WHERE THE MONEY SITS, WHAT FALLS DUE AND WHAT MOVED, read off the drawn page: the accounts add up to the headline, the
 * calendar holds the next thirty days and nothing else, and the ledger is newest first with every minor unit.
 */
test('THE ACCOUNTS ADD UP TO CASH NOW, Coming up is the next few things, and what moved is newest first', async () => {
  const k = await seeded();

  /* ONE PART AN OPEN ACCOUNT, THE CARD TOO SINCE money-core 3.32.0 (`balance-by-account`), NAMED AS THE RECORD NAMES IT,
     and the parts of the accounts that count as cash are the headline to the penny. */
  const accounts = blockOf(k, 'money', 'Accounts') as DrawnBlock & { readings?: readonly { reading: { value: number | null; groups?: { key: string; value: number | null }[] } | null }[] };
  const split = accounts.readings?.[0]?.reading;
  assert.ok(split?.groups && split.groups.length > 1, 'the sample keeps two accounts as cash, and the tile draws one part');
  assert.deepEqual(split.groups.map((g) => g.key).sort(), ACCOUNTS.filter((a) => a.state !== 'closed').map((a) => String(a.name)).sort());
  const cash = new Set(ACCOUNTS.filter((a) => a.liquid === true).map((a) => String(a.name)));
  assert.equal(split.groups.filter((g) => cash.has(g.key)).reduce((n, g) => n + (g.value ?? 0), 0), reading(k, 'cash-now'), 'the accounts do not add up to Cash now');
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const drawn = (heading: string) => (out.value as { blocks: readonly { heading?: string; drawn?: boolean }[] }).blocks.find((b) => b.heading === heading)?.drawn;
  assert.equal(drawn('Add an account'), false, 'the box to add a first account is drawn on a record that has one');

  /* A BALANCE MORE THAN A WEEK OLD IS SAID ON THE PAGE, now the accounts are no longer cards that mark it. */
  const old = ACCOUNTS.filter((a) => a.liquid === true && String(a.as_of) < day(-7)).length;
  assert.ok(old > 0, 'the sample keeps no old balance, so this proves nothing');
  assert.equal(reading(k, 'balances-stale'), old);
  const stale = (out.value as { blocks: readonly { body?: string; drawn?: boolean }[] }).blocks.find((b) => String(b.body).startsWith('Oldest balance'));
  assert.ok(stale && stale.drawn !== false, 'an old balance is not said on the page that reads it');
  /* UNDER THE HERO SINCE money-core 3.34.0, and in no Heads up box. */
  const shown = (out.value as { blocks: readonly { heading?: string; kind?: string; lead?: boolean; body?: string }[] }).blocks;
  assert.equal(shown.some((b) => b.heading === 'Heads up'), false, 'the line about an old balance is drawn in a tile round it');
  assert.ok(shown.indexOf(stale) < shown.findIndex((b) => b.heading === 'Over time'), 'the line about an old balance is not under the hero');

  /* THE NEXT FEW THINGS THAT MOVE MONEY, each with its money: Coming up reads from today and the next two weeks, six lines
     (money-core 3.32.0, `COMING_UP_WHERE`: what is late is the line's), over the one source Today's Due soon reads. */
  const due = blockOf(k, 'money', 'Coming up');
  assert.ok(due.rows.length > 0, 'nothing falls due on the sample, so this proves nothing');
  assert.ok(due.rows.length <= 6, 'Coming up holds more than six lines');
  for (const r of due.rows) {
    assert.ok(r.fields.amount !== null && typeof r.fields.amount === 'object', `${String(r.fields.title)} holds no money`);
    assert.ok(String(r.fields.day) >= day(0) && String(r.fields.day) <= day(14), `${String(r.fields.title)} falls due on ${String(r.fields.day)}`);
  }
  const across = k.block({ kind: 'table', source: 'deadlines', where: 'amount is set, day after -1d', horizon: 14, limit: 6 } as never);
  const named = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => `${String(r.fields.day)} ${String(r.fields.row)}`).sort();
  assert.deepEqual(named(due.rows), named(across.rows ?? []));

  /* NEWEST FIRST, AND THE AMOUNT AS THE ROW HOLDS IT: a ledger keeps every minor unit. */
  const moved = blockOf(k, 'money', 'Ledger');
  const days = moved.rows.map((r) => String(r.fields.on));
  assert.deepEqual(days, [...days].sort().reverse());
  assert.ok(moved.rows.every((r) => Number.isInteger((r.fields.amount as { amount: number }).amount)));
});

/**
 * A FRESH RECORD READS A CALM PAGE: no tile whose question has no answer yet. What is left is the headline tile and the
 * box to add the first account, which is the one thing to do. No question is asked on Money now (they
 * are Decide's), so a record nobody has asked anything of draws no band saying so.
 */
test('A BLOCK WITH NOTHING TO SAY IS NOT DRAWN, so a fresh record reads its line and the box to add an account', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  for (const id of ['portfolio', 'people', 'money-core']) assert.ok((await put(k, document(id))).ok, id);
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const blocks = (out.value as { blocks: readonly { heading?: string; drawn?: boolean; refusals: readonly unknown[] }[] }).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)} is refused`);
  assert.deepEqual(
    blocks.filter((b) => b.drawn !== false).map((b) => b.heading),
    [undefined, 'Add an account'],
  );
});

/**
 * A RECORD WITH AN ACCOUNT AND NOTHING WRONG DRAWS NOTHING THAT NEEDS A LOOK. Each line under the hero is gated on
 * something that does not add up or is stale, so on the most common healthy day every one is hidden. Until money-core
 * 3.34.0 they stood in a Heads up box, shut when nothing in it was drawn; the box is gone, and so is its heading.
 */
test('WHAT NEEDS A LOOK IS NOT DRAWN WHEN NOTHING IS TRUE, on a record with an account and nothing stale or late', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  for (const id of ['portfolio', 'people', 'money-core']) assert.ok((await put(k, document(id))).ok, id);
  const made = k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true } as never, { actor: 'p_test' });
  assert.ok(made.ok, sayOf(made));
  assert.equal(reading(k, 'cash-accounts'), 1);
  for (const id of ['balances-stale', 'late-in', 'overdue']) assert.ok(!((reading(k, id) ?? 0) > 0), `${id} is true on a record with nothing wrong`);
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const blocks = (out.value as { blocks: readonly { heading?: string; body?: string; drawn?: boolean }[] }).blocks;
  assert.equal(blocks.some((b) => b.heading === 'Heads up'), false, 'Heads up is back on Money');
  assert.equal(blocks.find((b) => b.heading === 'Cash now does not add up')?.drawn, false, 'Cash now is said not to add up');
  assert.equal(blocks.find((b) => String(b.body).startsWith('Oldest balance'))?.drawn, false, 'an old balance is said');
});

/**
 * A SPLIT IS DRAWN ONLY WHILE IT HAS A PART TO CUT, SINCE money-core 3.8.0. An account at nought is no
 * part of Cash now by account, so a record whose cash all stood at nought drew Accounts as a tile saying every part was
 * zero; and a book whose last payment was last month drew Where this month's money went as a track with nothing in it.
 */
test("A SPLIT IS DRAWN ONLY WHILE IT HAS A PART TO CUT, on Money's Accounts and on a book's month", async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  for (const id of ['portfolio', 'people', 'money-core']) assert.ok((await put(k, document(id))).ok, id);
  const drawn = (slug: string, heading: string): boolean => {
    const out = k.page(slug);
    assert.ok(out.ok, sayOf(out));
    const block = (out.value as { blocks: readonly { heading?: string; drawn?: boolean; refusals: readonly unknown[] }[] }).blocks.find((b) => b.heading === heading);
    assert.ok(block, `${slug} draws no block headed ${heading}`);
    assert.deepEqual(block.refusals, [], `${heading} is refused`);
    return block.drawn !== false;
  };
  const made = (register: string, fields: Record<string, unknown>): string => {
    const out = k.create(register, fields as never, { actor: 'p_test' });
    assert.ok(out.ok, sayOf(out));
    return (out.value as { id: string }).id;
  };

  const studio = made('books', { name: 'Studio' });
  const current = made('accounts', { name: 'Studio current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(0), liquid: true, book: studio });
  assert.equal(reading(k, 'cash-accounts'), 1, 'the account counts as cash');
  assert.equal(drawn('money', 'Accounts'), false, 'one account at nought is cut into a track with no part');
  assert.ok(k.update('accounts', current, { balance: { amount: 250_000, currency: 'GBP' } }, { actor: 'p_test' }).ok);
  assert.equal(drawn('money', 'Accounts'), true, 'an account holding money is not cut into its track');

  /* THE BOOK'S MONTH, held to the split's own clauses: last month's payment is not this month's. */
  const month = "Where this month's money went";
  /* A CATEGORY ON THE PAYMENT: a split whose every row falls under its `unset:` label reads unsaid (`drawn.ts`), and the
     month is what is under test here, not the uncategorised case. */
  const rent = made('categories', { name: 'Studio rent', direction: 'out', state: 'live' });
  const paid = (on: string) => made('transactions', { what: 'Studio rent', on, direction: 'out', amount: { amount: 40_000, currency: 'GBP' }, account: current, state: 'cleared', book: studio, category: rent });
  /* READ A BOOK AT A TIME, as `book-cash` is: the page fills `{{it}}` with the book's name, and so does this. */
  const spent = (): number | null => {
    const decl = METRICS['book-spent-month'] as { where: string };
    const out = k.metric({ ...decl, where: decl.where.replace('{{it}}', 'Studio') } as never);
    assert.ok(out.ok, sayOf(out));
    return out.value.value;
  };
  assert.equal(drawn('studio', month), false, 'a book with nothing paid out of it draws a month with no part');
  paid(day(-5));
  assert.equal(spent(), 0, "last month's payment is counted in this month");
  assert.equal(drawn('studio', month), false, "last month's payment is drawn as this month's");
  paid(day(0));
  assert.equal(spent(), 1);
  assert.equal(drawn('studio', month), true, 'a payment this month is not drawn on its book');
});

test('MONEY INSTALLS AND DRAWS WITH PEOPLE OFF, because who a row is with is a link and not a need', async () => {
  const manifest = firstPartyManifest('money-core');
  assert.deepEqual(manifest.requires, ['register.things']);
  assert.ok(manifest.links.includes('register.people'), 'Money does not say it links to People');

  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await put(k, document('portfolio'))).ok, 'portfolio');
  const doc = firstPartyDocument('money-core', { seeds: [], holds: ['things'] })!;
  const lists = (doc.declarations as { register?: string; fields?: { id: string }[] }[]).filter((d) => d.register !== undefined);
  for (const d of lists) assert.ok(!(d.fields ?? []).some((f) => f.id === 'party'), `${String(d.register)} still points at People`);
  const landed = await put(k, doc);
  assert.ok(landed.ok, `Money did not install without People: ${said(landed)}`);

  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const refusals = (out.value as { blocks: readonly DrawnBlock[] }).blocks.flatMap((b) => b.refusals as { code?: string }[]);
  assert.deepEqual(refusals.filter((r) => r.code === 'REGISTER_UNKNOWN' || r.code === 'FIELD_UNKNOWN'), [], 'the page reads a list or a field the record does not hold');
});

/**
 * WHAT `ends` COSTS THE MONTHLY FIGURES, AND THE TWO THINGS THAT KEEP IT OUT OF THEM.
 *
 * A line whose last day has passed was counted at its full monthly share for ever, because the figures read
 * `state is live` and nothing moved the row. Since money-core 3.0.0 two things stop it:
 *
 *   1. THE FIGURES FILTER ON `ends` THEMSELVES, empty or on or after today (`LIVE_LINES`), in the tree form, because
 *      the sentence joins its conditions with a comma or with a comma and `or`, never both. The last lines of this
 *      test pin the sentence's refusal, so nobody has to try it again.
 *   2. AND THE ROW IS MOVED: `recurring-ended`, `when: 'state is live, ends before today'`, `then: [{ move: 'ended' }]`,
 *      swept hourly by `rulesAboutTime` because its `when:` names a relative day and it declares `once_per`, so a list
 *      a person filters by hand reads it right too.
 *
 * `ends is empty` ALONE WOULD BE WORSE THAN NOTHING: an importer skips a stream that ended before the export and writes `ends` only when it is still ahead, so
 * every row carrying an `ends` at all is a schedule still running.
 */
test('A SCHEDULE STOPS COUNTING THE DAY AFTER ITS LAST, before the hourly sweep ends it, and the sweep ends it', async () => {
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
     that stopped before the export, so what a record accumulates
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

  /* THE LINES AS THE SAMPLE HOLDS THEM, and then the pass on top of them while its day is ahead. */
  const base = monthly(lines('out'));
  assert.equal(reading(k, 'every-month-out'), base + 24_900);

  /* THE LAST DAY ITSELF, SWEPT, BECAUSE `before` IS EXCLUSIVE AND A SCHEDULE'S LAST DAY IS ITS OWN. `ends` is `day(3)`,
     so this is the day the pass names as its last, and the payment on it is still owed: the rule does not match, the
     row stays live, and the figure still counts it. */
  now = NOW + 3 * 86_400_000;
  k.purge();
  assert.equal(stateOfPass(), 'live', 'a schedule is live on the last day it names');
  assert.equal(reading(k, 'every-month-out'), base + 24_900, 'and the figure still counts it, because that month is still owed');

  /* THE DAY AFTER ITS LAST, AND NOBODY HAS TOUCHED THE ROW. The figure leaves it out on its own, before any sweep. */
  now = NOW + 4 * 86_400_000;
  assert.equal(stateOfPass(), 'live', 'the row moved before the sweep ran, so this proves nothing about the figure');
  assert.equal(reading(k, 'every-month-out'), base, 'a schedule past its last day is still counted a month');

  /* THE HOURLY SWEEP, DRIVEN. `purge()` is `sweepRecord`, which calls `rulesAboutTime`, which reads every rule whose
     `when:` names a relative day and which declares `once_per` (`recurring-ended` is one) and applies it in bulk. */
  k.purge();
  assert.ok(k.get(passId), 'the row is still there, ended rather than removed');
  assert.equal(stateOfPass(), 'ended');
  assert.equal(reading(k, 'every-month-out'), base);

  /* AND THE SENTENCE IS STILL A REFUSAL, which is why the figures carry the tree. `or` between values is over the
     VALUES of one field, so the clause is read as `ends is <the words empty or ends after today>`. */
  const said = k.list({ register: 'recurring', where: 'state is live, direction is out, every is monthly, ends is empty or ends after today', limit: 50 });
  assert.ok(refused(said), 'the recorded repair parses, and it must not');
  assert.equal(said.refusal.code, 'VALUE_MALFORMED');
  assert.match(String(said.refusal.fix), /empty is not a value ends can hold/);
});

/* ── the currency the figures claim ──────────────────────────────────────── */

/**
 * NO MONEY FIGURE NAMES A CURRENCY, SINCE money-core 3.0.0, AND NO MONEY TARGET NAMES A SUM.
 *
 * Every figure said `money.GBP`, read off the sample's rows, and every ceiling was a sterling sum, so a record in
 * Egyptian pounds read "no more than £50,000.00" under figures about its own money. A
 * `money` figure is added up in the record's home currency, else the one currency its rows are in, else one amount per
 * currency; and a ceiling is a setting that starts empty, which is no verdict until a person types one.
 */
test('EVERY MONEY FIGURE IS IN THE CURRENCY THE RECORD CHOSE, and every money ceiling starts empty', () => {
  const money = Object.values(MONEY_METRICS).filter((m) => m.format === 'money');
  assert.ok(money.length > 0, 'money-core declares no money figure');
  assert.deepEqual(Object.values(MONEY_METRICS).filter((m) => m.format?.startsWith('money.')).map((m) => m.metric), [], 'a figure names its currency');

  const config = (document('money-core').config ?? {}) as Record<string, { type?: string; default?: unknown }>;
  for (const [metric, said] of Object.entries(MONEY_TARGET_SETTINGS)) {
    const target = MONEY_METRICS[metric]?.target;
    assert.equal(target?.setting, said.setting, `${metric} does not name its setting`);
    assert.ok(config[said.setting], `${said.setting} is not among the pack's settings`);
    if (said.type !== 'money') continue;
    assert.equal(target?.lte ?? target?.gte, undefined, `${metric} carries a sum a pack cannot know the currency of`);
    assert.equal(config[said.setting]!.default, undefined, `${said.setting} starts at a sum nobody typed`);
  }

  /* THE FIGURES THE CONTRACT NAMES, and the two Home leads with, in order. */
  for (const id of ['cash-now', 'runway-days', 'arriving-30d', 'leaving-30d', 'in-by-month', 'out-by-month', 'net-by-month', 'spent-by-category-month', 'every-month-in', 'every-month-out', 'owed-to-you', 'owed-by-you'])
    assert.ok(MONEY_METRICS[id], `${id} is not declared`);
  const home = Object.values(MONEY_METRICS).filter((m) => m.home !== undefined).sort((a, b) => a.home! - b.home!).map((m) => m.metric);
  assert.deepEqual(home, ['cash-now', 'runway-days']);
});

/**
 * AND THE READINGS ARE CHECKED AGAINST THE ROWS BY READING THEM, not by trusting the declarations above: the sample's
 * rows are in one currency, so every money figure comes back in it, or over an empty list in none.
 */
test('EVERY MONEY FIGURE IT DECLARES COMES BACK IN THE CURRENCY ITS OWN ROWS CARRY, or carries none at all', async () => {
  const k = await seeded();
  const sample = String((ACCOUNTS[0]!.balance as { currency: string }).currency);
  const read = Object.values(MONEY_METRICS).filter((m) => m.format === 'money' && !JSON.stringify(m).includes('{{it}}'));
  assert.ok(read.length > 0, 'no money figure was read, so this test would pass over nothing');

  for (const m of read) {
    const out = k.metric(withoutLegs(m, (register) => !ADDON_LEG_LISTS.has(register)) as never);
    assert.ok(out.ok, `${m.metric}: ${sayOf(out)}`);
    assert.equal(out.value.parts, undefined, `${m.metric} came back one amount per currency over rows in one`);
    assert.ok(out.value.unit === null || out.value.unit === sample, `${m.metric} came back in ${String(out.value.unit)} over rows in ${sample}`);
    /* A FIGURE OVER AN EMPTY LIST CARRIES NO CURRENCY, and a zero is the only value it may carry then. */
    if (out.value.unit === null) assert.ok(out.value.value === 0 || out.value.value === null, `${m.metric} has no currency and is not a zero either`);
  }
});

/**
 * THE LISTS money-core 3.0.0 ADDS TO, as the contract names them: a list of balance
 * checks, the balance a bank message prints, the day money on its way lands, how a category matches, three more
 * cadences, and bills called what they are. Every id a record already holds stays.
 */
test('THE LISTS SAY WHAT 3.0.0 PROMISED, and nothing a record holds is renamed', () => {
  const field = (list: string, id: string) => REGISTERS[list]?.fields.find((f) => f.id === id);
  /* `book` (money-core 3.1.0) joins every list that holds money, `balances` included: a ref to `books`, so a balance
     check says which book it is in the same way an account does. */
  assert.deepEqual(REGISTERS.balances?.fields.map((f) => [f.id, f.type]), [['account', 'ref'], ['balance', 'money'], ['as_of', 'day'], ['source', 'text'], ['book', 'ref']]);
  assert.equal(field('balances', 'account')?.to, 'accounts');
  assert.equal(field('transactions', 'balance_after')?.type, 'money');
  assert.equal(field('accounts', 'arrives')?.type, 'day');
  assert.deepEqual(field('categories', 'match_by')?.values, ['exact', 'starts', 'contains', 'pattern']);
  assert.equal(field('categories', 'match_by')?.default, 'exact');
  assert.deepEqual(field('recurring', 'every')?.values, ['weekly', 'fortnightly', 'twice_monthly', 'monthly', 'quarterly', 'yearly']);

  const bills = REGISTERS.obligations!;
  assert.equal(bills.name, 'Bills and invoices');
  assert.deepEqual(field('obligations', 'direction')?.labels, { owed_by_me: 'Money out', owed_to_me: 'Money in' });
  assert.equal((field('obligations', 'state')?.labels as Record<string, string> | undefined)?.part, 'Part paid');
  assert.deepEqual(field('obligations', 'repeats')?.values, ['none', 'monthly', 'quarterly', 'yearly'], 'a bill stopped keeping the word it said');
  const category = field('obligations', 'category')?.values ?? [];
  for (const v of ['home', 'food', 'transport', 'health', 'fun', 'pay', 'subscriptions', 'tax', 'other', 'client_work', 'software', 'events'])
    assert.ok(category.includes(v), `${v} is not a category a bill may hold`);
  /* THE DAY IS ON A BILL'S PHONE CARD, the one fact a person scanning bills looks for. */
  assert.deepEqual(bills.mobile, ['what', 'amount', 'due']);
});

/**
 * A BOOK'S PAGE IN THE SAME LOOK, AND THE MONEY PAGE ONCE THERE ARE TWO: each book reads its own tiles whole, and the
 * Money page stops saying one Cash now over both, the line and the tile together, and says what each book holds in the
 * headline tile's place beside the walk.
 */
test("A BOOK'S PAGE READS WHOLE, and with two books the Money page's headline is a figure a book", async () => {
  const k = await seeded();
  const made = (name: string) => {
    const out = k.create('books', { name } as never, { actor: 'p_test' });
    assert.ok(out.ok, sayOf(out));
    return (out.value as { id: string }).id;
  };
  const studio = made('Studio');
  const current = k.list({ register: 'accounts', where: 'name is Studio current account', limit: 1 });
  assert.ok(current.ok && current.value.rows[0], 'the sample has no current account');
  assert.ok(k.update('accounts', current.value.rows[0].id, { book: studio }, { actor: 'p_test' }).ok);
  const bill = k.create('obligations', { what: 'Studio rates', direction: 'owed_by_me', amount: { amount: 40_000, currency: 'GBP' }, due: day(10), state: 'open', book: studio } as never, { actor: 'p_test' });
  assert.ok(bill.ok, sayOf(bill));

  const page = k.page('studio');
  assert.ok(page.ok, sayOf(page));
  const blocks = (page.value as { blocks: readonly (DrawnBlock & { kind: string })[] }).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)} is refused`);
  const due = blocks.find((b) => b.kind === 'calendar')!;
  assert.deepEqual(due.rows.map((r) => r.fields.what), ['Studio rates'], "the book's calendar holds another book's bills");

  /* ONE BOOK IS ONE SET OF MONEY STILL; A SECOND IS WHERE ONE CASH NOW STOPS MEANING ANYTHING. */
  const drawn = () => {
    const out = k.page('money');
    assert.ok(out.ok, sayOf(out));
    /* THE LINE IS THE LEAD, SINCE money-core 3.5.0: the lines under the hero carry no heading either. With two books it
       says how many books the money is kept in, since money-core 3.34.0 (it counted accounts before). */
    return (out.value as { blocks: readonly { heading?: string; drawn?: boolean; lead?: boolean; body?: string }[] }).blocks
      .filter((b) => b.drawn !== false)
      .map((b) => (b.lead === true && b.body !== undefined ? (b.body.includes('Kept in {{books-held}} books.') ? 'kept in' : undefined) : (b.heading ?? '')));
  };
  assert.ok(drawn().includes(undefined));
  made('Home');
  const two = drawn();
  assert.ok(!two.includes(undefined), 'the line of one book is still said over two');
  /* AND THE LINE SAYS WHERE THE MONEY IS KEPT INSTEAD, SINCE money-core 3.17.0, and how much there is, since 3.18.0: what each book holds is still the tile under it. */
  assert.equal(two[0], 'kept in');
  /* WHAT IS WAITING ON THE PERSON MAY LEAD, wherever a page declares it, and Money declares it nowhere since REC-B23
     step 7. The filter stays for a look that puts the questions first while there are any (`look.<page>`'s `lead`):
     the books' figure is held beside the walk among the rest either way. */
  assert.deepEqual(two.filter((h) => h !== 'Waiting on you').slice(0, 2), ['kept in', ''], 'the hero follows the line');
});

test('CASH AHEAD OPENS ON TEN WEEKS AND WALKS TO THE LONGEST LENGTH IT OFFERS, so a year and two are a press away', async () => {
  /* SINCE money-core 3.7.0: the walk is `horizons:` long and says so (`reach`), and opens on `horizon:`. Opening on 90 days
     before the record walked further took every longer length off the control. */
  const k = await seeded();
  const ahead = readCashAhead(k) as { walk?: { horizon?: number; reach?: number; steps?: { day: string }[] } };
  assert.ok(ahead.walk, 'Cash ahead drew no walk');
  assert.equal(ahead.walk.horizon, 84);
  /* AND A LOAD WALKS NO FURTHER THAN TWO YEARS AND A DAY, though the block offers five years and "to the end" again since
     money-core 3.10.0: those made every opening of Money walk twenty times the chart it opens on (3.9.0), and the kernel
     now walks them only when a reader asks (`WALK_UNASKED`, `walkReach`). How far short of that a load stops is the
     kernel's call, so this holds only the ends: past the opening, and never past two years and a day. */
  const reach = ahead.walk.reach ?? 0;
  assert.ok(reach > 84 && reach <= 731, `the walk reaches ${reach} days`);
  const steps = ahead.walk.steps ?? [];
  assert.ok(steps.some((s) => s.day > day(90)), 'the walk stops at the length it opens on');
  assert.ok(steps.every((s) => s.day <= day(731)), 'a load walks five years');

  /* FIVE YEARS IS WALKED WHEN A READER PICKS IT. */
  const longer = readCashAhead(k, { walk: 1825 }) as { walk?: { horizon?: number; reach?: number } };
  assert.equal(longer?.walk?.horizon, 84, 'it still opens on twelve weeks');
  assert.ok((longer?.walk?.reach ?? 0) >= 1825, `five years asked for walks ${String(longer?.walk?.reach)} days`);
});

test("A BOOK'S CASH AHEAD OFFERS FIVE YEARS AND TO THE END as Money's own does, since money-core 3.10.0", () => {
  const book = MONEY_PAGES['money-book']!;
  const ahead = (book.blocks as { heading?: string; horizon?: unknown; horizons?: unknown }[]).find((b) => b.heading === 'Cash ahead')!;
  assert.equal(ahead.horizon, 84);
  assert.deepEqual(ahead.horizons, [84, 180, 365, 730, 1825, 'last']);
});

/**
 * THE SAMPLE HOLDS ITS NIGHTS OF CASH FROM THE MOMENT IT IS MADE. A figure's `snapshot:` writes its first point the night
 * after it is declared, so a record seeded a minute ago had none, and the line under Cash now on Today (`trend: 12w`)
 * had nothing to draw. The seed writes the days `cashSeries` walks back from the paid rows, as the night would have.
 */
test('THE SAMPLE REMEMBERS A DAY OF CASH FOR EACH NIGHT BEFORE IT WAS MADE, so the line under Cash now draws at once', async () => {
  const sql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const held = () => sql.all<{ at: string; value: number; unit: string; n: number }>("SELECT at, value, unit, n FROM metric_point WHERE series = 'cash-now' AND grain = 'day' ORDER BY at");

  /* A POINT A DAY, UP TO YESTERDAY, in the currency the figure is read in, and the last is what is held now. */
  const before = held();
  assert.deepEqual(before.map((p) => [p.at, p.value]), cashSeries().map((p) => [p.at, p.value]));
  assert.equal(before.length, 90);
  assert.equal(before.at(-1)!.at, day(-1));
  const now_ = k.metric(METRICS['cash-now'] as never);
  assert.ok(now_.ok, sayOf(now_));
  assert.deepEqual([...new Set(before.map((p) => p.unit))], [now_.value.unit]);
  assert.equal(before.at(-1)!.value, now_.value.value, 'the line would end somewhere other than Cash now');
  assert.ok(new Set(before.map((p) => p.value)).size > 2, 'ninety days of one number is a flat line, which says nothing');
  for (const p of cashPoints()) assert.ok(Number.isInteger(p.value) && p.unit !== '', JSON.stringify(p));

  /* THE TILE TODAY DRAWS, a figure with its twelve weeks: every day of them has a value, where the record answered none. */
  const tile = k.block({ kind: 'stat', cells: [{ metric: 'cash-now', trend: '12w' }] } as never);
  assert.deepEqual(tile.refusals, []);
  const trend = tile.readings?.[0]?.trend ?? [];
  assert.equal(trend.length, 84);
  assert.ok(trend.every((v) => typeof v === 'number'), 'a night of the twelve weeks has no point');

  /* THE NIGHT AFTER, the record writes its own point and leaves the sample's as they are. */
  now = NOW + 86_400_000;
  await k.drain();
  const after = held();
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after.at(-1)!.at, day(0));
});
