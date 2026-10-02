/**
 * What the first run proposes from what the person says about themselves: who they are, what their BrainDog is for, the
 * modules it keeps, the currency typed, the first entries the words fill, and what each phrase became.
 *
 * THE MODEL READS IT FIRST (`proposeFirst`). What was typed goes to Slash (`POST /api/slash/setup`, `ask.ts`) with the
 * catalogue this build ships (`setupOffer`), and the model proposes the use case, the modules, the first entries and the
 * names for lists in the person's own words; every id it answers is held to that catalogue and every value to the list's
 * own declaration before the screen shows it (`fromModel`). Where it says nothing in the catalogue fits, it writes the
 * brief Slash drafts lists and pages from (`draft`).
 *
 * THE RULES ARE THE FALLBACK, read without a model (`propose`), because the first run works on a fresh self-host with
 * nothing configured (19 §6), on a month whose asks are spent, and while the model is still answering: they are what
 * the screen draws as the person types. The name is read by `who.ts`, the rest by `shape.ts` (the modules and the
 * entries) and by the use-case arranger (`@braindog/seed/usecases` `arrange`, through `arrange.ts`). The same words
 * always give the same proposal from them.
 *
 * IT NEVER REFUSES. A sentence in a language these rules do not read, or one that names nothing they know, is a proposal
 * with nothing heard: the screen offers every module to turn on by hand and keeps the words as the person's note. The
 * model reads any language, which is the other reason it is asked first.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { AGENTS_PACK } from '@braindog/seed/packs';
import { moduleOfList } from '@braindog/seed/packs/modules';
import { alongside, modulesFor, payDayRow, useCase, USE_CASES, type UseCase } from '@braindog/seed/usecases';
import { claimedBy } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { arrangeTurns } from '../arrange.ts';
import { firstRun } from '../first-run.ts';
import { BUNDLED, closeOver, heardFor, INSTALL_ORDER, shape, toTurnOn, writable, type Offer, type PackId } from '../shape.ts';
import { hear, PEOPLE } from '../who.ts';
import type { AskSetup, SetupOffer, SetupReply } from './ask.ts';
import { entryOf, FILLABLE, knownCurrency, listById, listsOf } from './lists.ts';

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
  /** Who read it: `rules`, or the model as Slash's ledger names it. Absent is the rules, as before there was a model. */
  by?: string;
  /** Why the rules read it where a model was asked: the refusal's code, such as `SLASH_BUDGET_SPENT`. */
  fell?: string;
  /** What this BrainDog is for, in one sentence of the person's words, where the model said it. */
  summary?: string | null;
  /** The brief Slash drafts lists and pages from, where the model said nothing in the catalogue fits. */
  draft?: string | null;
  /** A list renamed to the person's own word for it, by list id: "Shops" for Projects. */
  names?: Record<string, string>;
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
 * record arrived with an empty Projects page on the rail. Only a
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
 * to draft lists and pages made for it; a sentence these rules could not read at all is
 * one of those too, since a model reads it in any language.
 */
export const outsideCatalogue = (p: Proposal): boolean =>
  p.by !== undefined && p.by !== 'rules' ? (p.draft ?? null) !== null : p.usecase === null && p.also.length === 0;

/** What a host with a model is asked to draft from: the model's own brief where it wrote one, else the words typed. */
export const draftBrief = (p: Proposal, sentence: string): string => p.draft ?? sentence;

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
     rather than in `personal.ts`. A sentence that names pay but leaves out an amount or a day is not
     written half-formed: `missing` says which field payDayRow could not read, and only a row with neither missing
     is proposed. THE MODULE IS THE ONE THAT DECLARES THE ROW'S LIST (`moduleOfList`), not a pack named here. */
  if (u?.usecase === 'personal') {
    const pd = payDayRow(said, today);
    const brings = pd ? moduleOfList(pd.register)?.id : undefined;
    if (pd && pd.missing.length === 0 && brings !== undefined && modules.includes(brings)) rows.push({ register: pd.register, fields: { ...pd.fields } });
  }

  return {
    name: who.name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    modules,
    currency: read.declined === null ? read.currency : null,
    rows,
    heard: heard.filter((h) => h.became !== '').map((h) => ({ phrase: h.phrase, became: h.became })),
    by: 'rules',
  };
}

/* ── the model, first ──────────────────────────────────────────────────── */

/**
 * WHAT THE MODEL MAY CHOOSE FROM: every use case and every module this build ships, each module with its lists and the
 * fields an entry from typed words can fill. The agents' lists are offered by name only, since an agent writes what goes
 * in them and nothing a person types about themselves does.
 */
export function setupOffer(): SetupOffer {
  return {
    usecases: USE_CASES.map((u) => ({ id: u.usecase, title: u.title, summary: u.summary })),
    modules: INSTALL_ORDER.map((id) => ({
      id,
      name: moduleName(id),
      lists:
        id === AGENTS_PACK.manifest.id ? [] : listsOf(id).map((l) => ({ id: l.id, name: l.name, fields: l.fields.filter((f) => FILLABLE.has(f.type)).map((f) => f.id) })),
    })),
  };
}

/** Where `needle` sits in what was typed, read without case, or -1. */
const at = (said: string, needle: string): number => (needle === '' ? -1 : said.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()));

