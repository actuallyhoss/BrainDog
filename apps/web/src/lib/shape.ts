/**
 * Turn 2 of the first run, "What's your business?", read without a model (`loop/research-modules.md`
 * §5, option (a)). A sentence becomes a `Shape`: which first-party packs to turn on, and the first
 * rows the sentence itself can fill.
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

import { exponentOf } from 'braindog-render';

import { firstRun } from './first-run.ts';

export type PackId = 'portfolio' | 'people' | 'money-core' | 'estate' | 'work' | 'agents';

/** Portfolio first, because every other first-party list points at a project (`packs.ts` `LEANS_ON`). */
export const INSTALL_ORDER: readonly PackId[] = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'];

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

/* "track" is not here: "I track a few side projects" is a verb about projects, not a Work list. */
const LEXICON: readonly { packs: PackId[]; words: RegExp }[] = [
  { packs: ['money-core', 'people'], words: /\bfreelanc(?:e|es|ed|ing|er)\b/giu },
  { packs: ['money-core'], words: /\b(?:invoic(?:e|es|ed|ing)|bill(?:s|ed|ing)?|retainers?|owe[sd]?|owing|payments?|paid|vat|tax(?:es)?|money|cash|fees?|charg(?:e|es|ed|ing))\b/giu },
  { packs: ['estate'], words: /\b(?:domains?|hosting|servers?|subscriptions?|saas|licen[cs]es?|certificates?|renewals?)\b/giu },
  { packs: ['people'], words: /\b(?:team|staff|employees?|contractors?|freelancers|clients?|customers?|collaborators?|partners?|accountants?|people|colleagues?|co-?founders?)\b/giu },
  { packs: ['work'], words: /\b(?:tasks?|to-?dos?|deadlines?|sprints?|backlog|roadmap|milestones?)\b/giu },
  { packs: ['portfolio'], words: /\b(?:(?:side[- ])?projects?|products?|apps?|studio|shop|store|brands?|games?|agency|foundry|websites?)\b/giu },
  { packs: ['agents'], words: /\b(?:claude|codex|cursor|agents?|ai|mcp|llms?|copilot|chatgpt)\b/giu },
];

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const COUNT = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`;
const TEAM = new RegExp(`\\b(?:${COUNT}[- ](?:person|people|of us)|team of ${COUNT})\\b`, 'giu');
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
   figure, or "Halden EGP 5,000" would be somebody called Halden EGP. */
const CAP = "(?![A-Z]{3}\\s?\\d)\\p{Lu}[\\p{L}\\p{M}\\d'’.-]*";
/* Up to three words, `&` allowed between them: `Pell & Vine`. */
const NAME = `${CAP}(?:\\s+(?:&\\s+)?(?!I\\b|And\\b)${CAP}){0,2}`;
const LIST = `(${NAME}(?:(?:\\s*,\\s*|\\s+and\\s+)${NAME})*)`;
const SEPARATOR = /^(?:\s*,\s*|\s+and\s+)$/u;
/** A trigger word in lower case and capitalised, so the name after it stays case-sensitive. */
const either = (words: string): string => words.split('|').map((w) => `[${w.charAt(0).toUpperCase()}${w.charAt(0)}]${w.slice(1)}`).join('|');

type NameRule = { at: RegExp; register: 'things' | 'people'; role?: string };

/* In order: a rule that takes a name keeps it from the rules after it. */
const NAME_RULES: readonly NameRule[] = [
  { at: new RegExp(`\\b(?:${either('client|customer')})s?\\s+(?:(?:called|named|like|such as|including)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'client' },
  { at: new RegExp(`\\b(?:${either('bill|invoice|charge')})(?:s|ed|ing)?\\s+${LIST}`, 'gu'), register: 'people', role: 'client' },
  { at: new RegExp(`\\b(?:${either('contractor')})s?\\s+(?:(?:called|named)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'contractor' },
  { at: new RegExp(`\\b(?:${either('accountant')})s?\\s+(?:(?:called|named)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'accountant' },
  { at: new RegExp(`\\b(?:${either('partner|cofounder|co-founder|collaborator')})s?\\s+(?:(?:called|named)\\s+)?${LIST}`, 'gu'), register: 'people', role: 'collaborator' },
  { at: new RegExp(`\\b(?:${either('run|runs|running|own|owns|build|builds|building|make|makes|making|started|founded')}|working on)\\s+${LIST}`, 'gu'), register: 'things' },
  { at: new RegExp(`\\b(?:called|named)\\s+${LIST}`, 'gu'), register: 'things' },
];

const NOT_A_NAME = new Set(['i', 'we', 'my', 'our', 'the', 'a', 'an', 'and', 'but', 'so']);
const CODES = new Set(Intl.supportedValuesOf('currency'));
const WHOLE_WORDS = LEXICON.map(({ words }) => new RegExp(`^(?:${words.source})$`, 'iu'));
/* "building MCP servers" names no project: a word the lexicon already reads is never a name. */
const aName = (name: string): boolean =>
  !NOT_A_NAME.has((name.split(' ')[0] ?? '').toLowerCase()) && !CODES.has(name) && !WHOLE_WORDS.some((w) => w.test(name));

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

/** What a sentence says about a business. `today` is an ISO day, for a date given as "on the 1st". */
export function shape(sentence: string, today: string = new Date().toISOString().slice(0, 10)): Shape {
  const said = oneLine(sentence);
  if (!said) return nothing('empty');
  if (foreign(said)) return nothing('language');

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
        if (!name || !aName(name)) continue;
        if (!hear(at, name, [rule.register === 'things' ? 'portfolio' : 'people'])) continue;
        if (rows.some((r) => r.register === rule.register && r.fields.name === name)) continue;
        rows.push(
          rule.register === 'things'
            ? /* `building` is the one status a named, current project can be given without asking. */
              { register: 'things', fields: { name, lane: 'building' }, missing: [] }
            : { register: 'people', fields: { name, ...(rule.role ? { role: rule.role } : {}) }, missing: [] },
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
    const n = (m[1] ?? m[2] ?? '').toLowerCase();
    if (hear(m.index ?? 0, m[0], ['people'])) team = NUMBER_WORDS[n] ?? Number(n);
  }
  for (const { packs, words } of LEXICON) for (const m of said.matchAll(words)) hear(m.index ?? 0, m[0], packs);

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
 * Which lists each one points at, so turning one on turns those on too. Every list points at a
 * project, and Money points at the person an invoice is to. `shape.test.ts` holds this to the
 * seed's pack manifests.
 */
export const LEANS_ON: Readonly<Record<PackId, readonly PackId[]>> = {
  portfolio: [],
  people: ['portfolio'],
  'money-core': ['portfolio', 'people'],
  estate: ['portfolio'],
  work: ['portfolio'],
  agents: ['portfolio'],
};

/** The packs to turn on, dependencies first, with People added when turn 1 heard a name. */
export function toTurnOn(s: Shape, person: boolean): PackId[] {
  const wanted = new Set<PackId>(s.packs.map((p) => p.id));
  if (person) wanted.add('people');
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...wanted])
      for (const needs of LEANS_ON[id])
        if (!wanted.has(needs)) {
          wanted.add(needs);
          grew = true;
        }
  }
  return INSTALL_ORDER.filter((id) => wanted.has(id));
}

/** The rows that can be written: every required field given. */
export const writable = (s: Shape): Row[] => s.rows.filter((r) => r.missing.length === 0);

/** A row's title, whichever register it is in. */
export const titleOfRow = (r: Row): string => String(r.register === 'obligations' ? r.fields.what : r.fields.name);
