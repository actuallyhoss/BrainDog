/**
 * `where:` — the predicate a block, a view or an agent writes to narrow a register.
 *
 * IT USED TO BE FIVE `String.includes` CHECKS, and every predicate outside them was silently
 * ignored: the block drew the whole register and looked exactly like a block that had filtered.
 * That is the worst failure a declarative surface can have, and worst here, because the thing
 * writing most of these declarations is an agent and an agent cannot see it.
 *
 * PARSING IS NOT ENOUGH, WHICH IS THE SECOND LESSON. The first version of this file parsed the
 * grammar and stopped, so a clause that was well-formed and meaningless passed straight through.
 * Measured against the real record, all four of these parse cleanly and all four are wrong:
 *
 *     due after -7d        →  38 of 38     the operand was compared as a string, and '2' > '-'
 *     due before eom       →  38 of 38     same
 *     due before +30d      →   0 of 38     same, in the other direction
 *     state is not done    →  38 of 38     `done` is a TASK state; obligations have none, so
 *                                          "is not done" was true of every one of them
 *
 * A grammar check tells you a sentence is a sentence. It does not tell you the sentence is about
 * anything. So a predicate is COMPILED against the register it will run on — fields resolved, dates
 * recognised, enum values and ref titles checked — and anything that cannot be resolved goes in
 * `bad` and matches nothing.
 *
 * THE GRAMMAR, small on purpose:
 *
 *     state is open                     one value
 *     state is open or doing            any of several
 *     state is not done                 negated
 *     thing is Kiln                     a ref, BY NAME
 *     direction is owed to me           an enum, IN WORDS
 *     due before 2026-10-01             a day
 *     due after today                   a temporal literal
 *     due before +30d                   a relative day: ± a number, then d, w or m
 *     renews before eom                 end of month. Also bom, boy, eoy, tomorrow, yesterday
 *     state is live, cycle is monthly   clauses are ANDed on the comma
 *
 * VALUES ARE MATCHED AGAINST WHAT THE UI SHOWS, not against what the column stores. `display()`
 * turns `owed_to_me` into "owed to me" and a ref into the title of the row it points at, so
 * `direction is owed to me` and `thing is Kiln` both work with no special case for either. The
 * stored form and the readable form have to be the same thing, or the predicate is a second
 * language somebody has to learn.
 *
 * The temporal literals are the set `02-DATA-MODEL` §6 already settled on, not a set invented here.
 */

import { display } from './api.ts';
import { REGISTERS, ROWS } from './data.ts';
import type { Entry } from './schema.ts';

export type Clause =
  | { field: string; op: 'is' | 'is not'; values: string[] }
  | { field: string; op: 'before' | 'after'; day: string };

export type Where = {
  /** The register it was compiled against. A value means nothing without one. */
  register: string;
  clauses: Clause[];
  /** Everything that could not be resolved, in words somebody can act on. */
  bad: string[];
};

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE = /^([+-])(\d{1,4})([dwm])$/;

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * A temporal literal resolved against the record's clock, or `null` if it is not one.
 *
 * `null` IS THE WHOLE POINT. The previous version returned any unrecognised word verbatim and then
 * string-compared it, so `due after -7d` asked whether `'2026-08-01' > '-7d'` — true, because `'2'`
 * sorts after `'-'` — and a "this week" block drew the entire register. Failing to recognise an
 * operand has to be a refusal, not a comparison against a word.
 *
 * Months clamp rather than overflow: one month after 31 January is the last day of February, not
 * the third of March, because the second is not what anybody means.
 */
