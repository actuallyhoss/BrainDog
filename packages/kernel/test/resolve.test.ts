/**
 * The other pairs (ENG-B04, job 2): two organisations or two projects that may be one, and a name seen with nothing
 * that identifies it beside the one row it reads as. Read from the tables as they are, writing nothing. A name
 * proposes and never decides, so a pair is something to show or to ask, ranked, and never a fold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { entityLists, noteMention, rekey, type KeyedRow } from '../src/entities.ts';
import { pairHash } from '../src/people.ts';
import { evidenceOf, pairsFor, PAIRS_MOST, type Pair, type Pairs } from '../src/resolve.ts';
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
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
    ],
    meets: { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into', aliases: 'aliases' },
  },
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    seq_prefix: 'ORG',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
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
  project: (fields: Fields) => Entry;
  person: (fields: Fields) => Entry;
  org: (fields: Fields) => Entry;
  remove: (list: string, id: string) => void;
  /** A row left folded into another and not deleted, as a merge half undone or an import leaves one. */
  fold: (id: string, into: string) => void;
  /** A name met in a place with nothing that identifies it, kept the way the record keeps a mention. */
  mention: (name: string, kind: string, where: string, at?: string) => void;
};

/** A record in memory with the three lists. A project is keyed the way the write path keys a row. */
async function bench(): Promise<Bench> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, FOLK, ORGS]));
  const projects = entityLists([PROJECTS.body, FOLK.body, ORGS.body] as never).find((l) => l.role === 'project');
  assert.ok(projects, 'the list declaring scopes: is not one of the entity lists');
  const keyed = (made: Entry): Entry => {
    if (made.register === 'things') rekey(sql, projects, null, made as KeyedRow, 'test', AT);
    return made;
  };
  return {
    sql,
    project: (fields) => keyed(value<Entry>(k.create('things', fields as never, OWNER))),
    person: (fields) => value<Entry>(k.create('folk', fields as never, OWNER)),
    org: (fields) => value<Entry>(k.create('organisations', fields as never, OWNER)),
    remove: (list, id) => void sql.exec('UPDATE entry SET deleted_at = ? WHERE register = ? AND id = ?', AT, list, id),
    fold: (id, into) => sql.exec("UPDATE entry SET fields = json_set(fields, '$.merged_into', ?) WHERE id = ?", into, id),
    mention: (name, kind, where, at = AT) => noteMention(sql, { name, kind: kind as never, project: null, source: where, at }),
  };
}

const names = (p: Pair): string => `${p.a.name} + ${p.b.name}`;
const said = (found: Pairs): string[] => found.pairs.map(names);
/** A row's id, as the record mints one: nothing a person reads may hold one. */
const ROW_ID = /[0-9A-HJKMNP-TV-Z]{26}/i;

test('TWO ORGANISATIONS WHOSE NAMES AGREE ARE ONE PAIR, and the same name ranks above a name that is only near', async () => {
  const { sql, org } = await bench();
  const first = org({ name: 'Quayside Studio' });
  const second = org({ name: 'quayside  studio' });
  const long = org({ name: 'Lanternfish Ltd' });
  const short = org({ name: 'Lanternfish' });
  org({ name: 'Harbour Mill' });

  const found = pairsFor(sql, NOW);
  assert.deepEqual(said(found), ['Quayside Studio + quayside studio', 'Lanternfish Ltd + Lanternfish']);
  const [same, near] = found.pairs as [Pair, Pair];
  assert.equal(same.kind, 'org');
  assert.equal(same.how, 'name');
  assert.equal(near.how, 'near');
  assert.ok(same.score > near.score, 'the same name does not rank above a near one');
  /* The older of the two is said first, and the pair is named the same whichever way round, as a nightly job names one. */
  assert.equal(same.hash, pairHash(second.id, first.id));
  assert.deepEqual(found.rows[same.a.h], { register: 'organisations', id: first.id });
  assert.deepEqual(found.rows[near.b.h], { register: 'organisations', id: short.id });
  assert.deepEqual(found.rows[near.a.h], { register: 'organisations', id: long.id });
});

