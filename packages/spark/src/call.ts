/**
 * The model call, the account row and the meter: everything that happens around an `Inference`.
 *
 * ONE PLACE, BECAUSE THE INVARIANT IS ABOUT ALL OF THEM AT ONCE. `46 §4.1`: a `call` row exists for
 * every `Inference` call made, including the refused ones, and `neurons` is zero wherever the tier
 * is not `a`. Two callers each doing their own accounting is two places for one of those to be
 * forgotten, and the one that gets forgotten is the refusal, which is the row somebody reads when
 * they want to know why the assistant said nothing.
 *
 * THE ROW IS WRITTEN AFTER VALIDATION AND NOT AFTER THE CALL, which is `46 §5.3`'s step order (6
 * comes after 5). It is the difference between a meter that says "a call happened" and an audit
 * that says what came of it: `status` and `code` are the outcome, not the transport.
 *
 * WHAT NEVER REACHES A ROW: a row of the record, a field value, a prompt, a key. `call.read` holds
 * the register, a count and the predicate, which is what `23 §6`'s fold shows a person, and
 * `12 §8` is the rule it is keeping.
 */

import { no, ok, type Clock, type Result, type Sql } from '@braindog/ports';

import { PROMPTS, MODELS, fill, type ModelId, type PromptId } from './prompts.ts';
import { checkSchema, isRecord, tokens } from './project.ts';
import type { Inference, ReadTrace, Settings, Tier } from './types.ts';

/** The seven kinds a `call` row may carry, as the `46 §4.1` CHECK spells them. Three have callers here. */
export type CallKind = 'read' | 'propose' | 'triage' | 'pattern' | 'prose' | 'embed' | 'change';
export type CallStatus = 'ok' | 'nothing' | 'refused' | 'error';

export type AccountRow = {
  id: string;
  kind: CallKind;
  tier: Tier;
  model: string;
  usage: { in: number; out: number };
  ms: number;
  status: CallStatus;
  code?: string | undefined;
  question?: string | undefined;
  predicate?: string | undefined;
  read?: readonly ReadTrace[] | undefined;
  filed?: string | undefined;
};

/** What a model call came back with, whichever way it went, so the caller can always account for it. */
export type Ran = {
  model: string;
  ms: number;
  usage: { in: number; out: number };
  out: Result<Record<string, unknown>>;
};

export type RunArgs = {
  id: PromptId;
  /** `%SLOT%` to value. Substituted in one pass by `fill`, never re-scanned. */
  slots: Record<string, string>;
  /** The adapter to call: `deps.inference` on tiers `a` and `byo`, the host's per-ask one on `b`. */
  inference?: Inference | undefined;
  /** The model name the adapter maps to a provider id. Overridden from settings on `b` and `byo`. */
  model?: string | undefined;
  /**
   * The slot to shrink when the prompt is over the template's cap, and the trace to correct.
   *
   * ROWS COME OFF THE END, one line at a time, and the `read` entry for the register they belonged
   * to loses a row with each one. A fold that says "14 rows" over a prompt that carried nine is a
   * fold that lies about what was read, which is the one thing that fold is for.
   */
  trim?: { slot: string; lines: readonly string[]; onKept?: ((kept: number) => void) | undefined } | undefined;
  /**
   * The result schema for this call alone, in place of the template's, sent to the provider and checked on the way back.
   *
   * `answer` IS THE ONE CALLER, because its schema depends on the ask: a `choice` is an enum of that rule's choices. The
   * template's schema would admit any string, and the rule's `if` would then compare an answer no choice spells.
   */
  schema?: object | undefined;
};

export type Core = {
  sql: Sql;
  clock: Clock;
  /** The singleton, read fresh on every call: another tab may have switched tiers between two asks. */
  settings(): Settings;
  /** A 26-character ULID. For a palette ask this is also the `ask_id` the client quotes back. */
  mint(): string;
  now(): string;
  /** The first instant of the current month, as the meter's lower bound. */
  monthStart(): string;
  /** The first instant of the next month, which is the sentence `SPARK_BUDGET_SPENT` ends on. */
  resets(): string;
  /** `SELECT COUNT(*)` on `call_meter`: tier `a` reads and proposals this month that called a model. */
  asksUsed(): number;
  /** Hold one ask on the meter before its model is called; see `reserve` below. Returns the row id to settle. */
  reserve(kind: 'read' | 'propose', tier: Tier, model: string): string;
  /** Give a held ask back when no model was called. A row already settled by `account` is left alone. */
  release(id: string): void;
  /** Write the row, or settle a held one: the same id replaces the hold. */
  account(row: AccountRow): void;
  run(args: RunArgs): Promise<Ran>;
};

