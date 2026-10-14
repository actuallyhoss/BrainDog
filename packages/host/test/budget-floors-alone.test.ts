/**
 * Each floor of the budget's plan holds alone (ENG-A10, budget-plan-86#6, the host's half).
 *
 * SIX KINDS OF WORK WERE ONE POOL. A digest's prose, a pattern, an embedding and a skill draft were all written with
 * purpose `look`, so the meters could only hold them as one pool with one floor, and the busiest of them took it: a
 * month of daily looks left reading a digest, drafting a pattern and drafting a skill nothing of their own. Each row
 * names its own purpose now, and every test below fills the look's month first and then asks what the others still have.
 *
 * THE LEDGER IS BUILT HERE, in memory, at store version 3 (`model-jobs-spends.test.ts` says why).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashRecordMeter } from '../src/slash-ask.ts';
import { backgroundMeter, backgroundSpentBy, serveModelJobs, type ModelJobsApi, type ModelJobsDeps } from '../src/model-jobs.ts';
import { floorsOf, mostOf } from '../src/budget-plan.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 2, 3, 17);
const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();
const AT = new Date(T0).toISOString();

const V3 = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

/** A version 3 ledger and `wrote`, which settles `n` background rows of one purpose as the engine would. */
function ledger() {
  const sql = openSqlite();
  sql.exec(V3);
  let id = 0;
  const wrote = (purpose: string, n = 1) => {
    for (let i = 0; i < n; i++)
      sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, purpose, spends)
         VALUES (?, ?, 'pattern', 'a', 'glm-5.3-flash', 10, 5, 1, 3, 'ok', ?, 'background')`,
        `row-${++id}`,
        AT,
        purpose,
      );
  };
  return { sql, wrote };
}

/** What one purpose of the work may still spend of a month of `cap`, as the pass and the door ask it. */
const leftFor = (sql: ReturnType<typeof openSqlite>, cap: number, purpose: 'look' | 'prose' | 'pattern' | 'skill' | 'embed'): number => {
  const meter = backgroundMeter(sql, cap).of?.(purpose);
  assert.ok(meter, `the work's meter has no meter for ${purpose}`);
  return meter.cap - meter.spent(MONTH);
};

test('A LOOK THAT SPENT EVERYTHING PAST ITS FLOOR STILL LEAVES THE PROSE, THE PATTERN AND THE SKILL DRAFT THEIR FLOORS', () => {
  const { sql, wrote } = ledger();
  const floors = floorsOf(60);
  /* The most the look could ever spend: the month less everybody else's floors. Composing shares the look's rows. */
  const most = mostOf(['look'], 60, [['compose', 'look']]);
  assert.equal(most, 60 - floors.understand - floors.headline - floors.prose - floors.pattern - floors.skill - floors.embed);
  assert.equal(most, 33);
  assert.equal(leftFor(sql, 60, 'look'), 33);
  wrote('look', 33);
  assert.equal(leftFor(sql, 60, 'look'), 0, 'the look spent past what the plan leaves it');

  assert.deepEqual(
    { prose: leftFor(sql, 60, 'prose'), pattern: leftFor(sql, 60, 'pattern'), skill: leftFor(sql, 60, 'skill') },
    { prose: floors.prose, pattern: floors.pattern, skill: floors.skill },
  );
  /* AN EMBEDDING HAS NO FLOOR (`budget-plan.ts`): the index is built from what the others leave, and here that is nothing. */
  assert.equal(floors.embed, 0);
  assert.equal(leftFor(sql, 60, 'embed'), 0);

  /* ONE ROW OF EACH GOES THROUGH, AND EACH IS COUNTED AS ITS OWN: the pattern's row takes nothing from the prose. */
  for (const purpose of ['prose', 'pattern', 'skill'] as const) wrote(purpose);
  assert.deepEqual(
    { prose: leftFor(sql, 60, 'prose'), pattern: leftFor(sql, 60, 'pattern'), skill: leftFor(sql, 60, 'skill') },
    { prose: floors.prose - 1, pattern: floors.pattern - 1, skill: 0 },
  );
  /* UP TO ITS FLOOR AND NO FURTHER, because the look left nothing over. */
  wrote('prose', floors.prose - 1);
  assert.equal(leftFor(sql, 60, 'prose'), 0);
  assert.equal(leftFor(sql, 60, 'pattern'), floors.pattern - 1, "the prose spent the pattern's floor");
  /* AND THE HEADLINES AND UNDERSTANDING STILL HAVE THEIRS, whole. */
  assert.equal(backgroundMeter(sql, 60, 'headline').cap - backgroundMeter(sql, 60, 'headline').spent(MONTH), floors.headline);
  const understand = backgroundMeter(sql, 60).understand;
  assert.ok(understand);
  assert.equal(understand.cap - understand.spent(MONTH), floors.understand);
  sql.close();
});

