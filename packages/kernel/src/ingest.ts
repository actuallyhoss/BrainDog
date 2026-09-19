/**
 * Ingest: a payload arrives, and the record fills itself.
 *
 * ONE DETERMINISTIC TRANSACTION, and no model call inside it. Store, match, extract, validate,
 * write, rules — every step is a function of the bytes and the declarations, so the same payload
 * twice produces the same record twice, and a deploy in the middle of a burst loses nothing because
 * the transaction is the only state there is.
 *
 * THE TRANSFORM VOCABULARY IS CLOSED, and that is the point rather than a limitation. A pattern is a
 * declaration a person can read and an agent can propose; the moment it can run arbitrary code it is
 * a script somebody has to audit, and the whole argument for extraction being declarative goes with
 * it. Nine transforms cover the payloads a small business actually receives.
 *
 * A PAYLOAD NOBODY WROTE A PATTERN FOR IS A ROW SOMEBODY CAN SEE. It is not dropped and it is not
 * guessed at: the raw is stored `untriaged`, and the unmatched shape is what a proposal is later
 * made from. Silence is the failure mode of every ingest pipeline that decided its job was to be
 * quiet.
 *
 * AND A FAILURE DOWNGRADES RATHER THAN DISCARDS. A value the register refuses means the arrival goes
 * to `review` with the reason on it, not that the bytes go away. The person who set the pattern up
 * is the only one who can fix it, and they cannot fix what they cannot see.
 *
 * CONFIDENCE IS DERIVED, AND `writes.confidence` IS ONLY A CEILING. A pattern says at most how far
 * it is trusted; what actually happened to the fields says the rest, and the lower of the two wins.
 * `exact` writes rows. `proposed` and `needs-review` write NOTHING and open a `rowset` suggestion
 * with the extraction on it — because every pattern a model proposed files at `needs-review`, and a
 * pattern nobody has approved yet writing rows into somebody's ledger is the one failure this whole
 * design exists to prevent.
 *
 * AND A SHAPE NOBODY HAS A PATTERN FOR EARNS ONE DRAFT AT ITS THIRD ARRIVAL, outside the
 * transaction. Not one per payload: a model call per arrival is a bill that scales with a stranger's
 * sending rate, and two of anything is a coincidence. Three is the smallest number of examples a
 * pattern can be written from and the smallest that is not a coincidence, which is why it is the
 * same three.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok } from '@braindog/ports';
import { jsonPath, evaluate, INBOX_RAW, type Predicate, type Schema } from '@braindog/where';

import type { Entry, Json } from './index.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';
import { sparkMayWrite } from './spark.ts';
import { parseAnswer, readRow, type Mapping } from './map.ts';

export const CHANNELS = ['email', 'webhook', 'pull', 'paste', 'api'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The three, worst first — which is the order they are compared in. */
export const CONFIDENCES = ['needs-review', 'proposed', 'exact'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** The lower of two confidences. A ceiling can only ever bring one down. */
export const worse = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCES.indexOf(a) <= CONFIDENCES.indexOf(b) ? a : b;

/**
 * The thirteen forms of `07 §3` — ten extractors that read the text, and three combinators that take
 * a form. Any extractor may carry one anchor.
 *
 * THIS SAID "THE NINE" AND LISTED TEN, and it held ten of the thirteen. `declare.ts` has always
 * checked a form's key against all thirteen, so an ingest declaring `first:` INSTALLED CLEANLY and
 * then extracted nothing: every arm below missed, `extract` fell off the end and returned `null`,
 * and the field was reported as one the pattern could not read — naming the field rather than the
 * form that is not implemented. A published vocabulary with three unimplemented members is worse
 * than one that refuses them, because the refusal at least reaches the person who wrote it.
 */
export type Extractor =
  | { after: string }
  | { before: string }
  | { between: readonly [string, string] }
  | { text: { after?: string; before?: string; between?: readonly [string, string] } }
  | { money: { currency?: string; after?: string; before?: string; between?: readonly [string, string] } }
  | { date: { format: string; after?: string; before?: string; between?: readonly [string, string] } }
  | { int: { after?: string; before?: string; between?: readonly [string, string] } }
  | { decimal: { sep?: string; after?: string; before?: string; between?: readonly [string, string] } }
  | { enum: { map: Record<string, string>; after?: string; before?: string; between?: readonly [string, string] } }
  | { lookup: { register: string; by: string; after?: string; before?: string; between?: readonly [string, string] } }
  /* READONLY, because a declaration is data a pack or a `.brain` file handed over, and `as const` is
     how every fixture in this repository writes one. */
  | { first: readonly Extractor[] }
  | { nth: { n: number; of: Extractor } }
  | { default: { value: Json; of: Extractor } };

/**
 * What reading one field ACTUALLY DID — `43 §4.3`'s outcome, so `43 §5.1`'s confidence rule has
 * something to read.
 *
 * FIVE OF THE SIX. This said four, and said `ambiguous` "belongs to a scanner that returns every
 * match — this runtime has neither". Half of that was true when it was written and neither half is
 * now: the number forms got their scanner, and `enum` and `lookup` never needed one to be
 * ambiguous. Two literals of equal length with different values, both present, is a text that said
 * two things, and answering it with either one is a guess written into a register.
 *
 * `invalid` IS STILL HONESTLY ABSENT. It is a field-shape check against `34 §3` and nothing here
 * runs one, so it stays out rather than becoming a word in a type that no code path can emit.
 */
export type FieldOutcome = 'exact' | 'chosen' | 'defaulted' | 'missing' | 'ambiguous';

/** What one field's form yielded, and how. */
export type Extracted = { value: Json | null; outcome: FieldOutcome };

/** `43 §4.3`'s three combinators: they take a form's candidates rather than reading the payload. */
const COMBINATORS = ['first', 'nth', 'default'] as const;

/**
 * `43 §4.3`'s nesting ceiling, enforced HERE as well as at install.
 *
 * `declare.ts` refuses a form nested more than three deep, and that is where a person finds out. It
 * is not where a declaration necessarily arrives: a `.brain` import and a pack both reach `arrive`,
 * and this walk is over a structure a stranger wrote. Past the ceiling a form yields nothing, which
 * is the same answer as a form that read nothing — a payload produces an outcome, never a throw.
 */
const NESTING = 3;

export type IngestDecl = {
  ingest: string;
  channel: Channel;
  /** Over the ARRIVAL, `34 §1.9`'s seven: `from to subject body channel state ts`. Never a register. */
  match?: Predicate;
  /**
   * `07 §2`'s skip list: the arrivals this pattern recognises and does not want.
   *
   * A REFUND IS THE EXAMPLE AND IT IS NOT A SMALL ONE. A pattern that matches a bank's alerts
   * matches the refund alerts too, and the refund is not a transaction to write — `07 §2` names a
   * refund and a PIN reminder in the same breath. This member did not exist and `declare` had no
   * unknown-key check, so a declaration carrying one installed clean, reported success, and wrote
   * the refund into the register as a charge.
   */
  skip?: { when: Predicate; reason: string }[];
  /**
   * OPTIONAL, AND THE TYPE SAID OTHERWISE. `declare` refuses a declaration carrying both this and
   * `map`, so a connector that reads JSON cannot have an `extract` at all — and every one of them
   * was being read back through a type that promised one. `arrive` defends itself with `?? {}`, so
   * nothing broke; what it cost was that a map-only declaration could not be written down in
   * TypeScript without a cast, which is how the integration test found it.
   */
  extract?: Record<string, Extractor>;
  /**
   * A JSON answer read by paths (`map.ts`, `43 §4.5`), in place of `extract`. A declaration carries one or the
   * other, and `declare` refuses both.
   */
  map?: Record<string, Mapping>;
  writes: {
    /**
     * ONE REGISTER, OR `07 §2`'s ROUTING TABLE. One bank's alerts are two registers when the
     * currency differs, and the alternative to a table is a declaration per currency, each with the
     * same nine extractors in it. This was typed `string`, so a declaration carrying a route
     * installed clean, matched, read every field and then asked a register named `[object Object]`
     * to hold them.
     */
    register: string | Route;
    /**
     * A CEILING, NEVER A PROMISE. The extraction's own outcome is the other half, and the lower of
     * the two is what happens. Default `exact`; a pattern a model proposed files at `needs-review`
     * until a person has looked at what it would have written.
     */
    confidence?: Confidence;
  };
  /**
   * What makes two arrivals the same thing.
   *
   * WITHOUT ONE, `on_conflict` HAS NOTHING TO COMPARE. A redelivery of the same bytes is already
   * caught by the raw's own hash; this is for the different email about the same invoice.
   *
   * AND IT IS SPELLED THE WAY A DECLARATION SPELLS IT. `42 section 4.7` lists `dedupe:` as an
   * ingest's own key and `43 section 4.2` types it the same; this file read `writes.key`, which is a
   * name no schema has and no pack writes. Every declaration written the way the specification
   * writes it therefore deduped on nothing, installed clean, fired, and wrote the second row.
   */
  dedupe?: Dedupe;
  on_conflict?: 'skip' | 'update' | 'new';
};

/**
 * `43 section 4.2`'s `Dedupe`, structurally — the exact list, or the near form of `07 section 2`.
 *
 * THE TYPE IS WRITTEN OUT HERE RATHER THAN IMPORTED. `31 section 2` ranks `extract` at 9 and this
 * package at 7, so the edge would point the wrong way; the reader that uses it arrives injected for
 * the same reason, beside the scanners.
 */
/**
 * `43 §4.2`'s `Route`: kind × currency → register.
 *
 * `by` NAMES A FIELD, OR A MONEY FIELD'S CURRENCY, which is the one part of a value a route is
 * allowed to reach inside for — `43 §5.1` step 6, and `§9.5`'s worked row routes on
 * `[kind, amount.currency]`.
 */
/**
 * `07 §2`'s cap on a body, in bytes. The rows cap is `43 §5.5`'s and lives where the rows are read.
 *
 * THE SAME NUMBER `extract` HOLDS, and it is the same number for the same reason: `25 §7` rule 7 is
 * a BLOB ceiling, so this is a fact about what a row can hold rather than a policy either package
 * chose. Written twice is a risk; written once in a package this one may not import is not an
 * option, and the `stack` gate is what says the two agree.
 */
export const BODY_BYTES_MAX = 2_000_000;

export type Route = { by: string[]; to: { when: string[]; register: string }[] };

export type Dedupe =
  | string[]
  | { near: { on: string[]; day: string; prefix?: { field: string; chars?: number } } };

export type Arrival = {
  channel: Channel;
  /** Lower-cased on arrival, because a header's case is a fact about a mail server. */
  headers?: Record<string, string>;
  body?: string;
  /** The bytes' hash. Supplied by the host, which has the bytes; the record has the text. */
  sha256: string;
};

export type Arrived = {
  raw: string;
  /** The ingest that matched, or `null` — which is not an error and is the reason `inbox_raw` exists. */
  ingest: string | null;
  state: 'matched' | 'untriaged' | 'review' | 'skipped' | 'proposed';
  wrote: string[];
  reason?: string;
  /** What the extraction was worth, once the pattern's ceiling had been applied. */
  confidence?: Confidence;
  /** The `rowset` somebody has to answer, when nothing was written. */
  suggestion?: string;
  /**
   * These bytes arrived before, and the record kept what it did the first time.
   *
   * IT IS NOT THE SAME AS `state`. A redelivered unmatched payload comes back `untriaged`, and the
   * caller that read only the state re-ran everything an arrival earns — including the model call
   * `3′` exists to ration.
   */
  redelivered?: true;
};

/**
 * `43 §4.3`'s three number forms, read by whoever can reach them — every candidate, in text order.
 *
 * ONE KEY AND NOT THREE, because they are one tokenizer with three readings of it and a record that
 * had two of them would read a slice two ways. `@braindog/extract`'s `money.ts` holds all three
 * under that heading; this is the same set, named where the record hands it down.
 *
 * `money`'s `declared` IS A FALLBACK AND NEVER AN OVERRIDE (`43 §63`, in those words). A currency
 * written next to the number is the provider saying what it sent; `currency:` in a declaration is
 * the reader saying what it expects. When both exist and disagree the provider wins, because it is
 * the one that moved the money.
 *
 * `int` TAKES NO FRACTION and `decimal`'s `sep` IS ITS POINT — `§4.3`'s rows, in those words:
 * *each integer in the slice; grouping allowed, no fraction* and *each decimal in the slice; the
 * other separator groups*. Both are the whole of what the two readings differ by.
 *
 * THEY ARE INJECTED BECAUSE THEY CANNOT BE IMPORTED. `scanMoney`, `scanInts` and `scanDecimals` are
 * exactly these functions and are rank 9 to this package's 7, so the edge would point up
 * `31 §2`'s order. They arrive the way `extract.ts`'s `rows` does — handed down by the record,
 * which is rank 11 and may reach both — rather than being written out a second time here.
 */
export type NumberReaders = {
  money: (text: string, declared?: string) => { amount: number; currency: string }[];
  int: (text: string) => number[];
  decimal: (text: string, sep?: '.' | ',') => number[];
};

export type IngestDeps = {
  sql: Sql;
  ingests: () => IngestDecl[];
  schemaOf: (register: string) => Schema | null;
  write: (register: string, spoken: string | null, patch: Record<string, unknown>, actor: string) => Result<Entry>;
  /**
   * Every live row's `by` value in a register — `43 §2`, in its own words: *the record runs one
   * SELECT*. `§4.3`'s `lookup` is the id whose value occurs as a WHOLE TOKEN in the slice, longest
   * wins, equal length with different ids ambiguous, and none of those three can be asked of a
   * seam that takes one value and answers yes or no.
   *
   * IT USED TO TAKE THE FIRST TOKEN OF THE SLICE AND LOOK UP EXACTLY THAT. So a declaration with
   * no anchor over `Card 1234 debited…` looked up `Card`, found nothing, and was silent on every
   * arrival — the fourth time this loop has found a declaration that installs, matches, fires and
   * says nothing. Multi-word values could not be found at all, because a token is one word.
   */
  rows: (register: string, by: string) => { id: string; value: string }[];
  /**
   * `43 §4.3`'s `enum` and `lookup` rule, when the record handed it down: the longest literal
   * present as a whole token, or `'ambiguous'` for two of equal length with different values.
   *
   * ABSENT IS `String.includes` AND NO AMBIGUITY, which is what this file did alone and which is
   * wrong two ways at once. `{ enum: { map: { in: 'credit' } } }` over `coin` wrote `credit` — a
   * legal value for the field, off a substring of an unrelated word, so nothing downstream catches
   * it — and two literals both present were decided by the order `Object.keys` happened to give.
   */
  literals?: ((text: string, entries: readonly (readonly [string, Json])[]) => Json[] | 'ambiguous') | undefined;
  /**
   * `43 §4.3`'s `date`, when the record handed it down: every valid calendar day in the text
   * matching `format`, in text order.
   *
   * ABSENT IS `day()` BELOW, which reads four formats where the grammar has a token set. `§9.3`'s
   * own table reads `9/8/26` as `D/M/YY`, `29.08.2026` as `DD.MM.YYYY` and `29082026` as
   * `DDMMYYYY`, and none of those three is one of the four. That gap is not silent — `declare.ts`
   * refuses a format this build cannot read, and its message says the repair is a deploy — which
   * is why this is the one reader whose absence costs capability rather than correctness.
   *
   * AND IT YIELDS A LIST, so `nth: { n: 2, of: { date: … } }` reaches the second date in a
   * message. `§9.3` has that row too, and `day()` answers one day per slice.
   */
  dates?: ((text: string, format: string) => string[]) | undefined;
  /**
   * `43 §5.7`'s `isDuplicate`, when the record handed it down: whether two rows are one event.
   *
   * THE HALF SQL CANNOT ANSWER. `existingRow` narrows on the `on:` fields and the day window, which
   * an index can do; deciding that `BEANS COFFEE` and `BEANS COFFEE LONDON` are one merchant needs
   * accents and case folded off, and that is the grammar's, at rank 9.
   */
  duplicate?: ((a: Record<string, Json>, b: Record<string, Json>, dedupe: Dedupe) => boolean) | undefined;
  /**
   * `43 §5.1` step 4, when the record handed it down: the body in the shape every form reads it —
   * CR and CRLF to LF, tab and NBSP and the Unicode space separators to a space, the zero-width
   * characters removed, runs of spaces collapsed, each line trimmed.
   *
   * THIS IS A SECURITY BOUNDARY AND NOT TIDYING, which is why it is the one member of this seam
   * that is not a reader. A zero-width space is invisible to the person reading the arrival and
   * visible to `indexOf`, so a provider — or somebody who can write into one — puts `U+200B`
   * inside `EGP` and the amount walks past an anchor, past an `enum` literal and past a `match:`
   * while the message still reads correctly on screen. Stripping them is what makes the text the
   * reader saw and the text the scanner scanned the same string (`43 §8`).
   *
   * IT HOLDS TWO CHARACTER SETS, which is why it is handed down rather than written here: four
   * zero-width code points and sixteen space-like ones, the same test `§14` applies to the
   * currency table and the token set. Absent is the body as it arrived, which is what this file
   * read for as long as it has existed.
   */
  normalise?: ((text: string) => string) | undefined;
  mint: () => string;
  /** `SG<n>` for the suggestion an unwritten extraction opens. */
  allocate: (name: string) => number;
  nowMs: number;
  /**
   * `43 §4.3`'s money, int and decimal, when the record handed them down.
   *
   * ABSENT IS THE READING THIS FILE DID ON ITS OWN, and it is wrong against the specification in
   * five ways that are all kept rather than half-fixed. Money: a form with no `currency:` reads
   * nothing where `§9.1` reads the first amount with a code beside it, a declared `currency`
   * overrides the text's rather than standing behind it, and `(EGP 75.00)` reads positive where
   * `§233` makes parentheses negative. `int`: `1,250.00` reads 1250 where the row says *no
   * fraction*. `decimal`: `1.234,56` under the default `sep` reads **123456**, a hundredfold, where
   * a number whose separators contradict the declaration is not one this declaration can read.
   *
   * IT IS ALL OR NOTHING ON PURPOSE. Half of the money reading needs a list of currency codes this
   * package has not got, and a record reading its money one way and its integers another would be
   * a third behaviour nobody has a test for. So the fallback is the old reading entire, and a
   * record that wires the readers gets the specification's entire.
   */
  numbers?: NumberReaders | undefined;
};

/**
 * THE ARRIVAL'S SCHEMA IS `where`'s, AND THERE IS NO SECOND COPY OF IT HERE.
 *
 * There were two, and both were on the fire path. This file evaluated a `match:` against a local `ARRIVAL`
 * and `@braindog/extract`'s `matches` evaluated the same predicate against `where`'s `INBOX_RAW`, so one
 * arrival could match in the kernel and not match in `extract`. They disagreed about two things:
 *
 * - `channel` was a `text` here and is the DDL's `enum` there. `0001_kernel.ts` writes
 *   `CHECK (channel IN ('email','webhook','pull','paste','api'))`, so `{ field: channel, in: [email, imap] }`
 *   is a question no row can answer — and it compiled clean against the copy, fired here, and matched
 *   nothing there. The ordinary typo, installing silently.
 * - `subject` was absent here, and `subject` is what makes "exactly these seven fields" true: without it
 *   `specOf` grants every schema the record's five kernel columns, so `{ field: created_at }` resolved
 *   against a copy that has no columns at all.
 *
 * THE HEADER THAT USED TO SIT HERE SAID THE RIGHT THING AND CLOSED THE WRONG GAP. Its words were *"one
 * schema read by both is the only arrangement under which what installs and what fires cannot drift"*, and
 * it made `declare.ts` read this file instead of its own hand-kept list. One layer up, the schema that
 * fires in `extract` was still a third object. There is one now, and it is in the package that owns the
 * grammar, which is where `34 §1.9` is written.
 */
export { INBOX_RAW } from '@braindog/where';

/**
 * The row an extraction is ABOUT, if the register already holds one. `43 §4.1`'s dedupe key.
 *
 * ONE MATCHER FOR THE ONE-ROW PATH AND THE PAGE PATH. An arrival carries one extraction and a
 * pulled page carries five hundred, and if the two found their existing rows by different SQL then
 * a provider's correction would update a row over email and insert a duplicate over a connector.
 * `fetched.ts` calls this for every row of a page.
 *
 * A MONEY OR QUANTITY FIELD IS KEYED ON BOTH ITS PARTS, one level down. The object cannot be
 * compared as text — `entry.fields` is written with `JSON.stringify`, so key order is whatever built
 * it — and the number alone is not the value: `§5.7` step 1 says a money compares as
 * `{ amount, currency }`, and its query binds `'.amount' = ? AND '.currency' = ?`.
 *
 * NO KEY MEANS NO EXISTING ROW, which is `on_conflict: new` by construction: a declaration that
 * names nothing to match on is a declaration saying every arrival is its own row.
 */
export function existingRow(
  deps: Pick<IngestDeps, 'sql' | 'schemaOf' | 'duplicate'>,
  register: string,
  dedupe: Dedupe | null | undefined,
  extracted: Record<string, unknown>,
): { id: string; seq: number } | undefined {
  /* `null` AS WELL AS ABSENT, because this value is read back out of a JSON column: a declaration
     stored with the key written and left empty comes back holding one rather than missing one. */
  if (dedupe === undefined || dedupe === null) return undefined;
  const near = Array.isArray(dedupe) ? undefined : dedupe.near;
  const on = Array.isArray(dedupe) ? dedupe : dedupe.near.on;
  if (on.length === 0) return undefined;

  /* THE TERMS SQL CAN ANSWER. A money field is two of them and a quantity is two, because that is
     what the value IS: `§5.7`'s query binds `'.amount' = ? AND '.currency' = ?`, and comparing the
     number alone makes EGP 1,250.00 and USD 1,250.00 one row — which, under the default
     `on_conflict: skip`, drops the second and leaves nothing downstream able to say what went. */
  const terms: string[] = [];
  const bound: (string | number | null)[] = [];
  let inJs = false;
  for (const field of on) {
    const type = deps.schemaOf(register)?.fields[field]?.type;
    const at = `json_extract(fields, '${jsonPath(field)}`;
    const value = extracted[field];
    const parts: [string, unknown][] =
      type === 'money'
        ? [[`${at}.amount')`, (value as { amount?: unknown })?.amount], [`${at}.currency')`, (value as { currency?: unknown })?.currency]]
        : type === 'quantity'
          ? [[`${at}.value')`, (value as { value?: unknown })?.value], [`${at}.unit')`, (value as { unit?: unknown })?.unit]]
          : [[`${at}')`, value]];
    for (const [sql, v] of parts) {
      /* AN OBJECT THAT IS NEITHER OF THOSE IS NOT A TERM. `json_extract` hands back the stored text
         of an object, and `entry.fields` is written with `JSON.stringify` — so key order is whatever
         built it, and two equal values compare unequal about as often as not. It goes to the reader
         below, which compares canonically. Binding it as `null` here would be the wrong-answer
         version of the same thing. */
      if (v !== null && typeof v === 'object') { inJs = true; continue; }
      terms.push(`${sql} = ?`);
      bound.push(v === undefined || v === null ? null : typeof v === 'number' ? v : String(v));
    }
  }

  /* THE EXACT FORM, ANSWERED WHERE THE ROWS ARE. Every term is a scalar equality, so one indexed
     read settles it and no candidate has to be carried into this process. */
  if (near === undefined && !inJs)
    return deps.sql.one<{ id: string; seq: number }>(
      `SELECT id, seq FROM entry WHERE register = ? AND deleted_at IS NULL AND ${terms.join(' AND ')} LIMIT 1`,
      register,
    ...bound,
  );

  /* AND EVERYTHING ELSE IS `43 §5.7`'s DIVISION OF LABOUR, verbatim: *the record fetches candidates
     and calls this per candidate*. The day window is SQL — `YYYY-MM-DD` sorts as it counts — and the
     prefix rule is not, because folding accents and case off a merchant string is the grammar's, and
     the grammar lives one rank up at `extract`. It arrives injected, the way the scanners do.

     WITHOUT THE READER, NO EXISTING ROW. A record opened without one writes the second copy of a
     transaction, which a person can see and delete; the other direction drops a real one silently.
     `§5.7`'s own paragraph leans this way at every step and so does this. */
  const duplicate = deps.duplicate;
  if (duplicate === undefined) return undefined;

  let window = '';
  if (near !== undefined) {
    const day = extracted[near.day];
    const around = neighbours(typeof day === 'string' ? day : '');
    if (around === undefined) return undefined;
    window = ` AND json_extract(fields, '${jsonPath(near.day)}') BETWEEN ? AND ?`;
    bound.push(around[0], around[1]);
  }

  const where = terms.length > 0 ? ` AND ${terms.join(' AND ')}` : '';
  const candidates = deps.sql.all<{ id: string; seq: number; fields: string }>(
    `SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL${where}${window}`,
    register,
    ...bound,
  );
  return candidates.find((row) => duplicate(extracted as Record<string, Json>, JSON.parse(row.fields) as Record<string, Json>, dedupe));
}

/**
 * `43 §5.1` step 6. Where a row goes: a register, or the `by` ids that nothing matched.
 *
 * NONE MEANS NOBODY GUESSES. A credit filed as a debit is a number that is right with a sign that
 * is wrong, and no later check catches it because both rows look ordinary; `07 §2` says the miss
 * *lands in `review` rather than guessing*, and this returns the ids so the reason can name them.
 *
 * THE VALUES ARE COMPARED AS STRINGS, which is what `§5.1` step 6 says and what the table is: a
 * `when` is written in a declaration, so both sides of the comparison are text a person typed.
 */
export function routeTo(register: string | Route, extracted: Record<string, unknown>): { to: string } | { miss: string } {
  if (typeof register === 'string') return { to: register };
  const said = register.by.map((id) => {
    const dot = id.indexOf('.');
    const value = dot === -1 ? extracted[id] : (extracted[id.slice(0, dot)] as Record<string, unknown> | undefined)?.[id.slice(dot + 1)];
    return value === undefined || value === null ? null : String(value);
  });
  const hit = register.to.find((row) => row.when.length === said.length && row.when.every((want, i) => said[i] === want));
  return hit ? { to: hit.register } : { miss: register.by.join(', ') };
}

/**
 * Every field id a dedupe names, in both forms. The backstop that keeps an unchecked identifier out
 * of `jsonPath`, which throws, reads all of them and not just the `on:` list.
 */
export function named(dedupe: Dedupe | null | undefined): string[] {
  if (dedupe === undefined || dedupe === null) return [];
  if (Array.isArray(dedupe)) return dedupe;
  const { on, day, prefix } = dedupe.near;
  return [...on, day, ...(prefix ? [prefix.field] : [])];
}

/**
 * The day before and the day after a `YYYY-MM-DD`, or `undefined` if it is not one.
 *
 * THE CALENDAR HAS THE LAST WORD, as it does in `dedupe.ts`: `2026-02-30` is a shape and not a day,
 * and a window built around one would be a day out at exactly the boundary the window exists for.
 */
function neighbours(day: string): [string, string] | undefined {
  if (day.length !== 10 || day[4] !== '-' || day[7] !== '-') return undefined;
  const at = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) return undefined;
  return [new Date(at - 86_400_000).toISOString().slice(0, 10), new Date(at + 86_400_000).toISOString().slice(0, 10)];
}

