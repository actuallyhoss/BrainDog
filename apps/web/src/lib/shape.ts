/**
 * Turn 2 of the first run, "What's your business?", read without a model. A sentence becomes a `Shape`: which packs to turn on, and the first rows the
 * sentence itself can fill.
 *
 * THE WORDS ARE THE CATALOGUE'S, NOT THIS FILE'S. Each pack says what a person
 * calls what it keeps in its manifest's `signals`, as a use case does, and this reads them: the six
 * modules from their own manifests (`@braindog/seed/packs/modules`), and any other pack the caller
 * hands in from the catalogue. A pack from the Kennel that says it is for "choir" is offered to a
 * person who says they run a choir, on the same terms as Money is to a person who invoices.
 *
 * DETERMINISTIC, because 19 §6 says the first run works on a fresh self-host with nothing
 * configured. Keyword and pattern rules only; the same sentence always gives the same shape.
 *
 * IT NEVER INVENTS A FACT. A name is taken only where a capitalised word follows a word that says
 * what it is. An amount is taken only when a currency was typed beside it, as a symbol, a code or
 * an unambiguous word, because "2,000 pounds" is sterling or Egyptian and a guess would be written
 * into Money. A row whose register requires a field the sentence did not give is shown as needing
 * it and is not written.
 *
 * `labels` and `pages` from §5's `Shape` are left out: nothing a sentence says renames a field yet,
 * and every first-party page already appears on its first row (§9 ruling 2).
 *
 * A plain `.ts` so `node --test` can hold it; the screen only calls it.
 */

import { firstPartyModules } from '@braindog/seed/packs/modules';
import { MODULE_ORDER, signalsIn } from '@braindog/seed/usecases';
import { exponentOf } from 'braindog-render';

import { firstRun } from './first-run.ts';
import { recordToday } from './record/zone.ts';

/** A pack's id: one of the six modules, or any other pack in the catalogue. */
export type PackId = string;

/** Portfolio first, because every other first-party list points at a project (`LEANS_ON`). */
export const INSTALL_ORDER: readonly PackId[] = MODULE_ORDER;

/**
 * One pack the first run may offer: its id, the words it is heard in, and the packs it cannot install without. A
 * catalogue entry that says its `signals` (`@braindog/seed/usecases/catalogue`) is one as it stands.
 */
export type Offer = { id: string; signals: readonly string[]; modules: readonly string[] };

/** The modules this build ships, from their manifests. */
export const BUNDLED: readonly Offer[] = firstPartyModules().map((m) => ({ id: m.id, signals: m.signals, modules: m.leans }));

export type Span = { at: number; text: string };
export type Money = { amount: number; currency: string };
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** One phrase and what it became. `loose` is an amount with no currency, said back and not kept. */
export type Heard = Span & { packs: PackId[]; loose?: true };

export type Row = {
  register: 'things' | 'people' | 'obligations';
  fields: Record<string, string | Money>;
  /** Required fields the sentence did not give. A row with any is shown and not written. */
  missing: string[];
  /** The index in `rows` of the client this invoice is to, when exactly one was named. */
  party?: number;
};

export type Shape = {
  /** The first currency typed, or `null`. Never guessed from a place or from a word like "pounds". */
  currency: string | null;
  /** In the order they were heard. Portfolio is added with no `why` when another list leans on it. */
  packs: { id: PackId; why: Span[] }[];
  rows: Row[];
  /** In sentence order. */
  heard: Heard[];
  /** How many people, when the sentence says. */
  team: number | null;
  /** Why nothing was read: nothing typed, a language these rules do not read, or no word they know. */
  declined: 'empty' | 'language' | 'unread' | null;
};

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/* ── the lexicon ──────────────────────────────────────────────────────── */

/**
 * Every signal the offers carry, with the packs that listen for it. One word may be two packs': "freelance" is Money
 * and People both, so it is heard once and becomes both.
 */
