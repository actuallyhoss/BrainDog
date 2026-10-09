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
import { alongside, listsOf as caseLists, modulesFor, payDayRow, useCase, USE_CASES, type UseCase } from '@braindog/seed/usecases';
import { claimedBy } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { arrangeTurns } from '../arrange.ts';
import { firstRun } from '../first-run.ts';
import { BUNDLED, closeOver, heardFor, INSTALL_ORDER, shape, toTurnOn, writable, type Offer, type PackId } from '../shape.ts';
import { hear, heardAt, PEOPLE, type Span } from '../who.ts';
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
  /**
   * Each phrase heard, in sentence order, and what it became, in the words the screen says. The name heard is the first
   * line, and it becomes "you" (`you`).
   */
  heard: HeardLine[];
  /**
   * What the record is called, from what was heard: the business first ("Mariam's Candles" from "I'm Mariam. I run a
   * small candle shop"), or `null`, and the sign-up chooses one (`recordNames`, `lib/signup.ts`).
   */
  title: string | null;
  /** Where things will be kept: Today first, then each list that will be made, with the phrase that turned it on. */
  places: Place[];
  /** What the person answered to the one question asked (`start/question.ts`). Absent until it is asked. */
  answers?: Answers;
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

/** One phrase heard. `at` is where it sits in the sentence as typed, so the screen can light the very words. */
export type HeardLine = {
  phrase: string;
  became: string;
  /** Start and end in the sentence as typed. Absent only on a line made by hand rather than read. */
  at?: Span;
  /** The person's own name, which becomes them: the first entry in People. */
  you?: true;
  /** An amount typed with no currency, said back and not kept until the currency is answered. */
  loose?: true;
};

/**
 * A place the record will have. `today` is Today, which every record opens on; `module` is a part such as Money, by
 * its pack id; `list` is a list a use case brings, such as a shop's Orders, by its list id. `phrase` and `at` are the
 * words that turned it on, or `null` for a part that comes because another one stands on it.
 */
export type Place = { kind: 'today' | 'module' | 'list'; id: string; name: string; phrase: string | null; at: Span | null };

/**
 * The answer to the one question (`start/question.ts`), kept on the proposal and written nowhere until the press:
 * where a shop's orders come in, the currency, and what to call the person.
 */
export type Answers = { arrivesBy?: ArrivesBy; currency?: string; name?: string };

/** Where a shop's orders come in: forwarded messages, a website or shop app, or in person. */
export type ArrivesBy = 'messages' | 'app' | 'in-person';

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

/* ── what was heard, as the screen draws it ─────────────────────────── */

/** What the name heard becomes: the person, the first entry in People. */
export const YOU = 'you';

/*
 * A TRADE AFTER "I RUN": "a small candle shop", "a bakery", "my pottery studio". Up to three words before the kind of
 * place, the fewest that fit, so "a shop and a studio" is the shop. A joining word is never one of them, so "a cat and
 * a store" is no trade, and never "Cat And As".
 */
