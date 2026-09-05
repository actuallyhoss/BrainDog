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

import type { Clock, Result, Scheduler, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { coerce, isAbsent, instant, parseSpoken, type FieldDecl, type Json } from './coerce.ts';
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
import { createRecord, purge, recordIdentity, type CreateRecordArgs, type Provisioned } from './provision.ts';
import { evaluateMetric, scorePrediction, type EvalContext, type MetricDecl, type Reading } from './metrics.ts';
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
export { AGGREGATIONS, evaluateMetric, meets, scorePrediction, targetOf, windowMs } from './metrics.ts';
export type { Aggregation, EvalContext, MetricDecl, Reading, Scored, Value } from './metrics.ts';
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
};

const RESERVED = new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'version', 'spoken', 'title']);

/* ── the record ──────────────────────────────────────────────────────────── */

export type Kernel = ReturnType<typeof makeKernel>;

export async function openRecord(sql: Sql, clock: Clock): Promise<Kernel> {
  const { state } = await applyMigrations(sql, clock);
  return makeKernel(sql, clock, state);
}

function makeKernel(sql: Sql, clock: Clock, state: SchemaState) {
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
  const schemaOf = (register: string): Schema => ({
    register,
    fields: Object.fromEntries(
      (registers.get(register)?.fields ?? [])
        .filter((f) => !f.retired)
        .map((f) => [f.id, { type: f.type, ...(f.values ? { values: f.values } : {}) }]),
    ),
  });

  function list(q: {
    register: string;
    where?: Predicate;
    limit?: number;
    cursor?: string | null;
    includeDeleted?: boolean;
  }): Result<{ rows: Entry[]; cursor: string | null; matched: number }> {
    const refused = schemaRefusal(state);
    if (refused) return refused;
    if (!registers.has(q.register))
      return no('REGISTER_UNKNOWN', `There is no register called ${q.register}.`, { allowed: [...registers.keys()] });

    /* A PREDICATE THAT COULD NOT BE READ RUNS NOTHING. Returning the register would be a list that
       looks filtered and is not, which is the one failure a declarative surface must not have —
       especially when the thing writing most predicates is an agent that cannot see the screen. */
    const c = compile(q.where, schemaOf(q.register));
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
        appendEvent({ kind: 'create', target: id, register, actor: w.actor, note: w.note, at: now, batch: w.batch });
        return ok(entry);
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
      appendEvent({ kind, target: current.id, register, actor: w.actor, note: w.note, at: now, batch: w.batch });
      return ok(entry);
    });
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
    schemaOf: (register) => {
      const r = registers.get(register);
      return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f])) } : null;
    },
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
   * The eight that are not here — `digest`, `rule`, `purge`, `rotate`, `pull`, `analyse`, `score`,
   * `snapshot` — each wait on a subsystem this record does not have yet. A row of one of those kinds
   * fails ONCE with a sentence naming the kind rather than walking eight hours of a ladder, which is
   * the honest behaviour: it says the record cannot do this, instead of looking like it is trying.
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
    return ftsSearch(sql, q, opts);
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

    /* ── the outbox: work that must leave the record ────────────────────── */

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
