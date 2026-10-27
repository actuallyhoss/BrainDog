/**
 * `rows-same` ("C13's clashes"): the things held twice in every list that says what makes two of its rows one.
 *
 * WHAT WAS THERE BEFORE. A list declaring `same:` had its rows here twice read by `same.ts` `clashes`, and the list
 * itself said "3 skills are here twice" while `?twice=1` narrowed it. The tidy counted none of it, so "Things gone
 * stale" on the Agents page and `braindog tidy` never said a skill or a key was held twice.
 *
 * WHAT IS COUNTED. For every live list whose `same:` a row can answer (`sameListOf`), the rows `clashes` would fold:
 * each group's rows past the one its `keep` keeps, so a pair counts 1 and three alike count 2. A row in two groups is
 * counted once. A row deleted or finished is not here (`same.ts` reads only the live, unfinished ones), and a row
 * holding a sealed value is never folded away, so it is not counted either. The lists are read from their
 * declarations, so no list is named here: what a pack declares is what is counted.
 *
 * COUNTED ONLY. Its `ask` is always `null`, so the tidy files nothing for it, by day or in the night. The fold is his
 * press on the list (`?twice=1`), which files one question a list signed by whoever pressed; nothing here asks, files,
 * folds or decides. `did` is 0: a fold is his answer, never something the record cleared by itself.
 */

import type { Sql } from '@braindog/ports';

import { clashes, sameListOf, type SameDecl } from './same.ts';
import type { Finder, FoundAt } from './tidy.ts';

/** A list that says what makes two of its rows one, as its declaration holds it, with the words it calls its things by. */
type Declared = SameDecl & { name?: string; one?: string };

/** Every live list, not retired, whose `same:` a row can answer, read from its declaration, by name. */
export function sameDeclared(sql: Pick<Sql, 'all'>): Declared[] {
  return sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")
    .flatMap((r) => {
      const body = JSON.parse(r.body) as Partial<Declared>;
      if (typeof body.id !== 'string' || !Array.isArray(body.fields)) return [];
      const decl = body as Declared;
      return sameListOf(decl) === null ? [] : [decl];
    })
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id) || a.id.localeCompare(b.id));
}

/** How many rows of one list a fold would fold: every group's others, a row in two groups once. */
export function heldTwiceIn(sql: Pick<Sql, 'all'>, decl: SameDecl): number {
  return new Set(clashes(sql, decl).flatMap((g) => g.others)).size;
}

/** A list's name said inside a sentence: a word written Capitalised is lowered, any other as it was typed (API). */
const inSentence = (name: string): string => name.replace(/\p{L}+/gu, (w) => (/^\p{Lu}\p{Ll}*$/u.test(w) ? w.toLowerCase() : w));

/**
 * One list's line, in its own words, as the list says it above itself: "2 skills are here twice", "1 key is here
 * twice". A list that gives no word for one of its things says "1 thing in Skills is here twice", and one with no
 * name at all says the whole line's words.
 */
export function heldTwiceLine(decl: Pick<Declared, 'id' | 'name' | 'one'>, n: number): string {
  const name = typeof decl.name === 'string' && decl.name.trim() !== '' ? decl.name.trim() : null;
  if (name === null) return rowsSameLine(n);
  if (n !== 1) return `${n} ${inSentence(name)} are here twice`;
  const one = typeof decl.one === 'string' && decl.one.trim() !== '' ? inSentence(decl.one.trim()) : null;
  return one === null ? `1 thing in ${name} is here twice` : `1 ${one} is here twice`;
}

/** The whole line: "3 things are here twice". */
export const rowsSameLine = (n: number): string => (n === 1 ? '1 thing is here twice' : `${n} things are here twice`);

/** Where a list shows only its things here twice, with the one press that folds them: `/r/<list>?twice=1`. */
export const twiceHref = (list: string): string => `/r/${encodeURIComponent(list)}?twice=1`;

/** The lists holding anything twice, each with its line, its count and its address, by name. */
export function rowsSameAt(sql: Pick<Sql, 'all'>): FoundAt[] {
  return sameDeclared(sql).flatMap((decl) => {
    const count = heldTwiceIn(sql, decl);
    return count > 0 ? [{ said: heldTwiceLine(decl, count), count, href: twiceHref(decl.id) }] : [];
  });
}

/** `rows-same`, the finder. Counted only: its `ask` is always `null`, so nothing is ever filed for it. */
export const rowsSame: Finder = {
  id: 'rows-same',
  name: 'Things here twice',
  find(sql) {
    const at = rowsSameAt(sql);
    const stale = at.reduce((n, l) => n + l.count, 0);
    /* NO LINE FOR NOUGHT: "0 things are here twice" is a sentence nobody needs to read. */
    return stale > 0 ? { stale, did: 0, ask: null, said: rowsSameLine(stale), at } : { stale, did: 0, ask: null };
  },
};
