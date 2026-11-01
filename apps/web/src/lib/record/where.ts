/**
 * `where:` in the browser: the record's sentence, read by the record's own parser, and printed back as an address.
 *
 * THERE IS ONE GRAMMAR AND IT IS `@braindog/where`'s. This file used to be a second compiler of it, which parsed the
 * sentence again, and a matcher that walked rows with it, so every grammar change had to land twice, and the two
 * engines caused bugs between them. The matcher ran only over the sample, which no screen draws any more, so it
 * went with the browser's engine, and `compile` is now `parseWhere` with this tab's
 * declarations and row names handed to it.
 *
 * WHAT IS LEFT IS WHAT THE BROWSER PRINTS. A block, a tile and a page link to the rows they drew (`registerHref`), a
 * chip carries a declared value (`declaredValue`), and two readers ask what a predicate mentions (`compile`,
 * `everyClause`, `joinsWithOr`). None of them decides which rows match: the record does, when it is asked.
 *
 * `Clause` AND `Where` KEEP THEIR SHAPES, because their readers were written against them, and the parse is turned
 * into them below. A refusal is the record's sentence, word for word, since it is the record's parser that wrote it.
 */

import {
  clausesOf,
  compile as compileTree,
  KERNEL_FIELDS,
  parseWhere,
  resolveDay as resolveDayOf,
  type FieldSpec,
  type Predicate,
  type Schema,
} from '@braindog/where';
import { exponentOf } from 'braindog-render';

import { meetsOf, orgRoleOf } from './folk.ts';
import { REGISTERS, seqTitled, TITLES } from './held.ts';
import type { FieldDecl } from './schema.ts';

/* THE RECORD'S OWN READING OF A DAY, re-exported under the name this file always gave it, so a reader that resolves
   a clause's day against a clock reads the one function and not a copy of
   it. A re-export binds no local name, which is why `wordFor` below reads it through the import above as
   `resolveDayOf`. */
export { resolveDay } from '@braindog/where';

export type Clause =
  | { field: string; op: 'is' | 'is not'; values: string[] }
  /* `not on` IS THE NEGATION OF `on`: the record reads `is` and `is not` over a dated field as a day, and so do the
     readers of this shape. */
  | { field: string; op: 'before' | 'after' | 'on' | 'not on'; day: string }
  /**
   * A CLAUSE ABOUT WHETHER THE FIELD HOLDS ANYTHING AT ALL.
   *
   * IT CARRIES NO OPERAND, and the empty list is how that is spelled rather than a missing key: a reader that tests the
   * shape takes a clause with no `values` for a dated one, and an absence has no day to look for.
   */
  | { field: string; op: 'empty' | 'present'; values: [] }
  /**
   * THE TWO OPERATORS ONLY A LIST TAKES, with ONE element, as the record stores it: an enum's declared value, a ref's
   * row number as this tab knows it (`held.ts`), a day as the record resolved it.
   */
  | { field: string; op: 'has' | 'lacks'; values: [string] }
  /** AN ORDER OVER A DAY, the same shape as `before` and `after`, so a reader of a day reads all of them one way. */
  | { field: string; op: Rank; day: string }
  /**
   * AN ORDER OVER A NUMBER, A MONEY OR A QUANTITY. `bounds` is what the record compares, read into the column's units:
   * a money bound is its minor units with its currency. `values` is each bound printed the way a person writes it,
   * which is there for a reader that tests the shape: a clause carrying `values` is one with no day.
   */
  | { field: string; op: Rank | 'between'; values: string[]; bounds: Bound[] }
  /** A text holding the words, in the record's fold. */
  | { field: string; op: 'contains'; values: [string] };

/** The four one-bound orders, by the operator the record's tree spells them with. */
type Rank = 'gt' | 'gte' | 'lt' | 'lte';

/** One bound as the column holds it: a number, a money's minor units with the currency, or a quantity with its unit. */
type Bound = { n: number; currency?: string; unit?: string };

