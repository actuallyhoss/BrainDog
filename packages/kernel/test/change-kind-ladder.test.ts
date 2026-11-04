/**
 * When the ladder arrives, existing write tokens keep what they were doing (research-trust-16-17, "Calls taken"), and
 * a token can say which app holds it.
 *
 * Before the ladder a write token wrote anything its scope let it, so starting every grant at Ask would have turned
 * yesterday's work into a wall of questions overnight. Migration 25 gives each live write token Do and tell on the
 * kinds it used in the last thirty days that are not on the floor, and nothing else: new grants, propose tokens and
 * every floor kind start at Ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { rungOf, seedLadder } from '../src/change-kind.ts';
import { applyMigrations } from '../src/migrate.ts';
import { openRecord, type Declaration, type WriteContext } from '../src/index.ts';
import { createToken, listTokens, verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 9);
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

const as = (token: string, client: string): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session: { client_id: client, host: 'h', repo: 'braindog' } });

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

const ladder = (sql: NodeSql) =>
  sql.all<{ agent: string; kind: string; rung: string }>('SELECT agent, kind, rung FROM ladder ORDER BY agent, kind').map((r) => ({ ...r }));

test('MIGRATION 25 KEEPS DO AND TELL FOR WHAT EACH WRITE TOKEN DID IN THE LAST THIRTY DAYS, and nothing on the floor', async () => {
  const sql = openSqlite();
  /* SIX WEEKS AGO, a write that is too old to count. */
  const old = await openRecord(sql, fixedClock(NOW - 42 * DAY));
  value(await old.install([TASKS]));
  for (const [id, scope] of [['t_write', 'write'], ['t_ask', 'propose'], ['t_gone', 'write']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES (?, 'p_owner', ?, ?, '2026-08-01T00:00:00.000Z')", id, `h${id}`, scope);
  value(old.create('tasks', { name: 'Long ago' }, as('t_write', 'old')));

  const k = await openRecord(sql, fixedClock(NOW - DAY));
  const made = value<{ id: string; version: number }>(k.create('tasks', { name: 'Ship' }, as('t_write', 'cc')));
  value(k.update('tasks', made.id, { state: 'done' }, { ...as('t_write', 'cc'), version: made.version }));
  value(k.create('tasks', { name: 'Paid', cost: { amount: 500, currency: 'GBP' } }, as('t_write', 'cc')));
  const gone = value<{ id: string; version: number }>(k.create('tasks', { name: 'Dropped' }, as('t_write', 'cc')));
  value(k.update('tasks', gone.id, { deleted_at: true }, { ...as('t_write', 'cc'), version: gone.version }));
  value(k.create('tasks', { name: 'From a revoked key' }, as('t_gone', 'cd')));
  sql.exec("UPDATE token SET revoked_at = '2026-10-05T00:00:00.000Z' WHERE id = 't_gone'");

  /* THE LEDGER REWOUND TO BEFORE 25, so the migration runs over a record that has history. */
  sql.exec('DROP TABLE ladder');
  sql.exec('DELETE FROM migration WHERE version >= 25');
  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result as never));
  assert.deepEqual(result.value.applied, [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);

  /* ADDING AND MARKING DONE CARRY ON; the costed task (money) and the delete ask, and so does every other token. */
  assert.deepEqual(ladder(sql), [
    { agent: 't_write', kind: 'tasks:add', rung: 'tell' },
    { agent: 't_write', kind: 'tasks:move:done', rung: 'tell' },
  ]);
  assert.equal(rungOf(sql, 't_write', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: null }), 'tell');
  assert.equal(rungOf(sql, 't_write', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: 'money' }), 'ask');
  assert.equal(rungOf(sql, 't_ask', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: null }), 'ask');

  /* AND IT IS ONCE: the owner's own change to a rung is not put back by another pass. */
  sql.exec("UPDATE ladder SET rung = 'ask' WHERE kind = 'tasks:add'");
  assert.equal(seedLadder(sql, NOW), 0);
  assert.equal(ladder(sql)[0]?.rung, 'ask');
  sql.close();
});

