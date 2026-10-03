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
import { fixOf, no, ok, refused } from '@braindog/ports';
import { jsonPath, evaluate, INBOX_RAW, type Predicate, type Schema } from '@braindog/where';

import type { Entry, Json } from './index.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';
import { slashMayWrite } from './slash.ts';
import { parseAnswer, readRow, type Mapping } from './map.ts';
import { startAtDoor } from './script.ts';

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
 * FIVE OF `43 §4.3`'s SIX, AND `tail` BELOW, WHICH IS THIS RECORD'S OWN. This said four, and said
 * `ambiguous` "belongs to a scanner that returns every match — this runtime has neither". Half of that was true when it was written and neither half is
 * now: the number forms got their scanner, and `enum` and `lookup` never needed one to be
 * ambiguous. Two literals of equal length with different values, both present, is a text that said
 * two things, and answering it with either one is a guess written into a register.
 *
 * `invalid` IS STILL HONESTLY ABSENT. It is a field-shape check against `34 §3` and nothing here
 * runs one, so it stays out rather than becoming a word in a type that no code path can emit.
 *
 * `tail` IS A `lookup` THAT FOUND ITS ROW ONLY BY DIGITS PRINTED BEHIND STARS. The row is read, and it is read from a
 * part of the account number, so the first arrival filed that way for one ingest, account and tail waits for a person
 * and the later ones file at `exact` once somebody has accepted one (`confirmedTail`). A misfiled transfer is wrong
 * money, and one confirmation per account costs little.
 */
export type FieldOutcome = 'exact' | 'chosen' | 'defaulted' | 'missing' | 'ambiguous' | 'tail';

/**
 * What one field's form yielded, and how.
 *
 * `tail` CARRIES WHAT THE SENTENCE AND THE CONFIRMATION NEED, present exactly when `outcome` is `tail`: the digits
 * the message printed and the list the lookup read.
 */
export type Extracted = { value: Json | null; outcome: FieldOutcome; tail?: { digits: string; register: string } };

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

/**
 * `07 §3`'s answers to an arrival the `dedupe:` says is already filed, with `review` after the three it lists.
 *
 * EXPORTED FOR THE INSTALL CHECK THAT DOES NOT EXIST YET. Nothing refuses a value outside this list at install:
 * measured: `on_conflict: 'bogus'` installed clean and then behaved as `new`, because `arrive` asks only whether the
 * value is `skip`, `update` or `review`. The check belongs beside `dedupeFault` in `declare.ts`, and this is the list
 * it would read, so the type and the check cannot name different sets.
 */
export const ON_CONFLICTS = ['skip', 'update', 'new', 'review'] as const;

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
    /**
     * A FIXED VALUE ON EVERY ROW THIS PATTERN WRITES, never derived from the payload. An extract has
     * no constant form of its own — `43 §4`'s nine transforms all read the message — so a field a bank
     * pack needs on every row (money-core's `book`) had no honest way in: `default:` is an extractor
     * that runs over a form and files its outcome at `proposed`, and an empty `ref` value is refused
     * outright, so an unset setting could not be left out either.
     *
     * `{{config:<key>}}` IS FILLED AT INSTALL (`declare.ts` `fillConfig`) AND NEVER LIVE, same as
     * everywhere else a placeholder appears. A setting that is empty leaves the field out of the row
     * rather than writing an empty string in; a setting with a value writes it, always at `exact`,
     * because nothing here was read off the payload for a person to check.
     */
    set?: Record<string, string>;
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
  /**
   * What an arrival the `dedupe:` says the register already holds does: dropped with a reason, written over the row,
   * written beside it, or held for a person.
   *
   * `review` IS FOR A KEY THAT CANNOT TELL A RESEND FROM A SECOND MOVEMENT. A hundred real bank texts held two card
   * alerts with the same amount, merchant and day, whose available limits differ by exactly the charge, and `skip`
   * filed the second as already said with no screen ever asking. Before this value a declaration carrying it installed
   * clean and behaved as `new` (`test/ingest-review.test.ts`), because nothing checks the value at install and the
   * write path asked only whether it was `update`.
   */
  on_conflict?: (typeof ON_CONFLICTS)[number];
  /**
   * The webhook ingest whose URL this pattern also reads, by its id: an arrival named for that door is offered the
   * door's own pattern first and then every pattern naming it, in declaration order.
   *
   * ONE ADDRESS READ ONE WORDING, and a phone sends several. His Shortcut posts every HSBC text to one URL, and with a
   * named arrival offered only its own ingest it needed six branches chosen by a phrase, one per wording, where a text
   * sent down the wrong branch was stored `untriaged` and filed as nothing (`test/ingest-door.test.ts`, measured before).
   *
   * THE TOKEN IS STILL THE DOOR'S. The host checks the segment against the named ingest's digest and hands the record
   * the verdict, so a pattern naming a door buys nothing a stranger could not already reach: it reads bytes that
   * door's sender vouched for, and is offered nothing when they did not. `declare.ts` refuses a door that is not an
   * installed webhook taking a path token, since a name nothing can arrive at is a pattern that never fires.
   */
  door?: string;
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
  /**
   * Whether anything proved this payload came from the sender the ingest expects (`12 §3`, `49 §5.16`).
   *
   * `false` MAKES THE ROW INELIGIBLE TO MATCH, and that is the whole of the member. The host had
   * carried this flag since `/in/*` was written and there was nowhere to put it, so the rule
   * *"an unverified payload is stored `untriaged` and never matched"* had a host half and no record
   * half: a stranger with the URL and a wrong token got the bytes stored, matched, extracted and
   * written into a register, which is the forged bank alert `12 §3` exists to stop.
   *
   * ABSENT IS NOT `false`, AND THE DIFFERENCE IS LOAD BEARING. Only the two channels that terminate
   * at a public door can answer this question at all; `pull`, `paste` and `api` arrive from a
   * caller the record has already authenticated, and reading their silence as "unverified" would
   * have made every connector answer and every pasted payload untriaged for ever.
   */
  verified?: boolean;
  /**
   * The one ingest this arrival is for, when the door that took it knows (`/in/webhook/<rec>/<ingest>/<token>`).
   *
   * NAMED, ONLY THAT INGEST'S PATTERN IS TRIED, and then the patterns that declare it as their `door:`. The URL's
   * token was checked against this ingest's digest and no other, and both hosts dropped the name on the way in, so the record offered a verified webhook to every
   * webhook pattern in declaration order: two ingests that matched one text sent every arrival to the first,
   * written by the first's extraction under a token minted for the second (`test/arrive-ingest.test.ts`).
   *
   * ABSENT IS EVERY INGEST ON THE CHANNEL, which is what mail needs. One forwarding address serves the whole
   * record, so a message has no ingest to name.
   */
  ingest?: string;
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
  /*
   * THE THIRD ARGUMENT NAMES THE FORM, and `lookup` is the one that passes it. `lookup` has a rule `enum` must not
   * have: digits printed behind stars are the tail of the one row whose longer value ends in them (measured on real
   * bank texts, where one account printed two ways sent one family of a bank's messages to review whichever `last4` was
   * typed). An argument rather than a second seam, so a record already handing down `matchLiterals` reaches the new
   * rule without a line of new wiring.
   */
  literals?: ((text: string, entries: readonly (readonly [string, Json])[], form?: 'enum' | 'lookup') => Json[] | 'ambiguous') | undefined;
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
   * `43 §4.5`'s `day`, when the record handed it down: the ONE day a `map:` field's value holds under
   * `format`, or `null`.
   *
   * THE SAME GRAMMAR AS `dates` AND A DIFFERENT QUESTION, which is why it is an eighth value across the
   * seam and not a use of the seventh. `dates` scans a slice of an email for every day in it, so `nth:`
   * has something to count; this reads one field of a JSON answer that is supposed to BE a day. Their
   * return types say it: `string[]` against `string | null`.
   *
   * ABSENT IS `day()` BELOW, four formats keyed by name, which is what a kernel used bare has always
   * read and must keep reading. Wired, `43 §9.3`'s other three rows — `D/M/YY`, `DD.MM.YYYY` and
   * `DDMMYYYY` — are read too. Until this existed there was no way for a caller to supply one: `dates`
   * reached the `extract:` text path only, so the `map:` path was still on the four while `declare`
   * had already stopped refusing the rest.
   *
   * IT MUST NOT THROW. `map.ts` promises *"NOTHING HERE THROWS"* at this point, and
   * `@braindog/extract`'s `parseDate` raises `DATE_FORMAT_INVALID` for a format the grammar does not
   * admit, so whoever wires it catches that and answers `null`. A format that bad is `declare`'s to
   * refuse at install; arriving here it costs one field, not the whole arrival.
   */
  day?: ((text: string, format: string) => string | null) | undefined;
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
  /**
   * The settings of the use case the record speaks in, when the record handed them down (`speakingSettings` in
   * `declare.ts`): `label_<list>` and `label_<list>__<field>` are what a person renamed a list and its fields to, so a
   * question an arrival asks names them as every page does ("Add this message to Spending?"). Absent, or a word whose
   * setting is kept by its hash, is the declaration's own word, which is what the page says until somebody renames it.
   */
  words?: (() => Readonly<Record<string, Json>>) | undefined;
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
 * Why an arrival nothing vouched for is sitting in the inbox, written on the row itself.
 *
 * ON THE ROW, BECAUSE `inbox_raw` HAS NO `verified` COLUMN AND A SENTENCE IS WORTH MORE THAN A FLAG.
 * `reason` is already the column that says why a row is where it is — `0001_kernel.ts` calls it
 * *"why `skipped`, why `review` — the one place a wrong skip shows"* — and the person reading the
 * inbox needs to know that the payload was not ignored by their pattern, it was never offered to
 * one. A boolean column would have said the same thing to a query and nothing to a reader.
 *
 * AND `propose` READS IT BACK, which is the other reason it is one exact string and not prose that
 * varies. Three forgeries from one address must not buy a model call.
 */
