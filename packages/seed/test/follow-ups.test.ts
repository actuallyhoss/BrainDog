/**
 * Work's follow-ups close all the way down, through the pack's own rule and the pack's own script, now that a
 * rule-started script's writes carry the chain that started them.
 *
 * WHY THIS FILE EXISTS. A `script` step laundered a rule's write: the script writes as
 * `script:<id>@v<n>`, so a rule whose script wrote the row that fired it started itself again on every run, at depth 0
 * (`packages/kernel/test/script-chain.test.ts`). The repair gives those writes the depth of the run that queued the
 * script plus one, bounded by `SCRIPT_CHAIN_CEILING` in `packages/kernel/src/flow.ts`, and the risk is
 * plain: Work's `close_follow_ups` closes ONE LEVEL PER RUN, each level's close starting the rule on the level
 * below, so a bound that is too low stops a follow-up tree closing part of the way down. Under `CHAIN_CEILING` (3) a
 * tree five levels deep left its fifth open. `apps/selfhost/test/follow-ups.test.ts` drives one level on a real host;
 * this drives the depth.
 *
 * THE SCRIPT IS THE PACK'S OWN SOURCE, RUN. The sandbox here imports `decl.source` as a module and hands it a `ctx`
 * with `record.get`, `record.list` over `all:` of `is` and `in`, and `update`, which is all `close_follow_ups` and
 * `start_with_parent` use, and gives the kernel back exactly the `{ writes, log, usage }` a host would. So what is
 * measured is the pack's rule, the pack's script and the kernel's chain, and not a copy of any of them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { NOW, installSeed } from '../src/index.ts';

/** `SCRIPT_CHAIN_CEILING` in `packages/kernel/src/flow.ts`, written out because the kernel's index does not export it. */
const BOUND = 8;

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

type Found = { id: string; seq: number; version: number; fields: Record<string, unknown> };
type Where = { all?: { field: string; is?: unknown; in?: unknown[] }[] };

const shaped = (e: Entry): Found => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

/** The pack's source, run against the record as a host's sandbox runs it, with the writes handed back and not made. */
function sandbox(k: Kernel, sql: Sql) {
  return async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: { op: 'update'; spoken: string; patch: unknown; version: number }[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        get: async (id: string) => {
          const e = k.get(id);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: Where) =>
          sql
            .all<{ id: string }>('SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY rowid', register)
            .map((r) => shaped(k.get(r.id)!))
            .filter((r) => (where.all ?? []).every((c) => (c.in !== undefined ? c.in.includes(r.fields[c.field]) : r.fields[c.field] === c.is))),
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<void> };
    await mod.default(ctx);
    return { writes, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } };
  };
}

async function work() {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const task = (fields: Record<string, unknown>): Entry => {
    const made = k.create('tasks', fields, { actor: 'p_seed' });
    assert.ok(made.ok, sayOf(made));
    return made.value;
  };
  const run = sandbox(k, sql);
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox, `rounds` times: how a run reaches its steps, and a script its sandbox. */
  const settle = async (rounds: number) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  /** A chain of follow-ups `levels` deep under a new task, each `Part of` the one above it. */
  const tree = async (levels: number): Promise<{ root: Entry; below: Entry[] }> => {
    const root = task({ what: 'Ship the specimen page' });
    const below: Entry[] = [];
    let parent = root;
    for (let n = 1; n <= levels; n++) below.push((parent = task({ what: `Step ${n}`, parent: parent.id })));
    await settle(2);
    return { root, below };
  };
  const done = (row: Entry) => {
    const moved = k.update('tasks', row.id, { state: 'done' }, { actor: 'p_seed' });
    assert.ok(moved.ok, sayOf(moved));
  };
  const depths = () =>
    sql.all<{ depth: number }>("SELECT depth FROM automation_run WHERE rule = 'close_follow_ups' AND state = 'done' ORDER BY started_at, rowid").map((r) => r.depth);
  return { k, sql, tree, done, settle, depths };
}

test(`A FOLLOW-UP TREE ${BOUND + 1} LEVELS DEEP CLOSES WHOLE from one done, through Work's own rule and script`, async () => {
  const w = await work();
  const before = w.depths().length;
  const { root, below } = await w.tree(BOUND + 1);
  w.done(root);
  await w.settle(BOUND + 6);
  assert.deepEqual(
    below.map((r) => w.k.get(r.id)?.fields.state),
    below.map(() => 'done'),
  );
  assert.match(String(w.k.get(below.at(-1)!.id)?.fields.note), /Closed with Step \d+ \(tasks#\d+\)\.$/u);
  assert.deepEqual(
    w.depths().slice(before),
    Array.from({ length: BOUND + 1 }, (_, i) => i),
    'one run per level, each one deeper than the run that closed its parent',
  );
});

test(`THE LEVEL PAST THE STATED BOUND STAYS OPEN: ${BOUND + 2} levels, and the run that would close the last is never started`, async () => {
  /* PINNED SO THAT THE BOUND IS A DECISION SOMEBODY SEES. A tree this deep is not one anybody has asked Work to hold;
     if one is, the bound in `flow.ts` moves and this test says by how much. */
  const w = await work();
  const before = w.depths().length;
  const { root, below } = await w.tree(BOUND + 2);
  w.done(root);
  await w.settle(BOUND + 8);
  assert.deepEqual(
    below.map((r) => w.k.get(r.id)?.fields.state),
    [...below.slice(0, -1).map(() => 'done'), 'open'],
  );
  assert.equal(w.depths().length - before, BOUND + 1);
  /* AND THE SCRIPT'S RUN THAT CLOSED THE LAST LEVEL SAYS WHY THE NEXT ONE IS OPEN, in the line its history shows. Before
     it said so, that line read "close_follow_ups ran and wrote one row." as every line above it did. */
  const last = w.sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND target = 'declaration:script.close_follow_ups' ORDER BY rowid DESC LIMIT 1")?.note;
  const stuck = below.at(-2)!;
  assert.equal(
    last,
    `close_follow_ups ran and wrote one row. Its writes started no rule.close_follow_ups on tasks#${stuck.seq}: that run would be at depth ${BOUND + 1} of one chain of rules and scripts, and a chain stops at depth ${BOUND} so that it cannot run for ever. A person's own write starts it again.`,
  );
});

test('A FINISHED TREE STARTS NOTHING MORE, however many times the host comes round', async () => {
  const w = await work();
  const { root } = await w.tree(3);
  w.done(root);
  await w.settle(6);
  const runs = w.sql.one<{ n: number }>("SELECT count(*) AS n FROM automation_run WHERE rule = 'close_follow_ups'")?.n;
  const jobs = w.sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = 'close_follow_ups'")?.n;
  await w.settle(6);
  assert.equal(w.sql.one<{ n: number }>("SELECT count(*) AS n FROM automation_run WHERE rule = 'close_follow_ups'")?.n, runs);
  assert.equal(w.sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND json_extract(payload, '$.script') = 'close_follow_ups'")?.n, jobs);
});

