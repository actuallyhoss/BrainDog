/**
 * Filling the holes of a document: `{{field}}` from a row, and `{{it}}` from a figure's parameter.
 *
 * THIS FILE IMPORTS THE GRAMMAR AND NOTHING ELSE THAT RUNS. It was part of `pages.ts`, which imports
 * `money-figures.ts`, and a walk that opens from a figure read about one book has to fill that figure where the walk
 * is read. The edge back from there to `pages.ts` loaded it before `metrics.ts` had made its constants, so the rule
 * was written a second time and a test held the two equal. Here both files can reach the one rule.
 */
import type { Predicate } from '@braindog/where';
import { clausesOf, quoteValue, unquoted } from '@braindog/where';

import type { Json } from './coerce.ts';
import type { Entry } from './index.ts';

/** The one placeholder a parameter fills, spelled once so `scopeOf` and `fill` cannot disagree about it. */
const PARAM = '{{it}}';

/**
 * The clauses of a filter that a parameter fills, and nothing else: the figure's scope.
 *
 * A PARAMETER IS NOT A FILTER OVER A REGISTER, IT IS WHICH REGISTER THE FIGURE IS ABOUT. That is the
 * whole distinction `Reading.held` was added to draw, and it was lost here: `project-owed:Kiln` fills
 * `thing is {{it}}` into a predicate that also says `state is open`, and the count of rows the
 * predicate chose from was then taken over every obligation in the record. Measured on the shipped
 * seed, a brand-new project answered `rows: 0, held: 38`, which a tile reads as *nothing is overdue*
 * on the screen most likely to be new and empty.
 *
 * SO THE DECISION IS MADE HERE, WHERE THE PARAMETER IS KNOWN, and not in the evaluator, which is
 * handed a filled predicate with no way left to tell which clause carried the name. Every reader that
 * fills a parameter goes through `fill`, so `packages/record`'s `metric` call gets the same answer the
 * page runner does without a second copy of this rule.
 *
 * A COMMA IS WHAT SEPARATES A SENTENCE'S CLAUSES, cut by the grammar's own `clausesOf` as `parseWhere` cuts them, so the clauses
 * kept here are the clauses that grammar would have built. A JSON predicate is the same idea one
 * level down: the conjuncts of a top-level `all`, or a lone leaf.
 *
 * AND ONLY UNDER A CONJUNCTION. A parameter inside an `any` or a `none` does not cut the register
 * down, it widens or inverts it, so there is no slice to count and this answers nothing, which leaves
 * `held` the whole register it has always been. Narrowing on a disjunct would be a smaller number
 * than the truth, and a `held` under `rows` is a reading that contradicts itself.
 *
 * AND A SENTENCE WITH A `, or` IS THAT `any`, SO IT ANSWERS NOTHING TOO. `parseWhere` reads `a, or b` as
 * `{ any: [a, b] }` and this went on splitting it on the comma. Measured over five obligations with Halden as the
 * parameter: `party is {{it}}, or state is paid` read `rows: 2, held: 1`, and `state is paid, or party is {{it}}` kept
 * ` or party is Halden` as its scope and was refused `FIELD_UNKNOWN` for a field called `or` (`scope-any.test.ts`). The
 * test is `parseWhere`'s own: a condition after the first that begins with the word `or`. A sentence that mixes the two
 * separators is refused whole by the grammar, so answering nothing for it here loses nothing.
 */
function scopeOf(where: unknown): Predicate | string | undefined {
  if (typeof where === 'string') {
    const conditions = clausesOf(where).map((clause) => clause.trim()).filter(Boolean);
    if (conditions.slice(1).some((clause) => /^or(?:\s|$)/i.test(clause))) return undefined;
    const kept = clausesOf(where).filter((clause) => clause.includes(PARAM));
    return kept.length === 0 ? undefined : kept.join(',');
  }
  if (where === null || typeof where !== 'object' || Array.isArray(where)) return undefined;
  const node = where as Record<string, unknown>;
  if (Array.isArray(node.all)) {
    const kept = node.all.filter((child) => JSON.stringify(child ?? null).includes(PARAM));
    return kept.length === 0 ? undefined : ({ all: kept } as Predicate);
  }
  if ('any' in node || 'none' in node) return undefined;
  return JSON.stringify(node).includes(PARAM) ? (where as Predicate) : undefined;
}

/**
 * The keys whose string is a `where:` sentence, where a filled value has to stay one value: a block's filter, a ring's
 * `of:`, and the scope a parameter sets.
 */
const SENTENCES = new Set(['where', 'of', 'within']);

/**
 * `{{field}}` filled from one row, everywhere in the document.
 *
 * EVERY STRING IN THE WHOLE DOCUMENT, deliberately: the placeholder appears in a title, in a
 * predicate, in a heading, in an empty state and in a metric id, and a substitution that walked only
 * the fields somebody remembered is a substitution that leaves `{{name}}` on a screen.
 *
 * A VALUE FILLED INTO A SENTENCE IS ONE VALUE THERE. A part called `Wax, wick and scent` made `part is {{name}}` the
 * two clauses `part is Wax` and `wick and scent`, and every block filtered by the part on its page was refused
 * `FIELD_UNKNOWN`, "parts has no field called wick" (measured on a pack with a page per part). So under a key in
 * `SENTENCES` the value is written by the grammar's own `quoteValue`: bare where the bare words read back as that one
 * value, which is every name a page printed before, and quoted where they would not, a comma, an `or`, a quote mark or
 * a leading `not`. A heading, a title and a body get the value as it stands.
 *
 * A PARAMETER ALSO SETS `within` ON WHAT IT FILLS, and only a parameter: the clauses it landed in are
 * the figure's scope rather than its filter, and `evaluateMetric` counts `held` inside them. It is
 * written before the substitution runs so the name inside it is written by the same rule as the name
 * inside `where`, which is the only way the two can be guaranteed to compile to the same rows.
 *
 * A WALK OVER THE VALUES AND NOT A PASS OVER THE JSON TEXT. The text pass had to escape every value the way
 * JSON escapes (a title `C:\Repos` made `JSON.parse` throw out of `resolvePages`, and every page in the
 * record went unlistable), and it could not tell a sentence from a heading. A walk hands each string its own
 * value, and a key is never filled.
 */
