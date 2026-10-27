/**
 * Somebody held twice is one question, with no model ("likely duplicates are offered as a merge").
 *
 * TWO RULES THAT NEED NOBODY TO ANSWER BUT HIM. Two rows marked as the record's own person are one question, keeping the
 * row that holds the address he signs in with. Two live rows of one name, where at most one holds any address, handle
 * or key, are one question a pair, a few a night. Neither folds anything on its own: his answer on Decide does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { askOwnRows, askPlainPairs, askTwice, peopleTwice, PLAIN_PAIRS_NIGHT, resolveJob, type PeopleDeps } from '../src/people.ts';
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
  { id: 'merged_into', type: 'ref', to: 'people' },
];

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = { id: 'register.people', kind: 'register', body: { id: 'people', name: 'People', title: 'name', meets: MEETS, fields: FIELDS } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE]));
  return { k, sql };
}

/** What the record hands `people.ts` each night, built here as `peopleDeps` builds it, with the parts a test sets. */
let minted = 0;
function deps(k: Kernel, sql: NodeSql, more: Partial<PeopleDeps> = {}): PeopleDeps {
  return {
    sql,
    nowMs: NOW,
    mint: () => `twice_${++minted}`,
    list: { register: 'people', fields: MEETS, declared: true, declaredFields: FIELDS },
    project: () => null,
    nameOf: k.nameOf,
    titleOf: k.titleOfRow,
    write: () => assert.fail('a question wrote a row before he answered'),
    propose: (p) => k.propose(p, 'system'),
    ...more,
  };
}

const open = (sql: NodeSql): string[] => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);
type Card = { candidates: { at: string; name: string; kept?: boolean }[] };
const card = (k: Kernel, id: string): Card => k.governanceRow('suggestion', id)!.body as Card;
const person = (k: Kernel, fields: Record<string, unknown>): Entry => value<Entry>(k.create('people', fields, OWNER));

