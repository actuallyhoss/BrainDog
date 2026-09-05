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
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { evaluate, type Predicate, type Schema } from '@braindog/where';

import type { Entry, Json } from './index.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';

export const CHANNELS = ['email', 'webhook', 'pull', 'paste', 'api'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The nine, and the anchors any of them may carry. */
export type Extractor =
  | { after: string }
  | { before: string }
  | { between: [string, string] }
  | { text: { after?: string; before?: string; between?: [string, string] } }
  | { money: { currency?: string; after?: string; before?: string; between?: [string, string] } }
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
    confidence?: 'exact' | 'proposed' | 'needs-review';
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
  state: 'matched' | 'untriaged' | 'review' | 'skipped';
  wrote: string[];
  reason?: string;
};

export type IngestDeps = {
  sql: Sql;
  ingests: () => IngestDecl[];
  schemaOf: (register: string) => Schema | null;
  write: (register: string, spoken: string | null, patch: Record<string, unknown>, actor: string) => Result<Entry>;
  find: (register: string, by: string, value: string) => string | null;
  mint: () => string;
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

    /* A FAILURE DOWNGRADES RATHER THAN DISCARDS. The bytes stay, the reason is on them, and the
       person who wrote the pattern is the only one who can fix it — which they cannot do if the
       record decided quietly that this one did not count. */
    if (missed.length) {
      const reason = `${matched.ingest} could not read ${missed.join(', ')} out of this one.`;
      store('review', reason);
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'review', wrote: [], reason });
    }

    const key = matched.writes.key ?? [];
    const existing = key.length
      ? deps.sql.one<{ id: string; seq: number }>(
          `SELECT id, seq FROM entry WHERE register = ? AND deleted_at IS NULL AND ${key
            .map((f) => `json_extract(fields, '$.${f}') = ?`)
            .join(' AND ')} LIMIT 1`,
          matched.writes.register,
          ...key.map((f) => String(extracted[f] ?? '')),
        )
      : undefined;

    const conflict = matched.on_conflict ?? 'skip';
    if (existing && conflict === 'skip') {
      const reason = `${matched.writes.register}#${existing.seq} already says this.`;
      store('skipped', reason);
      return ok<Arrived>({ raw, ingest: matched.ingest, state: 'skipped', wrote: [], reason });
    }

    store('matched', null);

    const wrote = deps.write(
      matched.writes.register,
      existing && conflict === 'update' ? `${matched.writes.register}#${existing.seq}` : null,
      extracted,
      `ingest:${matched.ingest}`,
    );
    /* ALL ROWS OR NONE, per arrival. The transaction is the record's, so a refusal here rolls the
       raw back with it — and the caller gets the sentence rather than a raw row whose receipt says
       nothing was written and cannot say why. */
    if (!wrote.ok) return { ok: false as const, refusal: wrote.refusal };

    /* ONE RECEIPT PER ARRIVAL, its `wrote` filled by the record. A skipped arrival has none, which
       is what makes "what did this actually do" answerable by the row's existence. */
    deps.sql.exec(
      'INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, ?, ?, ?, ?)',
      deps.mint(),
      raw,
      matched.ingest,
      JSON.stringify([wrote.value.id]),
      matched.writes.confidence ?? 'exact',
      at,
    );

    return ok<Arrived>({ raw, ingest: matched.ingest, state: 'matched', wrote: [wrote.value.id] });
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
    const n = number(anchored);
    if (n === null || !form.money.currency) return null;
    return { amount: Math.round(n * 100), currency: form.money.currency };
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
function number(text: string, sep = ','): number | null {
  const m = /-?\d[\d\s.,']*/.exec(text);
  if (!m) return null;
  /* THE THOUSANDS SEPARATOR IS DECLARED AND THE DECIMAL POINT IS WHAT IS LEFT. Guessing between
     `1.234` as one thousand and as one-and-a-bit is how an extractor is wrong by a thousand times
     on a payload nobody reads twice. */
  const cleaned = m[0].replace(/\s|'/g, '').split(sep).join('');
  const n = Number(sep === '.' ? cleaned.replace(',', '.') : cleaned);
  return Number.isFinite(n) ? n : null;
}

const FORMATS: Record<string, RegExp> = {
  'DD/MM/YY': /(\d{2})\/(\d{2})\/(\d{2})/,
  'DD/MM/YYYY': /(\d{2})\/(\d{2})\/(\d{4})/,
  'MM/DD/YYYY': /(\d{2})\/(\d{2})\/(\d{4})/,
  'YYYY-MM-DD': /(\d{4})-(\d{2})-(\d{2})/,
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
