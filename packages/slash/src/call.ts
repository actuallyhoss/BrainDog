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
import { scrubWords } from './health.ts';
import { LAST_ROWS_SQL, NOT_SERVED, PASSED_WORDS, RAW_MAX, pausedFor, type LastRow } from './paused.ts';
import { checkSchema, isRecord, tokens } from './project.ts';
import type { Inference, Purpose, ReadTrace, Settings, SlashCandidate, SlashPurpose, SlashRoute, Spends, Tier } from './types.ts';

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
  /** What the ask was for. Said by the caller, as a constant where it makes the call, and never worked out from the row. */
  purpose: Purpose;
  /**
   * Whose allowance the ask is charged to WHEN IT COUNTS. The ledger writes `none` in its place for an attempt no model
   * answered (`unspent`), so no caller decides that and no two callers can decide it differently.
   */
  spends: Spends;
  /** `Ran.served`, handed on as it came: a throw the host marked as coming after its model ran, which counts once. */
  served?: boolean | undefined;
  /** The router's name for the path the call took and the model it tried on it. Absent until a router says. */
  route?: string | undefined;
  candidate?: string | undefined;
  /** The provider's own words for a failure, already cut and with nothing shaped like a key in it. Absent until a host says. */
  raw?: string | undefined;
};

/** What a model call came back with, whichever way it went, so the caller can always account for it. */
export type Ran = {
  model: string;
  ms: number;
  usage: { in: number; out: number };
  out: Result<Record<string, unknown>>;
  /**
   * Whether a model served, or may have served, a completion: every reply, and a throw the host marked `answered` (a
   * reply too large or unreadable, a body that broke off, a timeout: `packages/host/src/slash.ts`). A plain throw is a
   * model that did not answer, and `account` spends nothing for it.
   */
  served: boolean;
  /** The host's handle for the candidate that ended a route's walk, for the caller's row. Absent with no route. */
  candidate?: string | undefined;
  /**
   * The provider's words on a throw from a route's candidate, scrubbed and cut (`thrownRaw`), for the
   * caller's row: a model its provider does not serve starts with that phrase, which is what pauses it for a day.
   * Absent with no route, and on every attempt that did not throw.
   */
  raw?: string | undefined;
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
  /**
   * A caller's watch over a route candidate's own wire, so what it reads off a throw is the last attempt's and
   * not an earlier one's. Absent, a candidate's wire is asked as it came.
   */
  watch?: ((inference: Inference) => Inference) | undefined;
  /**
   * Handed the reply's text so far each time more of it arrives, where the adapter can stream (`Inference.stream`); the
   * reply is still parsed, checked and returned whole. Absent, or an adapter without `stream`, and nothing is called.
   */
  onText?: ((sofar: string) => void) | undefined;
};

/** What every hold and every settled row says about itself: what the ask was for and whose allowance it spends. */
export type Charge = { purpose: Purpose; spends: Spends };

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
  /** His asks this month on the included model: the rows that say `spends = 'person'`, one row an ask. */
  asksUsed(): number;
  /** The background asks this month, the rows that say `spends = 'background'`: all of them, or those of one purpose. */
  backgroundUsed(purpose?: Purpose): number;
  /**
   * Hold one ask on the meter before its model is called; see `reserve` below. Returns the row id to settle.
   *
   * `charge` IS WHAT THE HOLD COUNTS AS WHILE ITS MODEL IS OUT, so an ask in flight is counted on the allowance it will
   * spend and on no other.
   *
   * `id`, WHEN GIVEN, IS THE ROW'S OWN ID IN PLACE OF A FRESH ULID: `propose.ts` passes `<ask_id>:propose` for a pass 2
   * on a stored `ask_id`, so the second such call for the same `ask_id` finds the first one's row already there and
   * refuses before it holds anything (`propose.ts`'s own check, which reads this before calling `reserve`).
   */
  reserve(kind: 'read' | 'propose', tier: Tier, model: string, charge: Charge, id?: string): string;
  /** Give a held ask back when no model was called. A row already settled by `account` is left alone. */
  release(id: string): void;
  /**
   * One ask turned away because the month's asks are spent (`turnedAway`, model-sign-49): its own row, so the vital sign
   * can say the month is spent. Never counted as an ask (`asksUsed` passes over `-`).
   */
  turnedAway(kind: 'read' | 'propose', tier: Tier, purpose?: Purpose): void;
  /**
   * Write the row, or settle one this ledger minted: a hold from `reserve`, or an id from `mint` settled once already.
   * A row already held under an id this ledger did not mint is refused with a throw and never replaced.
   */
  account(row: AccountRow): void;
  run(args: RunArgs): Promise<Ran>;
  /**
   * The candidates the host's route offers for `purpose`, for a job that calls its model outside `run` (`digestProse`,
   * `jobs.ts`), held to `run`'s own rule: none where the host handed no route, and none on his own key, which is never
   * walked past. Empty is the job's own model, as it always was.
   */
  routeOf(purpose: SlashPurpose): readonly SlashCandidate[];
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
 *
 * 3 IS THE LEDGER SAYING WHOSE ALLOWANCE A ROW SPENDS: `slash_call` gains `purpose`, `spends`, `route`,
 * `candidate` and `raw`, and `FILL_2` reads every older row once to say what it was. A build at 2 refuses a store at 3
 * (`openStore`), so the deploy that carries this cannot be rolled back past without Slash going quiet.
 */
