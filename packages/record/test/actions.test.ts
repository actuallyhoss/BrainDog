/**
 * `resumeAction`, the door that starts a paused scheduled action again (`loop/DIRECTION.md` §0b).
 *
 * The kernel's own test holds the mechanism. What is held here is the door: a 401 pauses a `poll`, only an
 * owner in a browser resumes it, an argument the call does not take is refused, and an action that is not
 * paused says so rather than pretending to resume.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionAnswer } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const POLL = {
  id: 'ingest.balance',
  kind: 'ingest' as const,
  body: {
    ingest: 'balance',
    channel: 'poll',
    url: 'https://api.example.test/v1/balance',
    every: '1h',
    grant: 'example read',
    extract: { what: { after: 'balance ' } },
    writes: { register: 'notes' },
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };
const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};

const refusedKey: ActionAnswer = { status: 401, body: '', bytes: 0, ms: 2, requests: 1 };

async function paused() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const bound = api.kernel.bindGrant(
    { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
    'p_1',
  );
  assert.ok(bound.ok);
  assert.ok((await api.kernel.install([NOTES, POLL])).ok);
  assert.equal((await api.kernel.runActions(async () => refusedKey)).paused, 1);
  const state = () => sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'poll' AND key = 'balance'")?.state;
  assert.equal(state(), 'paused');
  return { api, sql, state };
}

test('ONLY AN OWNER IN A BROWSER RESUMES A PAUSED ACTION', async () => {
  const { api, sql, state } = await paused();

  assert.equal(refusal(await api.resumeAction({ ingest: 'balance' }, token)).code, 'NEEDS_BROWSER_SESSION');
  refusal(await api.resumeAction({ ingest: 'balance' }, writer));
  assert.equal(state(), 'paused', 'a refused caller resumed it');

  const out = await api.resumeAction({ ingest: 'balance' }, owner);
  assert.ok((out as Out).ok, (out as Out).refusal?.fix);
  assert.deepEqual({ ...((out as Out).value as object) }, { ingest: 'balance', kind: 'poll' });
  assert.equal(state(), 'pending');
  sql.close();
});

test('A STRAY ARGUMENT, A MISSING INGEST AND AN ACTION THAT IS NOT PAUSED ARE EACH REFUSED', async () => {
  const { api, sql, state } = await paused();

  const stray = refusal(await api.resumeAction({ ingest: 'balance', force: true } as never, owner));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'force']);
  assert.deepEqual([refusal(await api.resumeAction({} as never, owner)).code], ['REQUIRED_MISSING']);
  assert.equal(refusal(await api.resumeAction({ ingest: 'ledger' }, owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(state(), 'paused');
  sql.close();
});

test('THE ACTIONS READ ANSWERS A TOKEN: why one is paused, a held run in the month, and never a key', async () => {
  const { api, sql } = await paused();
  type Row = { ingest: string; state: string; key: string | null; last: { outcome: string; status: number | null; note: string } | null; month: Record<string, number> };
  const read = async (ctx: CallContext): Promise<Row[]> => {
    const out = (await api.actions(ctx)) as Out;
    assert.ok(out.ok, out.refusal?.fix);
    return out.value as Row[];
  };

  const [row] = await read(token);
  assert.deepEqual([row?.ingest, row?.state, row?.key, row?.last?.outcome, row?.last?.status], ['balance', 'paused', 'example read', 'paused', 401]);
  assert.match(row?.last?.note ?? '', /401/);

  assert.ok(((await api.resumeAction({ ingest: 'balance' }, owner)) as Out).ok);
  await api.kernel.runActions(async () => ({ status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: { until: Date.UTC(2026, 9, 1), say: 'balance is waiting until 1 October.' } }));
  const [held] = await read(writer);
  assert.deepEqual([held?.state, held?.last?.outcome, held?.month.held, held?.month.runs], ['pending', 'held', 1, 1]);

  assert.doesNotMatch(JSON.stringify(await read(owner)), /ciphertext|nonce|kek_2f/);
  sql.close();
});
