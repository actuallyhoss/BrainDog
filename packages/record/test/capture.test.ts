/**
 * `capture` (use case 6, step 5): one sentence kept as several entries across lists under one batch, so one
 * Undo takes them all back; all or none; one to eight; a retry answers the first call's batch.
 *
 * THE METHOD FILE OVER A REAL KERNEL. The record's own guards are stood in for by ones that refuse as they do: a shared
 * link captures nothing, and a key held to some lists appends to those alone. Undo is the record's own (`api.undo`, the
 * kernel's `undoPlan` beneath it), read only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import type { UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, CAPTURE_MOST, type Captured } from '../src/methods/capture.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A key that may add to Orders and nothing else. */
const ordersOnly: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'append' }, registers: ['orders'] };
const link = { principal: { kind: 'share', id: 'sh_1', slug: 'home' } } as unknown as CallContext;

const decl = (id: string, body: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;
const LISTS = [
  decl('clients', { name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('orders', {
    name: 'Orders',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'who', type: 'ref', to: 'clients' },
      { id: 'qty', type: 'int' },
    ],
  }),
  decl('tasks', { name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
];

/** Nadia's sentence as the preview reads it: a new client, her order, and a task. */
const NADIA = [
  { register: 'clients', fields: { name: 'Nadia' } },
  { register: 'orders', fields: { what: '3 vanilla jars', who: { $row: 0 }, qty: 3 } },
  { register: 'tasks', fields: { name: 'Pack the jars for Friday' } },
];

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(LISTS);
  assert.ok(put.ok, JSON.stringify(put));
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const deps = {
    kernel: api.kernel,
    sql,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('A link reads one page.') : null),
    guard: (ctx: CallContext, _need: string, list?: string) =>
      ctx.principal.kind === 'share'
        ? refuse('A link reads one page.')
        : ctx.registers === undefined || ctx.registers === '*' || (list !== undefined && (ctx.registers as string[]).includes(list))
          ? null
          : refuse('Not one of yours.'),
    readable: () => null,
    named: (a: { register?: unknown }) => (typeof a.register === 'string' && a.register !== '' ? null : { code: 'REQUIRED_MISSING', fix: 'Name a list.', at: 'register' }),
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  const live = (register: string): number =>
    sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)!.n;
  return { sql, api, capture: methods(deps).capture, live };
}

const value = <T>(out: Result<T>): T => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.ok(!out.ok, `expected a refusal, got ${JSON.stringify(out)}`);
  return (out as { refusal: Refusal }).refusal;
};

test('THREE ENTRIES, ONE BATCH: a client, her order pointing at her, and a task, every change under the batch it answers', async () => {
  const { sql, capture } = await harness();
  const got = value<Captured>(await capture({ rows: NADIA }, owner));
  assert.deepEqual(
    got.made.map((m) => [m.register, m.title]),
    [
      ['clients', 'Nadia'],
      ['orders', '3 vanilla jars'],
      ['tasks', 'Pack the jars for Friday'],
    ],
  );
  for (const m of got.made) assert.equal(typeof m.seq, 'number');
  const batches = sql.all<{ batch: string | null }>("SELECT DISTINCT batch FROM event WHERE target LIKE 'entry:%'").map((r) => r.batch);
  assert.deepEqual(batches, [got.batch], 'every change the capture wrote is under its one batch');
  const client = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'clients'")!.id;
  const who = sql.one<{ who: string }>("SELECT json_extract(fields, '$.who') AS who FROM entry WHERE register = 'orders'")!.who;
  assert.equal(who, client, '{ "$row": 0 } is the client the same capture made');
  sql.close();
});

test('ONE UNDO TAKES ALL THREE BACK: the kernel plans the batch as three, and the record puts back every one', async () => {
  const { sql, api, capture, live } = await harness();
  const got = value<Captured>(await capture({ rows: NADIA }, owner));
  const planned = value<UndoPlan>(api.kernel.undoPlan({ batch: got.batch }));
  assert.equal(planned.steps.length, 3, planned.lines.join(' / '));
  assert.deepEqual(new Set(planned.steps.map((s) => s.register)), new Set(['clients', 'orders', 'tasks']));
  const plan = value<UndoPlan>((await api.undo({ batch: got.batch, dry: true }, owner)) as Result<UndoPlan>);
  value(await api.undo({ batch: got.batch, hash: plan.hash }, owner));
  assert.deepEqual([live('clients'), live('orders'), live('tasks')], [0, 0, 0], 'the new client goes back with her order');
  sql.close();
});

