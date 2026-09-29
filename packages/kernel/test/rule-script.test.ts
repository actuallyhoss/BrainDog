/**
 * An automation's `script` step starts a script (`docs/07-INGEST-AND-RULES.md` §6.2, the step table).
 *
 * WHAT WAS MEASURED BEFORE THIS FILE. At `8a489d4c` neither way a rule could reach a script worked: `run:` names a
 * declared call and nothing else, and a `script` step installed and failed every run with "a step that waits on a
 * script is not in this build (NOT_IN_THIS_BUILD)". The first test below failed on that sentence. A script declared
 * `runs: { rule: true }` was read by the egress line that tells the owner about it and by nothing that starts one.
 *
 * THE STEP HANDS OFF AND DOES NOT WAIT. The record never runs a script (`script.ts`): the step queues ONE `script.run`
 * outbox row, exactly as a clock's fire does, and the host that leases it applies what the script wrote through
 * `finishScript`. What comes back does not resume the run, so the step is done when the row is queued, and `as:` holds
 * the id of the job it queued.
 *
 * NOTHING HERE IS ABOUT TASKS. The kernel is a shell: the lists below are a generic parent and child, and the cascade
 * the Work pack builds on this is the pack's own script.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
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
      { id: 'pin', type: 'secret' },
    ],
  } as never,
};

const script = (name: string, runs: Record<string, unknown>): Declaration => ({
  id: `script.${name}`,
  kind: 'script',
  body: { script: name, runs, egress: [], keys: [], reads: ['items'], writes: ['items'], source: 'export default async function run(ctx) {}' } as never,
});

/** A rule that starts `name` when an item moves to done. */
const onDone = (rule: string, name: string, extra: Record<string, unknown> = {}): Declaration => ({
  id: `rule.${rule}`,
  kind: 'rule',
  body: {
    rule,
    on: { written: { register: 'items', op: ['update'], fields: ['state'] } },
    steps: [{ if: 'state is done', then: [{ script: { id: name, as: 'queued', ...extra } }] }],
  } as never,
});

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([ITEMS, ...decls]);
  assert.ok(out.ok, fixOf(out));
  return { k, sql };
}

const item = (k: Kernel, fields: Record<string, unknown>): Entry => {
  const made = k.create('items', fields, { actor: 'p_1' });
  assert.ok(made.ok, why(made));
  return made.value;
};

const done = async (k: Kernel, row: Entry): Promise<void> => {
  const moved = k.update('items', row.id, { state: 'done' }, { actor: 'p_1' });
  assert.ok(moved.ok, why(moved));
  await k.drain();
};

type Run = { state: string; say: string | null };
const runs = (sql: NodeSql, rule: string): Run[] => sql.all<Run>('SELECT state, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', rule).map((r) => ({ ...r }));
const queued = (sql: NodeSql): { id: string; payload: { script: string; version: number; input: Record<string, unknown> } }[] =>
  sql
    .all<{ id: string; payload: string }>("SELECT id, payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid")
    .map((r) => ({ id: r.id, payload: JSON.parse(r.payload) }));

test('A SCRIPT STEP QUEUES ONE RUN OF THE SCRIPT, pinned to its version and handed the row, and the automation finishes', async () => {
  const { k, sql } = await record(script('close_children', { rule: true }), onDone('close_children', 'close_children', { input: { because: '{{trigger.row.what}}' } }));
  const parent = item(k, { what: 'Ship the specimen page' });
  await done(k, parent);

  assert.deepEqual(runs(sql, 'close_children'), [{ state: 'done', say: null }], 'the run stopped at the script step');
  const jobs = queued(sql);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0]!.payload, {
    script: 'close_children',
    version: 1,
    input: { id: parent.id, register: 'items', seq: parent.seq, because: 'Ship the specimen page' },
  });
  const step = sql.one<{ kind: string; state: string; answer: string }>("SELECT kind, state, answer FROM automation_step WHERE kind = 'script'");
  assert.deepEqual({ ...step }, { kind: 'script', state: 'done', answer: jobs[0]!.id }, 'as: names the job it queued');

  /* THE BRANCH STILL DECIDES. A write that leaves the item open queues nothing. */
  const other = item(k, { what: 'Proof it' });
  const edited = k.update('items', other.id, { what: 'Proof it twice' }, { actor: 'p_1' });
  assert.ok(edited.ok, why(edited));
  await k.drain();
  assert.equal(queued(sql).length, 1);
  sql.close();
});

