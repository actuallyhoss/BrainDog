/**
 * What the first run proposes from one sentence: who the person is, what their BrainDog is for, the modules it keeps,
 * the currency typed, the first entries the sentence itself fills, and what each phrase became
 * (`loop/finish/modules.md` C10, MOD-6).
 *
 * ONE SENTENCE, READ WITHOUT A MODEL, because the first run works on a fresh self-host with nothing configured (19 §6).
 * The name is read by `who.ts`, the rest of the sentence by `shape.ts` (the modules and the entries) and by the use-case
 * arranger (`@braindog/seed/usecases` `arrange`, through `arrange.ts`). The same words always give the same proposal.
 *
 * IT NEVER REFUSES. A sentence in a language these rules do not read, or one that names nothing they know, is a proposal
 * with nothing heard: the screen offers every module to turn on by hand and keeps the words as the person's note. The
 * signature is fixed, and the inside reads the catalogue's signals (shell.md USE-3).
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { alongside, modulesFor, payDayRow, type UseCase } from '@braindog/seed/usecases';
import { claimedBy } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { arrangeTurns } from '../arrange.ts';
import { firstRun } from '../first-run.ts';
import { BUNDLED, closeOver, heardFor, shape, toTurnOn, writable, type Offer, type PackId } from '../shape.ts';
import { hear } from '../who.ts';

export type Proposal = {
  /** The person's name, where the sentence puts one unmistakably. */
  name: string | null;
  /** The use case proposed, by id, or `null` when nothing in the sentence points at one. */
  usecase: string | null;
  /** The other use cases for one person the sentence also described, by id, installed beside the one proposed. */
  also: string[];
  /**
   * The packs to install, every one each leans on included: the first-party modules in install order, then any other
   * catalogue pack the sentence was heard asking for.
   */
  modules: string[];
  /** The currency typed in the sentence, or `null`: never guessed from a place or a word like "pounds". */
  currency: string | null;
  /**
   * Entries the sentence fills completely, written once the modules they belong to are in. `party` is the place in
   * `rows` of the one client an invoice is to ("We bill Fenwick £2,000 a month"), which is written first and linked.
   */
  rows: { register: string; fields: Record<string, unknown>; party?: number }[];
  /** Each phrase heard, in sentence order, and what it became, in the words the screen says. */
  heard: { phrase: string; became: string }[];
};

/**
 * Where and how the sentence was typed: the person's time zone, for a day such as "on the 1st", and their language.
 * `catalogue` is any pack beyond the bundled modules the first run may offer, each with the words it is heard in (a
 * Kennel listing's manifest); absent, only the modules this build ships are listened for.
 */
export type ProposeContext = { zone: string | null; locale: string; catalogue?: readonly Offer[] };

/**
 * TODAY WHERE THE PERSON IS, for a date the sentence gives as a day of the month. `null` when the zone is not one the
 * browser knows, and `shape` then reads the day in its own default.
 */
function todayIn(zone: string | null): string | null {
  if (zone === null) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return null;
  }
}

/** Two spans of one sentence overlap. */
const overlaps = (a: { at: number; text: string }, b: { at: number; text: string }): boolean => a.at < b.at + b.text.length && b.at < a.at + a.text.length;

/**
 * The modules a sentence asks for, closed over what each leans on.
 *
 * A MODULE NOTHING POINTED AT DOES NOT ARRIVE. The reader answers Projects for any sentence at all, so a maths student's
 * record arrived with an empty Projects page on the rail (`loop/research-usability-2026-09-21.md` finding 2). Only a
 * module with a phrase behind it is kept, People for a heard name, and then whatever those lean on (`LEANS_ON`), so
 * nothing loses a module it cannot install without. A phrase the use case claims ("an Etsy shop" said to the guide is
 * its project) asks for no module of its own (`claimedBy`).
 */
function modulesOf(read: ReturnType<typeof shape>, said: string, named: boolean, u: UseCase | null, beside: readonly UseCase[], offers: readonly Offer[]): PackId[] {
  const kept = u ? heardFor(read, claimedBy(u, said)) : read;
  const pointed = new Set(kept.packs.filter((p) => p.why.length > 0).map((p) => p.id));
  /* `toTurnOn` ADDS PEOPLE FOR A NAME, and a declined reading has no packs, so a name alone still keeps People. */
  const heard = toTurnOn(kept, named, offers).filter((id) => pointed.has(id) || (named && !kept.packs.some((p) => p.id === id)));
  /* A CATALOGUE PACK THE SENTENCE ASKED FOR IS KEPT beside the use case's modules, since `modulesFor` keeps any pack. */
  return closeOver(u ? [...modulesFor(u, heard), ...beside.flatMap((b) => b.modules)] : heard, offers);
}

