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

import { AGENTS_SIGNALS } from '@braindog/seed/packs/modules';
import { arrange as arrangeAll, MODULE_ORDER, USE_CASES, type Arrangement, type UseCase } from '@braindog/seed/usecases';

import type { Offer } from './shape.ts';
import type { CatalogueUsecase } from './start/offer.ts';

/** The proposal, and the sentence its reasons are phrases of. */
export type Arranged = Arrangement & { from: string };

/**
 * A CATALOGUE USE CASE IS HEARD AS A SHIPPED ONE IS: its own signals, counted by the same `arrange`, and the
 * modules it stands on carried on what it proposes. `heard` is what the first run read from the host's catalogue
 * (`start/offer.ts`, `heardOf` or the whole entry); its title and summary are said where it gives them, its id as words
 * where not.
 *
 * IT COMES AFTER EVERY SHIPPED ONE, so a tie the length of what was heard leaves standing still goes to the compiled use
 * case, by the catalogue order `arrange` keeps. AN ID THIS BUILD SHIPS IS PASSED OVER, as a use case or as a module, so
 * an entry reusing one never shadows the words compiled for it; so is a second entry under one id, and one with no words.
 */
type Heard = CatalogueUsecase | Offer;

const SHIPPED: ReadonlySet<string> = new Set([...USE_CASES.map((u) => u.usecase), ...MODULE_ORDER]);

/** An id said as words, for an offer that came with no title: `rent-book` is "Rent book", never the id itself. */
const said = (id: string): string => {
  const words = id.replace(/-+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The front of a catalogue use case, as the arranger reads one: words and modules, and no pack of its own here. */
const frontOf = (h: Heard): UseCase => ({
  usecase: h.id,
  version: '0.0.0',
  title: 'title' in h && h.title.trim() !== '' ? h.title : said(h.id),
  summary: 'summary' in h ? h.summary : '',
  author: '',
  license: '',
  audience: 'other',
  tone: '',
  signals: [...h.signals],
  modules: [...h.modules],
  voice: {},
  labels: {},
  pack: null,
  skills: [],
  nav: [],
  links: [],
  over: {},
});

/**
 * AN AGENT IS THE AGENTS ADD-ON'S WORD, NEVER A USE CASE'S: "what my agents did" made a
 * one-person record a team's, with Cycles, a Cycle plan and Cycle days. The add-on hears the words its own signals say
 * (`AGENTS_SIGNALS`), so a use case is ranked on the rest of what it heard, by the same order `arrange` keeps.
 */
const ADDON_WORDS: ReadonlySet<string> = new Set(AGENTS_SIGNALS.map((w) => w.toLowerCase()));

function arrange(said: string, cases: readonly UseCase[]): Arrangement {
  const all = arrangeAll(said, cases);
  const ranked = all.ranked
    .map((r, i) => {
      const why = r.why.filter((w) => !ADDON_WORDS.has(w.text.toLowerCase()));
      return { r: { ...r, score: why.length, why }, said: why.reduce((n, w) => n + w.text.length, 0), i };
    })
    .sort((a, b) => b.r.score - a.r.score || b.said - a.said || a.i - b.i)
    .map((x) => x.r);
  const top = ranked[0];
  return { pick: top && top.score > 0 ? top.usecase : null, ranked };
}

/** The use cases listened for: the shipped ones, then each catalogue one this build does not already ship. */
function casesOf(heard: readonly Heard[] | undefined): readonly UseCase[] {
  if (!heard || heard.length === 0) return USE_CASES;
  const seen = new Set<string>();
  const added: UseCase[] = [];
  for (const h of heard) {
    if (SHIPPED.has(h.id) || seen.has(h.id) || h.signals.length === 0) continue;
    seen.add(h.id);
    added.push(frontOf(h));
  }
  return added.length === 0 ? USE_CASES : [...USE_CASES, ...added];
}

export function arrangeTurns(bio: string | null | undefined, about: string, heard?: readonly Heard[]): Arranged {
  const cases = casesOf(heard);
  const first = bio?.trim() ?? '';
  if (!first) return { ...arrange(about, cases), from: about };
  const lead = `${first}. `;
  const whole = arrange(`${lead}${about}`, cases);
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
