/**
 * A project's keys: the repositories, folders and domains its row lists are claimed in `entity_key`,
 * so a place or a site finds the project without the list being read whole; its name is a weak key, which proposes a
 * candidate and never decides alone; and two projects of one name, or of one repository, are both found and never tied.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { claimed, entityLists, holderOf, keyedLists, rebuildKeys, rekey, rowKeys, settledBy, type EntityList, type KeyedRow } from '../src/entities.ts';
import { isWeakKey, keyOf, keysOf } from '../src/identity-keys.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const AT = new Date(NOW).toISOString();
const OWNER: WriteContext = { actor: 'p_owner' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
      { id: 'domains', type: 'list', of: 'text' },
    ],
  },
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Bench = { sql: NodeSql; list: EntityList; add: (fields: Record<string, unknown>) => Entry; org: (fields: Record<string, unknown>) => Entry };

/** A record with the two lists, and a project added and keyed the way the write path keys a row. */
async function bench(): Promise<Bench> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS]));
  const lists = entityLists([PROJECTS.body, ORGS.body] as never);
  const list = lists.find((l) => l.role === 'project');
  assert.ok(list, 'the list declaring scopes: is not one of the entity lists');
  const add = (fields: Record<string, unknown>): Entry => {
    const made = value<Entry>(k.create('things', fields as never, OWNER));
    rekey(sql, list, null, made as KeyedRow, 'test', AT);
    return made;
  };
  return { sql, list, add, org: (fields) => value<Entry>(k.create('organisations', fields as never, OWNER)) };
}

const NORTHBANK = {
  name: 'Northbank',
  repos: ['git@github.com:Mara/Northbank.git', 'northbank-site', 'C:\\Repos\\northbank'],
  folders: ['/Users/mara/Developer/northbank/'],
  domains: ['https://www.northbank.example/pricing'],
};

test('THE PROJECT LIST IS AN ENTITY LIST, beside people and organisations, and the two that fold stay two', () => {
  const lists = entityLists([PROJECTS.body, ORGS.body] as never);
  assert.deepEqual(lists.map((l) => `${l.register}:${l.role}`).sort(), ['organisations:org', 'things:project']);
  assert.deepEqual(keyedLists([PROJECTS.body, ORGS.body] as never).map((l) => l.register), ['organisations'], 'a project is not a list whose rows are merged');
  /* Two lists declaring `scopes:` are no list of projects, as `resolveProject` reads them. */
  const twice = entityLists([PROJECTS.body, { ...PROJECTS.body, id: 'other' }] as never);
  assert.equal(twice.some((l) => l.role === 'project'), false);
});

test('A PROJECT ROW’S REMOTE, FOLDER AND DOMAIN ARE ITS KEYS, each said the one way, and its name is a weak one', async () => {
  const { sql, list } = await bench();
  const keys = rowKeys(list, NORTHBANK);
  assert.deepEqual(keys, [
    'domain:northbank.example',
    'remote:github.com/mara/northbank',
    'folder:/Users/mara/Developer/northbank',
    'folder:c:/Repos/northbank',
    'name:northbank',
    'name:northbank-site',
  ]);
  assert.deepEqual(keys.filter(isWeakKey), ['name:northbank', 'name:northbank-site'], 'only a name is weak');
  assert.equal(keyOf('name', '  North   Bank! '), 'name:north bank');
  assert.equal(keyOf('name', ' ... '), null, 'a name of no letters is no key');
  assert.deepEqual(keysOf({ folders: ['/srv/a/', '/srv/a', 'relative/path'], name: 'A' }), ['folder:/srv/a', 'name:a']);
  /* A NAME AMONG AN ORGANISATION'S KEYS IS NOT HELD ALONE, or the next of that name would be refused as it. */
  const orgs = entityLists([PROJECTS.body, ORGS.body] as never).find((l) => l.role === 'org')!;
  assert.deepEqual(rowKeys(orgs, { name: 'Northbank Ltd', domain: 'northbank.example', keys: ['name:Northbank Ltd', 'github:northbank'] }), ['github:northbank', 'domain:northbank.example']);
  sql.close();
});

