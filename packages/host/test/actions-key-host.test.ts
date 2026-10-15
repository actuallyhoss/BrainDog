/**
 * A key goes only to the host its vault entry opens (SHL-C05, job 1).
 *
 * TWO ORIGINS, BOTH DECLARED, so the origin check passes for each and the only thing that can refuse is the key's own
 * host. The refusal comes before the key is opened and before anything is fetched: `openKey` and `send` count their
 * calls, and both stay at zero. The key is a fake made here, and no assertion reads or prints it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendAction, type ActionAnswer, type ActionRequest, type OpenKey, type Send } from '../src/actions.ts';

const BAKE = 'https://bake.example';
const OTHER = 'https://collector.example';
const FAKE = `bd_fake_bake_value_${crypto.randomUUID()}`;

const request = (origin: string, opens: string | undefined): ActionRequest => ({
  job: 'o_1',
  channel: 'poll',
  ingest: 'orders',
  method: 'GET',
  url: `${origin}/v1/orders`,
  origin,
  headers: { accept: 'application/json' },
  grant: { id: 'g_1', label: 'Bake' },
  ...(opens === undefined ? {} : { opens }),
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
});

function counted() {
  const opened: string[] = [];
  const fetched: string[] = [];
  const openKey: OpenKey = async (grant) => {
    opened.push(grant.label);
    return FAKE;
  };
  const send: Send<undefined> = async (url) => {
    fetched.push(url.host);
    return new Response('[]');
  };
  return { opened, fetched, run: sendAction({ origins: () => [BAKE, OTHER], openKey, send }) };
}

const codeOf = (a: ActionAnswer): string | number => ('refused' in a ? a.refused.code : a.status);
const fixOf = (a: ActionAnswer): string => ('refused' in a ? a.refused.fix : '');

test('A KEY IS SENT TO THE HOST ITS ENTRY OPENS, however the entry spells it', async () => {
  for (const opens of ['bake.example', 'https://bake.example/v1', 'BAKE.example:443', 'bake.example.']) {
    const net = counted();
    const answer = await net.run(request(BAKE, opens));
    assert.equal(codeOf(answer), 200, `"${opens}" did not send to bake.example: ${fixOf(answer)}`);
    assert.deepEqual(net.fetched, ['bake.example']);
    assert.deepEqual(net.opened, ['Bake']);
  }
});

test('ANOTHER HOST IS REFUSED with the host the key opens, before the key is opened and with nothing fetched', async () => {
  const net = counted();
  const answer = await net.run(request(OTHER, 'bake.example'));
  assert.equal(codeOf(answer), 'WRONG_KEY');
  assert.equal(fixOf(answer), 'This key opens bake.example only.');
  assert.deepEqual(net.opened, [], 'the key was opened for a host it does not open');
  assert.deepEqual(net.fetched, [], 'something was fetched');
  assert.equal((answer as { requests: number }).requests, 0);
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(FAKE));

  /* AND THE ENTRY'S USER-INFO DOES NOT MOVE IT: the host is the one after the `@`, as the kernel reads it. */
  const tricked = counted();
  const trick = await tricked.run(request(BAKE, 'https://bake.example@collector.example'));
  assert.equal(fixOf(trick), 'This key opens collector.example only.');
  assert.deepEqual(tricked.fetched, []);
});

test('A KEY WITH NO HOST IS SENT, and once its approval pins the host it is held there', async () => {
  /* THE ENTRY NAMES NO HOST, so the host has nothing to hold it to and it goes, as every approved action did before. */
  const first = counted();
  assert.equal(codeOf(await first.run(request(BAKE, 'the Bake test account'))), 200);
  assert.deepEqual(first.fetched, ['bake.example']);
  /* ONE WORD IS A NAME, NOT A HOST: "Bake" parses as `bake`, which no action calls, so it holds the key to nothing. */
  const named = counted();
  assert.equal(codeOf(await named.run(request(BAKE, 'Bake'))), 200, 'a key whose entry says one word was refused everywhere');
  const unsaid = counted();
  assert.equal(codeOf(await unsaid.run(request(BAKE, undefined))), 200, 'a request built before `opens` was carried stopped sending');

  /* PINNED: `pinHost` writes the host on the entry (kernel `vault.ts`), and `keyNamed` carries it on the next request. */
  const pinned = 'bake.example';
  const again = counted();
  assert.equal(codeOf(await again.run(request(BAKE, pinned))), 200);
  const away = counted();
  const refused = await away.run(request(OTHER, pinned));
  assert.equal(fixOf(refused), 'This key opens bake.example only.');
  assert.deepEqual(away.opened, []);
  assert.deepEqual(away.fetched, []);
});

test('A REQUEST WITH NO KEY IS HELD TO NOTHING NEW', async () => {
  const net = counted();
  const answer = await net.run({ ...request(OTHER, undefined), grant: null });
  assert.equal(codeOf(answer), 200);
  assert.deepEqual(net.opened, []);
  assert.deepEqual(net.fetched, ['collector.example']);
});
