/**
 * A register change that leaves out a field the rows still hold a value for is refused, and retiring it is not.
 *
 * MEASURED IN `loop/research-shell-schema.md` blocker 2. Two agents each added a field to Projects from one reading,
 * and the owner accepted both: the second install carried a body without `domain` while row 1 held
 * `"domain":"https://kiln.example/"`. `contradicted` asked about retypes, narrowed lists, new required fields and
 * dangling refs, and `stranded` about readers, and a field that was simply absent passed both. The value stayed in the
 * row's JSON, was carried through every later edit, and was invisible to every reader that goes through the schema.
 *
 * THE RECORD ALREADY HAS THE HONEST FORM OF REMOVAL, `retired: true`, which both checks understand, so the refusal
 * points at it rather than at a flag that forces the drop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

type Field = Record<string, unknown>;

const NAME: Field = { id: 'name', type: 'text', required: true };
const LANE: Field = { id: 'lane', type: 'enum', values: ['building', 'live'] };
const DOMAIN: Field = { id: 'domain', type: 'text' };

const projects = (fields: Field[]): Declaration => ({
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields } as never,
});

const version = (sql: NodeSql) =>
  sql.one<{ v: number }>("SELECT version AS v FROM declaration WHERE id = 'register.things' AND superseded_at IS NULL")?.v;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([projects([NAME, LANE, DOMAIN])])).ok);
  return { k, sql };
}

test('A FIELD LEFT OUT WHILE A ROW HOLDS IT IS REFUSED, and the list stays as it was', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building', domain: 'https://kiln.example/' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Loom', lane: 'live', domain: 'https://loom.example/' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Anvil', lane: 'live' }, { actor: 'p_1' }).ok);

  const out = await k.install([projects([NAME, LANE])]);
  assert.equal(codeOf(out), 'WOULD_ORPHAN');
  assert.equal(fixOf(out), '2 rows hold domain. Mark it retired rather than leaving it out.');
  assert.equal(version(sql), 1);
});

test('ONE ROW IS SAID AS ONE', async () => {
  const { k } = await record();
  assert.ok(k.create('things', { name: 'Kiln', domain: 'https://kiln.example/' }, { actor: 'p_1' }).ok);
  assert.equal(fixOf(await k.install([projects([NAME, LANE])])), '1 row holds domain. Mark it retired rather than leaving it out.');
});

test('RETIRING THE SAME FIELD OVER THE SAME ROWS IS TAKEN, and the value stays in the row', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('things', { name: 'Kiln', domain: 'https://kiln.example/' }, { actor: 'p_1' }).ok);
  const out = await k.install([projects([NAME, LANE, { ...DOMAIN, retired: true }])]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(version(sql), 2);
  assert.match(sql.one<{ f: string }>("SELECT fields AS f FROM entry WHERE register = 'things'")!.f, /kiln\.example/);
});

test('A FIELD NO LIVE ROW HOLDS MAY STILL BE LEFT OUT', async () => {
  const { k, sql } = await record();
  /* One row never had it, and the one that did is deleted: neither is a value this change would hide. */
  assert.ok(k.create('things', { name: 'Anvil' }, { actor: 'p_1' }).ok);
  const gone = k.create('things', { name: 'Kiln', domain: 'https://kiln.example/' }, { actor: 'p_1' });
  assert.ok(gone.ok);
  assert.ok(k.update('things', (gone.value as { id: string }).id, { deleted_at: 'now' } as never, { actor: 'p_1' }).ok);
  const out = await k.install([projects([NAME, LANE])]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(version(sql), 2);
});

test('A FIELD ALREADY RETIRED MAY BE LEFT OUT AFTERWARDS, because its values were already put away on purpose', async () => {
  const { k } = await record();
  assert.ok(k.create('things', { name: 'Kiln', domain: 'https://kiln.example/' }, { actor: 'p_1' }).ok);
  assert.ok((await k.install([projects([NAME, LANE, { ...DOMAIN, retired: true }])])).ok);
  const out = await k.install([projects([NAME, LANE])]);
  assert.ok(out.ok, fixOf(out));
});
