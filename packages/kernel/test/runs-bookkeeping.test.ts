/**
 * Quiet bookkeeping (DIRECTION §37): the twelve-hour sweep that writes quiet runs off, and an agent's daily stamp of
 * when it last saw a tool, are the record keeping its books. Their lines stay in the log and in each row's history, and
 * no feed shows them.
 *
 * MEASURED BEFORE: of the newest 200 Activity lines on the owner's record, 154 were the sweep's "Nothing heard from this
 * run in twelve hours" and 7 were the tools scan's `seen`, so what people and agents changed was a quarter of the feed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

const TOOLS: Declaration = {
  id: 'register.tools',
  kind: 'register',
  body: {
    id: 'tools',
    name: 'Tools',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'seen', label: 'Last seen', type: 'instant' },
      { id: 'meets', label: 'Next call', type: 'instant' },
      { id: 'note', type: 'text' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TOOLS]));
  return { k, sql, clock };
}

const as = (session: SessionHints = {}): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session });
type Feed = { kind: string | null; note: string | null; thing?: string | null; target: string | null };
const feed = (k: Awaited<ReturnType<typeof record>>['k']): { rows: Feed[]; matched: number } => {
  const out = k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' }) as { feed?: Feed[]; matched?: number; refusals: unknown[] };
  assert.deepEqual(out.refusals, []);
  return { rows: out.feed ?? [], matched: out.matched ?? 0 };
};

/** The hourly row, due now, as `createRecord` arms it on a real record. */
const sweep = async (k: Awaited<ReturnType<typeof record>>['k'], sql: NodeSql, at: number): Promise<void> => {
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'purge', ?, '{}', 'pending', 0)", `01J0000000000000000000${String(at).slice(-4)}`, iso(at), `sweep-${at}`);
  /* THE SWEEP RAN, and the signs' nightly row may have run beside it, armed as the record opened (`armSigns`). */
  assert.ok((await k.drain()).done >= 1);
  assert.ok(Date.parse(sql.one<{ due_at: string }>('SELECT due_at FROM schedule WHERE key = ?', `sweep-${at}`)!.due_at) > at, 'the sweep did not run');
};

test('THE SWEEP WRITES NO FEED LINE: a run it writes off keeps the line in its history, and every feed reads past it', async () => {
  const { k, sql, clock } = await record();
  for (const client_id of ['a', 'b', 'c']) value(k.create('tools', { name: `Tool ${client_id}` }, as({ client_id })));
  clock.advance(13 * HOUR);
  await sweep(k, sql, clock.now());
  assert.deepEqual(['S1', 'S2', 'S3'].map((s) => k.get(s)?.state), ['abandoned', 'abandoned', 'abandoned']);

  /* The history and the log keep every line. */
  const said = k.history(k.get('S1')!.id).at(-1);
  assert.deepEqual([said?.actor, said?.kind, said?.note], ['system', 'state', 'Nothing heard from this run in twelve hours.']);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor = 'system' AND kind = 'state'")!.n, 3);

  /* A feed shows what changed: the three tools and the three runs opened for them, and none of the sweep. */
  const { rows, matched } = feed(k);
  assert.ok(!rows.some((r) => r.note?.startsWith('Nothing heard')), JSON.stringify(rows));
  assert.ok(!rows.some((r) => r.kind === 'state'), 'a run written off is a line of the feed');
  assert.equal(matched, 6);
  assert.equal(k.bookkeeping({ actor: 'system', kind: 'state', target: `entry:${k.get('S1')!.id}`, field: 'state', ts: iso(clock.now()), to: 'abandoned' }), true);

  /* A state the record moves on any other list is a change, and so is one a person moves on a run. */
  value(k.update('session', 'S2', { state: 'active' }, { actor: 'p_owner' }));
  assert.equal(feed(k).matched, 7);
  sql.close();
});

test('THE SWEEP OF A BUSY RECORD STILL LEAVES THE FEED FULL: it reads past six hundred lines of runs written off', async () => {
  const { k, sql, clock } = await record();
  for (let i = 0; i < 600; i++) value(k.create('session', { doing: `Run ${i}`, client_id: `c-${i}` }, { actor: 'p_owner' }));
  value(k.create('tools', { name: 'Then this' }, { actor: 'p_owner' }));
  /* Six hundred runs nobody hears from, written off by the sweep in the hundreds it takes at a time. */
  clock.advance(13 * HOUR);
  for (let i = 0; i < 6; i++) {
    clock.advance(1_000);
    await sweep(k, sql, clock.now());
  }
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor = 'system' AND kind = 'state'")!.n, 600);

  /* The six hundred newest lines are the sweep's: the feed reads past them to the tool, and on down to its five hundred. */
  const { rows, matched } = feed(k);
  assert.equal(rows[0]?.thing, 'Then this', 'the feed stopped at the sweep');
  assert.equal(matched, 500, 'the sweep’s lines were counted against the feed’s five hundred');
  sql.close();
});

