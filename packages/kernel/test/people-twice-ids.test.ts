/**
 * WHO the held-twice figure counts, not only how many (the note says a number and the list could
 * not be opened on the people behind it).
 *
 * `peopleTwiceIds` answers every person in a group the count draws on: both of a plain pair, all three of one name,
 * every row marked as the record's own person. `peopleTwice` keeps its count, and the two are read from one pass, so
 * the count is always the people named less one a group.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { askPlainPairs, peopleTwice, peopleTwiceIds, peopleTwiceIdsIn, peopleTwiceIn, type PeopleDeps } from '../src/people.ts';
import type { MeetsFields } from '../src/roles.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 3);
const DAY = '2026-10-13';

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
  { id: 'merged_into', type: 'ref', to: 'folk' },
];

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

/* A people list by another name: the list is found by what it declares (`meets:`), never by an id. */
const FOLK: Declaration = { id: 'register.folk', kind: 'register', body: { id: 'folk', name: 'Folk', title: 'name', meets: MEETS, fields: FIELDS } };
const CONTACTS: Declaration = { id: 'register.contacts', kind: 'register', body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };

async function record(decls: Declaration[] = [PROJECTS, FOLK]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(decls));
  return { k, sql };
}

/** What the record hands `people.ts` each night, built here as `peopleDeps` builds it, with the parts a test sets. */
let minted = 0;
function deps(k: Kernel, sql: NodeSql, more: Partial<PeopleDeps> = {}): PeopleDeps {
  return {
    sql,
    nowMs: NOW,
    mint: () => `ids_${++minted}`,
    list: { register: 'folk', fields: MEETS, declared: true, declaredFields: FIELDS },
    project: () => null,
    nameOf: k.nameOf,
    titleOf: k.titleOfRow,
    write: () => assert.fail('a question wrote a row before he answered'),
    propose: (p) => k.propose(p, 'system'),
    ...more,
  };
}

const person = (k: Kernel, fields: Record<string, unknown>, ctx: WriteContext = OWNER): Entry => value<Entry>(k.create('folk', fields, ctx));
const sorted = (ids: readonly string[]): string[] => [...ids].sort();

test('BOTH OF A PLAIN PAIR ARE NAMED, and nobody else: two who each hold a key and somebody alone are left out', async () => {
  const { k, sql } = await record();
  const d = deps(k, sql);
  assert.deepEqual(peopleTwiceIds(d), [], 'a list with nobody twice named somebody');
  const held = person(k, { name: 'Mariam', email: 'mariam@shop.example' });
  const bare = person(k, { name: 'mariam ', note: 'From the import' });
  person(k, { name: 'Omar Said', email: 'omar@one.example' });
  person(k, { name: 'Omar Said', handles: ['github:omarsaid'] });
  person(k, { name: 'Layla' });
  assert.deepEqual(sorted(peopleTwiceIds(d)), sorted([held.id, bare.id]));
  assert.equal(peopleTwice(d), 1, 'the count moved');
  sql.close();
});

test('THREE OF ONE NAME ARE ALL THREE, each once, and the count stays the people named less one a group', async () => {
  const { k, sql } = await record();
  const salma = [person(k, { name: 'Salma Aziz', email: 'salma@clinic.example' }), person(k, { name: 'Salma Aziz' }), person(k, { name: 'salma-aziz' })];
  const sam = [person(k, { name: 'Sam', email: 'sam@one.example' }), person(k, { name: 'Sam' })];
  const d = deps(k, sql);
  const ids = peopleTwiceIds(d);
  assert.equal(new Set(ids).size, ids.length, 'somebody was named twice');
  assert.deepEqual(sorted(ids), sorted([...salma, ...sam].map((r) => r.id)));
  assert.equal(peopleTwice(d), 3, 'five people in two groups are three too many');
  sql.close();
});

