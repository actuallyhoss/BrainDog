/**
 * Flow check, installed on a fresh record and run: every way an automation starts, the order rules run in, a dry run's
 * account of who takes a row, a rule naming a row nobody has made yet, a question nobody answers, and the limit on
 * rules starting rules.
 *
 * THE ADD-ON IS THE PROOF, NOT THE CORE. Nothing here declares a rule in code: each test opens a record of its own,
 * installs `flow-check.pack.json` through the record's own plan and install, as an owner would from a file, and then
 * does what a person does (adds a row, presses Run now, answers in Decide, lets the clock move) and reads back what
 * each automation wrote. A trigger that stops starting runs is a red line here and not a quiet night.
 *
 * ONE ASSERT A TEST, so one red names its rule. An assert the runner does not meet today stays as it is, marked
 * `todo` with the fault in one line: bending it to pass would make this file a description of the code, which it is
 * not meant to be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** 15 October 2026, noon UTC: a Thursday in the middle of a month of 31 days. */
const NOW = Date.UTC(2026, 9, 15, 12);
const MIN = 60_000;
const DAY = 86_400_000;
/** The record's zone, nine hours ahead of UTC and with no summer time, so a day in it and a day in UTC differ. */
const ZONE = 'Asia/Tokyo';

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const PACK_FILE = new URL('./flow-check.pack.json', import.meta.url);
const packDoc = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Bench = { api: Api; sql: NodeSql; clock: ReturnType<typeof fixedClock> };
type Row = { id: string; seq: number | null; fields: Record<string, unknown> };

/** A record nobody has used, in `ZONE`, with the add-on installed through its own plan and install. */
async function bench(): Promise<Bench> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  said(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-bench', name: 'The Bench', tz: ZONE, locale: 'en', owner: { id: 'p_1' } }));
  const doc = packDoc();
  const diff = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  return { api, sql, clock };
}

type Run = { id: string; state: string; trigger: string; say: string | null; depth: number };
const runsOf = (sql: NodeSql, rule: string): Run[] =>
  sql.all<Run>('SELECT id, state, trigger, say, depth FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', rule);
const kindOf = (run: Run): unknown => (JSON.parse(run.trigger) as { kind?: unknown }).kind;

const rows = (b: Bench, register: string): Row[] => said<{ rows: Row[] }>(b.api.kernel.list({ register, limit: 100 })).rows;
/** What the Notes list holds that an automation wrote when it started, in the order it was written. */
const startedBy = (b: Bench): string[] =>
  rows(b, 'flow_notes')
    .filter((r) => r.fields.kind === 'trigger')
    .map((r) => String(r.fields.what));
