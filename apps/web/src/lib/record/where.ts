/**
 * `where:` — the predicate a block, a view or an agent writes to narrow a register.
 *
 * IT USED TO BE FIVE `String.includes` CHECKS. `owed to me`, `owed by me`, `state is open`, `thing
 * is <name>`, `state is open or doing` — and every other predicate anybody wrote was silently
 * ignored. Not refused, not flagged: the block drew the whole register and looked exactly like a
 * block that had filtered. `state is live, cycle is monthly` returned fifteen rows and a total that
 * was about nothing.
 *
 * That is the worst failure a declarative surface can have, because the thing writing most of these
 * declarations is an agent. An agent cannot see that its filter did nothing. It writes a page, the
 * page renders, every number on it is wrong, and the only person who could notice is the one who
 * trusted the agent to get it right.
 *
 * THE GRAMMAR, and it is small on purpose:
 *
 *     state is open                     one value
 *     state is open or doing            any of several
 *     state is not done                 negated
 *     thing is Kiln                     a ref, BY NAME
 *     direction is owed to me           an enum, IN WORDS
 *     due before 2026-10-01             a day, exclusive
 *     due after today                   a day, relative
 *     state is live, cycle is monthly    clauses are ANDed
 *
 * VALUES ARE MATCHED AGAINST WHAT THE UI SHOWS, not against what the column stores. `display()`
 * turns `owed_to_me` into "owed to me" and turns a ref into the title of the row it points at, so
 * `direction is owed to me` and `thing is Kiln` both work without a special case for either. That is
 * not a convenience — it is the whole argument for having a readable predicate at all: the stored
 * form and the readable form have to be the same thing, or the declaration is a second language
 * somebody has to learn.
 *
 * An UNPARSEABLE clause matches nothing and says so through `explain`. A filter that cannot be
 * understood must not quietly pass every row: an empty block is a question, and a full one is a
 * wrong answer that looks right.
 */

import { display } from './api.ts';
import { REGISTERS } from './data.ts';
import type { Entry } from './schema.ts';

export type Clause =
  | { field: string; op: 'is' | 'is not'; values: string[] }
  | { field: string; op: 'before' | 'after'; day: string };

export type Where = { clauses: Clause[]; bad: string[] };

/** `today` and an ISO day are the only two date forms, because a block is read, not computed. */
const dayOf = (word: string, now: number): string =>
  word === 'today' ? new Date(now).toISOString().slice(0, 10) : word;

const CLAUSE =
  /^\s*([a-z][a-z0-9_]*)\s+(is not|is|before|after)\s+(.+?)\s*$/i;

/**
 * Parses a predicate into clauses, keeping whatever it could not understand.
 *
 * Splitting on the comma is safe because no value in this grammar contains one: values are enum
 * words, a row's title, or a date. A title with a comma in it would need quoting, and the day the
 * grammar needs quoting is the day it has outgrown being readable.
 */
export function parseWhere(where: string | undefined): Where {
  const clauses: Clause[] = [];
  const bad: string[] = [];
  for (const raw of (where ?? '').split(',')) {
    const text = raw.trim();
    if (!text) continue;
    const m = CLAUSE.exec(text);
    if (!m) {
      bad.push(text);
      continue;
    }
    const [, field, op, rest] = m as unknown as [string, string, string, string];
    if (op === 'before' || op === 'after') {
      clauses.push({ field, op, day: rest.trim() });
    } else {
      clauses.push({
        field,
        op: op === 'is not' ? 'is not' : 'is',
        /* ` or ` and not `|`, because the person reading this is reading a sentence. */
        values: rest.split(/\s+or\s+/i).map((v) => v.trim()).filter(Boolean),
      });
    }
  }
  return { clauses, bad };
}

/**
 * The declared field a clause names, matched without regard to case, or `null`.
 *
 * AN UNKNOWN FIELD MATCHES NOTHING, whatever the operator. That is not pedantry: `state is not live`
 * on a register with no `state` found no value, concluded the row was therefore not live, and
 * returned TRUE for every row — a negation over a typo passing the whole register through a filter
 * that looked like it worked. The same class of silent pass the whole file exists to prevent.
 */
const fieldOf = (register: string, name: string): string | null => {
  const want = name.toLowerCase();
  return REGISTERS[register]?.fields.find((f) => f.id.toLowerCase() === want)?.id ?? null;
};

/** Both spellings of a value: what the column stores, and what a reader sees. */
const formsOf = (register: string, field: string, value: unknown): string[] => {
  const shown = display(register, field, value);
  return [String(value ?? ''), shown ?? ''].map((v) => v.toLowerCase().replace(/_/g, ' ')).filter(Boolean);
};

/** Does one row satisfy every clause? */
export function matches(register: string, entry: Entry, w: Where, now: number): boolean {
  // An unparseable clause matches nothing, rather than passing every row and looking like a filter.
  if (w.bad.length) return false;

  return w.clauses.every((c) => {
    const field = fieldOf(register, c.field);
    if (!field) return false;
    const raw = entry.fields[field];

    /* `'values' in c` rather than a check on `op`: the discriminant is spread across two literals
       per member, and the `in` operator narrows a union on the property that actually differs. */
    if ('values' in c) {
      const forms = formsOf(register, field, raw);
      const wanted = c.values.map((v) => v.toLowerCase().replace(/_/g, ' '));
      const hit = wanted.some((v) => forms.includes(v));
      return c.op === 'is' ? hit : !hit;
    }

    // A missing date is not "before" anything. Counting it would put rows with no due date into an
    // overdue list, which is a list somebody acts on.
    if (typeof raw !== 'string' || !raw) return false;
    const own = raw.slice(0, 10);
    const day = dayOf(c.day, now);
    return c.op === 'before' ? own < day : own > day;
  });
}

/**
 * What a predicate could not understand, for a surface that wants to say so.
 *
 * Nothing shows this yet, and it exists so that the day a declaration is written by hand or by an
 * agent there is something to show them other than an empty block.
 */
export const explain = (w: Where): string[] => w.bad;