test('A PLACE OR A SITE FINDS THE PROJECT AND SETTLES IT; ITS NAME ONLY PROPOSES IT', async () => {
  const { sql, list, add } = await bench();
  const north = add(NORTHBANK);
  add({ name: 'Kiln', repos: ['https://github.com/mara/kiln'] });

  for (const key of [keyOf('remote', 'https://github.com/mara/northbank')!, keyOf('folder', '/Users/mara/Developer/northbank')!, keyOf('domain', 'northbank.example')!]) {
    const found = claimed(sql, list.register, [key]);
    assert.deepEqual(found, [{ id: north.id, keys: [key], weak: false }], key);
    assert.equal(settledBy(found), north.id, key);
  }
  const named = claimed(sql, list.register, [keyOf('name', 'northbank')!]);
  assert.deepEqual(named, [{ id: north.id, keys: ['name:northbank'], weak: true }]);
  assert.equal(settledBy(named), null, 'a name decided alone');
  /* A name beside a place: the place decides, and the name is only one more thing it answered to. */
  const both = claimed(sql, list.register, ['name:northbank', 'remote:github.com/mara/northbank']);
  assert.equal(settledBy(both), north.id);
  assert.equal(both[0]?.weak, false);
  assert.deepEqual(claimed(sql, list.register, ['remote:github.com/someone/northbank']), [], 'a fork is not the project');
  sql.close();
});

test('TWO PROJECTS OF ONE NAME ARE NOT TIED: both are proposed, neither is chosen, and each keeps its own places', async () => {
  const { sql, list, add } = await bench();
  const a = add({ name: 'Web', repos: ['github.com/mara/web'] });
  const b = add({ name: 'web', repos: ['github.com/kiln/web'] });
  const named = claimed(sql, list.register, ['name:web']);
  assert.deepEqual(named.map((f) => f.id), [a.id, b.id]);
  assert.equal(settledBy(named), null);
  assert.equal(settledBy(claimed(sql, list.register, ['remote:github.com/kiln/web'])), b.id);
  assert.equal(settledBy(claimed(sql, list.register, ['name:web', 'remote:github.com/mara/web'])), a.id, 'the place did not pick among the two names');

  /* AND TWO THAT LIST ONE REPOSITORY, a monorepo's two projects: both found, and nothing settled, as `matchProject` says. */
  const c = add({ name: 'Docs', repos: ['github.com/kiln/web'] });
  const shared = claimed(sql, list.register, ['remote:github.com/kiln/web']);
  assert.deepEqual(shared.map((f) => f.id), [b.id, c.id]);
  assert.equal(settledBy(shared), null);
  sql.close();
});

test('A PROJECT’S KEYS FOLLOW ITS ROW: an edit drops what it no longer lists, and a deleted project answers to nothing', async () => {
  const { sql, list, add } = await bench();
  const north = add(NORTHBANK);
  const moved: KeyedRow = { ...(north as KeyedRow), fields: { name: 'Northbank', repos: ['github.com/mara/north'] } };
  rekey(sql, list, north as KeyedRow, moved, 'test', AT);
  assert.deepEqual(claimed(sql, list.register, ['remote:github.com/mara/northbank', 'domain:northbank.example']), []);
  assert.equal(settledBy(claimed(sql, list.register, ['remote:github.com/mara/north'])), north.id);
  rekey(sql, list, moved, { ...moved, deleted_at: AT }, 'test', AT);
  assert.deepEqual(claimed(sql, list.register, ['remote:github.com/mara/north', 'name:northbank']), []);
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entity_key WHERE row_id = ?', north.id)?.n), 0);
  sql.close();
});

test('A PROJECT’S DOMAIN DOES NOT TAKE AN ORGANISATION’S, nor block it: one site, a company and its project', async () => {
  const { sql, list, add, org } = await bench();
  const north = add(NORTHBANK);
  const company = org({ name: 'Northbank Ltd', domain: 'northbank.example' });
  assert.deepEqual(holderOf(sql, 'domain:northbank.example'), { register: 'organisations', id: company.id });
  assert.equal(settledBy(claimed(sql, list.register, ['domain:northbank.example'])), north.id);

  /* THE REBUILD SAYS THE SAME, twice over: what an import and a migration leave is what the write path left. */
  const before = sql.all<{ key: string; row_id: string }>('SELECT key, row_id FROM entity_key ORDER BY key');
  for (let n = 0; n < 2; n++) {
    rebuildKeys(sql, AT);
    assert.deepEqual(sql.all<{ key: string; row_id: string }>('SELECT key, row_id FROM entity_key ORDER BY key'), before);
  }
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(DISTINCT row_id) AS n FROM entity_key WHERE register = ?', list.register)?.n), 1, 'projects that hold a key');
  sql.close();
});
