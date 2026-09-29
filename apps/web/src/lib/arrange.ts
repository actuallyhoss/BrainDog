/**
 * What a BrainDog is for, read from what a person said about themselves and what they said it is for.
 * The first run asks one question now and hands
 * its sentence over as the second, with no first (`start/propose.ts`), which is `arrange` alone;
 * two sentences are still read together as below.
 *
 * BOTH TURNS ARE COUNTED TOGETHER. The screen used to read turn two alone and fall back to turn one
 * only when turn two picked nothing, so "I run a few companies" followed by "My companies, the money
 * across them, and the Claude and Codex agents I run on them" was one hit for Personal ("money") and
 * one for Solo founder ("My companies"), a tie that catalogue order gave to Personal, and the record
 * was made with Spending, Budget, Savings goals and 56 example rows. Counted together it is Solo
 * founder 2 ("companies", "My companies") to Personal 1.
 *
 * THE REASONS STAY PHRASES OF ONE SENTENCE. `from` is the sentence the use case forms around and the
 * screen underlines: turn two, or turn one when turn two heard nothing of the use case proposed. The
 * score counts both turns, and `why` keeps only the phrases inside `from`, at their places in it, so
 * a reason is never an offset into text the screen is not showing.
 *
 * A plain `.ts` so `node --test` can hold it; the screen only calls it.
 */

import { arrange, type Arrangement } from '@braindog/seed/usecases';

/** The proposal, and the sentence its reasons are phrases of. */
export type Arranged = Arrangement & { from: string };

export function arrangeTurns(bio: string | null | undefined, about: string): Arranged {
  const first = bio?.trim() ?? '';
  if (!first) return { ...arrange(about), from: about };
  const lead = `${first}. `;
  const whole = arrange(`${lead}${about}`);
  /* TURN ONE ADDS WEIGHT, AND A TIE GOES TO TURN TWO.
     Every chip is one signal of one use case, so a turn-one chip beside a turn-two chip that names another
     is a one-to-one tie, and read as one sentence it went to the longer phrase and then to catalogue
     order: "I run a few companies" then "I send invoices" proposed Solo founder, and 6 of the 24 chip
     pairs proposed another use case than turn two alone did. A tie on the whole score now goes to the
     one heard more in turn two's own words, and only then to length and catalogue order, which the sort
     keeps from `arrange` because it is stable. Where turn two heard nothing every one scores 0 there and
     the order is untouched, and turn one still adds to a use case turn two named (walk two's founder).
     A higher whole score still wins whichever turn it came from: "I want to start a podcast" then "I send
     invoices" is the guide on 2 to 1, and ranking turn two's own count first sent it to Small business. */
  const inTwo = (r: Arrangement['ranked'][number]): number => r.why.filter((w) => w.at >= lead.length).length;
  const order = [...whole.ranked].sort((a, b) => b.score - a.score || inTwo(b) - inTwo(a));
  const top = order[0];
  const both = { pick: top && top.score > 0 ? top.usecase : null, ranked: order };
  /* THE PICK'S OWN PHRASES DECIDE, not every use case's: turn two hearing only some other use case
     formed the guide for turn one's podcast around "I send invoices", which forms nothing. With no
     pick, nothing was heard anywhere and it is turn one, as it always was. */
  const deciding = both.pick ? both.ranked.filter((r) => r.usecase === both.pick) : both.ranked;
  const second = deciding.some((r) => r.why.some((w) => w.at >= lead.length));
  const from = second ? about : first;
  const shift = second ? lead.length : 0;
  const ranked = both.ranked.map((r) => ({
    ...r,
    why: r.why.filter((w) => w.at >= shift && w.at + w.text.length <= shift + from.length).map((w) => ({ at: w.at - shift, text: w.text })),
  }));
  return { pick: both.pick, ranked, from };
}
