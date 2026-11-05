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
 * AND A SHAPE NOBODY HAS A PATTERN FOR IS OWED ONE DRAFT FROM ITS THIRD ARRIVAL UNTIL IT IS ANSWERED,
 * outside the transaction (`owedShapes`). Not one per payload: a model call per arrival is a bill
 * that scales with a stranger's sending rate, and two of anything is a coincidence. Three is the
 * smallest number of examples a pattern can be written from and the smallest that is not a
 * coincidence, which is why it is the same three. One draft a shape at a time, and one a day at most
 * after a draft that came to nothing.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import { jsonPath, evaluate, parseWhere, INBOX_RAW, type Predicate, type Schema } from '@braindog/where';

import type { Entry, Json } from './index.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';
import { canon, sha256 } from './cause.ts';
import { SESSION_PREFIX } from './session.ts';
import { SLASH, slashMayWrite } from './slash.ts';
import { parseAnswer, readRow, type Mapping } from './map.ts';
import { startAtDoor } from './script.ts';
import { mayBeCut, payeeName } from './identity-keys.ts';
import { HEADER_READ, splitMailboxes } from './mail-read.ts';
import { exponentOf, moneyText } from './exponent.ts';

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
  | { money: { currency?: string | CurrencyOf; after?: string; before?: string; between?: readonly [string, string] } }
  | { date: { format: string; after?: string; before?: string; between?: readonly [string, string] } }
  | { int: { after?: string; before?: string; between?: readonly [string, string] } }
  | { decimal: { sep?: string; after?: string; before?: string; between?: readonly [string, string] } }
  | { enum: { map: Record<string, string>; after?: string; before?: string; between?: readonly [string, string] } }
  | { lookup: LookupForm }
  /* READONLY, because a declaration is data a pack or a `.brain` file handed over, and `as const` is
     how every fixture in this repository writes one. */
  | { first: readonly Extractor[] }
  | { nth: { n: number; of: Extractor } }
  | { default: { value: Json; of: Extractor } };

/**
 * A `lookup`'s arguments: the list and the field it reads, its anchor, and three optional keys (`declare.ts` checks
 * them at install).
 *
 * `says` IS THE NOUN THE QUESTION USES for what the message printed, "card" in "Which account is the card ending
 * 1234?". Absent, it is "account". It also says the digits are digits: a bare run of them, with no stars before it,
 * counts as a printed tail only on a lookup that says what it reads (`unknownTail`).
 *
 * `where` IS A FILTER OVER THE LIST, so a card text is never matched to a current account that ends alike: only the rows
 * it admits are read, and only they are offered as answers.
 *
 * `split` SAYS THE FIELD MAY HOLD SEVERAL VALUES PARTED BY COMMAS, for an account the bank prints two ways and for a card
 * that was replaced. Each part is read as a value of its own, and an answer for new digits is added to the others.
 */
export type LookupForm = {
  register: string;
  by: string;
  says?: string;
  where?: Predicate | string;
  split?: boolean;
  after?: string;
  before?: string;
  between?: readonly [string, string];
};

/**
 * A money form's currency read off the row another field of the same pattern found: `{ of: 'account', field: 'balance' }`
 * is the currency of the account's balance (a money field) or the code in a text field.
 *
 * THE THIRD RUNG, AFTER THE CODE BEFORE AND THE CODE AFTER THE NUMBER. A text that prints no code is in its account's
 * currency, and a pattern that wrote a fallback of its own filed every such text in that currency whatever the account
 * held. The lookup is read first (`readFields` orders it so), and the form is handed the row's code in place of this.
 */
export type CurrencyOf = { of: string; field: string };

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
  /**
   * Who an email says it is from, in its three parts (`senderOf`), for whatever meets the sender after the arrival
   * committed. Absent on another channel, and on a message whose `From` names no address.
   */
  sender?: Sender;
  /**
   * The payee a pattern read into `counterparty_text`, by the name a person reads (`payeeName`: `Chillout` for
   * `GEIDEA*CHILLOUT 0423 CAIRO EG`, and the text itself where nothing of it is a name), kept on the arrival whatever became of the
   * row: written, held for a person, or on a list that declares no field for it. It is what the record's rule meets an
   * organisation by, through its `bank:` key, and the key is the record's to make (`keyOf`), not this file's.
   */
  counterparty?: string;
  /**
   * The row a text skipped as a repeat repeats, by its id: a handle for the screen that offers "It is a second one", never
   * a word a person reads. The reason says the row by its name, amount and day (`repeatSaid`).
   */
  repeats?: string;
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
  /**
   * Answers a question the moment it is filed when BrainDog may file it itself (`handledFault`). Without it a confident
   * arrival asks like any other.
   */
  settle?: (id: string) => Result<unknown>;
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

/** How long the same words from one sender are held to be the same message. A printed day makes it longer: see `heardBefore`. */
const HEARD_WITHIN_MS = 30 * 86_400_000;

/**
 * WHEN THE SAME WORDS CAME BEFORE FROM THE SAME SENDER, for an arrival about to write money, or `null`.
 *
 * NEW BYTES CAN BE THE SAME MESSAGE. `UNIQUE (channel, sha256)` knows only the bytes: a signed bank alert stays signed when
 * it is sent on, and its new envelope is a new hash; an SMS door hears whatever the holder of its token posts. The row's own
 * `dedupe` holds those while the row stands and only when the pattern keys on a day the words print. So a debit he deleted
 * as wrong came back on the next copy, and a text with no day in it was a new payment each time.
 *
 * MONEY ONLY, AND HELD RATHER THAN DROPPED. Elsewhere the same words twice are ordinary (a build that failed again), and two
 * real payments can read the same where a bank prints no day, so a person looks and nothing is lost. SENDER AND WORDS, with
 * white space taken out: a mail by its `From:` address, a door's text by its channel, since a text has no sender this could
 * read (the token proves only who posted). What nobody verified never counts, so a forgery sent first cannot hold the real
 * one back. A held arrival run again by a person is `stored`, and never reaches this. New words are a new message: a real
 * alert somebody else received, with other words, is not stopped here.
 */
function heardBefore(deps: IngestDeps, arrival: Arrival, body: string, headers: Record<string, string>, register: string, extracted: Record<string, unknown>): string | null {
  /* WHAT A STRANGER CAN SEND. A pull is this record asking, and a figure that has not moved reads the same each hour. */
  if (arrival.channel !== 'email' && arrival.channel !== 'webhook') return null;
  const fields = deps.schemaOf(register)?.fields ?? {};
  if (!Object.keys(extracted).some((f) => fields[f]?.type === 'money')) return null;
  const since = instant(deps.nowMs - HEARD_WITHIN_MS);
  const bare = (words: string): string => words.replace(/[ \t\r\n]/gu, '');
  if (arrival.channel === 'webhook') {
    const blank = "replace(replace(replace(replace(body, ' ', ''), char(9), ''), char(10), ''), char(13), '')";
    return (
      deps.sql.one<{ ts: string }>(`SELECT ts FROM inbox_raw WHERE channel = ? AND ts >= ? AND state <> 'untriaged' AND ${blank} = ? ORDER BY ts DESC LIMIT 1`, arrival.channel, since, bare(body))?.ts ?? null
    );
  }
  /* A MAIL IS STORED WHOLE, so its words are what follows its headers, and the two envelopes differ. */
  const message = (raw: string): string => {
    const end = /\r?\n\r?\n/u.exec(raw);
    return bare(end === null ? raw : raw.slice(end.index + end[0].length));
  };
  const address = senderOf(headers.from).address.toLowerCase();
  if (address === '') return null;
  const words = message(body);
  const same = deps.sql.all<{ ts: string; headers: string | null; body: string | null }>(
    "SELECT ts, headers, body FROM inbox_raw WHERE channel = 'email' AND ts >= ? AND state <> 'untriaged' AND instr(lower(headers), ?) > 0 ORDER BY ts DESC LIMIT 200",
    since,
    address,
  );
  for (const row of same) {
    let from: unknown;
    try {
      from = (JSON.parse(row.headers ?? '{}') as { from?: unknown }).from;
    } catch {
      continue;
    }
    if (typeof from === 'string' && senderOf(from).address.toLowerCase() === address && message(row.body ?? '') === words) return row.ts;
  }
  return null;
}

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
): { id: string; seq: number; sure?: boolean } | undefined {
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
      /* IN THE NEAR FORM A ROW THAT NEVER HELD THE FIELD IS STILL A CANDIDATE (live check of 30 October, 11): written
         before its add-on read that field, it is asked of `duplicate`, which reads absent on one side as unknown. */
      if (near !== undefined && (v === undefined || v === null) && type !== 'money' && type !== 'quantity') continue;
      if (near !== undefined && type !== 'money' && type !== 'quantity') {
        terms.push(`(${sql} = ? OR ${sql} IS NULL)`);
        bound.push(typeof v === 'number' ? v : String(v));
        continue;
      }
      /* AND A MONEY FIELD THE SAME, BUT FOR ITS TWO PARTS AT ONCE: a statement line holds no "available after" and an
         alert does, so the line is asked of `duplicate` too, which still holds at least one money field to agree. */
      if (near !== undefined && (type === 'money' || type === 'quantity')) {
        if (v === undefined || v === null) continue;
        terms.push(`(${sql} = ? OR json_extract(fields, '${jsonPath(field)}') IS NULL)`);
        bound.push(typeof v === 'number' ? v : String(v));
        continue;
      }
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
  const around: string[] = [];
  if (near !== undefined) {
    const day = extracted[near.day];
    /* AS WIDE AS A PAIR THAT CAME BY TWO ROADS MAY BE APART (`NEAR_ACROSS_DAYS` in `@braindog/extract`): `duplicate`
       holds two rows that hold the same fields to one day, as it always did. */
    const wide = neighbours(typeof day === 'string' ? day : '', ACROSS_DAYS);
    if (wide === undefined) return undefined;
    window = ` AND json_extract(fields, '${jsonPath(near.day)}') BETWEEN ? AND ?`;
    around.push(wide[0], wide[1]);
  }

  const where = terms.length > 0 ? ` AND ${terms.join(' AND ')}` : '';
  const candidates = deps.sql.all<{ id: string; seq: number; fields: string }>(
    `SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL${where}${window}`,
    register,
    ...bound,
    ...around,
  );
  const mine = extracted as Record<string, Json>;
  const read = (row: { fields: string }): Record<string, Json> => JSON.parse(row.fields) as Record<string, Json>;
  const matched = candidates.filter((row) => duplicate(mine, read(row), dedupe));
  if (near === undefined || matched.length === 0) return matched[0];

  /* THE SAME FIELDS HELD AND AGREEING IS THE SAME PAYMENT, first. */
  const held = (x: Record<string, Json>, f: string): boolean => Object.hasOwn(x, f) && x[f] !== undefined && x[f] !== null;
  const across = (row: Record<string, Json>): boolean => near.on.some((f) => held(mine, f) !== held(row, f));
  const strong = matched.find((row) => !across(read(row)));
  if (strong !== undefined) return { id: strong.id, seq: strong.seq, sure: true };

  /**
   * A ROW MATCHED ONLY ACROSS TWO ROADS IS OURS ONLY IF NOTHING ELSE CLAIMED IT, ONE TO ONE. A statement line with no
   * reference matches every alert of its amount and payee in its days; the first alert is its other sighting, and a
   * second alert with another reference is a second payment. So a line already met by a row that holds what it lacks,
   * and that is not this arrival again, belongs to that row, and the arrival is written. Two of one coffee on one day
   * stay two.
   */
  const near3 = deps.sql.all<{ id: string; seq: number; fields: string }>(
    `SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL${window}`,
    register,
    ...around,
  );
  const day = (row: Record<string, Json>): number => Date.parse(`${String(row[near.day] ?? '')}T00:00:00Z`);
  const at = day(mine);
  const free = matched
    .filter((row) => {
      const w = read(row);
      return !near3.some((other) => {
        if (other.id === row.id) return false;
        const o = read(other);
        return duplicate(o, w, dedupe) && !duplicate(mine, o, dedupe);
      });
    })
    .sort((x, y) => Math.abs(day(read(x)) - at) - Math.abs(day(read(y)) - at));
  /* SURE ONLY WHEN ONE ROW WAS LEFT TO BE IT. Two free lines of one amount are two payments this arrival may be either
     of; the nearer is taken, and nothing of this arrival is written onto it (`nearFill`). */
  const first = free[0];
  return first === undefined ? undefined : { id: first.id, seq: first.seq, sure: free.length === 1 };
}

/** How many days either side a near key looks for a row that came by another road (`NEAR_ACROSS_DAYS`, `@braindog/extract`). */
const ACROSS_DAYS = 3;

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
function neighbours(day: string, days = 1): [string, string] | undefined {
  if (day.length !== 10 || day[4] !== '-' || day[7] !== '-') return undefined;
  const at = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) return undefined;
  return [new Date(at - days * 86_400_000).toISOString().slice(0, 10), new Date(at + days * 86_400_000).toISOString().slice(0, 10)];
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
 * How many arrivals nothing verified the inbox keeps, and how many bytes of them: the newest are kept and the oldest go.
 *
 * THE HOUR'S COUNT BOUNDS HOW FAST AND THIS BOUNDS HOW MUCH. A stranger who knows a webhook address stores a row a
 * post, hour after hour, and nothing ever read or removed those rows, so the record grew until its storage ran out.
 * Nothing was offered these rows, nothing points at them, and a sender whose signature is fixed sends again.
 */
export const UNVERIFIED_KEPT = 200;
export const UNVERIFIED_BYTES = 25_000_000;

/** The field a bank door reads the payee into, as printed, and the one an arrival keeps. */
export const COUNTERPARTY = 'counterparty_text';

/**
 * The field a list keeps the payee's name in as a person reads it (`payeeName`): `Chillout` beside the bank's
 * `GEIDEA*CHILLOUT 0423 CAIRO EG`, which `counterparty_text` keeps word for word.
 */
export const PAYEE = 'payee';

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

  /* WHO SENT IT AND WHO WAS PAID ride on the answer, whatever path it took through the pipeline below: a redelivery
     carries its sender as the first delivery did, and the payee is set where the pattern read it. */
  const from = arrival.channel === 'email' ? senderOf(lower(arrival.headers ?? {}).from) : null;
  const heard: Heard = {};
  const said = (out: Result<Arrived>): Result<Arrived> =>
    !out.ok || ((from === null || from.address === '') && heard.counterparty === undefined)
      ? out
      : ok<Arrived>({
          ...out.value,
          ...(from !== null && from.address !== '' ? { sender: from } : {}),
          ...(heard.counterparty === undefined ? {} : { counterparty: heard.counterparty }),
        });

  /* `attempt` RATHER THAN `transaction`, because the refusal below is a VALUE. A raw row written and
     then reported as a failure is the worst of both: the caller believes nothing happened and the
     record holds bytes whose receipt says nothing was written and cannot say why. */
  return said(attempt(deps.sql, transaction, () => runArrival(deps, arrival, null, heard)));
}

/** What one run of the pipeline heard on the way, for the answer `arrive` hands back: the payee by its name. */
type Heard = { counterparty?: string };

/** The arrival's verdict, written on its inbox row. */
type Store = (state: Arrived['state'], reason: string | null) => void;

/** One line of the log about the arrival, with a field and the value it was, where the line names one. */
type Note = (kind: string, actor: string, target: string, targetKind: string, to: string | null, also?: { field: string; from: string }) => void;

/**
 * An arrival already in the inbox, run through the pipeline again from its stored bytes: its row, its state and reason
 * as they stood, and the instant it first came, which is the `ts` a pattern's `match:` reads.
 */
type Stored = { id: string; state: string; reason: string | null; ts: string };

/**
 * The pipeline itself, inside the caller's transaction. `stored` is null for a new arrival and the inbox row for one run
 * again (`replayHeld`): a run again is never a redelivery, starts no script, sweeps no door, and writes over its own row.
 */
