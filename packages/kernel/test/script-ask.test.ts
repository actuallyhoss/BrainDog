/**
 * A scheduled script may end its run by asking one question (F61's run half).
 *
 * THE QUESTION IS A REQUEST, AS A WRITE IS. A script hands back `{ ask }` beside its writes, and `finishScript` checks
 * every change an answer would make against the declaration's own `writes:` before anything is written, then files one
 * `options` question through the gate with the script's cause. A second run asking the same joins the open one, so a
 * daily script that finds the same month ends every morning asks once. The sandbox here is a stand-in value, which is
 * the point: nothing below depends on what ran the script, only on what came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { ack, enqueue, lease, type AckDeps } from '../src/outbox.ts';
import { ABOUT_BYTES, aboutOf, finishScript, prepareScript, type ScriptAnswer, type ScriptRunDeps, type Scripted } from '../src/script-run.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 6);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const USAGE = { fetches: 0, bytes: 0, wall_ms: 12, cpu_ms: 2 };

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'day', type: 'text' },
    ],
  } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const MONTH_END: Declaration = {
  id: 'script.month-end',
  kind: 'script',
  body: { script: 'month-end', runs: { every: '1d' }, egress: [], keys: [], reads: ['bills'], writes: ['bills'], source: 'export default async function run(ctx) {}' } as never,
};

type Rig = { k: Kernel; sql: NodeSql; deps: ScriptRunDeps };

async function record(): Promise<Rig> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([BILLS, NOTES, MONTH_END]);
  assert.ok(out.ok, fixOf(out));
  for (const what of ['Rent', 'Salary']) assert.ok(k.write('bills', null, { what } as never, { actor: 'p_1' }).ok);
  assert.ok(k.write('notes', null, { what: 'Pay day' } as never, { actor: 'p_1' }).ok);
  let n = 0;
  const mint = () => `01KSCR1PTASK0000000000${(++n).toString(36).toUpperCase().padStart(4, '0')}`;
  const ackDeps: AckDeps = { mint, allocate: () => 1, nowMs: NOW, recordId: ID };
  const deps: ScriptRunDeps = {
    sql,
    recordId: ID,
    nowMs: NOW,
    mint,
    tz: 'UTC',
    ack: (a) => ack(sql, ackDeps, a),
    notify: () => {},
    transaction: k.transaction,
    write: (register, ref, patch, w) => k.write(register, ref, patch as never, w),
    registerOf: (spoken) => k.get(spoken)?.register ?? null,
    /* AS kernel-index-47 WIRES IT in `scriptRunDeps`: the gate's own propose, signed as the run. */
    propose: (p, actor) => k.propose(p, actor),
  };
  return { k, sql, deps };
}

function prepared(r: Rig): Scripted {
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'month-end', version: 1, input: null });
  const [job] = lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], 1);
  assert.ok(job, 'a queued run is leased');
  const got = prepareScript(r.deps, job);
  assert.ok('scripted' in got, `the run was prepared, not ${JSON.stringify(got)}`);
  return got;
}

/** The ask `last-day.js` returns, in its own words: `{ id, version, fields }` changes under each label. */
function ask(r: Rig, at: string[] = ['bills#1', 'bills#2']) {
  const changes = (day: (i: number) => string) => at.map((id, i) => ({ id, version: r.k.get(id)!.version, fields: { day: day(i) } }));
  return {
    cause: 'month-end.last-day',
    question: '2 bills fall on the last day of their month. Is each the last day, or that date?',
    about: ['Rent, 30 September', 'Salary, 30 September'],
    options: [
      { label: 'The last day', patches: changes(() => 'last') },
      { label: 'That date', patches: changes(() => '30') },
    ],
  };
}

const run = (r: Rig, a: unknown, writes: ScriptAnswer = { writes: [], log: '', usage: USAGE }) => finishScript(r.deps, prepared(r), { ...writes, ask: a } as ScriptAnswer);
/* EVERY OPEN QUESTION, the agents' shelf with Needs you: where a script's question waits is not what these test. */
const open = (r: Rig) => (r.k.governance('suggestion', { status: 'open', apart: 'with' }) as { ok: true; value: Record<string, unknown>[] }).value;
const lastRun = (sql: NodeSql) =>
  JSON.parse(
    sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'pull' AND target = 'declaration:script.month-end' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1")!.to_v,
  ) as { outcome: string; log?: string };
const noteOf = (sql: NodeSql) => sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:script.month-end' ORDER BY rowid DESC LIMIT 1")!.note;

