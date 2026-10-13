/**
 * Batch 60: a card's trend is a chart, and a chart is drawn only when it has three points and says something.
 *
 * `cardTrend` drew a line through two counts, which is a slope between two facts and nothing more. The floor is three
 * known points now, held in the one place both drawers ask (`cardTrend`), and a card with fewer keeps its figure alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';
import { cardTrend } from './cards.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

/** The markup with Svelte's hydration comments and the space between tags taken away, so one pattern reads both. */
const bare = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, '').replace(/>\s+</gu, '><');
const mirror = (src: string): string => bare(toHTML([page(src)]));
const drawer = (src: string): string => bare(render(Block, { props: { block: page(src) } }).body);
const trends = (html: string): number => html.match(/class="cards-trend"/gu)?.length ?? 0;

test('TWO POINTS ARE NOT A CHART: cardTrend draws nothing for them, however they are written', () => {
  for (const run of ['5 3', '1,,2', '[4,null,9]', '5 - 3', '5 3 x']) assert.equal(cardTrend(run, 'Done per week'), null, run);
});

test('THREE KNOWN POINTS ARE A CHART, with the newest value and the name beside the line', () => {
  const t = cardTrend('5 3 6', 'Done per week');
  assert.ok(t, 'three points draw');
  assert.equal(t.last, '6');
  assert.equal(t.label, 'Done per week');
  assert.ok(cardTrend('[3,null,5,4]', 'By week'), 'a gap is not a point, and three are left');
  assert.ok(cardTrend('0 5 3', 'By week'), 'a nought is a known point');
});

test('THREE POINTS THAT SAY ONE THING ARE STILL A FIGURE: one count among noughts is not drawn', () => {
  assert.equal(cardTrend('0 0 4', 'Done per week'), null);
  assert.equal(cardTrend('0 0 0', 'Done per week'), null);
  assert.equal(cardTrend('5 3 6', ' '), null, 'and a line with no name is never a chart');
});

test('A CARD WITH TWO POINTS SHOWS ITS FIGURE ALONE, and the card beside it with three draws the line, in both drawers', () => {
  const src = '```cards\ntitle | figure: Done | trend: By week\nNook |2 | 1 2\nBake | 12 | 3 5 4\n```';
  for (const [who, html] of [['the mirror', mirror(src)], ['the app', drawer(src)]] as const) {
    assert.equal(trends(html), 1, `${who} draws one line, for the card with three points`);
    assert.match(html, /aria-label="By week: 3, 5, 4"/u, who);
    assert.doesNotMatch(html, /aria-label="By week: 1, 2"/u, who);
    const roomy = html.slice(html.indexOf('Nook'), html.indexOf('Bake'));
    assert.match(roomy, /<span class="cards-value num">2<\/span><span class="cards-label">Done<\/span>/u, `${who} keeps the figure and its name`);
    assert.doesNotMatch(roomy, /<svg/u, `${who} draws nothing beside it`);
  }
});
