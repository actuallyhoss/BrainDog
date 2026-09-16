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
 *     points at is empty                the field holds nothing: no value, '' or []
 *     points at is set                  and it holds something. `is not empty` is the second of
 *                                       those two and `is not set` is the first
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
   * Two readers outside this file test the SHAPE rather than the operator, and `metrics.ts`'s
   * `resolvedAt` is the one that matters: `'values' in c ? c : { ...c, day: resolveDay(c.day) }`
   * reads a clause with no `values` as a dated one and would go looking for a day this clause does
   * not have. A question about absence has nothing to compare against, so `[]` is the true answer
   * and it keeps that reader correct: an absence clause does not move when the clock does.
   *
   * NOTHING MAY READ IT AS "IS ONE OF NOTHING". The value branch of `matches` answers false to
   * that on every row and its negation true on every row, which is the clause that quietly matches
   * everything, so both readers here test the OPERATOR first and the shape second.
   */
  | { field: string; op: 'empty' | 'present'; values: [] };

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
const CLAUSE = /^\s*([a-z][a-z0-9_ ]*?)\s+(is not|is|before|after)\s+(.+?)\s*$/i;

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

const cannotSay = (text: string): string =>
  `${text}: that is not something a filter can say. Write is, is not, before or after.`;

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
    const [, name, said, rest] = m as unknown as [string, string, string, string];
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

    if (op === 'before' || op === 'after') {
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
       */
      if (!dated) {
        bad.push(`${text}: ${field} is a ${decl?.type ?? 'field'}, and ${op} is about dates`);
        continue;
      }
      const word = rest.trim();
      if (resolveDay(word, Date.now()) === null) {
        bad.push(`${text}: ${word} is not a date`);
        continue;
      }
      clauses.push({ field, op, day: word });
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
        `${text}: "${UNIMPLEMENTED.filter((w) => reach.toLowerCase().startsWith(w)).sort((a, b) => b.length - a.length)[0]}" is not an operator this build reads. It reads is · is not · before · after`,
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
  const chips = w.clauses.map((c) =>
    c.op === 'empty' || c.op === 'present'
      ? `${c.field}:is:${c.op === 'empty' ? 'empty' : 'set'}`
      : 'values' in c
        ? `${c.field}:${c.op === 'is not' ? 'not-in' : 'in'}:${c.values
            .map((v) => encodeURIComponent(declaredValue(register, c.field, v)))
            .join(',')}`
        : `${c.field}:${c.op}:${encodeURIComponent(c.day)}`,
  );
  return chips.length ? `/r/${register}?${chips.map((f) => `f=${f}`).join('&')}` : `/r/${register}`;
}
