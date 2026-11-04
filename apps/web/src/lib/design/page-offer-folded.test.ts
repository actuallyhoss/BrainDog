/**
 * Look fault G, on the owner's Money: the offer said "Ledger has 6 this week. Give them a page of their own?", which
 * nobody says, and was drawn over the page's first tile, a phone's whole first screen and above the accounts on a
 * laptop. Held here: the sentence the record writes, in the list's own words; the card's folded form, one line that
 * opens on tap; and its place on a declared page, after the page's blocks and never before the first.
 *
 * THE CARD IS COMPILED HERE, FOR THE SERVER, as `offer-card.test.ts` does. THE SENTENCE IS THE RECORD'S OWN FUNCTION,
 * loaded by its address since the web app does not depend on the record: a copy of the words here would hold nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { offerActs, offerWords, penOf, type OfferActs, type PenItem } from './pen.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: OfferCard } = (await import(new URL('./OfferCard.svelte', import.meta.url).href)) as {
  default: Component<{ item: PenItem; acts: Pick<OfferActs, 'make' | 'notNow'>; busy?: string | null; compact?: boolean }>;
};
const { weekSaid, manySaid } = (await import(new URL('../../../../../packages/record/src/emergent.ts', import.meta.url).href)) as {
  weekSaid: (n: number, name: string, one: string | undefined, due: boolean) => string;
  manySaid: (name: string, one: string | undefined) => string;
};

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const ASK = 'Want a page of their own for them?';

test('THE SENTENCE IS ONE A PERSON SAYS: the count, the list by its entries, then the question', () => {
  /* Money's Ledger declares "transaction" for one of its entries, so six of them are transactions. */
  assert.equal(weekSaid(6, 'Ledger', 'transaction', false), `6 transactions this week. ${ASK}`);
  /* A list that declares no singular is named with "entries", the words of the brief. */
  assert.equal(weekSaid(6, 'Ledger', undefined, false), `6 ledger entries this week. ${ASK}`);
  /* A list whose name is already the word for many keeps its own name, lower case mid-sentence. */
  assert.equal(weekSaid(4, 'Orders', 'order', true), `4 orders due this week. ${ASK}`);
  assert.equal(weekSaid(4, 'Assignments', undefined, true), `4 assignments due this week. ${ASK}`);
  assert.equal(weekSaid(1200, 'Orders', 'order', false), `1,200 orders this week. ${ASK}`);
  assert.equal(weekSaid(1, 'Ledger', 'transaction', false), `1 transaction this week. ${ASK}`);
});

test('MANY OF A LIST, where its name does not say it: the declared singular turned, a name typed in capitals kept', () => {
  assert.equal(manySaid('People', 'person'), 'people');
  assert.equal(manySaid('Log', 'log entry'), 'log entries');
  assert.equal(manySaid('Put by', 'saving'), 'savings');
  assert.equal(manySaid('Stock', 'box'), 'boxes');
  /* THE PLURALS ENGLISH DOES NOT BUILD: never "5 childs" or "4 lifes". */
  assert.equal(manySaid('Children', 'child'), 'children');
  assert.equal(manySaid('Lives', 'life'), 'lives');
  assert.equal(manySaid('Staff', 'woman'), 'women');
  assert.equal(manySaid('Tools', 'paring knife'), 'paring knives');
  assert.equal(weekSaid(5, 'Children', 'child', false), `5 children this week. ${ASK}`);
  assert.equal(manySaid('HSBC cards', 'card'), 'HSBC cards');
  /* A NAME THAT ONLY LOOKS LIKE MANY GIVES WAY TO THE SINGULAR THE LIST DECLARES. */
  assert.equal(manySaid('Finances', 'transaction'), 'transactions');
  assert.equal(manySaid('Finances', undefined), 'finances');
  /* SAVINGS AND NEWS ARE NOT COUNTS OF THINGS: "6 savings" is never said off the name alone. */
  assert.equal(manySaid('Savings', undefined), 'savings entries');
  assert.equal(manySaid('News', undefined), 'news entries');
});