const add = (b: Bench, register: string, fields: Record<string, unknown>): Row => said<Row>(b.api.kernel.create(register, fields, { actor: 'p_1' }));
/** The notes on one row's history, as its readers see them. */
const notesOn = (sql: NodeSql, entry: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND target = ? ORDER BY rowid", `entry:${entry}`).map((r) => r.note);

/** One automation's runs, and that it started each the way it says. */
const ranOnce = (sql: NodeSql, rule: string, kind: string): void => {
  const runs = runsOf(sql, rule);
  assert.equal(runs.length, 1, `rule.${rule} ran ${runs.length} times`);
  assert.equal(kindOf(runs[0]!), kind);
  assert.equal(runs[0]!.state, 'done', runs[0]!.say ?? '');
};

/* ── the file ─────────────────────────────────────────────────────────────────────────────────── */

test('THE FILE READS CLEAN AS AN ADD-ON, and says it is left out of every listing', async () => {
  const file = said<{ pack: { manifest: { pack: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(file.pack.manifest.pack, 'flow-check');
  assert.equal(packDoc().unlisted, true);
});

/* ── one automation for each way one starts (RQ-SHL-246, 248) ─────────────────────────────────── */

test('A WRITE STARTS ITS AUTOMATION ONCE, and the note it writes says a check was added', async () => {
  const b = await bench();
  add(b, 'flow_checks', { what: 'Smoke alarm' });
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_write', 'written');
  assert.deepEqual(startedBy(b), ['Started by a check added to Checks']);
  b.sql.close();
});

test('AN ARRIVAL AT THE DOOR STARTS ITS AUTOMATION ONCE, and its note names the door', async () => {
  const b = await bench();
  said(await b.api.arrive({ channel: 'webhook', ingest: 'flow_check_door', body: 'Check arrived: Front gate.', sha256: 'gate1', verified: true }));
  /* A SENDER RETRIES, and a retry of the same bytes is not a second arrival. */
  said(await b.api.arrive({ channel: 'webhook', ingest: 'flow_check_door', body: 'Check arrived: Front gate.', sha256: 'gate1', verified: true }));
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_arrival', 'arrival');
  assert.ok(startedBy(b).includes('Started by an arrival at the door'), startedBy(b).join(' | '));
  b.sql.close();
});

test('THE CLOCK STARTS ITS AUTOMATION ONCE IN 15 MINUTES, and its note names the clock', async () => {
  const b = await bench();
  b.clock.advance(14 * MIN);
  await b.api.kernel.drain();
  assert.equal(runsOf(b.sql, 'started_by_clock').length, 0, 'the clock turned before its 15 minutes');
  b.clock.advance(MIN);
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_clock', 'every');
  assert.deepEqual(startedBy(b), ['Started by the clock every 15 minutes']);
  b.sql.close();
});

test('A FIGURE CROSSING ITS LINE STARTS ITS AUTOMATION ONCE, and its note names the figure', async () => {
  const b = await bench();
  /* THE FIRST READING ONLY SETS THE SIDE: no check is late, so the figure is below its line. */
  b.api.kernel.purge();
  await b.api.kernel.drain();
  assert.equal(runsOf(b.sql, 'started_by_figure').length, 0, 'a first reading started a run');
  add(b, 'flow_checks', { what: 'Fire door', state: 'late' });
  b.api.kernel.purge();
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_figure', 'metric');
  assert.ok(startedBy(b).includes('Started by the late checks crossing their line'), startedBy(b).join(' | '));
  b.sql.close();
});

test('A DECISION IN DECIDE STARTS ITS AUTOMATION ONCE, and its note names the decision', async () => {
  const b = await bench();
  const check = add(b, 'flow_checks', { what: 'Back stairs', state: 'asked' });
  const asked = b.sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:ask_to_chase'");
  assert.ok(asked, 'the inline rule put no question in Decide');
  const body = JSON.parse(asked.body) as { about?: string; options: { id: string; label: string }[] };
  assert.equal(body.about, `flow_checks#${check.seq}`);
  const chase = body.options.find((o) => o.label === 'Chase it');
  assert.ok(chase, 'the question has no Chase it');
  said(b.api.kernel.decide(asked.id, { decide: { option: chase.id, reason: 'It is overdue.' } }, 'p_1'));
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_decision', 'decided');
  assert.ok(startedBy(b).includes('Started by a decision in Decide'), startedBy(b).join(' | '));
  b.sql.close();
});

test('RUN NOW STARTS ITS AUTOMATION ONCE, and its note names the button', async () => {
  const b = await bench();
  said(await b.api.automationRun({ rule: 'started_by_button' }, owner));
  await b.api.kernel.drain();
  ranOnce(b.sql, 'started_by_button', 'manual');
  assert.deepEqual(startedBy(b), ['Started by the Run now button']);
  b.sql.close();
});

/* ── the last day of each month (RQ-SHL-256) ──────────────────────────────────────────────────── */

test("A CLOCK ON THE LAST DAY OF THE MONTH IS NEXT DUE ON THE 31ST IN THE RECORD'S ZONE, which is the 30th in UTC", async () => {
  const b = await bench();
  const found = said<{ next: string | null }>(await b.api.automations({ rule: 'month_end' }, owner));
  assert.ok(found.next, 'the API answers no next time for the monthly clock');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(found.next));
  assert.equal(day, '2026-10-31');
  /* 06:00 ON THE 31ST IN TOKYO IS 21:00 ON THE 30TH IN UTC, so a clock that worked the day out in UTC is caught here. */
  assert.equal(found.next, '2026-10-30T21:00:00.000Z');
  b.sql.close();
});

/* ── the order rules run in, and what a dry run says of it (RQ-SHL-258, 260) ──────────────────── */

test('RULES OF EQUAL PRIORITY LEAVE THE VALUE OF THE LONGEST WORD, and a lower priority number comes before them all', async () => {
  const b = await bench();
  /* EACH CHECK IS MATCHED BY A DIFFERENT SET OF THE FOUR. `state is late` is the shortest condition (its longest word
     has 5 letters), `what contains roof` and `what contains guttering` are longer (8 and 9), and order_pinned has
     priority 50 against the others' 100. The first rule to set Ruling keeps it. */
  const urgent = add(b, 'flow_checks', { what: 'urgent guttering roof', state: 'late' });
  const gutter = add(b, 'flow_checks', { what: 'guttering roof', state: 'late' });
  const roof = add(b, 'flow_checks', { what: 'roof', state: 'late' });
  const door = add(b, 'flow_checks', { what: 'door', state: 'late' });
  const ruling = (r: Row): unknown => b.api.kernel.get(r.id)?.fields.ruling;
  assert.deepEqual([urgent, gutter, roof, door].map(ruling), ['pinned', 'longest', 'middle', 'brief']);
  b.sql.close();
});

test('A DRY RUN OF A FOURTH SAYS WHICH ROWS IT WINS, WHICH IT LOSES AND TO WHICH RULE, by name', async () => {
  const b = await bench();
  for (const [what, state] of [
    ['urgent guttering roof', 'late'],
    ['guttering roof', 'late'],
    ['roof', 'late'],
    ['door', 'late'],
    ['front door', 'open'],
  ] as const)
    add(b, 'flow_checks', { what, state });
  const candidate = { rule: 'order_candidate', register: 'flow_checks', priority: 200, when: 'what contains o', then: [{ set: { field: 'ruling', to: 'candidate' } }] };
  const dry = said<{ matches: number; won: number; lost: number; takenBy: Record<string, number> }>(await b.api.dryRun({ rule: candidate }, owner));
  assert.deepEqual([dry.matches, dry.won, dry.lost], [5, 1, 4]);
  /* THE RULES THAT TOOK THEM, by the names their cards say. */
  const listed = said<{ rule: string; name: string }[]>(await b.api.automations(undefined, owner));
  const nameOf = (rule: string): string => listed.find((a) => a.rule === rule)?.name ?? rule;
  assert.deepEqual(
    Object.fromEntries(Object.entries(dry.takenBy).map(([rule, n]) => [nameOf(rule), n])),
    {
      'A late urgent check is pinned': 1,
      'A late check about the guttering': 1,
      'A late check about the roof': 1,
      'A late check, said briefly': 1,
    },
  );
  b.sql.close();
});

/* ── a rule naming a row nobody has made yet (RQ-SHL-257) ─────────────────────────────────────── */

test('A RULE NAMING A PLACE NOBODY HAS MADE INSTALLS, and fires once that place is made and a check names it', async () => {
  /* IT INSTALLED: `bench` installs the whole file, `names_a_place` and its `place is Boiler room` among it, on a record
     with no note called Boiler room. */
  const b = await bench();
  assert.equal(rows(b, 'flow_notes').filter((r) => r.fields.what === 'Boiler room').length, 0);
  const elsewhere = add(b, 'flow_notes', { what: 'Loft', kind: 'place' });
  const boiler = add(b, 'flow_notes', { what: 'Boiler room', kind: 'place' });
  const pilot = add(b, 'flow_checks', { what: 'Pilot light', place: boiler.id });
  const hatch = add(b, 'flow_checks', { what: 'Loft hatch', place: elsewhere.id });
  assert.deepEqual([b.api.kernel.get(pilot.id)?.fields.seen, b.api.kernel.get(hatch.id)?.fields.seen ?? null], ['In the boiler room', null]);
  b.sql.close();
});

/* ── a question nobody answers (RQ-SHL-406) ───────────────────────────────────────────────────── */

test('AN UNANSWERED QUESTION WAITS ITS 15 MINUTES, and the run is still waiting a minute before', async () => {
  const b = await bench();
  said(await b.api.automationRun({ rule: 'ask_then_wait' }, owner));
  await b.api.kernel.drain();
  b.clock.advance(14 * MIN);
  await b.api.kernel.drain();
  assert.equal(runsOf(b.sql, 'ask_then_wait')[0]?.state, 'waiting');
  b.sql.close();
});

test(
  'AN UNANSWERED QUESTION TAKES ITS ELSE ARM AT THE NEXT SWEEP AFTER 15 MINUTES',
  { todo: 'an ask_person nobody answers fails the run at the end of its wait, so the if after it never reaches its else arm' },
  async () => {
    const b = await bench();
    said(await b.api.automationRun({ rule: 'ask_then_wait' }, owner));
    await b.api.kernel.drain();
    b.clock.advance(15 * MIN);
    await b.api.kernel.drain();
    const [run] = runsOf(b.sql, 'ask_then_wait');
    assert.equal(run?.state, 'done', run?.say ?? 'no run');
    assert.deepEqual(startedBy(b), ['Nobody answered the question in time']);
    b.sql.close();
  },
);

test(
  'AN UNANSWERED QUESTION SAYS WHY ITS RUN STOPPED IN WORDS, and names the question and not its id',
  { todo: "the stopped run's sentence quotes the question's suggestion id (asked SG1) where it should quote its words" },
  async () => {
    const b = await bench();
    said(await b.api.automationRun({ rule: 'ask_then_wait' }, owner));
    await b.api.kernel.drain();
    b.clock.advance(15 * MIN);
    await b.api.kernel.drain();
    const say = runsOf(b.sql, 'ask_then_wait')[0]?.say ?? '';
    assert.ok(say.includes('Chase the late checks?'), say);
    assert.doesNotMatch(say, /\bSG\d+\b/u);
    b.sql.close();
  },
);

test('A QUESTION WITH NO wait: WAITS SEVEN DAYS, as the API says it and as the run is parked', async () => {
  const b = await bench();
  const found = said<{ body: Record<string, unknown> }>(await b.api.automations({ rule: 'ask_and_wait_long' }, owner));
  const lines = said<{ steps: string[] }>(await b.api.dryRun({ rule: found.body }, owner)).steps;
  assert.ok(lines.some((l) => l.includes('If nobody answers within 7d')), lines.join('\n'));
  const { run } = said<{ run: string }>(await b.api.automationRun({ rule: 'ask_and_wait_long' }, owner));
  await b.api.kernel.drain();
  const wake = b.sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE key = ? AND state = 'pending'", `flow.run:${run}`);
  assert.equal(wake?.due_at, new Date(NOW + 7 * DAY).toISOString());
  b.sql.close();
});

/* ── rules starting rules (RQ-SHL-407) ────────────────────────────────────────────────────────── */

test('ONLY THE AUTOMATION THAT SAYS from_rules RUNS ON A ROW A RULE WROTE', async () => {
  const b = await bench();
  add(b, 'flow_notes', { what: 'Link one', kind: 'chain' });
  await b.api.kernel.drain();
  await b.api.kernel.drain();
  const ruleMade = (run: Run): boolean => run.depth > 0;
  assert.equal(runsOf(b.sql, 'chain_ignores').length, 1, 'the automation without from_rules ran on a row a rule wrote');
  assert.ok(runsOf(b.sql, 'chain_follows').some(ruleMade), 'the automation with from_rules never ran on a row a rule wrote');
  b.sql.close();
});

test('A CHAIN OF FIVE STOPS AT THREE: three runs started by rule-made rows, and the fourth row starts none', async () => {
  const b = await bench();
  add(b, 'flow_notes', { what: 'Link one', kind: 'chain' });
  for (let i = 0; i < 6; i++) await b.api.kernel.drain();
  const chain = rows(b, 'flow_notes')
    .filter((r) => r.fields.kind === 'chain')
    .sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0))
    .map((r) => String(r.fields.what));
  const started = runsOf(b.sql, 'chain_follows');
  assert.deepEqual(
    { rows: chain, runs: started.length, byRules: started.filter((r) => r.depth > 0).length },
    { rows: ['Link one', 'Link two', 'Link three', 'Link four', 'Link five'], runs: 4, byRules: 3 },
    started.map((r) => `${r.depth} ${r.state} ${r.say ?? ''}`).join('\n'),
  );
  b.sql.close();
});

/* ── a note after a set_var ───────────────────────────────────────────────────────────────────── */

test('A NOTE AFTER A set_var READS THE VALUE IT SET, on the row that started the run', async () => {
  const b = await bench();
  const check = add(b, 'flow_checks', { what: 'Meter reading', state: 'noted' });
  await b.api.kernel.drain();
  assert.deepEqual(notesOn(b.sql, check.id), ['Noted by the clerk']);
  b.sql.close();
});
