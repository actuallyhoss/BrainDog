/**
 * `heat`: what the plan decides over `days.ts`'s grid, what `toHTML` draws from it, and the Svelte drawer held to
 * the same tree.
 *
 * THE PARITY HALF HANDS BOTH SIDES ONE CLOCK, for the reason `roadmap-parity.test.ts` gives: the grid ends on the
 * week that holds today and outlines today, so two sides reading `Date.now()` apart would agree only by the luck of
 * the same millisecond.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { HEAT_NONE, HEAT_WEEKS, heatPlan } from './heat.ts';
import { KINDS } from './kinds.ts';
import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';

/* 22 September 2026 is a Tuesday, the day `days.test.ts` pins the grid to. */
const TODAY = '2026-09-22';
const NOW = Date.UTC(2026, 8, 22, 12);

/* ── the plan ─────────────────────────────────────────────────────────────── */

test('twelve weeks by weekday ending on this week, each counted day washed in one of four steps', () => {
  const p = heatPlan(
    [
      { day: '2026-09-14', value: '3' },
      { day: '2026-09-14', value: '1' },
      { day: '2026-09-16', value: '0' },
      { day: '2026-09-21', value: '' },
      { day: '2026-09-22', value: '2' },
    ],
    TODAY,
  );
  assert.equal(HEAT_WEEKS, 12);
  assert.equal(p.weeks, 12);
  assert.equal(p.cells.length, 84);
  assert.equal(p.cells[0]!.day, '2026-07-06');
  const at = (d: string) => p.cells.find((c) => c.day === d)!;
  assert.deepEqual([at('2026-09-14').wash, at('2026-09-14').count], [4, '4'], 'two rows on one day are added');
  assert.deepEqual([at('2026-09-16').wash, at('2026-09-16').count], [0, '0'], 'a day counted empty is a zero, not a gap');
  assert.deepEqual([at('2026-09-21').wash, at('2026-09-21').count], [1, '1'], 'a row with no value is one of something');
  assert.equal(at('2026-09-22').wash, 2);
  assert.equal(at('2026-09-22').today, true);
  assert.deepEqual([at('2026-09-15').wash, at('2026-09-15').count], [null, null], 'a day nobody wrote is a gap');
  assert.deepEqual([at('2026-09-23').future, at('2026-09-23').wash], [true, null]);
  assert.equal(p.empty, false);
  assert.equal(p.name, '12 weeks to 22 Sep 2026, 4 days counted, the busiest 14 Sep 2026 with 4.');
});

test('A ROW THAT DOES NOT READ IS NAMED BY INDEX, and one dated outside the weeks drawn is counted, never placed', () => {
  const p = heatPlan(
    [
      { day: '2026-09-14', value: '2' },
      { day: 'soon', value: '2' },
      { day: '2026-09-15', value: '-1' },
      { day: '2026-09-17', value: 'lots' },
      { day: '2026-02-30', value: '1' },
      { day: '2026-01-05', value: '9' },
      { day: '2026-09-24', value: '1' },
    ],
    TODAY,
  );
  assert.deepEqual(p.skipped, [1, 2, 3, 4]);
  assert.equal(p.outside, 2, 'a day before the twelve weeks, and a day after today');
  /* The day in January is not in view, so it does not set the scale: the one day that is draws in the top step. */
  assert.equal(p.cells.find((c) => c.day === '2026-09-14')!.wash, 4);
});

test('nothing in view is the sentence, and a clock that is not a day draws nothing rather than a guess', () => {
  const old = heatPlan([{ day: '2025-01-06', value: '3' }], TODAY);
  assert.deepEqual([old.empty, old.outside], [true, 1]);
  assert.equal(heatPlan([], TODAY).empty, true);
  assert.equal(heatPlan([{ day: TODAY, value: '1' }], '').empty, true);
  assert.equal(HEAT_NONE, 'Nothing here falls in the last twelve weeks.');
});

