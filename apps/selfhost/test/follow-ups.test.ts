/**
 * Follow-ups close with their parent, and start in its project, on a real self-host with the Work pack installed.
 *
 * A RULE ON THE PARENT THAT RUNS A SCRIPT is the route: `when: state is done`, `then: [{ run: <script> }]`, and a script
 * that lists the parent's children and queues an `update` for each. There are two ways a rule could reach a script,
 * and only one composes:
 *
 *   1. A RULE'S `run:` NAMES A CALL AND NOTHING ELSE. `flow-lint.ts`'s `callFault` looks the name up as `ingest.<name>`,
 *      so a `script.close_children` with `runs: { rule: true }` beside it is not found, and the install is refused:
 *      `DECLARATION_UNKNOWN: rule.close_children runs close_children, and there is no action called close_children.`
 *      The kernel's `queueCall` would refuse it again at run time, since it asks for `channel: call`. `runs: { rule:
 *      true }` on a script is read by the egress line that tells the owner about it, and by nothing that starts one.
 *   2. AN AUTOMATION'S `script` STEP. `on: { written: { register: tasks } }` with the step under `if: state is done`
 *      is accepted and a run starts on every write. Before the step was built, `flow.ts` failed it at the step:
 *      `rule.close_children reached a script step, and a step that waits on a script is not in this build
 *      (NOT_IN_THIS_BUILD). The steps before it were taken.`
 *
 * THE SECOND WAY IS THE ONE THE DOCUMENTS DRAW, AND IT IS BUILT. `docs/07-INGEST-AND-RULES.md` §6.2 gives a step
 * `{ script: { id, input, as } }`, so `flow.ts` queues the script's run for a script that says `runs: { rule: true }`
 * (`startScript`, and `packages/kernel/test/rule-script.test.ts`) instead of failing the run. The first test below
 * holds the step to composing end to end, and still pins the first way, which is not built: `run:` names a call and
 * nothing else.
 *
 * WORK 1.8.0 DECLARES THE CASCADE, two rules and two scripts (`WORK_AUTOMATIONS` in `packages/seed/src/modules/work.ts`).
 * Before the pack declared anything the second test failed at its first assertion, a follow-up created with a parent
 * and no project: `thing` was `undefined` where the parent's project was expected. It is the spec.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Entry } from '@braindog/kernel';
import { firstPartyDocument } from '@braindog/seed';

import type { Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The script the cascade runs: every open, doing or blocked child of the row it was started for, moved to done. */
const CLOSES = `export default async function run(ctx) {
  const parent = ctx.input;
  const children = await ctx.record.list('tasks', { all: [{ field: 'parent', is: parent.id }, { field: 'state', in: ['open', 'doing', 'blocked'] }] });
  for (const c of children) ctx.update('tasks#' + c.seq, { state: 'done' }, c.version);
}`;

const SCRIPT = {
  id: 'script.close_children',
  kind: 'script',
  body: { script: 'close_children', runs: { rule: true }, egress: [], keys: [], reads: ['tasks'], writes: ['tasks'], source: CLOSES },
};

/** The lists each first-party pack named here brings, so a link field to a list the record holds is kept. */
const LISTS: Record<string, string[]> = { portfolio: ['things'], work: ['tasks', 'tracks', 'updates'] };