/**
 * One payload through the pipeline.
 *
 * THE RAW IS STORED FIRST AND ALWAYS. Whatever happens after it, the bytes are in the record — which
 * is what makes "why did that not come through" a question with an answer.
 */
export function arrive(deps: IngestDeps, arrival: Arrival, transaction: <T>(fn: () => T) => T): Result<Arrived> {
  if (!(CHANNELS as readonly string[]).includes(arrival.channel))
    return no<Arrived>('ENUM_VALUE_UNKNOWN', `${arrival.channel} is not a channel.`, { at: 'channel', allowed: CHANNELS });
  if (!arrival.sha256) return no<Arrived>('REQUIRED_MISSING', 'An arrival is identified by the hash of its bytes.', { at: 'sha256' });

  /* `attempt` RATHER THAN `transaction`, because the refusal below is a VALUE. A raw row written and
     then reported as a failure is the worst of both: the caller believes nothing happened and the
     record holds bytes whose receipt says nothing was written and cannot say why. */
  return attempt(deps.sql, transaction, () => {
    const at = instant(deps.nowMs);
    const headers = lower(arrival.headers ?? {});
    const body = arrival.body ?? '';

    /* IDEMPOTENT ON THE HASH. A redelivery is the ordinary case — every webhook sender retries, and
       most mail servers will too — and writing the row twice is the failure people notice as a
       duplicate invoice. */
    const already = deps.sql.one<{ id: string; state: string }>(
      'SELECT id, state FROM inbox_raw WHERE channel = ? AND sha256 = ?',
      arrival.channel,
      arrival.sha256,
    );
    if (already) {
      const receipt = deps.sql.one<{ wrote: string; ingest_id: string }>(
        'SELECT wrote, ingest_id FROM ingest_receipt WHERE raw_id = ?',
        already.id,
      );
      return ok<Arrived>({
        raw: already.id,
        ingest: receipt?.ingest_id ?? null,
        state: already.state as Arrived['state'],
        wrote: receipt ? (JSON.parse(receipt.wrote) as string[]) : [],
        reason: 'this arrived before, and the record kept what it did the first time',
        redelivered: true,
      });
    }

    const raw = deps.mint();
    /**
     * The arrival a `match:` is a question about, and it holds all seven of `34 §1.9`'s names.
     *
     * IT HELD FIVE, AND THE TWO IT LEFT OUT WERE THE TWO A PATTERN COULD INSTALL AND NEVER USE. See
     * `INBOX_RAW`'s re-export above for what that cost. Both halves have to be here: a field in the schema with no
     * value on the row answers `empty` and nothing else, and a value with no field in the schema is
     * a predicate `compile` refuses, which `evaluate` reads as `false` on every arrival.
     *
     * `ts` IS THE INSTANT THE PAYLOAD ARRIVED, which is the same `at` the raw row is stored under a
     * few lines below, so a pattern scoped to the last week and the row a person later reads in the
     * inbox agree about when the thing turned up.
     *
     * `state` IS `untriaged`, WHICH IS THE STATE AN ARRIVAL IS ACTUALLY IN AT THIS POINT. It is the
     * column's own DEFAULT in `0001_kernel.ts` and it is the word the comment below `!matched` gives
     * the reason for: the state a payload is in before anybody has said what it means. Matching is
     * step 2 and every other state is decided by the steps after it, so any other answer here would
     * be a claim about a decision that has not been taken yet.
     */
    const fields: Record<string, unknown> = {
      channel: arrival.channel,
      from: headers.from ?? '',
      to: headers.to ?? '',
      subject: headers.subject ?? '',
      body,
      state: 'untriaged',
      ts: at,
    };

    /* THE FIRST MATCHING INGEST WINS, and the order is the declaration order. Two patterns that both
       match one payload is a thing to notice rather than a thing to merge — merging two extractions
       produces a row neither declaration describes. */
    const matched = deps
      .ingests()
      .filter((i) => i.channel === arrival.channel)
      .find((i) => i.match === undefined || evaluate(i.match, fields, INBOX_RAW));

    const store = (state: Arrived['state'], reason: string | null): void => {
      deps.sql.exec(
        'INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        raw,
        at,
        arrival.channel,
        JSON.stringify(headers),
        body,
        arrival.sha256,
        state,
        reason,
      );
    };

    const note = (kind: string, actor: string, target: string, targetKind: string, to: string | null): void => {
      sparkMayWrite(actor, kind);
      deps.sql.exec(
        'INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, ?, ?, ?, ?)',
        deps.mint(),
        at,
        actor,
        kind,
        target,
        targetKind,
        to,
      );
    };

    if (!matched) {
      /* UNTRIAGED IS NOT AN ERROR. It is the state a payload is in before anybody has said what it
         means, and the reason `inbox_raw` exists at all: an ingest pipeline whose answer to "I do not
         recognise this" is to drop it is a pipeline whose failures are invisible. */
      store('untriaged', null);
      return ok<Arrived>({ raw, ingest: null, state: 'untriaged', wrote: [] });
    }

    /* `43 §5.1` STEP 1, WHICH IS BEFORE THE SKIP LIST AND BEFORE ANY FIELD. `07 §2`: *two caps bound
       extraction — a body of 2,000,000 bytes and 5,000 rows; over either, the arrival is kept raw in
       `review` with the reason and never extracted.*

       THE ENCODED LENGTH AND NOT `body.length`, which is the same rule `extract` writes down at its
       own step 1: a body of emoji is twice the characters it looks like, and measuring the wrong one
       lets through a payload the row cannot hold, which then fails later and somewhere else.

       AND `review` RATHER THAN A REFUSAL, because the bytes are already stored below and the sender
       did nothing wrong. The mapped half of this file had a cap of its own inside `parseAnswer`,
       which answers `undefined` over the ceiling — so an oversized JSON payload came back as *could
       not read total, kind, ref*, sending a person to look at their paths when the problem was the
       size of the thing. One cap, one sentence, both halves. */
    const bytes = new TextEncoder().encode(body).length;
    if (bytes > BODY_BYTES_MAX) {
      const reason = `body too large (${bytes} bytes; the cap is ${BODY_BYTES_MAX})`;
      store('review', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason, confidence: 'needs-review' });
    }

    /* `43 §5.1` STEP 2, WHICH IS BEFORE ANYTHING IS READ: *a hit → `{ rows: [], skipped: reason }`,
       no receipt. Stop.* The same evaluator over the same subject the `match:` was asked about, in
       declared order, first true wins — `§5.2` step 3.

       AND THE RAW IS STILL STORED, which is the difference between a skip and a drop. The bytes are
       in the record with the reason beside them, so "why did that not come through" has an answer
       and the pattern can be changed by somebody looking at the payload that provoked it. */
    const skipped = (matched.skip ?? []).find((rule) => evaluate(rule.when, fields, INBOX_RAW));
    if (skipped) {
      store('skipped', skipped.reason);
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason: skipped.reason });
    }

    /* THE ROW IS THE BODY — `43 §5.1` step 3, in four words: *`text` → one row, the body*. The
       subject was prepended to it here, which put a line the document does not extract from in
       front of every anchor: `{ before: "Card" }` cut the subject and nothing else, and a message
       whose subject repeats its amount read the subject's. The subject is still matched on — it is
       one of `34 §1.9`'s seven and `§5.2` builds it — and matching on a line is not reading a value
       out of it.

       THEN STEP 4 OVER IT, once, before a single form runs. */
    const text = deps.normalise === undefined ? body : deps.normalise(body);
    const extracted: Record<string, unknown> = {};
    const missed: string[] = [];

    /* THE OUTCOME PER FIELD, not only the value — `43 §5.1` step 7 files a row by the worst of them
       and this loop used to keep the value alone. */
    const soft: string[] = [];

    /* A MAP READS THE BODY AS JSON, once, and each field by its path; an extract reads the text with anchors. The
       outcomes are the same words, so everything below files a mapped row exactly as it files an extracted one.

       AND THE MAPPED HALF IS `readRow`, WHICH A CONNECTOR'S PAGE CALLS TOO. One arrival here and five
       hundred rows there is the same read over a different number of roots (`30 §2`). */
    if (matched.map !== undefined && matched.extract === undefined) {
      /* A ROUTED WRITE HAS NO SCHEMA YET AND THIS IS THE ORDER SAYING SO: `43 §5.1` reads the
         fields at step 5 and routes at step 6, because the route reads the values step 5 produced.
         So a mapped row under a route is typed by nothing, exactly as it was before routes could be
         written at all, rather than by whichever target happened to be listed first. */
      const fields = (typeof matched.writes.register === 'string' ? deps.schemaOf(matched.writes.register)?.fields : undefined) ?? {};
      const got = readRow({ exponent: exponentOf, day }, matched.map, parseAnswer(body), at, (field) => fields[field]?.type);
      Object.assign(extracted, got.fields);
      missed.push(...got.missed);
      soft.push(...got.soft);
    } else {
      for (const [field, form] of Object.entries(matched.extract ?? {})) {
        const got = resolve(deps, form, text);
        if (got.value === null) missed.push(field);
        else {
          extracted[field] = got.value;
          if (got.outcome !== 'exact') soft.push(field);
        }
      }
    }

    /* THE CEILING IS PART OF THE DECLARATION AND THE OUTCOME IS PART OF THE PAYLOAD, and the lower of
       the two is what happens. Checked here rather than only at install, because a declaration can
       arrive through a `.brain` import as well as through the linter. */
    const ceiling = matched.writes.confidence ?? 'exact';
    if (!(CONFIDENCES as readonly string[]).includes(ceiling)) {
      /* THE BYTES STAY. This returned before `store` had run, and the whole call sits in a savepoint
         — so a declaration carrying `confidence: high`, which nothing validates at install and which
         a `.brain` import or a pack installs cleanly, threw the arrival away entirely. `inbox_raw` got
         no row at all, against 07 §2's "nothing is ever dropped" and this file's own first line.

         A BAD DECLARATION IS A `review`, NOT A DISCARD. The sender did nothing wrong; the pattern
         did, and the payload is the evidence for fixing it. */
      store('review', `${String(ceiling)} is not a confidence this record knows, so ${matched.ingest} did not write.`);
      return ok<Arrived>({
        raw,
        ingest: matched.ingest,
        state: 'review',
        wrote: [],
        reason: `${String(ceiling)} is not a confidence this record knows.`,
      });
    }

    /* `43 §5.1` STEP 6, WHICH IS AFTER THE FIELDS AND BEFORE THE CONFIDENCE, because a route reads
       the values step 5 produced and a miss is one of the things step 7 files as `needs-review`. */
    const routed = routeTo(matched.writes.register, extracted);
    if ('miss' in routed) {
      /* A MISS IS `needs-review` WHATEVER THE CEILING SAYS, and it opens no `rowset`: a rowset is a
         suggestion a person ACCEPTS INTO a register, and the whole of what went wrong is that no
         register was named. The bytes, the state and the reason are stored; what happens next is an
         edit to the table or to the pattern, and both of those are edits to the declaration. */
      const reason = `${matched.ingest} read this one and its routing table takes no row like it: route miss on ${routed.miss}.`;
      store('review', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason, confidence: 'needs-review' });
    }
    const register = routed.to;

    /* `43 §5.1` STEP 7, ALL THREE LEVELS. A field the pattern could not read is `needs-review`; a
       field it CHOSE between two forms, or DEFAULTED in because the payload did not carry one, is
       `proposed` — read by the record, not sent by anybody, and therefore a thing a person should
       see before it is a row.

       THE MIDDLE LEVEL HAD NO WAY TO BE REACHED and this comment said so: "there is no combinator
       here that chooses or defaults, so there is no honest third outcome to derive". There are three
       now, and `proposed` stopped being a level only a declared ceiling could produce. */
    const confidence = worse(
      missed.length ? 'needs-review' : soft.length ? 'proposed' : 'exact',
      ceiling,
    );

    /* A FAILURE DOWNGRADES RATHER THAN DISCARDS. The bytes stay, the reason is on them, and the
       extraction goes in front of a person as a `rowset` they can accept — which is the only thing
       that makes a pattern nobody has approved yet safe to leave switched on. */
    if (confidence !== 'exact') {
      const state = confidence === 'proposed' ? 'proposed' : 'review';
      /* THE REASON NAMES FIELD IDS AND NOTHING OUT OF THE PAYLOAD — `43 §6`'s leak rule. The middle
         arm is new with the combinators: "files at ${ceiling}" was the only explanation this could
         give, and it is a false one when the ceiling is `exact` and a field defaulted. */
      const reason = missed.length
        ? `${matched.ingest} could not read ${missed.join(', ')} out of this one.`
        : soft.length
          ? `${matched.ingest} chose or defaulted ${soft.join(', ')} rather than reading them, so what it read is proposed rather than written.`
          : `${matched.ingest} files at ${ceiling}, so what it read is proposed rather than written.`;
      store(state, reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', confidence);

      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        question: `${reason} Accept it into ${register}, or fix the pattern.`,
      });
      return ok<Arrived>({ raw, ingest: matched.ingest, state, wrote: [], reason, confidence, suggestion });
    }

    /* THE KEY IS A LIST OF FIELD IDS FROM A DECLARATION, and a declaration can come from a pack —
       which 04 says is meant to be safe to install from a stranger. These were interpolated into
       `json_extract(fields, '$.<id>')` with no grammar check at all, so a key of
       `ref') = 1 OR 1 = 1 OR json_extract(fields, '$.x` selected the first row of the register and
       an `on_conflict: update` then wrote over it. `jsonPath` is the one place that decides whether
       an identifier may become SQL, and it throws on anything else.

       AND THE VALUE IS BOUND AS ITSELF, not as a string. `json_extract` answers an INTEGER for an
       `int` field and an object for a `money` one, and SQLite compares storage classes — so
       `= '1234'` never matched an integer and a numeric dedupe key silently wrote a duplicate row
       every time. Money is compared on its amount, one level down, for the same reason. */
    const key = named(matched.dedupe);
    /* A REFUSAL IS A VALUE HERE, even for the backstop. `jsonPath` throws on an id that never went
       through the install check, and this is a `Result`-returning method — an exception crossing it
       is the one thing this package promises does not happen. */
    const wrongId = key.find((f) => typeof f !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(f));
    if (wrongId !== undefined)
      return no<Arrived>('DECLARATION_INVALID', `${matched.ingest} names ${JSON.stringify(wrongId)} as a field, and it is not one.`, {
        at: 'dedupe',
      });
    const existing = existingRow(deps, register, matched.dedupe, extracted);

    const conflict = matched.on_conflict ?? 'skip';
    if (existing && conflict === 'skip') {
      const reason = `${existing.seq === null ? existing.id : `${register}#${existing.seq}`} already says this.`;
      store('skipped', reason);
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason });
    }

    note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'exact');

    const wrote = deps.write(
      register,
      /* BY ID, NOT BY SPOKEN REF. A series register has `seq = null`, so `<register>#null` missed and
         the arrival landed in `review` citing a row id that does not exist. `rules.ts` fixed the
         same bug by passing the id; this had the old form. */
      existing && conflict === 'update' ? existing.id : null,
      extracted,
      `ingest:${matched.ingest}`,
    );

    /* A REGISTER'S REFUSAL DOWNGRADES LIKE ANY OTHER FAILURE. Returning the refusal would roll the
       raw back with it — the bytes gone, and nobody able to fix the pattern from a row that does not
       exist. It is the same answer the unreadable-field branch above gives, for the same reason, and
       it is what keeps the `write.refused` observation the write left behind. */
    if (!wrote.ok) {
      const reason = `${register} refused what ${matched.ingest} read: ${fixOf(wrote)}`;
      store('review', reason);
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        question: `${reason} Fix it here, or fix the pattern.`,
      });
      return ok<Arrived>({
        raw,
        ingest: matched.ingest,
        state: 'review',
        wrote: [],
        reason,
        confidence: 'needs-review',
        suggestion,
      });
    }

    store('matched', null);

    /* ONE RECEIPT PER ARRIVAL, its `wrote` filled by the record. A skipped arrival has none, which
       is what makes "what did this actually do" answerable by the row's existence. */
    deps.sql.exec(
      'INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, ?, ?, ?, ?)',
      deps.mint(),
      raw,
      matched.ingest,
      JSON.stringify([wrote.value.id]),
      confidence,
      at,
    );
    note('extract', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', '1');

    return ok<Arrived>({ raw, ingest: matched.ingest, state: 'matched', wrote: [wrote.value.id], confidence });
  });
}

