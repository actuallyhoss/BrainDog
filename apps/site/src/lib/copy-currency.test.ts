/**
 * The site says money in the plans' own currency, and says only the figures the table of plans holds.
 *
 * WHY THIS TEST. The drawn app on the home page showed pounds beside dollar prices, and Cloud Plus was one
 * figure in the code and another in the roadmap. Every price and every plan figure is `PLAN_TABLE`'s
 * (`packages/record/src/plans.ts`), whose money is whole cents of `CURRENCY`. So two checks:
 *
 *   - CURRENCY. A copy file that sits beside a price says no other currency: no `£`, `€` or other symbol but `$`, and
 *     no code but `USD` in front of a figure. Comments may keep theirs (`page.ts` explains how the app draws a code).
 *   - FIGURES. Every `$` figure the pricing page and the Slash page's credits say is a price
 *     the table holds (a plan by the month or year, a pack, extra usage), and every count of credits, questions, agents
 *     or runs is one a plan holds. The pricing page's cards are read with billing on and with it off.
 *
 * Each check has a planted fault beside it, so it is seen to fail by itself. The table is read by its runtime URL, as
 * `plans.test.ts` reads it: the site declares no `@braindog/record`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { site } from './copy.ts';
import { slashPage } from './copy/slash.ts';
import { PLANS, TABLE } from './plans.ts';
import { cardsFor, extra, holds } from './pricing/cards.ts';

const REPO = new URL('../../../../', import.meta.url);

type Cents = { cents: number; per?: number };
type Row = {
  cents: { month: number; year: number | null };
  credits: number | null;
  agents: number | null;
  allowance: { runs: number } | null;
  extra: Record<string, Cents> | null;
};
const { PLAN_TABLE, PACKS, CURRENCY, priceOf } = (await import(new URL('packages/record/src/plans.ts', REPO).href)) as {
  PLAN_TABLE: Record<string, Row>;
  PACKS: readonly { credits: number; cents: number }[];
  CURRENCY: string;
  priceOf: (cents: number) => string;
};

/** The copy files that sit beside a price: the plans, the pricing and home copy, the pricing page, and the drawn app. */
const BESIDE_A_PRICE = [
  'apps/site/src/lib/plans.ts',
  'apps/site/src/lib/copy/pricing.ts',
  'apps/site/src/lib/pricing/cards.ts',
  'apps/site/src/lib/pricing/Plans.svelte',
  'apps/site/src/routes/pricing/+page.svelte',
  'apps/site/src/lib/copy/home.ts',
  'apps/site/src/lib/copy/slash.ts',
  'apps/site/src/lib/app/page.ts',
  'apps/site/src/lib/app/Page.svelte',
];

/** A file's words without its comments, which may name another currency to explain one. */
const uncommented = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Every currency a text says that is not the table's: a symbol other than `$`, or a code other than `CURRENCY`. */
function otherCurrencies(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[\p{Sc}]/gu)) if (m[0] !== '$') out.push(m[0]);
  for (const m of text.matchAll(/\b([A-Z]{3})[  ]?[−-]?\d/gu)) if (m[1] !== CURRENCY) out.push(m[1]!);
  for (const m of text.matchAll(/\b(pounds?|pence|euros?|sterling)\b/giu)) out.push(m[0]);
  return out;
}

const rows = Object.values(PLAN_TABLE);
const PRICES = new Set<string>([
  ...rows.flatMap((r) => [r.cents.month, r.cents.year]).filter((c): c is number => c !== null).map(priceOf),
  ...PACKS.map((p) => priceOf(p.cents)),
  ...rows.flatMap((r) => Object.values(r.extra ?? {}).map((e) => priceOf(e.cents))),
]);
const HELD: Record<string, Set<number>> = {
  credits: new Set([...rows.map((r) => r.credits).filter((n): n is number => n !== null), ...PACKS.map((p) => p.credits)]),
  agents: new Set(rows.map((r) => r.agents).filter((n): n is number => n !== null)),
  runs: new Set(rows.map((r) => r.allowance?.runs).filter((n): n is number => n !== undefined)),
};

