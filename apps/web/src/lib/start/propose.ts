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
import { BUNDLED, closeOver, heardFor, INSTALL_ORDER, PROJECTS, shape, toTurnOn, writable, type Offer, type PackId } from '../shape.ts';
import { hear, heardAt, PEOPLE, type Span } from '../who.ts';
import type { AskSetup, SetupOffer, SetupReply } from './ask.ts';
import type { ArrivesBy } from './made.ts';
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
  /**
   * The record's currency: the one typed in the sentence, else the device's (`ProposeContext.currency`) where a module
   * proposed keeps money, else `null`. Never guessed from a place named in the words or from a word like "pounds".
   */
  currency: string | null;
  /** `device` where `currency` is the device's and no word named it: any currency the person chose outranks it. */
  currencyBy?: 'device';
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
  /** Where else in the sentence the same thing was said, apart from `at`: a later phrase folded into this line (`fold`). */
  more?: Span[];
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

/** Where a shop's orders come in: forwarded messages, a website or shop app, or in person. One type, `made.ts`'s, which Today's next steps order by. */
export type { ArrivesBy };

/**
 * Where and how the sentence was typed: the person's time zone, for a day such as "on the 1st", and their language.
 * `catalogue` is any pack beyond the bundled modules the first run may offer, each with the words it is heard in (a
 * Kennel listing's manifest); absent, only the modules this build ships are listened for. `currency` is the device's,
 * the one currency of the region whose time it keeps (`zoneCurrency`, `routes/start/building.ts`), or `null`.
 */
export type ProposeContext = { zone: string | null; locale: string; catalogue?: readonly Offer[]; currency?: string | null };

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
  /* A USE CASE TAKEN BESIDE THE ONE PROPOSED CLAIMS ITS WORDS TOO: "a small shop" said by a student is the shop's Orders
     and Products, and asks for no Projects of its own. */
  const claims = (u ? [u, ...beside] : []).map((c) => claimedBy(c, said));
  const kept = u ? heardFor(read, (span) => claims.some((claimed) => claimed(span))) : read;
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
  const others = new Set(rows.filter((r) => r.register !== PROJECTS).map((r) => String(r.fields.name ?? '').toLowerCase()));
  const project = rows.find((r) => r.register === PROJECTS && typeof r.fields.name === 'string' && !others.has(r.fields.name.toLowerCase()));
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

/* ── what a phrase reads as ─────────────────────────────────────────── */

/** The words a phrase reads as that no list declares: a freelancer's People are their Clients, what they bill Invoices. */
export const heardWords = {
  /** The currency the record will keep, said after the part that keeps money where the words named none. */
  inCurrency: (code: string) => `in ${code}`,
  clients: 'Clients',
  invoices: 'Invoices',
};

/* The words that join two things, never the last word of a phrase: "a designer and" is "a designer". */
const JOIN = '(?:a|an|and|or|the|of|my|our|in|at|for|with|to|but|plus|also)';

/**
 * PHRASES LIT WHOLE, as the person wrote them, where the reader heard one word inside: "shop" in "a small candle shop",
 * "freelance" in "freelance as a designer", "owes" in "who owes me". `group` is the part of the match that is lit.
 * `reads`, where given, is what the phrase becomes once every module it `needs` is proposed, with the lists it renames:
 * a freelancer's People are their Clients, and what they bill is Invoices, not a list of their own (planner-49's call).
 */
type Whole = { re: RegExp; group: number; reads?: { needs: readonly PackId[]; became: readonly string[]; names: Readonly<Record<string, string>> } };
const WHOLE: readonly Whole[] = [
  { re: TRADE, group: 1 },
  {
    re: new RegExp(`\\bfreelanc(?:e|er|ing)(?:\\s+as\\s+(?:a|an)\\s+(?:(?!${JOIN}\\s)[\\p{L}'’-]+\\s+)?(?!${JOIN}(?![\\p{L}]))[\\p{L}'’-]+)?(?![\\p{L}\\p{N}])`, 'diu'),
    group: 0,
    /* THE MODULES THAT SAY THEY ARE FOR A FREELANCER, off their own signals (`BUNDLED`), never named here: People for the
       clients and the one that keeps invoices. */
    reads: { needs: BUNDLED.filter((o) => (o.signals ?? []).includes('freelance')).map((o) => o.id), became: [heardWords.clients, heardWords.invoices], names: { [PEOPLE]: heardWords.clients } },
  },
  { re: /\b(?:(?:who|what)\s+(?:still\s+)?)?owes?\s+(?:me|us)(?![\p{L}\p{N}])/diu, group: 0 },
];

