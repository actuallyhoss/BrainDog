/**
 * The offer on a list's own screen is the folded line, as it is on a declared page (look fault G, DIRECTION 39: quiet
 * the noise above the work). The whole card stood over the list's figures and its entries, a phone's first screen
 * before the list somebody opened to read. Folded, it is Slash's mark and the sentence on one line, and a press opens
 * the card whole with Make it and Not now where they were.
 *
 * READ FROM THE SOURCE, as `page-offer-58.test.ts` reads the declared page's route: the folded form itself is held
 * there, compiled, and here only that this screen asks for it and still hands the card its two presses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const CARD = readFileSync(new URL('../../../lib/design/OfferCard.svelte', import.meta.url), 'utf8');

const drawn = [...SCREEN.matchAll(/<OfferCard\b[^>]*\/>/gu)];

test("THE LIST'S OWN SCREEN DRAWS THE OFFER ONCE, AND FOLDED: it passes the compact form", () => {
  assert.equal(drawn.length, 1, 'the offer is drawn once');
  assert.match(drawn[0]![0], /\bcompact\b/u, 'the card on the list screen is the folded line');
  /* NEVER SWITCHED OFF IN THE SAME BREATH: `compact={false}` would be the whole card again. */
  assert.doesNotMatch(drawn[0]![0], /compact=\{false\}/u);
});

test('THE FOLDED OFFER KEEPS ITS TWO PRESSES AND ITS WAITING: the same actions, the same busy', () => {
  const tag = drawn[0]?.[0] ?? '';
  assert.match(tag, /item=\{offer\}/u);
  assert.match(tag, /acts=\{offerActions\}/u);
  assert.match(tag, /busy=\{offerBusy\}/u);
  /* THE ACTIONS ARE STILL THE PEN'S OWN, and Make it still opens the card while it is being made. */
  assert.match(SCREEN, /const offerActions = offerActs\(\{/u);
  assert.match(CARD, /const folded = \$derived\(compact && !opened && !making\)/u);
});

test('IT STANDS WHERE IT STOOD: above the figures and the entries, and not while the list is arriving', () => {
  const at = drawn[0]!.index;
  assert.match(SCREEN.slice(at - 40, at), /\{#if offer && !arriving\}\s*$/u);
  const figures = SCREEN.indexOf('<ListSummary ');
  assert.ok(figures > at, "the offer is before the list's figures");
});