test('AN EMBEDDING IS BUILT FROM WHAT IS LEFT OVER, and it never spends a floor nobody has used yet', () => {
  const { sql, wrote } = ledger();
  /* 24 of the 60 are nobody's. With nothing spent an embedding may take all of them, and no floor. */
  assert.equal(leftFor(sql, 60, 'embed'), 24);
  wrote('embed', 24);
  assert.equal(leftFor(sql, 60, 'embed'), 0);
  assert.equal(leftFor(sql, 60, 'prose'), 4);
  assert.equal(leftFor(sql, 60, 'look'), 9, 'the look and composing keep their two floors, 4 and 5');
  sql.close();
});

/** A queue of `prose` digests and `drafts` patterns that says what each lease asked for, and how many jobs it handed over. */
function queue(prose: number, drafts: number) {
  const jobs = [
    ...Array.from({ length: prose }, (_, i) => ({ id: `prose-${i}`, kind: 'infer.prose' })),
    ...Array.from({ length: drafts }, (_, i) => ({ id: `draft-${i}`, kind: 'infer.draft' })),
  ].map((j) => ({ ...j, payload: '{}', attempts: 0, leasedUntil: '2026-10-02T04:00:00.000Z' }));
  const leases: { kinds: string[]; most: number; got: number }[] = [];
  const kernel = {
    leaseOutbox: (kinds: readonly string[], n?: number) => {
      const out = jobs.filter((j) => kinds.includes(j.kind)).slice(0, n ?? 10);
      leases.push({ kinds: [...kinds], most: n ?? 10, got: out.length });
      return out;
    },
    ackOutbox: () => ({ ok: true as const, value: undefined }),
    tail: async () => {},
  };
  const api = { kernel, inbox: async () => ({ ok: true, value: { arrivals: [], cursor: null } }) } as unknown as ModelJobsApi;
  return { api, leases };
}

test('THE PASS LEASES EACH JOB FROM ITS OWN PURPOSE: prose to the prose floor and a draft to the pattern floor, after the look took the rest', async () => {
  const { sql, wrote } = ledger();
  wrote('look', 33);
  const { api, leases } = queue(6, 6);
  /* No model is asked: a job with nothing to read settles as failed, and what is held here is what was leased. */
  const deps = { inference: {}, meter: backgroundMeter(sql, 60), now: () => T0, log: () => {} } as unknown as ModelJobsDeps;

  await serveModelJobs(api, deps);
  /* Four digests, the prose floor of a month of 60, then the one job the pass has left, from the pattern's two. */
  assert.deepEqual(leases, [
    { kinds: ['infer.prose'], most: 4, got: 4 },
    { kinds: ['infer.draft'], most: 1, got: 1 },
  ]);

  /* Those five answered. The prose floor is spent, so no digest is leased, and the pattern has one of its two. */
  wrote('prose', 4);
  wrote('pattern', 1);
  leases.length = 0;
  await serveModelJobs(api, deps);
  assert.deepEqual(leases, [{ kinds: ['infer.draft'], most: 1, got: 1 }]);

  /* And then nothing: every floor of the work is spent and the look left nothing over. Understanding's ten are whole. */
  wrote('pattern', 1);
  leases.length = 0;
  await serveModelJobs(api, deps);
  assert.deepEqual(leases, []);
  const understand = backgroundMeter(sql, 60).understand;
  assert.equal((understand?.cap ?? 0) - (understand?.spent(MONTH) ?? 0), 10);
  sql.close();
});

test('TWO LEASES OF ONE PASS NEVER TAKE THE SAME ASK LEFT OVER: what is leased is counted before the next lease', () => {
  const { sql, wrote } = ledger();
  /* Everybody at their floor but the prose and the pattern, and two asks left over. */
  wrote('understand', 10);
  wrote('headline', 10);
  wrote('look', 9);
  wrote('skill', 1);
  wrote('embed', 22);
  const of = backgroundMeter(sql, 60).of;
  assert.ok(of);
  const left = (m: { cap: number; spent(since: string): number }) => m.cap - m.spent(MONTH);
  /* The last ask left over is kept for whoever is earlier in the order and past its floor, so each sees one of the two. */
  assert.equal(left(of('prose')), 4 + 1);
  assert.equal(left(of('pattern')), 2 + 1);
  /* With five digests leased the one the prose could take is gone, and the pattern has its floor and no more. */
  assert.equal(left(of('pattern', { prose: 5 })), 2);
  assert.equal(left(of('prose', { prose: 5 })), 0);
  sql.close();
});

/** The record's meter over the ledger, as a host builds it: the door the look, a skill draft and the headlines ask through. */
function door(sql: ReturnType<typeof openSqlite>) {
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: 0, cap: 20, resets: '2026-11-01T00:00:00.000Z', capped: true } }) };
  return slashRecordMeter({ sql, clock: fixedClock(T0), engine: async () => engine, model: 'glm-5.3-flash' });
}

