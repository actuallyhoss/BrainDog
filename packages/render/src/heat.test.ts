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

import { HEAT_NONE, HEAT_PEOPLE_MOST, HEAT_SHARE, HEAT_SHARE_HEAD, HEAT_SHARE_LINE, HEAT_WEEKS, heatPeoplePlan, heatPlan } from './heat.ts';
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
  assert.match(none, /<p class="heat-outside">1 day falls outside the twelve weeks to today and is not drawn\.<\/p>/u);
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
  /* A BLOCK WITH `of:`: each day against its own whole, one of them nought of it, and a bare count that has no whole. */
  'each day a share of its whole': '```heat | Done on the day\n2026-09-14 | 3 of 12\n2026-09-16 | 0 of 4\n2026-09-21 | 2 of 2\n2026-09-22 | 5\n```',
  /* PEOPLE'S "IN TOUCH": the page reader writes each day as `day()` does, and one column, so every row is one. */
  'days as the page reader writes them, one a person': '```heat | In touch, 12 weeks\n2 Sep 2026\n1 Sep 2026\n27 Jul 2026\n28 Aug 2026\n```',
  'the who form, a line a person': '```heat who | In touch, 12 weeks\n2 Sep 2026 | S. Marchetti\n1 Sep 2026 | J. Okonkwo\n12 Aug 2026 | S. Marchetti\n27 Jul 2026 | Ravensworth Ltd\nsoon | Pell & Vine\n2025-01-06 | Nordhaven\n```',
  'the who form with nobody in view': '```heat who\n2025-01-06 | Nordhaven\n```',
  'the who form with more than it draws': `\`\`\`heat who\n${Array.from({ length: 11 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')} | Person ${i + 1}`).join('\n')}\n\`\`\``,
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

test('A DAY IN EITHER SPELLING THIS PACKAGE WRITES IS READ: People\'s "In touch" drew no grid from `2 Sep 2026`', () => {
  /* The web's page reader projects every cell through `display()`, which writes a day with `day()`. Read only as
     `YYYY-MM-DD`, all four rows were named under an empty tile as days that do not read. */
  const p = heatPlan(['2 Sep 2026', '1 Sep 2026', '27 Jul 2026', '28 Aug 2026'].map((day) => ({ day, value: '' })), TODAY);
  assert.equal(p.empty, false);
  assert.deepEqual(p.skipped, []);
  assert.deepEqual(
    p.cells.filter((c) => c.count !== null).map((c) => c.day),
    ['2026-07-27', '2026-08-28', '2026-09-01', '2026-09-02'],
  );
  assert.equal(heatPlan([{ day: '2026-09-02T09:30:00Z', value: '2' }], TODAY).cells.find((c) => c.day === '2026-09-02')?.count, '2', 'an instant is its own day');
  assert.deepEqual(heatPlan([{ day: '30 Feb 2026', value: '1' }, { day: '2 Sept 2026', value: '1' }], TODAY).skipped, [0, 1], 'nothing is guessed');
  const html = toHTML(parse(SHAPES['days as the page reader writes them, one a person']!), { now: NOW });
  assert.match(html, /<div class="heat-grid" role="img"/u);
  assert.doesNotMatch(html, /heat-skipped/u);
});

test('THE PEOPLE FORM IS A LINE A PERSON ACROSS THE TWELVE WEEKS, a dot a week in touch, the latest first and each named', () => {
  const p = heatPeoplePlan(
    [
      { day: '2 Sep 2026', who: 'S. Marchetti' },
      { day: '2026-09-01', who: 'J. Okonkwo' },
      { day: '2026-08-12', who: 'S. Marchetti' },
      { day: '2026-08-13', who: 'S. Marchetti' },
      { day: '2026-07-27', who: 'Ravensworth Ltd' },
      { day: 'soon', who: 'Pell & Vine' },
      { day: '2026-09-01', who: '' },
      { day: '2025-01-06', who: 'Nordhaven' },
    ],
    TODAY,
  );
  assert.deepEqual(p.people.map((x) => x.who), ['S. Marchetti', 'J. Okonkwo', 'Ravensworth Ltd']);
  assert.equal(p.starts.length, 12);
  assert.equal(p.starts[0], '2026-07-06');
  const s = p.people[0]!;
  assert.equal(s.weeks.length, 12, 'all twelve weeks, on a phone too');
  assert.equal(s.count, 2, 'two days in one week are one dot');
  assert.deepEqual(s.weeks.flatMap((on, w) => (on ? [w] : [])), [5, 8]);
  assert.equal(s.last, '2026-09-02');
  assert.deepEqual(p.skipped, [5, 6], 'a day that does not read, and nobody named');
  assert.equal(p.outside, 1);
  assert.equal(p.name, '12 weeks to 22 Sep 2026, 3 people in touch.');
  assert.deepEqual(p.ticks, [{ week: 0, label: 'Jul' }, { week: 3, label: 'Aug' }, { week: 8, label: 'Sep' }]);
  const html = toHTML(parse(SHAPES['the who form, a line a person']!), { now: NOW });
  assert.match(html, /<li class="heat-person"><span class="heat-who">S\. Marchetti<\/span><span class="heat-weeks" role="img" aria-label="in touch 2 of 12 weeks, last on 2 Sep 2026">/u);
  assert.equal(html.match(/class="heat-week"/gu)?.length, 36);
  assert.match(html, /<span class="heat-week" data-on="" title="week of 31 Aug 2026"><\/span>/u);
  assert.doesNotMatch(html, /Points on this chart|heat-grid|<details/u, 'each line says itself, so there is no fold of numbers');
  assert.match(toHTML(parse(SHAPES['the who form with nobody in view']!), { now: NOW }), /heat-empty/u);
});

