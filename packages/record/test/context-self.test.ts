/**
 * What the briefing's Who slot and the CLI read of the people here (`context`), and a folded person read by the handle
 * they had (`get`): the record's own person marked `self` and never counted as somebody met, how many people are here
 * when more than ten are, the keys the record's own person commits under, and `P9` still answering once it was merged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
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
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'in_touch', type: 'day' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const agent = (registers?: readonly string[]): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'lanternfish', agent: 'claude', client_id: 'c-1' },
  ...(registers === undefined ? {} : { registers }),
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(others: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([THINGS, PEOPLE]));
  const lanternfish = value<Entry>(await api.create({ register: 'things', fields: { name: 'Lanternfish', repos: ['lanternfish'] } }, owner));
  const person = async (fields: Record<string, unknown>) => value<Entry>(await api.create({ register: 'people', fields: { projects: [lanternfish.id], ...fields } }, owner));
  const me = await person({ name: 'Mara', email: 'Mara@Example.com', keys: ['github:maradev'], self: true, in_touch: '2026-10-06' });
  for (let i = 1; i <= others; i += 1) await person({ name: `Person ${i}`, in_touch: `2026-09-${String(((i - 1) % 28) + 1).padStart(2, '0')}` });
  return { api, sql, me };
}

test("THE RECORD'S OWN PERSON IS MARKED self, AND context SAYS THE KEYS THEY ARE KNOWN BY", async () => {
  const { api, sql } = await record(2);
  const here = value<Context>(await api.context(undefined, agent()));
  /* THE RECORD'S OWN PERSON IS NOT SOMEBODY MET HERE (`peopleHere`, AGT-B09): named by the keys below, never in people. */
  assert.deepEqual(
    here.people.map((p) => [p.name, p.self]),
    [
      ['Person 2', false],
      ['Person 1', false],
    ],
  );
  assert.deepEqual(new Set(here.self?.keys), new Set(['email:mara@example.com', 'github:maradev']));
  /* NOT MORE THAN ARE SHOWN, SO NO COUNT. */
  assert.equal(here.people_total, undefined);
  sql.close();
});

test('A CALLER WHO DOES NOT READ PEOPLE IS TOLD NO KEYS', async () => {
  const { api, sql } = await record(1);
  const here = value<Context>(await api.context(undefined, agent(['things', 'session'])));
  assert.equal(here.self, null);
  assert.deepEqual(here.people, []);
  sql.close();
});

test('MORE PEOPLE HERE THAN ARE NAMED ARE COUNTED, without the record’s own person', async () => {
  const { api, sql } = await record(12);
  const here = value<Context>(await api.context(undefined, agent()));
  /* FIVE IN THE BRIEF ANSWER, ten in the full one (AGT-B09). */
  assert.equal(here.people.length, 5);
  assert.equal(here.people_total, 12);
  const full = agent();
  const all = value<Context>(await api.context(undefined, { ...full, session: { ...full.session, format: 'full' } } as CallContext));
  assert.equal(all.people.length, 10);
  assert.equal(all.people_total, 12);
  sql.close();
});

test('PAST THE FIFTY READ TO CHOOSE FROM, EVERYBODY HERE IS STILL COUNTED', async () => {
  const { api, sql } = await record(60);
  const here = value<Context>(await api.context(undefined, agent()));
  assert.equal(here.people.length, 5);
  assert.equal(here.people_total, 60);
  sql.close();
});

test('A PERSON FOLDED INTO ANOTHER IS STILL READ BY THE HANDLE THEY HAD, saying who they were folded into', async () => {
  const { api, sql, me } = await record(1);
  const twin = value<Entry>(await api.create({ register: 'people', fields: { name: 'maradev' } }, owner));
  /* FOLDED AS EVERY MERGE IS, BY A DECISION (`mergeShaped`): a plain update may not name `merged_into`. */
  {
    const asked = value<{ id: string }>(await api.propose({ question: 'Are these the same?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: `people#${twin.seq}`, version: twin.version, patch: { merged_into: me.id, deleted_at: new Date(NOW).toISOString() } }] } }, owner));
    value(await api.decide({ id: asked.id, decide: { option: 'merge', reason: 'the same' } }, owner));
  }
  const read = value<Entry | null>(await api.get({ spoken: `people#${twin.seq}` }, owner));
  assert.equal(read?.id, twin.id);
  assert.equal(read?.fields.merged_into, me.id);
  /* ANY OTHER DELETED ROW IS STILL NOTHING. */
  const gone = value<Entry>(await api.create({ register: 'things', fields: { name: 'Old' } }, owner));
  value(await api.update({ register: 'things', seq: gone.seq!, patch: { deleted_at: new Date(NOW).toISOString() } }, owner));
  assert.equal(value<Entry | null>(await api.get({ spoken: `things#${gone.seq}` }, owner)), null);
  sql.close();
});
