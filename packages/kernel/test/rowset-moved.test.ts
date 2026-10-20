/**
 * Accepting a rowset question whose row moved after it was asked never loops on VERSION_STALE.
 *
 * MEASURED ON THE LIVE RECORD, 20 Oct: "Change the last seen of apify?" was asked, the row was renamed before the owner
 * answered, and every Accept answered "something this would change has changed since it was proposed, read again". The
 * question held the version it was asked at, which no read could change, so it waited until he declined it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { type Decided, type Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

const TOOLS: Declaration = {
  id: 'register.tools',
  kind: 'register',
  body: {
    id: 'tools',
    name: 'Tools',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'seen', type: 'day', label: 'Last seen' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; at: string }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TOOLS]));
  value(k.create('tools', { name: 'apify', seen: '2026-10-01' }, { actor: 'p_owner' }));
  /* PAST THE FIRST MOMENTS OF THE ROW, when an edit by its maker folds into its create line. */
  clock.advance(3_600_000);
  return { k, sql, at: 'tools#1' };
}

const seen = (at: string, day: string) => ({
  question: 'Change the last seen of apify?',
  body_kind: 'rowset' as const,
  body: { register: 'tools', rows: [{ at, version: 1, patch: { seen: day } }] },
});
const accept = (k: Kernel, id: string) => k.decide(id, { decide: { option: 'accept', reason: 'Yes.' } }, 'p_owner');

test('A ROW RENAMED SINCE THE QUESTION TAKES THE ACCEPT ONTO ITS FRESH VERSION, and keeps the rename', async () => {
  const { k, at } = await record();
  const asked = value<Filed>(k.propose(seen(at, '2026-10-19'), 'p_owner'));
  value(k.update('tools', at, { name: 'apify-quartz' }, { actor: 'p_owner', version: 1 }));
  const out = value<Decided>(accept(k, asked.id));
  assert.equal(out.status, 'resolved');
  assert.equal(out.settled, undefined);
  assert.equal(out.wrote.length, 1);
  const row = k.get(at)!;
  assert.equal(row.fields.seen, '2026-10-19');
  assert.equal(row.fields.name, 'apify-quartz', 'the rename was written over');
});

test('A FIELD WRITTEN SINCE TO ANOTHER VALUE SETTLES THE QUESTION IN A PLAIN LINE, writes nothing, and a second Accept does not loop', async () => {
  const { k, sql, at } = await record();
  const asked = value<Filed>(k.propose(seen(at, '2026-10-19'), 'p_owner'));
  value(k.update('tools', at, { seen: '2026-10-20' }, { actor: 'p_owner', version: 1 }));
  const out = value<Decided>(accept(k, asked.id));
  assert.equal(out.decision, null);
  assert.equal(out.status, 'resolved');
  assert.equal(out.settled, 'The last seen of apify changed after this was asked, so nothing was written and the question is closed.');
  assert.equal(k.get(at)!.fields.seen, '2026-10-20', 'the newer last seen was written over');
  assert.equal(sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', asked.id)?.resolved_as, 'moot');
  const again = accept(k, asked.id);
  assert.equal(again.ok, false);
  assert.notEqual((again as { refusal: { code: string } }).refusal.code, 'VERSION_STALE', 'the closed question still answered read again');
});

test('A FIELD WRITTEN SINCE TO THE VERY VALUE ASKED IS NO CLASH, and the rest of the patch applies', async () => {
  const { k, at } = await record();
  const asked = value<Filed>(
    k.propose({ ...seen(at, '2026-10-19'), body: { register: 'tools', rows: [{ at, version: 1, patch: { seen: '2026-10-19', note: 'Quartz only' } }] } }, 'p_owner'),
  );
  value(k.update('tools', at, { seen: '2026-10-19' }, { actor: 'p_owner', version: 1 }));
  const out = value<Decided>(accept(k, asked.id));
  assert.equal(out.settled, undefined);
  assert.equal(k.get(at)!.fields.note, 'Quartz only');
});

test('A ROW THAT DID NOT MOVE IS WRITTEN AS IT ALWAYS WAS', async () => {
  const { k, at } = await record();
  const asked = value<Filed>(k.propose(seen(at, '2026-10-19'), 'p_owner'));
  const out = value<Decided>(accept(k, asked.id));
  assert.equal(out.settled, undefined);
  assert.equal(k.get(at)!.fields.seen, '2026-10-19');
});
