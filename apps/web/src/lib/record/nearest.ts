/**
 * THE PLACES NEAREST TO AN ADDRESS THAT LED NOWHERE, so a not-found screen offers a few to press rather than reading the
 * record's whole index aloud.
 *
 * `/p/nope` answered with thirty-eight page addresses in one sentence ("money · money-rules (Filing rules) · estate
 * (Renewals) · …"), and `/r/nope` with thirty chips. Somebody who mistyped `/p/mony` wants Money, and somebody who typed
 * nonsense wants a way on: five names, the likeliest first, each a link, and Today and Search for the rest.
 *
 * NEAREST BY THE WORDS A PERSON READS AND THE ADDRESS THEY TYPED, whichever is closer: a page titled "Filing rules" at
 * `money-rules` is near both "filing" and "money-rule". A name that holds what was typed, or is held in it, comes before
 * one that is only a few letters away, and ties keep the caller's order, which is the order its own screen shows.
 *
 * PURE, AND NODE LOADS IT.
 */

/** A place a not-found screen can offer: its name as the rail says it, where it opens, and the address it answers at. */
export type Place = { title: string; href: string; address?: string | undefined };

/** How many a not-found screen offers. */
export const NEAREST_MOST = 5;

/** Lower case, and every run of what is not a letter or a digit one space, so `money-rules` reads as `money rules`. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The edits from one string to the other, one row at a time. */
function edits(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/** How far a name is from what was typed: 0 for the same words, under 0.5 for one holding the other, else the share of letters to change. */
function distance(asked: string, name: string): number {
  if (asked === '' || name === '') return 1;
  if (asked === name) return 0;
  if (name.includes(asked) || asked.includes(name)) return 0.5 * (1 - Math.min(asked.length, name.length) / Math.max(asked.length, name.length));
  return 0.5 + 0.5 * (edits(asked, name) / Math.max(asked.length, name.length));
}

/**
 * THE PLACES THE RAIL OFFERS, as a not-found screen offers them: each page by its title at the address it opens, then
 * each list by its name. The address a page answers at is the last segment of where it opens (`/p/money-rules`).
 */
export function shellPlaces(nav: readonly { title: string; href: string }[], lists: readonly { id: string; name: string }[]): Place[] {
  return [
    ...nav.map((n) => ({ title: n.title, href: n.href, address: /^\/p\/([^/?#]+)/u.exec(n.href)?.[1] ?? undefined })),
    ...lists.map((l) => ({ title: l.name, href: `/r/${l.id}`, address: l.id })),
  ];
}

/**
 * THE PLACE THE ADDRESS NAMES OUTRIGHT, differing only in case or punctuation, or null. `/r/projects` on a record whose
 * list is `things`, named Projects, said "No list called Projects", offered Projects as the closest list, and offered to
 * make one more of that name, which the record then refuses. Such an address is that place and needs no screen of its own.
 */
export function namedOutright(asked: string, places: readonly Place[]): Place | null {
  const said = fold(asked);
  if (said === '') return null;
  return places.find((p) => fold(p.title) === said) ?? places.find((p) => p.address !== undefined && fold(p.address) === said) ?? null;
}

/**
 * The `most` places nearest to what was typed, each once by where it opens and once by its name, the nearest first. A
 * page and the list it shows share a name (People's page and its list), and the screen said "People, People" (first-hour
 * audit E20): the first of them, the rail's page, stands for both.
 */
export function nearest(asked: string, places: readonly Place[], most: number = NEAREST_MOST): Place[] {
  const said = fold(asked);
  const seen = new Set<string>();
  const named = new Set<string>();
  const scored: { place: Place; d: number; n: number }[] = [];
  places.forEach((place, n) => {
    const name = fold(place.title);
    if (name === '' || seen.has(place.href) || named.has(name)) return;
    seen.add(place.href);
    named.add(name);
    const d = Math.min(distance(said, fold(place.title)), place.address === undefined ? 1 : distance(said, fold(place.address)));
    scored.push({ place, d, n });
  });
  return scored
    .sort((a, b) => a.d - b.d || a.n - b.n)
    .slice(0, Math.max(0, most))
    .map((s) => s.place);
}
