/**
 * A retire leaves a `declare` line naming who took the declaration off, as a change does.
 *
 * MEASURED BEFORE THIS FILE. `declared()` was called only from `install`, and `retire` wrote nothing: `setDeclaration`
 * wrote `Added name.` by `p_1`, `retireDeclaration` then retired Projects, and the `declare` lines were unchanged, one
 * row. "Who took Projects off" had no answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

type Row = { actor: string; target: string; from_v: string | null; to_v: string; note: string | null };
const declared = (sql: NodeSql): Row[] =>
  sql.all<Row>("SELECT actor, target, from_v, to_v, note FROM event WHERE kind = 'declare' ORDER BY rowid").map((r) => ({ ...r }));

test('A RETIRE BY SOMEONE WRITES ONE LINE naming them, the version it retired and the word', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([PROJECTS], undefined, { actor: 'p_1' })).ok);
  const out = k.retire(['register.things'], { actor: 'p_owner' });
  assert.ok(out.ok, fixOf(out));

  assert.deepEqual(declared(sql), [
    { actor: 'p_1', target: 'declaration:register.things', from_v: null, to_v: '1', note: 'Added name.' },
    { actor: 'p_owner', target: 'declaration:register.things', from_v: '1', to_v: '1', note: 'Retired.' },
  ]);
});

test('AN ID THAT WAS NOT LIVE WRITES NO LINE beside one that was', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([PROJECTS])).ok);
  assert.ok(k.retire(['register.nosuch', 'register.things'], { actor: 'p_owner' }).ok);
  assert.deepEqual(
    declared(sql).map((r) => [r.actor, r.target, r.note]),
    [['p_owner', 'declaration:register.things', 'Retired.']],
  );
});

test('A RETIRE NOBODY SIGNED WRITES NO LINE, as an unsigned install writes none', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([PROJECTS])).ok);
  assert.ok(k.retire(['register.things']).ok);
  assert.deepEqual(declared(sql), []);
});

test('A REFUSED RETIRE WRITES NO LINE', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.equal(k.retire(['register.session'], { actor: 'p_owner' }).ok, false);
  assert.deepEqual(declared(sql), []);
});
