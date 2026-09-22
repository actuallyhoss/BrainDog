/**
 * The `via: rpc` runner, for the two codes the shared router raises: `BODY_MALFORMED` and
 * `ROUTE_UNKNOWN`, driven through `serveApi`, which is the file both fixtures' `raises:` names.
 *
 * `40 §6` puts the `rpc` runner in `record/test`, and for these two that would be one layer above
 * the raiser, which is the mistake `packages/kernel/test/refusals-write.test.ts` names in its own
 * header: a runner above the raiser goes green when the layer between them starts answering for
 * itself. Both codes are answered before any handler runs, so the router is the surface.
 *
 * THE HANDLERS ARE A RECORD THAT REMEMBERS BEING TOUCHED, and not a record. `handlersFor` is fed a
 * proxy whose every method notes that it was reached, the same device `host.test.ts` uses to check
 * the wiring. Each of these refusals is a claim that the record was never asked anything, and a
 * real record would answer the malformed body's `create` with a refusal of its own that looks the
 * same from outside.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   call:       `{ method, args }`. Sent as a POST whose body is `JSON.stringify(args)`, which is
 *               the one way a caller can put something other than an object in the body without
 *               sending text that is not JSON at all. A read may arrive as a POST, so the verb is
 *               the same for every method.
 *   principal:  `{ kind: person, level }`, handed to `serveApi` as the context. Neither code reads
 *               it, and that is what carrying the owner says: these refuse the owner too, so they
 *               are not permission refusals.
 *
 * `record:` IS NOT CARRIED, AND NOT BECAUSE NOTHING CAN BUILD ONE. Neither code reaches a record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { family as familyOf, type Fixture } from '../../../fixtures/corpus.ts';
import { handlersFor, serveApi } from '../src/index.ts';

const RAISER = 'packages/host/src/index.ts';

type Call = { method: string; args: unknown };
type Principal = { kind: 'person'; level: 'owner' | 'decide' | 'write' | 'append' | 'read' };
type Answer = { ok: boolean; refusal?: { code: string; fix: string; at?: string }; refusals?: unknown };

const json = <T>(f: Fixture, key: string): T => {
  const raw = f.keys.get(key);
  assert.ok(raw !== undefined, `fixtures/refusals/${f.name} carries no \`${key}:\`, so nothing drives it`);
  return JSON.parse(raw) as T;
};

const slice = familyOf('rpc').filter((f) => f.keys.get('raises') === RAISER);

/* THE SLICE IS NAMED, NOT COUNTED. A count stays green when one fixture leaves and another arrives
   in the same commit; a list of names does not, and a fixture that moves its `raises:` elsewhere
   has to arrive in the runner for that file or it is driven by nothing. */
test(`the rpc fixtures raised by ${RAISER} are these two, and every one carries a call`, () => {
  assert.deepEqual(slice.map((f) => f.name).sort(), ['body-malformed.yaml', 'route-unknown.yaml']);
  for (const f of slice) assert.ok(f.keys.has('call'), `${f.name} carries no \`call:\``);
});

for (const fixture of slice) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the router`, async () => {
    const call = json<Call>(fixture, 'call');
    const principal = json<Principal>(fixture, 'principal');

    let reached: string | null = null;
    const record = new Proxy(
      {},
      {
        get: (_target, key) => async () => {
          reached = String(key);
          return ok(null);
        },
      },
    );

    const request = new Request(`https://braindog.example/api/${call.method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(call.args),
    });
    const res = await serveApi(request, handlersFor(record as never), { principal: { ...principal, id: 'p_1' } });
    const body = (await res.json()) as Answer;

    assert.equal(reached, null, `${where} reached the record's ${reached}, so the router did not refuse it`);
    assert.equal(body.ok, false, `${where}'s call was accepted`);

    /* ONE REFUSAL, AS AN OBJECT. `40 §6`'s `record/test` row asks for `refusals.length === 1`, which is
       the linter's list; the wire envelope carries exactly one under `refusal`, and a second key
       beside it would be a second answer to one call. */
    assert.equal(body.refusals, undefined, `${where} was answered with a list of refusals`);
    const refusal = body.refusal;
    assert.ok(refusal !== undefined && !Array.isArray(refusal), `${where} was refused with no refusal object`);
    assert.equal(refusal.code, fixture.keys.get('code'));

    /* SILENCE IS A CLAIM. A fixture with no `at:` says the refusal points at nothing, and the router
       adding an address later is then a change this file sees rather than one it waves through. */
    assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

    assert.ok(refusal.fix.trim().length > 0, `${where} was refused with an empty fix`);
    assert.ok(/[.?!]$/.test(refusal.fix.trim()), `${where} was refused with "${refusal.fix}", which is not a sentence`);
  });
}
