/**
 * The background allowance is one pool with a floor for each purpose, and no purpose starves another's floor.
 *
 * THE MONTH USED TO BE CUT BY WALLS: so many for the page headlines and no more, so many for reading who is who inside
 * the rest. A wall holds a purpose back while the month still has room nobody else is owed, and it lets the rest spend
 * what reading was owed. The plan (`../src/budget-plan.ts`,  "The budget's plan") keeps a
 * floor for each purpose and lets any of them spend what is left once the floors nobody has used yet are set aside.
 *
 * The first tests are pure. The last ones go through `backgroundMeter` over a ledger built here, as
 * `model-jobs-spends.test.ts` builds one, so the three shares a host meters by are held to the same plan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUDGET_ORDER, floorsOf, leftOf, maySpend, type BudgetPurpose, type BudgetSpent } from '../src/budget-plan.ts';
import { backgroundMeter, backgroundSpent, backgroundSpentBy, BACKGROUND_JOBS_MONTH, serveModelJobs, type ModelJobMeter, type ModelJobsDeps } from '../src/model-jobs.ts';
import { createRecordApi } from '@braindog/record';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();
const AT = new Date(Date.UTC(2026, 9, 2, 3, 17)).toISOString();

/** Spends for `purpose` until the plan stops it, and answers how many it was let. */
function greedy(purpose: BudgetPurpose, spent: BudgetSpent, cap: number): number {
  let n = 0;
  while (maySpend(purpose, spent, cap)) {
    spent[purpose] = (spent[purpose] ?? 0) + 1;
    if (++n > cap + 1) assert.fail(`${purpose} was let past a cap of ${cap}`);
  }
  return n;
}

const total = (spent: BudgetSpent): number => BUDGET_ORDER.reduce((sum, p) => sum + (spent[p] ?? 0), 0);

test('THE ORDER IS understand, headline, compose, look, prose, pattern, skill, embed', () => {
  assert.deepEqual([...BUDGET_ORDER], ['understand', 'headline', 'compose', 'look', 'prose', 'pattern', 'skill', 'embed']);
});

test('THE FLOORS OF 60 ARE THE PLAN, and they scale in proportion for a cap of 30 and of 0', () => {
  assert.deepEqual(floorsOf(60), { understand: 10, headline: 10, compose: 5, look: 4, prose: 4, pattern: 2, skill: 1, embed: 0 });
  /* Half of each, a half rounded up as the meters have always rounded a share. */
  assert.deepEqual(floorsOf(30), { understand: 5, headline: 5, compose: 3, look: 2, prose: 2, pattern: 1, skill: 1, embed: 0 });
  assert.deepEqual(floorsOf(0), { understand: 0, headline: 0, compose: 0, look: 0, prose: 0, pattern: 0, skill: 0, embed: 0 });
  assert.deepEqual(floorsOf(600), { understand: 100, headline: 100, compose: 50, look: 40, prose: 40, pattern: 20, skill: 10, embed: 0 });
});

test('THE FLOORS NEVER ADD UP TO MORE THAN THE CAP, at any cap, so every one of them can be kept', () => {
  for (let cap = 0; cap <= 1200; cap++) {
    const floors = floorsOf(cap);
    const sum = BUDGET_ORDER.reduce((n, p) => n + floors[p], 0);
    assert.ok(sum <= cap, `the floors of ${cap} add up to ${sum}`);
  }
  /* A cap that is no whole number, or below nothing, holds nothing. */
  assert.deepEqual(floorsOf(-5), floorsOf(0));
  assert.deepEqual(floorsOf(Number.NaN), floorsOf(0));
  assert.equal(maySpend('understand', {}, Number.NaN), false);
});

test('UNDER ITS FLOOR A PURPOSE MAY SPEND, whatever the others spent of what they were let', () => {
  for (const mine of BUDGET_ORDER) {
    const floor = floorsOf(60)[mine];
    const spent: BudgetSpent = {};
    /* Every other purpose takes all the plan lets it, the greediest first and again after. */
    for (let round = 0; round < 3; round++) for (const other of BUDGET_ORDER) if (other !== mine) greedy(other, spent, 60);
    for (let i = 0; i < floor; i++) {
      assert.ok(maySpend(mine, spent, 60), `${mine} was refused ask ${i + 1} of its floor of ${floor}`);
      spent[mine] = (spent[mine] ?? 0) + 1;
    }
    assert.ok(total(spent) <= 60);
  }
});

