/**
 * What the first run says while the BrainDog builds: which parts are on and why, the one question left, the words the
 * person typed with what each became, and the currencies worth offering first (`loop/design/SCREENS.md`, Start).
 *
 * EVERY LINE IS READ OFF THE PROPOSAL, NEVER WRITTEN FOR IT. A part is on because a phrase asked for it, a use case
 * stands on it or the person turned it on; an entry is in a part because the sentence filled it; a currency is offered
 * because the person named it or this device is set to it, and the reason printed beside it is that fact. Nothing here
 * is a figure the record does not hold, and nothing here writes.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { firstPartyModule, moduleOfList } from '@braindog/seed/packs/modules';
import { MODULE_ORDER } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';

import { firstRun } from '../../lib/first-run.ts';
import { shape } from '../../lib/shape.ts';
import type { Proposal } from '../../lib/start/propose.ts';
import { isGlyph, type IconName } from '../../lib/ui/icons.ts';
import { hear, PEOPLE } from '../../lib/who.ts';

/** One phrase heard and what it became, as `propose` says it. */
export type Said = Proposal['heard'][number];

/* ── words ─────────────────────────────────────────────────────────────── */

/** The words this screen adds to the first run's own (`lib/first-run.ts`). */
export const words = {
  /** The conversation's heading, and what the field under it is for. */
  talk: 'In your own words',
  /** Who is speaking in the conversation. */
  you: 'You',
  dog: 'BrainDog',
  /** The field after the first answer, which adds to what was said. */
  more: 'Tell it more, or correct anything',
  moreGo: 'Add this',
  /** BrainDog's reply to a later turn: what it added, or that it added nothing. */
  adds: (items: readonly string[]) => `That adds ${firstRun.and(items)}.`,
  addsNothing: 'I heard nothing new to keep in that. It stays in what you said.',
  /** The live line under the field while the sentence is typed. */
  hearing: 'Heard so far',
  /** The build tile, before and after a part waits on an answer. */
  building: 'Your BrainDog, building',
  ready: 'Your BrainDog, ready',
  parts: (on: number, total: number) => `${on} of ${total}`,
  /** Under the build's progress, before anything was typed. */
  lightsUp: 'Each part lights up as I hear it.',
  /** The progress bar's reading line: what is on, and what waits. */
  onReading: (on: readonly string[], waiting: string | null) =>
    on.length === 0
      ? waiting
        ? `${waiting} waits on your answer.`
        : ''
      : `${firstRun.and(on)} ${on.length === 1 ? 'is' : 'are'} on${waiting ? `, and ${waiting} waits on your answer` : ''}.`,
  nothingSaved: 'Nothing is saved until you finish.',
  /** The progress bar read aloud. */
  progress: (on: readonly string[], waiting: string | null, off: readonly string[]) =>
    [
      on.length === 0 ? 'No part is on yet' : `On: ${firstRun.and(on)}`,
      waiting ? `${waiting} waits on your answer` : '',
      off.length === 0 ? '' : `off: ${firstRun.and(off)}`,
    ]
      .filter((s) => s !== '')
      .join('; ') + '.',
  /** Why a part is on, as the meta at the right of its tile. */
  fromWords: 'from your words',
  byHand: 'turned on by you',
  waiting: 'waiting on you',
  /** A part's lists, as its tile's written line. */
  keeps: (lists: readonly string[]) =>
    lists.length === 0 ? '' : lists.length <= 3 ? `Keeps ${firstRun.and(lists)}.` : `Keeps ${lists.slice(0, 2).join(', ')} and ${lists.length - 2} more.`,
  /** The phrases that turned a part on. */
  because: (phrases: readonly string[]) => `You said ${firstRun.and(phrases.map((p) => `“${p}”`))}.`,
  /** The parts not on, as a group on the ground. */
  alsoHere: 'More it can keep',
  /** What an entry from the sentence is, beside its name. */
  project: 'A project you are building',
  owedToYou: 'Owed to you',
  owedByYou: 'You owe it',
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
  /** A fact the sentence left out of an entry it began. */
  missing: (title: string, missing: readonly string[]) => {
    const both = missing.includes('amount') && missing.includes('due');
    const what = both ? 'how much, and on which day of the month' : missing.includes('amount') ? 'how much' : 'which day of the month it falls due';
    return `Tell me ${what}, and I will add ${title}.`;
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
  kind: 'project' | 'person' | 'owed';
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
      kind: 'owed',
      detail: f.direction === 'owed_to_me' ? words.owedToYou : words.owedByYou,
      amount,
      due: typeof f.due === 'string' ? f.due : null,
    };
  }
  if (row.register === PEOPLE) {
    const role = typeof f.role === 'string' ? capital(f.role) : '';
    return { key: `${row.register}:${title}`, title, kind: 'person', detail: role, amount: null, due: null };
  }
  return { key: `${row.register}:${title}`, title, kind: 'project', detail: words.project, amount: null, due: null };
}

/**
 * A use case as a part: the lists and pages it carries, the phrases that pointed at it, and its own summary. It has no
 * switch; the conversation's "Make it for" choices are how a person changes it.
 */
