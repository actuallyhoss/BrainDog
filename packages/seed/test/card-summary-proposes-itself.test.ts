/**
 * Every use case's card, its summary typed back as a first answer, proposes that card.
 *
 * THE FIRST RUN SHOWS THE CARDS' OWN WORDS, and an owner who types back what a card said has told the arranger which
 * card they meant. `40f2a29c`'s tie-break was made to hold the Solo founder card to that, and nothing held the other
 * five: Small business's summary, "What you are owed and what you owe, what you run on, the people involved and the
 * work.", heard no signal of any use case, so `arrange` answered `pick: null` and the first run proposed nothing for
 * the one card the owner had just read. The other five proposed
 * themselves, so this is one card's words and not the arranger.
 *
 * EVERY CARD AND NOT A LIST OF THEM, so a seventh card is held to it the day it is added, and so is a summary rewritten
 * without a look at its signals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, arrange } from '../src/usecases/index.ts';

test('EVERY CARD, ITS SUMMARY TYPED BACK, PROPOSES ITSELF', () => {
  const said = USE_CASES.map((u) => {
    const got = arrange(u.summary);
    return { card: u.usecase, proposed: got.pick?.usecase ?? null, heard: got.ranked.find((r) => r.usecase === u)?.why.map((w) => w.text) ?? [] };
  });
  const missed = said.filter((s) => s.proposed !== s.card);
  assert.deepEqual(missed, [], `typed back, these cards propose something else or nothing:\n${JSON.stringify(missed, null, 2)}`);
});

test('AND IS NOT HEARD BY CHANCE: each summary names a signal of its own card, and the card is not tied on it', () => {
  /* A PICK WON ON CATALOGUE ORDER IS A PICK THE NEXT CARD CAN TAKE. The test above passes for a summary that ties with
     an earlier card and wins because it comes first, so the runner-up is held to a lower score or fewer letters heard. */
  for (const u of USE_CASES) {
    const [top, next] = arrange(u.summary).ranked;
    assert.ok(top && top.usecase === u && top.score > 0, `${u.usecase} heard nothing of its own in "${u.summary}"`);
    if (!next || next.score === 0) continue;
    const letters = (r: typeof top) => r.why.reduce((n, w) => n + w.text.length, 0);
    assert.ok(top.score > next.score || letters(top) > letters(next), `${u.usecase} is proposed over ${next.usecase} only by catalogue order`);
  }
});

test('SMALL BUSINESS SAYS MONEY IN AND MONEY OUT, never who owes whom, and is proposed on the words it always was', () => {
  /* MONEY IS A FINANCE APPLICATION, NOT A LEDGER OF WHO OWES WHOM (Money is a finance application): the
     card a person reads first and the line an empty Home says are held to it, as whole words so "owner" is no miss. */
  const business = USE_CASES.find((u) => u.usecase === 'business')!;
  const owes = /\b(owe|owed|owes|owing)\b/i;
  assert.doesNotMatch(business.summary, owes, 'the card says who owes whom');
  assert.doesNotMatch(business.voice?.fills_with ?? '', owes, 'an empty Home says who owes whom');
  assert.match(business.summary, /^Money in and out\b/);

  /* THE WORDS MOVED AND THE SIGNALS DID NOT (`business.ts`): a signal added to carry a reworded summary is a card
     proposed to people who never meant it, so the list is held whole and nothing in it speaks of owing. */
  assert.deepEqual(business.signals, [
    'business', 'small business', 'my business', 'studio', 'agency', 'freelance', 'freelancer', 'freelancing',
    'consultancy', 'consulting', 'clients', 'client', 'customers', 'invoice', 'invoices', 'invoicing', 'domains',
    'hosting', 'subscriptions', 'contractors', 'accountant', 'vat', 'bookkeeping', 'retainer', 'foundry',
    /* A CREATOR'S WORK IS A BUSINESS SINCE 2 November (2cb750068), and none of these speaks of owing either. */
    'streamer', 'youtuber', 'content creator', 'creator', 'sponsors', 'sponsorships', 'brand deals',
  ]);
  assert.equal(arrange('track what my brother owed me for the holiday').pick, null);
});
