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

import { CORE_PACK, MODULE_WORDS } from '@braindog/declare';
import { AGENTS_PACK } from '@braindog/seed/packs';
import { moduleOfList } from '@braindog/seed/packs/modules';
import { alongside, listsOf as caseLists, modulesFor, pagesOf, payDayRow, useCase, USE_CASES, type UseCase } from '@braindog/seed/usecases';
import { claimedBy } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { arrangeTurns } from '../arrange.ts';
import { askOf, type ModelAsk } from '../signup.ts';
import { firstRun } from '../first-run.ts';
import { BUNDLED, closeOver, heardFor, PROJECTS, shape, toTurnOn, writable, type Offer, type PackId } from '../shape.ts';
import { hear, heardAt, PEOPLE, type Span } from '../who.ts';
import type { AskSetup, SetupOffer, SetupReply } from './ask.ts';
import { offerOf } from './offer.ts';
import { currencyWord, placeCurrency } from './place-currency.ts';
import type { ArrivesBy } from './made.ts';
import { entryOf, knownCurrency, listById, listsOf } from './lists.ts';

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
  /** The one question the model's reading carried (`askOf`), for the page to ask; absent where the rules read it. */
  ask?: ModelAsk | null;
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
export type ProposeContext = {
  zone: string | null;
  locale: string;
  catalogue?: readonly Offer[];
  currency?: string | null;
  /** What the model may choose from (`offerOf` in `./offer.ts`, with the catalogue's use cases); absent, this build's own. */
  offer?: SetupOffer;
};

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
 * THE LIST A USE CASE KEEPS ITS ORDERS IN, read off its declarations and never by a name: one with somebody in People
 * it is for, how many, and the day it is due. `null` for a use case that takes no orders.
 */
function ordersOf(u: UseCase): { id: string; name: string } | null {
  for (const d of (u.pack?.declarations ?? []) as Record<string, unknown>[]) {
    if (typeof d.register !== 'string' || !Array.isArray(d.fields)) continue;
    const f = d.fields as { type?: unknown; deadline?: unknown; to?: unknown }[];
    if (f.some((x) => x.type === 'day' && x.deadline === true) && f.some((x) => x.type === 'ref' && x.to === PEOPLE) && f.some((x) => x.type === 'int'))
      return { id: d.register, name: u.labels[d.register] ?? (typeof d.name === 'string' ? d.name : d.register) };
  }
  return null;
}

/**
 * WHAT A USE CASE CLAIMS OF A SENTENCE (`claimedBy`), and for one that takes orders the person's own trade too (audit C,
 * X1): "I run a small ceramics studio" said to a shop is the shop, and it asked for an empty Projects because "studio"
 * is a Projects word.
 */
function claimsOf(c: UseCase, said: string): (span: Said) => boolean {
  const own = claimedBy(c, said);
  const trade = ordersOf(c) !== null ? TRADE.exec(said)?.indices?.[1] : undefined;
  return (span) => own(span) || (trade !== undefined && span.at >= trade[0] && span.at + span.text.length <= trade[1]);
}

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
  const claims = (u ? [u, ...beside] : []).map((c) => claimsOf(c, said));
  const kept = u ? heardFor(read, (span) => claims.some((claimed) => claimed(span))) : read;
  const pointed = new Set(kept.packs.filter((p) => p.why.length > 0).map((p) => p.id));
  /* `toTurnOn` ADDS PEOPLE FOR A NAME, and a declined reading has no packs, so a name alone still keeps People. */
  const heard = toTurnOn(kept, named, offers).filter((id) => pointed.has(id) || (named && !kept.packs.some((p) => p.id === id)));
  /* AND MONEY SAID IS MONEY KEPT, whoever claims the word: "we send invoices in naira"
     made an agency's record whose use case keeps hours and no money, and Money was nowhere on its first Today. A part
     that keeps money and that the words pointed at comes when nothing the use cases bring keeps money. */
  const chosen = u ? [...modulesFor(u, heard).filter((id) => id !== CORE_PACK), ...beside.flatMap((b) => b.modules)] : heard;
  const money = read.packs.find((p) => p.why.length > 0 && keepsMoney(p.id) && !chosen.includes(p.id));
  const keeps = chosen.some((id) => keepsMoney(id));
  /* A CATALOGUE PACK THE SENTENCE ASKED FOR IS KEPT beside the use case's modules, since `modulesFor` keeps any pack. */
  return closeOver(withFirstList(money !== undefined && !keeps ? [...chosen, money.id] : chosen, u), offers);
}

/** The module whose list takes a thing to do, the one a record with no use case is given (`withFirstList`). */
const TO_DO = 'work';
/** Projects' part, which is no place on the rail until it holds a project (`railPlaces`). */
const PORTFOLIO_ID = 'portfolio';

/**
 * A BLANK BRAINDOG TAKES ITS FIRST THING (audit 31 Oct m, AM2): "I'm Ali." made Today and People, and "Call the plumber
 * tomorrow" then had nowhere to go but Organisations. A record no use case speaks for is given Work's tasks, as a starter
 * is given its own lists, so a line with a day becomes a task due that day. It costs nothing on the rail: Work is a place
 * only once it holds a task (`workOf` in `lib/nav.ts`), and the first-run's places leave it out until then
 * (`railPlaces`). A use case brings its own lists for the day's things and is left as it is, and words that turned
 * nothing on at all stay nothing, so the first run still asks what they are closest to.
 */