export function resolveDay(word: string, now: number): string | null {
  if (ISO.test(word)) return word;

  const d = new Date(now);
  switch (word) {
    case 'today':
      return iso(now);
    case 'tomorrow':
      return iso(now + DAY_MS);
    case 'yesterday':
      return iso(now - DAY_MS);
    case 'bom':
      return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
    case 'eom':
      return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    case 'boy':
      return iso(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
    case 'eoy':
      return iso(Date.UTC(d.getUTCFullYear(), 11, 31, 12));
    default:
      break;
  }

  const m = RELATIVE.exec(word);
  if (!m) return null;
  const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  if (m[3] === 'd') return iso(now + n * DAY_MS);
  if (m[3] === 'w') return iso(now + n * 7 * DAY_MS);

  /* Months by calendar, and CLAMPED. Adding to `getUTCMonth` on the 31st rolls into the month after
     the one intended, so day 0 of the following month is taken instead: the last day of the month a
     person actually named. */
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), last), 12));
}

const CLAUSE = /^\s*([a-z][a-z0-9_]*)\s+(is not|is|before|after)\s+(.+?)\s*$/i;

/**
 * The operators `21-AUTHORING` §4.2 publishes and this build does not read.
 *
 * They matter because they PARSE. `amount is at least 10000` is a well-formed clause whose value is
 * the string "at least 10000", so it compiled, matched nothing, and drew the author's own "nothing
 * matched" sentence — the state `blocks.ts` exists to keep separate from a filter that was not
 * understood.
 */
const UNIMPLEMENTED = ['at least', 'at most', 'more than', 'less than', 'contains', 'starts', 'starts with', 'ends', 'ends with', 'empty', 'present', 'between', 'in', 'not in'];

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/**
 * A value as the field DECLARES it, from a value as somebody said it.
 *
 * THE RECORD HOLDS `owed_to_me` AND THE DIALECT SAYS `owed to me`, and both are right: an underscore
 * is not a word and a predicate is a sentence. `norm` is what makes them match, and matching was all
 * anything did — so two writers of the same URL disagreed. A metric's `where` produced
 * `?f=direction:in:owed%20to%20me` and a segment produced `?f=direction:in:owed_to_me`; both
 * filtered correctly, and arriving from the first the segment did not light, because the control's
 * own test is an equality. Pressing it then APPENDED the second spelling to the first.
 *
 * A URL IS MACHINE-FACING, so it carries the declared value. The dialect keeps its sentence, `display`
 * keeps the spaces on screen, and there is one string in between.
 */
export const declaredValue = (register: string, field: string, value: string): string => {
  const want = norm(value);
  const values = REGISTERS[register]?.fields.find((f) => f.id === field)?.values;
  return values?.find((v) => norm(v) === want) ?? value;
};

/**
 * The declared field a clause names, matched without regard to case, or `null`.
 *
 * AN UNKNOWN FIELD RESOLVES TO NOTHING, whatever the operator. `state is not live` on a register
 * with no `state` found no value, concluded the row was therefore not live, and returned true for
 * every row — a negation over a typo passing the whole register through a filter that looked like
 * it had worked.
 */
const fieldOf = (register: string, name: string): string | null => {
  const want = name.toLowerCase();
  return REGISTERS[register]?.fields.find((f) => f.id.toLowerCase() === want)?.id ?? null;
};

/** Both spellings of a value: what the column stores, and what a reader sees. */
const formsOf = (register: string, field: string, value: unknown): string[] =>
  [String(value ?? ''), display(register, field, value) ?? ''].map(norm).filter(Boolean);

/**
 * Every value a field can actually hold, or `null` when the set is open.
 *
 * An enum declares its values, so `state is not done` on a register whose states are open, part,
 * paid and written off is a typo — and it was returning every row, because nothing held `done` so
 * nothing was excluded. A `ref` is closed too, by the titles in the register it points at. Text,
 * money and dates are open, and are not checked.
 */
function allowed(register: string, field: string): string[] | null {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  if (!f) return null;
  if (f.type === 'enum') return (f.values ?? []).map(norm);
  if (f.type === 'ref' && f.to) {
    const title = REGISTERS[f.to]?.title;
    if (!title) return null;
    /* Titles AND sequence numbers. A declaration says `thing is Kiln` because that is what a person
       reads, but a URL says `thing:is:1` because a link should not break when a row is renamed —
       and `matches` already accepts either spelling. Allowing only one of them here refused the
       other at compile time, which turned every Kiln metric's link into an empty grid. */
    return (ROWS[f.to] ?? []).flatMap((e) => [norm(String(e.fields[title] ?? '')), String(e.seq)]).filter(Boolean);
  }
  return null;
}

