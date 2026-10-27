/**
 * What typing in a page's head narrows: the word a reader typed under the head's `search: { param }`, as the
 * clauses that keep a row of each list the page draws whose title, or a field its list marks `search: true`, holds it.
 *
 * THE SAME WORDS THE RECORD'S SEARCH FINDS A ROW BY. The fields are the ones `fts.ts` indexes (`projectedText`: the
 * title always, and every field marked to be searched), and the word is folded by `ftsQuery`'s own rule, imported and
 * never copied: composed, lower case, marks between letters read as spaces, each run of letters one word. So a head
 * and the search box agree on what a row says. Each word must be in one of those fields; every word must be found.
 *
 * A BLOCK OVER NO LIST IS LEFT AS IT IS: a figure, a note, the log. A list with nothing a word could be found in keeps
 * no row while a word is typed, since none of its rows says it.
 */

import type { Predicate } from '@braindog/where';

import { ftsQuery } from './fts.ts';

/** The fewest characters a typed word narrows by. One letter is in nearly every row, so it narrows nothing. */
export const SEARCH_LEAST = 2;
/** The most characters a typed word is read to. Past this is a paste, and the rest of it is left off. */
export const SEARCH_MOST = 80;

/** The types a typed word is looked for in: the ones whose stored value is the words a person reads. */
const SEARCHED_TYPES: ReadonlySet<string> = new Set(['text', 'document', 'url', 'email', 'enum']);

/** What the search asks of one list: its fields, each with whether it is marked to be searched, and its title. */
export type SearchShape = {
  fields: readonly { id: string; type: string; search?: boolean | undefined; retired?: boolean | undefined }[];
  title: string | null;
};

/** A block as the search reads it: the source it names, which is all it needs to say which list a block reads. */
type Sourced = { source?: unknown } | null | undefined;

/** The list a block reads rows of, or `null` for one over a figure, a computed source or nothing. */
export const listRead = (b: Sourced): string | null =>
  b !== null && typeof b === 'object' && typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;

/** The word as it narrows: trimmed and cut to `SEARCH_MOST`, or `null` when it is shorter than `SEARCH_LEAST`. */
export function searchWord(raw: string): string | null {
  const chars = [...raw.trim()];
  if (chars.length < SEARCH_LEAST) return null;
  return chars.slice(0, SEARCH_MOST).join('').trim();
}

/**
 * The word folded into the words `ftsQuery` would look for, each IN THE CASE IT WAS TYPED where folding only lowered it.
 * `contains` lowers both sides in SQLite, whose `lower` folds ASCII letters only, so a typed "Émile" lowered here to
 * "émile" missed the "Émile" the row holds, letter for letter what was typed. Kept as typed, ASCII still matches in any
 * case, and a word with a capital past ASCII matches the case it is written in, as the list's own search box does.
 */
function foldedWords(word: string): string[] {
  const q = ftsQuery(word);
  const folded = q === null ? [] : [...q.matchAll(/"([^"]*)"\*/gu)].map((m) => m[1]!).filter((w) => w !== '');
  return (folded.length === 0 ? null : caseKept(word, folded)) ?? folded;
}

/** The typed words, one a folded word, when each lowers to it; `null` when they do not line up one to one. */
function caseKept(word: string, folded: readonly string[]): string[] | null {
  const parts = word.normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '');
  return parts.length === folded.length && parts.every((p, i) => p.toLowerCase() === folded[i]) ? parts : null;
}

/** The fields of one list a word is looked for in: its title and every field marked `search: true`, of a type that reads. */
export function searchedFields(shape: SearchShape): string[] {
  return shape.fields.filter((f) => !f.retired && (f.search === true || f.id === shape.title) && SEARCHED_TYPES.has(f.type)).map((f) => f.id);
}

/**
 * The clauses the typed word makes, by the list each narrows: for each list a block reads, one predicate keeping the rows
 * that hold every folded word in one of its searched fields. Empty when the word narrows nothing (`searchWord`).
 */
export function searchClauses(schemaOf: (register: string) => SearchShape | null, blocks: readonly Sourced[], word: string): Map<string, Predicate[]> {
  const out = new Map<string, Predicate[]>();
  const said = searchWord(word);
  const words = said === null ? [] : foldedWords(said);
  if (words.length === 0) return out;
  for (const register of new Set(blocks.map(listRead))) {
    if (register === null) continue;
    const shape = schemaOf(register);
    const fields = shape ? searchedFields(shape) : [];
    const one = (w: string): Predicate => (fields.length === 1 ? { field: fields[0]!, contains: w } : { any: fields.map((field) => ({ field, contains: w })) });
    out.set(register, [words.length === 1 ? one(words[0]!) : { all: words.map(one) }]);
  }
  return out;
}
