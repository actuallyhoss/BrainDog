/**
 * What the first run says while the BrainDog builds: which parts are on and why, the one question left, the words the
 * person typed with what each became, and the currencies worth offering first.
 *
 * EVERY LINE IS READ OFF THE PROPOSAL, NEVER WRITTEN FOR IT. A part is on because a phrase asked for it, a use case
 * stands on it or the person turned it on; an entry is in a part because the sentence filled it; a currency is offered
 * because the person named it or this device is set to it, and the reason printed beside it is that fact. Nothing here
 * is a figure the record does not hold, and nothing here writes.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { firstPartyModule, moduleOfList } from '@braindog/seed/packs/modules';
import { listsOf as caseLists, MODULE_ORDER, USE_CASES } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { firstRun } from '../../lib/first-run.ts';
import { shape } from '../../lib/shape.ts';
import { partName, type Place, type Proposal } from '../../lib/start/propose.ts';
import { isGlyph, type IconName } from '../../lib/ui/icons.ts';
import { hear, PEOPLE } from '../../lib/who.ts';

/** One phrase heard and what it became, as `propose` says it. */
export type Said = Proposal['heard'][number];

/* ── words ─────────────────────────────────────────────────────────────── */

/** The words this screen adds to the first run's own (`lib/first-run.ts`). */
export const words = {
  /** The conversation's page title, and the summary's at its end (1 Nov). */
  talkTitle: "Let's make your BrainDog",
  summaryTitle: 'Your BrainDog, ready to make',
  summaryHead: 'What I will make',
  factName: 'Name',
  factFor: 'Set up as',
  factMoney: 'Money in',
  factMakes: 'Makes',
  forYou: 'Your own mix of parts',
  noCurrency: 'Not chosen yet',
  tellMore: 'Tell it more',
  /** The conversation's heading, and what the field under it is for. */
  talk: 'In your own words',
  /** Who is speaking in the conversation. */
  you: 'You',
  dog: 'BrainDog',
  /** The field after the first answer, which adds to what was said. */
  more: 'Add more, or correct it',
  moreGo: 'Add this',
  /** BrainDog's reply to a later turn: what it added, or that it added nothing. */
  adds: (items: readonly string[]) => `That adds ${firstRun.and(items)}.`,
  addsNothing: 'I heard nothing new to keep in that. It stays in what you said.',
  /** The build's line while the model reads what was said. */
  readingNow: 'Reading what you said',
  /** The build tile, before and after a part waits on an answer. */
  building: 'Your BrainDog, building',
  ready: 'Your BrainDog, ready',
  /** The build beside the words, headed by the record's name, or this before one is heard. */
  yours: 'Your BrainDog',
  asYouType: 'builds as you type',
  /** Under the places: nothing is drawn in them that the person did not say. */
  startsEmpty: 'Each place starts empty and fills with what you tell it. No sample entries.',
  /** Under a place the words named that waits for its first entry (Projects, Work): in the sidebar once it holds one. */
  forming: 'In your sidebar once you add the first',
  /** The build's reading line: what is on, and what waits. */
  onReading: (on: readonly string[], waiting: string | null) =>
    on.length === 0
      ? waiting
        ? `${waiting} waits on your answer.`
        : ''
      : `${firstRun.and(on)} ${on.length === 1 ? 'is' : 'are'} on${waiting ? `, and ${waiting} waits on your answer` : ''}.`,
  nothingSaved: 'Nothing is saved until you finish.',
  /** The build tile before a word is typed: one line, what will appear in it. */
  beforeTyping: 'Fills in as you type.',
  /** Why a part is on, as the meta at the right of its tile. */
  fromWords: 'from your words',
  byHand: 'turned on by you',
  waiting: 'waiting on you',
  /** A part's lists, as its tile's written line. */
  keeps: (lists: readonly string[]) =>
    lists.length === 0 ? '' : lists.length <= 3 ? `Keeps ${firstRun.and(lists)}.` : `Keeps ${lists.slice(0, 2).join(', ')} and ${lists.length - 2} more.`,
  /** The phrases that turned a part on. */
  because: (phrases: readonly string[]) => `You said ${firstRun.and(phrases.map((p) => `“${p}”`))}.`,
  /** Beside the use case chosen: opens the others to choose from. */
  changeCase: 'Change',
  /** The parts not on, as a group on the ground. */
  alsoHere: 'More it can keep',
  /** What an entry from the sentence is, beside its name, by the list it goes in. */
  project: 'A project you are building',
  organisation: 'An organisation',
  client: 'Client',
  tool: 'A tool you use',
  task: 'To do',
  /** Projects made with nothing in it yet, which the side of the screen shows from the first project on. */
  projectsWait: 'on the side once you add a project',
  /** The phone's sheet of the whole build, opened from the strip at the top of the talk (`FormingStrip`). */
  formingTitle: 'Your BrainDog',
  formingSub: 'Forming as we talk',
  /** Which way a bill's money goes, in the words Money's own list says it (`direction` on its bills). */
  moneyIn: 'Money in',
  moneyOut: 'Money out',
  due: (day: string) => `due ${day}`,
  /** The one question, its heading and what is said beside it. */
  oneQuestion: 'One question',
  cannotTell: 'your words cannot tell me this',
  noQuestion: 'Nothing left to ask. Finish when it looks right.',
  suggested: (label: string, name: string, why: string | null) => `${label}: ${name}.${why ? ` ${capital(why)}.` : ''}`,
  /** Keys printed beside the conversation's heading at 1440. */
  answerKeys: 'answer',
  finishKeys: 'finish',
  /** The question when nothing in the sentence could be placed. */
  closest: 'What is it closest to?',
  closestWhy: 'I could not place what you said yet. Pick the closest, or turn parts on by hand.',
  /** Why a currency is offered, each a fact about the words or this device. */
  saidCurrency: (said: readonly string[]) => `you said ${firstRun.and(said)}`,
  zoneCurrency: (city: string) => `this device keeps ${city} time`,
  localeCurrency: (region: string) => `this device is set to ${region}`,
  /** The currency sentence under the title, as the question's short form. */
  whichOf: (said: readonly string[]) => `which of ${firstRun.and(said)} is home`,
  whichCurrency: 'which currency your money is in',
  whatClosest: 'what it is closest to',
  /**
   * A FACT THE WORDS LEFT OUT OF A REPEATING AMOUNT THEY BEGAN, asked as a plain question (1 Nov: "Tell me how much, and on
   * which day of the month, and I will add Invoice." stood under a freelancer's summary for the word "invoices").
   */
  missing: (title: string, missing: readonly string[]) => {
    /* A KIND OF THING IS SAID WITH "the" ("the monthly invoice", "the rent"); a name stays as typed ("Netflix"). */
    const t = title.trim();
    const kind = /\s/u.test(t) || /^(?:rent|salary|invoice|retainer|subscription|mortgage|loan|bill|insurance|pay|wage)s?$/iu.test(t);
    const what = t === '' ? 'it' : kind ? `the ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
    if (missing.includes('amount') && missing.includes('due')) return `How much is ${what}, and on which day of the month is it due?`;
    return missing.includes('amount') ? `How much is ${what} each time?` : `On which day of the month is ${what} due?`;
  },
  /** The page a record opens on, among the pages it makes. */
  opensFirst: 'opens first',
  pagesIn: (pages: number, places: number) =>
    places <= 1 ? `${numberWord(pages, true)} ${pages === 1 ? 'page' : 'pages'}, drawn with examples.` : `${numberWord(pages, true)} pages in ${numberWord(places)} places on the side of the screen.`,
} as const;

/** The first letter up. */
export const capital = (s: string): string => (s === '' ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`);

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as a sentence says it: words up to ten, figures after. */
export function numberWord(n: number, first = false): string {
  const said = Number.isInteger(n) && n >= 0 && n < SMALL.length ? (SMALL[n] ?? String(n)) : String(n);
  return first ? capital(said) : said;
}

/* ── the parts ─────────────────────────────────────────────────────────── */

/**
 * THE GLYPH EACH PART WEARS IS THE ONE ITS OWN PAGE DECLARES, read off the part as the first run would install it: the
 * page it puts on the side of the screen, else its first list. The web names no part here, so a part the build gains
 * wears its own glyph the day it is declared (`tools/gates/web-lists.mjs`).
 */
const glyphs = new Map<string, IconName>();
export function partIcon(id: string): IconName {
  const had = glyphs.get(id);
  if (had) return had;
  const doc = moduleDocument(null, id, { today: '1970-01-01' });
  const raw = doc?.declarations;
  const decls = Array.isArray(raw) ? (raw.filter((d) => typeof d === 'object' && d !== null) as Record<string, unknown>[]) : [];
  const page = decls.find((d) => typeof d.page === 'string' && d.for === undefined && typeof d.icon === 'string');
  const list = decls.find((d) => typeof d.register === 'string' && typeof d.rule !== 'string' && typeof d.icon === 'string');
  const named = (page ?? list)?.icon;
  const icon: IconName = typeof named === 'string' && isGlyph(named) ? named : 'doc';
  glyphs.set(id, icon);
  return icon;
}

/** Why a part is on, or that it is not. */
export type PartState = 'heard' | 'held' | 'hand' | 'waiting' | 'off';

/** One entry the sentence fills, as a part's tile shows it. */
export type Entry = {
  key: string;
  title: string;
  kind: 'project' | 'person' | 'money';
  /** A person's role, a project's state or which way the money goes. */
  detail: string;
  amount: { minor: number; currency: string } | null;
  due: string | null;
};

export type Part = {
  id: string;
  name: string;
  icon: IconName;
  on: boolean;
  state: PartState;
  /** The use case or part that needs it, when that is why it cannot be turned off. */
  held: string | null;
  /** The phrases that turned it on, in sentence order. */
  why: string[];
  /** Where the first of them stands among everything heard, from 0; absent for a part no phrase turned on. */
  heardAt?: number;
  /**
   * WHERE A PART IS MADE BUT NOT YET A PLACE ON THE SIDE, what it waits for ("on the side once you add a project"):
   * Projects with no project in it, which the sidebar leaves out until the first one (`holdsProjects`).
   */
  waits?: string;
  entries: Entry[];
  /** What its lists are called. */
  lists: string[];
  blurb: string;
};

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string';

/** An entry the sentence fills, in the words its tile says. */
export function entryOf(row: Proposal['rows'][number]): Entry {
  const f = row.fields;
  const title = String(f.what ?? f.name ?? '');
  /* WHICH KIND OF ENTRY IT IS, from what it holds: money has a direction, a person is in People. */
  if (typeof f.direction === 'string') {
    const amount = isMoney(f.amount) ? { minor: f.amount.amount, currency: f.amount.currency } : null;
    return {
      key: `${row.register}:${title}`,
      title,
      kind: 'money',
      detail: f.direction === 'owed_to_me' ? words.moneyIn : words.moneyOut,
      amount,
      due: typeof f.due === 'string' ? f.due : null,
    };
  }
  if (row.register === PEOPLE) {
    /* A HOUSEHOLD'S PERSON IS SAID BY THE WORD THEY USED ("Sam, partner"), kept as the note (`householdPeople`). */
    const own = f.role === 'family' || f.role === 'friend' || f.role === 'landlord' || f.role === 'other' || f.role === 'contractor' ? (typeof f.note === 'string' && f.note.length <= 20 ? f.note : '') : '';
    const role = own !== '' ? own : typeof f.role === 'string' ? capital(f.role) : '';
    return { key: `${row.register}:${title}`, title, kind: 'person', detail: role, amount: null, due: null };
  }
  /* AN ORGANISATION IS SOMEBODY THEY WORK WITH, never a project (1 Nov: clients the model wrote as organisations stood
     under People as "a project you are building"); a client where the words said so. A TOOL IS ONE THEY USE, and a task
     a thing to do. Only the projects list says project. */
  if (row.register === 'organisations') {
    const role = typeof f.role === 'string' ? capital(f.role) : typeof f.kind === 'string' ? capital(f.kind) : words.organisation;
    return { key: `${row.register}:${title}`, title, kind: 'person', detail: role, amount: null, due: null };
  }
  if (row.register === 'tools') return { key: `${row.register}:${title}`, title, kind: 'project', detail: words.tool, amount: null, due: null };
  if (row.register === 'tasks') return { key: `${row.register}:${title}`, title, kind: 'project', detail: words.task, amount: null, due: null };
  return { key: `${row.register}:${title}`, title, kind: 'project', detail: row.register === 'things' ? words.project : '', amount: null, due: null };
}

/**
 * A use case as a part: the lists and pages it carries, the phrases that pointed at it, and its own summary. It has no
 * switch; the conversation's "Make it for" choices are how a person changes it.
 */
export function casePart(u: { usecase: string; title: string; summary: string; pack: Record<string, unknown> | null }, heard: readonly Said[], byHand: boolean): Part {
  const raw = u.pack?.declarations;
  const decls: unknown[] = Array.isArray(raw) ? raw : [];
  const lists: string[] = [];
  for (const d of decls) {
    if (typeof d !== 'object' || d === null) continue;
    const one = d as Record<string, unknown>;
    if (typeof one.rule === 'string' || typeof one.script === 'string' || typeof one.ingest === 'string') continue;
    if (typeof one.register === 'string') lists.push(typeof one.name === 'string' ? one.name : one.register);
  }
  /* A PHRASE IS THE USE CASE'S where it says its title or one of its lists: "a small candle shop" became Orders and Products. */
  const why = phrasesFor([u.title, ...lists], heard);
  return { id: `usecase-${u.usecase}`, name: u.title, icon: 'home', on: true, state: why.length === 0 && byHand ? 'hand' : 'heard', held: null, why, ...heardAt(why, heard), entries: [], lists, blurb: u.summary };
}

/**
 * The glyph for what a phrase became: the part it names first, by its name or the person's word for one of its lists
 * (`names`, Clients for People); a use case's list by its own glyph (Orders); a use case's home; or Money's for an amount.
 */
export function iconOfBecame(became: string, names: Readonly<Record<string, string>> = {}): IconName {
  if (became === firstRun.shapeNoCurrency) return 'money';
  const first = became.split(/,\s*|\s+and\s+/u)[0] ?? '';
  const renamed = Object.entries(names).find(([, word]) => word === first)?.[0];
  /* BY THE NAME ITS PLACE HAS TOO (`partName`): a line says Projects, never the pack's Portfolio. */
  const id = MODULE_ORDER.find((m) => moduleName(m) === first || partName(m) === first) ?? (renamed === undefined ? undefined : moduleOfList(renamed)?.id);
  if (id !== undefined) return partIcon(id);
  const list = USE_CASES.flatMap((u) => caseLists(u).map((l) => [l.id, u.labels[l.id] ?? l.name] as const)).find(([, word]) => word === first)?.[0];
  return list === undefined ? 'home' : placeIcon({ kind: 'list', id: list });
}

/** The phrases heard for one part: the ones whose "became" names it, by any of the words it goes by. */
function phrasesFor(name: string | readonly string[], heard: readonly Said[]): string[] {
  const words = typeof name === 'string' ? [name] : name;
  const out: string[] = [];
  for (const h of heard) {
    const became = h.became.split(/,\s*|\s+and\s+/u);
    if (became.some((w) => words.includes(w)) && !out.includes(h.phrase)) out.push(h.phrase);
  }
  return out;
}

/** Words for where money comes from, which People heard is not about anybody kept there. */
const MONEY_WORDS = /\b(?:sponsors?(?:hips?)?|brand deals?|ads?|adsense|subs|subscribers|payouts?|revenue|income|sales|invoices?|salary|royalt(?:y|ies)|donations?|tips?|merch)\b/iu;

/**
 * A PART'S PHRASES WITH THE ONE IT IS SAID TO COME FROM FIRST (onboarding7, the creator walk: People said "from: YouTube
 * ads and a few sponsors" over Kai and Rosa, the editors). A phrase naming somebody or something the part holds comes
 * first; for People, a phrase about where money comes from comes last. Otherwise the order they were heard in.
 */
function saidFirst(id: string, why: readonly string[], entries: readonly Entry[]): string[] {
  const names = entries.map((e) => e.title.toLocaleLowerCase()).filter((t) => t.length > 1);
  const named = (lower: string, n: string): boolean => {
    const at = lower.indexOf(n);
    return at >= 0 && !/\p{L}/u.test(lower.charAt(at - 1)) && !/\p{L}/u.test(lower.charAt(at + n.length));
  };
  const score = (phrase: string): number => {
    const lower = phrase.toLocaleLowerCase();
    if (names.some((n) => named(lower, n))) return 0;
    return id === 'people' && MONEY_WORDS.test(phrase) ? 2 : 1;
  };
  return why.map((w, i) => ({ w, i, s: score(w) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.w);
}

/** Where a part's first phrase stands among everything heard, for the order the build is drawn in. */
function heardAt(why: readonly string[], heard: readonly Said[]): { heardAt?: number } {
  const at = why.length === 0 ? -1 : heard.findIndex((h) => h.phrase === why[0]);
  return at < 0 ? {} : { heardAt: at };
}

export type PartsIn = {
  /** Every part on offer, in install order. */
  offered: readonly string[];
  /** The parts that will be made. */
  modules: readonly string[];
  heard: readonly Said[];
  rows: Proposal['rows'];
  /** Why a part cannot be turned off, or `null`. */
  heldBy: (id: string) => string | null;
  /** The parts the person turned on themselves. */
  byHand: ReadonlySet<string>;
  /** The part that waits on the open question, or `null`. */
  waiting: string | null;
  /** The person's word for a list, by list id (`Proposal.names`): a part is also said by it, Clients for People. */
  names?: Readonly<Record<string, string>> | undefined;
};

/** Every part on offer, each with why it is on and what it will hold. */
export function partsOf(p: PartsIn): Part[] {
  return p.offered.map((id): Part => {
    const name = moduleName(id);
    const info = firstPartyModule(id);
    const on = p.modules.includes(id);
    const renamed = Object.entries(p.names ?? {}).flatMap(([list, word]) => (moduleOfList(list)?.id === id ? [word] : []));
    /* A LINE SAYS THE PART BY THE NAME ITS PLACE HAS (`partName`, Projects for Portfolio), so its why is found by that too. */
    const why = phrasesFor([...new Set([name, partName(id, p.names), ...renamed])], p.heard);
    const held = p.heldBy(id);
    /* A PART THAT CANNOT BE TURNED OFF SAYS WHO NEEDS IT before why it was heard, so a still switch has its reason. */
    const state: PartState = !on ? 'off' : id === p.waiting ? 'waiting' : held !== null ? 'held' : why.length > 0 ? 'heard' : p.byHand.has(id) ? 'hand' : 'heard';
    const entries = on ? p.rows.flatMap((r) => (moduleOfList(r.register)?.id === id ? [entryOf(r)] : [])) : [];
    const lists = (info?.registers ?? []).map((r) => info?.titles[r] ?? r);
    /* THE PHRASE A PART SAYS IT CAME FROM names what it holds, where one does (`saidFirst`); it is still drawn where
       its first phrase was heard. */
    return { id, name, icon: partIcon(id), on, state, held, why: saidFirst(id, why, entries), ...heardAt(why, p.heard), entries, lists, blurb: info?.blurb ?? '' };
  });
}

/**
 * THE BUILD, AS IT IS DRAWN: only the parts that are on, in the order they were heard. A part a phrase turned on stands
 * where its first phrase does; one that is on for another reason (a use case needs it, or the person turned it on)
 * comes after, in the order it was offered. A part left off is not here at all, so nothing reads as a step not yet
 * taken, and nothing totals them.
 */
export function stepsOf(parts: readonly Part[]): Part[] {
  const on = parts.filter((p) => p.on);
  return [...on.filter((p) => p.heardAt !== undefined).sort((a, b) => (a.heardAt ?? 0) - (b.heardAt ?? 0)), ...on.filter((p) => p.heardAt === undefined)];
}

/* ── the sentence under the title ─────────────────────────────────────── */

/** The sentence cut round the phrase that needs him, as the page head draws one. */
export type Sentence = { before: string; needs: string; after: string };

/**
 * "One question left: which of pounds and dollars is home." The phrase that needs him is the open question, and only
 * that; with none, the sentence says there is nothing left to ask, or, where the caller says nothing is on (`empty`),
 * how to make something. It says what waits on an answer and takes no number: there is no total to say.
 */
export function statusOf(question: string | null, empty = false): Sentence {
  if (question) return { before: '', needs: 'One question left', after: `: ${question}.` };
  return { before: empty ? `Nothing is on yet. ${firstRun.makeSomething}` : words.noQuestion, needs: '', after: '' };
}

/* ── the places ───────────────────────────────────────────────────────── */

/**
 * THE GLYPH A PLACE WEARS: Today's own, a part's (`partIcon`), or the one its use case declares on the list, so a
 * shop's Orders wears the glyph its page will. A list nothing declares a glyph for is a document.
 */
export function placeIcon(place: Pick<Place, 'kind' | 'id'>): IconName {
  if (place.kind === 'today') return 'today';
  if (place.kind === 'module') return partIcon(place.id);
  for (const u of USE_CASES) {
    const raw = u.pack?.declarations;
    /* A LIST, OR THE PAGE A USE CASE'S PLACE OPENS ON (`railPlaces`): a student's Studies wears its page's glyph. */
    const decl = (Array.isArray(raw) ? raw : []).find(
      (d): d is Record<string, unknown> => typeof d === 'object' && d !== null && ((d as { register?: unknown }).register === place.id || (d as { page?: unknown }).page === place.id),
    );
    if (decl && typeof decl.icon === 'string' && isGlyph(decl.icon)) return decl.icon;
  }
  return 'doc';
}

/**
 * Where things will be kept, Today first, for a reading that names none (an older one, or before the first word): Today,
 * then each part that is on. Each starts empty.
 */
export function placesFrom(places: readonly Place[] | undefined, parts: readonly Part[]): Place[] {
  if (places && places.length > 0) return [...places];
  const today: Place = { kind: 'today', id: 'today', name: 'Today', phrase: null, at: null };
  return [today, ...[...parts.filter((p) => p.on && p.state !== 'waiting'), ...parts.filter((p) => p.on && p.state === 'waiting')].filter((p) => !p.id.startsWith('usecase-')).map((p): Place => ({ kind: 'module', id: p.id, name: p.name, phrase: p.why[0] ?? null, at: null }))];
}

/* ── the words, marked ────────────────────────────────────────────────── */

/** A run of what was said: plain, or a phrase that became something. */
export type Run = { text: string; became: string | null };

/**
 * What was said, cut into runs, with each phrase heard marked by what it became. The phrases come in sentence order, so
 * each is looked for after the last one found; one that is not there (the reader trims a name's full stop) is skipped
 * rather than guessed at.
 *
 * A PHRASE FOLDED INTO A LINE AND SAID APART (`more`) LIGHTS TOO, as what the line became. Its place is trusted only when
 * the line's own place holds its phrase in this very sentence: a later turn is drawn on its own, and a span measured in
 * another sentence would light the wrong words.
 */
export function marksIn(sentence: string, heard: readonly Said[], name: string | null): Run[] {
  const found: { at: number; end: number; became: string }[] = [];
  let from = 0;
  const mark = (phrase: string, became: string) => {
    if (phrase === '') return;
    const at = sentence.indexOf(phrase, from);
    if (at < 0) return;
    found.push({ at, end: at + phrase.length, became });
    from = at + phrase.length;
  };
  if (name) mark(name, firstRun.heardName(name));
  /* THE NAME IS ALSO A HEARD LINE (`you`), marked once above: marking it again would light a second saying of the name
     as `you`, or mark the same words twice. */
  for (const h of heard) if (h.you !== true) mark(h.phrase, h.became);
  for (const h of heard) {
    if (h.you === true || h.at === undefined || h.more === undefined || sentence.slice(h.at[0], h.at[1]) !== h.phrase) continue;
    for (const [at, end] of h.more) if (at >= 0 && end > at && end <= sentence.length) found.push({ at, end, became: h.became });
  }
  const out: Run[] = [];
  let done = 0;
  for (const m of found.sort((a, b) => a.at - b.at)) {
    if (m.at < done) continue;
    if (m.at > done) out.push({ text: sentence.slice(done, m.at), became: null });
    out.push({ text: sentence.slice(m.at, m.end), became: m.became });
    done = m.end;
  }
  if (done < sentence.length) out.push({ text: sentence.slice(done), became: null });
  return out;
}

/** The phrases heard now that were not heard before, which is what a later turn added. */
export function added(before: readonly Said[], after: readonly Said[]): Said[] {
  const had = new Set(before.map((h) => `${h.phrase}\u0000${h.became}`));
  return after.filter((h) => !had.has(`${h.phrase}\u0000${h.became}`));
}

/** A later turn joined onto what was said, as its own sentence. */
export function joinTurns(was: string, more: string): string {
  const a = was.trimEnd();
  const b = more.trim();
  if (a === '') return b;
  if (b === '') return a;
  return /[.!?;:,]$/u.test(a) ? `${a} ${b}` : `${a}. ${b}`;
}

/** Entries the sentence began and left a fact out of, with the facts it needs. */
export function missingIn(sentence: string, today: string): { title: string; missing: string[] }[] {
  const read = shape(hear(sentence).bio, today);
  if (read.declined !== null) return [];
  return read.rows.filter((r) => r.missing.length > 0).map((r) => ({ title: String(r.fields.what ?? r.fields.name ?? ''), missing: [...r.missing] }));
}

/* ── the currency ─────────────────────────────────────────────────────── */

/**
 * What the device and the language can say about a currency, handed in so the choice is testable: every currency the
 * browser knows, its name for the person and in English (to match the words they typed), the regions of their
 * languages, their time zone, and the zones a region keeps (`Intl.Locale` `getTimeZones`, where the browser has it).
 */
export type CurrencyEnv = {
  codes: readonly string[];
  nameOf: (code: string) => string;
  englishOf: (code: string) => string;
  /** The regions of the person's languages, first language first: `['US']` for `en-US`. */
  regions: readonly string[];
  zone: string | null;
  zonesOf: (region: string) => readonly string[] | null;
  regionName: (region: string) => string;
};

export type CurrencyChoice = { code: string; name: string; why: string | null };

export type CurrencyAsk = {
  choices: CurrencyChoice[];
  /** The one suggested, or `null` when no fact points at one. */
  suggested: string | null;
  /** The currency words the person typed, as typed ("pounds"). */
  said: string[];
  /** A word the person typed that names several currencies none of the facts picks between, to search for. */
  find: string | null;
};

/* A currency's last word that is also an everyday English word is never read as the currency: "a real business" is
   not the Brazilian real, "we won" is not the Korean won. */
const EVERYDAY = new Set(['real', 'won', 'mark', 'rand', 'sol', 'som', 'sum', 'lev', 'leu', 'kip', 'dong', 'pula', 'tala', 'vatu', 'dram', 'lari', 'kina', 'lats']);
/* What people call two currencies in speech. */
const SLANG: Readonly<Record<string, string>> = { bucks: 'dollar', buck: 'dollar', quid: 'pound' };

/** The word a currency is called by, from its English name: "Egyptian Pound" is a pound. */
const wordOf = (english: string): string => (english.trim().split(/\s+/u).at(-1) ?? '').toLowerCase();

/**
 * The zone as the browser names it, so a zone typed under its newer name (`Asia/Kolkata`) is found among a region's
 * zones listed under the older one (`Asia/Calcutta`). The zone as given where the browser does not know it.
 */
function canonicalZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/**
 * The currencies of the region whose time this device keeps: each currency whose region lists the zone. A zone in
 * Europe whose region has no currency of its own is the euro's.
 */
function zonedCodes(env: Pick<CurrencyEnv, 'codes' | 'zone' | 'zonesOf'>): Set<string> {
  const zoned = new Set<string>();
  if (env.zone === null) return zoned;
  const names = new Set([env.zone, canonicalZone(env.zone)]);
  for (const code of env.codes) if (env.zonesOf(code.slice(0, 2))?.some((z) => names.has(z) || names.has(canonicalZone(z)))) zoned.add(code);
  if (zoned.size === 0 && env.zone.startsWith('Europe/') && env.codes.includes('EUR')) zoned.add('EUR');
  return zoned;
}

/**
 * THE ONE CURRENCY OF THE REGION THE ZONE KEEPS, the fact `currencyChoices` weighs at 2: EGP for `Africa/Cairo`, the
 * euro for `Europe/Berlin`. `null` for no zone, a zone no region keeps (`UTC`), or a region that keeps two (`America/Havana`),
 * since a currency is taken from a device only where it is the only one. `env` is the browser's when not handed in.
 */
export function zoneCurrency(zone: string | null, env: Pick<CurrencyEnv, 'codes' | 'zonesOf'> = browserCurrencyEnv('en', [], zone)): string | null {
  if (zone === null || zone.trim() === '') return null;
  const zoned = zonedCodes({ codes: env.codes, zonesOf: env.zonesOf, zone });
  return zoned.size === 1 ? ([...zoned][0] ?? null) : null;
}

/** The city of a time zone, as a person says it: `America/New_York` keeps New York time. */
export const cityOf = (zone: string): string => (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ');

/**
 * The currencies worth offering first, and the one to suggest, each with the fact it stands on.
 *
 * THREE FACTS, WEIGHED: a currency the person named (3), the one of the region whose time this device keeps (2), and the
 * one of the region their language is set to (1). A named word that fits several currencies ("pounds") counts only for
 * the ones a device fact also points at; with none, it is offered as a search rather than guessed at. A zone in Europe
 * whose region has no currency of its own is the euro's.
 *
 * WHAT WAS SAID OUTRANKS THE DEVICE: a suggestion is only ever a currency the person named, when they named any.
 */
export function currencyChoices(said: string, env: CurrencyEnv, most = 3): CurrencyAsk {
  const byWord = new Map<string, string[]>();
  for (const code of env.codes) {
    const w = wordOf(env.englishOf(code));
    if (w.length < 3 || EVERYDAY.has(w)) continue;
    const list = byWord.get(w) ?? [];
    list.push(code);
    byWord.set(w, list);
  }

  const saidWords: string[] = [];
  const named = new Map<string, number>();
  const tokens = said.match(/\p{L}+/gu) ?? [];
  for (const token of tokens) {
    const t = token.toLowerCase();
    const base = SLANG[t] ?? (byWord.has(t) ? t : t.endsWith('s') && byWord.has(t.slice(0, -1)) ? t.slice(0, -1) : null);
    const codes = base === null ? undefined : byWord.get(base);
    if (!codes || saidWords.includes(token)) continue;
    saidWords.push(token);
    for (const c of codes) named.set(c, codes.length);
  }

  const zoned = zonedCodes(env);
  const spoken = new Set<string>();
  for (const region of env.regions.slice(0, 1)) for (const code of env.codes) if (code.startsWith(region)) spoken.add(code);

  type Scored = { code: string; score: number; named: boolean; why: string[] };
  const scored: Scored[] = [];
  for (const code of env.codes) {
    const ways = named.get(code);
    const device = zoned.has(code) || spoken.has(code);
    const isNamed = ways !== undefined && (ways === 1 || device);
    let score = 0;
    const why: string[] = [];
    if (isNamed) {
      score += 3;
      const which = saidWords.filter((w) => {
        const t = w.toLowerCase();
        const base = SLANG[t] ?? (byWord.has(t) ? t : t.slice(0, -1));
        return byWord.get(base)?.includes(code) ?? false;
      });
      why.push(words.saidCurrency(which));
    }
    if (zoned.has(code) && env.zone !== null) {
      score += 2;
      why.push(words.zoneCurrency(cityOf(env.zone)));
    }
    if (spoken.has(code)) {
      score += 1;
      const region = env.regions[0];
      if (region && !zoned.has(code)) why.push(words.localeCurrency(env.regionName(region)));
    }
    if (score > 0) scored.push({ code, score, named: isNamed, why });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.named) - Number(a.named) || env.nameOf(a.code).localeCompare(env.nameOf(b.code)));

  const choices = scored.slice(0, most).map((s) => ({ code: s.code, name: env.nameOf(s.code), why: s.why.length > 0 ? s.why.join(' and ') : null }));
  const anyNamed = scored.some((s) => s.named);
  const top = scored[0];
  const suggested = top && (saidWords.length === 0 || top.named) ? top.code : null;
  /* A WORD THAT NAMED SEVERAL AND WON NONE OF THE CHOICES is searched for, so its currencies are one press away. */
  const loose = saidWords.find((w) => {
    const t = w.toLowerCase();
    const base = SLANG[t] ?? (byWord.has(t) ? t : t.slice(0, -1));
    const codes = byWord.get(base) ?? [];
    return codes.length > 1 && !codes.some((c) => choices.some((ch) => ch.code === c && scored.find((s) => s.code === c)?.named));
  });
  const find = loose === undefined ? null : (SLANG[loose.toLowerCase()] ?? (byWord.has(loose.toLowerCase()) ? loose.toLowerCase() : loose.toLowerCase().slice(0, -1)));
  return { choices, suggested: anyNamed || saidWords.length === 0 ? suggested : null, said: saidWords, find };
}

/**
 * The browser's own answers for `currencyChoices`: its currencies, their names, the person's language regions and the
 * zones a region keeps. Every call is guarded, because a browser that lacks one of them still gets the others.
 */
export function browserCurrencyEnv(locale: string, languages: readonly string[], zone: string | null): CurrencyEnv {
  let codes: string[] = [];
  try {
    codes = Intl.supportedValuesOf('currency');
  } catch {
    codes = [];
  }
  const namer = (lang: string, type: 'currency' | 'region'): Intl.DisplayNames | null => {
    try {
      return new Intl.DisplayNames([lang], { type });
    } catch {
      return null;
    }
  };
  const own = namer(locale, 'currency');
  const english = namer('en', 'currency');
  const regionNames = namer(locale, 'region');
  const regions: string[] = [];
  for (const tag of [locale, ...languages]) {
    try {
      const r = new Intl.Locale(tag).maximize().region;
      if (r && !regions.includes(r)) regions.push(r);
    } catch {
      /* a tag the browser cannot read names no region */
    }
  }
  return {
    codes,
    nameOf: (c) => own?.of(c) ?? c,
    englishOf: (c) => english?.of(c) ?? c,
    regions,
    zone,
    zonesOf: (region) => {
      try {
        const l = new Intl.Locale(`und-${region}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
        return l.getTimeZones?.() ?? l.timeZones ?? null;
      } catch {
        return null;
      }
    },
    regionName: (r) => regionNames?.of(r) ?? r,
  };
}

/* ── the passkey, straight after the link ─────────────────────────────── */

/**
 * WHAT THIS DEVICE IS CALLED, as the passkey is named (`platformLabel` in `lib/auth.ts`): "this iPhone", "this
 * Mac", or Windows Hello by its own name. A device the label cannot tell is "this device".
 */
export function deviceWord(label: string): { name: string; it: string } {
  if (label === '' || label === 'Passkey') return { name: 'this device', it: 'This device' };
  if (label === 'Windows Hello') return { name: label, it: label };
  return { name: `this ${label}`, it: `This ${label}` };
}

/**
 * The passkey ask, in the words of the device it is made on (use case 6, step 4: "this phone signs you in with its own
 * lock, with no password to remember"). One press makes it; "Not now" leaves it for Settings.
 */
export function passkeyAsk(label: string): { title: string; why: string; press: string; later: string; kept: string } {
  const d = deviceWord(label);
  return {
    title: `Sign in with ${d.name} from now on`,
    why: `${d.it} signs you in with its own lock, with no password to remember and no email to wait for.`,
    press: `Use ${d.name}`,
    later: 'Not now',
    kept: `Done. ${d.it} signs you in now.`,
  };
}

/**
 * WHETHER THE PASSKEY IS OFFERED: the host offers passkeys, somebody is signed in, this is their first run with none
 * yet (`firstRun`, `packages/ports/src/auth.ts`), and this page can make one. Anybody else never sees it.
 */
export function passkeyOffered(
  can: { webauthn: boolean; secure: boolean },
  host: { ok: true; value: { passkey: boolean; me: unknown; firstRun?: boolean | undefined } } | { ok: false },
): boolean {
  return can.webauthn && can.secure && host.ok && host.value.passkey && host.value.me !== null && host.value.firstRun === true;
}

/* ── the making ───────────────────────────────────────────────────────── */

/** One tile of the build after the press: the part's own glyph and name, and the phrase that turned it on. */
export type MakingPart = Pick<Part, 'id' | 'name' | 'icon'> & { why?: readonly string[] };

/** Where one part is: being made, made, or not made, with the record's own sentence for why. */
export type Making = 'making' | 'made' | { refused: string };

/** What a record holds of an add-on, as `packs` answers it: its id, and when it was turned off. */
export type Held = { id: string; disabled_at: string | null };

/** What `setup` could not make: the part, and the record's sentence. */
export type Refused = { part: string; why: string };

/** What the making step says. No count and no bar: each tile says its own state, and that is all there is to say. */
export const making = {
  title: 'Making your BrainDog',
  line: 'Each part is made in turn. Today opens when the last one is in.',
  /** Once the record has answered and something was refused: what was made stays, and the rest can be asked for again. */
  partTitle: 'Some of it could not be made',
  partLine: 'What was made stays. Go back to ask again for the rest.',
  back: 'Go back',
  making: 'Making',
  made: 'Made',
  notMade: 'Not made',
  /** Where the record refused a part and gave no sentence of its own. */
  noReason: 'It was left as it was. Everything else stays.',
} as const;

/** How often the page reads what the record holds while `setup` runs, in milliseconds. */
export const MAKING_EVERY = 400;

/**
 * EACH PART'S STATE, READ FROM THE RECORD AND NEVER GUESSED. A part is made once the record holds its add-on, on
 * (`held`, read while `setup` runs); it is refused where the call's answer says so (`answer`, `null` until the call
 * answers), in the record's own sentence; and until one of those it is being made. Once the call has answered, a part
 * it did not refuse is made: the answer is the record's word, and it is newer than the last reading.
 *
 * A part is its add-on by the id they share: `people`, `money-core`, and `usecase-shop` for a use case, which the
 * answer may also say by the use case's bare id.
 */
export function makingStates(parts: readonly MakingPart[], held: readonly Held[], answer: readonly Refused[] | null): Record<string, Making> {
  const on = new Set(held.filter((h) => h.disabled_at === null).map((h) => h.id));
  const out: Record<string, Making> = {};
  for (const p of parts) {
    const bare = p.id.startsWith('usecase-') ? p.id.slice('usecase-'.length) : p.id;
    const refused = answer?.find((f) => f.part === p.id || f.part === bare);
    out[p.id] = refused ? { refused: refused.why.trim() === '' ? making.noReason : refused.why } : on.has(p.id) || answer !== null ? 'made' : 'making';
  }
  return out;
}

/**
 * READ WHAT THE RECORD HOLDS, AGAIN AND AGAIN, UNTIL TOLD TO STOP: once now, then `every` milliseconds after each
 * reading comes back, so a slow record is never asked twice at once. A reading that fails says nothing and the last one
 * stands. Answers the stop, which the page calls when `setup` answers; nothing is handed over after it.
 */
export function watchHeld(read: () => Promise<readonly Held[] | null>, on: (held: readonly Held[]) => void, every: number = MAKING_EVERY): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const turn = async () => {
    const held = await read().catch(() => null);
    if (stopped) return;
    if (held) on(held);
    timer = setTimeout(() => void turn(), every);
  };
  void turn();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