test('AN AGENT’S STAMP OF WHEN IT SAW A TOOL IS NO CHANGE, and a meeting it moves to next week is', async () => {
  const { k, sql, clock } = await record();
  /* The scan records a tool with the moment it saw it, as `braindog tools` does. */
  const tool = value<Entry>(k.create('tools', { name: 'fly-prism', seen: iso(clock.now()) }, as({ client_id: 'cc-1' })));
  clock.advance(25 * HOUR);
  const before = feed(k).matched;

  /* The scan's daily stamp: the agent's own clock, a minute behind the record's. */
  value(k.update('tools', tool.id, { seen: iso(clock.now() - MIN) }, as({ client_id: 'cc-1' })));
  assert.equal(feed(k).matched, before, 'the daily seen stamp is a line of the feed');
  assert.equal(k.history(tool.id).at(-1)?.field, 'seen', 'the row’s history lost the stamp');

  /* A time that is not now is a change, as is a person's stamp and any other field an agent writes. */
  value(k.update('tools', tool.id, { meets: iso(clock.now() + 7 * 24 * HOUR) }, as({ client_id: 'cc-1' })));
  value(k.update('tools', tool.id, { seen: iso(clock.now()) }, { actor: 'p_owner' }));
  value(k.update('tools', tool.id, { note: 'Needs the fly token' }, as({ client_id: 'cc-1' })));
  assert.equal(feed(k).matched, before + 3);
  sql.close();
});

test('A MOMENT AN AGENT FILLS FOR THE FIRST TIME IS A CHANGE, as "Sent" filled as it sends is, and only a stamp over a stamp is not', async () => {
  const { k, sql, clock } = await record();
  /* A moment filled as it happens, shaped exactly like a stamp but over nothing. */
  const tool = value<Entry>(k.create('tools', { name: 'fly-prism' }, as({ client_id: 'cc-1' })));
  clock.advance(HOUR);
  const before = feed(k).matched;
  value(k.update('tools', tool.id, { meets: iso(clock.now()) }, as({ client_id: 'cc-1' })));
  assert.equal(feed(k).matched, before + 1, 'a moment filled for the first time left the feed');
  const line = sql.one<{ actor: string; kind: string; target: string; field: string; ts: string; from_v: string | null; to_v: string }>(
    "SELECT actor, kind, target, field, ts, from_v, to_v FROM event WHERE field = 'meets'",
  )!;
  const shape = { ...line, from: null, to: JSON.parse(line.to_v) as string };
  assert.equal(k.bookkeeping(shape), false, 'a moment filled over nothing was read as a stamp');
  assert.equal(k.bookkeeping({ ...shape, from: iso(clock.now() - 24 * HOUR) }), true, 'a stamp over an earlier one was read as news');
  sql.close();
});

test('A FEED LINE A RUN SIGNED SAYS WHO THAT RUN IS, on a live record: its agent and its app, and nothing new on a person’s line', async () => {
  const { k } = await record();
  value(k.create('tools', { name: 'By hand' }, { actor: 'p_owner' }));
  value(k.create('tools', { name: 'By a run' }, as({ client_id: 'claude-code', agent: 'claude' } as SessionHints)));
  const out = k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' }) as { feed?: (Feed & { who?: string | null; run_by?: { run: string; agent: string; client: string | null; parent: string | null } | null })[] };
  const rows = out.feed ?? [];
  const signed = rows.filter((r) => r.run_by !== undefined);
  assert.ok(signed.length > 0, 'no line of the feed says its run: runOf is not wired into the page reads');
  for (const r of signed) {
    assert.equal(r.run_by?.run, 'S1');
    assert.equal(typeof r.run_by?.agent, 'string');
    assert.notEqual(r.run_by?.agent, '');
  }
  /* A LINE A PERSON WROTE CARRIES NO `run_by` AT ALL, not a null. */
  assert.ok(rows.some((r) => !('run_by' in r)), 'every line carries run_by, a person’s included');
});
