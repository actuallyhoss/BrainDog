/**
 * A visual drawn (`visual.ts`): its pictures swapped for inline data wherever the page names them, and the document
 * under the frame's own policy, at the phone's width.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAWN_POLICY } from './drawn.ts';
import { pictureData, swapPictures, visualDocument } from './visual.ts';

const DATA = 'data:image/png;base64,AAAA';

test('EVERY PLACE THE PAGE NAMES A PICTURE IT HOLDS IS INLINE DATA, and any other name is left as written', () => {
  const page = `<img src="img/a.png"><img src='img/a.png'><img src=img/a.png><img srcset="img/a.png 1x, img/b.png 2x"><div style="background:url('img/a.png')"></div><img src="img/b.png">`;
  const out = swapPictures(page, { 'img/a.png': DATA });
  assert.equal((out.match(/data:image\/png;base64,AAAA/gu) ?? []).length, 5, out);
  assert.ok(out.includes('img/b.png 2x') && out.includes('src="img/b.png"'), 'a picture it does not hold is left as written');
});

test('THE DOCUMENT CARRIES THE FRAME POLICY, THE PHONE WIDTH AND THE THEME, then the page', () => {
  const doc = visualDocument('<h1>Plan</h1><img src="p.png">', { 'p.png': DATA }, { mode: 'dark', tokens: { ink: '#eee' } });
  assert.ok(doc.includes(`content="${DRAWN_POLICY}"`));
  assert.ok(doc.includes('width=device-width'));
  assert.ok(doc.includes('"mode":"dark"'));
  assert.ok(doc.indexOf('<h1>Plan</h1>') > doc.indexOf('</head>'));
  assert.ok(doc.includes(`src="${DATA}"`));
  assert.ok(!/https?:\/\//u.test(doc.replace('http-equiv', '')), 'nothing in it names an address');
  assert.equal(pictureData(Uint8Array.of(1, 2, 3), 'image/png'), 'data:image/png;base64,AQID');
});
