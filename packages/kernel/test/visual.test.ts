/**
 * A visual's page and lines, the kernel's pure half (`src/visual.ts`): a whole document taken with its meta tags out,
 * refused in words only for what the frame would stop anyway, and a visual's standing read from its lines.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visualPage, visualSaid, visualStanding, type VisualLine } from '../src/visual.ts';

const fault = (html: string, names: string[] = []): string => {
  const out = visualPage(html, new Set(names));
  assert.ok('fault' in out, `kept: ${html}`);
  return out.fault;
};

test('A WHOLE DOCUMENT IS TAKEN, its title read and every meta taken out', () => {
  const out = visualPage('<!doctype html><html><head><meta http-equiv="refresh" content="0;url=x"><title> The  plan </title></head><body><p>Hi</p></body></html>', new Set());
  assert.ok(!('fault' in out));
  assert.equal(out.title, 'The plan');
  assert.ok(!out.page.includes('<meta'));
});

test('WHAT THE FRAME WOULD STOP IS REFUSED IN WORDS, and prose and its own pictures are not', () => {
  assert.match(fault('<img src="//cdn.test/a.png">'), /src names \/\/cdn\.test\/a\.png/u);
  assert.match(fault('<iframe src="#"></iframe>'), /frame, an object or a form/u);
  assert.match(fault('<style>@import "x.css";</style>'), /imports a stylesheet/u);
  assert.match(fault('<img srcset="a.png 1x, b.png 2x">', ['a.png']), /srcset/u);
  assert.match(fault('<button onclick="localStorage.x=1">x</button>'), /uses storage/u);
  assert.match(fault('<script>location.href = "/x"</script>'), /goes elsewhere/u);
  assert.match(fault('x'.repeat(512 * 1024 + 1)), /longer than 512 KB/u);
  const kept = visualPage(
    '<p>Import the rows from https://example.com.</p><img src="img/a.png" srcset="img/a.png 2x"><div style="background:url(img/a.png)"></div><a href="#b">b</a><script>var src = data.rows;</script>',
    new Set(['img/a.png']),
  );
  assert.ok(!('fault' in kept), JSON.stringify(kept));
});

test('A VISUAL STANDS AT ITS NEWEST VERSION, a step back names the version, and taken away stands nowhere', () => {
  const body = (page: string) => JSON.stringify({ title: 'T', page: page.repeat(64), bytes: 1, pictures: [] });
  const line = (id: string, to: string, rowid: number): VisualLine => ({ rowid, id, ts: '', actor: 'p', target: 'entry:x', field: 'visual:v1', to_v: to, batch: null });
  const v1 = line('v1', body('a'), 1);
  const v2 = line('v2', body('b'), 2);
  assert.equal(visualStanding([v1, v2]), 'v2');
  assert.equal(visualStanding([v1, v2, line('u', JSON.stringify({ back: 'v1' }), 3)]), 'v1');
  assert.equal(visualStanding([v1, line('g', JSON.stringify({ gone: true }), 3)]), null);
  assert.equal(visualStanding([]), null);
  assert.equal(visualSaid('--erased--'), null, 'an erased line says nothing a visual can be');
});
