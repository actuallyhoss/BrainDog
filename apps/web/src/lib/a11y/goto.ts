/**
 * Where `g` then a letter lands, READ FROM THE RAIL rather than from a table.
 *
 * IT WAS A TABLE OF SEVEN IN THE ROOT LAYOUT, so Money, Work, Projects, People and any page an add-on or the person put
 * in the rail had no letter, and the help sheet printed the same seven whatever the rail held. "The shortcuts are derived
 * from the rows": every place in the rail gets a letter of its own here, and the sheet prints this same list.
 *
 * THE SEVEN SOMEBODY ALREADY LEARNT COME FIRST AND KEEP THEIR LETTERS, whether or not the rail draws them: a derived
 * letter must never move one (the sign would be `g p` opening Projects where it opened Add-ons). Then a row's own
 * declared letter, then the first free letter of its name, `a` to `z`. `g` is never a target, because it is the prefix,
 * and a digit never is, because `g 1`–`g 9` count the rail and stay in the layout. A row with no free letter gets none.
 *
 * Pure, and loaded only when `g` arms or the sheet is asked for, so the entry script carries none of it.
 */

import { BINDINGS } from './bindings.ts';

export type GotoRow = { href: string; name: string; key?: string | undefined };
export type Goto = { key: string; href: string; name: string };

/** The seven of the old table, as declared letters on their own places. */
const LEARNT: readonly Goto[] = [
  { key: 'h', href: '/', name: 'Today' },
  { key: 'd', href: '/decide', name: 'Needs you' },
  { key: 'i', href: '/inbox', name: 'Inbox' },
  { key: 's', href: '/search', name: 'Search' },
  { key: 'k', href: '/keychain', name: 'Keychain' },
  { key: 'p', href: '/settings/plugins', name: 'Plugins' },
  { key: ',', href: '/settings/appearance', name: 'Settings' },
];

/** A letter a row may hold: one character, not the prefix and not a digit. */
const free = (key: string, taken: ReadonlySet<string>): boolean => key.length === 1 && key !== 'g' && !/\d/u.test(key) && !taken.has(key);

/** The letters of a name, `a` to `z`, with an accent read as its letter (`É` is `e`). */
const lettersOf = (name: string): string[] =>
  [...name.normalize('NFD').toLowerCase()].filter((c) => c >= 'a' && c <= 'z');

export function gotoOf(rows: readonly GotoRow[]): Goto[] {
  /* A LEARNT PLACE THE RAIL DRAWS IS SAID BY THE RAIL'S NAME FOR IT, so a Home somebody calls Today reads Today. */
  const out: Goto[] = LEARNT.map((l) => ({ ...l, name: rows.find((r) => r.href === l.href)?.name ?? l.name }));
  const taken = new Set(out.map((l) => l.key));
  const seen = new Set(out.map((l) => l.href));
  const rest = rows.filter((r) => !seen.has(r.href) && (seen.add(r.href), true));
  const chosen = new Map<GotoRow, string>();

  /* DECLARED FIRST, ACROSS EVERY ROW, so a name earlier in the rail cannot take a letter a later row asked for. */
  for (const r of rest) {
    const key = r.key?.toLowerCase();
    if (key !== undefined && free(key, taken)) taken.add(key), chosen.set(r, key);
  }
  for (const r of rest) {
    if (chosen.has(r)) continue;
    const key = lettersOf(r.name).find((c) => free(c, taken));
    if (key !== undefined) taken.add(key), chosen.set(r, key);
  }
  for (const r of rest) {
    const key = chosen.get(r);
    if (key !== undefined) out.push({ key, href: r.href, name: r.name });
  }
  return out;
}

/** The sheet's line: the letters in order, and the places they open in the same order. */
export function chordOf(list: readonly Goto[]): { key: string; label: string } {
  return { key: `g then ${list.map((l) => l.key).join(' ')}`, label: `Go to ${list.map((l) => l.name).join(', ')}` };
}

/** Where a letter goes in this rail, or nothing. */
export function hrefOf(rows: readonly GotoRow[], letter: string): string | undefined {
  return gotoOf(rows).find((l) => l.key === letter.toLowerCase())?.href;
}

/**
 * THE SHEET PRINTS THE SAME LIST: the `g` row of the registry takes this rail's line. The sheet reads the registry when
 * it is drawn, so the layout draws it again after this.
 */
export function sayGoto(rows: readonly GotoRow[]): void {
  const row = BINDINGS.find((b) => b.id === 'goto');
  if (row) Object.assign(row, chordOf(sheetOf(rows)));
}

/**
 * WHAT THE SHEET NAMES: every letter, but Inbox only while the rail draws it (audit 31 Oct g, AG33). "g then i: Go to
 * Inbox" led to a place the rail did not show, which reads as a mistake; `g i` still goes there for whoever learnt it.
 */
export function sheetOf(rows: readonly GotoRow[]): Goto[] {
  return gotoOf(rows).filter((l) => l.href !== '/inbox' || rows.some((r) => r.href === '/inbox'));
}