function runArrival(deps: IngestDeps, arrival: Arrival, stored: Stored | null, heard: Heard): Result<Arrived> {
  {
    const at = instant(deps.nowMs);
    const headers = lower(arrival.headers ?? {});
    /* A U+0000 IN WHAT A SENDER'S MACHINE SENT IS READ AS U+FFFD, as a decoder reads a bad byte, because the port refuses
       a text holding one (`guard`) and a bank's alert is not to be lost over a character nobody reads. Its hash is of
       the bytes as they came (`arrival.sha256`), so a redelivery is still the same arrival. */
    const body = (arrival.body ?? '').replaceAll('\u0000', '\uFFFD');

    /* IDEMPOTENT ON THE HASH. A redelivery is the ordinary case — every webhook sender retries, and
       most mail servers will too — and writing the row twice is the failure people notice as a
       duplicate invoice. */
    const already =
      stored ??
      deps.sql.one<{ id: string; state: string; reason: string | null }>(
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
      stored !== null ||
      (already !== undefined &&
        already.state === 'untriaged' &&
        arrival.verified !== false &&
        (already.reason === UNVERIFIED || arrival.ingest !== undefined));
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
        reason: 'this arrived before, and BrainDog kept what it did the first time',
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
     *
     * `from_name`, `from_address` AND `from_domain` SIT BESIDE `from`, which keeps the header word for word for every
     * pattern already written against it. They are the header read once (`senderOf`), so a reader meeting the sender
     * is handed an address and a domain, never `"Sara Ali" <sara@…>` to take apart again.
     */
    const fields = arrivalFields(arrival.channel, headers, body, stored?.ts ?? at);

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

    const store: Store = (state, reason) => {
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

    const note: Note = (kind, actor, target, targetKind, to, also) => {
      slashMayWrite(actor, kind);
      deps.sql.exec(
        'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        deps.mint(),
        at,
        actor,
        kind,
        target,
        targetKind,
        also?.field ?? null,
        also?.from ?? null,
        to,
      );
    };

    /* A SCRIPT WHOSE `runs.door` IS THIS DOOR STARTS HERE, whatever the patterns make of the bytes: the script is how
       that door is read, and a door with no pattern that matches is the ordinary case for one. The door is the ingest
       the arrival names, or for unnamed mail the one that matched it. Only a verified arrival starts one, and only the
       first time its bytes were offered anything: a redelivery returned above, and a rescued row that was offered before
       (`reason` not `UNVERIFIED`) started its scripts then. */
    const door = arrival.ingest ?? matched?.ingest;
    if (stored === null && !unverified && door !== undefined && (already === undefined || already.reason === UNVERIFIED))
      startAtDoor(deps.sql, { mint: deps.mint, nowMs: deps.nowMs }, { door, body, headers }, BODY_BYTES_MAX);

    if (!matched) {
      /* UNTRIAGED IS NOT AN ERROR. It is the state a payload is in before anybody has said what it
         means, and the reason `inbox_raw` exists at all: an ingest pipeline whose answer to "I do not
         recognise this" is to drop it is a pipeline whose failures are invisible.

         AND AN UNVERIFIED ONE SAYS WHICH OF THE TWO SILENCES IT IS. Untriaged with no reason is "no
         pattern here recognised this"; untriaged with `UNVERIFIED` on it is "nothing was tried",
         and only the second is answered by fixing the sender's signature rather than the pattern. */
      store('untriaged', unverified ? UNVERIFIED : null);
      if (unverified && !already)
        deps.sql.exec(
          `DELETE FROM inbox_raw WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER w AS n, SUM(length(CAST(body AS BLOB)) + length(CAST(headers AS BLOB))) OVER w AS bytes
             FROM inbox_raw WHERE state = 'untriaged' AND reason = ? WINDOW w AS (ORDER BY ts DESC, rowid DESC)) WHERE n > ? OR bytes > ?)`,
          UNVERIFIED,
          UNVERIFIED_KEPT,
          UNVERIFIED_BYTES,
        );
      /* A NAMED DOOR'S TEXT THAT NO PATTERN READ IS WRITTEN DOWN AGAINST THE DOOR, once, so the report of what each
         pattern did (`patternReport`) has a line for it: the inbox row keeps no ingest, and a door whose texts all go
         unread looked, in every count, like a door nothing was sent to. Only a verified arrival, the first time it was
         offered anything, so a forgery costs one INSERT as it always did. */
      if (!unverified && stored === null && arrival.ingest !== undefined && (already === undefined || already.reason === UNVERIFIED))
        note('arrive', `ingest:${arrival.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'untriaged');
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
      /* AND WHICH PATTERN SKIPPED IT, which the inbox row cannot hold, so the report of what each pattern did counts it. */
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'skipped');
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason: skipped.reason });
    }

    /* THE DOOR, as the tail's question names it: the one the arrival was named for, the one its pattern reads at, or for
       unnamed mail the pattern itself. */
    const doorOf = arrival.ingest ?? matched.door ?? matched.ingest;

    /* BEFORE THIS ARRIVAL IS FILED, WHAT WAITS AT ITS DOOR IS LOOKED AT AGAIN. Digits written on an account
       by hand, or an answer given, can make held texts readable, and they were never read again: the owner's card ending
       7731 was set on his account and the texts held before it went on waiting under a question each. A run again sweeps
       nothing, so a sweep never starts a sweep. */
    if (stored === null) {
      const swept = sweepDoor(deps, doorOf);
      if (!swept.ok) return swept as Result<never>;
    }

    /* THE ROW IS THE BODY — `43 §5.1` step 3, in four words: *`text` → one row, the body*. The
       subject was prepended to it here, which put a line the document does not extract from in
       front of every anchor: `{ before: "Card" }` cut the subject and nothing else, and a message
       whose subject repeats its amount read the subject's. The subject is still matched on — it is
       one of `34 §1.9`'s seven and `§5.2` builds it — and matching on a line is not reading a value
       out of it.

       THEN STEP 4 OVER IT, once, before a single form runs. */
    const text = deps.normalise === undefined ? body : deps.normalise(body);
    /* EVERY FIELD, BY `readFields`, which reads and writes nothing else: a held arrival looked at again (`sweepDoor`) is
       read by the same function, so what the sweep decides and what a run again does cannot disagree. */
    const read = readFields(deps, matched, body, text, at);
    const { extracted, missed, invalid, soft, tails } = read;

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
      /* SAID BY THE PATTERN'S NAME AND NOT ITS LEVEL, which is a word out of a declaration nobody reading the inbox chose.
         `not a confidence` is kept, so a check that matched the sentence still finds it. */
      const reason = `The level set on ${patternSaid(deps, matched)} is not a confidence BrainDog knows, so nothing from this one was written.`;
      store('review', reason);
      /* AND WHICH PATTERN HELD IT, as every other held text says, so a fixed version reads it again (`readBefore`). */
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason });
    }

    /* HIS ACCEPTANCE IS THE APPROVAL THE CEILING WAITS FOR. The header's rule is that a pattern nobody has
       approved yet writing rows into somebody's ledger is the one failure this design exists to prevent, and every
       pattern a model drafts is installed at `needs-review` for that reason. A person who said yes to the shape's one
       question has approved it: from then on what it reads exactly files as `exact`, and what it reads in part still
       waits. The approval is the decision on that question and nothing else (`approvedPattern`), so an Undo that puts
       the question back takes the approval with it. */
    const lid: Confidence = ceiling !== 'exact' && approvedPattern(deps.sql, matched.ingest) !== null ? 'exact' : (ceiling as Confidence);

    /* `43 §5.1` STEP 6, WHICH IS AFTER THE FIELDS AND BEFORE THE CONFIDENCE, because a route reads
       the values step 5 produced and a miss is one of the things step 7 files as `needs-review`. */
    const routed = routeTo(matched.writes.register, extracted);
    if ('miss' in routed) {
      /* A MISS IS `needs-review` WHATEVER THE CEILING SAYS, and it opens no `rowset`: a rowset is a
         suggestion a person ACCEPTS INTO a register, and the whole of what went wrong is that no
         register was named. The bytes, the state and the reason are stored; what happens next is an
         edit to the table or to the pattern, and both of those are edits to the declaration. */
      /* SAID IN THE LIST'S WORDS, each field the table sorts by as its label, and a part of one (`amount.currency`) as the
         field's own: "found nowhere to file one with this kind and amount's currency". `routed.miss` is those ids. */
      const reason = `${opening(patternSaid(deps, matched))} read this one and found nowhere to file one with this ${routeSaid(deps, matched.writes.register)}.`;
      store('review', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason, confidence: 'needs-review' });
    }
    const register = routed.to;

    /**
     * A BANK DOOR'S PAYEE IS KEPT ON THE ARRIVAL, by its name (`Arrived.counterparty`), so the record's rule can
     * meet the organisation by its `bank:` key whatever happens to the row: filed, held for a person, or near another.
     *
     * AND IT NEVER COSTS THE ROW. A pattern fills `counterparty_text` the moment its add-on knows the field, and the list
     * it files to may not have it yet: a ledger installed before the field was declared refused the whole write, and a
     * payee the text did not carry held a charge that read cleanly. On a list that does not declare the field it is kept
     * here alone, out of the row and out of what could not be read.
     */
    const payee = extracted[COUNTERPARTY];
    const printed = typeof payee === 'string' ? payee.trim().replace(/\s+/g, ' ') : '';
    /* THE ARRIVAL CARRIES THE NAME AS A PERSON READS IT, because it is what the organisation is named by. The `bank:`
       key is the same from either (`payeeName` answers the text itself where its name would fold to another payee),
       so a payee met under the bank's words before this is the same one after. */
    const clean = printed === '' ? '' : payeeName(printed);
    /* A NAME THE CARD TEXT MAY HAVE CUT IS NOBODY TO MEET: met, it made a shop called
       "Orbt Speciali" beside the same shop's whole name. The row still keeps the bank's words, and with them the key, so
       a shop the record holds by it is linked by the walk over the past (`backfill.ts`), which makes none from it. */
    if (printed !== '' && !mayBeCut(printed)) heard.counterparty = clean;
    const declaredFields = deps.schemaOf(register)?.fields;
    /* AND THE ROW KEEPS THAT NAME BESIDE THE BANK'S WORDS, only on a list that declares a text field for it and only
       where the pattern read none itself: another list's `payee` may be a link to somebody, and a name written into
       one would refuse the whole charge. */
    /* A NAME IS WORDS (Q15 of 29 October): "0140", the end of an account number a transfer went to, was written as the
       payee and read as one on Payees and the Ledger. Text with no letter is kept as the bank's words alone. */
    if (clean !== '' && /\p{L}/u.test(clean) && declaredFields?.[PAYEE]?.type === 'text' && Object.hasOwn(declaredFields, PAYEE) && !Object.hasOwn(extracted, PAYEE))
      extracted[PAYEE] = clean;
    if (declaredFields !== undefined && !Object.hasOwn(declaredFields, COUNTERPARTY)) {
      delete extracted[COUNTERPARTY];
      for (const list of [missed, soft, invalid]) if (list.includes(COUNTERPARTY)) list.splice(list.indexOf(COUNTERPARTY), 1);
    }

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
    /* A ROW FOUND ONLY BY ITS PRINTED TAIL IS `proposed` UNTIL A PERSON HAS ACCEPTED ONE: once per account and tail,
       whichever pattern asked, read from the rowsets and the tail questions a person answered (`confirmedTail`). A lookup
       that matched the whole value never reaches `tails`, so it files as it always did. */
    const pending = tails.filter((t) => !confirmedTail(deps.sql, t));

    /**
     * ONE QUESTION PER LIST AND DIGITS, AT EVERY DOOR, WHERE THE ACCOUNT IS THE ONLY THING NOT READ.
     *
     * Digits printed for an account nobody holds them on, and nothing else missing: the arrival waits under the one
     * question "Which account is the card ending 1234?", which every later text printing those digits joins, at this
     * door or any other that reads them. It was a question per text, each asking to add a row with its account empty,
     * which the list refuses.
     *
     * AND DIGITS AN AGENT WROTE ON AN ACCOUNT ARE CONFIRMED ONCE. They read, and the row they name is an
     * agent's word about money, so the first text that reads them waits under the same one question with that account
     * suggested, and never under one per text. Digits a person wrote are their word, and file.
     *
     * A MESSAGE THAT PRINTS NO DIGITS KEEPS THE QUESTION IT HAD, joined by door and missed field below.
     */
    const unknown = read.unknowns[0];
    if (unknown !== undefined && missed.length === 1 && missed[0] === unknown.field && invalid.length === 0)
      return ok(holdTail(deps, { at, raw, door: doorOf, matched, register, extracted, text, tail: unknown, suggested: null, store, note }));
    const agent = missed.length === 0 ? read.agents.find((a) => !confirmedTail(deps.sql, { digits: a.digits, row: a.row })) : undefined;
    if (agent !== undefined)
      return ok(holdTail(deps, { at, raw, door: doorOf, matched, register, extracted, text, tail: agent, suggested: agent.row, store, note }));

    /* A SENDER NOBODY HAS SAID YES TO (`senderToAsk`): a stranger's own signed mail is verified, and a pattern that reads
       only the words would have filed it. Never filed by BrainDog on its own, whatever else reads clearly. */
    const unknownSender = senderToAsk(deps, arrival, matched, headers);
    /* A REPEAT OF A ROW ALREADY THERE WRITES NOTHING, so it asks nothing: it is set aside as any repeat is, and only a
       sender somebody vouched for may add what the row never said (`nearFill`, below). */
    const newSender = unknownSender !== null && (matched.on_conflict ?? 'skip') === 'skip' && existingRow(deps, register, matched.dedupe, extracted) ? null : unknownSender;
    const confidence = worse(
      missed.length ? 'needs-review' : soft.length || pending.length || newSender !== null ? 'proposed' : 'exact',
      lid,
    );
    /* A CARD TEXT THAT IS SURE IS FILED WITH A MARK, not asked about (`arrivalSure`). */
    const sure =
      deps.settle !== undefined && confidence === 'proposed' && pending.length > 0 && newSender === null
        ? arrivalSure({
            ruleTrusted: lid === 'exact',
            missed: missed.length + invalid.length,
            soft: soft.length,
            tails: pending.length,
            amount: amountRead(deps.schemaOf(register), extracted),
            payee: printed !== '',
          })
        : null;

    /* A FAILURE DOWNGRADES RATHER THAN DISCARDS. The bytes stay, the reason is on them, and the
       extraction goes in front of a person as a `rowset` they can accept — which is the only thing
       that makes a pattern nobody has approved yet safe to leave switched on. */
    if (confidence !== 'exact') {
      const state = confidence === 'proposed' ? 'proposed' : 'review';
      /* THE REASON NAMES FIELDS BY THEIR LABELS AND NOTHING OUT OF THE PAYLOAD but a printed tail's digits, which end a
         value the record already held (`byTail` below): `43 §6`'s leak rule. The middle arm is new with the combinators:
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
       * AND EACH SAYS THE PATTERN BY ITS NAME AND THE FIELDS BY THEIR LABELS. It named the pattern by its id
       * and the fields by theirs, "bank-from-out could not read account, on out of this one", in front of a person who
       * chose neither word. `could not read ... out of this one` and `could not make sense of` are kept, so a check that
       * matched the sentence still finds it; a receipt already in a record keeps the words it was written with.
       */
      const absent = missed.filter((field) => !invalid.includes(field));
      const words = wordsFor(deps, matched, register, arrival.channel);
      const by = opening(patternSaid(deps, matched));
      /* EXCEPT AN ACCOUNT NOT FOUND, which is said in his words: the message printed no digits to ask
         about, so it waits on its own question, and its reason names the field as the record speaks it and no pattern. */
      const unfound = absent.length > 0 && invalid.length === 0 && absent.every((field) => read.lookups.includes(field));
      const clauses = [
        unfound
          ? `${opening(words.fields(absent))} could not be found in this one.`
          : absent.length
            ? `${by} could not read ${words.fields(absent)} out of this one.`
            : '',
        invalid.length
          ? `${by} found ${words.fields(invalid)} in this one and could not make sense of ${new Set(invalid).size === 1 ? 'it' : 'them'}, so the format may have changed.`
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
       * accepts the suggestion opened below. Where the state really is `proposed` it keeps the words *"proposed rather
       * than written"*. The verb after the pattern's name has no person (`will`, a past tense), because the name is often
       * plural, "HSBC Egypt alerts", and "HSBC Egypt alerts waits" is not how a person speaks.
       */
      const guessed = new Set(soft).size === 1 ? 'it' : 'them';
      const held = state === 'review' ? 'will not write anything it reads until somebody accepts it, so this one waits for a person.' : '';
      /* THE CEILING IS NAMED ONLY WHEN IT IS WHAT HELD THIS ONE. With nothing missed or soft and the ceiling `exact`,
         the one cause left is a printed tail, and the sentence after this one says so. */
      const cause = missed.length
        ? clauses.join(' ')
        : soft.length
          ? held
            ? `${by} chose or defaulted ${words.fields(soft)} rather than reading ${guessed}, and it ${held}`
            : `${by} chose or defaulted ${words.fields(soft)} rather than reading ${guessed}, so what it read is proposed rather than written.`
          : held
            ? `${by} ${held}`
            : lid === 'exact'
              ? ''
              : `${by} will ask before it writes anything, so what it read is proposed rather than written.`;
      /* A TAIL IS SAID WHATEVER ELSE HELD THE ARRIVAL, because accepting the rowset confirms it, and a person should not
         confirm an account they were never told was read from its last digits. The digits are the end of the value the
         row already holds, so the sentence carries nothing the record did not have before the message came. */
      const byTail = pending.length
        ? `${pending.map((t) => `Filed to ${rowNamed(deps.sql, t)} by its last digits ${t.digits}.`).join(' ')} Confirm it once and later ones file straight away.`
        : '';
      /* AND THE SENDER, IN WORDS THAT CARRY NOTHING OUT OF THE PAYLOAD (`43 §6`): the question names it, for whoever answers. */
      const bySender = newSender === null ? '' : 'Nobody has said yes to this sender yet, so what it read is proposed rather than written.';
      const reason = [cause, byTail, bySender].filter((part) => part !== '').join(' ');
      store(state, reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', confidence);

      /* THE QUESTION IS SAID IN A PERSON'S WORDS, and now the reason is too. The reason is the inbox's; the
         question is what Decide draws, and it named the pattern and the list by their ids (`heldAsked`). */
      /* A PATTERN DRAWN FOR A SHAPE ASKS ONE QUESTION FOR IT, NEVER ONE PER TEXT. A text it reads only in part,
         or that its ceiling holds, joins the shape's one open question, whose count and samples grow; with none open and
         the pattern accepted it waits, and nothing new is asked by itself. A tail to confirm keeps its own question,
         because accepting that one is what confirms the account. */
      if (pending.length === 0 && newSender === null) {
        const one = patternWaits(deps, matched.ingest, shapeOf(arrival.channel, headers), raw);
        if (one !== undefined) return ok<Arrived>({ raw, ingest: matched.ingest, state, wrote: [], reason, confidence, ...(one === null ? {} : { suggestion: one }) });
      }
      /* A LOOKUP THE MESSAGE GAVE NO DIGITS FOR IS ONE QUESTION PER DOOR AND WHAT WAS MISSED, not one per payee: the
         person's answer is the same for every charge it holds (which account), so splitting it by shop asked it again for
         each shop. A miss that is not a lookup's joins by payee as it did. */
      const lookupMissed = missed.some((field) => read.lookups.includes(field));
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        raw,
        ...(lookupMissed ? { joins: JSON.stringify(['door', doorOf, ...[...missed].sort()]) } : newSender === null ? {} : { joins: JSON.stringify(['sender', newSender]) }),
        ...(newSender === null ? {} : { sender: newSender }),
        ...(newSender !== null && missed.length === 0 && invalid.length === 0 && soft.length === 0
          ? senderAsked(words, newSender)
          : sure?.sure
          ? {
              question: fit(words, [(_s, _l, n) => `Filed by BrainDog: matched ${n} by its last digits`], rowNamed(deps.sql, pending[0]!)),
              context: `A text from a sender you set up, with its amount and shop read clearly and the account matched by its last digits ${pending[0]!.digits}.`,
              confident: true,
            }
          : heldAsked(deps, words, {
              absent,
              invalid,
              soft,
              tails: pending,
              waits: lid !== 'exact',
            })),
        ...(pending.length ? { tails: pending } : {}),
        /* A DOUBTFUL ARRIVAL GOES TO TO REVIEW; money not read cleanly still asks in Needs you. */
        ...(!sure?.sure && moneyClean(deps.schemaOf(register), extracted, [...missed, ...invalid, ...soft]) ? { review: true } : {}),
      });
      /* FILED NOW, signed by BrainDog so it shows in Handled with its Undo. A refusal leaves it a question, in the words
         a question has (`heldAsked`), not the words of a filing that did not happen. */
      if (sure?.sure) {
        const done = deps.settle!(suggestion);
        if (!done.ok) unfile(deps, suggestion, heldAsked(deps, words, { absent, invalid, soft, tails: pending, waits: lid !== 'exact' }));
      }
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
      /* A SKIP IS NEVER SILENT: it keeps the row it repeats, on its `match` line, and says it by its name,
         amount and day, so the Inbox can offer "It is a second one" on the text itself. */
      const reason = repeatSaid(deps, register, existing, matched.dedupe);
      /* AND WHAT THE KEPT ROW NEVER SAID, the second sighting says onto it when that row was the only one it could be
         (`nearFill`): its reference, so the row is claimed and a second payment of the same amount with another reference
         is written beside it (review of 30 October, R11), and the balance after it (recheck of 30 October). A refusal
         leaves the row as it was: the skip stands. WHAT WAS WRITTEN IS NAMED on a `filled` line before the
         repeat mark, so "It is a second one" takes exactly that back (R12). */
      const fill = unknownSender === null ? nearFill(deps, register, existing, matched.dedupe, extracted) : null;
      if (fill !== null && deps.write(register, existing.id, fill, `ingest:${matched.ingest}`).ok)
        note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', JSON.stringify(Object.keys(fill).sort()), { field: 'filled', from: existing.id });
      store('skipped', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'skipped', { field: 'repeats', from: existing.id });
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason, repeats: existing.id });
    }

    /* THE SAME WORDS AGAIN, WITH NO ROW LEFT TO SAY SO (`heardBefore`): held for a person, and nothing written. */
    if (!existing && !already) {
      const before = heardBefore(deps, arrival, body, headers, register, extracted);
      if (before !== null) {
        const reason = `The same words from this sender came on ${before.slice(0, 10)}, so this waits to be looked at and is not filed again.`;
        store('review', reason);
        note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'review');
        return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason, confidence: 'needs-review' });
      }
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
      /* THE ROW BY ITS TITLE AND THE PATTERN BY ITS NAME, where this said `transactions#1` and `bank-card`: the
         row's id still rides in `resembles`, for a screen and not for a person. */
      const title = rowTitle(deps.sql, register, existing.id);
      const reason = `This looks like ${title ?? `one already in ${words.list}`}, with ${listedIn((field) => fieldSaid(schema, field))}, so ${patternSaid(deps, matched)} held it for a person rather than skip it or file it twice.`;
      store('review', reason);
      note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'needs-review');
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        resembles: existing.id,
        ...nearAsked(words, title, listedIn((field) => words.fields([field]))),
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
      /* THE FIELD THE LIST REFUSED IS SAID BY ITS LABEL, and the refusal's own sentence is not, because it names fields
         and lists by their ids. The reason said it whole, "transactions refused what bank-card read: ..."; it is the
         list and the pattern by their names now, and the part refused by its label where the list has that field. */
      const words = wordsFor(deps, matched, register, arrival.channel);
      const faulted = refused(wrote) && typeof wrote.refusal.at === 'string' ? wrote.refusal.at.replace(/^fields\./, '') : null;
      const part = faulted !== null && Object.hasOwn(deps.schemaOf(register)?.fields ?? {}, faulted) ? words.fields([faulted]) : null;
      const reason = `${opening(words.list)} would not take what ${patternSaid(deps, matched)} read from this one${part === null ? '' : `, because of its ${part}`}.`;
      store('review', reason);
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register,
        rows: [extracted],
        question: fit(words, [(source, list) => `${list} would not take ${source} as read. Fix it and add it?`]),
        context:
          part === null ? '' : `The part it would not take is its ${part}.`,
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
  }
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
 *
 * BUT ONLY A ROW ABOUT THE SAME THING JOINS (`joinsOn`): the same payee and money moving the same way. The words alone
 * were the key, and "held for you to check" or "a best guess" carry no merchant and no amount, so every charge a
 * pattern held piled into one card of up to two hundred, which a person read by its first row and accepted whole. A
 * charge at another shop, or a refund beside a payment, is its own question now.
 *
 * AND A JOIN IS WRITTEN DOWN. Growing an open question changed what one press would accept with nothing in the log to
 * say so; each row that joins writes a `suggest` event on the question with `field: 'rows'` and the count before and
 * after, and the body carries `count`, so the heading can say how many it asks about.
 */
export function openRowset(
  deps: IngestDeps,
  at: string,
  item: {
    ingest: string;
    register: string;
    rows: Record<string, unknown>[];
    question: string;
    context?: string;
    resembles?: string;
    tails?: Tail[];
    raw?: string;
    joins?: string;
    /** BrainDog files it itself: the body says so, and `handledFault` lets an ingest's add through on it. */
    confident?: boolean;
    /** A doubtful arrival waits in To review and not in Needs you; the body says so (`review`) and the queue reads stop at it. */
    review?: boolean;
    /** The mail address this waits on: accepting it is the yes `confirmedSender` reads, as a tail's is `confirmedTail`'s. */
    sender?: string;
  },
): string {
  const context = item.context ?? '';
  const joins = item.joins ?? joinsOn(deps, item.register, item.rows);
  const asked = deps.sql.one<{ id: string; body: string }>(
    `SELECT s.id, s.body FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest'
      WHERE s.body_kind = 'rowset' AND s.status = 'open' AND s.opened_by = ? AND json_extract(s.body, '$.register') = ?
        AND coalesce(e.to_v, e.note) = ? AND coalesce(json_extract(s.body, '$.context'), '') = ?
        AND coalesce(json_extract(s.body, '$.resembles'), '') = ? AND coalesce(json_extract(s.body, '$.joins_on'), '') = ?
        AND coalesce(json_array_length(s.body, '$.rows'), 0) + ? <= ?
        AND coalesce(json_extract(s.body, '$.review'), 0) = ?
      ORDER BY s.rowid LIMIT 1`,
    `ingest:${item.ingest}`,
    item.register,
    item.question.slice(0, 280),
    context,
    item.resembles ?? '',
    joins,
    item.rows.length,
    ROWS_ASKED_MOST,
    item.review ? 1 : 0,
  );
  const held = asked ? heldBody(asked.body) : null;
  if (asked && held) {
    /* A TAIL ONCE, as `confirmedTail` reads one: the digits and the row they were matched to. */
    const tails = [...held.tails, ...(item.tails ?? []).filter((t) => !held.tails.some((h) => h.digits === t.digits && h.row === t.row))];
    const rows = [...held.rows, ...item.rows];
    /* THE ARRIVAL BESIDE ITS ROW, place for place, so a held text looked at again finds the row it is asked as. A body
       filed before `raws` has none and keeps none: its rows are found by what they say (`sameRow`). */
    const raws = Array.isArray(held.body.raws) && item.raw !== undefined ? { raws: [...(held.body.raws as unknown[]), item.raw] } : {};
    deps.sql.exec(
      'UPDATE suggestion SET body = ? WHERE id = ?',
      JSON.stringify({ ...held.body, rows, count: rows.length, ...(tails.length ? { tails } : {}), ...raws }),
      asked.id,
    );
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', 'rows', ?, ?, ?)",
      deps.mint(),
      at,
      `ingest:${item.ingest}`,
      `suggestion:${asked.id}`,
      String(held.rows.length),
      String(rows.length),
      `${rows.length - held.rows.length === 1 ? 'One more' : `${rows.length - held.rows.length} more`} like it joined this question, ${rows.length} in all.`,
    );
    return asked.id;
  }
  const cause = freeCause(deps.sql, rowsetCause(item.ingest, item.register, item.question.slice(0, 280), context, item.resembles ?? '', joins));
  const id = `SG${deps.allocate('suggestion')}`;
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, cause) VALUES (?, 'rowset', ?, 'open', ?, ?, ?)",
    id,
    JSON.stringify({
      cause,
      register: item.register,
      rows: item.rows,
      count: item.rows.length,
      ingest: item.ingest,
      ...(joins === '' ? {} : { joins_on: joins }),
      ...(context === '' ? {} : { context }),
      ...(item.resembles === undefined ? {} : { resembles: item.resembles }),
      /* THE TAILS THIS ONE WAITS ON, so accepting it is the confirmation `confirmedTail` reads, with no table beside it. */
      ...(item.tails === undefined ? {} : { tails: item.tails }),
      ...(item.sender === undefined ? {} : { sender: item.sender }),
      ...(item.raw === undefined ? {} : { raws: [item.raw] }),
      ...(item.confident ? { confident: true, why: [context] } : {}),
      ...(item.review ? { review: true } : {}),
    }),
    `ingest:${item.ingest}`,
    at,
    cause,
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

/**
 * The cause of a question an arrival opens: what `openRowset` joins on, the pattern, the list, the words, the
 * context, what it resembles and the payee it is about, hashed. Not its rows, which grow as arrivals join it, so the
 * cause stays put while the question does.
 */
function rowsetCause(ingest: string, register: string, question: string, context: string, resembles: string, joins: string): string {
  return `ingest#${sha256(new TextEncoder().encode(canon([ingest, register, question, context, resembles, joins]))).slice(0, 24)}`;
}

/**
 * `cause`, or when an open question already holds it, the first of `cause#2`, `cause#3`... none does. One holds it only
 * when it is full (`ROWS_ASKED_MOST`), since `openRowset` joins any other, and the one asked beside it must not be
 * refused by the index that keeps one open question a cause (migration 31).
 */
function freeCause(sql: Sql, cause: string): string {
  const held = new Set(
    sql.all<{ cause: string }>("SELECT cause FROM suggestion WHERE status = 'open' AND (cause = ? OR cause LIKE ?)", cause, `${cause}#%`).map((r) => r.cause),
  );
  let n = 1;
  while (held.has(n === 1 ? cause : `${cause}#${n}`)) n++;
  return n === 1 ? cause : `${cause}#${n}`;
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

/**
 * What a held row is about, as the key an open question it may join must share: its payee and which way each of its
 * amounts moves. `''` for rows that carry neither, which join as they always did, since nothing tells them apart.
 *
 * THE PAYEE IS `counterparty_text` WHERE A PATTERN READ ONE, else the row's title as its list declares it (a merchant,
 * a payee, a name), when that is words; case and spacing are folded, so `HALDEN  Coffee` and `Halden Coffee` are one.
 * THE SIGN AND NOT THE AMOUNT, so two coffees at one shop are one question, and a refund is never asked under a charge.
 * Read off the list's declaration rather than any field's name, so every add-on's ledger is keyed the same way.
 */
function joinsOn(deps: IngestDeps, register: string, rows: readonly Record<string, unknown>[]): string {
  const fields = deps.schemaOf(register)?.fields ?? {};
  const list = declaredList(deps.sql, register);
  const title = typeof list.title === 'string' && TITLED.has(fields[list.title]?.type) ? list.title : null;
  const words = (value: unknown): string => (typeof value === 'string' ? value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim() : '');
  const keys = rows.map((row) => {
    const party = words(row[COUNTERPARTY]) || (title === null ? '' : words(row[title]));
    const signs = Object.entries(fields).flatMap(([id, field]) => {
      const amount = field.type === 'money' ? (row[id] as { amount?: unknown } | null | undefined)?.amount : undefined;
      return typeof amount === 'number' && Number.isFinite(amount) ? [`${id}:${amount < 0 ? '-' : amount > 0 ? '+' : '0'}`] : [];
    });
    return party === '' && signs.length === 0 ? '' : JSON.stringify([party, ...signs]);
  });
  const once = keys.filter((key, i) => keys.indexOf(key) === i);
  return once.length === 1 ? once[0]! : JSON.stringify(once);
}

/* ── the digits a lookup reads an account by ─────────────────── */

/** The shortest bare run of digits read as an account's number rather than an amount, for the reverse tail. */
const BARE_NUMBER = 8;

/**
 * The most digits a bare run may hold and still be read as a printed tail, on a lookup that says what it reads: a card's
 * last four, or six. A longer bare run is an account's whole number, which the reverse tail reads.
 */
const BARE_TAIL_MOST = 6;

/** A field id as `34 §4` spells one, the only shape that is read into a path or out of a row's fields here. */
const FIELD_ID = /^[a-z][a-z0-9_]{0,31}$/;

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/** The parts of a value a `split` lookup holds, parted by commas: `7731, 1234` is two. */
const partsOf = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

/**
 * The digits a slice's first token prints, and whether stars stood before them: the run after the first run of stars
 * and one `-` or space, or the token itself when it is digits alone. `null` for a token that prints neither, for fewer
 * than three digits, and for digits a letter follows (`*44KIOSK` is a name).
 */
function firstRun(masked: string): { digits: string; starred: boolean } | null {
  let first = 0;
  while (masked[first] === ' ') first += 1;
  const text = masked.slice(first);
  const space = text.indexOf(' ');
  const end = space === -1 ? text.length : space;
  const star = text.indexOf('*');
  if (star !== -1 && star < end) {
    let at = star;
    while (text[at] === '*') at += 1;
    if (text[at] === '-' || text[at] === ' ') at += 1;
    const from = at;
    while (isDigit(text[at])) at += 1;
    if (at - from < 3 || /^[A-Za-z]/.test(text.slice(at))) return null;
    return { digits: text.slice(from, at), starred: true };
  }
  const token = text.slice(0, end).replace(/[.,;:)]+$/, '');
  return /^\d{3,}$/.test(token) ? { digits: token, starred: false } : null;
}

/**
 * The reverse tail: printed digits longer than a stored value of three digits or more that they end in (`printedTail`).
 *
 * A BARE RUN IS KEPT BY ITS LAST FOUR, or by the stored value where that is longer. A bare run of
 * `BARE_NUMBER` digits or more is a whole card or account number, and what is answered here is what a confirmation, a
 * tail question and an account's field keep: a text that printed a card's sixteen digits must never put them there.
 */
function reverseTail(masked: string, whole: string): string | null {
  if (!/^\d{3,}$/.test(whole)) return null;
  const run = firstRun(masked);
  if (run === null || (!run.starred && run.digits.length < BARE_NUMBER)) return null;
  if (run.digits.length <= whole.length || !run.digits.endsWith(whole)) return null;
  return run.starred ? run.digits : run.digits.slice(-Math.max(LAST_FOUR, whole.length));
}

/** How many of a whole number's digits are kept as its tail: a card's last four. */
const LAST_FOUR = 4;

/** Whether a run a message printed is these kept digits: the same, or a whole bare number that ends in them. */
const printsDigits = (run: { digits: string; starred: boolean } | null, digits: string): boolean =>
  run !== null && (run.digits === digits || (!run.starred && run.digits.length >= BARE_NUMBER && run.digits.endsWith(digits)));

/** The first `lookup` a form holds, however deep under `first`, `nth` or `default`, or `null`. */
function lookupOf(form: Extractor, depth = 1): LookupForm | null {
  if (form === null || typeof form !== 'object' || depth > NESTING) return null;
  if ('lookup' in form) return form.lookup;
  if ('first' in form) {
    for (const arm of Array.isArray(form.first) ? form.first : []) {
      const got = lookupOf(arm, depth + 1);
      if (got !== null) return got;
    }
    return null;
  }
  if ('nth' in form) return lookupOf(form.nth.of, depth + 1);
  if ('default' in form) return lookupOf(form.default.of, depth + 1);
  return null;
}

/** The noun a lookup says, trimmed, or `null` where it says none. */
const saysOf = (lookup: LookupForm): string | null => (typeof lookup.says === 'string' && lookup.says.trim() !== '' ? lookup.says.trim() : null);

/** A field a lookup read, and the digits the message printed for it. */
type Printed = { field: string; digits: string; lookup: LookupForm };

/**
 * The digits a message printed where a `lookup` reads, whatever row they name or none: `unknownTail` beside
 * `printedTail`, with no row needed. Digits behind stars are always a tail, because the stars are the bank saying so; a
 * bare run of three to six counts only on a lookup that `says` what it reads, since a bare number is a figure as often as
 * not. `null` for a form with no lookup, and for a message that prints no digits there, which keeps the question it had.
 */
export function unknownTail(form: Extractor, text: string, depth = 1): { digits: string; lookup: LookupForm } | null {
  if (form === null || typeof form !== 'object' || depth > NESTING) return null;
  if ('first' in form) {
    for (const arm of Array.isArray(form.first) ? form.first : []) {
      const got = unknownTail(arm, text, depth + 1);
      if (got !== null) return got;
    }
    return null;
  }
  if ('nth' in form) return unknownTail(form.nth.of, text, depth + 1);
  if ('default' in form) return unknownTail(form.default.of, text, depth + 1);
  if (!('lookup' in form)) return null;
  const lookup = form.lookup;
  const mask = maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
  for (const anchored of slices(form as Record<string, unknown>, text)) {
    const run = firstRun(mask + anchored);
    if (run === null) continue;
    if (run.starred || (saysOf(lookup) !== null && run.digits.length <= BARE_TAIL_MOST)) return { digits: run.digits, lookup };
  }
  return null;
}

/**
 * The digits a lookup that found `row` as a whole value printed, when they are digits and one of the row's own values,
 * or `null`. What an agent wrote on an account is asked about by these.
 */
function wholeDigits(deps: IngestDeps, form: Extractor, text: string, row: string): { digits: string; lookup: LookupForm } | null {
  const lookup = lookupOf(form);
  if (lookup === null) return null;
  const held = lookupTable(deps, lookup)
    .filter((r) => r.id === row)
    .map((r) => r.value);
  const mask = maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
  for (const anchored of slices({ lookup } as Record<string, unknown>, text)) {
    const run = firstRun(mask + anchored);
    if (run !== null && held.includes(run.digits)) return { digits: run.digits, lookup };
  }
  return null;
}

/**
 * Every value a lookup reads, row by row: `deps.rows` as the record hands it down, or, for a lookup with a `where` or a
 * `split`, the list read here through `deps.sql`, each live row the filter admits and each part of a value it splits.
 *
 * A FILTER OVER A LIST THIS RECORD DOES NOT HOLD ADMITS NOTHING, and so does one `where` cannot read: a card text is never
 * matched to an account the filter was written to keep out, by a filter that quietly stopped filtering.
 */
function lookupTable(deps: IngestDeps, lookup: LookupForm): { id: string; value: string }[] {
  const split = lookup.split === true;
  if (!split && (lookup.where === undefined || lookup.where === null)) return deps.rows(lookup.register, lookup.by);
  if (typeof lookup.by !== 'string' || !FIELD_ID.test(lookup.by)) return [];
  const admits = filterOf(deps, lookup.register, lookup.where);
  const out: { id: string; value: string }[] = [];
  for (const row of liveRows(deps.sql, lookup.register)) {
    if (!admits(row)) continue;
    const value = row.fields[lookup.by];
    if (value === null || value === undefined || typeof value === 'object') continue;
    for (const part of split ? partsOf(String(value)) : [String(value)]) out.push({ id: row.id, value: part });
  }
  return out;
}

/**
 * A lookup's `where` as a test of one row: a sentence ("kind is card") read against the list as a page's filter is, or the
 * tree form. No filter admits every row; a filter this record cannot read, or over a list it does not hold, admits none.
 */
function filterOf(deps: Pick<IngestDeps, 'schemaOf' | 'nowMs'>, register: string, where: Predicate | string | undefined | null): (row: LiveRow) => boolean {
  if (where === undefined || where === null) return () => true;
  const schema = deps.schemaOf(register);
  if (schema === null) return () => false;
  const said = typeof where === 'string' ? parseWhere(where, schema, { nowMs: deps.nowMs }) : { predicate: where, bad: [] };
  const predicate = said.predicate;
  if (said.bad.length > 0 || predicate === undefined) return () => false;
  return (row) => evaluate(predicate, row.fields, schema, row);
}

/** A live row of a list, with the columns a `where` may name beside its fields. */
type LiveRow = { id: string; seq: number | null; fields: Record<string, unknown>; state: string | null; version: number; created_at: string; updated_at: string };

function liveRows(sql: Sql, register: string): LiveRow[] {
  return sql
    .all<{ id: string; seq: number | null; fields: string; state: string | null; version: number; created_at: string; updated_at: string }>(
      'SELECT id, seq, fields, state, version, created_at, updated_at FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq, rowid',
      register,
    )
    .flatMap((r) => {
      const fields = parsed(r.fields);
      return fields === null ? [] : [{ ...r, fields }];
    });
}

/** A JSON object out of a column, or `null` for anything else. */
function parsed(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Whether the digits in `by` on `row` were last written by an agent: a run (`S42`) or Slash. A person's own word, the
 * record's import and a rule are not asked about, as they never were.
 */
function writtenByAgent(sql: Sql, row: string, by: string): boolean {
  const actor = sql.one<{ actor: string }>(
    "SELECT actor FROM event WHERE target = ? AND ((kind = 'edit' AND field = ?) OR kind = 'create') ORDER BY rowid DESC LIMIT 1",
    `entry:${row}`,
    by,
  )?.actor;
  return actor !== undefined && (actor === SLASH || RUN_ACTOR.test(actor));
}

/** A run's name as its writes are signed. */
const RUN_ACTOR = new RegExp(`^${SESSION_PREFIX}\\d+$`);

/* ── a money form's currency, read off its account ─────────────────────── */

/** Every `currency: { of, field }` a form holds. */
function currenciesOf(form: unknown, depth = 1): CurrencyOf[] {
  if (form === null || typeof form !== 'object' || depth > NESTING) return [];
  const f = form as Record<string, unknown>;
  if (Array.isArray(f.first)) return f.first.flatMap((arm) => currenciesOf(arm, depth + 1));
  const inner = (f.nth as { of?: unknown } | undefined)?.of ?? (f.default as { of?: unknown } | undefined)?.of;
  if (inner !== undefined) return currenciesOf(inner, depth + 1);
  const money = f.money as { currency?: unknown } | undefined;
  const c = money?.currency;
  return c !== null && typeof c === 'object' && typeof (c as CurrencyOf).of === 'string' && typeof (c as CurrencyOf).field === 'string' ? [c as CurrencyOf] : [];
}

/**
 * `form` with each `currency: { of, field }` replaced by the code the row in `extracted[of]` holds there, or taken out
 * where it holds none: then only a code the text prints is read, and a text with neither waits.
 */
function currencyFilled(deps: IngestDeps, form: Extractor, extracted: Record<string, unknown>, depth = 1): Extractor {
  if (form === null || typeof form !== 'object' || depth > NESTING) return form;
  if ('first' in form) return { ...form, first: (Array.isArray(form.first) ? form.first : []).map((arm) => currencyFilled(deps, arm, extracted, depth + 1)) };
  if ('nth' in form) return { ...form, nth: { ...form.nth, of: currencyFilled(deps, form.nth.of, extracted, depth + 1) } };
  if ('default' in form) return { ...form, default: { ...form.default, of: currencyFilled(deps, form.default.of, extracted, depth + 1) } };
  if (!('money' in form)) return form;
  const said = form.money.currency;
  if (said === undefined || typeof said === 'string') return form;
  const code = currencyOfRow(deps.sql, extracted[said.of], said.field);
  const { currency: _theirs, ...rest } = form.money;
  return { ...form, money: code === null ? rest : { ...rest, currency: code } } as Extractor;
}

/** The currency a row keeps in `field`: a money value's code, or a code written as text. `null` for anything else. */
function currencyOfRow(sql: Sql, row: unknown, field: string): string | null {
  if (typeof row !== 'string' || !FIELD_ID.test(field)) return null;
  const fields = parsed(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ? AND deleted_at IS NULL', row)?.fields);
  const value = fields?.[field];
  const code = value !== null && typeof value === 'object' ? (value as { currency?: unknown }).currency : value;
  return typeof code === 'string' && /^[A-Z]{3}$/u.test(code) ? code : null;
}

/* ── every field of one arrival ─────────────────────────────────────────── */

/**
 * What one arrival's fields read, and how: the values, what could not be read, what was guessed, the rows found by a
 * printed tail, the digits printed for an account nobody holds them on (`unknowns`), the accounts found by digits an
 * agent wrote (`agents`), and which fields a lookup reads.
 */
type Read = {
  extracted: Record<string, unknown>;
  missed: string[];
  /**
   * The subset of `missed` the message DID carry and this build could not read (`43 §4.5`).
   *
   * ONLY A `map:` CAN FILL THIS. The `extract:` branch reads a form over free text, where a form that matches nothing has
   * found nothing, so there is no value there to be unreadable. A `map:` reads a named path out of a JSON answer, so
   * `{"date": "29.08.2026"}` is a field that was sent and a field we could not read, and those are two different
   * sentences to put in front of a person.
   */
  invalid: string[];
  /* THE OUTCOME PER FIELD, not only the value: `43 §5.1` step 7 files a row by the worst of them. */
  soft: string[];
  tails: Tail[];
  unknowns: Printed[];
  agents: (Printed & { row: string })[];
  lookups: string[];
};

/**
 * Every field of one arrival, read and nothing written.
 *
 * A MAP READS THE BODY AS JSON, once, and each field by its path; an extract reads the text with anchors. The outcomes are
 * the same words, so everything after files a mapped row exactly as it files an extracted one. And the mapped half is
 * `readRow`, which a connector's page calls too.
 *
 * A FIELD WHOSE ROW ANOTHER FIELD'S CURRENCY IS READ OFF IS READ FIRST, so `currency: { of: account }` has the account
 * in hand; the rest keep their declared order.
 */
function readFields(deps: IngestDeps, matched: IngestDecl, body: string, text: string, at: string): Read {
  const read: Read = { extracted: {}, missed: [], invalid: [], soft: [], tails: [], unknowns: [], agents: [], lookups: [] };
  if (matched.map !== undefined && matched.extract === undefined) {
    /* A ROUTED WRITE HAS NO SCHEMA YET AND THIS IS THE ORDER SAYING SO: `43 §5.1` reads the fields at step 5 and routes
       at step 6, because the route reads the values step 5 produced. */
    const fields = (typeof matched.writes.register === 'string' ? deps.schemaOf(matched.writes.register)?.fields : undefined) ?? {};
    const got = readRow({ exponent: exponentOf, day: deps.day ?? day }, matched.map, parseAnswer(body), at, (field) => fields[field]?.type);
    Object.assign(read.extracted, got.fields);
    read.missed.push(...got.missed);
    read.soft.push(...got.soft);
    read.invalid.push(...got.invalid);
    return read;
  }
  const entries = Object.entries(matched.extract ?? {});
  const first = new Set(entries.flatMap(([, form]) => currenciesOf(form).map((c) => c.of)));
  entries.sort(([a], [b]) => Number(first.has(b)) - Number(first.has(a)));
  for (const [field, declared] of entries) {
    /* A FIELD'S `strip:` IS READ AFTER ITS FORM AND NEVER BY IT. The form is handed on without the key, because `slices`
       takes the first key that is not `note` as the form, and `{ strip, text }` would have cut the text by the list of
       prefixes. A value the prefixes leave empty is a miss, as an empty slice is. */
    const { form: bare, strip } = stripOf(declared);
    const form = currencyFilled(deps, bare, read.extracted);
    const lookup = lookupOf(form);
    if (lookup !== null) read.lookups.push(field);
    const got = resolve(deps, form, text);
    const value = strip === null || typeof got.value !== 'string' ? got.value : stripped(got.value, strip) || null;
    if (value === null) {
      read.missed.push(field);
      const tail = lookup === null ? null : unknownTail(form, text);
      if (tail !== null) read.unknowns.push({ field, ...tail });
      continue;
    }
    read.extracted[field] = value;
    /* A ROW FOUND BY ITS PRINTED TAIL IS NOT A CHOICE OR A DEFAULT, and the fold says which it is. */
    if (got.outcome === 'tail' && got.tail !== undefined && typeof got.value === 'string')
      read.tails.push({ field, digits: got.tail.digits, row: got.value, register: got.tail.register });
    else if (got.outcome !== 'exact') read.soft.push(field);
    else if (lookup !== null && typeof value === 'string') {
      const printed = wholeDigits(deps, form, text, value);
      if (printed !== null && writtenByAgent(deps.sql, value, printed.lookup.by)) read.agents.push({ field, row: value, ...printed });
    }
  }
  return read;
}

/* ── one question per list and digits, whatever door ───────────── */

/** The answer that says none of the accounts offered is the one. */
export const NONE = 'none';

/** The most accounts a tail question offers, the ones with no digits first. */
const TAIL_OPTIONS_MOST = 12;

/** How many waiting arrivals are run again in one go: as many as one rowset may hold (`MAX_ROWS` in `govern.ts`). */
const REPLAY_BATCH = 200;

/** How long after an answer digits moved to another account still ask to move what they filed. */
const MOVE_DAYS = 30;

/**
 * The cause of a tail question: the list the lookup reads, the field and the digits.
 *
 * NOT THE DOOR. The owner's card ending 7731 is printed by the bank's mail and by its texts, two
 * doors, and with the door in the cause it was asked about twice and one answer closed one of the two.
 */
export const tailCause = (register: string, by: string, digits: string): string => `tail:${register}:${by}:${digits}`;

/** What makes two tail questions one: the list, the field and the digits. */
type TailKey = { register: string; by: string; digits: string };

/**
 * The tail questions about one list, field and digits, by what they asked and not by their cause string, so a question
 * opened when the cause still named its door is found too.
 */
const SAME_TAIL =
  "body_kind = 'options' AND json_valid(body) AND json_extract(body, '$.cause') LIKE 'tail:%' AND json_extract(body, '$.tail.register') = ? AND json_extract(body, '$.tail.by') = ? AND json_extract(body, '$.tail.digits') = ?";
const keyOf = (t: TailKey): [string, string, string] => [t.register, t.by, t.digits];

/**
 * What a tail question keeps about what it asks, so an answer can be carried out without the pattern that asked: the
 * door, the list and field the lookup reads, the digits, the noun, whether the field splits, and its filter.
 */
type TailAsked = { door: string; register: string; by: string; digits: string; says: string; split: boolean; where?: Predicate | string; ingest: string; field: string };

/** The words a tail question and its reason are said in: the list's word for one of its rows, and the field's label. */
function tailWords(sql: Sql, tail: TailAsked): { one: string; label: string } {
  const list = declaredList(sql, tail.register);
  const one = typeof list.one === 'string' && list.one.trim() !== '' ? list.one.trim() : 'account';
  const fields = Array.isArray(list.fields) ? (list.fields as { id?: unknown; label?: unknown }[]) : [];
  const label = fields.find((f) => f?.id === tail.by)?.label;
  const words = tail.by.replace(/_/g, ' ');
  return { one, label: typeof label === 'string' && label.trim() !== '' ? label.trim() : words.charAt(0).toUpperCase() + words.slice(1) };
}

/** A row of a list said by its title, or by the list's word for one and its number: never an id. */
function rowSaid(sql: Sql, register: string, row: { id: string; seq: number | null }): string {
  const title = rowTitle(sql, register, row.id);
  if (title !== null) return title;
  const list = declaredList(sql, register);
  const one = typeof list.one === 'string' && list.one.trim() !== '' ? list.one.trim() : 'account';
  return `${opening(one)} ${row.seq ?? ''}`.trim();
}

/**
 * Whether digits an account holds are the end of the digits a message printed: three or more, fewer than printed, and
 * what they end in (`826` for `5826`). The reverse tail reads a text that way (`printedTail`), so a tail question and its
 * answer read the account the same way, as the same digits kept short, and never as an account that holds others.
 *
 * MEASURED ON THE LIVE RECORD, 20 Oct: HSBC (EGP) held 826 and the bank's texts print 5826. The question offered every
 * account as holding nothing yet, and pressing HSBC was refused because it "already holds 826".
 */
const endsIn = (held: string, digits: string): boolean => /^\d{3,}$/.test(held) && held.length < digits.length && digits.endsWith(held);

/** The options a tail question offers: the rows the lookup's filter admits, the suggested one and those with no digits first, then "None of these". */
function tailOptions(deps: Pick<IngestDeps, 'sql' | 'schemaOf' | 'nowMs'>, tail: TailAsked, suggested: string | null): { id: string; label: string; because: string; recommended?: true }[] {
  const { one, label } = tailWords(deps.sql, tail);
  const rows = liveRows(deps.sql, tail.register).filter(filterOf(deps, tail.register, tail.where));
  const valueOf = (r: LiveRow): string => {
    const v = r.fields[tail.by];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim();
  };
  /* AN ACCOUNT HOLDING THE END OF THE DIGITS (`endsIn`) IS SAID SO, beside the suggested one, ahead of those holding none. */
  const short = (r: LiveRow): boolean => (tail.split ? partsOf(valueOf(r)) : [valueOf(r)]).some((v) => endsIn(v, tail.digits));
  const rank = (r: LiveRow): number => (r.id === suggested ? 0 : short(r) ? 1 : valueOf(r) === '' ? 2 : 3);
  const offered = [...rows].sort((a, b) => rank(a) - rank(b) || (a.seq ?? 0) - (b.seq ?? 0)).slice(0, TAIL_OPTIONS_MOST);
  return [
    ...offered.map((r) => ({
      id: r.id,
      label: rowSaid(deps.sql, tail.register, r),
      because:
        valueOf(r) === '' ? `Nothing is in its ${label} yet.` : short(r) ? `${label}: ${valueOf(r)}, the end of ${tail.digits}.` : `${label}: ${valueOf(r)}.`,
      ...(r.id === suggested ? { recommended: true as const } : {}),
    })),
    {
      id: NONE,
      label: 'None of these',
      because: `They keep waiting, and the ${tail.says} ending ${tail.digits} is not asked about again until a new ${one} is added.`,
    },
  ];
}

/** What a held arrival brings to its tail question. */
type Holding = {
  at: string;
  raw: string;
  door: string;
  matched: IngestDecl;
  register: string;
  extracted: Record<string, unknown>;
  text: string;
  tail: Printed;
  suggested: string | null;
  store: Store;
  note: Note;
};

/**
 * Hold an arrival under the one question for its list and digits, opening it or joining it, whichever door it came by.
 *
 * THE REASON IS IN HIS WORDS, from the list's declaration: "No account has 1234 in Digits the bank prints. It waits for
 * you to say which account it is." No pattern id and no list id. Digits an agent wrote say so, and that it waits for one
 * confirmation.
 *
 * AN ANSWER OF "NONE OF THESE" STANDS until an account is added: the arrival waits with it and nothing is asked again.
 */
function holdTail(deps: IngestDeps, h: Holding): Arrived {
  const asked: TailAsked = {
    door: h.door,
    register: h.tail.lookup.register,
    by: h.tail.lookup.by,
    digits: h.tail.digits,
    says: saysOf(h.tail.lookup) ?? 'account',
    split: h.tail.lookup.split === true,
    ...(h.tail.lookup.where === undefined || h.tail.lookup.where === null ? {} : { where: h.tail.lookup.where }),
    ingest: h.matched.ingest,
    field: h.tail.field,
  };
  const { one, label } = tailWords(deps.sql, asked);
  const cause = tailCause(asked.register, asked.by, asked.digits);
  const named = h.suggested === null ? null : rowTitle(deps.sql, asked.register, h.suggested);
  const held = { raw: h.raw, ingest: h.matched.ingest, state: 'review' as const, wrote: [], confidence: 'needs-review' as const };

  const declined = declinedTail(deps.sql, asked);
  if (declined !== null) {
    const reason = `No ${one} has ${asked.digits} in ${label}. You said it is none of the ones offered, so it waits until a new ${one} is added.`;
    h.store('review', reason);
    h.note('match', `ingest:${h.matched.ingest}`, `inbox_raw:${h.raw}`, 'inbox_raw', 'needs-review');
    keepRaw(deps.sql, declined, h.raw);
    return { ...held, reason };
  }

  const reason =
    h.suggested === null
      ? `No ${one} has ${asked.digits} in ${label}. It waits for you to say which ${one} it is.`
      : `${named ?? `The ${one}`} has ${asked.digits} in ${label}, put there by an agent, so it waits for you to confirm it once.`;
  h.store('review', reason);
  h.note('match', `ingest:${h.matched.ingest}`, `inbox_raw:${h.raw}`, 'inbox_raw', 'needs-review');
  const suggestion = askTail(deps, h.at, { cause, asked, raw: h.raw, register: h.register, extracted: h.extracted, text: h.text, suggested: h.suggested });
  return { ...held, reason, suggestion };
}

/**
 * The open tail question for `cause`, grown by one arrival, or a new one. Its body holds the arrivals it waits on
 * (`raws`, each once), how many, the total per currency of what they would file, the newest message's own words cut to
 * 280 characters, and the accounts offered, read again each time so an account added since is among them.
 */
function askTail(
  deps: IngestDeps,
  at: string,
  q: { cause: string; asked: TailAsked; raw: string; register: string; extracted: Record<string, unknown>; text: string; suggested: string | null },
): string {
  const open = deps.sql.one<{ id: string; body: string }>(`SELECT id, body FROM suggestion WHERE status = 'open' AND ${SAME_TAIL} ORDER BY rowid LIMIT 1`, ...keyOf(q.asked));
  const was = open === undefined ? null : parsed(open.body);
  const raws = Array.isArray(was?.raws) ? (was.raws as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  const totals: Record<string, number> = { ...((was?.totals as Record<string, number> | undefined) ?? {}) };
  const add = (amount: Minor | null): void => {
    if (amount !== null) totals[amount.currency] = (totals[amount.currency] ?? 0) + amount.amount;
  };
  /* A QUESTION ASKED AGAIN AFTER "NONE OF THESE" CARRIES WHAT WAITED UNDER THE ANSWERED ONE, which is still held, and
     what they come to: the count and the sum are of the same messages. */
  if (open === undefined)
    for (const d of declinedRaws(deps, q.asked)) {
      if (d.raw === q.raw || raws.includes(d.raw)) continue;
      raws.push(d.raw);
      add(d.amount);
    }
  const fresh = !raws.includes(q.raw);
  if (fresh) {
    add(moneyOf(deps, q.register, q.extracted));
    raws.push(q.raw);
  }
  const suggested = q.suggested ?? (typeof was?.suggested === 'string' ? was.suggested : null);
  const options = tailOptions(deps, q.asked, suggested);
  const { one } = tailWords(deps.sql, q.asked);
  const agent = suggested === null ? '' : `An agent put ${q.asked.digits} on ${rowTitle(deps.sql, q.asked.register, suggested) ?? `one ${one}`}. `;
  const nobody = options.length === 1 ? `No ${one} could be it yet; add it, and it is offered here. ` : '';
  const waiting = waitingSaid(raws.length, totals);
  const body = {
    ...(was ?? {}),
    cause: q.cause,
    tail: q.asked,
    options,
    raws,
    count: raws.length,
    totals,
    sample: cutTo(q.text.replace(/\s+/g, ' ').trim(), 280),
    context: cutTo(`${agent}${nobody}${waiting}`, 280),
    ...(suggested === null ? {} : { suggested }),
  };
  if (open !== undefined) {
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(body), open.id);
    if (fresh)
      deps.sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', 'rows', ?, ?, ?)",
        deps.mint(),
        at,
        `ingest:${q.asked.door}`,
        `suggestion:${open.id}`,
        String(raws.length - 1),
        String(raws.length),
        `One more message joined this question, ${raws.length} in all.`,
      );
    return open.id;
  }
  /* ONE OPEN QUESTION HOLDS A CAUSE AT A TIME (migration 31's unique index), so one already open on it is this one. */
  const holding = deps.sql.one<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND cause = ?", q.cause);
  if (holding !== undefined) return holding.id;
  const id = `SG${deps.allocate('suggestion')}`;
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, cause) VALUES (?, 'options', ?, 'open', ?, ?, ?)",
    id,
    JSON.stringify(body),
    `ingest:${q.asked.door}`,
    at,
    q.cause,
  );
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', ?)",
    deps.mint(),
    at,
    `ingest:${q.asked.door}`,
    `suggestion:${id}`,
    `Which ${one} is the ${q.asked.says} ending ${q.asked.digits}?`.slice(0, 280),
  );
  return id;
}

/** How many messages wait under a tail question and what they come to, one sum per currency: its context's last sentence. */
function waitingSaid(n: number, totals: Record<string, number>): string {
  const sums = Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => moneyText(minor, currency));
  return `${n} ${n === 1 ? 'message waits' : 'messages wait'} for this${sums.length ? `, ${listedAnd(sums)} in all` : ''}.`;
}

