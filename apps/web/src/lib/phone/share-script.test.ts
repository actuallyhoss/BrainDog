/**
 * A share is the one door on this origin a stranger's page can write through with no sign-in and no click past its own:
 * a form that POSTs to `/add`, which the service worker takes and whose photo it answers itself, under no host's headers.
 *
 * MEASURED IN CHROMIUM BEFORE THIS (sec-web, 5 Nov): a page on another site posted a file typed `image/svg+xml`, and
 * opening `~shared/0` ran the file's script as this origin, with no policy on the answer, and read `/api/boot` from inside it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SHARED_POLICY, photoAt, sharedPhoto, takeShare } from './share.ts';

const SCOPE = 'https://app.example.test/';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

/** The two calls the worker makes of `caches`, over a map. */
function caches() {
  const held = new Map<string, Response>();
  const box = {
    put: async (k: string, r: Response) => void held.set(k, r),
    match: async (k: string) => held.get(k)?.clone(),
  };
  return { held, store: { open: async () => box, delete: async () => (held.clear(), true) } as unknown as CacheStorage };
}

function share(files: File[]): Request {
  const form = new FormData();
  form.set('text', 'words');
  for (const f of files) form.append('photo', f);
  return new Request(new URL('add', SCOPE), { method: 'POST', body: form });
}

test('A PICTURE THAT IS A SCRIPT IS NOT KEPT, whatever way its type is spelt, and the words still open the palette', async () => {
  for (const type of ['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml; charset=utf-8', 'image/x-anything', 'image/']) {
    const { held, store } = caches();
    const res = await takeShare(share([new File([SVG], 'x.svg', { type })]), SCOPE, store);
    assert.equal(held.size, 0, `${type} was kept`);
    assert.equal(res.status, 303);
    assert.equal(new URL(res.headers.get('location') ?? '').searchParams.get('text'), 'words');
    assert.equal(new URL(res.headers.get('location') ?? '').searchParams.has('photos'), false);
  }
});

test('A PHOTO IS KEPT, and is answered under a policy that runs nothing, typed as a picture', async () => {
  const { held, store } = caches();
  await takeShare(share([new File(['bytes'], 'a.jpg', { type: 'image/jpeg' })]), SCOPE, store);
  assert.equal(held.size, 1);
  const res = await sharedPhoto(photoAt(SCOPE, 0), store);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('content-security-policy'), SHARED_POLICY);
  assert.match(SHARED_POLICY, /sandbox/u);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await res.text(), 'bytes');
});

test('A PHOTO KEPT BEFORE THE LIST IS ANSWERED AS BYTES AND NEVER AS A DOCUMENT', async () => {
  const { held, store } = caches();
  held.set(photoAt(SCOPE, 0), new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } }));
  const res = await sharedPhoto(photoAt(SCOPE, 0), store);
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.equal(res.headers.get('content-security-policy'), SHARED_POLICY);
});
