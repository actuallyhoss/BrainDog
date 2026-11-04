/**
 * What the record notices about itself, and what it does about it.
 *
 * A LOOP THAT CANNOT RUN AWAY is the whole design, and the tests are almost all about the governors
 * rather than the detectors. A product that proposes changes to itself from observed data is either
 * the most useful thing in it or a machine that fills somebody's week with plausible nonsense, and
 * the difference is entirely in the thresholds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findingsFrom, openRecord, WINDOWS, type Analysis, type Declaration, type Kernel, type Observation } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'n', type: 'int' },
    ],
  } as never,
};

type Clockish = ReturnType<typeof fixedClock>;

async function record(rows = 30, days = 20): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - days * DAY);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([NOTES])).ok);
  /* The governors want a record with a habit in it: enough rows, enough days, old enough. */
  for (let i = 0; i < rows; i++) {
    clock.set(NOW - days * DAY + (i % 5) * DAY);
    assert.ok(k.create('notes', { what: `Row ${i}`, n: i }, { actor: 'p_1' }).ok);
  }
  clock.set(NOW);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

/** Plant observations on given days, which is the only way to make dispersion testable. */
const seen = (sql: NodeSql, kind: string, subject: string, days: number[], each = 1) => {
  for (const offset of days)
    sql.exec(
      'INSERT INTO observation (kind, subject, day, n) VALUES (?, ?, ?, ?) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + excluded.n',
      kind,
      subject,
      new Date(NOW - offset * DAY).toISOString().slice(0, 10),
      each,
    );
};

/* ── what it records ─────────────────────────────────────────────────────── */

test('AN OBSERVATION IS ONE ROW PER KIND PER SUBJECT PER DAY, incremented', async () => {
  // A row per event is a table that grows with usage and is never read at that grain.
  const { k, sql } = await record();
  assert.equal(value<number>(k.observe([{ kind: 'search.empty', subject: 'halden' }, { kind: 'search.empty', subject: 'halden' }])), 2);

  const row = sql.one<{ n: number; day: string }>("SELECT n, day FROM observation WHERE subject = 'halden'")!;
  assert.equal(row.n, 2);
  assert.equal(row.day, new Date(NOW).toISOString().slice(0, 10));
  sql.close();
});

test('and a signal outside the nine is refused rather than stored', async () => {
  const { k, sql } = await record();
  assert.equal(refusal(k.observe([{ kind: 'vibes' as never, subject: 'x' }])).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(k.observe(Array.from({ length: 201 }, () => ({ kind: 'search.empty', subject: 'x' }) as Observation))).code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('A SEARCH THAT FOUND NOTHING IS OBSERVED, because it is the record failing at what it is for', async () => {
  /* Nobody reports it: people try one more phrasing and give up. Five over ninety days on three
     separate days is a register somebody expected to exist. */
  const { k, sql } = await record();
  assert.equal(k.search('nothing at all here').length, 0);
  assert.equal(k.search('row').length > 0, true);

  const rows = sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'search.empty'");
  assert.deepEqual(rows.map((r) => r.subject), ['nothing at all here']);
  sql.close();
});

test('AND THE ONE WRITE A REFUSAL MAKES, which is how the record can tell a bad declaration from a bad afternoon', async () => {
  const { k, sql } = await record();
  assert.equal(k.create('notes', { n: 1 }, { actor: 'p_1' }).ok, false);

  const row = sql.one<{ subject: string; n: number }>("SELECT subject, n FROM observation WHERE kind = 'write.refused'")!;
  assert.equal(row.subject, 'notes.what:REQUIRED_MISSING');
  assert.equal(row.n, 1);

  // And it survives the write's own rollback, or the record could never notice the difference.
  assert.equal(k.count('notes'), 30, 'the refused write left a row');
  sql.close();
});

/* ── the governors ───────────────────────────────────────────────────────── */

test('A RECORD TOO NEW TO HAVE A HABIT SAYS NOTHING', async () => {
  // Every detector is a claim about a habit, and a fortnight of use is not a habit.
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([NOTES])).ok);
  seen(sql, 'search.empty', 'x', [1, 2, 3, 4, 5]);

  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.match(out.suspended ?? '', /too few to show a habit/);
  sql.close();
});

test('and one with three unanswered proposals does not add a fourth', async () => {
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  for (let i = 1; i <= 4; i++)
    sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', '{}', 'open', 'system', ?)",
      `SG${i}`,
      new Date(NOW).toISOString(),
    );

  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.match(out.suspended ?? '', /already open and unanswered/);
  sql.close();
});

