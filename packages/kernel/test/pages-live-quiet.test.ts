/**
 * The live runs a page draws say which have gone quiet, so a declared page tells working from open.
 *
 * MEASURED ON THE OWNER'S RECORD: "Working now" drew four runs that nobody had heard from in hours, each as an agent
 * at work. Quiet is worked out when read and never stored (`isQuiet` in `session.ts`), and `sessions.live` answers it
 * beside the rows from the record's own clock, so every host draws the same runs as gone quiet.
 *
 * AND `sessions.working`, THE ONE NUMBER: the rail, Today and the Agents headline said four while two of the
 * four were last heard from hours before. Fifteen minutes is the line, and a helper is folded under its parent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Entry, type Kernel } from '../src/index.ts';
import { readBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { workingRuns } from '../src/presence.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* A RUN AS THE LADDER LEAVES IT: what it is doing, its state, and when it was last heard from. */
  const run = (doing: string, state: string, minutesAgo: number) => {
    const made = k.create('session', { doing, agent: 'claude', state }, { actor: 'p_1', stamp: { last_seen: new Date(NOW - minutesAgo * MIN).toISOString() } });
    assert.ok(made.ok, JSON.stringify(made));
  };
  run('Fix the invoice export', 'active', 5);
  run('Write the release notes', 'active', 95);
  run('Waiting on a review', 'idle', 40);
  run('Hand the migration on', 'handoff', 300);
  return { k, sql };
}

test('SESSIONS.LIVE SAYS WHICH RUNS HAVE GONE QUIET, one flag a run, aligned with the runs it draws', async () => {
  const { k, sql } = await record();
  const live = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }] } as never);
  assert.deepEqual(live.refusals, []);
  const said = live.rows.map((r, i) => [r.fields.doing, live.quiet?.[i]]);
  assert.deepEqual(
    Object.fromEntries(said),
    {
      'Fix the invoice export': false,
      'Write the release notes': true,
      'Waiting on a review': true,
      /* A HANDOFF STOPPED ON PURPOSE, so it is never quiet, however long it waits. */
      'Hand the migration on': false,
    },
  );
  assert.equal(live.quiet?.length, live.rows.length);

  /* CUT TO A LIMIT, THE FLAGS ARE CUT WITH THE RUNS, and a section over the runs, drawn as its count, sends neither. */
  const one = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }], limit: 1 } as never);
  assert.deepEqual([one.rows.length, one.quiet?.length, one.matched], [1, 1, 4]);
  const heading = k.block({ kind: 'section', heading: 'Agents', source: 'sessions.live' } as never);
  assert.deepEqual([heading.rows, 'quiet' in heading, heading.matched], [[], false, 4]);
  sql.close();
});

/**
 * A page's reader over this record, with the runs working now as `index.ts` hands them: `workingRuns`, each run read
 * whole. Built here so the reader is tested on its own, beside the record's wiring.
 */
function deps(k: Kernel, sql: NodeSql, more: Partial<PageDeps> = {}): PageDeps {
  const schemaOf = k.schemaOf;
  const all = k.list({ register: 'session', limit: 200 });
  const byId = new Map<string, Entry>((all.ok ? all.value.rows : []).map((r) => [r.id, r]));
  return {
    pages: () => [],
    metric: () => null,
    read: (decl) => k.metric(decl),
    list: () => ({ ok: true, value: { rows: [], matched: 0 } }),
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    sessionsWorking: () => workingRuns(sql, NOW).flatMap((r) => (byId.has(r.id) ? [{ run: byId.get(r.id)!, helpers: r.helpers }] : [])),
    ...more,
  } as PageDeps;
}

async function crew(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const run = (doing: string, minutesAgo: number, parent?: string) => {
    const made = k.create(
      'session',
      { doing, agent: 'claude', state: 'active' },
      /* A HELPER'S PARENT IS THE RECORD'S TO WRITE, as the ladder stamps it on the run a helper opens. */
      { actor: 'p_1', stamp: { last_seen: new Date(NOW - minutesAgo * MIN).toISOString(), ...(parent ? { parent } : {}) } },
    );
    assert.ok(made.ok, JSON.stringify(made));
  };
  run('Lead the release', 2);
  run('Heard 14 minutes ago', 14);
  run('Heard 16 minutes ago', 16);
  run('Check the changelog', 1, 'S1');
  run('Check the links', 3, 'S1');
  return { k, sql };
}

const WORKING = { kind: 'cards', source: 'sessions.working', columns: [{ field: 'doing', as: 'title' }] } as PageBlock;

