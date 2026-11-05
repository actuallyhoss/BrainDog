/**
 * The frame a drawn block is drawn in: sandboxed by its own header, with no network, framed only by BrainDog's own
 * pages, and writing only what its parent hands it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAWN_FRAME_HTML, DRAWN_FRAME_PATH, DRAWN_FRAME_POLICY, drawnFrame, isDrawnFrame } from '../src/drawn-frame.ts';

const directives = (policy: string): Map<string, string> =>
  new Map(policy.split(';').map((d) => d.trim().split(/\s+/u)).map(([name, ...rest]) => [name ?? '', rest.join(' ')]));

test('the policy sandboxes the document, runs only what is inline, and fetches, sends and frames nothing', () => {
  const d = directives(DRAWN_FRAME_POLICY);
  assert.equal(d.get('sandbox'), 'allow-scripts', 'the document is not sandboxed by its own header, or may reach its origin');
  assert.equal(d.get('default-src'), "'none'");
  assert.equal(d.get('connect-src'), "'none'");
  assert.equal(d.get('script-src'), "'unsafe-inline'");
  assert.equal(d.get('img-src'), 'data:');
  assert.equal(d.get('frame-ancestors'), "'self'");
  assert.doesNotMatch(DRAWN_FRAME_POLICY, /allow-same-origin|allow-top-navigation|allow-popups|allow-forms/u);
});

test('a GET answers the frame with its policy, a HEAD answers no body, and a POST is refused', async () => {
  const got = drawnFrame('GET');
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-security-policy'), DRAWN_FRAME_POLICY);
  assert.equal(got.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(await got.text(), DRAWN_FRAME_HTML);
  assert.equal(drawnFrame('HEAD').body, null);
  assert.equal(drawnFrame('POST').status, 405);
});

test('the document writes one draw from its parent and from no other window', () => {
  assert.match(DRAWN_FRAME_HTML, /if \(parent === window\) return;/u, 'opened on its own, it would wait for anybody');
  assert.match(DRAWN_FRAME_HTML, /e\.source !== parent/u);
  assert.match(DRAWN_FRAME_HTML, /removeEventListener\('message', first\)/u, 'it would write a second document');
});

test('only the one path is the frame', () => {
  assert.equal(isDrawnFrame(DRAWN_FRAME_PATH), true);
  for (const path of ['/drawn-frame/', '/acme/drawn-frame', '/app/drawn-frame', '/drawn-frame.html']) assert.equal(isDrawnFrame(path), false, path);
});

test('THE FRAME ITSELF TAKES THE PEER CONNECTION AWAY BEFORE IT WRITES ANYTHING, for an attached page that carries no guard of ours (sec-web, 5 Nov)', () => {
  const guard = DRAWN_FRAME_HTML.indexOf('RTCPeerConnection');
  const write = DRAWN_FRAME_HTML.indexOf('document.write');
  assert.ok(guard > 0 && guard < write, 'the frame writes a document before it takes away what its policy cannot hold');
  assert.match(DRAWN_FRAME_HTML, /configurable: false/u);
  assert.ok(DRAWN_FRAME_HTML.indexOf('MutationObserver') < write, 'a frame an attached page makes has constructors of its own');
});