/** The sentence `waitingSaid` ends a context with, to be said again when the count changes. */
const WAITING_SAID = /\d+ messages? waits? for this[^]*$/u;

/**
 * The open tail questions over `register` offered again from the rows it holds now. Their options are read when a text
 * joins them, so an account added for the answer ("add it, and it is offered here") was not offered until the next text
 * came. The record calls this after a row is added to a list; it reads nothing where no tail question is open. Answers
 * how many questions it offered again.
 */
export function offerAgain(deps: Pick<IngestDeps, 'sql' | 'schemaOf' | 'nowMs'>, register: string): number {
  const open = deps.sql.all<{ id: string; body: string }>(
    "SELECT id, body FROM suggestion WHERE body_kind = 'options' AND status = 'open' AND json_valid(body) AND json_extract(body, '$.tail.register') = ? ORDER BY rowid LIMIT 50",
    register,
  );
  let n = 0;
  for (const q of open) {
    const body = parsed(q.body);
    const tail = body === null ? null : tailAsked(body);
    if (body === null || tail === null) continue;
    const options = tailOptions(deps, tail, typeof body.suggested === 'string' ? body.suggested : null);
    if (JSON.stringify(options) === JSON.stringify(body.options)) continue;
    const { one } = tailWords(deps.sql, tail);
    const context = typeof body.context === 'string' ? body.context.replace(`No ${one} could be it yet; add it, and it is offered here. `, '') : body.context;
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, options, context }), q.id);
    n += 1;
  }
  return n;
}

