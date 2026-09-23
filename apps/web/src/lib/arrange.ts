/**
 * What `/start` proposes a BrainDog is for, read from both of the first run's turns
 * (`loop/research-first-sign-in.md` §3, friction 3).
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
  const both = arrange(`${lead}${about}`);
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
