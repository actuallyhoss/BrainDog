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
 * WHAT NEVER REACHES A ROW: a row of the record, a field value, a prompt, a key. `slash_call.read`
 * holds the register, a count and the predicate, which is what `23 §6`'s fold shows a person, and
 * `12 §8` is the rule it is keeping. What a person typed does reach one, in `question`, and
 * `eraseSlash` (`erase.ts`) is how it leaves again.
 */

import { no, ok, type Clock, type Result, type Sql } from '@braindog/ports';

import { PROMPTS, MODELS, fill, type ModelId, type PromptId } from './prompts.ts';
import { checkSchema, isRecord, tokens } from './project.ts';
import type { Inference, ReadTrace, Settings, Tier } from './types.ts';

/** Every tier the `slash_settings` CHECK admits, and the ones a host answers unless it says fewer (`SlashOptions.tiers`). */
export const TIERS: readonly Tier[] = ['a', 'b', 'byo'];

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
  /** The first instant of the next month, which is the sentence `SLASH_BUDGET_SPENT` ends on. */
  resets(): string;
  /** `SELECT COUNT(*)` on `slash_call_meter`: tier `a` reads and patterns this month that called a model, one row an ask. */
  asksUsed(): number;
  /**
   * Hold one ask on the meter before its model is called; see `reserve` below. Returns the row id to settle.
   *
   * `id`, WHEN GIVEN, IS THE ROW'S OWN ID IN PLACE OF A FRESH ULID: `propose.ts` passes `<ask_id>:propose` for a pass 2
   * on a stored `ask_id`, so the second such call for the same `ask_id` finds the first one's row already there and
   * refuses before it holds anything (`propose.ts`'s own check, which reads this before calling `reserve`).
   */
  reserve(kind: 'read' | 'propose', tier: Tier, model: string, id?: string): string;
  /** Give a held ask back when no model was called. A row already settled by `account` is left alone. */
  release(id: string): void;
  /**
   * One ask turned away because the month's asks are spent (`turnedAway`, model-sign-49): its own row, so the vital sign
   * can say the month is spent. Never counted as an ask (`asksUsed` passes over `-`).
   */
  turnedAway(kind: 'read' | 'propose', tier: Tier): void;
  /**
   * Write the row, or settle one this ledger minted: a hold from `reserve`, or an id from `mint` settled once already.
   * A row already held under an id this ledger did not mint is refused with a throw and never replaced.
   */
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

/**
 * The store's version, kept in the `slash_meta` row and never in `PRAGMA user_version`.
 *
 * THE ROW AND NOT THE PRAGMA, because a Durable Object's authorizer refuses the pragma (`SQLITE_AUTH`, measured in workerd
 * by `apps/worker/test/slash-in-do.test.ts`), so on the Worker it would read 0 for ever and a change keyed
 * on it would run on every build. `dir_meta` carries the directory's version the same way (`packages/record/src/directory.ts`).
 *
 * 1 WAS THE TWO TABLES `46 §4.1` NAMED `settings` AND `call`, with no version anywhere. 2 is the same columns under
 * Slash's own names, `slash_settings` and `slash_call`, with this row beside them: on the Worker they share the record's
 * own SQLite, where a bare `settings` and `call` read as the record's. The next change to a column raises this number and
 * adds its step to `openStore`.
 */
export const STORE_VERSION = 2;

