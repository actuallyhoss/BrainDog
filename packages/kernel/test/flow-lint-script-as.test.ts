/**
 * A `script` step's `as:` is optional, as a `call` step's is, because nothing in the run needs it.
 *
 * WHAT WAS MEASURED BEFORE THE LINT CHANGED, on 24 September. `validateDeclaration` refused `{ script: { id: 'tidy' } }`
 * with "steps[0].script.as is undefined, and an answer's name is lower-case letters, digits and underscores": the
 * `script` case in `flow-lint.ts` called `named(spec.as, ...)` with no `undefined` escape, where `call` had one. The
 * runner never needed it. `startScript` queues the job and the step writes `vars[as]` only when `as` is a string
 * (`flow.ts`), and what lands there is the queued job's id, which no step in a rule has yet been measured reading.
 * So the record demanded a name for a value almost nobody reads, and the canvas had to demand it too, in a sentence
 * apologising for the record. The first test failed on that refusal; the second is the proof the lint was the only
 * thing in the way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const ITEMS: Declaration = {
  id: 'register.items',
  kind: 'register',
  body: {
    id: 'items',
    name: 'Items',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const TIDY: Declaration = {
  id: 'script.tidy',
  kind: 'script',
  body: { script: 'tidy', runs: { rule: true }, egress: [], keys: [], reads: ['items'], writes: ['items'], source: 'export default async function run(ctx) {}' } as never,
};

const rule = (step: Record<string, unknown>): Declaration => ({
  id: 'rule.tidy_on_done',
  kind: 'rule',
  body: { rule: 'tidy_on_done', on: { written: { register: 'items', op: ['update'], fields: ['state'] } }, steps: [{ if: 'state is done', then: [step] }] } as never,
});

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([ITEMS, ...decls]);
  assert.ok(out.ok, fixOf(out));
  return { k, sql };
}

test('THE LINT LETS A SCRIPT STEP THROUGH WITH NO as:, and still refuses a bad one', () => {
  const one = (script: Record<string, unknown>) => validateDeclaration(rule({ script }))?.code ?? null;
  assert.equal(one({ id: 'tidy' }), null);
  assert.equal(one({ id: 'tidy', as: 'job' }), null);
  /* AN EMPTY STRING IS NOT ABSENCE. The canvas drops an emptied optional box rather than writing '' (`Inspector.svelte`,
     `write`), so '' reaching the record is a hand-written mistake and is still told so, as `call.as: ''` is. */
  assert.equal(one({ id: 'tidy', as: '' }), 'DECLARATION_INVALID');
  assert.equal(one({ id: 'tidy', as: 'Job' }), 'DECLARATION_INVALID');
  assert.equal(one({ id: 'tidy', as: 'vars' }), 'DECLARATION_INVALID');
});

test('A SCRIPT STEP WITH NO as: RUNS: one job is queued, the run finishes, and nothing lands in its vars', async () => {
  const { k, sql } = await record(TIDY, rule({ script: { id: 'tidy' } }));
  const made = k.create('items', { what: 'Ship it' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  const moved = k.update('items', made.value.id, { state: 'done' }, { actor: 'p_1' });
  assert.ok(moved.ok, fixOf(moved));
  await k.drain();

  const runs = sql.all<{ state: string; say: string | null; vars: string }>("SELECT state, say, vars FROM automation_run WHERE rule = 'tidy_on_done'");
  assert.deepEqual(
    runs.map((r) => [r.state, r.say]),
    [['done', null]],
  );
  assert.deepEqual(JSON.parse(runs[0]!.vars), {});
  const jobs = sql.all<{ id: string }>("SELECT id FROM outbox WHERE kind = 'script.run'");
  assert.equal(jobs.length, 1);
  const step = sql.one<{ state: string; answer: string }>("SELECT state, answer FROM automation_step WHERE kind = 'script'");
  assert.deepEqual({ ...step }, { state: 'done', answer: jobs[0]!.id }, 'the step row still records the job it queued');
  sql.close();
});
