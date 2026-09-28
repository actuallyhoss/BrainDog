/**
 * A newer version of a shared use case, proposed as a file (as `braindog usecase install <id> --from <catalogue>` does):
 * the plan filed for Decide says what it takes away and how many rows each list keeps, beside what it adds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportUseCase } from '@braindog/declare';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const MEETINGS = { register: 'meetings', name: 'Meetings', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const file = (version: string, declarations: Record<string, unknown>[]) => {
  const built = exportUseCase({ usecase: 'club', version, title: 'Reading club', summary: 'Books.', author: 'Halden', license: 'MIT', audience: 'other', tone: 'plain', modules: [], voice: {}, labels: {}, declarations, examples: [] });
  assert.ok(built.ok);
  return JSON.stringify(built.value);
};

test('an update that takes a list away files what it retires and the rows kept, and only the owner applies it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  const first = value<{ id: string }>(await api.propose({ question: 'Install Reading club?', body_kind: 'pack', body: { file: file('1.0.0', [BOOKS, MEETINGS]) } } as never, agent));
  value(await api.decide({ id: first.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  value(await api.create({ register: 'meetings', fields: { name: 'June' } }, owner));

  /* A LIST WITH ROWS IS NOT FILED AS RETIRED, because the accept refuses to orphan them. This was filed with
     `retires: [{ id: 'register.meetings', rows: 1 }]`, and accepting it answered `WOULD_ORPHAN` (measured on the held
     wave forty-six tree): a question the owner could only lose. `planAll` now asks `installFault` as the accept does. */
  const next = (await api.propose({ question: 'Update Reading club?', body_kind: 'pack', body: { file: file('2.0.0', [BOOKS]) } } as never, agent)) as Out;
  assert.equal(next.ok, false, 'filed an update the accept refuses');
  assert.deepEqual([next.refusal?.code, next.refusal?.at], ['WOULD_ORPHAN', 'body.packs']);
  assert.match(next.refusal?.fix ?? '', /register\.meetings, and there are 1 rows in it/u);
  assert.deepEqual(api.kernel.packStates().map((p) => p.version), ['1.0.0'], 'a proposal updated something');
  sql.close();
});

test('an update that takes an empty list away files what it retires, and only the owner applies it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  const first = value<{ id: string }>(await api.propose({ question: 'Install Reading club?', body_kind: 'pack', body: { file: file('1.0.0', [BOOKS, MEETINGS]) } } as never, agent));
  value(await api.decide({ id: first.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));

  const next = value<{ id: string }>(await api.propose({ question: 'Update Reading club?', body_kind: 'pack', body: { file: file('2.0.0', [BOOKS]) } } as never, agent));
  const row = value<{ body: { plan: { pack: string; from?: string; retires?: { id: string; rows: number }[] }[] } }>(await api.governance({ id: next.id }, owner));
  const step = row.body.plan.find((s) => s.pack === 'usecase-club');
  assert.equal(step?.from, '1.0.0');
  assert.deepEqual(step?.retires, [{ id: 'register.meetings', rows: 0 }]);
  assert.deepEqual(api.kernel.packStates().map((p) => p.version), ['1.0.0'], 'a proposal updated something');
  value(await api.decide({ id: next.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.deepEqual(api.kernel.packStates().map((p) => p.version), ['2.0.0']);
  sql.close();
});
