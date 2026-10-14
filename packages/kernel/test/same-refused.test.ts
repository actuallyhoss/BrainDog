/**
 * A second row saying what a first says is refused at the door (AGT-C13 job c): `ALREADY_KNOWN`, naming the first by
 * its title and spoken id, at the rule's first field, with the call that confirms or changes it. The same name in
 * another project passes, an import passes, and a person's refusal is word for word what it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { testSigner } from './signer.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const SIGNER = testSigner();
const OWNER: WriteContext = { actor: 'p_owner' };
/* A writer who reads every list, as the record's own door says one: the holder is named to them. */
const READER: WriteContext = { actor: 'p_owner', reads: () => true };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const SKILLS: Declaration = {
  id: 'register.skills',
  kind: 'register',
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    seq_prefix: 'SK',
    state: 'state',
    done: ['retired'],
    same: { fields: ['name'], within: 'project', fold: 'text' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things' },
      { id: 'notes', type: 'text' },
      { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
    ],
  },
};

const LESSONS: Declaration = {
  id: 'register.lessons',
  kind: 'register',
  body: {
    id: 'lessons',
    name: 'Lessons',
    title: 'lesson',
    seq_prefix: 'LS',
    same: { fields: ['lesson'], fold: 'text' },
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'confirmed_on', type: 'day' },
    ],
  },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Refused = { ok: boolean; refusal?: { code: string; fix: string; at?: string; try?: string } };
const refusalOf = (r: unknown) => {
  const x = r as Refused;
  assert.equal(x.ok, false, 'the write went in');
  return x.refusal!;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; home: Entry; away: Entry }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.install([PROJECTS, SKILLS, LESSONS, PEOPLE]));
  const home = value<Entry>(k.create('things', { name: 'Lantern' }, OWNER));
  const away = value<Entry>(k.create('things', { name: 'Harbor' }, OWNER));
  return { k, sql, home, away };
}

test('A SECOND PONYTAIL IN ONE PROJECT IS REFUSED, naming the first and the call that changes it', async () => {
  const { k, sql, home } = await record();
  value<Entry>(k.create('skills', { name: 'ponytail', project: home.id }, OWNER));

  const twice = refusalOf(k.create('skills', { name: 'Ponytail (copy)', project: home.id, notes: 'Laziest fix first.' }, READER));
  assert.equal(twice.code, 'ALREADY_KNOWN');
  assert.equal(twice.fix, 'Skills already has ponytail (SK1). Change that one rather than adding it twice.');
  assert.equal(twice.at, 'name');
  assert.equal(twice.try, 'update {"spoken":"SK1","patch":{"notes":"Laziest fix first."}}');

  /* With nothing else sent, the call reads the first. */
  assert.equal(refusalOf(k.create('skills', { name: 'ponytail.md', project: home.id }, READER)).try, 'get {"spoken":"SK1"}');

  /* A writer who does not say what it reads (a rule's, a flow's) is not handed the row's name or a call naming it. */
  const blind = refusalOf(k.create('skills', { name: 'ponytail', project: home.id }, OWNER));
  assert.equal(blind.code, 'ALREADY_KNOWN');
  assert.equal(blind.fix, 'Skills already has one that says this. Change that one rather than adding it twice.');
  assert.equal(blind.try, undefined);

  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'skills'")!.n, 1);
  sql.close();
});

test('THE SAME NAME IN ANOTHER PROJECT PASSES, and a rename onto a held name is refused', async () => {
  const { k, sql, home, away } = await record();
  value<Entry>(k.create('skills', { name: 'ponytail', project: home.id }, OWNER));
  const there = value<Entry>(k.create('skills', { name: 'ponytail', project: away.id }, READER));
  const lint = value<Entry>(k.create('skills', { name: 'lint', project: home.id }, READER));

  /* Changing a same field onto what another row says is refused, in the sentence an update reads. */
  const renamed = refusalOf(k.update('skills', lint.id, { name: 'PONYTAIL' }, READER));
  assert.equal(renamed.fix, 'Skills already has ponytail (SK1). Change that one rather than making this one say the same.');
  /* And so is moving a row into the project where its name is held. */
  assert.equal(refusalOf(k.update('skills', there.id, { project: home.id }, READER)).code, 'ALREADY_KNOWN');
  /* A change to any other field is never asked. */
  value(k.update('skills', there.id, { notes: 'still here' }, READER));

  /* A finished row says nothing now, so it holds nothing: retire the first and the name is free. */
  const first = value<{ rows: Entry[] }>(k.list({ register: 'skills', where: { field: 'seq', is: 1 } })).rows[0]!;
  value(k.update('skills', first.id, { state: 'retired' }, READER));
  value(k.update('skills', lint.id, { name: 'ponytail' }, READER));
  sql.close();
});

test('A REPEATED LESSON IS TOLD TO CONFIRM THE FIRST, today', async () => {
  const { k, sql } = await record();
  value<Entry>(k.create('lessons', { lesson: 'Run Node 24 for the SQLite tests.' }, OWNER));
  const again = refusalOf(k.create('lessons', { lesson: 'run  node 24 for the sqlite tests.' }, READER));
  assert.equal(again.code, 'ALREADY_KNOWN');
  assert.equal(again.fix, 'Lessons already has Run Node 24 for the SQLite tests (LS1). Change that one rather than adding it twice.');
  assert.equal(again.at, 'lesson');
  assert.equal(again.try, 'update {"spoken":"LS1","patch":{"confirmed_on":"2026-10-06"}}');
  sql.close();
});

test('AN IMPORT PASSES: rows already here twice come back as they were', async () => {
  const { k, sql, home } = await record();
  value<Entry>(k.create('skills', { name: 'ponytail', project: home.id }, OWNER));
  const other = value<Entry>(k.create('skills', { name: 'other', project: home.id }, OWNER));
  /* Written past the door, as a record from before `same:` holds its duplicates. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.name', 'ponytail') WHERE id = ?", other.id);
  const lines = value<string[]>(await k.export());
  const target = openSqlite();
  const into = await openRecord(target, fixedClock(NOW), { sign: SIGNER });
  value(await into.import(lines));
  const names = value<{ rows: Entry[] }>(into.list({ register: 'skills' })).rows.map((r) => r.fields.name);
  assert.deepEqual(names, ['ponytail', 'ponytail']);
  /* And the door still holds on the record it arrived in. */
  assert.equal(refusalOf(into.create('skills', { name: 'ponytail', project: home.id }, READER)).code, 'ALREADY_KNOWN');
  target.close();
  sql.close();
});

test('A PERSON’S REFUSAL IS WORD FOR WORD WHAT IT WAS', async () => {
  const { k, sql } = await record();
  value<Entry>(k.create('people', { name: 'Ada', handles: ['github:ada'] }, OWNER));
  const blind = refusalOf(k.create('people', { name: 'Ada again', handles: ['github:ada'] }, OWNER));
  assert.equal(blind.code, 'ALREADY_KNOWN');
  assert.equal(blind.fix, 'Someone on this list already has ada on github. Add what you know to them rather than adding them twice.');
  assert.equal(blind.try, undefined);
  const named = refusalOf(k.create('people', { name: 'Ada again', handles: ['github:ada'] }, READER));
  assert.equal(named.fix, 'Ada already has ada on github. Add what you know to them rather than adding them twice.');
  sql.close();
});