/** `34 §4`: 26 characters, Crockford base 32, time first so two asks a second apart sort. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A ULID, minted here.
 *
 * `@braindog/kernel` OWNS THE REAL MINTER AND THIS PACKAGE MAY NOT IMPORT IT. `46 §1` closes the
 * import list at `ports`, `where` and `declare`, and the kernel is none of the three. Twelve lines
 * of base 32 is the cheaper of the two wrongs: the alternative is an edge that exists so that one
 * id can be generated, in a package whose whole boundary argument is which edges it does not have.
 * The monotonic-within-a-millisecond guarantee the kernel's minter carries is NOT reproduced, and
 * nothing here needs it: a `call` id is a primary key and a handle, never an order.
 */
export const ulid = (ms: number): string => {
  let time = '';
  let left = ms;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(left % 32) + time;
    left = Math.floor(left / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let tail = '';
  for (const b of bytes) tail += CROCKFORD.charAt(b % 32);
  return time + tail;
};

/** The `46 §4.1` schema. Two tables, and `PRAGMA user_version` in place of a migration table (`46 §10`). */
export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
     singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
     tier       TEXT NOT NULL DEFAULT 'a' CHECK (tier IN ('a','b','byo')),
     model      TEXT,
     grant_id   TEXT,
     ask_cap    INTEGER NOT NULL DEFAULT 80,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS call (
     id         TEXT PRIMARY KEY,
     ts         TEXT NOT NULL,
     kind       TEXT NOT NULL CHECK (kind IN ('read','propose','triage','pattern','prose','embed','change')),
     tier       TEXT NOT NULL CHECK (tier IN ('a','b','byo')),
     model      TEXT NOT NULL,
     tokens_in  INTEGER NOT NULL,
     tokens_out INTEGER NOT NULL,
     neurons    INTEGER NOT NULL,
     ms         INTEGER NOT NULL,
     status     TEXT NOT NULL CHECK (status IN ('ok','nothing','refused','error')),
     code       TEXT,
     question   TEXT,
     predicate  TEXT,
     read       TEXT NOT NULL DEFAULT '[]',
     filed      TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS call_meter ON call(tier, kind, ts)',
];

/** The first instant of the month an epoch falls in, and of the one after it. UTC, see `createSpark`. */
const monthOf = (ms: number, add: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + add, 1)).toISOString();
};

