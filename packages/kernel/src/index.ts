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
import { no, ok } from '@braindog/ports';

import { coerce, isAbsent, instant, parseSpoken, type FieldDecl, type Json } from './coerce.ts';
import { attempt } from './tx.ts';
import { ulids, type Mint } from './ids.ts';
import { FORMAT_VERSION, applyMigrations, schemaRefusal, type SchemaState } from './migrate.ts';
import { compile, type Predicate, type Schema } from '@braindog/where';
import { installDeclarations, retireDeclarations, type Declaration } from './declare.ts';
import { project, projectedText, rebuild, search as ftsSearch, type Hit } from './fts.ts';
import { exportDogl, importDogl, type Section } from './dogl.ts';
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
import { readBlock, readPage, resolvePages, type BlockResult, type PageBlock, type PageDecl, type PageDeps, type PageResult } from './pages.ts';
import { nextOccurrence, noteEvent, runDigest, type DigestDecl, type DigestDeps } from './digest.ts';
import { CREATE_CEILING, dryRun, marker, runRules, type DryRun, type RuleDecl, type RulesDeps } from './rules.ts';
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

export { FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS, canon, checksum, statements } from './migrate.ts';
export { coerce, instant, isAbsent, isJsonQuoted, hasEscapedNewline, isRealDay, parseSpoken, spoken } from './coerce.ts';
export type { FieldDecl, FieldType, Json } from './coerce.ts';
export { isUlid, ulids, ulidTime } from './ids.ts';
export { digest, indexesFor, indexName, jcs, registerOfIndex, validate as validateDeclaration, KINDS } from './declare.ts';
export { ftsQuery, projectedText } from './fts.ts';
export { TRAVELS, decode, encode, projection, tables } from './dogl.ts';
export { atMs, expandRepeat, offsetMs, remindersFor } from './schedule.ts';
export type { Remindable, Repeat, Reminder } from './schedule.ts';
export type { ImportReport, Section, TableShape } from './dogl.ts';
export { OUTBOX_KINDS, backoffMs, summary } from './outbox.ts';
export type { Ack, OutboxKind, OutboxRow } from './outbox.ts';
export { SCHEDULE_KINDS, drainSchedule, retryHandler } from './schedule.ts';
export type { CreateRecordArgs, Provisioned, Purged, WrappedKey } from './provision.ts';
export { GRANT_KINDS, spanMs } from './vault.ts';
export { AGGREGATIONS, evaluateMetric, meets, scorePrediction, snapshot, targetOf, windowMs } from './metrics.ts';
export { fill, readBlock, readPage, resolvePages, slugify } from './pages.ts';
export { CHANNELS, headline, inQuietHours, localParts, nextOccurrence, render, runDigest, sectionsOf } from './digest.ts';
export { CREATE_CEILING, dryRun, fill as fillTemplate, marker, order as orderRules, runRules } from './rules.ts';
export { runway } from './forecast.ts';
export { BODY_KINDS, GOVERNANCE } from './govern.ts';
export type { Decision, Decided, Proposal, Suggestion, Verdict, GovernRegister, BodyKind } from './govern.ts';
export { CHANNELS as INGEST_CHANNELS, CONFIDENCES, PROPOSE_AT, arrive, day as ingestDay, extract as extractField, shapeOf } from './ingest.ts';
export { SIGNALS, analyse, observe } from './observe.ts';
export { FLOOR_MS, applyPull, checkInterval, firePull, intervalMs, jitterMs } from './pull.ts';
export type { Fired as PullFired, PullDecl, PullDeps } from './pull.ts';
export type { Analysis, Finding, Observation, Signal } from './observe.ts';
export type { Arrival, Arrived, Confidence, Extractor, IngestDecl, IngestDeps } from './ingest.ts';
export type { ForecastDeps, Leg, Runway, Step } from './forecast.ts';
export type { DryRun, Fired, RuleAction, RuleDecl, RulesDeps, RulesOutcome } from './rules.ts';
export type { Channel, DigestDecl, DigestDeps, DigestPart, DigestSection, Sent } from './digest.ts';
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
export type RecordOptions = { lookups?: Record<string, Record<string, number>> | undefined };

export async function openRecord(sql: Sql, clock: Clock, opts: RecordOptions = {}): Promise<Kernel> {
  const { state } = await applyMigrations(sql, clock);
  return makeKernel(sql, clock, state, opts);
}

