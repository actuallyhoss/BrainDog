/**
 * A verb only a step has, `if` first among them, is refused in a `then:` that runs inside the write.
 *
 * WHY. `pathOf` sends a body with `then:` and a plain write trigger to the inline pass, which has an arm for each of
 * the twelve actions and none for `if`: it walks `then` and acts on the first action each item carries. The lint walked
 * an `if`'s arms and never the verbs beside it, so `{ if, then: [], set: { to: 5 } }` installed and threw out of every
 * write to its list; and an `if` whose arm sets a field, installed, was listed as `inline`, and its arm never ran.
 *
 * MEASURED AGAIN after the `fill` guard. The first no longer throws, and so the `set` beside the `if` is acted on: the
 * Water row was written holding `note: "5"`, whatever the condition said. The second left the row holding `what` alone.
 * `wait: 1h` beside a `set` installed and the note was written at once, `set_var` and `ask_person` installed and did
 * nothing at all. Each is the same fault, a step the pass has no arm for, so each is refused here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] } as never,
};
const rule = (body: Record<string, unknown>): Declaration => ({ id: 'rule.m', kind: 'rule', body: { rule: 'm', ...body } as never });
const inline = (then: unknown[]) => rule({ register: 'jobs', once_per: ['entry'], then });

async function open(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const refused = async (then: unknown[]) => {
  const { k } = await open();
  const out = await k.install([JOBS, inline(then)]);
  assert.equal(out.ok, false, `installed: ${JSON.stringify(then)}`);
  return { code: codeOf(out), fix: fixOf(out) ?? '', at: (out as { refusal?: { at?: string } }).refusal?.at };
};

test('AN if WITH A set BESIDE IT IS REFUSED, rather than setting the field whatever the condition says', async () => {
  const r = await refused([{ if: 'what is x', then: [], set: { field: 'note', to: 5 } }]);
  assert.equal(r.code, 'NOT_IN_THIS_BUILD');
  assert.equal(r.at, 'then[0].if');
  assert.equal(
    r.fix,
    "rule.m's then[0] is if, and a rule that runs inside the write does not branch. Move then: into steps: and register: into on: { written: { register: jobs } }, where it runs as a run after the write.",
  );
});

test('AN if WHOSE ARM SETS A FIELD IS REFUSED, rather than installing a branch that never runs', async () => {
  const r = await refused([{ if: 'what is Water', then: [{ set: { field: 'note', to: 'seen' } }] }]);
  assert.equal(r.code, 'NOT_IN_THIS_BUILD');
  assert.equal(r.at, 'then[0].if');
});

test('EVERY OTHER VERB ONLY A STEP HAS IS REFUSED THE SAME WAY, named where it sits', async () => {
  for (const [then, at, verb] of [
    [[{ set: { field: 'note', to: 'seen' } }, { wait: '1h' }], 'then[1].wait', 'wait'],
    [[{ set_var: { name: 'a', to: 'b' } }], 'then[0].set_var', 'set_var'],
    [[{ ask_person: { question: 'Chase it?', options: ['yes', 'no'], as: 'chase' } }], 'then[0].ask_person', 'ask_person'],
  ] as const) {
    const r = await refused([...then]);
    assert.equal(r.code, 'NOT_IN_THIS_BUILD', JSON.stringify(then));
    assert.equal(r.at, at);
    assert.ok(r.fix.startsWith(`rule.m's ${at.slice(0, at.lastIndexOf('.'))} is ${verb}, and a rule that runs inside the write has no ${verb}.`), r.fix);
  }
});

test('THE SENTENCE\'S OWN ADVICE, TAKEN, installs as a run and its branch acts', async () => {
  /* A FIX THAT LED TO A SECOND BODY WHOSE BRANCH ALSO NEVER RAN would be the same defect one step later, so the run is
     driven and the row read: Water takes the arm, Rent does not. */
  const { k, sql } = await open();
  if (!sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) {
    const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
    sql.db.exec(ddl);
  }
  const out = await k.install([
    JOBS,
    rule({ on: { written: { register: 'jobs' } }, once_per: ['entry'], steps: [{ if: 'what is Water', then: [{ set: { field: 'note', to: 'seen' } }] }] }),
  ]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.create('jobs', { what: 'Water' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('jobs', { what: 'Rent' }, { actor: 'p_1' }).ok);
  await k.drain();
  const rows = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'jobs' ORDER BY seq").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  assert.deepEqual(rows, [{ what: 'Water', note: 'seen' }, { what: 'Rent' }]);
});

test('A then: OF ACTIONS ALONE STILL INSTALLS AND ACTS INSIDE THE WRITE', async () => {
  const { k, sql } = await open();
  assert.ok((await k.install([JOBS, inline([{ set: { field: 'note', to: 'seen' } }])])).ok);
  assert.ok(k.create('jobs', { what: 'Water' }, { actor: 'p_1' }).ok);
  const rows = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'jobs'").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  assert.deepEqual(rows, [{ what: 'Water', note: 'seen' }]);
});