export type Where = {
  /** The register it was read against. A value means nothing without one. */
  register: string;
  /** Every one of these holds of a row the predicate admits. ALWAYS A CONJUNCTION, whatever `any` holds. */
  clauses: Clause[];
  /**
   * The conditions a sentence joined with `, or`, of which a row the predicate admits meets at least one.
   *
   * BESIDE `clauses` AND NOT A FLAG OVER IT, because readers outside this file read `clauses` as a conjunction, and an
   * "or" read through them would say something wrong: out here they see no clause, and add no bound, as they do for a
   * predicate with none. A MEMBER IS A LIST, because one condition can be two clauses: a range of days is its `gte` and
   * `lte` ends, as the record spells it. ABSENT WHEN THE SENTENCE HAS NO `, or`.
   */
  any?: Clause[][];
  /** Everything the record's parser refused, in its own sentences. Non-empty means the predicate says nothing. */
  bad: string[];
};

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/**
 * A label as the record folds it before comparing: every run of spaces and underscores is one space, then case.
 *
 * THE RECORD'S FOLD, WRITTEN OUT BECAUSE IT IS NOT EXPORTED: `packages/where/src/sentence.ts` writes it inline on both
 * sides of each comparison. It is not `norm`, which folds one underscore at a time and collapses no run, and `norm`
 * stays as it is for a value's own words because the record does not collapse runs there either.
 */
export const foldLabel = (v: string): string => v.replace(/[\s_]+/g, ' ').trim().toLowerCase();

/** The declared value whose label the reader said, or `undefined`, and only a value the field still declares. */
function labelledValue(f: FieldDecl | undefined, said: string): string | undefined {
  const want = foldLabel(said);
  const hit = Object.entries(f?.labels ?? {}).find(([, label]) => foldLabel(label) === want)?.[0];
  return hit && (f?.values ?? []).includes(hit) ? hit : undefined;
}

/**
 * A value as the field DECLARES it, from a value as somebody said it.
 *
 * THE RECORD HOLDS `owed_to_me` AND THE DIALECT SAYS `owed to me`, and both are right. A URL is machine-facing, so it
 * carries the declared value, and two writers of one address then agree: a metric's `where` and a segment wrote the
 * two spellings, both filtered, and arriving from the first the segment did not light, because its test is equality.
 *
 * AND THE LABEL A REGISTER GIVES A VALUE IS A THIRD SPELLING OF IT, tried first, as the record's `resolve` tries it.
 */
export const declaredValue = (register: string, field: string, value: string): string => {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  const labelled = labelledValue(f, value);
  if (labelled) return labelled;
  const want = norm(value);
  return f?.values?.find((v) => norm(v) === want) ?? value;
};

/**
 * A list as the record's parser reads it, from the declaration this tab learnt (`held.ts`).
 *
 * THE KERNEL'S `schemaOf`, FIELD FOR FIELD: a retired field names nothing, `of`, `to`, the label and the value labels
 * travel with each field, the mirrored state goes with the list, and `tags` is there on every list that does not
 * declare its own, because the record adds it the same way (`withTags`). A list this tab has not learnt has no fields,
 * so every clause about it is the record's "has no field called" rather than a guess.
 */
export function schemaOf(register: string): Schema {
  const decl = REGISTERS[register];
  const fields: Record<string, FieldSpec> = {};
  for (const f of decl?.fields ?? []) {
    if (f.retired) continue;
    fields[f.id] = {
      type: f.type,
      ...(f.of ? { of: f.of } : {}),
      ...(f.values ? { values: f.values } : {}),
      ...(f.to ? { to: f.to } : {}),
      ...(f.label ? { label: f.label } : {}),
      ...(f.labels ? { labels: f.labels } : {}),
    };
  }
  if (!Object.hasOwn(fields, 'tags')) fields['tags'] = { type: 'list', of: 'text' };
  /* A SERIES HAS NO TEXT TO ASK ABOUT, and the record's compiler refuses a text test over one; the flag rides on the
     record's own answer to `schema`, which this tab keeps whole, though the app's type for a list does not name it. */
  const series = (decl as { series?: unknown } | undefined)?.series === true;
  return { register, fields, ...(decl?.state === undefined ? {} : { state: decl.state }), ...(series ? { series: true } : {}) };
}

