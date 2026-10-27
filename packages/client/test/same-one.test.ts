/**
 * `sameOne` through the client: a POST to the route of its name with the list and the people picked, answered
 * with the question on Decide as the record answers it; a pick that is not this record's people is refused in the
 * record's own sentence; and a record without the method answers `NOT_IN_THIS_BUILD` as a refusal the screen can say.
 *
 * NOT A STAND-IN FETCH: `serveApi` over a real record, as `understand.test.ts` drives it, so the body the client writes
 * is the one the host decodes and the sentence a person reads is the one the record wrote.
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

/** A record with two people who may be one and two projects, served as the host serves it. `without` drops the method. */
async function wired(opts: { without?: boolean } = {}) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, PEOPLE]));
  const add = (register: string, fields: Record<string, unknown>) =>
    value<{ id: string }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).id;
  const teodor = add('people', { name: 'Teodor Vance', email: 'teodor@brightwell.example' });
  const teo = add('people', { name: 'Teo V', handles: ['github:teodorvance'] });
  const fanline = add('things', { name: 'Fanline' });
  const copperleaf = add('things', { name: 'Copperleaf' });
  const served = opts.without ? (Object.assign(Object.create(api) as typeof api, { sameOne: undefined }) as typeof api) : api;
  const handlers = handlersFor(served as never);
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  return { sql, sent, teodor, teo, fanline, copperleaf, client: createClient({ base: 'https://braindog.example', fetch }) };
}

const refused = (out: unknown) => {
  const x = out as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false);
  return x.refusal!;
};

test('SAME ONE IS SENT AS THE WRITE ITS ROUTE IS, with the list and the people picked, and answers the question on Decide', async () => {
  assert.equal(ROUTES.find((r) => r.name === 'sameOne')?.writes, true);
  const { sql, sent, client, teodor, teo } = await wired();
  const out = await client.sameOne({ register: 'people', rows: [teodor, teo] });
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  assert.deepEqual(sent.map((s) => [s.method, s.path, s.body]), [['POST', '/api/sameOne', { register: 'people', rows: [teodor, teo] }]]);
  const open = sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid");
  assert.deepEqual(out.value, { question: open[0]!.id, opened: true }, 'the id is the one waiting on Decide');
  assert.equal(open.length, 1);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people' AND deleted_at IS NULL")!.n, 2, 'nobody is merged');

  /* Picked again, it is the question already waiting. */
  const again = await client.sameOne({ register: 'people', rows: [teo, teodor] });
  assert.deepEqual(again.ok && again.value, { question: open[0]!.id, opened: false });
  sql.close();
});

test('TWO OF ANOTHER LIST ARE REFUSED IN THE RECORD\'S OWN SENTENCE, whichever way the list is named', async () => {
  const { sql, client, fanline, copperleaf } = await wired();
  const asList = refused(await client.sameOne({ register: 'things', rows: [fanline, copperleaf] }));
  assert.deepEqual([asList.code, asList.at], ['VALUE_MALFORMED', 'register']);
  assert.equal(asList.fix, 'Only people are asked about as one, and Projects is not where this record keeps them.');

  const asPeople = refused(await client.sameOne({ register: 'people', rows: [fanline, copperleaf] }));
  assert.deepEqual([asPeople.code, asPeople.at], ['REF_REGISTER_MISMATCH', 'rows']);
  assert.equal(asPeople.fix, 'Fanline is in Projects, not People. Pick people only.');
  assert.equal(sql.all("SELECT id FROM suggestion WHERE status = 'open'").length, 0, 'nothing is asked');
  sql.close();
});

test('A RECORD WITHOUT IT IS A REFUSAL WITH A SENTENCE, not a thrown error', async () => {
  const { sql, client, teodor, teo } = await wired({ without: true });
  const no = refused(await client.sameOne({ register: 'people', rows: [teodor, teo] }));
  assert.equal(no.code, 'NOT_IN_THIS_BUILD');
  assert.ok(no.fix.length > 0);
  sql.close();
});
