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

export const CHANNELS = ['email', 'webhook', 'pull', 'paste', 'api'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The three, worst first — which is the order they are compared in. */
export const CONFIDENCES = ['needs-review', 'proposed', 'exact'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** The lower of two confidences. A ceiling can only ever bring one down. */
const worse = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCES.indexOf(a) <= CONFIDENCES.indexOf(b) ? a : b;

/** The nine, and the anchors any of them may carry. */
export type Extractor =
  | { after: string }
  | { before: string }
  | { between: [string, string] }
  | { text: { after?: string; before?: string; between?: [string, string] } }
  | { money: { currency?: string; sep?: string; after?: string; before?: string; between?: [string, string] } }
  | { date: { format: string; after?: string; before?: string; between?: [string, string] } }
  | { int: { after?: string; before?: string; between?: [string, string] } }
  | { decimal: { sep?: string; after?: string; before?: string; between?: [string, string] } }
  | { enum: { map: Record<string, string>; after?: string; before?: string; between?: [string, string] } }
  | { lookup: { register: string; by: string; after?: string; before?: string; between?: [string, string] } };

export type IngestDecl = {
  ingest: string;
  channel: Channel;
  /** Over the ARRIVAL — `from`, `to`, `subject`, `body` — never over a register. */
  match?: Predicate;
  extract: Record<string, Extractor>;
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

/** The arrival, as a set of fields a predicate can be about. */
const ARRIVAL: Schema = {
  register: 'arrival',
  fields: { from: { type: 'text' }, to: { type: 'text' }, subject: { type: 'text' }, body: { type: 'text' }, channel: { type: 'text' } },
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
    const fields: Record<string, unknown> = {
      channel: arrival.channel,
      from: headers.from ?? '',
      to: headers.to ?? '',
      subject: headers.subject ?? '',
      body,
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

    for (const [field, form] of Object.entries(matched.extract)) {
      const value = extract(deps, form, text);
      if (value === null) missed.push(field);
      else extracted[field] = value;
    }

    /* THE CEILING IS PART OF THE DECLARATION AND THE OUTCOME IS PART OF THE PAYLOAD, and the lower of
       the two is what happens. Checked here rather than only at install, because a declaration can
       arrive through a `.dog` import as well as through the linter. */
    const ceiling = matched.writes.confidence ?? 'exact';
    if (!(CONFIDENCES as readonly string[]).includes(ceiling)) {
      /* THE BYTES STAY. This returned before `store` had run, and the whole call sits in a savepoint
         — so a declaration carrying `confidence: high`, which nothing validates at install and which
         a `.dog` import or a pack installs cleanly, threw the arrival away entirely. `inbox_raw` got
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

    /* A FIELD THE PATTERN COULD NOT READ IS `needs-review`, and everything else this vocabulary can
       do reads cleanly or returns nothing — there is no combinator here that chooses or defaults, so
       there is no honest third outcome to derive. */
    const confidence = worse(missed.length ? 'needs-review' : 'exact', ceiling);

    /* A FAILURE DOWNGRADES RATHER THAN DISCARDS. The bytes stay, the reason is on them, and the
       extraction goes in front of a person as a `rowset` they can accept — which is the only thing
       that makes a pattern nobody has approved yet safe to leave switched on. */
    if (confidence !== 'exact') {
      const state = confidence === 'proposed' ? 'proposed' : 'review';
      const reason = missed.length
        ? `${matched.ingest} could not read ${missed.join(', ')} out of this one.`
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
  const anchored = slice(form as Record<string, unknown>, text);
  if (anchored === null) return null;

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

/** The anchors, which any form may carry. `null` when an anchor is not in the text at all. */
function slice(form: Record<string, unknown>, text: string): string | null {
  const inner = (Object.values(form)[0] ?? {}) as Record<string, unknown>;
  const spec = 'after' in form || 'before' in form || 'between' in form ? form : inner;

  let out = text;
  if (Array.isArray(spec.between)) {
    const [a, b] = spec.between as [string, string];
    const from = out.indexOf(a);
    if (from < 0) return null;
    const rest = out.slice(from + a.length);
    const to = rest.indexOf(b);
    return to < 0 ? null : rest.slice(0, to);
  }
  if (typeof spec.after === 'string') {
    const at = out.indexOf(spec.after);
    if (at < 0) return null;
    out = out.slice(at + spec.after.length);
  }
  if (typeof spec.before === 'string') {
    const at = out.indexOf(spec.before);
    if (at < 0) return null;
    out = out.slice(0, at);
  }
  return out;
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
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

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
