/**
 * `capture`: one sentence a person said, kept as the several entries it became, across lists, under ONE batch, so one
 * Undo takes every one of them back (use case 6, step 5). DATA.
 *
 * WHAT IS WRITTEN IS WHAT THE PREVIEW SHOWED. The app reads the sentence on the device (`lib/tell/read.ts`, `tellRead`)
 * into `{ register, fields }` entries and shows them; this writes exactly those, one to eight, in the order sent. A field
 * may be `{ "$row": n }`, the entry at `rows[n]` of the same call, counted from 0 and written before it: an order's who
 * is the client the same sentence made.
 *
 * EACH LIST IS GUARDED AS `create` GUARDS IT: `append` on that list, `deleted_at` refused, a merge refused (only Decide
 * merges), a key another person already holds refused, a new project given its hue, and an agent at its rung. The checks
 * only the record holds (`mergeShaped`, `keyHeld`, `huedOf`) come in as `createDoor`; absent, the merge check is made
 * here from the kernel's roles, since a merge nobody decided is the one write that cannot wait.
 *
 * ALL OR NONE, UNDER ONE MINTED BATCH. Every create runs in one kernel transaction with the same `batch`, and the first
 * refusal takes back every entry before it, answering with `at` naming which entry and which field. `undo({ batch })`
 * then puts back the whole sentence as one change.
 *
 * AN AGENT CAPTURES AT ITS RUNG, OR NOT AT ALL. A capture is one press, so an entry its rung would ask about cannot be
 * asked alone: the whole capture is refused and the agent is told to add them with `create`, where each is asked on
 * Decide. An agent past the rung is kept on the ladder for each entry, as `create` keeps it.
 *
 * A RETRY IS THE SAME CAPTURE. `op_id` goes on the first entry's write, and `op_id.<n>` on the n-th, so a capture sent
 * again finds each one where it was and answers the first call's batch, writing nothing.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { agentOf, sessionDeclaration, ulids, type Entry, type Patch, type WriteContext } from '@braindog/kernel';

import { ladder, type Caller, type Gate } from '../ladder.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The kernel's run list, where an agent's runs keep the app each one wrote from (`ladder.ts`, `clientChanged`). */
const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

/** The most entries one capture keeps. A sentence that reads as more is more than one thing. */
export const CAPTURE_MOST = 8;

/** The most one capture weighs, sent as JSON. */
export const CAPTURE_BYTES_MOST = 32 * 1024;

/** One entry as the preview reads it: the list it goes into, and its fields. */
export type CaptureRow = { register: string; fields: Record<string, unknown> };

/** One entry kept, by its list and number and what it is called. */
export type CaptureMade = { register: string; seq: number | null; title: string };

/** What a capture answers: the batch `undo({ batch })` takes back, and each entry it made, in the order sent. */
export type Captured = { batch: string; made: CaptureMade[] };

/**
 * The record's own checks on a new entry, the ones `create` makes and a method file is handed none of: a merge refused,
 * a key already held refused, and a hue chosen for a list that wears one. `{ refusal }` stops the capture; `{ fields }`
 * is what is written.
 */
export type CreateDoor = (ctx: CallContext, register: string, fields: Patch) => { refusal: Refusal } | { fields: Patch };

const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const said = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** `{ "$row": n }`'s `n`, or `null` for anything else. */
const pointer = (v: unknown): unknown => (plain(v) && Object.keys(v).length === 1 && Object.hasOwn(v, '$row') ? v.$row : null);

