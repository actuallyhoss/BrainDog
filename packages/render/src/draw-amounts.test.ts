/**
 * Batch 58, what the owner's real screens showed (faults C, I and J of the look) and one way to write an amount
 * in the two drawers (jobs 3 and 4).
 *
 * THE AMOUNTS: told the record's home currency, a stat, a bar, a legend, a card's figure, a gauge and a ring say an
 * amount exactly as `writeAmount` does, in the mirror and in the Svelte drawers alike, and a host that does not say
 * draws what it drew before. THE LOOK: a legend leaves out a part at nought, a bar's row is one book and its figure,
 * and a card's trend is drawn only when it has a name and more than one point to say.
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
import { toHTML, type RenderOptions } from './html.ts';
import { totalSaid, wholeFigure } from './format.ts';
import { readAmount, writeAmount } from './money.ts';

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
  default: Component<{ block: BlockSegment; opts?: RenderOptions }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
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

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const mirror = (src: string, opts: RenderOptions = {}): string => tree(toHTML([page(src)], opts));
const drawer = (src: string, opts: RenderOptions = {}): string => tree(render(Block, { props: { block: page(src), opts } }).body);

/** What a person reads inside the first element of a class: its text, tags taken away. */
const said = (html: string, cls: string): string[] =>
  [...html.matchAll(new RegExp(`<[a-z]+ [^>]*class="${cls}[" ][^>]*>(.*?)</(?:span|li|div|p)>(?=<|$)`, 'gu'))].map((m) => m[1]!.replace(/<[^>]+>/gu, ''));

/**
 * The writer's own text for a stored cell, the thing every drawer is held to. `tree` reads every run of space as one
 * space, the space that does not break among them, so the writer's is read the same way here.
 */
const writer = (stored: string, home: string | null): string => writeAmount(readAmount(stored)!, home, 'read')!.text.replace(/\s+/gu, ' ');

const EGP = 'EGP 702,318.00';
const USD = 'USD 2,947.95';
const HOME = { home: 'EGP' } as const;

/* ---- One way to write an amount (jobs 3 and 4) --------------------------------------------------- */

/* A BAR ROW AND A LEGEND ARE A SET OF TOTALS, every figure said whole (aa560291b, polish5); a stat and a card's figure are one amount each. */
const AMOUNTS: Record<string, { src: string; cls: string; at: number[]; totals?: true }> = {
  'a stat': { src: `\`\`\`stat\nIn Cairo | ${EGP} | \nHarbour | ${USD} | \n\`\`\``, cls: 'cell-figure num', at: [0, 1] },
  'a bar row': { src: `\`\`\`bar\nCairo | ${EGP}\nHarbour | ${USD}\n\`\`\``, cls: 'prop-value num', at: [0, 1], totals: true },
  'a legend': { src: `\`\`\`split\nCairo | ${EGP}\nHarbour | ${USD}\n\`\`\``, cls: 'split-value num', at: [0, 1], totals: true },
  'a cards figure': { src: `\`\`\`cards\ntitle | figure: Owed\nCairo | ${EGP}\nHarbour | ${USD}\n\`\`\``, cls: 'cards-value num', at: [0, 1] },
};

for (const [name, shape] of Object.entries(AMOUNTS)) {
  test(`TOLD THE HOME, ${name} says an amount as the one writer does, in both drawers`, () => {
    const html = mirror(shape.src, HOME);
    const texts = said(html, shape.cls);
    assert.equal(texts[shape.at[0]!], writer(EGP, 'EGP'), 'the home currency');
    assert.equal(texts[shape.at[1]!], shape.totals ? wholeFigure(writer(USD, 'EGP')) : writer(USD, 'EGP'), 'another currency, by its own sign');
    assert.doesNotMatch(html, /E£/u, 'the Egyptian pound is written by its code');
    assert.doesNotMatch(html, /US\$/u, 'a dollar is said once, by the writer');
    assert.equal(drawer(shape.src, HOME), html, 'the Svelte drawer draws the same tree');
  });

  test(`NOT TOLD THE HOME, ${name} draws what it drew before, the same in both drawers`, () => {
    assert.equal(drawer(shape.src), mirror(shape.src));
    /* A DOLLAR IS `$` TOLD OR NOT SINCE AM15, so what tells the two paths apart is a home where `$` is the home's own sign. */
    assert.notEqual(mirror(shape.src), mirror(shape.src, { home: 'CAD' }), 'the home changes what is written');
  });
}