test('A TOKEN SAYS WHICH APP HOLDS IT, when its host said so, and a bad one is refused before anything is written', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  let n = 0;
  const deps: TokenDeps = {
    sql,
    nowMs: NOW,
    mint: () => `0${(n += 1).toString().padStart(4, '0')}`,
    recordId: () => 'rec_1',
    digest: async (text) => `h:${text}`,
    random: () => new Uint8Array(32).fill(n),
  };
  const client = { id: 'https://claude.ai/oauth/claude-code-client-metadata', kind: 'cimd' as const, host: 'claude.ai' };
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'propose', label: 'Claude', client }));
  assert.deepEqual(value<{ client?: unknown }>(await verifyToken(deps, minted.bearer)).client, client);
  assert.deepEqual(listTokens(sql).find((t) => t.id === minted.id)?.client, client);

  /* ONE MINTED WITH NO APP SAYS NOTHING ABOUT ONE. */
  const bare = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'read' }));
  assert.equal('client' in value<object>(await verifyToken(deps, bare.bearer)), false);

  const before = sql.all('SELECT id FROM token').length;
  const wrong = await createToken(deps, 'p_owner', { scope: 'read', client: { id: 'x', kind: 'oauth' as never, host: null } });
  assert.equal(wrong.ok, false);
  assert.equal(sql.all('SELECT id FROM token').length, before);
  sql.close();
});

/* ── H2, M3 and M4 ──────────────────────────────────── */

