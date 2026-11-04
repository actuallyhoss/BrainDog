/**
 * One matcher, for the palette, `/search` and the box on a register — because there were two.
 *
 * THEY DISAGREED, AND THE DISAGREEMENT WAS A DOOR THAT LIED. `search()` matched titles only;
 * `applyFilters`' `q` matched every field's rendered value. So the results page counted one set and
 * linked to another: *All 30 in Obligations →* landed on 37 rows, *All 13 in Services* on 16, *All
 * 13 in Tasks* on 14. On a 2,614-row record the link read `All 2,063 in Obligations` and the head it
 * arrived at read `of 2,614`.
 *
 * BOTH WERE WRONG, AND THE RECORD HAS ALWAYS SAID SO. `34 §6` gives the `matches` operator as
 * *"over the register's `search:` fields; whole-token, case-folded"*, `29 §5` says the register's own
 * text filter IS that operator — *"the search box (`matches:`, FTS5 over the register's `search:`
 * fields)"* — and `50 §5.5` step 3 says the palette's rows come from `search({ q, limit: 12 })`, the
 * record's own method rather than a second one. `packages/kernel/src/fts.ts` opens by ruling out
 * both shapes that shipped:
 *
 * > NOT EVERY FIELD. A register says which of its fields are worth searching, with `search: true`,
 * > and the reason is not cost — it is that an index over everything answers every query with
 * > everything. A search that returns the row because its `note` happens to contain "invoice" is a
 * > search whose results a person stops reading, and once they stop reading them they stop using it.
 *
 * Title-only is too narrow: the seed declares `search: true` on nine fields, and `services.provider`
 * and `updates.body` are not titles. Every-rendered-value is the thing that paragraph forbids.
 *
 * AND IT IS A PREFIX MATCH ON WHOLE WORDS, NOT A SUBSTRING. `ftsQuery` builds `"word"* AND "word"*`,
 * so `ren` finds *Renewals* and does not find *children*; two words must both match, in any order,
 * anywhere in the row's searchable text. `includes()` was neither: it found a word's middle and it
 * could not match two words that were not adjacent.
 *
 * PURE, so `node --test` can hold it against the kernel's own functions. `find.test.ts` builds the
 * same projection with `projectedText` and asserts the two strings are identical, which is the check
 * that catches the next drift rather than the last one.
 */

import { REGISTERS } from './held.ts';
import { display } from './api.ts';
import type { Entry, FieldDecl } from './schema.ts';

/**
 * The fields a register says are worth searching, in declared order.
 *
 * `fts.ts`, both halves: `if (!f.search || f.retired) continue`. The `retired` half was missing here
 * and the key was missing from the app's `FieldDecl` entirely, so a retired searchable field went on
 * answering queries in the browser and stopped answering them in the record — the same defect as the
 * missing `search` key, on the same line of the same file this comment quotes.
 *
 * AND `secret` IS BELT AND BRACES rather than the dead branch it reads as. A `secret` should never
 * carry `search: true`; if one ever does, the record's projection would index the value of a
 * credential, and this is the layer that would put it on a results page. `secret-grep` guards the
 * record and this guards the screen.
 */
export function searchable(register: string): FieldDecl[] {
  const reg = REGISTERS[register];
  if (!reg) return [];
  return reg.fields.filter((f) => f.search === true && f.retired !== true && f.type !== 'secret');
}

/**
 * The one line of text a row is found by — `projectedText`, over rendered values.
 *
 * The kernel projects the STORED value, and text is projected here as stored too; any other value as the screen says it.
 * On every searchable field in the seed the two are the same string, all of them `text` or `document`, and
 * `find.test.ts` asserts it rather than assuming it, so a searchable `money` or `ref` field would be caught the day it
 * is declared instead of quietly making the browser and the record disagree.
 *
 * Empty values are dropped rather than leaving blank lines: a blank line in the projection is a
 * token boundary that means nothing.
 */