/** The store as a new one is built: the version row's table, the settings singleton and the ledger, all `IF NOT EXISTS`. */
export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS slash_meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS slash_settings (
     singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
     tier       TEXT NOT NULL DEFAULT 'a' CHECK (tier IN ('a','b','byo')),
     model      TEXT,
     grant_id   TEXT,
     ask_cap    INTEGER NOT NULL DEFAULT 80,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS slash_call (
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
  'CREATE INDEX IF NOT EXISTS slash_call_meter ON slash_call(tier, kind, ts)',
];

/**
 * AN ASK TURNED AWAY BECAUSE THE MONTH'S ASKS ARE SPENT LEAVES ONE ROW (model-sign-49, audit 40-42 finding 5): model `-`,
 * `refused`, `SLASH_BUDGET_SPENT`. Before this every month-cap refusal returned before any row was written, so the vital
 * sign `model-answers` read five answers and then fifty capped asks as "answered all 5", and fifty capped asks alone as
 * "No one asked". Under `-` it is never an ask the meter counts (`asksUsed`, the host's `drafted` and the worker's
 * ceiling all pass over `-`), and a per-call neuron-ceiling refusal, written under the model's own name, is never read as
 * the month spent (`LEDGER_BUDGET`). The host restates this insert (`packages/host/src/slash-turned-away.ts`) because it
 * may not import this package (`46 §5.1`); its test holds the two to one shape.
 */
export const TURNED_AWAY_SQL =
  "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, ?, ?, '-', 0, 0, 0, 0, 'refused', 'SLASH_BUDGET_SPENT')";

/** The ledger's columns, named once so a carried row lands column for column. */
const CALL_COLUMNS = 'id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, predicate, read, filed';

/**
 * What version 1 left that version 2 does not keep: its two index names, and the two codes the ledger wrote while the
 * assistant was called Spark.
 *
 * THE CODES ARE RENAMED HERE, ONCE, and no longer on every build. A ledger written before the assistant was renamed Slash
 * holds a hold in flight as `SPARK_PENDING`, which `release` finds by its code and would never have found, so it stayed
 * counted against the month, and a refused ask as `SPARK_BUDGET_SPENT`, which is history. Version 1 ran the rename with the
 * tables on every build, over a partial index kept so that it cost nothing; with a version row the step runs once, reads
 * the ledger once, and neither the statement nor its index is needed after it.
 */
const FROM_1: readonly string[] = [
  'DROP INDEX IF EXISTS call_meter',
  'DROP INDEX IF EXISTS call_old_code',
  "UPDATE slash_call SET code = 'SLASH' || substr(code, 6) WHERE code IN ('SPARK_PENDING', 'SPARK_BUDGET_SPENT')",
];

/** Every name the store's tables have had, version 1's first, as `sqlite_master` spells them. */
const NAMES = ['settings', 'call', 'slash_meta', 'slash_settings', 'slash_call'] as const;

/**
 * Bring Slash's store to `STORE_VERSION`, on every build, idempotently.
 *
 * THE COMMON PATH IS TWO READS AND NO WRITE: which of the names exist, and the version row. Only a store that is not yet
 * at this version, or that holds a table under an old name, opens a transaction. A version above this build's is a store
 * a newer build wrote, and it is refused rather than read, as the directory refuses one: `IF NOT EXISTS` over a newer
 * shape runs silently, and the first ask would read columns this build does not know the meaning of.
 *
 * VERSION 1 IS RENAMED IN PLACE. `ALTER TABLE ... RENAME TO` keeps every row, every column and the `CHECK` lists, which is
 * the whole of what an owner has: the tier and cap they chose, and the month's count of asks.
 *
 * AND BOTH NAMES AT ONCE IS A ROLLBACK, carried and not refused. A build older than this one, deployed after it had
 * renamed the tables, creates `settings` and `call` again and meters into them. The ledger's rows are the count of what
 * was spent, so they are carried into `slash_call` and the old table dropped. The settings row is not carried: the old
 * build's singleton is the default it inserted on its first ask, not a choice, and copying it over would put the owner's
 * cap back at the default. A choice made on the older build during the rollback is the one thing lost.
 */
export function openStore(sql: Sql): void {
  const present = new Set(
    sql
      .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)`, ...NAMES)
      .map((r) => r.name),
  );
  const said = present.has('slash_meta') ? sql.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value : undefined;
  const stored = said !== undefined && /^[0-9]+$/u.test(said) ? Number(said) : 0;
  if (stored > STORE_VERSION)
    throw new Error(
      `Slash's ledger was written by a newer BrainDog: it is at version ${stored} and this build reads ${STORE_VERSION}. Upgrade, and Slash answers again.`,
    );
  if (stored === STORE_VERSION && !present.has('settings') && !present.has('call')) return;

  sql.transactionSync(() => {
    if (present.has('settings')) sql.exec(present.has('slash_settings') ? 'DROP TABLE settings' : 'ALTER TABLE settings RENAME TO slash_settings');
    if (present.has('call') && !present.has('slash_call')) sql.exec('ALTER TABLE call RENAME TO slash_call');
    for (const statement of DDL) sql.exec(statement);
    if (present.has('call') && present.has('slash_call')) {
      sql.exec(`INSERT OR IGNORE INTO slash_call (${CALL_COLUMNS}) SELECT ${CALL_COLUMNS} FROM call`);
      sql.exec('DROP TABLE call');
    }
    /* AFTER THE CARRY, so a code a carried row holds under the old name is renamed with the rest. */
    for (const statement of FROM_1) sql.exec(statement);
    sql.exec(
      "INSERT INTO slash_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(STORE_VERSION),
    );
  });
}

/** The first instant of the month an epoch falls in, and of the one after it. UTC, see `createSlash`. */
const monthOf = (ms: number, add: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + add, 1)).toISOString();
};

/**
 * The most ids one ledger remembers minting while their calls are in flight (`minted` in `core`).
 *
 * A HOLD IS FORGOTTEN WHEN IT IS RELEASED, which every caller of `reserve` does in a `finally`; an id from `mint` has no
 * release, so the oldest is let go past this many. An id still needed is one whose call is awaiting its model, and the
 * oldest of a thousand ids is one handed out a thousand calls ago, so an id let go here belongs to a call long settled.
 */
