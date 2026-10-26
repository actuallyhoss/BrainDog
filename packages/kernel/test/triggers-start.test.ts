/**
 * Every trigger starts: a figure crossing its line, a decision in Decide, a clock's `late:`, a clock edited while its
 * turn is pending, and one clock turn delivered twice.
 *
 * WRITTEN BY READING: each test drives the kernel's own doors (`install`, `create`, `decide`, `purge`, `drain`) and
 * reads the tables the runner writes, so it holds the behaviour the contract names and not the source that gives it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

/** How many obligations there are, with a target of at most one, so two or more is the other side of its line. */
const OPEN: Declaration = {
  id: 'metric.open',
  kind: 'metric',
  body: { metric: 'open', name: 'Open', source: 'register.obligations', value: { count: 'id' }, target: { lte: 1 }, window: '30d', compare: 'none', format: 'int' } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([OBLIGATIONS, ...decls]));
  return { k, sql, clock };
}

type Run = { id: string; state: string; trigger: string; say: string | null };
const runs = (sql: NodeSql, of: string): Run[] =>
  sql.all<Run>('SELECT id, state, trigger, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', of);
const notes = (sql: NodeSql, actor: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = ? ORDER BY rowid", actor).map((r) => r.note);
const rows = (sql: NodeSql): string[] =>
  sql.all<{ what: string }>("SELECT json_extract(fields, '$.what') AS what FROM entry WHERE register = 'obligations' AND deleted_at IS NULL ORDER BY rowid").map((r) => r.what);
const due = (sql: NodeSql, rule: string): string | undefined =>
  sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = ? AND state = 'pending'", `flow.every:${rule}`)?.due_at;

/* ── a figure crossing its line ─────────────────────────────────────────── */

test('A METRIC TRIGGER STARTS ONE RUN WHEN ITS FIGURE CHANGES SIDE, and its first reading starts nothing', async () => {
  const { k, sql } = await record(
    OPEN,
    rule({ rule: 'crowded', on: { metric: { id: 'open', crosses: { gte: 2 } } }, steps: [{ notify: { say: 'Two or more are open.' } }] }),
  );

  /* THE FIRST READING ONLY SETS THE SIDE. Nothing is open, so the figure is below the line, and no run starts: a rule
     installed over a figure already past its line would otherwise fire at once for a crossing nobody saw. */
  k.purge();
  await k.drain();
  assert.equal(runs(sql, 'crowded').length, 0, 'a first reading started a run');
  assert.equal(sql.one<{ side: string }>("SELECT side FROM automation_watch WHERE rule = 'crowded' AND key = 'open'")?.side, 'below');

  value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  value<Entry>(k.create('obligations', { what: 'Gas' }, { actor: 'p_1' }));
  k.purge();
  await k.drain();
  const [crossed, ...more] = runs(sql, 'crowded');
  assert.ok(crossed, 'the figure crossed its line and nothing started');
  assert.equal(more.length, 0);
  assert.deepEqual(
    (({ kind, id, value: read, side }) => ({ kind, id, value: read, side }))(JSON.parse(crossed.trigger) as Record<string, unknown>),
    { kind: 'metric', id: 'open', value: 2, side: 'above' },
  );
  assert.equal(crossed.state, 'done', crossed.say ?? '');
  assert.deepEqual(notes(sql, 'rule:crowded'), ['Two or more are open.']);

  /* STILL ABOVE IS NO CROSSING: the next hour's reading keeps the side and starts nothing more. */
  k.purge();
  await k.drain();
  assert.equal(runs(sql, 'crowded').length, 1, 'a figure that stayed on its side started a second run');
  sql.close();
});

/* ── a decision in Decide ───────────────────────────────────────────────── */

test('A DECIDED TRIGGER STARTS ONE RUN FOR THE ANSWER IT NAMES, reading the row the question is about', async () => {
  const { k, sql } = await record(
    rule({ rule: 'ask', register: 'obligations', once_per: ['entry'], then: [{ suggest: { question: 'Chase {{what}}?', options: ['Chase it', 'Leave it'] } }] }),
    rule({ rule: 'chase', name: 'Chase the obligation', on: { decided: { about: 'rule.ask', option: 'Chase it' } }, steps: [{ notify: { say: 'Chasing it.' } }] }),
  );
  const open = (): { id: string; body: { about?: string; options: { id: string; label: string; because: string }[] } } => {
    const s = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:ask' ORDER BY rowid DESC");
    assert.ok(s, 'the rule put no question in front of anybody');
    return { id: s.id, body: JSON.parse(s.body) as { about?: string; options: { id: string; label: string; because: string }[] } };
  };
  const pick = (s: ReturnType<typeof open>, label: string): string => {
    const found = s.body.options.find((o) => o.label === label);
    assert.ok(found, `no option ${label}`);
    return found.id;
  };

  const rent = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  const first = open();
  /* THE QUESTION NAMES ITS ROW, which Decide shows and the run reads. */
  assert.equal(first.body.about, `obligations#${rent.seq}`);
  /* EACH ANSWER SAYS WHAT IT STARTS, by the name of the automation installed on it, and one nothing acts on says nothing. */
  assert.deepEqual(first.body.options.map((o) => o.because), ['Chase the obligation', '']);
  value(k.decide(first.id, { decide: { option: pick(first, 'Chase it'), reason: 'It is late.' } }, 'p_1'));

  const [chased, ...more] = runs(sql, 'chase');
  assert.ok(chased, 'the decision started nothing');
  assert.equal(more.length, 0);
  const trigger = JSON.parse(chased.trigger) as Record<string, unknown>;
  assert.equal(trigger.kind, 'decided');
  assert.equal(trigger.suggestion, first.id);
  assert.equal(trigger.option, 'Chase it');
  assert.equal(trigger.about, 'rule.ask');
  assert.equal(trigger.entry, rent.id, 'the run does not stand on the row the question was about');
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:chase'), ['Chasing it.']);

  /* ANOTHER ANSWER STARTS NOTHING, since the rule names the one it waits for. */
  value<Entry>(k.create('obligations', { what: 'Gas' }, { actor: 'p_1' }));
  const second = open();
  value(k.decide(second.id, { decide: { option: pick(second, 'Leave it'), reason: 'Paid already.' } }, 'p_1'));
  assert.equal(runs(sql, 'chase').length, 1, 'an answer the rule does not name started a run');
  sql.close();
});

/* ── a clock that says late: ────────────────────────────────────────────── */

test('A CLOCK TURN REACHED PAST ITS late: IS RECORDED AND NOT TAKEN, and every turn the drain missed is its own run', async () => {
  const { k, sql, clock } = await record(rule({ rule: 'tick', on: { every: '1h', late: '2h' }, steps: [{ notify: { say: 'Tick.' } }] }));
  assert.equal(due(sql, 'tick'), new Date(NOW + HOUR).toISOString());

  /* FIVE TURNS FALL DUE WHILE NOTHING DRAINS. The first two are reached four and three hours after they were due, past
     `late: 2h`; the third exactly two hours after, which is not past it, and the last two on time or nearly. */
  clock.advance(5 * HOUR);
  await k.drain();

  const all = runs(sql, 'tick');
  assert.equal(all.length, 5, 'a missed turn was folded into another');
  const skipped = all.filter((r) =>
    sql.one("SELECT 1 AS x FROM automation_step WHERE run = ? AND n = 0 AND kind = 'late' AND state = 'skipped'", r.id),
  );
  assert.equal(skipped.length, 2);
  for (const r of skipped) {
    assert.equal(r.state, 'cancelled', 'a skipped turn is a cancelled run with its late step');
    assert.match(r.say ?? '', /late: 2h/u);
  }
  assert.deepEqual(
    skipped.map((r) => (JSON.parse(r.trigger) as { at: string }).at),
    [new Date(NOW + HOUR).toISOString(), new Date(NOW + 2 * HOUR).toISOString()],
  );
  assert.deepEqual(notes(sql, 'rule:tick'), ['Tick.', 'Tick.', 'Tick.']);
  assert.equal(due(sql, 'tick'), new Date(NOW + 6 * HOUR).toISOString());
  sql.close();
});

/* ── a clock edited while its turn is pending ───────────────────────────── */

test('A CLOCK EDITED WHILE ITS TURN IS PENDING IS ARMED AGAIN FROM THE NEW CLOCK, and late: alone moves no turn', async () => {
  const daily = (at: string, extra: Record<string, unknown> = {}) =>
    rule({ rule: 'morning', on: { every: '1d', at, ...extra }, steps: [{ notify: { say: 'Morning.' } }] });
  const { k, sql } = await record(daily('08:00'));
  assert.equal(due(sql, 'morning'), '2026-09-23T08:00:00.000Z');

  /* NOON ON THE 22ND, SO 15:00 IS STILL AHEAD TODAY. The old row would have fired at 08:00 tomorrow first. */
  value(await k.install([daily('15:00')]));
  assert.equal(due(sql, 'morning'), '2026-09-22T15:00:00.000Z', 'the pending turn kept the clock it was armed from');

  value(await k.install([daily('15:00', { late: '1h' })]));
  assert.equal(due(sql, 'morning'), '2026-09-22T15:00:00.000Z', 'how late a turn may be taken moved the turn');
  sql.close();
});

/* ── one turn delivered twice, and a bound that is a day's ───────────────── */

test('A CLOCK TURN TAKEN TWICE MAKES ITS ROW ONCE, and bound: counts the rows of a day, not of a turn', async () => {
  const { k, sql, clock } = await record(
    rule({ rule: 'hourly', on: { every: '1h' }, steps: [{ create: { register: 'obligations', bound: 1, fields: { what: 'Check the meter' } } }] }),
  );
  const turn = new Date(NOW + HOUR).toISOString();
  clock.set(NOW + HOUR);
  await k.drain();
  assert.deepEqual(rows(sql), ['Check the meter']);

  /* THE SAME TURN AGAIN, as a drain that died after its write and before its row moved would deliver it: a second run,
     keyed on the same turn, finds the row the first made. */
  sql.exec("UPDATE schedule SET due_at = ?, state = 'pending' WHERE kind = 'rule' AND key = 'flow.every:hourly'", turn);
  await k.drain();
  assert.equal(runs(sql, 'hourly').length, 2);
  assert.deepEqual(rows(sql), ['Check the meter'], 'one turn delivered twice made two rows');

  /* THE NEXT HOUR'S TURN IS THE SAME DAY, AND `bound: 1` IS A DAY'S: its run fails with a sentence and makes nothing. */
  clock.set(NOW + 2 * HOUR);
  await k.drain();
  const last = runs(sql, 'hourly').at(-1);
  assert.equal(last?.state, 'failed', last?.say ?? '');
  assert.match(last?.say ?? '', /bound of 1/u);
  assert.deepEqual(rows(sql), ['Check the meter']);
  sql.close();
});
