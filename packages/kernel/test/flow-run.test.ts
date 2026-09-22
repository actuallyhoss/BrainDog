/**
 * An automation runs: a rule on the run path is started by its trigger, walks its steps and leaves one row per step
 * (`loop/research-shell-automations.md` §4.1, §4.2, §4.5, Brief B).
 *
 * WHAT WAS MEASURED BEFORE THE RUNNER. Every body below installed or was refused by the lint alone, and then nothing
 * read it: a clock rule drained past its due time left no event, a steps-only rule was refused by the kernel's own
 * install check for having no `then:`, and `on: 'hourly'` installed as an inline rule that fired on every write. Each
 * test here failed on that line first.
 *
 * THE MIGRATION IS APPLIED HERE WHEN THE RECORD HAS NOT. `0011_automation_run.ts` is registered by one line in
 * `migrate.ts`, which this brief does not own; until that line lands a record opened by `openRecord` has no
 * `automation_run`, and `withRuns` below adds it the way the runner would find it. Once the line is in, the table is
 * already there and `withRuns` does nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;

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
      { id: 'level', type: 'text' },
    ],
  } as never,
};

const PAID: Declaration = {
  id: 'register.paid',
  kind: 'register',
  body: {
    id: 'paid',
    name: 'Paid',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const BANK: Declaration = {
  id: 'ingest.bank',
  kind: 'ingest',
  body: {
    ingest: 'bank',
    channel: 'webhook',
    match: { all: [{ field: 'body', contains: 'paid' }] },
    extract: { merchant: { text: { between: ['You ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register: 'paid', confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};

async function withRuns(sql: NodeSql): Promise<void> {
  if (sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) return;
  const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
  sql.db.exec(ddl);
}

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  await withRuns(sql);
  const done = await k.install([OBLIGATIONS, PAID, BANK, ...decls]);
  assert.ok(done.ok, why(done));
  return { k, sql, clock };
}

type Run = { id: string; rule: string; state: string; step: number; vars: string; depth: number; say: string | null };
type Step = { n: number; kind: string; state: string; answer: string | null };

const runs = (sql: NodeSql, of: string): Run[] =>
  sql.all<Run>('SELECT id, rule, state, step, vars, depth, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', of);
const steps = (sql: NodeSql, run: string): Step[] => sql.all<Step>('SELECT n, kind, state, answer FROM automation_step WHERE run = ? ORDER BY n', run);
const notes = (sql: NodeSql, actor: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = ? ORDER BY rowid", actor).map((r) => r.note);
const metered = (sql: NodeSql, actor: string) =>
  sql
    .all<{ target: string; to_v: string }>("SELECT target, to_v FROM event WHERE kind = 'pull' AND actor = ? ORDER BY rowid", actor)
    .map((r) => ({ target: r.target, ...(JSON.parse(r.to_v) as { outcome: string; scope: string; usage: { runs: number; failures: number } }) }));
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, why(r));
  return x.value;
};

/* ── the red the brief asked for ───────────────────────────────────────── */

test('A RULE ON A FIFTEEN-MINUTE CLOCK RUNS WHEN THE CLOCK COMES ROUND: one run, one event, one metered line', async () => {
  const { k, sql, clock } = await record(rule({ rule: 'tick', on: { every: '15m' }, steps: [{ notify: { say: 'Look at the gold rate.' } }] }));

  await k.drain();
  assert.deepEqual(notes(sql, 'rule:tick'), [], 'a clock rule ran at install, before its first interval');

  clock.advance(15 * MIN);
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:tick'), ['Look at the gold rate.'], 'the clock came round and nothing ran');
  const [one] = runs(sql, 'tick');
  assert.equal(one?.state, 'done');
  assert.deepEqual(
    metered(sql, 'rule:tick').map((m) => [m.target, m.outcome, m.scope, m.usage.runs, m.usage.failures]),
    [['declaration:rule.tick', 'ok', 'global', 1, 0]],
  );

  clock.advance(15 * MIN);
  await k.drain();
  assert.equal(runs(sql, 'tick').length, 2, 'the clock fired once and was not armed again');
  sql.close();
});

/* ── the two things the wave-thirty-two checker left ───────────────────── */

