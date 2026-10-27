/**
 * An entry split into parts, as a screen reads it: which field holds the parts, what a list row says of them, and the
 * parts a person typed as the record takes them.
 *
 * THE RECORD KEEPS THE RULE AND THIS FILE ONLY SAYS IT. A `json` field that declares `parts_of: <its money field>` holds
 * two parts or more, each a patch over its row (`{ category, amount, note }`), and the record refuses parts that do not
 * add up to the amount (the kernel's `row-parts.ts`). So a sum over these rows reads each part under its own category,
 * and a list of them still draws one row, which says it is split.
 *
 * PURE, so `node --test` reads it.
 */

import type { RegisterDecl } from './schema.ts';

/** Where a list's parts are: the json field and the money field they add up to. */
export type SplitAt = { field: string; of: string };

/** The parts field of a list, or none. */
export function splitAtOf(decl: Pick<RegisterDecl, 'fields'> | undefined): SplitAt | null {
  for (const f of decl?.fields ?? []) {
    const of = (f as { parts_of?: unknown }).parts_of;
    if (f.type === 'json' && f.retired !== true && typeof of === 'string' && of !== '') return { field: f.id, of };
  }
  return null;
}

/** One part as a screen holds it: the value of the field it is cut by, its share in minor units, and its note. */
export type Part = { by: string | null; minor: number; note: string };

/** The parts a row holds, cut by `by` (a category), or none for a row that is not split. */
export function partsOf(fields: Readonly<Record<string, unknown>>, at: SplitAt, by: string): Part[] {
  const held = fields[at.field];
  if (!Array.isArray(held) || held.length < 2) return [];
  return held.flatMap((p): Part[] => {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) return [];
    const part = p as Record<string, unknown>;
    const money = part[at.of] as { amount?: unknown } | undefined;
    const minor = typeof money?.amount === 'number' ? money.amount : typeof money === 'number' ? money : 0;
    const value = part[by] ?? fields[by];
    return [{ by: typeof value === 'string' && value !== '' ? value : null, minor, note: typeof part.note === 'string' ? part.note : '' }];
  });
}

/** What a list row says in place of its one category: `Split · 3 categories`, or the parts where they share one. */
export function splitSaid(parts: readonly Part[]): string {
  const kinds = new Set(parts.map((p) => p.by ?? '')).size;
  return kinds > 1 ? `Split · ${kinds} categories` : `Split · ${parts.length} parts`;
}

/** The part a row's mark is drawn from: the largest, the first of equals. */
export function largestPart(parts: readonly Part[]): Part | null {
  return parts.reduce<Part | null>((top, p) => (top === null || p.minor > top.minor ? p : top), null);
}

/** How much of `minor` the parts leave to place: positive is left over, negative is past the amount. */
export const leftOf = (minor: number, parts: readonly Pick<Part, 'minor'>[]): number => minor - parts.reduce((n, p) => n + p.minor, 0);

/** The parts as the record takes them, in the line's currency; a part with no amount is left out. */
export function partsPatch(parts: readonly Part[], at: SplitAt, by: string, currency: string): Record<string, unknown>[] {
  return parts
    .filter((p) => p.minor > 0)
    .map((p) => ({
      ...(p.by !== null ? { [by]: p.by } : {}),
      [at.of]: { amount: p.minor, currency },
      ...(p.note.trim() !== '' ? { note: p.note.trim() } : {}),
    }));
}

/** The words of a split, kept here so the line's page and its editor say one thing. */
export const splitWords = {
  heading: 'Split',
  start: 'Split this line',
  change: 'Change the split',
  remove: 'Take the split off',
  add: 'Add a part',
  drop: 'Take this part out',
  save: 'Save split',
  cancel: 'Cancel',
  category: 'Category',
  amount: 'Amount',
  note: 'Note',
  pick: 'Pick a category',
  left: (said: string) => `${said} left to place`,
  over: (said: string) => `${said} more than the line`,
  even: 'The parts add up to the line.',
  needTwo: 'A split has two parts or more.',
  needCategory: 'Give every part a category.',
  saved: 'Split saved',
  removed: 'Split taken off',
};