export function fill(doc: unknown, row: Entry | null, param?: string): unknown {
  /* A DOCUMENT WITH A PARAMETERISED `where` IS A METRIC TEMPLATE, which is the only document a
     parameter is ever handed: a page template is filled from a ROW and carries no top-level `where`
     of its own. So the key is added on that shape and nowhere else. */
  const scope = param === undefined || doc === null || typeof doc !== 'object' || Array.isArray(doc) ? undefined : scopeOf((doc as { where?: unknown }).where);
  /* What a hole names, as the row holds it, or `null` when nothing is held there. */
  const heldOf = (key: string): Json | null => {
    if (key === 'it') return param ?? null;
    /* A ROW'S SPOKEN ID, spelled as the ladder writes a run's `project` (`things#1`), so a template page
       finds its runs by `project is {{spoken}}`. A register with its own prefix would need its
       declaration here; the projects register has none. */
    if (key === 'spoken') return row ? row.register + '#' + String(row.seq) : null;
    /* THE ROW'S OWN NUMBER, so a template page draws its own row by `seq is {{seq}}`: a bill's title is "Rent" on every
       month's bill, and a block over `what is {{what}}` drew all of them. A field cannot be called `seq`. */
    if (key === 'seq') return row && typeof row.seq === 'number' ? row.seq : null;
    /* OWN PROPERTIES ONLY. `{{constructor}}` read the prototype and filled a heading with source code. */
    const value = row && Object.hasOwn(row.fields, key) ? row.fields[key] : undefined;
    return value === undefined ? null : value;
  };
  /* A LIST OUTSIDE A SENTENCE IS ITS VALUES, one a line in a note's `body` and joined by commas anywhere else. Written
     with `String` it was `a,b`, and a person's "Seen in" read two sightings run together with a bare comma. */
  const valueOf = (key: string, lines: boolean): string | null => {
    const value = heldOf(key);
    if (!Array.isArray(value)) return value === null ? null : String(value);
    return value
      .flatMap((one) => (typeof one === 'string' || typeof one === 'number' || typeof one === 'boolean' ? [String(one)] : []))
      .join(lines ? '\n' : ', ');
  };
  /* A LIST IN A SENTENCE IS ITS VALUES JOINED BY `or`, which is how the grammar reads several values after `is`
     (`state is open or doing`). Written with `String` it was `a,b`, and the comma cut the clause in two. A quote holds
     one value, so a list holding a value that has to be quoted has no sentence it can be written as, and it is left
     unfilled, as a field holding nothing is. */
  const saidOf = (key: string): string | null => {
    const value = heldOf(key);
    if (!Array.isArray(value)) return value === null ? null : quoteValue(String(value));
    const words = value.map((one) => (typeof one === 'string' || typeof one === 'number' || typeof one === 'boolean' ? String(one) : null));
    const [only] = words;
    if (words.length === 1 && typeof only === 'string') return quoteValue(only);
    return words.length > 1 && words.every((word) => word !== null && quoteValue(word) === word) ? words.join(' or ') : null;
  };
  const text = (s: string, sentence: boolean, lines = false): string =>
    s.replace(/\{\{(\w+)\}\}/g, (whole: string, key: string, at: number) => {
      if (!sentence) return valueOf(key, lines) ?? whole;
      /* A HOLE THE AUTHOR ALREADY QUOTED IS NOT QUOTED AGAIN. `what contains "{{it}}"` took the value quoted by
         `quoteValue` inside the author's own marks, and a value that needed quoting came out as two quotes the grammar
         reads as neither. So where the marks round the hole are a quote by the grammar's own reading (`unquoted`,
         opening at the start of a word and closing before a comma or the end), the value goes in as it stands with each
         closing mark written twice, which the grammar reads back as one mark of the value. */
      const close = s[at + whole.length];
      if (
        close === undefined ||
        at === 0 ||
        (at > 1 && !/[\s,]/.test(s[at - 2] ?? '')) ||
        unquoted(s.slice(at - 1, at + whole.length + 1)) !== whole ||
        !/^\s*(?:,|$)/.test(s.slice(at + whole.length + 1))
      )
        return saidOf(key) ?? whole;
      const value = heldOf(key);
      return value === null || Array.isArray(value) ? whole : String(value).replaceAll(close, close + close);
    });
  const walk = (node: unknown, sentence: boolean): unknown => {
    if (typeof node === 'string') return text(node, sentence);
    if (Array.isArray(node)) return node.map((n) => walk(n, false));
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, typeof v === 'string' && k === 'body' ? text(v, false, true) : walk(v, SENTENCES.has(k))]));
  };
  return walk(scope === undefined ? doc : { ...(doc as object), within: scope }, false);
}