/**
 * THE MODEL'S SETUP, HELD TO THIS BUILD AND TO WHAT WAS TYPED, over the rules' reading of the same words.
 *
 * WHAT THE MODEL SAYS STANDS WHERE IT CAN BE CHECKED, and the rules' reading fills what it left out or got wrong: a use
 * case or a module this build does not ship is dropped, a name or a phrase that is not in the words is dropped, a
 * currency is one typed (as its code, or as the rules read it from a symbol), and an entry is kept only where every
 * value fits its list's declaration and the list is one the setup keeps. Where none of its entries or phrases survive,
 * the rules' are said instead, so a model that answered thinly never leaves the screen emptier than the rules would.
 *
 * A NAME KEEPS PEOPLE, as it does from the rules, so the words have somewhere to be kept; a use case keeps every module
 * it stands on, and every module whatever it leans on (`closeOver`).
 */
export function fromModel(reply: SetupReply, sentence: string, ctx: ProposeContext, rules: Proposal): Proposal {
  const offers = [...BUNDLED, ...(ctx.catalogue ?? []).filter((o) => !BUNDLED.some((b) => b.id === o.id))];
  const known = new Set(offers.map((o) => o.id));
  const u = reply.usecase === null ? null : (useCase(reply.usecase) ?? null);
  const beside = u ? reply.also.flatMap((id) => (id === u.usecase ? [] : (useCase(id) ?? []))).slice(0, 2) : [];
  const name = reply.name !== null && reply.name.length <= 60 && at(sentence, reply.name) >= 0 ? reply.name : rules.name;
  const asked = reply.modules.filter((id) => known.has(id));
  /* AN ANSWER THAT CHOSE NOTHING AND DRAFTED NOTHING IS NO READING: the rules' stands, and where they read nothing either
     the words are the brief Slash drafts from (`outsideCatalogue`), as before there was a model. */
  if (u === null && asked.length === 0 && (reply.draft ?? '').trim() === '') return { ...rules, fell: 'PROPOSAL_EMPTY' };
  const named = name !== null && !asked.includes(PEOPLE) ? [...asked, PEOPLE] : asked;
  const modules = closeOver(u ? [...modulesFor(u, named), ...beside.flatMap((b) => b.modules)] : named, offers);

  const code = reply.currency?.toUpperCase() ?? null;
  const typed = code !== null && knownCurrency(code) && (rules.currency === code || new RegExp(`(^|[^A-Za-z])${code}([^A-Za-z]|$)`, 'iu').test(sentence));
  const currency = typed ? code : rules.currency;

  const heard = reply.heard
    .map((h) => ({ phrase: h.phrase.trim(), became: h.became.trim().slice(0, 80), at: at(sentence, h.phrase.trim()) }))
    .filter((h, i, all) => h.at >= 0 && h.became !== '' && all.findIndex((x) => x.at === h.at) === i)
    .sort((a, b) => a.at - b.at)
    .map(({ phrase, became }) => ({ phrase, became }));

  const rows: Proposal['rows'] = [];
  for (const r of reply.rows.slice(0, 5)) {
    const list = listById(r.list, modules);
    const fields = list ? entryOf(list, r.fields, currency) : null;
    if (list && fields) rows.push({ register: list.id, fields });
  }

  const names: Record<string, string> = {};
  for (const n of reply.names) {
    const word = n.name.trim();
    if (word !== '' && word.length <= 40 && at(sentence, word) >= 0 && listById(n.list, modules) && names[n.list] === undefined) names[n.list] = word.charAt(0).toUpperCase() + word.slice(1);
  }

  const summary = reply.summary.trim();
  return {
    name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    /* THE RULES' ENTRIES BRING THEIR LISTS, where they stand in for the model's: an entry for a module the model left off
       would be refused at the press, and dropping one would break the `party` the others point at by place. */
    modules: rows.length > 0 ? modules : closeOver([...modules, ...rules.rows.flatMap((r) => moduleOfList(r.register)?.id ?? [])], offers),
    currency,
    rows: rows.length > 0 ? rows : rules.rows,
    heard: heard.length > 0 ? heard : rules.heard,
    by: reply.by === '' || reply.by === 'rules' ? 'model' : reply.by,
    summary: summary === '' ? null : summary,
    draft: u === null && reply.draft !== null && reply.draft.trim() !== '' ? reply.draft.trim() : null,
    ...(Object.keys(names).length === 0 ? {} : { names }),
  };
}

/**
 * What the words propose, read by the model where the host has one and by the rules where it has not, where the month's
 * asks are spent, or where the model did not answer in time. `ask` is `null` on a host with no model behind Slash.
 */
export async function proposeFirst(sentence: string, ctx: ProposeContext, ask: AskSetup | null): Promise<Proposal> {
  const rules = propose(sentence, ctx);
  if (ask === null || sentence.trim() === '') return rules;
  let out: Awaited<ReturnType<AskSetup>>;
  try {
    out = await ask({ said: sentence, offer: setupOffer(), today: todayIn(ctx.zone) ?? new Date().toISOString().slice(0, 10) });
  } catch (e) {
    out = { ok: false, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } };
  }
  return out.ok ? fromModel(out.value, sentence, ctx, rules) : { ...rules, fell: out.refusal.code };
}