/**
 * The row of `to` a sentence names, as the number this tab knows it by, or `null`.
 *
 * A ROW NUMBER FIRST, AND THEN THE NAME. A chip carries the number (`thing:is:1`), because a link should not break when
 * a row is renamed, and a declaration carries the name (`thing is Kiln`); the rows are the record's, as this tab last
 * walked the list (`TITLES`). The number is answered only when it names a row, so `because has 999` is the record's
 * "there is no learnings called 999" and not a comparison against the characters.
 */
function rowNamed(to: string, said: string): string | null {
  const names = TITLES.get(to);
  if (/^\d+$/.test(said) && names?.has(Number(said))) return String(Number(said));
  const seq = seqTitled(to, said, (a, b) => foldLabel(a) === foldLabel(b));
  return seq === null ? null : String(seq);
}

const DATED: ReadonlySet<string> = new Set(['day', 'instant']);

/** The most words one day is written in ("the start of the month 3 months ago"), which is as far as `wordFor` looks. */
const DAY_WORDS = 8;

/** The type the record reads a field as: declared, or one of the record's own columns. */
const typeOf = (schema: Schema, field: string): string | undefined =>
  Object.hasOwn(schema.fields, field) ? schema.fields[field]!.type : Object.hasOwn(KERNEL_FIELDS, field) ? KERNEL_FIELDS[field] : undefined;

/**
 * The words a condition wrote for the day the record resolved, or the day itself when no words say it.
 *
 * THE RECORD RESOLVES `today` TO A DATE, AND A LINK SHOULD CARRY THE WORD. `due before today` minted into an address
 * as `due:before:2026-09-25` opens the right rows today and the wrong ones from tomorrow, and reads as a date nobody
 * wrote. So the words are looked for in the condition itself: a run of up to `DAY_WORDS` of them, from the end, that
 * the record's own `resolveDay` turns into exactly the day it resolved. Nothing is read here that the record did not
 * already read the same way, and a run that says a different day is not taken, so the worst this answers is the
 * resolved day.
 */
function wordFor(text: string, day: string, now: number): string {
  const words = text.trim().split(/\s+/);
  for (let from = words.length - 1; from >= 0; from--)
    for (let n = 1; n <= DAY_WORDS && from + n <= words.length; n++) {
      const said = words.slice(from, from + n).join(' ');
      if (resolveDayOf(said, now) === day) return said;
    }
  return day;
}

/** A bound as the record wrote it, into the column's units, or `null` for a value that is not one. */
function boundOf(v: unknown): Bound | null {
  if (typeof v === 'number') return { n: v };
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { amount?: unknown; currency?: unknown; value?: unknown; unit?: unknown };
  if (typeof o.amount === 'number' && typeof o.currency === 'string') return { n: o.amount, currency: o.currency };
  if (typeof o.value === 'number' && typeof o.unit === 'string') return { n: o.value, unit: o.unit };
  return null;
}

/** A bound printed the way a person writes one: `GBP 960.00`, `5 kg`, `3`. */
const boundText = (b: Bound): string =>
  b.currency !== undefined
    ? `${b.currency} ${(b.n / 10 ** exponentOf(b.currency)).toFixed(exponentOf(b.currency))}`
    : b.unit !== undefined
      ? `${b.n} ${b.unit}`
      : String(b.n);

/**
 * One value of a leaf as words: a money or a quantity printed as a bound is, anything else as its text.
 *
 * THE RECORD'S PARSE HOLDS A MONEY AS `{ amount, currency }`, and `String` of that is `[object Object]`, which a chip
 * would then carry into an address as the value it filters on. Printed as a bound, `amount is GBP 20` reads back as
 * itself through `whereOf`.
 */
const valueText = (v: unknown): string => {
  const b = typeof v === 'object' && v !== null ? boundOf(v) : null;
  return b === null ? String(v) : boundText(b);
};

/** The operators a leaf of the record's tree may carry, as `@braindog/where` lists them. */
const LEAF_OPS = ['is', 'not', 'in', 'not_in', 'before', 'after', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'empty', 'present', 'has', 'lacks'] as const;

