/**
 * No read a reader makes holds a colleague's address.
 *
 * "MEMBER LEVELS SAY WHO MAY SEE IT". A person invited to read a record sees its work, and the address each
 * colleague signed in with is not its work: it is how that colleague is reached, and a reader holding nine of them is
 * a reader who can mail nine people the owner never meant to hand over. The people list is the one place an address
 * belongs, and only an address somebody typed there on purpose.
 *
 * THE REAL RECORD, THE REAL INVITATION. Three people from `fixtures/names.ts`: the owner, a reader of the whole record
 * and a member who writes. Each colleague joins the way `/auth/invite` joins them (a minted link, then
 * `acceptInvite`), so whatever the record keeps about a person who joins is kept here too. Then every read a reader
 * can make is asked as the reader, and its whole answer, as JSON, must not hold the owner's or the writer's address.
 *
 * THE MEND IS ONE PLACE, `withoutColleagues` in `packages/record/src/index.ts`, asked after every method: joining still
 * meets the colleague into People with the address, which is the key their row answers to, and only whoever may see the
 * team is handed it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';
import { OWNER, PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const READER = PEOPLE[1]!;
const WRITER = PEOPLE[2]!;

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const TICKETS = {
  id: 'register.tickets',
  kind: 'register' as const,
  body: { id: 'tickets', name: 'Tickets', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'notes', type: 'text' }] } as never,
};
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never,
};
/* `people` plays `meets` where no list declares it, so a colleague who joins is met here, as on a real record. */
const PEOPLE_LIST = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

/** The record, its owner, a reader and a writer who joined through their links, and a little work by each. */
async function team() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW), sign: testSigner(), invitations: () => null });
  assert.ok((await api.kernel.install([TICKETS, THINGS, PEOPLE_LIST])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'lanternfish', name: 'Lanternfish', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: OWNER.email } })
      .ok,
  );
  const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
  for (const [id, who, level] of [['p_reader', READER, 'read'], ['p_writer', WRITER, 'write']] as const) {
    const minted = value<{ token: string }>(await api.invite({ email: who.email, level }, owner));
    value(await api.acceptInvite({ token: minted.token, person: { id, email: who.email, name: who.name } }));
  }
  /* BUILT AS THE HOST BUILDS A MEMBER, from `kernel.access`, so the grant is the one a real sign-in carries. */
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  const writer = as('p_writer');
  const first = value<{ seq: number }>(await api.create({ register: 'tickets', fields: { what: 'Fix the login page' } }, owner));
  value(await api.create({ register: 'tickets', fields: { what: 'Write the release note' } }, writer));
  value(await api.update({ register: 'tickets', seq: first.seq, patch: { notes: 'Teodor has the details' } }, writer));
  value(await api.log({ register: 'tickets', seq: first.seq, note: 'Asked about this on the call' }, owner));
  return { api, owner, reader: as('p_reader'), first: first.seq };
}

/** Every colleague address the reader's answer holds, from the reader's side: the owner's and the writer's. */
const held = (answer: unknown): string[] => {
  const said = JSON.stringify(answer).toLowerCase();
  return [OWNER.email, WRITER.email].filter((e) => said.includes(e.toLowerCase()));
};

/**
 * Each read a reader can make, by the name a person would give it. A read the reader is refused is fine: a refusal
 * holds no address either, and the check reads the refusal's words the same way it reads an answer.
 */
const READS: [string, (t: Awaited<ReturnType<typeof team>>) => Promise<unknown>][] = [
  ['the page the app opens on (boot)', ({ api, reader }) => api.boot(reader)],
  ['who am I (whoami)', ({ api, reader }) => api.whoami(reader)],
  ['what an agent starts from (context)', ({ api, reader }) => api.context(undefined, reader)],
  ['the people list', ({ api, reader }) => api.list({ register: 'people' }, reader)],
  ['the members of the record', ({ api, reader }) => api.members(reader)],
  ['the invitations waiting', ({ api, reader }) => api.invitations(reader)],
  ['the tickets', ({ api, reader }) => api.list({ register: 'tickets' }, reader)],
  ['one ticket', ({ api, reader, first }) => api.get({ register: 'tickets', seq: first }, reader)],
  ['a ticket\'s history', ({ api, reader, first }) => api.history({ register: 'tickets', seq: first }, reader)],
  ['what happened lately (activity)', ({ api, reader }) => api.recentHistory({ limit: 50 }, reader)],
  ['what is new since last time', ({ api, reader }) => api.whatsNew(undefined, reader)],
  ['the questions and decisions (governance)', ({ api, reader }) => api.governance({}, reader)],
  ['a search for a colleague by name', ({ api, reader }) => api.search({ q: WRITER.name }, reader)],
  ['a search for a colleague\'s address', ({ api, reader }) => api.search({ q: WRITER.email }, reader)],
];

test('THE OWNER SEES THE ADDRESSES, so a read that holds none for the reader is the reader\'s, not an empty record', async () => {
  const t = await team();
  const members = value<unknown>(await t.api.members(t.owner));
  assert.deepEqual(held(members).sort(), [OWNER.email, WRITER.email].sort(), 'the owner reads every member with their address');
});

for (const [name, read] of READS) {
  test(`A READER'S ${name.toUpperCase()} holds no colleague's address`, async () => {
    const t = await team();
    assert.deepEqual(held(await read(t)), [], `the reader's ${name} holds a colleague's address`);
  });
}

test('THE ADDRESS AND NOT THE ROW: a reader still reads the colleague by name, a contact\'s address and their own', async () => {
  const t = await team();
  const typed = 'buyer@acme.example';
  value(await t.api.create({ register: 'people', fields: { name: 'Acme Buyer', email: typed } }, t.owner));
  const rows = value<{ rows: { fields: { name: string; email?: string } }[] }>(await t.api.list({ register: 'people' }, t.reader)).rows;
  assert.ok(rows.some((r) => r.fields.name === WRITER.name && r.fields.email === undefined), 'the colleague is there, with no address');
  assert.equal(rows.find((r) => r.fields.name === 'Acme Buyer')?.fields.email, typed, 'a contact is the work, and stays');
  assert.equal(rows.find((r) => r.fields.name === READER.name)?.fields.email, READER.email, 'their own address is theirs');
});

test('WHOEVER MAY SEE THE TEAM STILL READS THE ADDRESSES ON PEOPLE: the owner, and somebody who decides over the whole record', async () => {
  const t = await team();
  const said = value<unknown>(await t.api.list({ register: 'people' }, t.owner));
  assert.deepEqual(held(said), [WRITER.email]);
  const decider: CallContext = { principal: { kind: 'person', id: 'p_decider', level: 'decide' } };
  assert.deepEqual(held(value<unknown>(await t.api.list({ register: 'people' }, decider))), [WRITER.email]);
  /* AND A MEMBER'S AGENT IS HELD AS THEY ARE: a key at write for the writer reads no colleague's. */
  const key: CallContext = { principal: { kind: 'token', id: 't_w', scope: 'write', person: 'p_writer', level: 'write' } };
  assert.equal(JSON.stringify(await t.api.list({ register: 'people' }, key)).includes(READER.email), false);
});