export const STORE_VERSION = 3;

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
     filed      TEXT,
     purpose    TEXT NOT NULL DEFAULT 'ask',
     spends     TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')),
     route      TEXT,
     candidate  TEXT,
     raw        TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS slash_call_meter ON slash_call(tier, kind, ts)',
];

/**
 * The five columns version 3 added, each as the statement that adds it to a ledger built before them.
 *
 * THE DEFAULTS ARE WHAT A WRITER THAT DOES NOT KNOW THE COLUMNS GETS, and they are the old count: `ask`, spending
 * `person`. A host a release behind writes its own rows straight into this table, and a default of `none` would let its
 * presses through uncounted, where `person` costs at worst what the month cost before this version. `asksUsed` still
 * passes over `-`, so a row such a writer leaves for an ask that called nothing is not counted either way.
 */
const COLUMNS_3: readonly (readonly [string, string])[] = [
  ['purpose', "ALTER TABLE slash_call ADD COLUMN purpose TEXT NOT NULL DEFAULT 'ask'"],
  ['spends', "ALTER TABLE slash_call ADD COLUMN spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none'))"],
  ['route', 'ALTER TABLE slash_call ADD COLUMN route TEXT'],
  ['candidate', 'ALTER TABLE slash_call ADD COLUMN candidate TEXT'],
  ['raw', 'ALTER TABLE slash_call ADD COLUMN raw TEXT'],
];

/** The index the two counts read (`asksUsed`, `backgroundUsed`), made once the column is there, so never in `DDL`. */
const INDEX_3 = 'CREATE INDEX IF NOT EXISTS slash_call_spends ON slash_call(spends, ts)';

/**
 * AN ASK TURNED AWAY BECAUSE THE MONTH'S ASKS ARE SPENT LEAVES ONE ROW (model-sign-49): model `-`,
 * `refused`, `SLASH_BUDGET_SPENT`. Before this every month-cap refusal returned before any row was written, so the vital
 * sign `model-answers` read five answers and then fifty capped asks as "answered all 5", and fifty capped asks alone as
 * "No one asked". Under `-` it is never an ask the meter counts (`asksUsed`, the host's `drafted` and the worker's
 * ceiling all pass over `-`), and a per-call neuron-ceiling refusal, written under the model's own name, is never read as
 * the month spent (`LEDGER_BUDGET`). The host restates this insert (`packages/host/src/slash-turned-away.ts`) because it
 * may not import this package (`46 §5.1`); its test holds the two to one shape.
 */
export const TURNED_AWAY_SQL =
  "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, purpose, spends) VALUES (?, ?, ?, ?, '-', 0, 0, 0, 0, 'refused', 'SLASH_BUDGET_SPENT', 'ask', 'none')";

/** The columns a ledger had before version 3, named once so a row carried from an older build lands column for column. */
const CARRIED_COLUMNS = 'id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, predicate, read, filed';

/** The ledger's columns as `account` writes them. */
const CALL_COLUMNS = `${CARRIED_COLUMNS}, purpose, spends, route, candidate, raw`;

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