/**
 * The `rowset` an unwritten extraction opens.
 *
 * OPENED BY THE INGEST, NOT BY `system`. Whoever reads it needs to know which pattern produced it —
 * "accept this, or fix the pattern" is not a question anybody can answer without the pattern's name.
 */
function openRowset(
  deps: IngestDeps,
  at: string,
  item: { ingest: string; register: string; rows: Record<string, unknown>[]; question: string },
): string {
  const id = `SG${deps.allocate('suggestion')}`;
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'rowset', ?, 'open', ?, ?)",
    id,
    JSON.stringify({ register: item.register, rows: item.rows, ingest: item.ingest }),
    `ingest:${item.ingest}`,
    at,
  );
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', ?)",
    deps.mint(),
    at,
    `ingest:${item.ingest}`,
    `suggestion:${id}`,
    item.question.slice(0, 280),
  );
  return id;
}

/* ── 3′: the shape nobody wrote a pattern for ──────────────────────────── */

/** How many of one shape it takes to earn a draft. Three examples, and three is not a coincidence. */
export const PROPOSE_AT = 3;
const WINDOW_DAYS = 30;
/** The most raws one of these counts. Past it the count is already over the threshold. */
const SCAN = 500;

/**
 * Which shape an unmatched arrival belongs to.
 *
 * THE ADDRESS AND NOT THE DISPLAY NAME. A bank that sends as `CIB` on Monday and `CIB Alerts` on
 * Tuesday is one sender, and a shape key that disagreed would split three examples into three ones
 * and never propose anything at all.
 */
