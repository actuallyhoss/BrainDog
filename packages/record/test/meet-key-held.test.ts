/**
 * One row per key on People and Organisations: a `create` or `update` that would give a second
 * live row a key one row already holds is refused at the record's door, naming that row and sending the caller to `meet`,
 * which adds to the row that has it. Without it an agent that wrote a person with `create` made the duplicate the
 * understanding layer exists to prevent, and the kernel's key table simply left the second row unanswered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const PEOPLE = {
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
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const ORGS = {
  id: 'register.organisations',
  kind: 'register' as const,
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
  } as never,
};

/** A list that plays no part, where the same words are only words. */
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'email', type: 'email' }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/* AN AGENT, which is sent to `meet` and handed the row's handle beside its name. */
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'lanternfish', agent: 'claude', client_id: 'c-1' },
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([PEOPLE, ORGS, NOTES]));
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Ada Lovelace', email: 'ada@example.com', handles: ['github:ada'] } }, owner));
  value<Entry>(await api.create({ register: 'organisations', fields: { name: 'Lanternfish', domain: 'lanternfish.example', keys: ['bank:lanternfish'] } }, owner));
  return { api, sql };
}

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refused = (r: { ok: boolean }): { code: string; at?: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(x.ok, false, 'the write went through');
  return x.refusal!;
};

const count = (sql: ReturnType<typeof openSqlite>, list: string) => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ?', list)?.n);

test('A SECOND PERSON UNDER AN ADDRESS ONE ALREADY HAS IS REFUSED, naming that person and sending the caller to meet', async () => {
  const { api, sql } = await record();
  const r = refused(await api.create({ register: 'people', fields: { name: 'A. Lovelace', email: ' ADA@example.com ' } }, agent));
  assert.equal(`${r.code} at ${r.at}`, 'ALREADY_KNOWN at email');
  assert.match(r.fix, /email:ada@example\.com already belongs to Ada Lovelace \(people#1\)\. Call meet/u);
  assert.equal(count(sql, 'people'), 1);

  /* A HANDLE IS A KEY TOO, and so is a key written in its own words. */
  const h = refused(await api.create({ register: 'people', fields: { name: 'Ada', handles: ['GitHub:Ada'] } }, agent));
  assert.equal(`${h.code} at ${h.at}`, 'ALREADY_KNOWN at handles');
  assert.match(h.fix, /github:ada already belongs to Ada Lovelace/u);

  /* A PERSON IN THE APP IS TOLD BY NAME, IN HER OWN WORDS: no handle, and no call she cannot make. */
  const p = refused(await api.create({ register: 'people', fields: { name: 'A. Lovelace', email: 'ada@example.com' } }, owner));
  assert.equal(`${p.code} at ${p.at}`, 'ALREADY_KNOWN at email');
  assert.equal(p.fix, 'Ada Lovelace already has ada@example.com. Add what you know to them rather than adding them twice.');
  const q = refused(await api.create({ register: 'people', fields: { name: 'Ada', handles: ['github:ada'] } }, owner));
  assert.equal(q.fix, 'Ada Lovelace already has ada on github. Add what you know to them rather than adding them twice.');
  sql.close();
});

test('AN UPDATE MAY KEEP ITS OWN KEYS, and may not take another row’s', async () => {
  const { api, sql } = await record();
  value(await api.update({ register: 'people', seq: 1, patch: { email: 'ada@example.com', handles: ['github:ada', 'slack:ada'] } }, owner));
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Grace Hopper', email: 'grace@example.com' } }, owner));
  const r = refused(await api.update({ register: 'people', seq: 2, patch: { handles: ['slack:ada'] } }, owner));
  assert.equal(`${r.code} at ${r.at}`, 'ALREADY_KNOWN at handles');
  assert.match(r.fix, /Ada Lovelace/u);
  sql.close();
});

test('AN ADDRESS OF SOMEBODY FOLDED INTO ANOTHER BELONGS TO THE ONE THEY WERE FOLDED INTO, and is refused naming them', async () => {
  const { api, sql } = await record();
  const twin = value<Entry>(await api.create({ register: 'people', fields: { name: 'A. Lovelace', email: 'countess@analytical.org' } }, owner));
  /* FOLDED AS EVERY MERGE IS, BY A DECISION (`mergeShaped`): a plain update may not name `merged_into`. */
  {
    const asked = value<{ id: string }>(await api.propose({ question: 'Are these the same?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: 'people#2', version: twin.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } }] } }, owner));
    value(await api.decide({ id: asked.id, decide: { option: 'merge', reason: 'the same' } }, owner));
  }
  const r = refused(await api.create({ register: 'people', fields: { name: 'The Countess', email: 'countess@analytical.org' } }, agent));
  assert.equal(`${r.code} at ${r.at}`, 'ALREADY_KNOWN at email');
  assert.match(r.fix, /already belongs to Ada Lovelace \(people#1\)/u);
  sql.close();
});

test('A ROW THAT IS GONE HOLDS NO KEY, so its address may be written again', async () => {
  const { api, sql } = await record();
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Grace Hopper', email: 'grace@example.com' } }, owner));
  value(await api.update({ register: 'people', seq: 2, patch: { deleted_at: 'now' } }, owner));
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Grace B. Hopper', email: 'grace@example.com' } }, owner));
  sql.close();
});

test("AN ORGANISATION'S DOMAIN AND KEYS ARE HELD THE SAME WAY", async () => {
  const { api, sql } = await record();
  const d = refused(await api.create({ register: 'organisations', fields: { name: 'Lanternfish Inc', domain: 'Lanternfish.example' } }, agent));
  assert.equal(`${d.code} at ${d.at}`, 'ALREADY_KNOWN at domain');
  assert.match(d.fix, /domain:lanternfish\.example already belongs to Lanternfish \(organisations#1\)\. Call meet/u);
  const k = refused(await api.create({ register: 'organisations', fields: { name: 'LANTERNFISH', keys: ['bank:lanternfish'] } }, owner));
  assert.equal(`${k.code} at ${k.at}`, 'ALREADY_KNOWN at keys');
  assert.equal(k.fix, 'Lanternfish already has lanternfish on bank. Add what you know to it rather than adding it twice.');
  assert.equal(count(sql, 'organisations'), 1);
  sql.close();
});

test('SOMEBODY WHO MAY NOT READ THE LIST IS NOT TOLD WHO HOLDS THE KEY, only that somebody does', async () => {
  const { api, sql } = await record();
  /* A COLLEAGUE WHO MAY ADD TO PEOPLE AND READ NOTHING. */
  value(await api.invite({ person: 'p_2', name: 'Bea', level: 'append', registers: { people: 'append' } }, owner));
  const held = api.kernel.access('p_2')!;
  const appender: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const r = refused(await api.create({ register: 'people', fields: { name: 'Ada', email: 'ada@example.com' } }, appender));
  assert.equal(`${r.code} at ${r.at}`, 'ALREADY_KNOWN at email');
  assert.doesNotMatch(r.fix, /Lovelace|people#1/u);
  assert.equal(r.fix, 'Someone on this list already has ada@example.com. Add what you know to them rather than adding them twice.');
  assert.equal(count(sql, 'people'), 1);
  sql.close();
});

test('A LIST THAT PLAYS NO PART IS NOT HELD TO IT', async () => {
  const { api, sql } = await record();
  value<Entry>(await api.create({ register: 'notes', fields: { what: 'Ada', email: 'ada@example.com' } }, owner));
  value<Entry>(await api.create({ register: 'notes', fields: { what: 'Ada again', email: 'ada@example.com' } }, owner));
  sql.close();
});