/* ── the fence ────────────────────────────────────────────────────────────── */

test('the fence is `day | value` on the grid, and toHTML draws the weeks, the washes, today and the numbers', () => {
  assert.equal(KINDS.heat.primitive, 'grid');
  assert.equal(KINDS.heat.cells, 2);
  const html = toHTML(parse('```heat | Done\n2026-09-14 | 3\n2026-09-22 | 1\nsoon | 1\n```'), { now: NOW });
  assert.match(html, /<figure class="block block-grid" data-kind="heat"/u);
  assert.match(html, /<div class="heat" style="--weeks:12">/u);
  assert.match(html, /<div class="heat-grid" role="img" aria-label="12 weeks to 22 Sep 2026, 2 days counted, the busiest 14 Sep 2026 with 3\.">/u);
  assert.equal(html.match(/<span class="heat-day"/gu)?.length, 84);
  assert.match(html, /<span class="heat-day" data-wash="4" title="14 Sep 2026: 3"><\/span>/u);
  assert.match(html, /<span class="heat-day" data-today="" data-wash="2" title="22 Sep 2026: 1"><\/span>/u);
  assert.match(html, /<span class="heat-day" data-future=""><\/span>/u);
  assert.match(html, /<span class="heat-day" title="15 Sep 2026"><\/span>/u, 'a gap still says its day on hover');
  assert.match(html, /<tr><th scope="row">14 Sep 2026<\/th><td class="num">3<\/td><\/tr>/u);
  assert.match(html, /<p class="heat-skipped">Not drawn, because the day or the value does not read: soon\.<\/p>/u);

  const none = toHTML(parse('```heat\n2025-01-06 | 3\n```'), { now: NOW });
  assert.match(none, /<p class="heat-empty">Nothing here falls in the last twelve weeks\.<\/p>/u);
  assert.match(none, /<p class="heat-outside">1 row falls outside the twelve weeks to today and is not drawn\.<\/p>/u);
  assert.doesNotMatch(none, /heat-grid/u);
});

/* ── the Svelte drawer, compared as a tree ────────────────────────────────── */

/* The same hooks `parity.test.ts` registers: each test file is its own process under `node --test`. */
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

const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts: { now: number } }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** `parity.test.ts`'s `tree`: no comments, no whitespace between tags, attributes in one order, entities read. */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)]
        .map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!))
        .sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const SHAPES: Record<string, string> = {
  'counted days, a zero, a day with no value, and today': '```heat | Done\n2026-09-14 | 3\n2026-09-14 | 1\n2026-09-16 | 0\n2026-09-21\n2026-09-22 | 2\n```',
  'a row that does not read and one before the weeks drawn': '```heat\n2026-08-03 | 5\nsoon | 1\n2025-01-06 | 3\n```',
  'nothing in view': '```heat | Done\n2025-01-06 | 3\n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one heat grid: ${name}`, () => {
    const [seg] = parse(src);
    assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
    const block = seg as BlockSegment;
    const svelte = tree(render(Block, { props: { block, opts: { now: NOW } } }).body);
    const html = tree(toHTML([block], { now: NOW }));
    assert.equal(svelte, html);
  });
}

test('and the comparison is not vacuous: the grid is on the Svelte side, and a different clock is told apart', () => {
  const [seg] = parse(SHAPES['counted days, a zero, a day with no value, and today']!);
  const block = seg as BlockSegment;
  const svelte = tree(render(Block, { props: { block, opts: { now: NOW } } }).body);
  assert.match(svelte, /<div [^>]*class="heat-grid"/u);
  /* `tree` writes an empty attribute as its bare name, as a browser serialises it. */
  assert.match(svelte, /<span class="heat-day" data-today data-wash="2"/u);
  const later = tree(render(Block, { props: { block, opts: { now: NOW + 7 * 86_400_000 } } }).body);
  assert.notEqual(later, svelte);
});