/**
 * The questions a host wrote on the rows it made before a row could say what it was for, restated because this package
 * may not import a host (`46 §5.1`): the page headlines, the reading of who is who, and a new record's first plan
 * (`packages/host/src/model-jobs.ts`, `understand.ts`, `slash-ask.ts`). Read once, by `FILL_2`, and by nothing after it.
 */
const ASKED_2 = { headline: "Slash's page headlines", understand: "Slash's reading of who is who", plan: "Slash's first plan" } as const;

/** A constant of this file as a SQL string. Never a value from outside: the store's `Sql` takes those as parameters. */
const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;

/**
 * What every row written before version 3 was for and whose allowance it spent, said once, from the only things such a
 * row holds: its kind, its question, whether it filed, and `-` for a call that reached no model.
 *
 * A READ IS HIS: an automation's by its `rule.<id> step <n>`, the first plan by its question, and his own otherwise. A
 * PATTERN is the headlines' or the understanding's by its question, his own press where it filed, and background work
 * otherwise, which is the correction this version is for: on the included model those rows were counted against his 80.
 * One of his own presses that filed nothing reads as background here, because nothing on the row tells it from a draft
 * the record made for itself. PROSE AND AN EMBEDDING are background. A ROW UNDER `-` spends nothing.
 *
 * A PROPOSAL SPENDS NOTHING, where the scope's table said `person`: it is the second model call of a question whose
 * read is already one of his asks (`asksUsed`, "one question is one ask"), and written as `person` every two-pass
 * question of the month would have counted twice the moment the store stepped.
 *
 * A READ THAT FAILED KEEPS `person`, though the same row written today spends nothing (`unspent`): it was counted
 * when it happened, and a step that took it back would move his month's count for a reason he never saw.
 *
 * `%SCOPE%` is nothing for the step itself, and the carried rows alone when an older build's ledger is folded in.
 */
const FILL_2 = `UPDATE slash_call SET
  purpose = CASE
    WHEN kind IN ('read', 'propose') AND question LIKE 'rule.% step %' THEN 'automation'
    WHEN kind IN ('read', 'propose') AND question = ${quoted(ASKED_2.plan)} THEN 'plan'
    WHEN kind IN ('read', 'propose') THEN 'ask'
    WHEN question = ${quoted(ASKED_2.headline)} THEN 'headline'
    WHEN question = ${quoted(ASKED_2.understand)} THEN 'understand'
    WHEN kind = 'pattern' AND filed IS NOT NULL THEN 'ask'
    ELSE 'look' END,
  spends = CASE
    WHEN model = '-' THEN 'none'
    WHEN kind = 'read' THEN 'person'
    WHEN kind = 'propose' THEN 'none'
    WHEN kind = 'pattern' AND filed IS NOT NULL AND (question IS NULL OR question NOT IN (${quoted(ASKED_2.headline)}, ${quoted(ASKED_2.understand)})) THEN 'person'
    ELSE 'background' END
  WHERE 1 = 1 %SCOPE%`;

/** His month's count as versions 1 and 2 made it, kept for the one line the step to 3 logs. */
const COUNT_2 = "SELECT COUNT(*) AS n FROM slash_call WHERE tier = 'a' AND kind IN ('read', 'pattern') AND model <> '-' AND ts >= ?";

/**
 * His month's count: the rows on the included model that say they spend one of his asks.
 *
 * `tier = 'a'` STAYS, because the allowance is the included model's: an ask on his own key is listed and not capped, and
 * a host that caps `byo` counts that tier itself. `model <> '-'` STAYS for a writer a release behind, whose row for an
 * ask turned away takes the column's default (`COLUMNS_3`); every row this ledger writes under `-` already says `none`.
 */
const COUNT_3 = "SELECT COUNT(*) AS n FROM slash_call WHERE tier = 'a' AND spends = 'person' AND model <> '-' AND ts >= ?";

/** The month's background asks, on whatever tier: the allowance is the record's work, wherever its model is. */
const BACKGROUND_3 = "SELECT COUNT(*) AS n FROM slash_call WHERE spends = 'background' AND ts >= ?";

