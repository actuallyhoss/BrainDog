/**
 * A `where:` over a list of things that are not text, asked of a real record.
 *
 * `list` IS NOT A TYPE ON ITS OWN. A declaration says what a list holds — `of: 'ref'`, `of: 'int'`,
 * `of: 'day'` — and the schema the `where` compiler reads did not carry it, so every list looked
 * like a `list<text>` to the half of the grammar people actually write. `projects has Kiln`
 * compiled to a search for the four letters `Kiln` in a column holding an id: it parsed, it
 * installed, it ran, and it matched nothing, for ever. Four fields in the shipped seed are
 * `list<ref>`.
 *
 * WHICH IS WHY THE PROOF IS HERE AND NOT ONLY IN `where`. That package's own tests can hand its
 * compiler any schema they like; what was actually broken was the projection in this file — the
 * declaration has said `of:` since the first version, and `schemaOf` dropped it on the way past. A
 * test that builds the schema by hand would have passed on both sides of the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Things',
    title: 'name',
    fields: [{ id: 'name', type: 'text', required: true }],
  } as never,
};

/* THE SHIPPED SHAPE, not one invented for the test: `people.projects` is `list<ref> → things`. */
const PEOPLE: Declaration = {
  id: 'register.folk',
  kind: 'register',
  body: {
    id: 'folk',
    name: 'Folk',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'seats', type: 'list', of: 'int' },
      { id: 'dates', type: 'list', of: 'day' },
      { id: 'handles', type: 'list', of: 'text' },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; kiln: string; marlow: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([THINGS, PEOPLE])).ok);
  const made = (name: string): string => {
    const out = k.create('things', { name }, { actor: 'p_1' }) as { ok: boolean; value: { id: string } };
    assert.ok(out.ok, `${name} was not created`);
    return out.value.id;
  };
  return { k, sql, kiln: made('Kiln'), marlow: made('Marlow & Co') };
}

const named = (out: unknown): string[] => {
  const x = out as { ok: boolean; value: { rows: { fields: { name: string } }[] }; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value.rows.map((r) => r.fields.name);
};

test('A SPOKEN `has` OVER A `list<ref>` FINDS THE ROW, and it used to search a column of ids for a title', async () => {
  const { k, sql, kiln, marlow } = await record();
  assert.ok(k.create('folk', { name: 'Ada', projects: [kiln] }, { actor: 'p_1' }).ok);
  assert.ok(k.create('folk', { name: 'Blaise', projects: [marlow] }, { actor: 'p_1' }).ok);
  assert.ok(k.create('folk', { name: 'Cleo', projects: [kiln, marlow] }, { actor: 'p_1' }).ok);

  assert.deepEqual(named(k.list({ register: 'folk', where: 'projects has Kiln', order: [{ field: 'name', dir: 'asc' }] })), ['Ada', 'Cleo']);
  assert.deepEqual(named(k.list({ register: 'folk', where: 'projects lacks Kiln', order: [{ field: 'name', dir: 'asc' }] })), ['Blaise']);
  assert.deepEqual(named(k.list({ register: 'folk', where: 'projects has Marlow & Co', order: [{ field: 'name', dir: 'asc' }] })), ['Blaise', 'Cleo']);

  /* AND THE STRUCTURED FORM AGREES, asked with the id the sentence resolved to. Two renderings of
     one grammar giving different answers over the same rows is the failure both are written
     against, and the only way to know they agree is to ask them both. */
  assert.deepEqual(named(k.list({ register: 'folk', where: { field: 'projects', has: kiln }, order: [{ field: 'name', dir: 'asc' }] })), ['Ada', 'Cleo']);

  /* A ROW THAT IS NOT THERE IS REFUSED rather than compiled into a clause that matches nothing.
     `declare` treats `REF_UNKNOWN` as survivable — a title may be written tomorrow — so the code
     matters as much as the refusal. */
  const missing = k.list({ register: 'folk', where: 'projects has Nowhere Ltd' }) as { ok: boolean; refusal?: { code: string } };
  assert.equal(missing.ok, false);
  assert.equal(missing.refusal?.code, 'REF_UNKNOWN');
  sql.close();
});

test('AND A LIST OF NUMBERS, OF DAYS AND OF TEXT EACH READ IN THEIR OWN TYPE', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('folk', { name: 'Ada', seats: [1, 3], dates: ['2026-09-05'], handles: ['@ada'] }, { actor: 'p_1' }).ok);
  assert.ok(k.create('folk', { name: 'Blaise', seats: [2], dates: ['2026-10-01'], handles: ['@blaise'] }, { actor: 'p_1' }).ok);

  /* SQLITE COMPARES `3 = '3'` ACROSS STORAGE CLASSES AND ANSWERS FALSE, so the row holding three
     was the one row `seats has 3` could not find. */
  assert.deepEqual(named(k.list({ register: 'folk', where: 'seats has 3' })), ['Ada']);
  assert.deepEqual(named(k.list({ register: 'folk', where: 'seats has 2' })), ['Blaise']);

  /* A DAY READS THE WORDS THE REST OF THE GRAMMAR READS, as `before` and `after` already did. */
  assert.deepEqual(named(k.list({ register: 'folk', where: 'dates has today' })), ['Ada']);
  assert.deepEqual(named(k.list({ register: 'folk', where: 'dates has 2026-10-01' })), ['Blaise']);

  /* AND TEXT IS UNCHANGED, which is what most lists are and the half that always worked. */
  assert.deepEqual(named(k.list({ register: 'folk', where: 'handles has @ada' })), ['Ada']);

  /* A WORD THAT IS NOT A NUMBER IS A REFUSAL, not a clause quietly looking for the characters. */
  const said = k.list({ register: 'folk', where: 'seats has three' }) as { ok: boolean; refusal?: { code: string } };
  assert.equal(said.ok, false);
  assert.equal(said.refusal?.code, 'VALUE_MALFORMED');
  sql.close();
});