export function shapeOf(channel: Channel, headers: Record<string, string>): string {
  const h = lower(headers);
  const who = (h.from ?? '').trim() || (h.to ?? '').trim();
  const address = (/<([^>]+)>/.exec(who)?.[1] ?? who).trim().toLowerCase();
  return address ? `${channel}:${address}` : channel;
}

export type ProposeDeps = {
  sql: Sql;
  nowMs: number;
  outbox: (payload: unknown) => string;
};

/**
 * `3′` — the one draft an unmatched shape earns, OUTSIDE the arrival's transaction.
 *
 * AT THE THIRD AND ONLY AT THE THIRD. Not one per payload, because a model call per arrival is a
 * bill that scales with a stranger's sending rate; and not again at the fourth, because the draft
 * for this shape is already queued and a second is the same question asked twice. If nobody answered
 * it, that is a thing a person retries from the raw inbox — retrying a model call automatically
 * bills twice for one payload.
 *
 * THE DRAFT CARRIES IDS AND NOT BODIES. Whoever drafts reads the three raws itself; copying them
 * here would put an untrusted stranger's text into a queue that is summarised in front of a person.
 */
export function propose(deps: ProposeDeps, channel: Channel, headers: Record<string, string>): string | null {
  const shape = shapeOf(channel, headers);
  const since = instant(deps.nowMs - WINDOW_DAYS * 86_400_000);

  /* THE SHAPE IS IN THE QUERY, not in a filter over a page of rows. A cap applied per CHANNEL and
     then filtered in JS meant that on a busy inbox the three examples of a NEW shape were truncated
     out before the filter ran — so the shape that most needed a pattern was the one that never got
     one, at the third arrival or ever after. The expression is the same `from`-then-`to` fallback
     `shapeOf` computes, so the two cannot disagree. */
  const WHO = "COALESCE(NULLIF(TRIM(json_extract(headers, '$.from')), ''), NULLIF(TRIM(json_extract(headers, '$.to')), ''), '')";
  const seen = deps.sql
    .all<{ id: string; headers: string | null }>(
      /* `rowid` BREAKS THE TIE, because a burst arrives inside one millisecond and `ts` alone then
         orders them by nothing in particular — which would hand a person three examples in an order
         that is not the order they came in. */
      `SELECT id, headers FROM inbox_raw WHERE state = 'untriaged' AND channel = ? AND ts >= ?
       AND ${WHO} IS NOT NULL ORDER BY ts DESC, rowid DESC LIMIT ?`,
      channel,
      since,
      SCAN,
    )
    .filter((r) => shapeOf(channel, JSON.parse(r.headers ?? '{}') as Record<string, string>) === shape);

  if (seen.length !== PROPOSE_AT) return null;

  /* OLDEST FIRST, because three examples read in the order they arrived is what a person checks the
     proposal against — and the query above had to be newest-first to bound its scan. */
  const examples = seen.map((r) => r.id).reverse();
  return deps.outbox({
    shape,
    channel,
    n: PROPOSE_AT,
    window: `${WINDOW_DAYS}d`,
    examples,
    why: `${PROPOSE_AT} payloads shaped like ${shape} arrived in thirty days and no pattern matched any of them.`,
  });
}