const MINTED_MOST = 1_000;

/**
 * `priced` IS THE HOST'S ANSWER TO WHOSE NEURONS EACH TIER SPENDS, and `['a']` is `46 §4.1`'s. `tiers` IS ITS ANSWER TO
 * WHICH TIERS IT RUNS AT ALL. See `SlashOptions` in `index.ts` for the host that answers otherwise.
 */
export const core = (sql: Sql, clock: Clock, fallback: Inference, priced: readonly Tier[] = ['a'], tiers: readonly Tier[] = TIERS): Core => {
  const now = (): string => new Date(clock.now()).toISOString();

  /* THE IDS THIS LEDGER HANDED OUT, the only ones `account` may settle over a row that is already there (`account`). */
  const minted = new Set<string>();
  const remember = (id: string): string => {
    minted.add(id);
    if (minted.size > MINTED_MOST) {
      const oldest = minted.values().next().value;
      if (oldest !== undefined) minted.delete(oldest);
    }
    return id;
  };

  const settings = (): Settings => {
    const row = sql.one<{ tier: string; model: string | null; grant_id: string | null; ask_cap: number; updated_at: string }>(
      'SELECT tier, model, grant_id, ask_cap, updated_at FROM slash_settings WHERE singleton = 1',
    );
    /* THE SINGLETON IS INSERTED BY `createSlash` AND THIS IS STILL HERE, because a caller may hand
       Slash a database somebody else opened, and reading `undefined.tier` is a 500 on a warm-up
       request where a default is the honest answer. */
    if (row === undefined) return { tier: 'a', model: null, grant_id: null, ask_cap: 80, updated_at: now() };
    const stored: Tier = row.tier === 'b' ? 'b' : row.tier === 'byo' ? 'byo' : 'a';
    /* A TIER THIS HOST DOES NOT RUN IS READ AS THE INCLUDED MODEL, and the row is left as the owner saved it. On the Cloud
       `byo` names no address of the owner's, so a model name typed for it went to Workers AI's own table and every pass
       2 failed on "no adapter on this host" (`apps/worker/src/inference.ts`). Read as `a`, the routing table picks the
       model again and a record saved on `byo` answers; the next save stores what was read. */
    const tier: Tier = tiers.includes(stored) ? stored : 'a';
    return {
      tier,
      model: tier === stored ? row.model : null,
      grant_id: row.grant_id,
      ask_cap: row.ask_cap,
      updated_at: row.updated_at,
    };
  };

  const account = (row: AccountRow): void => {
    /* NEURONS ARE ZERO OFF TIER `a` BECAUSE IT IS NOT OUR MONEY (`46 §4.1`). A customer's own key and
       a self-host endpoint are billed by whoever owns them, and a meter that invented a figure for
       them would be reporting a cost nobody is paying. An unknown model name is the same case: the
       rate table holds the four the corpus routes to, and a BYO name is not one of them.
       AND "OFF TIER `a`" IS THE HOST'S TO WIDEN, because "not our money" was false on one host. On the Worker with no
       endpoint every call goes to Workers AI on the operator's account, `byo` included, and
       a probe read `{ tier: byo, tokens_in: 700, tokens_out: 60, neurons: 0 }`
       there for a call the platform billed. That host passes the tiers it pays for (`priced`); every other keeps `a`. */
    const rate = Object.hasOwn(MODELS, row.model) ? MODELS[row.model as ModelId] : undefined;
    const neurons =
      priced.includes(row.tier) && rate !== undefined
        ? Math.round((row.usage.in * rate.in) / 1e6 + (row.usage.out * rate.out) / 1e6)
        : 0;
    const values = [
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
    ] as const;
    /* A NEW ID IS INSERTED, AND A HELD ONE IS SETTLED ONLY WHEN THIS LEDGER MINTED IT. The row
       `reserve` wrote is overwritten by the outcome, and a call settled the moment its model answered is overwritten by
       the exit that follows (`propose.ts`, `jobs.ts`), so a row still reads as one row per model call, with `ts` the
       moment it was settled. It was `INSERT OR REPLACE` on whatever id it was handed, so a caller passing an id it had not
       minted, a pass 2's quoted `ask_id` among them, would have overwritten a billed row and taken it off the month's
       count. Such an id is refused now, loudly, because no caller in this package passes one and a caller that did is a
       fault to find and not a row to lose.
       A ROW THIS LEDGER MINTED IS REPLACED AND NOT UPDATED IN PLACE, so a settled call moves to the end of the ledger as it
       always did, and `ORDER BY rowid` reads the calls in the order they were settled. An update kept the hold's place: a
       pass 2 with no `ask_id` holds its proposal before its draft, so its two rows read propose before read, where every
       reader of the ledger in rowid order (`test/account-write.test.ts`, `test/slash-ledger-model.test.ts`) reads the draft
       first. The replace reaches only an id the check just below has found in `minted`. */
    const held = sql.one('SELECT 1 AS n FROM slash_call WHERE id = ?', row.id) !== undefined;
    if (held && !minted.has(row.id)) throw new Error("Slash's ledger already holds a call under that id, and this ask did not make it, so nothing was replaced.");
    sql.exec(
      `${held ? 'INSERT OR REPLACE' : 'INSERT'} INTO slash_call (${CALL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      ...values,
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
         estimate is billed as `tokens_in` so a month of outages is visible in the meter. `answer`
         settles that row under `-`, so there it keeps `tokens_in` and no neurons (`asksUsed`), unless the
         host marked the throw `reached`, and then `answer` settles it as `read` does, under the model's name. */
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
    mint: () => remember(ulid(clock.now())),
    now,
    monthStart: () => monthOf(clock.now(), 0),
    resets: () => monthOf(clock.now(), 1),
    /* A READ IS AN ASK, AND IT WAS NEVER COUNTED. `46 §4.1` counts `kind = 'propose'` alone, which
       fitted a palette whose pass 1 was free; the only door built is `read`, which writes
       `kind = 'read'`, so an owner who set `ask_cap` to 2 was answered on five asks out of five,
       five model calls on their own key, with `status()` reading 0 of 2 throughout
       (`test/read-meter.test.ts`). `model <> '-'` passes over the two read rows that are not asks. One
       called nothing: a record with no lists answers `nothing` without a model, and billing it is the
       meter `propose`'s zero-rows arm already refuses to be. The other tried and reached nothing: an
       `answer` whose model was `UNREACHABLE`, which `answer.ts` settles under `-` because the host
       asks an `UNREACHABLE` again up to the ladder's eighth rung, and a probe
       put an outage at half the default cap spent on
       asks that reached no model. `read`'s and `propose`'s own `UNREACHABLE` rows keep the model's
       name and still count. Under `-`, that `answer` row keeps the prompt estimate in `tokens_in`
       and gets 0 neurons on tier `a`, because `account` finds no rate for `-` in `MODELS`; under
       the model's name it was billed on that estimate. It also no longer says which model was
       not reached. The index `slash_call_meter (tier, kind, ts)` still serves the count.

       ONE QUESTION IS ONE ASK, WHATEVER PASSES IT TOOK, since `46 §4.1` and `07 §5.5` both say so and a two-pass
       question cost 2 here while `/usage` read it as one. `propose` is off this count now: every question writes
       exactly one `read` row, pass 1 or the drafting read of a pass 2 with no stored `ask_id`, and `kind = 'propose'`
       is the second model call of the same question rather than a second one. A repeated pass 2 on one stored
       `ask_id` still cannot run free: `propose.ts` refuses it before it holds anything, off the row the first pass 2
       left under `<ask_id>:propose` (`reserve`'s `id` parameter, just above). */
    asksUsed: () =>
      sql.one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM slash_call WHERE tier = 'a' AND kind IN ('read', 'pattern') AND model <> '-' AND ts >= ?",
        monthOf(clock.now(), 0),
      )?.n ?? 0,
    /* THE CHECK AND THE COUNT WERE TWO STEPS WITH A MODEL BETWEEN THEM. `spent()` read `asksUsed()`, and the row that
       count reads was written after the model answered, so every ask in flight passed the check against the same number:
       ten `read`s sent together at `ask_cap: 2`, over a model answering in 20 ms, made ten model calls and `status()` read
       10 of 2 (`test/cap-concurrent.test.ts`). The hold is a real row,
       written in the same synchronous step as the check, so the next ask's count already includes it. It is a row and not
       a counter in memory because both hosts build a Slash per request, and a counter would be one per request.
       IT IS `error · SLASH_PENDING` AND NOT A NEW STATUS because the `46 §4.1` CHECK admits four, and a new one is a
       change to a column's `CHECK`, which is a step of its own under `STORE_VERSION`. A process that dies mid-call leaves
       the hold counted, which is the side of the line a cap should err on. */
    reserve: (kind, tier, model, id) => {
      const held = id ?? ulid(clock.now());
      sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING')`,
        held,
        now(),
        kind,
        tier,
        model,
      );
      return remember(held);
    },
    /* AND THE ID IS FORGOTTEN WITH ITS HOLD: every caller releases in a `finally`, after its last `account`. */
    release: (id) => {
      minted.delete(id);
      sql.exec("DELETE FROM slash_call WHERE id = ? AND code = 'SLASH_PENDING'", id);
    },
    turnedAway: (kind, tier) => {
      sql.exec(TURNED_AWAY_SQL, ulid(clock.now()), now(), kind, tier);
    },
    account,
    run,
  };
};