/**
 * WHETHER THE SENTENCE DESCRIBES A BUSINESS NO USE CASE FITS: the lexicon heard no use case's words in it
 * (`arrangeTurns` picks none with no score), so whatever it heard can only turn on a module or two. That is when a host with a model is asked
 * to draft lists and pages made for it (`loop/finish/pages.md` PGS-20); a sentence these rules could not read at all is
 * one of those too, since a model reads it in any language.
 */
export const outsideCatalogue = (p: Proposal): boolean => p.usecase === null && p.also.length === 0;

/** What one sentence proposes. `ctx.locale` is carried for the catalogue's reading; these rules read English. */
export function propose(sentence: string, ctx: ProposeContext): Proposal {
  const who = hear(sentence);
  /* THE REST OF THE SENTENCE IS READ WITHOUT THE NAME, so "Kiln, I run a studio" is not a project called Kiln. */
  const said = who.bio;
  const today = todayIn(ctx.zone);
  /* THE CATALOGUE'S SIGNALS: the bundled modules' own, and those of any other pack the caller can offer. */
  const offers = [...BUNDLED, ...(ctx.catalogue ?? []).filter((o) => !BUNDLED.some((b) => b.id === o.id))];
  const read = shape(said, today ?? undefined, offers);
  const arranged = arrangeTurns(null, said);
  const u = read.declined === 'language' ? null : arranged.pick;
  const beside = u ? alongside(arranged, u) : [];
  const modules = modulesOf(read, said, who.name !== null, u, beside, offers);

  const heard: { at: number; phrase: string; became: string }[] = [];
  const phrases = read.declined === null ? read.heard : [];
  for (const h of phrases)
    heard.push({ at: h.at, phrase: h.text, became: h.loose ? firstRun.shapeNoCurrency : firstRun.and(h.packs.map(moduleName)) });
  /* A PHRASE THE USE CASE HEARD COUNTS AS HEARD, where no module's phrase already covers it: "homework" became Student. */
  const own = u ? (arranged.ranked.find((r) => r.usecase === u)?.why ?? []) : [];
  for (const w of own) if (u && !phrases.some((h) => overlaps(h, w))) heard.push({ at: w.at, phrase: w.text, became: u.title });
  heard.sort((a, b) => a.at - b.at);

  /* AN INVOICE KEEPS THE CLIENT IT IS TO. `shape.ts` counts `party` among every entry it read, complete or not, so it
     is counted again among the ones proposed; a client the sentence did not fill completely is not written, and the
     invoice then points at nobody rather than at the wrong entry. */
  const complete = read.declined === null ? writable(read) : [];
  /* TYPED TO THE WIDER SHAPE `rows` LEAVES AS (a `register` of any string, `fields` of any value), rather than let
     inference narrow it to `complete`'s own rows: `payDayRow`'s `'recurring'` row pushed below is a different
     register and a wider `fields` than any of those. */
  const rows: { register: string; fields: Record<string, unknown>; party?: number }[] = complete.map((r) => {
    const to = r.party === undefined ? undefined : read.rows[r.party];
    const party = to === undefined ? -1 : complete.indexOf(to);
    return { register: r.register, fields: { ...r.fields }, ...(party < 0 ? {} : { party }) };
  });
  /* PAY DAY IS A RECURRING ROW FORMED ONLY WHEN THE SENTENCE NAMES PAY, and only once Money is one of the modules the
     sentence turns on: Personal's own pack seeds no rows of its own kind, so this is written alongside the others
     rather than in `personal.ts` (MOD-17). A sentence that names pay but leaves out an amount or a day is not
     written half-formed: `missing` says which field payDayRow could not read, and only a row with neither missing
     is proposed. */
  if (u?.usecase === 'personal' && modules.includes('money-core')) {
    const pd = payDayRow(said, today);
    if (pd && pd.missing.length === 0) rows.push({ register: pd.register, fields: { ...pd.fields } });
  }

  return {
    name: who.name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    modules,
    currency: read.declined === null ? read.currency : null,
    rows,
    heard: heard.filter((h) => h.became !== '').map((h) => ({ phrase: h.phrase, became: h.became })),
  };
}