test('A PROJECT AND AN ORGANISATION NEVER PAIR, whatever they are called, and two projects of one name do', async () => {
  const { sql, org, project, mention } = await bench();
  org({ name: 'Northbank' });
  const site = project({ name: 'Northbank' });
  assert.deepEqual(said(pairsFor(sql, NOW)), []);

  /* A name seen as a project's is read beside the project, never beside the organisation of the same name. */
  mention('North Bank', 'project', 'a note from Tuesday');
  const seen = pairsFor(sql, NOW);
  assert.deepEqual(seen.pairs.map((p) => [p.kind, names(p)]), [['project', 'Northbank + North Bank']]);
  assert.deepEqual(seen.rows[seen.pairs[0]!.a.h], { register: 'things', id: site.id });

  project({ name: 'northbank' });
  const found = pairsFor(sql, NOW);
  assert.deepEqual(found.pairs.map((p) => [p.kind, names(p)]), [['project', 'Northbank + northbank']]);
});

test('A NAME SEEN THREE TIMES BESIDE ONE ROW IS ONE PAIR, and once it is asked it is never a pair again', async () => {
  const { sql, org, mention } = await bench();
  const mill = org({ name: 'Harbour Mill Ltd' });
  mention('Harbour Mill', 'organisation', 'a note from Monday', new Date(NOW - 2 * 86_400_000).toISOString());
  mention('harbour mill', 'organisation', 'a call on Tuesday', new Date(NOW - 86_400_000).toISOString());
  mention('Harbour-Mill', 'organisation', 'a commit on Wednesday');
  /* A name the row is already called is that row's own sighting, and a kind with no list has nothing to sit beside. */
  mention('Harbour Mill Ltd', 'organisation', 'a note from Thursday');
  mention('Harbour Mill', 'thing', 'a note from Thursday');

  const found = pairsFor(sql, NOW);
  assert.equal(found.pairs.length, 1, said(found).join('; '));
  const pair = found.pairs[0]!;
  assert.equal(pair.how, 'seen');
  assert.equal(pair.seen, 3);
  assert.equal(pair.a.name, 'Harbour Mill Ltd');
  assert.deepEqual(found.rows[pair.a.h], { register: 'organisations', id: mill.id });
  assert.equal(found.rows[pair.b.h]?.id, undefined, 'a name seen is no row');

  /* A fourth sighting is the same pair still, under the same name. */
  mention('Harbour Mill', 'organisation', 'a note from Friday');
  const again = pairsFor(sql, NOW);
  assert.deepEqual([again.pairs.length, again.pairs[0]!.hash, again.pairs[0]!.seen], [1, pair.hash, 4]);

  /* A question that names the pair settles it, answered or not. */
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG1', 'rowset', ?, 'accepted', 'p_owner', ?)",
    JSON.stringify({ register: 'organisations', pair: pair.hash, rows: [] }),
    AT,
  );
  mention('Harbour Mill', 'organisation', 'a note from Saturday');
  assert.deepEqual(said(pairsFor(sql, NOW)), []);
});

test('TWO NAMES SEEN BESIDE TWO ROWS OF ONE NAME ARE LEFT until the rows themselves are settled', async () => {
  const { sql, org, mention } = await bench();
  org({ name: 'Tidewater Ltd' });
  org({ name: 'Tidewater Inc' });
  mention('Tidewater', 'organisation', 'a note from Monday');
  assert.deepEqual(said(pairsFor(sql, NOW)), ['Tidewater Ltd + Tidewater Inc']);
});