/* ── what the person said they do not have ──────────────────────────── */

/*
 * A THING SAID NOT TO BE HAD: "no orders", "not a shop", "without invoices", "I don't take orders", "I never had
 * orders", "I no longer take any orders", "I haven't got invoices". The word of refusal comes before the phrase, with at
 * most five small words between, and then only words that say how big a place is (`PLAIN`), so "no late orders" and
 * "I don't want to lose my orders" are still orders.
 *
 * THE SMALL WORDS ARE THE ORDINARY VERBS OF HAVING AND DOING A THING (`DOES`), so a refusal is read through them: "I do
 * not want to track taxes", "I never send invoices", "I don't want to keep track of orders", "I don't need to chase
 * invoices". A verb that is not one of them keeps the thing, since losing an order is not having none.
 *
 * A VERB IS READ IN ITS "-ING" TOO (`DOING`), since a stranger says what they stopped as often as what they do not do:
 * "no more tracking of orders", "no more chasing invoices", "no need of orders". And a word of having stopped
 * (`STOPPED`) refuses only straight before one of those, "I am done taking orders", so "I have done orders for years"
 * and "done for today, I take orders" keep theirs. It is no word of refusal on its own and opens no name.
 *
 * AND IT REFUSES ONLY A THING THAT ENDS THE CLAUSE (`ENDS`): the end of what was said, a mark, a join, or a word of when
 * ("last year", "for good"). Words after the thing say how it was done, so "I stopped keeping orders on paper and now
 * track them here" keeps its orders. Stopping that is itself denied (`UNDENIED`) is no stopping: "I never stopped
 * taking orders", "I am not done taking orders", "I won't quit taking orders".
 */
const REFUSES = "no|not|never|without|zero|don['’]?t|do\\s+not|doesn['’]?t|does\\s+not|haven['’]?t|hasn['’]?t|hadn['’]?t";
/* `send` and its ending apart: the whole word is a field an add-on declares, and the core spells none (the core-names gate). */
const DOING = `tracking(?:\\s+of)?|taking|send${'ing'}|chasing|using|keeping|selling`;
const DOES = `to|have|take|get|do|sell|keep|need(?:\\s+of)?|want|track(?:\\s+of)?|run|own|send|use|chase|${DOING}`;
/* The words that deny a stopping: those of refusal, and the ones only a verb takes. At most three words between, none
   of them a join or somebody new, so "I won't ever have to quit" is denied and "No, I'm done" and "no staff so I quit" are not. */
