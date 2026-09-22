/**
 * `scriptTry`, the record's half of trying a draft script before it is proposed (`loop/research-shell-scripts.md`
 * section 7; the host half is `@braindog/host/script-try`).
 *
 * THE RECORD CHECKS AND HANDS OVER, AND RUNS NOTHING. It holds the caller to `propose`, refuses a body an install would
 * refuse by the kernel's own `scriptBody`, and hands the host's `tryScript` the record, the body, the input, reads bound
 * to the caller, and whether the caller is the owner (a token's trial opens no key). Without a host that can try one it
 * says so with `NOT_IN_THIS_BUILD`, and nothing ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type RecordDeps } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};
const DRAFT = {
  script: 'tally',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['notes'],
  writes: [],
  source: 'export default async function run(ctx) { return (await ctx.list("notes")).length; }',
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const codeOf = (r: unknown): string | null => {
  const x = r as Out;
  return x.ok ? null : (x.refusal?.code ?? 'conflict');
};
type Draft = Parameters<NonNullable<RecordDeps['tryScript']>>[0];

async function record(tryScript?: RecordDeps['tryScript']) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(tryScript === undefined ? {} : { tryScript }) });
  const put = await api.kernel.install([NOTES]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.create('notes', { body: 'First' }, { actor: 'p_1' }).ok);
  return { sql, api };
}

test('WITHOUT A HOST THAT CAN TRY ONE, a draft is refused NOT_IN_THIS_BUILD and nothing runs', async () => {
  const { sql, api } = await record();
  assert.equal(codeOf(await api.scriptTry({ body: DRAFT }, owner)), 'NOT_IN_THIS_BUILD');
  sql.close();
});

test('A DRAFT IS HANDED TO THE HOST with the record, its input, reads bound to the caller, and whether the caller is the owner', async () => {
  const seen: Draft[] = [];
  const { sql, api } = await record(async (d) => {
    seen.push(d);
    return { ran: true, rows: (await d.reads.list('notes', null)).length };
  });
  const out = (await api.scriptTry({ body: DRAFT, input: { n: 1 } }, owner)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, { ran: true, rows: 1 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.record.tz, 'UTC');
  assert.deepEqual(seen[0]!.body, DRAFT);
  assert.deepEqual(seen[0]!.input, { n: 1 });
  assert.equal(seen[0]!.owner, true);

  /* A TOKEN MAY TRY ONE, and is not the owner, so the host opens no key for it. */
  assert.equal((await api.scriptTry({ body: DRAFT }, token)).ok, true);
  assert.equal(seen[1]!.owner, false);
  assert.equal(seen[1]!.input, null);
  sql.close();
});

test('A DRAFT AN INSTALL WOULD REFUSE, A KEY IT DOES NOT TAKE, OR A CALLER WHO MAY NOT PROPOSE, never reaches the host', async () => {
  let called = 0;
  const { sql, api } = await record(async () => {
    called++;
    return null;
  });
  assert.equal(codeOf(await api.scriptTry({ body: { ...DRAFT, network: 'none' } }, owner)), 'DECLARATION_INVALID');
  assert.equal(codeOf(await api.scriptTry({ body: 'return 1' } as never, owner)), 'REQUIRED_MISSING');
  assert.notEqual(codeOf(await api.scriptTry({ body: DRAFT, run: true } as never, owner)), null);
  assert.notEqual(codeOf(await api.scriptTry({ body: DRAFT }, reader)), null);
  assert.equal(called, 0);
  sql.close();
});
