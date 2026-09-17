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
import { jsonPath, evaluate, type Predicate, type Schema } from '@braindog/where';

import type { Entry, Json } from './index.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';
import { sparkMayWrite } from './spark.ts';
import { mapField, parseAnswer, type Mapping } from './map.ts';

export const CHANNELS = ['email', 'webhook', 'pull', 'paste', 'api'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The three, worst first — which is the order they are compared in. */
export const CONFIDENCES = ['needs-review', 'proposed', 'exact'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** The lower of two confidences. A ceiling can only ever bring one down. */
const worse = (a: Confidence, b: Confidence): Confidence =>
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
  | { money: { currency?: string; sep?: string; after?: string; before?: string; between?: readonly [string, string] } }
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
 * FOUR OF THE SIX. `ambiguous` and `invalid` belong to a scanner that returns every match and to a
 * field-shape check against `34 §3`; this runtime has neither, and a word it can never emit would be
 * a promise in a type. The four it can tell apart are the four below.
 */
export type FieldOutcome = 'exact' | 'chosen' | 'defaulted' | 'missing';

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
  extract: Record<string, Extractor>;
  /**
   * A JSON answer read by paths (`map.ts`, `43 §4.5`), in place of `extract`. A declaration carries one or the
   * other, and `declare` refuses both.
   */
  map?: Record<string, Mapping>;
  writes: {
    register: string;
    /**
     * A CEILING, NEVER A PROMISE. The extraction's own outcome is the other half, and the lower of
     * the two is what happens. Default `exact`; a pattern a model proposed files at `needs-review`
     * until a person has looked at what it would have written.
     */
    confidence?: Confidence;
    /**
     * What makes two arrivals the same thing.
     *
     * WITHOUT ONE, `on_conflict` HAS NOTHING TO COMPARE. A redelivery of the same bytes is already
     * caught by the raw's own hash; this is for the different email about the same invoice.
     */
    key?: string[];
  };
  on_conflict?: 'skip' | 'update' | 'new';
};

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

export type IngestDeps = {
  sql: Sql;
  ingests: () => IngestDecl[];
  schemaOf: (register: string) => Schema | null;
  write: (register: string, spoken: string | null, patch: Record<string, unknown>, actor: string) => Result<Entry>;
  find: (register: string, by: string, value: string) => string | null;
  mint: () => string;
  /** `SG<n>` for the suggestion an unwritten extraction opens. */
  allocate: (name: string) => number;
  nowMs: number;
};

/**
 * The arrival, as a set of fields a predicate can be about.
 *
 * SEVEN, WHICH IS WHAT `34 §1.9` PUBLISHES, AND THIS HELD FIVE. `declare.ts` enforces the seven
 * exactly and its refusal recites them, so `match: { field: ts, after: -7d }` and
 * `match: { field: state, is: untriaged }` installed cleanly and matched nothing, for ever:
 * `evaluate` answers `false` to whatever `compile` would refuse, and `compile` refuses a field that
 * is not in the schema it is handed. Which is the failure the header above `MATCH_FIELDS` in
 * `declare.ts` already names in its own words: *"an ingest that never fires and an ingest that
 * fires correctly look identical from the outside until somebody notices a month of arrivals
 * sitting untriaged"*. The fix that sentence stands over landed on the UNKNOWN names and never on
 * the two published ones. Scoping an email rule to the last week is an ordinary thing to write, and
 * the cost of it landing here rather than at install is days of somebody's inbox.
 *
 * `state` IS AN `enum` OVER `inbox_raw`'s OWN SEVEN, not a `text`, because the type is what decides
 * which operators the grammar allows on it: an `enum` takes `is`, `not`, `in` and `not_in`, and a
 * `text` would also take `gt` and `before`, which are not questions about a state. `ts` is an
 * `instant` for the same reason and the opposite effect: `before` and `after` are the operators a
 * temporal scope is written with, and on a `text` the grammar refuses both.
 *
 * EXPORTED, BECAUSE THE INSTALL CHECK HAS TO ASK THE SAME QUESTION. `declare.ts` keeps its own list
 * of the seven names and compares against it by hand, which is how the two came to disagree in the
 * first place, and a hand-kept list cannot answer the operator half of `34 §1.9` at all. One schema
 * read by both is the only arrangement under which what installs and what fires cannot drift.
 */
export const ARRIVAL: Schema = {
  register: 'arrival',
  fields: {
    from: { type: 'text' },
    to: { type: 'text' },
    subject: { type: 'text' },
    body: { type: 'text' },
    channel: { type: 'text' },
    /* `0001_kernel.ts`'s own CHECK list, in its own order. One list in two places is two lists the
       day somebody adds a state to the table, so this is the DDL's and not a second opinion. */
    state: { type: 'enum', values: ['untriaged', 'matched', 'skipped', 'review', 'proposed', 'ignored', 'erased'] },
    ts: { type: 'instant' },
  },
};

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
     * `ARRIVAL` above for what that cost. Both halves have to be here: a field in the schema with no
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
      .find((i) => i.match === undefined || evaluate(i.match, fields, ARRIVAL));

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

    const text = `${headers.subject ?? ''}\n${body}`;
    const extracted: Record<string, unknown> = {};
    const missed: string[] = [];

    /* THE OUTCOME PER FIELD, not only the value — `43 §5.1` step 7 files a row by the worst of them
       and this loop used to keep the value alone. */
    const soft: string[] = [];

    /* A MAP READS THE BODY AS JSON, once, and each field by its path; an extract reads the text with anchors. The
       outcomes are the same words, so everything below files a mapped row exactly as it files an extracted one. */
    const reads: [string, () => { value: Json | null; outcome: string }][] =
      matched.map !== undefined && matched.extract === undefined
        ? (() => {
            const root = parseAnswer(body);
            const fields = deps.schemaOf(matched.writes.register)?.fields ?? {};
            return Object.entries(matched.map).map(([field, mapping]) => [
              field,
              () => mapField({ exponent: exponentOf, day }, mapping, root, at, fields[field]?.type),
            ] as [string, () => { value: Json | null; outcome: string }]);
          })()
        : Object.entries(matched.extract ?? {}).map(([field, form]) => [field, () => resolve(deps, form, text)]);
    for (const [field, read] of reads) {
      const got = read();
      if (got.value === null) missed.push(field);
      else {
        extracted[field] = got.value;
        if (got.outcome !== 'exact') soft.push(field);
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
        register: matched.writes.register,
        rows: [extracted],
        question: `${reason} Accept it into ${matched.writes.register}, or fix the pattern.`,
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
    const key = matched.writes.key ?? [];
    /* A REFUSAL IS A VALUE HERE, even for the backstop. `jsonPath` throws on an id that never went
       through the install check, and this is a `Result`-returning method — an exception crossing it
       is the one thing this package promises does not happen. */
    const wrongId = key.find((f) => typeof f !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(f));
    if (wrongId !== undefined)
      return no<Arrived>('DECLARATION_INVALID', `${matched.ingest} names ${JSON.stringify(wrongId)} as a field, and it is not one.`, {
        at: 'writes.key',
      });
    const path = (f: string): string => {
      const type = deps.schemaOf(matched.writes.register)?.fields[f]?.type;
      return `json_extract(fields, '${jsonPath(f)}${type === 'money' ? '.amount' : type === 'quantity' ? '.value' : ''}')`;
    };
    const bound = (f: string): string | number | null => {
      const v = extracted[f];
      if (v === undefined || v === null) return null;
      if (typeof v === 'object') return (v as { amount?: number; value?: number }).amount ?? (v as { value?: number }).value ?? null;
      return typeof v === 'number' ? v : String(v);
    };
    const existing = key.length
      ? deps.sql.one<{ id: string; seq: number }>(
          `SELECT id, seq FROM entry WHERE register = ? AND deleted_at IS NULL AND ${key
            .map((f) => `${path(f)} = ?`)
            .join(' AND ')} LIMIT 1`,
          matched.writes.register,
          ...key.map(bound),
        )
      : undefined;

    const conflict = matched.on_conflict ?? 'skip';
    if (existing && conflict === 'skip') {
      const reason = `${existing.seq === null ? existing.id : `${matched.writes.register}#${existing.seq}`} already says this.`;
      store('skipped', reason);
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason });
    }

    note('match', `ingest:${matched.ingest}`, `inbox_raw:${raw}`, 'inbox_raw', 'exact');

    const wrote = deps.write(
      matched.writes.register,
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
      const reason = `${matched.writes.register} refused what ${matched.ingest} read: ${fixOf(wrote)}`;
      store('review', reason);
      const suggestion = openRowset(deps, at, {
        ingest: matched.ingest,
        register: matched.writes.register,
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
    const at = got[n - 1];
    return at === undefined ? missing : { value: at, outcome: 'exact' };
  }

  /* `default` KEEPS `of`'s OUTCOME WHEN `of` ANSWERED. Only the fallback is `defaulted`; a `first`
     inside a `default` that chose is still a choice, and flattening both to one word would file an
     ordinary read at `proposed` every time somebody wrote a fallback for it. */
  if ('default' in form) {
    const got = resolveAt(deps, form.default.of, text, depth + 1);
    if (got.value !== null) return got;
    return { value: form.default.value, outcome: 'defaulted' };
  }

  const got = candidatesAt(deps, form, text, depth);
  return got.length === 0 ? missing : { value: got[0]!, outcome: 'exact' };
}

/**
 * Every candidate one form yields over one text, in text order — `43 §5.3`'s candidate contract.
 *
 * THE CANDIDATES COME FROM THE ANCHOR, AND THAT IS THIS RUNTIME'S CEILING. `43 §5.4`'s scanners
 * yield every match INSIDE a slice as well: `{ money: {} }` over "EGP 10 and EGP 20" is two
 * candidates there and one here, because this file parses the first number of a slice rather than
 * walking it. What it does implement is the other half and the half `nth` is usually written for —
 * each occurrence of the anchor is a slice, and the slices' values concatenate. So
 * `nth: { n: 2, of: { money: { after: 'EGP', currency: 'EGP' } } }` reads the second amount, and a
 * bare form still reads the first, byte for byte what it read before.
 *
 * A COMBINATOR HAS AT MOST ONE CANDIDATE. It takes a form's candidates and returns one value, so
 * `nth: { n: 2, of: { first: [...] } }` is nothing — correctly, and for the same reason the
 * specification counts combinators separately.
 */
function candidatesAt(deps: IngestDeps, form: Extractor, text: string, depth: number): Json[] {
  if (form === null || typeof form !== 'object' || depth > NESTING) return [];
  if (COMBINATORS.some((key) => key in form)) {
    const got = resolveAt(deps, form, text, depth);
    return got.value === null ? [] : [got.value];
  }
  const out: Json[] = [];
  for (const anchored of slices(form as Record<string, unknown>, text)) {
    const got = value(deps, form, anchored);
    if (got !== null) out.push(got);
  }
  return out;
}

/** One of the ten value forms over one slice. The anchors are already applied. */
function value(deps: IngestDeps, form: Extractor, anchored: string): Json | null {
  if ('after' in form || 'before' in form || 'between' in form) return anchored.trim() || null;
  if ('text' in form) return anchored.replace(/\s+/g, ' ').trim() || null;

  if ('money' in form) {
    /* THE NUMBER IS PARSED AND THE CURRENCY IS DECLARED. Reading a currency out of a payload means
       guessing from a symbol, and `$` is at least five currencies — so the pattern says which, and a
       pattern that does not is a pattern that cannot be trusted with money. */
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
    const n = number(anchored, form.money.sep, exp);
    if (n === null) return null;
    /* A VALUE THAT WOULD NEED ROUNDING IS REFUSED — 07 §3, and it is the difference between an
       extractor that is wrong and one that says it cannot read this. `USD 10.555` is not 1056 minor
       units; it is a payload whose pattern does not fit, and writing the rounded figure puts a
       number nobody sent into a ledger. */
    const minor = n * 10 ** exp;
    if (Math.abs(minor - Math.round(minor)) > 1e-6) return null;
    return { amount: Math.round(minor), currency: form.money.currency };
  }

  if ('date' in form) return day(anchored, form.date.format);

  if ('int' in form) {
    const n = number(anchored);
    return n === null || !Number.isInteger(n) ? null : n;
  }
  if ('decimal' in form) {
    const n = number(anchored, form.decimal.sep);
    return n;
  }
  if ('enum' in form) {
    /* THE LONGEST LITERAL FIRST, so a map with both `paid` and `unpaid` in it does not read "unpaid"
       as "paid" because that key happened to be tried first. */
    for (const literal of Object.keys(form.enum.map).sort((a, b) => b.length - a.length))
      if (anchored.toLowerCase().includes(literal.toLowerCase())) return form.enum.map[literal] ?? null;
    return null;
  }
  if ('lookup' in form) {
    /* THE FIRST TOKEN, not the rest of the payload. `after: 'card ending '` leaves `4471 was
       debited EGP…`, and looking THAT up finds nothing — quietly, and the arrival goes to review
       for a reason that is about the anchor rather than about the record. A key is one word; `text`
       is the extractor for a phrase, and it is why that one usually carries a `between`. */
    const said = /\S+/.exec(anchored)?.[0]?.replace(/[.,;:]+$/, '') ?? '';
    return said ? deps.find(form.lookup.register, form.lookup.by, said) : null;
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
 * that makes the change safe to make under money: every slice is a SUFFIX of the one before it, so a
 * `before` or a closing `B` that is missing from the first slice is missing from all of them. An
 * occurrence that yields nothing can therefore only be the tail, and skipping it rather than ending
 * the walk is a rule that can change candidate 2 onward and never candidate 1.
 */
function slices(form: Record<string, unknown>, text: string): string[] {
  const inner = (Object.values(form)[0] ?? {}) as Record<string, unknown>;
  const spec = 'after' in form || 'before' in form || 'between' in form ? form : inner;

  /* AN EMPTY LITERAL IS NOT AN ANCHOR. `indexOf('')` is 0 at every index, so walking one would cut
     the text into one slice per character; `43 §4.3` requires a literal of at least one character
     and `declare` refuses a shorter one. Treated here as no anchor at all, which is what the
     single-slice walk did with it. */
  const literal = (at: unknown): string | null => (typeof at === 'string' && at.length > 0 ? at : null);

  const between = Array.isArray(spec.between) ? (spec.between as [string, string]) : null;
  if (between !== null) {
    const [a, b] = between;
    const out: string[] = [];
    if (literal(a) === null) return out;
    for (let at = text.indexOf(a); at >= 0; at = text.indexOf(a, at + a.length)) {
      const rest = text.slice(at + a.length);
      const to = rest.indexOf(b);
      /* AN `A` WITH NO `B` YIELDS NOTHING AND DOES NOT END THE WALK — `43 §4.3`, verbatim. */
      if (to >= 0) out.push(rest.slice(0, to));
    }
    return out;
  }

  const after = literal(spec.after);
  const before = literal(spec.before);
  const cut = (slice: string): string | null => {
    if (before === null) return slice;
    const at = slice.indexOf(before);
    return at < 0 ? null : slice.slice(0, at);
  };

  if (after !== null) {
    const out: string[] = [];
    for (let at = text.indexOf(after); at >= 0; at = text.indexOf(after, at + after.length)) {
      const slice = cut(text.slice(at + after.length));
      if (slice !== null) out.push(slice);
    }
    return out;
  }
  const whole = cut(text);
  return whole === null ? [] : [whole];
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
     differs from the others is the decimal point and the rest are grouping. A declared `sep` still
     wins where a caller supplied one, because a caller who knows the locale knows better than the
     digits do. */
  const decimalAt = ((): number | null => {
    if (marks.length === 0) return null;
    const last = marks.at(-1)!;
    if (sep !== undefined) return last[0] === sep ? null : last.index;
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
export const DATE_FORMATS: readonly string[] = Object.freeze(Object.keys(FORMATS));

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
