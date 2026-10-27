/**
 * `meet` through the record for each kind it tells apart: a person, met with the organisation
 * they are with and their role, and an organisation, met by its name, keys and domain. What the record holds is the
 * door: which list each kind is guarded on, which parts each kind takes, and the answer said in names.
 *
 * Who becomes whom is the kernel's (`packages/kernel/test/people.test.ts`), so nothing here asserts a match beyond what
 * the answer says of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Meeting } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

/** The organisations, read by their own names while no list declares `org:` (`orgRole` in the kernel). */
const ORGS = {
  id: 'register.organisations',
  kind: 'register' as const,
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['company', 'client', 'vendor', 'merchant', 'bank', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

/** People with a role and, when `org` is set, the organisation each one is with. */
const people = (org: boolean, role = true) => ({
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      ...(role ? [{ id: 'role', type: 'enum', values: ['client', 'contractor', 'collaborator', 'other'] }] : []),
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      ...(org ? [{ id: 'org', type: 'ref', to: 'organisations' }] : []),
    ],
  } as never,
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A token's call from a run in the braindog repository, held to `registers` when given. */
const agent = (registers?: readonly string[]): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'braindog', agent: 'claude', client_id: 'c-1' },
  ...(registers === undefined ? {} : { registers }),
});

async function record(lists: { org?: boolean; orgs?: boolean; role?: boolean } = {}) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const orgs = lists.orgs ?? true;
  value(await api.kernel.install([THINGS, ...(orgs ? [ORGS] : []), people(orgs && (lists.org ?? true), lists.role ?? true)]));
  value<Entry>(await api.create({ register: 'things', fields: { name: 'BrainDog', repos: ['braindog'] } }, owner));
  return { api, sql };
}

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refused = (r: { ok: boolean }): { code: string; at?: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const rows = (sql: ReturnType<typeof openSqlite>) => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register IN ('people', 'organisations', 'session')")?.n);

test('A KIND IS A PERSON OR AN ORGANISATION, and anything else is refused naming both', async () => {
  const { api, sql } = await record();
  const r = refused(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', kind: 'team' as never, where: 'a call' }, owner));
  assert.equal(r.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(r.at, 'kind');
  assert.equal(rows(sql), 0);
  sql.close();
});

test('AN ORGANISATION ON A RECORD WITH NO ORGANISATIONS IS REGISTER_UNKNOWN, and nothing is written, a run included', async () => {
  const { api, sql } = await record({ orgs: false });
  const r = refused(await api.meet({ name: 'Lanternfish', kind: 'organisation', domain: 'lanternfish.example', where: 'mail from lanternfish.example' }, agent()));
  assert.equal(`${r.code} at ${r.at}`, 'REGISTER_UNKNOWN at kind');
  assert.equal(rows(sql), 0);
  sql.close();
});

test('AN ORGANISATION IS MET BY ITS OWN PARTS: it is with no organisation, and an address or a kind goes only where its list keeps one', async () => {
  const { api, sql } = await record();
  /* ORGS KEEPS A NAME, A KIND AND A DOMAIN, AND NO KEYS: so an address and a handle have nowhere to go. */
  for (const [part, said] of [
    ['org', { org: 'Pellucid' }],
    ['email', { email: 'hello@lanternfish.example' }],
    ['handle', { handle: 'github:lanternfish' }],
    ['keys', { keys: ['bank:lanternfish'] }],
  ] as const) {
    const r = refused(await api.meet({ name: 'Lanternfish', kind: 'organisation', where: 'mail from lanternfish.example', ...said }, owner));
    assert.equal(`${r.code} at ${r.at}`, `FIELD_UNKNOWN at ${part}`);
    assert.doesNotMatch(r.fix, /undefined/u);
  }
  assert.equal(rows(sql), 0);
  sql.close();
});

test('AN ORGANISATION IS GUARDED ON THE ORGANISATIONS, so a token held to People alone is refused it', async () => {
  const { api, sql } = await record();
  assert.equal(refused(await api.meet({ name: 'Lanternfish', kind: 'organisation', domain: 'lanternfish.example', where: 'mail from lanternfish.example' }, agent(['people']))).code, 'FORBIDDEN');
  assert.equal(rows(sql), 0);
  sql.close();
});

test('A PERSON MET WITH THEIR ORGANISATION REACHES THAT LIST TOO, and a People that keeps none is told to leave it out', async () => {
  const held = await record();
  const r = refused(await held.api.meet({ name: 'Teodor Vance', email: 'teo@lanternfish.example', org: 'Lanternfish', where: 'commit 4464966 in braindog' }, agent(['people'])));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(rows(held.sql), 0);
  held.sql.close();

  const bare = await record({ org: false });
  for (const at of ['org', 'domain'] as const) {
    const out = refused(await bare.api.meet({ name: 'Teodor Vance', email: 'teo@lanternfish.example', [at]: 'lanternfish.example', where: 'commit 4464966 in braindog' }, owner));
    assert.equal(`${out.code} at ${out.at}`, `FIELD_UNKNOWN at ${at}`);
    assert.match(out.fix, /names no org/u);
  }
  bare.sql.close();
});

test('A ROLE GOES ONLY WHERE PEOPLE KEEPS ONE', async () => {
  const { api, sql } = await record({ role: false });
  const r = refused(await api.meet({ name: 'Teodor Vance', email: 'teo@lanternfish.example', role: 'client', where: 'a call' }, owner));
  assert.equal(`${r.code} at ${r.at}`, 'FIELD_UNKNOWN at role');
  assert.equal(rows(sql), 0);
  sql.close();
});

test('KEYS ARE A SHORT LIST OF kind:value, and anything else is refused before the kernel is asked', async () => {
  const { api, sql } = await record();
  for (const keys of ['github:ada', ['ada'], [7], Array.from({ length: 21 }, (_, i) => `github:ada${i}`)]) {
    const r = refused(await api.meet({ name: 'Ada Lovelace', keys: keys as never, where: 'a call' }, owner));
    assert.equal(`${r.code} at ${r.at}`, 'VALUE_MALFORMED at keys');
  }
  assert.equal(refused(await api.meet({ name: 7 as never, email: 'ada@example.com', where: 'a call' }, owner)).at, 'name');
  assert.equal(rows(sql), 0);
  sql.close();
});

test('THE ANSWER IS SAID IN NAMES: the row by its handle and name, how it matched, and a doubtful match by its question', async () => {
  const { api, sql } = await record();
  const first = value<Meeting>(await api.meet({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'collaborator', where: 'commit 4464966 in braindog' }, agent()));
  assert.deepEqual(first.row, { register: 'people', id: 'people#1', seq: 1, name: 'Ada Lovelace' });
  assert.equal(first.created, true);
  assert.equal(first.question, undefined);
  assert.equal(JSON.stringify(first).includes('"0'), false, 'a row id went out');

  const again = value<Meeting>(await api.meet({ email: 'ADA@example.com', where: 'commit 5a7b1c2 in braindog' }, agent()));
  assert.deepEqual([again.row?.id, again.created, again.matched_by], ['people#1', false, 'key']);

  /* THE SAME NAME UNDER ANOTHER ADDRESS IS A DOUBT, put to the person as a question, and named by the handle she reads. */
  const other = value<Meeting>(await api.meet({ name: 'Ada Lovelace', email: 'countess@analytical.org', where: 'mail from analytical.org' }, agent()));
  assert.equal(typeof other.question, 'string');
  const asked = value<{ id: string; question: string }>(await api.governance({ register: 'suggestion', id: other.question! }, owner));
  assert.match(asked.question, /Ada Lovelace/u);
  sql.close();
});