/** What the step to version 3 found, said once so his count can be read on both sides of it. */
export type StoreStep = {
  from: number;
  to: number;
  /** The first instant of the month counted. */
  month: string;
  /** His asks this month as the older build counted them, and as this one does. */
  before: number;
  after: number;
  /** The month's rows that now say they are background work. `before - after` of them were counted as his. */
  background: number;
};

export type StoreOptions = {
  /** The instant whose month the step counts. The wall clock unless a caller has a better one. */
  now?: number | undefined;
  /** Where the step's one line goes. The host's log unless a caller wants to read it. */
  said?: ((step: StoreStep) => void) | undefined;
};

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
export function openStore(sql: Sql, options: StoreOptions = {}): void {
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
    /* THE COLUMNS, WHERE THE LEDGER WAS BUILT BEFORE THEM. Read off the table's own `CREATE` text and not `PRAGMA
       table_info`, because a Durable Object's authorizer is why this store asks no pragma (`STORE_VERSION`). */
    const built = sql.one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'")?.sql ?? '';
    for (const [column, add] of COLUMNS_3) if (!new RegExp(`\\b${column}\\b`, 'u').test(built)) sql.exec(add);
    sql.exec(INDEX_3);
    const fill = (scope: string): void => sql.exec(FILL_2.replace('%SCOPE%', scope));
    if (present.has('call') && present.has('slash_call')) {
      sql.exec(`INSERT OR IGNORE INTO slash_call (${CARRIED_COLUMNS}) SELECT ${CARRIED_COLUMNS} FROM call`);
      /* A CARRIED ROW IS AN OLDER BUILD'S, so it is read as one, here where the store is already at 3 and the step
         from 2 below will not run. */
      if (stored >= 3) fill('AND id IN (SELECT id FROM call)');
      sql.exec('DROP TABLE call');
    }
    /* AFTER THE CARRY, so a code a carried row holds under the old name is renamed with the rest. */
    for (const statement of FROM_1) sql.exec(statement);
    /* FROM 2: EVERY ROW SAYS WHAT IT WAS, ONCE, AND HIS MONTH'S COUNT IS LOGGED ON BOTH SIDES. The risk of this step is
       a fill that misreads old rows so that his count jumps on the deploy; the line is how that is seen, by him or by
       whoever reads the log. A store with no ledger yet has nothing to count and says nothing. */
    if (stored < 3) {
      const month = monthOf(options.now ?? Date.now(), 0);
      const count = (text: string): number => sql.one<{ n: number }>(text, month)?.n ?? 0;
      const before = count(COUNT_2);
      fill('');
      if (present.has('slash_call') || present.has('call')) {
        const step: StoreStep = { from: stored, to: STORE_VERSION, month, before, after: count(COUNT_3), background: count(BACKGROUND_3) };
        (options.said ?? ((line) => console.log(JSON.stringify({ op: 'slash.store', ...line }))))(step);
      }
    }
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
 * Whether a settled row is an attempt no model answered, which spends nobody's allowance.
 *
 * HIS RULE, AND THE ONE PLACE IT IS KEPT: "a non-2xx status from the model is retried and not counted". Three rows are
 * that attempt. One under `-`, the ledger's mark for a call that reached no model. One the provider refused with a
 * status no retry mends (`PULL_REQUEST_REFUSED`, `answer.ts`). And an `UNREACHABLE`, whatever name it is under: a model
 * that could not be reached, and a host's binding that threw after it was called, which was counted as an ask until
 * this version and is the retry his rule is about.
 *
 * THE NEURONS ARE KEPT. `account` prices the row by its model's name as it always did, so the operator's ceiling still
 * sees an attempt a platform may have billed; only his count and the background's pass over it.
 *
 * AN UNREADABLE REPLY AND A TIMEOUT COUNT ONCE AND ARE FINAL. A reply that would not parse settles as `PROPOSAL_SCHEMA`
 * or `ANSWER_UNREADABLE`, which are not here. A throw the host marked as coming after its model ran reaches a `read` as
 * `UNREACHABLE` all the same, so `core.run` says `served` beside it and the caller hands that on untouched.
 */
const unspent = (row: AccountRow): boolean =>
  row.model === '-' || row.code === 'PULL_REQUEST_REFUSED' || (row.code === 'UNREACHABLE' && row.served !== true);

/** The kind each template's caller writes on its row, for the row `run` writes for an attempt its walk passed over. */
const KINDS: Readonly<Record<PromptId, CallKind>> = {
  predicate: 'read',
  propose: 'propose',
  pattern: 'pattern',
  answer: 'read',
  setup: 'read',
  mapping: 'read',
  chat: 'read',
  turn: 'read',
};

/** A throw the host marked as a ceiling saying no before anything was sent: true of every candidate after it too. */
const budgetIn = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'SLASH_BUDGET_SPENT';

/**
 * The provider's words a throw carried, for its row: `why` and `raw` as the hosts mark a throw (`apps/worker/src/slash.ts`
 * `Reached`), scrubbed (`scrubWords`) and cut. A model its provider does not serve is written with `NOT_SERVED` first,
 * which is what `pausedFor` reads back (`paused.ts`); a throw that carries no `why` is read from its sentence, as the
 * host router reads a refusal's.
 */
export const thrownRaw = (thrown: unknown): string | undefined => {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const { why, raw, message } = thrown as { why?: unknown; raw?: unknown; message?: unknown };
  const said = typeof raw === 'string' ? scrubWords(raw) : '';
  const notServed = typeof why === 'string' ? why === NOT_SERVED : typeof message === 'string' && message.includes(NOT_SERVED);
  if (notServed) return (said === '' ? NOT_SERVED : `${NOT_SERVED}: ${said}`).slice(0, RAW_MAX);
  return said === '' ? undefined : said.slice(0, RAW_MAX);
};

/** A throw the host marked as nothing sent at all (`sent: false`, as `answer.ts` reads it). */
const sentNothing = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { sent?: unknown }).sent === false;

