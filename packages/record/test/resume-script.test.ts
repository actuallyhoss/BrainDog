/**
 * `resumeScript`, the door that starts a script paused by three refused runs again.
 *
 * Guarded as `resumeAction` is: an owner in a browser, no stray argument, a script named. The pause itself is made the
 * real way, by the kernel's pass leasing `script.run` and a host's sandbox refusing three runs in a row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

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
    runs: { every: '1h' },
    egress: ['https://api.goldapi.io'],
    keys: [],
    reads: [],
    writes: ['gold_egp'],
    source: 'export default async function run(ctx) {}',
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

async function paused() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const installed = await api.kernel.install([GOLD_EGP, GOLD]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const state = () => sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = 'gold-rate'")?.state;
  const refused = async () => ({ refused: { code: null, why: 'TypeError: price_gram_24k is undefined' }, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } });
  for (let i = 0; i < 3; i++) {
    clock.advance(2 * HOUR);
    const run = await api.kernel.runActions(async () => assert.fail('a script sends no action request'), { script: refused });
    assert.equal(run.refused, 1, `run ${i + 1} was leased and refused`);
  }
  assert.equal(state(), 'paused', 'three refused runs in a row pause the script');
  return { api, sql, state };
}

test('ONLY AN OWNER IN A BROWSER RESUMES A PAUSED SCRIPT, and it is pending again', async () => {
  const { api, sql, state } = await paused();

  assert.equal(refusal(await api.resumeScript({ script: 'gold-rate' }, token)).code, 'NEEDS_BROWSER_SESSION');
  refusal(await api.resumeScript({ script: 'gold-rate' }, writer));
  assert.equal(state(), 'paused', 'a refused caller resumed it');

  const out = (await api.resumeScript({ script: 'gold-rate' }, owner)) as Out;
  assert.ok(out.ok, out.refusal?.fix);
  assert.deepEqual({ ...(out.value as object) }, { script: 'gold-rate' });
  assert.equal(state(), 'pending');
  sql.close();
});

test('A STRAY ARGUMENT, A MISSING SCRIPT AND A SCRIPT THAT IS NOT PAUSED ARE EACH REFUSED', async () => {
  const { api, sql, state } = await paused();

  const stray = refusal(await api.resumeScript({ script: 'gold-rate', force: true } as never, owner));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'force']);
  assert.equal(refusal(await api.resumeScript({} as never, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.resumeScript({ script: 'silver-rate' }, owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(state(), 'paused');
  sql.close();
});