export const UNVERIFIED = 'nothing verified this arrival, so no pattern was offered it';

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
    const already = deps.sql.one<{ id: string; state: string; reason: string | null }>(
      'SELECT id, state, reason FROM inbox_raw WHERE channel = ? AND sha256 = ?',
      arrival.channel,
      arrival.sha256,
    );

    /**
     * BUT A REDELIVERY IS THE SAME BYTES AT A DOOR THAT ACCEPTED THEM, NOT ANY EARLIER SIGHTING OF THEM.
     *
     * The key was checked before any matching, so the first door to see a set of bytes decided what they were
     * for good, and two ordinary orders of events lost a write while both posts answered 202
     * (`test/arrive-redelivery.test.ts`). A Shortcut still holding a rotated token stored a withdrawal
     * `untriaged` with `UNVERIFIED` on it, and the same SMS sent again with the right token came back
     * `redelivered` with nothing written. A credit posted to the withdrawal twin's URL a few milliseconds before
     * the credit twin's was stored `untriaged` by a pattern that does not read credits, and the credit URL then
     * answered `redelivered` with zero rows in `in`.
     *
     * SO AN UNTRIAGED ROW THAT NOTHING WAS OFFERED, OR THAT WAS OFFERED TO ONE NAMED DOOR, IS RUN AGAIN when a
     * verified arrival brings the same bytes, on the row itself: `UNIQUE (channel, sha256)` still holds, and
     * the pipeline below writes through the stored row's id instead of beside it. Everything else keeps the
     * old answer. A row any pattern accepted (`matched`, `review`, `proposed`, `skipped`) is spoken for, a row
     * a person filed or archived has left the inbox, and an unverified arrival is never offered a pattern, so
     * it cannot rescue or undo anything.
     *
     * UNNAMED MAIL IS NOT RUN AGAIN. It was offered to every mail pattern the first time, so an untriaged mail
     * with no `UNVERIFIED` on it has had the only answer this record can give it.
     */
    const rescue =
      already !== undefined &&
      already.state === 'untriaged' &&
      arrival.verified !== false &&
      (already.reason === UNVERIFIED || arrival.ingest !== undefined);
    if (already && !rescue) {
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

    const raw = already ? already.id : deps.mint();
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

    /**
     * `12 §3`: AN UNVERIFIED PAYLOAD IS STORED AND NEVER MATCHED, and the declarations are not even
     * read for one.
     *
     * INELIGIBLE RATHER THAN MARKED, which is the difference between this and a `verified` column
     * somebody has to remember to consult. The host has carried the flag since `/in/*` was built
     * and the record had nowhere to read it from, so every check `12 §3` describes was on the far
     * side of a seam: a stranger holding a webhook URL and sending a wrong token had the bytes
     * stored, matched against every pattern on the record, extracted and written into a register
     * as though the bank had sent them.
     *
     * NOT READING `ingests()` IS PART OF IT AND NOT AN OPTIMISATION. A flood of forgeries at one
     * ingest then costs one INSERT each and no declaration parse, which matters because this door
     * is the one surface a stranger reaches with no credential and still gets a write out of.
     */
    const unverified = arrival.verified === false;

    /* THE FIRST MATCHING INGEST WINS, and the order is the declaration order. Two patterns that both
       match one payload is a thing to notice rather than a thing to merge — merging two extractions
       produces a row neither declaration describes.

       UNLESS THE ARRIVAL NAMES ONE, and then it is that ingest, a pattern naming it as its door, or none. A
       named ingest whose pattern does not match, where no pattern naming it matches either, leaves the payload
       untriaged rather than handing it to a neighbour that does, because the neighbour's sender never vouched
       for these bytes.

       A PATTERN THAT NAMES THE DOOR IS NOT A NEIGHBOUR. `door:` is its author saying these bytes arrive at that URL,
       so it is offered them after the door's own pattern, which goes first whatever the declaration order: the door's
       sender is the one the token was minted for. Naming is one step and one way, so a pattern naming `b` where `b`
       names `a` hears arrivals named `b` and never those named `a`, and an arrival named `b` is never handed to `a`. */
    const offered = (all: IngestDecl[]): IngestDecl[] => {
      const here = all.filter((i) => i.channel === arrival.channel);
      if (arrival.ingest === undefined) return here;
      const own = here.filter((i) => i.ingest === arrival.ingest);
      return [...own, ...here.filter((i) => i.ingest !== arrival.ingest && i.door === arrival.ingest)];
    };
    const matched = unverified ? undefined : offered(deps.ingests()).find((i) => i.match === undefined || evaluate(i.match, fields, INBOX_RAW));

    const store = (state: Arrived['state'], reason: string | null): void => {
      /* A RESCUE MOVES THE ROW IT FOUND. The bytes are the same by their hash and the first `ts` is when they
         turned up, so only the verdict changes; an INSERT here would fail on `UNIQUE (channel, sha256)` and roll
         the whole arrival back. */
      if (already) {
        deps.sql.exec('UPDATE inbox_raw SET state = ?, reason = ? WHERE id = ?', state, reason, raw);
        return;
      }
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
      slashMayWrite(actor, kind);
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

    /* A SCRIPT WHOSE `runs.door` IS THIS DOOR STARTS HERE, whatever the patterns make of the bytes: the script is how
       that door is read, and a door with no pattern that matches is the ordinary case for one. The door is the ingest
       the arrival names, or for unnamed mail the one that matched it. Only a verified arrival starts one, and only the
       first time its bytes were offered anything: a redelivery returned above, and a rescued row that was offered before
       (`reason` not `UNVERIFIED`) started its scripts then. */
    const door = arrival.ingest ?? matched?.ingest;
    if (!unverified && door !== undefined && (already === undefined || already.reason === UNVERIFIED))
      startAtDoor(deps.sql, { mint: deps.mint, nowMs: deps.nowMs }, { door, body, headers }, BODY_BYTES_MAX);

    if (!matched) {
      /* UNTRIAGED IS NOT AN ERROR. It is the state a payload is in before anybody has said what it
         means, and the reason `inbox_raw` exists at all: an ingest pipeline whose answer to "I do not
         recognise this" is to drop it is a pipeline whose failures are invisible.

         AND AN UNVERIFIED ONE SAYS WHICH OF THE TWO SILENCES IT IS. Untriaged with no reason is "no
         pattern here recognised this"; untriaged with `UNVERIFIED` on it is "nothing was tried",
         and only the second is answered by fixing the sender's signature rather than the pattern. */
      store('untriaged', unverified ? UNVERIFIED : null);
      /* A RESCUE THAT FOUND NOTHING IS STILL A REDELIVERY when the row reads as it did, which is the same bytes
         at a door that does not want them, again. Answered as new, it would observe the shape and queue a draft
         once per retry, which is the bill the kernel's `redelivered` check exists to stop. A row that loses its
         `UNVERIFIED` is new in the way that matters: it is the first time a pattern was tried. */
      if (already && already.reason === null)
        return ok<Arrived>({ raw, ingest: null, state: 'untriaged', wrote: [], reason: 'this arrived before, and no pattern at this door reads it', redelivered: true });
      return ok<Arrived>({ raw, ingest: null, state: 'untriaged', wrote: [], ...(unverified ? { reason: UNVERIFIED } : {}) });
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
    /**
     * The subset of `missed` the message DID carry and this build could not read (`43 §4.5`).
     *
     * ONLY A `map:` CAN FILL THIS. The `extract:` branch below reads a form over free text, where a
     * form that matches nothing has found nothing — there is no value there to be unreadable, which is
     * why `FieldOutcome` on that path has no `invalid` member at all. A `map:` reads a named path out
     * of a JSON answer, so `{"date": "29.08.2026"}` is a field that was sent and a field we could not
     * read, and those are two different sentences to put in front of a person.
     */
    const invalid: string[] = [];

    /* THE OUTCOME PER FIELD, not only the value — `43 §5.1` step 7 files a row by the worst of them
       and this loop used to keep the value alone. */
    const soft: string[] = [];
    /* AND THE FIELDS A `lookup` FILLED BY A PRINTED TAIL, which the fold below holds for a person until one is accepted. */
    const tails: Tail[] = [];

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
      const got = readRow({ exponent: exponentOf, day: deps.day ?? day }, matched.map, parseAnswer(body), at, (field) => fields[field]?.type);
      Object.assign(extracted, got.fields);
      missed.push(...got.missed);
      soft.push(...got.soft);
      /* AND WHICH OF THE MISSED ONES WERE SENT. `readRow` keeps them apart and this is where the
         distinction has to survive, because `missed` alone cannot tell the reason sentence below
         whether to send a person to the provider or to the format. */
      invalid.push(...got.invalid);
    } else {
      for (const [field, declared] of Object.entries(matched.extract ?? {})) {
        /* A FIELD'S `strip:` IS READ AFTER ITS FORM AND NEVER BY IT. The form is handed on without the key, because
           `slices` takes the first key that is not `note` as the form, and `{ strip, text }` would have cut the text by
           the list of prefixes. A value the prefixes leave empty is a miss, as an empty slice is. */
        const { form, strip } = stripOf(declared);
        const got = resolve(deps, form, text);
        const value = strip === null || typeof got.value !== 'string' ? got.value : stripped(got.value, strip) || null;
        if (value === null) missed.push(field);
        else {
          extracted[field] = value;
          /* A ROW FOUND BY ITS PRINTED TAIL IS NOT A CHOICE OR A DEFAULT, and the fold below says which it is. */
          if (got.outcome === 'tail' && got.tail !== undefined && typeof got.value === 'string')
            tails.push({ field, digits: got.tail.digits, row: got.value, register: got.tail.register });
          else if (got.outcome !== 'exact') soft.push(field);
        }
      }
    }

    /* `writes.set` FILLS IN AFTER THE PAYLOAD, NEVER BEFORE IT, so a field the message itself sent is
       never overwritten by a fixed one. A setting `fillConfig` filled empty is left out rather than
       written as `''`, which a `ref` field would refuse, and neither branch touches `missed` or
       `soft`: a fixed value is not a thing this arrival read, so it cannot lower `confidence`. */
    for (const [field, value] of Object.entries(matched.writes.set ?? {})) {
      if (value !== '' && !Object.hasOwn(extracted, field)) extracted[field] = value;
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

    /* AN EMAIL'S KEPT ATTACHMENTS RIDE ON `x-braindog-files`, and the row this arrival files is where a person reads
       them next: copied on here, beside the arrival itself, so nobody has to find the arrival to see what it came
       with (`gaps.md` §1.2). Only a field the register itself declares `file`, or a list of them, is filled, and only
       one extraction did not already fill: a message read into a `file` field of its own has said which file it means. */
    const kept = keptFiles(headers['x-braindog-files']);
    const firstKept = kept[0];
    if (firstKept !== undefined) {
      const fields = deps.schemaOf(register)?.fields ?? {};
      for (const [field, decl] of Object.entries(fields)) {
        if (Object.hasOwn(extracted, field)) continue;
        if (decl.type === 'file') extracted[field] = firstKept;
        else if (decl.type === 'list' && decl.of === 'file') extracted[field] = kept;
      }
    }

    /* `43 §5.1` STEP 7, ALL THREE LEVELS. A field the pattern could not read is `needs-review`; a
       field it CHOSE between two forms, or DEFAULTED in because the payload did not carry one, is
       `proposed` — read by the record, not sent by anybody, and therefore a thing a person should
       see before it is a row.

       THE MIDDLE LEVEL HAD NO WAY TO BE REACHED and this comment said so: "there is no combinator
       here that chooses or defaults, so there is no honest third outcome to derive". There are three
       now, and `proposed` stopped being a level only a declared ceiling could produce. */
    /* A ROW FOUND ONLY BY ITS PRINTED TAIL IS `proposed` UNTIL A PERSON HAS ACCEPTED ONE: once per ingest, account and
       tail, read from the rowsets this ingest opened and the decisions that accepted them (`confirmedTail`). A lookup
       that matched the whole value never reaches `tails`, so it files as it always did. */
    const pending = tails.filter((t) => !confirmedTail(deps.sql, matched.ingest, t));
    const confidence = worse(
      missed.length ? 'needs-review' : soft.length || pending.length ? 'proposed' : 'exact',
      ceiling,
    );

    /* A FAILURE DOWNGRADES RATHER THAN DISCARDS. The bytes stay, the reason is on them, and the
       extraction goes in front of a person as a `rowset` they can accept — which is the only thing
       that makes a pattern nobody has approved yet safe to leave switched on. */
    if (confidence !== 'exact') {
      const state = confidence === 'proposed' ? 'proposed' : 'review';
      /* THE REASON NAMES FIELD IDS AND NOTHING OUT OF THE PAYLOAD but a printed tail's digits, which end a value the
         record already held (`byTail` below): `43 §6`'s leak rule. The middle arm is new with the combinators:
         "files at ${ceiling}" was the only explanation this could give, and it is a false one when the ceiling is
         `exact` and a field defaulted. */
      /**
       * A FIELD THE MESSAGE NEVER SENT AND A FIELD IT SENT UNREADABLY ARE TWO SENTENCES.
       *
       * `43 §5.1` step 9 ranks them apart (`invalid > ambiguous > missing > …`) and they send a person
       * to two different places: an absent field is a question for whoever sends the message, and an
       * unreadable one is almost always a format that changed at their end and can be fixed here. Both
       * were named by one clause that said *could not read*, which is true of only one of them.
       *
       * THE ABSENT CLAUSE IS WORD FOR WORD WHAT IT WAS. Only the unreadable fields are lifted out of
       * it, so a message with nothing but absent fields reads exactly as it read before and no
       * receipt already in a record changes meaning.
       */
      const absent = missed.filter((field) => !invalid.includes(field));
      const clauses = [
        absent.length ? `${matched.ingest} could not read ${absent.join(', ')} out of this one.` : '',
        invalid.length
          ? `${matched.ingest} found ${invalid.join(', ')} in this one and could not make sense of ${invalid.length === 1 ? 'it' : 'them'}, so the format may have changed.`
          : '',
      ].filter((clause) => clause !== '');
      /**
       * AN ARRIVAL HELD FOR A PERSON WAS TOLD IT HAD BEEN PROPOSED. Both sentences below ended *"so
       * what it read is proposed rather than written"* whatever the state, and under a `needs-review`
       * ceiling the state is `review`, not `proposed`. The seed's `bank-from-unsure`, which files every
       * bank line whose sign is unclear at `needs-review` so a person says which way the money went,
       * read cleanly and put *"bank-from-unsure files at needs-review, so what it read is proposed
       * rather than written"* in front of that person: a level name as the cause and a state it was
       * not in as the effect (`test/ingest-review-reason.test.ts`).
       *
       * SO A HELD ARRIVAL SAYS WHAT HAPPENS TO IT, which is that nothing is written until somebody
       * accepts the suggestion opened below. Where the state really is `proposed` the sentence is word
       * for word what it was, so no receipt already in a record changes meaning.
       */
      const held = state === 'review' ? 'waits for a person on everything it reads, so nothing from this one is written until somebody accepts it.' : '';
      /* THE CEILING IS NAMED ONLY WHEN IT IS WHAT HELD THIS ONE. With nothing missed or soft and the ceiling `exact`,
         the one cause left is a printed tail, and the sentence after this one says so. */
      const cause = missed.length
        ? clauses.join(' ')
        : soft.length
          ? held
            ? `${matched.ingest} chose or defaulted ${soft.join(', ')} rather than reading them, and it ${held}`
            : `${matched.ingest} chose or defaulted ${soft.join(', ')} rather than reading them, so what it read is proposed rather than written.`
          : held
            ? `${matched.ingest} ${held}`
            : ceiling === 'exact'
              ? ''
              : `${matched.ingest} files at ${ceiling}, so what it read is proposed rather than written.`;
      /* A TAIL IS SAID WHATEVER ELSE HELD THE ARRIVAL, because accepting the rowset confirms it, and a person should not
         confirm an account they were never told was read from its last digits. The digits are the end of the value the
         row already holds, so the sentence carries nothing the record did not have before the message came. */
      const byTail = pending.length
        ? `${pending.map((t) => `Filed to ${rowNamed(deps.sql, t)} by its last digits ${t.digits}.`).join(' ')} Confirm it once and later ones file straight away.`
        : '';
      const reason = [cause, byTail].filter((part) => part !== '').join(' ');
      store(state, reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', confidence);

      /* THE QUESTION IS SAID IN A PERSON'S WORDS, the reason in the record's. The reason is the inbox's and stays word for
         word what it was; the question is what Decide draws, and it named the pattern and the list by their ids
         (`heldAsked`). */
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        ...heldAsked(deps, wordsFor(deps, matched, register, arrival.channel), {
          absent,
          invalid,
          soft,
          tails: pending,
          waits: ceiling !== 'exact',
        }),
        ...(pending.length ? { tails: pending } : {}),
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

    /**
     * A NEAR MATCH UNDER `review` IS A QUESTION, NOT A SKIP. The arrival is stored as `review` and the reading goes in
     * front of a person as a rowset: accepting it files the second row, and declining it leaves the one already there.
     *
     * THE REASON NAMES THE ROW AND THE FIELDS BY THEIR LABELS, and nothing out of the payload (`43 §6`'s leak rule, as
     * the reasons above keep it). The row it resembles also rides in the suggestion's body as `resembles`, by id, so a screen can
     * put the two side by side without parsing a sentence.
     */
    if (existing && conflict === 'review') {
      const like = existing.seq === null ? existing.id : `${register}#${existing.seq}`;
      /**
       * A `near` KEY IS NOT "THE SAME" ON ITS DAY OR ITS PREFIX, and the sentence said it was. Every field `named` lists
       * went into one "with the same ..." clause, so the seed's own `SAME_MOVEMENT` key, on two alerts a day apart whose
       * merchants only started alike, read *"with the same amount, account, on and what"* in front of the person being
       * asked to tell them apart. Only the `on:` fields are equal; the day is within one, and the prefix starts alike.
       */
      /* AND A FIELD IS SAID BY ITS LABEL, NOT ITS ID (`fieldSaid`): the declared one in the inbox's reason, and the one a
         person renamed it to, where they did, in the question's detail (`wordsFor`). */
      const schema = deps.schemaOf(register);
      const words = wordsFor(deps, matched, register, arrival.channel);
      const dedupe = matched.dedupe!;
      const equal = Array.isArray(dedupe) ? dedupe : dedupe.near.on;
      const listedIn = (said: (field: string) => string): string =>
        listedAnd([
          ...(equal.length ? [`the same ${listedAnd(equal.map(said))}`] : []),
          ...(Array.isArray(dedupe) ? [] : [`${said(dedupe.near.day)} within a day of it`]),
          ...(!Array.isArray(dedupe) && dedupe.near.prefix ? [`${said(dedupe.near.prefix.field)} starting the same way`] : []),
        ]);
      const reason = `This looks like ${like}, with ${listedIn((field) => fieldSaid(schema, field))}, so ${matched.ingest} held it for a person rather than skip it or file it twice.`;
      store('review', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        resembles: existing.id,
        ...nearAsked(words, rowTitle(deps.sql, register, existing.id), listedIn((field) => words.fields([field]))),
      });
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason, confidence: 'needs-review', suggestion });
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
      /* THE FIELD THE LIST REFUSED IS SAID BY ITS LABEL, and the refusal's own sentence is not, because it names fields
         and lists by their ids. */
      const words = wordsFor(deps, matched, register, arrival.channel);
      const faulted = refused(wrote) && typeof wrote.refusal.at === 'string' ? wrote.refusal.at.replace(/^fields\./, '') : null;
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        question: fit(words, [(source, list) => `${list} would not take ${source} as read. Fix it and add it?`]),
        context:
          faulted !== null && Object.hasOwn(deps.schemaOf(register)?.fields ?? {}, faulted) ? `The part it would not take is its ${words.fields([faulted])}.` : '',
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
 * The `rowset` an unwritten extraction is asked in: a new one, or the same question already open, which takes its row.
 *
 * OPENED BY THE INGEST, NOT BY `system`, so the record knows which pattern produced it: the pattern to fix is found
 * from it, a tail is confirmed for it (`confirmedTail`), and the same question is asked once for it. The question
 * itself names neither the pattern nor the list by an id (`heldAsked`).
 *
 * `context` IS THE QUESTION'S DETAIL, which Decide draws under it as the why (`body.context`, as every other
 * suggestion's), in the same words: what could not be read, by its label, and never an id.
 *
 * THE SAME QUESTION IS ASKED ONCE. Three texts a bank sent with a card nobody had added opened three suggestions, each
 * "bank-card-used-sms could not read account out of this one", and Decide drew them one under another (SG71 to SG73 on
 * the owner's record). So while a rowset this pattern opened is still open with the same words, the same list, the
 * same detail and the same row it looks like, a second is not filed: the arrival's row joins the open one, which Decide
 * draws as one question with a tick a row, as it draws an agent's seven servers.
 *
 * AND ITS ROW JOINS, NEVER GOES. Kept out of every question, the second card's charge was in the inbox alone: accepting
 * the first added one charge, nothing reads a held arrival again when its pattern is fixed, and filed from the inbox
 * by hand it is a row with the message's first line for a title and nothing it read. A question already holding as
 * many rows as one rowset may (`MAX_ROWS` in `govern.ts`) is asked again beside it, rather than grown past what can
 * be accepted.
 */
function openRowset(
  deps: IngestDeps,
  at: string,
  item: { ingest: string; register: string; rows: Record<string, unknown>[]; question: string; context?: string; resembles?: string; tails?: Tail[] },
): string {
  const context = item.context ?? '';
  const asked = deps.sql.one<{ id: string; body: string }>(
    `SELECT s.id, s.body FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest'
      WHERE s.body_kind = 'rowset' AND s.status = 'open' AND s.opened_by = ? AND json_extract(s.body, '$.register') = ?
        AND coalesce(e.to_v, e.note) = ? AND coalesce(json_extract(s.body, '$.context'), '') = ?
        AND coalesce(json_extract(s.body, '$.resembles'), '') = ? AND coalesce(json_array_length(s.body, '$.rows'), 0) + ? <= ?
      ORDER BY s.rowid LIMIT 1`,
    `ingest:${item.ingest}`,
    item.register,
    item.question.slice(0, 280),
    context,
    item.resembles ?? '',
    item.rows.length,
    ROWS_ASKED_MOST,
  );
  const held = asked ? heldBody(asked.body) : null;
  if (asked && held) {
    /* A TAIL ONCE, as `confirmedTail` reads one: the digits and the row they were matched to. */
    const tails = [...held.tails, ...(item.tails ?? []).filter((t) => !held.tails.some((h) => h.digits === t.digits && h.row === t.row))];
    deps.sql.exec(
      'UPDATE suggestion SET body = ? WHERE id = ?',
      JSON.stringify({ ...held.body, rows: [...held.rows, ...item.rows], ...(tails.length ? { tails } : {}) }),
      asked.id,
    );
    return asked.id;
  }
  const id = `SG${deps.allocate('suggestion')}`;
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'rowset', ?, 'open', ?, ?)",
    id,
    JSON.stringify({
      register: item.register,
      rows: item.rows,
      ingest: item.ingest,
      ...(context === '' ? {} : { context }),
      ...(item.resembles === undefined ? {} : { resembles: item.resembles }),
      /* THE TAILS THIS ONE WAITS ON, so accepting it is the confirmation `confirmedTail` reads, with no table beside it. */
      ...(item.tails === undefined ? {} : { tails: item.tails }),
    }),
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

/** The most rows one question an arrival opens holds, as many as `govern.ts` lets one `rowset` carry. */
const ROWS_ASKED_MOST = 200;

/** An open rowset's body as `openRowset` filed it, with its rows and tails, or `null` for one it cannot read. */
function heldBody(text: string): { body: Record<string, unknown>; rows: unknown[]; tails: Tail[] } | null {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body === null || typeof body !== 'object' || !Array.isArray(body.rows)) return null;
    return { body, rows: body.rows, tails: Array.isArray(body.tails) ? (body.tails as Tail[]) : [] };
  } catch {
    return null;
  }
}

/* ── what a person reads: the question an unwritten extraction asks ───── */

/**
 * The most a question an arrival opens says, in characters. Decide draws a question as its heading, and a heading of
 * two hundred characters naming a pattern by its id was the whole of SG71 on the owner's phone.
 */
export const QUESTION_MOST = 80;

/** What came, by the channel it came in on, for a question whose pattern names nothing it came from. */
const CAME_AS: Readonly<Record<Channel, string>> = {
  email: 'this email',
  webhook: 'this message',
  api: 'this message',
  pull: 'this import',
  paste: 'what was pasted',
};

/** A setting's name as a pack may declare one: a longer one is kept by its hash, which a question does not read. */
const SETTING_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * The names an arrival's question is put in, as a person calls each thing: where it came from, the list it would go on
 * and its fields.
 *
 * WHERE IT CAME FROM IS THE PATTERN'S `description`, or that of the door it reads at, which is the name the doors list
 * shows, said with what came: "this message from HSBC texts". A pattern with none is what came alone, "this email",
 * because its id is a word nobody chose for a person to read. `sources` holds the fullest first, so a question too long
 * with the description is said without it.
 */
type Words = { sources: string[]; list: string; fields: (ids: readonly string[]) => string };

function wordsFor(deps: IngestDeps, matched: IngestDecl, register: string, channel: Channel): Words {
  const came = CAME_AS[channel] ?? 'this one';
  const described = (decl: IngestDecl | undefined): string | null => {
    const said = (decl as { description?: unknown } | undefined)?.description;
    return typeof said === 'string' && said.trim() !== '' ? said.trim().replace(/\s+/g, ' ') : null;
  };
  const door = matched.door === undefined ? undefined : deps.ingests().find((i) => i.ingest === matched.door);
  /* A PASTE CAME FROM WHOEVER PASTED IT, whatever the pattern that read it is called. */
  const from = channel === 'paste' ? null : (described(matched) ?? described(door));
  /* THE FIELDS IN THE LIST'S OWN ORDER, the order its columns are drawn in, and not the declaration's sorted keys. */
  const schema = deps.schemaOf(register);
  const order = Object.keys(schema?.fields ?? {});
  const place = (id: string): number => (order.includes(id) ? order.indexOf(id) : order.length);
  /* AND EACH IN THE WORDS THE RECORD SPEAKS, a list or a field a person renamed being called what they renamed it. */
  const settings = deps.words?.() ?? {};
  const renamed = (key: string): string | null => {
    const setting = `label_${key.split('.').join('__')}`;
    const said = SETTING_NAME.test(setting) && Object.hasOwn(settings, setting) ? settings[setting] : undefined;
    return typeof said === 'string' && said.trim() !== '' ? said.trim().replace(/\s+/g, ' ') : null;
  };
  return {
    sources: from === null ? [came] : [`${came} from ${from}`, came],
    list: renamed(register) ?? listName(deps.sql, register),
    fields: (ids) => listedAnd([...ids].sort((a, b) => place(a) - place(b)).map((id) => fieldSaid(schema, id, renamed(`${register}.${id}`)))),
  };
}

/** Words joined as a sentence lists them, each once: `a`, `a and b`, `a, b and c`. */
function listedAnd(words: readonly string[]): string {
  const once = words.filter((word, i) => words.indexOf(word) === i);
  return once.length < 2 ? once.join('') : `${once.slice(0, -1).join(', ')} and ${once.at(-1)}`;
}

/**
 * A FIELD IS SAID BY ITS LABEL, NOT ITS ID. The person asked to tell two rows apart reads "As of" on the list, and read
 * `as_of` here. A label opening one capital is lowered mid-sentence and one in capitals is kept; a field with no label
 * is its id with `_` as a space, the name the list shows for it. `renamed` is the word a person gave it, said the same.
 */
function fieldSaid(schema: Schema | null, field: string, renamed: string | null = null): string {
  const label = renamed ?? schema?.fields[field]?.label;
  if (typeof label !== 'string' || label.trim() === '') return field.replace(/_/g, ' ');
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** A list's declaration as the record holds it now, or `{}`: read from the table, since `IngestDeps` carries no names. */
function declaredList(sql: Sql, register: string): { name?: unknown; title?: unknown; one?: unknown; fields?: unknown } {
  const body = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0",
    `register.${register}`,
  )?.body;
  try {
    return body === undefined ? {} : (JSON.parse(body) as { name?: unknown; title?: unknown; one?: unknown; fields?: unknown });
  } catch {
    return {};
  }
}

/** What a person calls a list: the name its declaration gives it, or its id with `_` as a space. */
function listName(sql: Sql, register: string): string {
  const name = declaredList(sql, register).name;
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  const words = register.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The kinds of title a question names a row by. A ref is an id, and money or a list is no name. */
const TITLED: ReadonlySet<unknown> = new Set(['text', 'url', 'email', 'day']);

/** A row's title, as its list declares it, when that is words a person reads; never a field declared `secret`. */
function rowTitle(sql: Sql, register: string, row: string): string | null {
  const list = declaredList(sql, register);
  const title = typeof list.title === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(list.title) ? list.title : null;
  const fields = Array.isArray(list.fields) ? (list.fields as { id?: unknown; type?: unknown }[]) : [];
  if (title === null || !TITLED.has(fields.find((f) => f?.id === title)?.type)) return null;
  const name = sql.one<{ name: unknown }>(`SELECT json_extract(fields, '${jsonPath(title)}') AS name FROM entry WHERE id = ?`, row)?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim().replace(/\s+/g, ' ') : null;
}

/** A text's length as a person counts it: in characters, not in UTF-16 units. */
const lengthOf = (text: string): number => [...text].length;

/** `text` cut to `most` characters, ending `…` where it was cut. */
function cutTo(text: string, most: number): string {
  const chars = [...text];
  return chars.length <= most ? text : `${chars.slice(0, Math.max(0, most - 1)).join('').trimEnd()}…`;
}

/** One way of saying a question, from where it came from, the list's name and the one name it carries. */
type Say = (source: string, list: string, name: string) => string;

/**
 * The question in at most `QUESTION_MOST` characters.
 *
 * EACH WAY OF SAYING IT, WITH EACH NAME FOR WHERE IT CAME FROM, fullest first, and the first that fits is the question.
 * When none does, the first way is said with the shortest source, `name` cut short and then the list's, so a merchant
 * with a long name is still named rather than the question left long or dropped to "one already there".
 */
function fit(words: Words, says: readonly Say[], name = ''): string {
  for (const say of says)
    for (const source of words.sources) {
      const asked = say(source, words.list, name);
      if (lengthOf(asked) <= QUESTION_MOST) return asked;
    }
  const say = says[0]!;
  const source = words.sources.at(-1)!;
  const over = (named: string, list: string): number => lengthOf(say(source, list, named)) - QUESTION_MOST;
  const named = name === '' || over(name, words.list) <= 0 ? name : cutTo(name, Math.max(8, lengthOf(name) - over(name, words.list)));
  const list = over(named, words.list) <= 0 ? words.list : cutTo(words.list, Math.max(8, lengthOf(words.list) - over(named, words.list)));
  return cutTo(say(source, list, named), QUESTION_MOST);
}

/** A sentence's first letter in capitals, for a label phrase that opens one. */
const opening = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What an arrival held for a person asks, and the detail under it.
 *
 * THE FIRST CAUSE IS THE QUESTION, in the order the reason gives them: a field it could not read, then one it guessed,
 * then the pattern's own ceiling, and last a printed tail. EVERY CAUSE IS IN THE DETAIL, so a rowset whose acceptance
 * confirms an account read from its last digits is never accepted by somebody who was not told so.
 */
function heldAsked(
  deps: IngestDeps,
  words: Words,
  why: { absent: readonly string[]; invalid: readonly string[]; soft: readonly string[]; tails: readonly Tail[]; waits: boolean },
): { question: string; context: string } {
  const missed = [...why.absent, ...why.invalid];
  const add = (source: string, list: string): string => `Add ${source} to ${list}?`;
  const was = (fields: readonly string[]): string => (new Set(fields).size === 1 ? 'was' : 'were');
  const tailed = why.tails[0] === undefined ? null : rowNamed(deps.sql, why.tails[0]);
  const question = missed.length
    ? fit(words, [(s, l) => `${add(s, l)} Its ${words.fields(missed)} could not be read.`, (s, l) => `${add(s, l)} Part of it could not be read.`])
    : why.soft.length
      ? fit(words, [
          (s, l) => `${add(s, l)} Its ${words.fields(why.soft)} ${new Set(why.soft).size === 1 ? 'is' : 'are'} a best guess.`,
          (s, l) => `${add(s, l)} Part of it is a best guess.`,
        ])
      : why.waits || tailed === null
        ? fit(words, [(s, l) => `${add(s, l)} It is held for you to check.`])
        : fit(words, [(s, l, n) => `${add(s, l)} Its last digits match ${n}.`], tailed);
  const detail = [
    why.absent.length ? `${opening(words.fields(why.absent))} ${was(why.absent)} not found in it.` : '',
    why.invalid.length ? `${opening(words.fields(why.invalid))} ${was(why.invalid)} in it and did not read, so the format may have changed.` : '',
    !missed.length && why.soft.length ? `${opening(words.fields(why.soft))} ${was(why.soft)} a best guess, not read from it.` : '',
    !missed.length && why.waits ? 'Everything read this way waits for you before it is added.' : '',
    ...why.tails.map((t) => `It was matched to ${rowNamed(deps.sql, t)} by its last digits, ${t.digits}.`),
    why.tails.length ? 'Say yes once and later ones are added straight away.' : '',
  ];
  return { question, context: cutTo(detail.filter((sentence) => sentence !== '').join(' '), 280) };
}

/**
 * What a near match asks, and the detail under it: the row it looks like, by its title, and what the two share
 * (`listed`), said as the reason says it with each field in the words the record speaks.
 */
function nearAsked(words: Words, title: string | null, listed: string): { question: string; context: string } {
  const add = (source: string, list: string): string => `Add ${source} to ${list} as a second one?`;
  const question =
    title === null
      ? fit(words, [(s, l) => `${add(s, l)} It looks like one already there.`])
      : fit(words, [(s, l, n) => `${add(s, l)} It looks like ${n}.`], title);
  return { question, context: cutTo(`Compared with ${title ?? 'the one already there'}, it has ${listed}. Say no if it is that one.`, 280) };
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
      /* AND AN UNVERIFIED ROW IS NOT AN EXAMPLE OF ANYTHING. `12 §3` makes it ineligible to match,
         and a draft proposed from three of them is a pattern written to read a stranger's forgeries,
         paid for by the record's owner: this is the one place an arrival nothing vouched for could
         still spend money. The state and the reason together are the test, because `UNVERIFIED` is
         the only reason an untriaged row ever carries. */
      `SELECT id, headers FROM inbox_raw WHERE state = 'untriaged' AND channel = ? AND ts >= ?
       AND (reason IS NULL OR reason <> ?) AND ${WHO} IS NOT NULL ORDER BY ts DESC, rowid DESC LIMIT ?`,
      channel,
      since,
      UNVERIFIED,
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
  const got = resolveAt(deps, form, text, 1);
  /* A READ THAT CAME OUT `exact` IS ASKED ONE MORE THING: whether a `lookup` in it found its row only by a printed
     tail. Asked here, over the whole form, so a lookup inside `first`, `nth` or `default` is asked too, and a field
     read any other way is answered exactly as it was. */
  if (got.outcome !== 'exact' || got.value === null) return got;
  const tail = tailOf(deps, form, text, got.value, 1);
  return tail === null ? got : { value: got.value, outcome: 'tail', tail };
}

/**
 * The most prefixes one field's `strip:` may list, and the most times one value is cut.
 *
 * A CEILING ON THE WALK, NOT ONLY ON THE LIST. A value that repeats a prefix (`FAWRY*FAWRY*Vodafone`) is cut again, and
 * the walk stops after this many cuts whatever the text holds, so a stranger's message cannot make it run longer.
 */
export const STRIP_MOST = 16;

/**
 * A field's declared form without its `strip:`, and the prefixes it lists, or `null` where it lists none.
 *
 * `strip` SITS BESIDE THE FORM, ON THE FIELD, and never inside one: `{ first: [...], strip: ['FAWRY*'] }` strips whichever
 * arm answered, where a key inside each arm would have to be written once per arm. `declare.ts` refuses it anywhere
 * else, and refuses it beside a form that does not read text.
 */
export function stripOf(declared: Extractor): { form: Extractor; strip: readonly string[] | null } {
  if (declared === null || typeof declared !== 'object' || !Object.hasOwn(declared, 'strip')) return { form: declared, strip: null };
  const copy: Record<string, unknown> = { ...(declared as Record<string, unknown>) };
  const listed = copy.strip;
  delete copy.strip;
  const strip = Array.isArray(listed) ? listed.filter((p): p is string => typeof p === 'string' && p.trim() !== '').slice(0, STRIP_MOST) : [];
  return { form: copy as unknown as Extractor, strip };
}

/**
 * A merchant's name with the acquirer's prefix taken off: `FAWRY*Vodafone` is `Vodafone`.
 *
 * A CASE AWAY, AS AN ANCHOR IS. The prefix is matched over the ASCII fold `slices` uses, which keeps every length, so the
 * cut lands where the prefix ends and the name keeps the capitals the bank sent. The longest listed prefix is tried
 * first, so `PAYMOB*` is not cut as `PAY`. Each cut is followed by another look, up to `STRIP_MOST` of them, and then
 * every run of white space is one space and the ends are trimmed.
 */
export function stripped(value: string, prefixes: readonly string[]): string {
  const longest = [...prefixes].sort((a, b) => b.length - a.length);
  let out = value.trim();
  for (let cut = 0; cut < STRIP_MOST; cut++) {
    const folded = fold(out);
    const hit = longest.find((p) => p.trim() !== '' && folded.startsWith(fold(p)));
    if (hit === undefined) break;
    out = out.slice(hit.length).trimStart();
  }
  return out.replace(/\s+/g, ' ').trim();
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
    const lookup = 'lookup' in form ? form.lookup : null;
    const mask = lookup === null ? '' : maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
    for (const anchored of slices(form as Record<string, unknown>, text)) {
      const got = lookup === null ? deps.literals(anchored, table) : deps.literals(mask + anchored, table, 'lookup');
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
    /* AN ABSENT VALUE IS NOT A CANDIDATE — `34 §1.3`, which makes JSON null, the empty string and
       the empty list one state, and kernel invariant K2, which is that state at the write:
       `isAbsent` strips such a key out of `entry.fields` and the row never holds it.

       SO AN EMPTY SLICE HAS TO BE A MISS HERE OR IT IS NOTHING ANYWHERE. Counted as a candidate it
       reads `exact`, carries no reason, passes the confidence gate, and is then deleted at the
       write — a field the declaration required, gone from the row, with the receipt saying the
       pattern read it exactly. That is the one shape this file exists to prevent. Counted as a
       miss it is `43 §5.1` step 5, in the document's own words: *every declared field is required;
       `default` is how a field is optional* — and a `default:` over an empty slice now fires,
       which it could not while the empty string counted as an answer.

       THE TRIM IS STILL GONE, which is the part of this that `§4.3` governs: `{ between: ["a",
       "b"] }` over `a   b` is three spaces and a value, not a miss. Only the empty slice is
       absent, because only the empty slice is what `§1.3` names. */
    if (got !== null && got !== '') out.push(got);
  }
  return out;
}

/** `43 §4.3`'s answer when a text said two things: not a value, and not a miss either. */
const AMBIGUOUS = 'ambiguous';

/** What one form yielded over one text — candidates in text order, or the one word neither is. */
type Candidates = Json[] | typeof AMBIGUOUS;

/**
 * The mask a lookup's anchor ends in: its trailing run of stars and the one `-` or space after them, or `''`.
 * `bank-from-out` boxes its account between `***-` and a space, so the slice is a bare `518` and the one sign that
 * it is a tail sits in the anchor. Put back in front of the slice, it is what `lookup`'s masked-tail rule reads.
 */
function maskAtEnd(anchor: string): string {
  let at = anchor.length;
  if (anchor[at - 1] === '-' || anchor[at - 1] === ' ') at -= 1;
  const sep = anchor.slice(at);
  let stars = at;
  while (anchor[stars - 1] === '*') stars -= 1;
  return stars === at ? '' : anchor.slice(stars, at) + sep;
}

/**
 * The digits a `lookup` in `form` found `value` by, when it found it ONLY by the masked-tail rule, or `null`.
 *
 * THE MATCH IS NOT DECIDED HERE, it is asked again of the rule that decided it. `literals` without the `lookup` form
 * is the whole-token rule alone, so a slice it answers named the row by its whole value and nothing waits; a slice it
 * does not answer, where `lookup` did, is one the tail rule answered (`matchLiterals` in
 * `packages/extract/src/extractors.ts`). Only the digits are read back here, for the sentence and the confirmation.
 *
 * EVERY SLICE IS ASKED, because `candidatesAt` accepts one answer from several slices that agree, and a message that
 * prints the whole value once has named the row whatever else it printed.
 *
 * ONE MORE READ OF THE LIST'S ROWS PER LOOKUP FIELD, and only when that field came out `exact`: the same SELECT
 * `literalsOf` makes, bounded as it is by the list and by nothing else (`kernel/src/index.ts`, `rows`).
 */
function tailOf(deps: IngestDeps, form: Extractor, text: string, value: Json, depth: number): { digits: string; register: string } | null {
  if (form === null || typeof form !== 'object' || depth > NESTING) return null;
  if ('first' in form) {
    for (const arm of Array.isArray(form.first) ? form.first : []) {
      const got = tailOf(deps, arm, text, value, depth + 1);
      if (got !== null) return got;
    }
    return null;
  }
  if ('nth' in form) return tailOf(deps, form.nth.of, text, value, depth + 1);
  if ('default' in form) return tailOf(deps, form.default.of, text, value, depth + 1);
  if (!('lookup' in form) || deps.literals === undefined) return null;

  const lookup = form.lookup;
  const table = literalsOf(deps, form);
  if (table === null) return null;
  const row = table.find(([, id]) => id === value);
  if (row === undefined) return null;
  const mask = maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
  let digits: string | null = null;
  for (const anchored of slices(form as Record<string, unknown>, text)) {
    const masked = mask + anchored;
    const whole = deps.literals(masked, table);
    if (whole !== AMBIGUOUS && whole.some((id) => id === value)) return null;
    digits ??= printedTail(masked, row[0]);
  }
  return digits === null ? null : { digits, register: lookup.register };
}

/**
 * The digits printed behind stars in a slice's first token that `whole` ends in, or `null`.
 *
 * THE SHAPE `matchMaskedTail` READS, and read back only after it has answered: a run of stars, one `-` or space, then
 * the digits, in the first token, where the anchor put the mask, with no letter straight after them. Three digits at
 * least, and fewer than the whole value, because a value no longer than the digits would have been a whole token.
 */
function printedTail(masked: string, whole: string): string | null {
  /* SPACES ONLY, as `matchMaskedTail` skips them, so the first token here is the first token there. */
  let first = 0;
  while (masked[first] === ' ') first += 1;
  const text = masked.slice(first);
  const space = text.indexOf(' ');
  const end = space === -1 ? text.length : space;
  for (let star = text.indexOf('*'); star !== -1 && star < end; star = text.indexOf('*', star + 1)) {
    if (text[star - 1] === '*') continue;
    let at = star;
    while (text[at] === '*') at += 1;
    if (text[at] === '-' || text[at] === ' ') at += 1;
    const from = at;
    while (text[at] !== undefined && text[at]! >= '0' && text[at]! <= '9') at += 1;
    const digits = text.slice(from, at);
    if (/^[A-Za-z]/.test(text.slice(at))) continue;
    if (digits.length >= 3 && whole.length > digits.length && whole.endsWith(digits)) return digits;
  }
  return null;
}

/**
 * One field a `lookup` filled by a printed tail: the field, the digits, the row it landed on and that row's list.
 *
 * IT RIDES IN THE ROWSET'S BODY AS `tails`, and that is the whole of what the confirmation keeps. `ingest_receipt` is
 * written only for a row filed at `exact`, so an accepted rowset leaves none, and no table is added for this: the
 * rowset this ingest opened, resolved by a decision that accepted it, is the person's word. The field rides along for
 * a screen that wants to point at it; the confirmation reads the digits and the row.
 */
type Tail = { field: string; digits: string; row: string; register: string };

/**
 * How many of an ingest's answered rowsets carrying a tail are read to find a confirmation, newest first.
 *
 * PAST IT A CONFIRMATION IS NOT FOUND, and that fails the safe way: the arrival is held for one more acceptance rather
 * than filed. Each rowset read is one a person answered, so reaching this takes as many answered questions.
 */
const CONFIRMS_READ = 500;

/**
 * Whether a person has accepted an arrival `ingest` filed to `tail.row` by `tail.digits`, in whichever field.
 *
 * ACCEPTED, NOT ANSWERED. A rowset resolved `addressed` may have been accepted or rejected, so the decision is read as
 * well, and it is found the way `govern.ts` finds it (`SETTLED_BY`): `decide` writes the `decide` event and the
 * suggestion's `resolve` event one after the other, so the event just before the latest `resolve` names the decision.
 * Matching on the instant, the actor or the question instead would let a rejection pressed in the same instant as an
 * acceptance, on a rowset asking the same question, read as the acceptance. A rejection, a question reopened and
 * answered no, and an erased one all read as not confirmed, so the next arrival waits again.
 */
function confirmedTail(sql: Sql, ingest: string, tail: Tail): boolean {
  const answered = sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM suggestion WHERE body_kind = 'rowset' AND opened_by = ? AND status = 'resolved'
       AND resolved_as = 'addressed' AND instr(body, '"tails"') > 0 ORDER BY opened_at DESC LIMIT ?`,
    `ingest:${ingest}`,
    CONFIRMS_READ,
  );
  for (const row of answered) {
    let tails: unknown;
    try {
      tails = (JSON.parse(row.body) as { tails?: unknown }).tails;
    } catch {
      continue;
    }
    /* THE ACCOUNT AND THE TAIL, NOT THE FIELD. What a person confirmed is that these digits from this ingest are that
       account, which stays true whichever of the ingest's fields printed them. */
    const same = Array.isArray(tails) && tails.some((t: Partial<Tail> | null) => t?.digits === tail.digits && t.row === tail.row);
    if (!same) continue;
    const settled = sql.one<{ answer: string }>(
      `SELECT d.answer AS answer FROM event r
         JOIN event e ON e.rowid = r.rowid - 1 AND e.kind = 'decide' AND e.target LIKE 'decision:%'
         JOIN decision d ON d.id = substr(e.target, 10)
        WHERE r.kind = 'resolve' AND r.target = ? AND r.to_v = 'addressed'
        ORDER BY r.rowid DESC LIMIT 1`,
      `suggestion:${row.id}`,
    );
    if (settled?.answer === 'accept') return true;
  }
  return false;
}

/**
 * What the reason calls the row a tail landed on: its title, as its list declares it, or its list's word for one row
 * and the digits.
 *
 * READ FROM THE DECLARATION, because `IngestDeps` carries no title and the reason is written inside the arrival. A
 * title field declared `secret` is never read into a sentence.
 */
function rowNamed(sql: Sql, tail: Tail): string {
  const list = declaredList(sql, tail.register);
  const title = typeof list.title === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(list.title) ? list.title : null;
  const fields = Array.isArray(list.fields) ? (list.fields as { id?: unknown; type?: unknown }[]) : [];
  if (title !== null && !fields.some((f) => f?.id === title && f.type === 'secret')) {
    const name = sql.one<{ name: unknown }>(`SELECT json_extract(fields, '${jsonPath(title)}') AS name FROM entry WHERE id = ?`, tail.row)?.name;
    if (typeof name === 'string' && name.trim() !== '') return name;
  }
  const one = typeof list.one === 'string' && list.one.trim() !== '' ? list.one : 'row';
  return `the ${one} ending ${tail.digits}`;
}

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
    /* THE CURRENCY'S OWN EXPONENT, from `EXPONENT` below and not from `Intl`. `02 §3` rule 1 has the
       argument: `Intl` carries CLDR, which is what a country expects to SEE, and the table carries
       ISO 4217's minor unit, which is what a record STORES. It governs BOTH halves: a lone separator followed by three digits is grouping
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
 *
 * EXPORTED FOR `rules.ts`'s `link`, whose lower rungs compare a name a case away, so a merchant a `strip:` read and a
 * category's `match` are folded by the one rule.
 */
export function fold(text: string): string {
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
  /* `Object.hasOwn` AND NOT A TRUTHY LOOKUP, which is the same rule `43 §4.4` states for a path: *"a
     key is looked up with `Object.hasOwn`, so `__proto__` and `constructor` reach nothing."* It
     matters here for the same reason it matters there. `FORMATS['__proto__']` is `Object.prototype`,
     which is truthy, so the guard below did not fire and the next line called `.exec` on it — a
     `TypeError` out of the middle of an ingest, where `map.ts` promises *"NOTHING HERE THROWS"*. A
     `map:` entry's `format` is not checked at install at all (`declare.ts`'s `mappingFault` reads
     `path`, `type`, `from`, a money currency and an enum's values, and lets `format` through as
     written), so the string reaching this line is whatever a declaration said. */
  const re = Object.hasOwn(FORMATS, format) ? FORMATS[format] : undefined;
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

/**
 * `@braindog/host`'s `x-braindog-files` header (`FILES_HEADER`, `IngestFile[]`), read structurally and never
 * imported: `packages/host` depends on this package (`31 §16`) and an import back would be a cycle. Only a KEPT
 * file, one with a `sha256`, is one this record can ever open again; the rest are named on the arrival alone.
 */
const KEPT_SHA256 = /^[0-9a-f]{64}$/;

function keptFiles(header: string | undefined): { name: string; mime: string; bytes: number; sha256: string }[] {
  if (typeof header !== 'string' || header === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: { name: string; mime: string; bytes: number; sha256: string }[] = [];
  for (const f of parsed as unknown[]) {
    if (f === null || typeof f !== 'object') continue;
    const { name, mime, bytes, sha256 } = f as Record<string, unknown>;
    if (typeof sha256 !== 'string' || !KEPT_SHA256.test(sha256)) continue;
    if (typeof name !== 'string' || name === '' || typeof mime !== 'string' || mime === '') continue;
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) continue;
    out.push({ name, mime, bytes, sha256 });
  }
  return out;
}

/** What a refusal from the pipeline looks like when it is about the declaration rather than a row. */
export const badIngest = (fix: string, at: string): Refusal => ({ code: 'DECLARATION_INVALID', fix, at });
