/**
 * `held-twice`, the figure that says how many people a record holds more than once (AGT-D05 job 1, AGT-B11 step 5).
 *
 * WHAT WAS MEASURED BEFORE IT: his own record held him twice, one row with an address and one from the import, and the
 * count (`peopleTwice` in `people.ts`) was only ever asked by the nightly pass, which holds the record's own parts. No
 * page, sign or lead note could read it, because a figure is read with the database and nothing more.
 *
 * SO THE FIGURE READS BY THE DATABASE ALONE, and these hold it to the same answers the nightly pass gets: the people
 * list is found by its declaration, a row is named as the record names it, and another member's row is read off the log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES, RECORD_PEOPLE, builtInFigure, readPeopleTwice } from '../src/built-in-figures.ts';
import { openRecord, type Declaration, type Entry, type Kernel, type Reading, type WriteContext } from '../src/index.ts';
import { askPlainPairs, peopleTwice, peopleTwiceIn, type PeopleDeps } from '../src/people.ts';
import type { MeetsFields } from '../src/roles.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 3);

const MEETS: MeetsFields = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', self: 'self' };

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'email', type: 'email', unique: true, index: true },
  { id: 'handles', type: 'list', of: 'text' },
  { id: 'keys', type: 'list', of: 'text' },
  { id: 'aliases', type: 'list', of: 'text' },
  { id: 'self', type: 'bool' },
  { id: 'note', type: 'text' },
  { id: 'projects', type: 'list', of: 'ref', to: 'things' },
  { id: 'met', type: 'list', of: 'text' },
  { id: 'merged_into', type: 'ref', to: 'people' },
];

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

/** The people list under a name of its own, so nothing here leans on a list being called `people`. */
const PEOPLE: Declaration = { id: 'register.folk', kind: 'register', body: { id: 'folk', name: 'People', title: 'name', meets: { ...MEETS }, fields: FIELDS.map((f) => (f.id === 'merged_into' ? { ...f, to: 'folk' } : f)) } };

/** A list of names that plays no part: nobody is met into it. */
const CONTACTS: Declaration = { id: 'register.contacts', kind: 'register', body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };

async function record(decls: Declaration[] = [PROJECTS, PEOPLE]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(decls));
  return { k, sql };
}

/** What the record hands `people.ts` each night, so the figure and the night can be held to one answer. */
let minted = 0;
function deps(k: Kernel, sql: NodeSql, more: Partial<PeopleDeps> = {}): PeopleDeps {
  return {
    sql,
    nowMs: NOW,
    mint: () => `figure_${++minted}`,
    list: { register: 'folk', fields: MEETS, declared: true, declaredFields: FIELDS },
    project: () => null,
    nameOf: k.nameOf,
    titleOf: k.titleOfRow,
    write: () => assert.fail('a question wrote a row before he answered'),
    propose: (p) => k.propose(p, 'system'),
    ...more,
  };
}

const person = (k: Kernel, fields: Record<string, unknown>, as: WriteContext = OWNER): Entry => value<Entry>(k.create('folk', fields, as));
const figure = () => {
  const decl = builtInFigure('held-twice');
  assert.ok(decl, 'no such figure');
  return decl;
};
const read = (sql: NodeSql): Reading => value<Reading>(readPeopleTwice(sql, {}, figure()));

test('PEOPLE-TWICE IS A FIGURE EVERY RECORD HAS: no more than nought, over the people and no one list by name', () => {
  const decl = figure();
  assert.equal(decl, BUILT_IN_FIGURES['held-twice']);
  assert.equal(decl.metric, 'held-twice');
  assert.equal(decl.source, RECORD_PEOPLE);
  assert.deepEqual(decl.target, { lte: 0 });
  assert.equal(decl.compare, 'none');
  assert.equal(decl.format, 'int');
  assert.doesNotMatch(decl.name ?? '', /row|entity|—/u);
});

test('TWO OF ONE NAME, ONE HOLDING NO KEY, READ 1, and two who each hold a key are two people', async () => {
  const { k, sql } = await record();
  const clean = read(sql);
  assert.deepEqual([clean.value, clean.held, clean.met], [0, 1, true], 'a people list with nobody twice reads nought, never nothing');
  person(k, { name: 'Mariam', email: 'mariam@shop.example' });
  person(k, { name: 'mariam ', note: 'From the import' });
  person(k, { name: 'Omar Said', email: 'omar@one.example' });
  person(k, { name: 'Omar Said', handles: ['github:omarsaid'] });
  person(k, { name: 'Layla' });
  const twice = read(sql);
  assert.deepEqual([twice.value, twice.held, twice.met], [1, 1, false]);
  assert.equal(peopleTwiceIn(sql), peopleTwice(deps(k, sql)), 'the figure and the nightly pass count differently');
  assert.doesNotMatch(twice.why, /row|entity|—|folk#/u);
  sql.close();
});

test('A PAIR HE ANSWERED NO TO READS 0, and one still waiting on him is still counted', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Sam', email: 'sam@one.example' });
  person(k, { name: 'Sam' });
  const d = deps(k, sql);
  assert.equal(read(sql).value, 1);
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 1);
  assert.equal(read(sql).value, 1, 'a question that waits has folded nobody yet');
  value(k.decide(asked[0]!, { decide: { option: 'reject', reason: 'two people called Sam' } }, 'p_owner'));
  const after = read(sql);
  assert.deepEqual([after.value, after.met], [0, true], 'his no was not heard: two people of one name were still counted as one');
  assert.equal(k.count('folk'), 2);
  sql.close();
});

test('TWO MARKED AS HIM COUNT 1 BEYOND THE FIRST, and a third of his name is one more, never a person twice', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  assert.equal(read(sql).value, 0, 'one row marked as him is him once');
  /* Both hold a key, so the name alone would never pair them: being marked as him does. */
  person(k, { name: 'Karim Assaf', handles: ['github:kas'], self: true });
  assert.equal(read(sql).value, 1);
  person(k, { name: 'Kas' });
  assert.equal(read(sql).value, 2, 'three who may be one person are two too many');
  assert.equal(peopleTwiceIn(sql), peopleTwice(deps(k, sql)));
  sql.close();
});

test('NOTHING, NEVER NOUGHT, where no list holds people: a list of names that declares no meets is not one', async () => {
  const { k, sql } = await record([PROJECTS, CONTACTS]);
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  assert.equal(peopleTwiceIn(sql), null);
  const none = read(sql);
  assert.deepEqual([none.value, none.held, none.met], [null, 0, null]);
  assert.doesNotMatch(none.why, /row|entity|—/u);
  sql.close();
});

test('ANOTHER MEMBER\'S OWN ADDITION IS THEIRS, read off the log: never counted, and what was folded or deleted is gone', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES ('p_owner', 'owner@example.com', NULL, NULL)");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES ('p_owner', '*', 'owner', NULL)");
  sql.exec("INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES ('p_guest', 'guest@example.com', NULL, NULL)");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES ('p_guest', 'folk', 'write', NULL)");
  person(k, { name: 'Nour', email: 'nour@studio.example' });
  const theirs = person(k, { name: 'Nour' }, { actor: 'p_guest' });
  assert.equal(read(sql).value, 0, 'a member\'s own addition was counted against the owner');
  assert.equal(peopleTwiceIn(sql), peopleTwice(deps(k, sql, { othersRow: (id) => id === theirs.id })));
  /* The owner's own second Nour is counted, and deleting it takes it off every page and out of the count. */
  const mine = person(k, { name: 'Nour' });
  assert.equal(read(sql).value, 1);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), mine.id);
  assert.equal(read(sql).value, 0);
  sql.close();
});
