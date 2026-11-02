/**
 * FILING WHAT A STATEMENT BROUGHT IN (2 Nov, a walk: six imported lines, every one the Ledger's "?" of no category, and
 * nothing said how to file them). After the press that adds the lines, the import page offers a category for each by its
 * payee, in the record's own categories, and one press files every one offered. A line no payee word points at is left
 * for the person, and said so.
 *
 * BY PAYEE WORDS, NEVER BY A MODEL. The words are the usual ones on a bank line ("Tesco", "Netflix", "Octopus Energy",
 * "TfL"), each pointing at one of the starter categories by name (`STARTER_CATEGORIES` in the seed); a record that renamed
 * or removed a category is offered only what it still holds. Money in is Pay where the line says salary or wages, and
 * Sales where it names a payment from a client or a company.
 *
 * A route-only module: only the import screen imports it.
 */

import { createClient } from '@braindog/client';

import type { Ledger } from './ledger.ts';

/** One category the record holds, by its row id, name and way; `id` is `''` for a starter one it will be made as. */
export type Category = { id: string; name: string; way: 'in' | 'out' | null };

/** One line just added and the category offered for it. */
export type Offered = { seq: number; what: string; category: Category; way?: 'in' | 'out' };

/** The words on a bank line that point at a starter category, money out. */
const OUT_WORDS: readonly [RegExp, string][] = [
  [/\b(rent|landlord|letting|lettings)\b/iu, 'Rent'],
  [/\b(energy|electric\w*|gas|water|council tax|octopus|edf|e\.on|british gas|vodafone|o2|ee|three|bt|virgin media|sky|broadband|insurance|phone)\b/iu, 'Bills'],
  [/\b(subscription|netflix|spotify|adobe|figma|notion|slack|github|google|microsoft|apple\.com|icloud|dropbox|disney|prime|aws|hosting|cursor|openai|anthropic|claude|chatgpt)\b/iu, 'Subscriptions'],
  [/\b(tesco|sainsbury'?s?|asda|aldi|lidl|waitrose|morrisons|co-?op|ocado|m&s food|grocer\w*|supermarket|restaurant|cafe|café|coffee|pret|greggs|deliveroo|uber eats|just eat)\b/iu, 'Food'],
  [/\b(tfl|trainline|rail|train|bus|taxi|uber|bolt|lyft|shell|bp|esso|fuel|petrol|parking)\b/iu, 'Transport'],
];
const PAY = /\b(salary|wages?|payroll)\b/iu;
const SALES = /\b(payment|invoice|ltd|limited|inc|llc|plc|gmbh)\b/iu;

/** The category a line's payee points at, among those the record holds and only one of its own way, or `null`. */
export function suggestCategory(what: string, way: 'in' | 'out', held: readonly Category[]): Category | null {
  /* A STARTER THE RECORD DOES NOT HOLD YET IS OFFERED BY NAME AND MADE ON THE PRESS (a new record keeps no categories
     until one is made), unless it holds one of that name the other way. */
  const named = (name: string): Category | null => {
    const same = held.filter((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    return same.find((c) => c.way === null || c.way === way) ?? (same.length === 0 ? { id: '', name, way } : null);
  };
  if (way === 'in') return PAY.test(what) ? named('Pay') : SALES.test(what) ? named('Sales') : null;
  for (const [re, name] of OUT_WORDS) if (re.test(what)) return named(name);
  return null;
}

/** The record's live categories, or `null` where the ledger has none or they could not be read. */
export async function loadCategories(base: string, ledger: Ledger): Promise<Category[] | null> {
  const c = ledger.category;
  if (c === null) return null;
  const got = await createClient({ base })
    .list({ register: c.list, limit: 500 })
    .catch(() => null);
  if (!got?.ok) return null;
  const rows = got.value.rows as { id: string; fields: Record<string, unknown> }[];
  return rows.flatMap((r) => {
    if (c.state && c.done.includes(String(r.fields[c.state] ?? ''))) return [];
    const name = typeof r.fields[c.title] === 'string' ? (r.fields[c.title] as string) : '';
    if (name === '') return [];
    const v = c.way ? String(r.fields[c.way.field] ?? '') : '';
    const way = c.way === null ? null : v === c.way.in ? 'in' : v === c.way.out ? 'out' : null;
    return [{ id: r.id, name, way }];
  });
}

/** The list the record files a line by its text from (`txn-categorise` in the seed's Money rules). */
const FILING_RULES = 'filing_rules';

/**
 * THE TEXT A FILING RULE MATCHES, as the start of the line: its words up to the first one with a digit in it, so next
 * month's reference still fits ("FENWICK LTD INVOICE 1041" is "FENWICK LTD INVOICE", "NETFLIX.COM" stays). A start of
 * fewer than three letters is the whole text.
 */
export function stemOf(what: string): string {
  const words = what.replace(/\s+/gu, ' ').trim().split(' ');
  const cut = words.findIndex((w) => /\d/u.test(w));
  const stem = (cut < 0 ? words : words.slice(0, cut)).join(' ').trim();
  return stem.replace(/[^\p{L}]/gu, '').length >= 3 ? stem : what.trim();
}

/** Which text of a line a rule reads, by the Ledger field the import writes the line's words into; `null` for neither. */
const readsOf = (title: string): 'description' | 'payee' | null => (title === 'what' ? 'description' : title === 'counterparty_text' ? 'payee' : null);

/**
 * FILING CHOICES BECOME FILING RULES, ON THE SAME PRESS (2 Nov, onboarding5): each payee filed is kept as a rule that
 * files a line starting with its text under the same category, the same way, so the next statement files itself as it
 * lands (the record's `txn-categorise` reads these rules inside the write). A text a rule already matches is not made
 * twice. The count made; nothing is made where the record has no rules list.
 */
async function keepAsRules(base: string, ledger: Ledger, filed: readonly Offered[]): Promise<number> {
  const reads = readsOf(ledger.title);
  if (reads === null || filed.length === 0) return 0;
  const client = createClient({ base });
  const got = await client.list({ register: FILING_RULES, limit: 500 }).catch(() => null);
  if (!got?.ok) return 0;
  const held = new Set((got.value.rows as { fields: Record<string, unknown> }[]).map((r) => String(r.fields['match'] ?? '').trim().toLowerCase()));
  let made = 0;
  for (const o of filed) {
    const match = stemOf(o.what);
    if (match === '' || held.has(match.toLowerCase())) continue;
    held.add(match.toLowerCase());
    const out = await client
      .create({ register: FILING_RULES, fields: { match, match_by: 'starts', reads, direction: o.way ?? o.category.way ?? 'either', category: o.category.id, state: 'on' } })
      .catch(() => null);
    if (out?.ok) made++;
  }
  return made;
}

/** File each line offered under its category, a few at a time, and keep each choice as a rule; the count filed and made. */
export async function fileLines(base: string, ledger: Ledger, offered: readonly Offered[]): Promise<{ filed: number; rules: number }> {
  const c = ledger.category;
  if (c === null) return { filed: 0, rules: 0 };
  const client = createClient({ base });
  /* THE STARTERS NOT HELD YET ARE MADE FIRST, once each, with their way. */
  const made = new Map<string, string>();
  for (const o of offered) {
    if (o.category.id !== '' || made.has(o.category.name)) continue;
    const fields: Record<string, unknown> = { [c.title]: o.category.name };
    if (c.way && o.category.way) fields[c.way.field] = o.category.way === 'in' ? c.way.in : c.way.out;
    const out = await client.create({ register: c.list, fields }).catch(() => null);
    if (out?.ok) made.set(o.category.name, (out.value as { id: string }).id);
  }
  const queue = offered.flatMap((o) => {
    const id = o.category.id !== '' ? o.category.id : made.get(o.category.name);
    return id === undefined ? [] : [{ ...o, category: { ...o.category, id } }];
  });
  const filing = [...queue];
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let o = queue.shift(); o !== undefined; o = queue.shift()) {
      const out = await client.update({ register: ledger.list, seq: o.seq, patch: { [c.field]: o.category.id } }).catch(() => null);
      if (out?.ok) done++;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { filed: done, rules: await keepAsRules(base, ledger, filing) };
}

/** The lines among those just added that the record's own filing rules filed as they landed, by sequence. */
export async function filedOnArrival(base: string, ledger: Ledger, seqs: readonly number[]): Promise<Set<number>> {
  const c = ledger.category;
  const out = new Set<number>();
  if (c === null || seqs.length === 0) return out;
  const client = createClient({ base });
  const queue = [...seqs];
  const worker = async (): Promise<void> => {
    for (let seq = queue.shift(); seq !== undefined; seq = queue.shift()) {
      const got = await client.get(ledger.list, seq).catch(() => null);
      const v = got?.ok ? (got.value as { fields?: Record<string, unknown>; row?: { fields?: Record<string, unknown> } }) : null;
      const cat = v?.fields?.[c.field] ?? v?.row?.fields?.[c.field];
      if (typeof cat === 'string' && cat !== '') out.add(seq);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

/** The words the offer says. */
export const filingWords = {
  title: (n: number) => (n === 1 ? 'File this line?' : `File these ${n} lines?`),
  sentence: 'A category for each, by who it was paid to or from. Nothing is filed until you press.',
  /** Said under the offer: the press also keeps each choice, so the next statement files itself. */
  next: 'Each choice is kept, so the next statement from these payees files itself.',
  /** After the press, where it kept choices as rules. */
  kept: 'Your next statement from these payees will file itself.',
  /** Lines the kept choices filed as the statement landed. */
  self: (n: number) => `${n === 1 ? '1 line' : `${n} lines`} filed ${n === 1 ? 'itself' : 'themselves'}, the way you filed them last time.`,
  file: (n: number) => (n === 1 ? 'File 1 line' : `File ${n} lines`),
  filing: 'Filing…',
  /** Beside a category the press makes, since the BrainDog holds none of that name yet. */
  fresh: 'new',
  filed: (n: number) => `Filed ${n === 1 ? '1 line' : `${n} lines`}.`,
  left: (n: number) => `${n === 1 ? '1 line has' : `${n} lines have`} no category yet. Open ${n === 1 ? 'it' : 'one'} in the Ledger to file it.`,
} as const;
