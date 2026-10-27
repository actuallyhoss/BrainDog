/**
 * The record's `engineReadings` on a self-host: `src/server.ts` hands the record the ledger Slash writes.
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

import { firstPartyDocument } from '@braindog/seed';

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

test('A NAME MET WITH NO ADDRESS IS ONE MENTION THAT POINTS AT NOTHING, read from the record and not from Slash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-engine-mentions-'));
  const running = await start({ file: join(dir, 'record.brain'), directory: join(dir, 'directory.sqlite'), port: 0, pollMs: 0, host: '127.0.0.1' });
  try {
    const said = <T>(r: unknown): T => {
      const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
      assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
      return x.value;
    };
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    said(await running.api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } }));
    const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };
    const doc = firstPartyDocument('people', { seeds: [], holds: [] });
    const planned = said<{ diff: { planHash: string; approve: string[] } }>(await running.api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await running.api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    const unattached = async (): Promise<number | undefined> => said<Answer['value']>(await running.api.engineReadings(undefined as never, owner as never))?.understanding.unattached;

    assert.equal(await unattached(), 0);
    said(running.api.kernel.meet({ name: 'Dana Ruiz', where: 'a call about the kiln' }, { actor: person.value.id }));
    assert.equal(await unattached(), 1);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