/**
 * One condition of the record's parse, as the clauses this file's readers take.
 *
 * A GROUP INSIDE ONE CONDITION IS A RANGE OF DAYS, `all` of its two ends, which is the one group `parseWhere` writes for
 * a single condition when every ref names one row, and `rowNamed` names one. Its members are that condition's clauses.
 * A leaf naming an operator no clause has a shape for comes back `null`, and the caller says so rather than dropping it.
 */
function clausesOfNode(node: Predicate, schema: Schema, text: string, now: number): Clause[] | null {
  const group = node as { all?: Predicate[]; any?: Predicate[]; none?: Predicate[] };
  if (Array.isArray(group.all)) {
    const out: Clause[] = [];
    for (const child of group.all) {
      const got = clausesOfNode(child, schema, text, now);
      if (got === null) return null;
      out.push(...got);
    }
    return out;
  }
  if (Array.isArray(group.any) || Array.isArray(group.none)) return null;

  const leaf = node as { field: string } & Record<string, unknown>;
  const field = leaf.field;
  const op = LEAF_OPS.find((k) => Object.hasOwn(leaf, k));
  if (op === undefined) return null;
  const v = leaf[op];
  const dated = DATED.has(typeOf(schema, field) ?? '');
  const day = (d: unknown): string => wordFor(text, String(d), now);

  switch (op) {
    case 'is':
    case 'not':
      return [dated ? { field, op: op === 'is' ? 'on' : 'not on', day: day(v) } : { field, op: op === 'is' ? 'is' : 'is not', values: [valueText(v)] }];
    case 'in':
    case 'not_in':
      return [{ field, op: op === 'in' ? 'is' : 'is not', values: (Array.isArray(v) ? (v as unknown[]) : [v]).map(valueText) }];
    case 'before':
    case 'after':
      return [{ field, op, day: day(v) }];
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (dated) return [{ field, op, day: day(v) }];
      const b = boundOf(v);
      return b === null ? null : [{ field, op, values: [boundText(b)], bounds: [b] }];
    }
    case 'between': {
      const ends = Array.isArray(v) ? (v as unknown[]).map(boundOf) : [];
      const [lo, hi] = ends;
      return lo && hi ? [{ field, op, values: [boundText(lo), boundText(hi)], bounds: [lo, hi] }] : null;
    }
    case 'contains':
      return [{ field, op, values: [String(v)] }];
    case 'empty':
    case 'present':
      return [{ field, op, values: [] }];
    case 'has':
    case 'lacks':
      return [{ field, op, values: [valueText(v)] }];
  }
}

/**
 * A sentence, read by the record's parser against this tab's declaration of the list, as the clauses it says.
 *
 * `now` IS THE CLOCK A DAY IS RESOLVED AT, which is the record's rule: `due before +30d` is a date by the time anything
 * reads it. `wordFor` keeps the words the sentence said a day in, for the address a reader of this hands on.
 *
 * A TREE IS NOT A SENTENCE, and the record's parser refuses one with its own sentence; the two callers that hand this a
 * declaration's `where` then read no clause from it, which is what they read from any predicate they cannot print.
 */
