/**
 * The Directory's trips per bearer call, with its two answers kept in the isolate (`directoryKept`) and without, and the
 * time per call in the harness. Kept, a run of calls on one record asks `knows` and the lapse once each; off, every call
 * asks both, as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

test('directory trips per bearer call', async () => {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK))!;
  await c.provision(REC, 'studio', 'ada@example.test', { keys: await recordKeys(store, REC) });
  const cookie = await c.signIn('ada@example.test');
  const res = await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label: 'agent' }) });
  const bearer = ((await res.json()) as any).value.bearer as string;
  const dir = c.directory as any;
  const counts: Record<string, number> = {};
  for (const m of ['knows', 'billing', 'resolve', 'auth']) {
    const real = dir[m].bind(dir);
    dir[m] = (...a: unknown[]) => ((counts[m] = (counts[m] ?? 0) + 1), real(...a));
  }
  const kept = (c.bundle as any).directoryKept as { on: boolean; clear(): void } | undefined;
  assert.ok(kept, 'the bundle exports directoryKept');
  const N = 200;
  const per: Record<string, Record<string, number>> = {};
  for (const mode of ['off', 'kept', 'off', 'kept']) {
    for (const k of Object.keys(counts)) delete counts[k];
    kept.clear();
    kept.on = mode === 'kept';
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await c.ask('/api/whoami', { bearer });
      assert.equal(r.status, 200);
      await r.arrayBuffer();
    }
    const ms = (performance.now() - t0) / N;
    per[mode] = { ...counts };
    console.log(mode, 'per call ms', ms.toFixed(2), 'directory calls per request', JSON.stringify(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / N).toFixed(2)]))));
  }
  kept.on = true;
  /* OFF, EVERY CALL ASKS BOTH; KEPT, THE RUN ASKS EACH ONCE. */
  assert.equal(per.off!.knows, N);
  assert.equal(per.off!.billing, N);
  assert.equal(per.kept!.knows, 1);
  assert.equal(per.kept!.billing, 1);
});
