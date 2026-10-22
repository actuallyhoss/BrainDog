/**
 * The `via: rpc` runner, for the two codes the self-host raises before its router is reached:
 * `UNAUTHORIZED` and `RECORD_UNAVAILABLE`, driven over a socket against `start`, which is the file
 * both fixtures' `raises:` names.
 *
 * OVER A SOCKET, BECAUSE THAT IS WHERE THE RAISER IS. Both codes come out of `contextFor`, which is
 * not exported and is reached only by a request arriving at the server, so a runner that called
 * anything smaller would be driving a copy of the order `49 §5.4` gives rather than the order the
 * server runs. The Worker raises both codes too, in its own words (`apps/worker/src/index.ts`,
 * `destroy.ts`); these two fixtures name this file, so this file is what they are held to.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   call:       `{ method, args }`, POSTed to `/api/<method>` as JSON. Both codes are answered
 *               before the body is read, so the method is only somewhere for the request to go.
 *   principal:  who is asking, as this server can be asked:
 *                 `{ kind: bearer, known: false }` a credential this record never issued
 *                 `{ kind: person, level: owner, suspended?: true }` the server key, which is the
 *                   owner; `suspended` makes that owner the record's only one, and suspended
 *
 * `record:` IS NOT CARRIED, AND `suspended` IS WHERE ITS ONE FACT WENT. `40 §4.1`'s seed records do
 * not exist, so a seed name would name nothing. What `RECORD_UNAVAILABLE` needs of a record is one
 * fact, that nobody who owns it may act, and that fact is about the principal: the server key IS the
 * owner. So the runner creates a record for the principal and suspends them.
 *
 * AND IT SUSPENDS THEM WITH SQL, BECAUSE THE RECORD WILL NOT. `suspendMember` refuses to suspend the
 * last owner who can act (`packages/kernel/src/members.ts`, `LEVEL_REQUIRED`), and, measured,
 * no test anywhere in the tree reaches this refusal, so the state that raises it is one
 * the product's own methods refuse to produce. The UPDATE writes it the way a restore of an old
 * file, or a hand edit, would leave it, which is the case the refusal is there for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { family as familyOf, type Fixture } from '../../../fixtures/corpus.ts';
import { start } from '../src/server.ts';

const RAISER = 'apps/selfhost/src/server.ts';
const KEY = 'the-server-key-for-refusals';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAD';

type Call = { method: string; args: unknown };
type Principal = { kind: 'bearer'; known: false } | { kind: 'person'; level: 'owner'; suspended?: boolean };
type Answer = { ok: boolean; refusal?: { code: string; fix: string; at?: string }; refusals?: unknown };

const json = <T>(f: Fixture, key: string): T => {
  const raw = f.keys.get(key);
  assert.ok(raw !== undefined, `fixtures/refusals/${f.name} carries no \`${key}:\`, so nothing drives it`);
  return JSON.parse(raw) as T;
};

const slice = familyOf('rpc').filter((f) => f.keys.get('raises') === RAISER);

/* THE SLICE IS NAMED, NOT COUNTED, for the reason `packages/host/test/refusals-rpc.test.ts` gives:
   a fixture that leaves and one that arrives in the same commit keep a count green. */
test(`the rpc fixtures raised by ${RAISER} are these two, and every one carries a call`, () => {
  assert.deepEqual(slice.map((f) => f.name).sort(), ['record-unavailable.yaml', 'unauthorized.yaml']);
  for (const f of slice) assert.ok(f.keys.has('call'), `${f.name} carries no \`call:\``);
});

for (const fixture of slice) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the self-host`, async () => {
    const call = json<Call>(fixture, 'call');
    const principal = json<Principal>(fixture, 'principal');

    const dir = mkdtempSync(join(tmpdir(), 'braindog-refusals-'));
    const running = await start({ file: join(dir, 'record.sqlite'), port: 0, token: KEY, pollMs: 0 });
    try {
      /* A CREATED RECORD FOR EVERY FIXTURE, NOT ONLY THE ONE THAT NEEDS IT. On a file nobody has created,
         `owner()` falls back to `p_self` and nobody can be unavailable, so an empty file would make the
         suspended case pass for the wrong reason or fail for one unrelated to the fixture. */
      const made = running.api.kernel.createRecord({
        id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
        slug: 'the-studio',
        name: 'The Studio',
        tz: 'UTC',
        locale: 'en',
        owner: { id: OWNER },
      });
      assert.ok(made.ok, `the record for ${where} was not created: ${JSON.stringify(made)}`);

      if (principal.kind === 'person' && principal.suspended)
        running.sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', '2026-09-05T12:00:00.000Z', OWNER);

      const bearer = principal.kind === 'bearer' ? 'a-credential-nobody-issued' : KEY;
      const port = (running.server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/${call.method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        body: JSON.stringify(call.args),
      });
      const body = (await res.json()) as Answer;

      assert.equal(body.ok, false, `${where}'s call was accepted`);
      assert.equal(body.refusals, undefined, `${where} was answered with a list of refusals`);
      const refusal = body.refusal;
      assert.ok(refusal !== undefined && !Array.isArray(refusal), `${where} was refused with no refusal object`);
      assert.equal(refusal.code, fixture.keys.get('code'));

      /* A 401 SAYS ONLY `unauthorized` (LCH-C08 job 2, P.154): the one body on both hosts, with no `at` and no
         sentence, whatever the fixture's header still says. Its reason is in the log. */
      if (refusal.code === 'UNAUTHORIZED') {
        assert.equal(res.status, 401, `${where} answered ${String(res.status)}`);
        assert.deepEqual(refusal, { code: 'UNAUTHORIZED', fix: 'unauthorized' }, `${where} said more than unauthorized`);
        return;
      }

      /* SILENCE IS A CLAIM, AND SO IS AN ADDRESS. `authorization` and `record` are the two words these
         refusals carry today, and a sentence reworded without its `at` is a regression a client that
         highlights the field it was told about would meet first. */
      assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

      assert.ok(refusal.fix.trim().length > 0, `${where} was refused with an empty fix`);
      assert.ok(/[.?!]$/.test(refusal.fix.trim()), `${where} was refused with "${refusal.fix}", which is not a sentence`);
    } finally {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