/**
 * The tail question for `cause` answered "None of these", while it stands: no row was added to the list since. Its id,
 * or `null` when there is none or an account has been added (which opens the question again).
 */
function declinedTail(sql: Sql, key: TailKey): string | null {
  const register = key.register;
  const last = sql.one<{ id: string; status: string; resolved_as: string | null }>(
    `SELECT id, status, resolved_as FROM suggestion WHERE ${SAME_TAIL} ORDER BY rowid DESC LIMIT 1`,
    ...keyOf(key),
  );
  if (last === undefined || last.status !== 'resolved' || last.resolved_as !== 'addressed' || settledAnswer(sql, last.id) !== NONE) return null;
  /* AFTER IT BY THE LOG'S OWN ORDER, not by the clock: two writes in one instant are still one before the other. */
  const when = sql.one<{ n: number }>("SELECT rowid AS n FROM event WHERE kind = 'resolve' AND target = ? ORDER BY rowid DESC LIMIT 1", `suggestion:${last.id}`)?.n;
  if (when === undefined) return null;
  const added = sql.one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM event e JOIN entry x ON e.target = 'entry:' || x.id WHERE e.kind = 'create' AND e.rowid > ? AND x.register = ? AND x.deleted_at IS NULL",
    when,
    register,
  )?.n ?? 0;
  return added > 0 ? null : last.id;
}

/** An amount in minor units and its currency, as a money field is filed. */
type Minor = { amount: number; currency: string };

/** THE FIRST MONEY FIELD THE LIST DECLARES, as it would be filed, or `null`: one sum per currency, two never added. */
function moneyOf(deps: Pick<IngestDeps, 'schemaOf'>, register: string, extracted: Record<string, unknown>): Minor | null {
  const money = Object.entries(deps.schemaOf(register)?.fields ?? {}).find(([, f]) => f.type === 'money')?.[0];
  const amount = money === undefined ? undefined : (extracted[money] as { amount?: unknown; currency?: unknown } | undefined);
  return amount !== undefined && amount !== null && Number.isInteger(amount.amount) && typeof amount.currency === 'string'
    ? { amount: amount.amount as number, currency: amount.currency }
    : null;
}

/**
 * The arrivals still held under the questions for these digits answered "None of these", oldest question first, each
 * with what it would file: its bytes read again by the pattern that last matched it, since a question keeps one sum
 * and not one amount per message. An arrival whose pattern is gone still counts, with no amount.
 */
function declinedRaws(deps: IngestDeps, key: TailKey): { raw: string; amount: Minor | null }[] {
  const out: { raw: string; amount: Minor | null }[] = [];
  for (const q of deps.sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM suggestion WHERE status = 'resolved' AND ${SAME_TAIL} AND json_extract(body, '$.applied.none') = 1 ORDER BY rowid`,
    ...keyOf(key),
  )) {
    const raws = parsed(q.body)?.raws;
    if (!Array.isArray(raws)) continue;
    for (const r of heldAmounts(deps, raws)) if (!out.some((o) => o.raw === r.raw)) out.push(r);
  }
  return out;
}

/**
 * The held arrivals among `raws`, oldest first, each with the amount it would file, read again from its bytes by the
 * pattern that last matched it, into the list that pattern routes it to.
 */
function heldAmounts(deps: IngestDeps, raws: readonly unknown[]): { raw: string; amount: Minor | null }[] {
  const patterns = new Map(deps.ingests().map((p) => [`ingest:${p.ingest}`, p]));
  const held = deps.sql.all<{ id: string; ts: string; body: string | null; actor: string | null }>(
    `SELECT i.id, i.ts, i.body, (SELECT e.actor FROM event e WHERE e.kind = 'match' AND e.target = 'inbox_raw:' || i.id ORDER BY e.rowid DESC LIMIT 1) AS actor
       FROM inbox_raw i WHERE i.id IN (SELECT value FROM json_each(?)) AND i.state IN ('review', 'proposed') ORDER BY i.rowid`,
    JSON.stringify(raws),
  );
  return held.map((r) => {
    const pattern = r.actor === null ? undefined : patterns.get(r.actor);
    if (pattern === undefined) return { raw: r.id, amount: null };
    const body = r.body ?? '';
    const read = readFields(deps, pattern, body, deps.normalise === undefined ? body : deps.normalise(body), r.ts);
    const routed = routeTo(pattern.writes.register, read.extracted);
    return { raw: r.id, amount: 'to' in routed ? moneyOf(deps, routed.to, read.extracted) : null };
  });
}

/** Add one arrival to a question's `raws`, once, without asking it again. */
function keepRaw(sql: Sql, suggestion: string, raw: string): void {
  const body = parsed(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', suggestion)?.body);
  if (body === null) return;
  const raws = Array.isArray(body.raws) ? (body.raws as string[]) : [];
  if (raws.includes(raw)) return;
  sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, raws: [...raws, raw], count: raws.length + 1 }), suggestion);
}

/* ── an answer, carried out ─────────────────────────────────────────────── */

/** How a question an arrival opened was answered: the option, who pressed it, and the batch the decision was made in. */
export type Answered = { id: string; option: string | null; actor: string; batch: string | null };

/**
 * A decision just made on a question the inbox asked, carried out. The record calls this from `decide`, in the
 * decision's own transaction, so a refusal here takes the decision back with it.
 *
 * A TAIL QUESTION ANSWERED WITH AN ACCOUNT, in one change: the digits are written to the field the lookup reads (added to
 * the others where it splits) and taken off any other account that held them; the account and digits are confirmed for
 * every pattern; every arrival that waited on it runs again from its stored bytes, oldest first, in batches of 200; and
 * the question closes saying what happened: "Filed 17 to Credit Card. 2 were already there." Everything written is put
 * in the decision's batch, so one Undo puts all of it back.
 *
 * "NONE OF THESE" keeps them waiting and stops the asking (`declinedTail`). A move question answered "Move them" moves
 * the rows a wrong answer filed. A shape's pattern question answered yes files what waits through the pattern
 * (`answerPattern`). Anything else is not the inbox's, and is left alone.
 *
 * ONCE. The answer is marked on the question (`applied`), so the door's sweep, which carries out an answer the record did
 * not hand here, never does it twice.
 */
export function answerAsked(deps: IngestDeps, a: Answered): Result<string | null> {
  const q = deps.sql.one<{ body_kind: string; body: string; status: string }>('SELECT body_kind, body, status FROM suggestion WHERE id = ?', a.id);
  /* A SHAPE'S ONE PATTERN QUESTION, whatever its cause, since the accept path hands every body here. */
  if (q?.body_kind === 'pattern') {
    const asked = q.status === 'resolved' ? parsed(q.body) : null;
    return asked === null ? ok(null) : answerPattern(deps, a, asked);
  }
  const body = q?.body_kind === 'options' && q.status === 'resolved' ? parsed(q.body) : null;
  if (body === null || a.option === null || typeof body.cause !== 'string') return ok(null);
  if (body.cause.startsWith('tail:')) return answerTail(deps, a, body);
  if (body.cause.startsWith('move:')) return answerMove(deps, a, body);
  return ok(null);
}

/** A tail question's `tail`, as `askTail` wrote it, or `null` for a body this build cannot read. */
function tailAsked(body: Record<string, unknown>): TailAsked | null {
  const t = body.tail as Partial<TailAsked> | undefined;
  if (t === undefined || t === null || typeof t !== 'object') return null;
  const strings = [t.door, t.register, t.by, t.digits, t.says, t.ingest, t.field];
  if (!strings.every((s) => typeof s === 'string' && s !== '') || !FIELD_ID.test(t.by!)) return null;
  return t as TailAsked;
}

/** The log's place of the answer a question holds now: its latest `resolve` as addressed, or `null` when it has none. */
const answeredAt = (sql: Sql, suggestion: string): number | null =>
  sql.one<{ n: number }>("SELECT rowid AS n FROM event WHERE kind = 'resolve' AND target = ? AND to_v = 'addressed' ORDER BY rowid DESC LIMIT 1", `suggestion:${suggestion}`)?.n ??
  null;

/**
 * Whether the answer a question holds now was carried out. `applied.resolve` is the place of the answer it carried out, so
 * a question an Undo put back in Decide and answered again is carried out again, and the same answer never twice.
 */
function carriedOut(sql: Sql, suggestion: string, body: Record<string, unknown>): boolean {
  const applied = body.applied as { resolve?: unknown } | undefined;
  if (applied === undefined || applied === null) return false;
  return typeof applied.resolve !== 'number' || applied.resolve === answeredAt(sql, suggestion);
}

function answerTail(deps: IngestDeps, a: Answered, asked: Record<string, unknown>): Result<string | null> {
  /* READ AGAIN, NOT AS THE CALLER READ IT: the door's sweep reads its questions once and an answer carried out on the way
     (each answer sweeps the door again) would otherwise be carried out a second time, closing with "Filed 0". */
  const body = parsed(deps.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', a.id)?.body) ?? asked;
  if (carriedOut(deps.sql, a.id, body)) return ok(null);
  const tail = tailAsked(body);
  if (tail === null) return ok(null);
  const at = instant(deps.nowMs);
  const mark = lastEvent(deps.sql);
  const resolve = answeredAt(deps.sql, a.id);
  const keep = (more: Record<string, unknown>): void =>
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, ...more }), a.id);

  if (a.option === NONE) {
    keep({ applied: { none: true, at, resolve } });
    return ok(null);
  }
  const rows = liveRows(deps.sql, tail.register);
  const chosen = rows.find((r) => r.id === a.option);
  if (chosen === undefined)
    return no('ROW_UNKNOWN', `The ${tail.says} ending ${tail.digits} was answered with an account that is no longer there. Pick another.`, { at: 'option' });

  /* THE DIGITS ON THE ACCOUNT, added to what it holds where the field splits, and written over it where it does not. */
  const valueOf = (r: LiveRow): string => {
    const v = r.fields[tail.by];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim();
  };
  const holds = (r: LiveRow): boolean => (tail.split ? partsOf(valueOf(r)) : [valueOf(r)]).includes(tail.digits);
  /* DIGITS ARE NEVER MOVED IN SILENCE. Digits a person put on an account, or confirmed there, are
     his word: an answer that would take them off another account, or write over them on this one, is refused in one
     sentence that names the account, and nothing is written. Digits an agent put and nobody confirmed are a guess, and
     the answer is the correction: they are taken or written over, and the closing line says so. */
  const mine = (r: LiveRow, digits: string): boolean => !writtenByAgent(deps.sql, r.id, tail.by) || confirmedTail(deps.sql, { digits, row: r.id });
  const { label } = tailWords(deps.sql, tail);
  const held = rows.find((r) => r.id !== chosen.id && holds(r) && mine(r, tail.digits));
  if (held !== undefined)
    return no('UNIQUE_VIOLATION', `${rowSaid(deps.sql, tail.register, held)} already holds ${tail.digits}. Take it off that account first, or pick it.`, { at: 'option' });
  const before = valueOf(chosen);
  /* DIGITS KEPT SHORT ARE THESE DIGITS (`endsIn`): the account holds the end of what the bank prints, so the answer is
     the account the question offered, and its digits are kept whole from now on. */
  const kept = (tail.split ? partsOf(before) : [before]).find((v) => endsIn(v, tail.digits)) ?? null;
  const over = !tail.split && before !== '' && before !== tail.digits && kept === null;
  if (over && mine(chosen, before))
    return no('UNIQUE_VIOLATION', `${rowSaid(deps.sql, tail.register, chosen)} already holds ${before} in ${label}. Change it on the account first, or pick another.`, { at: 'option' });
  if (!holds(chosen)) {
    const whole = kept !== null ? (tail.split ? partsOf(before).map((v) => (v === kept ? tail.digits : v)).join(', ') : tail.digits) : null;
    const wrote = deps.write(tail.register, chosen.id, { [tail.by]: whole ?? (tail.split && before !== '' ? `${before}, ${tail.digits}` : tail.digits) }, a.actor);
    if (!wrote.ok) return wrote as Result<never>;
  }
  /* AND OFF EVERY OTHER ACCOUNT THAT HELD THEM, so the next text names one account and not two. What a wrong answer
     filed there is offered to be moved, once (`askMove`). */
  const off: LiveRow[] = [];
  for (const other of rows) {
    if (other.id === chosen.id || !holds(other)) continue;
    const rest = tail.split ? partsOf(valueOf(other)).filter((p) => p !== tail.digits).join(', ') : '';
    const wrote = deps.write(tail.register, other.id, { [tail.by]: rest === '' ? null : rest }, a.actor);
    if (!wrote.ok) return wrote as Result<never>;
    off.push(other);
  }
  keep({ applied: { row: chosen.id, at, resolve } });

  const raws = Array.isArray(body.raws) ? (body.raws as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  /* WHAT AN UNDONE ANSWER FILED IS FILED AGAIN: a text whose rows the Undo took back waits under this question again. */
  const ran = replayHeld(deps, raws.map((raw) => ({ raw })), true);
  const name = rowSaid(deps.sql, tail.register, chosen);
  const moved = [
    over ? `${name} held ${before} in ${label}, put there by an agent; it holds ${tail.digits} now.` : '',
    kept !== null ? `${name} held ${kept} in ${label}, the end of ${tail.digits}; it holds ${tail.digits} now.` : '',
    ...off.map((other) => `${tail.digits} was taken off ${rowSaid(deps.sql, tail.register, other)}, where an agent put it.`),
  ];
  const line = [filedSaid(ran, name), ...moved].filter((part) => part !== '').join(' ');
  keep({ applied: { row: chosen.id, at, resolve, wrote: ran.wrote }, said: line });
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', ?, 'suggestion', ?)",
    deps.mint(),
    at,
    `ingest:${tail.door}`,
    `suggestion:${a.id}`,
    line.slice(0, 280),
  );
  for (const other of off) askMove(deps, at, { tail, from: other.id, to: chosen.id, since: deps.nowMs - MOVE_DAYS * 86_400_000 });
  /* WHAT ELSE WAITED FOR THESE DIGITS is read again now, not at the next text, AT EVERY DOOR THAT READS THEM: the bank's mail and its texts print one card, and a question the other door asked before the cause
     stopped naming a door closes with this answer, as filed (`sweepDoor`). */
  for (const door of doorsReading(deps, tail)) {
    const swept = sweepDoor(deps, door);
    if (!swept.ok) return swept as Result<never>;
  }
  inBatch(deps.sql, mark, a.batch, rows.map((r) => r.id));
  return ok(line);
}

/**
 * A tail question an Undo put back in Decide, made to wait again: the texts its answer filed, whose rows the Undo took
 * back, are held under it once more with the reason they had, and what its answer did is taken off it, so Decide asks it
 * as it was and the count of what waits is true. `undo.ts` calls this as it reopens a question; the door's sweep calls it
 * too, for a record whose Undo does not. Answers how many texts wait again.
 */
export function reopenedTail(sql: Sql, suggestion: string): number {
  const q = sql.one<{ body_kind: string; body: string; status: string }>('SELECT body_kind, body, status FROM suggestion WHERE id = ?', suggestion);
  const body = q?.status === 'open' ? parsed(q.body) : null;
  /* AND A SHAPE'S PATTERN QUESTION, whose texts wait again as nothing read them. */
  if (body !== null && q?.body_kind === 'pattern') return reopenedPattern(sql, suggestion, body);
  const tail = body === null ? null : tailAsked(body);
  if (body === null || tail === null) return 0;
  const { one, label } = tailWords(sql, tail);
  const again = sql.all<{ id: string }>(
    `UPDATE inbox_raw SET state = 'review', reason = ?
      WHERE id IN (SELECT value FROM json_each(?)) AND state = 'matched' AND ${UNDONE_SQL} RETURNING id`,
    `No ${one} has ${tail.digits} in ${label}. It waits for you to say which ${one} it is.`,
    JSON.stringify(Array.isArray(body.raws) ? body.raws : []),
  );
  const { applied: _applied, said: _said, ...rest } = body;
  if (body.applied !== undefined || body.said !== undefined) sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(rest), suggestion);
  return again.length;
}

/** "Filed 17 to Credit Card. 2 were already there. 1 still waits." */
function filedSaid(ran: Replayed, name: string): string {
  return [
    `Filed ${ran.filed} to ${name}.`,
    ran.already ? `${ran.already} ${ran.already === 1 ? 'was' : 'were'} already there.` : '',
    ran.waiting ? `${ran.waiting} still ${ran.waiting === 1 ? 'waits' : 'wait'}.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
}

/** The newest line of the log, so what one answer writes after it can be put in the decision's batch. */
const lastEvent = (sql: Sql): number => sql.one<{ n: number | null }>('SELECT max(rowid) AS n FROM event')?.n ?? 0;

/**
 * Every change to a row written since `mark`, put in `batch`: the rows a run again filed, the digits written, and what
 * rules those writes started. `IngestDeps.write` names no batch, so each write took its own, and an Undo of the decision
 * would have put back the press and none of what it did. Nothing else holds those batches yet: they were minted inside
 * this transaction.
 */
function inBatch(sql: Sql, mark: number, batch: string | null, existed: readonly string[]): void {
  if (batch === null || batch === '') return;
  /* NEVER THE MAKING OF A ROW THAT WAS THERE BEFORE THE ANSWER. A person's edit of a row they made minutes ago is folded
     into the row's `create` line, which moves to the end of the log (`index.ts`, the grace fold), so an account added and
     then picked as the answer had its own making put in the decision's batch, and Undo took the account away. */
  sql.exec(
    "UPDATE event SET batch = ? WHERE rowid > ? AND target_kind = 'entry' AND NOT (kind = 'create' AND target IN (SELECT 'entry:' || value FROM json_each(?)))",
    batch,
    mark,
    JSON.stringify(existed),
  );
}

/* ── held arrivals, run again ───────────────────────────────────────────── */

/** What running held arrivals again did: how many filed, how many were already there, how many still wait. */
type Replayed = { filed: number; already: number; waiting: number; wrote: string[] };

/** A held arrival to run again, and the per-message question it is asked in, with the row it is asked as. */
type Again = { raw: string; from?: { suggestion: string; row: Record<string, unknown> } };

/**
 * Held arrivals run through the pipeline again from their stored bytes, oldest first, `REPLAY_BATCH` at a time, inside
 * the caller's transaction. Each is offered the patterns it was offered when it came: a text named for a door is named
 * for that door again. An arrival no longer held (filed by hand, archived) is left as it is.
 *
 * THE QUESTION IT WAS ASKED IN LOSES ITS ROW FIRST, so a run again that holds it once more asks once more rather than
 * twice; a question left with nothing in it closes as filed, or as asked again as one question. Never as declined.
 */
function replayHeld(deps: IngestDeps, items: readonly Again[], undone = false, through: string | null = null): Replayed {
  const out: Replayed = { filed: 0, already: 0, waiting: 0, wrote: [] };
  const from = new Map(items.map((item) => [item.raw, item.from]));
  const ids = [...from.keys()];
  for (let i = 0; i < ids.length; i += REPLAY_BATCH) {
    /* `undone` ALSO TAKES A TEXT FILED ONCE WHOSE ROWS ARE ALL GONE, which is what an Undo of the answer that filed it
       leaves: `matched`, with nothing to show for it. */
    const rows = deps.sql.all<{ id: string; ts: string; channel: string; headers: string | null; body: string | null; sha256: string; state: string; reason: string | null }>(
      `SELECT id, ts, channel, headers, body, sha256, state, reason FROM inbox_raw
        WHERE id IN (SELECT value FROM json_each(?))
          AND (state IN ('review', 'proposed') OR (? = 1 AND state = 'matched' AND ${UNDONE_SQL}) OR (? = 1 AND state = 'untriaged'))
        ORDER BY ts, rowid`,
      JSON.stringify(ids.slice(i, i + REPLAY_BATCH)),
      undone ? 1 : 0,
      /* `through` ALSO TAKES A TEXT NOTHING READ YET, and offers it that one pattern alone (`answerPattern`). */
      through === null ? 0 : 1,
    );
    for (const row of rows) {
      const pattern = matchedBy(deps, row.id);
      const asked = from.get(row.id);
      if (asked !== undefined) takeRow(deps.sql, asked.suggestion, row.id, asked.row);
      const ran = runArrival(
        deps,
        {
          channel: row.channel as Channel,
          headers: (parsed(row.headers) ?? {}) as Record<string, string>,
          body: row.body ?? '',
          sha256: row.sha256,
          verified: true,
          ...(through !== null ? { ingest: through } : row.channel === 'webhook' && pattern !== null ? { ingest: pattern.door ?? pattern.ingest } : {}),
        },
        { id: row.id, state: row.state, reason: row.reason, ts: row.ts },
        {},
      );
      const state = ran.ok ? ran.value.state : 'review';
      if (ran.ok && state === 'matched') {
        out.filed += 1;
        out.wrote.push(...ran.value.wrote);
      } else if (state === 'skipped') out.already += 1;
      else out.waiting += 1;
      if (asked !== undefined) closeIfEmpty(deps, asked.suggestion, state === 'matched' ? 'filed' : 'asked-again');
    }
  }
  return out;
}

/** An inbox row (`inbox_raw`) that filed rows and has none of them left: its receipts name rows, and none is live. */
const UNDONE_SQL = `EXISTS (SELECT 1 FROM ingest_receipt r WHERE r.raw_id = inbox_raw.id AND json_valid(r.wrote) AND json_array_length(r.wrote) > 0)
  AND NOT EXISTS (SELECT 1 FROM ingest_receipt r, json_each(r.wrote) w JOIN entry x ON x.id = w.value
                   WHERE r.raw_id = inbox_raw.id AND json_valid(r.wrote) AND x.deleted_at IS NULL)`;

/** The pattern that last read an arrival, from its `match` line, as it is declared now, or `null`. */
function matchedBy(deps: IngestDeps, raw: string): IngestDecl | null {
  const actor = deps.sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'match' AND target = ? ORDER BY rowid DESC LIMIT 1", `inbox_raw:${raw}`)?.actor;
  if (actor === undefined || !actor.startsWith('ingest:')) return null;
  return deps.ingests().find((i) => i.ingest === actor.slice('ingest:'.length)) ?? null;
}

/**
 * Take one arrival's row out of the question it is asked in: by its place in `raws`, or, in a question filed before
 * `raws` were kept, the row that says what it says (`sameRow`).
 */
function takeRow(sql: Sql, suggestion: string, raw: string, row: Record<string, unknown>): void {
  const q = sql.one<{ body: string; status: string }>('SELECT body, status FROM suggestion WHERE id = ?', suggestion);
  const body = q?.status === 'open' ? parsed(q.body) : null;
  if (body === null || !Array.isArray(body.rows)) return;
  const rows = body.rows as Record<string, unknown>[];
  const raws = Array.isArray(body.raws) ? (body.raws as unknown[]) : null;
  let at = raws === null ? -1 : raws.indexOf(raw);
  if (at === -1) at = rows.findIndex((r) => canonical(r) === canonical(row));
  if (at === -1) return;
  const keep = <T>(list: readonly T[]): T[] => list.filter((_, i) => i !== at);
  sql.exec(
    'UPDATE suggestion SET body = ? WHERE id = ?',
    JSON.stringify({ ...body, rows: keep(rows), count: rows.length - 1, ...(raws === null ? {} : { raws: keep(raws) }) }),
    suggestion,
  );
}

/** Close a question an arrival opened once it asks about nothing: filed, or asked again as one question. */
function closeIfEmpty(deps: IngestDeps, suggestion: string, as: 'filed' | 'asked-again'): void {
  const q = deps.sql.one<{ body: string; status: string; opened_by: string }>('SELECT body, status, opened_by FROM suggestion WHERE id = ?', suggestion);
  const body = q?.status === 'open' ? parsed(q.body) : null;
  if (body === null || !Array.isArray(body.rows) || body.rows.length > 0) return;
  deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = ? WHERE id = ?", as, suggestion);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'resolve', ?, 'suggestion', ?, ?)",
    deps.mint(),
    instant(deps.nowMs),
    q!.opened_by,
    `suggestion:${suggestion}`,
    as,
    as === 'filed' ? 'Filed once the account could be read.' : 'Asked again as one question.',
  );
}