/** A self-host with a record, its owner, and the first-party packs named, installed as an owner installs them. */
async function selfhost(packs: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-follow-ups-'));
  const send: Send = async () => new Response('{}');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send, resolve: async () => [] },
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  said(await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } }));
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };
  for (const id of packs) {
    const doc = firstPartyDocument(id, { seeds: [], holds: packs.flatMap((p) => LISTS[p] ?? []) });
    const planned = said<{ diff: { planHash: string; approve: string[] } }>(await running.api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await running.api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  const k = running.api.kernel;
  const as = { actor: person.value.id };
  return {
    running,
    k,
    as,
    task: (fields: Record<string, unknown>) => said<Entry>(k.create('tasks', fields, as)),
    move: async (row: Entry, state: string) => said<Entry>(await running.api.update({ register: 'tasks', seq: row.seq!, patch: { state } }, owner)),
    /* THE SCHEDULE AND THEN THE OUTBOX, which is how a run started by a write reaches its steps and a script its sandbox. */
    settle: async () => {
      await running.drain();
      await running.poll();
    },
    stateOf: (row: Entry) => k.get(row.id)?.fields.state,
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('A SCRIPT STEP STARTS A SCRIPT ON A SELF-HOST AND ITS WRITES LAND, and `run:` still names a call and nothing else', async () => {
  const s = await selfhost(['work']);
  try {
    /* ROUTE ONE: `run:` NAMES A DECLARED CALL, and a script is not one. Nobody built this way, and the pin stays. */
    const inline = await s.k.install([
      { id: 'rule.close_children', kind: 'rule', body: { rule: 'close_children', register: 'tasks', when: 'state is done', once_per: ['id'], then: [{ run: 'close_children' }] } },
      SCRIPT,
    ] as never);
    assert.equal(inline.ok, false, 'a rule may now run: a script, so say which way the documents keep and retire the other');
    assert.match(JSON.stringify(inline), /DECLARATION_UNKNOWN/);
    assert.match(JSON.stringify(inline), /there is no action called close_children/);

    /* ROUTE TWO: AN AUTOMATION'S `script` STEP INSTALLS, THE RUN QUEUES THE SCRIPT, AND THE HOST RUNS IT. This is the
       test's own script and rule, installed beside the pack's, so what is measured is the step and not the pack. */
    said(
      await s.k.install([
        {
          id: 'rule.close_children',
          kind: 'rule',
          body: { rule: 'close_children', on: { written: { register: 'tasks', fields: ['state'] } }, steps: [{ if: 'state is done', then: [{ script: { id: 'close_children', as: 'closed' } }] }] },
        },
        SCRIPT,
      ] as never),
    );
    const other = s.task({ what: 'Write the launch note' });
    const follow = s.task({ what: 'Send the launch note', parent: other.id });
    await s.move(other, 'done');
    await s.settle();
    /* TWICE, BECAUSE THE SCRIPT'S OWN WRITE STARTS A RUN. The held rule filters no `op:`, and a write made by a script is
       not a rule's write, so moving the follow-up to done starts one more run, taken by the next drain. */
    await s.settle();
    const runs = s.running.sql.all<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'close_children'");
    assert.ok(runs.length > 0, 'the automation started no run');
    for (const r of runs) assert.deepEqual({ ...r }, { state: 'done', say: null }, 'a run of the automation stopped at its script step');
    const jobs = s.running.sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = 'close_children'");
    assert.ok(jobs.length > 0, 'the step queued no run of the script');
    assert.deepEqual(
      jobs.map((j) => j.state),
      jobs.map(() => 'done'),
      'a queued run of the script was not taken by the host',
    );
    assert.equal(s.stateOf(follow), 'done');
  } finally {
    await s.close();
  }
});

test(
  'FOLLOW-UPS CLOSE WITH THEIR PARENT AND START IN ITS PROJECT, from the Work pack alone',
  async () => {
    const s = await selfhost(['portfolio', 'work']);
    try {
      const kiln = said<Entry>(s.k.create('things', { name: 'Kiln', lane: 'earning' }, s.as));
      const thread = said<Entry>(s.k.create('tracks', { name: 'Specimen page', state: 'open', thing: kiln.id }, s.as));
      const parent = s.task({ what: 'Ship the specimen page', thing: kiln.id, track: thread.id });

      /* A NEW FOLLOW-UP WITH A PARENT AND NO PROJECT STARTS IN THE PARENT'S PROJECT AND THREAD. One level, as `parent` holds. */
      const open = s.task({ what: 'Proof it', parent: parent.id });
      await s.settle();
      assert.equal(s.k.get(open.id)?.fields.thing, kiln.id);
      assert.equal(s.k.get(open.id)?.fields.track, thread.id);

      const doing = s.task({ what: 'Set the grid', parent: parent.id, state: 'doing' });
      const blocked = s.task({ what: 'Licence the photos', parent: parent.id, state: 'blocked' });
      const dropped = s.task({ what: 'Old idea', parent: parent.id, state: 'dropped' });

      /* DONE CLOSES OPEN, DOING AND BLOCKED, with a note naming the parent. A dropped child is left alone. */
      await s.move(parent, 'done');
      await s.settle();
      for (const c of [open, doing, blocked]) assert.equal(s.stateOf(c), 'done', String(c.fields.what));
      for (const c of [open, doing, blocked]) assert.match(String(s.k.get(c.id)?.fields.note), new RegExp(`Closed with Ship the specimen page \\(tasks#${parent.seq}\\)\\.$`, 'u'));
      assert.equal(s.stateOf(dropped), 'dropped');

      /* REOPENING THE PARENT BRINGS NOTHING BACK. */
      await s.move(s.k.get(parent.id)!, 'open');
      await s.settle();
      assert.equal(s.stateOf(open), 'done');
    } finally {
      await s.close();
    }
  },
);

/* THE DRY RUN MUST NOT CALL THE STEP UNBUILT: with the runner taking the step, the dry run the owner and an agent read
   before installing still ended it with "Not in this build: a run stops here, after the steps before it", because
   `WAITS_ON_OTHERS` and the step's line in `packages/record/src/automations.ts` still named `script`. Measured here
   against that line: the step read `Run script.close_follow_ups, and keep its answer as closing. Not in this build...`
   on the record where the same rule, a moment later, ran to `done` and closed the follow-up. */
test("THE DRY RUN OF WORK'S RULE SAYS WHAT THE RUN DOES: it starts the script and goes on, and the run then does exactly that", async () => {
  const s = await selfhost(['work']);
  try {
    const work = firstPartyDocument('work') as { declarations: Record<string, unknown>[] };
    const rule = work.declarations.find((d) => d.rule === 'close_follow_ups');
    assert.ok(rule, 'the Work pack no longer declares rule.close_follow_ups');
    const owner = { principal: { kind: 'person' as const, id: s.as.actor, level: 'owner' as const } };
    const told = said<{ steps: string[] }>(await s.running.api.dryRun({ rule: rule as never }, owner));
    assert.equal(told.steps.length, 1);
    assert.doesNotMatch(told.steps[0]!, /Not in this build/u, told.steps[0]);
    assert.match(told.steps[0]!, /^Start script\.close_follow_ups, keep the id of its queued run as closing, and go on without waiting for it/u);

    const parent = s.task({ what: 'Ship the specimen page' });
    const child = s.task({ what: 'Proof it', parent: parent.id });
    await s.settle();
    await s.move(parent, 'done');
    await s.settle();
    /* TWICE, BECAUSE THE SCRIPT'S OWN WRITE STARTS A RUN: it moves the follow-up to done, a script's write is not a
       rule's, and the rule fires on the follow-up too. Settled once, this read one run `done` and one still `pending`.
       That second run is also how a follow-up's own follow-ups close, one level per run. */
    await s.settle();
    const runs = s.running.sql.all<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'close_follow_ups'");
    assert.deepEqual(runs.map((r) => ({ ...r })), [{ state: 'done', say: null }, { state: 'done', say: null }], 'a run did not do what its dry run said');
    assert.equal(s.stateOf(child), 'done');
  } finally {
    await s.close();
  }
});

test('A TASK REOPENED BEFORE ITS SCRIPT RUNS CLOSES NOTHING, because the script reads the parent again', async () => {
  const s = await selfhost(['work']);
  try {
    const parent = s.task({ what: 'Ship the specimen page' });
    const child = s.task({ what: 'Proof it', parent: parent.id });
    await s.settle();
    /* THE RULE QUEUES THE RUN ON THE DRAIN AND THE HOST RUNS IT ON THE POLL, so a reopening can land between the two. */
    await s.move(parent, 'done');
    await s.running.drain();
    await s.move(s.k.get(parent.id)!, 'open');
    await s.settle();
    assert.equal(s.stateOf(child), 'open', 'a script queued while the task was done closed its step after the task was reopened');
    /* AND THE SCRIPT DID RUN. Without this the test passed on a Work pack that declared no cascade at all, since a step
       nothing closes stays open too: measured with `WORK_AUTOMATIONS` not yet in the Work document. */
    const jobs = s.running.sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = 'close_follow_ups'");
    assert.deepEqual(
      jobs.map((j) => j.state),
      ['done'],
      'the rule did not start close_follow_ups once, or the host did not take it',
    );
  } finally {
    await s.close();
  }
});

/* A PAUSED SCRIPT STAYS PAUSED, driven the way it happens on a host: a script whose source throws is
   refused three runs in a row, `pauseAfterRefusals` pauses it and tells the owner, and the next write that fires the
   rule used to queue a fourth run all the same, because `startScript` read the declaration and not the schedule row. */
test('A SCRIPT PAUSED BY THREE REFUSED RUNS IS NOT STARTED AGAIN BY THE RULE THAT STARTED THEM', async () => {
  const s = await selfhost(['work']);
  try {
    said(
      await s.k.install([
        {
          id: 'rule.throws_on_done',
          kind: 'rule',
          body: { rule: 'throws_on_done', on: { written: { register: 'tasks', op: ['update'], fields: ['state'] } }, steps: [{ if: 'state is done', then: [{ script: { id: 'throws_on_done', as: 'job' } }] }] },
        },
        {
          id: 'script.throws_on_done',
          kind: 'script',
          body: { script: 'throws_on_done', runs: { rule: true }, egress: [], keys: [], reads: ['tasks'], writes: ['tasks'], source: "export default async function run() { throw new Error('broken on purpose'); }" },
        },
      ] as never),
    );
    const jobs = () => s.running.sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = 'throws_on_done'");
    for (const what of ['One', 'Two', 'Three']) {
      await s.move(s.task({ what }), 'done');
      await s.settle();
    }
    assert.equal(jobs().length, 3);
    assert.equal(s.running.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = 'throws_on_done'")?.state, 'paused', 'three refused runs did not pause it');

    await s.move(s.task({ what: 'Four' }), 'done');
    await s.settle();
    assert.equal(jobs().length, 3, 'the rule queued a paused script');
    const last = s.running.sql.all<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'throws_on_done' ORDER BY started_at, rowid").at(-1);
    assert.equal(last?.state, 'failed');
    assert.match(last?.say ?? '', /script\.throws_on_done is paused/);
  } finally {
    await s.close();
  }
});