test('TWO ROWS MARKED AS HIM ARE ONE QUESTION, keeping the row that holds an address, and nothing more is asked while it waits', async () => {
  const { k, sql } = await record();
  /* As on his own record: the older row came from an import and holds nothing, the newer one holds his address. */
  const imported = person(k, { name: 'Kas', self: true, note: 'Founder' });
  const signed = person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  const asked = value<string | null>(k.askOwnRows());
  assert.ok(asked, 'two rows marked as him asked nothing');
  assert.deepEqual(open(sql), [asked]);
  assert.equal(k.question(asked), "Are Kas and Kas (an address at example.com) both you? Yes keeps Kas and carries over the other's addresses, handles and where they were met.");
  assert.doesNotMatch(k.question(asked) ?? '', /people#|@/u);
  assert.deepEqual(card(k, asked).candidates.map((c) => [c.at, c.kept === true]), [[k.nameOf(imported.id), false], [k.nameOf(signed.id), true]]);
  assert.equal(k.count('people'), 2, 'he was folded without being asked');

  /* The next night, and the night after: the question waiting is the answer. */
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(value<string[]>(askTwice(deps(k, sql))), []);
  assert.deepEqual(open(sql), [asked]);

  value(k.decide(asked, { decide: { option: 'accept', reason: 'both me' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  assert.equal(k.get(imported.id, { includeDeleted: true })!.fields.merged_into, signed.id);
  assert.equal(k.get(signed.id)!.fields.note, 'Founder', 'what the folded row held was not carried');
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(open(sql), []);
  sql.close();
});

test('THE ROW KEPT IS THE ONE HOLDING THE ADDRESS HE SIGNS IN WITH, whichever is older and whatever else holds an address', async () => {
  const { k, sql } = await record();
  const old = person(k, { name: 'Kas', email: 'kas@old.example', self: true });
  const signed = person(k, { name: 'Kas B', email: 'other@example.com', keys: ['email:kas@example.com'], self: true });
  const third = person(k, { name: 'H', self: true });
  const asked = value<string | null>(askOwnRows(deps(k, sql, { ownAddress: () => 'Kas@Example.com' })));
  assert.ok(asked);
  assert.match(k.question(asked) ?? '', /all you\? Yes keeps Kas B and carries over the others' /u);
  assert.deepEqual(card(k, asked).candidates.filter((c) => c.kept === true).map((c) => c.at), [k.nameOf(signed.id)]);
  assert.equal(card(k, asked).candidates.length, 3);
  value(k.decide(asked, { decide: { option: 'accept', reason: 'all me' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  for (const gone of [old, third]) assert.equal(k.get(gone.id, { includeDeleted: true })!.fields.merged_into, signed.id);
  sql.close();

  /* No row holds it, and none holds any address: the oldest is kept, as every other cluster keeps it. */
  const two = await record();
  const first = person(two.k, { name: 'Kas', self: true });
  person(two.k, { name: 'Kas', self: true });
  const q = value<string | null>(askOwnRows(deps(two.k, two.sql, { ownAddress: () => 'kas@example.com' })));
  assert.deepEqual(card(two.k, q!).candidates.filter((c) => c.kept === true).map((c) => c.at), [two.k.nameOf(first.id)]);
  two.sql.close();
});

test('A NO ABOUT HIS TWO ROWS STANDS, and a row another member made is never one of them', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Kas', self: true });
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  const asked = value<string | null>(k.askOwnRows());
  value(k.decide(asked!, { decide: { option: 'reject', reason: 'two of us' } }, 'p_owner'));
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(value<string[]>(askTwice(deps(k, sql))), []);
  assert.deepEqual(open(sql), []);
  assert.equal(k.count('people'), 2);
  sql.close();

  const two = await record();
  person(two.k, { name: 'Kas', email: 'kas@example.com', self: true });
  const theirs = person(two.k, { name: 'Kas', self: true });
  assert.equal(value<string | null>(askOwnRows(deps(two.k, two.sql, { othersRow: (id) => id === theirs.id }))), null);
  assert.deepEqual(open(two.sql), []);
  two.sql.close();
});

test('TWO PEOPLE OF ONE NAME, ONE HOLDING NOTHING, ARE ONE QUESTION WITH NO MODEL, asked once', async () => {
  const { k, sql } = await record();
  const held = person(k, { name: 'Mariam', email: 'mariam@shop.example' });
  const bare = person(k, { name: 'mariam ', note: 'From the import' });
  /* One name, and both hold a key: that is two people until a handle says otherwise, and the model's pass may ask. */
  person(k, { name: 'Omar Said', email: 'omar@one.example' });
  person(k, { name: 'Omar Said', handles: ['github:omarsaid'] });
  /* Another name altogether. */
  person(k, { name: 'Layla' });
  const d = deps(k, sql);
  assert.equal(peopleTwice(d), 1);
  assert.equal(resolveJob(d)?.pairs.length, 2, 'the model would have been handed both pairs');
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 1);
  assert.deepEqual(open(sql), asked);
  /* Asked first, the plain pair never waits on a model: the job that follows holds only the doubtful one. */
  assert.deepEqual(resolveJob(d)?.pairs.map((p) => [p.a.name, p.b.name]), [['Omar Said', 'Omar Said']]);
  assert.match(k.question(asked[0]!) ?? '', /^Are Mariam .*and mariam one person\? Yes keeps Mariam /u);
  assert.doesNotMatch(k.question(asked[0]!) ?? '', /people#|@/u);
  assert.deepEqual(card(k, asked[0]!).candidates.map((c) => [c.at, c.kept === true]), [[k.nameOf(held.id), true], [k.nameOf(bare.id), false]]);
  assert.equal(k.count('people'), 5, 'a pair was folded without asking');

  /* Waiting: the next night asks nothing, and the figure still counts them as held twice. */
  assert.deepEqual(value<string[]>(askPlainPairs(d, d.list!)), []);
  assert.deepEqual(value<string[]>(askTwice(d)), []);
  assert.deepEqual(open(sql), asked);
  assert.equal(peopleTwice(d), 1);

  value(k.decide(asked[0]!, { decide: { option: 'accept', reason: 'one person' } }, 'p_owner'));
  assert.equal(k.get(bare.id, { includeDeleted: true })!.fields.merged_into, held.id);
  assert.equal(k.get(held.id)!.fields.note, 'From the import');
  assert.deepEqual(value<string[]>(askPlainPairs(d, d.list!)), []);
  assert.equal(peopleTwice(d), 0);
  sql.close();
});

test('NEVER A ROW ANOTHER MEMBER MADE, A PAIR HE ANSWERED, OR A ROW ONLY AN ARRIVAL VOUCHES FOR', async () => {
  const { k, sql } = await record();
  /* Another member's row. */
  person(k, { name: 'Nour', email: 'nour@studio.example' });
  const theirs = person(k, { name: 'Nour' });
  /* A row made by a mail and met by nothing else: a forged sender is nobody's evidence. */
  person(k, { name: 'Yara', email: 'yara@home.example' });
  person(k, { name: 'Yara', met: [`${DAY} · mail from stranger.test`] });
  /* A pair he will say no to. */
  person(k, { name: 'Sam', email: 'sam@one.example' });
  person(k, { name: 'Sam' });
  const d = deps(k, sql, { othersRow: (id) => id === theirs.id });
  assert.equal(peopleTwice(d), 1);
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 1);
  assert.match(k.question(asked[0]!) ?? '', /^Are Sam .*and Sam one person\?/u);
  value(k.decide(asked[0]!, { decide: { option: 'reject', reason: 'two people called Sam' } }, 'p_owner'));
  assert.deepEqual(value<string[]>(askPlainPairs(d, d.list!)), []);
  assert.deepEqual(open(sql), []);
  assert.equal(peopleTwice(d), 0, 'a pair he said no to is still counted as held twice');
  assert.equal(k.count('people'), 6);
  sql.close();
});

test('A FEW PAIRS A NIGHT, the rest the next night, and his own two rows are counted and asked beside them', async () => {
  const { k, sql } = await record();
  const names = ['Ada', 'Bea', 'Cyd', 'Dov', 'Eli', 'Fay', 'Gus'];
  for (const name of names) {
    person(k, { name, email: `${name.toLowerCase()}@work.example` });
    person(k, { name });
  }
  person(k, { name: 'Kas', self: true });
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  const d = deps(k, sql);
  assert.equal(PLAIN_PAIRS_NIGHT, 5);
  assert.equal(peopleTwice(d), names.length + 1, 'seven pairs and one row marked as him beyond the first');

  const first = value<string[]>(askTwice(d));
  assert.equal(first.length, 1 + PLAIN_PAIRS_NIGHT, 'his own rows, then five pairs');
  assert.match(k.question(first[0]!) ?? '', /both you\?/u);
  assert.equal(new Set(first).size, first.length, 'two pairs shared a question');
  const second = value<string[]>(askTwice(d));
  assert.equal(second.length, names.length - PLAIN_PAIRS_NIGHT);
  assert.deepEqual(value<string[]>(askTwice(d)), []);
  assert.equal(open(sql).length, names.length + 1);
  assert.equal(value<string[]>(askPlainPairs(d, d.list!, 1)).length, 0);
  sql.close();
});

test('THREE ROWS OF ONE NAME ARE ONE QUESTION, not three, and a record with no people list asks nothing', async () => {
  const { k, sql } = await record();
  const kept = person(k, { name: 'Salma Aziz', email: 'salma@clinic.example' });
  person(k, { name: 'Salma Aziz' });
  person(k, { name: 'salma-aziz' });
  const d = deps(k, sql);
  assert.equal(peopleTwice(d), 2, 'three rows of one name are two too many');
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 1);
  assert.equal(card(k, asked[0]!).candidates.length, 3);
  assert.deepEqual(card(k, asked[0]!).candidates.filter((c) => c.kept === true).map((c) => c.at), [k.nameOf(kept.id)]);
  assert.deepEqual(value<string[]>(askPlainPairs(d, d.list!)), []);
  assert.deepEqual(open(sql), asked);

  const none = deps(k, sql, { list: undefined });
  assert.deepEqual(value<string[]>(askTwice(none)), []);
  assert.equal(peopleTwice(none), 0);
  sql.close();
});

test('A ROW ONLY AN ARRIVAL VOUCHES FOR NEVER JOINS A QUESTION ABOUT TWO OTHERS OF ITS NAME', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Yara', email: 'yara@home.example' });
  person(k, { name: 'Yara' });
  const mailed = person(k, { name: 'Yara', met: [`${DAY} · mail from stranger.test`] });
  const d = deps(k, sql);
  assert.equal(peopleTwice(d), 1);
  const asked = value<string[]>(askPlainPairs(d, d.list!));
  assert.equal(asked.length, 1);
  assert.equal(card(k, asked[0]!).candidates.some((c) => c.at === k.nameOf(mailed.id)), false, 'a forged sender was offered as one of them');
  assert.equal(card(k, asked[0]!).candidates.length, 2);
  assert.deepEqual(value<string[]>(askPlainPairs(d, d.list!)), []);
  sql.close();
});

test('HIS OWN ROWS AND ONE MORE OF HIS NAME ARE COUNTED ONCE EACH, never a row twice', async () => {
  const { k, sql } = await record();
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  person(k, { name: 'Kas', self: true });
  person(k, { name: 'Kas' });
  const d = deps(k, sql);
  assert.equal(peopleTwice(d), 2, 'three rows that may be one person are two too many');
  const asked = value<string[]>(askTwice(d));
  assert.equal(asked.length, 1);
  assert.equal(card(k, asked[0]!).candidates.length, 3);
  assert.deepEqual(value<string[]>(askTwice(d)), []);
  sql.close();
});

/** An owner as the record mirrors one when it is made or they join: a person with the address they sign in with. */
const owner = (sql: NodeSql, id: string, email: string | null): void => {
  sql.exec('INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES (?, ?, NULL, NULL)', id, email);
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES (?, '*', 'owner', NULL)", id);
};

test('THE ROW HE SIGNS IN WITH IS NEVER THE ONE FOLDED, with no address handed: the record reads its own owner', async () => {
  const { k, sql } = await record();
  owner(sql, 'p_owner', 'Kas@Example.com');
  /* The audit's case: an older marked row holds another address, and the newer one is the row he signs in with. */
  const old = person(k, { name: 'Kas', email: 'kas@old.example', self: true });
  const signed = person(k, { name: 'Kas B', email: 'other@example.com', keys: ['email:kas@example.com'], self: true });
  /* The nightly pass, as the record would call it: nobody hands an address. */
  const [asked, ...more] = value<string[]>(askTwice(deps(k, sql)));
  assert.ok(asked, 'two rows marked as him asked nothing');
  assert.deepEqual(more, []);
  assert.deepEqual(card(k, asked).candidates.map((c) => [c.at, c.kept === true]), [[k.nameOf(old.id), false], [k.nameOf(signed.id), true]]);
  assert.match(k.question(asked) ?? '', /both you\? Yes keeps Kas B and carries over the other's /u);
  /* The record's own call, at a mark or a meeting, keeps the same row and asks nothing more. */
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(open(sql), [asked]);
  value(k.decide(asked, { decide: { option: 'accept', reason: 'both me' } }, 'p_owner'));
  assert.equal(k.get(signed.id)!.fields.self, true, 'the row he signs in with was folded');
  assert.equal(k.get(old.id, { includeDeleted: true })!.fields.merged_into, signed.id);
  assert.equal(k.count('people'), 1);
  sql.close();

  /* None of his rows holds it: none is the row he signs in with, so the oldest holding any address is kept. */
  const two = await record();
  owner(two.sql, 'p_owner', 'kas@example.com');
  person(two.k, { name: 'Kas', self: true });
  const first = person(two.k, { name: 'Kas', email: 'kas@old.example', self: true });
  person(two.k, { name: 'Kas', email: 'kas@new.example', self: true });
  const q = value<string | null>(two.k.askOwnRows());
  assert.deepEqual(card(two.k, q!).candidates.filter((c) => c.kept === true).map((c) => c.at), [two.k.nameOf(first.id)]);
  two.sql.close();
});

test('NO GUESS AT WHICH ROW HE SIGNS IN WITH: with no address known and two rows holding one, nothing is asked until it is', async () => {
  const { k, sql } = await record();
  const old = person(k, { name: 'Kas', email: 'kas@old.example', self: true });
  const signed = person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(value<string[]>(askTwice(deps(k, sql))), []);
  /* An owner the record holds no address for says no more than no owner. */
  owner(sql, 'p_owner', null);
  assert.deepEqual(value<string[]>(askTwice(deps(k, sql, { ownAddress: () => null }))), []);
  assert.deepEqual(open(sql), []);
  assert.equal(k.count('people'), 2);
  assert.equal(peopleTwice(deps(k, sql)), 1, 'he is still counted as held twice while nothing can be asked');

  /* The night the record knows his address, the question comes, and keeps the row that holds it. */
  owner(sql, 'p_owner', 'kas@example.com');
  const [asked] = value<string[]>(askTwice(deps(k, sql)));
  assert.ok(asked);
  assert.deepEqual(card(k, asked).candidates.map((c) => [c.at, c.kept === true]), [[k.nameOf(old.id), false], [k.nameOf(signed.id), true]]);
  sql.close();
});

test('TWO OWNERS, EACH MARKED ON THE ROW THEY SIGN IN WITH, are two people and are never asked about as one', async () => {
  const { k, sql } = await record();
  owner(sql, 'p_owner', 'kas@example.com');
  owner(sql, 'p_second', 'mona@example.com');
  person(k, { name: 'Kas', email: 'kas@example.com', self: true });
  person(k, { name: 'Mona', email: 'mona@example.com', self: true });
  assert.equal(value<string | null>(k.askOwnRows()), null);
  assert.deepEqual(value<string[]>(askTwice(deps(k, sql))), []);
  assert.deepEqual(open(sql), []);
  assert.equal(k.count('people'), 2);
  sql.close();
});