test('A SCRIPT THAT DOES NOT SAY runs: { rule: true } IS NOT STARTED BY A RULE, and the run says so', async () => {
  const { k, sql } = await record(script('nightly', { every: '1d' }), onDone('nightly_on_done', 'nightly'));
  await done(k, item(k, { what: 'Ship it' }));
  const [run] = runs(sql, 'nightly_on_done');
  assert.equal(run?.state, 'failed');
  assert.match(run?.say ?? '', /script\.nightly does not say runs: \{ rule: true \}/);
  assert.equal(queued(sql).length, 0, 'the clock script was queued by a rule');
  sql.close();
});

/* WHAT THE FIRST ATTEMPT MISSED: `startScript` read the declaration and never the script's schedule row, so a script
   paused after three refused runs was queued again by the next write that fired the rule. The clock honours that row
   (`drainSchedule` fires only a pending one), and a rule is a second way in, so it reads the same row. The row is
   paused in SQL here because what pauses it is `pauseAfterRefusals` in `script-run.ts`, which `script-run.test.ts`
   measures; this file measures who honours it. */
test('A PAUSED SCRIPT IS NOT STARTED BY A RULE, the run says so, and once it is resumed a rule starts it again', async () => {
  const { k, sql } = await record(script('close_children', { rule: true }), onDone('close_children', 'close_children'));
  sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = 'script' AND key = 'close_children'");
  await done(k, item(k, { what: 'Ship the specimen page' }));
  const [run] = runs(sql, 'close_children');
  assert.equal(run?.state, 'failed');
  assert.match(run?.say ?? '', /script\.close_children is paused/);
  assert.equal(queued(sql).length, 0, 'a paused script was queued by a rule');

  const resumed = k.resumeScript('close_children', 'p_1');
  assert.ok(resumed.ok, why(resumed));
  await done(k, item(k, { what: 'Proof it' }));
  assert.equal(runs(sql, 'close_children')[1]?.state, 'done');
  assert.equal(queued(sql).length, 1, 'a resumed script was still refused to a rule');
  sql.close();
});

/* THE CLOCK'S OTHER GATE, "A RUN THAT HAS NOT FINISHED IS NOT QUEUED AGAIN" (`fireScript`), taken for a rule by what
   the run is handed and not by the script's name alone. A clock's runs all carry `input: null`, so one unfinished run
   is the same run; a rule's runs carry the row, and two parents done in the same minute are two runs. Keyed on the
   name, the second parent's follow-ups would never close. */
test('A ROW THAT FIRES THE RULE AGAIN BEFORE ITS RUN IS TAKEN QUEUES NOTHING MORE, and another row still queues its own', async () => {
  const { k, sql } = await record(script('close_children', { rule: true }), onDone('close_children', 'close_children'));
  const first = item(k, { what: 'Ship the specimen page' });
  await done(k, first);
  const reopened = k.update('items', first.id, { state: 'open' }, { actor: 'p_1' });
  assert.ok(reopened.ok, why(reopened));
  /* DRAINED BEFORE THE ROW IS DONE AGAIN: a run reads the row as it stands when it is taken, so the reopening's run
     left undrained reads `done` too and takes the step a third time, which is how this test first counted three. */
  await k.drain();
  await done(k, first);
  const [job] = queued(sql);
  assert.equal(queued(sql).length, 1, 'the same row queued a second run while its first was still pending');
  const answers = sql.all<{ answer: string }>("SELECT answer FROM automation_step WHERE kind = 'script' ORDER BY rowid").map((r) => r.answer);
  assert.deepEqual(answers, [job!.id, job!.id], 'as: on the second run names the job that will do the work');

  await done(k, item(k, { what: 'Proof it' }));
  assert.equal(queued(sql).length, 2, "a second row's run was taken for the first row's");
  sql.close();
});