import { kindOfEvent, kindsOfWrite, shapeIn, type ListShape } from '../src/change-kind.ts';
import { SLASH } from '../src/slash.ts';
import type { Kernel } from '../src/index.ts';

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into', keys: 'keys', self: 'self' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};
const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', domain: 'domain', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};
const NOTED: Declaration = {
  ...TASKS,
  body: { ...(TASKS.body as object), fields: [...(TASKS.body as { fields: object[] }).fields, { id: 'note', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] } as never,
};

const AGENT = as('t_1', 'cc-1');
const tell = (sql: NodeSql, agent: string, ...kinds: string[]) => {
  for (const kind of kinds) sql.exec("INSERT INTO ladder (agent, kind, rung, since) VALUES (?, ?, 'tell', ?)", agent, kind, new Date(NOW).toISOString());
};
const ask = (k: Kernel, rows: unknown[], register: string, by: Parameters<Kernel['propose']>[1] = AGENT) =>
  value<{ id: string }>(k.propose({ question: 'Change it?', body_kind: 'rowset', body: { register, rows } }, by)).id;
const ladderSays = (k: Kernel, id: string): string | null => {
  const out = k.decide(id, { rule: 'ladder' }, 'p_owner');
  return out.ok ? null : fixOf(out as never);
};

async function people(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* THE LADDER IS WHAT IS UNDER TEST: BrainDog settling its own arranging (the Handled list) is turned off, or a question would be answered as it is filed. */
  sql.exec("INSERT INTO pref (person_id, key, value, updated_at) VALUES ('record:handled', 'on', 'false', '2026-10-01T00:00:00.000Z')");
  value(await k.install([NOTED, PEOPLE, ORGS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_1', 'p_owner', 'h', 'write', '2026-10-01T00:00:00.000Z')");
  value(k.create('people', { name: 'Ada Vine', email: 'ada@vine.test' }, AGENT));
  value(k.create('people', { name: 'A. Vine' }, AGENT));
  value(k.create('organisations', { name: 'Vine Ltd' }, AGENT));
  value(k.create('organisations', { name: 'Vine Limited' }, AGENT));
  value(k.create('tasks', { name: 'Ship the floor' }, AGENT));
  return { k, sql };
}

test('WHO A PERSON OR AN ORGANISATION IS IS READ FROM THE ROLES THEIR LIST PLAYS, never from its name', async () => {
  const { sql } = await people();
  assert.deepEqual(shapeIn(sql, 'people')?.identity, ['merged_into', 'email', 'handles', 'keys', 'self', 'name']);
  assert.deepEqual(shapeIn(sql, 'people')?.names, ['name']);
  assert.deepEqual(shapeIn(sql, 'organisations')?.identity, ['merged_into', 'keys', 'domain', 'name']);
  assert.deepEqual(shapeIn(sql, 'organisations')?.names, ['name']);
  assert.equal(shapeIn(sql, 'tasks')?.identity, undefined);
  assert.equal(shapeIn(sql, 'tasks')?.names, undefined);
  sql.close();

  /* A `contacts` LIST DECLARING THE ROLE IS FLOORED THE SAME, and a keyless `people` from before the keys by its names. */
  const other = openSqlite();
  const k = await openRecord(other, fixedClock(NOW));
  const body = PEOPLE.body as { fields: { id: string; to?: string }[] };
  const fields = body.fields.map((f) => (f.id === 'merged_into' ? { ...f, to: 'contacts' } : f));
  value(await k.install([{ id: 'register.contacts', kind: 'register', body: { ...body, id: 'contacts', name: 'Contacts', fields } as never }]));
  assert.deepEqual(shapeIn(other, 'contacts')?.identity, ['merged_into', 'email', 'handles', 'keys', 'self', 'name']);
  other.close();
  const legacy = openSqlite();
  const old = await openRecord(legacy, fixedClock(NOW));
  const { meets: _meets, ...keyless } = PEOPLE.body as unknown as Record<string, unknown>;
  value(await old.install([{ id: 'register.people', kind: 'register', body: keyless as never }]));
  assert.deepEqual(shapeIn(legacy, 'people')?.identity, ['merged_into', 'email', 'handles', 'keys', 'self', 'name']);
  legacy.close();
});

test('H2. A MERGE OR AN IDENTITY KEY IS ON THE FLOOR, and the ladder never answers it', async () => {
  const { k, sql } = await people();
  tell(sql, 't_1', 'people:edit', 'people:tag', 'organisations:edit', 'organisations:tag');
  /* ONLY `merged_into`, which no field marks `by: 'decide'`, was a plain edit the ladder let through. */
  assert.match(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { merged_into: 'people#1' } }], 'people'))!, /people:edit, which always asks \(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { email: 'ada@evil.test' } }], 'people'))!, /\(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'people#1', version: 1, patch: { keys: ['email:ada@vine.test', 'github:ada'] } }], 'people'))!, /people:tag, which always asks \(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'people#1', version: 1, patch: { handles: ['@ada'] } }], 'people'))!, /\(identity\)/);
  /* AND WHICH PERSON IS THE RECORD'S OWN, which decides the row a merge keeps and whose mail counts as his. */
  assert.match(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { self: true } }], 'people'))!, /\(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'organisations#2', version: 1, patch: { merged_into: 'organisations#1' } }], 'organisations'))!, /\(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'organisations#1', version: 1, patch: { keys: ['domain:vine.test'] } }], 'organisations'))!, /\(identity\)/);
  assert.equal(k.get('people#2')?.fields.merged_into ?? null, null, 'the merge was written');

  /* THE REST OF A PERSON STILL CLIMBS: a note, a meeting, and the name and email sent back as they already were. */
  assert.equal(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { note: 'Ada’s initials, from a commit' } }], 'people')), null);
  assert.equal(ladderSays(k, ask(k, [{ at: 'people#1', version: 1, patch: { met: ['2026-10-06 in braindog'] } }], 'people')), null);
  assert.equal(ladderSays(k, ask(k, [{ at: 'people#1', version: 2, patch: { name: 'Ada Vine', email: 'ada@vine.test', note: 'Met at the studio' } }], 'people')), null);
  assert.equal(k.get('people#1')?.fields.note, 'Met at the studio');
  sql.close();
});