/* ── the transforms ──────────────────────────────────────────────────────── */

/**
 * One field out of one payload, or `null`.
 *
 * `null` IS "NOT THERE", never zero and never the empty string. A pattern that produced a zero for a
 * missing amount would write a row saying somebody owes nothing, which is a different and worse
 * claim than not writing one.
 */
export function extract(deps: IngestDeps, form: Extractor, text: string): Json | null {
  return resolve(deps, form, text).value;
}

/**
 * The same read, with `43 §4.3`'s outcome attached.
 *
 * TWO ENTRY POINTS BECAUSE TWO CALLERS WANT DIFFERENT THINGS. A person testing a pattern wants the
 * value; `arrive` wants to know whether the value was CHOSEN between two forms or DEFAULTED in
 * because the payload did not carry one, because `43 §5.1` files those at `proposed` and a straight
 * read at `exact`. Collapsing them is how a defaulted field gets written as though a bank had sent
 * it.
 */
export function resolve(deps: IngestDeps, form: Extractor, text: string): Extracted {
  return resolveAt(deps, form, text, 1);
}

function resolveAt(deps: IngestDeps, form: Extractor, text: string, depth: number): Extracted {
  const missing: Extracted = { value: null, outcome: 'missing' };
  /* AMBIGUOUS CARRIES NO VALUE, which is what makes `43 §5.1` step 7 come out right for free: a
     field with no value is already `needs-review` here, and *any outcome in `missing · ambiguous ·
     invalid`* is what that step asks for. The word is what a person reading the reason sees. */
  const ambiguous: Extracted = { value: null, outcome: 'ambiguous' };
  if (form === null || typeof form !== 'object' || depth > NESTING) return missing;

  /* `first` RUNS EVERY ARM AND NOT ONLY UNTIL ONE ANSWERS, which is the one thing about it that is
     not obvious. The value is the first arm that yielded — but the OUTCOME depends on how many did,
     and a walk that stopped at the first could not tell one from two. `43 §5.3` says so in the same
     breath: "run each form in order; collect which yielded", k forms is k passes. Two banks wording
     the same amount two ways is exactly when a person should be asked to look. */
  if ('first' in form) {
    const arms = Array.isArray(form.first) ? form.first : [];
    let picked: Json | null = null;
    let yielded = 0;
    for (const arm of arms) {
      const got = candidatesAt(deps, arm, text, depth + 1);
      /* AMBIGUITY IS NOT A MISS, so it does not fall through to the next arm. The text held two
         readings and the next form cannot unsay that; `default:` takes the same line below. */
      if (got === AMBIGUOUS) return ambiguous;
      if (got.length === 0) continue;
      yielded += 1;
      picked ??= got[0]!;
    }
    if (picked === null) return missing;
    return { value: picked, outcome: yielded > 1 ? 'chosen' : 'exact' };
  }

  if ('nth' in form) {
    const { n, of } = form.nth;
    if (!Number.isInteger(n) || n < 1) return missing;
    const got = candidatesAt(deps, of, text, depth + 1);
    if (got === AMBIGUOUS) return ambiguous;
    const at = got[n - 1];
    return at === undefined ? missing : { value: at, outcome: 'exact' };
  }

  /* `default` KEEPS `of`'s OUTCOME WHEN `of` ANSWERED. Only the fallback is `defaulted`; a `first`
     inside a `default` that chose is still a choice, and flattening both to one word would file an
     ordinary read at `proposed` every time somebody wrote a fallback for it. */
  if ('default' in form) {
    const got = resolveAt(deps, form.default.of, text, depth + 1);
    /* A DEFAULT COVERS ABSENCE, NEVER AMBIGUITY — `43 §4.3`, on the `default` row: *an ambiguous
       `of` stays ambiguous.* "The text did not say" is a thing a declaration can answer in
       advance; "the text said two things" is not, and answering it with a default would write a
       value chosen by the declaration over a text that contradicted it. */
    if (got.outcome === 'ambiguous') return got;
    if (got.value !== null) return got;
    return { value: form.default.value, outcome: 'defaulted' };
  }

  const got = candidatesAt(deps, form, text, depth);
  if (got === AMBIGUOUS) return ambiguous;
  return got.length === 0 ? missing : { value: got[0]!, outcome: 'exact' };
}

