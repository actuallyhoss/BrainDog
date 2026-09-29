/**
 * The `via: pull` runner, send-loop half: the two pull fixtures whose `raises:` is
 * `packages/host/src/actions.ts`, driven through `sendAction`, the executor both hosts wrap for a
 * scheduled action that does not page.
 *
 * `40 §6` gives the whole family to `connect/test`, and that would have called these two wrong.
 * `runPull` raises `PULL_ORIGIN_REFUSED` and `PULL_REQUEST_REFUSED` with an address; this loop
 * answers `{ code, fix }` and nothing else, because an action's outcome is written on a run and not
 * handed back to a caller with a path into their input. Measured:
 * `pull-origin-refused.yaml`, shaped as a connector and driven through `runPull` by
 * `packages/connect/test/refusals-pull.test.ts`, answered `at: fetch.page[1]` where the fixture
 * claims none. The fixture was right about the site it names, so it was reshaped to reach that site
 * rather than given the other site's address. The connector half's header has the count.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   declare:  one action declaration, `ActionDecl`'s keys: `ingest`, `channel`, `url`, `every`. It
 *             declares no `fetch.page` and no `fetch.read`, which is what sends it to this loop and
 *             not to the connector: `pages()` in `packages/kernel/src/actions.ts` is that fork.
 *   grant:    absent from both. A key opened for a request that is refused before or after it
 *             leaves changes nothing either fixture claims, so neither carries one.
 *   answers:  what `send` returns, one per request: `status`, `headers`, `body`.
 *
 * THE REQUEST IS BUILT HERE AND NOT BY `prepareAction`, which needs a record with the declaration
 * installed, a schedule row and a lease. What it takes off the declaration for a non-paging `poll`
 * is the address, the origin of that address, `GET`, and the kernel's two ceilings, and those are
 * read from the kernel's own exports below so that a changed ceiling changes this runner too. The
 * origins list is `originsOf`, the function the Worker's executor is handed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACTION_MAX_BYTES, ACTION_TIMEOUT_MS, originsOf, type ActionDecl } from '@braindog/kernel';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import { sendAction, type ActionRequest, type Send } from '../src/actions.ts';

const json = <T>(keys: Keys, key: string, where: string): T | undefined => {
  const raw = keys.get(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${where}'s \`${key}:\` is not a flow collection this reader can hand to JSON.parse: ${String(e)}`);
  }
};

const mine: Fixture[] = familyOf('pull').filter((f) => f.keys.get('raises') === 'packages/host/src/actions.ts');

/* TWO, AND THE CONNECTOR HALF COUNTS THE FAMILY. What this asserts is that the two it takes both
   have a body; the seven, and that no fixture falls between the runners, are asserted there. */
test('both send-loop pull fixtures are driven here', () => {
  assert.equal(mine.length, 2);
  for (const f of mine) assert.ok(f.keys.has('declare'), `${f.name} carries no \`declare:\`, so nothing drives it`);
});

type Answer = { status?: number; headers?: Record<string, string>; body?: string };

for (const fixture of mine) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the send loop`, async () => {
    const decl = json<ActionDecl>(fixture.keys, 'declare', where)!;
    const answers = json<Answer[]>(fixture.keys, 'answers', where) ?? [];
    assert.equal(fixture.keys.has('grant'), false, `${where} carries a \`grant:\`, which this runner does not open`);
    assert.ok(typeof decl.url === 'string', `${where}'s \`declare:\` names no url`);

    let asked = 0;
    const send: Send<undefined> = (url) => {
      const answer = answers[asked];
      asked += 1;
      if (answer === undefined)
        throw new assert.AssertionError({ message: `${where} carries ${answers.length} answers and the loop made request ${asked}, to ${url.href}` });
      return Promise.resolve(new Response(answer.body ?? '', { status: answer.status ?? 200, headers: answer.headers ?? {} }));
    };

    const request: ActionRequest = {
      job: 'ob_1',
      channel: decl.channel as ActionRequest['channel'],
      ingest: decl.ingest,
      method: decl.channel === 'call' ? 'POST' : 'GET',
      url: decl.url,
      origin: new URL(decl.url).origin,
      headers: { accept: 'application/json' },
      grant: null,
      timeoutMs: ACTION_TIMEOUT_MS,
      maxBytes: ACTION_MAX_BYTES,
    };

    const answer = await sendAction({ origins: () => originsOf([decl]), openKey: null, send })(request);

    assert.ok('refused' in answer, `${where}'s request was answered ${JSON.stringify(answer)}`);
    assert.equal(answer.refused.code, fixture.keys.get('code'));

    /* THE ABSENCE IS THE CLAIM. Both fixtures say in their comments that this envelope has no room
       for an address, and an `at` appearing on it is `ActionAnswer` changing shape under them. */
    assert.equal(fixture.keys.has('at'), false, `${where} claims an address, and this envelope has no slot for one`);
    assert.equal(Object.hasOwn(answer.refused, 'at'), false, `${where} was refused with an address: ${JSON.stringify(answer.refused)}`);

    /* A SENTENCE, NOT THE FIXTURE'S SENTENCE. The loop names the host it was talking to, so its
       sentence exists only at runtime; `30 §6` asks that it be one. */
    assert.ok(/[.?!]$/.test(answer.refused.fix.trim()), `${where} was refused with "${answer.refused.fix}", which is not a sentence`);
    assert.equal(asked, answers.length, `${where} carries ${answers.length} answers and the loop made ${asked} requests`);
  });
}