/**
 * Parse a predicate AND check it against the register it will run on.
 *
 * Splitting on the comma is safe for the values this grammar holds — enum words, a row's title, a
 * date. A title containing a comma is a known limitation rather than a silent one: the halves fail
 * to resolve and land in `bad`, so the block empties and says why rather than quietly filtering on
 * half a name.
 */
/**
 * THE SENTENCES ARE THE KERNEL'S, WORD FOR WORD.
 *
 * `13 §6`: every refusal the app shows is the server's `fix`, verbatim — never rewritten
 * client-side. This file had its own wording for both, and both were worse: "not a predicate" is a
 * verdict with no instruction, and "This build reads:" is the software describing itself. They are
 * COPIED rather than imported because this module is the mock of the record and must answer with no
 * server at all — copied byte for byte, so the day it is wired the sentence does not change.
 */
const WRONG_SHAPE = 'where: takes a sentence — `state is open, due before +30d` — and not a tree of objects.';

const cannotSay = (text: string): string =>
  `${text} — that is not something a filter can say. Write is, is not, before or after.`;

export function compile(register: string, where: string | undefined): Where {
  const clauses: Clause[] = [];
  const bad: string[] = [];

  /* A SENTENCE, AND `docs/06-PAGES` §1.1 SHOWS A TREE. Both spellings are in the docs — §1's worked
     example writes `where: { all: [{ field: 'state', in: [...] }] }`, and `21-AUTHORING` §4.5 says
     the sentence is "read-only, never parsed" — so an agent following either one is following the
     documentation. The tree arrived here as an object, `.split` threw, and the throw took the whole
     page. It is a refusal now, and it says which spelling this build reads. */
  if (where !== undefined && typeof where !== 'string')
    return { register, clauses, bad: [WRONG_SHAPE] };

  for (const raw of (where ?? '').split(',')) {
    const text = raw.trim();
    if (!text) continue;

    const m = CLAUSE.exec(text);
    if (!m) {
      /* THE REFUSAL NAMES THE FOUR THAT WORK. `21-AUTHORING` §4.2 publishes eleven operators and
         four are implemented, so "not a predicate" told an agent it was wrong and nothing about
         what to write — which is the one thing 10 §7's fourth rule asks a refusal to do. */
      bad.push(cannotSay(text));
      continue;
    }
    const [, name, op, rest] = m as unknown as [string, string, string, string];

    const field = fieldOf(register, name);
    if (!field) {
      bad.push(`${text} — there is no field called ${name}`);
      continue;
    }

    if (op === 'before' || op === 'after') {
      const word = rest.trim();
      if (resolveDay(word, Date.now()) === null) {
        bad.push(`${text} — ${word} is not a date`);
        continue;
      }
      clauses.push({ field, op, day: word });
      continue;
    }

    /* ` or ` and not `|`, because the person reading this is reading a sentence. */
    const values = rest.split(/\s+or\s+/i).map((v) => v.trim()).filter(Boolean);

    const set = allowed(register, field);
    const unknown = set ? values.filter((v) => !set.includes(norm(v))) : [];

    /* AN OPERATOR IN THE VALUE SLOT IS AN OPERATOR, NOT A VALUE, and it is checked only AFTER the
       declared values, so an enum that really holds the word `present` still resolves.

       `amount is at least 10000` parsed as `is` against the literal string "at least 10000", found
       no field holding those words, matched nothing, and drew the author's own "nothing matched"
       sentence — which is the one state `blocks.ts` exists to keep separate from a filter that was
       not understood. These are the operators `21-AUTHORING` §4.2 publishes and this build does not
       read, so an agent writing from the docs is told so instead of being handed an empty block. */
    const reach = (set ? unknown : values).find((v) =>
      UNIMPLEMENTED.some((w) => v.toLowerCase().startsWith(`${w} `) || v.toLowerCase() === w),
    );
    if (reach) {
      bad.push(
        `${text} — "${UNIMPLEMENTED.filter((w) => reach.toLowerCase().startsWith(w)).sort((a, b) => b.length - a.length)[0]}" is not an operator this build reads. It reads: is · is not · before · after`,
      );
      continue;
    }

    if (unknown.length) {
      bad.push(`${text} — ${field} has no value ${unknown.join(' or ')}`);
      continue;
    }
    clauses.push({ field, op: op === 'is not' ? 'is not' : 'is', values });
  }

  return { register, clauses, bad };
}

