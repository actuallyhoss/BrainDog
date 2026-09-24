/**
 * A rule's script step does not launder the rule's write (audit sixty-four, finding 2: `loop/research-batch-sixty-four-audit.md`
 * §2, probe L1 in `%TEMP%\braindog-loop\audit64\probe-loop.test.ts`).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR. `onWritten` skips a write made by a rule unless the trigger says `from_rules`,
 * and stops a chain past `CHAIN_CEILING`, but `byRule` is read off the actor (`index.ts`, `w.actor.startsWith('rule:')`)
 * and `finishScript` writes as `script:<id>@v<n>`. So the write a rule caused through a `script` step was a stranger's
 * write at depth 0. L1 on a real self-host: a rule with no `fields:` filter whose script stamps the row that fired it;
 * one update to `done` and twelve rounds of drain and poll took the row from version 3 to 14, twelve runs and a
 * thirteenth pending. The first test below is L1 at the kernel, and it failed the same way: every round one more run.
 *
 * THE REPAIR, IN `flow.ts` AND `script-run.ts`. The job a `script` step queues is tied to the run that queued it by the
 * step's own row, so `finishScript` reads the chain from there (`chainOfJob`) and holds it while the script's writes go
 * through the write path (`underChain`). A write made under a chain never starts a rule on a row that rule already ran
 * for in the same chain, and carries the chain's depth plus one, which `SCRIPT_CHAIN_CEILING` bounds.
 *
 * WORK'S CASCADE IS THE REASON THE BOUND IS NOT `CHAIN_CEILING`. `close_follow_ups` closes one level of follow-ups per
 * run, and every level is a different row, so a tree deeper than four would stop closing under a ceiling of three. The
 * tree test below closes six levels, and the pack's own script is driven over a deeper tree in
 * `packages/seed/test/follow-ups.test.ts`.
 *
 * THE SANDBOX HERE IS A FUNCTION, because the kernel never runs a script (`script.ts`): what is measured is what the
 * record does with the writes a host hands back, and a host's answer is exactly `{ writes, log, usage }`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import type { ScriptAnswer, ScriptWrite, Scripted } from '../src/script-run.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/** `flow.ts`'s `SCRIPT_CHAIN_CEILING`, written out so that the red run of this file failed on behaviour and not on an import. */
const BOUND = 8;

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
      { id: 'note', type: 'text' },
      { id: 'parent', type: 'text' },
      { id: 'other', type: 'text' },
    ],
  } as never,
};

const script = (name: string, reads = ['items']): Declaration => ({
  id: `script.${name}`,
  kind: 'script',
  body: { script: name, runs: { rule: true }, egress: [], keys: [], reads, writes: reads, source: 'export default async function run(ctx) {}' } as never,
});

const rule = (name: string, on: unknown, when: string | undefined, run = name): Declaration => ({
  id: `rule.${name}`,
  kind: 'rule',
  body: { rule: name, on, ...(when === undefined ? {} : { when }), steps: [{ script: { id: run, as: 'job' } }] } as never,
});

/* L1's own rule: every update of a done item, no `fields:` filter, which an owner's first rule often will not have. */
const STAMP = rule('stamp_done', { written: { register: 'items', op: ['update'] } }, 'state is done', 'stamp');

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

type Input = { id: string; register: string; seq: number };
type Body = (input: Input, k: Kernel, sql: NodeSql) => ScriptWrite[];

/** The rows of `items` as a script's `ctx.record.list` reads them, filtered in JS. */
const rows = (sql: NodeSql): Entry[] =>
  sql
    .all<{ id: string; seq: number; version: number; fields: string }>("SELECT id, seq, version, fields FROM entry WHERE register = 'items' AND deleted_at IS NULL ORDER BY rowid")
    .map((r) => ({ ...r, fields: JSON.parse(r.fields) }) as unknown as Entry);

const BODIES: Record<string, Body> = {
  /* L1's STAMP: read the row it was started for and write its note. */
  stamp: (input, k) => {
    const row = k.get(input.id);
    return row ? [{ op: 'update', spoken: `items#${row.seq}`, patch: { note: `seen ${row.version}` }, version: row.version }] : [];
  },
  /* Two rows that point at each other: each run writes the OTHER row, so a check on the run's own row alone lets it go on. */
  pong: (input, k) => {
    const row = k.get(input.id);
    const other = typeof row?.fields.other === 'string' ? k.get(row.fields.other) : null;
    return other ? [{ op: 'update', spoken: `items#${other.seq}`, patch: { note: `from ${row!.seq} at ${other.version}` }, version: other.version }] : [];
  },
  /* Work's cascade in miniature: every open child of the row, moved to done. */
  close: (input, _k, sql) =>
    rows(sql)
      .filter((r) => r.fields.parent === input.id && r.fields.state === 'open')
      .map((r) => ({ op: 'update', spoken: `items#${r.seq}`, patch: { state: 'done' }, version: r.version })),
  /* A script that makes a new row each time a new row is made: nothing in the data ever ends it. */
  spawn: (input) => [{ op: 'create', register: 'items', fields: { what: `echo of ${input.seq}` } }],
};

const USAGE = { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 };

/** Drain the runs, then let the "host" take every queued script, `rounds` times over. */
async function settle(k: Kernel, sql: NodeSql, rounds: number): Promise<void> {
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const body = BODIES[s.scripted.script];
    assert.ok(body, `no body for ${s.scripted.script}`);
    return { writes: body(s.scripted.input as Input, k, sql), log: '', usage: USAGE };
  };
  const execute = (async () => {
    throw new Error('no call is declared here');
  }) as never;
  for (let i = 0; i < rounds; i++) {
    await k.drain();
    await k.runActions(execute, { script: sandbox, limit: 50 });
  }
}

