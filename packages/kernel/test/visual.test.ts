/**
 * A visual's page and lines, the kernel's pure half (`src/visual.ts`): a whole document taken with its meta tags out,
 * refused in words only for what the frame would stop anyway, and a visual's standing read from its lines.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visualPage, visualSaid, visualStanding, visualState, type VisualLine } from '../src/visual.ts';

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

test('A DRAFT WAITS BESIDE THE KEPT VERSION and never moves where it stands; a keep moves it, a throw away clears it', () => {
  const body = (page: string, draft = false) => JSON.stringify({ title: 'T', page: page.repeat(64), bytes: 1, pictures: [], ...(draft ? { draft: true } : {}) });
  const line = (id: string, to: string, rowid: number): VisualLine => ({ rowid, id, ts: '', actor: 'p', target: 'entry:x', field: 'visual:v1', to_v: to, batch: null });
  const v1 = line('v1', body('a'), 1);
  const d2 = line('d2', body('b', true), 2);
  const drop = line('t', JSON.stringify({ drop: 'd2' }), 3);
  assert.deepEqual(visualState([v1, d2]), { standing: 'v1', draft: 'd2' });
  assert.equal(visualStanding([v1, d2]), 'v1', 'a draft never replaces the kept one');
  assert.deepEqual(visualState([v1, d2, line('k', JSON.stringify({ keep: 'd2' }), 3)]), { standing: 'd2', draft: null });
  assert.deepEqual(visualState([v1, d2, drop]), { standing: 'v1', draft: null });
  /* A KEEP OF A DRAFT NO LONGER WAITING MOVES NOTHING, and a kept version after a draft leaves none waiting. */
  assert.deepEqual(visualState([v1, d2, drop, line('k', JSON.stringify({ keep: 'd2' }), 4)]), { standing: 'v1', draft: null });
  assert.deepEqual(visualState([v1, d2, line('v3', body('c'), 3)]), { standing: 'v3', draft: null });
  /* A FIRST VERSION AS A DRAFT stands nowhere yet, and an undo's step back may put a draft back to wait. */
  assert.deepEqual(visualState([d2]), { standing: null, draft: 'd2' });
  assert.deepEqual(visualState([v1, d2, drop, line('u', JSON.stringify({ back: 'v1', draft: 'd2' }), 4)]), { standing: 'v1', draft: 'd2' });
  assert.deepEqual(visualSaid(body('a', true)), { title: 'T', page: 'a'.repeat(64), bytes: 1, pictures: [], draft: true });
});

test('A VISUAL WITH A SHADOW ROOT IN ITS MARKUP IS REFUSED, and the words alone are not', () => {
  assert.ok('fault' in visualPage('<div><template shadowrootmode="open"><p>x</p></template></div>', new Set()));
  assert.ok(!('fault' in visualPage('<div><p>a shadow root is a word here</p></div>', new Set())));
});

test('A SCRIPT LOADED FROM ELSEWHERE IS SAID AT LOG TIME, with the fix, instead of drawing blank', () => {
  const said = fault('<canvas id="c"></canvas><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script><script>new Chart(c, {})</script>');
  assert.match(said, /its script loads https:\/\/cdnjs\.cloudflare\.com/u);
  assert.match(said, /draw blank/u);
  assert.match(said, /braindog attach/u);
  assert.match(fault("<script src='//unpkg.com/d3'></script>"), /its script loads \/\/unpkg\.com\/d3/u);
  /* A SCRIPT WRITTEN INTO THE PAGE IS KEPT AS IT WAS. */
  const out = visualPage('<svg id="s"></svg><script type="module">document.getElementById("s").setAttribute("width", "10")</script>', new Set());
  assert.ok('page' in out, JSON.stringify(out));
});
