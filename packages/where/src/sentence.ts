/**
 * `where:` as a sentence — the form a person and an agent actually write.
 *
 *     state is open
 *     state is open or doing
 *     state is not done
 *     thing is Kiln                     a ref, BY NAME
 *     direction is owed to me           an enum, IN WORDS
 *     due before 2026-10-01
 *     due after today
 *     due before +30d                   ± a number, then d, w or m
 *     renews before eom                 also bom, boy, eoy, tomorrow, yesterday
 *     state is live, cycle is monthly   clauses are ANDed on the comma
 *
 * IT COMPILES TO THE SAME PREDICATE THE STRUCTURED FORM PRODUCES, and that is the whole reason it
 * is here rather than in whatever renders a page. A declaration is written once and read by the
 * record, by the interface and by an agent; a sentence one of them can parse and another cannot is
 * two languages, and the one that drifts is the one nobody is testing.
 *
 * PARSING IS NOT ENOUGH. A grammar check tells you a sentence is a sentence; it does not tell you
 * the sentence is about anything. Four clauses that parse cleanly and are all wrong:
 *
 *     due after -7d        the operand compared as a string, and '2' > '-'
 *     due before eom       same
 *     due before +30d      same, in the other direction
 *     state is not done    `done` is a TASK state; an obligation has none, so this was true of
 *                          every single row
 *
 * So every value is RESOLVED against the register it will run on — a day recognised and turned into
 * an absolute one, an enum value checked against the declared set, a ref turned into the id of the
 * row that bears the name — and anything that cannot be resolved is a refusal rather than a clause
 * that quietly matches everything.
 *
 * VALUES ARE MATCHED IN THE WORDS A SCREEN SHOWS. `owed to me` is what a person reads and
 * `owed_to_me` is what the column holds, and the predicate takes the first. A stored form that is
 * not also the readable form makes `where:` a second language somebody has to learn.
 */

import type { Refusal } from '@braindog/ports';

import type { Predicate, Schema } from './index.ts';

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE = /^([+-])(\d{1,4})([dwmy])$/;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The temporal literals `02-DATA-MODEL` §6 settled on. Not a set invented here. */
const WORDS = ['today', 'tomorrow', 'yesterday', 'bom', 'eom', 'boy', 'eoy'] as const;

/**
 * A temporal literal against the record's clock, or `null` when it is not one.
 *
 * MEASURED AT NOON, so a timezone cannot move a date by one — the same rule the whole record keeps.
 * A month is calendar arithmetic and is CLAMPED: `+1m` from 31 January is 28 February, because
 * adding to the month number rolls it into 3 March and nobody means that by "a month".
 */
export function resolveDay(word: string, nowMs: number): string | null {
  /* THE SHAPE IS NOT THE CHECK. `2026-13-45` matched the pattern and was then compared as a string,
     so `due before 2026-13-45` was true of every row — the "clause that quietly matches everything"
     this module exists to prevent, reached through its own date test. `Date.UTC` normalises rather
     than refusing, so the round trip is what says the day is real. */
  if (ISO.test(word)) {
    /* `Date.parse` of an impossible day is `NaN`, and `.toISOString()` on that THROWS — so the
       finiteness check comes first. A round trip is what distinguishes a day that exists from one
       the pattern merely admits: `2026-02-30` parses to 2 March in the lenient forms and to nothing
       in the strict one, and neither answer is the day somebody wrote. */
    const ms = Date.parse(`${word}T12:00:00Z`);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10) === word ? word : null;
  }

  const d = new Date(nowMs);
  switch (word) {
    case 'today':
      return iso(nowMs);
    case 'tomorrow':
      return iso(nowMs + DAY_MS);
    case 'yesterday':
      return iso(nowMs - DAY_MS);
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
  if (m[3] === 'd') return iso(nowMs + n * DAY_MS);
  if (m[3] === 'w') return iso(nowMs + n * 7 * DAY_MS);

  const months = m[3] === 'm' ? n : n * 12;
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), last), 12));
}

export type SentenceDeps = {
  nowMs: number;
  /**
   * The id of the row in `register` whose title is `title`, or `null`.
   *
   * A REF IS WRITTEN BY NAME because that is what a person says: "thing is Kiln", never
   * "thing is things#1". The lookup is a callback rather than a table here so this package stays
   * free of the kernel.
   */
  refByTitle?: (register: string, title: string) => string | null;
};

export type Parsed = { predicate: Predicate | undefined; bad: Refusal[] };

/** Ordered comparisons, in the words the grammar uses. */
const ORDERED: Record<string, string> = { before: 'before', after: 'after', on: 'is' };

/**
 * One sentence into one predicate.
 *
 * An empty sentence is `undefined` — every row — rather than an empty `all`, because the caller
 * distinguishes "no filter" from "a filter that failed to parse" and both would otherwise be `{}`.
 */