/** A value as one string whatever order its keys were built in, so two rows that say the same thing compare equal. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/**
 * Whether a row a question holds is the row an arrival reads as now: every field both have says the same, and they share
 * at least one. The account the question's row was missing is not one both have, so a question filed before `raws` were
 * kept still finds the arrival it was asked about once the account can be read.
 */
function sameRow(asked: Record<string, unknown>, now: Record<string, unknown>): boolean {
  const both = Object.keys(asked).filter((k) => Object.hasOwn(now, k));
  return both.length > 0 && both.every((k) => canonical(amountOnly(asked[k])) === canonical(amountOnly(now[k])));
}

/**
 * A money value as its amount alone, for `sameRow`: a pattern updated to read the account's currency reads the same text
 * in another currency than the question kept, and it is still the same text.
 */
const amountOnly = (value: unknown): unknown =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && 'amount' in value && 'currency' in value ? (value as { amount: unknown }).amount : value;

/* ── the door, looked at again before each arrival is filed ─────────────── */

/** The most held arrivals one sweep reads. Past it the rest wait for the next arrival at the door. */
const SWEEP_MOST = 200;

/** Every lookup a pattern's fields read by. */
const lookupsOf = (p: IngestDecl): LookupForm[] =>
  Object.values(p.extract ?? {}).flatMap((declared) => {
    const l = lookupOf(stripOf(declared).form);
    return l !== null && typeof l.register === 'string' && typeof l.by === 'string' ? [l] : [];
  });

/**
 * Every door whose patterns look up the list and field a tail question asks about, its own door first: the doors one
 * answer is swept at. A door is what `sweepDoor` is called with, a pattern's `door` or, where it names none, the pattern.
 */
function doorsReading(deps: IngestDeps, tail: TailAsked): string[] {
  const doors = [tail.door];
  for (const p of deps.ingests()) {
    const door = p.door ?? p.ingest;
    if (!doors.includes(door) && lookupsOf(p).some((l) => l.register === tail.register && l.by === tail.by)) doors.push(door);
  }
  return doors;
}

/**
 * An answer the door's sweep could not carry out, put in the log on its question in its own sentence, once per answer:
 * a sweep runs at every text, and the same failure is not written at each.
 */
function failedAnswer(deps: IngestDeps, suggestion: string, door: string, failed: Result<unknown>): void {
  const why = failed.ok ? '' : 'refusal' in failed ? failed.refusal.fix : 'Somebody changed the account at the same time.';
  const note = `This answer could not be carried out, so its messages still wait: ${why}`.slice(0, 280);
  const last = deps.sql.one<{ note: string | null }>("SELECT note FROM event WHERE kind = 'note' AND target = ? ORDER BY rowid DESC LIMIT 1", `suggestion:${suggestion}`);
  if (last?.note === note) return;
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', ?, 'suggestion', ?)",
    deps.mint(),
    instant(deps.nowMs),
    `ingest:${door}`,
    `suggestion:${suggestion}`,
    note,
  );
}

/** A tail question as the door's sweep holds it. */
type Swept = { id: string; status: string; parsed: Record<string, unknown>; tail: TailAsked };

/**
 * Open tail questions about one list, field and digits folded into the oldest: its messages, each once, and their sums
 * per currency, and the others closed as asked again. Only questions a door asked when the cause named it can be twins.
 */
function foldTwins(deps: IngestDeps, questions: Swept[]): void {
  const first = new Map<string, Swept>();
  for (const q of questions) {
    if (q.status !== 'open') continue;
    const key = keyOf(q.tail).join('\u0000');
    const keep = first.get(key);
    if (keep === undefined) {
      first.set(key, q);
      continue;
    }
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : []);
    const raws = strings(keep.parsed.raws);
    const twice = strings(q.parsed.raws).some((raw) => raws.includes(raw));
    for (const raw of strings(q.parsed.raws)) if (!raws.includes(raw)) raws.push(raw);
    const totals: Record<string, number> = twice ? {} : { ...((keep.parsed.totals as Record<string, number> | undefined) ?? {}) };
    const add = (currency: string, minor: number): void => {
      if (Number.isInteger(minor)) totals[currency] = (totals[currency] ?? 0) + minor;
    };
    /* A MESSAGE BOTH HELD IS SUMMED ONCE: the sums are then read again from the messages themselves. */
    const amounts = twice
      ? heldAmounts(deps, raws).flatMap((h): [string, number][] => (h.amount === null ? [] : [[h.amount.currency, h.amount.amount]]))
      : Object.entries((q.parsed.totals as Record<string, number> | undefined) ?? {});
    for (const [currency, minor] of amounts) add(currency, minor);
    const context = typeof keep.parsed.context === 'string' ? keep.parsed.context.replace(WAITING_SAID, '') : '';
    keep.parsed = { ...keep.parsed, raws, count: raws.length, totals, context: cutTo(`${context}${waitingSaid(raws.length, totals)}`, 280) };
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(keep.parsed), keep.id);
    deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'asked-again' WHERE id = ? AND status = 'open'", q.id);
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'resolve', ?, 'suggestion', 'asked-again', ?)",
      deps.mint(),
      instant(deps.nowMs),
      `ingest:${q.tail.door}`,
      `suggestion:${q.id}`,
      `Asked again as one question with the other messages for ${q.tail.digits}.`,
    );
    q.status = 'resolved';
  }
}

/**
 * Before an arrival at `door` is filed, what waits there is looked at again:
 *
 * 1. an answer the record did not carry out yet is carried out (`answerTail`), so a decision made where the hook was
 *    not wired still files its texts at the next one;
 * 2. an open tail question whose digits are now on exactly one account, by a person's hand or confirmed, is answered by
 *    that: its texts run again, and it closes as filed with what happened;
 * 3. a text held under a version of its pattern that has since been updated runs again, once (`readBefore`);
 * 4. a text held under a question of its own, asked with its account empty, runs again where the account can now be
 *    read or the digits it printed now have a question: it files, or joins the one question, and its old question closes
 *    as filed or as asked again as one question;
 * 5. digits moved from one account to another after an answer offer, once, to move what they filed (`askMove`).
 *
 * READS NOTHING AT A DOOR WITH NOTHING HELD, so an ordinary arrival costs a handful of indexed reads.
 */
function sweepDoor(deps: IngestDeps, door: string): Result<null> {
  const patterns = deps.ingests().filter((i) => i.ingest === door || i.door === door);
  if (patterns.length === 0) return ok(null);
  const at = instant(deps.nowMs);
  /* THE TAIL QUESTIONS ABOUT WHAT THIS DOOR'S PATTERNS LOOK UP, whichever door asked them, and those its door asked
     before the cause stopped naming one. */
  const reads = new Set(patterns.flatMap(lookupsOf).map((l) => `${l.register}\u0000${l.by}`));
  const questions = deps.sql
    .all<{ id: string; body: string; status: string; resolved_as: string | null; opened_at: string }>(
      `SELECT id, body, status, resolved_as, opened_at FROM suggestion
        WHERE body_kind = 'options' AND json_valid(body) AND json_extract(body, '$.cause') LIKE 'tail:%'
          AND (json_extract(body, '$.tail.door') = ? OR json_extract(body, '$.tail.register') IN (SELECT value FROM json_each(?))) ORDER BY rowid`,
      door,
      JSON.stringify([...new Set(patterns.flatMap(lookupsOf).map((l) => l.register))]),
    )
    .flatMap((q) => {
      const body = parsed(q.body);
      const tail = body === null ? null : tailAsked(body);
      return body === null || tail === null || (tail.door !== door && !reads.has(`${tail.register}\u0000${tail.by}`)) ? [] : [{ ...q, parsed: body, tail }];
    });

  let carried = false;
  for (const q of questions) {
    if (q.status !== 'resolved' || q.resolved_as !== 'addressed' || carriedOut(deps.sql, q.id, q.parsed)) continue;
    const answer = settledAnswer(deps.sql, q.id);
    const made = deps.sql.one<{ actor: string; batch: string | null }>(
      "SELECT e.actor AS actor, e.batch AS batch FROM event r JOIN event e ON e.rowid = r.rowid - 1 AND e.kind = 'decide' WHERE r.kind = 'resolve' AND r.target = ? ORDER BY r.rowid DESC LIMIT 1",
      `suggestion:${q.id}`,
    );
    /* ONE ANSWER THAT CANNOT BE CARRIED OUT NEVER STOPS THE DOOR. It runs in a savepoint of its own,
       so what it wrote before it failed is taken back; the failure is put in the log once per answer, on the question,
       and the sweep goes on, so the text that came is filed. The answer is tried again at the next text, since a write
       that failed may not fail twice. Only `decide`, which hands an answer here itself, refuses with the error. */
    const done = attempt(deps.sql, (fn) => fn(), () => answerTail(deps, { id: q.id, option: answer, actor: made?.actor ?? 'system', batch: made?.batch ?? null }, q.parsed));
    if (!done.ok) failedAnswer(deps, q.id, door, done);
    carried = true;
  }
  /* READ AGAIN AFTER AN ANSWER WAS CARRIED OUT: it swept the doors itself, and a question it folded or filed there is
     not folded or filed a second time here from what was read before. */
  if (carried) {
    const now = new Map(
      deps.sql
        .all<{ id: string; body: string; status: string; resolved_as: string | null }>(
          'SELECT id, body, status, resolved_as FROM suggestion WHERE id IN (SELECT value FROM json_each(?))',
          JSON.stringify(questions.map((q) => q.id)),
        )
        .map((q) => [q.id, q]),
    );
    for (const q of questions) {
      const fresh = now.get(q.id);
      const body = fresh === undefined ? null : parsed(fresh.body);
      if (fresh === undefined || body === null) continue;
      Object.assign(q, { status: fresh.status, resolved_as: fresh.resolved_as, parsed: body });
    }
  }

  /* TWO QUESTIONS OPEN ABOUT ONE ACCOUNT'S DIGITS, asked by two doors when the cause still named its door, are one: the
     newer one's messages join the older and it closes as asked again, so Decide counts one. */
  foldTwins(deps, questions);

  for (const q of questions) {
    if (q.status !== 'open') continue;
    /* A QUESTION AN UNDO PUT BACK holds its texts again, whether or not the Undo told this file (`reopenedTail`). */
    if (q.parsed.applied !== undefined) {
      reopenedTail(deps.sql, q.id);
      q.parsed = parsed(deps.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', q.id)?.body) ?? q.parsed;
    }
    const holders = lookupTable(deps, { register: q.tail.register, by: q.tail.by, ...(q.tail.split ? { split: true } : {}), ...(q.tail.where === undefined ? {} : { where: q.tail.where }) }).filter(
      (r) => r.value === q.tail.digits,
    );
    const row = holders[0]?.id;
    if (row === undefined || holders.some((h) => h.id !== row)) continue;
    if (writtenByAgent(deps.sql, row, q.tail.by) && !confirmedTail(deps.sql, { digits: q.tail.digits, row })) continue;
    const raws = Array.isArray(q.parsed.raws) ? (q.parsed.raws as unknown[]).filter((r): r is string => typeof r === 'string') : [];
    deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'filed' WHERE id = ? AND status = 'open'", q.id);
    const ran = replayHeld(deps, raws.map((raw) => ({ raw })));
    const name = rowTitle(deps.sql, q.tail.register, row) ?? `the ${tailWords(deps.sql, q.tail).one}`;
    const line = `${q.tail.digits} is on ${name} now. ${filedSaid(ran, name)}`;
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...q.parsed, applied: { row, at, wrote: ran.wrote }, said: line }), q.id);
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'resolve', ?, 'suggestion', 'filed', ?)",
      deps.mint(),
      at,
      `ingest:${door}`,
      `suggestion:${q.id}`,
      line.slice(0, 280),
    );
  }

  /* A PATTERN UPDATED SINCE IT HELD A TEXT reads that text again, once, here as well as where the record
     hands an install to `rerunHeld`: a pack's update lands on more than one path, and a text its fix would read must not
     wait on which one it took. The run again writes a newer `match` line, so the next sweep finds nothing to do. */
  const unread = readBefore(deps.sql, patterns, SWEEP_MOST);
  if (unread.length > 0) rerun(deps, patterns.map((p) => p.ingest), new Set(unread));

  const asking = deps.sql.all<{ id: string; body: string; opened_by: string }>(
    `SELECT id, body, opened_by FROM suggestion WHERE body_kind = 'rowset' AND status = 'open' AND opened_by IN (SELECT value FROM json_each(?)) ORDER BY rowid LIMIT 50`,
    JSON.stringify(patterns.map((p) => `ingest:${p.ingest}`)),
  );
  if (asking.length > 0) {
    const waiting = new Set(questions.filter((q) => q.status === 'open').flatMap((q) => (Array.isArray(q.parsed.raws) ? (q.parsed.raws as string[]) : [])));
    const again = heldAgain(deps, patterns, asking, waiting);
    if (again.length > 0) replayHeld(deps, again);
  }

  for (const q of questions) {
    if (q.status !== 'resolved') continue;
    const applied = q.parsed.applied as { row?: unknown; at?: unknown } | undefined;
    if (typeof applied?.row !== 'string' || typeof applied.at !== 'string' || Date.parse(applied.at) < deps.nowMs - MOVE_DAYS * 86_400_000) continue;
    const holders = lookupTable(deps, { register: q.tail.register, by: q.tail.by, ...(q.tail.split ? { split: true } : {}) }).filter((r) => r.value === q.tail.digits);
    const to = holders[0]?.id;
    if (to === undefined || to === applied.row || holders.some((h) => h.id !== to)) continue;
    askMove(deps, at, { tail: q.tail, from: applied.row, to, since: Date.parse(applied.at) - 86_400_000 });
  }
  return ok(null);
}

/**
 * The texts held at a door under a question of their own that are worth running again: asked with a lookup's field
 * empty, and now either readable or printing digits a tail question can hold. Oldest first, at most `SWEEP_MOST`.
 */
function heldAgain(deps: IngestDeps, patterns: readonly IngestDecl[], asking: readonly { id: string; body: string; opened_by: string }[], waiting: ReadonlySet<string>): Again[] {
  const byName = new Map(patterns.map((p) => [`ingest:${p.ingest}`, p]));
  const questions = asking.flatMap((q) => {
    const body = parsed(q.body);
    return body === null || !Array.isArray(body.rows) ? [] : [{ id: q.id, by: q.opened_by, rows: body.rows as Record<string, unknown>[], raws: Array.isArray(body.raws) ? (body.raws as unknown[]) : null }];
  });
  const held = heldBy(deps.sql, [...byName.keys()], SWEEP_MOST);
  const out: Again[] = [];
  for (const raw of held) {
    if (waiting.has(raw.id)) continue;
    const actor = raw.actor;
    const pattern = byName.get(actor);
    if (pattern === undefined) continue;
    const body = raw.body ?? '';
    const read = readFields(deps, pattern, body, deps.normalise === undefined ? body : deps.normalise(body), raw.ts);
    if (read.lookups.length === 0) continue;
    const mine = questions.filter((q) => q.by === actor);
    let found: { suggestion: string; row: Record<string, unknown> } | undefined;
    for (const q of mine) {
      const at = q.raws === null ? q.rows.findIndex((r) => sameRow(r, read.extracted)) : q.raws.indexOf(raw.id);
      if (at !== -1 && q.rows[at] !== undefined) {
        found = { suggestion: q.id, row: q.rows[at]! };
        break;
      }
    }
    if (found === undefined) continue;
    /* ONLY A ROW ASKED WITH A LOOKUP'S FIELD EMPTY, which the account now fills or the digits now ask about. A row held
       for anything else is left to its question. */
    const empty = read.lookups.filter((f) => !Object.hasOwn(found!.row, f));
    if (empty.length === 0) continue;
    const readable = empty.every((f) => Object.hasOwn(read.extracted, f));
    const asked = read.unknowns.some((u) => empty.includes(u.field)) && read.missed.length === 1;
    if (readable || asked) out.push({ raw: raw.id, from: found });
  }
  return out;
}