/**
 * Every candidate one form yields over one text, in text order — `43 §5.3`'s candidate contract.
 *
 * THE CANDIDATES COME FROM THE ANCHOR AND, WHEN A READER WAS HANDED DOWN, FROM INSIDE THE SLICE.
 * Each occurrence of the anchor is a slice and the slices' values concatenate, so
 * `nth: { n: 2, of: { money: { after: 'EGP', currency: 'EGP' } } }` reads the second amount and a
 * bare form still reads the first. `43 §5.4`'s other half — every match INSIDE one slice, so
 * `{ money: {} }` over "EGP 10 and EGP 20" is two candidates — was this runtime's stated ceiling
 * until the readers could be reached, and this paragraph said so. It is no longer: the three
 * number forms walk their slice, and a record opened without the readers still yields one, which
 * is the ceiling standing where it always did rather than everywhere.
 *
 * AND ONE ANSWER IS NOT A LIST. `enum` and `lookup` answer once for the whole form, and `43 §4.3`
 * has one more word than a list can hold: two readings of the same text is `'ambiguous'`, which is
 * neither a candidate nor the absence of one.
 *
 * A COMBINATOR HAS AT MOST ONE CANDIDATE. It takes a form's candidates and returns one value, so
 * `nth: { n: 2, of: { first: [...] } }` is nothing — correctly, and for the same reason the
 * specification counts combinators separately.
 */
function candidatesAt(deps: IngestDeps, form: Extractor, text: string, depth: number): Candidates {
  if (form === null || typeof form !== 'object' || depth > NESTING) return [];
  if (COMBINATORS.some((key) => key in form)) {
    const got = resolveAt(deps, form, text, depth);
    if (got.outcome === 'ambiguous') return AMBIGUOUS;
    return got.value === null ? [] : [got.value];
  }

  /* `enum` AND `lookup` ANSWER ONCE FOR THE WHOLE FORM, and not once per slice. They match literals
     rather than scanning for a shape, so two slices that answer differently is the same event as
     two literals of equal length inside one: the text said two things. `43 §4.3`'s rule is one
     rule and `@braindog/extract` holds it in one function, so it is reached here rather than
     written twice. */
  const table = literalsOf(deps, form);
  if (table !== null && deps.literals !== undefined) {
    let answer: Json[] | null = null;
    for (const anchored of slices(form as Record<string, unknown>, text)) {
      const got = deps.literals(anchored, table);
      if (got === AMBIGUOUS) return AMBIGUOUS;
      if (got.length === 0) continue;
      if (answer !== null && JSON.stringify(answer) !== JSON.stringify(got)) return AMBIGUOUS;
      answer = got;
    }
    return answer ?? [];
  }

  const out: Json[] = [];
  for (const anchored of slices(form as Record<string, unknown>, text)) {
    /* THE THREE NUMBER FORMS YIELD EVERY MATCH IN THE SLICE AND THE OTHER SEVEN YIELD ONE, which
       is `43 §5.4`'s contract and was this runtime's stated ceiling until the readers could be
       reached. The paragraph above described `{ money: {} }` over "EGP 10 and EGP 20" as two
       candidates there and one here; with the readers handed down it is two in both, and the same
       now goes for `int` and `decimal`. Without them it is still one, because the fallback below
       reads a slice's first number and cannot walk it. */
    const every = candidates(deps, form, anchored);
    if (every !== null) {
      for (const found of every) out.push(found);
      continue;
    }
    const got = value(deps, form, anchored);
    if (got !== null) out.push(got);
  }
  return out;
}

/** `43 §4.3`'s answer when a text said two things: not a value, and not a miss either. */
const AMBIGUOUS = 'ambiguous';

/** What one form yielded over one text — candidates in text order, or the one word neither is. */
type Candidates = Json[] | typeof AMBIGUOUS;

/**
 * The `[literal, value]` table a literal-matching form searches for, or `null` for the other eight.
 *
 * `lookup`'s TABLE IS THE REGISTER'S OWN ROWS, one SELECT, which is what `43 §2` says the record
 * does: *every live row's `by` value*. Reading it here rather than one value at a time is what
 * makes *longest wins* and *equal length is ambiguous* askable at all.
 */
function literalsOf(deps: IngestDeps, form: Extractor): readonly (readonly [string, Json])[] | null {
  if ('enum' in form) return Object.entries(form.enum.map);
  if ('lookup' in form) return deps.rows(form.lookup.register, form.lookup.by).map((r) => [r.value, r.id] as const);
  return null;
}

/**
 * Every match of a number form in one slice, or `null` when this form is not one of the three.
 *
 * ONE PLACE FOR ALL THREE, because they are one decision: whether a reader was handed down. A
 * slice read by `scanMoney` and a slice read by this file's own `number()` are two different
 * grammars, and a record that used one for `money` and the other for `decimal` would answer two
 * ways about the same digits.
 */
function candidates(deps: IngestDeps, form: Extractor, anchored: string): Json[] | null {
  /* `date` IS ITS OWN READER AND NOT ONE OF THE THREE, wired separately because what it costs is
     different: the number readers replace a reading that is WRONG, and this one replaces a reading
     that is BEHIND — four formats where `43 §4.3`'s tokens make more, refused at install rather
     than swallowed. */
  if ('date' in form && deps.dates !== undefined) return deps.dates(anchored, form.date.format);
  const n = deps.numbers;
  if (n === undefined) return null;
  if ('money' in form) return n.money(anchored, form.money.currency) as Json[];
  if ('int' in form) return n.int(anchored);
  /* `sep` IS ONE OF TWO CHARACTERS AND THE TYPE HERE SAYS `string`, because `Extractor` is the
     shape a declaration arrives in and `declare.ts`'s `extractorFault` is what holds it to
     `43 §4.3`'s `"." | ","`. Anything else never reaches this line; the point is the default. */
  if ('decimal' in form) return n.decimal(anchored, form.decimal.sep === ',' ? ',' : '.');
  return null;
}