const DENIES = `${REFUSES}|didn['’]?t|did\\s+not|won['’]?t|will\\s+not|can['’]?t|cannot|wouldn['’]?t|isn['’]?t|aren['’]?t|wasn['’]?t`;
const UNDENIED = `(?<!(?:^|[^\\p{L}\\p{N}'’])(?:${DENIES})\\s+(?:(?!(?:(?:i|we|you|they|he|she|it)(?:['’]\\p{L}+)?|and|or|nor|but|so|because|since|then|now)(?![\\p{L}\\p{N}'’]))[\\p{L}'’]+\\s+){0,3})`;
const HALTED = `${UNDENIED}(?:done|finished|stopped|quit)(?:\\s+with)?`;
const STOPPED = `${HALTED}(?=\\s+(?:${DOING})\\s)`;
const NOT = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${REFUSES})\\s+(?:(?:any|more|longer|ever|had|got|${DOES}|a|an|the)\\s+){0,5}(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
const NOT_STOPPED = new RegExp(`(?:^|[^\\p{L}\\p{N}])${STOPPED}\\s+(?:(?:any|more|longer|ever|had|got|${DOES}|a|an|the)\\s+){0,5}(?:(?:${[...PLAIN].join('|')})\\s+)*$`, 'iu');
/* The thing heard can be the verb itself: "I am done selling" is no shop, as "no more selling" already is none. */
const STOPPED_BEFORE = new RegExp(`(?:^|[^\\p{L}\\p{N}])${HALTED}\\s+$`, 'iu');
const IS_DOING = new RegExp(`^(?:${DOING})(?![\\p{L}\\p{N}])`, 'iu');
/* What may follow a thing somebody stopped: nothing, a mark of any kind, a join, with at most a word of when before it. */
const SPAN = 'years?|months?|weeks?|days?';
const MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december';
const WHEN = [
  'anymore|any\\s+more|any\\s+longer|altogether|entirely|completely|at\\s+all|too|either|as\\s+well',
  'for\\s+good|for\\s+now|now|already|today|yesterday|recently|lately',
  '(?:last|this)\\s+(?:year|month|week|spring|summer|autumn|fall|winter)',
  `(?:back\\s+)?in\\s+(?:\\d{4}|${MONTH})`,
  `(?:(?:a\\s+)?(?:few|couple\\s+of|long)\\s+|[\\p{L}\\p{N}]+\\s+)?(?:${SPAN}|while|time)\\s+ago`,
].join('|');
const CLAUSE_END = `(?:\\s+(?:${WHEN}))?\\s*(?:$|[^\\p{L}\\p{N}\\s]|(?:and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}]))`;
const ENDS = new RegExp(`^${CLAUSE_END}`, 'iu');
/* After the verb itself, what was sold or kept comes first: "done selling candles", never "selling candles on paper". */
/* A thing joined straight on with "and", "or" or "nor": the run ends where its last thing does. */
const RUN_ON = /^\s+(?:and|or|nor)\s+(?:(?:any|a|an|the|my|our)\s+)?/iu;
const ENDS_DOING = new RegExp(`^(?:\\s+(?!(?:on|in|by|from|at|with|via|over|through|to|for|into|and|or|nor|but)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'’-]+){0,3}${CLAUSE_END}`, 'iu');
/* A name never opens with a word of refusal: "Don't need orders, I freelance" names nobody (`who`). */
const OPENS_REFUSING = new RegExp(`^(?:${REFUSES})(?![\\p{L}\\p{N}'’])`, 'iu');

type Said = { at: number; text: string };
type Refusal = 'refused' | 'stopped' | null;

/*
 * WHAT JOINS THE NEXT THING TO THE ONE BEFORE: a comma, "and", "or", "nor", then at most a small word and words of size.
 * `AND_OR` is the "and" or "or" a run of commas ends in, looked for after a thing that follows a bare comma. The third
 * group is the verbs of having and doing said after the join ("or take orders"), which only "or" and "nor" carry past.
 */
const JOINED = new RegExp(
  `(?:\\s*,\\s*(?:(and|or|nor)\\s+)?|\\s+(and|or|nor)\\s+)((?:(?:${DOES})\\s+){1,4})?(?:(?:any|a|an|the|my|our)\\s+)?(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
const AND_OR = /^(?:\s*,\s*(?!(?:and|or|nor)\s)[\p{L}\p{N}'’-]+(?:\s+(?!(?:and|or|nor)\s)[\p{L}\p{N}'’-]+){0,2})*\s*,?\s*(and|or|nor)\s/iu;
/* More than one of a thing, as far as its last letters say: "invoices" and "taxes", never "business". */
const MANY = /[\p{L}]s$/iu;

/**
 * WHETHER A PHRASE WAS REFUSED where it sits in what was said: "freelance designer, no orders" offered Orders and
 * Products, because the word was heard and the "no" before it was not. A phrase lit whole (`WHOLE`) is refused from
 * where the whole of it starts, so "I don't run a small shop" refuses the shop.
 *
 * THE REFUSAL IS CARRIED TO WHAT IS JOINED STRAIGHT ON: "no orders or invoices" is no Invoices either, and so is every
 * thing in "no orders, invoices or products". "or" always carries. "and" carries to a thing there is more than one of,
 * so "I don't take orders and invoices" refuses both and "not a shop and freelance as a designer" keeps the
 * freelancing. A bare comma carries only inside a run that ends in "and" or "or", read as that word, so "no shop,
 * freelance designer" keeps the designer. Words between ("no orders, I send invoices") end the carry, but for a verb of
 * having or doing after "or" or "nor": "I never send invoices or take orders" refuses both, and "no invoices and take
 * orders" keeps the orders, since "and" there starts what the person does do. `known` is every phrase heard, so the
 * thing before the join is found whole ("no study sessions or courses").
 */
function refusedIn(said: string, known: readonly Said[] = []): (span: Said) => boolean {
  const wholes = WHOLE.flatMap((w) => {
    const span = w.re.exec(said)?.indices?.[w.group];
    return span ? [span] : [];
  });
  const whole = (at: number, to: number): [number, number] => wholes.find(([a, b]) => at >= a && to <= b) ?? [at, to];
  /* Whether a thing ends its clause. In "stopped keeping orders and invoices on paper" the run ends at "invoices", which does not. */
  const ends = (to: number): boolean => {
    const after = said.slice(to);
    if (!ENDS.test(after)) return false;
    const next = to + (RUN_ON.exec(after)?.[0].length ?? 0);
    const joined = next > to ? known.find((k) => k.at === next) : undefined;
    return joined ? ends(joined.at + joined.text.length) : true;
  };
  /* How a thing was refused: by a word of refusal, or by a word of having stopped, which holds only at a clause's end. */
  const not = (from: number, to: number): Refusal => {
    const before = said.slice(0, from);
    if (NOT.test(before)) return 'refused';
    /* A word of size is said before its thing ("done selling handmade candles"), so it ends as the verb does. */
    if (NOT_STOPPED.test(before)) return (PLAIN.has(said.slice(from, to).toLowerCase()) ? ENDS_DOING.test(said.slice(to)) : ends(to)) ? 'stopped' : null;
    const doing = STOPPED_BEFORE.test(before) ? IS_DOING.exec(said.slice(from)) : null;
    return doing && ENDS_DOING.test(said.slice(from + doing[0].length)) ? 'stopped' : null;
  };
  const refused = (from: number, to: number): Refusal => {
    const own = not(from, to);
    if (own) return own;
    const before = said.slice(0, from);
    const join = JOINED.exec(before);
    if (!join) return null;
    let word = (join[1] ?? join[2])?.toLowerCase();
    if (word === undefined) {
      word = AND_OR.exec(said.slice(to))?.[1]?.toLowerCase();
      if (word === undefined) return null;
    }
    if (word === 'and' && (join[3] !== undefined || !MANY.test(said.slice(from, to)) || /ss$/iu.test(said.slice(from, to)))) return null;
    /* THE THING BEFORE THE JOIN: a phrase heard that ends there, or failing one the single word that does. */
    const end = join.index;
    const last = /[\p{L}\p{N}'’-]+$/u.exec(before.slice(0, end));
    const starts = new Set(known.filter((k) => k.at + k.text.length === end).map((k) => k.at));
    if (last) starts.add(last.index);
    const carried = [...starts].flatMap((at) => (at < from ? [refused(whole(at, end)[0], end)] : []));
    if (carried.includes('refused')) return 'refused';
    /* A stopping carried to a thing joined on holds the same rule: that thing ends the clause too. */
    return carried.includes('stopped') && ENDS.test(said.slice(to)) ? 'stopped' : null;
  };
  return (span) => {
    const [from, to] = whole(span.at, span.at + span.text.length);
    return (not(span.at, to) ?? refused(from, to)) !== null;
  };
}

/**
 * WHO THE SENTENCE NAMES, and the rest of it. `who.ts` reads the words before a first comma as a name, and "Don't need
 * orders, I freelance as a designer" names nobody: words that open with a refusal are read with the rest, so the orders
 * are refused and nobody is called "Don't need orders". `shift` is how far the rest then starts before where `who.ts`
 * says it does (`heardAt`), and 0 for every other sentence.
 */
function who(sentence: string): { name: string | null; bio: string; shift: number } {
  const h = hear(sentence);
  if (h.name === null || !OPENS_REFUSING.test(h.name)) return { ...h, shift: 0 };
  const line = sentence.replace(/\s+/gu, ' ').trim();
  return { name: null, bio: line, shift: h.bio.length - line.length };
}

/** The reading with every refused phrase taken out, and each module left with no phrase behind it gone with them. */
function unrefused(read: ReturnType<typeof shape>, no: (span: Said) => boolean): ReturnType<typeof shape> {
  if (read.declined !== null || !read.heard.some((h) => h.loose !== true && no(h))) return read;
  const packs = read.packs.flatMap((p) => {
    const why = p.why.filter((w) => !no(w));
    /* A MODULE WITH NO PHRASE OF ITS OWN was there for another to stand on, and `closeOver` brings it back if one still does. */
    return why.length === 0 ? [] : [{ ...p, why }];
  });
  return { ...read, heard: read.heard.filter((h) => h.loose === true || !no(h)), packs };
}

/** The use cases ranked again without the phrases refused: one heard only in "no orders" is not proposed, nor taken beside. */
function unrefusedCases<A extends ReturnType<typeof arrangeTurns>>(a: A, no: (span: Said) => boolean): A {
  if (!a.ranked.some((r) => r.why.some(no))) return a;
  const length = (why: readonly Said[]): number => why.reduce((n, w) => n + w.text.length, 0);
  const ranked = a.ranked
    .map((r) => ({ ...r, why: r.why.filter((w) => !no(w)) }))
    .map((r) => ({ ...r, score: r.why.length }))
    .sort((x, y) => y.score - x.score || length(y.why) - length(x.why));
  const top = ranked[0];
  return { ...a, pick: top && top.score > 0 ? top.usecase : null, ranked };
}

/**
 * EVERY WORD A LINE MAY SAY A USE CASE IN: its title, then the names of the lists it brings, in the person's word where
 * they renamed one. A line that says any of them is the use case's (`placesOf`, and `amend` in `lib/first-run.ts`).
 */
export const caseWords = (u: UseCase, names?: Readonly<Record<string, string>>): string[] => [u.title, ...caseLists(u).map((l) => names?.[l.id] ?? u.labels[l.id] ?? l.name)];

/**
 * WHAT A PHRASE A USE CASE HEARD READS AS: the one of its lists the phrase names ("orders" is Orders), else every list
 * it brings ("a small candle shop" is Orders and Products), and the use case's own title only where it brings none.
 */
export function caseBecame(u: UseCase, phrase: string): string {
  const lists = caseWords(u).slice(1);
  if (lists.length === 0) return u.title;
  const word = phrase.trim().toLocaleLowerCase();
  return lists.find((n) => [word, plural(word)].includes(n.toLocaleLowerCase())) ?? firstRun.and(lists);
}

/** The one list a part is said by: its only list (Portfolio's Projects), or its first where that has the part's name (People). */
const leadOf = (id: string): ReturnType<typeof listsOf>[number] | undefined => {
  const own = id === AGENTS_PACK.manifest.id ? [] : listsOf(id);
  return own.length === 1 || own[0]?.name === moduleName(id) ? own[0] : undefined;
};

/**
 * WHAT A PART IS CALLED TO THE PERSON: the list they will open, in their own word where they renamed it, and the part's
 * name only where it keeps several (Money). A line read "a small shop became Portfolio", which is the name of a pack and
 * of nothing on the rail; the place it makes is Projects, so the line says Projects.
 */
export const partName = (id: string, names?: Readonly<Record<string, string>>): string => {
  const lead = leadOf(id);
  return (lead && names?.[lead.id]) ?? lead?.name ?? moduleName(id);
};

/** A module keeps money where one of its lists holds no entry without an amount: Money's bills and its ledger. */
const keepsMoney = (id: string): boolean => listsOf(id).some((l) => l.fields.some((f) => f.type === 'money' && f.required));

/**
 * THE RECORD'S CURRENCY: the one typed, else the device's (`ProposeContext.currency`) where a module proposed keeps
 * money, so a shop in Alexandria keeps EGP without a question. `null` where neither gives one, and `null` too where an
 * amount was typed with none (`loose`): that amount is in a currency only the person knows, so the one question asks
 * it, with the device's suggested (`question.ts`), rather than the device's being said beside an amount not kept.
 */
export function currencyFor(typed: string | null, modules: readonly string[], ctx: Pick<ProposeContext, 'currency'>, loose = false): string | null {
  if (typed !== null) return typed;
  const device = ctx.currency?.trim().toUpperCase() ?? '';
  return !loose && device !== '' && knownCurrency(device) && modules.some(keepsMoney) ? device : null;
}

/* What may sit between two phrases said in one breath: "who owes me, and taxes", "orders and my invoices". */
const BETWEEN = /^[\s,;]*(?:(?:and|or|plus|also)\s+)?(?:(?:my|our|the)\s+)?$/iu;

/**
 * ONE LINE FOR ONE THING: a later phrase that became exactly what an earlier one did is folded into it, so "who owes me"
 * and "taxes" are not two lines that both say Money. Said side by side they are one phrase, lit as she typed it ("who
 * owes me, and taxes"); said apart, the first line keeps its words and remembers where the other sits (`more`). The name
 * and an amount with no currency are never folded: each is its own line.
 */
export function fold(lines: readonly HeardLine[], sentence: string): HeardLine[] {
  const out: HeardLine[] = [];
  for (const h of lines) {
    const own = h.you === true || h.loose === true;
    const i = own ? -1 : out.findIndex((o) => o.you !== true && o.loose !== true && o.became === h.became);
    const first = out[i];
    if (first === undefined) out.push(h);
    else if (first.at === undefined || h.at === undefined) continue;
    else if (i === out.length - 1 && first.more === undefined && BETWEEN.test(sentence.slice(first.at[1], h.at[0])))
      out[i] = { ...first, phrase: sentence.slice(first.at[0], h.at[1]), at: [first.at[0], h.at[1]] };
    else out[i] = { ...first, more: [...(first.more ?? []), h.at] };
  }
  return out;
}

/**
 * A CURRENCY THE WORDS DID NOT NAME IS SAID, after the first line that became a part keeping money ("Money, in EGP"),
 * else after a freelancer's Invoices, so the person sees what was taken from their device and can change it.
 */
function sayCurrency(heard: readonly HeardLine[], modules: readonly string[], code: string | null): HeardLine[] {
  const money = modules.filter(keepsMoney).flatMap((id) => [partName(id), moduleName(id)]);
  const lineOf = (says: readonly string[]): number => heard.findIndex((h) => h.loose !== true && h.you !== true && partsOfBecame(h.became).some((w) => says.includes(w)));
  const i = code === null ? -1 : lineOf(money) >= 0 ? lineOf(money) : lineOf([heardWords.invoices]);
  return heard.map((h, j) => (j === i && code !== null ? { ...h, became: `${h.became}, ${heardWords.inCurrency(code)}` } : h));
}

/**
 * WHERE THINGS WILL BE KEPT: Today, which every record opens on; then the lists the use cases bring, in the order they
 * declare them; then each part, in the order the sentence turned it on. Each says the phrase that turned it on, read
 * off the lines heard, so a model's reading and the rules' are said the same way. A list the person renamed is said in
 * their word. Nothing is counted: every place starts empty, and the entries the words fill are said under them.
 *
 * A PART THAT COMES ONLY BECAUSE ANOTHER STANDS ON IT, with no phrase behind it, is not listed (planner-49's call): Money
 * brings Projects for what it links to, and a candle shop that said nothing of projects is not shown an empty one. It
 * is still installed, since the part that stands on it cannot go in without it.
 */
export function placesOf(p: Pick<Proposal, 'usecase' | 'also' | 'modules' | 'heard' | 'names'>): Place[] {
  const lines = p.heard.filter((h) => h.loose !== true);
  const first = (match: (h: HeardLine) => boolean): HeardLine | null => lines.find(match) ?? null;
  const cases = [p.usecase, ...p.also].flatMap((id) => (id === null ? [] : (useCase(id) ?? [])));
  /* A USE CASE'S PHRASE IS SAID AS ITS LISTS (`caseBecame`), or as its title where it brings none. */
  const caseLine = (u: UseCase): HeardLine | null => {
    const own = caseWords(u, p.names);
    return first((h) => partsOfBecame(h.became).some((w) => own.includes(w)));
  };
  const place = (kind: Place['kind'], id: string, name: string, h: HeardLine | null): Place => ({ kind, id, name, phrase: h?.phrase ?? null, at: h?.at ?? null });

  const lists = cases.flatMap((u) =>
    caseLists(u).map((l) => {
      const name = p.names?.[l.id] ?? u.labels[l.id] ?? l.name;
      return place('list', l.id, name, first((h) => partsOfBecame(h.became).includes(name)) ?? caseLine(u));
    }),
  );
  const parts = p.modules.map((id) => {
    /* A PART IS SAID BY ITS ONE LIST (Portfolio is Projects), or by its name where its first list has it (People). */
    const lead = leadOf(id);
    const name = partName(id, p.names);
    const said = first((h) => (h.you === true && id === PEOPLE) || partsOfBecame(h.became).some((w) => w === moduleName(id) || w === name || w === lead?.name || w.startsWith(`${name} `)));
    const by = said ?? cases.filter((u) => u.modules.includes(id)).map(caseLine).find((h) => h !== null) ?? null;
    return place('module', id, name, by);
  });
  const leaned = new Set(p.modules.flatMap((id) => closeOver([id]).filter((on) => on !== id)));
  const shown = parts.filter((x) => x.phrase !== null || !leaned.has(x.id));
  const order = (a: Place, b: Place): number => (a.at?.[0] ?? Number.MAX_SAFE_INTEGER) - (b.at?.[0] ?? Number.MAX_SAFE_INTEGER);
  return [place('today', 'today', 'Today', null), ...lists, ...shown.sort(order)];
}

/** What one sentence proposes. `ctx.locale` is carried for the catalogue's reading; these rules read English. */
export function propose(sentence: string, ctx: ProposeContext): Proposal {
  const name = who(sentence);
  /* THE REST OF THE SENTENCE IS READ WITHOUT THE NAME, so "Kiln, I run a studio" is not a project called Kiln. */
  const said = name.bio;
  const today = todayIn(ctx.zone);
  /* THE CATALOGUE'S SIGNALS: the bundled modules' own, and those of any other pack the caller can offer. */
  const offers = [...BUNDLED, ...(ctx.catalogue ?? []).filter((o) => !BUNDLED.some((b) => b.id === o.id))];
  /* WHAT THE PERSON SAID THEY DO NOT HAVE IS NOT HEARD, by the modules or by the use cases: "no orders" is no Orders. */
  const all = shape(said, today ?? undefined, offers);
  const turns = arrangeTurns(null, said);
  const no = refusedIn(said, [...all.heard, ...all.packs.flatMap((p) => p.why), ...turns.ranked.flatMap((r) => r.why)]);
  const read = unrefused(all, no);
  const arranged = unrefusedCases(turns, no);
  const u = read.declined === 'language' ? null : arranged.pick;
  const beside = u ? alongside(arranged, u) : [];
  const modules = modulesOf(read, said, name.name !== null, u, beside, offers);

  const where = heardAt(sentence);
  const heard: { at: number; line: HeardLine }[] = [];
  const line = (at: number, phrase: string, became: string, loose?: true): { at: number; line: HeardLine } => ({
    at,
    line: { phrase, became, at: where.bio(at + name.shift, phrase.length), ...(loose ? { loose } : {}) },
  });
  const phrases = read.declined === null ? read.heard : [];
  /* A PHRASE THE USE CASE CLAIMS IS THE USE CASE'S, as it is for the modules (`modulesOf`), and it is said as the lists
     the use case brings (`caseBecame`): "a small candle shop" said to Shop is its Orders and Products, where the module
     lexicon heard Projects. A PART IS SAID BY THE NAME ITS PLACE HAS (`partName`), never by its pack's. */
  /* THE USE CASES TAKEN BESIDE IT CLAIM THEIR WORDS THE SAME WAY, the one proposed first: a student who runs a small shop
     reads "a small shop" as Orders and Products, and those two places then say the words that turned them on. */
  const cases = (u ? [u, ...beside] : []).map((c) => ({ c, claimed: claimedBy(c, said), why: arranged.ranked.find((r) => r.usecase === c)?.why ?? [] }));
  for (const h of phrases) {
    const whose = h.loose ? undefined : cases.find((x) => x.claimed(h))?.c;
    heard.push(line(h.at, h.text, h.loose ? firstRun.shapeNoCurrency : whose ? caseBecame(whose, h.text) : firstRun.and(h.packs.map((id) => partName(id))), h.loose));
  }
  /* A PHRASE A USE CASE HEARD COUNTS AS HEARD, where no phrase already said covers it: "orders" became Orders. */
  for (const { c, why } of cases) for (const w of why) if (!heard.some((h) => overlaps({ at: h.at, text: h.line.phrase }, w))) heard.push(line(w.at, w.text, caseBecame(c, w.text)));
  heard.sort((a, b) => a.at - b.at);
  /* A PHRASE IS LIT WHOLE (`WHOLE`): "shop" heard inside "a small candle shop" is said as the phrase the person wrote,
     and "freelance" inside "freelance as a designer" as their Clients and Invoices, People then called Clients. */
  const names: Record<string, string> = {};
  for (const w of WHOLE) {
    const span = w.re.exec(said)?.indices?.[w.group];
    const inside = span ? heard.filter((h) => h.at >= span[0] && h.at + h.line.phrase.length <= span[1]) : [];
    const one = inside.length === 1 ? inside[0] : undefined;
    if (!span || !one || one.line.loose === true) continue;
    const reads = w.reads && w.reads.needs.every((id) => modules.includes(id)) ? w.reads : null;
    Object.assign(one, line(span[0], said.slice(span[0], span[1]), reads ? firstRun.and(reads.became) : one.line.became));
    if (reads) Object.assign(names, reads.names);
  }
  /* THE NAME IS THE FIRST LINE, AND IT BECOMES THEM: the first entry in People. It always comes before the rest. */
  const lines: HeardLine[] = [
    ...(name.name !== null && where.name !== null ? [{ phrase: name.name, became: YOU, at: where.name, you: true as const }] : []),
    /* TWO PHRASES THAT BECAME THE SAME THING ARE ONE LINE (`fold`), before the currency is said on it. */
    ...fold(heard.filter((h) => h.line.became !== '').map((h) => h.line), sentence),
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

  /* THE DEVICE'S CURRENCY WHERE NONE WAS TYPED, said on the line that became Money (`sayCurrency`). */
  const typed = read.declined === null ? read.currency : null;
  const currency = currencyFor(typed, modules, ctx, lines.some((h) => h.loose === true));
  const out = {
    name: name.name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    modules,
    heard: typed === null ? sayCurrency(lines, modules, currency) : lines,
    ...(Object.keys(names).length === 0 ? {} : { names }),
  };
  return {
    ...out,
    currency,
    ...(typed === null && currency !== null ? { currencyBy: 'device' as const } : {}),
    rows,
    title: titleOf(said, name.name, rows),
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
  const name = reply.name !== null && reply.name.length <= 60 && at(sentence, reply.name) >= 0 && !OPENS_REFUSING.test(reply.name.trim()) ? reply.name : rules.name;
  const asked = reply.modules.filter((id) => known.has(id));
  /* AN ANSWER THAT CHOSE NOTHING AND DRAFTED NOTHING IS NO READING: the rules' stands, and where they read nothing either
     the words are the brief Slash drafts from (`outsideCatalogue`), as before there was a model. */
  if (u === null && asked.length === 0 && (reply.draft ?? '').trim() === '') return { ...rules, fell: 'PROPOSAL_EMPTY' };
  const named = name !== null && !asked.includes(PEOPLE) ? [...asked, PEOPLE] : asked;
  const modules = closeOver(u ? [...modulesFor(u, named), ...beside.flatMap((b) => b.modules)] : named, offers);

  /* THE RULES' CURRENCY WAS TYPED where it is not the device's; the device's is weighed again over the model's modules. */
  const ruled = rules.currencyBy === 'device' ? null : rules.currency;
  const code = reply.currency?.toUpperCase() ?? null;
  const typed = code !== null && knownCurrency(code) && (ruled === code || new RegExp(`(^|[^A-Za-z])${code}([^A-Za-z]|$)`, 'iu').test(sentence));

  /* EACH PHRASE IS LOOKED FOR IN THE SENTENCE AS TYPED, and lit where it was found; the name is not a phrase of the
     model's, it is the first line, which becomes them. */
  const nameAt = name === null ? -1 : at(sentence, name);
  const found = reply.heard.map((h) => ({ phrase: h.phrase.trim(), became: h.became.trim().slice(0, 80), at: at(sentence, h.phrase.trim()) })).filter((h) => h.at >= 0);
  /* A PHRASE THE PERSON REFUSED IS NEVER SAID AS HEARD, whoever read it: "orders" in "I don't take orders" is not a
     line that became Orders. The same reading the rules give (`refusedIn`), over the sentence as typed. */
  const no = refusedIn(sentence, found.map((h) => ({ at: h.at, text: h.phrase })));
  const said = found
    .filter((h, i, all) => h.became !== '' && h.at !== nameAt && all.findIndex((x) => x.at === h.at) === i && !no({ at: h.at, text: h.phrase }))
    .sort((a, b) => a.at - b.at)
    .map(({ phrase, became, at: from }): HeardLine => ({ phrase: sentence.slice(from, from + phrase.length), became, at: [from, from + phrase.length] }));
  const you: HeardLine[] = name === null || nameAt < 0 ? [] : [{ phrase: sentence.slice(nameAt, nameAt + name.length), became: YOU, at: [nameAt, nameAt + name.length], you: true }];
  /* THE RULES' LINES STAND IN WITHOUT THE CURRENCY THEY SAID, which is said again below over the model's modules. */
  const unsaid = rules.currencyBy !== 'device' || rules.currency === null ? '' : `, ${heardWords.inCurrency(rules.currency)}`;
  const theirs = said.length > 0 ? said : rules.heard.filter((h) => h.you !== true).map((h) => (unsaid !== '' && h.became.endsWith(unsaid) ? { ...h, became: h.became.slice(0, -unsaid.length) } : h));
  /* AN AMOUNT THE RULES HEARD WITH NO CURRENCY IS STILL SAID, so the one question can ask for it (`question.ts`). */
  const loose = rules.heard.filter((h) => h.loose === true && h.at && !theirs.some((t) => t.at && h.at && t.at[0] < h.at[1] && h.at[0] < t.at[1]));
  const lines = [...you, ...fold([...theirs, ...loose].sort((a, b) => (a.at?.[0] ?? 0) - (b.at?.[0] ?? 0)), sentence)];
  const currency = currencyFor(typed ? code : ruled, modules, ctx, lines.some((h) => h.loose === true));
  const heard = typed || ruled !== null ? lines : sayCurrency(lines, modules, currency);

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
    /* THE RULES' NAMES COME WITH THE RULES' LINES, so "freelance as a designer" still reads Clients where it stands in. */
    ...(Object.keys(names).length > 0 ? { names } : said.length === 0 && rules.names ? { names: rules.names } : {}),
  };
  return {
    ...out,
    currency,
    ...(!typed && ruled === null && currency !== null ? { currencyBy: 'device' as const } : {}),
    rows: kept,
    title: titleOf(who(sentence).bio, name, kept),
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
