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

/** One category the record holds, by its row id, name and way. */
export type Category = { id: string; name: string; way: 'in' | 'out' | null };

/** One line just added and the category offered for it. */
export type Offered = { seq: number; what: string; category: Category };

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
  const named = (name: string): Category | null => held.find((c) => c.name.trim().toLowerCase() === name.toLowerCase() && (c.way === null || c.way === way)) ?? null;
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

/** File each line offered under its category, a few at a time; the count filed. */
export async function fileLines(base: string, ledger: Ledger, offered: readonly Offered[]): Promise<number> {
  const c = ledger.category;
  if (c === null) return 0;
  const client = createClient({ base });
  const queue = [...offered];
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let o = queue.shift(); o !== undefined; o = queue.shift()) {
      const out = await client.update({ register: ledger.list, seq: o.seq, patch: { [c.field]: o.category.id } }).catch(() => null);
      if (out?.ok) done++;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return done;
}

/** The words the offer says. */
export const filingWords = {
  title: (n: number) => (n === 1 ? 'File this line?' : `File these ${n} lines?`),
  sentence: 'A category for each, by who it was paid to or from. Nothing is filed until you press.',
  file: (n: number) => (n === 1 ? 'File 1 line' : `File ${n} lines`),
  filing: 'Filing…',
  filed: (n: number) => `Filed ${n === 1 ? '1 line' : `${n} lines`}.`,
  left: (n: number) => `${n === 1 ? '1 line has' : `${n} lines have`} no category yet. Open ${n === 1 ? 'it' : 'one'} in the Ledger to file it.`,
} as const;