test('ALL OR NONE: a refusal on the third takes the first two back, and says which entry and which field', async () => {
  const { sql, capture, live } = await harness();
  const third = { register: 'tasks', fields: { note: 'no name' } };
  const r = refusal(await capture({ rows: [NADIA[0], NADIA[1], third] }, owner));
  assert.match(r.at ?? '', /^rows\[2\]/);
  assert.deepEqual([live('clients'), live('orders'), live('tasks')], [0, 0, 0]);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE target LIKE 'entry:%'")!.n, 0, 'not one change is left in the history');
  sql.close();
});

test('NINE ENTRIES ARE REFUSED, and so are none, a pointer forward, and an entry arriving deleted', async () => {
  const { sql, capture, live } = await harness();
  const nine = Array.from({ length: CAPTURE_MOST + 1 }, (_, i) => ({ register: 'tasks', fields: { name: `Task ${i}` } }));
  const many = refusal(await capture({ rows: nine }, owner));
  assert.equal(many.code, 'OUT_OF_BOUNDS');
  assert.match(many.fix, /at most 8/);
  assert.doesNotMatch(many.fix, /\brows?\b|—/, 'the sentence a person reads says entries, and carries no dash');
  assert.equal(refusal(await capture({ rows: [] }, owner)).at, 'rows');
  const forward = refusal(await capture({ rows: [{ register: 'orders', fields: { what: 'jars', who: { $row: 1 } } }, NADIA[0]] }, owner));
  assert.equal(forward.at, 'rows[0].fields.who');
  const deleted = refusal(await capture({ rows: [{ register: 'tasks', fields: { name: 'x', deleted_at: '2026-01-01' } }] }, owner));
  assert.equal(deleted.at, 'rows[0].fields.deleted_at');
  assert.equal(live('tasks') + live('clients') + live('orders'), 0);
  sql.close();
});

test('EACH LIST IS GUARDED AS create GUARDS IT: a key that adds to Orders alone captures nothing into Clients, and a link nothing at all', async () => {
  const { sql, api, capture, live } = await harness();
  const r = refusal(await capture({ rows: [NADIA[1], NADIA[0]] }, ordersOnly));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(r.at, 'rows[1].register');
  assert.equal(live('orders'), 0, 'refused before anything is written, so the Orders entry is not kept either');
  value(await capture({ rows: [{ register: 'orders', fields: { what: '2 rose jars' } }] }, ordersOnly));
  assert.equal(live('orders'), 1);
  assert.equal(refusal(await capture({ rows: NADIA }, link)).code, 'FORBIDDEN');
  /* THE STAND-IN GUARD SAYS WHAT THE RECORD'S OWN SAYS for the same key: its `create` refuses Clients and keeps Orders. */
  assert.equal(refusal(await api.create({ register: 'clients', fields: { name: 'Nadia' } }, ordersOnly)).code, 'FORBIDDEN');
  value(await api.create({ register: 'orders', fields: { what: '1 rose jar' } }, ordersOnly));
  assert.equal(live('clients'), 0);
  sql.close();
});

test('A RETRY IS THE SAME CAPTURE: an op_id sent again answers the first batch and writes nothing; spent on another capture, it is refused', async () => {
  const { sql, capture, live } = await harness();
  const first = value<Captured>(await capture({ rows: NADIA, op_id: 'tell-1' }, owner));
  const again = value<Captured>(await capture({ rows: NADIA, op_id: 'tell-1' }, owner));
  assert.deepEqual(again, first);
  assert.deepEqual([live('clients'), live('orders'), live('tasks')], [1, 1, 1]);
  const other = refusal(await capture({ rows: [NADIA[2]!], op_id: 'tell-1' }, owner));
  assert.equal(other.at, 'op_id');
  assert.equal(live('tasks'), 1);
  sql.close();
});

