/**
 * The record's surface: what a caller may ask, and whether they may.
 *
 * AUTHORISATION IS HERE AND NOT IN THE ROUTER. `30-BLUEPRINT` §10 puts it in one place for a reason
 * a router cannot meet: a check in the Worker is a check the CLI can be pointed around, and the
 * self-host has no Worker at all. Every method takes a `CallContext` and asks the same function.
 *
 * TWO LADDERS, ONE ANSWER. A token carries `read ⊂ propose ⊂ write`; a person carries
 * `read ⊂ append ⊂ write ⊂ decide ⊂ owner`. They are different vocabularies for different things —
 * a token is a capability handed to an agent, a level is what a colleague was invited as — and the
 * effective permission is the INTERSECTION, computed once per call. A caller with a write token and
 * read access to a record may read.
 *
 * NOTHING THROWS ACROSS THIS BOUNDARY. Every method returns a `Result`, because the caller is over
 * an RPC and an exception does not survive the trip with its sentence intact.
 */

import type { Clock, Refusal, Result, Scheduler, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import {
  openRecord,
  type BindGrantArgs,
  type CreateRecordArgs,
  type Entry,
  type Kernel,
  type Patch,
  type RegisterDecl,
} from '@braindog/kernel';
import type { Predicate } from '@braindog/where';

/* ── who is asking ───────────────────────────────────────────────────────── */

/** What a token may do. Three, and there is deliberately no `admin` — ADR-060. */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a person was invited as. Five, and only a person ever reaches the top two. */
export const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
export type Level = (typeof LEVELS)[number];

export type Principal =
  | { kind: 'person'; id: string; level: Level }
  | { kind: 'token'; id: string; scope: Scope; person: string; level: Level }
  | { kind: 'system'; id: string };

export type CallContext = {
  principal: Principal;
  /** Which registers this caller may touch at all. `'*'` is every one the record declares. */
  registers?: readonly string[] | '*';
  /** Groups the events of everything one call causes. */
  batch?: string;
};

/** What a method needs. The ladder is ordered, and the check is an index comparison. */
export type Need = 'read' | 'propose' | 'append' | 'write' | 'decide' | 'owner';

const TOKEN_REACH: Record<Scope, Need[]> = {
  read: ['read'],
  propose: ['read', 'propose'],
  write: ['read', 'propose', 'append', 'write'],
};

const LEVEL_REACH: Record<Level, Need[]> = {
  read: ['read'],
  append: ['read', 'propose', 'append'],
  write: ['read', 'propose', 'append', 'write'],
  decide: ['read', 'propose', 'append', 'write', 'decide'],
  owner: ['read', 'propose', 'append', 'write', 'decide', 'owner'],
};

/**
 * May this caller do this, and if not, why not in one sentence.
 *
 * THE INTERSECTION, not the maximum. A write token held by somebody with read access reads — the
 * token says what the holder may do with their access, never what access they have. Getting this
 * backwards is how a revoked colleague keeps writing through a token they were issued last year.
 */
export function allows(ctx: CallContext, need: Need): Refusal | null {
  const p = ctx.principal;
  if (p.kind === 'system') return null;

  const reach =
    p.kind === 'person'
      ? LEVEL_REACH[p.level]
      : TOKEN_REACH[p.scope].filter((n) => LEVEL_REACH[p.level].includes(n));

  if (reach.includes(need)) return null;

  const has = p.kind === 'person' ? `${p.level} access` : `a ${p.scope} token on ${p.level} access`;

  /* NO TOKEN REACHES THE TOP TWO RUNGS — ADR-060, and it is a design decision rather than a gap: a
     decision needs a person, and so does anything at owner. Reporting that as "your scope is too
     small" would send an agent looking for a bigger token, and there is not one. */
  if (p.kind === 'token' && (need === 'decide' || need === 'owner'))
    return {
      code: 'PERSON_REQUIRED',
      fix: `This needs ${need}, and no token reaches it — a person has to do it, signed in.`,
      allowed: reach,
    };

  return {
    code: p.kind === 'token' && !TOKEN_REACH[p.scope].includes(need) ? 'SCOPE_INSUFFICIENT' : 'LEVEL_REQUIRED',
    fix: `This needs ${need}, and you have ${has}.`,
    allowed: reach,
  };
}

/** And may they touch this register? A ceiling is a list, and `'*'` is no ceiling at all. */
export function reaches(ctx: CallContext, register: string): Refusal | null {
  const ceiling = ctx.registers ?? '*';
  if (ceiling === '*' || ceiling.includes(register)) return null;
  return {
    code: 'FORBIDDEN',
    fix: `This token does not reach ${register}.`,
    allowed: [...ceiling],
  };
}

/* ── the surface ─────────────────────────────────────────────────────────── */

export type Page<T> = { rows: T[]; matched: number; cursor: string | null };

export type RecordDeps = {
  sql: Sql;
  clock: Clock;
  /**
   * The alarm. Optional, because the record is testable and readable without one — but a host that
   * omits it has a record whose reminders never fire.
   */
  scheduler?: Scheduler | undefined;
};

export async function createRecordApi(deps: RecordDeps) {
  const kernel = await openRecord(deps.sql, deps.clock);
  return { ...api(kernel, deps.scheduler), kernel };
}

function api(kernel: Kernel, scheduler?: Scheduler | undefined) {
  /**
   * After every write: re-arm the alarm, then ring the doorbell.
   *
   * HERE AND NOT IN THE HOST. An earlier shape hung this off the HTTP layer, which meant a write
   * that arrived any other way — an MCP tool, a rule, a test, the self-host's own startup — derived
   * its reminders and armed nothing. The alarm is a fact about the record, so it is re-derived where
   * the record is written, and there is exactly one place that does it.
   *
   * It runs whether the write succeeded or was refused: a refusal changed nothing, so the tail is
   * one read and no calls — and a tail that only ran on success is a tail somebody has to remember
   * to think about.
   */
  const tail = async <T>(out: T): Promise<T> => {
    if (scheduler) await kernel.tail(scheduler);
    return out;
  };
  /** Every method starts here: the ladder, then the ceiling, then the work. */
  const guard = (ctx: CallContext, need: Need, register?: string): Refusal | null =>
    allows(ctx, need) ?? (register ? reaches(ctx, register) : null);

  /**
   * The vault gate: a person at `owner`, and never a bearer of any kind.
   *
   * NO TOKEN REACHES THE VAULT, AND IT IS NOT A SCOPE PROBLEM. An agent holding a write token can do
   * everything else this record does; it cannot read a credential, because a credential read by a
   * process is a credential that has left the room. Saying `SCOPE_INSUFFICIENT` would send somebody
   * looking for a bigger token, and there is not one — so the refusal names the thing that IS
   * missing: a person, in a browser, signed in.
   */
  const vault = (ctx: CallContext): Refusal | null => {
    if (ctx.principal.kind === 'token')
      return {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'Open this from the app; a token cannot reach the vault.',
        at: 'principal',
      };
    return allows(ctx, 'owner');
  };

  /** Who the write path records. A token writes as the PERSON who holds it, never as itself. */
  const actorOf = (ctx: CallContext): string =>
    ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id;

  return {
    /**
     * What this record is: its registers, and how many rows each holds.
     *
     * The first call any client makes, and it is scoped — a caller sees the registers they may
     * touch and not the ones they may not, because a list of names is itself information.
     */
    async boot(ctx: CallContext): Promise<Result<{ registers: { id: string; name: string; count: number }[] }>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const out: { id: string; name: string; count: number }[] = [];
      for (const [id, decl] of kernel.registers()) {
        if (reaches(ctx, id)) continue;
        out.push({ id, name: decl.name, count: kernel.count(id) });
      }
      return ok({ registers: out });
    },

    /** What a register holds, so a caller can write a correct row on the first try. */
    async schema(args: { register: string }, ctx: CallContext): Promise<Result<RegisterDecl>> {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      const decl = kernel.register(args.register);
      return decl
        ? ok(decl)
        : no('REGISTER_UNKNOWN', `There is no register called ${args.register}.`, {
            allowed: [...kernel.registers().keys()],
          });
    },

    async get(args: { register: string; seq: number }, ctx: CallContext): Promise<Result<Entry | null>> {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      return ok(kernel.get({ register: args.register, seq: args.seq }));
    },

    async list(
      args: { register: string; where?: Predicate; limit?: number; cursor?: string | null },
      ctx: CallContext,
    ): Promise<Result<Page<Entry>>> {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      return kernel.list(args);
    },

    /**
     * `append` and not `write`, and the difference is the point.
     *
     * A colleague invited to add rows can add rows. Editing what is already there is a different
     * permission, because the risk is different: a wrong new row is visible and a wrong edit to an
     * old one is not.
     */
    async create(args: { register: string; fields: Patch; note?: string }, ctx: CallContext): Promise<Result<Entry>> {
      const stop = guard(ctx, 'append', args.register);
      if (stop) return { ok: false, refusal: stop };
      return tail(
        kernel.create(args.register, args.fields, {
          actor: actorOf(ctx),
          ...(args.note === undefined ? {} : { note: args.note }),
          ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
        }),
      );
    },

    async update(
      args: { register: string; seq: number; patch: Patch; version?: number; note?: string },
      ctx: CallContext,
    ): Promise<Result<Entry>> {
      const stop = guard(ctx, 'write', args.register);
      if (stop) return { ok: false, refusal: stop };
      return tail(
        kernel.update(args.register, `${args.register}#${args.seq}`, args.patch, {
          actor: actorOf(ctx),
          ...(args.version === undefined ? {} : { version: args.version }),
          ...(args.note === undefined ? {} : { note: args.note }),
          ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
        }),
      );
    },

    /* ── VAULT ────────────────────────────────────────────────── */

    /** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
    async listGrants(ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.grants());
    },

    /** Mint a grant, or rotate one. */
    async bindGrant(args: BindGrantArgs, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.bindGrant(args, actorOf(ctx)));
    },

    /** The sealed bytes, and the reading counted. The record cannot open them. */
    async openGrant(args: { id: string; kek_id?: string | undefined }, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.openGrant(args, actorOf(ctx));
    },

    /** Out of service, and the bytes destroyed. The row stays: what it opened is a fact. */
    async revokeGrant(args: { id: string }, ctx: CallContext) {
      const stop = vault(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.revokeGrant(args.id, actorOf(ctx)));
    },

    /**
     * Say what this record is. INTERNAL: the host calls it, and it is not in `ROUTES`.
     *
     * IT TAKES NO `CallContext` AND THAT IS THE POINT. It runs before there is anybody to check
     * against — the `member('*', 'owner')` row it writes is the row every later permission check
     * reads — so a ladder here would either refuse the first call or be a ladder with a hole in it.
     * What keeps it safe is that it is unroutable: `handlersFor` builds from the shared table, and
     * this is not in it.
     */
    async createRecord(args: CreateRecordArgs) {
      return tail(kernel.createRecord(args));
    },

    /** A row's history: the writes that made it, each with who and when. */
    async history(args: { register: string; seq: number }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop } as Result<never>;
      const row = kernel.get({ register: args.register, seq: args.seq });
      return ok(row ? kernel.history(row.id) : []);
    },

    /**
     * Rows whose text matches, across every register the caller may see.
     *
     * The ceiling is passed DOWN rather than applied to the answer: a caller filtered afterwards
     * gets a short page whenever the matches were mostly in a register they cannot see, and cannot
     * tell that from there having been no matches.
     */
    async search(args: { q: string; limit?: number }, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as Result<never>;
      const ceiling = ctx.registers ?? '*';
      const registers = ceiling === '*' ? undefined : [...ceiling];
      const hits = kernel.search(String(args.q ?? ''), {
        ...(registers ? { registers } : {}),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      });
      return ok(
        hits.flatMap((hit) => {
          const row = kernel.get(hit.id);
          if (!row) return [];
          const title = kernel.register(row.register)?.title;
          return [{ register: row.register, seq: row.seq, title: title ? String(row.fields[title] ?? '') : '', rank: hit.rank }];
        }),
      );
    },

    /** The record's version: what changed since is a range scan from here. */
    async version(ctx: CallContext): Promise<Result<number>> {
      const stop = guard(ctx, 'read');
      return stop ? { ok: false, refusal: stop } : ok(kernel.version());
    },
  };
}

export type RecordApi = Awaited<ReturnType<typeof createRecordApi>>;