test('A SCRIPT THAT IS NOT INSTALLED FAILS THE RUN WITH A SENTENCE NAMING IT, and nothing is queued', async () => {
  const { k, sql } = await record(onDone('missing', 'nobody'));
  await done(k, item(k, { what: 'Ship it' }));
  const [run] = runs(sql, 'missing');
  assert.equal(run?.state, 'failed');
  assert.match(run?.say ?? '', /there is no script called nobody/);
  assert.equal(queued(sql).length, 0);
  sql.close();
});

/* RETIRED IS THE SAME AS MISSING, and it is the gate a pack turned off meets too, since turning a pack off retires its
   scripts. Nothing held this before: with `AND retired = 0` taken out of `startScript`'s query, all seven tests above
   and below still passed, and a retired script would have been queued by the next write. */
test('A RETIRED SCRIPT IS NOT STARTED BY A RULE, and the run says there is no such script', async () => {
  const { k, sql } = await record(script('close_children', { rule: true }), onDone('close_children', 'close_children'));
  const retired = k.retire(['script.close_children'], { actor: 'p_1' });
  assert.ok(retired.ok, why(retired));
  await done(k, item(k, { what: 'Ship it' }));
  const [run] = runs(sql, 'close_children');
  assert.equal(run?.state, 'failed');
  assert.match(run?.say ?? '', /there is no script called close_children/);
  assert.equal(queued(sql).length, 0, 'a retired script was queued by a rule');
  sql.close();
});

test('THE JOB ID A SCRIPT STEP KEEPS UNDER as: IS NOT SEALED BY WHAT THE NAME HELD BEFORE', async () => {
  const { k, sql } = await record(script('stamp', { rule: true }), {
    id: 'rule.stamp',
    kind: 'rule',
    body: {
      rule: 'stamp',
      on: { written: { register: 'items', op: ['update'], fields: ['state'] } },
      steps: [
        { if: 'state is done', then: [{ set_var: { name: 'job', to: 'plain' } }, { script: { id: 'stamp', as: 'job' } }, { set: { field: 'what', to: 'queued {{vars.job}}' } }] },
      ],
    } as never,
  });
  /* THE NAME FIRST HOLDS A SECRET, written into the table past the lint as the test below does, so the only thing
     that can clear it is the script step writing the job id over it. */
  const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'rule.stamp' AND superseded_at IS NULL");
  const body = JSON.parse(row!.body) as { steps: [{ then: [{ set_var: { to: string } }] }] };
  body.steps[0].then[0].set_var.to = '{{trigger.row.pin}}';
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.stamp' AND superseded_at IS NULL", JSON.stringify(body));

  const made = item(k, { what: 'Ship it' });
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await done(k, made);
  const [run] = runs(sql, 'stamp');
  assert.deepEqual(run, { state: 'done', say: null }, 'the job id was read as the secret the name held before it');
  const [job] = queued(sql);
  assert.equal(k.get(made.id)?.fields.what, `queued ${job!.id}`);
  sql.close();
});

test('A SECRET FIELD NEVER RIDES IN A SCRIPT INPUT, even from a rule stored past the lint', async () => {
  const { k, sql } = await record(script('leaky', { rule: true }), onDone('leaky', 'leaky'));
  /* WRITTEN INTO THE TABLE, as the other second-line tests in this tree are: the lint refuses this body at install
     (`copyFault`), and the runner is what stands behind a rule an earlier build let in. */
  const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'rule.leaky' AND superseded_at IS NULL");
  const body = JSON.parse(row!.body) as { steps: [{ then: [{ script: Record<string, unknown> }] }] };
  body.steps[0].then[0].script.input = { pin: '{{trigger.row.pin}}' };
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.leaky' AND superseded_at IS NULL", JSON.stringify(body));

  /* A SECRET FIELD HOLDS A GRANT ID, so a value is put straight into the row, as `flow-waits.test.ts` does. */
  const made = item(k, { what: 'Ship it' });
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await done(k, made);
  const [run] = runs(sql, 'leaky');
  assert.equal(run?.state, 'failed');
  assert.match(run?.say ?? '', /\{\{trigger\.row\.pin\}\}/);
  assert.doesNotMatch(run?.say ?? '', /hunter2/);
  assert.equal(queued(sql).length, 0);
  sql.close();
});
