/**
 * A call asked ahead of the screen that draws it (`ClientOptions.ahead`) is out like any other and told apart
 * (`onCallsOut`'s second count), so the app's rest can leave it out while its quiet mark waits for it (speed-f SF1). A
 * wave is asked ahead only when every read in it was, and only once it is sent: a read that joins a wave still filling
 * makes the request the screen's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchReads, createClient, onCallsOut } from '../src/index.ts';

/** A host that holds every request until `open`, and answers each read (and each read in a `reads`) with nothing. */
function gated() {
  const held: (() => void)[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    await new Promise<void>((go) => held.push(go));
    if (new URL(String(input)).pathname.endsWith('/api/reads')) {
      const calls = (JSON.parse(String(init?.body)) as { calls: unknown[] }).calls;
      return Response.json({ ok: true, value: { answers: calls.map(() => ({ status: 200, body: { ok: true, value: [] } })) } });
    }
    return Response.json({ ok: true, value: [] });
  }) as typeof globalThis.fetch;
  return { fetch, waiting: () => held.length, open: () => held.splice(0).forEach((go) => go()) };
}

const until = async (ok: () => boolean): Promise<void> => {
  for (let i = 0; i < 500 && !ok(); i += 1) await new Promise((r) => setTimeout(r, 1));
  assert.ok(ok(), 'what the test waited for never came');
};

const counted = () => {
  const seen: [number, number][] = [];
  const stop = onCallsOut((out, ahead) => void seen.push([out, ahead]));
  return { now: () => seen.at(-1), stop };
};

test('A CALL ASKED AHEAD IS OUT AND TOLD APART; THE SCREEN\'S OWN IS NOT', async () => {
  const c = counted();
  try {
    assert.deepEqual(c.now(), [0, 0]);
    const g = gated();
    const early = createClient({ base: 'https://a.example', fetch: g.fetch, ahead: true }).presence();
    await until(() => g.waiting() === 1);
    assert.deepEqual(c.now(), [1, 1], 'a call asked ahead was not counted as out, or not as ahead');
    const own = createClient({ base: 'https://a.example', fetch: g.fetch }).instructionList({ limit: 5 });
    await until(() => g.waiting() === 2);
    assert.deepEqual(c.now(), [2, 1], "the screen's own call was counted as asked ahead");
    g.open();
    await Promise.all([early, own]);
    assert.deepEqual(c.now(), [0, 0], 'a call that answered is still counted');
  } finally {
    c.stop();
  }
});

test('A WAVE IS ASKED AHEAD ONLY WHEN EVERY READ IN IT WAS', async () => {
  const c = counted();
  batchReads(true);
  try {
    const g = gated();
    const a = createClient({ base: 'https://b.example', fetch: g.fetch, ahead: true });
    const both = Promise.all([a.presence(), a.instructionList({ limit: 5 })]);
    await until(() => g.waiting() === 1);
    assert.deepEqual(c.now(), [1, 1], 'a wave of reads all asked ahead was not sent as asked ahead');
    g.open();
    await both;
    assert.deepEqual(c.now(), [0, 0]);

    const h = gated();
    const ahead = createClient({ base: 'https://c.example', fetch: h.fetch, ahead: true });
    const own = createClient({ base: 'https://c.example', fetch: h.fetch });
    const mixed = Promise.all([ahead.presence(), own.instructionList({ limit: 5 })]);
    await until(() => h.waiting() === 1);
    assert.deepEqual(c.now(), [1, 0], "a wave carrying the screen's own read was counted as asked ahead");
    h.open();
    await mixed;
    assert.deepEqual(c.now(), [0, 0]);
  } finally {
    batchReads(false);
    c.stop();
  }
});