test('A PAIR WAITING ON HIM IS STILL NAMED, and his no or his yes takes both off', async () => {
  const { k, sql } = await record();
  const sam = [person(k, { name: 'Sam', email: 'sam@one.example' }), person(k, { name: 'Sam' })];
  const nour = [person(k, { name: 'Nour', email: 'nour@studio.example' }), person(k, { name: 'Nour' })];
  const d = deps(k, sql);
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 2);
  assert.deepEqual(sorted(peopleTwiceIds(d)), sorted([...sam, ...nour].map((r) => r.id)), 'a question that waits has folded nobody yet');
  const about = (id: string): boolean => /^Are Sam /u.test(k.question(id) ?? '');
  value(k.decide(asked.find(about)!, { decide: { option: 'reject', reason: 'two people called Sam' } }, 'p_owner'));
  assert.deepEqual(sorted(peopleTwiceIds(d)), sorted(nour.map((r) => r.id)), 'his no was not heard');
  value(k.decide(asked.find((id) => !about(id))!, { decide: { option: 'accept', reason: 'one person' } }, 'p_owner'));
  assert.deepEqual(peopleTwiceIds(d), []);
  assert.equal(peopleTwice(d), 0);
  sql.close();
});

test('NEVER A ROW ANOTHER MEMBER MADE OR ONE ONLY AN ARRIVAL VOUCHES FOR, nor the one it would have been paired with', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Nour', email: 'nour@studio.example' });
  const theirs = person(k, { name: 'Nour' });
  person(k, { name: 'Yara', email: 'yara@home.example' });
  person(k, { name: 'Yara', met: [`${DAY} · mail from stranger.test`] });
  const d = deps(k, sql, { othersRow: (id) => id === theirs.id });
  assert.deepEqual(peopleTwiceIds(d), []);
  assert.equal(peopleTwice(d), 0);
  sql.close();
});

test('EVERY ROW MARKED AS HIM IS NAMED, with a third of his name, so the people named are the ones the count is about', async () => {
  const { k, sql } = await record();
  const first = person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  const d = deps(k, sql);
  assert.deepEqual(peopleTwiceIds(d), [], 'one row marked as him is him once');
  /* Both hold a key, so the name alone would never pair them: being marked as him does. */
  const second = person(k, { name: 'Karim Assaf', handles: ['github:kas'], self: true });
  assert.deepEqual(sorted(peopleTwiceIds(d)), sorted([first.id, second.id]));
  assert.equal(peopleTwice(d), 1);
  const third = person(k, { name: 'Kas' });
  assert.deepEqual(sorted(peopleTwiceIds(d)), sorted([first.id, second.id, third.id]));
  assert.equal(peopleTwice(d), 2, 'three who may be one person are two too many');
  sql.close();
});

test('NOBODY ON A RECORD WITH NO PEOPLE LIST, and read from the database alone that is nothing, never an empty answer', async () => {
  const { k, sql } = await record([PROJECTS, CONTACTS]);
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  value(k.create('contacts', { name: 'Mariam' }, OWNER));
  assert.deepEqual(peopleTwiceIds(deps(k, sql, { list: undefined })), []);
  assert.equal(peopleTwiceIdsIn(sql), null);
  assert.equal(peopleTwiceIn(sql), null);
  sql.close();
});

test('READ FROM THE DATABASE ALONE IT NAMES THE SAME PEOPLE, and another member\'s own addition is theirs', async () => {
  const { k, sql } = await record();
  assert.deepEqual(peopleTwiceIdsIn(sql), []);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES ('p_owner', 'owner@example.com', NULL, NULL)");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES ('p_owner', '*', 'owner', NULL)");
  sql.exec("INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES ('p_guest', 'guest@example.com', NULL, NULL)");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES ('p_guest', 'folk', 'write', NULL)");
  const nour = person(k, { name: 'Nour', email: 'nour@studio.example' });
  const theirs = person(k, { name: 'Nour' }, { actor: 'p_guest' });
  assert.deepEqual(peopleTwiceIdsIn(sql), [], 'a member\'s own addition was named against the owner');
  const mine = person(k, { name: 'Nour' });
  const d = deps(k, sql, { othersRow: (id) => id === theirs.id });
  assert.deepEqual(sorted(peopleTwiceIdsIn(sql)!), sorted([nour.id, mine.id]));
  assert.deepEqual(sorted(peopleTwiceIdsIn(sql)!), sorted(peopleTwiceIds(d)), 'the database alone and the nightly pass name different people');
  assert.equal(peopleTwiceIn(sql), 1);
  /* A pair he answered is found again by the names its question holds. */
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  value(k.decide(asked[0]!, { decide: { option: 'reject', reason: 'two people called Nour' } }, 'p_owner'));
  assert.deepEqual(peopleTwiceIdsIn(sql), []);
  sql.close();
});