/** One of the ten value forms over one slice. The anchors are already applied. */
function value(deps: IngestDeps, form: Extractor, anchored: string): Json | null {
  /* A BARE ANCHOR HANDS BACK THE SLICE IT CUT, and `43 §4.3` gives the trim to `text` and to `text`
     alone — *the slice with whitespace collapsed and trimmed*. That contrast is the whole reason
     `{ text: { after } }` exists beside `{ after }`, and trimming both made the pair mean one
     thing. The `|| null` went with it: an anchor at the very start of a message cuts an empty
     slice, and an empty slice is what the message said there, not the message failing to say. */
  if ('after' in form || 'before' in form || 'between' in form) return anchored;
  if ('text' in form) return anchored.replace(/\s+/g, ' ').trim() || null;

  /* THE READERS FIRST, so the one-value path and the candidate path cannot answer differently
     about the same slice. `candidatesAt` reaches them before this function for the three number
     forms, so what follows is what a `first:` or a `default:` arm runs through; both have to mean
     the same thing or a form's meaning would depend on what it was nested inside. */
  const every = candidates(deps, form, anchored);
  if (every !== null) return every[0] ?? null;

  if ('money' in form) {
    /* BELOW HERE IS THE READING FOR A RECORD WITH NO READERS WIRED, KEPT WHOLE.
       It parses the number and takes the currency from the declaration, and the paragraph that
       defended that said reading one out of a payload means guessing from a symbol, `$` being at
       least five currencies. Half of that was right and the wrong half was expensive: an
       unambiguous ISO code beside the number is the provider saying what it sent, not a guess, and
       telling `EGP` from `VAT` needs only the list of codes. This package has not got one, so the
       old reading stays exactly as it was here and `NumberReaders` is how a record gets the other. */
    /* AND THE THOUSANDS SEPARATOR IS DECLARED HERE TOO. `decimal` took one and `money` did not, so
       every European amount was read a thousand times too small — €1.234,56 became €1.23 — which is
       the worst possible place for that bug because the row still looks plausible. */
    /* THE CURRENCY'S OWN EXPONENT, from `Intl` and cached — 07 §3, and no currency table is shipped
       anywhere. It governs BOTH halves: a lone separator followed by three digits is grouping
       *unless the exponent is 3*, so `KWD 1.250` is one and a quarter dinars rather than one
       thousand two hundred and fifty; and the scale is `10 ** exponent`, so `JPY 1250` is 1250 yen
       and not 125,000 of a subunit that does not exist. Both were hard-coded at two. */
    if (!form.money.currency) return null;
    const exp = exponentOf(form.money.currency);
    const n = number(anchored, undefined, exp);
    if (n === null) return null;
    /* A VALUE THAT WOULD NEED ROUNDING IS REFUSED — 07 §3, and it is the difference between an
       extractor that is wrong and one that says it cannot read this. `USD 10.555` is not 1056 minor
       units; it is a payload whose pattern does not fit, and writing the rounded figure puts a
       number nobody sent into a ledger. */
    const minor = n * 10 ** exp;
    if (Math.abs(minor - Math.round(minor)) > 1e-6) return null;
    return { amount: Math.round(minor), currency: form.money.currency };
  }

  /* AND THE DATE FALLBACK, reached only when no reader was handed down. `day` reads four formats
     where `43 §9.3`'s table has seven, and one day per slice where `§5.4` says every one. */
  if ('date' in form) return day(anchored, form.date.format);

  /* AND THESE TWO ARE THE FALLBACK AS WELL, wrong against `43 §4.3` in the two ways its rows
     name and kept whole for the same reason the money one is. `int` is *no fraction*, so
     `1,250.00` is not an integer written with grouping, it is a decimal and this form reads
     nothing; `number()` drops the fraction and hands back 1250. `decimal`'s `sep` is its point and
     *the other separator groups*, so `1.234,56` under the default `sep` is a number this
     declaration cannot read; `number()` reads 123456, a hundredfold, which is iteration fourteen's
     defect class on the field most likely to hold a price. */
  if ('int' in form) {
    const n = number(anchored);
    return n === null || !Number.isInteger(n) ? null : n;
  }
  if ('decimal' in form) {
    const n = number(anchored, form.decimal.sep ?? '.');
    return n;
  }
  /* AND THESE TWO ARE THE FALLBACK AS WELL, kept whole for the same reason the other three are.
     Both are wrong against `43 §4.3` and neither can be half-fixed into anything better than the
     reader a record hands down, so a record opened without one keeps the reading it always had
     rather than a sixth behaviour nobody has a test for. */
  if ('enum' in form) {
    /* THE LONGEST LITERAL FIRST, so a map with both `paid` and `unpaid` in it does not read "unpaid"
       as "paid" because that key happened to be tried first. IT IS A SUBSTRING MATCH AND `§4.3`
       SAYS WHOLE TOKEN, so `coin` reads as the literal `in` — a legal value for the field, off a
       fragment of an unrelated word, which is why nothing downstream catches it. And two literals
       of equal length both present are decided by `Object.keys` order rather than called
       ambiguous. */
    for (const literal of Object.keys(form.enum.map).sort((a, b) => b.length - a.length))
      if (anchored.toLowerCase().includes(literal.toLowerCase())) return form.enum.map[literal] ?? null;
    return null;
  }
  if ('lookup' in form) {
    /* THE FIRST TOKEN, not the rest of the payload — and `§4.3` says the id whose value occurs as
       a whole token ANYWHERE in the slice. So a form with no anchor over `Card 1234 debited…`
       looks up `Card`, finds nothing, and is silent on every arrival; a value of more than one
       word cannot be found at all, because a token is one word. */
    const said = /\S+/.exec(anchored)?.[0]?.replace(/[.,;:]+$/, '') ?? '';
    if (!said) return null;
    return deps.rows(form.lookup.register, form.lookup.by).find((r) => r.value === said)?.id ?? null;
  }
  return null;
}

/**
 * Every slice the anchors name, in text order. No anchor is the whole text, once; an anchor that is
 * nowhere in the text is no slices, which is how a form reads nothing rather than reading the lot.
 *
 * THIS RETURNED ONE SLICE AND `nth` NEEDS THE LIST. `43 §5.3` is explicit — "each occurrence of the
 * anchor literal, advancing past every hit, yields one slice; candidates concatenate in text order"
 * — and the single-slice version was the first occurrence, which is candidate 1 and still is, byte
 * for byte, for every declaration that exists.
 *
 * NOTHING THIS RETURNS FIRST HAS MOVED, and the reason is worth stating because it is the only thing
 * that makes the change safe to make under money: under `after` and `between` every slice is a
 * SUFFIX of the one before it, so a closing `B` that is missing from the first slice is missing from
 * all of them, and under `before` every slice is a PREFIX of the next. An occurrence that yields
 * nothing can therefore only be at the end of the walk, and skipping it rather than ending the walk
 * is a rule that can change candidate 2 onward and never candidate 1.
 */
function slices(form: Record<string, unknown>, text: string): string[] {
  /* `note:` IS LEGAL ON EVERY FORM AND IS NOT THE FORM — `42 §4`: *a note is data, not a YAML
     comment. Legal on every declaration, field, block, section and action.* `declare` filters it
     out of an extractor's keys in three places and this line did not, so `{ note: "the SMS one",
     money: { after: "EGP" } }` took the note's own text as the specification, found no anchor in
     it and read the whole message. Written first it silenced the anchor; written second it did
     nothing. A key whose only job is to be ignored has to be ignored everywhere. */
  const inner = (Object.entries(form).find(([key]) => key !== 'note')?.[1] ?? {}) as Record<string, unknown>;
  const spec = 'after' in form || 'before' in form || 'between' in form ? form : inner;

  /* AN EMPTY LITERAL IS NOT AN ANCHOR. `indexOf('')` is 0 at every index, so walking one would cut
     the text into one slice per character; `43 §4.3` requires a literal of at least one character
     and `declare` refuses a shorter one. Treated here as no anchor at all, which is what the
     single-slice walk did with it. */
  const literal = (at: unknown): string | null => (typeof at === 'string' && at.length > 0 ? at : null);

  /* THE MATCH IS A CASE AWAY AND THE VALUE IS NOT. `43 §4.3`: *literal matching is ASCII-case-
     insensitive over a parallel folded string, so positions align (`34 §1.2`'s `contains` rule);
     values are sliced from the unfolded text*. Every `indexOf` below runs over `folded` and every
     slice is cut out of `text`, which is what makes those two sentences one implementation.

     ASCII AND NO FURTHER, deliberately. A fold that changes a length changes every index after it
     — `ß` is two letters lowered, `İ` is two characters — and an index that has drifted cuts the
     value somewhere the provider never put a boundary. So `É` is not `é` here. That is a stated
     limit of the anchors rather than an oversight, and the money and date readers one rank down
     fold their own tokens properly because they return values, not positions. */
  const folded = fold(text);
  const seek = (needle: string, from: number): number => folded.indexOf(fold(needle), from);

  const between = Array.isArray(spec.between) ? (spec.between as [string, string]) : null;
  if (between !== null) {
    const [a, b] = between;
    const out: string[] = [];
    if (literal(a) === null) return out;
    for (let at = seek(a, 0); at >= 0; at = seek(a, at + a.length)) {
      const from = at + a.length;
      const to = seek(b, from);
      /* AN `A` WITH NO `B` YIELDS NOTHING AND DOES NOT END THE WALK — `43 §4.3`, verbatim. */
      if (to >= 0) out.push(text.slice(from, to));
    }
    return out;
  }

  const after = literal(spec.after);
  const before = literal(spec.before);

  if (after !== null) {
    const out: string[] = [];
    for (let at = seek(after, 0); at >= 0; at = seek(after, at + after.length)) {
      const from = at + after.length;
      if (before === null) {
        out.push(text.slice(from));
        continue;
      }
      const to = seek(before, from);
      if (to >= 0) out.push(text.slice(from, to));
    }
    return out;
  }

  /* `before` WALKS ITS OCCURRENCES LIKE THE OTHER TWO — `43 §4.3`: *the text before EACH occurrence
     of `L`, from the start*. It used to cut once and hand back one slice, so `nth: 2` over a
     `before` could not reach candidate 2 out of any message that has ever arrived: the list it
     counted through was one long. Candidate 1 is the same slice it always was. */
  if (before !== null) {
    const out: string[] = [];
    for (let at = seek(before, 0); at >= 0; at = seek(before, at + before.length)) out.push(text.slice(0, at));
    return out;
  }
  return [text];
}

/**
 * `text` with `A`–`Z` lowered and nothing else touched, so `folded[i]` is `text[i]` for every `i`.
 *
 * `String.prototype.toLowerCase` is the wrong tool one character in a thousand and that is enough:
 * it is locale-independent but not length-preserving, and a single `İ` in a subject line would
 * shift every anchor after it by one and cut every value one character short.
 */