test('NEVER THE OLD SENTENCE, an id, a dash or the word row', () => {
  for (const said of [weekSaid(6, 'Ledger', 'transaction', false), weekSaid(4, 'Orders', undefined, true), weekSaid(6, 'Ledger', undefined, false)]) {
    assert.doesNotMatch(said, /\bhas \d|Give them|—|\brows?\b|\bentity\b|#/u, said);
    assert.match(said, /^\d/u, 'the count leads');
  }
});

/* THE RECORD'S `pen` ON BOOT, in the shape `emergent.ts` sends it, with the sentence the record now writes. */
const draft = {
  id: 'page.transactions-week',
  kind: 'page',
  body: {
    page: 'transactions-week',
    title: 'Ledger this week',
    blocks: [
      { kind: 'stat', cells: [{ metric: 'money.spent' }] },
      { kind: 'table', heading: 'Ledger this week', source: 'register.transactions', limit: 50 },
    ],
  },
};
const [ledger] = penOf([
  { id: 'week:transactions', kind: 'page', register: 'transactions', title: 'Ledger this week', why: weekSaid(6, 'Ledger', 'transaction', false), change: { to: draft }, list: 'transactions', draft },
]);
const acts = offerActs({
  keep: async () => ({ from: 'kept' }),
  dismiss: async () => ({ from: 'kept' }),
  go: () => {},
  say: () => {},
  words: { made: (t) => t, dismissed: (t) => t, notReached: 'Not reached.' },
});

test('THE COMPACT FORM IS ONE LINE: the sentence and a way to open it, and nothing else until it is pressed', () => {
  assert.ok(ledger);
  const html = render(OfferCard, { props: { item: ledger, acts, compact: true } }).body;
  assert.equal(html.match(/data-offer="/g)?.length, 1);
  assert.match(html, /<button[^>]*class="offer-line[^"]*"[^>]*aria-expanded="false"/u);
  assert.ok(html.includes(ledger.why), 'the folded line says the sentence');
  /* THE WHOLE SENTENCE IS THE LINE'S NAME, so a screen reader hears what a narrow screen cuts. */
  assert.ok(html.includes(`aria-label="${offerWords.noticed}: ${ledger.why}"`));
  for (const kept of ['offer-mini', 'offer-acts', offerWords.make, offerWords.notNow]) assert.ok(!html.includes(kept), `${kept} is drawn before the line is opened`);

  /* TWO LINES AT MOST:
     one line at 390 cut the question itself, "30 transactions this week. Want a pag…". It wraps, and only past two lines
     is it cut. */
  const css = source('./OfferCard.svelte');
  const why = /\.offer-line-why \{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.doesNotMatch(why, /white-space: nowrap/u);
  assert.match(why, /line-clamp: 2/u);
  /* A FLAT TILE: no border, no shadow, no gradient. */
  const line = /\.offer-line \{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(line, /border: 0/u);
  assert.doesNotMatch(css, /box-shadow|gradient|backdrop-filter/u);
});

test('THE CARD WITHOUT compact IS DRAWN WHOLE: with its drawing and its two presses', () => {
  assert.ok(ledger);
  const html = render(OfferCard, { props: { item: ledger, acts } }).body;
  for (const said of [offerWords.noticed, ledger.why, offerWords.make, offerWords.notNow, 'offer-mini']) assert.ok(html.includes(said), said);
  assert.doesNotMatch(html, /aria-expanded/u);
});

test("A DECLARED PAGE DRAWS THE OFFER AFTER ITS BLOCKS, never between its header and its first block", () => {
  const view = source('../page/PageView.svelte');
  const drawn = [...view.matchAll(/\{@render offer\(\)\}/gu)];
  assert.equal(drawn.length, 1, 'the offer is drawn once');
  const at = drawn[0]!.index;
  const head = view.indexOf('</PageHead>');
  const body = view.search(/<PageBody\n\s+mode="page"/u);
  const bodyEnd = view.indexOf('/>', body);
  assert.ok(head > 0 && body > head && bodyEnd > body, 'the page is still a head and then its blocks');
  assert.ok(at > bodyEnd, "the offer is drawn after the page's blocks");
  /* NOTHING OF IT BETWEEN THE HEADER AND THE BLOCKS, where it stood over the accounts. */
  assert.doesNotMatch(view.slice(head, body), /page-offer|offer\(\)/u);
  /* AND BEFORE THE NEXT MODE BEGINS, so it is the page's own last line and no other screen's. */
  assert.ok(at < view.indexOf("{:else if mode === 'home'}"));

  const route = source('../../routes/p/[slug]/+page.svelte');
  assert.match(route, /<OfferCard item=\{offer\}[^>]*\bcompact\b[^>]*\/>/u, 'the page passes the compact form');
  /* WHAT EVERY AGENT IS TOLD RIDES THE SAME PLACE ON AGENTS (today F19), after the blocks too. */
  assert.match(route, /<PageView [^>]*offer=\{offer \|\| lessons \? offerCard : undefined\}/u);
});
