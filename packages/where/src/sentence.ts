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
 *     renews before eom                 also bow, bom, boy, eoy, tomorrow, yesterday
 *     points at is empty                the field holds nothing: no value, '' or []
 *     points at is set                  and it holds something. `is not empty` is the second of
 *                                       those two and `is not set` is the first
 *     tags has urgent                   a LIST holds the value
 *     tags lacks urgent                 and it does not. `has not` is the second of those two
 *     what contains uber                a TEXT holds the words, in any case
 *     what contains "uber or lyft"      quoted, the text is taken exactly as written
 *     state is live, cycle is monthly   clauses are ANDed on the comma
 *     state is open, or due before today   and ORed on a comma and `or`; never both in one sentence
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

import { addressable, KERNEL_FIELDS, operatorAllowed, type FieldSpec, type Predicate, type Schema } from './index.ts';

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/* THREE UNITS, WHICH IS WHAT `34 §1.1`'s EBNF HAS: `unit = "d" | "w" | "m"`. This read `y` and the
   browser's compiler read three, so `renews before +2y` was refused on screen and resolved to a real
   date two years out by the parser the MCP surface and every agent talk to — a fourth spelling in
   the grammar of one of the two implementations, in neither document. */
const RELATIVE = /^([+-])(\d{1,4})([dwm])$/;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** A row id, which a ref keeps as written. The kernel's `coerce` reads the same shape. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The temporal literals `02-DATA-MODEL` §6 settled on. Not a set invented here. */
const WORDS = ['today', 'tomorrow', 'yesterday', 'bow', 'bom', 'eom', 'boy', 'eoy'] as const;

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
   * AND THE SAME DAY WRITTEN THE WAY A SCREEN WRITES IT.
   *
   * Every declared page prints its filter as a sentence, and `+90d` is a machine duration nobody
   * types or says, so the printer turns it into "90 days from now". That sentence is the record's
   * own restatement of the declaration — what somebody reads when they ask what a page filters on,
   * and what an agent copies when it asks the same question.
   *
   * IT WAS TAUGHT TO ONE OF THE TWO PARSERS. The browser's compiler learned it and this one, which
   * is what the MCP surface and every agent actually talk to, went on answering `null` — so the two
   * `where` implementations disagreed in a NEW direction one commit after they were fixed for
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
   * The ids of the rows in `register` whose title is `title`, or `null`.
   *
   * A REF IS WRITTEN BY NAME because that is what a person says: "thing is Kiln", never
   * "thing is things#1". The lookup is a callback rather than a table here so this package stays
   * free of the kernel.
   *
   * AND EVERY ROW BEARING IT, WHEN MORE THAN ONE DOES. The kernel's lookup was `LIMIT 1` with no
   * order, so over two rows titled Kiln `thing is Kiln` answered the first Kiln's two jobs and left
   * the second Kiln's job out without a word. A
   * single id is still an answer, so a caller that knows titles are unique need not build a list.
   */
  refByTitle?: (register: string, title: string) => string | readonly string[] | null;
  /**
   * The register a row id's row is on, deleted or purged, or `null` when no row ever held it.
   *
   * ABSENT IS THE OLD TRUST, where a row id went through unread: a context that has no rows to ask
   * (a test's page deps) cannot tell a real id from a made-up one. The kernel gives it, because an
   * id naming no row answered `ok 0` in both forms and a row of another list did the same, where a
   * spoken id for either is refused.
   */
  refById?: (id: string) => string | null;
  /**
   * Whether the caller may read this register. Absent is everything, which is the owner and a rule.
   *
   * A REF INTO A LIST SHE CANNOT READ IS NOT LOOKED UP AT ALL. Looking it up and answering `ok 0`
   * for a row that exists and `REF_UNKNOWN` for one that does not confirmed a hidden title and
   * counted the hidden list by halving on `clients#N`, measured at three rows in ten asks; the
   * mismatch refusal named a list she was never shown. `get` answers `null` for a hidden row and an
   * absent one alike, and this is the same rule: every word names no row, and nothing is refused.
   */
  reads?: (register: string) => boolean;
  /**
   * What a ref naming no row does: refuse (`REF_UNKNOWN`, the default) or match no row.
   *
   * A RULE EVALUATING A ROW ASKS FOR THE SECOND. It installs over a row nobody has written yet, on
   * purpose, and then every evaluation refused, and `matches` reads any refusal as "fires on nothing".
   * For `is` that happens to be right. For `thing is not Launch` it is the opposite of the truth, since
   * no row is on Launch, and one unwritten member of `in [Kiln, Launch]` silenced the Kiln it named.
   */
  absent?: 'refuse' | 'no-row';
  /**
   * The register an id names and the row it holds, or `null` when the words are not an id.
   *
   * AND AN AGENT SAYS `thing is things#1`, because that is the id `context` and every `list` answer
   * hand it. The paragraph above was right about a person and wrong about the caller who writes most
   * of these: measured over the seed, `thing is things#1` was refused `REF_UNKNOWN`, "there is no
   * things called things#1", on the one project an agent had just been told was things#1.
   */
  refBySpoken?: (said: string) => { register: string; id: string | null } | null;
};

export type Parsed = { predicate: Predicate | undefined; bad: Refusal[] };

/**
 * A value no ref field holds, standing for "the words named no row" where that is not a refusal.
 *
 * A REF FIELD HOLDS A ROW ID AND NOTHING ELSE, since `coerce` turns every spoken id into one and
 * refuses every other string, so a value that cannot be a row id equals no row's field. `is` and
 * `in` then drop it and `not`, `not_in` and `lacks` hold, which is what a row that is not there
 * means, and `compile` is handed an ordinary value rather than an empty `in` it refuses.
 */
export const NO_ROW = '(no row)';

/** What a ref's words named: the rows, nothing at all, or a row of the list in `mismatch`. */
export type RefFound = { ids: string[] } | { unknown: true } | { mismatch: string };

/**
 * The rows a ref's words name, read the one way the sentence and the kernel's tree both read it.
 *
 * IT LIVES HERE AND THE KERNEL IMPORTS IT because two copies of this order were how the two forms
 * disagreed: the sentence refused a row id as a title while the tree kept it, and then the tree
 * refused what the sentence resolved. A row id first, then a spoken id in the list it names, then
 * the title in the list the field points at, and a refusal only once all three have missed.
 *
 * A DELETED ROW IS A ROW HERE. Its jobs still point at it, and `nameOf` names it `P6` in every
 * `context` an agent reads, so refusing `P6` and `Gone` while its row id found the orphan (`ok 1`)
 * gave three answers about one row. The lookups the kernel hands in include deleted rows for that.
 */
export function lookupRef(to: string | undefined, raw: string, deps: Omit<SentenceDeps, 'nowMs'>): RefFound {
  const said = raw.trim();
  const readable = (register: string) => deps.reads === undefined || deps.reads(register);
  const nothing = (): RefFound => (deps.absent === 'no-row' ? { ids: [NO_ROW] } : { unknown: true });

  /* NOT LOOKED UP, AND THE ROW ID KEPT: she was handed it on a row she can read, and `get` of it
     would answer `null` whether the row exists or not, so keeping it tells her nothing new. */
  if (to !== undefined && !readable(to)) return { ids: [ROW_ID.test(said) ? said : NO_ROW] };

  if (ROW_ID.test(said)) {
    if (deps.refById === undefined) return { ids: [said] };
    const on = deps.refById(said);
    /* A row on a list the caller cannot read is no row to her, for the reason above. */
    if (on === null || !readable(on)) return nothing();
    return to === undefined || on === to ? { ids: [said] } : { mismatch: on };
  }

  const found = deps.refBySpoken?.(said) ?? null;
  /* A SPOKEN ID INTO A LIST SHE CANNOT READ IS WORDS, not an id: `diary#1` answered a mismatch
     naming Diary where `nosuchlist#1` answered `REF_UNKNOWN`, which says which lists exist. */
  const spoken = found !== null && readable(found.register) ? found : null;
  if (spoken && spoken.id !== null && (to === undefined || spoken.register === to)) return { ids: [spoken.id] };

  /**
   * EVERY ROW BEARING THE TITLE, AND NOT A REFUSAL. The rule `link` action one file over takes
   * exactly one match or links nothing, and a write has to: storing one of two Kilns is a wrong
   * row nobody sees. A filter is a read, and both Kilns' jobs, each carrying its own row id, is the
   * whole of what `thing is Kiln` can mean; a refusal would need a code the registry does not have
   * and would leave the second Kiln unfilterable by its name. So `is` reads as `in` over both.
   */
  const titled = to === undefined ? null : (deps.refByTitle?.(to, said) ?? null);
  const ids = titled === null ? [] : typeof titled === 'string' ? [titled] : [...new Set(titled)];
  if (ids.length) return { ids };
  if (spoken && to !== undefined && spoken.register !== to) return { mismatch: spoken.register };
  return nothing();
}

