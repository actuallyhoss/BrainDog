/**
 * `client.engineReadings` ASKS THE RECORD WHAT THE MODEL WAS ASKED AND WHAT THE RECORD STILL DOES NOT UNDERSTAND
 * (ENG-B01 job 3), as a read of the method `engineReadings`, and hands back the record's answer unchanged: each purpose's
 * asks, answers, kept and refused, what is owed and the last error, then the mentions pointing at nothing and the open
 * questions by cause. `null` comes from a host that hands the record no ledger.
 *
 * WHY. `engineHealth` says whether the model answers and nothing about what it was asked or what came of it, so the
 * command line and an agent had no way to read the counts the record keeps. This method's verb and shape are theirs.
 *
 * A STAND-IN FETCH: the request and the shape handed back. The record's half is
 * `packages/record/test/engine-readings-method.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type EngineReadings } from '../src/index.ts';

function answering(body: unknown, status = 200) {
  const sent: { method: string; path: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: `${url.pathname}${url.search}` });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { sent, client: createClient({ base: 'https://braindog.example', token: 'rec_01TEST.read', fetch }) };
}

test('A READ, a GET of engineReadings with nothing in the query, and the answer comes back unchanged', async () => {
  const readings: EngineReadings = {
    asks: [
      {
        purpose: 'look',
        asked: { day: 3, week: 9, month: 21 },
        answered: 2,
        kept: 1,
        refused: 1,
        owed: 4,
        oldest_owed: '2026-10-11T08:00:00Z',
        last_error: { at: '2026-10-12T21:14:00Z', code: 'UNREACHABLE' },
      },
    ],
    understanding: { unattached: 5, open_by_cause: { unsaid: 2, ambiguous: 1 } },
    braked: null,
    slash: [{ kind: 'ingest', offered: 4, accepted: 2, changed: 1, declined: 1, undone: 0, lapsed: 0, share: 0.5 }],
    folds: { made: 3, undone: 1 },
    outside: 2,
  };
  const { sent, client } = answering({ ok: true, value: readings });
  const out = await client.engineReadings();
  assert.deepEqual(sent, [{ method: 'GET', path: '/api/engineReadings' }]);
  assert.ok(out.ok);
  assert.deepEqual(out.value, readings);
  /* What a reader acts on, by name: how much is still owed, and how much points at nothing. */
  assert.equal(out.value?.asks[0]?.owed, 4);
  assert.equal(out.value?.understanding.unattached, 5);
});

test('A HOST THAT HANDS NO LEDGER ANSWERS null, which a reader takes as no readings rather than none asked', async () => {
  const { client } = answering({ ok: true, value: null });
  const out = await client.engineReadings();
  assert.ok(out.ok);
  assert.equal(out.value, null);
});

test('A REFUSAL COMES BACK AS THE RECORD SAID IT, its code and its fix untouched', async () => {
  const refusal = { code: 'FORBIDDEN', fix: 'This token cannot read the engine’s readings. Use one that can read.' };
  const { sent, client } = answering({ ok: false, refusal }, 403);
  const out = await client.engineReadings();
  assert.deepEqual(sent, [{ method: 'GET', path: '/api/engineReadings' }]);
  assert.deepEqual(out, { ok: false, refusal });
});