test('NOBODY ARRIVES FOLDED INTO SOMEBODY: a merge is refused without the record door, and the door, when handed, has the last word', async () => {
  const { sql, api } = await harness();
  const orgs = decl('organisations', {
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  });
  assert.ok((await api.kernel.install([...LISTS, orgs])).ok);
  const base = { kernel: api.kernel, sql, scoped: () => null, guard: () => null, readable: () => null, named: () => null, no, tail: async <T>(o: T) => o, clock: fixedClock(NOW) };
  const plainDeps = methods(base as unknown as RecordDeps);
  const kept = value<Captured>(await plainDeps.capture({ rows: [{ register: 'organisations', fields: { name: 'Souq' } }] }, owner));
  const folded = { register: 'organisations', fields: { name: 'Souq Ltd', merged_into: { $row: 0 } } };
  const r = refusal(await plainDeps.capture({ rows: [{ register: 'organisations', fields: { name: 'Bazaar' } }, folded] }, owner));
  assert.equal(r.code, 'IMMUTABLE_FIELD');
  assert.equal(r.at, 'rows[1].fields.merged_into');
  const asked: string[] = [];
  const door = methods({ ...base, createDoor: (_c: CallContext, register: string, fields: Record<string, unknown>) => (asked.push(register), { fields: { ...fields, name: `${String(fields.name)}!` } }) } as unknown as RecordDeps);
  const hued = value<Captured>(await door.capture({ rows: [{ register: 'tasks', fields: { name: 'Call Souq' } }] }, owner));
  assert.deepEqual(asked, ['tasks']);
  assert.equal(hued.made[0]!.title, 'Call Souq!', 'what the door hands back is what is written');
  assert.equal(kept.made.length, 1);
  sql.close();
});

test('THROUGH THE RECORD ITSELF, once methods/index.ts lists capture: the same three entries, one batch, one Undo', async (t) => {
  const { sql, api } = await harness();
  const surface = api as unknown as { capture?: (a: unknown, c: CallContext) => Promise<Result<Captured>> };
  if (typeof surface.capture !== 'function') {
    sql.close();
    return t.skip('capture is not registered in methods/index.ts yet (blocked to the integrator)');
  }
  const got = value<Captured>(await surface.capture({ rows: NADIA }, owner));
  const plan = value<UndoPlan>((await api.undo({ batch: got.batch, dry: true }, owner)) as Result<UndoPlan>);
  assert.equal(plan.steps.length, 3, plan.lines.join(' / '));
  value(await api.undo({ batch: got.batch, hash: plan.hash }, owner));
  const live = (register: string): number =>
    sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)!.n;
  assert.deepEqual([live('clients'), live('orders'), live('tasks')], [0, 0, 0], 'the new client goes back with her order');
  /* THE RECORD'S OWN GUARD: a key that adds to Orders alone captures nothing, the Orders entry included. */
  const r = refusal(await surface.capture({ rows: [NADIA[1], NADIA[0]] }, ordersOnly));
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(r.at, 'rows[1].register');
  assert.equal(live('orders'), 0);
  sql.close();
});

test('AN AGENT CAPTURES AT ITS RUNG OR NOT AT ALL: at Ask nothing is written and create is offered; a grant moved to another app is back at Ask', async () => {
  const { sql, api, capture, live } = await harness();
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const agent = (app: string, client: string): CallContext => ({
    principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
    session: { client_id: client, client: app, host: 'mac', repo: 'braindog' },
  });
  const one = [{ register: 'tasks', fields: { name: 'Pack the jars' } }];
  const asked = refusal(await capture({ rows: one }, agent('claude-code', 'c1')));
  assert.equal(asked.code, 'FORBIDDEN');
  assert.deepEqual(asked.allowed, ['create']);
  assert.equal(live('tasks'), 0, 'at Ask nothing is written');
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', 'tasks:add', 'tell', 0, '2026-10-01T00:00:00.000Z')");
  value<Captured>(await capture({ rows: one }, agent('claude-code', 'c1')));
  assert.equal(live('tasks'), 1, 'a rung that lets the kind through lets the capture through');
  /* THE SAME GRANT FROM ANOTHER APP IS ANOTHER HOLDER, read off its runs as `create` reads it. */
  value(await api.create({ register: 'tasks', fields: { name: 'From Claude Code' } }, agent('claude-code', 'c1')));
  refusal(await capture({ rows: one }, agent('cursor', 'c2')));
  assert.equal(sql.one<{ rung: string }>("SELECT rung FROM ladder WHERE agent = 't_claude' AND kind = 'tasks:add'")?.rung, 'ask');
  sql.close();
});