test('M3. A WRITER WHO ACTS FOR NOBODY MEETS EVERY ROW A PERSON MADE AS SOMEBODY ELSE’S: Slash, and a run no token opened', async () => {
  const { k, sql } = await people();
  tell(sql, SLASH, 'tasks:edit');
  /* A ROW A MEMBER MADE ALWAYS ASKS SLASH, which is nobody's person; the floor used to need a person on both sides. */
  value(k.create('tasks', { name: 'Ada’s task' }, { actor: 'p_ada' }));
  assert.match(ladderSays(k, ask(k, [{ at: 'tasks#2', version: 1, patch: { name: 'Ada’s, renamed' } }], 'tasks', SLASH))!, /tasks:edit, which always asks \(others\)/);
  /* AND SO DOES THE OWNER'S, until he is one: Slash works for whoever owns the record, read from its members. */
  assert.match(ladderSays(k, ask(k, [{ at: 'tasks#1', version: 1, patch: { name: 'Ship it' } }], 'tasks', SLASH))!, /\(others\)/);
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  assert.equal(ladderSays(k, ask(k, [{ at: 'tasks#1', version: 1, patch: { name: 'Ship it' } }], 'tasks', SLASH)), null);
  /* A ROW NOBODY MADE AS A PERSON, such as one a rule wrote, climbs too. */
  value(k.create('tasks', { name: 'From a rule' }, { actor: 'rule:capture' }));
  assert.equal(ladderSays(k, ask(k, [{ at: 'tasks#3', version: 1, patch: { name: 'From a rule, renamed' } }], 'tasks', SLASH)), null);

  /* A RUN WITH NO TOKEN, read as the write says it. */
  const shape = shapeIn(sql, 'tasks');
  const orphan = kindsOfWrite({ list: 'tasks', op: 'update', patch: { name: 'x' }, shape, madeBy: 'p_owner', person: null });
  assert.equal(orphan[0]?.floor, 'others');
  assert.equal(kindsOfWrite({ list: 'tasks', op: 'update', patch: { name: 'x' }, shape, madeBy: null, person: null })[0]?.floor, null);
  assert.equal(kindsOfWrite({ list: 'tasks', op: 'update', patch: { name: 'x' }, shape, madeBy: 'p_owner', person: 'p_owner' })[0]?.floor, null);
  sql.close();
});

test('M4. A FIELD SENT EMPTY IS THE DELETE FLOOR, and one sent back empty as it was is not', async () => {
  const TAGGED: ListShape = { fields: [{ id: 'name', type: 'text' }, { id: 'note', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }, { id: 'cost', type: 'money' }] };
  const floor = (patch: Record<string, unknown>, was?: Record<string, unknown>) =>
    Object.fromEntries(kindsOfWrite({ list: 'tasks', op: 'update', patch, shape: TAGGED, ...(was ? { was } : {}) }).map((k) => [k.key, k.floor]));
  assert.deepEqual(floor({ note: null }), { 'tasks:edit': 'delete' });
  /* AN EMPTY TEXT IS THE THIRD WAY THE WRITE PATH REMOVES A FIELD (`isAbsent`), and was a plain edit. */
  assert.deepEqual(floor({ note: '' }), { 'tasks:edit': 'delete' });
  assert.deepEqual(floor({ note: '' }, { name: 'x' }), { 'tasks:edit': null });
  assert.deepEqual(floor({ tags: [] }), { 'tasks:tag': 'delete' });
  assert.deepEqual(floor({ tags: ['late'] }), { 'tasks:tag': null });
  assert.deepEqual(floor({ name: 'x', note: null }), { 'tasks:edit': 'delete' });
  /* A CLEARED AMOUNT IS STILL MONEY, the narrower sentence. */
  assert.deepEqual(floor({ cost: null }), { 'tasks:edit': 'money' });
  /* NOTHING SENT AS NOTHING, when the row is known. */
  assert.deepEqual(floor({ note: null, tags: [] }, { name: 'x' }), { 'tasks:tag': null, 'tasks:edit': null });
  assert.deepEqual(floor({ note: null }, { note: 'kept' }), { 'tasks:edit': 'delete' });

  /* THE LOG READS A CLEARING BACK AS ONE, and an untag, one word off a list, as a tag. */
  const line = (kind: string, field: string, to_v: string | null) => kindOfEvent({ list: 'tasks', kind, field, to_v }, TAGGED)?.floor;
  assert.equal(line('edit', 'note', 'null'), 'delete');
  assert.equal(line('edit', 'note', '"kept"'), null);
  assert.equal(line('untag', 'tags', null), null);

  const { k, sql } = await people();
  tell(sql, 't_1', 'tasks:edit', 'tasks:tag');
  value(k.update('tasks', 'tasks#1', { note: 'Before Friday', tags: ['late'] }, { ...AGENT, version: 1 }));
  assert.match(ladderSays(k, ask(k, [{ at: 'tasks#1', version: 2, patch: { note: null } }], 'tasks'))!, /tasks:edit, which always asks \(delete\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'tasks#1', version: 2, patch: { note: '' } }], 'tasks'))!, /tasks:edit, which always asks \(delete\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'tasks#1', version: 2, patch: { tags: [] } }], 'tasks'))!, /tasks:tag, which always asks \(delete\)/);
  /* AN AGENT SENDING THE PEOPLE ROW BACK WHOLE, nulls and all, is not clearing what was never there. */
  tell(sql, 't_1', 'people:edit', 'people:tag');
  assert.equal(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { note: 'Initials only', merged_into: null, keys: [] } }], 'people')), null);
  sql.close();
});