/** Ordered comparisons, in the words the grammar uses. */
const ORDERED: Record<string, string> = { before: 'before', after: 'after', on: 'is' };

/**
 * `is empty` AND `is set`: the two operators the structured form has always had and this could not say.
 *
 * `38 §2.1` publishes `empty` and `present` among the nineteen, `compile` carries a `case` for each
 * and `evaluate` answers both, so `{field: 'points_at', empty: true}` was a filter a person could
 * write in JSON and could not write in the words the pages, the register's own filter chips and
 * every `where:` in the seed are written in. That is this file's own header read from the other
 * side: not a sentence that drifts from the predicate, but a predicate no sentence reaches. The
 * estate page carries a warn note headed "Points at nothing" whose gate counts the lapsing services
 * instead, because the set it means, a service whose `points_at` holds nothing, could not be said.
 *
 * `set` IS THE READER'S WORD AND `present` IS THE FORMAT'S, and `19 §9` takes the reader's: a
 * person asks whether a field is set, and `present` is the JSON talking about itself. Both are
 * accepted here, because an agent reading `38 §2.1` writes the word it read there, and a sentence
 * the documentation teaches and the parser refuses is the same two languages one layer up. `set` is
 * the word the refusals name and the word a page prints back.
 */
const ABSENCE: Record<string, 'empty' | 'present'> = { empty: 'empty', set: 'present', present: 'present' };

/**
 * And the negation INVERTS, because a negation that does not is the defect this file has been
 * bitten by twice: `due is not today` compiled to the clause `due is today` when `is not` fell
 * through to the branch beside it, and a bare trailing `not` became a search for the word. `is not
 * empty` is `present` and `is not set` is `empty`, and a clause that answers the opposite of the
 * question is worse than one that refuses.
 */
const INVERSE = { empty: 'present', present: 'empty' } as const;

/**
 * `has` AND `lacks`: the two operators ONLY a list takes, and the two no sentence could say.
 *
 * `38 §2.1` publishes both among the nineteen, `operatorAllowed` admits them on `list` and on no
 * other type, `compile` carries a `case` for each and `evaluate` answers both. So every list field
 * in the record was filterable in JSON and unreachable from the words the pages, the register's own
 * filter chips and every `where:` in the seed are written in. That is this file's header read from the
 * other side, for the one type where `is`, `not`, `in` and `not_in` are all refused. A list field
 * could be asked whether it holds ANYTHING and never what it holds.
 *
 * THE WORDS ARE THE OPERATORS' OWN. `before` and `after` are already shared verbatim between the
 * two surfaces, and `has` and `lacks` are ordinary English before they are anything else, so there
 * is nothing to translate in either direction and nothing for a printer to choose. `contains` was
 * the other candidate and is the one word that may not be used: it is already one of the nineteen,
 * meaning a substring of a text, and one word with two meanings decided by the field's type is the
 * ambiguity a person reading a sentence back cannot resolve.
 */
const LISTED: Record<string, 'has' | 'lacks'> = { has: 'has', lacks: 'lacks' };

/**
 * The element types this grammar has no literal for.
 *
 * `34 §1.1` gives eighteen field types and four of them are compound values rather than words. They
 * are named here rather than derived from "what `resolve` handles" because the two sets are not the
 * same: `text`, `document`, `url` and `email` also fall past every branch of `resolve`, and for them
 * the typed characters ARE the stored value. A list is the one place the difference shows, because
 * `elementSql` binds anything at all and never asks what the element is.
 */
const COMPOUND = new Set(['money', 'quantity', 'file', 'json']);

/** And the negation inverts, for the reason the one above it does. `has not` is `lacks`. */
const OPPOSITE = { has: 'lacks', lacks: 'has' } as const;

/**
 * The pairs of marks a `contains` text may be quoted in: straight, and the curly pair a phone types.
 *
 * iOS turns a typed `"` into `“` and `”` unless smart punctuation is switched off, so a person
 * quoting from a phone sends the curly pair and never the straight one. Refusing it would have made
 * quoting a desktop feature on the form written most often from a thumb.
 */
const QUOTES: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
];

/**
 * Where a quote opening at `at` closes, the index just past its closing mark, or `-1` when nothing opens there.
 *
 * A MARK OPENS A QUOTE ONLY AT THE START OF A WORD, after a space, a comma or nothing, so the apostrophe in `McDonald's`
 * opens nothing. It closes at the first matching mark followed by nothing but spaces before a comma or the end: that is
 * the one place a quoted value can end, so a comma inside the marks is the value's and not the sentence's. A mark that
 * never closes that way opens nothing either, and the comma after it ends the clause as it always did.
 *
 * A CLOSING MARK WRITTEN TWICE IS ONE MARK OF THE VALUE AND CLOSES NOTHING, read left to right, so `"a"", b"` is the one
 * value `a", b`. Without it a value holding all four closing marks, each followed by a space, a comma or its end, had no
 * pair that could hold it, and `' ” ’ ", or state is open, or what is x` filled into a template's `what is {{what}}` read
 * as three conditions, one of them `state is open`: a one-row page drew all 24 open obligations on the seed.
 * `quoteValue` doubles only for such a value, and `unquoted` reads
 * the doubling by this same rule, so the cut and the value can never disagree about where a quote ends.
 */
function quoteEnd(text: string, at: number): number {
  const pair = QUOTES.find(([open]) => text.startsWith(open, at));
  if (!pair || (at > 0 && !/[\s,]/.test(text[at - 1]!))) return -1;
  const [open, close] = pair;
  for (let shut = text.indexOf(close, at + open.length); shut !== -1; ) {
    if (text.startsWith(close, shut + close.length)) {
      shut = text.indexOf(close, shut + 2 * close.length);
      continue;
    }
    if (/^\s*(?:,|$)/.test(text.slice(shut + close.length))) return shut + close.length;
    shut = text.indexOf(close, shut + close.length);
  }
  return -1;
}

/**
 * A sentence cut on its commas, and not on a comma inside a quoted value.
 *
 * EXPORTED BECAUSE THE KERNEL CUTS SENTENCES TOO: a figure's scope is the clauses its parameter fills (`scopeOf` in
 * `packages/kernel/src/pages.ts`), and a cut made there on every comma would be a second reading of this grammar.
 */
export function clausesOf(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ',') {
      out.push(text.slice(from, i));
      from = i + 1;
      continue;
    }
    const end = quoteEnd(text, i);
    if (end > 0) i = end - 1;
  }
  out.push(text.slice(from));
  return out;
}

/**
 * The words after a clause's verb, as typed, and what is inside them when they are one quoted value.
 *
 * AS TYPED, as `contains` reads its text: the words re-joined with one space would lose a run of spaces the value holds.
 * WHOLLY QUOTED means the marks open at the first character and close at the last, by the rule `quoteEnd` cuts clauses
 * with, so `"a" or "b"` is not one value between its outer marks. Anything else is `null`, and the value is read as
 * bare words exactly as it was before quoting was read here.
 */
function quotedAfter(sentence: string, after: number, negated: boolean): string | null {
  const typed = sentence
    .split(/(\s+)/)
    .slice(2 * (after + 1))
    .join('');
  return unquoted((negated ? typed.replace(/^not/i, '') : typed).trim());
}

