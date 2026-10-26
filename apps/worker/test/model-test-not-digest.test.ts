/**
 * While the model is silent, the half-hourly model test is no digest summary. On 19 and 20 October the gateway named in
 * `AI_GATEWAY` was not on the account ("2001: Please configure AI Gateway"), every call failed, and each test the model
 * jobs pass made was written to the ledger as a digest's `prose`: the vital sign then read a record with no digest at all
 * as "Digest summaries have not been answered this week, 13 asks". Over the whole path, the pass's test through the
 * engine to the ledger and the sign, so a test that loses its mark anywhere on the way reads here as a digest ask.
 * Over a real ledger and a local `AI.run`; no neuron is spent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveModelJobs, MODEL_TEST_EVERY_MS, type ModelJobMeter } from '@braindog/host/model-jobs';
import { readModelSign } from '@braindog/host/sign-model';
import { createRecordApi } from '@braindog/record';
import { createSlash, engineHealth } from '@braindog/slash';

import { enqueue } from '../../../packages/kernel/src/outbox.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { includedInference } from '../src/slash.ts';

const T0 = Date.UTC(2026, 9, 19, 21);
const MIN = 60_000;
const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };
const DIGEST = { digest: 'weekly-1', name: 'Your week', text: 'Three tasks closed. One invoice went out.' };

/** An account with no gateway, whose binding fails without one too: no path answers. */
const AI = {
  run: async (_model: string, _inputs: unknown, options?: { gateway?: unknown }) => {
    throw new Error(options?.gateway !== undefined ? 'AiError: 2001: Please configure AI Gateway in the Cloudflare dashboard' : 'AiError: 3040: capacity temporarily exceeded');
  },
};

test('THE MODEL TEST DURING AN OUTAGE IS NO DIGEST SUMMARY: the ledger writes it as a test, and the sign counts the one digest ask', async () => {
  let now = T0;
  const clock = { now: () => now };
  const ledger = openSqlite();
  const inference = includedInference({ AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' });
  assert.ok(inference, 'the included model is on');
  const slash = createSlash({ sql: ledger, clock, inference, record: {} as never }, { tiers: ['a', 'b'], wait: async () => {} });

  /* ONE DIGEST ASKED AND NOT ANSWERED, which is a digest summary the model missed, and the engine is then silent. */
  assert.equal((await slash.digestProse(DIGEST)).ok, false);

  /* A SECOND DIGEST WAITS, so the pass tests the silent model every half hour and leases nothing. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const job = enqueue(sql, () => 'J1', now, 'infer.prose', { ...DIGEST, digest: 'weekly-2', headline: 'Your week', channels: ['mcp'] });
  const pass = (at: number) =>
    ((now = at),
    serveModelJobs(api, {
      inference: { draft: async () => assert.fail('no draft is queued'), prose: (digest) => slash.digestProse(digest) },
      meter: ROOM,
      now: () => now,
      store: ledger,
      log: () => {},
      health: async () => ({ health: engineHealth(ledger, clock, { model: true }) }),
    }));
  await pass(T0 + 5 * MIN);
  for (let i = 1; i <= 3; i++) await pass(T0 + 5 * MIN + i * MODEL_TEST_EVERY_MS);
  assert.deepEqual({ ...sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM outbox WHERE id = ?', job) }, { state: 'pending', attempts: 0 });

  const rows = ledger.all<{ purpose: string; spends: string; code: string | null }>("SELECT purpose, spends, code FROM slash_call WHERE kind = 'prose' ORDER BY ts, rowid");
  assert.deepEqual(
    rows.map((r) => [r.purpose, r.code]),
    [['prose', 'UNREACHABLE'], ...Array.from({ length: 3 }, () => ['probe', 'UNREACHABLE'])],
    'each test is written as a test',
  );
  assert.ok(rows.slice(1).every((r) => r.spends === 'none'), 'and spends nothing');

  const sign = readModelSign({ signRead: () => assert.fail('a read files nothing'), identity: () => ({ tz: 'UTC' }) }, ledger, T0 + 2 * 60 * MIN);
  assert.equal(sign.state, 'red');
  assert.equal(sign.said, 'The model did not answer 1 of 1 ask this week. Digest summaries have not been answered this week, one ask from 19 October.');
});
