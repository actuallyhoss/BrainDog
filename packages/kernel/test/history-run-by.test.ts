/**
 * A LINE OF THE LOG A RUN SIGNED SAYS WHO THAT RUN IS (run-by-64 #2 and #3, the kernel half). History drew "An agent"
 * for every run, since the line `eventsBefore` answers held the bare handle (`S12`) and nothing of the run behind it.
 *
 * The line now answers `run_by: { run, agent, client, parent }` as a feed line does (`runByOf` in `pages.ts`), only where
 * the actor is a run's handle, with ended and removed runs included, and each run read once for a page of lines.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type EventLine, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record with one list, and a count of every read of a row by its number, which is how a run is read by its handle. */
async function record() {
  const sql = openSqlite();
  const reads = { bySeq: 0 };
  const counted: NodeSql = Object.assign(Object.create(sql) as NodeSql, {
    one: (text: string, ...params: never[]) => {
      if (/FROM entry WHERE register = \? AND seq = \?/u.test(text)) reads.bySeq += 1;
      return (sql.one as (t: string, ...p: never[]) => unknown)(text, ...params);
    },
  });
  const k = await openRecord(counted, fixedClock(NOW));
  value(await k.install([TASKS]));
  return { k, sql, reads };
}

const as = (session: SessionHints): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token: 't_1' }, session });
const person: WriteContext = { actor: 'p_owner' };

type Said = EventLine & { run_by?: unknown };
const by = (lines: readonly Said[], actor: string): Said[] => lines.filter((l) => l.actor === actor);

test('A RUN’S LINE SAYS WHO THE RUN IS: its agent, the app it ran in and the run it helps, as a feed line does', async () => {
  const { k } = await record();
  value(k.create('tasks', { name: 'Fire the bowls' }, as({ client_id: 'c1', agent: 'claude', client: 'claude-code' })));
  value(k.create('tasks', { name: 'Glaze the lids' }, as({ client_id: 'c2', client: 'codex-cli' })));

  const lines: Said[] = k.eventsBefore(null, 100);
  const first = by(lines, 'S1');
  assert.ok(first.length >= 1, 'the run signed no line');
  for (const l of first) assert.deepEqual(l.run_by, { run: 'S1', agent: 'claude', client: 'claude-code', parent: null });

  /* A run that said only its app is still told apart by that app. */
  const second = by(lines, 'S2');
  assert.ok(second.length >= 1);
  for (const l of second) assert.equal((l.run_by as { client: string }).client, 'codex-cli');

  /* The feed block reads the same run the same way. */
  const feed = (k.block({ kind: 'feed', source: 'activity', empty: 'Nothing yet.' }) as { feed?: { who: string; run_by?: unknown }[] }).feed ?? [];
  assert.deepEqual(feed.find((r) => r.who === 'S1')?.run_by, first[0]!.run_by);
});

test('A PERSON’S LINE AND A RULE’S HOLD NO `run_by` KEY: only a run is somebody the record can look up', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { name: 'Order clay' }, person));
  sql.exec("UPDATE event SET actor = 'rule:tidy' WHERE rowid = (SELECT MAX(rowid) FROM event)");
  value(k.create('tasks', { name: 'Renew the domain' }, person));

  const lines: Said[] = k.eventsBefore(null, 100);
  assert.ok(by(lines, 'p_owner').length >= 1 && by(lines, 'rule:tidy').length === 1);
  for (const l of lines) assert.equal('run_by' in l, false, `${l.actor} answered run_by`);
});

test('A RUN SINCE ENDED OR REMOVED STILL SAYS WHO IT WAS, and a handle no run holds answers null', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { name: 'Fire the bowls' }, as({ client_id: 'c1', agent: 'claude', client: 'claude-code' })));
  value(k.create('tasks', { name: 'Glaze the lids' }, as({ client_id: 'c2', agent: 'claude', client: 'claude-desktop' })));
  sql.exec("UPDATE entry SET state = 'done' WHERE register = 'session' AND seq = 1");
  sql.exec("UPDATE entry SET deleted_at = '2026-10-13T08:00:00.000Z' WHERE register = 'session' AND seq = 2");
  sql.exec("UPDATE event SET actor = 'S99' WHERE rowid = (SELECT MIN(rowid) FROM event WHERE actor = 'S2')");
  assert.equal(k.get('S2'), null);

  const lines: Said[] = k.eventsBefore(null, 100);
  assert.deepEqual(by(lines, 'S1')[0]?.run_by, { run: 'S1', agent: 'claude', client: 'claude-code', parent: null });
  assert.deepEqual(by(lines, 'S2')[0]?.run_by, { run: 'S2', agent: 'claude', client: 'claude-desktop', parent: null });
  const stray = by(lines, 'S99');
  assert.equal(stray.length, 1);
  assert.equal(stray[0]!.run_by, null);
});

test('EACH RUN IS READ ONCE FOR A PAGE OF LINES, however many of them it signed', async () => {
  const { k, reads } = await record();
  value(k.create('tasks', { name: 'Zero' }, person));
  const run = as({ client_id: 'c1', agent: 'claude', client: 'claude-code' });
  for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) value(k.create('tasks', { name }, run));

  reads.bySeq = 0;
  const lines: Said[] = k.eventsBefore(null, 100);
  assert.ok(by(lines, 'S1').length >= 5, 'the run signed fewer lines than it wrote');
  assert.equal(reads.bySeq, 1);

  /* A page with no run on it reads none. */
  reads.bySeq = 0;
  const oldest = lines.filter((l) => l.actor !== 'S1').at(-1);
  assert.ok(oldest, 'the person signed no line');
  assert.deepEqual(k.eventsBefore(oldest.rowid + 1, 1).map((l) => l.actor), [oldest.actor]);
  assert.equal(reads.bySeq, 0);
});
