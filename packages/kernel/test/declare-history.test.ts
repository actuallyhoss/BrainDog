/**
 * Every schema change leaves a `declare` event: who made it, the version it made, and the fields it added or took off.
 *
 * MEASURED: a change that gave Projects a `domain` wrote no event at all, and nothing in the tree emitted `declare`,
 * though it is one of the five declaration kinds (`events.ts`). The `declaration` table has no actor column, so "who
 * added domain to Projects, and when" was answerable only by diffing version bodies, and not at all for who. Through an
 * accepted change the `decision` row named the decider and the proposer was lost from the schema's own history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

type Field = Record<string, unknown>;

const NAME: Field = { id: 'name', type: 'text', required: true };
const LANE: Field = { id: 'lane', type: 'enum', values: ['building', 'live'] };
const DOMAIN: Field = { id: 'domain', type: 'text' };
const HOSTING: Field = { id: 'hosting', type: 'text' };

const projects = (fields: Field[]): Declaration => ({
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields } as never,
});

type Row = { actor: string; target: string; target_kind: string; from_v: string | null; to_v: string; note: string | null };
const declared = (sql: NodeSql): Row[] =>
  sql.all<Row>("SELECT actor, target, target_kind, from_v, to_v, note FROM event WHERE kind = 'declare' ORDER BY rowid").map((r) => ({ ...r }));

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  return { k, sql };
}

test('A LIST DECLARED AND THEN CHANGED BY SOMEONE LEAVES ONE LINE EACH, naming them, the version and the fields', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME, LANE])], undefined, { actor: 'p_owner' })).ok);
  const out = await k.install([projects([NAME, LANE, DOMAIN, HOSTING])], undefined, { actor: 'p_owner' });
  assert.ok(out.ok, fixOf(out));

  assert.deepEqual(declared(sql), [
    { actor: 'p_owner', target: 'declaration:register.things', target_kind: 'declaration', from_v: null, to_v: '1', note: 'Added name and lane.' },
    { actor: 'p_owner', target: 'declaration:register.things', target_kind: 'declaration', from_v: '1', to_v: '2', note: 'Added domain and hosting.' },
  ]);
});

test('A RETIRE AND A DROP ARE BOTH SAID AS TAKEN OFF', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME, LANE, DOMAIN, HOSTING])], undefined, { actor: 'p_owner' })).ok);
  assert.ok((await k.install([projects([NAME, LANE, { ...DOMAIN, retired: true }])], undefined, { actor: 'p_owner' })).ok);
  assert.equal(declared(sql).at(-1)?.note, 'Took off domain and hosting.');
});

test('AN ACCEPTED CHANGE IS SIGNED BY WHOEVER DECIDED IT, AND NAMES WHOEVER PROPOSED IT', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME, LANE])])).ok);
  /* THE SUGGESTION ROW AS `propose` LEAVES IT, written directly: what the install reads of it is `opened_by`, and going
     through the gate here would test the gate. The record accepts it and then calls `install`, as below. */
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG7', 'change', '{}', 'resolved', 'agent:claude', ?)",
    new Date(NOW).toISOString(),
  );

  const out = await k.install([projects([NAME, LANE, DOMAIN])], undefined, { actor: 'p_owner', suggestion: 'SG7' });
  assert.ok(out.ok, fixOf(out));
  const last = declared(sql).at(-1)!;
  assert.equal(last.actor, 'p_owner');
  assert.equal(last.to_v, '2');
  assert.equal(last.note, 'Added domain. Proposed by agent:claude in SG7.');
});

/* SIGNED AS `system` THIS FAILED THREE OTHER FILES: `rules.test.ts` read `system/declare/—` three times ahead of the row
   events it asserts, and the activity feed in `pages-computed.test.ts` drew six lines where it drew three, one per list
   the fixture's setup declared. A record's setup declares dozens, so the owner's first feed would open on a wall of
   them. An install nobody is named for is setup, and the pack path already writes its own `install` line for it. */
test('AN INSTALL NOBODY IS NAMED FOR IS SETUP, AND WRITES NO LINE', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME])])).ok);
  assert.ok((await k.install([projects([NAME, LANE])])).ok);
  assert.deepEqual(declared(sql), []);
});

test('A CHANGE THAT CHANGES NOTHING, OR IS REFUSED, WRITES NO LINE', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME, LANE])], undefined, { actor: 'p_owner' })).ok);
  assert.ok((await k.install([projects([NAME, LANE])], undefined, { actor: 'p_owner' })).ok);
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building' }, { actor: 'p_1' }).ok);
  assert.equal((await k.install([projects([NAME])], undefined, { actor: 'p_owner' })).ok, false);
  /* And one read at a version that has since moved. */
  assert.equal((await k.install([projects([NAME, LANE, DOMAIN])], { id: 'register.things', version: 0 }, { actor: 'p_owner' })).ok, false);
  assert.equal(declared(sql).length, 1);
});

test('A PAGE IS A DECLARATION TOO, and its line says only who and which version', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([projects([NAME])])).ok);
  const page: Declaration = { id: 'page.work', kind: 'page', body: {
    page: 'work',
    title: 'Work',
    requires: ['register.things'],
    blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'name' }], empty: 'None.' }],
  } as never };
  const out = await k.install([page], undefined, { actor: 'p_owner' });
  assert.ok(out.ok, fixOf(out));
  const last = declared(sql).at(-1)!;
  assert.deepEqual([last.actor, last.target, last.to_v, last.note], ['p_owner', 'declaration:page.work', '1', null]);
});