/* ── The identity floor on a new row, and on the names a merge reads ─────────────────── */

test('A NEW PERSON OR ORGANISATION MADE WITH MORE THAN A NAME IS WHO SOMEBODY IS, and asks; a name alone climbs', async () => {
  const { k, sql } = await people();
  tell(sql, 't_1', 'people:add', 'organisations:add');
  /* A PROPOSAL ROW WITHOUT `at` IS A NEW ROW, read as the write would be. Each of these used to be a plain add. */
  for (const fields of [{ self: true }, { merged_into: 'people#1' }, { email: 'ada@vine.test' }, { handles: ['@ada'] }, { keys: ['github:ada'] }])
    assert.match(ladderSays(k, ask(k, [{ name: 'Ada Vine', ...fields }], 'people'))!, /people:add, which always asks \(identity\)/, JSON.stringify(fields));
  assert.match(ladderSays(k, ask(k, [{ name: 'Evil Ltd', domain: 'vine.test' }], 'organisations'))!, /organisations:add, which always asks \(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ name: 'Vine', keys: ['bank:VINE LTD'] }], 'organisations'))!, /\(identity\)/);
  /* ONE JOINING PART AMONG PLAIN ADDS STILL HOLDS THE WHOLE QUESTION. */
  assert.match(ladderSays(k, ask(k, [{ name: 'Bea Lane' }, { name: 'Second Owner', self: true }], 'people'))!, /\(identity\)/);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'people'")?.n, 2, 'a new person was written');

  /* A NAME ALONE IS AN ADD, and a part sent empty, or `self` sent false, sets nothing. */
  assert.equal(ladderSays(k, ask(k, [{ name: 'Bea Lane' }], 'people')), null);
  assert.equal(ladderSays(k, ask(k, [{ name: 'Cy Moss', handles: [], self: false, merged_into: null, note: 'From standup' }], 'people')), null);
  assert.equal(kindsOfWrite({ list: 'people', op: 'create', patch: { name: 'Cy Moss', email: '', keys: [] }, shape: shapeIn(sql, 'people') })[0]?.floor, null);
  assert.equal(ladderSays(k, ask(k, [{ name: 'Lane Studio' }], 'organisations')), null);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'people'")?.n, 4);

  /* THE LOG READS A CREATE THE SAME WAY, so the ladder's seed never counts one made with an address as a plain add. */
  const made = (to: Record<string, unknown>) => kindOfEvent({ list: 'people', kind: 'create', field: null, to_v: JSON.stringify(to) }, shapeIn(sql, 'people'))?.floor;
  assert.equal(made({ name: 'Bea Lane' }), null);
  assert.equal(made({ name: 'Bea Lane', email: 'bea@lane.test' }), 'identity');
  sql.close();
});

