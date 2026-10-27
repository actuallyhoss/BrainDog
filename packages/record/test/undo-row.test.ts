/**
 * "Only this one" end to end: a plan's every step says its row as `undo({ row })` takes it
 * back, on the kernel's undo and on the walk's alike, and handing that back puts back that row alone; and a walk's batch
 * is put back only as far as its plan listed, so a list the caller does not read is left as it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Understanding } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });

const TASKS = register({
  id: 'tasks',
  name: 'Tasks',
  title: 'name',
  fields: [{ id: 'name', type: 'text', required: true }],
});

const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
  ],
});

const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'party', type: 'ref', to: 'organisations' },
    { id: 'note', type: 'text' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test("THE KERNEL'S UNDO: each step names its row, and that row handed back is put back alone", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([TASKS]));
  const filed = value<{ id: string }>(await api.propose({ question: 'Add two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'Ship' }, { name: 'Bake' }] } }, owner));
  const decided = value<{ decision: string }>(await api.decide({ id: filed.id, decide: { option: 'accept', reason: '' } }, owner));
  const plan = value<UndoPlan>(await api.undo({ decision: decided.decision, dry: true }, owner));
  assert.equal(plan.steps.length, 2, plan.lines.join(' / '));
  for (const s of plan.steps) assert.ok(s.register === 'tasks' && typeof s.seq === 'number', JSON.stringify(s));

  const bake = plan.steps.find((s) => s.title === 'Bake')!;
  const row = { register: bake.register!, seq: bake.seq! };
  const one = value<UndoPlan>(await api.undo({ decision: decided.decision, row, dry: true }, owner));
  assert.equal(one.steps.length, 1);
  assert.equal(one.steps[0]!.title, 'Bake');
  value(await api.undo({ decision: decided.decision, row, hash: one.hash }, owner));
  const names = sql.all<{ n: string }>("SELECT json_extract(fields, '$.name') AS n FROM entry WHERE register = 'tasks' AND deleted_at IS NULL").map((r) => r.n);
  assert.deepEqual(names, ['Ship']);
  sql.close();
});

test("THE WALK'S UNDO: each step names its row, and that row handed back is put back alone", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, LEDGER]));
  value<Entry>(api.kernel.create('organisations', { name: 'Lowry St Studios' }, OWNER));
  const lines = ['LOWRY ST STUDIOS RENT AUG', 'LOWRY ST STUDIOS RENT SEP'].map((what) => value<Entry>(api.kernel.create('transactions', { what, amount: { amount: -1_250, currency: 'GBP' } }, OWNER)));
  const done = value<Understanding>(await api.understand({}, owner));
  const batch = done.undo![0]!;
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  for (const s of plan.steps) assert.ok(s.register === 'transactions' && typeof s.seq === 'number', JSON.stringify(s));
  const aug = plan.steps.find((s) => s.title === 'LOWRY ST STUDIOS RENT AUG')!;
  const row = { register: aug.register!, seq: aug.seq! };
  const one = value<UndoPlan>(await api.undo({ batch, row, dry: true }, owner));
  assert.deepEqual(one.lines, ['Unlink LOWRY ST STUDIOS RENT AUG from Lowry St Studios']);
  value(await api.undo({ batch, row, hash: one.hash }, owner));
  assert.equal(api.kernel.get(lines[0]!.id)?.fields.party ?? null, null);
  assert.ok(api.kernel.get(lines[1]!.id)?.fields.party, 'the other line stays linked');
  sql.close();
});

test("A WALK'S BATCH IS PUT BACK ONLY AS FAR AS ITS PLAN LISTED: a list the owner is held apart from is left as it is", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, LEDGER]));
  for (const n of [1, 2]) value(api.kernel.create('transactions', { what: `AMAZON ${n}`, note: 'Payee: Amazon Ltd.', amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  const done = value<Understanding>(await api.understand({}, owner));
  assert.ok(done.writes.includes('Added Amazon Ltd to Organisations'), done.writes.join(' / '));
  const batch = done.undo![0]!;
  const orgs = () => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'organisations' AND deleted_at IS NULL")?.n);

  /* AN OWNER HELD TO append ON TRANSACTIONS READS NONE OF IT: the plan lists the organisation, and nothing else. */
  const held: CallContext = { ...owner, levels: { transactions: 'append' } };
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, held));
  assert.ok(plan.steps.every((s) => s.register === 'organisations'), plan.lines.join(' / '));
  value(await api.undo({ batch, hash: plan.hash }, held));
  /* THE PAYMENTS STAY LINKED, SO THE ORGANISATION THEY POINT AT STAYS TOO, and nothing the plan never said was put back. */
  const parties = sql.all<{ p: string | null }>("SELECT json_extract(fields, '$.party') AS p FROM entry WHERE register = 'transactions'").map((r) => r.p);
  assert.ok(parties.every((p) => typeof p === 'string' && p !== ''), JSON.stringify(parties));
  assert.equal(orgs(), 1);

  /* THE OWNER WHO READS EVERY LIST PUTS THE REST BACK WHOLE. */
  const rest = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  value(await api.undo({ batch, hash: rest.hash }, owner));
  assert.equal(orgs(), 0);
  sql.close();
});