/**
 * What is inside a value that is one quoted value, or `null` when it is not one: the marks open at its first character
 * and close at its last, and no closing mark inside is followed by a space. A closing mark written twice inside is
 * one mark of the value (`quoteEnd` has why), and is handed back once.
 *
 * EXPORTED FOR THE BROWSER'S ENGINE (`apps/web/src/lib/record/where.ts`), which reads the same sentences over its own
 * rows and would otherwise hold a second copy of where a quote closes.
 */
export function unquoted(value: string): string | null {
  const pair = QUOTES.find(([open, close]) => value.length >= open.length + close.length && value.startsWith(open) && value.endsWith(close));
  if (!pair) return null;
  const [open, close] = pair;
  let inside = '';
  for (let at = open.length; at < value.length; ) {
    if (!value.startsWith(close, at)) {
      inside += value[at];
      at += 1;
    } else if (value.startsWith(close, at + close.length)) {
      inside += close;
      at += 2 * close.length;
    } else if (at + close.length === value.length) {
      return inside;
    } else if (/^\s/.test(value.slice(at + close.length))) {
      return null;
    } else {
      inside += close;
      at += close.length;
    }
  }
  /* THE LAST MARK WENT INTO A DOUBLED PAIR, so nothing closed the quote, which is what `quoteEnd` says of it too. */
  return null;
}

/**
 * The words the grammar reads for itself at the start of a value: a negation, an absence, an order.
 *
 * AND `in`, `starts` AND `ends`, WHICH ONLY THE BROWSER READS THERE. `apps/web/src/lib/record/where.ts` names them as
 * operators it does not read, so it refused `what is in stock` with *"in" is not an operator this build reads* while
 * the kernel matched the text: 3,445 of a fuzz run's disagreements were this one rule.
 * Quoted, both engines read the words as the value.
 */
const GRAMMAR_START = /^(?:not|empty|set|present|between|in|starts|ends|(?:more|less)\s+than|at\s+(?:least|most))(?:\s|$)/i;

/**
 * A value written into a sentence so the grammar reads it back as exactly that one value.
 *
 * BARE WHERE THE BARE WORDS ALREADY DO: no comma, no quote mark, no word `or`, no space but single ones (the bare words are re-joined with one), no space at either end,
 * and no word the grammar reads for itself at the start. Everything a page prints today is one of those, so a filter
 * that was `part is The box` stays that. Anything else is quoted, in the first pair of marks whose closing mark the value
 * never follows with a space, a comma, its end or the same mark again, since the first three are where a quote can close
 * (`quoteEnd`, `quotedAfter`) and the fourth is the escape. A value holding every closing mark in such a place has no
 * pair that holds it, and is written in the straight pair with each `"` doubled.
 *
 * TOTAL, AND THE FUZZ IS WHAT SAYS SO. It used to write that last value in the straight pair as it stood, and the
 * grammar closed the quote at the first `"` (`quoteEnd` has what that did to a template page). The empty string is
 * written `""`, which both engines refuse as a quote holding nothing, so it is the one value refused rather than read.
 * `test/sentence-quote-total.test.ts` builds 20,000 values from quote marks, commas, grammar words and whitespace and
 * asks each back through `clausesOf` and `parseWhere`: before the escape 1,671 of them did not read back as themselves,
 * and none fails now. `apps/web/src/lib/record/where-compare.test.ts` asks the browser's engine the same.
 *
 * FOR A TEMPLATE: `fill` in `packages/kernel/src/pages.ts` writes a row's field into a block's `where` through this, so a
 * part called `Wax, wick and scent` filters its own page rather than refusing it.
 */