/**
 * Whether the walk passes an attempt over and asks the next candidate.
 *
 * ONLY A MODEL THAT DID NOT ANSWER: a throw with no `answered` mark, which settles as `UNREACHABLE` and spends nothing. An
 * answer, a reply that broke the schema, a throw marked `answered` (it counts once and is final) and a budget refusal all
 * end the walk, so no ask is answered twice and no refusal true of every model is asked of each.
 */
const passedOver = (ran: Ran, thrown: unknown): boolean =>
  !ran.served && refusedWith(ran.out) === 'UNREACHABLE' && !budgetIn(thrown);

const refusedWith = (out: Result<unknown>): string | undefined => ('refusal' in out ? out.refusal.code : undefined);

/**
 * `priced` IS THE HOST'S ANSWER TO WHOSE NEURONS EACH TIER SPENDS, and `['a']` is `46 §4.1`'s. `tiers` IS ITS ANSWER TO
 * WHICH TIERS IT RUNS AT ALL. See `SlashOptions` in `index.ts` for the host that answers otherwise. `route` IS ITS ROUTER,
 * the candidates `run` walks before a caller's rules speak; absent, every ask goes to its template's model.
 */
export const core = (
  sql: Sql,
  clock: Clock,
  fallback: Inference,
  priced: readonly Tier[] = ['a'],
  tiers: readonly Tier[] = TIERS,
  route?: SlashRoute,
): Core => {
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
      row.purpose,
      unspent(row) ? 'none' : row.spends,
      row.route ?? null,
      row.candidate ?? null,
      row.raw ?? null,
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
      `${held ? 'INSERT OR REPLACE' : 'INSERT'} INTO slash_call (${CALL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    /** One model asked once: what came back, read against the schema, and the throw, where there was one, for the walk. */
    const ask = async (model: string, inference: Inference, t0: number): Promise<{ ran: Ran; thrown?: unknown; streamed?: boolean }> => {
      let reply;
      const call = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        maxTokens: template.maxTokens,
        jsonSchema: schema,
      } as const;
      /* STREAMED WHERE THE CALLER WANTS THE TEXT AS IT COMES AND THE ADAPTER CAN SEND IT; the reply at the end is the same
         whole reply `complete` answers, so what follows reads it exactly as before. */
      const onText = args.onText;
      let sofar = '';
      try {
        reply =
          onText !== undefined && inference.stream !== undefined
            ? await inference.stream(call, (piece) => {
                if (typeof piece !== 'string' || piece === '') return;
                sofar += piece;
                onText(sofar);
              })
            : await inference.complete(call);
      } catch (e) {
        /* A PROVIDER THAT DID NOT ANSWER IS NOT A REFUSAL ABOUT THE ASK, and saying `PROPOSAL_SCHEMA`
           here would send a person looking at their question for a fault that is in the network. The
           estimate is billed as `tokens_in` so a month of outages is visible in the meter. `answer`
           settles that row under `-`, so there it keeps `tokens_in` and no neurons (`asksUsed`), unless the
           host marked the throw `reached`, and then `answer` settles it as `read` does, under the model's name. */
        /* A STREAM THAT BROKE OFF AFTER ITS FIRST WORDS CAME FROM A MODEL THAT RAN, whatever the throw says: it is served,
           and its output is what arrived, estimated as the prompt is, where the throw carries no count of its own. */
        const streamed = sofar !== '';
        const told = streamed ? (e as { usage?: { in?: unknown; out?: unknown } } | null)?.usage : undefined;
        const ran: Ran = {
          model,
          ms: clock.now() - t0,
          usage:
            told !== undefined && typeof told.in === 'number' && typeof told.out === 'number' && told.in > 0
              ? { in: Math.ceil(told.in), out: Math.max(Math.ceil(told.out), tokens(sofar)) }
              : { in: estimate, out: streamed ? tokens(sofar) : 0 },
          /* THE HOST'S `answered` MARK, read structurally as `answer.ts` reads it (`heardIn`): the endpoint answered and
             the reply was too large, unreadable or cut off, or the clock ran out on a model that may have run to the end. */
          served: streamed || (typeof e === 'object' && e !== null && (e as { answered?: unknown }).answered === true),
          out: no(
            'UNREACHABLE',
            `The model did not answer${e instanceof Error && e.message !== '' ? `: ${e.message}` : ''}. Nothing was filed; ask again.`,
          ),
        };
        return { ran, thrown: e, streamed };
      }

      const usage = reply.usage;
      const ms = clock.now() - t0;

      let parsed: unknown;
      try {
        parsed = JSON.parse(reply.text);
      } catch {
        return { ran: { model, ms, usage, served: true, out: no('PROPOSAL_SCHEMA', 'The model did not answer with JSON. Nothing was filed; ask again.') } };
      }

      const fault = checkSchema(schema, parsed);
      if (fault) return { ran: { model, ms, usage, served: true, out: { ok: false, refusal: fault } } };
      if (!isRecord(parsed))
        return { ran: { model, ms, usage, served: true, out: no('PROPOSAL_SCHEMA', 'The model did not answer with an object. Nothing was filed; ask again.') } };

      return { ran: { model, ms, usage, served: true, out: ok(parsed) } };
    };

    /* THE WALK, only where the host handed a route and the ask is the template's own: his own key (`b`) and a
       model he named are his choice and never fall to another, so either is asked as before. No route, or an empty one,
       is the one call this function always made. */
    /* A TEMPLATE THAT SAYS IT IS NEVER WALKED (`walks: false`, the conversation's turn) is asked on its own model too. */
    const walk = route === undefined || template.walks === false || model !== template.model || settings().tier === 'b' ? [] : route(template.purpose);
    if (walk.length === 0) return (await ask(model, args.inference ?? fallback, t0)).ran;

    let start = t0;
    for (const [i, candidate] of walk.entries()) {
      const final = i === walk.length - 1;
      /* A CANDIDATE THAT KEEPS FAILING IS SKIPPED AT ONCE, read from its own last rows (`paused.ts`), and the skip is one
         row under `-` that spends nothing and says why. THE LAST CANDIDATE IS NEVER SKIPPED, so an ask always reaches a
         model, and a candidate with no handle has no rows of its own to read and is asked. */
      if (!final && candidate.id !== undefined) {
        const why = pausedFor(sql.all<LastRow>(LAST_ROWS_SQL, candidate.id, candidate.model), clock.now());
        if (why !== null) {
          account({
            id: ulid(clock.now()),
            kind: KINDS[args.id],
            tier: settings().tier,
            model: '-',
            usage: { in: 0, out: 0 },
            ms: 0,
            status: 'nothing',
            code: 'UNREACHABLE',
            purpose: template.purpose,
            spends: 'none',
            served: false,
            candidate: candidate.id,
            raw: PASSED_WORDS[why],
          });
          continue;
        }
      }
      const { ran, thrown, streamed } = await ask(candidate.model, candidate.inference === undefined ? (args.inference ?? fallback) : (args.watch?.(candidate.inference) ?? candidate.inference), start);
      const raw = thrown === undefined ? undefined : thrownRaw(thrown);
      const tried: Ran = candidate.id === undefined ? ran : { ...ran, candidate: candidate.id, ...(raw === undefined ? {} : { raw }) };
      /* A CANDIDATE WHOSE WORDS HAVE STARTED ENDS THE WALK: the caller may have shown them, and a second model's would follow. */
      if (final || streamed === true || !passedOver(ran, thrown)) return tried;
      /* THE ATTEMPT PASSED OVER IS ITS OWN ROW, under its own model and a fresh id, so the ledger holds one row an attempt
         and the caller's row is the attempt that ended the walk. It spends nothing (`unspent`), and its neurons are its
         model's, as a caller's `UNREACHABLE` row's are. A throw the host marked as nothing sent is under `-`. */
      account({
        id: ulid(clock.now()),
        kind: KINDS[args.id],
        tier: settings().tier,
        model: sentNothing(thrown) ? '-' : candidate.model,
        usage: ran.usage,
        ms: ran.ms,
        status: 'error',
        code: 'UNREACHABLE',
        purpose: template.purpose,
        spends: 'none',
        served: false,
        candidate: candidate.id,
        /* THE PROVIDER'S WORDS, so a model it does not serve reads back as that and is passed over for a day. */
        raw,
      });
      start = clock.now();
    }
    /* NOT REACHED: the last candidate always returns above. */
    throw new Error("Slash's route offered no model to ask.");
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
       left under `<ask_id>:propose` (`reserve`'s `id` parameter, just above).

       AND WHOSE ASK IT IS IS WHAT THE ROW SAYS, since version 3. The count read `kind IN ('read', 'pattern')`,
       so a pattern the record drafted for itself, a headline and a reading of who is who each spent one of his 80 on the
       included model (`test/spends.test.ts`). It reads `spends = 'person'` now, which the caller wrote with the row, and
       an attempt no model answered says `none` there whatever name it is under (`unspent`). `COUNT_3` says why the tier
       and `-` are still in it. */
    asksUsed: () => sql.one<{ n: number }>(COUNT_3, monthOf(clock.now(), 0))?.n ?? 0,
    backgroundUsed: (purpose) =>
      (purpose === undefined
        ? sql.one<{ n: number }>(BACKGROUND_3, monthOf(clock.now(), 0))
        : sql.one<{ n: number }>(`${BACKGROUND_3} AND purpose = ?`, monthOf(clock.now(), 0), purpose)
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
    reserve: (kind, tier, model, charge, id) => {
      const held = id ?? ulid(clock.now());
      sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, purpose, spends)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING', ?, ?)`,
        held,
        now(),
        kind,
        tier,
        model,
        charge.purpose,
        charge.spends,
      );
      return remember(held);
    },
    /* AND THE ID IS FORGOTTEN WITH ITS HOLD: every caller releases in a `finally`, after its last `account`. */
    release: (id) => {
      minted.delete(id);
      sql.exec("DELETE FROM slash_call WHERE id = ? AND code = 'SLASH_PENDING'", id);
    },
    /* AND IT SPENDS NOTHING AND SAYS WHAT WAS TURNED AWAY, a person's ask unless the caller says otherwise.
       `TURNED_AWAY_SQL` writes `ask` and `none` itself, as the host's restated insert does (its test holds the two to
       one shape, `packages/host/test/slash-turned-away.test.ts`); any other purpose is said in a second statement. */
    turnedAway: (kind, tier, purpose = 'ask') => {
      const id = ulid(clock.now());
      sql.exec(TURNED_AWAY_SQL, id, now(), kind, tier);
      if (purpose !== 'ask') sql.exec('UPDATE slash_call SET purpose = ? WHERE id = ?', purpose, id);
    },
    account,
    run,
    routeOf: (purpose) => (route === undefined || settings().tier === 'b' ? [] : route(purpose)),
  };
};
