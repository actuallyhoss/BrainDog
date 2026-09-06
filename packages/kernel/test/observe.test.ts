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
  assert.match(out.suspended ?? '', /rows|days|fortnight/);
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

  // Said out loud, once: a brake nobody is told about is a feature that quietly stopped working.
  assert.equal(sql.all("SELECT 1 FROM event WHERE note LIKE '%predictions were met%'").length, 1);
  k.analyse();
  assert.equal(sql.all("SELECT 1 FROM event WHERE note LIKE '%predictions were met%'").length, 1);
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
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'analyse', 'weekly', '{}', 'pending', 0)",
    new Date(NOW).toISOString(),
  );
  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.equal(drained.done, 1);
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
  const { k, sql } = await record();
  seen(sql, 'search.empty', 'halden', [1, 2, 3, 4, 5]);
  assert.equal(k.analyse().candidate?.subject, 'halden');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  assert.equal(k.analyse().candidate, null, 'it asked the same question twice');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);

  // And the next-best finding is taken instead, which is the same rule read the other way round.
  seen(sql, 'ingest.unmatched', 'email:hsbc', [1, 2, 3]);
  assert.equal(k.analyse().candidate?.subject, 'email:hsbc');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 2);
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