export function quoteValue(value: string): string {
  const bare =
    value !== '' &&
    value === value.trim() &&
    !/\s\s|[^\S ]/.test(value) &&
    !/[,"'“”‘’]/.test(value.replace(/(\w)[’'](\w)/g, '$1$2')) &&
    !/(?:^|\s)or(?:\s|$)/i.test(value) &&
    !GRAMMAR_START.test(value);
  if (bare) return value;
  const fits = ([, close]: readonly [string, string]): boolean => {
    for (let at = value.indexOf(close); at !== -1; at = value.indexOf(close, at + 1)) {
      const after = value.slice(at + close.length);
      if (/^(?:[\s,]|$)/.test(after) || after.startsWith(close)) return false;
    }
    return true;
  };
  const pair = QUOTES.find(fits);
  if (pair) return pair[0] + value + pair[1];
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * The types `contains` is refused on in a sentence though `operatorAllowed` admits it.
 *
 * THE STRUCTURED TABLE SAYS YES AND THE COLUMN SAYS NO. `38 §4.3` puts `enum` and `ref` among the
 * textual types, which is right about the column: both hold a string, and `instr` runs over it. But
 * a sentence carries the words a SCREEN shows, and on these two the words are not what the column
 * holds. `thing contains Kiln` hands `instr` a column of row ids and the four letters of a title,
 * and `state contains owed to me` looks for spaces in `owed_to_me`. Both compile, both run, both
 * match nothing for ever, which is the failure this file's header is written against. The JSON form
 * keeps the operator for a caller who knows the stored value; the sentence refuses and names `is`,
 * which already reads both types in their words.
 *
 * A `secret` IS THE THIRD, and the worst of them.
 * Its column holds the id of a grant in the vault, never the secret, and `TEXTUAL` no longer admits it,
 * so the JSON form refuses the same question.
 * `token contains a` compiled to `{ field: token, contains: a }` and a kernel `list` answered `ok`,
 * matching or missing rows on the letters of an id nobody is shown. It has no `is` to be pointed
 * at either, since `is` would compare the same id, so its refusal names `is set` and `is empty`,
 * the two questions a sealed field can answer.
 */
const SPOKEN_AS_NOT_STORED = new Set(['enum', 'ref', 'secret']);

/** What each of those holds instead of the words, and the question the sentence can ask of it. */
const HELD_INSTEAD: Record<string, string> = {
  enum: 'It holds a declared value, not the words shown for it. Write is, which reads it in those words.',
  ref: 'It holds a row id, not the words shown for it. Write is, which reads it in those words.',
  secret: 'It holds the id of a grant in the vault, not the secret, and a filter never reads the secret. Write is set or is empty.',
};

/**
 * `more than`, `at least`, `less than`, `at most` and `between`: the five words for the five ordered
 * operators, and the ones no sentence could say.
 *
 * `compile` and `evaluate` have answered `gt gte lt lte between` since the grammar was written, and
 * `operatorAllowed` orders seven types by them. Measured through a kernel
 * `list`: `n is at least 100` over an `int` was `VALUE_MALFORMED`, the
 * words handed to `resolve` as the value of an `is`; `n more than 100` and `n between 1 and 5` were
 * `MATCH_OP_UNSUPPORTED`; and over a `money` field the first came back `MONEY_LITERAL_NEEDS_CURRENCY`
 * for a sentence that had never got as far as a number. So "is this bill past a hundred pounds", the
 * question a number is asked most, was the one a page, a rule's `when:` and a step's `if` could not
 * put, and `kernel/src/figure.ts` records a flow step failing on exactly this.
 *
 * THE WORDS ARE THE ONES THE APP ALREADY PRINTS the tree in: `slashOps` in the app's copy and the flow
 * canvas's `COMPARE` write `gte` as "is at least" and `between` as "is between X and Y". A clause a
 * screen prints from the tree has to read back as that tree, so `is` is taken before each word as
 * well as left out.
 */
const RANKED: Record<string, 'gt' | 'gte' | 'lt' | 'lte'> = { 'more than': 'gt', 'at least': 'gte', 'less than': 'lt', 'at most': 'lte' };

/**
 * The word for the other side of each, WHICH IS NOT THE NEGATION.
 *
 * `n is not at least 3` is every row under three AND every row with no `n`, since `34 §6` makes every
 * positive operator false on a missing value and a negation true on it; `n less than 3` is the first
 * half only. Compiling one as the other drops the empty rows without a word, so the sentence refuses
 * and names the word that asks for the other side, saying what it leaves out.
 */
const OTHER_SIDE = { gt: 'at most', gte: 'less than', lt: 'at least', lte: 'more than' } as const;

/**
 * Minor-unit exponents, where a currency's is not two. `braindog-render`'s table and the kernel's
 * `ingest.ts` table, key for key.
 *
 * A THIRD COPY, AND THE COST OF `where ⇏ kernel`. `EGP 100` in a sentence is what every screen here
 * prints for `{ amount: 10000, currency: 'EGP' }`, so the literal is read in the currency's own units
 * and the exponent turns it into the minor units the column holds. `Intl`'s digits are CLDR's and
 * give `IQD` 0 where ISO gives 3 (`kernel/src/coerce.ts` has the argument), so the runtime cannot
 * stand in for the table. `test/sentence-compare.test.ts` holds this against the kernel's, which the
 * kernel's own tests hold against the renderer's: a copy is only a copy while something compares it.
 */
export const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

/** The list `coerce` checks a currency against, so a filter and a write agree on what one is. */
const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
/* THE CODE AT EITHER END, because `GBP 960.00` is what every surface prints and `960.00 GBP` is how
   half the people who type one write it. A space between the two is optional. */
const MONEY_WORDS = /^([A-Za-z]{3})\s*([+-]?\d+(?:\.\d+)?)$|^([+-]?\d+(?:\.\d+)?)\s*([A-Za-z]{3})$/;
const QUANTITY_WORDS = /^([+-]?\d+(?:\.\d+)?)\s*(\D.*)$/;

type Ranked = { op: 'gt' | 'gte' | 'lt' | 'lte' | 'between'; word: string; negated: boolean; operand: string };

/**
 * The ordered word a clause's tail opens with, after an optional `is` or `is not`, or `null`.
 *
 * `tail` is every word after the field's name. The words are folded, as `before` and `after` are
 * not, because a page prints `is at least` and a person shouting it back in capitals means the same.
 */
function rankedOf(tail: readonly string[]): Ranked | null {
  const w = tail.map((t) => t.toLowerCase());
  let at = 0;
  let negated = false;
  if (w[0] === 'is') {
    at = 1;
    if (w[1] === 'not') {
      at = 2;
      negated = true;
    }
  }
  const pair = `${w[at] ?? ''} ${w[at + 1] ?? ''}`;
  if (Object.hasOwn(RANKED, pair)) return { op: RANKED[pair]!, word: pair, negated, operand: tail.slice(at + 2).join(' ') };
  if (w[at] === 'between') return { op: 'between', word: 'between', negated, operand: tail.slice(at + 1).join(' ') };
  return null;
}

/** A bound as the column holds it, or the refusal for the words that could not be one. */
type Bound = { value: string | number | { amount: number; currency: string } | { value: number; unit: string } } | { code: string; fix: string };

/**
 * One bound of an ordered clause, read in the type of the field it is compared with.
 *
 * A NUMBER IS READ AS `resolve` READS ONE for `is`, so `n at least 3` and `n is 3` accept the same
 * spellings; a day is `resolveDay`'s. A money and a quantity have no `is` literal in this grammar at
 * all, and these are theirs: the number with its currency or its unit, because `compile` refuses a
 * bare one (`MONEY_LITERAL_NEEDS_CURRENCY`, `QUANTITY_LITERAL_NEEDS_UNIT`) and would go on refusing
 * it after the words were taught. The refusal is given HERE, with the compiler's code, because a
 * rule's lint reads only what the parser says: a bare number that parsed would install a condition
 * `evaluate` answers false for ever.
 */
function boundOf(sentence: string, field: string, decl: FieldSpec, said: string, nowMs: number): Bound {
  const cannot = { code: 'VALUE_MALFORMED', fix: `${sentence}: ${said} is not a value ${field} can hold.` };
  switch (decl.type) {
    case 'int':
    case 'duration': {
      const n = Number(said);
      return /^[+-]?\d+$/.test(said) && Number.isSafeInteger(n) ? { value: n } : cannot;
    }
    case 'decimal': {
      const n = Number(said);
      return said.trim() !== '' && Number.isFinite(n) ? { value: n } : cannot;
    }
    case 'day':
    case 'instant': {
      const day = resolveDay(said, nowMs);
      return day === null
        ? { code: 'VALUE_MALFORMED', fix: `${sentence}: ${said} is not a date. Write 2026-10-01, +30d, or one of ${WORDS.join(', ')}.` }
        : { value: day };
    }
    case 'money': {
      if (NUMBER.test(said))
        return {
          code: 'MONEY_LITERAL_NEEDS_CURRENCY',
          fix: `${sentence}: ${field} is money, and ${said} with no currency is not an amount of money. Write it with its currency, as GBP 960.00.`,
        };
      const m = MONEY_WORDS.exec(said);
      if (!m) return cannot;
      const code = (m[1] ?? m[4] ?? '').toUpperCase();
      const written = m[2] ?? m[3] ?? '';
      if (!CURRENCIES.has(code)) return { code: 'CURRENCY_UNKNOWN', fix: `${sentence}: ${code} is not a currency ISO 4217 assigns.` };
      /* PRECISION PAST THE CURRENCY'S IS NOT A NUMBER IT HOLDS, which is `kernel/src/map.ts`'s rule for
         the same literal arriving from a feed: `JPY 12.5` is between two amounts a yen can be, and
         rounding to either answers a question nobody asked. */
      const places = EXPONENT[code] ?? 2;
      const minor = Number(written) * 10 ** places;
      if (Math.abs(minor - Math.round(minor)) > 1e-6)
        return { code: 'VALUE_MALFORMED', fix: `${sentence}: ${code} is counted to ${places} decimal places, and ${written} has more.` };
      if (!Number.isSafeInteger(Math.round(minor))) return cannot;
      return { value: { amount: Math.round(minor), currency: code } };
    }
    case 'quantity': {
      if (NUMBER.test(said))
        return {
          code: 'QUANTITY_LITERAL_NEEDS_UNIT',
          fix: `${sentence}: ${field} is a quantity, and ${said} with no unit is not one. Write it with its unit, as 5 kg.`,
        };
      const m = QUANTITY_WORDS.exec(said);
      return m ? { value: { value: Number(m[1]), unit: (m[2] ?? '').trim() } } : cannot;
    }
    default:
      return cannot;
  }
}

/** The number a bound is ordered by, which for a day is the day itself. */
const rankOf = (v: unknown): string | number =>
  typeof v === 'object' && v !== null ? ((v as { amount?: number; value?: number }).amount ?? (v as { value: number }).value) : (v as string | number);

/** The half of a compound bound that is not its number, or `null` for a plain one. */
const qualifierOf = (v: unknown): string | null =>
  typeof v === 'object' && v !== null ? ((v as { currency?: string }).currency ?? (v as { unit?: string }).unit ?? null) : null;

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

  const split = conditionsOf(filter);
  if ('fix' in split) return { predicate: undefined, bad: [{ code: 'VALUE_MALFORMED', fix: split.fix, at: 'where' }] };

  for (const { text: sentence, or } of split.conditions) {
    /* `or` WITH NOTHING AFTER IT asks for the condition, as `is` with nothing after it asks for the value. */
    if (or && !sentence) {
      bad.push({ code: 'REQUIRED_MISSING', fix: `${filter.trim()}: or what?`, at: 'where' });
      continue;
    }

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
    /**
     * AND THE RECORD'S OWN FIVE ARE FIELDS A SENTENCE MAY NAME.
     *
     * `created_at after -7d` is the whole reason `02 §6` makes them addressable without a
     * declaration, and it is a SENTENCE before it is a tree: it is what a person types into a
     * filter and what an agent writes into a `where:` string. The structured form learned them in
     * `index.ts` and this one did not, which would have left `list({ where: {field: 'created_at',
     * after: '-7d'} })` answering and `list({ where: 'created_at after -7d' })` refusing, from one
     * grammar with one register behind it. That is the second language this file's header is about.
     */
    let decl: FieldSpec | undefined = Object.hasOwn(
      schema.fields,
      field,
    )
      ? schema.fields[field]
      : Object.hasOwn(KERNEL_FIELDS, field)
        ? { type: KERNEL_FIELDS[field]! }
        : undefined;
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
        fix: `${sentence}: ${schema.register} has no field called ${field || '(nothing)'}.`,
        at: field,
        /* THE RECORD'S OWN FIVE ARE IN THE LIST TOO, which is `38 §6`'s sentence for this refusal
           and the reason `addressable` is exported: a suggestion list that omits them teaches an
           agent that they do not exist. */
        allowed: addressable(schema),
      });
      continue;
    }

    /* THE VERB FOLDED ONCE, as `rankedOf` folds the words after it and the browser's `compile` folds
       its operator. Only `rankedOf` folded, so `n IS more than 3` was `gt 3` while `what IS more than
       coffee` missed the `verb === 'is'` below and was refused as an order a text cannot be asked,
       and `n IS 3`, `state IS open` and `due BEFORE today` were refused "IS is not something a filter
       can say", naming the word the refusal then tells them to write. The browser drew rows for every
       one of them (`apps/web/src/lib/record/where.test.ts`, the shouted verb). */
    const verb = (words[after] ?? '').toLowerCase();
    const rest = words.slice(after + 1).join(' ');

    /* ── more than · at least · less than · at most · between ─────────────── */
    const ranked = rankedOf(words.slice(after));
    /**
     * THE DECLARED VALUES COME FIRST HERE TOO, for the reason the `is empty` branch below gives: an
     * enum free to declare `more_than_one` must not become unfilterable on that value because this
     * grammar learned a word. The bare form, `n more than 3`, was never anything but a refusal, so
     * only the `is` spelling is asked whether it names a value the field declares, and the words
     * asked are the ones after `is` or `is not`, so that the negation of a declared value is still
     * that negation.
     *
     * AND A FIELD NO ORDER APPLIES TO KEEPS THE WORDS AFTER `is` AS ITS VALUE, whatever they are.
     * The first version of this branch refused `what is more than coffee` over a text as an order a
     * text cannot be asked, and before the words were taught it was `{ field: 'what', is: 'more than
     * coffee' }`: a merchant or a note may begin with any words, so the grammar learning five of them
     * took a working filter away. Only an enum and a ref are asked what they declare, because a word
     * they do not declare is not a value they can hold either, and the order's refusal is the one
     * that says what was meant. Over a number, a money or a day the spelling is the order.
     */
    const isValue =
      ranked !== null && verb === 'is'
        ? decl.type === 'enum' || decl.type === 'ref'
          ? ![null, NO_ROW].includes(resolve(schema, field, decl, `${ranked.word} ${ranked.operand}`.trim(), deps) as string | null)
          : !operatorAllowed(ranked.op, decl.type)
        : false;
    if (ranked && !isValue) {
      const { op, word, negated, operand } = ranked;
      /* ASKED OF THE STRUCTURED COMPILER'S OWN TABLE, as `has` and `is empty` are, and with the code
         that table's refusal carries. `between` stands for all five: the table orders them together. */
      if (!operatorAllowed(op, decl.type)) {
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
          fix: `${sentence}: ${field} is a ${decl.type}, and ${word} is not something a ${decl.type} can be asked. Order is about numbers, money and dates.`,
          at: field,
        });
        continue;
      }
      if (negated) {
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
          fix:
            op === 'between'
              ? `${sentence}: a filter cannot say is not between.`
              : `${sentence}: a filter cannot say is not ${word}. ${field} ${OTHER_SIDE[op]} ${operand} asks for the other side, and leaves out the rows with no ${field}.`,
          at: field,
        });
        continue;
      }
      if (!operand.trim()) {
        bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: ${word} what?`, at: field });
        continue;
      }

      if (op !== 'between') {
        const bound = boundOf(sentence, field, decl, operand, deps.nowMs);
        if ('code' in bound) {
          bad.push({ ...bound, at: field });
          continue;
        }
        clauses.push({ field, [op]: bound.value } as Predicate);
        continue;
      }

      /* TWO VALUES JOINED BY `and`, AND NOTHING ELSE. `n between 1` or `n between 1 and` would
         otherwise hand `resolve` a word it has to refuse for the wrong reason. */
      const ends = operand.split(/\s+and\s+/i);
      if (ends.length !== 2 || ends.some((e) => !e.trim())) {
        bad.push({ code: 'VALUE_MALFORMED', fix: `${sentence}: between takes two values joined by and, the low value first.`, at: field });
        continue;
      }
      const lo = boundOf(sentence, field, decl, ends[0]!.trim(), deps.nowMs);
      const hi = boundOf(sentence, field, decl, ends[1]!.trim(), deps.nowMs);
      if ('code' in lo || 'code' in hi) {
        bad.push({ ...('code' in lo ? lo : (hi as { code: string; fix: string })), at: field });
        continue;
      }
      /* ONE CURRENCY AND ONE UNIT, with the codes `compile` and the metrics already give for it. */
      if (qualifierOf(lo.value) !== qualifierOf(hi.value)) {
        bad.push(
          decl.type === 'money'
            ? { code: 'MIXED_CURRENCY', fix: `${sentence}: between takes one currency, and this range has two.`, at: field }
            : { code: 'QUANTITY_MIXED_UNIT', fix: `${sentence}: between takes one unit, and this range has two.`, at: field },
        );
        continue;
      }
      /* LOW FIRST. `between 5 and 1` compiles in the tree and matches no row whatever the register
         holds: a clause that parses, runs and answers nothing, which this file is written against. */
      if (rankOf(lo.value) > rankOf(hi.value)) {
        bad.push({ code: 'VALUE_MALFORMED', fix: `${sentence}: between takes the low value first, and ${ends[0]!.trim()} is past ${ends[1]!.trim()}.`, at: field });
        continue;
      }
      /**
       * A RANGE OF DAYS IS SAID AS ITS TWO ENDS, NOT AS `between`, and an instant is why.
       *
       * `gte` and `lte` cut a stored instant to its day when the bound is a bare day (`asDay` in
       * `index.ts`), and `between` does not: it compares `2026-09-03T11:57:00.000Z` with `2026-09-03`,
       * which sorts after it, so `seen between 2026-09-01 and 2026-09-03` left out everything seen on
       * the third, in `compile` and `evaluate` alike (`sentence-compare.test.ts` measures it). The
       * two ends answer what the sentence says on an instant and are the same rows as `between` on a
       * day, so both dated types take them and a reader of either sees one shape.
       */
      clauses.push(
        decl.type === 'day' || decl.type === 'instant'
          ? ({ all: [{ field, gte: lo.value }, { field, lte: hi.value }] } as Predicate)
          : ({ field, between: [lo.value, hi.value] } as Predicate),
      );
      continue;
    }

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
          fix: `${sentence}: ${field} is a ${decl.type}, and ${verb} is about dates.`,
          at: field,
        });
        continue;
      }
      const day = resolveDay(rest, deps.nowMs);
      if (day === null) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence}: ${rest || '(nothing)'} is not a date. Write 2026-10-01, +30d, or one of ${WORDS.join(', ')}.`,
          at: field,
          allowed: WORDS,
        });
        continue;
      }
      clauses.push({ field, [verb === 'on' ? 'is' : verb]: day } as Predicate);
      continue;
    }

    /* ── has · lacks ─────────────────────────────────────────────────────── */
    if (Object.hasOwn(LISTED, verb)) {
      const asked = LISTED[verb]!;
      /* ASKED OF THE STRUCTURED COMPILER'S OWN TABLE rather than of a second one written here.
         `38 §4.3` is one relation over operators and types, and a relation kept in two places is
         two relations the day one is edited. `MATCH_OP_UNSUPPORTED` is the code that table's
         refusal already carries, in the sentence the `before` branch above already gives. */
      if (!operatorAllowed(asked, decl.type)) {
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
          fix: `${sentence}: ${field} is a ${decl.type}, and ${verb} is about lists.`,
          at: field,
        });
        continue;
      }

      /* `has not` READ THE SAME WAY `is not` IS, because somebody who learned one writes the other,
         and a trailing bare `not` is not a search for the word. It inverts both ways: a clause that
         answers the opposite of the question is worse than one that refuses. */
      /* FOLDED AS THE `is` BRANCH'S `not` IS, since the verb before it is folded: without it
         `tags HAS NOT x` became `has "NOT x"` and `tags HAS NOT` a search for a tag called `NOT`. */
      const no = /^not(?:\s|$)/i.test(rest);
      /* A QUOTED VALUE IS THE ONE VALUE LOOKED FOR, commas and `or` included (`quotedAfter`). */
      const quoted = quotedAfter(sentence, after, no);
      if (quoted === '') {
        bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: ${verb}${no ? ' not' : ''} what? The quotes hold nothing.`, at: field });
        continue;
      }
      const wanted = quoted ?? (no ? rest.slice(3) : rest).trim();
      if (!wanted) {
        bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: ${verb}${no ? ' not' : ''} what?`, at: field });
        continue;
      }

      /* AND `or` IS NOT READ HERE. The operator looks for ONE value in the list, so `tags has
         urgent or soon` would otherwise look for a tag literally called `urgent or soon`: a clause
         that parses, compiles and matches nothing, for ever, which is the failure this whole module
         is written against. Two questions are two clauses, and the refusal says so. */
      if (quoted === null && / or /i.test(wanted)) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence}: ${verb} takes one value to look for in the list. Write a clause for each.`,
          at: field,
        });
        continue;
      }

      /**
       * ASKED IN THE TYPE OF AN ELEMENT, BECAUSE THAT IS WHAT THE VALUE IS.
       *
       * `has` and `lacks` look for ONE value inside a list, so the word carries an element and not a
       * list. This passed `decl` straight down, and `decl.type` is `list` on every list there is, so
       * everything that was not a `list<enum>` fell through `resolve`'s last line and came back as
       * the raw word. `projects has Kiln` compiled to a search for the four letters `Kiln` in a
       * column holding `01ABCDEFGHJKMNPQRSTVWXYZ00`: parsed, compiled, matched nothing, for ever.
       * Four fields in the shipped seed are `list<ref>`. The scalar half already coerced — `thing is
       * Kiln` resolves to the id — so the two renderings of one grammar disagreed over one word.
       *
       * `values` BEFORE `of`, so nothing that works today changes. A `list<enum>` is declared
       * `of: 'enum', values: [...]`, and both readings send it to the same branch; a hand-written
       * schema that gives `values` and no `of` is the fixture form and stays an enum. A list with
       * neither is text, which is what it always was.
       */
      const element = { ...decl, type: decl.values ? 'enum' : (decl.of ?? 'text') };

      /* AND FOUR OF THE EIGHTEEN TYPES ARE NOT WORDS AT ALL, so they are refused rather than bound.
         A money is `{ amount, currency }`, a quantity is `{ value, unit }`, a file is
         `{ sha256, mime, bytes, name }` and a `json` is whatever was put there; none is stored as a
         bare string and this grammar has no literal for any of them. `elementSql` binds whatever
         `bind` will take, so `bag has GBP 10.00` over a `list<money>` compiled to real SQL
         comparing those characters against an object — the same silent nothing the element type
         above was added to stop, reached from the other end. The structured form is the way to ask
         until the literal exists, and the refusal says so rather than leaving somebody to work out
         why a filter that looks right returns an empty list. THE OPERATOR IT NAMES IS THE INVERTED
         one where the sentence inverted, so the structured form it hands back means what was
         asked: `lacks not` is `has`, and a refusal that teaches the opposite question teaches
         nothing. */
      if (COMPOUND.has(element.type)) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence}: ${field} is a list of ${element.type}, and this grammar has no way to write one. Ask for it in the structured form, as {"field": "${field}", "${no ? OPPOSITE[asked] : asked}": <the ${element.type}>}.`,
          at: field,
        });
        continue;
      }

      /* A BOOLEAN ELEMENT IS A BOOLEAN AND NOT THE WORD. `resolve` hands back `'true'` because the
         SCALAR half wants a string — `bind(value, 'bool')` turns it into the 1 the column holds. A
         list element is read by `json_each.type`, and `compile` asks for `'text'` when it is handed
         text, so the string would compile to a clause no JSON boolean can satisfy. */
      const held =
        element.type === 'bool'
          ? ({ true: true, yes: true, false: false, no: false }[wanted.toLowerCase()] ?? null)
          : resolve(schema, field, element, wanted, deps);
      if (held === null) {
        bad.push(refuseValue(sentence, schema, field, element, wanted, deps));
        continue;
      }
      /* TWO ROWS SHARING A TITLE ARE TWO ELEMENTS TO LOOK FOR: `has` either of them, `lacks` both. */
      const put = no ? OPPOSITE[asked]! : asked;
      clauses.push(
        Array.isArray(held)
          ? ({ [put === 'has' ? 'any' : 'all']: held.map((one) => ({ field, [put]: one })) } as Predicate)
          : ({ field, [put]: held } as Predicate),
      );
      continue;
    }

    /* ── contains ─────────────────────────────────────────────────────────── */
    /**
     * THE JSON FORM HAS RUN THIS LEAF ALL ALONG, AND THE SENTENCE REFUSED IT.
     *
     * Measured before this branch: `{field: what, contains:
     * UBER}` as a rule fired on "UBER *TRIP 1234" in either case, and a list over a `document` found
     * its row, while `what contains uber` answered `MATCH_OP_UNSUPPORTED`. The grid's search box
     * compiles every word it is given to this same leaf, so the one filter the record builds most
     * often was the one filter nobody could type into a page's `where:` or a rule's `when:`.
     *
     * IT EMITS `{ field, contains }` AND NOTHING ELSE, so the compiler's own checks still stand behind
     * it: `SERIES_HAS_NO_TEXT` on a series and the empty-needle refusal both come from there.
     */
    if (verb === 'contains') {
      if (!operatorAllowed('contains', decl.type) || SPOKEN_AS_NOT_STORED.has(decl.type)) {
        const instead =
          decl.type === 'list'
            ? ` Write has to ask for one value in a list.`
            : SPOKEN_AS_NOT_STORED.has(decl.type)
              ? ` ${HELD_INSTEAD[decl.type]}`
              : '';
        bad.push({ code: 'MATCH_OP_UNSUPPORTED', fix: `${sentence}: ${field} is a ${decl.type}, and contains is about text.${instead}`, at: field });
        continue;
      }

      /* THE TEXT AS TYPED, NOT AS RE-JOINED. `rest` is the words glued back with ONE space, so a run
         of spaces or a tab inside the text comes back as a single space. A single space survives
         either way (`" uber "` is `" uber "` from `rest` too; measured), but a bank pads its
         descriptors, and `"UBER   *TRIP"` read from `rest` searched for `UBER *TRIP`, which the
         row does not hold. Splitting with the separators kept gives every token its own whitespace. */
      const text = sentence
        .split(/(\s+)/)
        .slice(2 * (after + 1))
        .join('');

      /* A QUOTE THAT CLOSES AND THEN HAS MORE WORDS AFTER IT IS TWO TEXTS, NOT ONE HOLDING QUOTE MARKS.
         `what contains "uber" or "lyft"` starts and ends with a straight
         quote, so the pair below took everything between the outer two and searched for the one text
         `uber" or "lyft`, which no row holds: parsed, ran, matched nothing. A mark followed by a space
         is where the quote closed. One followed by a letter closes nothing, so `'Joe's cafe'` still
         reads whole; `'the Joneses' cat'` does not, and the refusal names the other kind of mark,
         which holds it. */
      const opened = QUOTES.find(([open]) => text.startsWith(open));
      if (opened) {
        const [open, close] = opened;
        let shut = text.indexOf(close, open.length);
        /* A DOUBLED MARK IS ONE MARK OF THE TEXT (`quoteEnd`), and is stepped over whole. */
        while (shut !== -1 && (text.startsWith(close, shut + close.length) || !/^\s/.test(text.slice(shut + close.length))))
          shut = text.indexOf(close, shut + (text.startsWith(close, shut + close.length) ? 2 : 1) * close.length);
        const more = shut === -1 ? '' : text.slice(shut + close.length).trim();
        if (more) {
          bad.push({
            code: 'VALUE_MALFORMED',
            fix: `${sentence}: the quote closes at ${text.slice(0, shut + close.length)} and ${more} comes after it. A condition looks for one text, so write two conditions, one for each; a comma between them asks for rows that hold both. If the mark is part of the text, quote the whole text with the other kind of mark.`,
            at: field,
          });
          continue;
        }
      }

      const pair = QUOTES.find(([open, close]) => text.length >= 2 && text.startsWith(open) && text.endsWith(close));

      if (pair) {
        /* A DOUBLED MARK INSIDE IS ONE MARK OF THE NEEDLE, read by `unquoted` as `is` reads it, so a value `quoteValue`
           had to double is looked for as itself. A last mark swallowed by a doubling closes nothing there; the text
           between the outer marks is kept for it, which is how it read before the escape. */
        const inside = unquoted(text) ?? text.slice(pair[0].length, text.length - pair[1].length);
        /* AN EMPTY NEEDLE IS IN EVERY ROW. SQLite's `instr` answers 1 for `''`, which is why
           `compile` refuses the literal; refused here too, with the sentence a person can act on. */
        if (!inside) {
          bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: contains what? The quotes hold nothing.`, at: field });
          continue;
        }
        clauses.push({ field, contains: inside } as Predicate);
        continue;
      }

      /* A QUOTE THAT OPENS AND NEVER CLOSES is refused rather than searched for with its mark. A comma inside closed
         marks no longer cuts the clause (`clausesOf`), so `what contains "Smith, J"` arrives whole; what arrives here
         is a mark nobody closed. A straight apostrophe is left alone, because `McDonald's` is bare text and `'` opens
         nothing in it; only a text that STARTS with a mark is read as quoted. */
      if (QUOTES.some(([open]) => text.startsWith(open))) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence}: the quote is not closed. Close it with the mark it opened with, and a comma inside the marks is part of the text; or ask in the structured form, as {"field": "${field}", "contains": "..."}.`,
          at: field,
        });
        continue;
      }

      const bare = text.trim();
      if (!bare) {
        bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: contains what?`, at: field });
        continue;
      }
      /* `not` AND `or` ARE THE GRAMMAR'S WORDS EVERYWHERE ELSE IN THIS FILE, and a bare text holding
         one would be searched for literally: `what contains not uber` would answer the rows that say
         "not uber", the opposite of what was meant, and `uber or lyft` would look for all three words
         in a row. Quoting says the words are text, so the refusal names the quote.
         IN ANY CASE, as the `or` check below it always was: `what contains
         not uber` was refused while `what contains Not uber` compiled to the text `Not uber` and
         answered the rows that say it, the opposite of what was meant, from one capital letter. */
      if (/^not(\s|$)/i.test(bare)) {
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
          fix: `${sentence}: contains not is not something a filter can say yet. To look for the words, quote them: ${field} contains "${bare}".`,
          at: field,
        });
        continue;
      }
      if (/ or /i.test(bare)) {
        bad.push({
          code: 'VALUE_MALFORMED',
          fix: `${sentence}: contains takes one text to look for. To look for these words together, quote them: ${field} contains "${bare}".`,
          at: field,
        });
        continue;
      }
      clauses.push({ field, contains: bare } as Predicate);
      continue;
    }

    /* ── is · is not ─────────────────────────────────────────────────────── */
    if (verb !== 'is') {
      bad.push({
        code: 'MATCH_OP_UNSUPPORTED',
        /* `predicate` IS THE SCHEMA'S WORD FOR THIS AND NOBODY ELSE'S. It reached three screens,
           every one of them inside error copy, where the reader is already stuck — and the control
           that produced the thing is labelled *Filter*. The word for what a person wrote is the word
           on the button they pressed.
           AND THE SENTENCE NAMES WHAT `allowed` NAMES, IN ITS ORDER. It named six while `allowed`
           named seven: `on` was left out while `ORDERED` has read it since it was written, and
           `apps/web/src/lib/record/where.ts` copies this sentence and records that gap as this
           line's to close. Widened for `contains`, it closes the gap too, since the line changed
           anyway and so did every test that pins it. */
        fix: `${sentence}: ${verb || '(nothing)'} is not something a filter can say. Write is, is not, before, after, on, has, lacks or contains.`,
        at: field,
        allowed: ['is', 'is not', 'before', 'after', 'on', 'has', 'lacks', 'contains'],
      });
      continue;
    }

    /* `is not` WITH NOTHING AFTER IT IS NOT A SEARCH FOR THE WORD `not`. `startsWith('not ')` needs
       the space, so a bare trailing `not` fell through and became `note is 'not'` — a clause that
       parses, runs, and quietly means something nobody wrote. */
    /* AND `not` FOLDED WITH IT. Unfolded, `what is NOT coffee` was already the clause `what is "NOT
       coffee"`, the opposite of the sentence, where the browser read the negation; and folding the verb
       alone would have made `what IS NOT coffee`, a refusal until then, the same inverted clause.
       `rankedOf` folds its `not` for the same reason. */
    const negated = /^not(?:\s|$)/i.test(rest);
    const said = (negated ? rest.slice(3) : rest).trim();
    if (!said) {
      bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: is${negated ? ' not' : ''} what?`, at: field });
      continue;
    }

    /* ── is "a quoted value" ─────────────────────────────────────────────── */
    /* ONE VALUE, TAKEN AS WRITTEN AND THEN RESOLVED. Inside the marks a comma, an `or`, a leading `not` and the words
       `empty` and `set` are the value's own, which is what quoting says (`quotedAfter`). An enum is still asked what it
       declares and a ref still finds its row, so a quoted name filters exactly as the bare one does. */
    const quoted = quotedAfter(sentence, after, negated);
    if (quoted !== null) {
      if (quoted === '') {
        bad.push({ code: 'REQUIRED_MISSING', fix: `${sentence}: is${negated ? ' not' : ''} what? The quotes hold nothing.`, at: field });
        continue;
      }
      const resolved = resolve(schema, field, decl, quoted, deps);
      if (resolved === null) {
        bad.push(refuseValue(sentence, schema, field, decl, quoted, deps));
        continue;
      }
      clauses.push(
        !Array.isArray(resolved)
          ? ({ field, [negated ? 'not' : 'is']: resolved } as Predicate)
          : resolved.length === 1
            ? ({ field, [negated ? 'not' : 'is']: resolved[0] } as Predicate)
            : ({ field, [negated ? 'not_in' : 'in']: resolved } as Predicate),
      );
      continue;
    }

    /* ── is empty · is set ───────────────────────────────────────────────── */
    /**
     * THE DECLARED VALUES COME FIRST, AND THE OPERATOR ONLY AFTER THEM.
     *
     * A register is free to declare a state called `empty` or to hold a project titled `Set`, and
     * reading an operator out of the value slot would make that register unfilterable on the one
     * field whose values collide. The browser's copy of this grammar settled the same ordering with
     * the same argument beside it: *"an operator in the value slot is an operator, not a value, and
     * it is checked only AFTER the declared values, so an enum that really holds the word `present`
     * still resolves"*. Two engines reading one grammar in two orders is the disagreement the
     * differential pass over the shipped record spent sixteen findings on.
     *
     * ONLY AN ENUM AND A REF DECLARE ANYTHING, which is the same pair the browser closes. Every
     * other type either checks a SHAPE that `empty`, `set` and `present` all fail, a day, a number,
     * a boolean, or has no declared set at all and hands the word straight back, in which case
     * there is nothing for the operator to shadow. Asking `resolve` on a `text` would answer with
     * the word itself and the operator would never be reachable on the one type that needs it most.
     */
    const absence = ABSENCE[said.toLowerCase()];
    const declared = decl.type === 'enum' || decl.type === 'ref' ? resolve(schema, field, decl, said, deps) : null;
    /* `NO_ROW` IS NOT A ROW CALLED `empty`, so the operator still reads where the words named nothing. */
    if (absence && (declared === null || declared === NO_ROW)) {
      const op = negated ? INVERSE[absence] : absence;
      /**
       * AND ONLY WHERE THE TYPE TAKES IT, asked of the structured compiler's own table rather than
       * of a second one written here. `38 §4.3` is one relation over operators and types, and a
       * relation kept in two places is two relations the day one is edited: `operatorAllowed` is
       * exported for this. It admits `empty` and `present` on every type today, which `34 §1.2`
       * writes as *"every type"*, so this refuses nothing yet and narrows the day the table does.
       *
       * `MATCH_OP_UNSUPPORTED` IS THE CODE THE COMPILER ALREADY GIVES FOR THIS LEAF, in the
       * sentence it already gives, and `30 §6` reads it as *"an operator outside its type's set"*.
       * The `before` branch above says why it may not be a code minted here: two renderings of one
       * grammar answering one fact with two codes is the second language this file exists not to be.
       */
      if (!operatorAllowed(op, decl.type)) {
        bad.push({
          code: 'MATCH_OP_UNSUPPORTED',
          fix: `${sentence}: ${field} is a ${decl.type}, which cannot be asked "${op}".`,
          at: field,
        });
        continue;
      }
      clauses.push({ field, [op]: true } as Predicate);
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
        bad.push(refuseValue(sentence, schema, field, decl, one, deps));
        failed = true;
        break;
      }
      values.push(...(Array.isArray(resolved) ? resolved : [resolved]));
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
  if (clauses.length === 1) return { predicate: clauses[0], bad };
  return { predicate: split.any ? { any: clauses } : { all: clauses }, bad };
}

/** One condition of a sentence, and whether `, or` joined it to the one before. */
type Condition = { text: string; or: boolean };

/**
 * A sentence cut into its conditions, and whether they are ORed, or the refusal for one that says both.
 *
 * `, or` IS THE SEPARATOR AND `or` ALONE IS NOT. Between one field's values `or` has always meant `in`
 * (`state is open or doing`), and a value may hold the word, so the comma is what says a new condition
 * starts and the `or` after it is what says it is an alternative. Probed before this was written:
 * `state is open, or due before today` was `FIELD_UNKNOWN`, the words `or due` taken for a field name.
 *
 * BOTH SEPARATORS IN ONE SENTENCE IS A REFUSAL, NOT A PRECEDENCE. `a, b, or c` is `(a and b) or c` to
 * somebody who reads the comma as tighter and `a and (b or c)` to somebody who reads the `or` as
 * tighter, and a filter that picks one silently answers the other person's question with rows that
 * look right. A sentence has no brackets to say which, so the refusal writes out both and sends the
 * nesting to the structured form, where `all` and `any` hold each other.
 *
 * A LEADING `or` IS LEFT AS WORDS, as it was: with no condition before it there is nothing for it to
 * join, and the field lookup refuses it by name.
 */
function conditionsOf(filter: string): { conditions: Condition[]; any: boolean } | { fix: string } {
  const conditions: Condition[] = [];
  for (const raw of clausesOf(filter)) {
    const text = raw.trim();
    if (!text) continue;
    const joined = conditions.length > 0 ? /^or(?:\s+|$)/i.exec(text) : null;
    conditions.push(joined ? { text: text.slice(joined[0].length).trim(), or: true } : { text, or: false });
  }
  const ors = conditions.slice(1).filter((c) => c.or).length;
  if (ors === 0 || ors === conditions.length - 1) return { conditions, any: ors > 0 };
  return { fix: bothReadings(filter.trim(), conditions) };
}

/**
 * The refusal for a sentence joined by both `,` and `, or`, naming the two things it could mean.
 *
 * EACH READING BRACKETS THE RUN ITS TIGHTER SEPARATOR JOINS, and only a run of more than one: the first
 * takes the comma as tighter, the second the `or`. `apps/web/src/lib/record/where.ts` writes this sentence byte for
 * byte, which `where-any.test.ts` holds against the record over the seed.
 */
function bothReadings(filter: string, conditions: readonly Condition[]): string {
  const reading = (tight: boolean, inner: string, outer: string): string => {
    const runs: string[][] = [];
    for (const c of conditions) {
      if (runs.length === 0 || c.or !== tight) runs.push([c.text]);
      else runs[runs.length - 1]!.push(c.text);
    }
    return runs.map((r) => (r.length > 1 ? `(${r.join(` ${inner} `)})` : r[0])).join(` ${outer} `);
  };
  return `${filter}: this joins its conditions with a comma and with a comma and or, so it reads two ways: ${reading(false, 'and', 'or')}; or ${reading(true, 'or', 'and')}. A sentence cannot put one inside the other. Keep one of the two separators, or ask in the structured form, where all and any nest.`;
}

/** One written value as the record stores it, or `null` when the register cannot mean it. */
function resolve(
  schema: Schema,
  field: string,
  decl: FieldSpec,
  said: string,
  deps: SentenceDeps,
): string | number | string[] | null {
  /* A `list<enum>` IS AN ENUM HERE, AND `values` IS HOW THE SCHEMA SAYS SO. It is the same marker
     `compile`'s own `checkEnum` reads, for the same reason: a list that declares values is a
     `list<enum>` and nothing else is. Read `decl.type` alone and `chased has post` hands `post`
     straight back, and a literal the field cannot hold compiles clean and matches nothing.
     THE `has`/`lacks` CALLER NOW NARROWS `list` TO ITS ELEMENT TYPE before calling, so this line is
     the one that catches a fixture declaring `values` and no `of`, and the caller's own reading
     catches every other element type. Both orderings agree on the shipped form. */
  if (decl.type === 'enum' || (decl.type === 'list' && decl.values)) {
    /* AND IN THE LABEL THE SCREEN SHOWS, where a value has one: `direction is money in`. */
    const folded = said.replace(/[\s_]+/g, ' ').trim().toLowerCase();
    const labelled = Object.entries(decl.labels ?? {}).find(([, label]) => label.replace(/[\s_]+/g, ' ').trim().toLowerCase() === folded);
    if (labelled && (decl.values ?? []).includes(labelled[0])) return labelled[0];
    /* IN THE WORDS A SCREEN SHOWS. `owed to me` is what a person reads and `owed_to_me` is what the
       column holds; both are accepted, and a word the enum does not declare is refused — which is
       the clause that used to be true of every row in the register. */
    const wanted = said.replace(/\s+/g, '_').toLowerCase();
    return (decl.values ?? []).find((v) => v.toLowerCase() === wanted || v.replace(/_/g, ' ').toLowerCase() === said.toLowerCase()) ?? null;
  }

  /* A ROW ID, AN ID, AND THEN THE TITLE, through `lookupRef`, which is the one function the kernel's
     tree form reads the same leaf with, so `thing is things#1` and `{field: 'thing', is: 'things#1'}`
     are one question. The row id was refused here as a title nobody had, while the tree kept it and
     answered 14: two renderings of one grammar giving two answers. A title two rows share comes back
     as both ids, and the `is` branch widens to `or` over them. */
  if (decl.type === 'ref') {
    const found = lookupRef(decl.to, said, deps);
    if (!('ids' in found)) return null;
    return found.ids.length === 1 ? found.ids[0]! : found.ids;
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
  decl: FieldSpec,
  said: string,
  deps?: SentenceDeps,
): Refusal {
  /* AN ID OF ANOTHER REGISTER IS THE WRONG ROW, NOT NO ROW. `thing is tasks#1` names a row that
     exists, and `coerce` refuses the same value written into the same field with this code, so the
     read and the write give one answer about one address. */
  /* AND A ROW ID OF ANOTHER LIST IS THE SAME WRONG ROW, asked of the one lookup `resolve` used. */
  const found = decl.type === 'ref' && decl.to && deps ? lookupRef(decl.to, said, deps) : null;
  if (found && 'mismatch' in found && decl.to)
    return {
      code: 'REF_REGISTER_MISMATCH',
      fix: `${sentence}: ${field} points at ${decl.to}, and ${said} is a ${found.mismatch} row. Name a ${decl.to} row.`,
      at: field,
      allowed: [decl.to],
    };
  if (decl.type === 'enum' || (decl.type === 'list' && decl.values))
    return {
      code: 'ENUM_VALUE_UNKNOWN',
      fix: `${sentence}: ${schema.register}.${field} has no value ${said}.`,
      at: field,
      allowed: (decl.values ?? []).map((v) => (decl as { labels?: Readonly<Record<string, string>> }).labels?.[v] ?? v.replace(/_/g, ' ')),
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
      fix: `${sentence}: there is no ${decl.to ?? 'row'} called ${said}.`,
      at: field,
    };
  return { code: 'VALUE_MALFORMED', fix: `${sentence}: ${said} is not a value ${field} can hold.`, at: field };
}
