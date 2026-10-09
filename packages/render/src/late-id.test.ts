/**
 * A late part's paint survives a pattern it cannot reach (audit 35, finding 9).
 *
 * `lateId` counts within one `toHTML` call, and the same input draws the same page, so two calls that draw the same
 * late chart hand out one id twice. `url(#id)` paints from the first element with that id in the document: where that
 * one sits in a closed fold, or is gone, a bare `url(#id)` paints nothing and the late part vanishes. The paint names
 * the late red after the pattern, so the part is still drawn, flat, in the late red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from './parse.ts';
import { toHTML } from './html.ts';

const SPLIT = '```split | Owed\nPaid | 600\nOverdue | 300 | 3 invoices | bad\n```';
const RING = '```ring | Week\nDeep work | 12\nInvoices | 6 | | bad\n```';
const PROGRESS = '```ring\nInvoice | 2 | 5 | bad\n```';

/** Every late paint in a page: the property, the pattern it names and what follows it. */
const paints = (html: string) => [...html.matchAll(/style="(fill|stroke):url\(#([^)]+)\)([^"]*)"/gu)].map((m) => ({ prop: m[1], id: m[2], rest: m[3] }));

test('TWO CALLS THAT DRAW THE SAME LATE CHART SHARE AN ID, which is why the paint cannot rest on it alone', () => {
  const [a] = paints(toHTML(parse(SPLIT)));
  const [b] = paints(toHTML(parse(SPLIT)));
  assert.ok(a && b);
  assert.equal(a.id, b.id, 'if this ever differs, the fallback is belt and braces and this test should say so');
});

test('EVERY LATE PART NAMES THE LATE RED AFTER ITS PATTERN: a split\'s part, a dial\'s arc and a progress ring', () => {
  for (const [src, prop] of [[SPLIT, 'fill'], [RING, 'stroke'], [PROGRESS, 'stroke']] as const) {
    const found = paints(toHTML(parse(src)));
    assert.equal(found.length, 1, src);
    assert.equal(found[0]!.prop, prop, src);
    assert.equal(found[0]!.rest, ' var(--chart-late, currentColor)', `${src}: a bare url(#id) paints nothing when its pattern is out of reach`);
  }
});

test('THE PATTERN IS STILL THERE AND STILL NAMED, so where it can be reached the part is striped as before', () => {
  for (const src of [SPLIT, RING, PROGRESS]) {
    const html = toHTML(parse(src));
    const [p] = paints(html);
    assert.match(html, new RegExp(`<pattern class="late-hatch" id="${p!.id}"`, 'u'), src);
  }
});

test('ON ONE PAGE THE IDS STAY ONE OF A KIND, and a chart with nothing late carries no paint at all', () => {
  const html = toHTML([...parse(SPLIT), ...parse(SPLIT), ...parse(RING), ...parse(RING)]);
  const ids = paints(html).map((p) => p.id);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, ids.join(', '));
  assert.doesNotMatch(toHTML(parse('```split\nPaid | 600\nDue | 300 | | warn\n```')), /url\(#/u);
});
