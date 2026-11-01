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

import { hubWords, onDay, type HubRow } from './hub.ts';

/** What a row needs to be folded: its key, its family, and its count. */
export type Kin = Pick<HubRow, 'key' | 'family' | 'fired' | 'lastAt' | 'month'>;

/** One family folded: its name, how many rules, their count summed, the newest firing, and the members in order. */
export type Family<T extends Kin> = {
  key: string;
  name: string;
  count: number;
  /** The members' count summed, or `null` when any member came with none, since a sum of some is not the whole. */
  fired: number | null;
  /** The members' months summed, on the same terms: `undefined` when any member came without one. */
  month?: number | undefined;
  lastAt: string | null;
  /** How many members never ran, from the same counts. */
  never: number;
  members: T[];
};

/** One thing the hub draws: a rule by itself, or a family that opens. */
export type Fold<T extends Kin> = { kind: 'one'; row: T } | { kind: 'family'; family: Family<T> };

export const familyWords = {
  count: (n: number) => `${n.toLocaleString('en')} rules`,
  alone: (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'rule' : 'rules'} on their own`,
  /* THE FOLD PAST SIX SINGLE RULES (L47). */
  more: (n: number) => `${n.toLocaleString('en')} more ${n === 1 ? 'rule' : 'rules'}`,
  fewer: 'Show fewer',
  noneRan: 'Never ran',
  someNever: (n: number) => `${n.toLocaleString('en')} never ran`,
  /* WHAT THE FAMILY'S SWITCHES SAY TOGETHER, in the column every other row's switch stands in. */
  allOn: 'All on',
  allOff: 'All off',
  someOn: (on: number, of: number) => `${on} of ${of} on`,
} as const;

/** A family's switches said as one, or `null` where its rules carry none (a list shown without switches). */
export function familyOn(members: readonly { toggle?: { on: boolean } | null | undefined }[]): string | null {
  const switched = members.filter((m) => m.toggle);
  if (switched.length === 0) return null;
  const on = switched.filter((m) => m.toggle!.on).length;
  return on === switched.length ? familyWords.allOn : on === 0 ? familyWords.allOff : familyWords.someOn(on, switched.length);
}

/** "A", "A and B", "A, B and C". */
const and = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** A family's name: what its actions act on, and the list: "Category on Ledger". One whose actions name nothing is the list's name alone, since its line already says "3 rules". */
export function familyName(list: string, did: readonly string[]): string {
  return did.length === 0 ? list : `${and(did)} on ${list}`;
}

/**
 * The rows with each family of two or more folded into one, placed where its first member was, members in the order
 * they came. A row with no family, or the only one of its family, is itself.
 */
export function families<T extends Kin>(rows: readonly T[]): Fold<T>[] {
  /* TWO FAMILIES THAT WOULD BE CALLED THE SAME ARE ONE: the record keys a family by the
     body's whole shape, so rules on Ledger that set nothing a name says came as two keys, and On drew "Rules on
     Ledger" twice, 6 rules and 58. What he reads is the name, so the name is what folds. */
  const said = (r: T): string | null => (r.family ? familyName(r.family.list, r.family.did) : null);
  const by = new Map<string, T[]>();
  for (const r of rows) {
    const name = said(r);
    if (name === null) continue;
    const kin = by.get(name);
    if (kin) kin.push(r);
    else by.set(name, [r]);
  }
  const out: Fold<T>[] = [];
  const placed = new Set<string>();
  for (const r of rows) {
    const name = said(r);
    const kin = name === null ? undefined : by.get(name);
    if (!r.family || name === null || !kin || kin.length < 2) {
      out.push({ kind: 'one', row: r });
      continue;
    }
    if (placed.has(name)) continue;
    placed.add(name);
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
  /* THE MONTH TOO, so the line says its period as each member's does (AF9). */
  const month = counted && members.every((m) => typeof m.month === 'number') ? members.reduce((n, m) => n + (m.month ?? 0), 0) : undefined;
  return { key, name: familyName(list, did), count: members.length, fired, month, lastAt, never, members };
}

/**
 * A family's second line: what its rules have done together, and how many of them never ran. `''` when the host sent
 * no count, as a rule's own line says nothing it cannot know.
 */
export function familySaid(f: Family<Kin>, now: number): string {
  if (f.fired === null) return '';
  if (f.fired === 0) return familyWords.noneRan;
  const ran = hubWords.ranCount(f.fired, f.lastAt ? onDay(f.lastAt, now) : '', f.month).replace(/\.$/u, '');
  return f.never > 0 ? `${ran} · ${familyWords.someNever(f.never)}` : ran;
}
