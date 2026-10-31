/**
 * A choice a new row needs and the call left out: its values are named, and a `try` with the first one is handed only
 * when the choice is not about money. A bill's way in or out picked first is a guess at the person's money (AK14 follow).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
    ],
  } as never,
};

const CHORES = {
  id: 'register.chores',
  kind: 'register' as const,
  body: {
    id: 'chores',
    name: 'Chores',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'room', type: 'enum', values: ['kitchen', 'hall'], required: true },
    ],
  } as never,
};

async function agent() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 31, 9)) });
  assert.ok((await api.kernel.install([BILLS, CHORES])).ok);
  return tools(api);
}

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; try?: string } };
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal;
};

test('A MONEY CHOICE LEFT OUT IS NAMED, AND NO TRY PICKS ONE', async () => {
  const mcp = await agent();
  const r = refusal(await mcp.call('create', { register: 'bills', fields: { what: 'Rent' } }, owner));
  assert.equal(r.code, 'REQUIRED_MISSING');
  assert.match(r.fix, /\bin\b.*\bout\b/u);
  assert.match(r.fix, /Ask the person which/u);
  assert.equal(r.try, undefined);
});

test('ANY OTHER CHOICE LEFT OUT STILL HANDS THE CALL WITH ITS FIRST VALUE', async () => {
  const mcp = await agent();
  const r = refusal(await mcp.call('create', { register: 'chores', fields: { what: 'Mop' } }, owner));
  assert.equal(r.code, 'REQUIRED_MISSING');
  assert.doesNotMatch(r.fix, /Ask the person which/u);
  assert.match(String(r.try), /"room":"kitchen"/u);
});

test('A WRONG VALUE FOR A MONEY CHOICE IS NEVER GUESSED AS THE FIRST: the values are named and no try is handed (RL4)', async () => {
  const mcp = await agent();
  const r = refusal(await mcp.call('create', { register: 'bills', fields: { what: 'Halden deposit', direction: 'incoming' } }, owner));
  assert.equal(r.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(r.try, undefined);
});

test('A WRONG VALUE NO WORD POINTS TO GETS NO TRY, on any list (RL4)', async () => {
  const mcp = await agent();
  const r = refusal(await mcp.call('create', { register: 'chores', fields: { what: 'Mop', room: 'garage' } }, owner));
  assert.equal(r.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(r.try, undefined);
});
