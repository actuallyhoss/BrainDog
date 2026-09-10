/**
 * The kernel: the typed record, and the only thing that writes a row.
 *
 * WHAT IT IS FOR. Everything above it — the RPC surface, the MCP tools, the web app — is a way of
 * asking. This is the thing that decides whether the answer changes the record, and it decides in
 * ONE synchronous transaction, because a write that is half applied is a record somebody has to
 * repair by hand and cannot.
 *
 * THE WRITE PATH IS A SEQUENCE AND ITS ORDER IS THE DESIGN. Resolve, coerce, validate, transition,
 * persist, record. Nothing writes a row until every check has passed, so a refusal is a value
 * returned from a transaction that never began to change anything — which is what lets a refusal
 * carry a sentence instead of a stack trace.
 *
 * EVERY WRITE LEAVES AN EVENT. Not for audit theatre: `MAX(event.rowid)` IS the record's version,
 * so "what changed since I last looked" is a range scan rather than a diff, and a row's history is
 * the rows that made it rather than a reconstruction.
 */

import type { Clock, Refusal, Result, Scheduler, Sql } from '@braindog/ports';
import { clash, fixOf, no, ok, refused } from '@braindog/ports';

import { coerce, isAbsent, instant, parseSpoken, type FieldDecl, type Json } from './coerce.ts';
import { attempt } from './tx.ts';
import { ulids, type Mint } from './ids.ts';
import { FORMAT_VERSION, applyMigrations, schemaRefusal, type SchemaState } from './migrate.ts';
import { jsonPath, compile, fieldSql, type Predicate, type Schema } from '@braindog/where';
import { installDeclarations, jcs, retireDeclarations, stageDeclarations, type Declaration } from './declare.ts';
import { project, projectedText, rebuild, search as ftsSearch, type Hit } from './fts.ts';
import { checkDogl, exportDogl, importDogl, signDogl, type Section, type Signer } from './dogl.ts';
import {
  drainSchedule,
  due,
  pendingWork,
  reschedule,
  retryHandler,
  type Drained,
  type Handler,
  type Remindable,
  type ScheduleKind,
} from './schedule.ts';
import { ack, enqueue, lease, type Ack, type AckDeps, type OutboxKind } from './outbox.ts';
import { access, invite, members, remove, type Level as MemberLevel, type Member, type MemberDeps, suspend } from './members.ts';
import {
  SCOPES,
  createToken,
  listTokens,
  revokeToken,
  verifyToken,
  type Minted,
  type Scope,
  type TokenDeps,
  type TokenRow,
  type Verified,
} from './token.ts';
import {
  decide,
  getGovernance,
  listGovernance,
  propose as openSuggestion,
  reopen,
  type Decided,
  type GovernDeps,
  type GovernRegister,
  type Proposal,
  type Verdict,
} from './govern.ts';
import { createRecord, purge, recordIdentity, type CreateRecordArgs, type Provisioned } from './provision.ts';
import { evaluateMetric, predicateOf, scorePrediction, snapshot, type EvalContext, type MetricDecl, type Reading } from './metrics.ts';
import { readBlock, readPage, registersOf, registersOfBlock, resolvePages, type BlockResult, type PageBlock, type PageDecl, type PageDeps, type PageResult } from './pages.ts';
import {
  carryingOf,
  headline,
  nextOccurrence,
  noteEvent,
  notify,
  runDigest,
  sectionsOf,
  sendDigest,
  twoSentences,
  type Assembled,
  type DigestDecl,
  type DigestDeps,
} from './digest.ts';
import { CREATE_CEILING, applyRule, dryRun, marker, runRules, type Applied as RuleApplied, type DryRun, type RuleDecl, type RulesDeps } from './rules.ts';
import { runway, type Leg, type Runway } from './forecast.ts';
import { arrive, propose, shapeOf, type Arrival, type Arrived, type IngestDecl, type IngestDeps } from './ingest.ts';
import { analyse, observe, type Analysis, type Observation } from './observe.ts';
import { applyPull, firePull, type PullDecl, type PullDeps } from './pull.ts';
import {
  bindGrant,
  getGrant,
  listGrants,
  openGrant,
  revokeGrant,
  rotateDue,
  type BindGrantArgs,
  type GrantRow,
  type SealedGrant,
  type VaultDeps,
} from './vault.ts';
import { sparkMayWrite } from './spark.ts';

export { FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS, canon, checksum, statements } from './migrate.ts';
export { checkDogl, keyIdOf, b64url, manifestBytes, signDogl, type Signature, type Signer } from './dogl.ts';
export { SPARK, SPARK_KINDS, sparkMayWrite } from './spark.ts';
export { coerce, FIELD_TYPES, instant, isAbsent, isJsonQuoted, hasEscapedNewline, isRealDay, parseSpoken, spoken } from './coerce.ts';
export type { FieldDecl, FieldType, Json } from './coerce.ts';
export { isUlid, ulids, ulidTime } from './ids.ts';
export { digest, indexesFor, indexName, jcs, registerOfIndex, validate as validateDeclaration, KINDS } from './declare.ts';
export { ftsQuery, projectedText } from './fts.ts';
export { TRAVELS, decode, encode, projection, tables } from './dogl.ts';
export { atMs, expandRepeat, offsetMs, remindersFor, shiftFrom } from './schedule.ts';
export type { Remindable, Repeat, Reminder } from './schedule.ts';
export type { ImportReport, Section, TableShape } from './dogl.ts';
export { EVENT_KINDS, isEventKind } from './events.ts';
export type { EventKind } from './events.ts';
export { OUTBOX_KINDS, backoffMs, summary } from './outbox.ts';
export type { Ack, OutboxKind, OutboxRow } from './outbox.ts';
export { SCHEDULE_KINDS, drainSchedule, retryHandler } from './schedule.ts';
export type { CreateRecordArgs, Provisioned, Purged, WrappedKey } from './provision.ts';
export { GRANT_KINDS, spanMs } from './vault.ts';
export { AGGREGATIONS, deltaFrom, evaluateMetric, meets, scorePrediction, snapshot, targetOf, windowMs } from './metrics.ts';
export { fill, readBlock, readPage, resolvePages, slugify } from './pages.ts';
export {
  CHANNELS,
  carryingOf,
  headline,
  inQuietHours,
  localParts,
  nextOccurrence,
  render,
  runDigest,
  sectionsOf,
  sendDigest,
  twoSentences,
} from './digest.ts';
export { CREATE_CEILING, applyRule, dryRun, fill as fillTemplate, marker, order as orderRules, runRules } from './rules.ts';
export { runway } from './forecast.ts';
export { BODY_KINDS, GOVERNANCE } from './govern.ts';
export { SCOPES, DEFAULT_DAYS as TOKEN_DAYS } from './token.ts';
export { LEVELS as MEMBER_LEVELS, RECORD as WHOLE_RECORD } from './members.ts';
export type { Member } from './members.ts';
export type { Minted, Scope, TokenRow, Verified } from './token.ts';
export type { Decision, Decided, Proposal, Suggestion, Verdict, GovernRegister, BodyKind } from './govern.ts';
export { CHANNELS as INGEST_CHANNELS, CONFIDENCES, PROPOSE_AT, arrive, day as ingestDay, extract as extractField, resolve as extractOutcome, shapeOf } from './ingest.ts';
export { SIGNALS, WINDOWS, analyse, findingsFrom, observe } from './observe.ts';
export { FLOOR_MS, applyPull, checkInterval, firePull, intervalMs, jitterMs } from './pull.ts';
export type { Fired as PullFired, PullDecl, PullDeps } from './pull.ts';
export type { Analysis, Counted, Finding, Observation, Signal } from './observe.ts';
export type { Arrival, Arrived, Confidence, Extracted, Extractor, FieldOutcome, IngestDecl, IngestDeps } from './ingest.ts';
export type { ForecastDeps, Leg, Runway, Step } from './forecast.ts';
export type { DryRun, Fired, RuleAction, RuleDecl, RulesDeps, RulesOutcome } from './rules.ts';
export type { Assembled, Channel, DigestDecl, DigestDeps, DigestPart, DigestSection, Sent } from './digest.ts';
export type { BlockResult, PageBlock, PageDecl, PageDeps, PageResult } from './pages.ts';
export type { Aggregation, EvalContext, MetricDecl, Reading, Scored, Snapshot, Value } from './metrics.ts';
export type { BindGrantArgs, GrantKind, GrantRow, SealedGrant } from './vault.ts';
export type { Claimed, Drained, Handler, ScheduleKind } from './schedule.ts';
export type { Hit } from './fts.ts';
export type { Declaration, DeclKind, Installed } from './declare.ts';

/* ── what a register says about itself ───────────────────────────────────── */

export type RegisterDecl = {
  id: string;
  name: string;
  /** The field whose value is the row's title — what a search matches and a `ref` displays. */
  title: string;
  fields: readonly (FieldDecl & {
    required?: boolean;
    unique?: boolean;
    immutable?: boolean;
    derived?: boolean;
    retired?: boolean;
    default?: Json;
    /**
     * Never write this field's VALUES into the ledger, only that it changed.
     *
     * `secret` AND `money` ARE ON THE LIST WITHOUT ASKING. An audit log is read by everybody who
     * can read the record, and a per-field history of what somebody was paid is a salary disclosed
     * to the whole team by the feature that exists to make the record trustworthy.
     */
    redact?: boolean;
  })[];
  /** The enum field mirrored onto `entry.state`, when the register has one. */
  state?: string;
  /** The states that mean finished. A row in one is `done` to every reader. */
  done?: readonly string[];
  /** A series has no spoken number: its rows are points, and nobody says a point out loud. */
  series?: boolean;
};

export type Entry = {
  id: string;
  register: string;
  seq: number | null;
  fields: Record<string, Json>;
  state: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Patch = Record<string, unknown>;

export type WriteContext = {
  /** Who. `p_…` for a person, a mechanism name for the record's own paths. */
  actor: string;
  /** One sentence a person reads in six weeks. Not a commit message. */
  note?: string;
  /** Compare-and-set. A write against a stale version is refused, never merged. */
  version?: number;
  /** Groups the events of one write, and of a rule's re-entry into it. */
  batch?: string;
  /**
   * The caller's own id for this write.
   *
   * A REPLAY RETURNS THE ORIGINAL RESULT rather than writing again. An agent that retries a request
   * whose answer it did not receive is the ordinary case, and without this the retry is a second
   * row — the duplicate-invoice failure, from the client side.
   */
  opId?: string;
  /**
   * Whether the rules pass runs after this write. `false` is what a rule's own write carries.
   *
   * A RULE IS ONE STEP. One rule cannot trigger another, so nothing here loops — every product that
   * allowed it grew a depth limit and then a graph explorer to explain the depth limit.
   */
  cascade?: boolean;
  /**
   * Field ids beginning `_`, written by the kernel and never by a caller.
   *
   * A GENERATED ROW HAS TO SAY WHAT GENERATED IT, or a rule that runs twice makes the size run
   * twice. `_rule`, `_parent` and `_each` are the tuple under `entry_created_by`, and stamping them
   * here rather than letting them through `patch` is what keeps "a caller may not write `_x`" true
   * while the record still can.
   */
  stamp?: Record<string, Json>;
};

const RESERVED = new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'version', 'spoken', 'title']);

/* ── the record ──────────────────────────────────────────────────────────── */

export type Kernel = ReturnType<typeof makeKernel>;

/**
 * What a record is opened with, beyond its storage and its clock.
 *
 * THE FACTOR TABLES ARE HANDED IN rather than stored, because `08` §2.5's mechanism is an `fx`
 * REGISTER — rows in the record, read by a lookup — and a named literal table is the small version
 * of that for the cases where a handful of constants is the whole truth. A ninth declaration kind
 * would have been a departure from the eight the specification names.
 */
export type RecordOptions = {
  lookups?: Record<string, Record<string, number>> | undefined;
  /**
   * The outbox kinds this deployment can deliver. Absent is all of them.
   *
   * THE DOORBELL RINGS FOR WORK SOMEBODY CAN DO. Without it, one `infer.draft` on a deployment with
   * no Spark made every subsequent write for the life of the record ring the queue and buy a lease
   * pass that claimed nothing.
   */
  delivers?: readonly OutboxKind[] | undefined;
  /**
   * What signs an exported file, when this deployment holds a signing key.
   *
   * IT IS A CALLBACK AND NOT A KEY. `12 §6` puts the key hierarchy in the host and the kernel holds
   * sealed bytes it cannot open, so the shape is: the kernel makes the bytes, something outside
   * signs them, and `signDogl` joins the two. Nothing in this package can sign anything, and
   * nothing in it can be made to by passing it the wrong argument.
   *
   * ABSENT MEANS THE FILE IS UNSIGNED, and `41 §5.11` step 3 will not import it — which is the
   * honest state of a deployment with no key rather than a special case. A record that cannot sign
   * cannot make a file anybody can verify, and saying so at export is better than at import.
   */
  sign?: Signer | undefined;
};

export async function openRecord(sql: Sql, clock: Clock, opts: RecordOptions = {}): Promise<Kernel> {
  const { state } = await applyMigrations(sql, clock);
  return makeKernel(sql, clock, state, opts);
}

