/**
 * Rules of one family drawn as one row: the rules on one list that do the same thing to the same field.
 *
 * SIXTY LINES THAT SAY ONE THING ARE ONE LINE. A record that files by payee grows a rule per payee, each setting
 * Category on the same list, and the hub drew every one down a page several screens tall. The record answers a
 * `family` key for each (`familyOf` in `packages/record/src/automations.ts`), read from the body's shape alone; here
 * the rows that share one fold into "Category on Ledger, 57 rules", which opens to its members in the order they came.
 *
 * THE NAME IS WORDS THE ROWS ALREADY SAY, never the key: the list's name as the rail says it and the fields the actions
 * set (`ruleSaid` in `hub.ts`). A family of one is the rule itself, since a fold of one hides nothing.
 *
 * PURE, so it loads in plain Node: the clock is an argument.
 */

import { hubWords, onDay, spell, type HubRow } from './hub.ts';

/** What a row needs to be folded: its key, its family, and its count. */
export type Kin = Pick<HubRow, 'key' | 'family' | 'fired' | 'lastAt'>;

/** One family folded: its name, how many rules, their count summed, the newest firing, and the members in order. */
export type Family<T extends Kin> = {
  key: string;
  name: string;
  count: number;
  /** The members' count summed, or `null` when any member came with none, since a sum of some is not the whole. */
  fired: number | null;
  lastAt: string | null;
  /** How many members never ran, from the same counts. */
  never: number;
  members: T[];
};

/** One thing the hub draws: a rule by itself, or a family that opens. */
export type Fold<T extends Kin> = { kind: 'one'; row: T } | { kind: 'family'; family: Family<T> };

export const familyWords = {
  count: (n: number) => `${n.toLocaleString('en')} rules`,
  noneRan: 'None of them has run.',
  someNever: (n: number) => `${spell(n, true)} never ran.`,
} as const;

/** "A", "A and B", "A, B and C". */
const and = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** A family's name: what its actions act on, and the list: "Category on Ledger". One whose actions name nothing is the list's rules. */
export function familyName(list: string, did: readonly string[]): string {
  return did.length === 0 ? `Rules on ${list}` : `${and(did)} on ${list}`;
}

/**
 * The rows with each family of two or more folded into one, placed where its first member was, members in the order
 * they came. A row with no family, or the only one of its family, is itself.
 */
export function families<T extends Kin>(rows: readonly T[]): Fold<T>[] {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.family) continue;
    const kin = by.get(r.family.key);
    if (kin) kin.push(r);
    else by.set(r.family.key, [r]);
  }
  const out: Fold<T>[] = [];
  const placed = new Set<string>();
  for (const r of rows) {
    const kin = r.family ? by.get(r.family.key) : undefined;
    if (!r.family || !kin || kin.length < 2) {
      out.push({ kind: 'one', row: r });
      continue;
    }
    if (placed.has(r.family.key)) continue;
    placed.add(r.family.key);
    out.push({ kind: 'family', family: foldOf(r.family.key, r.family.list, r.family.did, kin) });
  }
  return out;
}

function foldOf<T extends Kin>(key: string, list: string, did: readonly string[], members: T[]): Family<T> {
  const counted = members.every((m) => typeof m.fired === 'number');
  const fired = counted ? members.reduce((n, m) => n + (m.fired ?? 0), 0) : null;
  let lastAt: string | null = null;
  for (const m of members) if (m.lastAt && (lastAt === null || Date.parse(m.lastAt) > Date.parse(lastAt))) lastAt = m.lastAt;
  const never = members.filter((m) => m.fired === 0).length;
  return { key, name: familyName(list, did), count: members.length, fired, lastAt, never, members };
}

/**
 * A family's second line: what its rules have done together, and how many of them never ran. `''` when the host sent
 * no count, as a rule's own line says nothing it cannot know.
 */
export function familySaid(f: Family<Kin>, now: number): string {
  if (f.fired === null) return '';
  if (f.fired === 0) return familyWords.noneRan;
  const ran = hubWords.ranCount(f.fired, f.lastAt ? onDay(f.lastAt, now) : '');
  return f.never > 0 ? `${ran} ${familyWords.someNever(f.never)}` : ran;
}