function withFirstList(modules: readonly PackId[], u: UseCase | null): PackId[] {
  return u !== null || modules.length === 0 || modules.includes(TO_DO) ? [...modules] : [...modules, TO_DO];
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
  const m = TRADE.exec(bio);
  if (!m) return null;
  const kind = (m[3] ?? '').toLowerCase();
  const what = (m[2] ?? '').trim().split(/\s+/u).filter((w) => w !== '' && !PLAIN.has(w.toLowerCase()));
  /* WITH NO NAME HEARD, THE TRADE AS IT WAS SAID: "a small ceramics studio" is Ceramics studio, where the
     record was named for the email's local part. A kind of place alone ("a shop", "a business") is still anybody's. */
  if (name === null) return what.length === 0 ? null : capital([...what, kind === 'cafe' ? 'café' : kind].join(' '));
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
  /** The currency the record will keep, said after the part that keeps money where the words named none: by its name,
      "in pounds", never its code (first F9). */
  inCurrency: (code: string) => `in ${currencyWord(code)}`,
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
 *
 * "NO LONGER" AND "USED TO" ARE WORDS OF HAVING STOPPED TOO (`NO_LONGER`, `USED_TO`), held to the same clause's end:
 * "I used to take orders but I stopped" has no orders, and "I no longer keep orders on paper" still has them. A thing
 * of one's own from before ("my old products", "our former shop") is the thing (`OWNED`), and where a stopped thing
 * came from is gone with it when it is said that way: "I stopped taking orders from my old shop" (`WAS_AT`).
 *
 * A "USED TO" THAT IS TAKEN UP AGAIN CARRIES ON (`TAKEN_UP`): "I used to take orders and now track them here" keeps its
 * orders, because "them" points back at them after a word of now ("now", "still", "instead"). "NO LONGER" AND A WORD OF
 * HAVING STOPPED CARRY ON THE SAME WAY: "I no longer take orders and now track them here" and "I stopped taking orders
 * and now track them here" keep them too. "I used to sell cakes and now sell bread" points back at nothing and has
 * stopped. AND WHEN IT STOPPED ENDS THE CLAUSE AS A WORD OF WHEN DOES (`SINCE_WHEN`): "I stopped
 * taking orders when I closed the shop" and "as the shop closed" have no orders, where "after hours", "as a favour" and
 * "when I am busy" are how it is done.
 * The thing ended there is gone with it (`ENDED`, `ENDED_ITSELF`), so neither sentence has a shop either.
 *
 * A WORD OF FEELING TAKES NOTHING UP (`FEELS`): "I stopped taking orders and still miss them" and "now I hate them"
 * point back at the orders and do nothing with them, so they stay stopped. AND A THING SOLD, OR HAD BEFORE, IS GONE:
 * "I sold the stall" has no shop (`SOLD`), nor has "when I had the stall", "when we ran a small shop" (`ENDED`).
 *
 * A THING NEVER DONE OR ONLY WISHED FOR IS NOT HAD EITHER: "I never ran a shop" is read through the verb of before
 * (`DID_IT`), "I wish I had a shop" and "I hope to open a shop one day" through the wish (`WISHED`), and "I used to
 * love taking orders" through the word of liking (`LIKED`). "Now I love them" takes nothing up (`ONLY_LIKED`).
 *
 * A WISH HOLDS TO THE END OF ITS CLAUSE, as a stopping does: "We hope to have invoices sorted" is somebody with
 * invoices, and "I hope to have a shop one day" is nobody with a shop. Only a thing still to be started is wished
 * for wherever it sits (`TO_START`): "I hope to open a shop in Cairo". AND "STILL DO" POINTS BACK AT WHAT WAS DONE
 * (`STILL_DOES`): "I used to love taking orders and still do" keeps its orders.
 *
 * A NEVER THAT THE CLAUSE TAKES BACK REFUSES NOTHING (`TAKEN_BACK`): "I never ran a shop before but I just opened
 * one" and "My wife never ran the shop, I do" are somebody with a shop, and "I never kept track of orders, I want to
 * start" is somebody with orders. SO IS ONE BEING OPENED, AND A FIRST ONE (`OPENS_NOW`, `FIRST_ONE`): "I never ran a
 * shop but I am opening one next month", "I never ran a shop before. This is my first one." AND WHAT NEVER RAN OUT
 * WAS NEVER SAID TO BE KEPT (`RAN_OUT`): "I never ran out of products" asks for no Products.
 *
 * AND FIVE MORE WAYS A THING IS NOT HAD OR IS: never used or sent ("I never used invoices", `DID_IT`); one thing
 * somebody would love to have ("I would love to have a shop", `WOULD_LOVE`); one somebody of theirs sold ("My partner
 * sold the stall", `THEIRS`); one had before ("I had a shop", `HAD_ONCE`); and whoever speaks with somebody else
 * takes a never back as "I" does ("my friend and I are opening one", `ME`). MORE OF A THING IS A THING HAD ("I wish I
 * had more clients"), and somebody else carrying on takes nothing up ("They still do").
 */
const REFUSES = "no|not|never|without|zero|don['’]?t|do\\s+not|doesn['’]?t|does\\s+not|haven['’]?t|hasn['’]?t|hadn['’]?t|didn['’]?t";
/* `send` and its ending apart: the whole word is a field an add-on declares, and the core spells none (the core-names gate). */
const DOING = `tracking(?:\\s+of)?|taking|send${'ing'}|chasing|using|keeping|selling`;
const DOES = `to|have|take|get|do|sell|keep|need(?:\\s+of)?|want|track(?:\\s+of)?|run|own|send|use|chase|${DOING}`;
/* The words that deny a stopping: those of refusal, and the ones only a verb takes. At most three words between, none
   of them a join or somebody new, so "I won't ever have to quit" is denied and "No, I'm done" and "no staff so I quit" are not. */
const DENIES = `${REFUSES}|did\\s+not|won['’]?t|will\\s+not|can['’]?t|cannot|wouldn['’]?t|isn['’]?t|aren['’]?t|wasn['’]?t`;
const SOMEBODY = "(?:i|we|you|they|he|she|it)(?:['’]\\p{L}+)?";
const UNDENIED = `(?<!(?:^|[^\\p{L}\\p{N}'’])(?:${DENIES})\\s+(?:(?!(?:${SOMEBODY}|and|or|nor|but|so|because|since|then|now)(?![\\p{L}\\p{N}'’]))[\\p{L}'’]+\\s+){0,3})`;
/* A denial reaches past somebody new only through a word of thinking or saying: "I do not think I have stopped",
   "I never said we quit", "it is not true that I am done". Two small words at most on either side of who stopped. */
const THINKS = 'think|believe|reckon|suppose|guess|feel|say|said|mean|meant|imagine|expect|sure|certain|convinced|true|that|as\\s+if|like';
const SMALL = "(?:(?:have|has|had|ever|really|actually|quite|yet|am|is|are|was|were|will|would|['’]ve|['’]m|even|just)\\s+){0,2}";
const UNTHOUGHT = `(?<!(?:^|[^\\p{L}\\p{N}'’])(?:${DENIES})\\s+${SMALL}(?:${THINKS})\\s+(?:that\\s+)?${SOMEBODY}\\s+${SMALL})`;
const HALTED = `${UNDENIED}${UNTHOUGHT}(?:done|finished|stopped|quit)(?:\\s+with)?`;
const STOPPED = `${HALTED}(?=\\s+(?:${DOING})\\s)`;
/* The same verbs said of before, so a thing never done is refused as one not done is: "I never ran a shop", "we never
   took orders", "I never used invoices". Never "sold", "closed" or "lost": whoever never sold a stall still has it, and
   never "used to", which is what was done before ("I never used to chase people"). */
const DID_IT = 'ran|took|taken|kept|owned|opened|started|tracked|chased|needed|wanted|did|sent|used(?!\\s+to(?![\\p{L}\\p{N}]))';
/* "ran out of" is read through as a verb is, so a thing that never ran out is not taken for a thing somebody keeps. */
const RAN_OUT = '(?:ran|run|running)\\s+out\\s+of';
const NOT = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${REFUSES})\\s+(?:(?:any|more|longer|ever|had|got|${RAN_OUT}|${DOES}|${DID_IT}|a|an|the)\\s+){0,5}(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* A thing of one's own, and one from before: "my products", "my old products", "the former shop". */
const OWN = 'my|our|your|their|his|her|its';
const PAST = 'old|former|previous|earlier|last|original|first';
const OWNED = `(?:(?:${OWN})\\s+)?(?:(?:${PAST})\\s+)*`;
const THING = `(?:(?:any|more|longer|ever|had|got|${DOES}|a|an|the)\\s+){0,5}${OWNED}(?:(?:${[...PLAIN].join('|')})\\s+)*$`;
const NOT_STOPPED = new RegExp(`(?:^|[^\\p{L}\\p{N}])${STOPPED}\\s+${THING}`, 'iu');
/* "no longer", and "used to" before a verb: never "I am used to taking orders", which is somebody who takes them.
   A word of liking may stand before the verb, since what was liked then was done then: "I used to love taking orders".
   Only before a verb: "I used to like my shop" is somebody who has one. */
const LIKED = 'love|like|enjoy|hate|dread|mind';
const NO_LONGER = new RegExp(`(?:^|[^\\p{L}\\p{N}])no\\s+longer\\s+${THING}`, 'iu');
const USED_TO = new RegExp(
  `(?<!(?:am|is|are|was|were|be|been|being|get|gets|got|getting|['’]m|['’]re|['’]s)\\s+(?:(?:so|very|quite|now|well|all|really)\\s+)?)(?<![\\p{L}\\p{N}])used\\s+to\\s+(?!(?:${DOING})\\s)(?:(?:really|quite|so|just)\\s+)?(?:(?:${LIKED})\\s+(?=(?:to|${DOING}|running|owning|having)\\s)(?:(?:running|owning|having)\\s+)?)?${THING}`,
  'iu',
);
/* The thing heard can be the verb itself: "I am done selling" is no shop, as "no more selling" already is none. */
const STOPPED_BEFORE = new RegExp(`(?:^|[^\\p{L}\\p{N}])${HALTED}\\s+$`, 'iu');
const IS_DOING = new RegExp(`^(?:${DOING})(?![\\p{L}\\p{N}])`, 'iu');
const IS_DONE = new RegExp(`^(?:${DOES})$`, 'iu');
/* What may follow a thing somebody stopped: nothing, a mark of any kind, a join, with at most a word of when before it. */
const SPAN = 'years?|months?|weeks?|days?';
const MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december';
const WHEN = [
  'anymore|any\\s+more|any\\s+longer|altogether|entirely|completely|at\\s+all|too|either|as\\s+well',
  'for\\s+good|for\\s+now|now|already|today|yesterday|recently|lately',
  /* And the words of later, which end a wish as these end a stopping: "I hope to have a shop one day". */
  'one\\s+day|some\\s*day|soon|eventually|in\\s+(?:the\\s+)?future|next\\s+(?:year|month|week|spring|summer|autumn|fall|winter)',
  '(?:last|this)\\s+(?:year|month|week|spring|summer|autumn|fall|winter)',
  `(?:back\\s+)?in\\s+(?:\\d{4}|${MONTH})`,
  `(?:(?:a\\s+)?(?:few|couple\\s+of|long)\\s+|[\\p{L}\\p{N}]+\\s+)?(?:${SPAN}|while|time)\\s+ago`,
].join('|');
/* What happened and ended it, said after "when", "after", "once" or "as" by somebody and a verb of the past: "when I closed
   the shop", "after we moved", "once the stall shut". Never "after hours" or "when I am busy", which go on. */
const DID = '[\\p{L}]+ed|shut|sold|left|went|quit|lost|had|got|gave|took|became|began|ran|fell|broke|was|were';
const SINCE_WHEN = `(?:when|after|once|as)\\s+(?:${SOMEBODY}|(?:the|${OWN})\\s+[\\p{L}\\p{N}'’-]+)\\s+(?:${DID})(?![\\p{L}\\p{N}])`;
/* And the thing that was ended there is gone too: the shop in "when I closed the shop", the stall in "after we sold our stall". */
const ENDED = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:(?:when|after|once|since)\\s+${SOMEBODY}\\s+(?:closed|shut|sold|left|lost|quit)(?:\\s+(?:down|up))?|when\\s+${SOMEBODY}\\s+(?:still\\s+)?(?:had|owned|ran))\\s+(?:(?:the|a|an|${OWN})\\s+)?(?:(?:${PAST})\\s+)*(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* The same thing said as what ended, not as what somebody ended: "as the shop closed", "once my stall shut down".
   The word of whose it is may be part of the phrase heard ("my shop"), so it is not asked for here. */
const ENDED_ITSELF = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:when|after|once|since|as)\\s+(?:(?:the|${OWN})\\s+)?(?:(?:${PAST})\\s+)*(?:(?:${[...PLAIN].join('|')})\\s+)*$`, 'iu');
/* A thing somebody sold is gone with no "when" before it: "I sold the stall", "we have sold our old shop". Never one
   that is denied ("I never sold the stall") or only supposed ("if I sold the stall", "I wish I had sold it"), and never what is sold day to
   day, which is many ("I sold my products"). What follows is the clause's end, or who it went to and for what.
   SOMEBODY OF THEIRS WHO SOLD IT ENDED IT THE SAME WAY (`THEIRS`): "My partner sold the stall", "our landlord sold the shop". */
const THEIRS = "(?:my|our)\\s+(?:[\\p{L}'’-]+\\s+)?[\\p{L}'’-]+";
const SOLD = new RegExp(
  `(?<!(?:^|[^\\p{L}\\p{N}])(?:if|unless|whether|wish|wished|wishes)\\s+)(?<![\\p{L}\\p{N}'’])(?:${SOMEBODY}|${THEIRS})\\s+(?:(?:have|has|had|just|now|since|already)\\s+){0,2}${UNDENIED}sold(?:\\s+(?:off|up))?\\s+(?:(?:the|a|an|${OWN})\\s+)?(?:(?:${PAST})\\s+)*(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* Never to whoever speaks, whose it then is: "My partner sold the stall to me". */
const SOLD_TO = /^\s+(?:to(?!\s+(?:me|us)(?![\p{L}\p{N}]))|for)(?![\p{L}\p{N}])/iu;
/* A THING ONLY WISHED FOR IS NOT HAD: "I wish I had a shop", "I hope to open a shop one day", "if only I took orders",
   "I dream of opening a shop", "I always wanted a shop". The wish comes before the thing with only somebody and words
   of having or starting between (`GETS`), then "a", "any", "some" or "my own". So what is wished ABOUT a thing somebody
   has keeps it ("I wish my shop had more orders", "I hope to grow my shop", "I wish I had sold the stall"), and so does
   what they hope to do with it in here, which is a verb of keeping and not of having ("I hope to track orders"). */
const WISHES = 'wish(?:es|ed|ing)?|hop(?:e|es|ed|ing)|if\\s+only|dream(?:s|ed|t|ing)?\\s+(?:of|about)|always\\s+wanted';
const GETS = 'to|have|had|having|own|owned|owning|run|ran|running|open|opened|opening|start|started|starting|get|got|getting|take|took|taking|could|would|can|will|might|someday|one\\s+day|soon|still|ever|just|be\\s+able';
const WISHED = new RegExp(
  `(?:^|[^\\p{L}\\p{N}'’])(?:${WISHES})\\s+(?:that\\s+)?(?:${SOMEBODY}\\s+)?(?:(?:${GETS})\\s+){0,5}(?:(?:a|an|any|some|(?:${OWN})\\s+own)\\s+)?(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* ONE THING SOMEBODY WOULD LOVE OR LIKE TO HAVE IS NOT HAD EITHER: "I would love to have a shop", "I'd like a shop one
   day". Read as a wish is, and only of one thing: what there is more than one of is started in here, so "I would like
   to take orders" keeps its orders, as "I want to start" does (`STARTED_HERE`). */
const WOULD_LOVE = new RegExp(
  `(?:(?:^|[^\\p{L}\\p{N}'’])would|(?<=[\\p{L}])['’]d)\\s+(?:(?:really|so|dearly|just)\\s+)?(?:love|like)\\s+(?:(?:${GETS})\\s+){0,5}(?:(?:a|an|any|some|(?:${OWN})\\s+own)\\s+)?(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* AND ONE THING HAD BEFORE IS NOT HAD NOW: "I had a shop", "we once had a small stall". Said by "I" or "we" of one
   thing, never of one had ever since ("I've had a shop for years"), which is no bare "I had", and never after "when",
   which `ENDED` reads and holds to the clause's end ("When I had the stall for a year I hired help"). */
const HAD_ONCE = new RegExp(
  `(?<!(?:^|[^\\p{L}\\p{N}])(?:when|after|once|since|while|as|if)\\s+)(?<![\\p{L}\\p{N}'’])(?:i|we)\\s+(?:(?:once|then|also|previously|formerly)\\s+)?had\\s+(?:(?:a|an|the|${OWN})\\s+)(?:(?:${PAST})\\s+)*(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
  'iu',
);
/* A thing still to be opened or started is not had, whatever is said after it: "I hope to open a shop in Cairo". */
const TO_START = new RegExp(`(?:^|\\s)(?:open|opened|opening|start|started|starting)\\s+(?:(?:a|an|any|some|(?:${OWN})\\s+own)\\s+)?(?:(?:${[...PLAIN].join('|')})\\s+)*$`, 'iu');
/* And so is a phrase heard that is the starting itself: "start a" in "I hope to start a small shop with this". */
const STARTS = /^(?:open|opened|opening|start|started|starting)(?![\p{L}\p{N}])/iu;
/* What follows says the thing is had after all: it is hoped for in here, wished to have come sooner, or had now
   ("I always wanted a shop and now I have one"). */
const HAD_ANYWAY = /^(?:\s+(?:here|sooner|earlier|(?:with|in|on|through|using)\s+(?:this|braindog))|\s*,?\s+(?:and|but)\s+(?:(?:i|we)\s+)?(?:now|finally|today)\s+(?:(?:i|we)\s+)?(?:have|own|run|do|did|got))(?![\p{L}\p{N}])/iu;
const CLAUSE_END = `(?:\\s+(?:${WHEN}))?\\s*(?:$|[^\\p{L}\\p{N}\\s]|(?:and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}])|${SINCE_WHEN})`;
/* A thing taken up again: a word of now ("now", "still", "instead") after the clause, then at most five words, none a join or a word of refusal or
   of stopping, and the word that points back. "them" and "those" point at many, "it" and "that" at one. */
const NOW = 'now|today|nowadays|these\\s+days|currently|still|instead';
/* A word of feeling or remembering takes nothing up: "and still miss them", "now I hate them", "still think about them".
   The thing is pointed back at and nothing is done with it. "love" is not one of them, since it is said of what goes on
   as often ("now I love tracking them"), but straight before the word that points back it is only a feeling too
   (`ONLY_LIKED`): "I stopped taking orders and now I love them". */
const ONLY_LIKED = `(?<!(?:^|[^\\p{L}\\p{N}'’])(?:lov(?:e|es|ed)|lik(?:e|es|ed)|enjoy(?:s|ed)?|ador(?:e|es|ed))\\s+)`;
const FEELS = 'miss(?:es|ed|ing)?|hat(?:e|es|ed|ing)|regret(?:s|ted|ting)?|mourn(?:s|ed|ing)?|dread(?:s|ed|ing)?|resent(?:s|ed|ing)?|loathe[sd]?|despise[sd]?|detest(?:s|ed)?|remember(?:s|ed|ing)?|recall(?:s|ed|ing)?|forget|forgot|forgotten|think|thinking|dream(?:s|ed|ing)?|wish|grieve';
const takenUp = (back: string): RegExp =>
  new RegExp(
    `^(?:\\s+(?:${WHEN}))?(?:\\s+(?!(?:and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'’-]+){0,3}\\s*[,;]?\\s*(?:(?:and|but|so)\\s+)?(?:${SOMEBODY}\\s+)?(?:${NOW})\\s+(?:(?!(?:${DENIES}|${FEELS}|done|finished|stopped|quit|and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}'’]))[\\p{L}\\p{N}'’-]+\\s+){1,5}${ONLY_LIKED}(?:${back})(?![\\p{L}\\p{N}])`,
    'iu',
  );
const TAKEN_UP = { many: takenUp('them|those'), one: takenUp('it|that'), done: takenUp('them|those|it') };
/* "and still do", "and I still do", "I still do." after the clause: what was done then is done now. Never "still do
   not" or "still don't", never somebody else ("my sister still does"), never another thing ("I still do my own taxes"). */
const STILL_DOES = new RegExp(
  `^(?:\\s+(?:${WHEN}))?\\s*[,;.]?\\s*(?:(?:and|but)\\s+)?(?:(?:i|we)\\s+)?(?:still\\s+do|do\\s+still)(?![\\p{L}\\p{N}'’])(?!\\s+not(?![\\p{L}\\p{N}]))${CLAUSE_END}`,
  'iu',
);
/* A REFUSAL TAKEN BACK after its clause: at most two words of before ("before", "until now"), a mark or a join, then
   whoever speaks has one now ("but I just opened one", "and now I have one"), does it ("I do", "but now I do"), or
   wants to start ("I want to start", "I would like to start tracking them"). Only "I" and "we" take it back, never
   somebody else, and never a refusal ("I do not want one") or another thing ("I do the design", "I want to start a blog").
   WHOEVER SPEAKS WITH SOMEBODY ELSE STILL SPEAKS: "my friend and I are opening one", "Sara and I do". Only where "I"
   is the one named last, so "my friend and his wife are opening one" takes nothing back. */
const ME = "(?:(?:(?:(?:my|our)\\s+(?:[\\p{L}'’-]+\\s+){1,2}|[\\p{L}'’-]+\\s+)and\\s+i)|i|we)(?:['’]\\p{L}+)?";
const POINTS = 'one|it|them|those|mine|ours';
const JUST = '(?:(?:just|now|finally|recently|today|since|have|has)\\s+){0,3}';
const HAS_NOW = `${JUST}(?:${ME}\\s+)?${JUST}(?:have|own|run|keep|take|opened|started|got|bought|set\\s+up|took\\s+over)\\s+(?:${POINTS})(?![\\p{L}\\p{N}'’])`;
const DOES_NOW = `(?:now\\s+)?${ME}\\s+(?:(?:now|finally|just)\\s+)?do(?![\\p{L}\\p{N}'’])(?!\\s+not(?![\\p{L}\\p{N}]))`;
const WILL_START = `(?:${ME}\\s+)?(?:now\\s+)?(?:want|need|plan|intend|mean|(?:would\\s+)?(?:like|love)|(?:am\\s+|are\\s+)?(?:about|going|ready))\\s+to\\s+(?:start|begin)(?:\\s+(?:(?:${DOING})\\s+)?(?:${POINTS}))?`;
const BEFORE_NOW = `(?:\\s+(?:before|yet|until\\s+now|till\\s+now|up\\s+to\\s+now|so\\s+far|myself|in\\s+my\\s+life|${WHEN})){0,2}`;
const THEN = '(?:\\s*[,;.]\\s*(?:(?:and|but|so)\\s+)?|\\s+(?:and|but|so)\\s+)';
/* AND WHOEVER IS OPENING ONE HAS ONE, as whoever just opened one does: "but I am opening one next month", "I'm setting
   one up", "we are about to open one". Said of now by "I" or "we" with the word that points back, never a thought of it
   ("I am thinking of opening one"), a refusal ("I am not opening one") or another thing ("I am opening a studio"). */
const SET_UP = `(?:up\\s+(?:${POINTS})|(?:${POINTS})\\s+up)`;
const OPENING = `(?:opening|starting|launching)(?:\\s+to\\s+(?:take|keep|track|have|run|use))?\\s+(?:${POINTS})|setting\\s+${SET_UP}`;
const ABOUT_TO = `about\\s+to\\s+(?:(?:open|start|launch)\\s+(?:${POINTS})|set\\s+${SET_UP})`;
const OPENS_NOW = `${ME}\\s+(?:(?:am|are)\\s+)?(?:(?:now|finally|just|already)\\s+)?(?:${OPENING}|${ABOUT_TO})(?![\\p{L}\\p{N}'’])`;
/* A FIRST ONE IS ONE: "This is my first one.", "it's our first", "these are my first ones". Only the speaker's own, and
   only where it ends its clause, so "this is my first time here" and "this is her first one" take nothing back. */
const FIRST_ONE = `(?:(?:this|it|that)(?:\\s+is|['’]s|\\s+will\\s+be)|(?:these|they)\\s+are|they['’]re)\\s+(?:my|our)\\s+(?:very\\s+)?first(?:\\s+ones?)?(?:\\s+ever)?`;
const TAKEN_BACK = new RegExp(`^${BEFORE_NOW}${THEN}(?:${HAS_NOW}|${OPENS_NOW}|(?:${DOES_NOW}|${FIRST_ONE})${CLAUSE_END})`, 'iu');
/* Wanting to start takes back only what there is more than one of: orders are started in here, a shop is not. */
const STARTED_HERE = new RegExp(`^${BEFORE_NOW}${THEN}${WILL_START}${CLAUSE_END}`, 'iu');
/* Where one thing wished for would be, which ends the wish as a word of when does: "I wish I had a shop in Cairo",
   "by the sea". Never of many, which are had and hoped to be somewhere: "I hope to get orders in on time". */
const SOMEWHERE = new RegExp(`^\\s+(?:in|near|by|at)(?:\\s+(?!(?:and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'’-]+){1,3}${CLAUSE_END}`, 'iu');
/* What may follow one had before, and end the clause: how long, or until when ("for ten years", "until last year").
   Never what was done to it ("I had the stall repainted") or what went on then ("for a year I hired help"). */
const HOW_LONG = `^\\s+(?:until|till|before|for|back\\s+in|up\\s+to)(?:\\s+(?!(?:and|or|nor|but|so|because|since)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'’-]+){1,3}`;
const HAD_UNTIL = new RegExp(`${HOW_LONG}${CLAUSE_END}`, 'iu');
/* The how long alone, so what comes after it can take the thing back as it does with no how long said: "I had the
   shop for years and I run it" is somebody with a shop, as "I had a shop and I run it" is. */
const HAD_SO_LONG = new RegExp(HOW_LONG, 'iu');
const ENDS = new RegExp(`^${CLAUSE_END}`, 'iu');
const ITSELF_ENDED = new RegExp(`^\\s+(?:(?:was|got)\\s+)?(?:closed|shut|sold)(?:\\s+(?:down|up))?${CLAUSE_END}`, 'iu');
/* After the verb itself, what was sold or kept comes first: "done selling candles", never "selling candles on paper". */
/* A thing joined straight on with "and", "or" or "nor": the run ends where its last thing does. */
const RUN_ON = new RegExp(`^\\s+(?:and|or|nor)\\s+(?:(?:any|a|an|the|${OWN})\\s+)?(?:(?:${PAST})\\s+)*`, 'iu');
/* A thing joined on that opens a clause of its own, by the verb after it: "orders and invoices are all I do". */
const OPENS_CLAUSE = /^\s+(?:(?:still|now|only|just|always|also|really|alone)\s+)*(?:are|is|were|was|will|would|can|could|should|must|have|has|had|do|does|did|go|goes|come|comes|came|keep|keeps|kept|stay|stays|take|takes|took|make|makes|made|get|gets|got|pay|pays|paid|remain|remains|suit|suits|work|works)(?![\p{L}\p{N}])/iu;
/* Where a stopped thing came from, said as a place of one's own from before: "from my old shop", "at our former stall". */
const WAS = `\\s+(?:from|at|in|for|of|through|via)\\s+(?:${OWN})\\s+(?:(?:${PAST})\\s+)+(?:(?:${[...PLAIN].join('|')})\\s+)*`;
const WAS_AT = new RegExp(`^${WAS}`, 'iu');
const WAS_FROM = new RegExp(`${WAS}$`, 'iu');
const ENDS_DOING = new RegExp(`^(?:\\s+(?!(?:on|in|by|from|at|with|via|over|through|to|for|into|and|or|nor|but)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'’-]+){0,3}${CLAUSE_END}`, 'iu');
/* A name never opens with a word of refusal: "Don't need orders, I freelance" names nobody (`who`). */
const OPENS_REFUSING = new RegExp(`^(?:${REFUSES})(?![\\p{L}\\p{N}'’])`, 'iu');
/* Nor is a word of when a name: "Once I had the stall, orders poured in" is read whole, with its "once". */
const OPENS_WHEN = /^(?:when|once|after|since|while|if|as)$/iu;

type Said = { at: number; text: string };
type Refusal = 'refused' | 'stopped' | null;

/*
 * WHAT JOINS THE NEXT THING TO THE ONE BEFORE: a comma, "and", "or", "nor", then at most a small word and words of size.
 * `AND_OR` is the "and" or "or" a run of commas ends in, looked for after a thing that follows a bare comma. The third
 * group is the verbs of having and doing said after the join ("or take orders"), which only "or" and "nor" carry past.
 */
const JOINED = new RegExp(
  `(?:\\s*,\\s*(?:(and|or|nor)\\s+)?|\\s+(and|or|nor)\\s+)((?:(?:${DOES})\\s+){1,4})?(?:(?:any|a|an|the|${OWN})\\s+)?(?:(?:${PAST})\\s+)*(?:(?:${[...PLAIN].join('|')})\\s+)*$`,
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
    /* A place of one's own from before, after the thing, is gone with it where it ends the clause in its turn. */
    const was = to + (WAS_AT.exec(after)?.[0].length ?? 0);
    const place = was > to ? known.find((k) => k.at === was) : undefined;
    if (place) return ends(place.at + place.text.length);
    if (!ENDS.test(after)) return false;
    const next = to + (RUN_ON.exec(after)?.[0].length ?? 0);
    const joined = next > to ? known.find((k) => k.at === next) : undefined;
    if (!joined) return true;
    /* THE RUN IS DECIDED WHOLE: it ends where its last thing does, and a last thing that opens a clause of its own
       ("orders and invoices are all I do") leaves the first one ending its clause at the join. */
    const end = joined.at + joined.text.length;
    return ends(end) || OPENS_CLAUSE.test(said.slice(end));
  };
  /* A word heard that is how a thing is done or how big it is ("sell", "handmade") ends as the verb does. */
  const closes = (from: number, to: number): boolean => {
    const word = said.slice(from, to).toLowerCase();
    return PLAIN.has(word) || IS_DONE.test(word) ? ENDS_DOING.test(said.slice(to)) : ends(to);
  };
  /* Whether a thing somebody used to do is taken up again after its clause, read from where its whole run ends. */
  const runEnd = (to: number): number => {
    let end = to;
    for (;;) {
      const next = end + (RUN_ON.exec(said.slice(end))?.[0].length ?? 0);
      const joined = next > end ? known.find((k) => k.at === next) : undefined;
      if (!joined) return end;
      end = joined.at + joined.text.length;
    }
  };
  const again = (from: number, to: number): boolean => {
    const end = runEnd(to);
    const word = said.slice(from, to).toLowerCase();
    const back = PLAIN.has(word) || IS_DONE.test(word) ? TAKEN_UP.done : end > to || (MANY.test(word) && !/ss$/iu.test(word)) ? TAKEN_UP.many : TAKEN_UP.one;
    return back.test(said.slice(end)) || STILL_DOES.test(said.slice(end));
  };
  const many = (from: number, to: number): boolean => MANY.test(said.slice(from, to)) && !/ss$/iu.test(said.slice(from, to));
  /* Whether what was refused or wished for is taken back after its whole run: "but I just opened one", "I want to start". */
  const back = (from: number, to: number): boolean => {
    const after = said.slice(runEnd(to));
    return TAKEN_BACK.test(after) || (many(from, to) && STARTED_HERE.test(after));
  };
  /* How a thing was refused: by a word of refusal, or by a word of having stopped, which holds only at a clause's end. */
  const not = (from: number, to: number): Refusal => {
    const before = said.slice(0, from);
    /* "no longer" and "used to" are read before the bare "no": they hold only at the clause's end, as stopping does. */
    const used = USED_TO.test(before);
    if (NO_LONGER.test(before) || used) return closes(from, to) && !again(from, to) ? 'stopped' : null;
    if (NOT.test(before)) return back(from, to) ? null : 'refused';
    /* A thing only wished or hoped for is refused as one said not to be had is, where it ends the clause: "We hope to
       have invoices sorted" is somebody with invoices. One still to be started is refused wherever it sits. */
    if ((WISHED.test(before) || (!many(from, to) && WOULD_LOVE.test(before))) && !HAD_ANYWAY.test(said.slice(to)) && !back(from, to) && (TO_START.test(before) || STARTS.test(said.slice(from, to)) || closes(from, to) || (!many(from, to) && SOMEWHERE.test(said.slice(to))))) return 'refused';
    if (ENDED.test(before)) return ends(to) ? 'stopped' : null;
    /* One thing had before, wherever it was and until whenever, unless it is still had or had again. */
    const after = said.slice(to);
    const past = HAD_UNTIL.test(after) ? after.slice(HAD_SO_LONG.exec(after)?.[0].length ?? 0) : '';
    if (HAD_ONCE.test(before) && !many(from, to) && (ends(to) || SOMEWHERE.test(after) || HAD_UNTIL.test(after)) && !again(from, to) && !back(from, to) && !TAKEN_BACK.test(past)) return 'stopped';
    if (ENDED_ITSELF.test(before) && ITSELF_ENDED.test(said.slice(to))) return 'stopped';
    /* One thing sold, and nothing takes it up again: whoever sold a stall does not run it. */
    const one = said.slice(from, to);
    if (SOLD.test(before) && (!MANY.test(one) || /ss$/iu.test(one)) && (ends(to) || SOLD_TO.test(said.slice(to)))) return 'stopped';
    /* A word of size is said before its thing ("done selling handmade candles"), so it ends as the verb does. And a
       thing somebody stopped is taken up again as a "used to" is: "I stopped taking orders and now track them here". */
    if (NOT_STOPPED.test(before)) return closes(from, to) && !again(from, to) ? 'stopped' : null;
    const doing = STOPPED_BEFORE.test(before) ? IS_DOING.exec(said.slice(from)) : null;
    return doing && ENDS_DOING.test(said.slice(from + doing[0].length)) && !again(from, to) ? 'stopped' : null;
  };
  const refused = (from: number, to: number): Refusal => {
    const own = not(from, to);
    if (own) return own;
    const before = said.slice(0, from);
    /* THE PLACE A STOPPED THING CAME FROM, one's own and from before, is stopped with it: "orders from my old shop". */
    const was = WAS_FROM.exec(before);
    if (was) {
      const thing = /[\p{L}\p{N}'’-]+$/u.exec(before.slice(0, was.index));
      const at = [...known.filter((k) => k.at + k.text.length === was.index).map((k) => k.at), ...(thing ? [thing.index] : [])];
      if (at.some((a) => not(a, was.index) === 'stopped')) return 'stopped';
    }
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
  if (h.name === null || !(OPENS_REFUSING.test(h.name) || OPENS_WHEN.test(h.name))) return { ...h, shift: 0 };
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

/* THE WORDS FOR MONEY AND FOR GOALS A USE CASE LISTENS FOR, each said as the place it makes (first-hour audit AH21: Sam's
   "bills", "budget" and "marathon" were all "Savings goals, Goals, Log, Put by and Project steps"). */
const MONEY_SAID = /^(?:my money|money|personal finance|finances|budgets?|budgeting|spending|bills?|rent|pay ?day|debts?|groceries|household)$/iu;
const GOAL_SAID = /^(?:habits?|goals?|my goals|running|gym|fitness|marathon|training for|diet|reading more)$/iu;
/* A WISH, NOT A THING KEPT (audit AP18): "I want my bills, budget and rent under control" read "under control → Goals",
   and nobody had said a goal. It still points at the use case; it is no line of its own in What I heard. */
const WISH_SAID = /^(?:under control|on top of (?:it|things|everything)|sorted|organi[sz]ed)$/iu;

/** A list's id and what it points at, read off the use case's own declaration. */
const pointsAt = (u: UseCase, id: string): string[] => {
  const d = ((u.pack?.declarations ?? []) as { register?: unknown; fields?: unknown }[]).find((x) => x.register === id);
  return Array.isArray(d?.fields) ? (d.fields as { type?: unknown; to?: unknown }[]).flatMap((f) => (f.type === 'ref' && typeof f.to === 'string' ? [f.to] : [])) : [];
};

/**
 * WHAT A PHRASE A USE CASE HEARD READS AS: the one of its lists the phrase names ("orders" is Orders), or the list it
 * renamed ("tickets" is Team's Tickets); a word for money is Money, a word for a goal its Goals; a wish ("under control")
 * nothing, so it is no line; else the lists it brings
 * that stand on their own ("a small candle shop" is Orders and Products), never one kept inside another (a goal's Log,
 * a saving's Put by, a cycle's days), and the use case's own title only where it brings none.
 */
export function caseBecame(u: UseCase, phrase: string): string {
  const own = caseLists(u);
  const lists = caseWords(u).slice(1);
  if (lists.length === 0) return u.title;
  const word = phrase.trim().toLocaleLowerCase();
  if (WISH_SAID.test(word)) return '';
  const named = lists.find((n) => [word, plural(word)].includes(n.toLocaleLowerCase()));
  if (named) return named;
  /* A WORD FOR MONEY IS MONEY BEFORE IT IS A LIST MONEY KEEPS (audit 31 Oct m, AM10): Personal calls Money's bills
     "Bills", and "my bills" read "bills → Bills", a list inside Money that is no place on the rail. */
  if (MONEY_SAID.test(word) && [...u.modules, ...(u.needs ?? [])].includes('money-core')) return partName('money-core');
  const renamed = Object.entries(u.labels).find(([k, v]) => !/[:.]/u.test(k) && [word, plural(word)].includes(v.toLocaleLowerCase()));
  if (renamed) return renamed[1];
  if (GOAL_SAID.test(word)) {
    const goals = lists.find((n) => /\b(?:goals?|habits?)\b/iu.test(n) && !/\bsavings?\b/iu.test(n));
    if (goals) return goals;
  }
  const ids = new Set(own.map((l) => l.id));
  const alone = own.flatMap((l, i) => (pointsAt(u, l.id).some((to) => ids.has(to) && to !== l.id) ? [] : [lists[i]!]));
  return firstRun.and(alone.length > 0 ? alone : lists);
}

/**
 * The one list a part is said by: its only list, its first where that has the part's name (People), or its first where
 * that is the only one of its lists a use case can rename (`MODULE_WORDS`). Portfolio's Projects, since 1.19.0 beside
 * Numbers and the key numbers, which no use case renames: the line still says Projects, and not Portfolio.
 */
const leadOf = (id: string): ReturnType<typeof listsOf>[number] | undefined => {
  const own = id === AGENTS_PACK.manifest.id ? [] : listsOf(id);
  const named = own.filter((l) => Object.hasOwn(MODULE_WORDS, l.id));
  return own.length === 1 || own[0]?.name === moduleName(id) || (named.length === 1 && named[0] === own[0]) ? own[0] : undefined;
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
/* AND "A" OR "AN" (audit 31 Oct m, AM10): "training for a marathon" was two lines, said "training for and marathon". */
const BETWEEN = /^[\s,;]*(?:(?:and|or|plus|also)\s+)?(?:(?:my|our|the|a|an)\s+)?$/iu;

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
    /* A PART IS SAID BY ITS ONE LIST (Portfolio is Projects), or by its name where its first list has it (People). WORK
       IN A STARTER'S OWN WORD IS THAT WORD (AN19): a team's Work is Tickets on its rail from the first minute. */
    const lead = leadOf(id);
    const own = id === TO_DO ? (p.names?.[TASKS_LIST] ?? cases.map((u) => u.labels[TASKS_LIST]).find((w) => typeof w === 'string' && w.trim() !== '')) : undefined;
    const name = own ?? partName(id, p.names);
    const said = first((h) => (h.you === true && id === PEOPLE) || partsOfBecame(h.became).some((w) => w === moduleName(id) || w === name || w === lead?.name || w.startsWith(`${name} `)));
    const by = said ?? cases.filter((u) => u.modules.includes(id)).map(caseLine).find((h) => h !== null) ?? null;
    return place('module', id, name, by);
  });
  const leaned = new Set(p.modules.flatMap((id) => closeOver([id]).filter((on) => on !== id)));
  const shown = parts.filter((x) => x.phrase !== null || !leaned.has(x.id));
  const order = (a: Place, b: Place): number => (a.at?.[0] ?? Number.MAX_SAFE_INTEGER) - (b.at?.[0] ?? Number.MAX_SAFE_INTEGER);
  /* A STARTER'S OWN PLACE THAT NO LIST OF ITS OWN LEADS TO (AN19): the Founder's Dashboard is on his rail from the first
     minute, and the made line said "with People and Money" without it. Said by its page, as `railPlaces` says a list's. */
  const listed = new Set(cases.flatMap((u) => caseLists(u).length > 0 ? [u.usecase] : []));
  const pages = cases
    .filter((u) => !listed.has(u.usecase))
    .flatMap((u) => caseSections(u).map((x) => place('list', x.page, x.section, caseLine(u))));
  return [place('today', 'today', 'Today', null), ...lists, ...pages, ...shown.sort(order)];
}

/** Work's list, whose name in a starter's words is Work's (`placesOf`). */
const TASKS_LIST = 'tasks';

/** The parts that are no place on the rail until they hold something: Projects until a project, Work until a task. */
const WAITS_FOR_FIRST: ReadonlySet<string> = new Set([PORTFOLIO_ID, TO_DO]);

/**
 * WHETHER A PLACE IS A PART THAT WAITS FOR ITS FIRST ENTRY (Projects, Work), in its own name: the build beside the words
 * draws one the words named as forming, so it agrees with What I heard, which says it (1 Nov).
 */
export const waitsForFirst = (p: Place): boolean => p.kind === 'module' && WAITS_FOR_FIRST.has(p.id) && p.name === partName(p.id);

/** A use case's own places on the rail, by the sections its pages are filed under, Projects left to its part. */
function caseSections(u: UseCase): { page: string; section: string }[] {
  const out: { page: string; section: string }[] = [];
  for (const p of pagesOf(u)) if (p.section !== null && p.section !== partName(PORTFOLIO_ID) && !out.some((x) => x.section === p.section)) out.push({ page: p.page, section: p.section });
  return out;
}

/**
 * WHERE THINGS WILL BE KEPT, AS THE RAIL WILL SHOW THEM (audit 31 Oct m, AM10). Sam's sign-up built "Savings goals,
 * Goals, Progress, Money saved, Project steps, People, Projects and Money" and said the BrainDog was made with all eight;
 * his rail then held Goals, Money and People. So a use case's lists are said as the places its pages are filed under
 * (Goals; a student's Studies; a shop's Orders and Products), each list keeping its phrase for the first of them, and a
 * part that is no place until it holds something (Projects, Work) is said only where the words fill it (`filled`). A use
 * case with no page of its own still says its lists. Nothing is counted, and the order is `placesOf`'s.
 */
export function railPlaces(places: readonly Place[], filled: (p: Place) => boolean = () => false): Place[] {
  const out: Place[] = [];
  const said = (name: string): boolean => out.some((x) => x.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  for (const p of places) {
    /* A PART IN A STARTER'S OWN WORD IS ITS PLACE AT ONCE (AN19): a team's Tickets, second on its rail before a ticket. */
    if (p.kind === 'module' && WAITS_FOR_FIRST.has(p.id) && !filled(p) && p.name === partName(p.id)) continue;
    const u = p.kind === 'list' ? USE_CASES.find((c) => caseLists(c).some((l) => l.id === p.id)) : undefined;
    const sections = u ? caseSections(u) : [];
    if (u === undefined || sections.length === 0) {
      if (!said(p.name)) out.push(p);
      continue;
    }
    /* THE PHRASE OF THE FIRST OF ITS LISTS THE WORDS NAMED, said on its first place. */
    const own = new Set(caseLists(u).map((l) => l.id));
    const by = places.find((x) => x.kind === 'list' && own.has(x.id) && x.phrase !== null) ?? null;
    sections.forEach((x, i) => {
      if (!said(x.section)) out.push({ kind: 'list', id: x.page, name: x.section, phrase: i === 0 ? (by?.phrase ?? null) : null, at: i === 0 ? (by?.at ?? null) : null });
    });
  }
  /* IN THE RAIL'S ORDER (AN19), Today first: the Team's "Tickets, Sprints, People and Agents", as its rail reads down. */
  const at = out.map((p, i) => ({ p, i, rank: p.kind === 'today' ? -1 : rankOfPlace(p) }));
  return at.sort((a, b) => a.rank - b.rank || a.i - b.i).map((x) => x.p);
}

/**
 * Where the rail draws a place (`PLACE_AT` in `lib/nav/rail.ts`): a part by its own number, a starter's page by the
 * place it declares (`nav.place`), a starter's list with no page of its own among a starter's places, and anything
 * else after them all.
 */
const PART_AT: Readonly<Record<string, number>> = { work: 10, portfolio: 30, 'money-core': 40, people: 50, agents: 60 };
/** A starter's own place that declares none, ranked as the rail ranks one with a number it says: after Work. */
const STARTER_AT = 25;
function rankOfPlace(p: Place): number {
  if (p.kind === 'module') return PART_AT[p.id] ?? 1000;
  for (const u of USE_CASES)
    for (const d of (u.pack?.declarations ?? []) as { page?: unknown; nav?: { place?: unknown; section?: unknown } }[]) {
      if (d.page !== p.id) continue;
      if (typeof d.nav?.place === 'number') return d.nav.place;
      if (typeof d.nav?.section === 'string') return PART_AT[d.nav.section.toLocaleLowerCase()] ?? STARTER_AT;
    }
  return STARTER_AT;
}

/** The rail place a use case's list is kept in: the section of the first of its pages that needs it, else `null`. */
function sectionOfList(u: UseCase, list: string): string | null {
  for (const d of (u.pack?.declarations ?? []) as { page?: unknown; requires?: unknown; nav?: { section?: unknown } }[]) {
    if (typeof d.page !== 'string' || !Array.isArray(d.requires) || !d.requires.includes(`register.${list}`)) continue;
    if (typeof d.nav?.section === 'string' && d.nav.section.trim() !== '') return d.nav.section;
  }
  return null;
}

/**
 * WHAT A LINE HEARD BECAME, AS THE SCREEN SAYS IT (left-f, AM10's line): a starter's lists said as the places they are
 * kept in on the rail, as `railPlaces` says them on the right. Sam's "life admin under control" read "Savings goals,
 * Goals and Project steps", three lists, two of them inside a page; it now reads Goals, the place they make. Projects
 * is said only where nothing else is, since it is no place until it holds a project. ONLY THE WORDS SHOWN CHANGE:
 * `became` itself stays the lists' names, because `placesOf`, `amend`, `sayCurrency` and `fold` read the line back by
 * them, and a line taken out or turned into another part must still take its own lists with it.
 */
export function becameShown(h: Pick<HeardLine, 'became' | 'you' | 'loose'>, p: Pick<Proposal, 'usecase' | 'also' | 'names'>): string {
  if (h.you === true || h.loose === true) return h.became;
  const cases = [p.usecase, ...p.also].flatMap((id) => (id === null ? [] : (useCase(id) ?? [])));
  if (cases.length === 0) return h.became;
  const projects = partName(PORTFOLIO_ID);
  /* THE CURRENCY SAID ON THE LINE (`sayCurrency`, ", in Egyptian pounds") stays its tail, never a place. */
  const all = partsOfBecame(h.became);
  const tail = all.filter((w) => /^in\s/u.test(w));
  const parts = all.filter((w) => !tail.includes(w));
  let changed = false;
  const shown = parts.map((w) => {
    for (const u of cases) {
      const l = caseLists(u).find((x) => (p.names?.[x.id] ?? u.labels[x.id] ?? x.name) === w);
      const section = l ? sectionOfList(u, l.id) : null;
      if (section !== null) {
        if (section !== w) changed = true;
        return section;
      }
    }
    return w;
  });
  if (!changed) return h.became;
  const kept = shown.filter((w, i) => shown.indexOf(w) === i);
  const placed = kept.length > 1 ? kept.filter((w) => w !== projects) : kept;
  return `${firstRun.and(placed)}${tail.map((t) => `, ${t}`).join('')}`;
}

/** Whether a proposal's entries fill a part, so that part is a place from the first minute (`railPlaces`). */
export const filledBy =
  (rows: readonly { register: string }[]) =>
  (p: Place): boolean =>
    p.kind === 'module' && rows.some((r) => moduleOfList(r.register)?.id === p.id);

/*
 * A BARE WORD FOR MONEY IS MONEY, NEVER A USE CASE BESIDE: "who owes me money", said by a ceramics studio,
 * took Personal beside the shop and promised it Savings goals, Goals, Log, Put by and Project steps. A use case taken
 * beside the one proposed comes only where it heard more than these words; the money itself is kept (`modulesOf`).
 */
const MONEY_WORDS: ReadonlySet<string> = new Set(['money', 'my money', 'finances', 'bills']);
function moneyAlone(beside: UseCase, arranged: ReturnType<typeof arrangeTurns>): boolean {
  const why = arranged.ranked.find((r) => r.usecase === beside)?.why ?? [];
  return why.length > 0 && why.every((w) => MONEY_WORDS.has(w.text.toLowerCase()));
}

/*
 * A THING A SHOP DOES ON A DAY: "kiln firings", "bookings", "deliveries". The orders a shop keeps carry the
 * day each is due (`ordersOf`), so a dated thing said beside one is said as its orders by day, where it was not heard at all and
 * the one thing she said she loses track of went unsaid. At most one word before it, never a joining word.
 */
const DATED = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?!${JOIN}\\s)[\\p{L}'’-]+\\s+)?(?:firings|bookings|deliveries|fittings|collections|pickups|pick-ups)(?![\\p{L}\\p{N}])`, 'giu');
/* What the word before a dated thing never is: a verb or a word of how many, so "lose track of firings" lights "firings". */
const NOT_BEFORE = /^(?:of|do|did|does|doing|track|lose|losing|keep|keeping|manage|plan|planning|schedule|all|many|some|any|more|the|my|our|go|to)$/iu;
function datedIn(said: string): Said[] {
  return [...said.matchAll(DATED)].map((m) => {
    const words = m[0].split(/\s+/u);
    const own = words.length > 1 && !NOT_BEFORE.test(words[0] ?? '');
    const text = own ? m[0] : (words.at(-1) ?? m[0]);
    return { at: (m.index ?? 0) + (m[0].length - text.length), text };
  });
}

/** The use cases whose record is the business itself, so the business's own name is never a project in it. */
const THE_BUSINESS: ReadonlySet<string> = new Set(['shop']);
const PORTFOLIO = 'portfolio';

/**
 * A SHOP IS THE BUSINESS, NOT A PROJECT (PK3). "I'm Nadia and I run Nadia's Candles" made the record Nadia's Candles and
 * a project of the same name beside its orders, with Projects turned on for it. Where the use case is the business, the
 * project the record is named after is not written, the words say they name the BrainDog, and Projects stays only where
 * something else asked for it or leans on it.
 */
export function businessNotProject<P extends Pick<Proposal, 'usecase' | 'also' | 'modules' | 'heard' | 'names' | 'rows' | 'title' | 'places'>>(p: P): P {
  if (p.usecase === null || !THE_BUSINESS.has(p.usecase) || p.title === null) return p;
  const at = p.rows.findIndex((r) => r.register === PROJECTS && r.fields.name === p.title);
  if (at < 0) return p;
  const rows = p.rows.flatMap((r, i) => {
    if (i === at) return [];
    const { party, ...rest } = r;
    if (party === undefined || party === at) return [rest];
    return [{ ...rest, party: party > at ? party - 1 : party }];
  });
  const projects = partName(PORTFOLIO, p.names);
  const named = (h: HeardLine): boolean => h.phrase === p.title && partsOfBecame(h.became).includes(projects);
  const heard = p.heard.map((h) => (named(h) ? { ...h, became: firstRun.heardBusiness } : h));
  /* PROJECTS STAYS WHERE ANOTHER PHRASE ASKED FOR IT, or a part that stays leans on it (Money links to projects). */
  const asked = heard.some((h) => !named(h) && partsOfBecame(h.became).includes(projects));
  const cases = [p.usecase, ...p.also].flatMap((id) => useCase(id) ?? []);
  const own = cases.some((u) => [...u.modules, ...(u.needs ?? [])].includes(PORTFOLIO));
  const rest = p.modules.filter((id) => id !== PORTFOLIO);
  const keeps = asked || own || closeOver(rest).includes(PORTFOLIO);
  const modules = keeps ? p.modules : rest;
  const out = { ...p, rows, heard, modules };
  return { ...out, places: placesOf(out) };
}

/** What one sentence proposes. `ctx.locale` is carried for the catalogue's reading; these rules read English. */
/** Somebody who works for themselves by another name than freelance: "a solo consultant", "self-employed", "a contractor". */
const SOLO = /\b(?:(?:solo|independent|freelance|self-employed)\s+(?:consultant|contractor|designer|developer|writer|translator|marketer)|consultant|self-employed|sole trader|independent contractor|i(?:'m| am) an? contractor|work for myself)\b/iu;

export function propose(sentence: string, ctx: ProposeContext): Proposal {
  const name = who(sentence);
  /* THE REST OF THE SENTENCE IS READ WITHOUT THE NAME, so "Kiln, I run a studio" is not a project called Kiln. */
  const said = name.bio;
  const today = todayIn(ctx.zone);
  /* THE CATALOGUE'S SIGNALS: the bundled modules' own, and those of any other pack the caller can offer. */
  const offers = [...BUNDLED, ...(ctx.catalogue ?? []).filter((o) => !BUNDLED.some((b) => b.id === o.id))];
  /* WHAT THE PERSON SAID THEY DO NOT HAVE IS NOT HEARD, by the modules or by the use cases: "no orders" is no Orders. */
  const all = shape(said, today ?? undefined, offers);
  const turns = arrangeTurns(null, said, ctx.catalogue);
  const no = refusedIn(said, [...all.heard, ...all.packs.flatMap((p) => p.why), ...turns.ranked.flatMap((r) => r.why)]);
  const read = unrefused(all, no);
  const arranged = unrefusedCases(turns, no);
  /* A SOLO CONSULTANT, A CONTRACTOR OR THE SELF-EMPLOYED KEEP WHAT A FREELANCER KEEPS (1 Nov), where no use case's own
     words were heard: the business one, which the conversation says as Freelance (`caseTitle`). */
  const u = read.declined === 'language' ? null : (arranged.pick ?? (SOLO.test(said) ? (useCase('business') ?? null) : null));
  const beside = u ? alongside(arranged, u).filter((b) => !moneyAlone(b, arranged)) : [];
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
  const cases = (u ? [u, ...beside] : []).map((c) => ({ c, claimed: claimsOf(c, said), why: arranged.ranked.find((r) => r.usecase === c)?.why ?? [] }));
  for (const h of phrases) {
    const whose = h.loose ? undefined : cases.find((x) => x.claimed(h))?.c;
    heard.push(line(h.at, h.text, h.loose ? firstRun.shapeNoCurrency : whose ? caseBecame(whose, h.text) : firstRun.and(h.packs.map((id) => partName(id))), h.loose));
  }
  /* A PHRASE A USE CASE HEARD COUNTS AS HEARD, where no phrase already said covers it: "orders" became Orders. */
  for (const { c, why } of cases) for (const w of why) if (!heard.some((h) => overlaps({ at: h.at, text: h.line.phrase }, w))) heard.push(line(w.at, w.text, caseBecame(c, w.text)));
  /* A DATED THING SAID BESIDE A SHOP IS ITS ORDERS BY DAY (`DATED`), where nothing else heard it and it was not refused. */
  const orders = cases.map((x) => ordersOf(x.c)).find((l) => l !== null) ?? null;
  if (orders && read.declined === null)
    for (const d of datedIn(said)) if (!no(d) && !heard.some((h) => overlaps({ at: h.at, text: h.line.phrase }, d))) heard.push(line(d.at, d.text, firstRun.heardByDay(orders.name)));
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

  /* THE DEVICE'S CURRENCY WHERE NONE WAS TYPED, said on the line that became Money (`sayCurrency`). A PLACE THE SENTENCE
     NAMES BEATS THE DEVICE (first F9): "a candle shop in Leeds" keeps pounds on a laptop that keeps Cairo time. Only
     where the two differ, so a place that agrees with the clock changes nothing. It stands where the device would, so an
     amount typed with no currency is still asked about, and a sentence that keeps no money takes none. */
  const typed = read.declined === null ? read.currency : null;
  const placed = typed === null ? placeCurrency(said) : null;
  const device = ctx.currency?.trim().toUpperCase() ?? null;
  const loose = lines.some((h) => h.loose === true);
  const there = placed !== null && placed !== device ? currencyFor(null, modules, { currency: placed }, loose) : null;
  const currency = there ?? currencyFor(typed, modules, ctx, loose);
  const out = {
    name: name.name,
    usecase: u?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    modules,
    heard: typed === null ? sayCurrency(lines, modules, currency) : lines,
    ...(Object.keys(names).length === 0 ? {} : { names }),
  };
  return businessNotProject({
    ...out,
    currency,
    ...(typed === null && there === null && currency !== null ? { currencyBy: 'device' as const } : {}),
    rows,
    title: titleOf(said, name.name, rows),
    places: placesOf(out),
    by: 'rules',
  });
}

/* ── a client is somebody, never a project ──────────────────────────────── */

/** Whether the words call this name a client: "clients Fenwick and Acme", "Acme, a client", "for my client Fenwick". */
function calledClient(name: string, sentence: string): boolean {
  const n = name.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (n === '') return false;
  return new RegExp(`\\b(?:clients?|customers?)\\b[^.!?\\n]{0,60}?\\b${n}\\b|\\b${n}\\b[^.!?\\n]{0,24}?\\b(?:clients?|customers?)\\b`, 'iu').test(sentence);
}

/**
 * AN ENTRY FOR SOMEBODY THEY CALLED A CLIENT IS THAT CLIENT (1 Nov, a live run: "clients Fenwick and Acme" came back as
 * projects and as organisations drawn as "a project you are building"). A project so named becomes a person in People
 * with the role client, where People is kept; an organisation so named is kept as one, marked a client.
 */
export function clientNotProject(row: Proposal['rows'][number], sentence: string, modules: readonly string[]): Proposal['rows'][number] {
  const name = String(row.fields['name'] ?? '').trim();
  if (name === '' || !calledClient(name, sentence)) return row;
  if (row.register === 'things' && listById(PEOPLE, modules)) return { register: PEOPLE, fields: { name, role: 'client' } };
  if (row.register === 'organisations' && row.fields['kind'] === undefined) return { ...row, fields: { ...row.fields, kind: 'client' } };
  return row;
}

/* ── the model, first ──────────────────────────────────────────────────── */

/**
 * WHAT THE MODEL MAY CHOOSE FROM when the caller hands no catalogue: every use case and every module this build ships
 * (`offerOf` with none).
 */
export function setupOffer(): SetupOffer {
  return offerOf();
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
  /* THE NAME AS IT WAS TYPED, not as the model spelt it: a model that capitalised "hana" kept a name nobody wrote. */
  const typedAt = reply.name === null ? -1 : at(sentence, reply.name);
  const name =
    reply.name !== null && reply.name.length <= 60 && typedAt >= 0 && !OPENS_REFUSING.test(reply.name.trim()) ? sentence.slice(typedAt, typedAt + reply.name.length) : rules.name;
  /* A MODULE IS KEPT ONLY WHERE THE WORDS OR THE USE CASE ASKED FOR IT, so an answer that obeyed "install every add-on"
     inside the sentence installs what the sentence was about and no more. */
  const asked = reply.modules.filter((id) => known.has(id) && (rules.modules.length === 0 || rules.modules.includes(id) || (u !== null && modulesFor(u, []).includes(id))));
  /* AN ANSWER THAT CHOSE NOTHING AND DRAFTED NOTHING IS NO READING: the rules' stands, and where they read nothing either
     the words are the brief Slash drafts from (`outsideCatalogue`), as before there was a model. */
  if (u === null && asked.length === 0 && (reply.draft ?? '').trim() === '') return { ...rules, fell: 'PROPOSAL_EMPTY' };
  const named = name !== null && !asked.includes(PEOPLE) ? [...asked, PEOPLE] : asked;
  const modules = closeOver(u ? [...modulesFor(u, named).filter((id) => id !== CORE_PACK), ...beside.flatMap((b) => b.modules)] : withFirstList(named, null), offers);

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
  for (const one of reply.rows.slice(0, 5)) {
    /* A CLIENT IS SOMEBODY BEFORE ITS LIST IS LOOKED FOR (`clientNotProject`): Projects may not be kept at all. */
    const r = one.list === 'things' ? ((c) => ({ list: c.register, fields: c.fields }))(clientNotProject({ register: one.list, fields: one.fields }, sentence, modules)) : one;
    const list = listById(r.list, modules);
    const fields = list ? entryOf(list, r.fields, currency) : null;
    if (list && fields) rows.push(clientNotProject({ register: list.id, fields }, sentence, modules));
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
  return businessNotProject({
    ...out,
    currency,
    ...(!typed && ruled === null && currency !== null ? { currencyBy: 'device' as const } : {}),
    rows: kept,
    title: titleOf(who(sentence).bio, name, kept),
    places: placesOf(out),
    by: reply.by === '' || reply.by === 'rules' ? 'model' : reply.by,
    summary: summary === '' ? null : summary,
    draft: u === null && reply.draft !== null && reply.draft.trim() !== '' ? reply.draft.trim() : null,
  });
}

/**
 * What the words propose, read by the model where the host has one and by the rules where it has not, where the month's
 * asks are spent, or where the model did not answer in time. `ask` is `null` on a host with no model behind Slash.
 */
export async function proposeFirst(sentence: string, ctx: ProposeContext, ask: AskSetup | null, asked?: string): Promise<Proposal> {
  const rules = propose(sentence, ctx);
  if (ask === null || sentence.trim() === '') return rules;
  let out: Awaited<ReturnType<AskSetup>>;
  try {
    /* `asked`, IN A CONVERSATION (`chat.ts`): the questions so far, so the model reads each answer against its question. */
    out = await ask({ said: sentence, offer: ctx.offer ?? setupOffer(), today: todayIn(ctx.zone) ?? new Date().toISOString().slice(0, 10), ...(asked ? { asked } : {}) });
  } catch (e) {
    out = { ok: false, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } };
  }
  return out.ok ? { ...fromModel(out.value, sentence, ctx, rules), ask: askOf(out.value) } : { ...rules, fell: out.refusal.code };
}

/* ── the conversation, one turn at a time (1 Nov, lane onboard-speed) ──────── */

/**
 * WHAT THE CONVERSATION'S READINGS HAVE SAID SO FAR, WITH ONE MORE LAID ON. A turn (`quick`) answers only what the answers
 * point at and the next question, so it is laid over what came before it: the parts and the phrases are both readings',
 * a currency or a use case the later one names stands, and names, entries, a summary and a draft are the whole
 * reading's (`setup`), which a turn never carries. `next` asks the next question; `base` never does.
 */
export function mergeReplies(base: SetupReply | null, next: SetupReply): SetupReply {
  if (base === null) return next;
  const heard = [...base.heard];
  for (const h of next.heard) if (!heard.some((x) => x.phrase.toLocaleLowerCase() === h.phrase.toLocaleLowerCase())) heard.push(h);
  const whole = next.quick === true ? base : next;
  return {
    name: whole.name ?? base.name ?? next.name,
    summary: whole.summary !== '' ? whole.summary : base.summary,
    usecase: base.usecase ?? next.usecase,
    also: [...new Set([...base.also, ...next.also])],
    modules: [...new Set([...base.modules, ...next.modules])],
    currency: next.currency ?? base.currency,
    heard,
    names: whole.names.length > 0 ? whole.names : base.names,
    rows: whole.rows.length > 0 ? whole.rows : base.rows,
    draft: whole.draft ?? base.draft,
    by: next.by,
    ask: next.ask ?? null,
    ...(base.quick === true && next.quick === true ? { quick: true as const } : {}),
  };
}

/** A reading of the words from what the model said (`reply`), over the rules' reading of the same words. */
export function proposalOf(reply: SetupReply, sentence: string, ctx: ProposeContext): Proposal {
  return { ...fromModel(reply, sentence, ctx, propose(sentence, ctx)), ask: askOf(reply) };
}

/** What the door answered for these words, whole or one quick turn, as a result and never a throw. */
export async function askReply(sentence: string, ctx: ProposeContext, ask: AskSetup, asked: string | undefined, quick: boolean): Promise<Awaited<ReturnType<AskSetup>>> {
  try {
    return await ask({
      said: sentence,
      offer: ctx.offer ?? setupOffer(),
      today: todayIn(ctx.zone) ?? new Date().toISOString().slice(0, 10),
      ...(asked ? { asked } : {}),
      ...(quick ? { quick: true } : {}),
    });
  } catch (e) {
    return { ok: false, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } };
  }
}

/**
 * ONE TURN OF THE CONVERSATION, READ QUICKLY: the model's short answer for the answers so far (`quick`, about two seconds),
 * laid over what the conversation's readings already said (`base`, `mergeReplies`), and the reading that makes. `turn` is
 * the model's own answer, for the caller to lay on its base whenever it lands; `null` where the rules read it.
 */
export async function proposeTurn(
  sentence: string,
  ctx: ProposeContext,
  ask: AskSetup | null,
  asked: string | undefined,
  base: SetupReply | null,
): Promise<{ proposal: Proposal; turn: SetupReply | null }> {
  if (ask === null || sentence.trim() === '') return { proposal: propose(sentence, ctx), turn: null };
  const out = await askReply(sentence, ctx, ask, asked, true);
  if (!out.ok) return { proposal: { ...propose(sentence, ctx), fell: out.refusal.code }, turn: null };
  const merged = mergeReplies(base, out.value);
  return { proposal: proposalOf(merged, sentence, ctx), turn: out.value };
}
