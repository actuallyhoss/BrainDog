/**
 * `understand`, the nightly read of what the record holds run on ask: routed as an ADMIN write, handed to
 * the record method of the same name with the arguments as sent, and answered `NOT_IN_THIS_BUILD` by a record built
 * before it had one, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): ADMIN, the owner in a browser, so the route
 * table's ADMIN rows grow by exactly this one and no token-reachable group grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** One dry slice, as the record answers it. */
const SLICE = {
  dry: true,
  kinds: [{ kind: 'payments', looked: 40, linked: 3, refused: 0, organisations: 1 }],
  writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
  more: 1,
  questions: ['Which project is Fly for?'],
  asks: { 'service-project': 1 },
  done: false,
};
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const ask = async (handlers: ReturnType<typeof handlersFor>, body?: unknown) => {
  const request = body === undefined ? new Request('https://x/api/understand') : new Request('https://x/api/understand', { method: 'POST', body: JSON.stringify(body) });
  const res = await serveApi(request, handlers, owner);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('UNDERSTAND IS ONE ADMIN WRITE, routed once, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'understand');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['understand', 'ADMIN', true]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'understand').length, 1, 'served from routes/, not written twice');
  const what = rows[0]!.what;
  assert.match(what, /\bdry\b/u, 'the sentence says how to look before it acts');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: understand adds one ADMIN route and nothing a token reaches', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'understand'));
  assert.equal(all.ADMIN, (without.ADMIN ?? 0) + 1);
  for (const group of ['DATA', 'READ+', 'KEYCHAIN', 'JOBS']) assert.equal(all[group], without[group], `${group} grew`);
});

test('IT REACHES THE RECORD METHOD OF ITS NAME, with the arguments as sent, and a GET is refused', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      understand: async (args: unknown) => (heard.push(args), ok(SLICE)),
    }),
  );
  const out = await ask(handlers, { dry: true });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: SLICE });
  assert.deepEqual(heard.map((a) => ({ ...(a as object) })), [{ dry: true }]);
  assert.equal((await ask(handlers)).status, 405);
  sql.close();
});

test('A RECORD WITHOUT IT ANSWERS 501 WITH A SENTENCE, and nothing is changed', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const older = Object.assign(Object.create(api) as typeof api, { understand: undefined });
  const out = await ask(handlersFor(older as never), { dry: true });
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

/* ── understandPlan: the same dry slice, as a read a token may ask ─────────────────────────────────────────────────── */

const read = async (handlers: ReturnType<typeof handlersFor>, query = '') => {
  const res = await serveApi(new Request(`https://x/api/understandPlan${query}`), handlers, owner);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('UNDERSTAND PLAN IS ONE READ+ READ, routed once, taking nothing, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'understandPlan');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['understandPlan', 'READ+', false]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'understandPlan').length, 1, 'served from routes/, not written twice');
  assert.deepEqual(rows[0]!.takes, {});
  const what = rows[0]!.what;
  assert.match(what, /changes nothing/u, 'the sentence says it changes nothing');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE READ REACHES THE RECORD METHOD OF ITS NAME as a GET, and answers what the record said', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      understandPlan: async (args: unknown) => (heard.push({ ...(args as object) }), ok(SLICE)),
    }),
  );
  const out = await read(handlers);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: SLICE });
  assert.deepEqual(heard, [{}]);
  sql.close();
});

test('A RECORD WITHOUT UNDERSTAND PLAN ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const older = Object.assign(Object.create(api) as typeof api, { understandPlan: undefined });
  const out = await read(handlersFor(older as never));
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});