export function compile(register: string, where: string | undefined, now: number = Date.now()): Where {
  const schema = schemaOf(register);
  /* `someone else` IS THE RECORD'S TO SAY (who else is on it), so this tab reads it as nobody: a task is yours unless
     it says whose, which is how a record with one person reads it too. */
  const parsed = parseWhere(where, schema, { nowMs: now, refByTitle: (to, title) => (title.trim().toLowerCase() === 'someone else' ? ['e_nobody'] : rowNamed(to, title)) });
  const predicate = parsed.predicate;
  /* AND WHAT THE RECORD'S COMPILER REFUSES ONCE THE SENTENCE HAS PARSED, a `contains` past its ceiling or a text test
     over a series among them: the record runs both before it reads a row, so between them they are every refusal it
     gives a sentence, in its words. */
  const bad = [...parsed.bad, ...(predicate === undefined ? [] : compileTree(predicate, schema).bad)].map((b) => b.fix);
  if (bad.length || predicate === undefined) return { register, clauses: [], bad };

  /* THE CONDITIONS' OWN WORDS, one per member of the record's top group, for `wordFor`. The record cuts them with the
     same `clausesOf`, and a leading `or` is the separator's and not the condition's. */
  const texts = clausesOf(where ?? '')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => (i > 0 ? t.replace(/^or(?:\s+|$)/i, '') : t));
  const top = predicate as { all?: Predicate[]; any?: Predicate[] };
  const members = texts.length > 1 ? (top.any ?? top.all ?? [predicate]) : [predicate];
  const conditions = members.map((m, i) => clausesOfNode(m, schema, texts[i] ?? '', now));
  /* A SHAPE NO CLAUSE HOLDS IS SAID, NOT DROPPED: a predicate printed without one of its conditions opens a wider list
     than it names. */
  if (conditions.some((c) => c === null))
    return { register, clauses: [], bad: [`${(where ?? '').trim()}: BrainDog reads this filter, and this screen cannot write it as a link.`] };
  const each = conditions as Clause[][];
  if (texts.length > 1 && Array.isArray(top.any)) return { register, clauses: [], any: each, bad };
  return { register, clauses: each.flat(), bad };
}

/**
 * Every clause a predicate names, the conjunction and each member of its or-group together.
 *
 * FOR A READER ASKING WHAT THE PREDICATE MENTIONS, NOT WHAT IT ADMITS: flattened, the "or" is gone.
 */
export const everyClause = (w: Where): Clause[] => [...w.clauses, ...(w.any ?? []).flat()];

/**
 * Does a sentence join any of its conditions with `, or`, alone or beside a plain comma?
 *
 * FOR A READER THAT CUTS A SENTENCE ON ITS COMMAS BEFORE ANYTHING PARSES IT: `metrics.ts`'s `withParam` keeps the
 * clauses holding `{{it}}` as a figure's scope, which is only a scope under a conjunction. The cut is the record's own
 * `clausesOf`, and `, or` is a condition after the first that opens with the word, which is how the record's parser
 * tells the two separators apart. A sentence mixing both answers yes: the record refuses it whole.
 */
export function joinsWithOr(where: string): boolean {
  return clausesOf(where)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(1)
    .some((t) => /^or(?:\s+|$)/i.test(t));
}

/**
 * What a predicate could not understand, in the record's words.
 *
 * `10-MCP` §7's fourth rule is that the refusal is the teacher: "state has no value done" is fixed on the next call.
 */
export const explain = (w: Where): string[] => w.bad;

/**
 * One value of a clause as somebody would SAY it, from the value as the column holds it.
 *
 * A REF IS THE ONE TYPE WHERE THOSE ARE DIFFERENT STRINGS: the record's parse holds the target row's number here
 * (`rowNamed`), and a name is the more readable of the two in an address. A number whose row has no name keeps the
 * number, and so does a NAME WITH A COMMA IN IT, because a comma cannot survive the value slot of a chip: `chipsOf`
 * splits on it after the address is decoded, so the link would read as the filter it came from and open another list.
 */
const spokenValue = (register: string, field: string, held: string): string => {
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
  const to = decl !== undefined && (decl.type === 'ref' || decl.of === 'ref') ? decl.to : undefined;
  if (to === undefined) return declaredValue(register, field, held);
  const said = [...(TITLES.get(to) ?? [])].find(([seq]) => String(seq) === held)?.[1];
  return typeof said === 'string' && said && !said.includes(',') ? said : held;
};

/**
 * The register, opened at the rows this predicate admitted.
 *
 * ONE PREDICATE, TWO PRODUCTS: the rows a surface draws, and the address of the rest of them. A block headed "Money",
 * filtered to `state is open, direction is owed to me`, printed that sentence and then linked to the whole of
 * Obligations until it asked here.
 *
 * A PREDICATE THE RECORD REFUSES OPENS THE REGISTER UNFILTERED, and does not pretend otherwise: an address that filters
 * by the half it understood is a list that looks narrowed and is not. The surface that owns the predicate refuses in
 * its own words; this returns the honest wide address.
 */