test('SESSIONS.WORKING: 14 MINUTES IS WORKING, 16 IS QUIET, AND A HELPER IS FOLDED UNDER ITS PARENT', async () => {
  const { k, sql } = await crew();
  const out = readBlock(deps(k, sql), WORKING);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(
    out.rows.map((r, i) => [r.fields.doing, out.helpers?.[i]]),
    [
      ['Lead the release', 2],
      ['Heard 14 minutes ago', 0],
    ],
  );
  assert.equal(out.matched, 2, 'two agents at work, however many helpers they have');

  /* THE LIVE RUNS AGREE: the one heard 16 minutes ago is open and quiet, the one heard 14 minutes ago is not. */
  const live = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }] } as never);
  const quiet = Object.fromEntries(live.rows.map((r, i) => [r.fields.doing, live.quiet?.[i]]));
  assert.deepEqual([quiet['Heard 14 minutes ago'], quiet['Heard 16 minutes ago']], [false, true]);

  /* CUT TO A LIMIT, THE HELPERS ARE CUT WITH THE RUNS, and the count stays the whole. */
  const one = readBlock(deps(k, sql), { ...WORKING, limit: 1 });
  assert.deepEqual([one.rows.length, one.helpers, one.matched], [1, [2], 2]);
  sql.close();
});

test('SESSIONS.WORKING REFUSES A WHERE AND AN ORDER, and a field the runs do not have', async () => {
  const { k, sql } = await crew();
  const d = deps(k, sql);
  assert.deepEqual(
    [
      readBlock(d, { ...WORKING, where: 'agent is claude' }).refusals[0]?.at,
      readBlock(d, { ...WORKING, order: [{ field: 'doing' }] }).refusals[0]?.at,
      readBlock(d, { ...WORKING, columns: [{ field: 'nosuch', as: 'title' }] } as PageBlock).refusals[0]?.code,
    ],
    ['where', 'order', 'FIELD_UNKNOWN'],
  );
  /* EACH REFUSAL SAYS WHAT TO DO INSTEAD. */
  assert.match(readBlock(d, { ...WORKING, where: 'agent is claude' }).refusals[0]?.fix ?? '', /Use sessions\.live/u);
  /* AND A PAGE THAT ASKS EITHER IS REFUSED AT INSTALL, so it never installs to draw a refusal. */
  const page = (block: Record<string, unknown>) =>
    ({ id: 'page.crew', kind: 'page', body: { page: 'crew', title: 'Crew', blocks: [{ ...WORKING, ...block }] } }) as never;
  const refused = (await k.install([page({ where: 'agent is claude' })])) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(refused.ok, false);
  assert.match(refused.refusal!.fix, /takes no where\. Read sessions\.live/u);
  const ordered = (await k.install([page({ order: [{ field: 'doing' }] })])) as { ok: boolean; refusal?: { fix: string } };
  assert.match(ordered.refusal?.fix ?? '', /takes no order/u);
  assert.ok((await k.install([page({ limit: 3 })])).ok, 'columns and limit are all it takes');
  const { sessionsWorking: _unwired, ...bare } = d;
  assert.equal(readBlock(bare, WORKING).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
});

test('SESSIONS.WORKING THROUGH THE RECORD reads the same two runs, so a page, the rail and the figure count one number', async () => {
  const { k, sql } = await crew();
  const out = k.block(WORKING as never);
  assert.deepEqual(out.refusals, [], 'the record does not hand its page reader the working runs (index.ts sessionsWorking)');
  assert.deepEqual([out.rows.map((r) => r.fields.doing), out.helpers], [['Lead the release', 'Heard 14 minutes ago'], [2, 0]]);
  sql.close();
});

test('A RUN CARRIED IN WITH NO LAST SEEN IS QUIET WHILE OPEN, and never once it has left a step', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const [doing, state] of [['Carried in, open', 'active'], ['Carried in, handed on', 'handoff']] as const)
    assert.ok(k.create('session', { doing, agent: 'claude', state }, { actor: 'p_1' }).ok);
  const live = k.block({ kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }] } as never);
  assert.ok(live.rows.every((r) => r.fields.last_seen === undefined), 'these runs were meant to carry no last_seen');
  assert.deepEqual(Object.fromEntries(live.rows.map((r, i) => [r.fields.doing, live.quiet?.[i]])), {
    'Carried in, open': true,
    'Carried in, handed on': false,
  });
  sql.close();
});
