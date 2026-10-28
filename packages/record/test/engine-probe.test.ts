/**
 * `engineProbe`, the record's half of the engine's probe.
 *
 * WHY THIS FILE EXISTS. After he mended a key he waited half an hour to learn whether the model answered. The host builds
 * the probe and hands it in; asserted here: the owner's press is answered from it whole with when the next may go, a
 * second press inside ten minutes is held with the minutes left, a press that sent nothing is given back, a token or a
 * member is refused before anything is asked, and a host that handed no probe is refused `NOT_IN_THIS_BUILD`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { ENGINE_PROBE_EVERY_MS, methods, type EngineProbe } from '../src/methods/engine-probe.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const TOKEN: CallContext = { principal: { kind: 'token', id: 't_admin', scope: 'write', person: 'p_owner', level: 'owner' } };
const T0 = Date.UTC(2026, 9, 15, 9);
const MINUTE = 60_000;

const SERVED: EngineProbe = {
  candidates: [{ model: 'flash-chat', served: true, strict: true, ms: 1200 }],
  said: 'Answered by flash-chat in 1.2 s.',
};

/** The method file over a real record's kernel, a clock to move, and the owner's guard as `admin` keeps it. */
const bench = async (engineProbe?: () => Promise<EngineProbe>) => {
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql: openSqlite(), clock });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const deps = {
    kernel: api.kernel,
    clock,
    no,
    admin: (ctx: CallContext) => (ctx.principal.kind === 'person' && ctx.principal.level === 'owner' ? null : { code: 'NEEDS_BROWSER_SESSION', fix: 'Only the owner, signed in, can do this.' }),
    ...(engineProbe === undefined ? {} : { engineProbe }),
  } as unknown as RecordDeps;
  return { clock, m: methods(deps) };
};

test("THE OWNER'S PRESS IS ANSWERED FROM THE HOST'S PROBE, whole, with when the next may go", async () => {
  let asked = 0;
  const { m } = await bench(async () => (asked++, SERVED));
  const out = await m.engineProbe(undefined, OWNER);
  assert.deepEqual(out, { ok: true, value: { ...SERVED, next: new Date(T0 + ENGINE_PROBE_EVERY_MS).toISOString() } });
  assert.equal(asked, 1);
});

test('A SECOND PRESS INSIDE TEN MINUTES IS HELD with the minutes left, and goes once they pass', async () => {
  let asked = 0;
  const { m, clock } = await bench(async () => (asked++, SERVED));
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
  clock.advance(3 * MINUTE);
  const held = await m.engineProbe(undefined, OWNER);
  assert.equal(held.ok, false);
  if (held.ok || !('refusal' in held)) return;
  assert.equal(held.refusal.code, 'RATE_LIMITED');
  assert.equal(held.refusal.fix, 'The model was checked in the last ten minutes. The next check can go in 7 minutes.');
  assert.equal(held.refusal.retry_after, 420);
  assert.equal(asked, 1);
  clock.advance(7 * MINUTE);
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
  assert.equal(asked, 2);
});

test('A PRESS THAT SENT NOTHING IS GIVEN BACK: no model set up, then pressed again at once', async () => {
  let asked = 0;
  const { m } = await bench(async () => (asked++, { candidates: [], said: 'No model is set up.' }));
  assert.deepEqual(await m.engineProbe(undefined, OWNER), { ok: true, value: { candidates: [], said: 'No model is set up.', next: new Date(T0).toISOString() } });
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
  assert.equal(asked, 2);
});

test('A PROBE THAT THREW GIVES THE PRESS BACK, so a fault of the host does not hold him ten minutes', async () => {
  let asked = 0;
  const { m } = await bench(async () => {
    asked++;
    if (asked === 1) throw new Error('host down');
    return SERVED;
  });
  await assert.rejects(m.engineProbe(undefined, OWNER));
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
});

test('THE OWNER ONLY: a token is refused before the probe is asked', async () => {
  let asked = 0;
  const { m } = await bench(async () => (asked++, SERVED));
  const out = await m.engineProbe(undefined, TOKEN);
  assert.equal(out.ok, false);
  assert.equal(asked, 0);
});

test('NO PROBE HANDED IN IS NOT_IN_THIS_BUILD, and an argument is refused by name', async () => {
  const { m } = await bench();
  const out = await m.engineProbe(undefined, OWNER);
  assert.equal(out.ok, false);
  if (!out.ok && 'refusal' in out) assert.equal(out.refusal.code, 'NOT_IN_THIS_BUILD');
  const { m: built } = await bench(async () => SERVED);
  const extra = await built.engineProbe({ model: 'flash-chat' }, OWNER);
  assert.equal(extra.ok, false);
  if (!extra.ok && 'refusal' in extra) assert.deepEqual([extra.refusal.code, extra.refusal.at], ['FIELD_UNKNOWN', 'model']);
  const word = await built.engineProbe('now', OWNER);
  if (!word.ok && 'refusal' in word) assert.deepEqual([word.refusal.code, word.refusal.at], ['FIELD_UNKNOWN', 'args']);
  else assert.fail('a bare word is refused');
});

test('A MARK AHEAD OF THE CLOCK DOES NOT HOLD HIM: a clock set back still lets the press go', async () => {
  let asked = 0;
  const { m, clock } = await bench(async () => (asked++, SERVED));
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
  clock.advance(-60 * MINUTE);
  assert.equal((await m.engineProbe(undefined, OWNER)).ok, true);
  assert.equal(asked, 2);
});