const runsOf = (sql: NodeSql, rule: string): { state: string; depth: number }[] =>
  sql.all<{ state: string; depth: number }>('SELECT state, depth FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', rule).map((r) => ({ ...r }));
const jobsOf = (sql: NodeSql, name: string): number =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = ?", name)?.n ?? 0;

test('L1: A RULE WHOSE SCRIPT WRITES THE ROW THAT STARTED IT RUNS ONCE, however many times the host comes round', async () => {
  const { k, sql } = await record(script('stamp'), STAMP);
  const row = item(k, { what: 'Proof it' });
  const moved = k.update('items', row.id, { state: 'done' }, { actor: 'p_1' });
  assert.ok(moved.ok, why(moved));
  await settle(k, sql, 12);
  const after = k.get(row.id);
  assert.equal(after?.fields.note, 'seen 2', 'the script did not run, or ran against a later version');
  assert.deepEqual(runsOf(sql, 'stamp_done'), [{ state: 'done', depth: 0 }], `one press of done started ${runsOf(sql, 'stamp_done').length} runs`);
  assert.equal(jobsOf(sql, 'stamp'), 1);
  assert.equal(after?.version, 3, 'the row was written again after the script');

  /* AND THE NEXT PRESS IS A NEW CHAIN. The rule is not switched off for the row: a person's own write starts it again. */
  const again = k.update('items', row.id, { what: 'Proof it twice' }, { actor: 'p_1' });
  assert.ok(again.ok, why(again));
  await settle(k, sql, 4);
  assert.equal(runsOf(sql, 'stamp_done').length, 2);
  sql.close();
});

test('TWO ROWS THAT POINT AT EACH OTHER stop at the first row the chain comes back to, not at the ceiling', async () => {
  const { k, sql } = await record(script('pong'), rule('pong', { written: { register: 'items', op: ['update'] } }, 'state is done'));
  const y = item(k, { what: 'Y', state: 'done' });
  const x = item(k, { what: 'X', other: y.id });
  assert.ok(k.update('items', y.id, { other: x.id }, { actor: 'p_1' }).ok);
  await settle(k, sql, 2);
  const before = runsOf(sql, 'pong').length;
  assert.ok(k.update('items', x.id, { state: 'done' }, { actor: 'p_1' }).ok);
  await settle(k, sql, 12);
  const chain = runsOf(sql, 'pong').slice(before);
  assert.deepEqual(chain, [{ state: 'done', depth: 0 }, { state: 'done', depth: 1 }], 'X then Y, and the write back to X starts nothing');
  sql.close();
});

test("A TREE SIX LEVELS DEEP CLOSES WHOLE, one level per run, each run one deeper: Work's cascade is not stopped", async () => {
  const { k, sql } = await record(script('close'), rule('close', { written: { register: 'items', op: ['update'], fields: ['state'] } }, 'state is done'));
  const root = item(k, { what: 'Level 0' });
  const levels: Entry[] = [];
  let parent = root;
  for (let n = 1; n <= 6; n++) levels.push((parent = item(k, { what: `Level ${n}`, parent: parent.id })));
  assert.ok(k.update('items', root.id, { state: 'done' }, { actor: 'p_1' }).ok);
  await settle(k, sql, 10);
  assert.deepEqual(
    levels.map((r) => k.get(r.id)?.fields.state),
    levels.map(() => 'done'),
  );
  assert.deepEqual(
    runsOf(sql, 'close').map((r) => r.depth),
    [0, 1, 2, 3, 4, 5, 6],
    'the depth of the run that closed a level is carried onto the next',
  );
  sql.close();
});

test(`A CHAIN NOTHING IN THE DATA ENDS stops at the stated bound: ${BOUND + 1} runs, the last at depth ${BOUND}`, async () => {
  /* EVERY ROW IS NEW, so no row is ever met twice and only the depth can end it. */
  const { k, sql } = await record(script('spawn'), rule('spawn', { written: { register: 'items', op: ['create'] } }, undefined));
  item(k, { what: 'Seed' });
  await settle(k, sql, BOUND + 6);
  const chain = runsOf(sql, 'spawn');
  assert.equal(chain.length, BOUND + 1, `a script that makes a row per run ran ${chain.length} times from one create`);
  assert.deepEqual(
    chain.map((r) => r.depth),
    Array.from({ length: BOUND + 1 }, (_, i) => i),
  );
  /* AND THE RUN THAT MET THE BOUND SAYS SO, where the script's run is shown. Before this, all nine lines read "spawn ran
     and wrote one row." and the tenth row sat there with nothing anywhere saying why no rule ran on it. */
  const said = sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:script.spawn' ORDER BY rowid").map((e) => e.note);
  assert.equal(said.length, BOUND + 1);
  assert.deepEqual(said.slice(0, -1), said.slice(0, -1).map(() => 'spawn ran and wrote one row.'));
  assert.match(said.at(-1)!, new RegExp(`^spawn ran and wrote one row\\. Its writes started no rule\\.spawn on items#${BOUND + 2}: that run would be at depth ${BOUND + 1} `));
  assert.match(said.at(-1)!, /A person's own write starts it again\.$/);
  assert.ok(said.at(-1)!.length <= 280, 'the line is cut at 280 characters');
  sql.close();
});
