/**
 * A list declaring `same:` keys its rows by what they say (AGT-C13): `same:<list>:<where>:<what>`, one live row per key
 * and the first keeps it, as a person's keys are kept. Two skills called `Ponytail` and `ponytail (copy)` in one
 * project are one thing; the same name in two projects is two; `exact` keeps the spellings apart. A person's keys are
 * what they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { entityLists, keyLists, rekey, rowKeys, sameLists, type KeyedRow, type SameList } from '../src/entities.ts';
import { sameFold } from '../src/identity-keys.ts';
import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const listOf = (id: string, fold: 'text' | 'exact'): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'name',
    fields: [{ id: 'name', type: 'text' }, { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } }],
    same: { fields: ['name'], within: 'project', fold },
  },
});
const SKILLS = listOf('skills', 'text');
const TOOLS = listOf('tools', 'exact');

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The lists as they stood before they said what makes two rows one, so duplicates can already be on the record. */
const plain = (d: Declaration): Declaration => {
  const { same: _same, ...body } = d.body as Record<string, unknown>;
  return { ...d, body } as Declaration;
};

/** A record with its duplicates written first, as his is: the lists learn `same:` afterwards, in the next version. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; learn: () => Promise<void> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE, plain(SKILLS), plain(TOOLS)]));
  return { k, sql, learn: async () => void value(await k.install([SKILLS, TOOLS])) };
}

const holder = (sql: NodeSql, key: string): string | undefined => sql.one<{ row_id: string }>('SELECT row_id FROM entity_key WHERE key = ?', key)?.row_id;
const sameKeys = (sql: NodeSql): Record<string, string> =>
  Object.fromEntries(sql.all<{ key: string; row_id: string }>("SELECT key, row_id FROM entity_key WHERE key LIKE 'same:%'").map((r) => [r.key, r.row_id]));
const listNamed = (id: string): SameList => sameLists([SKILLS.body, TOOLS.body] as never).find((l) => l.register === id)!;
const rowOf = (e: Entry, deleted = false): KeyedRow => ({ id: e.id, register: e.register, fields: e.fields, deleted_at: deleted ? new Date(NOW).toISOString() : null });

test('THE FOLD: text drops a last word in brackets and a file ending, exact only trims', () => {
  assert.equal(sameFold('ponytail (copy)', 'text'), 'ponytail');
  assert.equal(sameFold('ponytail.md', 'text'), 'ponytail');
  assert.equal(sameFold('  Ponytail  ', 'text'), 'ponytail');
  assert.equal(sameFold('Café   crème [old].txt', 'text'), 'cafe creme');
  assert.equal(sameFold('(draft)', 'text'), '(draft)', 'nothing left would be no name');
  assert.equal(sameFold('a.b.c', 'text'), 'a.b', 'one ending, not every dot');
  assert.equal(sameFold('  Ponytail ', 'exact'), 'Ponytail');
});

test('A LIST DECLARING same IS ITS OWN ROLE, read whole, and never an entity', () => {
  const lists = [PROJECTS.body, PEOPLE.body, SKILLS.body] as never;
  assert.deepEqual(sameLists(lists), [{ register: 'skills', role: 'same', fields: {}, same: { fields: ['name'], within: 'project', fold: 'text', keep: 'oldest' } }]);
  assert.deepEqual(entityLists(lists).map((l) => l.register), ['people', 'things']);
  assert.deepEqual(keyLists(lists).map((l) => `${l.register} ${l.role}`), ['people meets', 'things project', 'skills same']);
  /* A rule naming a field the list has lost is no rule, and keys nothing. */
  assert.deepEqual(sameLists([{ ...SKILLS.body, same: { fields: ['title'], fold: 'text' } }] as never), []);
});