/** The rows of `args`, each checked for shape, or the refusal naming the first that is not one. */
function rowsOf(args: unknown, no: RecordDeps['no']): Result<CaptureRow[]> {
  const rows = plain(args) ? args.rows : undefined;
  if (!Array.isArray(rows) || rows.length === 0)
    return no('REQUIRED_MISSING', 'capture takes { rows: [ ... ] }, each { register, fields }, one to eight of them.', { at: 'rows' });
  if (rows.length > CAPTURE_MOST)
    return no('OUT_OF_BOUNDS', `One capture keeps at most ${CAPTURE_MOST} entries, and this one has ${rows.length}. Keep the rest in a second one.`, { at: 'rows' });
  if (new TextEncoder().encode(JSON.stringify(rows)).length > CAPTURE_BYTES_MOST)
    return no('OUT_OF_BOUNDS', `One capture is at most ${CAPTURE_BYTES_MOST / 1024} KB. Send shorter entries, or fewer at a time.`, { at: 'rows' });
  const out: CaptureRow[] = [];
  for (const [i, row] of rows.entries()) {
    if (!plain(row)) return no('VALUE_MALFORMED', 'Each entry is { register, fields }.', { at: `rows[${i}]` });
    const extra = Object.keys(row).find((k) => k !== 'register' && k !== 'fields');
    if (extra !== undefined) return no('FIELD_UNKNOWN', `An entry takes register and fields, and nothing called ${extra}.`, { at: `rows[${i}].${extra}` });
    if (!said(row.register)) return no('REQUIRED_MISSING', 'Each entry names the list it goes into.', { at: `rows[${i}].register` });
    if (!plain(row.fields)) return no('VALUE_MALFORMED', 'Each entry carries its fields as an object.', { at: `rows[${i}].fields` });
    out.push({ register: row.register.trim(), fields: row.fields });
  }
  return ok(out);
}

/**
 * The fields of entry `i` with each `{ "$row": n }` turned into the id of the entry written at `rows[n]`, in a list or
 * alone, or the refusal for a pointer at nothing written before it.
 */
function linked(fields: Record<string, unknown>, i: number, made: readonly Entry[], no: RecordDeps['no']): Result<Patch> {
  const out: Record<string, unknown> = {};
  const one = (v: unknown, at: string): Result<unknown> => {
    const n = pointer(v);
    if (n === null) return ok(v);
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= i)
      return no('VALUE_MALFORMED', `{ "$row": n } points at an earlier entry of the same capture, counted from 0, so here n is 0 to ${i - 1}.`, { at });
    return ok(made[n]!.id);
  };
  for (const [k, v] of Object.entries(fields)) {
    const at = `rows[${i}].fields.${k}`;
    if (Array.isArray(v)) {
      const each: unknown[] = [];
      for (const x of v) {
        const r = one(x, at);
        if (!r.ok) return r as Result<Patch>;
        each.push(r.value);
      }
      out[k] = each;
    } else {
      const r = one(v, at);
      if (!r.ok) return r as Result<Patch>;
      out[k] = r.value;
    }
  }
  return ok(out as Patch);
}

/** A capture that stopped part way, carried out of the transaction so everything before it is taken back. */
class Halt {
  readonly refusal: Refusal;
  constructor(refusal: Refusal) {
    this.refusal = refusal;
  }
}

