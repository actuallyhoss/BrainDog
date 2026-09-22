/**
 * Spark's row in the palette, and what its answer draws: the parts of `Palette.svelte` that are rules rather than markup.
 *
 * OUT OF THE COMPONENT SO `node --test` CAN HOLD THEM. `admit.ts` is here for the same reason: a `.svelte` file cannot be
 * imported by a test, and a regex over source proves where a string sits rather than what the panel does with it.
 *
 * WHEN THE ROW EXISTS is `50 §5.5` step 5: a model behind Spark on this host, and a query that matched no place. Without a
 * model the row is ABSENT, NOT DISABLED (`23 §8`), and because the row is the only way into the mode, nothing that says
 * "Spark" can reach the screen on a host without one (`loop/research-spark.md` §0 decision 6).
 *
 * WHAT THE ANSWER DRAWS is pass 1 of `46 §5.4`: the predicate Spark drafted, in words and BEFORE the rows, so a person reads
 * what was asked of the record before reading what it answered; the rows, drawn by code as addresses; and the fold, whose
 * last line is the vault, refused, on every ask (`23 §6`). The model writes none of the words below. It chose a predicate,
 * and the predicate is data.
 */

import { money, yesno } from 'braindog-render';
import type { Reading, SparkWhere } from '@braindog/client';

import { copy } from '../copy.ts';

/**
 * The question the row would ask, or `null` when there is no row.
 *
 * PLAIN TEXT ONLY. `>` `#` `@` and `/` each narrow the palette to one kind of thing that already has its own answer, so a
 * prefixed query is not a question for Spark. AND NOT WHILE THE RECORD'S SEARCH IS STILL ANSWERING: `places` is zero for
 * the frame before the hits arrive, and a row offered in that frame is a row that vanishes under the pointer.
 */
export function offersSpark(a: { spark: boolean; prefix: string | null; text: string; pending: boolean; places: number }): string | null {
  if (!a.spark || a.prefix !== null || a.pending || a.places > 0) return null;
  /* TWO CHARACTERS OR MORE, the palette's own threshold for asking the record's search. Below it the search never ran, so
     `places` would be zero for every single letter and each one would be offered to Spark as a question. */
  const question = a.text.trim();
  return question.length < 2 ? null : question;
}

/** A value inside a predicate, as the record's own screens would print it. */
const valueWords = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v.toLocaleString('en');
  if (typeof v === 'boolean') return yesno(v);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o['amount'] === 'number' && typeof o['currency'] === 'string') return money(o['amount'], o['currency']);
    if (typeof o['value'] === 'number' && typeof o['unit'] === 'string') return `${o['value'].toLocaleString('en')} ${o['unit']}`;
  }
  return JSON.stringify(v) ?? String(v);
};

/**
 * The values a field may hold one of, after `is one of`, WITH COMMAS AND NO `or`. The first draft wrote `open, doing or
 * waiting`, and inside an `any` group that read `state is one of open, doing or waiting or owner is empty`, where the group's
 * `or` and the list's `or` cannot be told apart.
 */
const oneOf = (vs: unknown[]): string => vs.map(valueWords).join(', ');

/**
 * `34 §1`'s `where` tree, in words.
 *
 * A NESTED GROUP IS BRACKETED, and the top one is not. `state is open and tags has urgent or late is yes` reads two ways,
 * and a person checking the predicate against the rows it found has to be able to read it one way.
 */
export function whereWords(w: SparkWhere, nested = false): string {
  const group = (parts: SparkWhere[], joiner: string) => {
    const said = parts.map((p) => whereWords(p, true)).join(joiner);
    return nested && parts.length > 1 ? `(${said})` : said;
  };
  if ('all' in w && Array.isArray(w.all)) return group(w.all, ' and ');
  if ('any' in w && Array.isArray(w.any)) return group(w.any, ' or ');
  if ('none' in w && Array.isArray(w.none)) return `not (${w.none.map((p) => whereWords(p, true)).join(' or ')})`;
  if ('matches' in w && !('field' in w)) return copy.sparkMatches(String(w.matches));

  /* EVERY TEST ON THE LEAF, AND A FALSE `empty` OR `present` AS ITS OPPOSITE, which is how `@braindog/where`'s `splitLeaf`
     runs it. The first draft said the first key and dropped the rest, and ignored the operand of `empty`: the record ran
     `owner is set` under a line that said `owner is empty`. A leaf with two tests is said as the `all` it is run as. */
  const leaf = w as { field: string; via?: string } & Record<string, unknown>;
  const subject = typeof leaf.via === 'string' ? `${leaf.via} ${leaf.field}` : leaf.field;
  const ops = Object.keys(leaf).filter((k) => k !== 'field' && k !== 'via');
  if (ops.length === 0) return subject;
  const said = ops.map((op) => {
    const operand = leaf[op];
    if (op === 'empty' || op === 'present') return `${subject} ${copy.sparkOps[operand === false ? (op === 'empty' ? 'present' : 'empty') : op]}`;
    const verb = copy.sparkOps[op] ?? op;
    if (op === 'between' && Array.isArray(operand) && operand.length === 2) return `${subject} ${verb} ${valueWords(operand[0])} and ${valueWords(operand[1])}`;
    return `${subject} ${verb} ${Array.isArray(operand) ? oneOf(operand) : valueWords(operand)}`;
  });
  return nested && said.length > 1 ? `(${said.join(' and ')})` : said.join(' and ');
}

/** One fold line's predicate: `all`, the canonical JSON the engine traced, or, for anything else, what it said. */
const traced = (predicate: string): string => {
  if (predicate === 'all') return copy.sparkAll;
  try {
    return whereWords(JSON.parse(predicate) as SparkWhere);
  } catch {
    return predicate;
  }
};

export type DrawnRow = { id: string; title: string; spoken: string; register: string; href: string };
export type Drawn = { where: string | null; q: string | null; rows: DrawnRow[]; fold: string[] };

/**
 * A `Reading`, as the palette draws it.
 *
 * THE VAULT'S LINE IS WRITTEN HERE AND NOT COPIED FROM THE ANSWER. The engine appends `{ register: 'grant', rows: 0,
 * predicate: 'refused' }` to every trace, and `23 §6` says the line is drawn every time, including when nothing about
 * credentials was asked. So the drawing does not depend on the engine remembering: the engine's line is dropped wherever it
 * is, and the one line is put last, which also means it can never be drawn twice. Only the refused line is dropped, so a
 * pack's own register that happened to be called `grant` would still be listed.
 */
export function drawReading(r: Reading): Drawn {
  return {
    where: r.predicate === null ? null : whereWords(r.predicate),
    q: r.q,
    rows: r.rows.map((row) => ({
      id: row.id,
      title: row.summary,
      spoken: row.spoken,
      register: row.register,
      href: `/r/${encodeURIComponent(row.register)}/${row.seq}`,
    })),
    fold: [
      ...r.read.filter((t) => !(t.register === 'grant' && t.predicate === 'refused')).map((t) => copy.sparkFoldLine(t.register, t.rows, traced(t.predicate))),
      copy.sparkGrantRefused,
    ],
  };
}
