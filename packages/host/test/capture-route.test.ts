/**
 * `capture` (use case 6 step 5): routed once from `routes/`, DATA beside `create`, a POST handed to the record
 * method of the same name with the body as sent, and answered `NOT_IN_THIS_BUILD` by a record built before it, never a
 * 500. Over HTTP to the method file on a real kernel: three entries come back under one batch, and one Undo takes them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Refusal } from '@braindog/ports';
import type { UndoPlan } from '@braindog/kernel';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { methods } from '../../record/src/methods/capture.ts';
import type { RecordDeps } from '../../record/src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
type Answer = { ok: boolean; value?: { batch: string; made: { register: string; seq: number; title: string }[] }; refusal?: { code: string; fix: string; at?: string } };

const decl = (id: string, body: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;
const LISTS = [
  decl('clients', { name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('orders', { name: 'Orders', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'who', type: 'ref', to: 'clients' }] }),
  decl('tasks', { name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
];
const NADIA = [
  { register: 'clients', fields: { name: 'Nadia' } },
  { register: 'orders', fields: { what: '3 vanilla jars', who: { $row: 0 } } },
  { register: 'tasks', fields: { name: 'Pack the jars for Friday' } },
];

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, name: string, body?: unknown) => {
  const init = body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) };
  const res = await serveApi(new Request(`https://x/api/${name}`, init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install(LISTS)).ok);
  return { sql, api };
};

test('ONE ROW, ROUTED ONCE FROM routes/, DATA and a write, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'capture');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['capture', 'DATA', true]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'capture').length, 1, 'served from routes/, not written twice');
  assert.doesNotMatch(rows[0]!.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|#/u, 'the sentence names things as a person does');
});

test('IT REACHES THE RECORD METHOD OF ITS NAME as a POST with the body as sent, and a GET is refused', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { capture: async (args: unknown) => (heard.push(args), ok({ batch: 'B1', made: [] })) }));
  const out = await call(handlers, owner, 'capture', { rows: NADIA, op_id: 'tell-1' });
  assert.equal(out.status, 200);
  assert.deepEqual(heard, [{ rows: NADIA, op_id: 'tell-1' }]);
  assert.equal((await call(handlers, owner, 'capture')).status, 405, 'a write is not a GET');
  sql.close();
});

test('OVER HTTP ON A REAL KERNEL: three entries under one batch, one Undo takes all three, and nine are refused with a sentence', async () => {
  const { sql, api } = await fresh();
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const deps = {
    kernel: api.kernel,
    sql,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('A link reads one page.') : null),
    guard: () => null,
    readable: () => null,
    named: () => null,
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { capture: methods(deps).capture }));
  const out = await call(handlers, owner, 'capture', { rows: NADIA });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body.value!.made.map((m) => m.title), ['Nadia', '3 vanilla jars', 'Pack the jars for Friday']);
  const batch = out.body.value!.batch;
  const plan = (await api.undo({ batch, dry: true }, owner)) as { ok: true; value: UndoPlan };
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.equal(plan.value.steps.length, 3, plan.value.lines.join(' / '));
  assert.ok((await api.undo({ batch, hash: plan.value.hash }, owner)).ok);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry WHERE deleted_at IS NULL')!.n, 0);
  const nine = await call(handlers, owner, 'capture', { rows: Array.from({ length: 9 }, (_, i) => ({ register: 'tasks', fields: { name: `T${i}` } })) });
  assert.equal(nine.body.refusal?.code, 'OUT_OF_BOUNDS');
  assert.doesNotMatch(nine.body.refusal?.fix ?? '', /—|\brows?\b/u);
  assert.notEqual(nine.status, 500);
  sql.close();
});

test('A RECORD WITHOUT IT ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { capture: undefined }) as never);
  const out = await call(handlers, owner, 'capture', { rows: NADIA });
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});