export function methods(deps: RecordDeps & { createDoor?: CreateDoor | undefined }) {
  const { kernel, sql, guard, named, readable, no, tail, clock } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });
  /** The capture's one batch, minted on the record's clock as the record mints every other. */
  const mint = ulids(() => clock.now());

  /** Who the entries are by, as `create` signs them: a token's write by its run, anybody else's by themselves. */
  const writerOf = (ctx: CallContext): Pick<WriteContext, 'actor' | 'principal' | 'session'> =>
    ctx.principal.kind === 'token'
      ? {
          actor: `agent:${agentOf(ctx.session ?? {}).agent ?? 'other'}`,
          principal: { kind: 'token', token: ctx.principal.id },
          ...(ctx.session === undefined ? {} : { session: ctx.session }),
        }
      : { actor: ctx.principal.id };

  /** The agent a token call is, as the ladder reads one, or `null` for a person, the system, or a key the record holds no grant for. */
  const callerOf = (ctx: CallContext): Caller | null => {
    if (ctx.principal.kind !== 'token') return null;
    const grant = trust.grantOf(ctx.principal.id);
    if (grant === null) return null;
    const run = kernel.findRun(ctx.session ?? {}, ctx.principal.id);
    const app = typeof ctx.session?.client === 'string' && ctx.session.client.trim() !== '' ? ctx.session.client.trim() : null;
    const conv = typeof ctx.session?.client_id === 'string' && ctx.session.client_id.trim() !== '' ? ctx.session.client_id.trim() : null;
    return { token: ctx.principal.id, scope: grant.scope, person: grant.person, run: run === null ? null : kernel.nameOf(run.id), app, conv };
  };

  /** What the ladder calls an agent and a list: the grant's label, and the list's own name. */
  const ladderNames = (agent: string) => ({
    agent: (sql.one<{ label: string | null }>('SELECT label FROM token WHERE id = ?', agent)?.label ?? '').trim() || 'Your agent',
    list: (id: string) => kernel.register(id)?.name ?? id,
  });

  /** The record's checks on a new entry, or, without them, the one that cannot wait: nobody arrives folded into somebody. */
  const door = (ctx: CallContext, register: string, fields: Patch): { refusal: Refusal } | { fields: Patch } => {
    if (deps.createDoor) return deps.createDoor(ctx, register, fields);
    const into = [kernel.meetsList(), kernel.orgsList()].find((l) => l?.register === register)?.fields.merged_into;
    if (typeof into === 'string' && Object.hasOwn(fields, into) && fields[into] !== null && fields[into] !== undefined)
      return { refusal: { code: 'IMMUTABLE_FIELD', fix: 'Merging happens on Decide, where you say who is who. Capture the new one on its own.', at: into } };
    return { fields };
  };

  /** What one entry is called: its list's title field, as written. */
  const titleOf = (e: Entry): string => {
    const title = kernel.register(e.register)?.title;
    const v = title === undefined ? undefined : e.fields[title];
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  };

  const madeOf = (e: Entry): CaptureMade => ({ register: e.register, seq: e.seq, title: titleOf(e) });

  /** Each entry's own retry id: the caller's on the first, and `<op_id>.<n>` on the n-th. */
  const opOf = (op: string, i: number): string => (i === 0 ? op : `${op}.${i}`);

  /**
   * A capture sent again with an `op_id` already spent: the first call's batch and entries, when it was this capture,
   * a refusal when the id was spent on something else, and `null` when it was never used.
   */
  const replayed = (op: string, rows: readonly CaptureRow[]): Result<Captured> | null => {
    const first = sql.one<{ batch: string | null }>('SELECT batch FROM event WHERE op_id = ?', op);
    if (first === undefined) return null;
    const made: Entry[] = [];
    for (const [i, row] of rows.entries()) {
      const at = sql.one<{ target: string; batch: string | null }>('SELECT target, batch FROM event WHERE op_id = ?', opOf(op, i));
      const e = at === undefined ? null : kernel.get(at.target.replace(/^entry:/, ''), { includeDeleted: true });
      if (e === null || at!.batch !== first.batch || e.register !== row.register) made.length = 0;
      else made.push(e);
      if (made.length === 0) break;
    }
    if (first.batch === null || made.length !== rows.length)
      return no('VALUE_MALFORMED', `op_id ${op} was already used for a different write. A retry sends the same capture again; a new capture needs a new op_id.`, { at: 'op_id' });
    return ok({ batch: first.batch, made: made.map(madeOf) });
  };

  return {
    /**
     * One sentence kept as one to eight entries across lists, under one batch, all or none. DATA (POST /api/capture).
     * Answers `{ batch, made }`: the batch `undo({ batch })` takes back, and each entry by its list, number and title.
     */
    async capture(args: unknown, ctx: CallContext): Promise<Result<Captured>> {
      const stop = deps.scoped(ctx, 'append');
      if (stop) return { ok: false, refusal: stop };
      const extra = plain(args) ? Object.keys(args).find((k) => k !== 'rows' && k !== 'op_id') : undefined;
      if (extra !== undefined) return no('FIELD_UNKNOWN', `capture takes rows and op_id, and nothing called ${extra}.`, { at: extra });
      const sent = plain(args) ? args.op_id : undefined;
      if (sent !== undefined && (!said(sent) || sent.length > 200))
        return no('VALUE_MALFORMED', 'op_id is your own name for this capture, a word of at most 200 characters, sent again on a retry.', { at: 'op_id' });
      /* UNDER WHO SENT IT (`opIdOf` in `index.ts`): a replay answers the first call's rows, and only to the one who made them. */
      const op = sent === undefined ? undefined : `${ctx.principal.kind === 'token' ? ctx.principal.person : (ctx.principal as { id: string }).id}|${sent}`;
      const rows = rowsOf(args, no);
      if (!rows.ok) return rows;

      /* EVERY LIST IS ASKED BEFORE ANYTHING IS WRITTEN, so a key that adds to one list only is refused on the other
         with nothing written, and is never told whether an earlier entry would have landed. */
      for (const [i, row] of rows.value.entries()) {
        const missing = named({ register: row.register });
        if (missing) return { ok: false, refusal: { ...missing, at: `rows[${i}].register` } };
        const held = guard(ctx, 'append', row.register);
        if (held) return { ok: false, refusal: { ...held, at: `rows[${i}].register` } };
        if (Object.hasOwn(row.fields, 'deleted_at'))
          return no('FIELD_UNKNOWN', 'deleted_at is kept by BrainDog, and a new entry cannot arrive deleted.', { at: `rows[${i}].fields.deleted_at` });
      }

      if (op !== undefined) {
        const again = replayed(op, rows.value);
        if (again !== null) return again;
      }

      /* AN AGENT AT ASK ON ANY OF THEM CAPTURES NONE OF THEM: each is asked on Decide through `create` instead. */
      const caller = callerOf(ctx);
      const gates: (Gate | null)[] = [];
      if (caller !== null) {
        /* AS `create`'S LADDER ASKS IT (`laddered` in `index.ts`): the app is read off the agent's runs, never off the
           list being written, so a grant that moved to another app is back at Ask before any entry is weighed. */
        trust.clientChanged(caller, SESSION);
        trust.anomaly(caller.token, caller.run);
        for (const [i, row] of rows.value.entries()) {
          const gate = trust.gate(caller, row.register, 'create', row.fields, null);
          if (!gate.write)
            return no('FORBIDDEN', `${gate.why} Add these one at a time with create, and each is asked on Decide.`, { at: `rows[${i}]`, allowed: ['create'] });
          gates.push(gate);
        }
      }

      const batch = mint();
      const by = { ...writerOf(ctx), reads: (register: string) => readable(ctx, register) === null, batch };
      const made: Entry[] = [];
      try {
        kernel.transaction(() => {
          for (const [i, row] of rows.value.entries()) {
            const fields = linked(row.fields, i, made, no);
            if (!fields.ok) throw new Halt((fields as { refusal: Refusal }).refusal);
            const checked = door(ctx, row.register, fields.value);
            if ('refusal' in checked) throw new Halt({ ...checked.refusal, at: `rows[${i}].fields${checked.refusal.at ? `.${checked.refusal.at}` : ''}` });
            const out = kernel.create(row.register, checked.fields, { ...by, ...(op === undefined ? {} : { opId: opOf(op, i) }) });
            if (!out.ok) {
              const r: Refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'Something changed while this was kept. Send it again.' };
              throw new Halt({ ...r, at: r.at === 'op_id' ? 'op_id' : `rows[${i}]${r.at ? `.${r.at === 'register' || r.at === 'fields' ? r.at : `fields.${r.at}`}` : ''}` });
            }
            made.push(out.value);
          }
        });
      } catch (e) {
        if (!(e instanceof Halt)) throw e;
        return tail({ ok: false as const, refusal: e.refusal });
      }
      /* KEPT ON THE LADDER ONCE IT LANDED, one change of its kinds an entry, as `create` keeps it. */
      if (caller !== null) for (const gate of gates) if (gate?.write) trust.kept(caller.token, gate.kinds, ladderNames(caller.token));
      return tail(ok({ batch, made: made.map(madeOf) }));
    },
  };
}
