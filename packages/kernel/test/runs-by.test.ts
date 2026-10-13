/**
 * A LINE A RUN SIGNED SAYS WHO THAT RUN IS (AGT-C11 job C11-a, the pages half). "Activity: runs signed S42 share one
 * 'An agent' lane (log doesn't say which agent)": a feed answered the bare handle, and a host could only call it an agent.
 *
 * `feedRows` and `agentRows` answer `run_by: { run, agent, client, parent }` beside every row whose actor is a run, read
 * once a run for a page (`PageDeps.runOf`). The key is `run_by` because `by` is already the kind of actor a feed groups by.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { agentRows, feedRows, readPage, type ActivityEvent, type FeedRow, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { Entry } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString();

const run = (seq: number, fields: Entry['fields']): Entry => ({
  id: `r${seq}`,
  register: 'session',
  seq,
  fields,
  state: 'active',
  version: 1,
  created_at: at(600),
  updated_at: at(600),
  deleted_at: null,
});

/** Four runs: Claude Code, its helper, one that said only the app it ran in, and one that said nothing of itself. */
const RUNS: Readonly<Record<string, Entry>> = {
  S42: run(42, { agent: 'claude', client: 'claude-code' }),
  S43: run(43, { agent: 'claude', client: 'claude-code', parent: 'S42' }),
  S44: run(44, { client: 'codex-cli' }),
  S45: run(45, {}),
};

/** The record's read of a run by its handle, counting every read it is asked for. */
function runs(): { runOf: NonNullable<PageDeps['runOf']>; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    runOf: (name) => {
      asked.push(name);
      return RUNS[name] ?? null;
    },
  };
}

const event = (minutesAgo: number, actor: string, target: string, kind = 'update'): ActivityEvent => ({ ts: at(minutesAgo), actor, kind, target, note: null, thing: target });

/** Newest first, as the record reads them: three runs, a run nobody holds, and four actors that are not runs. */
const EVENTS: ActivityEvent[] = [
  event(1, 'S42', 'tasks#1'),
  event(2, 'S43', 'tasks#2'),
  event(3, 'S44', 'tasks#3'),
  event(4, 'S45', 'tasks#4'),
  event(5, 'S99', 'tasks#5'),
  event(6, 'p_1', 'tasks#6'),
  event(7, 'agent:claude', 'tasks#7'),
  event(8, 'slash', 'tasks#8'),
  event(9, 'rule:tidy', 'tasks#9'),
  event(10, 'S42', 'tasks#10'),
];

const isRun = (who: string | null): boolean => who !== null && /^S\d+$/u.test(who);
const of = (rows: readonly FeedRow[], who: string): FeedRow => {
  const found = rows.find((r) => r.who === who);
  assert.ok(found, `no row by ${who}: ${JSON.stringify(rows)}`);
  return found;
};

for (const [name, rowsOf] of [
  ['feedRows', feedRows],
  ['agentRows', agentRows],
] as const) {
  test(`${name}: A ROW A RUN SIGNED SAYS THE RUN, ITS AGENT, THE APP IT RAN IN AND THE RUN IT HELPS`, () => {
    const rows = rowsOf(EVENTS, undefined, runs().runOf);
    assert.deepEqual(of(rows, 'S42').run_by, { run: 'S42', agent: 'claude', client: 'claude-code', parent: null });
    assert.deepEqual(of(rows, 'S43').run_by, { run: 'S43', agent: 'claude', client: 'claude-code', parent: 'S42' });
    /* THE KIND OF AGENT IS READ FROM THE APP where the run said only the app, and is `other` where it said neither. */
    assert.deepEqual(of(rows, 'S44').run_by, { run: 'S44', agent: 'codex', client: 'codex-cli', parent: null });
    assert.deepEqual(of(rows, 'S45').run_by, { run: 'S45', agent: 'other', client: null, parent: null });
  });

  test(`${name}: NO ROW IS A BARE RUN HANDLE, and a run nobody holds answers null`, () => {
    const rows = rowsOf(EVENTS, undefined, runs().runOf);
    const signed = rows.filter((r) => isRun(r.who));
    assert.equal(signed.length, 6);
    for (const r of signed) {
      assert.ok('run_by' in r, `${r.who} answers nothing about its run`);
      if (r.who === 'S99') assert.equal(r.run_by, null);
      else assert.ok(typeof r.run_by?.agent === 'string' && r.run_by.agent !== '', `${r.who} has no agent`);
    }
  });

  test(`${name}: AN ACTOR THAT IS NOT A RUN IS ANSWERED AS IT WAS`, () => {
    const plain = rowsOf(EVENTS);
    const read = rowsOf(EVENTS, undefined, runs().runOf);
    for (const who of ['p_1', 'agent:claude', 'slash', 'rule:tidy']) {
      assert.ok(!('run_by' in of(read, who)), `${who} is not a run`);
      assert.deepEqual(of(read, who), of(plain, who));
    }
    /* AND A HOST THAT READS NO RUNS answers what it always did, with no key it cannot fill. */
    assert.ok(plain.every((r) => !('run_by' in r)));
  });

  test(`${name}: EACH RUN IS READ ONCE, however many rows it signed`, () => {
    const reader = runs();
    rowsOf(EVENTS, undefined, reader.runOf);
    assert.deepEqual([...reader.asked].sort(), ['S42', 'S43', 'S44', 'S45', 'S99']);
  });
}

test('A ROW THAT FOLDS WHAT IS PAST first: an agent’s keeps its run, a feed’s names nobody', () => {
  const many = [1, 2, 3].map((n) => event(n, 'S42', `tasks#${n}`));
  const folded = agentRows(many, 1, runs().runOf);
  assert.equal(folded.length, 2);
  assert.equal(folded[1]?.kind, null);
  assert.deepEqual(folded[1]?.run_by, { run: 'S42', agent: 'claude', client: 'claude-code', parent: null });
  const feed = feedRows(many, 1, runs().runOf);
  assert.equal(feed[1]?.who, null);
  assert.ok(!('run_by' in feed[1]!));
});

function depsOver(blocks: PageBlock[], more: Partial<PageDeps>): PageDeps {
  return {
    pages: () => [{ page: 'log', title: 'Log', blocks }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    activity: () => ({ events: EVENTS, seen: null }),
    ...more,
  };
}

test('ON A PAGE, EVERY FEED SAYS ITS RUNS, AND A RUN IS READ ONCE FOR THE WHOLE PAGE', () => {
  const reader = runs();
  const blocks: PageBlock[] = [
    { kind: 'feed', source: 'activity', empty: 'Nothing yet.' },
    { kind: 'agents', source: 'activity', empty: 'No agent has worked yet.' },
  ];
  const page = readPage(depsOver(blocks, { runOf: reader.runOf }), 'log');
  assert.ok(page.ok, JSON.stringify(page));
  const [feed, agents] = page.value.blocks.map((b) => b.feed ?? []);
  assert.deepEqual(page.value.blocks.flatMap((b) => b.refusals), []);
  for (const rows of [feed!, agents!]) {
    assert.deepEqual(of(rows, 'S43').run_by, { run: 'S43', agent: 'claude', client: 'claude-code', parent: 'S42' });
    assert.equal(of(rows, 'S99').run_by, null);
    for (const r of rows.filter((x) => isRun(x.who) && x.who !== 'S99')) assert.ok(r.run_by?.agent, `${r.who} has no agent`);
  }
  assert.deepEqual([...reader.asked].sort(), ['S42', 'S43', 'S44', 'S45', 'S99'], 'two blocks, one read a run');
});
