/**
 * `resumeAction`, the door that starts a paused scheduled action again.
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

/* ── a pack that calls out, approved in the same press ─────────────────── */

const HOOK_KEY = {
  label: 'hook key',
  opens: 'hooks.example.test',
  kind: 'api_token',
  ciphertext: new Uint8Array([1, 2, 3]),
  nonce: new Uint8Array([9, 8, 7]),
  kdf: 'hkdf',
  wrapped_by: 'kek',
  kek_id: 'kek_2f',
} as const;

const BOOKS = (version: string, ...calls: Record<string, unknown>[]) => ({
  pack: 'studio-books',
  version,
  summary: 'What a small studio owes.',
  author: 'Halden',
  license: 'MIT',
  declarations: [
    { register: 'invoices', name: 'Invoices', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'text' }] },
    ...calls,
  ],
  seeds: [],
});
const PING = { ingest: 'ping', channel: 'call', url: 'https://hooks.example.test/in', every: '15m', grant: 'hook key', body: { text: 'up' } };
const STATUS = {
  ingest: 'status',
  channel: 'poll',
  url: 'https://status.example.test/v1',
  every: '1h',
  grant: 'hook key',
  extract: { what: { after: 'status ' } },
  writes: { register: 'invoices' },
};

type Planned = { diff: { planHash: string; approve: string[]; calls_out: { ingest: string; change: string }[] } };
const valueOf = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.refusal?.fix);
  return x.value as T;
};

async function books() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const armed = (ingest: string) => sql.one<{ state: string }>('SELECT state FROM schedule WHERE key = ?', ingest)?.state ?? null;
  const planOf = async (doc: unknown) => valueOf<Planned>(await api.planPack({ doc }, owner)).diff;
  return { sql, api, armed, planOf };
}

test('A PACK THAT CALLS OUT ARMS NOTHING UNTIL THE OWNER APPROVES ITS LINES, in the same press', async () => {
  const { sql, api, armed, planOf } = await books();
  const doc = BOOKS('1.0.0', PING);
  const planned = await planOf(doc);
  /* THE LINE, AND WHO CAN OPEN THE KEY UNDER IT — once, whatever the pack calls. */
  assert.deepEqual(planned.approve, ['CALLS OUT hooks.example.test · every 15m · grant "hook key"', 'A scheduled action opens this key with nobody present, so the server that runs it can open it too.']);

  /* NOT APPROVED: the whole pack stays out, because the install is one transaction, and nothing is armed. */
  const bare = refusal(await api.installPack({ doc, planHash: planned.planHash }, owner));
  assert.deepEqual([bare.code, bare.at], ['REQUIRED_MISSING', 'approve']);
  assert.equal(armed('ping'), null);
  assert.equal(api.kernel.register('invoices'), undefined, 'the rest of the pack installed without the approval');

  /* Lines that are not the plan's are not an approval of it. */
  const other = ['CALLS OUT friendly.example.test · every 15m · grant "hook key"'];
  assert.equal(refusal(await api.installPack({ doc, planHash: planned.planHash, approve: other }, owner)).code, 'PLAN_STALE');
  assert.equal(refusal(await api.installPack({ doc, planHash: planned.planHash, approve: 'yes' as never }, owner)).code, 'VALUE_MALFORMED');

  /* A TOKEN CANNOT APPROVE, even carrying the exact lines. */
  assert.equal(refusal(await api.installPack({ doc, planHash: planned.planHash, approve: planned.approve }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(armed('ping'), null);

  /* The key it sends is in the vault before anything is armed, as accepting a proposal asks. */
  const keyless = refusal(await api.installPack({ doc, planHash: planned.planHash, approve: planned.approve }, owner));
  assert.equal(keyless.code, 'REQUIRED_MISSING');
  assert.match(keyless.fix, /"hook key"/);
  assert.equal(armed('ping'), null);

  assert.ok(api.kernel.bindGrant(HOOK_KEY, 'p_1').ok);
  const again = await planOf(doc);
  valueOf(await api.installPack({ doc, planHash: again.planHash, approve: again.approve }, owner));
  assert.equal(armed('ping'), 'pending', 'approving did not arm the call');

  /* AND THE PRESS IS KEPT, word for word, signed by the owner who made it. */
  const said = sql.one<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE kind = 'install' AND target = 'pack:studio-books' ORDER BY rowid DESC LIMIT 1");
  assert.deepEqual({ ...said }, { actor: 'p_1', note: again.approve.join('\n') });
  sql.close();
});

test('AN UPDATE ASKS ONLY FOR WHAT IS NEW, and declining it leaves the installed version and its actions running', async () => {
  const { sql, api, armed, planOf } = await books();
  assert.ok(api.kernel.bindGrant(HOOK_KEY, 'p_1').ok);
  const v1 = BOOKS('1.0.0', PING);
  const first = await planOf(v1);
  valueOf(await api.installPack({ doc: v1, planHash: first.planHash, approve: first.approve }, owner));

  const v2 = BOOKS('1.1.0', PING, STATUS);
  const second = await planOf(v2);
  assert.deepEqual(second.calls_out.map((c) => [c.ingest, c.change]), [['ping', 'same'], ['status', 'new']]);
  assert.deepEqual(
    second.approve,
    ['CALLS OUT status.example.test · every 1h · grant "hook key"', 'A scheduled action opens this key with nobody present, so the server that runs it can open it too.'],
    'an action already approved was asked for again',
  );

  /* DECLINED: the update does not land, the version installed keeps running, and the new action is not armed. */
  assert.equal(refusal(await api.installPack({ doc: v2, planHash: second.planHash }, owner)).code, 'REQUIRED_MISSING');
  assert.equal(armed('ping'), 'pending');
  assert.equal(armed('status'), null);
  assert.deepEqual(valueOf<{ id: string; version: string | null }[]>(await api.packs(owner)).map((p) => p.version), ['1.0.0']);

  valueOf(await api.installPack({ doc: v2, planHash: second.planHash, approve: second.approve }, owner));
  assert.equal(armed('status'), 'pending');
  assert.equal(armed('ping'), 'pending');

  /* Installing what is installed asks for nothing. */
  const same = await planOf(v2);
  assert.deepEqual(same.approve, []);
  valueOf(await api.installPack({ doc: v2, planHash: same.planHash }, owner));
  sql.close();
});
