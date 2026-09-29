/**
 * The example records the home page's drawn app shows, held to the parser that draws them.
 *
 * EACH EXAMPLE PAGE IS DIALECT TEXT (`src/lib/examples/types.ts`), drawn by the same renderer a real
 * record's page is drawn by, so a typo in a fence is not a typo on the page: it is a degraded block,
 * the renderer's sentence saying what was wrong over the raw fence, on the first screen of the site. And
 * a page's `layout` and `links` name its segments by their index in `parse(src, { page: true })`, so a
 * fence added above them moves every one of those names onto the wrong segment without anything failing.
 *
 * IT READS THE PARSER BY RELATIVE PATH, the way `decide-copy.test.ts` reads `since`: the test holds the
 * examples to the parser itself, not to a copy of its rules.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../../../packages/render/src/parse.ts';
import { EXAMPLES } from '../src/lib/examples/index.ts';

/** Every page of every example, with the example it belongs to, as `personal/home`. */
const PAGES = EXAMPLES.flatMap((e) => e.pages.map((p) => ({ example: e, page: p, at: `${e.id}/${p.id}` })));

test('there is an example for every case, and every example has pages', () => {
  assert.deepEqual(
    EXAMPLES.map((e) => e.id).sort(),
    ['founder', 'personal', 'project', 'student', 'team'],
    'src/lib/examples/ no longer holds one example per case the drawn app offers',
  );
  for (const e of EXAMPLES) assert.ok(e.pages.length > 0, `the ${e.id} example has no pages to draw`);
});

/**
 * NO DEGRADED SEGMENT. A degraded fence is the renderer telling an author their fence is wrong, which is
 * right in a record and wrong on a page a stranger reads as the product working.
 */
test('every example page parses with no degraded segment', () => {
  const wrong: string[] = [];
  for (const { page, at } of PAGES) {
    for (const s of parse(page.src, { page: true })) {
      if (s.type === 'degraded') wrong.push(`${at}: ${s.code}, "${s.fix}" over ${s.raw.split('\n')[0] ?? ''}`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} fence(s) on the drawn app degrade:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * EVERY SPAN NAMES A REAL SEGMENT, and at most once. A span past the last segment places nothing, and a
 * segment it meant to place falls back to its kind's width while the page reads as laid out by hand.
 */
test('every span in a layout names a segment the page has, once', () => {
  const wrong: string[] = [];
  for (const { page, at } of PAGES) {
    const count = parse(page.src, { page: true }).length;
    const seen = new Set<number>();
    for (const span of page.layout ?? []) {
      if (!Number.isInteger(span.at) || span.at < 0 || span.at >= count) wrong.push(`${at}: a span at ${span.at}, and the page has ${count} segment(s)`);
      if (seen.has(span.at)) wrong.push(`${at}: two spans at ${span.at}`);
      seen.add(span.at);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} span(s) place nothing:\n  - ${wrong.join('\n  - ')}`);
});

/**
 * EVERY LINK OPENS A PAGE OF THE SAME EXAMPLE, from a block. A figure's link is answered as `#go:<page>`
 * and caught by the window, so a page id that does not exist is a tile that does nothing when pressed,
 * and a key on a prose segment is a link no figure draws.
 */
test('every in-window link sits on a block and opens a page of the same example', () => {
  const wrong: string[] = [];
  for (const { example, page, at } of PAGES) {
    const segments = parse(page.src, { page: true });
    const ids = new Set(example.pages.map((p) => p.id));
    for (const [key, targets] of Object.entries(page.links ?? {})) {
      const segment = segments[Number(key)];
      if (segment?.type !== 'block') wrong.push(`${at}: links on segment ${key}, which is ${segment ? segment.type : 'not there'}`);
      for (const to of targets) {
        if (to !== null && !ids.has(to)) wrong.push(`${at}: segment ${key} opens "${to}", and ${example.id} has no page by that id`);
      }
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} link(s) in the drawn app go nowhere:\n  - ${wrong.join('\n  - ')}`);
});

test('the page ids of each example are unique, and its first page is its Home', () => {
  for (const e of EXAMPLES) {
    const ids = e.pages.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `the ${e.id} example has two pages under one id: ${ids.join(', ')}`);
    assert.equal(ids[0], 'home', `the first page of the ${e.id} example is "${ids[0]}", and types.ts says the first page of every example is its Home`);
  }
});

/**
 * EVERY READING LINE NAMES A SEGMENT THE PAGE HAS, and a block rather than prose. The drawn app sets `reads[at]` under
 * the tile of segment `at` (in the design system, a chart's one written line), so a fence added above it would move the sentence
 * onto the wrong chart without anything else failing.
 */
test('every reading line sits under a block the page has', () => {
  const wrong: string[] = [];
  for (const { page, at } of PAGES) {
    const segments = parse(page.src, { page: true });
    for (const key of Object.keys(page.reads ?? {})) {
      const seg = segments[Number(key)];
      if (!seg || seg.type !== 'block') wrong.push(`${at}: a reading at ${key}, which is not a block of the page`);
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
});