test('PAST ITS FLOOR A PURPOSE SPENDS ONLY WHAT IS LEFT once the unspent floors of the others are set aside', () => {
  /* Nobody else has spent: the others are owed 26 of the 60, so the headlines may reach 34 and no further. */
  const spent: BudgetSpent = {};
  assert.equal(greedy('headline', spent, 60), 34);
  assert.equal(maySpend('headline', spent, 60), false);
  assert.equal(leftOf(['headline'], spent, 60), 0);
  /* The others still have every ask of their floors. */
  assert.equal(leftOf(['understand'], spent, 60), 10);
  assert.equal(leftOf(['compose'], spent, 60), 5);
  assert.equal(maySpend('embed', spent, 60), false, 'embeddings have no floor and nothing is left over');

  /* A floor somebody has used is no longer set aside: understanding spent its 10, so 10 more are anybody's. */
  const used: BudgetSpent = { understand: 10 };
  assert.equal(leftOf(['compose'], used, 60), 60 - 10 - (10 + 4 + 4 + 2 + 1) - 1, 'all but the others, and the one kept for understanding');
});

test('WHEN TWO ARE PAST THEIR FLOORS AND ONE ASK IS LEFT, THE ORDER DECIDES', () => {
  /* Every floor is spent (36), and 23 of the 24 left over went to the headlines and to composing. */
  const spent: BudgetSpent = { understand: 10, headline: 20, compose: 18, look: 4, prose: 4, pattern: 2, skill: 1 };
  assert.equal(total(spent), 59);
  assert.equal(maySpend('understand', spent, 60), true);
  for (const lower of BUDGET_ORDER.slice(1)) assert.equal(maySpend(lower, spent, 60), false, `${lower} took the last ask from understanding`);

  /* Understanding is still under its floor, so it is not in the running for what is left over: the headlines are first. */
  const early: BudgetSpent = { understand: 9, headline: 21, compose: 18, look: 4, prose: 4, pattern: 2, skill: 1 };
  assert.equal(total(early), 59);
  assert.equal(maySpend('understand', early, 60), true, 'its own floor');
  for (const p of BUDGET_ORDER.slice(1)) assert.equal(maySpend(p, early, 60), false, `${p} spent the ask understanding's floor still holds`);

  /* Two left: one of them is anybody's, and the last is the first in the order's. */
  const two: BudgetSpent = { ...spent, compose: 17 };
  assert.equal(maySpend('skill', two, 60), true);
  assert.equal(leftOf(['skill'], two, 60), 1);
  assert.equal(leftOf(['understand'], two, 60), 2);
});

test('THE WHOLE MONTH NEVER PASSES THE CAP, whoever spends and in whatever order', () => {
  for (const cap of [0, 1, 7, 30, 60, 600]) {
    for (let turn = 0; turn < BUDGET_ORDER.length; turn++) {
      const spent: BudgetSpent = {};
      const order = [...BUDGET_ORDER.slice(turn), ...BUDGET_ORDER.slice(0, turn)].reverse();
      for (let round = 0; round < 3; round++) for (const p of order) greedy(p, spent, cap);
      assert.ok(total(spent) <= cap, `${total(spent)} were spent of ${cap}`);
      /* And nothing is left idle that the first in the order could not have. */
      assert.equal(total(spent) + leftOf(['understand'], spent, cap), cap);
    }
  }
  /* A ledger that already holds more than the cap lets nobody through, floor or no floor. */
  assert.equal(maySpend('understand', { look: 60 }, 60), false);
  assert.equal(maySpend('headline', { look: 75 }, 60), false);
});

test('PURPOSES WHOSE ASKS CANNOT BE TOLD APART ARE ONE POOL, so a floor no row is ever written for is not set aside for ever', () => {
  const rest = ['compose', 'look', 'prose', 'pattern', 'skill', 'embed'] as const;
  /* Alone, the look is owed 4 and the four others keep 12 nobody writes a row for. */
  assert.equal(leftOf(['look'], {}, 60), 60 - 32);
  /* Pooled, the six are owed 16 between them, and twenty rows written as the look have used all of it. */
  assert.equal(leftOf(['headline'], { look: 20 }, 60, [rest]), 60 - 20 - 10);
  assert.equal(leftOf(['headline'], { look: 20 }, 60), 60 - 20 - (10 + 5 + 4 + 2 + 1));
  /* A share is whole pools: asking for one of the six is asking for the six. */
  assert.equal(leftOf(['prose'], { look: 20 }, 60, [rest]), leftOf(rest, { look: 20 }, 60, [rest]));
});