function lexiconOf(offers: readonly Offer[]): Map<string, PackId[]> {
  const out = new Map<string, PackId[]>();
  for (const o of offers)
    for (const signal of o.signals) {
      const had = out.get(signal);
      if (had === undefined) out.set(signal, [o.id]);
      else if (!had.includes(o.id)) had.push(o.id);
    }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const COUNT = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`;
/* AND A COUNT OF PEOPLE BY THEIR WORK after "with", "have" or "employ": "a ceramics studio with two
   potters" went unheard. A word that ends as a worker's does, never one of the things a shop counts ("two orders"). */
/* A thing a shop counts that ends as a worker's word does, by its stem: "two orders", "two others", "two posters". */
const THINGS_COUNTED = ['ord', 'oth', 'numb', 'lett', 'pap', 'post', 'stick', 'fly', 'cov', 'lay', 'mark', 'contain', 'fold', 'filt', 'should', 'answ'];
const WORKERS = `(?!(?:${THINGS_COUNTED.join('|')})ers(?![\\p{L}]))[\\p{L}]+(?:ers|ors|ists|ians)`;
const TEAM = new RegExp(`\\b(?:${COUNT}[- ](?:person|people|of us)|team of ${COUNT}|(?<=\\b(?:with|have|employ|hired?)\\s+)${COUNT}\\s+${WORKERS})\\b`, 'giu');
const SOLO = /\b(?:just me|on my own|solo)\b/iu;

const CADENCE: readonly [RegExp, Cadence][] = [
  [/\b(?:weekly|every week|each week|a week|per week)\b/iu, 'weekly'],
  [/\b(?:monthly|every month|each month|a month|per month)\b/iu, 'monthly'],
  [/\b(?:quarterly|every quarter|each quarter|a quarter|per quarter)\b/iu, 'quarterly'],
  [/\b(?:yearly|annually|every year|each year|a year|per year)\b/iu, 'yearly'],
];

/* The words that say money is billed to somebody. Only these make an invoice row; "I freelance"
   turns Money on and says nothing about an invoice. */
const BILLING = /\b(?:invoic(?:e|es|ed|ing)|bill(?:s|ed|ing)?|retainers?|charg(?:e|es|ed|ing))\b/iu;

/* ── names ────────────────────────────────────────────────────────────── */

/* A capitalised word in any script: `Kiln`, `Élodie`, `O'Neill`. Never a currency code before a
   figure, or "Halden EGP 5,000" would be somebody called Halden EGP. A FULL STOP ENDS IT unless a letter follows
   (`St.Clair`): "my partner Ada. We send invoices" was a person called "Ada. We". */
const CAP = "(?![A-Z]{3}\\s?\\d)\\p{Lu}(?:[\\p{L}\\p{M}\\d'’-]|\\.(?=\\p{L}))*";
/* Up to three words, `&` allowed between them: `Pell & Vine`. */
const NAME = `${CAP}(?:\\s+(?:&\\s+)?(?!I\\b|And\\b)${CAP}){0,2}`;
const LIST = `(${NAME}(?:(?:\\s*,\\s*|\\s+and\\s+)${NAME})*)`;
const SEPARATOR = /^(?:\s*,\s*|\s+and\s+)$/u;
/** A trigger word in lower case and capitalised, so the name after it stays case-sensitive. */
const either = (words: string): string => words.split('|').map((w) => `[${w.charAt(0).toUpperCase()}${w.charAt(0)}]${w.slice(1)}`).join('|');

/** The list a project a sentence names is filed in, Projects', which every other list leans on (`propose.ts` reads the record's name from it). */
export const PROJECTS: Row['register'] = 'things';

/** `word`: the work they are paid for is kept as the person's note ("Editor"), so the tile and the line back say it. */
type NameRule = { at: RegExp; register: 'things' | 'people'; role?: string; word?: true };

/* In order: a rule that takes a name keeps it from the rules after it. */
const NAME_RULES: readonly NameRule[] = [
  { at: new RegExp(`\\b(?:${either('client|customer')})s?\\s+(?:(?:called|named|like|such as|including)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'client' },
  { at: new RegExp(`\\b(?:${either('bill|invoice|charge')})(?:s|ed|ing)?\\s+${LIST}`, 'gu'), register: 'people', role: 'client' },
  { at: new RegExp(`\\b(?:${either('contractor')})s?\\s+(?:(?:called|named)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'contractor' },
  { at: new RegExp(`\\b(?:${either('accountant')})s?\\s+(?:(?:called|named)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'accountant' },
  /* THE PEOPLE THEY PAY TO DO THE WORK, BY THE WORK (onboarding6, the creator walk: "my editors Kai and Rosa" were never
     drafted): an editor, an assistant, a designer they hire is somebody they contract. */
  { at: new RegExp(`\\b(?:${either('editor|video editor|assistant|virtual assistant|moderator|designer|developer|bookkeeper|cleaner|nanny|babysitter')})s?\\s+(?:(?:called|named|are|is)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'contractor', word: true },
  { at: new RegExp(`\\b(?:${either('partner|cofounder|co-founder|collaborator')})s?\\s+(?:(?:called|named|is)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'collaborator' },
  { at: new RegExp(`\\b(?:${either('run|runs|running|own|owns|build|builds|building|make|makes|making|started|founded')}|working on)\\s+${LIST}`, 'gu'), register: 'things' },
  { at: new RegExp(`\\b(?:called|named)\\s+${LIST}`, 'gu'), register: 'things' },
];

/** The work word a rule matched on, as a note: "editors Kai and Rosa" is "Editor". */
const workWord = (matched: string): string => {
  const w = (/^\s*([\p{L} ]+?)s?\s+(?:called|named|are|is\s+)?\p{Lu}/u.exec(matched)?.[1] ?? '').trim().replace(/\s+(?:called|named|are|is)$/u, '');
  return w === '' ? '' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

const NOT_A_NAME = new Set(['i', 'we', 'my', 'our', 'the', 'a', 'an', 'and', 'but', 'so']);
const CODES = new Set(Intl.supportedValuesOf('currency'));
/* "building MCP servers" names no project: a word the lexicon already reads is never a name. */
const aName = (name: string, lexicon: ReadonlyMap<string, unknown>): boolean =>
  !NOT_A_NAME.has((name.split(' ')[0] ?? '').toLowerCase()) && !CODES.has(name) && !lexicon.has(name.toLowerCase());

/* ── money ────────────────────────────────────────────────────────────── */

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(\\s?k\\b)?';
const SYMBOLS: Record<string, string> = { '£': 'GBP', '€': 'EUR', $: 'USD', US$: 'USD', A$: 'AUD', C$: 'CAD', NZ$: 'NZD' };
const WORDS: Record<string, string> = { euro: 'EUR', euros: 'EUR', sterling: 'GBP', 'pounds sterling': 'GBP', quid: 'GBP' };

const BY_SYMBOL = new RegExp(`(US\\$|A\\$|C\\$|NZ\\$|£|€|\\$)\\s?${NUM}`, 'gu');
/* Upper case only: `ALL`, `TOP` and `CUP` are currencies, and "all 20 clients" is not a sum. */
const CODE_FIRST = new RegExp(`\\b([A-Z]{3})\\s?${NUM}`, 'gu');
const CODE_AFTER = new RegExp(`${NUM}\\s?([A-Z]{3})\\b`, 'gu');
const WORD_AFTER = new RegExp(`${NUM}\\s?(pounds sterling|sterling|quid|euros?)\\b`, 'giu');
/* A number that is plainly a sum and names no currency, or names one that could be two. */
const LOOSE = [
  new RegExp(`${NUM}\\s?(?:pounds?|dollars?|bucks)\\b`, 'giu'),
  new RegExp(`${NUM}(?=\\s+(?:a|per|each|every)\\s+(?:week|month|quarter|year)\\b)`, 'giu'),
  new RegExp(`(?<=\\b(?:bill|charge|invoice|earn|make|paid|pay|costs?|retainer of)\\s)${NUM}`, 'giu'),
];

/** Minor units, or `null` for more decimal places than the currency has. */
function minor(digits: string, thousand: boolean, currency: string): number | null {
  const plain = digits.replace(/,/g, '');
  const exp = exponentOf(currency);
  const places = plain.split('.')[1]?.length ?? 0;
  if (!thousand && places > exp) return null;
  const out = Math.round(Number(plain) * (thousand ? 1000 : 1) * 10 ** exp);
  return Number.isSafeInteger(out) ? out : null;
}

/* ── language ─────────────────────────────────────────────────────────── */

const ENGLISH = new Set(['i', 'we', 'my', 'our', 'a', 'an', 'the', 'and', 'of', 'to', 'for', 'with', 'run', 'have', 'do', 'is', 'are', 'in', 'on', 'me', 'us', 'it', 'some', 'few', 'sell', 'make', 'work', 'people']);
/* Function words of the languages most likely typed here. Words that are also English ("die",
   "con", "van", "per") are left out, so an English sentence cannot trip it. */
const OTHER = new Set(['je', 'nous', 'un', 'une', 'le', 'la', 'les', 'des', 'du', 'de', 'et', 'est', 'avec', 'pour', 'mon', 'ma', 'mes', 'notre', 'ich', 'wir', 'und', 'der', 'das', 'ein', 'eine', 'mit', 'für', 'mein', 'meine', 'yo', 'nosotros', 'el', 'los', 'las', 'y', 'para', 'mi', 'mis', 'una', 'io', 'noi', 'di', 'che', 'mio', 'eu', 'nós', 'os', 'uma', 'com', 'meu', 'minha', 'ik', 'wij', 'het', 'een', 'voor', 'mijn']);

/** Whether the sentence is in a language these rules cannot read, so nothing in it is guessed at. */
function foreign(said: string): boolean {
  const letters = said.match(/\p{L}/gu)?.length ?? 0;
  const latin = said.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (letters > 0 && latin / letters < 0.5) return true;
  const words = said.toLowerCase().match(/\p{L}+/gu) ?? [];
  const other = words.filter((w) => OTHER.has(w)).length;
  const english = words.filter((w) => ENGLISH.has(w)).length;
  return other >= 2 && other > english;
}

/* ── dates ────────────────────────────────────────────────────────────── */

const DAY_OF_MONTH = /\bon the (\d{1,2})(?:st|nd|rd|th)\b/iu;

/** The next date falling on that day of the month, today included, or `null` for a day no month has. */
function nextDay(day: number, today: string): string | null {
  if (day < 1 || day > 31) return null;
  const [y = 1970, m = 1, d = 1] = today.split('-').map(Number);
  for (let step = 0; step < 13; step++) {
    const date = new Date(Date.UTC(y, m - 1 + step, day));
    if (date.getUTCDate() !== day) continue;
    if (step === 0 && day < d) continue;
    return date.toISOString().slice(0, 10);
  }
  return null;
}

/* ── the reading ──────────────────────────────────────────────────────── */

const nothing = (declined: Shape['declined']): Shape => ({ currency: null, packs: [], rows: [], heard: [], team: null, declined });

const overlaps = (a: Span, b: Span): boolean => a.at < b.at + b.text.length && b.at < a.at + a.text.length;

/**
 * What a sentence says about a business. `today` is an ISO day, for a date given as "on the 1st". `offers` are the packs
 * whose signals are listened for: the bundled modules unless the caller hands in more of the catalogue.
 */
export function shape(sentence: string, today: string = recordToday(), offers: readonly Offer[] = BUNDLED): Shape {
  const said = oneLine(sentence);
  if (!said) return nothing('empty');
  if (foreign(said)) return nothing('language');
  const lexicon = lexiconOf(offers);

  const heard: Heard[] = [];
  const rows: Row[] = [];
  /* The first reading of a stretch of the sentence wins, so a phrase is never counted twice. */
  const hear = (at: number, text: string, packs: PackId[], loose?: true): boolean => {
    const span = { at, text };
    if (heard.some((h) => overlaps(h, span))) return false;
    heard.push({ ...span, packs, ...(loose ? { loose } : {}) });
    return true;
  };

  /* NAMES FIRST, so "Kiln" in "a foundry called Kiln" is a row and not only a word. */
  for (const rule of NAME_RULES)
    for (const m of said.matchAll(rule.at)) {
      const list = m[1] ?? '';
      let from = (m.index ?? 0) + m[0].length - list.length;
      for (const part of list.split(/(\s*,\s*|\s+and\s+)/u)) {
        const at = from;
        from += part.length;
        if (SEPARATOR.test(part)) continue;
        const name = part.replace(/[.'’-]+$/u, '');
        if (!name || !aName(name, lexicon)) continue;
        if (!hear(at, name, [rule.register === 'things' ? 'portfolio' : 'people'])) continue;
        if (rows.some((r) => r.register === rule.register && r.fields.name === name)) continue;
        rows.push(
          rule.register === 'things'
            ? /* `building` is the one status a named, current project can be given without asking. */
              { register: 'things', fields: { name, lane: 'building' }, missing: [] }
            : { register: 'people', fields: { name, ...(rule.role ? { role: rule.role } : {}), ...(rule.word ? { note: workWord(m[0]) } : {}) }, missing: [] },
        );
      }
    }

  /* AMOUNTS BEFORE WORDS, so "£2k retainer" is an amount and a word rather than a word and a lost number. */
  const amounts: (Span & Money)[] = [];
  const kept = (at: number, text: string, currency: string | undefined, digits: string | undefined, k: string | undefined) => {
    if (!currency || !digits) return;
    const amount = minor(digits, Boolean(k), currency);
    if (amount !== null && hear(at, text, ['money-core'])) amounts.push({ at, text, amount, currency });
  };
  for (const m of said.matchAll(BY_SYMBOL)) kept(m.index ?? 0, m[0], SYMBOLS[m[1] ?? ''], m[2], m[3]);
  for (const m of said.matchAll(CODE_FIRST)) if (CODES.has(m[1] ?? '')) kept(m.index ?? 0, m[0], m[1], m[2], m[3]);
  for (const m of said.matchAll(CODE_AFTER)) if (CODES.has(m[3] ?? '')) kept(m.index ?? 0, m[0], m[3], m[1], m[2]);
  for (const m of said.matchAll(WORD_AFTER)) kept(m.index ?? 0, m[0], WORDS[(m[3] ?? '').toLowerCase()], m[1], m[2]);
  for (const pattern of LOOSE) for (const m of said.matchAll(pattern)) hear(m.index ?? 0, m[0], [], true);

  let team: number | null = SOLO.test(said) ? 1 : null;
  for (const m of said.matchAll(TEAM)) {
    const n = (m[1] ?? m[2] ?? m[3] ?? '').toLowerCase();
    if (hear(m.index ?? 0, m[0], ['people'])) team = NUMBER_WORDS[n] ?? Number(n);
  }
  for (const span of signalsIn(said, [...lexicon.keys()])) hear(span.at, span.text, lexicon.get(span.text.toLowerCase()) ?? []);

  /* THE INVOICE, only when the sentence says money is billed. Money requires an amount and a due
     date, so without both typed it is shown as needing them and not written. */
  if (BILLING.test(said)) {
    const cadence = CADENCE.find(([words]) => words.test(said));
    const when = cadence?.[0].exec(said);
    if (when) hear(when.index, when[0], ['money-core']);
    const dayOf = DAY_OF_MONTH.exec(said);
    const due = dayOf ? nextDay(Number(dayOf[1]), today) : null;
    if (dayOf && due) hear(dayOf.index, dayOf[0], ['money-core']);

    const clients = rows.flatMap((r, i) => (r.register === 'people' && r.fields.role === 'client' ? [i] : []));
    const party = clients.length === 1 ? clients[0] : undefined;
    const amount = amounts[0];
    rows.push({
      register: 'obligations',
      fields: {
        what: firstRun.shapeInvoice(cadence?.[1] ?? null, party === undefined ? null : String(rows[party]?.fields.name)),
        direction: 'owed_to_me',
        state: 'open',
        ...(amount ? { amount: { amount: amount.amount, currency: amount.currency } } : {}),
        ...(due ? { due } : {}),
      },
      missing: [...(amount ? [] : ['amount']), ...(due ? [] : ['due'])],
      ...(party === undefined ? {} : { party }),
    });
  }

  heard.sort((a, b) => a.at - b.at);

  const packs: Shape['packs'] = [];
  for (const h of heard)
    for (const id of h.packs) {
      const had = packs.find((p) => p.id === id);
      if (had) had.why.push({ at: h.at, text: h.text });
      else packs.push({ id, why: [{ at: h.at, text: h.text }] });
    }
  if (packs.length > 0 && !packs.some((p) => p.id === 'portfolio')) packs.push({ id: 'portfolio', why: [] });

  if (heard.length === 0) return { ...nothing('unread'), team };
  return { currency: amounts[0]?.currency ?? null, packs, rows, heard, team, declined: null };
}

/**
 * Which packs each module points at, so turning one on turns those on too, read off each manifest's `requires`
 * (`@braindog/seed/packs/modules` `leans`). People and Work only link to Projects and People, and Money links to People
 * for a payment's party, so each goes in without them (`first-party.ts` `LINKS`). `shape.test.ts` holds this to
 * the seed's pack manifests.
 */
export const LEANS_ON: Readonly<Record<PackId, readonly PackId[]>> = Object.fromEntries(BUNDLED.map((o) => [o.id, o.modules]));

/**
 * `ids` with every pack each leans on added, the modules in install order and then any other catalogue pack in the order
 * it came. A catalogue pack says what it leans on in its own `modules`; one the offers do not know leans on nothing here,
 * and the install names whatever it is missing.
 */
export function closeOver(ids: Iterable<PackId>, offers: readonly Offer[] = BUNDLED): PackId[] {
  const leans = (id: PackId): readonly PackId[] => offers.find((o) => o.id === id)?.modules ?? LEANS_ON[id] ?? [];
  const wanted = new Set<PackId>(ids);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...wanted])
      for (const needs of leans(id))
        if (!wanted.has(needs)) {
          wanted.add(needs);
          grew = true;
        }
  }
  const first = new Set<PackId>(INSTALL_ORDER);
  return [...INSTALL_ORDER.filter((id) => wanted.has(id)), ...[...wanted].filter((id) => !first.has(id))];
}

/**
 * The shape with the packs a use case already holds taken out: a pack every phrase of which the use case claims
 * (`@braindog/seed/usecases/install` `claimedBy`). "An Etsy shop" said to the New project guide is the project it guides,
 * so it asks for no Projects. A pack still heard for a phrase of its own stays, and Projects comes back only when a pack
 * left leans on it.
 */
export function heardFor(s: Shape, claimed: (span: Span) => boolean): Shape {
  if (s.declined !== null) return s;
  const kept = s.packs.filter((p) => p.why.length > 0 && !p.why.every(claimed));
  if (kept.length > 0 && !kept.some((p) => p.id === 'portfolio')) kept.push({ id: 'portfolio', why: [] });
  return { ...s, packs: kept };
}

/** The packs to turn on, dependencies first, with People added when turn 1 heard a name. */
export function toTurnOn(s: Shape, person: boolean, offers: readonly Offer[] = BUNDLED): PackId[] {
  const wanted = new Set<PackId>(s.packs.map((p) => p.id));
  if (person) wanted.add('people');
  return closeOver(wanted, offers);
}

/** The rows that can be written: every required field given. */
export const writable = (s: Shape): Row[] => s.rows.filter((r) => r.missing.length === 0);

/** A row's title, whichever register it is in. */
export const titleOfRow = (r: Row): string => String(r.register === 'obligations' ? r.fields.what : r.fields.name);