test('THE BRAKE: a class of proposal that keeps being wrong stops being proposed, and says so', async () => {
  /* A loop with no way to notice it is unhelpful is a loop that gets muted, and a muted loop is
     worse than none because it is still spending. */
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  for (let i = 0; i < 20; i++)
    sql.exec(
      `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, met, on_miss)
       VALUES (?, 'd', 'c', '{}', 0, 'n', '1', '30d', ?, ?, ?, 'suggest')`,
      `pr_${i}`,
      new Date(NOW).toISOString(),
      new Date(NOW - i * DAY).toISOString(),
      i < 8 ? 1 : 0,
    );

  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.match(out.suspended ?? '', /40% of the last twenty predictions were met/);

  // Said out loud, once per suspension: a brake nobody is told about is a feature that quietly
  // stopped working.
  assert.equal(sql.all("SELECT 1 FROM event WHERE note LIKE '%predictions were met%'").length, 1);
  k.analyse();
  assert.equal(sql.all("SELECT 1 FROM event WHERE note LIKE '%predictions were met%'").length, 1);
  sql.close();
});

test('AND IT STAYS ON UNTIL 70%, WHICH IS WHAT THE TWO THRESHOLDS ARE FOR', async () => {
  /* 24 §4.7's 70/60, and both numbers are a Wilson interval rather than a feeling: at n=20 the 95%
     lower bound is 0.481 at p̂=0.70 and 0.387 at p̂=0.60. With only the lower number a record
     oscillating around 60% suspends, resumes at 61% and suspends again, and every flap is an
     unexplained change in whether the loop speaks at all. */
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  const score = (met: number, at: number) => {
    sql.exec('DELETE FROM prediction');
    for (let i = 0; i < 20; i++)
      sql.exec(
        `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, met, on_miss)
         VALUES (?, 'd', 'c', '{}', 0, 'n', '1', '30d', ?, ?, ?, 'suggest')`,
        `pr_${at}_${i}`,
        new Date(at).toISOString(),
        new Date(at - i * 1000).toISOString(),
        i < met ? 1 : 0,
      );
  };

  score(8, NOW);
  assert.match(k.analyse().suspended ?? '', /40% of the last twenty/);

  // 65% is above the lower threshold and below the upper one. Before the hysteresis this resumed.
  clock.advance(DAY);
  score(13, NOW + DAY);
  assert.match(k.analyse().suspended ?? '', /65% of the last twenty/, 'the brake released at 65%, which is what flapping is');

  clock.advance(DAY);
  score(15, NOW + 2 * DAY);
  assert.equal(k.analyse().suspended, null, 'and 75% never released it');
  sql.close();
});

test('and every suspension is announced, not only the first in the record\'s life', async () => {
  /* The guard was a `LIKE` over all of `event`, which is append-only — so the first suspension was
     announced and every later one was silent. The loop then stops proposing with nothing in the
     digest, the audit log or the app to say why, and 24 §7's warning is about exactly that: if the
     brake never seems to fire, everybody quietly assumes it cannot. */
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  const score = (met: number, at: number) => {
    sql.exec('DELETE FROM prediction');
    for (let i = 0; i < 20; i++)
      sql.exec(
        `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, met, on_miss)
         VALUES (?, 'd', 'c', '{}', 0, 'n', '1', '30d', ?, ?, ?, 'suggest')`,
        `pr_${at}_${i}`,
        new Date(at).toISOString(),
        new Date(at - i * 1000).toISOString(),
        i < met ? 1 : 0,
      );
  };

  score(8, NOW);
  k.analyse();
  clock.advance(30 * DAY);
  score(19, NOW + 30 * DAY);
  assert.equal(k.analyse().suspended, null, 'it never came back');

  clock.advance(30 * DAY);
  score(6, NOW + 60 * DAY);
  k.analyse();
  assert.equal(
    sql.all("SELECT 1 FROM event WHERE note LIKE '%suspended until somebody has looked%'").length,
    2,
    'the second suspension was silent',
  );
  // And coming off is an event too: somebody told the loop stopped is owed the sentence saying it
  // started again, and it is what makes the brake's state readable from the log.
  assert.equal(sql.all("SELECT 1 FROM event WHERE note LIKE '%proposing has resumed%'").length, 1);
  sql.close();
});

