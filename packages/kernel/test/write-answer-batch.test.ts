/**
 * A write answers the batch it was written under, so a receipt's Undo asks the record to put back that write and all it
 * caused (`undoPlan`, `undoApply`); and a page's list says who changed a row for the reader, with the run, its agent, the
 * app it ran in and the person it acts for, for the byline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type PageBlock, type RowChange, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', state: 'state', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' }] } as never,
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
  value(await k.install([TASKS]));
  return { k, sql, clock };
}

test('A WRITE ANSWERS ITS BATCH, and that batch is what Undo puts back', async () => {
  const { k, sql } = await record();
  const made = value<Entry>(k.create('tasks', { what: 'Glaze test' }, OWNER));
  assert.equal(typeof made.batch, 'string');
  const moved = value<Entry>(k.update('tasks', made.id, { state: 'done' }, OWNER));
  assert.equal(typeof moved.batch, 'string');
  assert.notEqual(moved.batch, made.batch);
  const given = value<Entry>(k.update('tasks', made.id, { what: 'Glaze test two' }, { ...OWNER, batch: 'b_mine' }));
  assert.equal(given.batch, 'b_mine', 'a batch the caller gave is the one answered');
  const plan = value<{ hash: string }>(k.undoPlan({ batch: moved.batch! }));
  value(k.undoApply({ batch: moved.batch! }, plan.hash, 'p_owner'));
  assert.equal(k.get(made.id)?.fields.state, 'open');
  assert.equal(k.get(made.id)?.batch, undefined, 'a read is no write, and carries none');
  sql.close();
});

test('A ROW A RUN CHANGED SAYS WHICH RUN, ITS AGENT, ITS APP AND WHOM IT ACTS FOR, and the batch to undo it', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_cc', 'p_owner', 'h', 'write', '2026-10-01T00:00:00.000Z')");
  const run: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_cc' }, session: { client: 'claude-code', client_id: 'cc', host: 'h' } };
  const mine = value<Entry>(k.create('tasks', { what: 'Mine' }, OWNER));
  const theirs = value<Entry>(k.create('tasks', { what: 'Theirs' }, run));
  const block = k.block({ kind: 'list', source: 'register.tasks', columns: [{ field: 'what' }], order: [{ field: 'what', dir: 'asc' }], empty: 'None.' } as PageBlock) as unknown as {
    rows: Entry[];
    changes?: (RowChange | null)[];
  };
  assert.deepEqual(block.rows.map((r) => r.fields.what), ['Mine', 'Theirs']);
  assert.equal(block.changes?.length, 2, 'aligned with the rows');
  assert.equal(block.changes?.[0], null, 'a person’s own row wears no byline');
  const said = block.changes?.[1];
  assert.equal(said?.by, 'agent');
  assert.match(said?.run ?? '', /^S\d+$/);
  assert.equal(said?.app, 'Claude Code');
  assert.equal(said?.for, 'p_owner');
  assert.equal(said?.batch, theirs.batch);
  assert.ok(mine.batch);
  sql.close();
});