export function projected(register: string, entry: Entry): string {
  const lines: string[] = [];
  for (const f of searchable(register)) {
    /* THE WORDS STORED, as the record indexes them. A screen may say a line more calmly than it holds it (a bank's capitals
       and its reference, 57a8634c9; a skill by its name, 8a47e508a), and what it leaves out is still what finds the row. */
    const raw = entry.fields[f.id];
    const shown = typeof raw === 'string' ? raw : display(register, f.id, raw);
    if (shown === null) continue;
    /* Whitespace collapsed and trimmed, exactly as `projectedText` does it: a value typed across two
       lines is one run of words to the tokeniser, and an empty one is dropped rather than leaving a
       blank line, which is a token boundary that means nothing. */
    const text = shown.replace(/\s+/gu, ' ').trim();
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

/**
 * What was typed, as FTS5 would read it — `ftsQuery`, minus the quoting it needs and this does not.
 *
 * Punctuation is a separator, not a character: `ftsQuery` strips everything that is not a letter, a
 * number or a space before splitting, so `kiln.example` is two words and `re-new` is two. `null`
 * when nothing survives, which is the same answer the kernel gives and means *no query* rather than
 * *no matches*.
 */
export function terms(q: string): string[] | null {
  const words = fold(q)
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  return words.length ? words : null;
}

/**
 * Lower case, and diacritics dropped from Latin letters only — what the record's index actually does.
 *
 * `0001_kernel.ts` builds `entry_fts` with `tokenize = 'unicode61 remove_diacritics 2'`, so FTS5
 * finds *Zürich* by typing `zurich` and this file found it only by typing *Zürich*. That was the one
 * property of the record's tokeniser this did not have, and it decides whether somebody with an
 * accent in their name is findable at all.
 *
 * AND THEN IT OVERSHOT, IN THE DIRECTION THAT DRAWS A DOOR ONTO AN EMPTY PAGE. Stripping every
 * `\p{M}` is more than `remove_diacritics 2` does. Measured against a real FTS5 table over
 * `node:sqlite`:
 *
 *   · `zurich` → finds `Zurich cafe` AND `Zürich café`      — folded
 *   · `viet`   → finds `Việt`                              — folded
 *   · `محمد`   → finds `محمد` and NOT `مُحَمَّد`      — harakat are NOT folded
 *   · `ωμεγα` → finds `ωμεγα` and NOT `Ωμέγα`      — Greek tonos is NOT folded
 *   · `lodz`   → finds nothing; `Ł` is a letter, not a diacritic, on both sides
 *
 * A browser more permissive than the record is a palette that draws a row whose `All N →` door lands
 * on an empty page — the exact class of defect one matcher was written to end, arriving through the
 * fix for it. So the mark comes off only when the letter underneath is ASCII, which is what those
 * five measurements say `remove_diacritics 2` means. `find.test.ts` asserts them against real FTS5
 * rather than against this sentence.
 *
 * NFD FIRST, because `ü` is one codepoint until it is decomposed into `u` + U+0308. The pairs that
 * are kept stay decomposed, which is harmless: both sides of every comparison come through here.
 *
 * A `function` AND NOT A `const`, and `tokensOf` too. The fixture (then `data.ts`) called `answers()`
 * while its own module body was still evaluating, so its run-log receipts counted the way the record
 * counts, and the two files imported each other, so a `const` arrow here was in its temporal dead zone
 * when that call landed. The cycle is gone now (this file reads `held.ts`, and the fixture's
 * receipts count when they are read), and a hoisted declaration costs nothing, so it stays one.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/(\p{L})(\p{M}+)/gu, (whole, base: string) => (/^[a-z]$/u.test(base) ? base : whole));
}

/**
 * The same split, applied to a row's text, so both sides tokenise once and identically.
 *
 * Exported because the questions group has no declaration to read and still has to answer the same
 * query the same way — a word that means one thing in eight groups and another in the ninth is a
 * query nobody can reason about.
 *
 * IT IS LITERALLY `terms()`, and being able to say that is the point: a review pinned `terms`
 * against `ftsQuery` and left this one unpinned, and the sentence above claims they tokenise
 * identically. Two functions that must agree and one of them checked is how they stop agreeing.
 */
export function tokensOf(text: string): string[] {
  return terms(text) ?? [];
}

/**
 * Does this row answer that query?
 *
 * Named `answers` rather than `matches` because `where.ts` already exports a `matches` — that one
 * asks whether a row satisfies a compiled filter tree, which is a different question with the same
 * English word, and two of them in one file is a collision waiting for the import that reaches for
 * the wrong one.
 *
 * `"word"* AND "word"*`: every term must be the START of some token, and the terms need not be
 * adjacent or in order. Two words that are both prefixes of the SAME token satisfy FTS5 too — `AND`
 * is over the row, not over positions — so `ren ren` matches whatever `ren` matches, which is the
 * behaviour a doubled keystroke should have.
 */
export function answers(register: string, entry: Entry, q: string): boolean {
  const want = terms(q);
  if (!want) return true;
  const has = tokensOf(projected(register, entry));
  return want.every((w) => has.some((t) => t.startsWith(w)));
}

/**
 * WHICH SEARCHABLE FIELD ANSWERED, when it was not the one whose value is on screen.
 *
 * Broadening the match past the title means rows now appear under a title that does not contain what
 * was typed — `Nordhaven` for `dnsimple`, because `services.provider` is searchable. A result a
 * person cannot connect to their own query is a result they distrust, and `13 §5.2`'s argument for
 * saying WHY an empty state is empty is the same argument. `null` when the title itself matched,
 * because then there is nothing to explain.
 */
export function why(register: string, entry: Entry, q: string, title: string): string | null {
  const want = terms(q);
  if (!want) return null;
  const inTitle = tokensOf(title);
  if (want.every((w) => inTitle.some((t) => t.startsWith(w)))) return null;
  for (const f of searchable(register)) {
    if (f.id === REGISTERS[register]?.title) continue;
    const shown = display(register, f.id, entry.fields[f.id]);
    if (shown === null) continue;
    const has = tokensOf(shown);
    if (want.every((w) => has.some((t) => t.startsWith(w)))) return shown;
  }
  return null;
}
