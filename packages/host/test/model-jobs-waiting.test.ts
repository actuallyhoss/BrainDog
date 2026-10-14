/**
 * THE THREE OLDEST OF HOW MANY WAIT (ENG-B07): a pattern draft reaches the engine with the count of its shape still
 * waiting. A draft whose payload says `waiting` hands that number on; a draft over a shape counts its own and hands the
 * oldest arrivals, oldest first. Over a real record's outbox, with the inbox read answered here, newest first, as the
 * record's own inbox pages are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shapeOf } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';

import { serveModelJobs, type ModelJobMeter, type ModelJobsApi, type ModelJobsDeps } from '../src/model-jobs.ts';
import type { DraftSample } from '../src/slash-answers.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 9, 0);
const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };
const FROM = 'orders@shop.example';
const TO = 'me@inbox.example';

/** Six arrivals of one shape, a minute apart, the oldest first: `a1` is the oldest. */
const ARRIVALS = Array.from({ length: 6 }, (_, i) => ({
  id: `a${i + 1}`,
  channel: 'email',
  ts: new Date(T0 - (6 - i) * 60_000).toISOString(),
  from: FROM,
  to: TO,
  subject: `Order ${i + 1} is on its way`,
  body: `Your order ${i + 1} has shipped.`,
}));

async function drafted(payload: Record<string, unknown>) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => T0 } });
  enqueue(sql, () => 'J1', T0, 'infer.draft', payload);
  const asked: { samples: readonly DraftSample[]; waiting: number | undefined }[] = [];
  const deps: ModelJobsDeps = {
    inference: {
      draft: async (samples, waiting) => {
        asked.push({ samples, waiting });
        return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Nothing is drafted in this test.' } };
      },
      prose: async () => assert.fail('no digest is queued'),
    },
    meter: ROOM,
    now: () => T0,
    store: openSqlite(),
    log: () => undefined,
    health: async () => ({ health: { state: 'answering', last_ok: '2026-10-14T08:00:00.000Z', since: null } }),
  };
  /* THE INBOX, NEWEST FIRST AND ALL ON ONE PAGE, as the record answers a short one. */
  const inbox = (async () => ({ ok: true, value: { arrivals: [...ARRIVALS].reverse(), cursor: null } })) as unknown as ModelJobsApi['inbox'];
  await serveModelJobs({ inbox, kernel: api.kernel }, deps);
  return asked;
}

test('A DRAFT WHOSE PAYLOAD SAYS HOW MANY WAIT hands that count to the engine with its examples', async () => {
  const asked = await drafted({ examples: ['a1', 'a2', 'a3'], waiting: 7 });
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.waiting, 7);
  assert.deepEqual(asked[0]!.samples.map((s) => s.id), ['a1', 'a2', 'a3']);
});

test('A DRAFT OVER A SHAPE HANDS ITS OLDEST FIVE, oldest first, and counts all six waiting', async () => {
  const shape = shapeOf('email', { from: FROM, to: TO });
  const asked = await drafted({ signal: 'ingest.unmatched', subject: shape });
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.waiting, 6);
  assert.deepEqual(asked[0]!.samples.map((s) => s.id), ['a1', 'a2', 'a3', 'a4', 'a5']);
});
