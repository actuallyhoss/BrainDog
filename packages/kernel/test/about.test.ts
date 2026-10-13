/**
 * The about read (ENG-B02, job 3): one read says what a person, an organisation or a project is and where it was seen,
 * and one retrieval hands a model its candidates. A candidate is a handle, a kind, a name, what else it goes by and
 * where it was seen, with no id and no address in it. A key in the text ranks first, then an alias, then a name in the
 * same project; a name proposes and never decides alone; and a deleted or folded row is not answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { aboutOf, aboutOfRow, candidatesFor, keysIn, CANDIDATES, type AboutDeps, type Handed } from '../src/about.ts';
import { entityLists, noteMention, rekey, type KeyedRow } from '../src/entities.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
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
    ],
  },
};

const FOLK: Declaration = {
  id: 'register.folk',
  kind: 'register',
  body: {
    id: 'folk',
    name: 'Folk',
    title: 'name',
    search: ['name'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
    ],
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', aliases: 'aliases' },
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

type Fields = Record<string, unknown>;
type Bench = {
  sql: NodeSql;
  deps: AboutDeps;
  project: (fields: Fields) => Entry;
  person: (fields: Fields) => Entry;
  org: (fields: Fields) => Entry;
  change: (list: string, id: string, patch: Fields) => Entry;
  /** A row left folded into another and not deleted, as a merge half undone or an import leaves one. */
  fold: (id: string, into: string) => void;
  /** A name met in a place, kept the way the record keeps a mention. */
  mention: (name: string, kind: string, where: string, at?: string) => void;
};

/** A record in memory with the three lists. A project is keyed the way the write path keys a row. */
async function bench(): Promise<Bench> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, FOLK, ORGS]));
  const lists = entityLists([PROJECTS.body, FOLK.body, ORGS.body] as never);
  const projects = lists.find((l) => l.role === 'project');
  assert.ok(projects, 'the list declaring scopes: is not one of the entity lists');
  const keyed = (made: Entry): Entry => {
    if (made.register === 'things') rekey(sql, projects, null, made as KeyedRow, 'test', AT);
    return made;
  };
  return {
    sql,
    deps: { sql, lists },
    project: (fields) => keyed(value<Entry>(k.create('things', fields as never, OWNER))),
    person: (fields) => value<Entry>(k.create('folk', fields as never, OWNER)),
    org: (fields) => value<Entry>(k.create('organisations', fields as never, OWNER)),
    change: (list, id, patch) => keyed(value<Entry>(k.update(list, id, patch as never, OWNER))),
    fold: (id, into) => sql.exec("UPDATE entry SET fields = json_set(fields, '$.merged_into', ?) WHERE id = ?", into, id),
    mention: (name, kind, where, at = AT) => noteMention(sql, { name, kind: kind as never, project: null, source: where, at }),
  };
}

const named = (handed: Handed): string[] => handed.candidates.map((c) => c.name);
const handleOf = (handed: Handed, name: string): string => {
  const found = handed.candidates.filter((c) => c.name === name);
  assert.equal(found.length, 1, `${name} was answered ${found.length} times among ${named(handed).join(', ')}`);
  return found[0]!.h;
};

test('A PROJECT IS READ BY ITS HANDLE: its kind, its name, what else it goes by and the note it was seen in', async () => {
  const { deps, project, mention } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git', 'northbank-site'] });
  mention('Northbank', 'project', 'a note from Tuesday');

  const handed = candidatesFor(deps, 'Spoke to Sara at Northbank', northbank.id);
  const about = aboutOf(deps, handed.rows, handleOf(handed, 'Northbank'));
  assert.deepEqual(about, { kind: 'project', name: 'Northbank', also: ['northbank-site'], links: [], seen: [{ at: AT, where: 'a note from Tuesday' }] });
  /* The same read by the row, for a caller that already knows which one it means. */
  assert.deepEqual(aboutOfRow(deps, northbank.id), about);
  /* A handle nobody was handed names nothing. */
  assert.equal(aboutOf(deps, handed.rows, 'northbank'), null);
  assert.equal(aboutOf(deps, handed.rows, northbank.id), null);
});

test('SEEN IS NEWEST FIRST, and a sighting that only names an address or a row is said without it', async () => {
  const { deps, project, mention } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git'] });
  mention('Northbank', 'project', 'a call on Monday', new Date(NOW - 86_400_000).toISOString());
  mention('northbank', 'project', 'mail from sara@quayside.example');
  mention('Northbank', 'project', `row ${northbank.id}`, new Date(NOW - 2 * 86_400_000).toISOString());
  const about = aboutOfRow(deps, northbank.id);
  assert.deepEqual(about?.seen.map((s) => s.where), ['mail from an address', 'a call on Monday']);
});