/** Every price or plan figure a text says that the table does not hold, as the words that say it. */
function figuresNotHeld(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) if (!PRICES.has(m[0])) out.push(m[0]);
  const meter = /(\d[\d,]*) (?:Slash credits|Slash questions|credits|questions|agents|AI tools|automation runs|runs)\b/g;
  for (const m of text.matchAll(meter)) {
    const key = /credits|questions/.test(m[0]) ? 'credits' : /agents|AI tools/.test(m[0]) ? 'agents' : 'runs';
    if (!HELD[key]!.has(Number(m[1]!.replace(/,/g, '')))) out.push(m[0]);
  }
  return out;
}

const p = site.pricing;

/** A meter of the pricing table as the figure check reads it: its cell, then the word the check knows it by. */
const WORD: Record<string, string> = { agents: 'agents', credits: 'questions', runs: 'automation runs' };

/** What the pricing page, the Slash page's asks and home's early access tile say, as the routes put it together. */
const said: string[] = [
  JSON.stringify({ pricing: p, slash: slashPage }),
  ...p.early.plan.lines(TABLE.free),
  site.free.figures(TABLE.free.agents, TABLE.free.credits),
  ...PLANS.flatMap((pl) => [pl.price, pl.unit, pl.for]),
  ...[cardsFor({ billing: false }), cardsFor({ billing: true })].flat().flatMap((card) => [
    `${card.price} ${card.per}`,
    ...card.lines,
    card.button.kind === 'start' ? '' : card.button.label,
  ]),
  ...holds.flatMap((row) => row.cells.map((cell) => (WORD[row.key] ? `${cell} ${WORD[row.key]}` : `${cell} ${row.name}`))),
  ...extra.map((row) => `${row.name} ${row.price}`),
];

test('no copy file beside a price says a currency the plans are not sold in', () => {
  const wrong: string[] = [];
  for (const file of BESIDE_A_PRICE) {
    const found = otherCurrencies(uncommented(readFileSync(new URL(file, REPO), 'utf8')));
    if (found.length > 0) wrong.push(`${file}: ${[...new Set(found)].join(', ')}`);
  }
  assert.deepEqual(wrong, [], `the plans are sold in ${CURRENCY}, and these say another currency`);
});

test('a planted pound, euro or code is refused', () => {
  assert.deepEqual(otherCurrencies("lead: '£910.99, across four bills.'"), ['£']);
  assert.deepEqual(otherCurrencies('Rent | GBP 850.00 | €12'), ['€', 'GBP']);
  assert.deepEqual(otherCurrencies('ten pounds a month'), ['pounds']);
  assert.deepEqual(otherCurrencies("'$910.99' and USD 12.00"), []);
  assert.equal(uncommented("/* `£1,312.40 is left` */\nconst a = 1;").includes('£'), false, 'a comment is not copy');
});

test('every price and plan figure the site says is one the table holds', () => {
  assert.deepEqual(said.flatMap(figuresNotHeld), []);
});

test('the figure check sees what it is meant to', () => {
  /* THE PLANTED FAULTS: a price no plan has, Free with a fourth agent, and the roadmap's old Cloud Plus runs. */
  assert.deepEqual(figuresNotHeld('Cloud is $14 a month'), ['$14']);
  assert.deepEqual(figuresNotHeld('Connect up to 4 agents'), ['4 agents']);
  assert.deepEqual(figuresNotHeld('5 AI tools connected'), ['5 AI tools']);
  assert.deepEqual(figuresNotHeld('30 Slash questions a month'), ['30 Slash questions']);
  assert.deepEqual(figuresNotHeld('400 Slash credits and 60,000 runs a month'), ['60,000 runs']);
  assert.deepEqual(figuresNotHeld('$12 a month, $29 a month, $0.50 a GB, 100 credits for $5'), []);
  /* And it is reading the cards and the table: every plan's agents and runs are in what it read. */
  for (const pl of PLANS) {
    assert.ok(said.some((s) => s.includes(`${pl.allowance.agents} agents`)), `${pl.name}'s agents are not on its card`);
    assert.ok(said.includes(`${pl.allowance.runs.toLocaleString('en-US')} automation runs`), `${pl.name}'s runs are not in the table`);
  }
});

test('no sentence says a card is charged today', () => {
  /* BILLING STAYS OFF OR IN TEST MODE: a live charge is a word he has not said. */
  const text = said.join('\n');
  assert.doesNotMatch(text, /\b(?:card|you) (?:is|are|will be|gets?) charged\b|charged (?:today|now)\b|charge your card/i);
  assert.doesNotMatch(text, /\bper year\b|\ba year\b|\byearly\b|\bannual/i, 'the site draws a yearly price, and the table sells none');
});