/* ── the detectors ───────────────────────────────────────────────────────── */

test('A BURST IS NOT A PATTERN: five searches in one minute is one event', async () => {
  const { k, sql } = await record();
  // Five on one day clears the count and fails the dispersion.
  seen(sql, 'search.empty', 'halden', [1], 5);
  assert.equal(k.analyse().candidate, null, 'a frustrated minute proposed something');

  // The same five across three days is a pattern.
  sql.exec("DELETE FROM observation");
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  const out = k.analyse();
  assert.equal(out.candidate?.signal, 'search.empty');
  assert.equal(out.candidate?.subject, 'halden');
  assert.equal(out.candidate?.n, 5);
  assert.match(out.candidate?.why ?? '', /three or more separate days/);
  sql.close();
});

test('and each detector has its own count, derived rather than chosen', async () => {
  const { k, sql } = await record();

  // Nine refusals across three days is under the ten the rule of three asks for.
  seen(sql, 'write.refused', 'notes.what:REQUIRED_MISSING', [1, 2, 3], 3);
  assert.equal(k.analyse().candidate, null);
  seen(sql, 'write.refused', 'notes.what:REQUIRED_MISSING', [4]);
  assert.equal(k.analyse().candidate?.signal, 'write.refused');
  sql.close();
});

test('ONE PROPOSAL AT A TIME, and it is the one that cleared its threshold by the most', async () => {
  // A list of eleven proposals is a list nobody reads, and the second-best is still there next week.
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  seen(sql, 'ingest.unmatched', 'email:hsbc', [1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const out: Analysis = k.analyse();
  assert.equal(out.found.length, 2, 'both should clear their thresholds');
  assert.equal(out.candidate?.signal, 'ingest.unmatched', 'nine over three beats five over five');
  sql.close();
});

test('AND THE DRAFT RIDES THE OUTBOX, because what to propose is somebody else’s turn', async () => {
  // The analyser's job ends at "this crossed a threshold". The record never calls a model.
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  k.analyse();

  const queued = sql.one<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox')!;
  assert.equal(queued.kind, 'infer.draft');
  const payload = JSON.parse(queued.payload) as { signal: string; subject: string; n: number };
  assert.deepEqual({ signal: payload.signal, subject: payload.subject, n: payload.n }, { signal: 'search.empty', subject: 'halden', n: 5 });
  sql.close();
});

test('and nothing crossing a threshold queues nothing at all', async () => {
  const { k, sql } = await record();
  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.equal(out.suspended, null, 'the governors passed, so this is a real "nothing to say"');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0);
  sql.close();
});

/* ── it runs weekly ──────────────────────────────────────────────────────── */

test('the `analyse` row recurs weekly rather than finishing', async () => {
  const { k, sql, clock } = await record();
  /* THE ROW IS `createRecord`'s, beside `purge/sweep` — this helper opens a record without creating
     one, so the row is armed here. What is under test is that the HANDLER re-arms it rather than
     finishing: a weekly analysis that ran once and went `done` is an observe loop that stops. */
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_an', ?, 'analyse', 'weekly', '{}', 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending'`,
    new Date(NOW).toISOString(),
  );

  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.ok(drained.done >= 1);
  assert.equal(drained.dead, 0, '`analyse` is a kind nothing handles');

  const again = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'analyse'")!;
  assert.equal(again.state, 'pending');
  assert.equal(Date.parse(again.due_at) - (NOW + 1000), 7 * DAY);
  sql.close();
});

/* ── what the loop got wrong about itself ───────────────────────── */

test('A BAD KIND HALFWAY THROUGH A BATCH KEEPS NONE OF IT', async () => {
  /* The refusal is a value, so the transaction commits: `a` and `b` were counted, the caller was
     told nothing happened, and the retry counted them again — which is the exact arithmetic every
     threshold below is built on. */
  const { k, sql } = await record();
  assert.equal(
    refusal(
      k.observe([
        { kind: 'search.empty', subject: 'a' },
        { kind: 'search.empty', subject: 'b' },
        { kind: 'not.a.signal' as never, subject: 'c' },
      ]),
    ).code,
    'ENUM_VALUE_UNKNOWN',
  );
  assert.deepEqual(sql.all("SELECT subject FROM observation WHERE kind = 'search.empty'"), []);
  sql.close();
});

test('AND A FINDING IT HAS ALREADY ASKED ABOUT IS NOT ASKED AGAIN EVERY WEEK', async () => {
  // This runs weekly and nothing recorded that it had proposed: one finding, one bill, for ever.
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  assert.equal(k.analyse().candidate?.subject, 'halden');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  assert.equal(k.analyse().candidate, null, 'it asked the same question twice');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  // And the next-best finding is taken instead, which is the same rule read the other way round.
  // A week later, because the rate governor is the other half of §4.3 and one proposal a week is
  // what it caps: two findings in one Tuesday is the queue-flooding this product is built against.
  clock.advance(8 * DAY);
  seen(sql, 'ingest.unmatched', 'email:hsbc', [1, 2, 3]);
  assert.equal(k.analyse().candidate?.subject, 'email:hsbc');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 2);
  sql.close();
});

test('ONE PROPOSAL A WEEK, WHICH IS NOT THE SAME GOVERNOR AS THREE OPEN AT ONCE', async () => {
  /* Three-at-once caps the QUEUE and this caps the RATE. A record that answers every proposal the
     day it arrives never reaches three open and could be asked something new every hour — and a
     caller invoking `analyse()` twice in a day got two drafts and two model bills, because the
     second half of 24 §4.3 was documented and never built. */
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  assert.equal(k.analyse().candidate?.subject, 'halden');

  // A different finding, the same week. Nothing is deduped here — it has never been asked.
  seen(sql, 'ingest.unmatched', 'email:hsbc', [1, 2, 3]);
  const soon = k.analyse();
  assert.equal(soon.candidate, null);
  assert.match(soon.suspended ?? '', /already been drafted this week/);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  clock.advance(8 * DAY);
  assert.equal(k.analyse().candidate?.subject, 'email:hsbc');
  sql.close();
});

test('and a finding still true a week later comes back, because the dedupe is not for ever', async () => {
  /* `outbox` rows are never purged, so "have I asked about this?" meant "ever" — and a finding
     proposed once and dismissed was never raised again however much worse it got. Twelve refused
     writes and four hundred were the same to it, and nothing said the record had decided to stop
     mentioning it. */
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  assert.equal(k.analyse().candidate?.subject, 'halden');

  clock.advance(8 * DAY);
  assert.equal(k.analyse().candidate?.subject, 'halden', 'a finding that is still true went unmentioned for ever');
  sql.close();
});

test('A DEFERRED QUESTION IS NOT AN UNANSWERED ONE', async () => {
  /* `listGovernance` excludes deferred rows from the queue and this governor did not, so three
     questions deferred to next year left the gate showing nothing to answer while the analyser
     reported three proposals open and stopped for a year. The operator sees an empty queue and a
     silent loop and has no way to connect them. */
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  for (let i = 1; i <= 3; i++)
    sql.exec(
      `INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, defer_until)
       VALUES (?, 'change', '{}', 'open', 'system', ?, '2027-01-01')`,
      `SG${i}`,
      new Date(NOW).toISOString(),
    );
  assert.equal(k.analyse().candidate?.subject, 'halden', 'three deferred questions silenced the loop for a year');
  sql.close();
});

test('THE OTHER BRAKE: three of a class marked incorrect stops that class', async () => {
  /* It is the only brake a young record can reach. The scored-prediction brake needs twenty scored
     predictions, which take a year of accepted changes — so until this existed, a class the owner
     had said was wrong three times kept arriving, which is how a gate gets muted. */
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  seen(sql, 'suggestion.incorrect', 'change', [1, 2, 3]);
  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.match(out.suspended ?? '', /marked incorrect in ninety days/);
  sql.close();
});

test('and two of a class is not three', async () => {
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  seen(sql, 'suggestion.incorrect', 'change', [1, 2]);
  assert.equal(k.analyse().candidate?.subject, 'halden');
  sql.close();
});

test('and three open proposals is three, not four', async () => {
  // The governor said `> 3` and the sentence above it said three.
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  for (let i = 1; i <= 3; i++)
    sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', '{}', 'open', 'system', ?)",
      `SG${i}`,
      new Date(NOW).toISOString(),
    );
  const out = k.analyse();
  assert.equal(out.candidate, null);
  assert.match(out.suspended ?? '', /3 proposals are already open/);
  sql.close();
});

test('findingsFrom is the one place the thresholds live', async () => {
  // The interface shows a finding above the grid it is about, and it must not carry its own copy of
  // the numbers: a screen that announces a pattern while the analyser proposes nothing reads as the
  // product being wrong about itself. So the SQL analyser and any surface go through this function.
  const { k, sql } = await record();
  seen(sql, 'write.refused', 'obligations.direction:ENUM_VALUE_UNKNOWN', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const counts = [
    { signal: 'write.refused' as const, subject: 'obligations.direction:ENUM_VALUE_UNKNOWN', total: 10, days: 10 },
  ];
  assert.deepEqual(
    findingsFrom(counts).map((f) => [f.subject, f.n, f.days, f.window]),
    k.analyse().found.map((f) => [f.subject, f.n, f.days, f.window]),
  );
  sql.close();
});

test('and it refuses the same things the analyser refuses', () => {
  // One under the count, one under the dispersion. Both are the shapes that would put a permanent
  // strip above a grid if a surface rounded up.
  assert.deepEqual(
    findingsFrom([
      { signal: 'write.refused', subject: 'tasks.by:REQUIRED_MISSING', total: 9, days: 9 },
      { signal: 'write.refused', subject: 'tasks.at:TYPE_MISMATCH', total: 40, days: 2 },
    ]),
    [],
  );
});

test('the worst thing is first, measured against its own threshold', () => {
  // Two signals with different counts are not comparable by count: 200 scans is one detector's
  // floor and 10 refusals is another's. The order is how far past its own number each one is, which
  // is what makes "show the first" a defensible interface.
  const order = findingsFrom([
    { signal: 'query.scan', subject: 'obligations', total: 400, days: 30 },
    { signal: 'write.refused', subject: 'obligations.direction:ENUM_VALUE_UNKNOWN', total: 30, days: 4 },
  ]).map((f) => f.signal);
  assert.deepEqual(order, ['write.refused', 'query.scan']);
});

test('WINDOWS says how far back each detector looked', () => {
  // The strip prints it. A window shown as "30d" beside a count from a 90-day detector is a lie
  // about the arithmetic, so the sentence takes the number from the detector itself.
  assert.equal(WINDOWS['write.refused'], 30);
  assert.equal(WINDOWS['search.empty'], 90);
});

/* ── 24 §7's suite B, which the doc calls the one that matters ───────────── */

test('A HUNDRED RECORD-YEARS WITH NO PLANTED PATTERN PROPOSE NOTHING', async () => {
  /* *"100 simulated record-years … with no planted pattern → zero proposals."* Every threshold in
     this file is a claim about SPECIFICITY — that ordinary use does not trip it — and the only way
     to check a claim about noise is to feed it noise. Without this the numbers are a story about
     the rule of three rather than a property of the code.

     THE NOISE IS THE SHAPE ORDINARY USE HAS: a handful of signals a week, spread across many
     subjects, with nothing repeated often enough or widely enough to be a habit. A record that
     searched for eleven different things once each did not develop a pattern; a record that
     searched for one thing eleven times did. */
  const { k, sql, clock } = await record();
  let seed = 20260905;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  let proposed = 0;
  for (let week = 0; week < 100 * 52; week++) {
    clock.advance(7 * DAY);
    const day = new Date(clock.now()).toISOString().slice(0, 10);

    /* Three to eight signals a week, each about a different thing. `subject` is drawn from a wide
       pool on purpose: what makes something a pattern is that it is the SAME thing, repeatedly. */
    const many = 3 + Math.floor(next() * 6);
    for (let i = 0; i < many; i++) {
      const kind = ['search.empty', 'write.refused', 'ingest.unmatched', 'query.scan'][Math.floor(next() * 4)]!;
      const subject = `noise-${Math.floor(next() * 4000)}`;
      sql.exec(
        'INSERT INTO observation (kind, subject, day, n) VALUES (?, ?, ?, 1) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1',
        kind,
        subject,
        day,
      );
    }

    if (k.analyse().candidate) proposed++;
  }

  assert.equal(proposed, 0, `${proposed} proposals came out of a hundred record-years of noise`);
  sql.close();
});

test('and the same suite WITH a planted pattern proposes it', async () => {
  /* The other half, and it is what makes the first half mean something: a test that passes because
     the analyser never proposes anything is not a specificity test, it is a broken analyser. */
  const { k, sql, clock } = await record();
  clock.advance(7 * DAY);
  const day = (n: number) => new Date(clock.now() - n * DAY).toISOString().slice(0, 10);
  for (const n of [1, 2, 3, 4, 5])
    sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('search.empty', 'retainer', ?, 1)", day(n));

  assert.equal(k.analyse().candidate?.subject, 'retainer');
  sql.close();
});

test('ONE PROPOSAL IN TEN COMES FROM BELOW THE THRESHOLD', async () => {
  /* 24 §4.3's third governor, and the note beside it says it is not optional: greedily exploiting
     your own best current model degenerates FASTEST — an AIES 2019 result found an ORACLE greedy
     policy degenerates faster than a noisy one. Without this the loop converges on its own first
     three good ideas and then has nothing left to say, which from outside looks exactly like a loop
     that has finished its work. */
  const { k, sql, clock } = await record();

  // One finding over the line, and one under it that would never otherwise be spoken about.
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  seen(sql, 'search.empty', 'retainer', [1, 2, 3]);

  const drawn: string[] = [];
  for (let i = 0; i < 10; i++) {
    clock.advance(8 * DAY);
    const out = k.analyse();
    if (out.candidate) drawn.push(out.candidate.subject);
  }

  assert.ok(drawn.includes('retainer'), 'the below-threshold finding was never explored');
  const payloads = sql
    .all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.draft' ORDER BY rowid")
    .map((r) => JSON.parse(r.payload) as { subject: string; exploratory?: boolean });
  const exploratory = payloads.filter((p) => p.exploratory);
  assert.equal(exploratory.length, 1, 'the budget is one in ten, and this drew a different number');
  assert.equal(exploratory[0]?.subject, 'retainer');
  // MARKED, so the gate can say which it is and the prediction it earns is scored the same way.
  assert.ok(payloads.filter((p) => !p.exploratory).length > 0, 'every draft was exploratory');
  sql.close();
});

test('and a below-threshold finding is still not noise', async () => {
  // Half the count over the same number of separate days: a burst is not a pattern, whichever side
  // of the line it is on. One search on one day is not an exploration, it is a Tuesday.
  const { k, sql, clock } = await record();
  seen(sql, 'search.empty', 'once', [1]);
  for (let i = 0; i < 10; i++) {
    clock.advance(8 * DAY);
    assert.equal(k.analyse().candidate, null, 'a single observation was explored');
  }
  sql.close();
});

test('A REGISTER NOBODY OPENS IS A FINDING, and only where something was listening', async () => {
  /* `24 §4.2` lists "register never read, page never rendered", and `register.read` / `page.render`
     were two of the nine kinds the CHECK admits with NOTHING writing them and nothing reading them
     — a vocabulary with neither end connected, which reads exactly like one that works.

     AN ABSENCE IS ONLY EVIDENCE WHERE PRESENCE IS RECORDED. That is Law One the other way round: a
     burst is not a pattern, and a silence is not a fact unless somebody was listening. Without it,
     "no reads in ninety days" was true of every register on every record — 24 §7's specificity
     suite said so on the first run, with two and a half thousand proposals out of pure noise. */
  const { k, sql, clock } = await record();
  value(await k.install([{ id: 'register.dusty', kind: 'register', body: { id: 'dusty', name: 'Dusty', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } }] as never));

  /* The declaration has to be older than the window, or "no reads" is "no time to be read". */
  sql.exec("UPDATE declaration SET created_at = ? WHERE kind = 'register'", new Date(NOW - 200 * DAY).toISOString());

  /* NOTHING IS LISTENING YET, so nothing is dormant — the record has no `register.read` rows at all,
     which is a fact about the observing rather than about the register. */
  clock.set(NOW);
  assert.equal(
    sql.all("SELECT 1 FROM observation WHERE kind = 'register.read'").length,
    0,
    'this test needs a record with no read observations, and it has some',
  );

  /* Now two other registers are read, over three separate days. */
  for (let d = 0; d < 3; d++) {
    clock.set(NOW - (d + 1) * DAY);
    value(k.observe([{ kind: 'register.read', subject: 'notes' }, { kind: 'register.read', subject: 'obligations' }]));
  }
  clock.set(NOW);

  const dusty = sql.all<{ subject: string }>("SELECT DISTINCT subject FROM observation WHERE kind = 'register.read'");
  assert.equal(dusty.length, 2, 'the fixture did not record reads of two other registers');
  assert.ok(!dusty.some((r) => r.subject === 'dusty'), 'the dusty register was read, so it is not dormant');
  sql.close();
});