test('A steps: BODY WITH A register: BESIDE IT IS TOLD WHAT IS WRONG, not that it says nothing', async () => {
  /* MEASURED, AND NARROWER THAN THE FINDING. A `steps:` body with `on:` and no `register:` already installed, because
     `undeclarable` is reached only for a body with a top-level `register:`. For that body it answered first, with
     `REQUIRED_MISSING at then`, a sentence about a key the person was right to leave out, and the lint's sentence
     about the key they should move was never seen. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const both = await k.install([
    OBLIGATIONS,
    rule({ rule: 'both', register: 'obligations', on: { written: { register: 'obligations' } }, steps: [{ set: { field: 'note', to: 'x' } }] }),
  ]);
  const refusal = (both as { refusal?: { code: string; at?: string } }).refusal;
  assert.deepEqual([refusal?.code, refusal?.at], ['DECLARATION_INVALID', 'register']);
  sql.close();
});

test('A RULE WITH on: AND steps: AND NO then: INSTALLS, and runs after the write rather than inside it', async () => {
  const { k, sql } = await record(
    rule({ rule: 'stamp', on: { written: { register: 'obligations', op: ['create'] } }, steps: [{ set: { field: 'note', to: 'seen {{what}}' } }] }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  assert.equal(made.fields.note, undefined, 'the run wrote inside the triggering write');
  assert.equal(runs(sql, 'stamp')[0]?.state, 'pending');

  await k.drain();
  assert.equal(k.get(made.id)?.fields.note, 'seen Rent');
  assert.equal(runs(sql, 'stamp')[0]?.state, 'done');
  assert.deepEqual(steps(sql, runs(sql, 'stamp')[0]!.id).map((s) => [s.n, s.kind, s.state]), [[0, 'set', 'done']]);

  /* `op: [create]` IS READ. The inline pass would have fired on the run's own edit and on this one. */
  value(k.update('obligations', made.id, { level: 'high' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(runs(sql, 'stamp').length, 1, 'an update started a rule that runs on create');
  sql.close();
});

test('A WORD IN on: THAT NO RULE EVER CARRIED IS REFUSED with a sentence, and the one older word still installs', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const hourly = await k.install([OBLIGATIONS, rule({ rule: 'hourly', register: 'obligations', on: 'hourly', then: [{ set: { field: 'note', to: 'x' } }] })]);
  assert.equal(hourly.ok, false, 'on: hourly installed as an inline rule that fires on every write');
  const refusal = (hourly as { refusal: { code: string; fix: string } }).refusal;
  assert.equal(refusal.code, 'DECLARATION_INVALID');
  assert.match(refusal.fix, /hourly/);
  assert.match(refusal.fix, /every: 1h/);

  const legacy = await k.install([OBLIGATIONS, rule({ rule: 'legacy', register: 'obligations', on: 'create', then: [{ set: { field: 'note', to: 'x' } }] })]);
  assert.ok(legacy.ok, why(legacy));
  sql.close();
});

test('A when: THE RUNNER CANNOT READ IS REFUSED AT INSTALL, as the same words on an inline rule are', async () => {
  /* MEASURED BY THE CHECKER. `due is before today` over a day field is VALUE_MALFORMED on an inline rule; on
     `on: { written: … }` it installed, and every write after it started nothing, because the runner reads a condition
     it cannot parse as false. The same body with `due before today` ran. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  await withRuns(sql);
  const DUE: Declaration = {
    id: 'register.bills',
    kind: 'register',
    body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'due', type: 'day' }, { id: 'note', type: 'text' }] } as never,
  };
  const on = { written: { register: 'bills', op: ['create', 'update'] } };
  const bad = await k.install([DUE, rule({ rule: 'late', on, when: 'due is before today', steps: [{ set: { field: 'note', to: 'late' } }] })]);
  assert.equal((bad as { refusal?: { code: string } }).refusal?.code, 'VALUE_MALFORMED', 'an unreadable when: installed on the run path');
  const good = await k.install([DUE, rule({ rule: 'late', on, when: 'due before today', steps: [{ set: { field: 'note', to: 'late' } }] })]);
  assert.ok(good.ok, why(good));
  sql.close();
});

test('A SWEEP BY HAND PRUNES OLD RUNS, as the hourly one does', async () => {
  /* `purge()` and the hourly `purge` row run one function, `sweepRecord`. The first cut pruned runs in the row's
     handler only, so a finished run ninety-one days old survived every sweep by hand. */
  const { k, sql, clock } = await record(rule({ rule: 'old', on: { manual: true }, steps: [{ notify: { say: 'hi' } }] }));
  value(k.automationRun('old', 'p_1'));
  await k.drain();
  assert.equal(runs(sql, 'old')[0]?.state, 'done');
  clock.advance(91 * 24 * HOUR);
  k.purge();
  assert.equal(runs(sql, 'old').length, 0, 'a run past ninety days outlived the sweep');
  assert.equal(metered(sql, 'rule:old').length, 1, 'the metered line went with the run');
  sql.close();
});

/* ── triggers ─────────────────────────────────────────────────────────── */

test('AN ARRIVAL STARTS A RUN ABOUT THE ROW IT WROTE, and a redelivery of the same bytes starts none', async () => {
  const { k, sql } = await record(rule({ rule: 'banked', on: { arrival: { ingest: 'bank' } }, steps: [{ set: { field: 'note', to: 'from {{trigger.channel}}' } }] }));
  const out = value<{ wrote: string[] }>(k.arrive({ channel: 'webhook', ingest: 'bank', body: 'You paid EGP 120.00 today.', sha256: 'a1', verified: true }));
  await k.drain();
  assert.equal(k.get(out.wrote[0]!)?.fields.note, 'from webhook');

  value(k.arrive({ channel: 'webhook', ingest: 'bank', body: 'You paid EGP 120.00 today.', sha256: 'a1', verified: true }));
  await k.drain();
  assert.equal(runs(sql, 'banked').length, 1, 'every webhook sender retries, and a retry is not an arrival');
  sql.close();
});

test('A BUTTON STARTS A RUN; a wait parks it on the clock and the drain resumes it; a branch reads what a step set', async () => {
  const { k, sql, clock } = await record(
    rule({
      rule: 'later',
      on: { manual: true },
      steps: [
        { set_var: { name: 'who', to: 'gold' } },
        { wait: '1h' },
        { if: 'who is gold', then: [{ notify: { say: 'It was {{vars.who}}' } }], else: [{ notify: { say: 'It was not' } }] },
      ],
    }),
  );
  const { run } = value<{ run: string }>(k.automationRun('later', 'p_1'));
  await k.drain();
  assert.equal(runs(sql, 'later')[0]?.state, 'waiting');
  assert.deepEqual(notes(sql, 'rule:later'), []);

  clock.advance(59 * MIN);
  await k.drain();
  assert.equal(runs(sql, 'later')[0]?.state, 'waiting', 'a wait of an hour ended early');

  clock.advance(MIN);
  await k.drain();
  assert.equal(runs(sql, 'later')[0]?.state, 'done');
  assert.deepEqual(notes(sql, 'rule:later'), ['It was gold']);
  assert.deepEqual(JSON.parse(runs(sql, 'later')[0]!.vars), { who: 'gold' });
  assert.deepEqual(
    steps(sql, run).map((s) => [s.n, s.kind, s.state, s.answer]),
    [
      [0, 'set_var', 'done', 'gold'],
      [1, 'wait', 'done', null],
      [2, 'if', 'done', 'then'],
      [3, 'notify', 'done', null],
    ],
  );
  sql.close();
});

test('A STEP THAT WAITS ON SOMETHING NOT IN THIS BUILD FAILS THE RUN WITH A SENTENCE, and a failed run is free', async () => {
  const { k, sql } = await record(rule({ rule: 'scripted', on: { manual: true }, steps: [{ script: { id: 'parse', as: 'out' } }] }));
  const { run } = value<{ run: string }>(k.automationRun('scripted', 'p_1'));
  await k.drain();
  const [one] = runs(sql, 'scripted');
  assert.equal(one?.state, 'failed');
  assert.match(one?.say ?? '', /script/);
  assert.deepEqual(steps(sql, run).map((s) => [s.kind, s.state]), [['script', 'failed']]);
  assert.deepEqual(metered(sql, 'rule:scripted').map((m) => [m.outcome, m.usage.runs, m.usage.failures]), [['failed', 0, 1]]);
  sql.close();
});

test('A RUN CANCELLED WHILE IT WAITS STAYS CANCELLED when its clock comes round', async () => {
  const { k, sql, clock } = await record(rule({ rule: 'held', on: { manual: true }, steps: [{ wait: '1h' }, { notify: { say: 'too late' } }] }));
  const { run } = value<{ run: string }>(k.automationRun('held', 'p_1'));
  await k.drain();
  value(k.cancelRun(run, 'p_1'));
  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(runs(sql, 'held')[0]?.state, 'cancelled');
  assert.deepEqual(notes(sql, 'rule:held'), []);
  sql.close();
});

test('RUNS_PER_DAY IS A CEILING: the run past it is refused with a sentence and nothing is started', async () => {
  const { k, sql } = await record(rule({ rule: 'once', on: { manual: true }, limits: { runs_per_day: 1 }, steps: [{ notify: { say: 'hi' } }] }));
  value(k.automationRun('once', 'p_1'));
  const second = k.automationRun('once', 'p_1') as { ok: boolean; refusal?: { code: string } };
  assert.equal(second.ok, false);
  assert.equal(second.refusal?.code, 'OUT_OF_BOUNDS');
  assert.equal(runs(sql, 'once').length, 1);
  sql.close();
});

test('A RUN STARTED BY A RULE WRITE ONLY WHERE from_rules SAYS SO, and the chain stops at depth three', async () => {
  const { k, sql } = await record(
    rule({ rule: 'first', on: { written: { register: 'obligations', op: ['create'] } }, steps: [{ set: { field: 'note', to: 'one' } }] }),
    rule({ rule: 'echo', on: { written: { register: 'obligations', op: ['update'], from_rules: true } }, steps: [{ set: { field: 'level', to: 'x' } }] }),
    rule({ rule: 'quiet', on: { written: { register: 'obligations', op: ['update'] } }, steps: [{ set: { field: 'level', to: 'y' } }] }),
  );
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  for (let i = 0; i < 6; i++) await k.drain();
  assert.equal(runs(sql, 'quiet').length, 0, 'a write made by a rule started an automation that did not ask for it');
  assert.deepEqual(runs(sql, 'echo').map((r) => r.depth), [1, 2, 3]);
  sql.close();
});

/* ── audit thirty-three: sections 1, 4 and 5 ─────────────────────────── */

test('A STEP THAT THROWS FAILS THE RUN WITH A SENTENCE, and nothing it already did is done again', async () => {
  /* `loop/research-batch-thirty-three-audit.md` §1, `f6.mts`. A throw left `advance` for the drain's ladder, the run
     stayed `running` at the step it had saved, and the next attempt took every step before the throw again: with a wait
     first, the wait's row already said `done`, so it parked again and the ladder was reset, and the notify went out
     every two hours for as long as the probe ran; without one, eight notifies and a run that never ended.

     THE BODY IS WRITTEN UNDER THE LINT, straight into the declaration row, because what is under test is a throw from
     any step (a driver error, a full disk, a bug) and not the one malformed shape the audit happened to find. At HEAD
     `{ note: { text } }` also installed through the front door, and a lint that refuses it would not change this. */
  const on = { written: { register: 'paid', op: ['create'] } };
  const { k, sql, clock } = await record(
    rule({ rule: 'chase', on, once_per: ['entry'], steps: [{ wait: '1h' }, { notify: { say: 'Chase {{merchant}}' } }, { note: 'x' }] }),
    rule({ rule: 'nag', on, once_per: ['entry'], steps: [{ notify: { say: 'Nag {{merchant}}' } }, { note: 'x' }] }),
  );
  for (const [id, list] of [
    ['rule.chase', [{ wait: '1h' }, { notify: { say: 'Chase {{merchant}}' } }, { note: { text: 'x' } }]],
    ['rule.nag', [{ notify: { say: 'Nag {{merchant}}' } }, { note: { text: 'x' } }]],
  ] as const)
    sql.exec("UPDATE declaration SET body = json_set(body, '$.steps', json(?)) WHERE id = ?", JSON.stringify(list), id);

  value(k.create('paid', { merchant: 'Acme' }, { actor: 'p_1' }));
  await k.drain();
  for (let h = 0; h < 12; h++) {
    clock.advance(HOUR);
    await k.drain();
  }

  assert.deepEqual(notes(sql, 'rule:chase'), ['Chase Acme'], 'the notify before the throw was sent again');
  assert.deepEqual(notes(sql, 'rule:nag'), ['Nag Acme'], 'the notify before the throw was sent again');
  for (const name of ['chase', 'nag']) {
    const all = runs(sql, name);
    assert.deepEqual(all.map((r) => r.state), ['failed'], `rule.${name}'s run did not end`);
    assert.match(all[0]!.say ?? '', /step \d/, 'a failed run says where it failed');
    assert.equal(steps(sql, all[0]!.id).at(-1)?.state, 'failed');
  }
  assert.equal(
    sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND key LIKE 'flow.run:%' AND state != 'done'"),
    undefined,
    'a run row is still armed',
  );
  sql.close();
});

test('A RUN WHOSE SAVED STEP IS A WAIT ALREADY DONE DOES NOT WAIT AGAIN', async () => {
  /* THE STATE §1 LEFT BEHIND: the wait's own row `done` and the run's `step` still pointing at it, which is what a run
     that died after its wake and before its step was saved looks like. The wait arm read only `waiting` as the wake,
     so it parked the run for the whole span again. */
  const { k, sql, clock } = await record(rule({ rule: 'woke', on: { manual: true }, steps: [{ wait: '1h' }, { notify: { say: 'after' } }] }));
  const { run } = value<{ run: string }>(k.automationRun('woke', 'p_1'));
  await k.drain();
  assert.equal(runs(sql, 'woke')[0]?.state, 'waiting');
  sql.exec("UPDATE automation_step SET state = 'done' WHERE run = ? AND n = 0", run);
  sql.exec("UPDATE automation_run SET state = 'running' WHERE id = ?", run);

  clock.advance(HOUR);
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:woke'), ['after'], 'a wait that was done was armed again');
  assert.equal(runs(sql, 'woke')[0]?.state, 'done');
  sql.close();
});

/** §4's rule: a wait, then a write and a notify, about an obligation. */
const CHASED = {
  rule: 'chased',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [{ wait: '1h' }, { set: { field: 'note', to: 'chased' } }, { notify: { say: 'Chased {{what}}' } }],
};

test('SWITCHING AN AUTOMATION OFF CANCELS THE RUN THAT WAITS, in the install that switches it', async () => {
  /* §4, `flow.mts off`, line one. `enabled: false` landed as version 2 and the run pinned to version 1 woke, wrote
     `chased` and notified: nothing after `startRun` asked whether the rule was still on. */
  const { k, sql, clock } = await record(rule(CHASED));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(runs(sql, 'chased')[0]?.state, 'waiting');

  const off = await k.install([rule({ ...CHASED, enabled: false })]);
  assert.ok(off.ok, why(off));
  assert.equal(runs(sql, 'chased')[0]?.state, 'cancelled', 'the install that switched the rule off left its run waiting');
  assert.match(runs(sql, 'chased')[0]?.say ?? '', /switched off/);

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(runs(sql, 'chased')[0]?.state, 'cancelled');
  assert.equal(k.get(made.id)?.fields.note, undefined, 'a switched-off rule wrote to the row');
  assert.deepEqual(notes(sql, 'rule:chased'), []);
  sql.close();
});

test('RETIRING AN AUTOMATION CANCELS THE RUN THAT WAITS, in the same transaction', async () => {
  /* §4, `flow.mts off`, line two. */
  const { k, sql, clock } = await record(rule(CHASED));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  value(k.retire(['rule.chased'], { actor: 'p_1' }));
  assert.equal(runs(sql, 'chased')[0]?.state, 'cancelled', 'the retire left its run waiting');
  assert.match(runs(sql, 'chased')[0]?.say ?? '', /retired/);

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(k.get(made.id)?.fields.note, undefined, 'a retired rule wrote to the row');
  assert.deepEqual(notes(sql, 'rule:chased'), []);
  sql.close();
});

test('A RUN THAT WAKES UNDER A RULE NOTHING KEEPS LIVE IS CANCELLED, whoever took the rule off', async () => {
  /* A PACK TURNED OFF RETIRES ITS RULES IN `declare.ts`, which is not the kernel's `retire`, and a record written by an
     earlier build may hold a run of a rule already gone. So the runner asks again at every wake, and this retires the
     row under it to prove that the question is asked there and not only by `retire`. */
  const { k, sql, clock } = await record(rule(CHASED));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'rule.chased'");

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(runs(sql, 'chased')[0]?.state, 'cancelled', 'a run woke and acted for a rule that is retired');
  assert.equal(k.get(made.id)?.fields.note, undefined);
  assert.deepEqual(notes(sql, 'rule:chased'), []);
  sql.close();
});

test("A PACK'S INSTALL THAT SWITCHES AN AUTOMATION OFF CANCELS ITS WAITING RUN AS WELL, in the write it stages", async () => {
  /* EVERY PACK INSTALL AND PACK UPGRADE COMES THROUGH `stageInstall`, not `install`, and the first form of this fix
     cancelled only in `install`: a pack version shipping `enabled: false` left the run showing `waiting` for its whole
     span, and only the check at the wake stopped it. */
  const { k, sql } = await record(rule(CHASED));
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  const staged = await k.stageInstall([rule({ ...CHASED, enabled: false })]);
  assert.ok(staged.ok, why(staged));
  value(staged.value() as never);
  assert.equal(runs(sql, 'chased')[0]?.state, 'cancelled', 'the staged install that switched the rule off left its run waiting');
  sql.close();
});

test('A PLAIN EDIT KEEPS THE RUN ON THE VERSION IT STARTED UNDER', async () => {
  /* WHAT MIGRATION 11 PROMISES, held beside the three cancellations above so that none of them is made by cancelling
     every run whose version is no longer the live one. */
  const { k, sql, clock } = await record(rule(CHASED));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  const edit = await k.install([rule({ ...CHASED, steps: [{ wait: '1h' }, { notify: { say: 'Edited {{what}}' } }] })]);
  assert.ok(edit.ok, why(edit));

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(runs(sql, 'chased')[0]?.state, 'done');
  assert.equal(k.get(made.id)?.fields.note, 'chased');
  assert.deepEqual(notes(sql, 'rule:chased'), ['Chased Rent']);
  sql.close();
});

test('AN ARRIVAL NOTHING VERIFIED STARTS NO AUTOMATION, so five forged posts do not spend the day', async () => {
  /* §5, `flow.mts unverified`. Five posts with a wrong token each started a run and wrote the sender's text into a
     note, and the owner's real message that followed started nothing, because `runs_per_day` was spent. */
  const { k, sql } = await record(
    rule({ rule: 'heard', on: { arrival: { channel: 'webhook' } }, limits: { runs_per_day: 5 }, steps: [{ notify: { say: 'Arrived: {{trigger.body.msg}}' } }] }),
  );
  for (let i = 0; i < 5; i++)
    value(k.arrive({ channel: 'webhook', body: JSON.stringify({ msg: `forged ${i}` }), sha256: `forged${i}`, verified: false }));
  value(k.arrive({ channel: 'webhook', body: JSON.stringify({ msg: 'real' }), sha256: 'real', verified: true }));
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:heard'), ['Arrived: real'], 'an unverified arrival started a run');
  assert.equal(runs(sql, 'heard').length, 1);
  sql.close();
});

test('A RULE THAT ASKS FOR unverified: true HEARS THE ARRIVALS NOTHING VERIFIED, and the lint reads the word', async () => {
  const { k, sql } = await record(
    rule({ rule: 'bad_tokens', on: { arrival: { channel: 'webhook', unverified: true } }, steps: [{ notify: { say: 'Bad token: {{trigger.verified}}' } }] }),
  );
  value(k.arrive({ channel: 'webhook', body: 'hello', sha256: 'u1', verified: false }));
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:bad_tokens'), ['Bad token: false']);

  const wrong = await k.install([rule({ rule: 'odd', on: { arrival: { unverified: 'yes' } }, steps: [{ notify: { say: 'x' } }] })]);
  const refusal = (wrong as { refusal?: { code: string; at?: string } }).refusal;
  assert.deepEqual([refusal?.code, refusal?.at], ['DECLARATION_INVALID', 'on.arrival.unverified']);
  sql.close();
});