/**
 * The arrivals held for a person whose pattern, by their latest `match` line, is one of `actors`, oldest first. The
 * pattern is asked of each held row through the log's index on its target, so held texts at other doors cost one read
 * each and never crowd these out.
 */
function heldBy(sql: Sql, actors: readonly string[], most: number): { id: string; ts: string; body: string | null; actor: string }[] {
  return sql.all<{ id: string; ts: string; body: string | null; actor: string }>(
    `SELECT id, ts, body, actor FROM (
       SELECT i.id, i.ts, i.body, i.rowid AS n,
              (SELECT e.actor FROM event e WHERE e.kind = 'match' AND e.target = 'inbox_raw:' || i.id ORDER BY e.rowid DESC LIMIT 1) AS actor
         FROM inbox_raw i WHERE i.state IN ('review', 'proposed'))
      WHERE actor IN (SELECT value FROM json_each(?)) ORDER BY ts, n LIMIT ?`,
    JSON.stringify(actors),
    Math.min(most, 1_000_000),
  );
}

/* ── a wrong answer ─────────────────────────────────────────────────────── */

/**
 * Digits taken off one account and put on another within `MOVE_DAYS` of an answer: one question, once, offering to move
 * what those digits filed onto the first account to the second. Nothing moves until it is answered.
 *
 * WHAT THEY FILED is read from the receipts since then: each row an arrival printing those digits filed, whose lookup's
 * field still names the first account. Never the rows a person typed.
 */
function askMove(deps: IngestDeps, at: string, m: { tail: TailAsked; from: string; to: string; since: number }): void {
  const cause = `move:${m.tail.register}:${m.tail.digits}:${m.to}`;
  const asked = deps.sql.one<{ id: string }>(
    "SELECT id FROM suggestion WHERE body_kind = 'options' AND json_valid(body) AND json_extract(body, '$.cause') = ? LIMIT 1",
    cause,
  );
  if (asked !== undefined) return;
  const moved = filedBy(deps, m.tail.digits, m.from, instant(m.since));
  if (moved.rows.length === 0 || moved.register === null) return;
  const fromName = rowTitle(deps.sql, m.tail.register, m.from) ?? 'the account it was on';
  const toName = rowTitle(deps.sql, m.tail.register, m.to) ?? 'the account it is on now';
  const list = declaredList(deps.sql, moved.register);
  const n = moved.rows.length;
  const things = n === 1 ? (typeof list.one === 'string' && list.one.trim() !== '' ? list.one.trim() : 'one') : listName(deps.sql, moved.register).toLowerCase();
  if (deps.sql.one("SELECT 1 AS n FROM suggestion WHERE status = 'open' AND cause = ?", cause) !== undefined) return;
  const id = `SG${deps.allocate('suggestion')}`;
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, cause) VALUES (?, 'options', ?, 'open', ?, ?, ?)",
    id,
    JSON.stringify({
      cause,
      move: { register: moved.register, rows: moved.rows, from: m.from, to: m.to },
      options: [
        { id: 'move', label: `Move them to ${toName}`, because: `The ${m.tail.says} ending ${m.tail.digits} is ${toName}, so they were never spent on ${fromName}.`, recommended: true },
        { id: 'keep', label: 'Keep them where they are', because: `They stay on ${fromName}.` },
      ],
      count: n,
      context: cutTo(`The ${m.tail.says} ending ${m.tail.digits} was on ${fromName} and is on ${toName} now. ${n} filed by it are still on ${fromName}.`, 280),
    }),
    `ingest:${m.tail.door}`,
    at,
    cause,
  );
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', ?)",
    deps.mint(),
    at,
    `ingest:${m.tail.door}`,
    `suggestion:${id}`,
    `Move the ${n} ${things} the ${m.tail.says} ending ${m.tail.digits} filed to ${toName}?`.slice(0, 280),
  );
}

/** The rows arrivals printing `digits` filed onto `account` since `since`, with the field that names it. */
function filedBy(deps: IngestDeps, digits: string, account: string, since: string): { register: string | null; rows: { id: string; field: string }[] } {
  const receipts = deps.sql.all<{ ingest_id: string; wrote: string; body: string | null }>(
    `SELECT r.ingest_id, r.wrote, i.body FROM ingest_receipt r JOIN inbox_raw i ON i.id = r.raw_id WHERE r.ts >= ? ORDER BY r.ts LIMIT ?`,
    since,
    REPLAY_BATCH * 5,
  );
  const patterns = new Map(deps.ingests().map((p) => [p.ingest, p]));
  const rows: { id: string; field: string }[] = [];
  let register: string | null = null;
  for (const receipt of receipts) {
    const pattern = patterns.get(receipt.ingest_id);
    if (pattern === undefined) continue;
    const body = receipt.body ?? '';
    const text = deps.normalise === undefined ? body : deps.normalise(body);
    const printing = Object.entries(pattern.extract ?? {}).flatMap(([field, declared]) => {
      const lookup = lookupOf(stripOf(declared).form);
      if (lookup === null) return [];
      const mask = maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
      return slices({ lookup } as Record<string, unknown>, text).some((s) => printsDigits(firstRun(mask + s), digits)) ? [field] : [];
    });
    if (printing.length === 0) continue;
    let ids: unknown;
    try {
      ids = JSON.parse(receipt.wrote);
    } catch {
      continue;
    }
    for (const id of Array.isArray(ids) ? ids : []) {
      const entry = deps.sql.one<{ register: string; fields: string }>('SELECT register, fields FROM entry WHERE id = ? AND deleted_at IS NULL', String(id));
      const fields = parsed(entry?.fields);
      const field = printing.find((f) => fields?.[f] === account);
      if (entry === undefined || field === undefined) continue;
      register ??= entry.register;
      if (entry.register === register) rows.push({ id: String(id), field });
    }
  }
  return { register, rows };
}

function answerMove(deps: IngestDeps, a: Answered, body: Record<string, unknown>): Result<string | null> {
  if (body.applied !== undefined || a.option !== 'move') return ok(null);
  const move = body.move as { register?: unknown; rows?: unknown; from?: unknown; to?: unknown } | undefined;
  if (typeof move?.register !== 'string' || typeof move.to !== 'string' || typeof move.from !== 'string' || !Array.isArray(move.rows)) return ok(null);
  const mark = lastEvent(deps.sql);
  let moved = 0;
  for (const r of move.rows as { id?: unknown; field?: unknown }[]) {
    if (typeof r?.id !== 'string' || typeof r.field !== 'string' || !FIELD_ID.test(r.field)) continue;
    const fields = parsed(deps.sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ? AND deleted_at IS NULL', r.id)?.fields);
    /* A ROW SOMEBODY MOVED SINCE IS THEIRS, and stays where they put it. */
    if (fields?.[r.field] !== move.from) continue;
    const wrote = deps.write(move.register, r.id, { [r.field]: move.to }, a.actor);
    if (!wrote.ok) return wrote as Result<never>;
    moved += 1;
  }
  const line = `Moved ${moved} to ${rowTitle(deps.sql, String((body.cause as string).split(':')[1]), move.to) ?? 'the other account'}.`;
  deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, applied: { moved }, said: line }), a.id);
  inBatch(deps.sql, mark, a.batch, (move.rows as { id?: unknown }[]).flatMap((r) => (typeof r?.id === 'string' ? [r.id] : [])));
  return ok(line);
}

/* ── a pattern updated, and a repeat filed as a second one ─────────────── */

/**
 * The arrivals held under these patterns, run again once, because a pattern's new version may read them (REC-A02 step
 * 11). The record calls this when an install changes an ingest's version; nothing read a held arrival again when its
 * pattern was fixed, so a fix reached only the texts that came after it.
 */
export function rerunHeld(deps: IngestDeps, ingests: readonly string[]): Result<Replayed> {
  /* AN ACCEPTED PATTERN IS CARRIED OUT HERE, the first time it can be: `decide` hands its answer to `answerAsked`
     before the record's `land` installs it, so on a first accept there is no pattern yet to run what waits through.
     FIRST, so what the yes files is in the decision's batch and one Undo takes it back; the run again below would file
     what the pattern held in a batch of its own. */
  for (const ingest of ingests) acceptedPatterns(deps, ingest);
  return ok(rerun(deps, ingests, null));
}

/** `rerunHeld`'s work: the arrivals held under `ingests`, or only those of them in `only`, run again oldest first. */
function rerun(deps: IngestDeps, ingests: readonly string[], only: ReadonlySet<string> | null): Replayed {
  return replayHeld(deps, heldItems(deps, ingests, only));
}

/** The arrivals held under `ingests` (or only those in `only`), oldest first, each with the rowset it is asked in. */
function heldItems(deps: IngestDeps, ingests: readonly string[], only: ReadonlySet<string> | null): Again[] {
  const named = new Set(ingests.map((i) => `ingest:${i}`));
  if (named.size === 0) return [];
  const asking = deps.sql.all<{ id: string; body: string; opened_by: string }>(
    "SELECT id, body, opened_by FROM suggestion WHERE body_kind = 'rowset' AND status = 'open' AND opened_by IN (SELECT value FROM json_each(?))",
    JSON.stringify([...named]),
  );
  const held = heldBy(deps.sql, [...named], Number.MAX_SAFE_INTEGER).filter((raw) => only === null || only.has(raw.id));
  const items: Again[] = [];
  for (const raw of held) {
    const actor = raw.actor;
    const pattern = deps.ingests().find((i) => `ingest:${i.ingest}` === actor);
    const body = raw.body ?? '';
    const read = pattern === undefined ? null : readFields(deps, pattern, body, deps.normalise === undefined ? body : deps.normalise(body), raw.ts);
    let from: Again['from'];
    for (const q of asking.filter((x) => x.opened_by === actor)) {
      const b = parsed(q.body);
      const rows = Array.isArray(b?.rows) ? (b.rows as Record<string, unknown>[]) : [];
      const at = Array.isArray(b?.raws) ? (b.raws as unknown[]).indexOf(raw.id) : read === null ? -1 : rows.findIndex((r) => sameRow(r, read.extracted));
      if (at !== -1 && rows[at] !== undefined) {
        from = { suggestion: q.id, row: rows[at]! };
        break;
      }
    }
    items.push({ raw: raw.id, ...(from === undefined ? {} : { from }) });
  }
  return items;
}

/* ── a shape's one pattern question, answered ───────────────────────────── */

/** The most samples a pattern question carries: the most the record's builder tries one pattern on at once. */
const PATTERN_SAMPLES_MOST = 10;
/** The most waiting texts one accepted pattern runs again in one answer. Past it the rest wait for the next answer. */
const PATTERN_FILES_MOST = 10_000;

/** A pattern question as it is read here. */
type PatternAsked = { id: string; status: string; resolved_as: string | null; cause: string | null; body: Record<string, unknown> };

const stringsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The name of the ingest a pattern question installs, from either spelling its body is filed in, or `null`. */
function patternIngest(body: Record<string, unknown>): string | null {
  const inner = patternBody(body);
  return inner !== null && typeof inner.ingest === 'string' && inner.ingest !== '' ? inner.ingest : null;
}

/** The ingest's body a pattern question installs, from either spelling its body is filed in, or `null`. */
function patternBody(body: Record<string, unknown>): Record<string, unknown> | null {
  const ingest = body.ingest as Record<string, unknown> | null | undefined;
  if (ingest === null || typeof ingest !== 'object') return null;
  return (ingest.body !== null && typeof ingest.body === 'object' ? ingest.body : ingest) as Record<string, unknown>;
}

/** The pattern questions that install `ingest`, newest first. */
function patternAsked(sql: Sql, ingest: string): PatternAsked[] {
  return sql
    .all<{ id: string; status: string; resolved_as: string | null; cause: string | null; body: string }>(
      `SELECT id, status, resolved_as, cause, body FROM suggestion
        WHERE body_kind = 'pattern' AND json_valid(body)
          AND coalesce(json_extract(body, '$.ingest.body.ingest'), json_extract(body, '$.ingest.ingest')) = ?
        ORDER BY rowid DESC LIMIT ?`,
      ingest,
      ASKED_SCAN,
    )
    .flatMap((q) => {
      const body = parsed(q.body);
      return body === null ? [] : [{ ...q, body }];
    });
}

/** Whether a pattern question holds a yes now: answered, as accepted, and not taken back. */
const accepted = (sql: Sql, q: PatternAsked): boolean => q.status === 'resolved' && q.resolved_as === 'addressed' && settledAnswer(sql, q.id) === 'accept';

/**
 * The pattern question whose yes approved `ingest`, or `null` when nobody said yes to it.
 *
 * THE DECISION IS THE APPROVAL AND THE ONLY ONE. There is no teaching table and none is added: a pattern drawn for a
 * shape is approved while a person's yes to its one question stands, so an Undo that puts the question back in Decide
 * puts the ceiling back as well. A pattern no question was asked about is never approved here, so a pack's pattern set
 * to ask before it writes still asks.
 */
export function approvedPattern(sql: Sql, ingest: string): string | null {
  return patternAsked(sql, ingest).find((q) => accepted(sql, q))?.id ?? null;
}

/**
 * Where a text a drawn pattern did not file waits: in the shape's one open pattern question, joined, which
 * answers its id; quietly, which answers `null`, when the pattern was accepted and no question is open; and `undefined`
 * for a pattern nobody was asked about, which asks as it always did.
 */
function patternWaits(deps: IngestDeps, ingest: string, shape: string, raw: string): string | null | undefined {
  const asked = patternAsked(deps.sql, ingest);
  if (asked.length === 0) return undefined;
  const byCause = deps.sql.one<{ id: string; body: string }>(
    "SELECT id, body FROM suggestion WHERE body_kind = 'pattern' AND status = 'open' AND cause = ? ORDER BY rowid LIMIT 1",
    patternCause(shape),
  );
  const open = byCause === undefined ? asked.find((q) => q.status === 'open') : { id: byCause.id, body: parsed(byCause.body) ?? {} };
  if (open !== undefined) {
    joinPattern(deps.sql, open.id, open.body, raw);
    return open.id;
  }
  return asked.some((q) => accepted(deps.sql, q)) ? null : undefined;
}

/**
 * One more text in a shape's open pattern question: its count grows by one, and its samples by the text while they are
 * fewer than the builder reads at once. Every text it holds is kept in `joined`, so the answer files each of them.
 */
function joinPattern(sql: Sql, suggestion: string, body: Record<string, unknown>, raw: string): void {
  const samples = stringsOf(body.samples);
  const joined = stringsOf(body.joined);
  if (samples.includes(raw) || joined.includes(raw)) return;
  const count = (typeof body.count === 'number' && body.count >= samples.length ? body.count : samples.length) + 1;
  sql.exec(
    'UPDATE suggestion SET body = ? WHERE id = ?',
    JSON.stringify({ ...body, samples: samples.length < PATTERN_SAMPLES_MOST ? [...samples, raw] : samples, joined: [...joined, raw], count }),
    suggestion,
  );
}

/**
 * The texts an accepted pattern runs again, oldest first: every one of the question's shape that nothing read yet, and
 * every one the pattern itself holds, each with the per-text question it is asked in. The shape is read from the texts
 * the question was drawn from and those that joined it, as `owedShapes` reads a question's shape.
 */
function patternWaiting(deps: IngestDeps, body: Record<string, unknown>, pattern: IngestDecl): Again[] {
  const drawn = [...stringsOf(body.samples), ...stringsOf(body.joined)];
  const shapes = new Set(
    deps.sql
      .all<{ channel: Channel; headers: string | null }>('SELECT channel, headers FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(drawn))
      .map((r) => shapeOf(r.channel, (parsed(r.headers) ?? {}) as Record<string, string>)),
  );
  const untriaged = deps.sql
    .all<{ id: string; headers: string | null }>(
      `SELECT id, headers FROM inbox_raw WHERE state = 'untriaged' AND channel = ? AND (reason IS NULL OR reason <> ?) ORDER BY ts, rowid`,
      pattern.channel,
      UNVERIFIED,
    )
    /* THE SHAPE IS READ HERE AND NOT IN SQL, so the cap is on what is this shape's, never on every untriaged text. */
    .filter((r) => shapes.has(shapeOf(pattern.channel, (parsed(r.headers) ?? {}) as Record<string, string>)))
    .map((r): Again => ({ raw: r.id }));
  const items = [...untriaged, ...heldItems(deps, [pattern.ingest], null)];
  /* ONE ORDER FOR BOTH, the order they came in, so the oldest files first whichever way it waited. */
  const order = deps.sql
    .all<{ id: string }>('SELECT id FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?)) ORDER BY ts, rowid', JSON.stringify(items.map((i) => i.raw)))
    .map((r) => r.id);
  const byRaw = new Map(items.map((i) => [i.raw, i]));
  return order.slice(0, PATTERN_FILES_MOST).map((raw) => byRaw.get(raw)!);
}

/** "Filed 4 with this pattern. 1 still waits: it reads only part of it." */
function patternFiledSaid(filed: number, already: number, part: number, unread: number): string {
  if (filed + already + part + unread === 0) return 'Nothing waited.';
  return [
    `Filed ${filed} with this pattern.`,
    already ? `${already} ${already === 1 ? 'was' : 'were'} already there.` : '',
    part ? `${part} still ${part === 1 ? 'waits' : 'wait'}: it reads only part of ${part === 1 ? 'it' : 'them'}.` : '',
    unread ? `${unread} more ${unread === 1 ? 'waits' : 'wait'} that it does not read.` : '',
  ]
    .filter((said) => said !== '')
    .join(' ');
}

/**
 * A shape's one pattern question, answered, carried out: "The ingest proposal loop".
 *
 * A YES FILES EVERYTHING THE PATTERN READS, WITH ONE UNDO. Every text of the shape that waits runs again through the
 * pattern the yes installed, from its stored bytes, oldest first, 200 at a time (`replayHeld`). The yes is the approval
 * the header's ceiling waits for (`approvedPattern`), so what the pattern reads exactly files as `exact`, and what it
 * reads in part keeps waiting, quietly, with no question of its own. Everything written goes in the decision's batch, so
 * one Undo puts every row back and the texts back to waiting (`reopenedPattern`). The question closes saying what
 * happened: "Filed 4 with this pattern. 1 still waits: it reads only part of it."
 *
 * A NO FILES NOTHING, and the shape is not owed again: the decision is the memory (`owedShapes`).
 *
 * NOT INSTALLED YET IS NOT DONE. `decide` hands the answer here before the record's `land` installs the pattern, so a
 * first yes finds nothing to run the texts through and leaves them; the install calls `rerunHeld`, which carries the
 * answer out then (`acceptedPatterns`). ONCE: the answer is marked on the question (`applied`), as a tail's is.
 */
function answerPattern(deps: IngestDeps, a: Answered, asked: Record<string, unknown>, landed = false): Result<string | null> {
  const body = parsed(deps.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', a.id)?.body) ?? asked;
  if (carriedOut(deps.sql, a.id, body)) return ok(null);
  const at = instant(deps.nowMs);
  const resolve = answeredAt(deps.sql, a.id);
  const keep = (more: Record<string, unknown>): void => deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, ...more }), a.id);
  if (a.option !== 'accept') {
    keep({ applied: { none: true, at, resolve } });
    return ok(null);
  }
  const name = patternIngest(body);
  const pattern = name === null ? undefined : deps.ingests().find((i) => i.ingest === name);
  if (pattern === undefined) return ok(null);
  /* THE VERSION HE SAID YES TO, never an older one under the same name. At the press (`landed` false) a pattern of that
     name already in, from an Undo or a draft that reused a name, may not be the one the question carries; the install
     that follows hands the answer back through `rerunHeld`, which runs what waits through what just landed. */
  if (!landed && canonical(pattern) !== canonical(patternBody(body))) return ok(null);

  const mark = lastEvent(deps.sql);
  const items = patternWaiting(deps, body, pattern);
  const ran = replayHeld(deps, items, true, pattern.ingest);
  const states = deps.sql.all<{ id: string; state: string }>('SELECT id, state FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(items.map((i) => i.raw)));
  const filed = states.filter((s) => s.state === 'matched').map((s) => s.id);
  const part = states.filter((s) => s.state === 'review' || s.state === 'proposed').length;
  const unread = states.filter((s) => s.state === 'untriaged').length;
  const line = patternFiledSaid(ran.filed, ran.already, part, unread);
  keep({ applied: { at, resolve, filed, wrote: ran.wrote }, said: line });
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', ?, 'suggestion', ?)",
    deps.mint(),
    at,
    `ingest:${pattern.ingest}`,
    `suggestion:${a.id}`,
    line.slice(0, 280),
  );
  inBatch(deps.sql, mark, a.batch, []);
  return ok(line);
}

/**
 * Every yes to a pattern question about `ingest` not carried out yet, carried out now in the batch its decision was
 * made in. `rerunHeld` calls this once an install lands. One that cannot be carried out runs in a savepoint of its own,
 * is written in the log on its question, and stops nothing else.
 */
function acceptedPatterns(deps: IngestDeps, ingest: string): void {
  for (const q of patternAsked(deps.sql, ingest)) {
    if (!accepted(deps.sql, q) || carriedOut(deps.sql, q.id, q.body)) continue;
    const made = deps.sql.one<{ actor: string; batch: string | null }>(
      "SELECT e.actor AS actor, e.batch AS batch FROM event r JOIN event e ON e.rowid = r.rowid - 1 AND e.kind = 'decide' WHERE r.kind = 'resolve' AND r.target = ? ORDER BY r.rowid DESC LIMIT 1",
      `suggestion:${q.id}`,
    );
    const done = attempt(deps.sql, (fn) => fn(), () => answerPattern(deps, { id: q.id, option: 'accept', actor: made?.actor ?? 'system', batch: made?.batch ?? null }, q.body, true));
    if (!done.ok) failedAnswer(deps, q.id, ingest, done);
  }
}

/**
 * A pattern question an Undo put back in Decide, made to wait again: the texts its yes filed, whose rows the Undo took
 * back, wait again as nothing read them, and what the yes did is taken off it, so a second yes files them again.
 * `reopenedTail` hands a pattern question here. Answers how many texts wait again.
 */
function reopenedPattern(sql: Sql, suggestion: string, body: Record<string, unknown>): number {
  const applied = body.applied as { filed?: unknown } | undefined;
  const again = sql.all<{ id: string }>(
    `UPDATE inbox_raw SET state = 'untriaged', reason = NULL
      WHERE id IN (SELECT value FROM json_each(?)) AND state = 'matched' AND ${UNDONE_SQL} RETURNING id`,
    JSON.stringify(stringsOf(applied?.filed)),
  );
  const { applied: _applied, said: _said, ...rest } = body;
  if (body.applied !== undefined || body.said !== undefined) sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(rest), suggestion);
  return again.length;
}

/**
 * The held arrivals under `patterns` that the pattern's live version never read: their latest `match` line is older than
 * the version, so whatever it fixed has not reached them. A pattern still at its first version has held nothing under
 * another. Oldest first, at most `most`.
 */
function readBefore(sql: Sql, patterns: readonly IngestDecl[], most: number): string[] {
  const since = patterns.flatMap((p) => {
    const live = sql.one<{ version: number; created_at: string }>(
      'SELECT version, created_at FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
      `ingest.${p.ingest}`,
    );
    return live === undefined || live.version <= 1 ? [] : [{ actor: `ingest:${p.ingest}`, at: live.created_at }];
  });
  if (since.length === 0) return [];
  return sql
    .all<{ id: string }>(
      `SELECT h.id FROM (
         SELECT i.id, i.ts, i.rowid AS n,
                (SELECT e.rowid FROM event e WHERE e.kind = 'match' AND e.target = 'inbox_raw:' || i.id ORDER BY e.rowid DESC LIMIT 1) AS last
           FROM inbox_raw i WHERE i.state IN ('review', 'proposed')) h
         JOIN event m ON m.rowid = h.last
         JOIN json_each(?) s ON json_extract(s.value, '$.actor') = m.actor AND m.ts < json_extract(s.value, '$.at')
        ORDER BY h.ts, h.n LIMIT ?`,
      JSON.stringify(since),
      Math.min(most, 1_000_000),
    )
    .map((r) => r.id);
}

