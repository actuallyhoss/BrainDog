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

import type { Clock, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { coerce, isAbsent, instant, parseSpoken, type FieldDecl, type Json } from './coerce.ts';
import { ulids, type Mint } from './ids.ts';
import { applyMigrations, schemaRefusal, type SchemaState } from './migrate.ts';
import { compile, type Predicate, type Schema } from '@braindog/where';

export { FORMAT_VERSION, KERNEL_MIGRATION, MIGRATIONS, canon, checksum, statements } from './migrate.ts';
export { coerce, instant, isAbsent, isJsonQuoted, hasEscapedNewline, isRealDay, parseSpoken, spoken } from './coerce.ts';
export type { FieldDecl, FieldType, Json } from './coerce.ts';
export { isUlid, ulids, ulidTime } from './ids.ts';

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

    const limit = Math.min(Math.max(1, q.limit ?? 50), 500);
    const deleted = q.includeDeleted ? '' : ' AND deleted_at IS NULL';
    const [at, afterId] = (q.cursor ?? '').split('|');
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
        if (field.immutable && current && current.fields[key] !== undefined && current.fields[key] !== value)
          return no<Entry>('IMMUTABLE_FIELD', `${key} is set once and cannot be changed.`, { at: key });

        touched.push(key);
        if (value === null) {
          delete merged[key];
          continue;
        }

        const out = coerce(field, value, {
          refId: (reg, seq) => bySeq(reg, seq)?.id ?? null,
          grantExists: (id) => Boolean(sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)),
        });
        if (!out.ok) return { ok: false, refusal: out.refusal };
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

        if (value !== undefined && f.unique && touched.includes(f.id)) {
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
        if (legal && nextState && !legal.to.includes(nextState))
          return no<Entry>(
            'TRANSITION_ILLEGAL',
            `${register}#${current.seq} cannot go from ${from} to ${nextState}.`,
            { at: decl.state, allowed: legal.to },
          );
      }

      /* ── persist ── */
      const now = instant(clock.now());
      const deleting = patch.deleted_at !== undefined;
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
      const kind = deleting ? (deletedAt ? 'delete' : 'restore') : nextState !== current.state ? 'state' : 'edit';
      appendEvent({ kind, target: current.id, register, actor: w.actor, note: w.note, at: now, batch: w.batch });
      return ok(entry);
    });
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

  /** Every event about one row, oldest first: the row's history is the rows that made it. */
  const history = (target: string) =>
    sql.all<{ id: string; ts: string; actor: string; kind: string; note: string | null }>(
      'SELECT id, ts, actor, kind, note FROM event WHERE target = ? ORDER BY rowid',
      `entry:${target}`,
    );

  return {
    transaction,
    allocate,
    reload,
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