function makeKernel(sql: Sql, clock: Clock, state: SchemaState, opts: RecordOptions) {
  const mint: Mint = ulids(() => clock.now());
  /* Bound here because `export`'s own parameter is called `opts` too, and a signer read off the
     wrong one is a file that silently goes out unsigned. */
  const signer = opts.sign;
  let depth = 0;

  /** The active declarations, parsed once. Rebuilt when a declaration changes and never otherwise. */
  let registers = new Map<string, RegisterDecl>();

  function reload(): void {
    registers = new Map();
    const rows = sql.all<{ id: string; body: string }>(
      "SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0",
    );
    for (const row of rows) {
      const decl = JSON.parse(row.body) as RegisterDecl;
      /**
       * TWO SPELLINGS OF ONE FLAG, MADE ONE HERE, and until now only one of them did anything.
       *
       * `02 §1` publishes a register-level `search: [field, field]`, and `declare` validates it
       * carefully: the names must exist and each type must be one the index can take, with its own
       * refusal for a `money` field named there. Then nothing read it. The projection asks each
       * field for its own `search: true` flag, so a register declared the documented way was
       * indexed on nothing and its rows were findable by no text at all, with every check green.
       *
       * NORMALISED WHERE THE DECLARATION BECOMES THE REGISTER, rather than at the two places that
       * project, because a rule applied at some of its readers is the shape this defect already
       * has. Downstream still reads `f.search` and needs to know nothing about the other spelling.
       */
      const said = (decl as unknown as { search?: unknown }).search;
      const named = Array.isArray(said) ? (said as string[]) : null;
      if (named)
        decl.fields = decl.fields.map((f) => (named.includes(f.id) ? { ...f, search: true } : f)) as typeof decl.fields;
      registers.set(decl.id, decl);
    }
  }
  reload();

  /**
   * One transaction, and a re-entrant call runs inside its caller's.
   *
   * `33-CONTRACTS` §1 says the driver never nests, so the depth counter is here: a rule writing a
   * row from inside a write shares that write's transaction, and its events share the batch.
   */
  const transaction = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    return sql.transactionSync(() => {
      depth++;
      try {
        return fn();
      } finally {
        depth--;
      }
    });
  };

  /**
   * The next number for a counter.
   *
   * IN A TRANSACTION ONLY, and it throws otherwise: a number allocated in a call that then refuses
   * is a number that is gone, and a register whose numbering has holes is one people stop trusting.
   * A purged row's number is never reissued either — the counter travels in the export.
   */
  function allocate(name: string): number {
    if (depth === 0) throw new TypeError(`allocate(${name}) outside a transaction`);
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    const row = sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name);
    if (!row) throw new TypeError(`counter ${name} vanished mid-transaction`);
    return row.n;
  }

  const hydrate = (row: Record<string, unknown>): Entry => ({
    id: String(row.id),
    register: String(row.register),
    seq: row.seq === null || row.seq === undefined ? null : Number(row.seq),
    fields: JSON.parse(String(row.fields ?? '{}')) as Record<string, Json>,
    state: row.state === null || row.state === undefined ? null : String(row.state),
    version: Number(row.version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
  });

  const COLUMNS = 'id, register, seq, fields, state, version, created_at, updated_at, deleted_at';

  function byId(id: string, includeDeleted = false): Entry | null {
    const row = sql.one<Record<string, unknown>>(`SELECT ${COLUMNS} FROM entry WHERE id = ?`, id);
    if (!row) return null;
    const entry = hydrate(row);
    return !includeDeleted && entry.deleted_at ? null : entry;
  }

  function bySeq(register: string, seq: number, includeDeleted = false): Entry | null {
    const row = sql.one<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM entry WHERE register = ? AND seq = ?`,
      register,
      seq,
    );
    if (!row) return null;
    const entry = hydrate(row);
    return !includeDeleted && entry.deleted_at ? null : entry;
  }

  /** A row, addressed the way the caller happens to have it. */
  function get(ref: string | { register: string; seq: number }, opts: { includeDeleted?: boolean } = {}): Entry | null {
    if (typeof ref !== 'string') return bySeq(ref.register, ref.seq, opts.includeDeleted);
    const said = parseSpoken(ref);
    return said ? bySeq(said.register, said.seq, opts.includeDeleted) : byId(ref, opts.includeDeleted);
  }

  /**
   * Who last touched this row.
   *
   * FOR THE ONE ANSWER THAT HAS TO NAME SOMEBODY. A 409 telling a person "this changed" and not who
   * changed it is a dead end — they cannot ask, and they cannot tell a colleague's edit from a
   * rule's. The event log already knows, and this is the only question asked of it on a hot path.
   *
   * `null` WHEN THE LOG CANNOT SAY, which happens for a row written before the per-field history and
   * for an imported record. The caller supplies the honest fallback rather than this inventing one.
   */
  const lastActor = (id: string): string | null =>
    sql.one<{ actor: string }>('SELECT actor FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${id}`)
      ?.actor ?? null;

  const count = (register: string): number =>
    Number(
      sql.one<{ n: number }>('SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', register)?.n ?? 0,
    );

  /**
   * A page of rows, newest first.
   *
   * The cursor is the last row's `updated_at` and `id` together, and both are needed: a cursor on
   * the timestamp alone loses every row that shares a millisecond with the page boundary, which on
   * an import is most of them.
   */
  /** What a predicate is checked against: the register's own fields, and nothing else. */
  /**
   * The register as a predicate reads it.
   *
   * `to` TRAVELS WITH A REF, because a sentence names one BY NAME — `thing is Kiln` — and the parser
   * needs to know which register to look the name up in. Leaving it out made every ref in a sentence
   * a refusal saying "there is no row called Kiln", which is true of nothing and helpful to nobody.
   */
  const schemaOf = (register: string): Schema => ({
    register,
    fields: Object.fromEntries(
      (registers.get(register)?.fields ?? [])
        .filter((f) => !f.retired)
        /* THE LABEL TRAVELS WITH THE FIELD, because a page prints its own `where:` back to the
           reader using it: `direction is owed_to_me` is shown as `which way is owed to me`. Without
           it here, that sentence fed back to the record was `FIELD_UNKNOWN`, and seven of the eleven
           filters the shipped pages print could not be read by the record printing them. */
        .map((f) => [
          f.id,
          {
            type: f.type,
            ...(f.values ? { values: f.values } : {}),
            ...(f.to ? { to: f.to } : {}),
            ...(f.label ? { label: f.label } : {}),
          },
        ]),
    ),
  });

  /**
   * A rule or a metric whose predicate cannot be read, refused at INSTALL.
   *
   * A RULE THAT CANNOT BE READ FIRES ON NOTHING, deliberately — the other direction, firing on
   * everything, is what a broken predicate does when nobody checks it. But nothing refused the
   * DECLARATION, so `when: 'level gt 40'` installed cleanly and the rule then did nothing for ever,
   * with no event, no refusal and no way to find out short of noticing that rows are not being
   * tagged. Silence is the one failure this record does not accept anywhere else.
   *
   * BEFORE THE INSTALL, AND AGAINST THE BATCH FIRST, because a rule and the register it is about
   * usually arrive together and the cache is only rebuilt afterwards.
   *
   * `REF_UNKNOWN` IS NOT A DECLARATION ERROR. `owner is Kiln` names a row that may be written
   * tomorrow; every other refusal here is about the grammar or the shape, and those are facts about
   * the declaration whenever it is read.
   */
  /**
   * The schedule rows a batch of declarations earns.
   *
   * ONE ROW PER THING THAT RECURS, KEYED BY THE BARE ID. `forgetPack` deletes by
   * `substr(id, instr(id, '.') + 1)` — `brief`, not `digest.brief` — and this wrote the full form,
   * so the two never intersected: uninstalling a pack left every digest it had earned armed, firing
   * every Monday about a declaration that is gone. `(kind, key)` is the unique index, so `digest`
   * and `metric` cannot collide over one bare name.
   *
   * AND `DO UPDATE` RATHER THAN `DO NOTHING`, which 45 §5.9 calls "the one path 09 §1 demands". The
   * difference is a whole class of silence: a row that has already fired is `done`, and
   * `drainSchedule` claims only `pending` — so with `DO NOTHING` a digest whose row went `done` once
   * (because its declaration was momentarily absent, say) could never be armed again by any number
   * of re-installs, and would simply never send, for ever, with nothing anywhere saying so.
   *
   * THE `WHERE` IS WHAT KEEPS IT FROM BEING A RESET. A `pending` row is one somebody is waiting on,
   * and moving its `due_at` because a pack was re-installed is how a Monday brief silently becomes a
   * Thursday one. Only a row that is finished or given up on is re-armed.
   */
  function armDerived(batch: readonly Declaration[]): void {
    const arm = (kind: string, key: string, payload: unknown, at: number): void => {
      sql.exec(
        `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
         VALUES (?, ?, ?, ?, ?, 'pending', 0)
         ON CONFLICT (kind, key) DO UPDATE
           SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0
           WHERE schedule.state IN ('done', 'failed')`,
        mint(),
        instant(at),
        kind,
        key,
        JSON.stringify(payload),
      );
    };

    /* A TIMEZONE THIS RUNTIME CANNOT READ IS `UTC`, not a `RangeError`. `dog_meta.tz` arrives from an
       import or a restore as easily as from `createRecord`, and `Intl` throws on a zone it does not
       know — out of `install`, after the declarations had already committed, so the caller saw a 500
       for a write that succeeded. */
    let tz = recordIdentity(sql)?.tz ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
    } catch {
      tz = 'UTC';
    }

    for (const decl of batch) {
      const body = decl.body as Record<string, unknown>;
      /* The bare id: `digest.brief` is the declaration and `brief` is the key. */
      const bare = decl.id.slice(decl.id.indexOf('.') + 1);
      if (decl.kind === 'digest' && body.schedule && typeof body.schedule === 'object') {
        const at = nextOccurrence(body.schedule as { day?: string; at: string }, clock.now(), tz);
        if (at !== null) arm('digest', bare, { declaration: decl.id }, at);
      }
      /* A CONNECTOR RUNS FROM THE MOMENT IT IS DECLARED. `25 §9`: "its first `due_at` at install is
         `now`". Nothing wrote a `pull` row — anywhere, in any path — so the reader, the handler and
         the drain dispatcher were all complete and all unreachable, and a bank feed installed,
         printed itself in the diff's CALLS OUT line, and never fetched anything. The three kinds
         above were fixed for exactly this; `pull` was left behind.

         `now` AND NOT `now + every`, because a connector nobody has run is a connector nobody knows
         works: the first fetch is the one that tells you the credential is right. */
      if (decl.kind === 'ingest' && body.channel === 'pull' && typeof body.every === 'string')
        arm('pull', bare, { ingest: bare }, clock.now());

      /* A METRIC WITH `snapshot:` REMEMBERS ITS OWN READINGS. Five past midnight, so the day it is
         about is finished and nothing else is competing for the alarm. */
      if (decl.kind === 'metric' && body.snapshot) {
        const at = nextOccurrence({ at: '00:05' }, clock.now(), tz);
        if (at !== null) arm('snapshot', bare, { metric: typeof body.metric === 'string' ? body.metric : bare }, at);
      }
    }
  }

  function unreadable(batch: readonly Declaration[]): Refusal | null {
    const shape = (register: string): Schema | null => {
      const arriving = batch.find((d) => d.kind === 'register' && (d.body as { id?: unknown }).id === register);
      if (arriving) {
        const fields = ((arriving.body as { fields?: unknown }).fields ?? []) as (FieldDecl & { retired?: boolean })[];
        return {
          register,
          fields: Object.fromEntries(
            fields
              .filter((f) => !f.retired)
              /* The label too, for the reason `schemaOf` gives: a page prints its filter back with
                 it, and a sentence somebody can be shown and cannot type back is not a sentence. */
              .map((f) => [
                f.id,
                {
                  type: f.type,
                  ...(f.values ? { values: f.values } : {}),
                  ...(f.to ? { to: f.to } : {}),
                  ...(f.label ? { label: f.label } : {}),
                },
              ]),
          ),
        };
      }
      return registers.has(register) ? schemaOf(register) : null;
    };

    for (const decl of batch) {
      const body = decl.body as Record<string, unknown>;

      /* EVERY FIELD ID THAT WILL BECOME A JSON PATH, CHECKED AT INSTALL. `validate` in `declare.ts`
         applies the grammar to register and field ids and returns before every other kind — so an
         `ingest`'s `writes.key` and a `rule`'s `link.to.by` were arbitrary strings that reached
         `json_extract(fields, '$.<id>')`, from a declaration a PACK can supply. `jsonPath` throws on
         one now, which is the backstop; this is the check that means it never gets there, said as a
         refusal at the moment somebody could still fix it. */
      /* A LIST OR NOTHING, and a shape that is neither is a refusal rather than a throw. The first
         version of this check spread `body.writes.key` straight into an array literal — so a `key`
         of `5` threw `not iterable` out of `install`, and a `key` of `"ref"` spread into three
         one-letter ids that all passed the grammar and then threw at `arrive`. Three uncaught
         exceptions out of `install`, in the check whose whole thesis is that a refusal is a value. */
      const listed = (v: unknown, at: string): unknown[] | Refusal =>
        v === undefined || v === null
          ? []
          : Array.isArray(v)
            ? v
            : { code: 'DECLARATION_INVALID', fix: `${decl.id}'s ${at} is a list of field ids.`, at };

      const keys = listed((body.writes as { key?: unknown })?.key, 'writes.key');
      if (!Array.isArray(keys)) return keys;
      const actions = listed(body.then, 'then');
      if (!Array.isArray(actions)) return actions;

      const paths = [
        ...keys,
        ...actions.map((a) => (a as { link?: { to?: { by?: unknown } } })?.link?.to?.by).filter((x) => x !== undefined),
        /* THE LOOKUP PATHS TOO. Each `extract.<field>.lookup.by` becomes a JSON path in the `find`
           the ingest runs, and only two of the three were listed here. */
        ...Object.values((body.extract ?? {}) as Record<string, { lookup?: { by?: unknown } }>)
          .map((f) => f?.lookup?.by)
          .filter((x) => x !== undefined),
      ];
      for (const path of paths)
        if (typeof path !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(path))
          return {
            code: 'DECLARATION_INVALID',
            fix: `${decl.id} names ${JSON.stringify(path)} as a field, and a field id is lowercase letters, digits and underscores.`,
            at: 'field',
          };

      const source = typeof body.source === 'string' ? body.source : '';
      const register =
        decl.kind === 'rule'
          ? body.register
          : decl.kind === 'metric' && source.startsWith('register.')
            ? source.slice('register.'.length)
            : undefined;
      const where = decl.kind === 'rule' ? body.when : decl.kind === 'metric' ? body.where : undefined;
      if (typeof register !== 'string') continue;

      const schema = shape(register);
      if (!schema)
        return { code: 'REGISTER_UNKNOWN', fix: `${decl.id} is about ${register}, and there is no such register.`, at: 'register' };

      /* A MISSING `when` SKIPS THE PREDICATE CHECK AND NOTHING ELSE. It used to skip the whole
         block, so a rule with no `when` — which is a legal rule, meaning "every row" — installed
         with no bound, no `once_per`, three axes and a target register nobody has. */
      if (where !== undefined) {
        const said = predicateOf(where as Predicate | string, schema, evalContext());
        const stop = said.bad.find((b) => b.code !== 'REF_UNKNOWN');
        if (stop) return { ...stop, fix: `${decl.id} cannot be read: ${stop.fix}` };
      }

      if (decl.kind === 'rule') {
        const bad = undeclarable(decl.id, body as unknown as RuleDecl, shape);
        if (bad) return bad;
      }
    }
    return null;
  }

  /**
   * What a rule may not declare, refused where a sentence fits.
   *
   * A GENERATOR WITH NO CEILING is how a rules engine fills a ten-gigabyte object overnight, and a
   * `create` that runs on every write of its parent is that failure once a day for ever. Both are
   * facts about the declaration, so both belong here rather than at the thousandth row.
   */
  function undeclarable(id: string, rule: RuleDecl, shape: (register: string) => Schema | null): Refusal | null {
    /* A RULE WITH NO `then` DOES NOTHING, and the pass then read `.some` of `undefined` and threw
       the TRIGGERING WRITE out of the record — across a boundary this package promises nothing
       throws over. Refused where a sentence fits. */
    if (!Array.isArray(rule.then) || rule.then.length === 0)
      return { code: 'REQUIRED_MISSING', fix: `${id} says when, and does not say what it would then do.`, at: 'then' };

    const risky = rule.then.some((a) => 'notify' in a || 'create' in a || 'suggest' in a);
    if (risky && !rule.once_per?.length)
      return {
        code: 'REQUIRED_MISSING',
        fix: `${id} notifies, creates or suggests, and declares no once_per — so it would fire on every write of the row.`,
        at: 'once_per',
      };

    for (const action of rule.then ?? []) {
      if (!('create' in action)) continue;
      const spec = action.create;

      /* AND A `create` THAT IS NOT AN OBJECT REACHED `.register` AND THREW. A declaration arrives as
         JSON from a pack somebody else wrote, so the type is not there at the moment it is read:
         `create: null` was a `TypeError` out of `install`, which is a 500 answering a preview, and
         `create: "obligations"` walked on to look up a register called `undefined`. A refusal is a
         value here as everywhere else, and `declare.ts` raises the same one a few lines later for
         callers that reach it first. */
      if (spec === null || typeof spec !== 'object')
        return {
          code: 'DECLARATION_INVALID',
          fix: `${id} declares a create of ${JSON.stringify(spec)}, and a create names a register and what goes in it.`,
          at: 'then.create',
        };

      const target = shape(spec.register);
      if (!target)
        return { code: 'REGISTER_UNKNOWN', fix: `${id} creates rows in ${spec.register}, and there is no such register.`, at: 'register' };

      /* `04 §5` HAS A CODE FOR THIS AND THIS DID NOT USE IT.
         The table names three: `CREATE_UNBOUNDED` for a `create` with no `bound:`,
         `CREATE_OVER_BOUND` for a declared cardinality past it, and `CREATE_FOREIGN_REGISTER`.
         `declare.ts`'s `createFault` raises the first two under their own names, correctly — and
         this function runs FIRST at install and refused the same two declarations as
         `OUT_OF_BOUNDS`, which is the write path's code for a VALUE outside a field's range. So the
         registry said the code was emitted, `createFault` said the code was emitted, and no caller
         could ever have seen either of them: two correctly-coded checks shadowed by one that was
         not, in the file that runs first.

         AN ABSENT BOUND AND A BOUND OF `"lots"` ARE DIFFERENT FACTS. `42 §4` step 13 puts
         `CREATE_UNBOUNDED` on absence, "before the generic missing-key mapping" — so a bound that
         is present and unusable keeps `OUT_OF_BOUNDS`, which is what it is. */
      if (spec.bound === undefined)
        return {
          code: 'CREATE_UNBOUNDED',
          fix: `${id}: create has no bound. A generator with no ceiling fills the record.`,
          at: 'bound',
        };

      const bound = Math.floor(Number(spec.bound));
      if (!Number.isFinite(bound) || bound < 1 || bound > CREATE_CEILING)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `${id} declares a bound of ${String(spec.bound)}, and a bound is between 1 and ${CREATE_CEILING}.`,
          at: 'bound',
        };

      const each = spec.each ?? [];
      /* TWO IS A MATRIX. Three is a cube, and nobody has ever wanted a cube. */
      if (each.length > 2)
        return { code: 'OUT_OF_BOUNDS', fix: `${id} crosses ${each.length} fields, and two is the most a matrix can be.`, at: 'each' };

      const from = shape(rule.register);
      let cardinality = 1;
      let knowable = each.length > 0;
      const counted: string[] = [];
      for (const field of each) {
        const kind = from?.fields[field] as { type?: string; values?: readonly string[] } | undefined;
        if (!kind)
          return { code: 'FIELD_UNKNOWN', fix: `${id} crosses ${field}, and ${rule.register} has no such field.`, at: 'each' };
        if (kind.type !== 'list' && kind.type !== 'enum')
          /* `MATCH_OP_UNSUPPORTED`, WHICH IS A CODE `30 §6` PUBLISHES, and this said
             `WHERE_OPERATOR_UNSUPPORTED`, which it does not. `refusals.mjs` counts a code the
             registry has not got and holds the total as a budget that may only go down; its own
             notes name this site and the replacement, and call it one line. An `each:` is an
             operator applied to a field whose type does not admit it, which is what
             `MATCH_OP_UNSUPPORTED` is for, and it was never about a `where` operator. */
          return {
            code: 'MATCH_OP_UNSUPPORTED',
            fix: `${id} crosses ${field}, which is a ${String(kind.type)} — only a list or an enum has values to cross.`,
            at: 'each',
          };
        /* AGAINST THE DECLARED CARDINALITY WHERE IT IS KNOWABLE. An enum's values are in the
           declaration, so a bound that its own axes can exceed is a bound that is wrong today
           rather than at the thousandth row.

           A `list` HAS NO DECLARED LENGTH, and multiplying by zero for it turned the whole check
           off — including for `enum × list`, where half of it was knowable. Unknown means the
           check does not apply, not that the product is nothing. */
        if (kind.values?.length) {
          cardinality *= kind.values.length;
          counted.push(`${field} (${kind.values.length})`);
        } else knowable = false;
      }
      if (knowable && cardinality > bound)
        return {
          /* `04 §5`'s own code and its own sentence shape: *"sizes (8) × colours (12) = 96 exceeds
             bound 60"*. This said `OUT_OF_BOUNDS` and read like a field range. */
          code: 'CREATE_OVER_BOUND',
          fix: `${id}: ${counted.join(' × ')} = ${cardinality} exceeds bound ${bound}.`,
          at: 'bound',
        };
    }
    return null;
  }

  function list(q: {
    register: string;
    /**
     * Structured, or as the sentence a person and an agent write.
     *
     * BOTH FORMS OR IT IS TWO LANGUAGES. `direction is owed to me, state is open` is what goes in a
     * declaration; the tree is what the compiler reads. One accepted here and the other not would
     * make a block's `where:` and a caller's `where:` different things with the same name.
     */
    where?: Predicate | string;
    /**
     * What to sort by, and it had no way to be said.
     *
     * `list` ordered by `updated_at DESC, id DESC` and took no order at all, so a page block
     * declaring `order:` was sorted by whatever read it afterwards, over the page it had already
     * been handed. That is a different answer from the one it asked for: "the five largest" is not
     * "five arbitrary rows, sorted". The register grid has the same hole one level up.
     *
     * THE SQL COMES FROM `where`, not from a path built here. `31 §2` is explicit that this package
     * imports `jsonPath` so the index and the predicate are the same string; an `ORDER BY` is the
     * third place that has to hold, and `fieldSql` is now exported for it.
     */
    order?: { field: string; dir?: 'asc' | 'desc' }[];
    limit?: number;
    cursor?: string | null;
    includeDeleted?: boolean;
  }): Result<{ rows: Entry[]; cursor: string | null; matched: number }> {
    const barred = schemaRefusal(state);
    if (barred) return barred;
    if (!registers.has(q.register))
      return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });

    const schema = schemaOf(q.register);
    const said = predicateOf(q.where, schema, evalContext());
    if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

    /* A PREDICATE THAT COULD NOT BE READ RUNS NOTHING. Returning the register would be a list that
       looks filtered and is not, which is the one failure a declarative surface must not have —
       especially when the thing writing most predicates is an agent that cannot see the screen. */
    const c = compile(said.predicate, schema);
    if (c.bad.length) return { ok: false, refusal: c.bad[0]! };

    /* COERCED AT THE EDGE. These arrive from a query string a stranger wrote: `cursor=5` is a number
       by the time `serveApi` has JSON-decoded it, and `.split` on a number threw a TypeError out of
       the route — as did `limit=abc`, which bound NaN to a LIMIT. A refusal is a value here; an
       exception is not. */
    const limit = Math.min(Math.max(1, Math.floor(Number(q.limit)) || 50), 500);
    const deleted = q.includeDeleted === true ? '' : ' AND deleted_at IS NULL';

    /**
     * THE ORDER, AND THE TWO THINGS IT IS REFUSED FOR.
     *
     * A CURSOR AND AN ORDER ARE ONE QUERY OR THE OTHER. The cursor is keyset pagination on
     * `updated_at|id` — that is what the `WHERE (updated_at < ? OR …)` clause below IS — and a
     * different sort key makes the clause select the wrong rows rather than fewer of them. Silently
     * ignoring one of the two would hand back a page that is neither what was asked for nor
     * detectably wrong, which is worse than saying so.
     *
     * AND A FIELD THE REGISTER DOES NOT DECLARE IS NOT A SORT. `json_extract` on an absent key is
     * `NULL` for every row, so an unknown field sorts by nothing at all and looks like the default
     * order with extra steps. `seq` is admitted because it is a column rather than a field, the
     * same exception the column check makes.
     */
    let sort = 'ORDER BY updated_at DESC, id DESC';
    /**
     * COERCED AT THE EDGE, LIKE `limit` AND `cursor` ABOVE, and it was not.
     *
     * `q.order` arrives from a query string: `packages/host` JSON-decodes every value, so the caller
     * chooses the shape as well as the contents. This gated on `q.order?.length` and then iterated,
     * so `?order={"length":1}` passed the gate, threw inside the loop and answered **500**. The
     * argument for coercing the other two is written four lines up and applies here word for word:
     * a refusal is a value at this boundary and an exception is not.
     *
     * AND A DIRECTION THAT IS NOT ONE IS REFUSED RATHER THAN READ AS DESCENDING. `o.dir === 'asc'
     * ? 'ASC' : 'DESC'` takes `descnding`, `1`, `null` and `{}` and sorts the other way: a typo
     * that answers with a correct-looking list in the wrong order, which is the one kind of wrong
     * answer a reader cannot see.
     */
    if (q.order !== undefined && !Array.isArray(q.order))
      return no('VALUE_MALFORMED', 'An order is a list of { field, dir }.', { at: 'order' });
    for (const o of q.order ?? []) {
      if (typeof o !== 'object' || o === null || typeof (o as { field?: unknown }).field !== 'string')
        return no('VALUE_MALFORMED', 'Each part of an order names a field.', { at: 'order' });
      const dir = (o as { dir?: unknown }).dir;
      if (dir !== undefined && dir !== 'asc' && dir !== 'desc')
        return no('ENUM_VALUE_UNKNOWN', `An order is asc or desc, and this one is ${JSON.stringify(dir)}.`, {
          at: 'order',
          allowed: ['asc', 'desc'],
        });
    }
    if (q.order?.length) {
      if (typeof q.cursor === 'string' && q.cursor !== '')
        /* `VALUE_MALFORMED` AT `cursor`, AND IT SAID `WHERE_OPERATOR_UNSUPPORTED` AT `order`, which
           is wrong twice. There is no `where` operator anywhere in this refusal, and the argument
           that cannot be honoured is the CURSOR: an order is a legitimate thing to ask a list for
           and a position in the record's order is not a value a sorted query can carry. The code was
           also outside `30 §6`'s registry, which `refusals.mjs` counts as drift. */
        return no(
          'VALUE_MALFORMED',
          'A cursor pages by when a row last changed, so it cannot also sort by a field. Ask for the whole answer, or page in the record order.',
          { at: 'cursor' },
        );
      const parts: string[] = [];
      for (const o of q.order) {
        if (o.field !== 'seq' && !Object.hasOwn(schema.fields, o.field))
          return no('FIELD_UNKNOWN', `${q.register} has no field called ${o.field}.`, {
            at: 'order',
            allowed: Object.keys(schema.fields),
          });
        const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
        parts.push(o.field === 'seq' ? `seq ${dir}` : `${fieldSql(o.field, schema.fields[o.field]?.type ?? 'text')} ${dir}`);
      }
      /* `id` LAST, ALWAYS. Two rows with the same value have no order otherwise, so the same query
         can return them in two orders on two runs and a reader watching a list re-render sees rows
         swap places for no reason. */
      sort = `ORDER BY ${parts.join(', ')}, id DESC`;
    }

    const [at, afterId] = (typeof q.cursor === 'string' ? q.cursor : '').split('|');
    const page = at
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) AND (updated_at < ? OR (updated_at = ? AND id < ?)) ${sort} LIMIT ?`,
          q.register,
          ...c.params,
          at,
          at,
          afterId ?? '',
          limit + 1,
        )
      : sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) ${sort} LIMIT ?`,
          q.register,
          ...c.params,
          limit + 1,
        );

    /* The MATCHED count is the whole answer, not the page: a reader who cannot see how many rows a
       filter admitted cannot tell a short list from a narrow one. */
    const matched = Number(
      sql.one<{ n: number }>(
        `SELECT count(*) AS n FROM entry WHERE register = ?${deleted} AND (${c.sql})`,
        q.register,
        ...c.params,
      )?.n ?? 0,
    );

    const rows = page.slice(0, limit).map(hydrate);
    const more = page.length > limit;
    const last = rows.at(-1);
    /* AND A SORTED ANSWER HANDS BACK NO CURSOR, because the cursor it would hand back is a position
       in an order this page is not in. `null` says "there is no next page from here", which is true
       of a query that refuses to be paged. */
    const paging = q.order?.length ? null : more && last ? `${last.updated_at}|${last.id}` : null;
    return ok({ rows, matched, cursor: paging });
  }

  /** `MAX(event.rowid)`, which is the record's version: what changed since is a range scan. */
  const version = (): number =>
    Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0);

  /* ── the write path ──────────────────────────────────────────────────── */

  function write(register: string, ref: string | null, patch: Patch, w: WriteContext): Result<Entry> {
    const barred = schemaRefusal(state);
    if (barred) return barred;

    const out = writing(register, ref, patch, w);
    /* THE ONE WRITE A REFUSAL MAKES. Ten of the same refusal in a month across three days means the
       DECLARATION is wrong rather than one caller having a bad afternoon — and a record that threw
       its refusals away could never notice the difference. It is outside the transaction the write
       rolled back, or the observation would roll back with it.

       A CONFLICT IS NOT COUNTED. It is not the declaration being wrong; it is two people editing at
       once, and a detector that counted it would propose changing a field because a record is busy. */
    if (refused(out) && out.refusal.at)
      observe(sql, clock.now(), [{ kind: 'write.refused', subject: `${register}.${out.refusal.at}:${out.refusal.code}` }]);
    return out;
  }

  function writing(register: string, ref: string | null, patch: Patch, w: WriteContext): Result<Entry> {
    return transaction(() => {
      /* STEP ZERO: A REPLAY RETURNS WHAT THE FIRST ATTEMPT RETURNED.
       *
       * An agent that retries a request whose answer it did not receive is the ORDINARY case — a
       * dropped socket, a timeout, a queue redelivery — and without this the retry is a second row.
       * That is the duplicate-invoice failure from the client's side, and `sha256` on the bytes
       * cannot catch it because the second attempt is a different request with the same intent.
       *
       * The id is the caller's, written on the FIRST event row of a write and held unique there, so
       * the replay is one indexed read and the answer is the row as it is now. */
      if (w.opId !== undefined) {
        const already = sql.one<{ target: string }>('SELECT target FROM event WHERE op_id = ?', w.opId);
        if (already) {
          const was = byId(already.target.replace(/^entry:/, ''), true);
          if (was) return ok(was);
        }
      }
      const decl = registers.get(register);
      if (!decl)
        return no<Entry>('REGISTER_UNKNOWN', `There is no register called ${register}.`, {
          allowed: [...registers.keys()],
        });

      const current = ref === null ? null : get(ref, { includeDeleted: true });
      if (ref !== null && !current)
        return no<Entry>('VALUE_MALFORMED', `There is no row ${ref} in ${register}.`, { at: 'id' });
      if (current && current.register !== register)
        return no<Entry>('VALUE_MALFORMED', `${ref} is a row of ${current.register}, not ${register}.`, { at: 'id' });

      /* THE COMPARE-AND-SET, before anything is computed. Last-writer-wins is wrong for money: two
         people editing one invoice must not silently produce one of the two amounts.

         AND IT IS A CONFLICT, NOT A REFUSAL, which is the difference between an answer a caller can
         act on and a sentence it can only show. A refusal says the write was WRONG; this write was
         fine and arrived second. Recovering means re-reading the row and re-applying the patch, and
         as a refusal it carried neither the row nor the name of whoever moved it — so every client
         could do was print a sentence and lose the edit. The body is what makes the 409 a
         instruction: `current` is the row as it now stands, `actor` is who put it there, and a
         caller resends once when their change was disjoint from it (22 §5, 50 §5.3). */
      if (w.version !== undefined && current && w.version !== current.version)
        return clash<Entry>(current.version, current, lastActor(current.id) ?? 'someone else');

      /* Read before the checks, because uniqueness on a restore depends on it. */
      const deleting = patch.deleted_at !== undefined;

      const known = new Map(decl.fields.filter((f) => !f.retired).map((f) => [f.id, f]));
      const merged: Record<string, Json> = { ...(current?.fields ?? {}) };
      const touched: string[] = [];

      /* Defaults first, and on a create only: a default is what a row starts as, not what it
         returns to when somebody clears a field. */
      if (!current)
        for (const f of decl.fields)
          if (f.default !== undefined && patch[f.id] === undefined && !f.derived) merged[f.id] = f.default;

      for (const [key, value] of Object.entries(patch)) {
        if (key === 'deleted_at') continue;
        if (RESERVED.has(key) || key.startsWith('_'))
          return no<Entry>('FIELD_UNKNOWN', `${key} is the record's, not a field you may write.`, { at: key });
        const field = known.get(key);
        if (!field)
          return no<Entry>('FIELD_UNKNOWN', `${register} has no field called ${key}.`, {
            at: key,
            allowed: [...known.keys()],
          });
        if (field.derived)
          return no<Entry>('IMMUTABLE_FIELD', `${key} is derived, so the record computes it.`, { at: key });
        touched.push(key);
        if (value === null) {
          if (field.immutable && current && current.fields[key] !== undefined)
            return no<Entry>('IMMUTABLE_FIELD', `${key} is set once, so it cannot be cleared either.`, { at: key });
          delete merged[key];
          continue;
        }

        const out = coerce(field, value, {
          refId: (reg, seq) => bySeq(reg, seq)?.id ?? null,
          grantExists: (id) => Boolean(sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)),
        });
        if (!out.ok) return { ok: false, refusal: out.refusal };

        /* AFTER COERCION, AND STRUCTURALLY. This compared the RAW patch value against the STORED
           coerced one by identity, so an immutable `money` could never be re-sent — an object is
           never `===` another object — and any client doing a read-modify-write of the whole field
           set was permanently locked out of the row. `'5'` against a stored `5` had the same
           problem in the other direction. */
        if (
          field.immutable &&
          current &&
          current.fields[key] !== undefined &&
          JSON.stringify(current.fields[key]) !== JSON.stringify(out.value)
        )
          return no<Entry>('IMMUTABLE_FIELD', `${key} is set once and cannot be changed.`, { at: key });
        // Absent is one thing, not three: null, "" and [] all remove the key (K2).
        if (isAbsent(out.value)) delete merged[key];
        else merged[key] = out.value;
      }

      /* ── validate ── */
      for (const f of decl.fields) {
        if (f.retired || f.derived) continue;
        const value = merged[f.id];

        if (f.required && value === undefined && (!current || touched.includes(f.id)))
          return no<Entry>('REQUIRED_MISSING', `${register} needs ${f.id}.`, { at: f.id });

        if (value !== undefined && f.type === 'enum' && !f.values?.includes(String(value)))
          return no<Entry>('ENUM_VALUE_UNKNOWN', `${f.id} has no value ${String(value)}.`, {
            at: f.id,
            allowed: f.values ?? [],
          });

        /* A RESTORE TOUCHES NOTHING AND CHANGES EVERYTHING. The row was invisible to the partial
           unique index while it was deleted, so another row may have taken its value — and bringing
           it back raised a raw SQLite constraint error out of the write path and out of `serveApi`,
           which is a promise this package makes in bold two files away. */
        const restoring = deleting && patch.deleted_at === null && current?.deleted_at !== null;
        if (value !== undefined && f.unique && (touched.includes(f.id) || restoring)) {
          const clash = sql.one<{ seq: number | null; id: string }>(
            `SELECT seq, id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${f.id}') = ? AND id <> ?`,
            register,
            value as never,
            current?.id ?? '',
          );
          if (clash)
            return no<Entry>(
              clash.seq === null ? 'UNIQUE_VIOLATION' : 'ALREADY_KNOWN',
              clash.seq === null
                ? `${f.id} is already held by another row.`
                : `${register}#${clash.seq} already has that ${f.id}.`,
              { at: f.id },
            );
        }
      }

      /* ── the state transition, which is the one rule about MOVES ── */
      const nextState = decl.state ? (merged[decl.state] as string | undefined) ?? null : null;
      if (decl.state && current && nextState !== current.state) {
        const field = known.get(decl.state);
        const from = current.state ?? '';
        const legal = (field as { transitions?: Record<string, { to: string[] }> } | undefined)?.transitions?.[from];
        /* CLEARING THE STATE IS A MOVE, and skipping the check for it was a two-step way around
           every transition the register declares: clear it, and the next write starts from `''`,
           for which no transition is declared, so anything is legal. A row cannot leave a state it
           is not allowed to leave by passing through nothing. */
        if (legal && !legal.to.includes(nextState ?? ''))
          return no<Entry>(
            'TRANSITION_ILLEGAL',
            nextState === null
              ? `${register}#${current.seq} is ${from}, and clearing a state is a move like any other.`
              : `${register}#${current.seq} cannot go from ${from} to ${nextState}.`,
            { at: decl.state, allowed: legal.to },
          );
      }

      /* ── persist ── */
      const now = instant(clock.now());
      const deletedAt = deleting ? (patch.deleted_at === null ? null : now) : (current?.deleted_at ?? null);

      /* STAMPED AFTER VALIDATION, because these are the kernel's own fields and no declaration
         describes them — running them through the field loop would refuse every one. */
      if (w.stamp) Object.assign(merged, w.stamp);

      if (!current) {
        const id = mint();
        const seq = decl.series ? null : allocate(`seq:${register}`);
        sql.exec(
          'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
          id,
          register,
          seq,
          JSON.stringify(merged),
          nextState,
          now,
          now,
          deletedAt,
        );
        const entry = byId(id, true)!;
        reproject(entry);
        rediary(entry);
        /* A `create` ROW CARRIES THE WHOLE SHAPE, with `field` null and `to_v` the row as JCS — so
           a replay reconstructs what was written without joining anything, and the redacted fields
           are the string `--redacted--` INSIDE that JSON rather than absent from it. */
        const batch = appendEvent({
          kind: 'create',
          target: id,
          register,
          actor: w.actor,
          note: w.note,
          at: now,
          batch: w.batch,
          field: null,
          to: Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, shown(register, k, v) ?? null])) as Json,
          ...(w.opId === undefined ? {} : { opId: w.opId }),
        });
        return ok(rules(entry, register, w, batch));
      }

      sql.exec(
        'UPDATE entry SET fields = ?, state = ?, version = version + 1, updated_at = ?, deleted_at = ? WHERE id = ?',
        JSON.stringify(merged),
        nextState,
        now,
        deletedAt,
        current.id,
      );
      const entry = byId(current.id, true)!;
      reproject(entry);
      rediary(entry);

      /* ONE ROW PER CHANGED FIELD, and this is the difference between a history and an activity
         feed. A ledger that says a row was edited and not WHAT changed cannot answer the only
         question anybody asks of it — and "append-only" is worth nothing if what was appended is
         "something happened". `state` is its own kind because a move is the one edit a register
         declares rules about; `tag` and `untag` are their own because a list changes by element. */
      const first = deleting
        ? deletedAt
          ? 'delete'
          : 'restore'
        : nextState !== current.state && decl.state
          ? 'state'
          : 'edit';

      let batch = '';
      const write = (kind: string, field: string | null, from: Json | undefined, to: Json | undefined): void => {
        const id = appendEvent({
          kind,
          target: current.id,
          register,
          actor: w.actor,
          at: now,
          /* THE NOTE GOES ON THE FIRST ROW ONLY. It is one thing somebody said about one write, not
             a thing they said about each field. */
          ...(batch === '' && w.note !== undefined ? { note: w.note } : {}),
          batch: w.batch ?? (batch === '' ? undefined : batch),
          field,
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
          ...(batch === '' && w.opId !== undefined ? { opId: w.opId } : {}),
        });
        if (batch === '') batch = w.batch ?? id;
      };

      if (deleting) write(first, null, undefined, undefined);
      else {
        for (const key of touched) {
          const was = current.fields[key];
          const is = merged[key];
          if (JSON.stringify(was ?? null) === JSON.stringify(is ?? null)) continue;

          /* A LIST CHANGES BY ELEMENT. `tags` going from two to three is one `tag` row naming the
             one that arrived, not an `edit` naming both arrays — which is what makes "when was this
             tagged late" a question with an answer.

             AND IT IS THE TYPE THAT DECIDES, NOT THE NAME. This read `key === 'tags' ||` first, so a
             register declaring a `tags` field of any other type took this branch: both sets came out
             empty, neither loop wrote a row, and the `continue` skipped the `edit`. Changing a text
             `tags` from "draft" to "final" alongside another field left the history saying only the
             other field had moved, which is the ledger quietly losing a write. Nothing enforces that
             a field called `tags` is a list, so the name was never a safe stand-in for the type. */
          const of = known.get(key);
          if (of?.type === 'list' && of.of === 'text') {
            const before = new Set(Array.isArray(was) ? was.map(String) : []);
            const after = new Set(Array.isArray(is) ? is.map(String) : []);
            for (const value of after) if (!before.has(value)) write('tag', key, undefined, value);
            for (const value of before) if (!after.has(value)) write('untag', key, value, undefined);
            continue;
          }

          const kind = decl.state && key === decl.state ? 'state' : 'edit';
          write(kind, key, shown(register, key, was) ?? null, shown(register, key, is) ?? null);
        }
        /* A WRITE THAT CHANGED NOTHING IS STILL A WRITE somebody made — a note against a row, or a
           re-send of the same values — and the ledger says so rather than swallowing it. */
        if (batch === '') write(first, null, undefined, undefined);
      }

      return ok(rules(entry, register, w, batch));
    });
  }

  /**
   * Step nine of the write path: the rules pass.
   *
   * INSIDE THE SAME TRANSACTION, so a rule's write and the write that triggered it commit together
   * or neither does — a row tagged `late` by a rule whose own write then failed would be a row
   * carrying a fact about a write that did not happen.
   *
   * The BATCH is the triggering write's event id, shared by everything it caused, so "undo this
   * expansion" is one query rather than an archaeology of timestamps.
   */
  function rules(entry: Entry, register: string, w: WriteContext, batch: string): Entry {
    if (w.cascade === false) return entry;
    if (!sql.one("SELECT 1 AS x FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")) return entry;
    runRules(rulesDeps(), { entry, register, batch, actor: w.actor });
    /* The row as the rules left it. A caller that wrote `state: open` and got back a row a rule
       moved to `late` is being told the truth about what is in the record. */
    return byId(entry.id, true) ?? entry;
  }

  /**
   * Put a row's searchable line in step with the row, IN THE SAME TRANSACTION.
   *
   * An index updated afterwards is wrong for however long "afterwards" takes, and the window is
   * exactly when somebody is looking for the thing they just wrote.
   */
  /**
   * Reminders in step with the row, in the same transaction, on every write.
   *
   * Nobody sets a reminder: a field declares `remind:` and the record derives the rows, so a due date
   * that moves takes its reminders with it. Every product where the reminder is a separate object
   * has the same failure — the invoice slips a week, the reminder does not, and it fires about a
   * date that is no longer true.
   */
  function rediary(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl) return;
    reschedule(
      sql,
      mint,
      { id: entry.id, register: entry.register, fields: entry.fields, deleted: entry.deleted_at !== null },
      decl.fields as readonly Remindable[],
      clock.now(),
    );
  }

  function reproject(entry: Entry): void {
    const decl = registers.get(entry.register);
    if (!decl || decl.series) return;
    const row = sql.one<{ rowid: number }>('SELECT rowid FROM entry WHERE id = ?', entry.id);
    if (!row) return;
    project(
      sql,
      { rowid: row.rowid, id: entry.id, register: entry.register, deleted: entry.deleted_at !== null },
      projectedText(decl.fields, entry.fields),
    );
  }

  /**
   * One event per write.
   *
   * `MAX(event.rowid)` is the record's version, so this is not audit theatre: it is how "what
   * changed since I last looked" is a range scan rather than a diff of two snapshots.
   */
  function appendEvent(e: {
    kind: string;
    target: string;
    register: string;
    actor: string;
    note?: string | undefined;
    at: string;
    batch?: string | undefined;
    field?: string | null | undefined;
    from?: Json | undefined;
    to?: Json | undefined;
    opId?: string | undefined;
  }): string {
    const id = mint();
    /* `30 §3`: a model suggests, proposes and predicts, and writes nothing else into the log. */
    sparkMayWrite(e.actor, e.kind);
    /* `target` carries its KIND — `entry:01J…` — because an event is about a row, a decision, a pack
       or a declaration, and a bare id would make "everything about this" a search of four tables. */
    sql.exec(
      'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch, op_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      e.at,
      e.actor,
      e.kind,
      `entry:${e.target}`,
      'entry',
      e.field ?? null,
      e.from === undefined ? null : written(e.from),
      e.to === undefined ? null : written(e.to),
      e.note ?? null,
      e.batch ?? null,
      e.opId ?? null,
    );
    return id;
  }

  /** A value as the ledger stores it. `null` is "there was no prior value" and is not a string. */
  const written = (value: Json): string | null => (value === null ? null : jcs(value));

  /**
   * Which fields never have their VALUES written down, only the fact that they changed.
   *
   * `secret` AND `money` ALWAYS. An audit log is read by everybody who can read the record, and a
   * per-field history of what somebody was paid is a salary disclosed to the whole team by the
   * feature that exists to make the record trustworthy. Any other field joins the list with
   * `redact: true` on its declaration.
   *
   * WHAT IS KEPT IS WHO, WHEN AND WHICH FIELD — fully auditable — and what is dropped is only the
   * number. `--redacted--` rather than an absent row, so the difference between "not recorded" and
   * "recorded and withheld" is visible.
   */
  const REDACTED = '--redacted--';
  const redacts = (register: string, field: string): boolean => {
    const decl = registers.get(register)?.fields.find((f) => f.id === field);
    return decl ? decl.type === 'secret' || decl.type === 'money' || decl.redact === true : false;
  };
  const shown = (register: string, field: string, value: Json | undefined): Json | undefined =>
    value === undefined ? undefined : redacts(register, field) ? REDACTED : value;

  /** What the evaluator needs beyond SQL: the clock, and the shape of a register. */
  const evalContext = (): EvalContext => ({
    nowMs: clock.now(),
    lookups: opts.lookups ?? {},
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    /* A ref is written by NAME in a sentence — `thing is Kiln` — because that is what a person says.
       The title field is the register's own, so the lookup is one indexed read per name. */
    refByTitle: (register, title) => {
      const decl = registers.get(register);
      if (!decl) return null;
      const row = sql.one<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${decl.title}') = ? LIMIT 1`,
        register,
        title,
      );
      return row?.id ?? null;
    },
  });

  /** What the page layer reads through. It runs queries it did not write, so it takes callbacks. */
  const pageDeps = (): PageDeps => ({
    pages: () =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as PageDecl),
    metric: (id) => {
      const row = sql.one<{ body: string }>(
        "SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0",
        `metric.${id}`,
      );
      return row ? (JSON.parse(row.body) as MetricDecl) : null;
    },
    read: (decl) => evaluateMetric(sql, decl, evalContext()),
    list: (q) => {
      /* AND THE ORDER GOES THROUGH. It was dropped here, silently, which is the one place a
         forwarded query can be wrong without anybody seeing it: the block asked, `list` could
         answer, and this wrapper rebuilt the query without the key. */
      const out = list({
        register: q.register,
        ...(q.where ? { where: q.where } : {}),
        ...(q.limit ? { limit: q.limit } : {}),
        ...(q.order?.length ? { order: q.order } : {}),
      });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    titleOf: (register) => registers.get(register)?.title ?? null,
    runway: (opening, legs, horizon) => {
      const out = runway(
        { sql, schemaOf: (r) => (registers.has(r) ? schemaOf(r) : null), titleOf: (r) => registers.get(r)?.title ?? null, hydrate: (id) => byId(id), ctx: evalContext() },
        opening,
        legs,
        horizon,
      );
      return out.ok ? out.value : null;
    },
    ctx: evalContext(),
  });

  /**
   * What a digest reads through.
   *
   * The same callbacks the page layer takes, plus the two things only a record can answer: who the
   * owners are, and what time it is where the customer is.
   */
  const digestDeps = (): DigestDeps => {
    const deps = pageDeps();
    return {
      metric: deps.metric,
      read: deps.read,
      list: deps.list,
      schemaOf: deps.schemaOf,
      ctx: deps.ctx,
      /* THE OWNERS, BY ADDRESS. A digest with nowhere to go is not sent rather than sent to the
         first person the record can name — which on a shared record would be somebody else. */
      owners: () =>
        sql
          .all<{ email: string | null }>(
            "SELECT p.email FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*' AND m.level = 'owner' AND p.email IS NOT NULL AND p.suspended_at IS NULL",
          )
          .map((r) => String(r.email))
          .filter(Boolean),
      outbox: (kind, payload) => void enqueue(sql, mint, clock.now(), kind, payload),
      note: (actor, text) => noteEvent(sql, mint, clock.now(), actor, text),
      delivers: opts.delivers ?? [],
      /* ONE INTERRUPT AN HOUR, PER RECORD (09 §4). Counted over the outbox rather than over a
         counter somebody has to reset: the row IS the interrupt, so a push that was queued and never
         sent still counts — which is the conservative direction, and the only one that is honest
         about what the person's phone is going to do when the queue drains. */
      interrupted: () =>
        sql.one<{ n: number }>(
          "SELECT count(*) AS n FROM outbox WHERE kind = 'notify.push' AND created > ?",
          instant(clock.now() - 3_600_000),
        )?.n
          ? true
          : false,
      mint,
      nowMs: clock.now(),
      tz: recordIdentity(sql)?.tz ?? 'UTC',
    };
  };

  /**
   * What the rules pass reads and writes through.
   *
   * `write` IS THE SAME WRITE PATH, re-entered. That is the whole design: a rule is a caller like
   * any other, wearing its own name, and every check a person's write answers to it answers to too.
   */
  const rulesDeps = (): RulesDeps => ({
    sql,
    /* THE ONE ROUTER. A rule that declares `urgent` shows in the install diff as "interrupts you",
       and until now that diff was the only reader of the key — 09 §4 is what it should have meant. */
    interrupt: (said) => notify(digestDeps(), { ...said, urgent: true }),
    /* AND THE ONE ACTION THAT REACHES FORWARD IN TIME. `ON CONFLICT (kind, key) DO UPDATE` so a rule
       that fires twice on one row moves the date rather than arming a second reminder — the same
       idempotence `once_per` gives the firing, applied to what the firing arms. */
    later: (key, atMs, payload) =>
      sql.exec(
        `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'rule', ?, ?, 'pending', 0)
         ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
        mint(),
        instant(atMs),
        key,
        JSON.stringify(payload),
      ),
    rules: (register) =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as RuleDecl)
        .filter((r) => r.register === register),
    schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
    ctx: evalContext(),
    /* CASCADE OFF. A rule's write does not run the rules pass again, so one rule cannot trigger
       another and nothing here loops — every product that allowed it grew a depth limit and then a
       graph explorer to explain the depth limit. */
    write: (register, spoken, patch, actor, batch) => write(register, spoken, patch, { actor, batch, cascade: false }),
    /* A GENERATED ROW RE-ENTERS THE WRITE PATH like any other: coerced, validated, transition-checked.
       `cascade: false` is what stops a size run generating a size run. */
    generate: (register, patch, actor, batch, stamp) =>
      write(register, null, patch, { actor, batch, cascade: false, stamp }),
    suggest: (question, options, actor) =>
      openSuggestion(governDeps(), actor, {
        question,
        body_kind: 'options',
        body: {
          options: options.map((label, i) => ({ id: `o${i + 1}`, label, because: 'a rule put this in front of you' })),
          requires_reason: true,
        },
      }),
    note: (entry, actor, text, batch) =>
      void appendEvent({ kind: 'note', target: entry.id, register: entry.register, actor, note: text, at: instant(clock.now()), batch }),
    stateOf: (register) => registers.get(register)?.state ?? null,
    schedule: (key, payload, pending) => marker(sql, mint, clock.now(), key, payload, pending),
    entry: (id) => byId(id),
    mint,
    nowMs: clock.now(),
  });

  /** The weekly look at what the record has noticed. One draft at most, and the governors first. */
  const analyseNow = (): Analysis =>
    analyse({
      sql,
      nowMs: clock.now(),
      mint,
      allocate,
      /* THE DRAFT RIDES THE OUTBOX like everything else that needs a model: the analyser's job ends
         at "this crossed a threshold", and what to propose about it is somebody else's turn. */
      outbox: (payload) => void enqueue(sql, mint, clock.now(), 'infer.draft', payload),
    });

  /** What a connector needs beyond SQL: who this record is, and the one insertion path to the outbox. */
  const pullDeps = (): PullDeps => ({
    sql,
    recordId: recordIdentity(sql)?.id ?? 'self',
    nowMs: clock.now(),
    mint,
    outbox: (payload) => enqueue(sql, mint, clock.now(), 'pull.fetch', payload),
  });

  /** The connector declaration a `pull` row is about, or `null` when it has been retired. */
  const pullDecl = (ingest: string): PullDecl | null => {
    const row = sql.one<{ body: string }>(
      "SELECT body FROM declaration WHERE id = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 0",
      `ingest.${ingest}`,
    );
    return row ? (JSON.parse(row.body) as PullDecl) : null;
  };

  /**
   * What the gate needs: the counters, and the write path for the rows an accepted `rowset` writes.
   *
   * `cascade: true` ON THOSE ROWS, because a row accepted at the gate is a row like any other — the
   * register's rules apply to it, and a rowset that went in with the rules switched off would be a
   * back door into the record wearing a decision's name.
   */
  const governDeps = (): GovernDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    allocate,
    hasRegister: (register) => registers.has(register),
    write: (register, patch, actor, batch) => write(register, null, patch, { actor, batch }),
    /* THE FROZEN BASELINE, read through the one evaluator every figure in this record goes through.
       A prediction's measure is a metric body without a target or a window (24 §4.6) — both are
       supplied here from the prediction's own, which is what makes it gradeable at all. */
    measure: (m, window) =>
      evaluateMetric(
        sql,
        {
          metric: 'prediction',
          name: 'baseline',
          source: m.source,
          ...(m.where === undefined ? {} : { where: m.where as never }),
          value: m.value as never,
          target: { gte: 0 },
          window,
          compare: 'none',
        },
        evalContext(),
      ),
  });

  const memberDeps = (): MemberDeps => ({ sql, nowMs: clock.now(), mint, hasRegister: (r) => registers.has(r) });

  /**
   * What a token needs beyond SQL.
   *
   * THE HASH AND THE RANDOMNESS ARE THE HOST'S, injected rather than imported, because the record
   * has no crypto of its own and a fixture has to be deterministic. `crypto` is on the platform in
   * both hosts and in Node, so this is a seam rather than a dependency.
   */
  const tokenDeps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    recordId: () => recordIdentity(sql)?.id ?? null,
    digest: async (text: string) => {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    random: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
  });

  /** What the two ladders need beyond SQL: an id, the suggestion counter, and one instant. */
  const ackDeps = (): AckDeps => ({
    mint,
    allocate,
    nowMs: clock.now(),
    /* THE GATE, HANDED IN. An `infer.draft` that came back with a question files it through the same
       `propose` a person or a rule uses — one place that decides what a body must contain, one place
       that writes the `suggest` event, and `spark` as the actor because that is who drafted it. */
    propose: (p, actor) => openSuggestion(governDeps(), actor, p as never),
    /* AND THE OTHER HALF OF `prose: spark`. The digest was assembled inside the alarm's transaction
       and parked on this row; the ack is where it leaves. Two sentences at most, capped here rather
       than trusted from the wire — 45 §5.10. */
    sendDigest: (assembled, prose) => sendDigest(digestDeps(), assembled as Assembled, twoSentences(prose)),
  });

  /** The same, plus who is asking and which record this is — the two halves of a `grant.read` row. */
  const vaultDeps = (actor: string): VaultDeps => ({
    mint,
    nowMs: clock.now(),
    actor,
    recordId: recordIdentity(sql)?.id ?? null,
    /* THE ONE ROUTER, HANDED IN. 09 §4's rate limit, 09 §3's split between what a push carries and
       what an email does, and the `note` event, are all one function — and a credential expiring is
       one of the three things 09 §5 makes urgent by default. */
    interrupt: (said) => notify(digestDeps(), { ...said, urgent: true }),
  });

  async function tail(scheduler: Scheduler): Promise<void> {
    try {
      const armed = await scheduler.get();
      /* READ AFTER THE AWAIT, not before it. Reading the minimum first and then awaiting meant two
         overlapping tails — a drain's `finally` and a request's write, which on a Durable Object is
         an ordinary pair — each wrote the minimum it had seen BEFORE the other's rows existed.
         Whichever resumed last won, and in the probe that wrote an alarm four months later than the
         earliest pending row. The alarm was then simply late, by however long the gap was. */
      const work = pendingWork(sql, opts.delivers);
      if (work.nextDueMs === null) {
        if (armed !== null) await scheduler.clear();
      } else if (armed !== work.nextDueMs) await scheduler.set(work.nextDueMs);
    } finally {
      /* And the doorbell asks again too: a job queued while this tail was parked is a job the ring
         is about. */
      if (pendingWork(sql, opts.delivers).outboxPending) await scheduler.wake();
    }
  }

  /**
   * What each kind of schedule row does when its time comes.
   *
   * The one that is not here — `pull` — waits on a subsystem
   * this record does not have yet. A row of one of those kinds fails ONCE with a sentence naming the
   * kind rather than walking eight hours of a ladder, which is the honest behaviour: it says the
   * record cannot do this, instead of looking like it is trying.
   */
  const HANDLERS: Partial<Record<ScheduleKind, Handler>> = {
    retry: retryHandler(sql),

    /* THE HOURLY SWEEP. A hundred rows at a time, and the next hour takes the next hundred — so a
       record that deleted ten thousand rows in one afternoon is swept without holding a write lock
       on the one thread it has. */
    purge: () => {
      purge(sql, clock.now() - 30 * 86_400_000, clock.now(), transaction, mint);
      return clock.now() + 3_600_000;
    },

    /**
     * A prediction comes due.
     *
     * A DECISION THAT PREDICTED NOTHING CANNOT BE WRONG. The claim is checked against the measure it
     * named, once — `scored_at` is what makes a re-entered alarm find nothing to do rather than
     * overwrite a verdict with a later reading.
     */
    score: (row) => {
      const { prediction } = JSON.parse(row.payload) as { prediction?: string };
      if (!prediction) return null;
      const out = scorePrediction(sql, prediction, evalContext(), {
        mint,
        nowAt: instant(clock.now()),
        propose: (p, actor) => openSuggestion(governDeps(), actor, p as never),
      });
      if (!out.ok) throw new TypeError(fixOf(out));
      return null;
    },

    /**
     * The digest comes due: assemble it, queue it, and set the next one.
     *
     * BATCH BY DEFAULT. Almost nothing needs to reach somebody the moment it happens, and a product
     * that pushes each fact as it arrives is a product people mute.
     */
    digest: (row) => {
      const { declaration } = JSON.parse(row.payload) as { declaration?: string };
      const found = declaration
        ? sql.one<{ body: string }>(
            "SELECT body FROM declaration WHERE id = ? AND kind = 'digest' AND superseded_at IS NULL AND retired = 0",
            declaration,
          )
        : null;
      /* A DIGEST WHOSE DECLARATION IS GONE IS DROPPED, like a reminder whose row was deleted: the
         thing it was about is not true any more, and firing it anyway is the failure the whole
         derived-schedule design exists to avoid. */
      if (!found) return null;

      const decl = JSON.parse(found.body) as DigestDecl;
      runDigest(digestDeps(), decl);
      /* A SCHEDULE THAT IS NOT A SCHEDULE ENDS THE ROW rather than arming it for an hour nobody
         asked for. `null` is one-shot here, and the declaration is what needs fixing. */
      return nextOccurrence(decl.schedule, clock.now(), recordIdentity(sql)?.tz ?? 'UTC');
    },

    /**
     * The weekly analysis.
     *
     * A LOOP THAT CANNOT RUN AWAY. The governors are why this is safe to run every week: a record
     * too new or too quiet says nothing, one with three unanswered proposals does not add a fourth,
     * and one whose recent predictions were mostly wrong stops proposing until somebody has looked.
     */
    analyse: () => {
      analyseNow();
      return clock.now() + 7 * 86_400_000;
    },

    /**
     * Yesterday's reading, written down.
     *
     * A METRIC IS A QUESTION AND A SERIES IS ITS ANSWERS. Everything else the record computes is
     * computed fresh; this is the one thing it remembers, because "is this getting better" cannot
     * be asked of a number that only exists now.
     */
    snapshot: (row) => {
      const { metric } = JSON.parse(row.payload) as { metric?: string };
      const decl = metric ? pageDeps().metric(metric) : null;
      if (!decl) return null;
      snapshot(sql, decl, evalContext(), { nowAt: instant(clock.now()), tz: recordIdentity(sql)?.tz ?? 'UTC' });
      /* NEXT AT FIVE PAST MIDNIGHT, so the day it is about is finished and nothing else is competing
         for the alarm. */
      return nextOccurrence({ at: '00:05' }, clock.now(), recordIdentity(sql)?.tz ?? 'UTC');
    },

    /**
     * A connector's turn comes round.
     *
     * THE RECORD NEVER MAKES THE CALL. One outbox row carrying the ingest, its cursor and the id of
     * the grant the runner should open — and nothing else. The runner fetches, unwraps the
     * credential somewhere the record cannot reach, and hands each page back.
     */
    pull: (row) => {
      const { ingest } = JSON.parse(row.payload) as { ingest?: string };
      /* A CONNECTOR WHOSE DECLARATION IS GONE IS DROPPED, like every other derived row: the thing it
         was about is not true any more. */
      const decl = ingest ? pullDecl(ingest) : null;
      if (!decl) return null;
      const out = firePull(pullDeps(), row, decl);
      /* `kept` when it paused itself: the drain writing `done` over that pause would quietly resume a
         connector whose credential is gone. */
      return out.paused ? 'kept' : out.nextMs;
    },

    /* A credential due for rotation. It says the id and the kind and never the label — a
       notification naming "Stripe, live" tells whoever can see it which one is worth taking. */
    rotate: (row) => rotateDue(sql, vaultDeps('system'), row.payload),

    /**
     * A rule came back to a row it asked to see again. `07 §6`'s `schedule` action.
     *
     * `rule` HAS BEEN ONE OF THE TEN SCHEDULE KINDS WITH NOTHING TO WRITE ONE AND NOTHING TO HANDLE
     * ONE. A row of a kind nothing handles fails once with a sentence naming the kind, which is the
     * right behaviour for a kind that should not exist — and the wrong one for a kind the action
     * grammar has always had a shape for.
     */
    rule: (row) => {
      const p = JSON.parse(row.payload) as { entry?: string; register?: string; rule?: string; note?: string };
      const entry = p.entry ? byId(p.entry) : null;
      /* THE ROW MOVED ON. Same rule as a reminder whose row was deleted: the thing it is about is not
         true any more, and firing it anyway is the failure the derived-schedule design exists to
         avoid. `once_per` markers land here too, and they name no entry — they are a marker rather
         than a reminder, so there is nothing to say and nothing to fail about. */
      if (!entry || !p.note) return null;
      appendEvent({
        kind: 'note',
        target: entry.id,
        register: entry.register,
        actor: `rule:${p.rule ?? 'unknown'}`,
        note: p.note.slice(0, 280),
        at: instant(clock.now()),
      });
      return null;
    },

    reminder: (row) => {
      const p = JSON.parse(row.payload) as { entry?: string; register?: string; field?: string; at?: string };
      const entry = p.entry ? byId(p.entry) : null;
      /* THE ROW MOVED ON. A reminder is derived from a date, and the date is gone or the row is — so
         the reminder is about nothing. Dropping it is right; firing it is the failure this whole
         design exists to avoid. */
      if (!entry || !p.field || entry.fields[p.field] === undefined) return null;

      const decl = registers.get(entry.register);
      const title = decl ? String(entry.fields[decl.title] ?? entry.id) : entry.id;
      const say = `${title} · ${p.field} ${String(entry.fields[p.field])}`.slice(0, 120);
      appendEvent({
        kind: 'note',
        target: entry.id,
        register: entry.register,
        actor: 'system',
        note: say,
        at: instant(clock.now()),
      });
      return null;
    },
  };

  /**
   * Every event about one row, oldest first: the row's history is the rows that made it.
   *
   * AND IT SAYS WHAT CHANGED. `field`, `from_v` and `to_v` are what make this a history rather than
   * an activity feed — "edited" is not an answer to any question anybody asks of an audit log, and
   * "append-only" is worth nothing if what was appended is that something happened.
   */
  const history = (target: string) =>
    sql
      .all<{
        id: string;
        ts: string;
        actor: string;
        kind: string;
        field: string | null;
        from_v: string | null;
        to_v: string | null;
        note: string | null;
        batch: string | null;
      }>(
        'SELECT id, ts, actor, kind, field, from_v, to_v, note, batch FROM event WHERE target = ? ORDER BY rowid',
        `entry:${target}`,
      )
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        actor: e.actor,
        kind: e.kind,
        field: e.field,
        /* PARSED, because a caller reading a history should not have to know it is stored as JCS —
           and a value that will not parse comes back as the text it is rather than as a throw. */
        from: read(e.from_v),
        to: read(e.to_v),
        note: e.note,
        batch: e.batch,
      }));

  const read = (value: string | null): Json | null => {
    if (value === null) return null;
    try {
      return JSON.parse(value) as Json;
    } catch {
      return value;
    }
  };

  /**
   * Rows whose text matches, best first.
   *
   * The register ceiling is applied inside the query, not to its results: filtering afterwards gives
   * a caller a short page whenever the matches were mostly in a register they cannot see, and they
   * cannot tell that from there having been no matches.
   */
  function search(q: string, opts: { registers?: readonly string[] | undefined; limit?: number } = {}): Hit[] {
    const hits = ftsSearch(sql, q, opts);
    /* A SEARCH THAT FOUND NOTHING IS THE ONE OBSERVATION WORTH MAKING ABOUT READING. It is the
       record failing at the thing it exists for, in a way nobody reports — people try one more
       phrasing and give up. Five of them over ninety days on three separate days is a register
       somebody expected to exist. */
    if (hits.length === 0 && q.trim()) observe(sql, clock.now(), [{ kind: 'search.empty', subject: q.trim().toLowerCase().slice(0, 60) }]);
    return hits;
  }

  /** Every live row's line, from nothing. What an import runs once at the end. */
  const rebuildFts = (): number =>
    transaction(() =>
      rebuild(
        sql,
        (register) => registers.get(register)?.fields,
        (register) => Boolean(registers.get(register)?.series),
      ),
    );

  return {
    transaction,
    allocate,
    reload,
    search,
    rebuildFts,

    /**
     * When the record next has something to do. ONE ALARM PER CUSTOMER, which is what an object per
     * customer buys: the alternative is a cron worker fanning out across every tenant, waking
     * records that have nothing to do in order to ask them.
     */
    pending: () => pendingWork(sql, opts.delivers),

    /** The reminders that are due, oldest first. What the alarm hands to whatever sends them. */
    due: (limit?: number) => due(sql, clock.now(), limit),

    /**
     * One number, with its target and its comparison.
     *
     * The predicate is compiled to SQL by the same function a `list` uses, so a tile and the page it
     * links to read the same rows — the alternative is two definitions of "overdue" that agree until
     * somebody edits one.
     */
    metric: (decl: MetricDecl): Result<Reading> => evaluateMetric(sql, decl, evalContext()),

    /* ── pages ──────────────────────────────────────────────────── */

    /** Every page a person could open, templates expanded into one page per row. */
    /* AND WHICH REGISTERS EACH DRAWS FROM, so the record can scope the list the way `boot` scopes
       its own. It is stripped before it leaves — the caller gets a slug and a title. */
    /* AND THE RESOLVER GOES WITH IT, because a `stat` block names its registers through the metric
       declarations in its `cells` rather than through a `source` of its own. Without it a page made
       of figures named no register, was treated as prose, and was listed to everybody. */
    pages: () =>
      resolvePages(pageDeps()).map((p) => ({
        slug: p.slug,
        title: p.decl.title,
        registers: registersOf(p.decl, pageDeps().metric),
      })),

    /**
     * One page, with every block run.
     *
     * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
     * the other four and says what happened in the third — a page that fails whole is a page nobody
     * can use to find out what is wrong with it.
     */
    page: (slug: string): Result<PageResult> => readPage(pageDeps(), slug),

    /** One metric document by its id, so a caller can fill a parameter and read it. */
    metricDecl: (id: string): MetricDecl | null => pageDeps().metric(id),

    /**
     * Which registers ONE block draws from, so the record can blank it for a caller who may not
     * read them.
     *
     * IT WAS `block.source` AT THE CALL SITE, AND A `stat` BLOCK HAS NONE. Its registers are named
     * through the metric declarations in its `cells`, which live in the record and which the
     * caller has no way to resolve, so the check simply did not apply to a page made of figures and
     * its readings were handed to anybody who could open the page.
     */
    blockRegisters: (block: PageBlock): string[] => registersOfBlock(block, pageDeps().metric),

    /**
     * What a rule WOULD do, without doing any of it.
     *
     * THE FEATURE, not a debugging aid. A rule changes rows while nobody is looking, and the honest
     * way to introduce one is to say "this matches 38 rows, wins on 31, loses 7 to `chase-late`"
     * BEFORE it is turned on. Every product that ships rules without this ships a feature people are
     * afraid of.
     */
    dryRun: (candidate: RuleDecl, limit?: number): Result<DryRun> => dryRun(rulesDeps(), candidate, limit),

    /**
     * Run one installed rule over the rows that are already there.
     *
     * A RULE FIRES ON A WRITE, so a rule written today has never seen the four hundred rows written
     * before it. Without this, turning one on means editing every one of those rows by hand.
     */
    applyRule: (id: string, opts: { dry?: boolean; limit?: number } = {}): Result<RuleApplied> => {
      const row = sql.one<{ body: string }>(
        "SELECT body FROM declaration WHERE id = ? AND kind = 'rule' AND superseded_at IS NULL AND retired = 0",
        id.startsWith('rule.') ? id : `rule.${id}`,
      );
      if (!row) return no<RuleApplied>('OUT_OF_BOUNDS', `There is no rule called ${id}.`, { at: 'id' });
      const rule = JSON.parse(row.body) as RuleDecl;
      return opts.dry ? applyRule(rulesDeps(), rule, opts) : transaction(() => applyRule(rulesDeps(), rule, opts));
    },

    /**
     * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
     *
     * What it reads is DECLARED rather than wired: a forecast that knew the word "obligations" would
     * be a forecast that works for one record.
     */
    runway: (opening: number, legs: readonly Leg[], horizon?: number): Result<Runway> =>
      runway(
        { sql, schemaOf: (r) => (registers.has(r) ? schemaOf(r) : null), titleOf: (r) => registers.get(r)?.title ?? null, hydrate: (id) => byId(id), ctx: evalContext() },
        opening,
        legs,
        horizon,
      ),

    /**
     * A payload arrives, and the record fills itself.
     *
     * ONE DETERMINISTIC TRANSACTION with no model call in it: store, match, extract, validate,
     * write. The same payload twice produces the same record twice, and a payload nobody wrote a
     * pattern for is a row somebody can see rather than a silence.
     */
    arrive: (arrival: Arrival): Result<Arrived> => {
      const out = arrive(
        {
          sql,
          ingests: () =>
            sql
              .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
              .map((r) => JSON.parse(r.body) as IngestDecl),
          schemaOf: (register) => (registers.has(register) ? schemaOf(register) : null),
          write: (register, spoken, patch, actor) => write(register, spoken, patch, { actor }),
          /* THE LOOKUP PATH, which is the third of the three and the one that was still open — named
             in a commit message as fixed and not touched. `by` is `extract.<field>.lookup.by` from an
             ingest declaration, so a pack could point a `ref` at whatever row it liked and the row
             looked ordinary afterwards. */
          find: (register, by, value) =>
            sql.one<{ id: string }>(
              `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${jsonPath(by)}') = ? LIMIT 1`,
              register,
              value,
            )?.id ?? null,
          mint,
          allocate,
          nowMs: clock.now(),
        } satisfies IngestDeps,
        arrival,
        transaction,
      );

      /* 3′ — OUTSIDE THE ARRIVAL'S TRANSACTION, and deliberately. What is queued here is a model
         call somebody will pay for; the payload is already stored, and a draft that could roll the
         bytes back would make the record's memory depend on whether a proposal was worth making. */
      /* A REDELIVERY IS NOT AN ARRIVAL. Every webhook sender retries and most mail servers do too,
         and the redelivery branch returns the state it had the first time — so reading the state
         alone re-observed the payload and re-queued the draft, once per retry, which is exactly the
         bill `3′` exists to ration. */
      if (out.ok && out.value.state === 'untriaged' && !out.value.redelivered) {
        const headers = arrival.headers ?? {};
        transaction(() => {
          observe(sql, clock.now(), [{ kind: 'ingest.unmatched', subject: shapeOf(arrival.channel, headers) }]);
          propose(
            { sql, nowMs: clock.now(), outbox: (payload) => enqueue(sql, mint, clock.now(), 'infer.draft', payload) },
            arrival.channel,
            headers,
          );
        });
      }
      return out;
    },

    /**
     * Record what happened, pre-aggregated by day.
     *
     * NONE OF IT LEAVES THE OBJECT. Observations live in the customer's own record, which is why a
     * search term is fine here — that wall is what keeps this from being surveillance with a
     * dashboard.
     */
    observe: (batch: readonly Observation[]): Result<number> => transaction(() => observe(sql, clock.now(), batch)),

    /** Look at what the record has noticed, and propose at most one thing. */
    analyse: (): Analysis => analyseNow(),

    /**
     * A connector run comes back.
     *
     * `paused` IS A STATE, NOT A FAILURE. A 401 is a fact about the key rather than a transient
     * error, and eight exponential retries against a bank's auth endpoint is how an account gets
     * locked.
     */
    applyPull: (finish: { ingest: string; outcome: 'ok' | 'paused'; cursor?: string; dueAtMs?: number; error?: string }) =>
      transaction(() => applyPull(pullDeps(), finish)),

    /** One block, without a page around it — what a `draw` tool hands an agent. */
    block: (decl: PageBlock): BlockResult => readBlock(pageDeps(), decl),

    /* ── the vault: what a key opens, never the key ───────────────────── */

    /** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
    grants: (): GrantRow[] => listGrants(sql),
    grant: (id: string): GrantRow | null => getGrant(sql, id),

    /** Mint a grant, or rotate one — which differ by one column and a version number. */
    bindGrant: (args: BindGrantArgs, actor: string): Result<GrantRow> =>
      bindGrant(sql, vaultDeps(actor), args, transaction),

    /**
     * Hand the sealed bytes out, and count the reading.
     *
     * THE KERNEL CANNOT OPEN THEM. It assembles the ciphertext, the wrapped record key and the AAD
     * and hands all three to whoever asked — which is what makes "we cannot read your record" a fact
     * about the code rather than a promise about our intentions.
     */
    openGrant: (args: { id: string; kek_id?: string | undefined }, actor: string): Result<SealedGrant> =>
      openGrant(sql, vaultDeps(actor), args, transaction),

    /** Take a grant out of service and destroy the bytes. The row stays: what it opened is a fact. */
    revokeGrant: (id: string, actor: string): Result<null> => revokeGrant(sql, vaultDeps(actor), id, transaction),

    /**
     * What a digest would say if it went now. It sends nothing.
     *
     * THE SAME ASSEMBLY THE SCHEDULED ONE USES, and it has to be: a "today" screen computed by a
     * second code path is a screen that disagrees with the email on the day one of them is wrong,
     * and the person reading both has no way to tell which. `sectionsOf` is the one assembly, and
     * this is it without the outbox row on the end.
     */
    digestToday: (id?: string) => {
      const deps = digestDeps();
      const decls = sql
        .all<{ id: string; body: string }>(
          "SELECT id, body FROM declaration WHERE kind = 'digest' AND superseded_at IS NULL AND retired = 0 ORDER BY id",
        )
        .map((r) => JSON.parse(r.body) as DigestDecl)
        .filter((d) => id === undefined || d.digest === id);

      return decls.map((decl) => {
        const sections = sectionsOf(deps, decl);
        /* THE SAME FILTER THE SCHEDULED DIGEST USES, and the headline is over the SAME list. A
           second copy of it made the screen say the digest was carrying nothing on the morning the
           digest went out, with a headline the email did not have. */
        const carrying = carryingOf(sections);
        return {
          digest: decl.digest,
          name: decl.name ?? decl.digest,
          headline: headline(decl.name ?? decl.digest, carrying),
          sections,
          carrying: carrying.length,
        };
      });
    },

    /**
     * The read mark: how far this person has read — measured in EVENTS, not in clock time.
     *
     * `45 §5.2` passes `upTo`, an event rowid, and takes the mark from that event's own `ts`:
     * `MAX(COALESCE(seen_at, ''), (SELECT ts FROM event WHERE rowid = ?))`. This took no argument
     * and stamped `clock.now()` instead, which is a different fact — *when you last pressed the
     * button* rather than *how far you have read* — and it made the whole method unreplayable: the
     * same call twice gives two answers, and a client that knows it has read to event 40 has no way
     * to say so.
     *
     * AND THE `MAX()` GUARD WAS THEN AGAINST A WALL CLOCK. The old comment here described the
     * hazard it had just created — *"a value stamped from a wall clock ahead of the record's is a
     * mark no later read can ever move, pinned in the future for as long as the record lags"* — and
     * that hazard does not exist in the specified form, because an event's `ts` IS the record's
     * clock. `45 §5`'s own regression case is `upTo: 40` then `upTo: 30`, and it could not be
     * written against a method with no `upTo`.
     *
     * `MAX()` ONLY, so a phone that was asleep for a week cannot move the mark backwards when it
     * wakes up and reports where it had got to. And it is NOT an event: a read is not a write to
     * the record, or every glance at a screen would be a line in somebody's history.
     *
     * ONE DEVIATION FROM `45 §5.2`'s SQL, and it is the guard failing on its own terms. SQLite's
     * scalar `max()` returns NULL if any argument is NULL, so an `upTo` naming an event that is not
     * there — a replayed call after a restore, a client one migration behind — sets `seen_at` to
     * NULL and **erases the mark entirely**. Measured: `MAX(COALESCE(seen_at,''), (SELECT ts FROM e
     * WHERE rowid = 999))` is `null`. The subselect gets its own `COALESCE`, so an unknown id leaves
     * the mark exactly where it was, which is what "never moves it back" has to mean — and
     * **`45 §5.2` is amended to carry it**, in the same revision, rather than left disagreeing.
     */
    markRead: (person: string, upTo: number): string | null => {
      transaction(() => {
        sql.exec(
          `UPDATE member SET seen_at = MAX(COALESCE(seen_at, ''), COALESCE((SELECT ts FROM event WHERE rowid = ?), ''))
            WHERE person_id = ? AND register = '*'`,
          upTo,
          person,
        );
      });
      return (
        sql.one<{ seen_at: string | null }>("SELECT seen_at FROM member WHERE person_id = ? AND register = '*'", person)
          ?.seen_at ?? null
      );
    },

    /** The newest event, which is what a client that has read everything passes as `upTo`. */
    newestEvent: (): number => Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0),

    /* `seenAt()` WAS HERE AND IS GONE. Its only caller was `markRead`'s own return — it wrote the
       mark, then read it back through a second method — and `markRead` returns the mark now, which
       is what `45 §5.2`'s SQL leaves in the row. `members()` carries `seen_at` per person for
       everything else, so a third way to ask the same column would be a third way to drift. */

    /* ── who is on the record ────────────────────────────── */

    /** Everybody on it, with what they hold and where. */
    members: (): Member[] => members(sql),

    /**
     * What one person may do inside this record, or `null` if they are not on it.
     *
     * THE ONE THING A HOST ASKS BEFORE IT LETS ANYBODY IN. It is the record's own table rather than
     * the Directory's, because that is the table `invite` writes and the one that travels in a
     * `.dog` file — and reading the level from anywhere else made removing somebody a change that
     * did not stop them writing.
     */
    /**
     * One note against one row — `30 §2`'s `note` kind, "the one row a person or an agent writes on
     * purpose".
     *
     * NOT AN `edit`. This went through `update` with an empty patch and a note, so a log entry was a
     * WRITE: it bumped the row's version, which means anybody holding the version they read got a
     * spurious `VERSION_STALE` on their next real change, for a call that changed no field. `20 §1`
     * puts `log` in the `append` half beside `create` and `propose`, and `45 §5.1` says the same —
     * so it must not need `write` either.
     */
    log(register: string, seq: number, actor: string, note: string): Result<{ id: string }> {
      const found = bySeq(register, seq);
      if (!found) return no<{ id: string }>('OUT_OF_BOUNDS', `There is no ${register} #${seq}.`, { at: 'seq' });
      return transaction(() => {
        appendEvent({
          kind: 'note',
          target: found.id,
          register: found.register,
          actor,
          note,
          at: instant(clock.now()),
        });
        return ok({ id: found.id });
      });
    },

    access: (person: string) => access(sql, person),

    /**
     * Who owns this record, by id.
     *
     * FOR THE ONE CALLER THAT HAS NO OTHER WAY TO ASK: a self-host with no bearer, which is one
     * person on one machine and needs to know which person. It was a constant, `p_self`, which was
     * correct while nothing could create a record and quietly wrong the moment `init` could — a
     * token minted under that constant names a person with no `member` row, and is refused by the
     * server that issued it.
     *
     * BY `person_id`, NOT BY `rowid`. "The founding owner is first" was wrong three ways: this
     * record's own `createRecord` uses `INSERT OR REPLACE`, which deletes and re-inserts at a fresh
     * max rowid; an export and import reorders every table; and neither is visible from here. An
     * alphabetical order is not the founder either, but it is the same answer before and after a
     * restore, which is the property a caller actually needs.
     *
     * AND A SUSPENDED OWNER IS NOT AN OWNER. `owners()` counts rows without excluding them, so two
     * owners can both be suspended — and the caller that falls back to a constant on `null` then
     * hands out `owner` to somebody no `member` row names, on a record whose own tables say nobody
     * may act.
     */
    ownerId: (): string | null =>
      sql.one<{ person_id: string }>(
        `SELECT m.person_id FROM member m JOIN person p ON p.id = m.person_id
          WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL ORDER BY m.person_id LIMIT 1`,
      )?.person_id ?? null,

    /** Whether this object has been created at all, which is a different question from who owns it. */
    created: (): boolean => recordIdentity(sql) !== null,

    /** Put somebody on, or move them. An invitation is the whole of what they hold, not a patch. */
    /* `why` REACHES THE LEDGER OR IT IS NOT WRITTEN. `45 §5.6` gives the access event `note = why`,
       `members.ts` writes it, and these three facades took no `why` at all — so `note` was `NULL` on
       every access event in the product and the column was plumbing that never carried anything. An
       audit that says who was granted what and never why is half an audit, on the one table whose
       entries are decisions about other people. */
    invite: (
      by: string,
      args: { person: string; email?: string; name?: string; level?: MemberLevel; registers?: Record<string, MemberLevel>; why?: string },
    ): Result<Member> => transaction(() => invite(memberDeps(), by, args)),

    /** Take somebody off. Never the last owner, and their person row stays. */
    /** Stop somebody without deciding about them, or start them again. */
    suspendMember: (by: string, person: string, on: boolean, why?: string): Result<null> =>
      transaction(() => suspend(memberDeps(), by, person, on, why)),

    removeMember: (by: string, person: string, why?: string): Result<null> => transaction(() => remove(memberDeps(), by, person, why)),

    /* ── agent tokens ───────────────────────────────────── */

    /** Mint one. The secret exists once, in the answer, and is stored nowhere. */
    createToken: (person: string, args: { scope: Scope; label?: string; days?: number }): Promise<Result<Minted>> =>
      Promise.resolve(tokenDeps()).then((deps) => transaction(() => createToken(deps, person, args))),

    /** Every token, with a revoke button's worth of information and nothing a hash needs. */
    listTokens: (): TokenRow[] => listTokens(sql),

    /** Revoke one, idempotently. */
    revokeToken: (person: string, id: string): Result<TokenRow> => transaction(() => revokeToken(tokenDeps(), person, id)),

    /** A bearer, checked. The one way a token is recognised, and there is no other. */
    verifyToken: (bearer: string, surface?: string): Promise<Result<Verified>> =>
      verifyToken(tokenDeps(), bearer, surface),

    /* ── the decision gate ─────────────────────────────────── */

    /**
     * The governance rows, read like a register.
     *
     * THE RECORD OPENS SUGGESTIONS FROM THREE PLACES and until this existed nothing could read one.
     * A proposal nobody can see is a proposal that was never made.
     */
    governance: (register: GovernRegister, opts: { status?: string; limit?: number } = {}) =>
      listGovernance({ sql, nowMs: clock.now() }, register, opts),

    /** One governance row, or `null` — a missing one is a value, not a refusal. */
    governanceRow: (register: GovernRegister, id: string) => getGovernance(sql, register, id),

    /** Open a suggestion. The body is checked here, so the person answering it never finds it broken. */
    propose: (p: Proposal, actor: string): Result<{ id: string }> =>
      transaction(() => openSuggestion(governDeps(), actor, p)),

    /**
     * Answer one.
     *
     * THE CHANGE AND THE DECISION ARE ONE TRANSACTION, so "undo this decision" is one query. A
     * `pattern` or a `change` comes back with the declaration to install, because installing is
     * asynchronous and a decision that resolved before its change landed would be a lie.
     */
    decide: (id: string, verdict: Verdict, actor: string): Result<Decided> =>
      attempt(sql, transaction, () => decide(governDeps(), id, verdict, actor)),

    /** Put one back in the queue, for the change the gate accepted and could not land. */
    reopen: (id: string, why?: string): Result<null> => transaction(() => reopen(governDeps(), id, why)),

    /* ── the outbox: work that must leave the record ────────────────── */

    /**
     * Queue one job, in the caller's transaction.
     *
     * THE RECORD MAKES NO OUTBOUND CALL — that is the rule the object model rests on. A write that
     * needs the world to hear about it inserts a row here and commits; something else delivers it.
     */
    outbox: (kind: OutboxKind, payload: unknown) => transaction(() => enqueue(sql, mint, clock.now(), kind, payload)),

    /* ── provisioning ────────────────────────────────────────── */

    /**
     * Say what this record is: its name, its owner, its timezone, and the header a file carries.
     *
     * NAMING IS PROVISIONING — the object already exists the moment it is addressed. This is the
     * four rows that say WHICH record it is, in one transaction, because a record with an owner and
     * no timezone renders every digest in the wrong day.
     */
    createRecord(args: CreateRecordArgs): Result<Provisioned> {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      return createRecord(sql, clock.now(), FORMAT_VERSION, args, transaction, mint);
    },

    /** What this record calls itself, or `null` before anybody has said. */
    identity: () => recordIdentity(sql),

    /**
     * The sweep, by hand. The hourly `purge` row calls the same function.
     *
     * A soft delete is not a delete and is not forever either: thirty days is the window in which
     * "undo" is a real word, and after it a record that only grows makes every scan pay.
     */
    purge: (opts: { cutoffMs?: number; limit?: number } = {}) =>
      purge(sql, opts.cutoffMs ?? clock.now() - 30 * 86_400_000, clock.now(), transaction, mint, opts.limit),

    /** Claim up to `n` jobs of these kinds. One statement, so a double drain finds nothing. */
    leaseOutbox: (kinds: readonly OutboxKind[], n = 10) => transaction(() => lease(sql, ackDeps(), kinds, n)),

    /** Finish one. `failed` walks the ladder; the eighth failure is `dead` and opens an item. */
    ackOutbox: (args: Ack) => transaction(() => ack(sql, ackDeps(), args)),

    /**
     * Fire everything that is due, once.
     *
     * The scheduler is optional because the kernel is testable without one, and it is passed rather
     * than held because arming an alarm is an async storage operation on a Durable Object — it
     * cannot sit inside `transactionSync`, so it runs after the transaction commits.
     */
    async drain(scheduler?: Scheduler, limit = 100): Promise<Drained> {
      try {
        return transaction(() => drainSchedule(sql, ackDeps(), HANDLERS, limit));
      } finally {
        /* IN A `finally`, ALWAYS. A handler that throws before re-arming stops the customer's entire
           schedule forever, which is the single worst bug this subsystem can have. */
        if (scheduler) await tail(scheduler);
      }
    },

    /**
     * Re-arm the alarm to the earliest pending row, then ring the doorbell.
     *
     * IDEMPOTENT, and in this order. The alarm is read before it is set, so a tail that changed
     * nothing costs one read; the doorbell is last because it is the only I/O the record performs.
     */
    tail,

    /**
     * The record as a file: `.dogl` lines, header first, `local` left behind.
     *
     * Gated on the schema refusal like every other method, which it was not: a record whose schema
     * disagrees with the code was still exportable, and the export rewrote its manifest — putting a
     * hash of rows nobody can safely read into the file a customer keeps.
     */
    /**
     * The id of the key this record's vault is wrapped by, or `null` when it has no vault.
     *
     * IT IS NOT THE KEY. `kek_id` is a fingerprint — 12 §6 — and naming it proves nothing except
     * that you know which key you are asking about, which is exactly the bar an export carrying the
     * sealed bytes should clear: a caller holding that key can open them one at a time already, and
     * a caller who is not holding it gains nothing from a file full of ciphertext.
     */
    wrappingKey(): string | null {
      return sql.one<{ kek_id: string | null }>('SELECT kek_id FROM vault_key LIMIT 1')?.kek_id ?? null;
    },

    export(opts: { sections?: readonly Section[]; redactGrants?: boolean; actor?: string } = {}) {
      const refused = schemaRefusal(state);
      if (refused) return Promise.resolve(refused as Result<string[]>);

      /* AN EXPORT IS AN EVENT, and 45 §5.6 says so. `openGrant` writes `grant.read` for ONE
         credential; `export` copies every one of them and wrote nothing at all — so the one read
         that gets the most out was the one read that could not answer "did anything leave". 12 §6's
         first rule is that a vault whose reads are not audited cannot answer that question. */
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'export', NULL, NULL, ?)",
        mint(),
        instant(clock.now()),
        opts.actor ?? 'system',
        `sections ${(opts.sections ?? ['all']).join(', ')}${opts.redactGrants === true ? ', grants redacted' : ''}`,
      );
      return exportDogl(sql, transaction, opts)
        .then((lines) => (signer ? signDogl(lines, signer) : lines))
        .then((lines) => ok(lines));
    },

    /**
     * A file into an empty record, then the index rebuilt from the rows it now holds.
     *
     * The rebuild is here rather than in the import because it depends on the DECLARATIONS the file
     * just brought — a search index built before them would index nothing and look like it worked.
     */
    async import(lines: Iterable<string>) {
      /* The one destructive path that was not gated. `migrate.ts` says in bold that the refusal is
         sticky and every `Result`-returning method short-circuits on it; this one wrote seven rows
         into a record whose schema the code cannot read. */
      const refused = schemaRefusal(state);
      if (refused) return refused;

      /* THE FILE IS CHECKED AGAINST ITSELF BEFORE ONE ROW IS WRITTEN. `41 §5.11` step 2, and the
         reason this method is `async`: SHA-256 is, and a checksum computed after the transaction
         opened would be a checksum of a record that already exists. `lines` is an `Iterable` and a
         generator read twice is empty the second time, so it is materialised here — once, for both
         readers. */
      const all = [...lines];
      const sound = await checkDogl(all);
      if (!sound.ok) return sound;

      const out = importDogl(sql, transaction, all);
      if (out.ok) {
        reload();
        rebuildFts();
      }
      return out;
    },

    /**
     * Install declarations, then rebuild the cache.
     *
     * The cache is rebuilt HERE and not by the caller, because a declaration installed and not
     * reloaded is a register the write path still refuses — a failure that looks like the install
     * silently not working.
     */
    async install(batch: readonly Declaration[]) {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const cannot = unreadable(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      const out = await installDeclarations(sql, clock.now(), batch, transaction);
      if (out.ok) {
        reload();
        /* AND THE ROWS THE DECLARATIONS EARN. `digest`, `snapshot` and `analyse` have complete
           handlers and NOTHING EVER ARMED THEM — an exhaustive search of every `INSERT INTO
           schedule` in this repository found six sites and none of those kinds. So a declared Monday
           brief never sent, a metric's series never snapshotted, and the weekly analysis, which is
           the whole observe loop, never ran, with no error anywhere. A handler nothing schedules is
           a feature that exists in the code and not in the product.

           AFTER `reload`, so the identity's timezone is the one just installed. */
        armDerived(batch);
      }
      return out;
    },

    /**
     * Validate and hash a batch, and hand back the write as a SYNCHRONOUS function.
     *
     * FOR A CALLER THAT NEEDS THE WRITE INSIDE A TRANSACTION IT OWNS. A pack install writes
     * declarations, retires the ones the pack dropped, plants its seeds and records the pack row —
     * and half of that is a record whose pages name registers it does not have. Hashing is the only
     * asynchronous part, so it happens here and the write happens where the caller says.
     *
     * The cache is rebuilt by the caller through `reload()`; a staged write that is not reloaded is
     * a register the write path still refuses.
     */
    async stageInstall(batch: readonly Declaration[]) {
      const refused = schemaRefusal(state);
      if (refused) return refused as Result<() => Result<unknown>>;
      const cannot = unreadable(batch);
      if (cannot) return { ok: false as const, refusal: cannot };
      const staged = await stageDeclarations(batch);
      if (!staged.ok) return staged;
      return ok(() => {
        const out = staged.value(sql, clock.now(), transaction);
        /* AND THE SAME ON A PACK'S PATH, WHEN IT LANDS. `applyDeclarations` refuses and rolls back —
           a clashing unique field, a missing dependency — and this armed the rows anyway: the caller
           got a refusal and the schedule held a `digest` row for a declaration that does not exist.
           It fires once, finds nothing, and goes `done`. */
        if (out.ok) armDerived(batch);
        return out;
      });
    },

    retire(ids: readonly string[]) {
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = retireDeclarations(sql, ids, transaction);
      if (out.ok) reload();
      return out;
    },

    registers: () => registers,
    register: (id: string) => registers.get(id),

    /**
     * The declaration state, as a plan is built from it.
     *
     * ACTIVE ROWS ONLY, and `body` as the JCS text it was stored as — a plan compares checksums and
     * bodies, and re-serialising an object to compare it is how two identical declarations come out
     * different because one was parsed by a different build.
     */
    declarations: () =>
      sql.all<{ id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string }>(
        'SELECT id, version, kind, pack_id, body, checksum FROM declaration WHERE superseded_at IS NULL AND retired = 0 ORDER BY id',
      ),

    /** The `pack` rows: what is installed, and at which version. */
    packs: () => sql.all<{ id: string; version: string }>('SELECT id, version FROM pack ORDER BY id'),

    /** Live rows per register, which is what makes an orphan countable before it is one. */
    census: (): Record<string, number> =>
      Object.fromEntries(
        sql
          .all<{ register: string; n: number }>(
            'SELECT register, count(*) AS n FROM entry WHERE deleted_at IS NULL GROUP BY register',
          )
          .map((r) => [r.register, Number(r.n)]),
      ),

    /** A `pack` row, written when its declarations have landed. */
    rememberPack: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string }) =>
      transaction(() => {
        sql.exec(
          `INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET version = excluded.version, source = excluded.source,
             source_ref = excluded.source_ref, manifest = excluded.manifest, checksum = excluded.checksum`,
          row.id,
          row.version,
          row.source,
          row.ref,
          row.manifest,
          instant(clock.now()),
          row.checksum,
        );
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'system', 'install', ?, 'pack', ?)",
          mint(),
          instant(clock.now()),
          `pack:${row.id}`,
          row.version,
        );
      }),

    /** And the row goes when the pack does. The declarations are retired; the rows are not. */
    forgetPack: (id: string) =>
      transaction(() => {
        sql.exec('DELETE FROM pack WHERE id = ?', id);
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'system', 'uninstall', ?, 'pack', NULL)",
          mint(),
          instant(clock.now()),
          `pack:${id}`,
        );
        /* ITS SCHEDULE ROWS GO WITH IT. A digest for a page nobody has any more is a notification
           about nothing, arriving every Monday for ever. */
        sql.exec(
          `DELETE FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'snapshot')
           AND key IN (SELECT substr(id, instr(id, '.') + 1) FROM declaration WHERE pack_id = ?)`,
          id,
        );
      }),

    /** Which declarations a pack claims. Read before it is taken out. */
    packClaims: (id: string) =>
      sql
        .all<{ id: string }>(
          'SELECT id FROM declaration WHERE pack_id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY id',
          id,
        )
        .map((r) => r.id),
    refused: () => state.refusal,
    get,
    list,
    count,
    version,
    history,
    create: (register: string, fields: Patch, w: WriteContext) => write(register, null, fields, w),
    update: (register: string, ref: string, patch: Patch, w: WriteContext) => write(register, ref, patch, w),
    write,
  };
}