test('A RING SAYS ITS VALUE AND ITS TARGET AS THE WRITER DOES, in both drawers', () => {
  const src = `\`\`\`ring\nSaved | ${USD} | ${EGP}\n\`\`\``;
  const html = mirror(src, HOME);
  assert.deepEqual(said(html, 'ring-target'), [writer(EGP, 'EGP')]);
  /* A RING'S VALUE IS A HEADLINE, the writer's and then said as a total (d9bab2403). */
  assert.deepEqual(said(html, 'ring-value'), [totalSaid(writer(USD, 'EGP'))]);
  assert.equal(drawer(src, HOME), html);
});

test('A GAUGE SAYS ITS VALUE AND ITS TARGET AS THE WRITER DOES, and a bare number stays as written', () => {
  const src = `\`\`\`gauge\nSaved | ${USD} | ${EGP}\n\`\`\``;
  const html = mirror(src, HOME);
  assert.deepEqual(said(html, 'prop-value num'), [writer(USD, 'EGP')]);
  assert.deepEqual(said(html, 'prop-note num'), [`of ${writer(EGP, 'EGP')}`]);
  assert.equal(drawer(src, HOME), html);
  const bare = '```gauge\nDone | 11200 | 20000\n```';
  assert.equal(mirror(bare, HOME), mirror(bare), 'a number that is not money is not rewritten');
});

test('A RECORD WITH NO HOME CURRENCY writes every currency by its own sign, and never two marks of one currency', () => {
  const src = `\`\`\`stat\nHarbour | ${USD} | \nRent | GBP 1,200.00 | paid GBP 300.00 so far\n\`\`\``;
  const html = mirror(src, { home: null });
  assert.deepEqual(said(html, 'cell-figure num'), [writer(USD, null), writer('GBP 1,200.00', null)]);
  assert.match(html, /paid £300 so far/u, 'a note says its amount the same way');
  assert.equal(drawer(src, { home: null }), html);
});

test('THE CODE IN FRONT IS QUIET, as it was, and joined to its figure by the space that does not break', () => {
  const html = toHTML([page('```stat\nIn Cairo | EGP −702,318.50 | \n```')], HOME);
  assert.match(html, /<span class="amount">−<span class="amount-code">EGP<\/span>\u00a0702,318\.50<\/span>/u);
});

/* ---- The look: faults C, I and J on a real record ----------------------------------------------------------- */

const css = (path: string): string => readFileSync(new URL(`../../skin/${path}`, import.meta.url), 'utf8');
/** The rules a sheet keeps for a phone: the body of its `@media (width < 640px)` block that holds `needle`. */
const phone = (sheet: string, needle: string): string => {
  const blocks = sheet.split('@media (width < 640px)').slice(1);
  const found = blocks.find((b) => b.includes(needle));
  assert.ok(found, `no phone rule holds ${needle}`);
  return found!;
};

test('I. A LEGEND LEAVES OUT A PART AT NOUGHT: the sixth account at 0 is not drawn, and the fold still says it', () => {
  const src =
    '```split | Accounts\nCIB | EGP 500,000.00\nHSBC | EGP 145,844.47\nCash | EGP 30,000.00\nWise | EGP 9,000.00\nPayoneer | EGP 4,011.53\nWallet | EGP 0.00\n```';
  for (const opts of [{}, HOME]) {
    const html = mirror(src, opts);
    const legend = html.slice(html.indexOf('<ul class="split-legend">'), html.indexOf('</ul>'));
    assert.equal(legend.match(/class="split-item"/gu)?.length, 5, 'five parts with a length, five lines');
    assert.doesNotMatch(legend, /Wallet/u);
    assert.match(html.slice(html.indexOf('split-numbers')), /<th scope="row">Wallet<\/th>/u, 'the numbers under it keep every row');
    assert.equal(drawer(src, opts), html, 'the Svelte drawer leaves it out too');
  }
});

test('I. A ROW WITH NO NUMBER YET AND A CREDIT STAY IN THE LEGEND, and so does every part when all are nought', () => {
  const some = '```split\nRent | 300\nTools | pending\nRefunds | −£40.00\nSpare | 0\n```';
  const html = mirror(some);
  const legend = html.slice(html.indexOf('<ul class="split-legend">'), html.indexOf('</ul>'));
  assert.deepEqual(said(legend, 'split-label'), ['Rent', 'Tools', 'Refunds']);
  assert.equal(drawer(some), html);
  const none = '```split\nA | 0\nB | 0 | none yet\n```';
  assert.deepEqual(said(mirror(none), 'split-label'), ['A', 'B'], 'all nought: the legend is all there is');
  assert.equal(drawer(none), mirror(none));
});

