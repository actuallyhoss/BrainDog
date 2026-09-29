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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel, type Leg } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { refused, sayOf } from '@braindog/ports';

import { ACCOUNTS, CATEGORIES, INSTALLMENTS, LOOKUPS, METRICS, NOW, OBLIGATIONS, PAGES, REGISTERS, RECURRING_ITEMS, RULES, SNAPSHOTS, day, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';
import { MONEY_HOME_SETTING, MONEY_METRICS, MONEY_PAGES, MONEY_TARGET_SETTINGS, nightOf } from '../src/modules/money.ts';
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

test('THE HOME CURRENCY SETTING HAS NO DEFAULT, because a figure converted at a rate nobody asked for looks like one a person chose', () => {
  /* A DEFAULT OF `GBP` WAS TRIED AND MEASURED WRONG: `founder-poll.test.ts` holds a record with an Egyptian account and
     a dollar account and asserts Cash now reads `null` until somebody chooses, and with the default in place it did
     not. The question stays open until it is answered. */
  assert.equal((MONEY_HOME_SETTING.home_currency as { default?: string }).default, undefined);
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

  /* THE THIRTY-DAY BRIDGE IS THIS WALK OVER A SHORTER HORIZON. A leg added to one and not the other
     is two answers about the same thirty days, one block apart on one screen. */
  const bridge = (PAGES.money!.blocks as readonly { kind?: string; from?: unknown }[]).find((b) => b.kind === 'bridge');
  assert.ok(bridge, 'the money page draws a thirty-day bridge');
  assert.equal(bridge.from, from, 'the bridge and the walk are handed the ONE array, not two copies a deepEqual holds level');
});

/**
 * EVERY BLOCK ON `/p/money` THAT SPEAKS ABOUT THE NEXT THIRTY DAYS, READ OFF THE DRAWN PAGE.
 *
 * THE DEFECT THIS IS WRITTEN AGAINST WAS TWO ANSWERS TO ONE QUESTION: tiles that read one list above a bridge that
 * walked three, so "Coming in, 30 days" in the hero and "Coming in" one block under it were two numbers. Since
 * money-core 3.0.0 the tiles are figures over the walk itself (`source: forecast.runway`, `legs:` the page's own
 * `CASH_LEGS`), so they may wear the walk's words, and this holds them to the bridge to the penny.
 */
test('THE TILES AND THE BRIDGE ON `/p/money` ADD UP THE SAME MOVEMENTS, so no two of them answer one question twice', async () => {
  const k = await seeded();

  const stat = blockOf(k, 'money', 'What you have');
  const tile = (metric: string) => {
    const cell = stat.readings?.find((r) => r.metric === metric);
    assert.ok(cell?.reading, `the hero draws ${metric}`);
    return { value: cell.reading.value, label: cell.label };
  };
  const arriving = tile('arriving-30d');
  const leaving = tile('leaving-30d');
  assert.deepEqual([arriving.label, leaving.label], ['Coming in, 30 days', 'Going out, 30 days']);

  const bridge = blockOf(k, 'money', 'The next 30 days');
  const steps = bridge.walk?.steps;
  assert.ok(steps && steps.length > 0, 'the bridge draws its walk');
  const sum = (of: (s: { source: string; delta: number }) => boolean) => steps.filter(of).reduce((n, s) => n + s.delta, 0);

  /* WHAT REPEATS IS IN THE WALK NOW, from `recurring`, beside the bills and the parts of a plan. */
  assert.ok(steps.some((s) => s.source === 'recurring'), 'nothing that repeats moves in the next thirty days');
  assert.equal(arriving.value, sum((s) => s.delta > 0), 'Coming in is the money in of the bridge');
  assert.equal(leaving.value, -sum((s) => s.delta < 0), 'Going out is the money out of the bridge');
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
  assert.equal(cells.filter((c) => c.where === 'money-core /money').length, 2, 'the Money page no longer leads with the walk');
  const founder = cells.filter((c) => c.where.startsWith('founder ') && (c.metric === 'arriving-30d' || c.metric === 'leaving-30d'));
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

  /* A WEEK IS SEVEN DAYS whatever month it falls in, so the cleaner's steps are a week apart all year. */
  const walked = contribution(k, opening, from, horizon, 'recurring').walk.steps.filter((s) => s.source === 'recurring');
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
  const block = (out.value as { blocks: readonly DrawnBlock[] }).blocks.find((b) => b.heading === heading);
  assert.ok(block, `${slug} draws a block headed ${heading}`);
  assert.deepEqual(block.refusals, [], 'a block that refuses is a heading over a blank rectangle');
  return block;
};

/**
 * ONE PAGE CALLED MONEY, IN THE ORDER A PERSON READS IT: what there is, where it is, what is waiting, what is ahead,
 * what is due, and what happened. Overview, Ledger and the house Home retire, and a page holds no rows, so nothing goes
 * with them.
 */
test('MONEY IS ONE PAGE, and every block on it answers on the sample without a refusal', async () => {
  assert.deepEqual(Object.keys(MONEY_PAGES), ['money', 'money-book'], 'money-core declares a page besides Money and one a book');
  const page = MONEY_PAGES.money!;
  assert.equal(page.title, 'Money');
  assert.ok(!(page.requires as string[]).includes('register.people'), 'Money needs People again');
  const headings = (page.blocks as { heading?: string }[]).map((b) => b.heading);
  assert.deepEqual(headings, [
    /* THE OPENING SENTENCE, SINCE money-core 3.2.0, which carries no heading: it is the line under the page's title. */
    undefined,
    'What you have',
    'What you have, by book',
    'Accounts',
    'Add an account',
    'Waiting on you',
    'Cash ahead',
    'The next 30 days',
    'Coming up',
    'Being chased',
    'Late to you',
    'Late to pay',
    "Where this month's money went",
    'Instalments',
    'In and out, by month',
    'Every month',
    'What moved',
    'What agents and rules did',
  ]);
  /* NO LAW ON A PAGE EVERYBODY DRAWS: the late notes say what is late in words any record's owner reads. */
  assert.ok(!JSON.stringify(page).includes('Statutory'), 'a note speaks for one country');

  const k = await seeded();
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  for (const b of (out.value as { blocks: readonly DrawnBlock[] }).blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)} is refused`);
  assert.ok(!k.page('ledger').ok, 'the Ledger page is still on the record');

  /* THE CASH WALK OFFERS YEARS, AND COUNTING IS ONE CONTROL. */
  const ahead = (page.blocks as { heading?: string; horizons?: unknown; knobs?: unknown }[]).find((b) => b.heading === 'Cash ahead')!;
  assert.deepEqual(ahead.horizons, [90, 180, 365, 730, 1825, 'last']);
  assert.ok(!(ahead.knobs as string[]).includes('leave'), '`leave` is a second control over the streams `count` moves');
});

/**
 * THE NEW LOOK'S MONEY (money-core 3.2.0): a sentence said from two figures the tiles draw,
 * every tile beside Cash now carrying twelve weeks as a line, and one track a plan for what is paid in parts.
 */
test('MONEY OPENS WITH ONE SENTENCE WHILE THE WALK GOES UNDER INSIDE THE YEAR, and what is paid in parts is one track a plan', async () => {
  const k = await seeded();
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const blocks = (out.value as { blocks: readonly (DrawnBlock & { kind: string; lead?: boolean; drawn?: boolean; values?: Record<string, unknown> })[] }).blocks;

  /* THE SENTENCE IS THE FIRST BLOCK, AND DRAWS EXACTLY WHEN THE WALK GOES UNDER, from the same two figures as the tiles. */
  const lead = blocks[0]!;
  assert.deepEqual([lead.kind, lead.lead], ['note', true]);
  const runway = reading(k, 'runway-days');
  assert.ok(runway !== null && runway > 0, 'the sample walk goes under inside the year, which is the case the sentence is for');
  assert.notEqual(lead.drawn, false, 'the walk goes under and the page says nothing');
  assert.deepEqual(Object.keys(lead.values ?? {}).sort(), ['cash-now', 'runway-days']);
  assert.equal(lead.values?.['runway-days'], runway);

  /* EVERY TILE BESIDE CASH NOW DRAWS ITS TWELVE WEEKS, and each figure remembers its nights so there is a line to draw. */
  const hero = (MONEY_PAGES.money!.blocks as { kind: string; cells?: { metric: string; trend?: string }[] }[]).find((b) => b.kind === 'stat')!;
  for (const c of hero.cells ?? []) {
    assert.equal(c.trend, '12w', `${c.metric} draws no line`);
    assert.equal((MONEY_METRICS[c.metric] as { snapshot?: { into: string } }).snapshot?.into, `series.${c.metric}`, `${c.metric} remembers no night`);
  }

  /* ONE TRACK A PLAN: the parts that go out and are not cancelled, which the host counts paid against all by `plan`. */
  const parts = blockOf(k, 'money', 'Instalments');
  const leaving = INSTALLMENTS.filter((r) => r.direction === 'out' && r.state !== 'cancelled');
  assert.equal(parts.matched, leaving.length);
  assert.deepEqual([...new Set(parts.rows.map((r) => String(r.fields.plan)))], [...new Set(leaving.map((r) => String(r.plan)))]);
  assert.equal(parts.rows.filter((r) => r.fields.state === 'paid').length, leaving.filter((r) => r.state === 'paid').length, 'the paid parts are what the track fills with');
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
    const out = k.metric(m as never);
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
  assert.deepEqual(field('categories', 'match_by')?.values, ['exact', 'starts', 'contains']);
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
