/**
 * A session cookie on a legacy host is nobody's. Cookies minted on `brain.dog` before the app moved kept opening records
 * there, on an origin the marketing site shares, and could not be signed out from the app. On a legacy host the cookie is
 * taken off the request before any door reads it, nothing below may set one, and the one sent is cleared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { legacyAnswer, legacyRequest } from '../src/route.ts';

const LEGACY = 'brain.dog, www.brain.dog';
const SID = 'S'.repeat(43);

test('ON A LEGACY HOST THE SESSION COOKIE IS TAKEN OFF, AND THE REST OF THE COOKIES STAY', () => {
  const asked = new Request('https://brain.dog/api/boot', { headers: { cookie: `bd_in=1; __Host-bd_s=${SID}; theme=dark`, authorization: 'Bearer rec_x.y' } });
  const out = legacyRequest(asked, LEGACY);
  assert.equal(out.legacy, true);
  assert.equal(out.carried, true);
  assert.equal(out.request.headers.get('cookie'), 'bd_in=1; theme=dark');
  /* A BEARER IS STILL TAKEN THERE, for an agent whose hosts file names the old address. */
  assert.equal(out.request.headers.get('authorization'), 'Bearer rec_x.y');

  const only = legacyRequest(new Request('https://www.brain.dog/account/me', { headers: { cookie: `__Host-bd_s=${SID}` } }), LEGACY);
  assert.equal(only.request.headers.get('cookie'), null);
});

test('ON THE APP’S OWN HOST NOTHING CHANGES', () => {
  const asked = new Request('https://app.brain.dog/api/boot', { headers: { cookie: `__Host-bd_s=${SID}` } });
  const out = legacyRequest(asked, LEGACY);
  assert.deepEqual([out.legacy, out.carried], [false, false]);
  assert.equal(out.request, asked);
});

test('THE ANSWER ON A LEGACY HOST SETS NO SESSION, AND CLEARS THE ONE SENT', () => {
  const answer = new Response('{}', { headers: [['set-cookie', `__Host-bd_s=${'R'.repeat(43)}; Path=/; HttpOnly; Secure; SameSite=Lax`], ['set-cookie', 'other=1; Path=/']] });
  const kept = legacyAnswer(answer, false).headers.getSetCookie();
  assert.deepEqual(kept, ['other=1; Path=/']);
  const cleared = legacyAnswer(new Response('{}'), true).headers.getSetCookie();
  assert.equal(cleared.length, 1);
  assert.match(cleared[0]!, /^__Host-bd_s=; Path=\/; Max-Age=0/u);
  /* And an answer with nothing to change is handed back as it is. */
  const plain = new Response('{}');
  assert.equal(legacyAnswer(plain, false), plain);
});