function fold(text: string): string {
  return text.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

/** The first number in a run of text, with its separators. `null` when there is none. */
/**
 * How many minor units make one of a currency, from `Intl` — never from a table.
 *
 * CACHED PER CODE, because `Intl.NumberFormat` is not free and this runs per field per arrival. Two
 * for most, three for the Gulf dinars, zero for the yen; and an unknown code gets two, which is the
 * only guess available and the one every unknown code is.
 */
/**
 * Currencies whose minor unit is not two decimal places. `ISO 4217`, and it is a table on purpose.
 *
 * IT WAS `Intl`, AND `Intl` IS NOT ISO 4217. CLDR carries a *formatting* convention — what a person
 * in that country expects to SEE — and ISO carries the minor unit, which is what a record stores.
 * They disagree on real currencies, and the disagreement was a hundred- or thousand-fold error on a
 * screen:
 *
 *   - `IQD`: ISO 3, `Intl` 0. So `IQD 1.250` was read by the grouping rule as one thousand two
 *     hundred and fifty dinars, stored as `1250`, and then divided by 10³ for display — printing
 *     `IQD 1.250` back. One and a quarter dinars on screen for a number the record holds as 1,250.
 *   - `CLF`: ISO 4, `Intl` 4, `braindog-render`'s table 2. A hundredfold, the other way.
 *   - `MGA`: ISO 2, `Intl` 0.
 *
 * AND `CLF` WAS IN THAT LIST AND NOT IN THE TABLE BELOW IT. The paragraph naming the hundredfold
 * error sat four lines above a table that did not have the row, so both copies fell to `?? 2` and
 * `money(1_000_000, 'CLF')` printed `CLF 10,000.00` for `CLF 100.0000`. `UYW` is the other
 * exponent-4 code and was missing from both as well — they are the only two in ISO 4217.
 *
 * The drift test named `CLF` explicitly and passed, because it compared the two tables to each other
 * and they were wrong in the same way. It compares the UNION of their keys against ISO now: agreement
 * between two copies is not correctness, and a check that enumerates one side's keys cannot see a
 * code the other side has.
 *
 * AND THIS TABLE IS `braindog-render`'s, BYTE FOR BYTE. The two cannot be one module: `render` is the
 * published block dialect and depends on no `@braindog/*` package, and the kernel must not depend on
 * a published renderer. So they are two copies with a test that compares them — which is the same
 * shape `event-kinds` uses for the one other list that has to say the same thing in two places.
 *
 * A CODE THE TABLE DOES NOT NAME IS TWO, which is what most currencies are and what every unknown
 * one is read as. An extractor that dies on an unusual code is worse than one that reads it as most
 * are read.
 */
export const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

/**
 * An amount in minor units as a person reads it, `GBP 1,299.00`, `JPY 129,900`, `KWD 1.500`: code
 * first, the currency's own decimals, and the minus `braindog-render`'s `money` draws. For text that
 * leaves the record without passing through the renderer, a digest's email and its note.
 */
export function moneyText(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const body = (Math.abs(minor) / 10 ** exp).toLocaleString('en-u-nu-latn', { minimumFractionDigits: exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${minor < 0 ? '−' : ''}${body}`;
}

function number(text: string, sep?: string, exponent = 2): number | null {
  /* ONE NUMBER, AND A SPACE ONLY WHERE A GROUP OF THREE FOLLOWS IT. A character class that took any
     whitespace read `EGP 250 2 items` as 250,200 — the digits of the next word glued on, and a
     ledger row nobody reads twice. */
  /* A SPACE GROUPS ONLY IN THREES; A MARK MAY BE FOLLOWED BY ANY RUN. The two were one class with a
     `\d{3}` requirement, so `10.5555` matched `10.555` and abandoned the last digit — reading a
     four-decimal amount as a grouped one, which is the arithmetic this function exists to get right.
     The three-digit guard belongs on the whitespace alternative alone, where it stops
     `EGP 250 2 items` reading as 250,200. */
  /* A SPACED GROUP IS EXACTLY THREE DIGITS, AND THE FOURTH ENDS THE NUMBER. `1 2345` matched
     `1 234` and dropped the trailing digit — a plausible row for a number nobody sent, the same
     defect the mark branch had and still on this one. With the lookahead, ` 2345` is not a group at
     all, so `EGP 1 2345` reads as `1` for the same reason `EGP 250 2 items` reads as `250`: a space
     followed by something that is not a group of three is the end of the number, not part of it. */
  const m = /-?\d+(?:[\s'][0-9]{3}(?![0-9]))*(?:[.,]\d+)*/.exec(text);
  if (!m) return null;

  const raw = m[0].replace(/[\s']/g, '');
  const marks = [...raw.matchAll(/[.,]/g)];

  /* 07 §3'S THOUSANDS RULE, READ OFF THE DIGITS RATHER THAN DECLARED.

     `sep` WAS THE WHOLE OF IT AND IT DEFAULTED TO A COMMA, so `1.250` read as 1.25 — a European
     amount a thousand times too small, on a row that still looks plausible — and `int` had no way to
     pass one at all, so `Quantity: 2.000` read as 2 and `1.500` read as null: the same declaration
     refusing one payload and silently mis-reading the next.

     THE DIGITS SAY WHICH IS WHICH. A lone separator followed by exactly three digits is grouping; a
     lone one followed by any other count is the decimal point; with two or more, the LAST one that
     differs from the others is the decimal point and the rest are grouping. That rule is `money`'s
     and `int`'s, and it is all either of them needs: it reads `EUR 1.234,56` and `EUR 1.234.567,89`
     the European way without being told, which is why `money` no longer declares a separator.

     `sep` IS THE DECIMAL POINT AND ONLY `decimal` PASSES ONE. `43 §4.3`: *`sep` default `"."` —
     each decimal in the slice; the other separator groups.* A bare decimal has no currency, so no
     exponent breaks the tie the digits leave in `1.250`, and the declaration decides instead.

     THIS PARAMETER MEANT THE OTHER THING UNTIL SEPTEMBER 19th 2026, because the helper was written
     for `money`, where `sep` named the thousands character, and `decimal` inherited that meaning by
     sharing it. `{ decimal: { sep: ',' } }` over `EGP 1.234,56` read 123456 where `43 §4.3` and
     `@braindog/extract` both read 1234.56 — a hundredfold, silently, on the line a European bank's
     SMS writes. Nothing in the tree declared one, so the defect was in the grammar rather than in
     anybody's rows. */
  const decimalAt = ((): number | null => {
    if (marks.length === 0) return null;
    const last = marks.at(-1)!;
    if (sep !== undefined) return last[0] === sep ? last.index : null;
    /* UNLESS THE EXPONENT IS 3, which is 07 §3's own clause and the reason this takes one: in a
       currency with three minor digits, `1.250` is a decimal and not a group. */
    if (marks.length === 1) return raw.length - last.index - 1 === 3 && exponent !== 3 ? null : last.index;
    const kinds = new Set(marks.map((x) => x[0]));
    return kinds.size === 1 ? null : last.index;
  })();

  const digits = decimalAt === null
    ? raw.replace(/[.,]/g, '')
    : `${raw.slice(0, decimalAt).replace(/[.,]/g, '')}.${raw.slice(decimalAt + 1).replace(/[.,]/g, '')}`;

  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * BOUNDED AT BOTH ENDS, or `DD/MM/YY` reads `03/04/2026` as the third of April 2020.
 *
 * The round-trip check below passes that happily — 2020-04-03 is a real day — and a due date six
 * years in the past sorts before everything for ever. A format is a claim about the whole run of
 * digits, not about its first two.
 */
const FORMATS: Record<string, RegExp> = {
  'DD/MM/YY': /(?<!\d)(\d{2})\/(\d{2})\/(\d{2})(?!\d)/,
  'DD/MM/YYYY': /(?<!\d)(\d{2})\/(\d{2})\/(\d{4})(?!\d)/,
  'MM/DD/YYYY': /(?<!\d)(\d{2})\/(\d{2})\/(\d{4})(?!\d)/,
  'YYYY-MM-DD': /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/,
};

/**
 * The formats `day` reads, which is what `declare` checks a `date:` form against at install.
 *
 * EXPORTED RATHER THAN COPIED. A format outside this table made `day` return `null`, which is also
 * what it returns for a text holding no date, so the two were one answer and nothing upstream could
 * tell them apart. A second list in `declare.ts` would be the drift `MATCH_FIELDS` records.
 */
/**
 * A day, in the format the pattern DECLARES.
 *
 * NEVER A GUESS. `03/04/26` is the third of April in Britain and the fourth of March in America, and
 * an extractor that decided which by looking at the number would be right most of the time and
 * wrong about every date before the thirteenth. The format is part of the pattern or the pattern is
 * not finished.
 */
export function day(text: string, format: string): string | null {
  const re = FORMATS[format];
  if (!re) return null;
  const m = re.exec(text);
  if (!m) return null;

  const [a, b, c] = [m[1]!, m[2]!, m[3]!];
  const parts =
    format === 'YYYY-MM-DD'
      ? { y: a, mo: b, d: c }
      : format === 'MM/DD/YYYY'
        ? { y: c, mo: a, d: b }
        : { y: c.length === 2 ? `20${c}` : c, mo: b, d: a };

  const iso = `${parts.y}-${parts.mo}-${parts.d}`;
  /* THE SHAPE IS NOT THE CHECK, here as everywhere: `31/02/26` matches the pattern and is not a day,
     and a row dated the thirty-first of February sorts between January and March for ever. */
  return Number.isFinite(Date.parse(`${iso}T12:00:00Z`)) && new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

const lower = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

/** What a refusal from the pipeline looks like when it is about the declaration rather than a row. */
export const badIngest = (fix: string, at: string): Refusal => ({ code: 'DECLARATION_INVALID', fix, at });