/* ── Through the meters, over a ledger ────────────────────────────────────────────────────────── */

const V3 = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

/** A version 3 ledger in memory, and a way to write `n` rows that spent `spends` for `purpose`. */
function ledger() {
  const sql = openSqlite();
  sql.exec(V3);
  let id = 0;
  const wrote = (purpose: string, n = 1, spends = 'background') => {
    for (let i = 0; i < n; i++)
      sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, purpose, spends)
         VALUES (?, ?, 'pattern', 'a', 'glm-5.3-flash', 10, 5, 1, 3, 'ok', ?, ?)`,
        `row-${++id}`,
        AT,
        purpose,
        spends,
      );
  };
  const left = (cap: number, share: 'work' | 'headline' | 'understand' = 'work') => {
    const meter = backgroundMeter(sql, cap, share);
    return meter.cap - meter.spent(MONTH);
  };
  return { sql, wrote, left };
}

test('THIRTY HEADLINES NO LONGER STOP THE THIRTY-FIRST while the month has room nobody else is owed', () => {
  const { sql, wrote, left } = ledger();
  wrote('headline', 30);
  /* At 60 a month: the others are owed 26, so 4 more are the headlines' to spend. */
  assert.equal(backgroundMeter(sql, 60, 'headline').spent(MONTH), 30);
  assert.equal(left(60, 'headline'), 4);
  /* At the month the hosts hold today the old wall of thirty is nowhere near. */
  assert.ok(left(BACKGROUND_JOBS_MONTH, 'headline') > 0, 'the 31st headline of the month was refused');

  wrote('headline', 4);
  assert.equal(left(60, 'headline'), 0, 'the headlines spent into the floors of the others');
  /* And the others have every ask they are owed: reading who is who its 10, the work its 16 more. */
  assert.equal(left(60, 'understand'), 10);
  assert.equal(left(60, 'work'), 26);
  const rest = backgroundMeter(sql, 60).rest;
  assert.ok(rest);
  assert.equal(rest.cap - rest.spent(MONTH), 16);
  sql.close();
});

test('FIFTY ROWS OF WORK STILL LEAVE THE HEADLINES THEIR TEN, and the work is stopped there', () => {
  const { sql, wrote, left } = ledger();
  wrote('look', 50);
  assert.equal(left(60, 'headline'), 10);
  assert.equal(left(60, 'work'), 0);
  for (let i = 0; i < 10; i++) {
    assert.ok(left(60, 'headline') > 0, `headline ${i + 1} of its floor was refused`);
    wrote('headline');
  }
  assert.equal(left(60, 'headline'), 0);
  assert.equal(backgroundSpent(sql, MONTH)?.all, 60);
  sql.close();
});

test("THE DRAFTS AND THE PROSE ARE STOPPED BEFORE UNDERSTANDING'S FLOOR, which the work's meter still holds for it", () => {
  const { sql, wrote, left } = ledger();
  wrote('look', 40);
  const work = backgroundMeter(sql, 60);
  assert.ok(work.rest && work.understand);
  assert.equal(work.rest.cap - work.rest.spent(MONTH), 0, 'the rest of the work spent into the floor of reading who is who');
  assert.equal(work.understand.cap - work.understand.spent(MONTH), 10);
  assert.equal(left(60, 'work'), 10, 'the work as a whole still has what understanding is owed');
  assert.equal(left(60, 'headline'), 10);
  /* Understanding spends its ten, and then nothing is left for anybody but the headlines. */
  wrote('understand', 10);
  assert.equal(left(60, 'work'), 0);
  assert.equal(left(60, 'understand'), 0);
  assert.equal(left(60, 'headline'), 10);
  sql.close();
});

test('WHAT THE METERS ANSWERED BEFORE THE PLAN THEY STILL ANSWER: the rows of a share, and spent when nobody can count', () => {
  const { sql, wrote } = ledger();
  wrote('headline', 2);
  wrote('understand', 3);
  wrote('look', 4);
  wrote('prose');
  /* A purpose a later build might write is in the month, counted with the work. His own ask never is. */
  wrote('something-new');
  wrote('ask', 5, 'person');
  wrote('look', 2, 'none');
  assert.deepEqual(backgroundSpentBy(sql, MONTH), { understand: 3, headline: 2, compose: 0, look: 5, prose: 1, pattern: 0, skill: 0, embed: 0 });
  assert.deepEqual(backgroundSpent(sql, MONTH), { all: 11, headlines: 2, understand: 3 });
  const work = backgroundMeter(sql);
  assert.equal(work.spent(MONTH), 9);
  assert.equal(work.understand?.spent(MONTH), 3);
  assert.equal(work.rest?.spent(MONTH), 6);
  assert.equal(backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').spent(MONTH), 2);
  /* The three caps: the month less the floors of everybody else. */
  assert.equal(work.cap, 500);
  assert.equal(work.understand?.cap, 340);
  assert.equal(work.rest?.cap, 400);
  assert.equal(backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').cap, 340);
  sql.close();

  /* No ledger yet is nothing spent, and a ledger that cannot be counted is read as spent, every share of it. */
  const none = openSqlite();
  assert.deepEqual(backgroundSpentBy(none, MONTH), { understand: 0, headline: 0, compose: 0, look: 0, prose: 0, pattern: 0, skill: 0, embed: 0 });
  assert.equal(backgroundMeter(none).spent(MONTH), 0);
  none.exec('CREATE TABLE slash_call (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL)');
  assert.equal(backgroundSpentBy(none, MONTH), null);
  for (const share of ['work', 'headline', 'understand'] as const) {
    const meter = backgroundMeter(none, 60, share);
    assert.equal(meter.spent(MONTH), meter.cap, `${share} was let through a ledger nobody can count`);
  }
  const unread = backgroundMeter(none, 60);
  assert.equal(unread.rest?.spent(MONTH), unread.rest?.cap);
  assert.equal(unread.understand?.spent(MONTH), unread.understand?.cap);
  none.close();
});

/* ── Through the pass ─────────────────────────────────────────────────────────────────────────── */

/** A record with two digests waiting on their prose, and a pass over it held to `meter`. */
async function waiting(meter: ModelJobMeter) {
  const now = Date.UTC(2026, 9, 9, 9, 0);
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  let n = 0;
  for (const i of [1, 2]) enqueue(sql, () => `J${++n}`, now, 'infer.prose', { digest: `weekly-${i}`, headline: 'Your week', text: 'Three tasks closed.', channels: ['mcp'] });
  const asked: unknown[] = [];
  const lines: string[] = [];
  const deps: ModelJobsDeps = {
    inference: {
      draft: async () => assert.fail('no draft is queued'),
      prose: async (digest) => {
        asked.push(digest);
        return { ok: true, value: { text: 'A quiet week.' } };
      },
    },
    meter,
    now: () => now,
    log: (line) => lines.push(line),
  };
  return { asked, lines, pass: () => serveModelJobs(api, deps) };
}

test("THE PASS LEASES NO PROSE INTO UNDERSTANDING'S FLOOR: the month has ten left and they are all reading's, so the digests wait", async () => {
  /* The work has ten asks left, every one of them the floor of reading who is who. */
  const held: ModelJobMeter = { cap: 50, spent: () => 40, understand: { cap: 34, spent: () => 24 }, rest: { cap: 40, spent: () => 40 } };
  const r = await waiting(held);
  await r.pass();
  assert.equal(r.asked.length, 0, 'a digest was written with an ask reading who is who was owed');
  assert.deepEqual(r.lines, [], 'the month is not spent, so nothing is said');

  /* One ask of the rest is left: one digest is written and the other waits. */
  const one = await waiting({ ...held, spent: () => 39, rest: { cap: 40, spent: () => 39 } });
  await one.pass();
  assert.equal(one.asked.length, 1);

  /* A meter built by hand, with no rest named, holds the prose to the whole month as it always did. */
  const plain = await waiting({ cap: 50, spent: () => 40 });
  await plain.pass();
  assert.equal(plain.asked.length, 2);
});
