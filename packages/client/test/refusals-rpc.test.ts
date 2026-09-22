/**
 * The `via: rpc` runner, for the one code a caller meets without any host answering:
 * `UNREACHABLE`, driven through `createClient`, which is the file the fixture's `raises:` names.
 *
 * THE NETWORK IS A `fetch` THAT THROWS, AND IT THROWS WHAT NODE THROWS. Asked on 2026-09-22 for
 * `http://127.0.0.1:1/api/boot`, Node's own `fetch` rejected with a `TypeError` whose message is
 * `fetch failed`, with the reason on `cause` and not in the message. An injected failure that said
 * something friendlier would be testing a network nobody has. So the double throws exactly that,
 * and the last test for each fixture asks the real `fetch` at a closed port to confirm it still does.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   call:       `{ method, args }`, called as `client.call(method, args)`. The method has to be
 *               one the route table knows, or the client answers `ROUTE_UNKNOWN` itself before
 *               any network is asked.
 *   principal:  `{ kind: person, level }`. The client carries a bearer for them, and the refusal
 *               arrives before anybody reads it, which is what carrying the owner says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { family as familyOf, type Fixture } from '../../../fixtures/corpus.ts';
import { createClient } from '../src/index.ts';

const RAISER = 'packages/client/src/index.ts';

type Call = { method: string; args: Record<string, unknown> };
type Principal = { kind: 'person'; level: string };
type Answer = { ok: boolean; refusal?: { code: string; fix: string; at?: string }; refusals?: unknown };

const json = <T>(f: Fixture, key: string): T => {
  const raw = f.keys.get(key);
  assert.ok(raw !== undefined, `fixtures/refusals/${f.name} carries no \`${key}:\`, so nothing drives it`);
  return JSON.parse(raw) as T;
};

const slice = familyOf('rpc').filter((f) => f.keys.get('raises') === RAISER);

/* NAMED, NOT COUNTED, for the reason `packages/host/test/refusals-rpc.test.ts` gives. */
test(`the rpc fixtures raised by ${RAISER} are this one, and it carries a call`, () => {
  assert.deepEqual(slice.map((f) => f.name).sort(), ['unreachable.yaml']);
  for (const f of slice) assert.ok(f.keys.has('call'), `${f.name} carries no \`call:\``);
});

/** What the client answers when the network is Node's `fetch` failing, for one fixture. */
async function drive(fixture: Fixture, network: typeof globalThis.fetch, base = 'https://braindog.example'): Promise<Answer> {
  const call = json<Call>(fixture, 'call');
  json<Principal>(fixture, 'principal');
  const client = createClient({ base, token: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.owner', fetch: network });
  return (await client.call(call.method, call.args)) as Answer;
}

const failing = (async () => {
  throw new TypeError('fetch failed');
}) as typeof globalThis.fetch;

for (const fixture of slice) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the client`, async () => {
    const body = await drive(fixture, failing);

    assert.equal(body.ok, false, `${where}'s call was accepted`);
    assert.equal(body.refusals, undefined, `${where} was answered with a list of refusals`);
    const refusal = body.refusal;
    assert.ok(refusal !== undefined && !Array.isArray(refusal), `${where} was refused with no refusal object`);
    assert.equal(refusal.code, fixture.keys.get('code'));

    /* SILENCE IS A CLAIM. `unreachable()` builds `{ code, fix }` and nothing else. */
    assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);
    assert.ok(refusal.fix.trim().length > 0, `${where} was refused with an empty fix`);
  });

  /* THE FIX IS NOT A SENTENCE, AND THIS IS MARKED `todo` RATHER THAN LEFT RED OR LEFT OUT. The client
     writes `The record could not be reached: ${e.message}`, and the message Node's `fetch` throws is
     `fetch failed`, so the whole fix reads "The record could not be reached: fetch failed" with no
     full stop and a lower-case clause that means nothing to a person. `30 §6` asks a fix to be a
     sentence. The repair is in `packages/client/src/index.ts`, which this runner does not own; the
     day it lands this starts passing and node reports the todo as passing, which is the signal to
     drop the marker. */
  test(`${fixture.name}'s fix is a sentence`, { todo: 'unreachable() appends fetch\'s own "fetch failed" with no full stop' }, async () => {
    const refusal = (await drive(fixture, failing)).refusal!;
    assert.ok(/[.?!]$/.test(refusal.fix.trim()), `${where} was refused with "${refusal.fix}", which is not a sentence`);
  });

  /* AND THE DOUBLE IS STILL THE NETWORK. Port 1 on loopback has nothing listening on any machine this
     runs on, so the real `fetch` refuses at once and the client's answer has to be the double's. If
     Node ever changes what it throws, this goes red and the double above is the thing to change. */
  test(`${fixture.name}, against a closed port, is answered the way the double answers it`, async () => {
    const real = await drive(fixture, globalThis.fetch, 'http://127.0.0.1:1');
    const doubled = await drive(fixture, failing);
    assert.deepEqual(real, doubled);
  });
}