/** Does one row satisfy every clause? */
export function matches(entry: Entry, w: Where, now: number): boolean {
  // Anything unresolved matches NOTHING. An empty block is a question; a full one is a wrong answer
  // that looks right.
  if (w.bad.length) return false;

  return w.clauses.every((c) => {
    const raw = entry.fields[c.field];

    /* `'values' in c` rather than a check on `op`: the discriminant is spread across two literals
       per member, and the `in` operator narrows a union on the property that actually differs. */
    if ('values' in c) {
      const forms = formsOf(w.register, c.field, raw);
      const hit = c.values.map(norm).some((v) => forms.includes(v));
      return c.op === 'is' ? hit : !hit;
    }

    // A missing date is not "before" anything. Counting it would put rows with no due date into an
    // overdue list, which is a list somebody acts on.
    if (typeof raw !== 'string' || !raw) return false;
    const day = resolveDay(c.day, now);
    if (day === null) return false;
    return c.op === 'before' ? raw.slice(0, 10) < day : raw.slice(0, 10) > day;
  });
}

/**
 * What a predicate could not understand, in words a person or an agent can act on.
 *
 * This is the half that makes a refusal useful rather than merely safe. `10-MCP` §7's fourth rule is
 * that the refusal is the teacher: an agent handed an empty block learns nothing, and an agent told
 * "state has no value done" fixes it on the next call.
 */
export const explain = (w: Where): string[] => w.bad;

/**
 * The register, opened at the rows this predicate admitted.
 *
 * ONE PREDICATE, TWO PRODUCTS: the rows a surface draws, and the address of the rest of them. A
 * metric tile has derived its link this way since the day a tile counting five states was found
 * linking to a list of three — but a PAGE BLOCK did not, so a block headed "Money", filtered to
 * `state is open, direction is owed to me`, printed that sentence and then linked to the whole of
 * Obligations. The reader is told the list is a slice and handed a door to somewhere else.
 *
 * A PREDICATE IT COULD NOT READ OPENS THE REGISTER UNFILTERED, and does not pretend otherwise.
 * Dropping the clause it failed on would produce a URL that filters by the half it understood —
 * a list that looks narrowed and is not, which is the failure `compile` exists to prevent. The
 * surface that owns the predicate refuses in its own words; this returns the honest wide address.
 */
export function registerHref(register: string, where: string | undefined): string {
  const w = compile(register, where);
  if (w.bad.length) return `/r/${register}`;

  /* A NEGATION BECOMES `not-in` RATHER THAN THE ENUM'S COMPLEMENT: the complement is only writable
     when the field declares its values, and a URL that silently lists them is a URL that breaks the
     day a pack adds one. */
  const chips = w.clauses.map((c) =>
    'values' in c
      ? `${c.field}:${c.op === 'is not' ? 'not-in' : 'in'}:${c.values
          .map((v) => encodeURIComponent(declaredValue(register, c.field, v)))
          .join(',')}`
      : `${c.field}:${c.op}:${encodeURIComponent(c.day)}`,
  );
  return chips.length ? `/r/${register}?${chips.map((f) => `f=${f}`).join('&')}` : `/r/${register}`;
}