const TRADE =
  /\b(?:I|we)\s+(?:run|own|have|started|opened|keep)\s+((?:a|an|my|our)\s+((?:(?!(?:a|an|and|or|the|of|my|our|in|at|for|with|to|but|plus|also)\s)[\p{L}'’-]+\s+){0,3}?)(shop|store|stall|bakery|caf[eé]|studio|salon|agency|restaurant|boutique|workshop|clinic|practice|business|company))(?![\p{L}\p{N}])/diu;
/* Words that say how big or where a place is, never what it is. */
const PLAIN = new Set(['small', 'little', 'tiny', 'local', 'online', 'new', 'big', 'family', 'own', 'independent', 'one-person', 'home', 'handmade', 'very', 'growing']);
/* What a shop sells that is not counted, so "a coffee shop" is Coffee and not Coffees. */
const UNCOUNTED = new Set(['coffee', 'tea', 'food', 'clothing', 'jewellery', 'jewelry', 'furniture', 'art', 'pottery', 'bread', 'wine', 'music', 'fashion', 'software', 'honey', 'stationery', 'hardware', 'produce', 'merchandise', 'cheese', 'vintage']);
/* The kinds of place that are the goods sold: the goods are its name. */
const SELLS = new Set(['shop', 'store', 'stall']);

const capital = (w: string): string => w.charAt(0).toLocaleUpperCase() + w.slice(1);
/** "candle" is Candles, "box" Boxes, "candy" Candies; a word already plural, or one never counted, stays. */
const plural = (w: string): string =>
  UNCOUNTED.has(w.toLowerCase()) || /s$/iu.test(w) ? w : /[^aeiou]y$/iu.test(w) ? `${w.slice(0, -1)}ies` : /(?:x|ch|sh)$/iu.test(w) ? `${w}es` : `${w}s`;

/**
 * WHAT THE RECORD IS CALLED, FROM WHAT WAS HEARD, the business first: a project the sentence named ("I run Kiln
 * Studio" is Kiln Studio), else the person's trade in their name ("I'm Mariam. I run a small candle shop" is Mariam's
 * Candles; "a bakery" is Mariam's Bakery). `null` where neither was heard, and the sign-up chooses a name
 * (`recordNames`). A trade with no name heard is not a name for a record: "a shop" is anybody's.
 */
export function titleOf(bio: string, name: string | null, rows: readonly { register: string; fields: Record<string, unknown> }[]): string | null {
  const others = new Set(rows.filter((r) => r.register !== 'things').map((r) => String(r.fields.name ?? '').toLowerCase()));
  const project = rows.find((r) => r.register === 'things' && typeof r.fields.name === 'string' && !others.has(r.fields.name.toLowerCase()));
  if (project) return String(project.fields.name);
  const m = name === null ? null : TRADE.exec(bio);
  if (!m || name === null) return null;
  const kind = (m[3] ?? '').toLowerCase();
  const what = (m[2] ?? '').trim().split(/\s+/u).filter((w) => w !== '' && !PLAIN.has(w.toLowerCase()));
  const whose = `${name.split(' ')[0]}'s`;
  if (SELLS.has(kind)) return what.length === 0 ? `${whose} ${capital(kind)}` : `${whose} ${[...what.slice(0, -1), plural(what.at(-1) ?? '')].map(capital).join(' ')}`;
  /* "A BUSINESS" ALONE SAYS NOTHING OF WHICH ONE, so it names nothing; "a design business" does. */
  if ((kind === 'business' || kind === 'company') && what.length === 0) return null;
  return `${whose} ${[...what, kind === 'cafe' ? 'café' : kind].map(capital).join(' ')}`;
}

/** The parts of what a phrase became: "People and Money" is People and Money. */
const partsOfBecame = (became: string): string[] => became.split(/,\s*|\s+and\s+/u).map((w) => w.trim());

/**
 * WHERE THINGS WILL BE KEPT: Today, which every record opens on; then the lists the use cases bring, in the order they
 * declare them; then each part, in the order the sentence turned it on, and last any part that comes only because
 * another stands on it. Each says the phrase that turned it on, read off the lines heard, so a model's reading and the
 * rules' are said the same way. A list the person renamed is said in their word. Nothing is counted: every place starts
 * empty, and the entries the words fill are said under them.
 */
export function placesOf(p: Pick<Proposal, 'usecase' | 'also' | 'modules' | 'heard' | 'names'>): Place[] {
  const lines = p.heard.filter((h) => h.loose !== true);
  const first = (match: (h: HeardLine) => boolean): HeardLine | null => lines.find(match) ?? null;
  const cases = [p.usecase, ...p.also].flatMap((id) => (id === null ? [] : (useCase(id) ?? [])));
  const caseLine = (u: UseCase): HeardLine | null => first((h) => h.became === u.title || partsOfBecame(h.became).includes(u.title));
  const place = (kind: Place['kind'], id: string, name: string, h: HeardLine | null): Place => ({ kind, id, name, phrase: h?.phrase ?? null, at: h?.at ?? null });

  const lists = cases.flatMap((u) =>
    caseLists(u).map((l) => {
      const name = p.names?.[l.id] ?? u.labels[l.id] ?? l.name;
      return place('list', l.id, name, first((h) => partsOfBecame(h.became).includes(name)) ?? caseLine(u));
    }),
  );
  const parts = p.modules.map((id) => {
    const own = id === AGENTS_PACK.manifest.id ? [] : listsOf(id);
    /* A PART IS SAID BY ITS ONE LIST (Portfolio is Projects), or by its name where its first list has it (People). */
    const lead = own.length === 1 || own[0]?.name === moduleName(id) ? own[0] : undefined;
    const name = (lead && p.names?.[lead.id]) ?? (lead ? lead.name : moduleName(id));
    const said = first((h) => (h.you === true && id === PEOPLE) || partsOfBecame(h.became).some((w) => w === moduleName(id) || w === name || w === lead?.name || w.startsWith(`${name} `)));
    const by = said ?? cases.filter((u) => u.modules.includes(id)).map(caseLine).find((h) => h !== null) ?? null;
    return place('module', id, name, by);
  });
  const order = (a: Place, b: Place): number => (a.at?.[0] ?? Number.MAX_SAFE_INTEGER) - (b.at?.[0] ?? Number.MAX_SAFE_INTEGER);
  return [place('today', 'today', 'Today', null), ...lists, ...parts.sort(order)];
}

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

  const where = heardAt(sentence);
  const heard: { at: number; line: HeardLine }[] = [];
  const line = (at: number, phrase: string, became: string, loose?: true): { at: number; line: HeardLine } => ({
    at,
    line: { phrase, became, at: where.bio(at, phrase.length), ...(loose ? { loose } : {}) },
  });
  const phrases = read.declined === null ? read.heard : [];
  /* A PHRASE THE USE CASE CLAIMS IS THE USE CASE'S, as it is for the modules (`modulesOf`): "a small candle shop" said
     to Shop is its Orders and Products, where the module lexicon heard Portfolio. */
  const claimed = u ? claimedBy(u, said) : () => false;
  for (const h of phrases)
    heard.push(line(h.at, h.text, h.loose ? firstRun.shapeNoCurrency : u && claimed(h) ? u.title : firstRun.and(h.packs.map(moduleName)), h.loose));
  /* A PHRASE THE USE CASE HEARD COUNTS AS HEARD, where no module's phrase already covers it: "homework" became Student. */
  const own = u ? (arranged.ranked.find((r) => r.usecase === u)?.why ?? []) : [];
  for (const w of own) if (u && !phrases.some((h) => overlaps(h, w))) heard.push(line(w.at, w.text, u.title));
  heard.sort((a, b) => a.at - b.at);
  /* THE TRADE IS LIT WHOLE: "shop" heard inside "a small candle shop" is said as the phrase the person wrote. */
  const trade = TRADE.exec(said)?.indices?.[1];
  if (trade) {
    const inside = heard.filter((h) => h.at >= trade[0] && h.at + h.line.phrase.length <= trade[1]);
    if (inside.length === 1 && inside[0]) Object.assign(inside[0], line(trade[0], said.slice(trade[0], trade[1]), inside[0].line.became));
  }
  /* THE NAME IS THE FIRST LINE, AND IT BECOMES THEM: the first entry in People. It always comes before the rest. */
  const lines: HeardLine[] = [
    ...(who.name !== null && where.name !== null ? [{ phrase: who.name, became: YOU, at: where.name, you: true as const }] : []),
    ...heard.filter((h) => h.line.became !== '').map((h) => h.line),
  ];

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

  const out = { name: who.name, usecase: u?.usecase ?? null, also: beside.map((b) => b.usecase), modules, heard: lines };
  return {
    ...out,
    currency: read.declined === null ? read.currency : null,
    rows,
    title: titleOf(said, who.name, rows),
    places: placesOf(out),
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

  /* EACH PHRASE IS LOOKED FOR IN THE SENTENCE AS TYPED, and lit where it was found; the name is not a phrase of the
     model's, it is the first line, which becomes them. */
  const nameAt = name === null ? -1 : at(sentence, name);
  const said = reply.heard
    .map((h) => ({ phrase: h.phrase.trim(), became: h.became.trim().slice(0, 80), at: at(sentence, h.phrase.trim()) }))
    .filter((h, i, all) => h.at >= 0 && h.became !== '' && h.at !== nameAt && all.findIndex((x) => x.at === h.at) === i)
    .sort((a, b) => a.at - b.at)
    .map(({ phrase, became, at: from }): HeardLine => ({ phrase: sentence.slice(from, from + phrase.length), became, at: [from, from + phrase.length] }));
  const you: HeardLine[] = name === null || nameAt < 0 ? [] : [{ phrase: sentence.slice(nameAt, nameAt + name.length), became: YOU, at: [nameAt, nameAt + name.length], you: true }];
  const theirs = said.length > 0 ? said : rules.heard.filter((h) => h.you !== true);
  /* AN AMOUNT THE RULES HEARD WITH NO CURRENCY IS STILL SAID, so the one question can ask for it (`question.ts`). */
  const loose = rules.heard.filter((h) => h.loose === true && h.at && !theirs.some((t) => t.at && h.at && t.at[0] < h.at[1] && h.at[0] < t.at[1]));
  const heard = [...you, ...[...theirs, ...loose].sort((a, b) => (a.at?.[0] ?? 0) - (b.at?.[0] ?? 0))];

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
  const kept = rows.length > 0 ? rows : rules.rows;
  const out = {
    name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    /* THE RULES' ENTRIES BRING THEIR LISTS, where they stand in for the model's: an entry for a module the model left off
       would be refused at the press, and dropping one would break the `party` the others point at by place. */
    modules: rows.length > 0 ? modules : closeOver([...modules, ...rules.rows.flatMap((r) => moduleOfList(r.register)?.id ?? [])], offers),
    heard,
    ...(Object.keys(names).length === 0 ? {} : { names }),
  };
  return {
    ...out,
    currency,
    rows: kept,
    title: titleOf(hear(sentence).bio, name, kept),
    places: placesOf(out),
    by: reply.by === '' || reply.by === 'rules' ? 'model' : reply.by,
    summary: summary === '' ? null : summary,
    draft: u === null && reply.draft !== null && reply.draft.trim() !== '' ? reply.draft.trim() : null,
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
