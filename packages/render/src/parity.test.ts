/**
 * The two renderers, compared as trees: the Svelte drawers compiled and rendered on the server,
 * against `toHTML`, for every shape a `cards`, `section`, `feed` and `diff` block can take,
 * and the figures that keep their numbers in a fold.
 *
 * "EQUAL BY CONSTRUCTION" WAS A PROMISE AND NOTHING KEPT IT. The rest of this package asserts the
 * Svelte side by reading its source as text, because a `.svelte` file cannot be mounted under
 * `node --test`. It can be compiled, though: Node's module hooks hand each `.svelte` file to the
 * compiler on the way in, and `svelte/server` renders the result to a string. The hydration markers
 * and the whitespace between tags are the only differences a browser does not also see, so those
 * are what `tree` takes away before the two are held equal.
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

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    /* A runes module (`cards.svelte.ts`, which `Table` reads) is TypeScript the compiler does not
       strip, so the types come off first. */
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

const SHAPES: Record<string, string> = {
  'agents working now':
    '```cards\nmark: Project | title: Doing | who: Agent | fact: Next | when: Seen\nKiln | Fix the invoice export | Claude | Ship the fix | 3m ago | warn\nSite | Rewrite pricing | Codex |  | 2h ago\n```',
  'a run gone quiet, dimmed and still saying everything':
    '```cards\ntitle: Doing | who: Agent | fact: Project | when: Seen | quiet\nAxis QA | Claude | Kiln | 3m ago | \nReconcile | Claude | Portage | 2h ago | quiet | warn\n```',
  'people, named by their faces': '```cards\nwho: Name | fact: Role | fact: Met at | when: Seen\nAmara Lee | Designer | Kiln kickoff | 2d ago\nthe assistant | Agent |  | \n```',
  'figures, trends, rings and a link':
    '```cards\ntitle | figure: Owed to you | trend: Weekly | ring: Done\n[Kiln](/r/things/1) | GBP 4,800.00 | 18 20 - 24 | 3/5\nSite |  | 7 | 60%\nMarsh | USD 12.00 | 1 2 3 | nearly\n```',
  'no cards at all': '```cards\ntitle | fact: Role\n```',
  'a section with a count': '```section | Working now\n | 3 | \n```',
  'a section that counts nothing': '```section | Working now\n | 0 | \n```',
  'a folded section with a glyph': '```section | Parked and retired\nthing | 4 | fold\n```',
  'a section that is only a heading': '```section | From everywhere\n```',
  'a feed with bursts, a mark and a tone':
    '```feed\nagent | Claude | 14 | saves on [Variable axis QA](/r/things/4) | 3h ago\nrule | Late fees | 2 | reminders sent | 5h ago\n' +
    'seen | 2d ago\nagent | Codex |  | opened Kiln | 3d ago | bad\nyou | You | 1 | decision on Pricing | 4d ago\n```',
  'a feed row with nobody named': '```feed\nagent |  | 2 | saves | now\n```',
  'a feed with nothing new': '```feed\nseen | 2d ago\n```',
  'a feed with no mark yet': '```feed\nseen | \n```',
  'a diff with a change in the middle':
    '```diff | Deploy, v3 to v4\n  When a deploy fails,\n- retry once.\n+ retry twice,\n+ then page the owner.\n  Log the run.\n```',
  'a diff that folds its long runs':
    '```diff\n' +
    [...Array.from({ length: 9 }, (_, i) => `  line ${i + 1}`), '- line 10', '+ line ten', ...Array.from({ length: 10 }, (_, i) => `  line ${i + 11}`)].join('\n') +
    '\n```',
  'a diff with no change': '```diff\n  same\n  again\n```',
  'a lead stat with trends and a tone':
    '```stat lead | Money\nCash now | GBP 12,400.00 | in 2 accounts · as of 2 Sep | 18 20 - 24 | good\nComing in | GBP 4,800.00 | 5 invoices, 2 late\nGoing out | GBP 1,300.00 | 7 bills | 3 | warn\nEvery month | EGP 900.00 |  | 1 2 3 4\n```',
  'a split with a tone, a part with no number and a hole':
    '```split | Where it goes\nPayroll | GBP 6,000.00 | 4 people\nRent | GBP 3,000.00 |  | warn\nRefunds | −£40.00\nTools | pending\nUncategorised | GBP 900.00 | 12 rows | hole\n```',
  'a split that is all zero': '```split\nA | 0\nB | 0 | none yet\n```',
  'a bridge that does not add up': '```bridge | This month\nStart | £9,000\nComing in | +£2,000 | 5 invoices\nGoing out | −£1,600\nEnd of month | £9,000\n```',
  'a bridge that goes under zero': '```bridge\nStart | 100\nTax | -300 | due 5 Nov\nEnd | -200\n```',
  'a bridge with a row that has no number': '```bridge\nStart | 100\nSomething | soon\nEnd | 100\n```',
  'a bridge of one row': '```bridge\nStart | 100\n```',
  'a series with net, a gap, a partial and an ahead bucket':
    '```series net\nMonth | in: Money in | out: Money out | state\nApr 2026 | £4,800.00 | £2,300.00 | \nMay 2026 |  |  | \nSep 2026 | £1,000.00 | £900.00 | partial\nOct 2026 | £2,000.00 |  | ahead\n```',
  'a series with no numbers at all': '```series | In and out\nMonth | Sales\nApr | \n```',
  'a series of two plain columns': '```series\nQuarter | Sales | out: Costs\nQ1 | 10 | 4\nQ2 | 12 | 5\n```',
  'a forecast with a past, stems, knobs and a crossing':
    '```forecast\nopening | 2026-09-17 | Cash now | £34,850.00\npast | 2026-09-14 |  | £30,120.00\npast | 2026-09-15 |  | £31,000.00\npast | 2026-09-16 |  | £32,000.00\nstep | 2026-09-20 | Invoice 2026-049: type licensing | £960.00\nstep | 2026-10-01 | Corporation tax | −£40,100.00\nstep | 2026-11-02 | Retainer | £9,000.00\nhorizon | 90 |  | \nknobs | horizon late spend leave |  | \n```',
  'a forecast that stays above zero, with no past': '```forecast\nopening | 2026-09-17 | Cash now | USD 1,000.00\nstep | 2026-09-18 | Rent | USD −100.00\nhorizon | 30 |  | \n```',
  'a forecast with no opening row': '```forecast\nstep | 2026-09-18 | Rent | −£100.00\n```',
  'sparklines of two lengths, one with a gap': '```sparkline\nCash | 18 20 x 24 | 24\n | 1 2 | 2\n```',
  'a split with an unnamed part': '```split\nRent | 300\n | 100\n```',
  'sparklines, with one point and none':'```sparkline | Weekly\nCash | 18 20 19 24 | GBP 24.00 | good\nLonely | 7 | 7\nNone |  | \n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = page(src);
    const svelte = tree(render(Block, { props: { block } }).body);
    const html = tree(toHTML([block]));
    assert.equal(svelte, html);
  });
}

test('and the comparison is not vacuous: a tree that differs is told apart', () => {
  const a = tree(toHTML([page(SHAPES['a section with a count']!)]));
  const b = tree(toHTML([page(SHAPES['a section that counts nothing']!)]));
  assert.notEqual(a, b);
});

test('a forecast draws its knobs only where the host asks, and the rest of the tree is the same', () => {
  const block = page(SHAPES['a forecast with a past, stems, knobs and a crossing']!);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = render(Knobbed, { props: { block, opts: { scenario: true } } }).body;
  assert.match(knobs, /type="range"/u);
  assert.match(knobs, /aria-pressed/u);
  assert.doesNotMatch(render(Block, { props: { block } }).body, /type="range"/u);
});
