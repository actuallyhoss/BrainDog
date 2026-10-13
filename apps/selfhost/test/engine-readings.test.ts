/**
 * The record's `engineReadings` on a self-host (ENG-B01): `src/server.ts` hands the record the ledger Slash writes.
 *
 * `engineLedgerRead` reads `slash_call` out of the Slash SQLite and the record counts it by purpose. Until the host
 * handed that read to the record as `engineLedger` the method answered `null` here, whatever Slash had been asked. This
 * holds the wiring: a value before anything is asked, and one ask counted under its purpose after one read.
 *
 * THE MODEL IS THE ONLY DOUBLE, as in `slash-meter-persists.test.ts`: a real `start`, a real socket, a real record on
 * disk, and no token, so the one person on the machine is the caller.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const DRAFT = '{"registers":["things"],"where":null,"q":"Kiln"}';

const completion = () =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: DRAFT } }], usage: { prompt_tokens: 400, completion_tokens: 12 } }), {
    status: 200,
  });

type Reading = { purpose: string; asked: { day: number; week: number; month: number }; answered: number };
type Answer = { ok: boolean; value?: { asks: Reading[]; understanding: { unattached: number; open_by_cause: Record<string, number> } } | null };

test('engineReadings ANSWERS A VALUE ON A SELF-HOST, and one Slash read is one ask counted under its purpose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-engine-readings-'));
  const running = await start({
    file: join(dir, 'record.sqlite'),
    port: 0,
    pollMs: 0,
    host: '127.0.0.1',
    slash: { url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', key: 'fake-operator-key', send: async () => completion() },
  });
  try {
    const port = (running.server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    const readings = async (): Promise<Answer> => {
      const res = await fetch(`${origin}/api/engineReadings`, { headers: { origin } });
      const body = await res.text();
      assert.equal(res.status, 200, body);
      return JSON.parse(body) as Answer;
    };

    const before = await readings();
    assert.equal(before.ok, true, JSON.stringify(before));
    assert.notEqual(before.value, null, 'the host handed the record no ledger, so engineReadings answered null');
    assert.deepEqual(before.value?.asks, []);

    const asked = await fetch(`${origin}/api/slash/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ question: 'Kiln' }),
    });
    assert.equal(asked.status, 200, await asked.text());

    const after = await readings();
    assert.equal(after.ok, true, JSON.stringify(after));
    const ask = after.value?.asks.find((a) => a.purpose === 'ask');
    assert.ok(ask, `no ask was counted: ${JSON.stringify(after.value)}`);
    assert.deepEqual({ purpose: ask.purpose, asked: ask.asked, answered: ask.answered }, { purpose: 'ask', asked: { day: 1, week: 1, month: 1 }, answered: 1 });
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
