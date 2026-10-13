/**
 * `heldTwice` through the client (AGT-D05): a read sent to the route of its name with the list, answered with the
 * numbers of the people who may be on the record twice as the record answers them; nothing, never an empty answer, for
 * a list that is not where the record keeps people; and a record without the method answers `NOT_IN_THIS_BUILD` as a
 * refusal the screen can say.
 *
 * NOT A STAND-IN FETCH: `serveApi` over a real record, as `same-one.test.ts` drives it, so what the client sends is
 * what the host decodes and the numbers are the ones the record holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '@braindog/host';

import { createClient } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
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
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record with two called Sam among two others, served as the host serves it. `without` drops the method. */
async function wired(opts: { without?: boolean } = {}) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, PEOPLE]));
  const add = (register: string, fields: Record<string, unknown>) =>
    value<{ seq: number }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).seq;
  add('people', { name: 'Layla' });
  const sam = [add('people', { name: 'Sam', email: 'sam@one.example' })];
  add('people', { name: 'Omar Said', email: 'omar@one.example' });
  sam.push(add('people', { name: 'Sam' }));
  add('things', { name: 'Fanline' });
  const served = opts.without ? (Object.assign(Object.create(api) as typeof api, { heldTwice: undefined }) as typeof api) : api;
  const handlers = handlersFor(served as never);
  const sent: { method: string; path: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: url.pathname });
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  return { sql, sent, sam, client: createClient({ base: 'https://braindog.example', fetch }) };
}

test('HELD TWICE IS SENT AS THE READ ITS ROUTE IS, with the list, and answers the people by their numbers', async () => {
  assert.equal(ROUTES.find((r) => r.name === 'heldTwice')?.writes, false);
  const { sql, sent, sam, client } = await wired();
  const count = () => [sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n];
  const before = count();
  const out = await client.heldTwice({ register: 'people' });
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  assert.deepEqual(out.value, { seqs: [...sam].sort((a, b) => a - b) }, 'the two called Sam, lowest first, and nobody else');
  assert.deepEqual(sent.map((s) => s.path), ['/api/heldTwice']);
  assert.deepEqual(count(), before, 'a read: nothing is written and nothing is asked');
  sql.close();
});

test('A LIST THAT IS NOT WHERE THE RECORD KEEPS PEOPLE ANSWERS NOTHING, and a list it does not hold is refused by name', async () => {
  const { sql, client } = await wired();
  const things = await client.heldTwice({ register: 'things' });
  assert.deepEqual(things.ok && things.value, null);

  const nowhere = (await client.heldTwice({ register: 'nowhere' })) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(nowhere.ok, false);
  assert.deepEqual([nowhere.refusal?.code, nowhere.refusal?.at], ['REGISTER_UNKNOWN', 'register']);
  sql.close();
});

test('A RECORD WITHOUT IT IS A REFUSAL WITH A SENTENCE, not a thrown error', async () => {
  const { sql, client } = await wired({ without: true });
  const no = (await client.heldTwice({ register: 'people' })) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(no.ok, false);
  assert.equal(no.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.ok((no.refusal?.fix ?? '').length > 0);
  sql.close();
});
