/**
 * SEC8 (security review of 30 Oct): OAUTH SIGN-IN COULD BE SHUT FOR EVERYBODY FROM ONE IPv6 /64. The only throttle was
 * ten per fifteen minutes per raw address, so a /64 was an endless supply of fresh counts, and one client plus authorize
 * calls from about a thousand addresses held all ten thousand waiting sign-ins. Now the door counts a /64 as one place
 * and a /48 as a wider one, and a registration's addresses are capped together.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OAuthAnswers, OAuthCall } from '@braindog/record/oauth';

import { serveOAuthDoor, type OAuthDeps, type OAuthStore } from '../src/oauth.ts';

const ISSUER = 'https://brain.example';

function door(address: string, counts: { key: string; most?: number }[], wait: (key: string) => number | null = () => null): OAuthDeps {
  const store = (async (call: OAuthCall): Promise<OAuthAnswers[OAuthCall['op']]> => {
    if (call.op === 'count') {
      counts.push({ key: call.key, ...(call.most === undefined ? {} : { most: call.most }) });
      return wait(call.key);
    }
    if (call.op === 'register') return 'ok';
    return null;
  }) as OAuthStore;
  return {
    issuer: ISSUER,
    store,
    now: () => Date.UTC(2026, 9, 30, 12),
    address,
    consent: (id) => `${ISSUER}/connect?request=${id}`,
    approver: async () => ({ ok: false, status: 403, say: 'no' }) as never,
    child: async () => null,
  };
}

const register = (body: unknown): Request =>
  new Request(`${ISSUER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('SEC8: EVERY ADDRESS IN ONE /64 IS COUNTED AS ONE PLACE, AND ITS /48 AS A WIDER ONE', async () => {
  const keys: string[] = [];
  for (const address of ['2001:db8:1:2::5', '2001:db8:1:2:ffff:ffff:ffff:1']) {
    const counts: { key: string; most?: number }[] = [];
    const res = await serveOAuthDoor(register({ redirect_uris: ['http://127.0.0.1:5555/callback'], client_name: 'An app' }), door(address, counts));
    assert.equal(res?.status, 201);
    keys.push(...counts.map((c) => c.key));
  }
  assert.deepEqual([...new Set(keys)].sort(), ['register48:2001:db8:1::/48', 'register:2001:db8:1:2::/64'].sort());
  /* AN IPv4 ADDRESS IS ITSELF, WITH NO WIDER COUNT. */
  const four: { key: string }[] = [];
  await serveOAuthDoor(register({ redirect_uris: ['http://127.0.0.1:5555/callback'] }), door('203.0.113.7', four));
  assert.deepEqual(four.map((c) => c.key), ['register:203.0.113.7']);
});

test('SEC8: A /48 THAT HAS SPENT ITS WIDER COUNT WAITS, whichever /64 inside it asks', async () => {
  const res = await serveOAuthDoor(
    register({ redirect_uris: ['http://127.0.0.1:5555/callback'] }),
    door('2001:db8:1:77::1', [], (key) => (key.startsWith('register48:') ? 60 : null)),
  );
  assert.equal(res?.status, 429);
});

test("SEC8: AN APP'S REDIRECT ADDRESSES ARE CAPPED TOGETHER, so one registration cannot make the store keep kilobytes", async () => {
  const long = (n: number) => `https://app.example/${'a'.repeat(900)}/${n}`;
  const res = await serveOAuthDoor(register({ redirect_uris: [long(1), long(2), long(3)] }), door('203.0.113.7', []));
  assert.equal(res?.status, 400);
  const fine = await serveOAuthDoor(register({ redirect_uris: [long(1), long(2)] }), door('203.0.113.8', []));
  assert.equal(fine?.status, 201);
});
