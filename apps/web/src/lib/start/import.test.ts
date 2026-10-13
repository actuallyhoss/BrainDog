/**
 * The one press, for a file the person pointed at (`importFile` in `routes/start/accept.ts`). The client is a
 * fake that keeps every call, so what is under test is what the press sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importFile } from '../../routes/start/accept.ts';
import { byRules, exportLists, readExport, type Export } from './export.ts';

type Call = { name: string; args: Record<string, unknown> };

/** A record that keeps every call, and refuses an entry whose title is `refuse me`. */
const fakeClient = () => {
  const calls: Call[] = [];
  const answer = (value: unknown) => Promise.resolve({ ok: true as const, value });
  const client = {
    call: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return answer(name === 'propose' ? { id: 'SG1' } : {});
    },
    create: (args: Record<string, unknown>) => {
      calls.push({ name: 'create', args });
      const fields = args.fields as Record<string, unknown>;
      if (fields.what === 'refuse me') return Promise.resolve({ ok: false as const, refusal: { code: 'VALUE_MALFORMED', fix: 'Not today.' } });
      return answer({ register: args.register, seq: calls.length });
    },
  };
  return { calls, client: client as never };
};

const read = (file: string, text: string): Export => {
  const e = readExport(file, text);
  assert.ok(!('why' in e));
  return e;
};

const WORK_ON = [{ id: 'work', disabled_at: null, registers: ['tracks', 'updates', 'tasks'] }] as never;

test('A FILE GOES INTO THE LIST IT MAPS TO, entry by entry, and what the record refused is one line', async () => {
  const file = read('todoist.csv', 'CONTENT,DATE\nBuy flour,2026-10-05\nrefuse me,\nCall the bank,\n');
  const mapping = byRules(file, exportLists(), 'en-GB');
  const { calls, client } = fakeClient();
  const failed = await importFile(client, { file, mapping }, null, 'en-GB', WORK_ON);
  const created = calls.filter((c) => c.name === 'create');
  assert.equal(created.length, 3);
  assert.ok(created.every((c) => c.args.register === 'tasks'));
  assert.deepEqual(failed, [{ said: '1 of 3 from your file did not go into Tasks.', why: 'Not today.' }]);
});

test('A FILE WHOSE LIST IS NOT THERE WRITES NOTHING', async () => {
  const file = read('todoist.csv', 'CONTENT,DATE\nBuy flour,2026-10-05\n');
  const mapping = byRules(file, exportLists(), 'en-GB');
  const { calls, client } = fakeClient();
  const failed = await importFile(client, { file, mapping }, null, 'en-GB', [] as never);
  assert.equal(calls.length, 0);
  assert.equal(failed.length, 1);
});

test('A LIST OF THE FILE\'S OWN IS FILED AND KEPT IN THE PRESS, then filled', async () => {
  const file = read('hsbc.csv', 'Date,Description,Amount\n01/03/2026,TESCO,-12.30\n02/03/2026,Salary,2500.00\n');
  const mapping = { ...byRules(file, exportLists(), 'en-GB'), name: 'HSBC' };
  assert.equal(mapping.list, null);
  const { calls, client } = fakeClient();
  const failed = await importFile(client, { file, mapping }, 'GBP', 'en-GB', [] as never);
  assert.deepEqual(failed, []);
  assert.deepEqual(
    calls.slice(0, 2).map((c) => c.name),
    ['propose', 'decide'],
    'the list is a change, proposed and accepted before anything is written into it',
  );
  const change = calls[0]?.args as { body_kind: string; body: { to: { declarations: { id: string }[] } } };
  assert.equal(change.body_kind, 'change');
  assert.deepEqual(change.body.to.declarations.map((d) => d.id), ['register.hsbc', 'page.hsbc']);
  const created = calls.filter((c) => c.name === 'create');
  assert.equal(created.length, 2);
  assert.deepEqual(created[0]?.args, { register: 'hsbc', fields: { date: '2026-03-01', description: 'TESCO', amount: { amount: -1230, currency: 'GBP' } } });
});