test('A PAIR WHOSE STRONG KEYS DISAGREE IS DROPPED: two sites, or two repositories, are two things of one name', async () => {
  const { sql, org, project } = await bench();
  org({ name: 'Saltmarsh', domain: 'saltmarsh.example' });
  org({ name: 'Saltmarsh', domain: 'saltmarsh-books.example' });
  project({ name: 'Web', repos: ['git@github.com:mara/web.git'] });
  project({ name: 'Web', repos: ['git@github.com:quayside/web.git'] });
  assert.deepEqual(said(pairsFor(sql, NOW)), []);

  /* One with a site and one with none do not disagree, and two projects listing one repository agree by more than a name. */
  org({ name: 'saltmarsh' });
  project({ name: 'web', repos: ['git@github.com:Mara/Web.git'], folders: ['/srv/elsewhere'] });
  const found = pairsFor(sql, NOW);
  assert.deepEqual(new Set(said(found)), new Set(['Saltmarsh + saltmarsh', 'Web + web']));
  const web = found.pairs.find((p) => p.kind === 'project')!;
  assert.equal(found.pairs[0], web, 'a shared repository does not rank above a name alone');
  assert.match(evidenceOf(web), /repository/);
});

test('A DELETED OR A FOLDED ROW IS NEVER PAIRED, with a row or with a name seen', async () => {
  const { sql, org, remove, fold, mention } = await bench();
  const kept = org({ name: 'Greywater' });
  const gone = org({ name: 'Greywater' });
  const folded = org({ name: 'greywater' });
  remove('organisations', gone.id);
  fold(folded.id, kept.id);
  assert.deepEqual(said(pairsFor(sql, NOW)), []);

  const old = org({ name: 'Ironbridge Ltd' });
  mention('Ironbridge', 'organisation', 'a note from Monday');
  assert.deepEqual(said(pairsFor(sql, NOW)), ['Ironbridge Ltd + Ironbridge']);
  remove('organisations', old.id);
  assert.deepEqual(said(pairsFor(sql, NOW)), []);
});

test('A PAIR HE ANSWERED, UNDID OR A MODEL WAS ALREADY SHOWN IS NOT A PAIR AGAIN', async () => {
  const { sql, org } = await bench();
  const [a, b] = [org({ name: 'Quayside' }), org({ name: 'quayside' })];
  const [c, d] = [org({ name: 'Lanternfish' }), org({ name: 'lanternfish' })];
  const [e, f] = [org({ name: 'Harbour Mill' }), org({ name: 'harbour mill' })];
  org({ name: 'Tidewater' });
  org({ name: 'tidewater' });
  assert.equal(pairsFor(sql, NOW).pairs.length, 4);

  /* Asked: a question naming both, as the record speaks a row. */
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG1', 'rowset', ?, 'open', 'p_owner', ?)",
    JSON.stringify({ register: 'organisations', rows: [{ at: `ORG${b.seq}`, patch: { merged_into: `ORG${a.seq}` } }] }),
    AT,
  );
  /* Undone: a fold of one into the other that was taken back. */
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES ('EV1', ?, 'p_owner', 'edit', ?, 'entry', 'merged_into', ?, NULL)",
    AT,
    `entry:${d.id}`,
    JSON.stringify(c.id),
  );
  /* Shown: a nightly job that was answered about the pair. */
  sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state) VALUES ('OB1', ?, 'infer.resolve', ?, 'done')",
    AT,
    JSON.stringify({ pairs: [], rows: { [pairHash(e.id, f.id)]: [e.id, f.id] } }),
  );
  assert.deepEqual(said(pairsFor(sql, NOW)), ['Tidewater + tidewater']);
});