/**
 * A text skipped as a repeat, filed after all as a second one: "It is a second one" in the Inbox. It runs again
 * with its pattern's repeat check off for this one run, so it is written beside the row it looked like.
 *
 * AND WHAT THE SKIP WROTE ONTO THAT ROW IS TAKEN BACK (review of 30 October, R12): the reference and balance it gave
 * the row, named on its `filled` line, were this text's and not that row's. A field changed since by anyone is left.
 */
export function fileAsSecond(deps: IngestDeps, raw: string): Result<Arrived> {
  const row = deps.sql.one<{ id: string; ts: string; channel: string; headers: string | null; body: string | null; sha256: string; state: string; reason: string | null }>(
    'SELECT id, ts, channel, headers, body, sha256, state, reason FROM inbox_raw WHERE id = ?',
    raw,
  );
  if (row === undefined || row.state !== 'skipped')
    return no<Arrived>('OUT_OF_BOUNDS', 'Only a message skipped as a repeat can be filed as a second one.', { at: 'raw' });
  /* A REPEAT BY ITS MARK, NOT BY ITS STATE: a rule's skip is `skipped` too, and filed from here it skipped again and
     answered ok, or, with the rule edited since, filed past the repeat check. Only a newest
     `match` line carrying `field: 'repeats'` is a repeat. */
  const mark = deps.sql.one<{ field: string | null }>("SELECT field FROM event WHERE kind = 'match' AND target = ? ORDER BY rowid DESC LIMIT 1", `inbox_raw:${raw}`);
  if (mark?.field !== 'repeats') return no<Arrived>('OUT_OF_BOUNDS', 'This message was set aside by a rule, not as a repeat.', { at: 'raw' });
  const pattern = matchedBy(deps, raw);
  if (pattern === null) return no<Arrived>('OUT_OF_BOUNDS', 'The pattern that read this message is gone, so it cannot be filed again from here.', { at: 'raw' });
  const once: IngestDeps = {
    ...deps,
    ingests: () =>
      deps.ingests().map((i) => {
        if (i.ingest !== pattern.ingest) return i;
        const { dedupe: _key, ...rest } = i;
        return { ...rest, on_conflict: 'new' as const };
      }),
  };
  const filed = runArrival(
    once,
    {
      channel: row.channel as Channel,
      headers: (parsed(row.headers) ?? {}) as Record<string, string>,
      body: row.body ?? '',
      sha256: row.sha256,
      verified: true,
      ...(row.channel === 'webhook' ? { ingest: pattern.door ?? pattern.ingest } : {}),
    },
    { id: row.id, state: row.state, reason: row.reason, ts: row.ts },
    {},
  );
  if (filed.ok) unfill(deps, raw, pattern.ingest);
  return filed;
}

/**
 * Take back what a skip wrote onto the row it kept (`nearFill`), as its `filled` line names it: each field still as the
 * skip left it is cleared. One a person or anything else wrote since (a later line on that field) is theirs, and stays.
 */
function unfill(deps: IngestDeps, raw: string, ingest: string): void {
  const line = deps.sql.one<{ rowid: number; from_v: string | null; to_v: string | null }>(
    "SELECT rowid, from_v, to_v FROM event WHERE kind = 'match' AND target = ? AND field = 'filled' ORDER BY rowid DESC LIMIT 1",
    `inbox_raw:${raw}`,
  );
  if (line === undefined || line.from_v === null || line.to_v === null) return;
  const kept = deps.sql.one<{ register: string }>('SELECT register FROM entry WHERE id = ? AND deleted_at IS NULL', line.from_v);
  if (kept === undefined) return;
  let said: unknown;
  try {
    said = JSON.parse(line.to_v);
  } catch {
    return;
  }
  if (!Array.isArray(said)) return;
  const clear: Record<string, null> = {};
  for (const field of said) {
    if (typeof field !== 'string') continue;
    const since = deps.sql.one<{ n: number }>('SELECT 1 AS n FROM event WHERE target = ? AND field = ? AND rowid > ? LIMIT 1', `entry:${line.from_v}`, field, line.rowid);
    if (since === undefined) clear[field] = null;
  }
  if (Object.keys(clear).length > 0) deps.write(kept.register, line.from_v, clear, `ingest:${ingest}`);
}

/** Three letters a month is said by in a reason: `7 Oct`. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * What a near skip writes onto the row it keeps, as a patch, or `null` for nothing.
 *
 * THE KEY'S OWN WORDS THE ROW NEVER HELD, ALWAYS: a statement line has no reference, so an alert that met it gave it none,
 * and a second alert of the same amount with another reference met the same line and was skipped too, a real payment
 * never in the Ledger (review of 30 October, R11). Taking the reference claims the line, and the next alert with another
 * reference finds no row and is written. Words and numbers only: an account or a choice is not this arrival's to give.
 *
 * AND THE MONEY IT HOLDS NOTHING IN (`moneyUnsaid`): a statement line merged into the alert that wrote the payment first
 * brought the balance after it, and the alert's line kept none (recheck of 30 October). Under a key that names a balance
 * (`available`, `balance_after`) that balance is the claim.
 *
 * NOTHING AT ALL UNLESS THE MATCH IS SURE (`sure` from `existingRow`): with two lines of one amount free, which one this
 * alert is cannot be told, and its balance on the wrong one is a wrong confirmed balance (R12). Nor its reference: a line
 * holding one reads as an alert that met the other line, which then belongs to it, and the next alert is written beside
 * two lines it is one of. Unclaimed, both lines stay free, and two lines answer two alerts.
 */
