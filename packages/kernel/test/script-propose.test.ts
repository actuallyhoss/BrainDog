/**
 * A script's `ctx.propose`, on the record's side: tried against the gate as it is asked, and filed with the run.
 *
 * TRIED, THEN FILED. `tryProposal` puts each proposal to the gate's own `propose` in a savepoint that is always taken
 * back, so the script hears the gate's words and nothing is filed; the host hands what was queued back beside the run's
 * writes, and `finishScript` checks it again and files it in the run's savepoint. A host is code the record does not
 * control, so what it hands back is checked here as a write is: a list outside `writes:`, a kind a script may not file,
 * or more than `PROPOSALS_PER_RUN`, and the whole run is refused. The sandbox is a stand-in value, as in
 * `script-ask.test.ts`; the real host's path is `apps/selfhost/test/script-propose.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { ack, enqueue, lease, type AckDeps } from '../src/outbox.ts';
import { PROPOSALS_PER_RUN, finishScript, prepareScript, tryProposal, type ScriptAnswer, type ScriptRunDeps, type Scripted } from '../src/script-run.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 6);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const USAGE = { fetches: 0, bytes: 0, wall_ms: 12, cpu_ms: 2 };
const ACTOR = 'script:offer@v1';

const list = (id: string, name: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'draft', type: 'bool', default: false }] } as never,
});

const OFFER: Declaration = {
  id: 'script.offer',
  kind: 'script',
  body: { script: 'offer', runs: { every: '1d' }, egress: [], keys: [], reads: ['numbers'], writes: ['numbers'], source: 'export default async function run(ctx) {}' } as never,
};

type Rig = { k: Kernel; sql: NodeSql; deps: ScriptRunDeps };

async function record(): Promise<Rig> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([list('numbers', 'Key numbers'), list('notes', 'Notes'), OFFER]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.write('notes', null, { what: 'Pay day' } as never, { actor: 'p_1' }).ok);
  let n = 0;
  const mint = () => `01KSCR1PTPROP000000000${(++n).toString(36).toUpperCase().padStart(4, '0')}`;
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
    propose: (p, actor) => k.propose(p, actor),
  };
  return { k, sql, deps };
}

function prepared(r: Rig): Scripted {
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'offer', version: 1, input: null });
  const [job] = lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], 1);
  assert.ok(job, 'a queued run is leased');
  const got = prepareScript(r.deps, job);
  assert.ok('scripted' in got, `the run was prepared, not ${JSON.stringify(got)}`);
  return got;
}

const rowset = (register: string, what: string, cause = `offer:${what.replaceAll(' ', '-')}`) => ({ question: `Keep ${what}?`, body_kind: 'rowset', body: { register, rows: [{ what, draft: true }] }, cause });
const run = (r: Rig, proposals: unknown, writes: ScriptAnswer = { writes: [], log: '', usage: USAGE }) => finishScript(r.deps, prepared(r), { ...writes, proposals } as ScriptAnswer);
/* EVERY OPEN QUESTION, the agents' shelf with Needs you: where a script's question waits is not what these test. */
const open = (r: Rig) => (r.k.governance('suggestion', { status: 'open', apart: 'with' }) as { ok: true; value: Record<string, unknown>[] }).value;
const lastRun = (sql: NodeSql) =>
  JSON.parse(sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'pull' AND target = 'declaration:script.offer' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1")!.to_v) as { outcome: string; log?: string };
const noteOf = (sql: NodeSql) => sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:script.offer' ORDER BY rowid DESC LIMIT 1")!.note;
const WRITE: ScriptAnswer = { writes: [{ op: 'create', register: 'numbers', fields: { what: 'Revenue' } }], log: '', usage: USAGE };

test('TRIED, NOT FILED: the script hears the gate, nothing waits, and a cause already waiting answers joined with its question', async () => {
  const r = await record();
  const trial = (p: unknown) => tryProposal(r.deps, { script: 'offer', actor: ACTOR, writes: ['numbers'] }, p);
  const first = trial(rowset('numbers', 'Players'));
  assert.ok(first.ok, fixOf(first));
  assert.deepEqual(first.value.said, { queued: true });
  assert.equal(first.value.queued?.body_kind, 'rowset');
  assert.deepEqual(open(r), [], 'a trial files nothing');

  assert.equal(run(r, [first.value.queued]).outcome, 'ok');
  const [q] = open(r);
  assert.equal(q!.opened_by, ACTOR);
  const again = trial(rowset('numbers', 'Players'));
  assert.ok(again.ok);
  assert.deepEqual(again.value, { said: { id: q!.id, joined: true }, queued: null });

  /* THE GATE'S OWN REFUSAL, IN ITS OWN SHAPE: a rowset with no rows. */
  const empty = trial({ question: 'Keep these?', body_kind: 'rowset', body: { register: 'numbers', rows: [] } });
  assert.equal(empty.ok, false);
  assert.equal('refusal' in empty && empty.refusal.at, 'body.rows');
});

test('A HOST THAT HANDS BACK A LIST OUTSIDE `writes`, OR A CHANGE, FILES NOTHING and takes the writes beside it back', async () => {
  const r = await record();
  for (const bad of [[rowset('notes', 'Rent')], [{ question: 'Install?', body_kind: 'change', body: { declaration_id: 'register.numbers', to: {} } }], 'not a list']) {
    const metered = run(r, bad, WRITE);
    assert.equal(metered.outcome, 'refused', JSON.stringify(bad));
  }
  assert.match(lastRun(r.sql).log ?? noteOf(r.sql), /not a list of questions/u);
  assert.deepEqual(open(r), []);
  assert.equal(r.k.count('numbers'), 0, 'the write beside it did not land');
});

test(`MORE THAN ${PROPOSALS_PER_RUN} HANDED BACK IS REFUSED WHOLE, and a proposal the gate refuses takes the run back`, async () => {
  const r = await record();
  const many = Array.from({ length: PROPOSALS_PER_RUN + 1 }, (_, i) => rowset('numbers', `Number ${i}`));
  assert.equal(run(r, many, WRITE).outcome, 'refused');
  assert.match(noteOf(r.sql), new RegExp(`${PROPOSALS_PER_RUN + 1} questions, and one run may file ${PROPOSALS_PER_RUN}`, 'u'));
  assert.equal(run(r, [rowset('numbers', 'Fine'), { question: 'Keep?', body_kind: 'rowset', body: { register: 'numbers', rows: [null] } }], WRITE).outcome, 'refused');
  assert.match(noteOf(r.sql), /refused question 2 of 2 it proposed/u);
  assert.deepEqual(open(r), [], 'the first was taken back with the second');
  assert.equal(r.k.count('numbers'), 0);
});

test('A GOOD RUN FILES ITS PROPOSALS WITH ITS WRITES, signed as the run, never applied, and the line says Decide', async () => {
  const r = await record();
  const metered = run(r, [rowset('numbers', 'Players'), rowset('numbers', 'Revenue a month')], WRITE);
  assert.equal(metered.outcome, 'ok', `${noteOf(r.sql)} ${lastRun(r.sql).log}`);
  assert.equal(r.k.count('numbers'), 1, 'its write landed, and no proposed row did');
  const asked = open(r);
  assert.deepEqual(asked.map((q) => q.cause).sort(), ['offer:Players', 'offer:Revenue-a-month']);
  assert.equal(asked.every((q) => q.opened_by === ACTOR && q.body_kind === 'rowset'), true);
  assert.match(noteOf(r.sql), /wrote one line\. 2 questions it proposed wait on Decide\./u);
  assert.doesNotMatch(noteOf(r.sql), /—/u, 'no em dash in what a person reads');
});