export const core = (sql: Sql, clock: Clock, fallback: Inference): Core => {
  const now = (): string => new Date(clock.now()).toISOString();

  const settings = (): Settings => {
    const row = sql.one<{ tier: string; model: string | null; grant_id: string | null; ask_cap: number; updated_at: string }>(
      'SELECT tier, model, grant_id, ask_cap, updated_at FROM settings WHERE singleton = 1',
    );
    /* THE SINGLETON IS INSERTED BY `createSpark` AND THIS IS STILL HERE, because a caller may hand
       Spark a database somebody else opened, and reading `undefined.tier` is a 500 on a warm-up
       request where a default is the honest answer. */
    if (row === undefined) return { tier: 'a', model: null, grant_id: null, ask_cap: 80, updated_at: now() };
    const tier: Tier = row.tier === 'b' ? 'b' : row.tier === 'byo' ? 'byo' : 'a';
    return {
      tier,
      model: row.model,
      grant_id: row.grant_id,
      ask_cap: row.ask_cap,
      updated_at: row.updated_at,
    };
  };

  const account = (row: AccountRow): void => {
    /* NEURONS ARE ZERO OFF TIER `a` BECAUSE IT IS NOT OUR MONEY (`46 §4.1`). A customer's own key and
       a self-host endpoint are billed by whoever owns them, and a meter that invented a figure for
       them would be reporting a cost nobody is paying. An unknown model name is the same case: the
       rate table holds the four the corpus routes to, and a BYO name is not one of them. */
    const rate = Object.hasOwn(MODELS, row.model) ? MODELS[row.model as ModelId] : undefined;
    const neurons =
      row.tier === 'a' && rate !== undefined
        ? Math.round((row.usage.in * rate.in) / 1e6 + (row.usage.out * rate.out) / 1e6)
        : 0;
    /* OR REPLACE, BECAUSE A HELD ASK IS SETTLED BY ITS OWN ID. The row `reserve` wrote is overwritten by the outcome, so a
       `call` row still reads as one row per model call, with `ts` the moment it was settled, as it was before holds. */
    sql.exec(
      `INSERT OR REPLACE INTO call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, predicate, read, filed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      now(),
      row.kind,
      row.tier,
      row.model,
      row.usage.in,
      row.usage.out,
      neurons,
      row.ms,
      row.status,
      row.code ?? null,
      row.question ?? null,
      row.predicate ?? null,
      JSON.stringify(row.read ?? []),
      row.filed ?? null,
    );
  };

  const run = async (args: RunArgs): Promise<Ran> => {
    const t0 = clock.now();
    const template = PROMPTS[args.id];
    const model = args.model ?? template.model;
    /* THE TEMPLATE'S OWN SYSTEM AND NOT `SYSTEM`. Three templates carry `SYSTEM` and `answer` carries its own, whose
       rules admit a digit and ask for no citation (`prompts.ts`, `ANSWER_SYSTEM`); read from `SYSTEM` here, an
       automation's number question was sent a rule forbidding the number. */
    const system = template.system;
    const schema = args.schema ?? template.schema;

    let slots = args.slots;
    if (args.trim) {
      /* THE CAP IS CHECKED ON THE WHOLE PROMPT AND PAID FOR IN ROWS. Dropping from the end keeps the
         record's own order, which is the order the caller asked the record for. */
      const lines = [...args.trim.lines];
      let content = fill(template.user, { ...slots, [args.trim.slot]: lines.join('\n') });
      while (lines.length > 0 && tokens(system) + tokens(content) > template.capIn) {
        lines.pop();
        content = fill(template.user, { ...slots, [args.trim.slot]: lines.join('\n') });
      }
      args.trim.onKept?.(lines.length);
      slots = { ...slots, [args.trim.slot]: lines.join('\n') };
    }

    const content = fill(template.user, slots);
    const estimate = tokens(system) + tokens(content);

    let reply;
    try {
      reply = await (args.inference ?? fallback).complete({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        maxTokens: template.maxTokens,
        jsonSchema: schema,
      });
    } catch (e) {
      /* A PROVIDER THAT DID NOT ANSWER IS NOT A REFUSAL ABOUT THE ASK, and saying `PROPOSAL_SCHEMA`
         here would send a person looking at their question for a fault that is in the network. The
         estimate is billed as `tokens_in` so a month of outages is visible in the meter. */
      return {
        model,
        ms: clock.now() - t0,
        usage: { in: estimate, out: 0 },
        out: no(
          'UNREACHABLE',
          `The model did not answer${e instanceof Error && e.message !== '' ? `: ${e.message}` : ''}. Nothing was filed; ask again.`,
        ),
      };
    }

    const usage = reply.usage;
    const ms = clock.now() - t0;

    let parsed: unknown;
    try {
      parsed = JSON.parse(reply.text);
    } catch {
      return { model, ms, usage, out: no('PROPOSAL_SCHEMA', 'The model did not answer with JSON. Nothing was filed; ask again.') };
    }

    const fault = checkSchema(schema, parsed);
    if (fault) return { model, ms, usage, out: { ok: false, refusal: fault } };
    if (!isRecord(parsed))
      return { model, ms, usage, out: no('PROPOSAL_SCHEMA', 'The model did not answer with an object. Nothing was filed; ask again.') };

    return { model, ms, usage, out: ok(parsed) };
  };

  return {
    sql,
    clock,
    settings,
    mint: () => ulid(clock.now()),
    now,
    monthStart: () => monthOf(clock.now(), 0),
    resets: () => monthOf(clock.now(), 1),
    /* A READ IS AN ASK, AND IT WAS NEVER COUNTED. `46 §4.1` counts `kind = 'propose'` alone, which
       fitted a palette whose pass 1 was free; the only door built is `read`, which writes
       `kind = 'read'`, so an owner who set `ask_cap` to 2 was answered on five asks out of five,
       five model calls on their own key, with `status()` reading 0 of 2 throughout
       (`test/read-meter.test.ts`). Both kinds count now, one per model call, so pass 1 and pass 2
       of one question are two, and a repeated pass 2 on a stored `ask_id` cannot run unmetered
       either. `model <> '-'` is the one read row that called nothing: a record with no lists
       answers `nothing` without a model, and billing it is the meter `propose`'s zero-rows arm
       already refuses to be. The index `call_meter (tier, kind, ts)` still serves the count. */
    asksUsed: () =>
      sql.one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM call WHERE tier = 'a' AND kind IN ('read', 'propose') AND model <> '-' AND ts >= ?",
        monthOf(clock.now(), 0),
      )?.n ?? 0,
    /* THE CHECK AND THE COUNT WERE TWO STEPS WITH A MODEL BETWEEN THEM. `spent()` read `asksUsed()`, and the row that
       count reads was written after the model answered, so every ask in flight passed the check against the same number:
       ten `read`s sent together at `ask_cap: 2`, over a model answering in 20 ms, made ten model calls and `status()` read
       10 of 2 (`loop/research-batch-twenty-eight-audit.md` §1, `test/cap-concurrent.test.ts`). The hold is a real row,
       written in the same synchronous step as the check, so the next ask's count already includes it. It is a row and not
       a counter in memory because both hosts build a Spark per request, and a counter would be one per request.
       IT IS `error · SPARK_PENDING` AND NOT A NEW STATUS because the `46 §4.1` CHECK admits four, and changing it is the
       first schema change, which `createSpark` says needs its version in a row first. A process that dies mid-call leaves
       the hold counted, which is the side of the line a cap should err on. */
    reserve: (kind, tier, model) => {
      const id = ulid(clock.now());
      sql.exec(
        `INSERT INTO call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 'error', 'SPARK_PENDING')`,
        id,
        now(),
        kind,
        tier,
        model,
      );
      return id;
    },
    release: (id) => sql.exec("DELETE FROM call WHERE id = ? AND code = 'SPARK_PENDING'", id),
    account,
    run,
  };
};