test('A RENAME, AND A CHANGE TO A DOMAIN, ALIASES OR AN ORGANISATION, IS WHO SOMEBODY IS, and asks', async () => {
  const { k, sql } = await people();
  tell(sql, 't_1', 'people:edit', 'people:tag', 'organisations:edit');
  /* A RENAME PREPARES A FOLD: the strong merge matches on names, so "A. Vine" renamed "Ada Vine" is one meeting from Ada. */
  assert.match(ladderSays(k, ask(k, [{ at: 'people#2', version: 1, patch: { name: 'Ada Vine' } }], 'people'))!, /people:edit, which always asks \(identity\)/);
  assert.match(ladderSays(k, ask(k, [{ at: 'organisations#2', version: 1, patch: { name: 'Vine Ltd' } }], 'organisations'))!, /\(identity\)/);
  /* THE DOMAIN FEEDS THE ORGANISATION'S KEY, so moving it moves whose mail a domain is. */
  assert.match(ladderSays(k, ask(k, [{ at: 'organisations#1', version: 1, patch: { domain: 'vine.test' } }], 'organisations'))!, /organisations:edit, which always asks \(identity\)/);
  assert.equal(k.get('people#2')?.fields.name, 'A. Vine');
  assert.equal(k.get('organisations#1')?.fields.domain ?? null, null);

  /* ALIASES AND THE ORGANISATION A PERSON IS WITH, on a list that declares them. */
  const FULL: ListShape = {
    fields: [
      { id: 'name', type: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'org', type: 'ref' },
      { id: 'email', type: 'email' },
      { id: 'note', type: 'text' },
    ],
    identity: ['email', 'name', 'aliases', 'org'],
    names: ['name', 'aliases', 'org'],
  };
  const floor = (op: 'create' | 'update', patch: Record<string, unknown>) => Object.fromEntries(kindsOfWrite({ list: 'people', op, patch, shape: FULL }).map((x) => [x.key, x.floor]));
  assert.deepEqual(floor('update', { aliases: ['Teodor Vance'] }), { 'people:tag': 'identity' });
  assert.deepEqual(floor('update', { org: 'organisations#1' }), { 'people:edit': 'identity' });
  assert.deepEqual(floor('update', { note: 'x' }), { 'people:edit': null });
  /* MADE WITH THEM, a person is only named: the add climbs. */
  assert.deepEqual(floor('create', { name: 'Teodor', aliases: ['Teodor Vance'], org: 'organisations#1' }), { 'people:add': null });
  assert.deepEqual(floor('create', { name: 'Teodor', email: 'teodor@x.test' }), { 'people:add': 'identity' });
  sql.close();
});

test('A LIST DECLARING EVERY PART OF A PERSON FLOORS EACH, and names the ones a new row may carry', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const body = PEOPLE.body as { meets: Record<string, string>; fields: object[] };
  value(
    await k.install([
      ORGS,
      {
        id: 'register.people',
        kind: 'register',
        body: {
          ...body,
          meets: { ...body.meets, aliases: 'aliases', org: 'org' },
          fields: [...body.fields, { id: 'aliases', type: 'list', of: 'text' }, { id: 'org', type: 'ref', to: 'organisations' }],
        } as never,
      },
    ]),
  );
  assert.deepEqual(shapeIn(sql, 'people')?.identity, ['merged_into', 'email', 'handles', 'keys', 'self', 'name', 'aliases', 'org']);
  assert.deepEqual(shapeIn(sql, 'people')?.names, ['name', 'aliases', 'org']);
  sql.close();
});