test('AN ASK WHOSE ANSWER WOULD CHANGE A LIST OUTSIDE `writes` FILES NOTHING, writes nothing beside it, and the log says why', async () => {
  const r = await record();
  const bad = ask(r);
  bad.options[1]!.patches.push({ id: 'notes#1', version: r.k.get('notes#1')!.version, fields: { day: '30' } });
  const metered = run(r, bad, { writes: [{ op: 'create', register: 'bills', fields: { what: 'Water' } }], log: '', usage: USAGE });
  assert.equal(metered.outcome, 'refused');
  assert.deepEqual(open(r), [], 'no question was filed');
  assert.equal(r.k.get('bills#3'), null, 'and the write beside it did not land');
  const said = lastRun(r.sql);
  assert.match(said.log ?? '', /answer "That date" would change notes#1 in notes, and it may write only to bills\./u);
  assert.match(noteOf(r.sql), /asked nothing/u);
  assert.doesNotMatch(noteOf(r.sql), /—/u, 'no em dash in what a person reads');
});

test('A CHANGE WITH NO VERSION IT READ, OR NOT A CHANGE AT ALL, FILES NOTHING', async () => {
  const r = await record();
  const stale = ask(r);
  (stale.options[0]!.patches[0] as { version: unknown }).version = Number.NaN;
  assert.equal(run(r, stale).outcome, 'refused');
  assert.match(lastRun(r.sql).log ?? '', /without the version it read/u);
  assert.equal(run(r, { question: 'Which?' }).outcome, 'refused');
  assert.deepEqual(open(r), []);
});

test('A GOOD ASK FILES ONE OPTIONS QUESTION with its cause, each answer in the gate’s words, and the run says so', async () => {
  const r = await record();
  const metered = run(r, ask(r), { writes: [{ op: 'create', register: 'bills', fields: { what: 'Water' } }], log: '', usage: USAGE });
  assert.equal(metered.outcome, 'ok');
  assert.ok(r.k.get('bills#3'), 'its writes landed with the question');
  const [q, ...rest] = open(r);
  assert.equal(rest.length, 0);
  assert.equal(q!.cause, 'month-end.last-day');
  assert.equal(q!.body_kind, 'options');
  assert.equal(q!.opened_by, 'script:month-end@v1');
  const body = q!.body as { about: string; options: { id: string; label: string; because: string; patches: { at: string; version: number; patch: unknown }[] }[] };
  assert.equal(body.about, 'Rent, 30 September; Salary, 30 September');
  assert.deepEqual(
    body.options.map((o) => [o.id, o.label, o.because]),
    [
      ['the-last-day', 'The last day', 'The last day'],
      ['that-date', 'That date', 'That date'],
    ],
  );
  assert.deepEqual(body.options[1]!.patches[0], { at: 'bills#1', version: r.k.get('bills#1')!.version, patch: { day: '30' } });
  assert.match(noteOf(r.sql), /wrote one line\. It asked one question, which waits on Decide\./u);
});

test('ASKED TWICE IS ASKED ONCE: the second run with the same cause joins the open question', async () => {
  const r = await record();
  assert.equal(run(r, ask(r)).outcome, 'ok');
  assert.equal(run(r, ask(r)).outcome, 'ok');
  assert.equal(open(r).length, 1, 'one question, not one a run');
  assert.match(noteOf(r.sql), /already waiting on Decide, so it asked nothing new/u);
});

test('ANSWERED ALREADY IS NOT ASKED AGAIN, and the run line does not call it a new question', async () => {
  const r = await record();
  assert.equal(run(r, ask(r)).outcome, 'ok');
  const [q] = open(r);
  assert.ok(r.k.decide(q!.id as string, { resolved_as: 'wont-fix', reason: 'Leave them.' }, 'p_1').ok);
  assert.equal(run(r, ask(r)).outcome, 'ok');
  assert.deepEqual(open(r), [], 'nothing new was filed');
  assert.match(noteOf(r.sql), /answered on Decide before, so it asked nothing new/u);
  assert.doesNotMatch(noteOf(r.sql), /It asked one question/u);
});

test('NO ASK, OR AN ASK OF NULL, FILES NOTHING AND REFUSES NOTHING; A HOST WITH NO PROPOSE SAYS NOBODY WAS ASKED', async () => {
  const r = await record();
  assert.equal(run(r, null).outcome, 'ok');
  assert.equal(finishScript(r.deps, prepared(r), { writes: [], log: '', usage: USAGE }).outcome, 'ok');
  assert.deepEqual(open(r), []);
  const { propose: _, ...without } = r.deps;
  assert.equal(finishScript(without, prepared(r), { writes: [], log: '', usage: USAGE, ask: ask(r) }).outcome, 'ok');
  assert.deepEqual(open(r), []);
  assert.match(noteOf(r.sql), /nobody was shown/u);
});

test('A LONG LIST OF NAMES IS JOINED INTO ONE ABOUT that fits, the rest counted, and the gate takes it', async () => {
  const names = Array.from({ length: 12 }, (_, i) => `Repeating line ${i + 1}, 30 September`);
  const about = aboutOf(names)!;
  assert.ok(new TextEncoder().encode(about).length <= ABOUT_BYTES, about);
  assert.match(about, /^Repeating line 1, 30 September; Repeating line 2, 30 September and 10 more$/u);
  /* RED WHEN govern.ts's OWN CAP DRIFTS BELOW THIS FILE'S COPY: the gate refuses the about and the run with it. */
  const r = await record();
  assert.equal(run(r, { ...ask(r), about: names }).outcome, 'ok', lastRun(r.sql).log);
  assert.equal((open(r)[0]!.body as { about: string }).about, about);
  assert.equal(aboutOf('Box'), 'Box');
  assert.equal(aboutOf([' ', 7]), undefined);
  const one = aboutOf(['x'.repeat(200), 'y']);
  assert.ok(new TextEncoder().encode(one!).length <= ABOUT_BYTES && one!.endsWith(' and 1 more'), one);
});