export function nearFill(
  deps: Pick<IngestDeps, 'sql' | 'schemaOf'>,
  register: string,
  existing: { id: string; sure?: boolean },
  dedupe: Dedupe | null | undefined,
  extracted: Record<string, unknown>,
): Record<string, unknown> | null {
  if (dedupe === undefined || dedupe === null || Array.isArray(dedupe) || existing.sure === false) return null;
  const fields = deps.schemaOf(register)?.fields ?? {};
  const row = parsed(deps.sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', existing.id)?.fields) ?? {};
  const patch: Record<string, unknown> = {};
  for (const field of dedupe.near.on) {
    const type = fields[field]?.type;
    if (type !== 'text' && type !== 'int' && type !== 'number') continue;
    if (row[field] !== undefined && row[field] !== null) continue;
    const v = extracted[field];
    if ((typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v))) patch[field] = v;
  }
  Object.assign(patch, moneyUnsaid(deps, register, existing.id, extracted) ?? {});
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The money fields an arrival says that the row it repeats holds nothing in, as a patch, or `null` when there are none:
 * what a second sighting of one payment adds to the first (a statement's balance after it, an alert's available).
 */
export function moneyUnsaid(deps: Pick<IngestDeps, 'sql' | 'schemaOf'>, register: string, id: string, extracted: Record<string, unknown>): Record<string, unknown> | null {
  const fields = deps.schemaOf(register)?.fields ?? {};
  const row = parsed(deps.sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)?.fields) ?? {};
  const patch: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(extracted)) {
    if (fields[field]?.type !== 'money' || (row[field] !== undefined && row[field] !== null)) continue;
    const m = v as { amount?: unknown; currency?: unknown } | null;
    if (m !== null && typeof m === 'object' && Number.isInteger(m.amount) && typeof m.currency === 'string') patch[field] = { amount: m.amount, currency: m.currency };
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Why a text was skipped as a repeat, by the row it repeats: "Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct."
 * Its title, its first money field and the day it moved, each left out where the row has none. Never a list's id or a
 * row's number.
 */
function repeatSaid(deps: IngestDeps, register: string, existing: { id: string }, dedupe: Dedupe | undefined): string {
  const fields = deps.schemaOf(register)?.fields ?? {};
  const row = parsed(deps.sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', existing.id)?.fields) ?? {};
  const on = dedupe === undefined ? [] : Array.isArray(dedupe) ? dedupe : dedupe.near.on;
  const money = [...on, ...Object.keys(fields)].find((f) => fields[f]?.type === 'money' && row[f] !== undefined);
  const amount = money === undefined ? null : (row[money] as { amount?: unknown; currency?: unknown });
  const dayField = (dedupe !== undefined && !Array.isArray(dedupe) ? dedupe.near.day : undefined) ?? Object.keys(fields).find((f) => fields[f]?.type === 'day' && typeof row[f] === 'string');
  const when = dayField === undefined ? null : row[dayField];
  const parts = [
    rowTitle(deps.sql, register, existing.id) ?? 'one already there',
    amount !== null && Number.isInteger(amount.amount) && typeof amount.currency === 'string' ? moneyText(amount.amount as number, amount.currency) : '',
    typeof when === 'string' && /^\d{4}-\d{2}-\d{2}/.test(when) ? `${Number(when.slice(8, 10))} ${MONTHS[Number(when.slice(5, 7)) - 1] ?? ''}`.trim() : '',
  ].filter((part) => part !== '');
  return `Looks like a repeat of ${parts.join(', ')}.`;
}

/* ── what each pattern did ────────────────────────────────────── */

/** One pattern's last days: what it filed, what it skipped and why, and what waits. `ingest` is a handle, `said` its name. */
export type PatternLine = { ingest: string; said: string; filed: number; skipped: { reason: string; n: number }[]; waiting: number };

/** One door's last days: each pattern that reads there, and how many of its texts no pattern read. */
export type DoorLine = { door: string; said: string; patterns: PatternLine[]; unread: number };

export type PatternReport = { days: number; since: string; doors: DoorLine[] };

/**
 * What each pattern did with the last `days` of arrivals, door by door: filed, skipped with its reason, waiting, and one
 * line for the texts no pattern read. The Inbox draws it under "What comes in" and an agent reads it as
 * `braindog:inbox/patterns`. Every arrival in the window is counted once, by the pattern its own log names.
 *
 * NAMES, NEVER IDS, in what a person reads: a pattern is said by its description, else its add-on's title, else its door's.
 */
export function patternReport(sql: Sql, nowMs: number, days = 14): PatternReport {
  const span = Number.isInteger(days) && days > 0 && days <= 366 ? days : 14;
  const since = instant(nowMs - span * 86_400_000);
  const decls = sql
    .all<{ body: string; pack: string | null }>("SELECT body, pack_id AS pack FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
    .flatMap((r) => {
      const body = parsed(r.body);
      return body === null || typeof body.ingest !== 'string' ? [] : [body as unknown as IngestDecl];
    });
  const byId = new Map(decls.map((d) => [d.ingest, d]));
  const doorOfPattern = (id: string): string => byId.get(id)?.door ?? id;
  const doors = new Map<string, DoorLine>();
  const doorLine = (door: string): DoorLine => {
    let line = doors.get(door);
    if (line === undefined) {
      const own = byId.get(door);
      line = { door, said: described(own) ?? packTitle(sql, own) ?? (own === undefined ? (UNNAMED_DOOR[door] ?? 'A door with no name') : 'A door with no name'), patterns: [], unread: 0 };
      doors.set(door, line);
    }
    return line;
  };
  const patternLine = (id: string): PatternLine => {
    const door = doorLine(doorOfPattern(id));
    let line = door.patterns.find((p) => p.ingest === id);
    if (line === undefined) {
      const decl = byId.get(id);
      line = { ingest: id, said: described(decl) ?? packTitle(sql, decl) ?? door.said, filed: 0, skipped: [], waiting: 0 };
      door.patterns.push(line);
    }
    return line;
  };
  for (const d of decls) if (d.channel !== 'pull') patternLine(d.ingest);

  const arrived = sql.all<{ id: string; channel: string; state: string; reason: string | null; receipt: string | null; matched: string | null; door: string | null }>(
    `SELECT i.id, i.channel, i.state, i.reason,
            (SELECT r.ingest_id FROM ingest_receipt r WHERE r.raw_id = i.id ORDER BY r.ts DESC LIMIT 1) AS receipt,
            (SELECT e.actor FROM event e WHERE e.kind = 'match' AND e.target = 'inbox_raw:' || i.id ORDER BY e.rowid DESC LIMIT 1) AS matched,
            (SELECT e.actor FROM event e WHERE e.kind = 'arrive' AND e.target = 'inbox_raw:' || i.id ORDER BY e.rowid DESC LIMIT 1) AS door
       FROM inbox_raw i WHERE i.ts >= ? AND i.state NOT IN ('erased')`,
    since,
  );
  for (const a of arrived) {
    const by = (a.receipt ?? (a.matched?.startsWith('ingest:') ? a.matched.slice('ingest:'.length) : null)) as string | null;
    if (a.state === 'untriaged') {
      /* AN ARRIVAL NOTHING VERIFIED WAS OFFERED NO PATTERN, and is not a pattern's to count. */
      if (a.reason === UNVERIFIED) continue;
      const door = a.door?.startsWith('ingest:') ? a.door.slice('ingest:'.length) : a.channel;
      doorLine(door).unread += 1;
      continue;
    }
    if (by === null) continue;
    const line = patternLine(by);
    if (a.state === 'matched') line.filed += 1;
    else if (a.state === 'skipped') {
      const reason = a.reason ?? 'Skipped with no reason kept.';
      const kept = line.skipped.find((s) => s.reason === reason);
      if (kept) kept.n += 1;
      else line.skipped.push({ reason, n: 1 });
    } else if (a.state === 'review' || a.state === 'proposed') line.waiting += 1;
  }
  return { days: span, since, doors: [...doors.values()].filter((d) => d.patterns.length > 0 || d.unread > 0) };
}

/** What the report calls arrivals that came in by a channel and named no door, such as mail to the record's address. */
const UNNAMED_DOOR: Readonly<Record<string, string>> = { email: 'Mail', webhook: 'Messages', api: 'Messages sent in', paste: 'Pasted', pull: 'Imports' };

/** A pattern's own `description`, as a person reads it, or `null`. */
function described(decl: IngestDecl | undefined): string | null {
  const said = (decl as { description?: unknown } | undefined)?.description;
  return typeof said === 'string' && said.trim() !== '' ? said.trim().replace(/\s+/g, ' ') : null;
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
 * shows, said with what came: "this message from HSBC texts". With neither, it is the title of the add-on that declared
 * the pattern, or the door: no shipped pattern carries a description, so every question a bank's alert opened said
 * "this email" and never whose. A pattern with none of the three is what came alone, "this email", because its id is a
 * word nobody chose for a person to read. `sources` holds the fullest first, so a question too long with the name is
 * said without it.
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
  const from = channel === 'paste' ? null : (described(matched) ?? described(door) ?? packTitle(deps.sql, matched) ?? packTitle(deps.sql, door));
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

/**
 * What a held reason calls the pattern that read the arrival: its own `description`, else its door's, else the
 * title of the add-on that declared it, else its door's add-on, as `wordsFor` names where a question came from. With
 * none of the four it is "the pattern", because its id is a word nobody chose for a person to read. Lower case as
 * declared; a sentence that opens with it says it through `opening`.
 */
function patternSaid(deps: IngestDeps, matched: IngestDecl): string {
  const door = matched.door === undefined ? undefined : deps.ingests().find((i) => i.ingest === matched.door);
  return described(matched) ?? described(door) ?? packTitle(deps.sql, matched) ?? packTitle(deps.sql, door) ?? 'the pattern';
}

/**
 * The fields a routing table sorts by, as a person reads them: each by its label on the first list the table files to,
 * and a part of one by the field's label and the part's name, `amount.currency` as "amount's currency".
 */
function routeSaid(deps: IngestDeps, route: string | Route): string {
  if (typeof route === 'string') return '';
  const first = route.to[0]?.register;
  const schema = first === undefined ? null : deps.schemaOf(first);
  return listedAnd(
    route.by.map((path) => {
      const [field = path, ...part] = path.split('.');
      const said = fieldSaid(schema, field);
      return part.length === 0 ? said : `${said}'s ${part.join(' ').replace(/_/g, ' ')}`;
    }),
  );
}

/**
 * The title of the add-on that declared a pattern, as the add-ons list shows it, or `null`. The pack is the body's own
 * `pack`, else the declaration row's, and a pack with no title, or one switched off, names nothing: its id is a slug.
 */
function packTitle(sql: Sql, decl: IngestDecl | undefined): string | null {
  if (decl === undefined) return null;
  const said = (decl as { pack?: unknown }).pack;
  const pack =
    typeof said === 'string' && said !== ''
      ? said
      : (sql.one<{ pack: string | null }>('SELECT pack_id AS pack FROM declaration WHERE id = ? AND superseded_at IS NULL', `ingest.${decl.ingest}`)?.pack ?? null);
  if (pack === null) return null;
  const manifest = sql.one<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ? AND disabled_at IS NULL', pack)?.manifest;
  if (manifest === undefined) return null;
  try {
    const title = (JSON.parse(manifest) as { title?: unknown } | null)?.title;
    return typeof title === 'string' && title.trim() !== '' ? title.trim().replace(/\s+/g, ' ') : null;
  } catch {
    return null;
  }
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

/** What `arrivalSure` is told about one arrival: counts and truths, never the text. */
export type SureFacts = { ruleTrusted: boolean; missed: number; soft: number; tails: number; amount: boolean; payee: boolean };

/**
 * HOW SURE A CARD TEXT IS: four things, each worth a quarter. The sender's rule is trusted and read
 * everything it was asked to, the account was found by its last digits, the amount was read (not chosen or defaulted),
 * and the shop is named. Only all four file it by itself; any less and a person is asked, and money that did not read
 * cleanly always is.
 */
export function arrivalSure(f: SureFacts): { sure: boolean; score: number } {
  const checks = [f.ruleTrusted && f.missed === 0 && f.soft === 0, f.tails > 0, f.amount, f.payee];
  const score = checks.filter(Boolean).length / checks.length;
  return { sure: score === 1, score };
}

/** Whether the list's money field was read: there is one, and the extraction holds an amount in it. */
function amountRead(schema: Schema | null, extracted: Record<string, unknown>): boolean {
  const money = Object.entries(schema?.fields ?? {}).filter(([, d]) => d.type === 'money').map(([id]) => id);
  return money.length > 0 && money.some((id) => extracted[id] !== undefined && extracted[id] !== null);
}

/** Whether the list's money was read cleanly: no money field was missed, unreadable or chosen, and one holds an amount. A list with none is clean. */
export function moneyClean(schema: Schema | null, extracted: Record<string, unknown>, doubts: readonly string[]): boolean {
  const money = Object.entries(schema?.fields ?? {}).filter(([, d]) => d.type === 'money').map(([id]) => id);
  if (money.length === 0) return true;
  return !money.some((id) => doubts.includes(id)) && money.some((id) => extracted[id] !== undefined && extracted[id] !== null);
}

/** A question that was to be filed by BrainDog and could not be stays a question, in the words of one. */
export function unfile(deps: IngestDeps, suggestion: string, asked: { question: string; context: string }): void {
  const row = deps.sql.one<{ body: string; status: string }>('SELECT body, status FROM suggestion WHERE id = ?', suggestion);
  if (row === undefined || row.status !== 'open') return;
  try {
    const body = JSON.parse(row.body) as Record<string, unknown>;
    delete body.confident;
    delete body.why;
    body.context = asked.context;
    deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(body), suggestion);
    /* THE QUESTION IS ASKED AGAIN AS A NEW LINE, never written over the first: the log only grows, and the newest line is what is asked. */
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'suggest', ?, 'suggestion', ?)",
      deps.mint(),
      instant(deps.nowMs),
      `suggestion:${suggestion}`,
      asked.question.slice(0, 280),
    );
  } catch {
    /* left as it was: still open, and a person answers it */
  }
}

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
  const who = ((h.from ?? '').trim() || (h.to ?? '').trim()).slice(0, HEADER_READ);
  const open = who.indexOf('<');
  const close = open === -1 ? -1 : who.indexOf('>', open + 1);
  const address = (close > open + 1 ? who.slice(open + 1, close) : who).trim().toLowerCase();
  return address ? `${channel}:${address}` : channel;
}

export type ProposeDeps = {
  sql: Sql;
  nowMs: number;
  outbox: (payload: unknown) => string;
};

/** How long a draft that came to nothing keeps its shape from being asked about again: one day. */
const OWED_AGAIN_MS = 86_400_000;
/** The most pattern questions read when looking for the one a shape was already asked. Newest first. */
const ASKED_SCAN = 200;

/**
 * The cause a shape's one question carries, and the key its answer is remembered by: `pattern:<shape>`.
 *
 * A SHAPE THAT IS NOT A CAUSE AS IT STANDS IS NAMED BY ITS HASH. An address may hold a `+` or a space and be any
 * length, and a cause may not (`cause.ts`, `CAUSE`), so a question carrying one would be refused when it was filed.
 */
export function patternCause(shape: string): string {
  const cause = `pattern:${shape}`;
  return /^[\p{L}\p{N}#@._:/-]{1,192}$/u.test(shape) ? cause : `pattern:${sha256(new TextEncoder().encode(shape)).slice(0, 32)}`;
}

/** A shape still owed a draft: how many of it wait, and the three oldest of them, oldest first. */
export type Owed = { shape: string; channel: Channel; waiting: number; examples: string[] };

/**
 * What waits on one channel with no pattern, by shape, newest first.
 *
 * `rowid` BREAKS THE TIE, because a burst arrives inside one millisecond and `ts` alone then orders them by nothing in
 * particular, which would hand a person three examples in an order that is not the order they came in.
 *
 * AND AN UNVERIFIED ARRIVAL IS NOT AN EXAMPLE OF ANYTHING. `12 §3` makes it ineligible to match, and a draft proposed
 * from three of them is a pattern written to read a stranger's forgeries, paid for by the record's owner: this is the
 * one place an arrival nothing vouched for could still spend money. The state and the reason together are the test,
 * because `UNVERIFIED` is the only reason an untriaged arrival ever carries.
 */
function waitingOn(sql: Sql, nowMs: number, channel: Channel): Map<string, string[]> {
  const by = new Map<string, string[]>();
  const seen = sql.all<{ id: string; headers: string | null }>(
    `SELECT id, headers FROM inbox_raw WHERE state = 'untriaged' AND channel = ? AND ts >= ?
     AND (reason IS NULL OR reason <> ?) ORDER BY ts DESC, rowid DESC LIMIT ?`,
    channel,
    instant(nowMs - WINDOW_DAYS * 86_400_000),
    UNVERIFIED,
    SCAN,
  );
  for (const r of seen) {
    const shape = shapeOf(channel, JSON.parse(r.headers ?? '{}') as Record<string, string>);
    const ids = by.get(shape);
    if (ids) ids.push(r.id);
    else by.set(shape, [r.id]);
  }
  return by;
}

/** The shapes with a draft out: one still on its way, or one that came to nothing inside the last day. */
function draftedShapes(sql: Sql, nowMs: number): Set<string> {
  const out = new Set<string>();
  /* `failed` IS STILL OUT: it is on the queue's retry ladder, and the ladder ends in `dead`. `done` and `dead` are over,
     and keep the shape for a day, so a route that is down is tried once a day and never once an arrival. */
  const rows = sql.all<{ payload: string }>(
    "SELECT payload FROM outbox WHERE kind = 'infer.draft' AND (state IN ('pending', 'leased', 'failed') OR created >= ?)",
    instant(nowMs - OWED_AGAIN_MS),
  );
  for (const r of rows) {
    const p = parsed(r.payload);
    /* BOTH SPELLINGS: the draft queued here names its `shape`, and the analyser's names it as a finding's `subject`. */
    if (typeof p?.shape === 'string') out.add(p.shape);
    else if (p?.signal === 'ingest.unmatched' && typeof p.subject === 'string') out.add(p.subject);
  }
  return out;
}

/**
 * The shapes owed a draft: three or more waiting, no question open for the shape, no answer to one, and no draft out.
 *
 * OWED UNTIL IT IS ANSWERED, NOT ONCE. The draft used to be earned at exactly the third arrival, so a call
 * that failed, or a third that came while another was being filed, left the shape waiting behind a button for ever.
 * Now every arrival of a shape asks whether it is still owed, and these four are the whole answer.
 *
 * THE MEMORY IS THE QUESTION AND ITS DECISION. A question is the shape's when it carries `patternCause(shape)`, or when
 * the arrivals it was drawn from (`body.samples`) are of that shape, which is how one filed with no cause is found.
 * Their shape is read from the arrivals themselves and not from what still waits, because a no has to outlast the
 * three it was said about being filed, ignored or thirty days old. Open, it is the one question and nothing more is drafted. Answered yes or no, the shape is never owed again:
 * a yes installed a pattern and what still waits is what that pattern does not read, and a no is a no. One taken back
 * by whoever filed it is not an answer. There is no teaching table yet, so this is all that is remembered.
 *
 * `only` keeps an arrival's look to its own channel. Nothing here asks: it says what is owed, and `propose` queues.
 */
export function owedShapes(sql: Sql, nowMs: number, only?: Channel): Owed[] {
  const waiting: Owed[] = [];
  for (const channel of only ? [only] : CHANNELS)
    for (const [shape, ids] of waitingOn(sql, nowMs, channel))
      /* OLDEST FIRST, because three examples read in the order they arrived is what a person checks the proposal
         against, and the scan had to be newest-first to be bounded. */
      if (ids.length >= PROPOSE_AT)
        waiting.push({ shape, channel, waiting: ids.length, examples: ids.slice(-PROPOSE_AT).reverse() });
  if (waiting.length === 0) return [];

  const drafted = draftedShapes(sql, nowMs);
  const asked = sql.all<{ status: string; resolved_as: string | null; cause: string | null; body: string }>(
    "SELECT status, resolved_as, cause, body FROM suggestion WHERE body_kind = 'pattern' ORDER BY rowid DESC LIMIT ?",
    ASKED_SCAN,
  );
  const settled = (q: { status: string; resolved_as: string | null }): boolean =>
    q.status === 'open' || q.resolved_as === 'addressed' || q.resolved_as === 'wont-fix' || q.resolved_as === 'incorrect';
  const drawn = asked.filter(settled).map((q) => {
    const samples = parsed(q.body)?.samples;
    return { cause: q.cause, samples: Array.isArray(samples) ? samples.filter((id) => typeof id === 'string') : [] };
  });
  /* An erased arrival kept nothing to tell its shape by, so it speaks for no shape. */
  const shapeById = new Map<string, string>();
  for (const r of sql.all<{ id: string; channel: Channel; headers: string | null }>(
    "SELECT id, channel, headers FROM inbox_raw WHERE state <> 'erased' AND id IN (SELECT value FROM json_each(?))",
    JSON.stringify(drawn.flatMap((q) => q.samples)),
  ))
    shapeById.set(r.id, shapeOf(r.channel, (parsed(r.headers) ?? {}) as Record<string, string>));

  return waiting
    .filter((o) => {
      if (drafted.has(o.shape)) return false;
      const cause = patternCause(o.shape);
      if (sql.one('SELECT 1 AS x FROM decision WHERE cause = ? LIMIT 1', cause) !== undefined) return false;
      return !drawn.some((q) => q.cause === cause || q.samples.some((id) => shapeById.get(id) === o.shape));
    });
}

/**
 * `3′`: the draft a shape with no pattern is owed, OUTSIDE the arrival's transaction.
 *
 * ASKED AT EVERY ARRIVAL OF THE SHAPE, AND QUEUED ONLY WHILE IT IS OWED (`owedShapes`). Never one per payload, because
 * a model call per arrival is a bill that scales with a stranger's sending rate: one draft a shape at a time, one a
 * day at most after a draft that came to nothing, and none once a person has been asked.
 *
 * THE DRAFT CARRIES IDS AND NOT BODIES. Whoever drafts reads the three arrivals itself; copying them here would put an
 * untrusted stranger's text into a queue that is summarised in front of a person.
 */
export function propose(deps: ProposeDeps, channel: Channel, headers: Record<string, string>): string | null {
  const shape = shapeOf(channel, headers);
  const owed = owedShapes(deps.sql, deps.nowMs, channel).find((o) => o.shape === shape);
  if (!owed) return null;
  return deps.outbox({
    shape,
    channel,
    n: PROPOSE_AT,
    waiting: owed.waiting,
    window: `${WINDOW_DAYS}d`,
    examples: owed.examples,
    cause: patternCause(shape),
    why: `${owed.waiting} payloads shaped like ${shape} arrived in thirty days and no pattern matched any of them.`,
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
  /* EVERY VALUE THE ROW HOLDS, which is more than one on a lookup that splits them. */
  const held = table.filter(([, id]) => id === value).map(([literal]) => literal);
  if (held.length === 0) return null;
  const mask = maskAtEnd(lookup.between?.[0] ?? lookup.after ?? '');
  let digits: string | null = null;
  for (const anchored of slices(form as Record<string, unknown>, text)) {
    const masked = mask + anchored;
    const whole = deps.literals(masked, table);
    if (whole !== AMBIGUOUS && whole.some((id) => id === value)) return null;
    for (const one of held) digits ??= printedTail(masked, one);
  }
  return digits === null ? null : { digits, register: lookup.register };
}

/**
 * The digits printed behind stars in a slice's first token that `whole` ends in, or `null`.
 *
 * THE SHAPE `matchMaskedTail` READS, and read back only after it has answered: a run of stars, one `-` or space, then
 * the digits, in the first token, where the anchor put the mask, with no letter straight after them. Three digits at
 * least, and fewer than the whole value, because a value no longer than the digits would have been a whole token.
 *
 * AND THE OTHER WAY ROUND, THE REVERSE TAIL: digits printed LONGER than a value of three digits or more that
 * they end in, `***7731` against a stored `731`, or a whole account number against its last four. Behind stars, or a
 * bare run of `BARE_NUMBER` digits or more, which is an account's number and not an amount, since an amount is printed
 * with its separators. The digits answered are the ones printed, which is what a confirmation is kept by.
 */
function printedTail(masked: string, whole: string): string | null {
  const reverse = reverseTail(masked, whole);
  if (reverse !== null) return reverse;
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
 * Whether a person has said that `tail.digits`, as a bank prints them, are `tail.row`: by accepting an arrival filed to
 * that row by those digits, or by answering a tail question with that row.
 *
 * ACROSS PATTERNS. What a person confirmed is that these digits are that account, which stays true whichever
 * pattern, field or door printed them; read per pattern, the same card was asked about once for its texts and again for
 * its mails.
 *
 * ACCEPTED, NOT ANSWERED. A rowset resolved `addressed` may have been accepted or rejected, so the decision is read as
 * well, and it is found the way `govern.ts` finds it (`SETTLED_BY`): `decide` writes the `decide` event and the
 * suggestion's `resolve` event one after the other, so the event just before the latest `resolve` names the decision.
 * Matching on the instant, the actor or the question instead would let a rejection pressed in the same instant as an
 * acceptance, on a rowset asking the same question, read as the acceptance. A rejection, a question reopened and
 * answered no, and an erased one all read as not confirmed, so the next arrival waits again.
 */
export function confirmedTail(sql: Sql, tail: { digits: string; row: string }): boolean {
  const answered = sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM suggestion WHERE body_kind = 'rowset' AND opened_by LIKE 'ingest:%' AND status = 'resolved'
       AND resolved_as = 'addressed' AND instr(body, '"tails"') > 0 AND instr(body, ?) > 0 ORDER BY opened_at DESC LIMIT ?`,
    tail.digits,
    CONFIRMS_READ,
  );
  for (const row of answered) {
    let tails: unknown;
    try {
      tails = (JSON.parse(row.body) as { tails?: unknown }).tails;
    } catch {
      continue;
    }
    /* THE ACCOUNT AND THE TAIL, NOT THE FIELD. */
    const same = Array.isArray(tails) && tails.some((t: Partial<Tail> | null) => t?.digits === tail.digits && t.row === tail.row);
    if (same && settledAnswer(sql, row.id) === 'accept') return true;
  }
  /* AND A TAIL QUESTION ANSWERED WITH THAT ROW, at any door: the answer is the row's id. */
  const asked = sql.all<{ id: string }>(
    `SELECT id FROM suggestion WHERE body_kind = 'options' AND status = 'resolved' AND resolved_as = 'addressed'
       AND json_valid(body) AND json_extract(body, '$.tail.digits') = ? ORDER BY opened_at DESC LIMIT ?`,
    tail.digits,
    CONFIRMS_READ,
  );
  return asked.some((q) => settledAnswer(sql, q.id) === tail.row);
}

/**
 * THE ADDRESS MAIL IS FROM, WHEN IT STILL NEEDS A PERSON'S YES BEFORE ITS MONEY IS WRITTEN, or `null`.
 *
 * `verified` SAYS THE SENDER IS WHO ITS `From:` SAYS, AND NOT THAT IT IS THE BANK. A mailbox address is handed to third
 * parties by design and a pattern's `match:` may read only the words. Measured through the real mail door with the Card
 * alerts file: `From: bot@evil.example`, signed correctly by `evil.example`, whose body said "Your card ending 4471 was
 * debited GBP 9999.00 at ATTACKER LTD", was stored `matched` and wrote that debit to the ledger at `exact`, with nobody
 * asked. The forgeries DKIM alignment closes are the ones that claim somebody else's domain; this one claims nobody's.
 *
 * SO A VERIFIED MAIL IS FILED ONLY FROM AN ADDRESS SOMEBODY VOUCHED FOR: a pattern whose `match:` names that sender
 * exactly, on the fields read from the address and never its display name (`namesSender`), or a yes a person gave
 * (`confirmedSender`). Anything else is one question, joined per address so a flood is one card, and the next mail
 * from an address he said yes to files straight away.
 *
 * ADDRESS AND NOT DOMAIN, because a person forwards their own mail: a yes to `me@gmail.com` is no yes to all of Gmail.
 *
 * ONLY WHAT A HOST CHECKED (`verified: true`). A webhook's token or signature names its one sender, and `undefined` is a
 * caller the record already authenticated, as `Arrival.verified` says.
 */
function senderToAsk(deps: IngestDeps, arrival: Arrival, matched: IngestDecl, headers: Record<string, string>): string | null {
  if (arrival.channel !== 'email' || arrival.verified !== true) return null;
  const { address } = senderOf(headers.from);
  /* NO ADDRESS CANNOT BE VERIFIED AT THE DOOR, and a host that said so anyway gets the safe answer. */
  if (address === '') return 'an unknown sender';
  if (matched.match !== undefined && namesSender(matched.match)) return null;
  return confirmedSender(deps.sql, address, matched.ingest) ? null : address;
}

/**
 * Whether a `match:` itself says who the mail is from: `from`, `from_address` or `from_domain` exactly, reached only through
 * `all`. `from is` holds the whole line, every domain of which the door aligned with the signer.
 *
 * NOT `contains`: `From: "hsbc.example" <bot@evil.example>` signed by `evil.example` is verified, and `from contains
 * hsbc.example` is true of it, and `hsbc.evil.example` contains `hsbc`. And not under `any` or `none`, which do not say
 * every mail it reads is from there.
 */
export function namesSender(match: Predicate): boolean {
  const node = match as { all?: unknown; field?: unknown; is?: unknown; in?: unknown };
  if (Array.isArray(node.all)) return node.all.some((one) => one !== null && typeof one === 'object' && namesSender(one as Predicate));
  return (node.field === 'from_address' || node.field === 'from_domain' || node.field === 'from') && (typeof node.is === 'string' || Array.isArray(node.in));
}

/**
 * Whether a person has said yes to mail from this address: by accepting a rowset that waited on it, by accepting the
 * pattern drawn from its mail, or, for a record older than this question, by a message from it already filed by a pattern.
 * A rejection, and a question reopened and answered no, read as not confirmed, as `confirmedTail` reads them.
 */
export function confirmedSender(sql: Sql, address: string, ingest: string): boolean {
  const answered = sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM suggestion WHERE body_kind = 'rowset' AND opened_by LIKE 'ingest:%' AND status = 'resolved'
       AND resolved_as = 'addressed' AND json_valid(body) AND json_extract(body, '$.sender') = ? ORDER BY opened_at DESC LIMIT ?`,
    address,
    CONFIRMS_READ,
  );
  if (answered.some((row) => settledAnswer(sql, row.id) === 'accept')) return true;
  const from = (headers: string | null): string => senderOf(((parsed(headers) ?? {}) as Record<string, string>).from).address;
  for (const q of patternAsked(sql, ingest)) {
    if (!accepted(sql, q)) continue;
    const drawn = [...stringsOf(q.body.samples), ...stringsOf(q.body.joined)];
    const rows = sql.all<{ headers: string | null }>('SELECT headers FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(drawn));
    if (rows.some((r) => from(r.headers) === address)) return true;
  }
  /* FILED BEFORE THIS QUESTION EXISTED, or after a yes: the arrival `matched` and has a receipt naming the rows it wrote. */
  return sql
    .all<{ headers: string | null }>(
      `SELECT x.headers AS headers FROM inbox_raw x JOIN ingest_receipt r ON r.raw_id = x.id
        WHERE x.channel = 'email' AND x.state = 'matched' AND instr(lower(x.headers), ?) > 0 ORDER BY x.rowid DESC LIMIT ?`,
      address,
      CONFIRMS_READ,
    )
    .some((r) => from(r.headers) === address);
}

/** What the question says about a new sender: its address, only where it reads as one, and what a yes does. */
function senderAsked(words: Words, sender: string): { question: string; context: string } {
  const named = /^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(sender) ? sender : 'an unknown sender';
  return {
    question: fit(words, [(s, l, n) => `Add ${s} to ${l}? It is from ${n}, which is new here.`], named),
    context: cutTo(`Anyone can sign mail from their own address. Say yes only if ${named} is yours or your bank's, and later mail from it is added straight away.`, 280),
  };
}

/** The option a person picked on a question, from the decision its latest `resolve` follows, or `null`. */
function settledAnswer(sql: Sql, suggestion: string): string | null {
  return (
    sql.one<{ answer: string }>(
      `SELECT d.answer AS answer FROM event r
         JOIN event e ON e.rowid = r.rowid - 1 AND e.kind = 'decide' AND e.target LIKE 'decision:%'
         JOIN decision d ON d.id = substr(e.target, 10)
        WHERE r.kind = 'resolve' AND r.target = ? AND r.to_v = 'addressed'
        ORDER BY r.rowid DESC LIMIT 1`,
      `suggestion:${suggestion}`,
    )?.answer ?? null
  );
}

/**
 * What the reason calls the row a tail landed on: its title, as its list declares it, or its list's word for one of
 * its rows and the digits, "the account ending 1234" where it declares none.
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
  /* "THE ROW ENDING 1234" WAS THE RECORD'S WORD, NOT A PERSON'S. A list that declares no word for one of its rows is
     one a tail was printed for, and digits printed behind stars are an account's or a card's, so it is that. */
  const one = typeof list.one === 'string' && list.one.trim() !== '' ? list.one.trim() : 'account';
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
  if ('lookup' in form) return lookupTable(deps, form.lookup).map((r) => [r.value, r.id] as const);
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
  /* A CURRENCY READ OFF ANOTHER FIELD'S ROW HAS BEEN FILLED IN BY NOW (`currencyFilled`); one that could not be is no
     fallback at all, so only a code the text prints is read. */
  if ('money' in form) return n.money(anchored, typeof form.money.currency === 'string' ? form.money.currency : undefined) as Json[];
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
    /* THE CURRENCY'S OWN EXPONENT, from `EXPONENT` (`exponent.ts`) and not from `Intl`. `02 §3` rule 1 has the
       argument: `Intl` carries CLDR, which is what a country expects to SEE, and the table carries
       ISO 4217's minor unit, which is what a record STORES. It governs BOTH halves: a lone separator followed by three digits is grouping
       *unless the exponent is 3*, so `KWD 1.250` is one and a quarter dinars rather than one
       thousand two hundred and fifty; and the scale is `10 ** exponent`, so `JPY 1250` is 1250 yen
       and not 125,000 of a subunit that does not exist. Both were hard-coded at two. */
    const declared = form.money.currency;
    if (typeof declared !== 'string' || declared === '') return null;
    const exp = exponentOf(declared);
    const n = number(anchored, undefined, exp);
    if (n === null) return null;
    /* A VALUE THAT WOULD NEED ROUNDING IS REFUSED — 07 §3, and it is the difference between an
       extractor that is wrong and one that says it cannot read this. `USD 10.555` is not 1056 minor
       units; it is a payload whose pattern does not fit, and writing the rounded figure puts a
       number nobody sent into a ledger. */
    const minor = n * 10 ** exp;
    if (Math.abs(minor - Math.round(minor)) > 1e-6) return null;
    return { amount: Math.round(minor), currency: declared };
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
    return lookupTable(deps, form.lookup).find((r) => r.value === said)?.id ?? null;
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
export { EXPONENT, exponentOf, moneyText } from './exponent.ts';

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

/** The arrival a `match:` is a question about, as `runArrival` offers it, before anything is stored. */
function arrivalFields(channel: Channel, headers: Record<string, string>, body: string, ts: string): Record<string, unknown> {
  const sender = senderOf(headers.from);
  return {
    channel,
    from: headers.from ?? '',
    from_name: sender.name,
    from_address: sender.address,
    from_domain: sender.domain,
    to: headers.to ?? '',
    subject: headers.subject ?? '',
    body,
    state: 'untriaged',
    ts,
  };
}

/** The fields a mail's words are in, where a pattern's literal says what it looks for. */
const WORDED = new Set(['body', 'subject', 'from', 'from_name', 'from_address', 'from_domain']);

/**
 * What a record's mail patterns look for, for a door that reads mail somewhere other than the forwarding address
 * (Connect Google reads it in Gmail): `hints`, the words a mail one of them reads would carry, so the whole of a mail is
 * fetched only when its sender, subject or first lines carry one; and `take`, the pattern that would take a mail, read
 * by the same `match:` and the same fields `runArrival` offers it, so only a mail a pattern reads is handed to the mail
 * door, which then reads it as a forwarded one, by name.
 *
 * A HINT IS A LITERAL THE PATTERN WANTS, never one it rules out (`none:`), and each word of four letters or more of the
 * pack that declares it (`hsbc` of `bank-hsbc-eg`), which a bank's sending domain carries. A PATTERN WITH NO `match:`
 * READS ANY MAIL, so it says nothing about which mail is a pattern's, and is left out of both: Connect Google would
 * otherwise hand every mail it reads to the mail door, and the door would read each for who and what.
 */
export function mailPatterns(ingests: readonly IngestDecl[], ts: string): { hints: string[]; take: (mail: { headers: Record<string, string>; body: string }) => string | null } {
  const mail = ingests.filter((i) => i.channel === 'email' && i.match !== undefined);
  const hints = new Set<string>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return void node.forEach(walk);
    const n = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(n)) {
      if (key === 'none' || key === 'not') continue;
      if (key === 'all' || key === 'any') walk(value);
    }
    if (typeof n.field === 'string' && WORDED.has(n.field))
      for (const op of ['contains', 'starts', 'ends', 'is'] as const) {
        const said = n[op];
        if (typeof said === 'string' && said.trim().length >= 4) hints.add(said.trim().toLowerCase());
      }
  };
  for (const i of mail) {
    walk(i.match);
    const pack = (i as { pack?: unknown }).pack;
    if (typeof pack === 'string') for (const word of pack.toLowerCase().split(/[^a-z0-9]+/)) if (word.length >= 4) hints.add(word);
  }
  return {
    hints: [...hints],
    take: (m) => {
      const fields = arrivalFields('email', lower(m.headers), m.body, ts);
      return mail.find((i) => evaluate(i.match!, fields, INBOX_RAW))?.ingest ?? null;
    },
  };
}

/**
 * Who a message says it is from, in three parts: the name a person reads, the address, and the address's domain.
 *
 * THREE PARTS AND NOT ONE, because the record meets each differently. The address is a person's key, the domain is an
 * organisation's, and the name is only ever what a row is called, never what it is matched on. `from` alone made every
 * reader parse the header again, and `rule.meet-senders` met `"Sara Ali" <sara@acme.example>` as a person whose email was
 * that whole string.
 *
 * THE FORMS A MAIL SERVER SENDS: `Name <address>`, `"Last, First" <address>`, a bare address, the old `address (Name)`,
 * and a name in RFC 2047 words (`=?UTF-8?B?…?=`), which is how a name in Arabic arrives. Only the first address is read,
 * and a name that is the address again is no name. A header with no address in it answers three empty strings rather
 * than a guess, and the address and domain are lower-cased, as every key the record keeps for one is.
 */
export type Sender = { name: string; address: string; domain: string };

export function senderOf(header: string | undefined): Sender {
  /* THE FIRST MAILBOX, split at the commas outside quotes, so `"Ali, Sara" <sara@…>` stays one name; and a piece with
     no address in it is the front of the next one's name, so the unquoted `Ali, Sara <sara@…>` a mail client also
     sends is still "Ali, Sara" and not "Sara". A header that is not text is no sender, never a throw out of `arrive`. */
  const parts = splitMailboxes(typeof header === 'string' ? header : '');
  const first = parts.findIndex((part) => part.includes('@'));
  const text = first === -1 ? '' : parts.slice(0, first + 1).join(',').trim();
  const angled = /<\s*(?:mailto:)?([^<>\s@]+@[^<>\s@]+?)\s*>/i.exec(text);
  const bare = angled === null ? /(?:^|[\s;:("])(?:mailto:)?([^\s<>"(),;:@]+@[^\s<>"(),;:@]+)/i.exec(text) : null;
  const found = (angled?.[1] ?? bare?.[1] ?? '').replace(/\.$/, '').toLowerCase();
  if (found === '') return { name: '', address: '', domain: '' };
  const named = angled !== null ? text.slice(0, angled.index) : (/\(([^()]*)\)/.exec(text.slice((bare?.index ?? 0) + (bare?.[0].length ?? 0)))?.[1] ?? '');
  const unquoted = named.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\(.)/g, '$1');
  const name = decodeWords(unquoted).replace(/\s+/g, ' ').trim().replace(/^['"]+|['"]+$/g, '').trim();
  return { name: name.toLowerCase() === found ? '' : name, address: found, domain: found.slice(found.lastIndexOf('@') + 1) };
}

/**
 * RFC 2047's encoded words decoded, in a header's display name: `=?charset?B?…?=` and `=?charset?Q?…?=`. Whitespace
 * between two encoded words is not part of the name, as the RFC says. A charset this runtime cannot decode, or a word
 * that is not well formed, is left as it was written rather than guessed at.
 */
function decodeWords(text: string): string {
  const WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
  return text.replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)/g, '$1').replace(WORD, (word, charset: string, how: string, data: string) => {
    try {
      const bytes =
        how.toUpperCase() === 'B'
          ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
          : Uint8Array.from(
              data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})|[\s\S]/g, (c, hex: string | undefined) => (hex === undefined ? c : String.fromCharCode(parseInt(hex, 16)))),
              (c) => c.charCodeAt(0),
            );
      return new TextDecoder(charset.split('*')[0]!.trim().toLowerCase()).decode(bytes);
    } catch {
      return word;
    }
  });
}

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
