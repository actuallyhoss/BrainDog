/**
 * The first run's two asks on `createSlash`, the engine every host builds: before this they were drafted in `propose.ts`
 * and reachable from nowhere, because the engine's object named neither (`batch1-blocked.md`, smart-first-run).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ASK_CAP_DEFAULT, ASK_CAP_FREE, PROMPTS, createSlash, mappingAskOf, setupAskOf, type PromptId } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, MEMBER, NOW, OWNER, openSqlite } from './double.ts';

const OFFER = {
  usecases: [{ id: 'business', title: 'Small business', summary: 'Your orders and stock.' }],
  modules: [{ id: 'money-core', name: 'Money', lists: [{ id: 'obligations', name: 'Bills and invoices', fields: ['what', 'amount'] }] }],
};

const build = () => {
  const sql = openSqlite();
  const model = canned();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference: model, record: fakeRecord() });
  return { sql, model, slash };
};

test('THE ENGINE ANSWERS A SETUP, on the month it counts a question on', async () => {
  const { sql, model, slash } = build();
  model.say(
    JSON.stringify({ name: null, summary: 'Your shop.', usecase: 'business', also: [], modules: ['money-core'], currency: null, heard: [], names: [], rows: [], draft: null }),
  );
  const out = await slash.proposeSetup({ said: 'I run a shop.', offer: OFFER, today: '2026-11-14' }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.usecase, 'business');
  assert.equal(slash.status().asks.used, 1);
  sql.close();
});

test('THE ENGINE ANSWERS A MAPPING, and refuses either to anybody but the owner without asking', async () => {
  const { sql, model, slash } = build();
  model.say(JSON.stringify({ list: 'obligations', fields: [{ column: 'Item', field: 'what' }], fixed: [], summary: 'Bills.', name: null }));
  const ask = { file: 'bills.csv', columns: ['Item'], sample: [{ Item: 'Flour' }], lists: [{ id: 'obligations', name: 'Bills', fields: [{ id: 'what', type: 'text' }] }] };
  const out = await slash.proposeMapping(ask, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.list, 'obligations');
  const member = await slash.proposeMapping(ask, MEMBER);
  assert.equal(!member.ok && 'refusal' in member ? member.refusal.code : '', 'FORBIDDEN');
  assert.equal(model.seen.length, 1);
  sql.close();
});

test('THE PACKAGE EXPORTS WHAT A HOST READS A BODY WITH, and the two prompt ids it names', () => {
  assert.equal(setupAskOf({ said: 7 }).said, '');
  assert.deepEqual(mappingAskOf(null).columns, []);
  for (const id of ['setup', 'mapping'] satisfies PromptId[]) assert.ok(PROMPTS[id], `no template for ${id}`);
  assert.ok(ASK_CAP_FREE < ASK_CAP_DEFAULT);
});