export function casePart(u: { usecase: string; title: string; summary: string; pack: Record<string, unknown> | null }, heard: readonly Said[], byHand: boolean): Part {
  const why = phrasesFor(u.title, heard);
  const raw = u.pack?.declarations;
  const decls: unknown[] = Array.isArray(raw) ? raw : [];
  const lists: string[] = [];
  for (const d of decls) {
    if (typeof d !== 'object' || d === null) continue;
    const one = d as Record<string, unknown>;
    if (typeof one.rule === 'string' || typeof one.script === 'string' || typeof one.ingest === 'string') continue;
    if (typeof one.register === 'string') lists.push(typeof one.name === 'string' ? one.name : one.register);
  }
  return { id: `usecase-${u.usecase}`, name: u.title, icon: 'home', on: true, state: why.length === 0 && byHand ? 'hand' : 'heard', held: null, why, entries: [], lists, blurb: u.summary };
}

/** The glyph for what a phrase became: the part it names first, a use case's home, or Money's for an amount. */
export function iconOfBecame(became: string): IconName {
  if (became === firstRun.shapeNoCurrency) return 'money';
  const first = became.split(/,\s*|\s+and\s+/u)[0] ?? '';
  const id = MODULE_ORDER.find((m) => moduleName(m) === first);
  return id === undefined ? 'home' : partIcon(id);
}

/** The phrases heard for one part: the ones whose "became" names it. */
function phrasesFor(name: string, heard: readonly Said[]): string[] {
  const out: string[] = [];
  for (const h of heard) {
    const became = h.became.split(/,\s*|\s+and\s+/u);
    if (became.includes(name) && !out.includes(h.phrase)) out.push(h.phrase);
  }
  return out;
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
};

/** Every part on offer, each with why it is on and what it will hold. */
export function partsOf(p: PartsIn): Part[] {
  return p.offered.map((id): Part => {
    const name = moduleName(id);
    const info = firstPartyModule(id);
    const on = p.modules.includes(id);
    const why = phrasesFor(name, p.heard);
    const held = p.heldBy(id);
    /* A PART THAT CANNOT BE TURNED OFF SAYS WHO NEEDS IT before why it was heard, so a still switch has its reason. */
    const state: PartState = !on ? 'off' : id === p.waiting ? 'waiting' : held !== null ? 'held' : why.length > 0 ? 'heard' : p.byHand.has(id) ? 'hand' : 'heard';
    const entries = on ? p.rows.flatMap((r) => (moduleOfList(r.register)?.id === id ? [entryOf(r)] : [])) : [];
    const lists = (info?.registers ?? []).map((r) => info?.titles[r] ?? r);
    return { id, name, icon: partIcon(id), on, state, held, why, entries, lists, blurb: info?.blurb ?? '' };
  });
}

/**
 * The parts in the order the progress bar draws them: the ones made first, then the one waiting on an answer, then the
 * ones left off, so the bar's filled cells, its outlined cell and its empty ones each sit together.
 */
export function stepsOf(parts: readonly Part[]): { order: Part[]; done: number; current: boolean } {
  const made = parts.filter((p) => p.on && p.state !== 'waiting');
  const waiting = parts.filter((p) => p.state === 'waiting');
  const off = parts.filter((p) => !p.on);
  return { order: [...made, ...waiting, ...off], done: made.length, current: waiting.length > 0 };
}

/* ── the sentence under the title ─────────────────────────────────────── */

/** The sentence cut round the phrase that needs him, as the page head draws one. */
export type Sentence = { before: string; needs: string; after: string };

/**
 * "Four of six parts are on. One question left: which of pounds and dollars is home." The phrase that needs him is the
 * open question, and only that; with none, the sentence says there is nothing left to ask.
 */
export function statusOf(on: number, total: number, question: string | null): Sentence {
  const lead = on === 0 ? 'Nothing is on yet.' : `${numberWord(on, true)} of ${numberWord(total)} ${total === 1 ? 'part' : 'parts'} ${on === 1 ? 'is' : 'are'} on.`;
  if (question) return { before: `${lead} `, needs: 'One question left', after: `: ${question}.` };
  return { before: on === 0 ? `${lead} ${firstRun.makeSomething}` : `${lead} ${words.noQuestion}`, needs: '', after: '' };
}

/* ── the words, marked ────────────────────────────────────────────────── */

/** A run of what was said: plain, or a phrase that became something. */
export type Run = { text: string; became: string | null };

/**
 * What was said, cut into runs, with each phrase heard marked by what it became. The phrases come in sentence order, so
 * each is looked for after the last one found; one that is not there (the reader trims a name's full stop) is skipped
 * rather than guessed at.
 */
export function marksIn(sentence: string, heard: readonly Said[], name: string | null): Run[] {
  const out: Run[] = [];
  let from = 0;
  const mark = (phrase: string, became: string) => {
    if (phrase === '') return;
    const at = sentence.indexOf(phrase, from);
    if (at < 0) return;
    if (at > from) out.push({ text: sentence.slice(from, at), became: null });
    out.push({ text: phrase, became });
    from = at + phrase.length;
  };
  if (name) mark(name, firstRun.heardName(name));
  for (const h of heard) mark(h.phrase, h.became);
  if (from < sentence.length) out.push({ text: sentence.slice(from), became: null });
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

  const zoned = new Set<string>();
  if (env.zone !== null) {
    for (const code of env.codes) if (env.zonesOf(code.slice(0, 2))?.includes(env.zone)) zoned.add(code);
    if (zoned.size === 0 && env.zone.startsWith('Europe/') && env.codes.includes('EUR')) zoned.add('EUR');
  }
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