test('A SKILL DRAFT THROUGH THE DOOR WRITES A ROW WITH PURPOSE `skill`, and is let through after the look spent its month', async () => {
  const { sql, wrote } = ledger();
  const meter = door(sql);
  /* The look's most in a month of 600: all but the floors of understanding, the headlines, prose, patterns and skills. */
  wrote('look', 330);
  const look = await meter.background('look');
  assert.equal(look.ok, false);
  assert.equal(look.ok ? '' : look.refusal.code, 'SLASH_BUDGET_SPENT');

  const skill = await meter.background('skill');
  assert.ok(skill.ok, 'a skill draft was refused in a month the look had spent');
  skill.value.settle({ usage: { in: 300, out: 40 } });
  assert.deepEqual({ ...sql.one<Record<string, string>>("SELECT question, purpose, spends, status FROM slash_call WHERE question = 'Slash''s skill draft'") }, {
    question: "Slash's skill draft",
    purpose: 'skill',
    spends: 'background',
    status: 'ok',
  });
  assert.equal(backgroundSpentBy(sql, MONTH)?.skill, 1);
  assert.equal(backgroundSpentBy(sql, MONTH)?.look, 330, "a skill draft was counted as the look's");

  /* A RECORD A RELEASE BEHIND ASKS WITH NO KIND, and that is a skill draft too. */
  const older = await meter.background();
  assert.ok(older.ok);
  older.value.settle({ usage: { in: 300, out: 40 } });
  assert.equal(backgroundSpentBy(sql, MONTH)?.skill, 2);

  /* UP TO ITS FLOOR, TEN OF 600, AND NO FURTHER while nothing is left over. */
  wrote('skill', 8);
  const spent = await meter.background('skill');
  assert.equal(spent.ok ? '' : spent.refusal.code, 'SLASH_BUDGET_SPENT');
  /* And the headlines and reading who is who are still asked. */
  for (const ask of ['headline', 'understand'] as const) assert.ok((await meter.background(ask)).ok, `${ask} was refused`);
  sql.close();
});

test('THE HEADLINES AND UNDERSTANDING ARE METERED AS THEY WERE: the same most, the same refusal at the same row', async () => {
  const { sql, wrote } = ledger();
  const headline = () => backgroundMeter(sql, 600, 'headline');
  const work = () => backgroundMeter(sql, 600);
  assert.deepEqual({ headline: headline().cap, work: work().cap, understand: work().understand?.cap, rest: work().rest?.cap }, { headline: 340, work: 500, understand: 340, rest: 400 });
  assert.deepEqual({ work: backgroundMeter(sql, 10).cap, headline: backgroundMeter(sql, 10, 'headline').cap }, { work: 8, headline: 5 });

  /* The headlines spend to 340 of 600, and the 341st is refused at the door. */
  wrote('headline', 339);
  const meter = door(sql);
  const last = await meter.background('headline');
  assert.ok(last.ok);
  last.value.settle({ usage: { in: 300, out: 40 } });
  assert.equal(headline().spent(MONTH), 340);
  const over = await meter.background('headline');
  assert.equal(over.ok ? '' : over.refusal.code, 'SLASH_BUDGET_SPENT');
  /* The work has its 260 left, then 259, and understanding its hundred. */
  assert.equal(work().cap - work().spent(MONTH), 260);
  wrote('look');
  assert.equal(work().cap - work().spent(MONTH), 259);
  const understand = work().understand;
  assert.equal((understand?.cap ?? 0) - (understand?.spent(MONTH) ?? 0), 100);
  sql.close();
});

test('UNDERSTANDING SPENDS TO ITS OWN MOST, and the headlines still have their floor after it', () => {
  const { sql, wrote } = ledger();
  wrote('understand', 340);
  const understand = backgroundMeter(sql, 600).understand;
  assert.equal((understand?.cap ?? 0) - (understand?.spent(MONTH) ?? 0), 0);
  const headline = backgroundMeter(sql, 600, 'headline');
  assert.equal(headline.cap - headline.spent(MONTH), 100);
  sql.close();
});

test("A ROW WHOSE PURPOSE THE PLAN DOES NOT NAME IS STILL COUNTED AS THE LOOK'S, so no background row is outside the month", () => {
  const { sql, wrote } = ledger();
  wrote('look', 2);
  wrote('a purpose a later build writes', 3);
  const by = backgroundSpentBy(sql, MONTH);
  assert.deepEqual(by, { understand: 0, headline: 0, compose: 0, look: 5, prose: 0, pattern: 0, skill: 0, embed: 0 });
  assert.equal(leftFor(sql, 60, 'look'), 33 - 5);
  /* The five are inside the floors the look and composing share, nine of 60, so all 24 left over are still there. */
  assert.equal(leftFor(sql, 60, 'prose'), 4 + 24);
  wrote('a purpose a later build writes', 10);
  /* Six of the fifteen are past the look's floors, and the last ask left over is kept for the look, which is earlier in the order. */
  assert.equal(leftFor(sql, 60, 'prose'), 4 + (24 - 6) - 1);
  sql.close();
});
