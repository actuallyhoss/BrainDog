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
/* THREE UNITS, WHICH IS WHAT `34 §1.1`'s EBNF HAS: `unit = "d" | "w" | "m"`. This read `y` and the
   browser's compiler read three, so `renews before +2y` was refused on screen and resolved to a real
   date two years out by the parser the MCP surface and every agent talk to — a fourth spelling in
   the grammar of one of the two implementations, in neither document. */
const RELATIVE = /^([+-])(\d{1,4})([dwm])$/;
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

  /**
   * AND THE SAME DAY WRITTEN THE WAY A SCREEN WRITES IT.
   *
   * Every declared page prints its filter as a sentence, and `+90d` is a machine duration nobody
   * types or says, so the printer turns it into "90 days from now". That sentence is the record's
   * own restatement of the declaration — what somebody reads when they ask what a page filters on,
   * and what an agent copies when it asks the same question.
   *
   * IT WAS TAUGHT TO ONE OF THE TWO PARSERS. The browser's compiler learned it and this one, which
   * is what the MCP surface and every agent actually talk to, went on answering `null` — so the two
   * `where` implementations disagreed in a NEW direction one commit after an audit filed them for
   * disagreeing in the old one. `50 §1` says there should not be two; while there are, a fix that
   * lands on one of them is half a fix.
   *
   * The set is closed and is exactly what the printer emits. It stays a compiler, not a parser of
   * English.
   */
  const prose = /^(\d{1,4})\s+(day|days|week|weeks|month|months)\s+(from now|ago)$/.exec(word);
  if (prose) {
    const [, n, noun, way] = prose as unknown as [string, string, string, string];
    const unit = noun.startsWith('day') ? 'd' : noun.startsWith('week') ? 'w' : 'm';
    return resolveDay(`${way === 'ago' ? '-' : '+'}${n}${unit}`, nowMs);
  }

  const m = RELATIVE.exec(word);
  if (!m) return null;
  const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  if (m[3] === 'd') return iso(nowMs + n * DAY_MS);
  if (m[3] === 'w') return iso(nowMs + n * 7 * DAY_MS);

  const months = n;
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

  /**
   * A `where` THAT IS NOT A SENTENCE IS A REFUSAL, and it used to be a throw.
   *
   * `if (!text?.trim())` guards `null` and `undefined` and nothing else, and `packages/host`
   * JSON-decodes every query value, so `?where={"length":1}` reached `.trim` and came back out of
   * `k.list` as `TypeError: text?.trim is not a function`. A 500 for a read a stranger can send,
   * where the kernel coerces `limit`, `cursor` and `order` at the edge for exactly this reason.
   *
   * `VALUE_MALFORMED`, WHICH IS THE CODE TWENTY LINES DOWN FOR THE NEIGHBOURING FACT: a `where:`
   * written as a sentence IS a value, and `30 §6` reads the code as *"a value outside its type's
   * shape that cannot be coerced"*. A filter that is not a string is one.
   */
  const filter = text as unknown;
  if (filter === undefined || filter === null) return { predicate: undefined, bad };
  if (typeof filter !== 'string')
    return {
      predicate: undefined,
      bad: [{ code: 'VALUE_MALFORMED', fix: `A filter is written as a sentence, and ${JSON.stringify(filter)} is not one.`, at: 'where' }],
    };
  if (!filter.trim()) return { predicate: undefined, bad };

  for (const raw of filter.split(',')) {
    const sentence = raw.trim();
    if (!sentence) continue;

    const words = sentence.split(/\s+/);
    /**
     * THE FIELD IS FOUND BY ITS ID, ITS ID IN ANY CASE, OR ITS LABEL.
     *
     * A page prints its own `where:` back using each field's LABEL, so `direction is owed_to_me`
     * appears on screen as `which way is owed to me`. Typed back, or pasted back, that was
     * `FIELD_UNKNOWN: obligations has no field called which` - and a label is more than one word,
     * so the parser had also taken the wrong number of words for the field. Seven of the eleven
     * filters the shipped pages print could not be read by the record that printed them.
     *
     * THE ID IS TRIED FIRST AND EXACTLY, so nothing that works today can be shadowed by a label
     * somebody chooses tomorrow. A label is matched with its spaces and its case folded, because
     * `Which way` and `which way` are the same words on a screen.
     */
    const fold = (t: string) => t.replace(/[\s_]+/g, ' ').trim().toLowerCase();
    let field = words[0] ?? '';
    let decl = Object.hasOwn(schema.fields, field) ? schema.fields[field] : undefined;
    let after = 1;
    if (!decl) {
      const said = fold(sentence);
      /* THE LONGEST NAME THE SENTENCE STARTS WITH, because one label may be a prefix of another and
         the shorter one would take the words the longer one needs. */
      let best = '';
      let bestId = '';
      for (const [id, f] of Object.entries(schema.fields))
        for (const name of [f.label ?? '', id]) {
          const key = fold(name);
          if (!key || key.length <= best.length) continue;
          if (said === key || said.startsWith(`${key} `)) {
            best = key;
            bestId = id;
          }
        }
      if (bestId) {
        field = bestId;
        decl = schema.fields[bestId];
        after = best.split(' ').length;
      }
    }
    if (!decl) {
      bad.push({
        code: 'FIELD_UNKNOWN',
        fix: `${sentence} — ${schema.register} has no field called ${field || '(nothing)'}.`,
        at: field,
        allowed: Object.keys(schema.fields),
      });
      continue;
    }

    const verb = words[after] ?? '';
    const rest = words.slice(after + 1).join(' ');

    /* ── before · after · on ─────────────────────────────────────────────── */
    /* `Object.hasOwn`, NOT `in`, AND FOR THE REASON THE FIELD LOOKUP ABOVE USES IT. `ORDERED` is
       an object literal, so `'constructor' in ORDERED` is true, and `'toString'` and `'valueOf'`
       are true as well, which meant `due constructor 2026-10-01` parsed clean with an empty `bad`
       list and became `{field: 'due', constructor: '2026-10-01'}`. `compile` refuses it later,
       but `evaluate` simply answers false and the kernel's rule lint reads only `bad`, so a rule
       carrying that `when:` installed clean and then fired on nothing, for ever, with nothing
       anywhere saying so. The refusal it should have had is the one below on a verb that is not
       `is`, and it now gets it. */
    if (Object.hasOwn(ORDERED, verb)) {
      if (decl.type !== 'day' && decl.type !== 'instant') {
        /* `MATCH_OP_UNSUPPORTED` IS THE STRUCTURED COMPILER'S CODE FOR THIS EXACT LEAF, and the two
           renderings of one grammar have to answer with one code or the sentence form is a second
           language after all — which is the failure this file's own header is about. `30 §6` writes
           the code as *"an operator outside its type's set"*, which is `before` on a `text`. */
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
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
        code: 'MATCH_OP_UNSUPPORTED',
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
    /* CASE-INSENSITIVELY, because a page prints `state is open or part` and a person types
       `state is open OR part`. `Or` is not a value any register declares, and reading it as one
       gave `ENUM_VALUE_UNKNOWN` over a sentence that is ordinary English. */
    const said_values = said.split(/ or /i).map((v) => v.trim()).filter(Boolean);
    const values: (string | number)[] = [];
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
      /* `VALUE_MALFORMED`: a `where:` written as a sentence IS a value, and `,,,` is one outside the
         shape a filter takes. `30 §6` reads the code as *"a value outside its type's shape that
         cannot be coerced, an unresolvable id or spoken reference"* — a spoken filter that resolves
         to no clause is the second half of that sentence as much as the first. */
      bad: [{ code: 'VALUE_MALFORMED', fix: `${filter} says nothing a register can answer.`, at: 'where' }],
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
): string | number | null {
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

  /**
   * A DAY, AND A NUMBER, RESOLVED HERE TOO, WHICH IS WHERE `is` AND `is not` NEVER GOT TO.
   *
   * This handled `enum`, `ref` and `bool` and handed back the raw word for everything else, and only
   * the `before` / `after` / `on` branch called `resolveDay`. So `due is not today` compiled to
   * `(due IS NULL OR NOT (due = 'today'))`, and `'2026-09-05' = 'today'` is false of every row, so the
   * negation was true of every row, and the register came back whole from a filter that looked like
   * it had worked. `due is today` was its mirror and matched nothing. The `n is 3` half is the same
   * line stringing a number: SQLite compares `3 = '3'` across storage classes and answers false, so
   * the row holding three was the one row the filter could not find.
   *
   * THE STRUCTURED FORM WAS ALREADY RESOLVED, and that is what makes this a disagreement rather than
   * a gap. `resolveRelative` in the kernel's `metrics.ts` has `is` and `not` in its `DATED` list and
   * refuses `RELATIVE_LITERAL_UNKNOWN` for a word it cannot read, so `{due, not: 'today'}` and
   * `due is not today` gave different answers over the same rows: two renderings of one grammar,
   * which is the failure this file's own header is written against.
   *
   * AN `instant` RESOLVES TO A PLAIN DAY, exactly as `before` and `after` already do on one and as
   * `resolveRelative` does on the structured side. Resolving only `day` would put the two renderings
   * back out of step on the other type in the same breath as fixing them on this one.
   */
  if (decl.type === 'day' || decl.type === 'instant') return resolveDay(said, deps.nowMs);

  /* AN INTEGER IS AN INTEGER, and the round trip is what says so: `Number('3px')` is `NaN` and
     `Number('')` is `0`, so the pattern comes first and the safe-integer check catches the rest.
     `duration` is seconds and `34 §3` writes it as an integer, so it reads the same as `int`. */
  if (decl.type === 'int' || decl.type === 'duration') {
    const n = Number(said);
    return /^[+-]?\d+$/.test(said) && Number.isSafeInteger(n) ? n : null;
  }
  if (decl.type === 'decimal') {
    const n = Number(said);
    return said.trim() !== '' && Number.isFinite(n) ? n : null;
  }

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
  /**
   * `REF_UNKNOWN` STAYS, AND IT IS NOW IN `30 §6` RATHER THAN INVENTED HERE.
   *
   * It looks like a synonym of `VALUE_MALFORMED` — whose own row reads *"an unresolvable id or
   * spoken reference"* — and it is not, because something BRANCHES on it. `declare` lints every
   * rule's `when:` before installing it and takes exactly one refusal as survivable:
   * `said.bad.find((b) => b.code !== 'REF_UNKNOWN')`. The argument is written there: *"`owner is
   * Kiln` names a row that may be written tomorrow; every other refusal here is about the grammar
   * or the shape, and those are facts about the declaration whenever it is read."* Fold this into
   * `VALUE_MALFORMED` and the filter has to exempt `VALUE_MALFORMED` instead — which swallows a
   * genuinely malformed value and installs a rule that fires on nothing, silently, for ever.
   *
   * THAT IS WHAT A CODE IS FOR, and it is the test for whether two refusals are one: not whether the
   * sentences read alike, but whether any caller has to tell them apart. This one does.
   *
   * IT IS ALSO NOT `REF_REGISTER_MISMATCH`, which is a ref resolving to a row of the WRONG register
   * — repoint it. Here there is nothing to point at.
   */
  if (decl.type === 'ref')
    return {
      code: 'REF_UNKNOWN',
      fix: `${sentence} — there is no ${decl.to ?? 'row'} called ${said}.`,
      at: field,
    };
  return { code: 'VALUE_MALFORMED', fix: `${sentence} — ${said} is not a value ${field} can hold.`, at: field };
}
