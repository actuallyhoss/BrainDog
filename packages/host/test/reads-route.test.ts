/**
 * `reads` over the wire (scope 2026-10-24 A12): several reads in one request, each answered as its own route answers it.
 *
 * THE RULE THIS HOLDS: one request in place of several is nothing wider. Each read's answer and status are what the same
 * read asked alone gets, a refusal is the same refusal, a write is never carried inside it, and it changes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/reads.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { READS_MOST } from '../../record/src/methods/reads.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 24, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await api.kernel.install([THINGS] as never)).ok);
  assert.ok(((await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner)) as { ok: boolean }).ok);
  return { sql, api, handlers: handlersFor(api as never) };
}

const ask = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, name: string, init?: { body: unknown } | string) => {
  const req =
    typeof init === 'object'
      ? new Request(`https://x/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
      : new Request(`https://x/api/${name}${init ?? ''}`);
  const res = await serveApi(req, handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('ONE ROW: a READ+ read sent as a POST, taking the list as JSON', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes, r.postRead]), [['reads', 'READ+', true, true]]);
  assert.deepEqual(OWN[0]!.takes, { calls: 'json' });
});

test('EACH READ IS WHAT IT IS ASKED ALONE, status and envelope, in the order asked', async () => {
  const { sql, handlers } = await record();
  const alone = await ask(handlers, owner, 'list', '?register=things');
  const unknown = await ask(handlers, owner, 'list', '?register=nowhere');
  const both = await ask(handlers, owner, 'reads', { body: { calls: [{ method: 'list', args: { register: 'things' } }, { method: 'list', args: { register: 'nowhere' } }, { method: 'version' }] } });
  assert.equal(both.status, 200, JSON.stringify(both.body));
  const answers = (both.body.value as { answers: { status: number; body: Answer }[] }).answers;
  assert.equal(answers.length, 3);
  assert.deepEqual(answers[0], { status: alone.status, body: alone.body });
  assert.deepEqual(answers[1], { status: unknown.status, body: unknown.body });
  assert.equal(answers[2]!.status, 200);
  sql.close();
});

test('A WRITE IS NEVER CARRIED INSIDE IT, and nothing is written', async () => {
  const { sql, api, handlers } = await record();
  const before = await api.version(owner as never);
  const out = await ask(handlers, owner, 'reads', { body: { calls: [{ method: 'create', args: { register: 'things', fields: { name: 'Tidewell' } } }, { method: 'reads', args: { calls: [] } }] } });
  assert.equal(out.status, 200);
  const answers = (out.body.value as { answers: { status: number; body: Answer }[] }).answers;
  assert.deepEqual(answers.map((a) => [a.status, a.body.refusal?.code]), [[403, 'FORBIDDEN'], [403, 'FORBIDDEN']]);
  assert.deepEqual(await api.version(owner as never), before, 'a read request moved the version');
  sql.close();
});

test('AN ARGUMENT OF THE WRONG TYPE IS REFUSED AS ITS ROUTE REFUSES IT, and a method nobody routes is unknown', async () => {
  const { sql, handlers } = await record();
  const out = await ask(handlers, owner, 'reads', { body: { calls: [{ method: 'get', args: { register: 'things', seq: 'one' } }, { method: 'nothingHere' }] } });
  const answers = (out.body.value as { answers: { status: number; body: Answer }[] }).answers;
  assert.deepEqual(answers.map((a) => [a.status, a.body.refusal?.code]), [[422, 'VALUE_MALFORMED'], [404, 'ROUTE_UNKNOWN']]);
  sql.close();
});

test('THE LIST IS CHECKED FIRST: none, too many, or one with no method is refused whole', async () => {
  const { sql, handlers } = await record();
  const none = await ask(handlers, owner, 'reads', { body: { calls: [] } });
  assert.equal(none.body.refusal?.code, 'REQUIRED_MISSING');
  const many = await ask(handlers, owner, 'reads', { body: { calls: Array.from({ length: READS_MOST + 1 }, () => ({ method: 'version' })) } });
  assert.equal(many.body.refusal?.code, 'OUT_OF_BOUNDS');
  const bare = await ask(handlers, owner, 'reads', { body: { calls: [{ args: {} }] } });
  assert.equal(bare.body.refusal?.code, 'VALUE_MALFORMED');
  sql.close();
});

test('A TOKEN READS THROUGH IT WHAT IT READS ALONE, and an owner-only read is refused to it there too', async () => {
  const { sql, handlers } = await record();
  const alone = await ask(handlers, agent, 'examples');
  const out = await ask(handlers, agent, 'reads', { body: { calls: [{ method: 'examples' }, { method: 'list', args: { register: 'things' } }] } });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const answers = (out.body.value as { answers: { status: number; body: Answer }[] }).answers;
  assert.deepEqual(answers[0], { status: alone.status, body: alone.body });
  assert.equal(answers[1]!.status, 200);
  sql.close();
});