test('I. ON A PHONE EVERY PART OF A LEGEND HAS ITS OWN LINE', () => {
  const rules = phone(css('blocks-charts.css'), '.split-item');
  assert.match(rules, /\.split-legend \{[^}]*flex-direction: column/u);
  assert.match(rules, /\.split-item \{[^}]*inline-size: 100%/u);
});

test('C. A BAR ROW IS ONE NAME, ITS BAR AND ONE FIGURE, in that order in both drawers', () => {
  const src = `\`\`\`bar | What you have, by book\nPersonal | ${EGP}\nHarbour | ${USD}\n\`\`\``;
  for (const opts of [{}, HOME]) {
    const html = mirror(src, opts);
    const rows = [...html.matchAll(/<div class="prop-row">(.*?)<\/div>/gu)].map((m) => m[1]!);
    assert.equal(rows.length, 2, 'each book is a row of its own');
    for (const row of rows) {
      assert.deepEqual(
        [...row.matchAll(/<span class="([^"]+)"/gu)].map((m) => m[1]),
        ['prop-label', 'prop-track', 'prop-value num', 'prop-note'],
        'a row holds one name and one figure, never the next row\'s',
      );
    }
    assert.equal(drawer(src, opts), html);
  }
});

test('C. ON A PHONE THE FIGURE ENDS THE LINE ITS NAME IS ON, with a gap, and the bar is the line under', () => {
  const rules = phone(css('kinds/proportional.css'), '.prop-row');
  assert.match(rules, /\.prop-label \{[^}]*grid-area: 1 \/ 1;/u);
  assert.match(rules, /\.prop-value \{[^}]*grid-area: 1 \/ 2;[^}]*justify-self: end/u);
  assert.match(rules, /\.prop-track \{[^}]*grid-area: 2 \/ 1 \/ auto \/ -1/u);
  const gap = /\.prop-row \{[^}]*gap: var\(--sp-\d\) var\(--sp-(\d)\)/u.exec(rules);
  assert.ok(gap && Number(gap[1]) >= 3, 'the name and the figure are a real gap apart');
});

const trends = (html: string): number => html.match(/class="cards-trend"/gu)?.length ?? 0;

test('J. A CARDS TREND WITH NO NAME IS NOT DRAWN, in either drawer', () => {
  const src = '```cards\ntitle | trend\nLanternfish | 5 3 4 6\nCopperleaf | 1 2 3\n```';
  const html = mirror(src);
  assert.equal(trends(html), 0, 'a bare line says nothing');
  assert.doesNotMatch(html, /cards-body/u, 'and a card left with only its name has no empty body');
  assert.equal(drawer(src), html);
});

test('J. A NAMED TREND IS DRAWN WITH ITS NEWEST VALUE AND ITS NAME beside the line', () => {
  const src = '```cards\ntitle | trend: Done per week\nLanternfish | 5 3 - 6\n```';
  const html = mirror(src);
  assert.equal(trends(html), 1);
  assert.match(html, /<\/svg><span class="cards-value num">6<\/span><span class="cards-label">Done per week<\/span><\/span>/u);
  assert.match(html, /aria-label="Done per week: 5, 3, no value, 6"/u);
  assert.equal(drawer(src), html);
});

test('J. ONE COUNT AMONG NOUGHTS IS NOT A TREND, and neither is a run of noughts or one point: nothing is drawn', () => {
  const src = '```cards\ntitle | trend: Done per week\nLanternfish | 0 0 0 4\nCopperleaf | 5 0\nQuietcart | 0 0 0\nOxbow | 7\nBrightwell | 1 2 3\n```';
  const html = mirror(src);
  assert.equal(trends(html), 1, 'only the run with more than one real count');
  assert.match(html, /<h3 class="cards-title">Brightwell<\/h3><\/div><div class="cards-body">/u);
  assert.equal(drawer(src), html);
});

test('J. A GRID OF CARDS THAT ARE ONLY NAMES IS SET CLOSE, the whole grid and never one card of it', () => {
  const sheet = css('kinds/cards.css');
  assert.match(sheet, /\.cards-grid:not\(:has\(> \.cards-item > :not\(\.cards-head\)\)\) > \.cards-item \{\s*padding-block: var\(--sp-2\);/u);
  const html = mirror('```cards\nmark | title\nB | Brightwell site\nB | BrainDog\n```');
  assert.doesNotMatch(html.replace(/<div class="cards-head">.*?<\/div>/gu, ''), /<(div|p|dl|span|img)/u, 'a card of a name holds its head and nothing else');
});