test('THE PEOPLE FORM DRAWS THE LATEST FEW AND COUNTS THE REST, and two month names never sit on neighbouring weeks', () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, who: `Person ${i + 1}` }));
  const p = heatPeoplePlan(rows, TODAY);
  assert.equal(p.people.length, HEAT_PEOPLE_MOST);
  assert.equal(p.people[0]!.who, 'Person 11', 'the latest in touch first');
  assert.equal(p.more, 11 - HEAT_PEOPLE_MOST);
  assert.match(p.name, /11 people in touch/u, 'the sentence counts everyone');
  const html = toHTML(parse(SHAPES['the who form with more than it draws']!), { now: NOW });
  assert.equal(html.match(/class="heat-person"/gu)?.length, HEAT_PEOPLE_MOST);
  assert.match(html, /<p class="heat-more">3 more people in touch<\/p>/u);
  assert.doesNotMatch(toHTML(parse(SHAPES['the who form, a line a person']!), { now: NOW }), /heat-outside/u, 'a time in touch long ago is counted, not said');
  /* 5 Oct 2026: the first week is 20 Jul to 26 Jul and the next holds 1 Aug, so July goes unnamed. */
  const ticks = heatPeoplePlan([{ day: '2026-10-05', who: 'Ann' }], '2026-10-05').ticks;
  assert.deepEqual(ticks.map((t) => t.week), [1, 6, 10]);
  assert.ok(ticks.every((t, i) => i === 0 || t.week - ticks[i - 1]!.week > 1));
});

/* ── a block with `of:`: each day against its own whole ──────────────────── */

test("WITH `of`, A DAY IS WASHED BY ITS SHARE OF THAT DAY'S WHOLE, and the grid says so in those words", () => {
  const p = heatPlan(
    [
      { day: '2026-09-14', value: '3 of 12' },
      { day: '2026-09-14', value: '3 of 12' },
      { day: '2026-09-15', value: '1 of 40' },
      { day: '2026-09-16', value: '0 of 4' },
      { day: '2026-09-21', value: '2 of 2' },
      { day: '2026-09-17', value: '0 of 0' },
      { day: '2026-09-22', value: '5' },
      { day: '2026-09-18', value: '9 of 3' },
    ],
    TODAY,
  );
  const at = (d: string) => p.cells.find((c) => c.day === d)!;
  assert.equal(p.share, true);
  assert.deepEqual([at('2026-09-14').wash, at('2026-09-14').count], [1, '6 of 24'], 'two rows on one day are added, part and whole');
  assert.deepEqual([at('2026-09-15').wash, at('2026-09-15').count], [1, '1 of 40'], 'one of forty is not washed as none');
  assert.deepEqual([at('2026-09-16').wash, at('2026-09-16').count], [0, '0 of 4'], 'none of a day that held four is a counted zero');
  assert.deepEqual([at('2026-09-21').wash, at('2026-09-21').count], [4, '2 of 2'], 'a day wholly of them is full, however small');
  assert.deepEqual([at('2026-09-17').wash, at('2026-09-17').count], [null, null], 'a day whose whole is nothing is a gap');
  assert.deepEqual(p.skipped, [6, 7], 'a count with no whole, and more than the whole, do not read on a share');
  assert.equal(HEAT_SHARE, "share of that day's whole");
  assert.equal(p.name, "12 weeks to 22 Sep 2026, 4 days counted, each by its share of that day's whole, the fullest 21 Sep 2026 with 2 of 2.");

  const html = toHTML(parse(SHAPES['each day a share of its whole']!), { now: NOW });
  assert.match(html, /<span class="heat-day" data-wash="1" title="14 Sep 2026: 3 of 12"><\/span>/u);
  assert.match(html, /<span class="heat-day" data-wash="4" title="21 Sep 2026: 2 of 2"><\/span>/u);
  assert.match(html, new RegExp(`<p class="heat-share">${HEAT_SHARE_LINE.replace("'", '&#39;').replace('.', '\\.')}</p>`, 'u'));
  assert.match(html, new RegExp(`<th scope="col">${HEAT_SHARE_HEAD.replace("'", '&#39;')}</th>`, 'u'));
  assert.match(html, /<td class="num">3 of 12<\/td>/u);
  assert.match(html, /heat-skipped/u);
});

test('AND WITHOUT `of` NOTHING SAYS SHARE: the wash is the busiest day\'s, as it was', () => {
  const p = heatPlan([{ day: '2026-09-14', value: '3' }, { day: '2026-09-21', value: '2' }], TODAY);
  assert.equal(p.share, undefined);
  assert.deepEqual(p.cells.filter((c) => c.count !== null).map((c) => [c.wash, c.count]), [[4, '3'], [3, '2']]);
  const html = toHTML(parse(SHAPES['counted days, a zero, a day with no value, and today']!), { now: NOW });
  assert.doesNotMatch(html, /heat-share|share of/u);
  assert.match(html, /<th scope="col">Value<\/th>/u);
});
