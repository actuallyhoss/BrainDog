/**
 * A BRAINDOG THAT MOVED WITHOUT MOVING THE PLAN INSTALLS WHAT WAS READ (first hour audit, E2).
 *
 * A minute-old record files arrivals, headlines and rules after the first thing it is told, and each write moved the
 * integer half of `planHash`, so the first add-on installed after the first tell was refused `PLAN_STALE` one time in
 * five, for a plan that would have done exactly what the sheet showed. The record now installs the plan it makes at the
 * press when that plan says what the approved one said (`declare` `samePlan`), and only a plan that says something else
 * is sent back to be read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samePlan } from '@braindog/declare';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const PACK = (over: Record<string, unknown> = {}) => ({
  pack: 'reading-list',
  version: '1.0.0',
  summary: 'What to read next.',
  author: 'Halden',
  license: 'MIT',
  declarations: [{ register: 'books', name: 'Books', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
  ...over,
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 30, 12)), sign: testSigner() });
  assert.ok((await api.kernel.install([NOTES])).ok);
  return { api, sql };
}

type Planned = { ok: boolean; value: { diff: { planHash: string } } };
const hashOf = async (api: Awaited<ReturnType<typeof record>>['api'], doc: unknown): Promise<string> =>
  ((await api.planPack({ doc } as never, owner)) as Planned).value.diff.planHash;

test('A ROW WRITTEN BETWEEN THE PLAN AND THE PRESS, in a list the add-on never names, installs the plan read', async () => {
  const { api, sql } = await record();
  const read = await hashOf(api, PACK());
  assert.ok((await api.create({ register: 'notes', fields: { body: 'She paid half' } }, owner)).ok);
  const now = await hashOf(api, PACK());
  assert.notEqual(now, read, 'the write did not move the record');
  assert.ok(samePlan(read, now), 'a row the plan never names changed what the plan says');
  const put = (await api.installPack({ doc: PACK(), planHash: read }, owner)) as { ok: boolean; refusal?: { code: string } };
  assert.ok(put.ok, put.refusal?.code);
  assert.ok(api.kernel.register('books'), 'the list did not arrive');
  sql.close();
});

test('AND A PLAN THAT SAYS SOMETHING ELSE IS STILL SENT BACK to be read', async () => {
  const { api, sql } = await record();
  const read = await hashOf(api, PACK());
  /* The add-on edited between the plan and the press: another checksum, another plan. */
  const edited = PACK({ summary: 'Something else entirely.' });
  const put = (await api.installPack({ doc: edited, planHash: read }, owner)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(put.ok, false);
  assert.equal(put.refusal?.code, 'PLAN_STALE');
  assert.doesNotMatch(put.refusal?.fix ?? '', /\byou\b/u, 'the sentence blames the person');
  assert.equal(api.kernel.register('books'), undefined, 'a stale plan wrote something');
  sql.close();
});

test('samePlan reads only the half after the version', () => {
  assert.equal(samePlan('4.abc', '9.abc'), true);
  assert.equal(samePlan('4.abc', '4.abd'), false);
  assert.equal(samePlan('nonsense', '4.nonsense'), false);
  assert.equal(samePlan('4.', '9.'), false);
});
