/**
 * Today's tiles in one request (scope 2026-10-24 A12): what is pressing, the signs, what BrainDog arranged, what it will
 * not ask again, the faults in the record's words and the day's reminders, each answered from what the record keeps, as
 * one `reads`. Today asked them as six requests through the doors; each answer here is the one its route gives alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/** Every read a tile on Today asks of the record for itself. */
const TILES = ['briefing', 'signs', 'handled', 'learned', 'textFaults', 'todayReminders'];

test("ONE REQUEST ANSWERS EVERY TILE OF TODAY, each as its own route answers it alone", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAT', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const handlers = handlersFor(api as never);
  const serve = async (name: string, body?: unknown) => {
    const req = body === undefined ? new Request(`https://x/api/${name}`) : new Request(`https://x/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await serveApi(req, handlers, owner);
    return { status: res.status, body: (await res.json()) as Answer };
  };

  const once = await serve('reads', { calls: TILES.map((method) => ({ method })) });
  assert.equal(once.status, 200, JSON.stringify(once.body).slice(0, 300));
  const answers = (once.body.value as { answers: { status: number; body: Answer }[] }).answers;
  assert.equal(answers.length, TILES.length);
  for (const [i, name] of TILES.entries()) {
    assert.equal(answers[i]!.status, 200, `${name}: ${JSON.stringify(answers[i]).slice(0, 200)}`);
    assert.ok(answers[i]!.body.ok, `${name} was refused`);
    const alone = await serve(name);
    assert.deepEqual(answers[i], alone, `${name} answered otherwise inside reads`);
  }
  sql.close();
});
