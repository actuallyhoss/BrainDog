/**
 * A project's shape asked ahead (`shape-read.ts`): the page asks for it the moment its reads are back, the shape takes
 * that one read when it mounts, and a row that is not a project's is read for nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REGISTERS } from '../record/held.ts';
import { readShape, shapeAhead, takeShape } from './shape-read.ts';

const BASE = 'http://record.test/app';

/** Every fetch made while `run` runs, by path; each answers that there is no such method. */
async function fetched(run: () => Promise<void>): Promise<string[]> {
  const sent: string[] = [];
  const was = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    sent.push(new URL(String(url instanceof Request ? url.url : url)).pathname);
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = was;
  }
  return sent;
}

test('A ROW THAT IS NOT A PROJECT’S IS READ FOR NOTHING: no row, no history, no money', async () => {
  REGISTERS['shape-test-notes'] = { id: 'shape-test-notes', name: 'Notes', title: 'title', fields: [{ id: 'title', type: 'text' }] } as never;
  try {
    let out: unknown = 'unread';
    const sent = await fetched(async () => {
      out = await readShape(BASE, 'shape-test-notes', 1, 'A note');
    });
    assert.equal(out, null);
    assert.deepEqual(sent, []);
  } finally {
    delete REGISTERS['shape-test-notes'];
  }
});

test('A SHAPE ASKED AHEAD IS ASKED ONCE, and taken once by the shape that mounts for it', async () => {
  REGISTERS['shape-test-notes'] = { id: 'shape-test-notes', name: 'Notes', title: 'title', fields: [{ id: 'title', type: 'text' }] } as never;
  try {
    await fetched(async () => {
      const first = shapeAhead(BASE, 'shape-test-notes', 2);
      assert.equal(shapeAhead(BASE, 'shape-test-notes', 2), first, 'a second ask while the first is out is the first');
      assert.notEqual(shapeAhead(BASE, 'shape-test-notes', 3), first, 'another row is its own ask');
      assert.equal(takeShape(BASE, 'shape-test-notes', 2), first);
      assert.equal(takeShape(BASE, 'shape-test-notes', 2), null, 'what was taken is not taken again: a later read is the shape’s own');
      assert.equal(takeShape(BASE, 'shape-test-notes', 4), null, 'a row nobody asked ahead for is read by the shape');
      assert.equal(await first, null);
      void takeShape(BASE, 'shape-test-notes', 3);
    });
  } finally {
    delete REGISTERS['shape-test-notes'];
  }
});

test('THE PAGE ASKS AHEAD ONLY WHERE NOTHING OF IT IS DRAWN, and the shape takes that read before reading its own', () => {
  const route = readFileSync(new URL('../../routes/p/[slug]/+page.svelte', import.meta.url), 'utf8');
  assert.match(route, /if \(got === null && \(route\.params\.slug \?\? ''\) === asked\) void shapeAhead\(apiBase\(\), row\.register, row\.seq, row\.title\);/u);
  assert.match(route, /reader\.read\(asked, filtered, \{ about \}\)/u);
  const shape = readFileSync(new URL('./ProjectShape.svelte', import.meta.url), 'utf8');
  assert.match(shape, /await \(takeShape\(base, r, n\) \?\? readShape\(base, r, n\)\)/u);
});

test('WHAT FOLLOWS A PROJECT’S SHAPE WAITS FOR IT, and is drawn with it', () => {
  const view = readFileSync(new URL('./PageView.svelte', import.meta.url), 'utf8');
  assert.match(view, /const shapeWaits = \$derived\(projectPage && about !== null && !shapeKnown && !arranging && arrangement\.slots === null\);/u);
  assert.match(view, /blocks=\{shapeWaits \? \[\] : all\}/u);
});