export function parseWhere(text: string | undefined, schema: Schema, deps: SentenceDeps): Parsed {
  const bad: Refusal[] = [];
  const clauses: Predicate[] = [];
  if (!text?.trim()) return { predicate: undefined, bad };

  for (const raw of text.split(',')) {
    const sentence = raw.trim();
    if (!sentence) continue;

    const words = sentence.split(/\s+/);
    const field = words[0] ?? '';
    const decl = Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
    if (!decl) {
      bad.push({
        code: 'FIELD_UNKNOWN',
        fix: `${sentence} — ${schema.register} has no field called ${field || '(nothing)'}.`,
        at: field,
        allowed: Object.keys(schema.fields),
      });
      continue;
    }

    const verb = words[1] ?? '';
    const rest = words.slice(2).join(' ');

    /* ── before · after · on ─────────────────────────────────────────────── */
    if (verb in ORDERED) {
      if (decl.type !== 'day' && decl.type !== 'instant') {
        bad.push({
          code: 'OPERATOR_UNSUPPORTED',
          fix: `${sentence} — ${field} is a ${decl.type}, and ${verb} is about dates.`,
          at: field,
        });
        continue;
      }
      const day = resolveDay(rest, deps.nowMs);
      if (day === null) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence} — ${rest || '(nothing)'} is not a date. Write 2026-10-01, +30d, or one of ${WORDS.join(', ')}.`,
          at: field,
          allowed: WORDS,
        });
        continue;
      }
      clauses.push({ field, [verb === 'on' ? 'is' : verb]: day } as Predicate);
      continue;
    }

    /* ── is · is not ─────────────────────────────────────────────────────── */
    if (verb !== 'is') {
      bad.push({
        code: 'OPERATOR_UNSUPPORTED',
        /* `predicate` IS THE SCHEMA'S WORD FOR THIS AND NOBODY ELSE'S. It reached three screens,
           every one of them inside error copy, where the reader is already stuck — and the control
           that produced the thing is labelled *Filter*. The word for what a person wrote is the word
           on the button they pressed. */
        fix: `${sentence} — ${verb || '(nothing)'} is not something a filter can say. Write is, is not, before or after.`,
        at: field,
        allowed: ['is', 'is not', 'before', 'after', 'on'],
      });
      continue;
    }

    /* `is not` WITH NOTHING AFTER IT IS NOT A SEARCH FOR THE WORD `not`. `startsWith('not ')` needs
       the space, so a bare trailing `not` fell through and became `note is 'not'` — a clause that
       parses, runs, and quietly means something nobody wrote. */
    const negated = rest === 'not' || rest.startsWith('not ');
    const said = (negated ? rest.slice(3) : rest).trim();
    if (!said) {
      bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence} — is${negated ? ' not' : ''} what?`, at: field });
      continue;
    }

    /* `or` SEPARATES ALTERNATIVES, and an enum value may contain the word: `owed to me or paid` has
       to split on the separator rather than on every occurrence. Splitting on ` or ` does that,
       because a value is written in the words a screen shows and those are single-spaced. */
    const said_values = said.split(' or ').map((v) => v.trim()).filter(Boolean);
    const values: string[] = [];
    let failed = false;

    for (const one of said_values) {
      const resolved = resolve(schema, field, decl, one, deps);
      if (resolved === null) {
        bad.push(refuseValue(sentence, schema, field, decl, one));
        failed = true;
        break;
      }
      values.push(resolved);
    }
    if (failed) continue;

    clauses.push(
      values.length === 1
        ? ({ field, [negated ? 'not' : 'is']: values[0] } as Predicate)
        : ({ field, [negated ? 'not_in' : 'in']: values } as Predicate),
    );
  }

  if (bad.length) return { predicate: undefined, bad };
  /* A SENTENCE MADE ONLY OF SEPARATORS IS NOT "EVERYTHING". `,,,` produced `{all: []}`, which the
     compiler renders as `1 = 1` — somebody wrote a filter and got the whole register. An empty
     STRING means no filter and is handled at the top; this is a filter that failed to say anything. */
  if (clauses.length === 0)
    return {
      predicate: undefined,
      bad: [{ code: 'WHERE_MALFORMED', fix: `${text} says nothing a register can answer.`, at: 'where' }],
    };
  return { predicate: clauses.length === 1 ? clauses[0] : { all: clauses }, bad };
}

/** One written value as the record stores it, or `null` when the register cannot mean it. */
function resolve(
  schema: Schema,
  field: string,
  decl: { type: string; values?: readonly string[]; to?: string },
  said: string,
  deps: SentenceDeps,
): string | null {
  if (decl.type === 'enum') {
    /* IN THE WORDS A SCREEN SHOWS. `owed to me` is what a person reads and `owed_to_me` is what the
       column holds; both are accepted, and a word the enum does not declare is refused — which is
       the clause that used to be true of every row in the register. */
    const wanted = said.replace(/\s+/g, '_').toLowerCase();
    return (decl.values ?? []).find((v) => v.toLowerCase() === wanted || v.replace(/_/g, ' ').toLowerCase() === said.toLowerCase()) ?? null;
  }

  if (decl.type === 'ref') {
    if (!decl.to || !deps.refByTitle) return null;
    return deps.refByTitle(decl.to, said);
  }

  if (decl.type === 'bool') return said === 'true' || said === 'yes' ? 'true' : said === 'false' || said === 'no' ? 'false' : null;

  void schema;
  void field;
  return said;
}

function refuseValue(
  sentence: string,
  schema: Schema,
  field: string,
  decl: { type: string; values?: readonly string[]; to?: string },
  said: string,
): Refusal {
  if (decl.type === 'enum')
    return {
      code: 'ENUM_VALUE_UNKNOWN',
      fix: `${sentence} — ${schema.register}.${field} has no value ${said}.`,
      at: field,
      allowed: (decl.values ?? []).map((v) => v.replace(/_/g, ' ')),
    };
  if (decl.type === 'ref')
    return {
      code: 'REF_UNKNOWN',
      fix: `${sentence} — there is no ${decl.to ?? 'row'} called ${said}.`,
      at: field,
    };
  return { code: 'VALUE_MALFORMED', fix: `${sentence} — ${said} is not a value ${field} can hold.`, at: field };
}