test('TWO SKILLS ONE PROJECT CALLS Ponytail AND ponytail (copy) SHARE A KEY, and another project’s Ponytail does not', async () => {
  const { k, sql, learn } = await record();
  const web = value<Entry>(k.create('things', { name: 'Web' }, OWNER));
  const app = value<Entry>(k.create('things', { name: 'App' }, OWNER));
  const first = value<Entry>(k.create('skills', { name: 'Ponytail', project: web.id }, OWNER));
  const copy = value<Entry>(k.create('skills', { name: 'ponytail (copy)', project: web.id }, OWNER));
  const elsewhere = value<Entry>(k.create('skills', { name: 'Ponytail', project: app.id }, OWNER));
  const everywhere = value<Entry>(k.create('skills', { name: 'ponytail.md' }, OWNER));
  const nameless = value<Entry>(k.create('skills', { name: '  ', project: web.id }, OWNER));
  await learn();
  const list = listNamed('skills');
  const key = `same:skills:${web.id}:ponytail`;
  assert.deepEqual(rowKeys(list, first.fields), [key]);
  assert.deepEqual(rowKeys(list, copy.fields), [key]);
  assert.deepEqual(rowKeys(list, elsewhere.fields), [`same:skills:${app.id}:ponytail`]);
  assert.deepEqual(rowKeys(list, everywhere.fields), ['same:skills:*:ponytail'], 'no project is everywhere');
  assert.deepEqual(rowKeys(list, nameless.fields), [], 'an empty name says nothing');

  k.rebuildKeys();
  assert.deepEqual(sameKeys(sql), { 'same:skills:*:ponytail': everywhere.id, [`same:skills:${app.id}:ponytail`]: elsewhere.id, [key]: first.id });
  sql.close();
});

test('exact KEEPS Ponytail AND ponytail APART', async () => {
  const { k, sql, learn } = await record();
  const web = value<Entry>(k.create('things', { name: 'Web' }, OWNER));
  const upper = value<Entry>(k.create('tools', { name: 'Ponytail', project: web.id }, OWNER));
  const lower = value<Entry>(k.create('tools', { name: 'ponytail ', project: web.id }, OWNER));
  await learn();
  const list = listNamed('tools');
  assert.deepEqual(rowKeys(list, upper.fields), [`same:tools:${web.id}:Ponytail`]);
  assert.deepEqual(rowKeys(list, lower.fields), [`same:tools:${web.id}:ponytail`]);
  k.rebuildKeys();
  assert.equal(holder(sql, `same:tools:${web.id}:Ponytail`), upper.id);
  assert.equal(holder(sql, `same:tools:${web.id}:ponytail`), lower.id);
  sql.close();
});

test('THE FIRST LIVE ROW HOLDS THE KEY, a deleted one frees it, and the second holds it after a rebuild', async () => {
  const { k, sql, learn } = await record();
  const web = value<Entry>(k.create('things', { name: 'Web' }, OWNER));
  const first = value<Entry>(k.create('skills', { name: 'Ponytail', project: web.id }, OWNER));
  const copy = value<Entry>(k.create('skills', { name: 'ponytail (copy)', project: web.id }, OWNER));
  await learn();
  const list = listNamed('skills');
  const key = `same:skills:${web.id}:ponytail`;
  const at = new Date(NOW).toISOString();

  /* KEPT AS A PERSON'S ARE, one write at a time: the second to say it holds nothing. */
  rekey(sql, list, null, rowOf(first), 'p_owner', at);
  rekey(sql, list, null, rowOf(copy), 'p_owner', at);
  assert.equal(holder(sql, key), first.id);
  rekey(sql, list, rowOf(first), rowOf(first, true), 'p_owner', at);
  assert.equal(holder(sql, key), undefined, 'a deleted row frees its key');

  /* And from the rows: the deleted first holds nothing, so the copy does. */
  rekey(sql, list, null, rowOf(first), 'p_owner', at);
  value(k.update('skills', first.id, { deleted_at: at } as never, OWNER));
  k.rebuildKeys();
  assert.deepEqual(sameKeys(sql), { [key]: copy.id });
  sql.close();
});

test('A PERSON’S KEYS ARE WHAT THEY WERE, beside a list declaring same', async () => {
  const { k, sql, learn } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada', email: 'Ada.L@gmail.com', handles: ['github:ada'] }, OWNER));
  const people = keyLists([PEOPLE.body, SKILLS.body] as never).find((l) => l.register === 'people')!;
  assert.equal(people.role, 'meets');
  assert.deepEqual(rowKeys(people, ada.fields).sort(), ['email:adal@gmail.com', 'github:ada']);
  value(k.create('skills', { name: 'Ada' }, OWNER));
  await learn();
  k.rebuildKeys();
  const all = sql.all<{ key: string; row_id: string }>('SELECT key, row_id FROM entity_key ORDER BY key');
  assert.deepEqual(
    Object.fromEntries(all.filter((r) => !r.key.startsWith('same:')).map((r) => [r.key, r.row_id])),
    { 'email:adal@gmail.com': ada.id, 'github:ada': ada.id },
  );
  assert.deepEqual(Object.keys(sameKeys(sql)), ['same:skills:*:ada']);
  sql.close();
});
