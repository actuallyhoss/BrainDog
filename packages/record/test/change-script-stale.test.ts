/**
 * A `change` that carries a script's line is refused at acceptance when the line now reads differently.
 *
 * WHAT WAS MEASURED. A script's line names the host its key goes to, which is what the key's vault entry opens, and
 * that is read once, when the change is filed. Measured: `script.gold-rate` was filed (egress `api.goldapi.io` and
 * `collector.test`, key `goldapi`) while the `goldapi` entry opened `api.goldapi.io`, so the owner read "key "goldapi"
 * to api.goldapi.io". It then revoked the entry, bound a new `goldapi` that opens `collector.test`, and pressed accept:
 * the script installed, and its key went to `collector.test`, a host the line the owner approved never paired with it.
 * A pack's plan is refused `PLAN_STALE` for the same drift, and this holds a change to the same rule.
 *
 * ONLY THE LINES THE CHANGE SHOWED ARE ASKED AGAIN, so the second case is the witness that nothing else is refused: the
 * same change, with the vault left alone, accepts and installs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { egressOf } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Out = { ok: boolean; value?: { id?: string } & Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

const GOLD_EGP = {
  id: 'register.gold_egp',
  kind: 'register' as const,
  body: { id: 'gold_egp', name: 'Gold, EGP', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};
const GOLD = {
  id: 'script.gold-rate',
  kind: 'script' as const,
  body: {
    script: 'gold-rate',
    title: 'Gold rate',
    runs: { every: '1h' },
    egress: ['https://api.goldapi.io', 'https://collector.test'],
    keys: ['goldapi'],
    reads: [],
    writes: ['gold_egp'],
    source: 'export default async function run(ctx) {}',
  } as never,
};
const KEY = (opens: string) => ({
  label: 'goldapi',
  opens,
  kind: 'api_token' as const,
  ciphertext: new Uint8Array([1]),
  nonce: new Uint8Array([9]),
  kdf: 'hkdf',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_2f',
});

async function filed() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([GOLD_EGP])).ok);
  const first = api.kernel.bindGrant(KEY('api.goldapi.io'), 'p_1');
  assert.ok(first.ok, JSON.stringify(first));
  const put = (await api.propose({ question: 'Fetch the gold price?', body_kind: 'change', body: { declaration_id: 'script.gold-rate', to: GOLD } } as never, owner)) as Out;
  assert.ok(put.ok, put.refusal?.fix);
  const id = put.value!.id!;
  const shown = (JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { approve: string[] }).approve;
  assert.ok(shown.includes('CALLS OUT api.goldapi.io and collector.test · every 1h · key "goldapi" to api.goldapi.io'), JSON.stringify(shown));
  const accept = async () => (await api.decide({ id, decide: { option: 'accept', reason: 'yes' } } as never, owner)) as Out;
  const installed = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'script.gold-rate'")?.n ?? 0;
  const status = () => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;
  return { sql, api, grant: (first as { value: { id: string } }).value.id, accept, installed, status };
}

test('A CHANGE WHOSE KEY LINE MOVED WITH THE VAULT BETWEEN FILING AND THE PRESS IS REFUSED PLAN_STALE, and stays open', async () => {
  const { sql, api, grant, accept, installed, status } = await filed();

  /* THE VAULT MOVES UNDER THE QUESTION: the entry the line named is revoked, and a new `goldapi` opens `collector.test`. */
  assert.ok(api.kernel.revokeGrant(grant, 'p_1').ok);
  assert.ok(api.kernel.bindGrant(KEY('collector.test'), 'p_1').ok);
  assert.equal(
    egressOf(GOLD.body, undefined, (label: string) => api.kernel.opensOf(label))?.line,
    'CALLS OUT api.goldapi.io and collector.test · every 1h · key "goldapi" to collector.test',
  );

  const out = await accept();
  assert.equal(out.ok, false, `accepted, and the key now goes to collector.test: ${JSON.stringify(out.value)}`);
  assert.equal(out.refusal?.code, 'PLAN_STALE');
  assert.match(out.refusal!.fix, /key "goldapi" to collector\.test/);
  assert.equal(status(), 'open');
  assert.equal(installed(), 0, 'the script installed on a line the owner never read');
  sql.close();
});

test('THE SAME CHANGE WITH THE VAULT LEFT ALONE ACCEPTS, so only a line that moved is refused', async () => {
  const { sql, accept, installed, status } = await filed();
  const out = await accept();
  assert.ok(out.ok, JSON.stringify(out));
  assert.notEqual(status(), 'open');
  assert.equal(installed(), 1);
  sql.close();
});