/**
 * A CLAUSE THE LIST ALREADY KEEPS BY ITSELF (31 October, AG8): a list of people or organisations draws nobody folded
 * into another and stands you apart as You (`folk.ts`), so "not merged" and "not you" are its standing scope. Carried as
 * chips, Today's "All people" opened "6 of 6 match." under "Merged into is empty" and "This is you is not true" in red.
 */
function standing(register: string, c: Clause): boolean {
  const decl = REGISTERS[register];
  const meets = meetsOf(decl);
  const org = orgRoleOf(decl);
  if (c.op === 'empty' && (c.field === meets?.merged_into || c.field === org?.merged_into)) return true;
  return c.field === meets?.self && c.op === 'is not' && c.values.length === 1 && String(c.values[0]) === 'true';
}

export function registerHref(register: string, where: string | undefined): string {
  const w = compile(register, where);
  if (w.bad.length) return `/r/${register}`;
  /**
   * AN OR-GROUP IS ITS CHIPS AND THE WORD `join=any`, which the list screen reads into the question it asks
   * (`joinOf` in `api.ts`, then `whereFor`). It opened the whole list while the screen read the chips alone: a tile
   * counting "late or due this week" led to every entry the list holds, under a count that was not theirs.
   *
   * ONE CHIP TO A MEMBER, OR IT STAYS WIDE. Under the word every chip is one side of the "or", and a member the record
   * spells as two clauses (a range of days is its `gte` and its `lte`) would come back as either end alone, which is
   * every day there is.
   *
   * THE SIX COMPARE WORDS STILL OPEN IT WIDE, in a group or out of one, as `chips-compare.test.ts` pins.
   */
  if (w.any?.some((member) => member.length !== 1)) return `/r/${register}`;
  const clauses = (w.any ? w.any.flat() : w.clauses).filter((c) => w.any || !standing(register, c));
  if (clauses.some((c) => c.op === 'contains' || c.op === 'gt' || c.op === 'gte' || c.op === 'lt' || c.op === 'lte' || c.op === 'between'))
    return `/r/${register}`;
  /* AND A VALUE HOLDING A COMMA, WHICH A QUOTED SENTENCE CAN CARRY AND A CHIP CANNOT: `what is "Studio rent, June"`
     would mint two values and read back as an empty list under a tile that counted the row. */
  if (clauses.some((c) => 'values' in c && c.values.some((v) => spokenValue(register, c.field, v).includes(','))))
    return `/r/${register}`;

  /**
   * EACH CLAUSE AS A CHIP `whereOf` IN `api.ts` READS BACK AS THE SAME CLAUSE.
   *
   * A NEGATION IS `not-in` RATHER THAN THE ENUM'S COMPLEMENT, which would break the day a pack adds a value. AN ABSENCE
   * IS THE SENTENCE THAT SAYS IT, `<field>:is:empty` and `<field>:is:set`, tested by its operator before its shape
   * because it carries `values: []`. A LIST CLAUSE IS `<field>:has:<element>`, which `chipsOf` splits at its first two
   * colons, so an element holding one survives. A DAY IS THE WORD THE SENTENCE SAID IT IN, and `not on` is spelled
   * `not-on`, because a raw space in a URL is no chip anybody reads back and `whereOf` reads it as `is not`.
   */
  const chips = clauses.map((c) =>
    c.op === 'empty' || c.op === 'present'
      ? `${c.field}:is:${c.op === 'empty' ? 'empty' : 'set'}`
      : c.op === 'has' || c.op === 'lacks'
        ? `${c.field}:${c.op}:${encodeURIComponent(spokenValue(register, c.field, c.values[0]))}`
        : 'values' in c
          ? `${c.field}:${c.op === 'is not' ? 'not-in' : 'in'}:${c.values.map((v) => encodeURIComponent(spokenValue(register, c.field, v))).join(',')}`
          : `${c.field}:${c.op === 'not on' ? 'not-on' : c.op}:${encodeURIComponent(c.day)}`,
  );
  /* THE WORD GOES LAST AND ONLY WITH A GROUP, so every address written before it is spelled as it was. */
  return chips.length ? `/r/${register}?${chips.map((f) => `f=${f}`).join('&')}${w.any ? '&join=any' : ''}` : `/r/${register}`;
}
