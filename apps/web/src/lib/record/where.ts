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
 *     due on today                      the day itself. `due is today` is the same clause, and both
 *                                       are read because the record reads both
 *     due before +30d                   a relative day: ± a number, then d, w or m
 *     renews before eom                 end of month. Also bow (this Monday), bom, boy, eoy, tomorrow, yesterday
 *     points at is empty                the field holds nothing: no value, '' or []
 *     points at is set                  and it holds something. `is not empty` is the second of
 *                                       those two and `is not set` is the first
 *     tags has urgent                   a LIST holds the value
 *     tags lacks urgent                 and it does not. `has not` is the second of those two
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

import { display, labelOf } from './api.ts';
import { REGISTERS, ROWS } from './data.ts';
import type { Entry } from './schema.ts';

export type Clause =
  | { field: string; op: 'is' | 'is not'; values: string[] }
  /* `not on` IS THE NEGATION OF `on` AND IT DID NOT EXIST. Without it, `is not` over a dated field
     had nowhere to go and fell through to the string branch below, where "today" is compared as
     the word `today` against a stored date. See the parse. */
  | { field: string; op: 'before' | 'after' | 'on' | 'not on'; day: string }
  /**
   * AND A CLAUSE ABOUT WHETHER THE FIELD HOLDS ANYTHING AT ALL, which had no member here.
   *
   * The kernel's grammar has published `empty` and `present` among its operators since the first
   * draft, `compile` there carries a `case` for each and `evaluate` answers both. This engine is
   * the same grammar for the browser, and it listed both words under `UNIMPLEMENTED`: a filter a
   * person could write in JSON could not be written in the sentence every block, chip and page
   * prints. Two languages, which is the whole thing these two files are held against.
   *
   * IT CARRIES NO OPERAND, and the empty list is how that is spelled rather than a missing key.
   * One reader outside this file tests the SHAPE rather than the operator, `metrics.ts`'s `dayAt`:
   * `if (!('values' in c)) return resolveDay(c.day, now) ?? c.day` reads a clause with no `values` as
   * a dated one and would go looking for a day this clause does not have. It was two readers, each
   * spelling that test its own way, until `dayAt` became the single one they both ask. A question about
   * absence has nothing to compare against, so `[]` is the true answer and it keeps that reader
   * correct: an absence clause does not move when the clock does.
   *
   * NOTHING MAY READ IT AS "IS ONE OF NOTHING". The value branch of `matches` answers false to
   * that on every row and its negation true on every row, which is the clause that quietly matches
   * everything, so both readers here test the OPERATOR first and the shape second.
   */
  | { field: string; op: 'empty' | 'present'; values: [] }
  /**
   * AND THE TWO OPERATORS ONLY A LIST TAKES, which no sentence on this side could say.
   *
   * `38 §2.1` publishes `has` and `lacks` among the nineteen, the record's `operatorAllowed` admits
   * them on `list` and on no other type, and its compiler and evaluator both answer them. This
   * compiler read four operators, so every list field in the mirror — nine `list<text>` and two
   * `list<ref>` over five registers — could be asked whether it held ANYTHING and never what it
   * held. Measured against a real record beside it: `repos has portage` answered `rows [3]` there
   * and *"that is not something a filter can say"* here.
   *
   * ONE VALUE, IN A `values` LIST, and both halves of that are deliberate. One, because the operator
   * looks for a single element inside a list and `tags has urgent or soon` would otherwise look for
   * a tag literally called `urgent or soon`; the tuple says so in the type rather than in a comment.
   * `values` rather than a key of its own, because `metrics.ts`'s `dayAt` reads a clause with no
   * `values` as a dated one, `if (!('values' in c)) return resolveDay(c.day, now) ?? c.day`, and would
   * go looking for a day this clause does not have.
   *
   * THE VALUE IS THE ELEMENT AS THE RECORD WOULD STORE IT, not as it was typed: an enum's declared
   * value, a ref's row number, a day resolved against the clock. `matches` compares elements, and an
   * element compared against the word somebody wrote is the `projects has Kiln` failure the record
   * names — four letters searched for in a column holding an id.
   *
   * A DAY IS THE ONE EXCEPTION AND IT KEEPS ITS WORD, because `compile` has no clock and `matches`
   * does. Every other branch here already works that way: `before` and `on` store `today` and resolve
   * it against the `now` their caller passes, and `compile` only checks that the word IS a day. A
   * `list<day>` asked about `today` and resolved at compile time answered against the WALL clock while
   * the rows were being matched against the record's — measured on a register declared into both
   * engines, where the record answered one row and this one answered none.
   *
   * AND THE HAZARD THAT WAS RECORDED HERE IS CLOSED, which is the half of this note that went stale.
   * It said `metrics.ts` read any clause carrying `values` as timeless, so a `has` over a list of days
   * moved with the clock while both of that file's readers called it still. It does not any more:
   * `dayAt` asks the field's element type and resolves a `list<day>` or `list<instant>` element against
   * the clock it is handed, `resolvedAt` and `timeless` are both that one function now, and the tile
   * that reported no delta over a register with a real minus fifty percent reports the delta. What is
   * left of the note is the line above it, which is why the element keeps its word here.
   */
  | { field: string; op: 'has' | 'lacks'; values: [string] };

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
  /**
   * THE SHAPE IS NOT THE CHECK, AND FOR EIGHT MONTHS IT WAS THE WHOLE OF IT.
   *
   * `ISO` is `^\d{4}-\d{2}-\d{2}$`, which says a string looks like a day and says nothing about
   * whether that day exists. `due before 9999-99-99` returned all thirty-eight obligations and
   * `due after 0000-00-00` returned all thirty-eight as well, because the word went back out
   * unchanged and `matches` compared it as a string: every stored date sorts below `9999-99-99` and
   * above `0000-00-00`. `renews before 9999-99-99` did the same to all sixteen services. That is the
   * clause that quietly matches every row, reached through this file's own date test: the failure
   * the header above lists four examples of, with a fifth one hiding inside the check written to
   * prevent them.
   *
   * THE ROUND TRIP IS WHAT SAYS THE DAY IS REAL. `Date.UTC` and the lenient parsers normalise rather
   * than refuse (`2026-02-30` comes back as 2 March), so parsing is not enough either; the day has
   * to come back spelled the way it was written. `Date.parse` of an impossible day is `NaN` and
   * `.toISOString()` on that THROWS, so the finiteness check comes first.
   */
  if (ISO.test(word)) {
    const ms = Date.parse(`${word}T12:00:00Z`);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10) === word ? word : null;
  }

  const d = new Date(now);
  switch (word) {
    case 'today':
      return iso(now);
    case 'tomorrow':
      return iso(now + DAY_MS);
    case 'yesterday':
      return iso(now - DAY_MS);
    /* THE MONDAY OF THIS WEEK, so a weekly habit starts again on it. */
    case 'bow':
      return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7), 12));
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
   * AND THE SAME DAY WRITTEN THE WAY THE SCREEN WRITES IT.
   *
   * `saidPlainly` turns `+90d` into "90 days from now", because `+90d` is a machine duration nobody
   * types or says — and every declared page prints its filter through it. That sentence is the
   * record's own restatement of the declaration; it is what somebody reads when they ask what a page
   * filters on, and it is what an agent copies. It did not compile. Three of the seed's four
   * temporal blocks printed a filter the record would refuse.
   *
   * The fix belongs here rather than in the printer, and the file already says why: `declaredValue`
   * exists because "the stored form and the readable form have to be the same thing, or the
   * predicate is a second language somebody has to learn". A field's VALUE was taught both
   * spellings and its DATE never was. This is the same rule, one operand along.
   *
   * The set is closed, and it is a HAIR wider than what `spokenDay` emits: `1 days from now` and
   * `3 day ago` are accepted, and so is a doubled space between the number and the noun (not inside the
   * `from now`, which is one token). That is deliberate and worth saying rather
   * than claiming an exact match — the printer never produces them, but a person retyping a filter
   * they read will get the plural wrong, and refusing them would teach that the sentence on screen
   * is not quite the sentence the record takes. It is still a compiler: nothing outside this shape
   * resolves, and `2 years from now` is `null` because `34 §1.1`'s units are `d`, `w` and `m`.
   */
  const prose = /^(\d{1,4})\s+(day|days|week|weeks|month|months)\s+(from now|ago)$/.exec(word);
  if (prose) {
    const [, n, noun, way] = prose as unknown as [string, string, string, string];
    const unit = noun.startsWith('day') ? 'd' : noun.startsWith('week') ? 'w' : 'm';
    return resolveDay(`${way === 'ago' ? '-' : '+'}${n}${unit}`, now);
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

/* SPACES IN THE FIELD, because a label has them. `Row title is x` could not even reach `fieldOf`
   under `[a-z][a-z0-9_]*`: it failed the grammar and got "that is not something a filter can say",
   which is the wrong sentence about the wrong half of the clause. Non-greedy, so the first operator
   still ends the field name and a value may contain the word `is`. */
/**
 * AND THE OPERAND IS OPTIONAL, WHICH TURNED FOUR REFUSALS INTO THE WRONG REFUSAL.
 *
 * It was `\s+(.+?)\s*$`: at least one character after the operator, so `state is`, `due before` and
 * `repos has` did not match the grammar at all and got *"that is not something a filter can say"* —
 * a verdict about the whole clause when the operator was fine and one word was missing. The record
 * answers `is what?`, `(nothing) is not a date` and `has what?`, each naming the one thing to add,
 * which is what `10 §7`'s fourth rule asks a refusal to do.
 *
 * THE WHITESPACE STAYS INSIDE THE OPTIONAL GROUP rather than becoming `\s*`. With `\s*` the operator
 * would no longer need a space after it, so `state isnot live` matched as `state is` with the value
 * `not live` — a negation read out of a typo, which is the one thing this grammar must not do.
 */
/**
 * AND `on` WAS MISSING FROM IT WHILE BOTH ENGINES ANSWERED THE CLAUSE, which is the same drift
 * `has` and `lacks` were taught out of, one operator along and left behind by the commit that taught
 * them.
 *
 * `packages/where/src/sentence.ts:156` reads `ORDERED = { before: 'before', after: 'after', on: 'is'
 * }`, so the record has taken `due on 2026-10-01` since that table was written, and the clause it
 * compiles to is the one this file has been producing from `is <a date>` since the date path was
 * written. So an agent writing `due on today` from the published grammar was refused by this surface
 * and answered by the record beside it, with *"that is not something a filter can say"*: word for
 * word the sentence `ccb853a3` was written to stop `tags has urgent` getting.
 *
 * TEACHING IT ADDS A SPELLING AND NO BEHAVIOUR. `on` and `is <a date>` are one clause on both sides,
 * which is asserted by driving the pair over the record in `where.test.ts` rather than by saying so
 * here.
 */
const CLAUSE = /^\s*([a-z][a-z0-9_ ]*?)\s+(is not|is|before|after|on|has|lacks)(?:\s+(.+?))?\s*$/i;

/**
 * THE SAME CLAUSE, WITH THE FIELD'S OWN NAME ALLOWED TO END IN THE WORD `on`.
 *
 * `CLAUSE` ends the field at the FIRST operator it meets, and the moment `on` joined that list five
 * of the shipped mirror's own fields came apart on it: `obligations.settled` and
 * `installments.settled` are labelled **Paid on**, `tasks.done_on` reads `done on` by its id alone and
 * is labelled **Done on**, `learnings.confirmed_on` reads `confirmed on` the same way, and
 * `tools.hosts` is labelled **Seen on**. Measured with `on` in the alternation and nothing else
 * changed: `paid on before today` parsed as the field `paid`, which no register declares, and each of
 * the five became *"there is no field called <its first word>"* under a register page that had just
 * drawn the column. `seen on has kiln-mbp` was the same, on a list.
 *
 * THE RECORD'S RULE IS THE LONGEST FIELD NAME FIRST, at `sentence.ts:291`: it scans every declared id
 * and label for the longest name the clause starts with and reads the verb after that. This is that
 * rule in this file's operator-first idiom, asked only when the shorter reading landed on `on`: if the
 * name plus `on` is a field the register declares, then that is the field and the operator is the next
 * word. Both spellings are driven over the real seed in `where.test.ts`, because a copy of a relation
 * only stays a copy if something holds it there.
 *
 * AND AN ID IS NEVER SHADOWED BY A LONGER LABEL, WHICH THE DIFFERENTIAL CAUGHT THIS OVERREACHING ON.
 * `sentence.ts:269` takes the first word as a field id EXACTLY and scans the labels only when that
 * finds nothing, so the record's precedence is the id and then the longest name. `tools` declares both
 * `hosts` labelled **Seen on** and `seen`, an instant labelled **Last seen**, and measured on the real
 * record `seen on has kiln-mbp` is therefore *"has kiln-mbp is not a date"* there: the field is `seen`
 * and the operand of `on` is the rest of the sentence. The first version of this retry read it as
 * `hosts has kiln-mbp` and answered three rows where the record refused, which is this file's own rule
 * broken in the other direction by the repair meant to keep it. So the longer name is taken only when
 * the shorter one is not an id at all, and `where.test.ts` holds both halves against the record.
 *
 * WHAT IT DOES NOT RESCUE, said rather than left to be discovered: `paid on 2026-10-01`, a real field
 * followed by no operator at all, still refuses as *"there is no field called paid"* where the record
 * refuses it as an operator it cannot read. Both refuse, and neither invents a clause, which is the
 * property that matters here.
 */
const NAMED_ON = /^\s*([a-z][a-z0-9_ ]*?\s+on)\s+(is not|is|before|after|on|has|lacks)(?:\s+(.+?))?\s*$/i;

/**
 * The operators `21-AUTHORING` §4.2 publishes and this build does not read.
 *
 * They matter because they PARSE. `amount is at least 10000` is a well-formed clause whose value is
 * the string "at least 10000", so it compiled, matched nothing, and drew the author's own "nothing
 * matched" sentence — the state `blocks.ts` exists to keep separate from a filter that was not
 * understood.
 */
/* `empty` AND `present` CAME OFF THIS LIST, because they are read now. They were the two published
   operators that needed no operand and no new comparison: the record's own compiler answers both
   with the three ways a value is absent, and this file was refusing the sentence for a predicate
   the kernel beside it has always compiled. */
/* AND `has` AND `lacks` WERE NEVER ON IT, which is how they went unnoticed longest: a word in the
   value slot is caught by the sweep below, and these two are VERBS. `tags has urgent` never reached
   this list — it failed the grammar itself and got the sentence about the whole clause. */
const UNIMPLEMENTED = ['at least', 'at most', 'more than', 'less than', 'contains', 'starts', 'starts with', 'ends', 'ends with', 'between', 'in', 'not in'];

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/**
 * The words for "the field holds nothing" and "the field holds something", and the operator each is.
 *
 * `set` IS THE READER'S WORD AND `present` IS THE FORMAT'S. `19 §9` takes the reader's, so `set` is
 * what the sentences here say and what a refusal names; `present` is accepted beside it because it
 * is the word `38 §2.1` publishes, and an agent writing from the documentation writes the word it
 * read there. The record's sentence parser accepts exactly these three, so a filter written for one
 * engine is a filter for the other.
 */
const ABSENCE: Record<string, 'empty' | 'present'> = { empty: 'empty', set: 'present', present: 'present' };

/** And the negation inverts: `is not empty` is `present`, `is not set` is `empty`. */
const INVERSE = { empty: 'present', present: 'empty' } as const;

/**
 * THE TWO WORDS FOR WHAT A LIST HOLDS, and they are the record's own rather than a translation.
 *
 * `before` and `after` are already shared verbatim between the two engines, and `has` and `lacks` are
 * ordinary English before they are anything else, so there is nothing for either side to translate
 * and nothing for a printer to choose. `contains` was the other candidate and is the one word that
 * may not be used: `38 §2.1` already publishes it, meaning a substring of a text, and one word whose
 * meaning is decided by the field's type is the ambiguity a person reading a sentence back cannot
 * resolve.
 */
const LISTED: Record<string, 'has' | 'lacks'> = { has: 'has', lacks: 'lacks' };

/** And the negation inverts here too, for the reason `INVERSE` does. `has not` is `lacks`. */
const OPPOSITE = { has: 'lacks', lacks: 'has' } as const;

/**
 * The element types this grammar has no literal for, which is the record's own `COMPOUND` set.
 *
 * A money is `{ amount, currency }`, a quantity is `{ value, unit }`, a file is
 * `{ sha256, mime, bytes, name }` and a `json` is whatever was put there: none is stored as a bare
 * string, and no sentence can write one. The record measured what happens without the check —
 * `bag has GBP 10.00` over a `list<money>` compiled to real SQL comparing those characters against an
 * object, matching nothing, for ever — and `FieldDecl.of` on this side admits `money`, so the hole is
 * reachable from here the day a register declares one. None in the shipped mirror does: all eleven of
 * its list fields are `list<text>` or `list<ref>`, which is what `field-types.test.ts`'s walk counts.
 */
const COMPOUND = ['money', 'quantity', 'file', 'json'];

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
/**
 * Whether the register declares this name as a field ID, which is the one match a longer LABEL may
 * not shadow.
 *
 * IT EXISTS FOR ONE CALLER, `NAMED_ON`'s retry, and its own paragraph has the measurement: the record
 * reads the first word as an id exactly and scans labels only when that fails, so `seen on ...` on a
 * register declaring both `seen` and a field labelled **Seen on** is a clause about `seen`.
 */
const isId = (register: string, name: string): boolean => {
  const want = norm(name);
  return (REGISTERS[register]?.fields ?? []).some((f) => norm(f.id) === want);
};

const fieldOf = (register: string, name: string): string | null => {
  const want = norm(name);
  const fields = REGISTERS[register]?.fields ?? [];
  /* THE ID FIRST, ALWAYS. A label is a second spelling, not a replacement, and a register free to
     label one field with another's id must not be able to redirect a predicate by doing it. */
  const byId = fields.find((f) => norm(f.id) === want);
  if (byId) return byId.id;
  /**
   * AND THEN THE NAME THE SCREEN USES, which is the one a person has in front of them.
   *
   * `/r/services` calls its `kind` column **Type** and `/p/estate` prints its filter as
   * `type is domain` — the record's own restatement of its own declaration — and feeding that back
   * got "there is no field called type". Six of the seed's twelve declared filters failed to
   * survive one round trip through the screen that displays them.
   *
   * `labelOf`'s fallback is the id with underscores as spaces, so `owed_by` and `Owed by` resolve
   * through the same branch and a register that declares no labels is unaffected.
   */
  return fields.find((f) => norm(labelOf(f)) === want)?.id ?? null;
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
  if (f.type === 'enum') return [...(f.values ?? []), ...Object.values(f.labels ?? {})].map(norm);
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
 * Whether a money value, as somebody wrote it, names a currency.
 *
 * A MONEY VALUE IS AN AMOUNT AND A CURRENCY, and this grammar has no money literal: it compares the
 * value against `display()`, which writes `GBP 960.00`. So the currency is a word in the sentence
 * or it is not there at all, and `amount is 480000` is a comparison that cannot say what it is a
 * comparison OF. The record refuses it as `MONEY_LITERAL_NEEDS_CURRENCY` for the reason its own
 * refusal gives: without one it matches every currency in the register, and adding two currencies
 * is the mistake minor units exist to make impossible.
 *
 * The code sits at one end or the other, since `GBP 960.00` is what every surface here prints, rather
 * than anywhere in the string, because "the big one" holds three three-letter words and none of
 * them is money.
 */
const CURRENCY = /^[a-z]{3}$/i;
const carriesCurrency = (value: string): boolean => {
  const words = value.trim().split(/\s+/);
  return CURRENCY.test(words[0] ?? '') || CURRENCY.test(words[words.length - 1] ?? '');
};

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
const WRONG_SHAPE = 'where: takes a sentence like `state is open, due before +30d`, and not a tree of objects.';

/* AND THE LIST IT NAMES IS SEVEN NOW. It named the four this compiler read while the record's own
   sentence named six, so a refusal told an agent that `has` and `lacks`, which it had just read in
   the published grammar and which the record answers, do not exist. A refusal that teaches a
   narrower language than the record speaks is worse than one that teaches nothing.

   AND `on` WAS LEFT OUT OF BOTH SPELLINGS WHILE BOTH ENGINES ANSWERED IT, which is the same defect
   with nobody's name on it: the record's `ORDERED` table has read the word since it was written and
   the record's own refusal denies it, so this file copied a sentence that was wrong about the engine
   it was copied from.

   SO THIS IS THE ONE SENTENCE HERE THAT IS NOT THE KERNEL'S BYTE FOR BYTE, and the divergence is
   deliberate and is one word. `packages/where/src/sentence.ts:464` still writes six while its own
   `allowed: ['is', 'is not', 'before', 'after', 'on', 'has', 'lacks']` two lines below writes seven,
   and that line is the record's to correct. Of the two ways to disagree with it, naming an operator
   both engines answer is the one that leaves an agent able to write a filter. The order is the
   record's `allowed` order, so the day that sentence is widened the two read the same. */
const cannotSay = (text: string): string =>
  `${text}: that is not something a filter can say. Write is, is not, before, after, on, has or lacks.`;

/**
 * One element of a list as the record would STORE it, from the value somebody wrote, or `null`.
 *
 * ASKED IN THE TYPE OF AN ELEMENT, BECAUSE THAT IS WHAT THE VALUE IS. `has` and `lacks` look for one
 * value inside a list, so the word carries an element and never a list, and the record measured what
 * happens when the list's own type is passed down instead: `projects has Kiln` compiled to a search
 * for the four letters `Kiln` in a column holding an id, which parses, compiles and matches nothing,
 * for ever. Four fields in the shipped seed are `list<ref>`.
 *
 * A REF RESOLVES BY THE TITLE AND NOT BY THE NUMBER, which is the one place this parts company with
 * the scalar `is` beside it. `allowed` admits a ref's `seq` there because `registerHref` writes one
 * into a URL and a link must not break when a row is renamed; no chip can carry `has` at all, so
 * there is no number arriving from anywhere, and the record refuses `because has 4` with *"there is no
 * learnings called 4"*. Accepting it here would make the browser answer a sentence the record does not.
 */
function elementValue(register: string, field: string, of: string, said: string, now: number): string | null {
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);

  /* AN ENUM ELEMENT IS ITS DECLARED VALUE, matched in the words a screen shows and in the label the
     register gives it — the same three spellings `declaredValue` and `allowed` accept on a scalar. */
  if (of === 'enum') {
    const want = norm(said);
    const labelled = Object.entries(decl?.labels ?? {}).find(([, label]) => norm(label) === want)?.[0];
    if (labelled && (decl?.values ?? []).includes(labelled)) return labelled;
    return (decl?.values ?? []).find((v) => norm(v) === want) ?? null;
  }

  if (of === 'ref') {
    const to = decl?.to;
    const title = to ? REGISTERS[to]?.title : undefined;
    if (!to || !title) return null;
    /* THE ELEMENT THE COLUMN HOLDS, which on this side is the row's `seq`: `data.ts` numbers the seed
       by position, so a ref in the mirror is a number where the record keeps a ULID. */
    const row = (ROWS[to] ?? []).find((e) => String(e.fields[title] ?? '') === said);
    return row ? String(row.seq) : null;
  }

  /* A BOOLEAN ELEMENT IS A BOOLEAN AND NOT THE WORD, which is why `matches` compares `String(v)`:
     the column holds `true` and the sentence says `yes`. */
  if (of === 'bool') return { true: 'true', yes: 'true', false: 'false', no: 'false' }[said.toLowerCase()] ?? null;

  /* A DAY IS CHECKED HERE AND RESOLVED IN `matches`, which is what `before` and `on` already do: this
     function is called from `compile`, and `compile` has no clock of its own. Handing back an absolute
     day resolved on the wall clock made `days has today` answer nothing on a record whose rows were
     being matched against `NOW`. */
  if (of === 'day' || of === 'instant') return resolveDay(said, now) === null ? null : said;

  /* AN INTEGER IS AN INTEGER, and the round trip says so: `Number('3px')` is `NaN` and `Number('')` is
     `0`, so the pattern comes first. A `duration` is seconds and reads the same as an `int`. */
  if (of === 'int' || of === 'duration') {
    const n = Number(said);
    return /^[+-]?\d+$/.test(said) && Number.isSafeInteger(n) ? String(n) : null;
  }
  if (of === 'decimal') {
    const n = Number(said);
    return said.trim() !== '' && Number.isFinite(n) ? String(n) : null;
  }

  /* AND FOR TEXT, A DOCUMENT, A URL, AN EMAIL OR A SECRET THE TYPED CHARACTERS ARE THE STORED VALUE,
     which is why those types are not in `COMPOUND`: there is nothing to resolve, not nothing to write. */
  return said;
}

/**
 * The element a `has` clause is looking for, at the clock the rows are being read on.
 *
 * ONE WORD MOVES AND THE REST DO NOT. `elementValue` resolves everything it can at compile time and
 * leaves a temporal word alone, because only `matches` knows what `now` is; this is the other half of
 * that, and it is the same split `matches` already makes for a `before` clause's `day`.
 */
const elementWanted = (register: string, field: string, value: string, now: number): string => {
  const of = REGISTERS[register]?.fields.find((f) => f.id === field)?.of;
  return of === 'day' || of === 'instant' ? (resolveDay(value, now) ?? value) : value;
};

/**
 * Why one element could not be resolved, in the record's own three sentences.
 *
 * THREE, BECAUSE THE KIND OF WRONG IS THE INSTRUCTION. "there is no learnings called Kiln" tells
 * somebody to check the name of a row; "tags has no value urgent" tells them to check a declared set;
 * "banana is not a value met can hold" tells them the shape is wrong. One sentence for all three would
 * send a reader looking for the wrong thing, which is the argument the value branch below already makes.
 */
const refuseElement = (text: string, register: string, field: string, of: string, said: string): string => {
  if (of === 'enum') return `${text}: ${field} has no value ${said}`;
  if (of === 'ref') return `${text}: there is no ${REGISTERS[register]?.fields.find((f) => f.id === field)?.to ?? 'row'} called ${said}`;
  return `${text}: ${said} is not a value ${field} can hold`;
};

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

    /* THE LONGEST FIELD NAME WINS, WHICH IS ONE LINE AND IS THE RECORD'S RULE. `NAMED_ON`'s own
       paragraph has the four fields in the shipped mirror this is about and what they did without it. */
    const first = CLAUSE.exec(text);
    const named =
      first !== null &&
      (first[2] ?? '').toLowerCase() === 'on' &&
      !isId(register, first[1] ?? '') &&
      fieldOf(register, `${first[1]} on`) !== null;
    const m = named ? (NAMED_ON.exec(text) ?? first) : first;
    if (!m) {
      /* THE REFUSAL NAMES THE OPERATORS THAT WORK. `21-AUTHORING` §4.2 publishes eleven operators,
         so "not a predicate" told an agent it was wrong and nothing about what to write — which is
         the one thing 10 §7's fourth rule asks a refusal to do. */
      bad.push(cannotSay(text));
      continue;
    }
    /* `rest` IS UNDEFINED WHEN THE OPERAND IS NOT THERE, because `CLAUSE`'s third group is optional
       now. Every branch below reads it as the empty string and refuses by naming what is missing. */
    const [, name, said, operand] = m as unknown as [string, string, string, string | undefined];
    const rest = operand ?? '';
    /* THE OPERATOR FOLDED ONCE, because `CLAUSE` matches case-insensitively and every test of it
       below is against a lower-case literal. `STATE IS Live` has worked since the regex took its
       `i`, and `STATE IS NOT Live` did not: `'IS NOT' === 'is not'` is false, so the negation fell
       to the `is` branch and the clause meant the opposite of the sentence. A negation that does
       not invert is the one defect this grammar keeps being bitten by. */
    const op = said.toLowerCase();

    const field = fieldOf(register, name);
    if (!field) {
      bad.push(`${text}: there is no field called ${name}`);
      continue;
    }

    /* The declaration behind the resolved name, read ONCE. Both branches below need the field's
       type, and the `is` branch used to look it up on its own while the `before` branch never
       looked it up at all, which is the next paragraph. */
    const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
    const dated = decl?.type === 'day' || decl?.type === 'instant';

    if (op === 'before' || op === 'after' || op === 'on') {
      /**
       * AND THE FIELD HAS TO BE A DATE, WHICH NOTHING HERE EVER ASKED.
       *
       * This branch asked only whether the OPERAND resolved as a day. It never asked what the field
       * was, and `matches` then ran `raw.slice(0, 10) < day` over whatever the column held, which
       * for text and for an enum is a string comparison against a date. `state after today` was
       * `'open' > '2026-09-03'`, true of all thirty-eight obligations, and `what after
       * 2026-01-01` was true of all thirty-eight as well, because a letter sorts after a digit.
       * `what before today` was 0 of 38 for the same reason in the other direction. That is 1,470
       * of the 3,563 sentences a differential pass drove, which is every `before` or `after` over
       * every field in the record that is not a date.
       *
       * Nothing on a screen distinguishes any of them from a filter that worked. It is the clause
       * that quietly matches every row, which is the failure this file's header is written against,
       * reached through the one operator pair the header does not list.
       *
       * The record's rule is the same rule, in `operatorAllowed`: `before` and `after` are for a
       * `day` or an `instant`, and on any other type they are a refusal rather than a comparison.
       *
       * AND `on` IS READ HERE BECAUSE IT IS THE THIRD OF THAT PAIR AND NOT A FOURTH THING. The record
       * keeps all three in one table, `ORDERED` at `sentence.ts:156`, and takes the operand and the
       * type check of all three in one branch; so does this, so that a clause the two engines
       * spell the same way cannot be checked two different ways. `state on today` is therefore
       * *"state is a enum, and on is about dates"* on both sides, which `where.test.ts` asserts of
       * both rather than of this one.
       */
      if (!dated) {
        bad.push(`${text}: ${field} is a ${decl?.type ?? 'field'}, and ${op} is about dates`);
        continue;
      }
      const word = rest.trim();
      /* `(nothing)` RATHER THAN A GAP IN THE SENTENCE, which is the record's word for the same hole:
         `due before` used to read ": is not a date", a refusal with a blank where the fault is. */
      if (resolveDay(word, Date.now()) === null) {
        bad.push(`${text}: ${word || '(nothing)'} is not a date`);
        continue;
      }
      clauses.push({ field, op, day: word });
      continue;
    }

    /* ── has · lacks ─────────────────────────────────────────────────────── */
    if (Object.hasOwn(LISTED, op)) {
      const asked = LISTED[op]!;
      /**
       * AND THE FIELD HAS TO BE A LIST, which is the whole of the record's `operatorAllowed` row for
       * these two: `has` and `lacks` on any other type are a refusal rather than a comparison. The
       * table cannot be imported — `@braindog/where` is not a dependency of this app and the kernel
       * does not re-export it — so it is written here and held against the record by driving both
       * engines over every field of every register in `where.test.ts`, which is the only way a copy
       * of a relation stays a copy.
       */
      if (decl?.type !== 'list') {
        bad.push(`${text}: ${field} is a ${decl?.type ?? 'field'}, and ${op} is about lists`);
        continue;
      }

      /* `has not` READ THE WAY `is not` IS, because somebody who learned one writes the other, and a
         trailing bare `not` is not a search for the word. It inverts both ways: a clause answering
         the opposite of the question is worse than one that refuses. */
      const no = rest === 'not' || rest.startsWith('not ');
      const wanted = (no ? rest.slice(3) : rest).trim();
      if (!wanted) {
        bad.push(`${text}: ${op}${no ? ' not' : ''} what?`);
        continue;
      }

      /* AND `or` IS NOT READ HERE. The operator looks for ONE value in the list, so `tags has urgent
         or soon` would otherwise look for a tag literally called `urgent or soon`: a clause that
         parses, compiles and matches nothing, for ever, which is the failure this whole file is
         written against. Two questions are two clauses, and the refusal says so. */
      if (/\s+or\s+/i.test(wanted)) {
        bad.push(`${text}: ${op} takes one value to look for in the list. Write a clause for each`);
        continue;
      }

      /* `values` BEFORE `of`, so a `list<enum>` reads as an enum however it was declared: the record
         reads the same marker first and for the same reason, and a hand-written schema that gives
         `values` and no `of` is the fixture form. A list with neither is text, which is what the nine
         `list<text>` fields in the mirror are. */
      const of = decl.values ? 'enum' : (decl.of ?? 'text');
      if (COMPOUND.includes(of)) {
        bad.push(`${text}: ${field} is a list of ${of}, and this grammar has no way to write one`);
        continue;
      }

      const held = elementValue(register, field, of, wanted, Date.now());
      if (held === null) {
        bad.push(refuseElement(text, register, field, of, wanted));
        continue;
      }
      clauses.push({ field, op: no ? OPPOSITE[asked] : asked, values: [held] });
      continue;
    }

    /**
     * `is <a date>` ON A DATE FIELD IS A DATE COMPARISON, and it was a string comparison.
     *
     * `due is today` matched **nothing**, on every register, always — the value went through
     * `formsOf`, which compares against the raw store (`2026-09-03`) and against `display()`
     * (`3 Sep 2026`), and `today` is neither. `before` and `after` had a date path from the day they
     * were written and `is` never got one, so the one date filter a person types by hand was the one
     * that could not work.
     *
     * IT ALSO MADE `display()` LOAD-BEARING IN A PLACE IT MUST NOT BE. `last_seen is today` DID match
     * while `display()` happened to render an instant as `relative()` — so a filter's meaning was a
     * side effect of a formatting choice, and it broke the day that formatter learned to say
     * `3h ago`. A filter that depends on how a cell is printed is a filter nobody can reason about.
     *
     * The date path is taken only when the FIELD is a date and the value resolves as one, so an enum
     * whose value is literally the word `today` is untouched.
     */
    const one = rest.trim();

    /**
     * `is not` WITH NOTHING AFTER IT IS NOT A SEARCH FOR THE WORD `not`.
     *
     * `CLAUSE` prefers the longer operator, so `what is not` tried `is not` first, found no value
     * behind it, backtracked to `is`, and compiled `what is "not"`: a filter for obligations whose
     * description is the word "not". It matched nothing, said nothing, and drew the author's own
     * "nothing matched" sentence, which is the state `blocks.ts` exists to keep apart from a filter
     * that was never understood. The record asks the question back: `is not what?`
     */
    if (op === 'is' && one === 'not') {
      bad.push(`${text}: is not what?`);
      continue;
    }
    /* AND `state is` WITH NOTHING AFTER IT IS THE SAME QUESTION ONE WORD EARLIER. It used to fail the
       grammar itself and get the sentence about the whole clause, which named four operators at a
       reader whose operator was fine. `CLAUSE` reads the bare operator now, so the refusal is the
       record's: the one thing missing. */
    if (!one) {
      bad.push(`${text}: ${op} what?`);
      continue;
    }
    /* `op === 'is'` AND NOT MERELY "not before or after". `before` and `after` are consumed above,
       and `is not` fell straight through here — so the negation was DROPPED and `due is not today`
       compiled to the same clause as `due is today`. Reachable from a URL, not only a typed
       sentence: `whereOf` maps `not-in` to `is not`, so `?f=due:not-in:2026-09-14` returned the
       complement of what the chip said. A filter that quietly inverts is the one failure a
       declarative surface must not have. */
    /**
     * AND `is not` COMES HERE TOO, WHICH IT DID NOT.
     *
     * The comment above is about a negation being DROPPED, and the fix for that put `is not` back on
     * the string branch, where a relative word is compared as a word: `due is not today` became
     * "the due field does not hold the text `today`", which is true of every row that has a date
     * and of every row that has none. The whole register came back and looked like an answer.
     *
     * THE KERNEL'S STRUCTURED FORM ALREADY RESOLVED IT, so the two renderings of one grammar gave
     * different answers over the same rows: `{ due, not: 'today' }` returned three and
     * `due is not today` returned thirty-nine. Same defect, same week, one engine along.
     */
    if ((op === 'is' || op === 'is not') && dated && !/\s+or\s+/i.test(rest) && resolveDay(one, Date.now()) !== null) {
      clauses.push({ field, op: op === 'is' ? 'on' : 'not on', day: one });
      continue;
    }

    /* ` or ` and not `|`, because the person reading this is reading a sentence. */
    const values = rest.split(/\s+or\s+/i).map((v) => v.trim()).filter(Boolean);

    /**
     * A TYPE WITH NO DECLARED SET IS STILL NOT AN OPEN ONE, and it was being treated as one.
     *
     * `allowed` closes an `enum` by its values and a `ref` by the titles it points at, and returned
     * `null` for everything else, so on a `day`, an `instant` or a `money` field ANY word compiled
     * clean and went to `formsOf`, which compares it against the stored string and against
     * `display()`. Four of the five refusals the record gives and this file did not came out of
     * that hole, and the fifth is the ISO round trip above:
     *
     *     due is banana        →   0 of 38, no refusal    the record: banana is not a value due can hold
     *     amount is 480000     →   0 of 38, no refusal    the record: amount is money, name a currency
     *     amount is not today  →  38 of 38, no refusal    the record: the same
     *
     * The last one is the one that bites, and it is the shape the whole file exists to stop: on a
     * field that cannot hold the value at all, `is not <anything>` excludes no row and hands back
     * the entire register looking like an answer. An empty list is the milder half of the same
     * mistake: it draws the author's own "nothing matched" sentence, which `blocks.ts` keeps
     * apart from "the filter was not understood", and here the filter was not understood.
     *
     * A DAY IS CHECKED BY RESOLVING IT, which is the same test the operand of `before` gets and the
     * same test `is` got two branches up before it fell through to here. The narrowing this costs
     * is real and worth naming: `due is 27 Jul 2026`, the day as a table cell prints it, used to
     * match one row through `display()` and is now a refusal. No surface in this app writes that
     * spelling (`saidPlainly` and `registerHref` both emit the stored `2026-07-27`), and a filter
     * whose meaning depends on how a cell is formatted is the thing the `is <a date>` paragraph
     * above refuses to have.
     */
    const set = allowed(register, field);
    const closed = set !== null || dated || decl?.type === 'money';
    const unknown = set
      ? values.filter((v) => !set.includes(norm(v)))
      : dated
        ? values.filter((v) => resolveDay(v, Date.now()) === null)
        : decl?.type === 'money'
          ? values.filter((v) => !carriesCurrency(v))
          : [];

    /**
     * `is empty` AND `is set`, IN THE SAME ORDER: THE DECLARED VALUES FIRST.
     *
     * The paragraph below is the rule and this is the first operator to be read rather than named,
     * so it keeps the rule exactly. `set` is consulted first, which is the enum's values or the
     * titles a ref points at, and only a word the register does not declare is read as the
     * operator. A register free to declare a state called `empty` must not be made unfilterable on
     * that field by this grammar learning a word.
     *
     * ONE WORD ONLY. `points at is empty or set` is two values, and two values are a list of things
     * to compare against rather than a question about absence; it stays on the value branch, where
     * the record's own sentence parser leaves it too.
     */
    const only = values.length === 1 ? norm(values[0] ?? '') : '';
    const absence = ABSENCE[only];
    if (absence && !(set ?? []).includes(only)) {
      /* THE NEGATION INVERTS. `is not empty` is `present` and `is not set` is `empty`, which is the
         one thing that must not be got wrong here: a negation compiled as its own positive is a
         filter that confidently answers the opposite question. */
      clauses.push({ field, op: op === 'is not' ? INVERSE[absence] : absence, values: [] });
      continue;
    }

    /**
     * AND A LIST TAKES NONE OF THE FOUR VALUE OPERATORS, WHICH IS THE OTHER HALF OF TEACHING IT `has`.
     *
     * The record's `operatorAllowed` gives `is`, `not`, `in` and `not_in` to every type EXCEPT `list`,
     * and its compiler refuses the leaf by name: `repos is portage` is *"repos is a list, which cannot
     * be asked \"is\""*. This side compiled it instead, into a comparison against `formsOf`, which
     * reads the raw value through `String()` and through `display()` — and `display()` on a list is
     * `listLine`, its elements joined with a comma and a space.
     *
     * SO IT WORKED OR DID NOT BY HOW MANY VALUES THE ROW HAPPENED TO HOLD, which is the worst of the
     * three possible answers. Measured over the four rows of `things`: `repos` on the row holding one
     * repository stringified to exactly that repository, so `repos is portage` matched it, while the
     * row holding two stringified to
     * `git.kiln.example/type/kiln-type,git.kiln.example/type/kiln-site` — so
     * `repos is git.kiln.example/type/kiln-type` matched NOTHING on the row that holds it. One
     * sentence, right on three rows and wrong on the fourth, with nothing on screen to tell them apart.
     *
     * THE NARROWING IS REAL AND IS THE POINT: `repos is portage` used to return that row and is a
     * refusal now, and `repos has portage` is the sentence for it. A filter whose meaning is a
     * formatting choice is what the `is <a date>` paragraph above refuses to have, and a filter that
     * works on a list of one is that with a fuse in it.
     *
     * IT COMES AFTER THE ABSENCE BRANCH, because `34 §1.2` admits `empty` and `present` on every type
     * there is: `repos is set` is a question a list can answer and `repos is portage` is not.
     *
     * THE OPERATOR IT NAMES IS THE STRUCTURED ONE, because that is the name the record's refusal
     * carries and a reader comparing the two sentences must not find two vocabularies. One value is
     * `is`, several are `in`, and each has its negation.
     */
    if (decl?.type === 'list') {
      const asked = values.length === 1 ? (op === 'is not' ? 'not' : 'is') : op === 'is not' ? 'not_in' : 'in';
      bad.push(`${text}: ${field} is a list, which cannot be asked "${asked}"`);
      continue;
    }

    /* AN OPERATOR IN THE VALUE SLOT IS AN OPERATOR, NOT A VALUE, and it is checked only AFTER the
       declared values, so an enum that really holds the word `present` still resolves.

       `amount is at least 10000` parsed as `is` against the literal string "at least 10000", found
       no field holding those words, matched nothing, and drew the author's own "nothing matched"
       sentence — which is the one state `blocks.ts` exists to keep separate from a filter that was
       not understood. These are the operators `21-AUTHORING` §4.2 publishes and this build does not
       read, so an agent writing from the docs is told so instead of being handed an empty block. */
    const reach = (closed ? unknown : values).find((v) =>
      UNIMPLEMENTED.some((w) => v.toLowerCase().startsWith(`${w} `) || v.toLowerCase() === w),
    );
    if (reach) {
      bad.push(
        /* SEVEN HERE TOO, for the reason `cannotSay` gives above: two recitations of one list in one
           file, and a reader who meets the shorter one learns the same wrong thing. */
        `${text}: "${UNIMPLEMENTED.filter((w) => reach.toLowerCase().startsWith(w)).sort((a, b) => b.length - a.length)[0]}" is not an operator this build reads. It reads is · is not · before · after · on · has · lacks`,
      );
      continue;
    }

    if (unknown.length) {
      /* THE REFUSAL SAYS WHICH KIND OF WRONG IT IS. "state has no value done" is a fact about a
         declared set and is the wrong sentence for `amount is 480000`, where the set is open and
         the value is short of a currency; a person told the register has no such amount would go
         looking for the row. Three types, three sentences, each naming the one thing to change. */
      bad.push(
        decl?.type === 'money'
          ? `${text}: ${field} is money, so this comparison needs a currency, like GBP 960.00`
          : dated
            ? `${text}: ${unknown.join(' or ')} is not a value ${field} can hold`
            : `${text}: ${field} has no value ${unknown.join(' or ')}`,
      );
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

    /**
     * THE THREE WAYS A VALUE IS ABSENT, and they are the kernel's three rather than a rule invented
     * here: `null`, the empty string and the empty list, which its compiler spells out as
     * `(expr IS NULL OR expr = '' OR expr = '[]')` and its evaluator answers with the same three.
     * A write stores none of them, but an import carries whatever the other record held, and the
     * shipped record's services hold `points_at: ''` rather than nothing at all. Reading only
     * `null` would have missed exactly the rows somebody asking this question is looking for.
     *
     * `34 §6` is the other half: every positive operator is false on a missing value. `present` is
     * a positive operator, so it is false on all three; `empty` is the question about absence
     * itself, so it is the only clause here a row with nothing in the field can satisfy.
     */
    if (c.op === 'empty' || c.op === 'present') {
      const absent = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
      return c.op === 'empty' ? absent : !absent;
    }

    /**
     * WHAT A LIST HOLDS, AND IT IS THE ELEMENTS RATHER THAN THE LINE THEY PRINT AS.
     *
     * `formsOf` below reads a list through `display()`, which is `listLine`: the elements joined with
     * a comma and a space, with the record's own tags left out. That is the right string for a cell
     * and the wrong one for a question — a row holding two repositories would answer `has` on neither
     * of them and on the joined line nobody wrote. So this reads the array itself, one element at a
     * time, and the clause carries the element as the column stores it.
     *
     * `String(v)` BECAUSE A LIST IS NOT ALL TEXT. A `list<ref>` in this mirror holds the target's
     * `seq` as a number and a `list<bool>` holds a boolean, and `elementValue` resolved the written
     * word to the same spelling; comparing the two as strings is what makes one comparison serve
     * every element type. Case-sensitively, which is what the record does: `json_each.value = ?` is
     * not `NOCASE` and its evaluator compares with `===`, so `repos has Portage` finds no row.
     *
     * A ROW WITH NOTHING IN THE FIELD `lacks` EVERYTHING, which is the record's line for line:
     * `!Array.isArray(raw) || !raw.some(...)`. `has` is a positive operator and is false on it, and
     * the negation is where a person means "and the ones with none".
     */
    if (c.op === 'has' || c.op === 'lacks') {
      const wanted = elementWanted(w.register, c.field, c.values[0], now);
      const holds = Array.isArray(raw) && raw.some((v) => String(v) === wanted);
      return c.op === 'has' ? holds : !holds;
    }

    /* `'values' in c` rather than a check on `op`: the discriminant is spread across two literals
       per member, and the `in` operator narrows a union on the property that actually differs. */
    if ('values' in c) {
      const forms = formsOf(w.register, c.field, raw);
      const hit = c.values.map(norm).some((v) => forms.includes(v));
      return c.op === 'is' ? hit : !hit;
    }

    /* A missing date is not "before" anything. Counting it would put rows with no due date into an
       overdue list, which is a list somebody acts on.

       AND IT IS NOT THE NAMED DAY EITHER, so it IS in the negation. `34 §6`: every positive operator
       is false on a missing value, and `not` is how a person says "and the empty ones". That was the
       behaviour before `not on` existed, because `is not` went through the value branch where a row
       with nothing in the field matches no value and the negation therefore keeps it. */
    if (typeof raw !== 'string' || !raw) return c.op === 'not on';
    const day = resolveDay(c.day, now);
    if (day === null) return false;
    /* THE DAY THE VALUE FALLS ON, for all three. `before` and `after` are exclusive of the day named
       — `34 §6` — and `on` is the day itself, which is what makes `due before today or due is
       today` say what it looks like it says. An instant is compared by its date, because a person
       asking for today means the day and not the second. */
    const at = raw.slice(0, 10);
    return c.op === 'before' ? at < day : c.op === 'after' ? at > day : c.op === 'on' ? at === day : at !== day;
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
 * One element of a list clause as somebody would SAY it, from the element as the column holds it.
 *
 * THE ONE TYPE WHERE THOSE ARE DIFFERENT STRINGS IS `list<ref>`, and it is `elementValue` read
 * backwards: a ref element resolves to the target row's `seq` here and to a ULID in the record, and
 * neither is a word anybody types. Every other element type resolves to the characters that were
 * written, or to a temporal word this file deliberately leaves alone, so they are already spoken.
 *
 * A TITLE THAT NO LONGER NAMES A ROW KEEPS THE ELEMENT rather than becoming an empty chip: a URL
 * carrying a number that refuses on arrival is a worse answer than one carrying the number, and
 * `registerHref`'s callers would have no way to tell either from a filter that worked.
 */
const spokenElement = (register: string, field: string, held: string): string => {
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
  if (decl?.of !== 'ref' || !decl.to) return held;
  const title = REGISTERS[decl.to]?.title;
  const said = title ? (ROWS[decl.to] ?? []).find((e) => String(e.seq) === held)?.fields[title] : undefined;
  return typeof said === 'string' && said ? said : held;
};

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
  /**
   * AN ABSENCE TRAVELS AS THE SENTENCE THAT SAYS IT: `<field>:is:empty` and `<field>:is:set`.
   *
   * THE OPERATOR IS TESTED FIRST AND THE SHAPE SECOND, because an absence clause carries
   * `values: []` for the reader in `metrics.ts`, and `'values' in c` would send it down the value
   * branch to print as `points_at:in:` with nothing after the colon: a chip naming no value.
   *
   * The chip parser splits on colons with no operator check and `whereOf` turns every chip back
   * into a sentence, so `f=points_at:is:empty` arrives at this compiler as `points_at is empty`
   * and means what it said. Minting a chip operator instead, say `points_at:empty:true`, would
   * have come back through `whereOf`'s fallback as `points_at is true`: a link that reads as the
   * filter it came from and opens a different list, which is the failure `registerHref` exists to
   * prevent. A URL a page can write and the register cannot read is the two languages again, one
   * address along.
   */
  /**
   * AND A CLAUSE ABOUT A LIST IS A CHIP NOW, WHICH IT WAS NOT WHEN THIS FUNCTION WAS WRITTEN.
   *
   * It returned the bare register for any predicate carrying `has` or `lacks`, and the reason was
   * true at the time: `whereOf` in `api.ts` read four operators back out of a chip, `in`, `not-in`,
   * `before` and `after`, with everything else falling through to `<field> is <value>`, so a minted
   * `repos:has:portage` came back as `repos is portage`, which both engines refuse. The link would
   * have opened an empty grid under a block that had drawn three rows.
   *
   * `0ea5061b` BUILT THE READER, so the guard outlived its reason. `whereOf` reads `has` and `lacks`,
   * and `chipsOf` splits a chip at the first two colons rather than at every one, which is what a
   * list element needs: `people.handles` holds `git:jokonkwo` and `tools.needs` holds
   * `header:Authorization=credentials#1`. A block filtered on a list now hands over the rows it
   * drew instead of the whole register, which is this function's own rule rather than an exception
   * to it.
   *
   * THE ELEMENT TRAVELS AS SOMEBODY WOULD WRITE IT, which is the one place this differs from the
   * value branch below. `elementValue` resolves a `list<ref>` element to the target row's `seq`, so
   * the compiled clause holds a number where the sentence held a name, and `projects:has:1` comes
   * back as `projects has 1`: refused by both engines, because no chip could carry `has` when that
   * was decided and so the record refuses `because has 4` with *"there is no learnings called 4"*.
   * The title is what both engines read, so the title is what the URL carries.
   */
  const chips = w.clauses.map((c) =>
    c.op === 'empty' || c.op === 'present'
      ? `${c.field}:is:${c.op === 'empty' ? 'empty' : 'set'}`
      : c.op === 'has' || c.op === 'lacks'
        ? `${c.field}:${c.op}:${encodeURIComponent(spokenElement(register, c.field, c.values[0]))}`
        : 'values' in c
          ? `${c.field}:${c.op === 'is not' ? 'not-in' : 'in'}:${c.values
              .map((v) => encodeURIComponent(declaredValue(register, c.field, v)))
              .join(',')}`
          : /**
             * AND `not on` IS SPELLED `not-on`, BECAUSE IT WENT OUT AS THE OPERATOR AND CAME BACK AS
             * ITS OWN COMPLEMENT.
             *
             * `due is not today` compiles to `{op: 'not on'}` and this line wrote the operator
             * verbatim: `f=due:not on:today`, a raw space in a URL. `whereOf` does not read `not on`,
             * so the chip fell to its last line and came back `due is today`. Measured on the shipped
             * mirror: the sentence admits all 40 obligations and the chip it minted drew 0 of them,
             * because nothing there is due today. A filter that quietly inverts is the one failure
             * this module exists to prevent.
             *
             * NO BLOCK THE MIRROR DECLARES NEGATES A DATED FIELD, which is why nobody had met it and
             * is not a reason to leave it. All twelve negating predicates in `PAGES` negate an enum,
             * and those mint `not-in` and have always read back, so the inversion was waiting for the
             * first block, tile or metric whose predicate says `is not` about a day.
             *
             * `not-on` RATHER THAN A NEW SHAPE, because `not-in` is already this file's spelling for
             * the negation of a value clause, and `whereOf` reads the two the same way.
             */
            `${c.field}:${c.op === 'not on' ? 'not-on' : c.op}:${encodeURIComponent(c.day)}`,
  );
  return chips.length ? `/r/${register}?${chips.map((f) => `f=${f}`).join('&')}` : `/r/${register}`;
}