function makeKernel(sql: Sql, clock: Clock, state: SchemaState, opts: RecordOptions) {
  const mint: Mint = ulids(() => clock.now());
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
        .map((f) => [f.id, { type: f.type, ...(f.values ? { values: f.values } : {}), ...(f.to ? { to: f.to } : {}) }]),
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
              .map((f) => [f.id, { type: f.type, ...(f.values ? { values: f.values } : {}), ...(f.to ? { to: f.to } : {}) }]),
          ),
        };
      }
      return registers.has(register) ? schemaOf(register) : null;
    };

    for (const decl of batch) {
      const body = decl.body as Record<string, unknown>;
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

      const target = shape(spec.register);
      if (!target)
        return { code: 'REGISTER_UNKNOWN', fix: `${id} creates rows in ${spec.register}, and there is no such register.`, at: 'register' };

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
      for (const field of each) {
        const kind = from?.fields[field] as { type?: string; values?: readonly string[] } | undefined;
        if (!kind)
          return { code: 'FIELD_UNKNOWN', fix: `${id} crosses ${field}, and ${rule.register} has no such field.`, at: 'each' };
        if (kind.type !== 'list' && kind.type !== 'enum')
          return {
            code: 'WHERE_OPERATOR_UNSUPPORTED',
            fix: `${id} crosses ${field}, which is a ${String(kind.type)} — only a list or an enum has values to cross.`,
            at: 'each',
          };
        /* AGAINST THE DECLARED CARDINALITY WHERE IT IS KNOWABLE. An enum's values are in the
           declaration, so a bound that its own axes can exceed is a bound that is wrong today
           rather than at the thousandth row.

           A `list` HAS NO DECLARED LENGTH, and multiplying by zero for it turned the whole check
           off — including for `enum × list`, where half of it was knowable. Unknown means the
           check does not apply, not that the product is nothing. */
        if (kind.values?.length) cardinality *= kind.values.length;
        else knowable = false;
      }
      if (knowable && cardinality > bound)
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `${id} can make ${cardinality} rows from what ${rule.register} declares, and its bound is ${bound}.`,
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
    limit?: number;
    cursor?: string | null;
    includeDeleted?: boolean;
  }): Result<{ rows: Entry[]; cursor: string | null; matched: number }> {
    const refused = schemaRefusal(state);
    if (refused) return refused;
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
    const [at, afterId] = (typeof q.cursor === 'string' ? q.cursor : '').split('|');
    const page = at
      ? sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?`,
          q.register,
          ...c.params,
          at,
          at,
          afterId ?? '',
          limit + 1,
        )
      : sql.all<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM entry WHERE register = ?${deleted} AND (${c.sql}) ORDER BY updated_at DESC, id DESC LIMIT ?`,
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
    return ok({ rows, matched, cursor: more && last ? `${last.updated_at}|${last.id}` : null });
  }

  /** `MAX(event.rowid)`, which is the record's version: what changed since is a range scan. */
  const version = (): number =>
    Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0);

  /* ── the write path ──────────────────────────────────────────────────── */

  function write(register: string, ref: string | null, patch: Patch, w: WriteContext): Result<Entry> {
    const refused = schemaRefusal(state);
    if (refused) return refused;

    const out = writing(register, ref, patch, w);
    /* THE ONE WRITE A REFUSAL MAKES. Ten of the same refusal in a month across three days means the
       DECLARATION is wrong rather than one caller having a bad afternoon — and a record that threw
       its refusals away could never notice the difference. It is outside the transaction the write
       rolled back, or the observation would roll back with it. */
    if (!out.ok && out.refusal.at)
      observe(sql, clock.now(), [{ kind: 'write.refused', subject: `${register}.${out.refusal.at}:${out.refusal.code}` }]);
    return out;
  }

  function writing(register: string, ref: string | null, patch: Patch, w: WriteContext): Result<Entry> {
    return transaction(() => {
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
         people editing one invoice must not silently produce one of the two amounts. */
      if (w.version !== undefined && current && w.version !== current.version)
        return no<Entry>(
          'VERSION_STALE',
          `${ref} has moved on since you read it — you have version ${w.version} and the row is at ${current.version}. Read it again.`,
          { at: 'version' },
        );

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
        const batch = appendEvent({ kind: 'create', target: id, register, actor: w.actor, note: w.note, at: now, batch: w.batch });
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
      const kind = deleting ? (deletedAt ? 'delete' : 'restore') : nextState !== current.state ? 'state' : 'edit';
      const batch = appendEvent({ kind, target: current.id, register, actor: w.actor, note: w.note, at: now, batch: w.batch });
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
  }): string {
    const id = mint();
    /* `target` carries its KIND — `entry:01J…` — because an event is about a row, a decision, a pack
       or a declaration, and a bare id would make "everything about this" a search of four tables. */
    sql.exec(
      'INSERT INTO event (id, ts, actor, kind, target, target_kind, note, batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      e.at,
      e.actor,
      e.kind,
      `entry:${e.target}`,
      'entry',
      e.note ?? null,
      e.batch ?? null,
    );
    return id;
  }

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
      const out = list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}) });
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
  });

  /** What the two ladders need beyond SQL: an id, the suggestion counter, and one instant. */
  const ackDeps = (): AckDeps => ({ mint, allocate, nowMs: clock.now() });

  /** The same, plus who is asking and which record this is — the two halves of a `grant.read` row. */
  const vaultDeps = (actor: string): VaultDeps => ({
    mint,
    nowMs: clock.now(),
    actor,
    recordId: recordIdentity(sql)?.id ?? null,
  });

  async function tail(scheduler: Scheduler): Promise<void> {
    try {
      const armed = await scheduler.get();
      /* READ AFTER THE AWAIT, not before it. Reading the minimum first and then awaiting meant two
         overlapping tails — a drain's `finally` and a request's write, which on a Durable Object is
         an ordinary pair — each wrote the minimum it had seen BEFORE the other's rows existed.
         Whichever resumed last won, and in the probe that wrote an alarm four months later than the
         earliest pending row. The alarm was then simply late, by however long the gap was. */
      const work = pendingWork(sql);
      if (work.nextDueMs === null) {
        if (armed !== null) await scheduler.clear();
      } else if (armed !== work.nextDueMs) await scheduler.set(work.nextDueMs);
    } finally {
      /* And the doorbell asks again too: a job queued while this tail was parked is a job the ring
         is about. */
      if (pendingWork(sql).outboxPending) await scheduler.wake();
    }
  }

  /**
   * What each kind of schedule row does when its time comes.
   *
   * The four that are not here — `rule`, `pull`, `analyse` and `snapshot` — each wait on a subsystem
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
      const out = scorePrediction(sql, prediction, evalContext(), { mint, nowAt: instant(clock.now()) });
      if (!out.ok) throw new TypeError(out.refusal.fix);
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

  /** Every event about one row, oldest first: the row's history is the rows that made it. */
  const history = (target: string) =>
    sql.all<{ id: string; ts: string; actor: string; kind: string; note: string | null }>(
      'SELECT id, ts, actor, kind, note FROM event WHERE target = ? ORDER BY rowid',
      `entry:${target}`,
    );

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
    pending: () => pendingWork(sql),

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
    pages: () => resolvePages(pageDeps()).map((p) => ({ slug: p.slug, title: p.decl.title })),

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
     * What a rule WOULD do, without doing any of it.
     *
     * THE FEATURE, not a debugging aid. A rule changes rows while nobody is looking, and the honest
     * way to introduce one is to say "this matches 38 rows, wins on 31, loses 7 to `chase-late`"
     * BEFORE it is turned on. Every product that ships rules without this ships a feature people are
     * afraid of.
     */
    dryRun: (candidate: RuleDecl, limit?: number): Result<DryRun> => dryRun(rulesDeps(), candidate, limit),

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
          find: (register, by, value) =>
            sql.one<{ id: string }>(
              `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${by}') = ? LIMIT 1`,
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
    reopen: (id: string): Result<null> => transaction(() => reopen(governDeps(), id)),

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
    export(opts: { sections?: readonly Section[] } = {}) {
      const refused = schemaRefusal(state);
      if (refused) return Promise.resolve(refused as Result<string[]>);
      return exportDogl(sql, transaction, opts).then((lines) => ok(lines));
    },

    /**
     * A file into an empty record, then the index rebuilt from the rows it now holds.
     *
     * The rebuild is here rather than in the import because it depends on the DECLARATIONS the file
     * just brought — a search index built before them would index nothing and look like it worked.
     */
    import(lines: Iterable<string>) {
      /* The one destructive path that was not gated. `migrate.ts` says in bold that the refusal is
         sticky and every `Result`-returning method short-circuits on it; this one wrote seven rows
         into a record whose schema the code cannot read. */
      const refused = schemaRefusal(state);
      if (refused) return refused;
      const out = importDogl(sql, transaction, lines);
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
      if (out.ok) reload();
      return out;
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