test('A KEY IN THE TEXT RANKS FIRST, then an alias, then a name in the same project, and no id or address is handed over', async () => {
  const { deps, project, person, org, mention } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git'] });
  const far = person({ name: 'Sara' });
  const near = person({ name: 'Sara', email: 'sara@northbank.example', projects: [northbank.id] });
  const salma = person({ name: 'Salma Idris', aliases: ['Sara'] });
  const quay = org({ name: 'Quayside', domain: 'quayside.example' });
  mention('Quayside', 'organisation', 'an invoice in March');

  const handed = candidatesFor(deps, 'Spoke to Sara at Northbank. She wrote from billing@quayside.example', northbank.id);
  assert.deepEqual(named(handed), ['Quayside', 'Salma Idris', 'Northbank', 'Sara', 'Sara']);
  assert.deepEqual(
    handed.candidates.map((c) => handed.rows.get(c.h)?.id),
    [quay.id, salma.id, northbank.id, near.id, far.id],
    'the Sara of this project is not ranked before the Sara of none',
  );
  assert.deepEqual(handed.candidates.map((c) => handed.rows.get(c.h)?.how), ['key', 'alias', 'name', 'name', 'name']);
  assert.deepEqual(handed.candidates.map((c) => c.kind), ['org', 'person', 'project', 'person', 'person']);
  assert.deepEqual(handed.candidates[0], { h: handed.candidates[0]!.h, kind: 'org', name: 'Quayside', also: [], seen: ['an invoice in March'] });
  assert.deepEqual(handed.candidates[1]!.also, ['Sara']);

  /* NOTHING A MODEL IS SHOWN HOLDS AN ID OR AN ADDRESS, and a handle is not a row's id in another spelling. */
  const shown = JSON.stringify(handed.candidates);
  for (const row of [northbank, far, near, salma, quay]) assert.equal(shown.includes(row.id), false, `${row.fields.name}'s id was handed over`);
  assert.equal(shown.includes('@'), false, 'an address was handed over');
  assert.equal(shown.includes('quayside.example'), false, 'a domain was handed over');
  for (const c of handed.candidates) assert.deepEqual(Object.keys(c), ['h', 'kind', 'name', 'also', 'seen']);

  /* HANDLES ARE MADE PER CALL: the same text asked again hands the same rows other handles. */
  const again = candidatesFor(deps, 'Spoke to Sara at Northbank. She wrote from billing@quayside.example', northbank.id);
  assert.deepEqual(named(again), named(handed));
  assert.equal(again.candidates.some((c) => handed.rows.has(c.h)), false, 'a handle was handed out twice');
});

test('THE CANDIDATES ARE CUT TO TWELVE, and what a key found is kept ahead of the cut', async () => {
  const { deps, person, org } = await bench();
  for (let i = 0; i < 15; i++) person({ name: 'Sara' });
  org({ name: 'Quayside', domain: 'quayside.example' });
  const handed = candidatesFor(deps, 'Sara sent it from https://quayside.example/pay', null);
  assert.equal(CANDIDATES, 12);
  assert.equal(handed.candidates.length, 12);
  assert.equal(handed.candidates[0]!.name, 'Quayside');
  assert.equal(handed.rows.size, 12);
});

test('A NAME PROPOSES AND NEVER DECIDES ALONE: two projects of one name are both answered, and a repository puts one first', async () => {
  const { deps, project, mention } = await bench();
  const one = project({ name: 'Web', repos: ['git@github.com:mara/web.git'] });
  const two = project({ name: 'Web', repos: ['git@github.com:quay/web.git'] });
  mention('Web', 'project', 'a note from Tuesday');

  const byName = candidatesFor(deps, 'Deployed Web today', null);
  assert.deepEqual(byName.candidates.map((c) => byName.rows.get(c.h)?.id), [one.id, two.id]);
  assert.deepEqual(byName.candidates.map((c) => byName.rows.get(c.h)?.how), ['name', 'name'], 'a name was read as a key that decides');
  /* A sighting by a name two rows share is neither one's: nothing says which Web the note meant. */
  assert.deepEqual(byName.candidates.map((c) => c.seen), [[], []]);
  assert.deepEqual(aboutOfRow(deps, one.id)?.seen, []);

  const byPlace = candidatesFor(deps, 'Deployed Web today from https://github.com/quay/web/pull/4', null);
  assert.deepEqual(byPlace.candidates.map((c) => byPlace.rows.get(c.h)?.id), [two.id, one.id]);
  assert.deepEqual(byPlace.candidates.map((c) => byPlace.rows.get(c.h)?.how), ['key', 'name']);
});