test('EACH PAIR ANSWERS TWO HANDLES AND ONE SENTENCE OF EVIDENCE, and neither holds an id, an address or a place', async () => {
  const { sql, org, project, mention } = await bench();
  const site = project({ name: 'Northbank Site' });
  org({ name: 'Quayside Studio', projects: [site.id] });
  org({ name: 'Quayside Studio Ltd', projects: [site.id] });
  org({ name: 'Lanternfish' });
  org({ name: 'lanternfish' });
  org({ name: 'Harbour Mill Ltd' });
  mention('Harbour Mill', 'organisation', '/Users/mara/notes/monday.md');
  mention('Harbour Mill', 'organisation', 'mail from sara@quayside.example');

  const found = pairsFor(sql, NOW);
  const by = (name: string): Pair => found.pairs.find((p) => p.a.name === name)!;
  assert.equal(evidenceOf(by('Lanternfish')), 'Both are called Lanternfish, and nothing kept about either says they are two.');
  assert.equal(
    evidenceOf(by('Quayside Studio')),
    'Quayside Studio and Quayside Studio Ltd read as one name, and both are tied to Northbank Site.',
  );
  assert.equal(evidenceOf(by('Harbour Mill Ltd')), 'Harbour Mill was seen 2 times with nothing that says what it is, and reads as Harbour Mill Ltd.');
  assert.equal(found.pairs.length, 3);
  const handles = found.pairs.flatMap((p) => [p.a.h, p.b.h]);
  assert.equal(new Set(handles).size, 6, 'two pairs share a handle');
  for (const p of found.pairs) {
    const read = JSON.stringify(p) + evidenceOf(p);
    assert.doesNotMatch(read, ROW_ID);
    assert.doesNotMatch(read, /@|\/Users|—/u);
    assert.ok(found.rows[p.a.h] && found.rows[p.b.h], 'a handle names nothing');
  }
});

test('THE NIGHTLY SLICE IS BOUNDED: fifty pairs at most, whatever is asked for, and fewer when fewer are asked', async () => {
  const { sql, org } = await bench();
  for (let i = 0; i < 60; i++) {
    org({ name: `Mill ${i}` });
    org({ name: `mill ${i}` });
  }
  assert.equal(PAIRS_MOST, 50);
  assert.equal(pairsFor(sql, NOW).pairs.length, 50);
  assert.equal(pairsFor(sql, NOW, 5000).pairs.length, 50);
  const few = pairsFor(sql, NOW, 3);
  assert.equal(few.pairs.length, 3);
  assert.equal(Object.keys(few.rows).length, 6);
  assert.deepEqual(pairsFor(sql, NOW, 0).pairs, []);
  /* A limit that is no number is still the slice, never every pair there is. */
  assert.equal(pairsFor(sql, NOW, Number.NaN).pairs.length, 50);
  assert.deepEqual(pairsFor(sql, NOW, -4).pairs, []);
});

test('TWO ROWS THAT SHARE A NAME NEITHER IS TITLED BY BOTH ARE NOT SAID TO BE CALLED THE ONE NAME', async () => {
  const { sql, project } = await bench();
  /* A bare repository name is a name a project answers to, so these two agree on `portage` and are titled differently. */
  project({ name: 'Web', repos: ['portage'] });
  project({ name: 'Portage' });
  const found = pairsFor(sql, NOW);
  assert.deepEqual(found.pairs.map((p) => [p.how, names(p)]), [['name', 'Web + Portage']]);
  assert.equal(evidenceOf(found.pairs[0]!), 'Web and Portage answer to one name, and nothing kept about either says they are two.');
});

test('READING WRITES NOTHING, and a record with no such lists answers no pair', async () => {
  const { sql, org, mention } = await bench();
  org({ name: 'Quayside' });
  org({ name: 'quayside' });
  mention('Quay Side', 'organisation', 'a note from Monday');
  const count = (): unknown => sql.one('SELECT (SELECT count(*) FROM event) AS e, (SELECT count(*) FROM suggestion) AS s, (SELECT count(*) FROM outbox) AS o, (SELECT count(*) FROM entity_mention) AS m, (SELECT count(*) FROM entity_key) AS k');
  const before = count();
  pairsFor(sql, NOW);
  assert.deepEqual(count(), before);

  const bare = openSqlite();
  await openRecord(bare, fixedClock(NOW));
  assert.deepEqual(pairsFor(bare, NOW), { pairs: [], rows: {} });
});
