/**
 * Every use case's card, its summary typed back as a first answer, proposes that card.
 *
 * THE FIRST RUN SHOWS THE CARDS' OWN WORDS, and an owner who types back what a card said has told the arranger which
 * card they meant. `40f2a29c`'s tie-break was made to hold the Solo founder card to that, and nothing held the other
 * five: Small business's summary, "What you are owed and what you owe, what you run on, the people involved and the
 * work.", heard no signal of any use case, so `arrange` answered `pick: null` and the first run proposed nothing for
 * the one card the owner had just read (`loop/research-batch-forty-seven-audit.md` §6). The other five proposed
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