test('A DELETED OR FOLDED ROW IS NOT ANSWERED, by its key, by its name or by its row', async () => {
  const { deps, project, person, change, fold } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git'] });
  const sara = person({ name: 'Sara Okafor', email: 'sara@northbank.example' });
  const twin = person({ name: 'Sara O' });
  const text = 'Sara Okafor and Sara O on github.com/mara/northbank, Northbank, sara@northbank.example';
  assert.deepEqual(named(candidatesFor(deps, text, null)).sort(), ['Northbank', 'Sara O', 'Sara Okafor']);

  fold(twin.id, sara.id);
  change('things', northbank.id, { deleted_at: AT });
  assert.deepEqual(named(candidatesFor(deps, text, null)), ['Sara Okafor']);
  assert.equal(aboutOfRow(deps, northbank.id), null);
  assert.equal(aboutOfRow(deps, twin.id), null);
  assert.equal(aboutOfRow(deps, sara.id)?.kind, 'person');
});

test('A LIST THE ASKER MAY NOT READ ANSWERS NOTHING', async () => {
  const { deps, project, person } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git'] });
  const sara = person({ name: 'Sara' });
  const held: AboutDeps = { ...deps, reads: (list) => list !== 'folk' };
  assert.deepEqual(named(candidatesFor(held, 'Spoke to Sara at Northbank', northbank.id)), ['Northbank']);
  assert.equal(aboutOfRow(held, sara.id), null);
});

test('THE KEYS A TEXT HOLDS: an address and its domain, a repository, a folder and every folder above it, a handle', () => {
  const keys = keysIn('Ask sara@northbank.example or github:mara, see git@github.com:Mara/Northbank.git and /Users/mara/Developer/northbank/src/app.ts');
  for (const key of ['email:sara@northbank.example', 'domain:northbank.example', 'github:mara', 'remote:github.com/mara/northbank', 'folder:/Users/mara/Developer/northbank'])
    assert.ok(keys.includes(key), `${key} was not read out of the text, which held ${keys.join(' ')}`);
  /* A public mail host is nobody's organisation, and a name is never read as a key that decides. */
  assert.deepEqual(keysIn('write to ada@gmail.com'), ['email:ada@gmail.com']);
  assert.equal(keysIn('name:northbank said so').some((k) => k.startsWith('name:')), false);
});

test('HALF A NAME IS STILL A CANDIDATE, found by the full-text index and ranked after every name said whole', async () => {
  const { deps, project, person } = await bench();
  const northbank = project({ name: 'Northbank', repos: ['git@github.com:Mara/Northbank.git'] });
  const elsewhere = person({ name: 'Sara Okafor' });
  const here = person({ name: 'Sara Lindqvist', projects: [northbank.id] });
  const handed = candidatesFor(deps, 'Spoke to Sara at Northbank', northbank.id);
  assert.deepEqual(handed.candidates.map((c) => handed.rows.get(c.h)?.id), [northbank.id, here.id, elsewhere.id]);
  assert.deepEqual(handed.candidates.map((c) => handed.rows.get(c.h)?.how), ['name', 'text', 'text']);
  /* Words that name nobody hand over nobody. */
  assert.deepEqual(candidatesFor(deps, 'it rained all morning', null), { candidates: [], rows: new Map() });
});

test('A SIGHTING IS A ROW\'S WHEN IT ALONE IS CALLED THAT, and a fixed source of bytes still hands every row its own handle', async () => {
  const { deps, project, mention } = await bench();
  const whole = project({ name: 'Northbank Site', repos: ['git@github.com:mara/northbank-web.git'] });
  const part = project({ name: 'Site', repos: ['git@github.com:mara/site.git'] });
  mention('Northbank Site', 'project', 'a note from Tuesday');
  mention('Site', 'project', 'a call on Monday');
  /* A project called Site does not share the name Northbank Site, so each keeps its own sighting. */
  assert.deepEqual(aboutOfRow(deps, whole.id)?.seen.map((s) => s.where), ['a note from Tuesday']);
  assert.deepEqual(aboutOfRow(deps, part.id)?.seen.map((s) => s.where), ['a call on Monday']);

  const fixed: AboutDeps = { ...deps, random: (size) => new Uint8Array(size) };
  const handed = candidatesFor(fixed, 'Northbank Site went out', null);
  assert.deepEqual(named(handed).sort(), ['Northbank Site', 'Site']);
  assert.equal(new Set(handed.candidates.map((c) => c.h)).size, 2);
  assert.equal(handed.rows.size, 2);
});
