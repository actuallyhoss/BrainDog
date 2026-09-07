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
import { PRIMITIVES_VERSION } from 'braindog-render';
import {
  install,
  normalise,
  plan,
  uninstall,
  type Host,
  type Installed,
  type PackSource,
} from '@braindog/declare';
import { no, ok } from '@braindog/ports';
import {
  fill,
  openRecord,
  type BindGrantArgs,
  type CreateRecordArgs,
  type Entry,
  type Kernel,
  FORMAT_VERSION,
  TRAVELS,
  type OutboxKind,
  carryingOf,
  headline,
  type GovernRegister,
  type Patch,
  type Proposal,
  type RegisterDecl,
  type RuleDecl,
  type Signer,
  type Verdict,
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
  /**
   * `level` IS NULLABLE, and that is a state rather than an absence of information.
   *
   * Somebody invited to one register holds nothing ON THE RECORD: not `owner`, which is what
   * promoting their highest scoped level used to give them, and not `read` either, because `append`
   * is the one rung whose whole point is that it does not read. Every method that names no register
   * asks for `read` with nothing to scope it, so any invented record-wide level was a key to all of
   * them. `null` is the honest value, and the type carrying it is what makes every reader deal with
   * it.
   */
  | { kind: 'person'; id: string; level: Level | null }
  | { kind: 'token'; id: string; scope: Scope; person: string; level: Level | null }
  | { kind: 'system'; id: string };

export type CallContext = {
  principal: Principal;
  /**
   * What this caller holds on named registers, when it differs from their record level.
   *
   * THE OVERRIDE, NOT THE CEILING. `registers` says which registers exist for this caller at all;
   * this says what they may DO with one of them — and the two are separate because "read the record
   * and write this one" and "see only this one" are different invitations.
   */
  levels?: Readonly<Record<string, Level>> | undefined;

  /** Which registers this caller may touch at all. `'*'` is every one the record declares. */
  registers?: readonly string[] | '*';
  /** Groups the events of everything one call causes. */
  batch?: string;

  /**
   * Whether this caller presented a credential of their own.
   *
   * IT IS FALSE FOR EXACTLY ONE THING: a self-host with no `BRAINDOG_TOKEN`, where an
   * unauthenticated request is the owner. That is right for one person on one machine — the process
   * binds loopback, and the machine is the boundary — and it stops being right the moment the call
   * MINTS SOMETHING THAT OUTLIVES THAT BOUNDARY. A bearer works from anywhere, for thirty days,
   * including after the operator later sets a token and the process binds every interface.
   *
   * `49 §5.2` step 7 admits ADMIN from a cookie, from `config.token`, or from an operation grant.
   * A request carrying nothing is none of the three, and this is how a method says so.
   */
  credentialed?: boolean;
};

/** What a method needs. The ladder is ordered, and the check is an index comparison. */
export type Need = 'read' | 'propose' | 'append' | 'write' | 'decide' | 'owner';

/** The ladder, in order, so `whoami` can say how far up it the caller reaches. */
export const NEEDS: readonly Need[] = ['read', 'propose', 'append', 'write', 'decide', 'owner'];

const TOKEN_REACH: Record<Scope, Need[]> = {
  read: ['read'],
  propose: ['read', 'propose'],
  write: ['read', 'propose', 'append', 'write'],
};

const LEVEL_REACH: Record<Level, Need[]> = {
  read: ['read'],
  /* AND NO READ, which is the whole of what `append` means. 20 §1: *"`create`, `propose` and `log`
     — and no read. The conservative half: an appender sees nothing, not even what it filed."* This
     included `read`, so a contractor invited to file expenses could list every register inside their
     ceiling. It is not a ladder rung out of order; it is the one level whose point is that it is
     not a prefix of the others. Somebody who needs to see what they filed gets a `read` grant on
     that register, which is the mechanism the sentence above names. */
  append: ['propose', 'append'],
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

  /* NOTHING ON THE RECORD REACHES NOTHING ON THE RECORD. A caller with only register-scoped rows
     arrives here with `level: null` for anything not scoped to one of them.

     AND IT SAYS WHICH ONES, AND WHAT TO DO. This named no rule, no remedy and no next step, and sent
     `allowed: []` — so an agent an owner had set up ten minutes earlier could not tell whether to
     retry, to ask for something else, or to stop. Naming the registers it DOES hold is the whole of
     the answer: either the call belongs to one of them, or it belongs to the record and this caller
     was never given the record. */
  if (p.level === null)
    return {
      code: 'FORBIDDEN',
      fix: ctx.registers && ctx.registers !== '*' && ctx.registers.length > 0
        ? `This call is about the record itself, and you hold ${[...ctx.registers].join(', ')} and nothing else. Name one of those, or ask the owner for a record-wide token.`
        : 'This call is about the record itself, and you hold no access to it. Ask the owner for a token.',
      allowed: ctx.registers && ctx.registers !== '*' ? [...ctx.registers] : [],
    };

  const level: Level = p.level;
  const reach =
    p.kind === 'person'
      ? LEVEL_REACH[level]
      : TOKEN_REACH[p.scope].filter((n) => LEVEL_REACH[level].includes(n));

  if (reach.includes(need)) return null;

  const has = p.kind === 'person' ? `${level} access` : `a ${p.scope} token on ${level} access`;

  /* NO TOKEN REACHES THE TOP TWO RUNGS — ADR-060, and it is a design decision rather than a gap: a
     decision needs a person, and so does anything at owner. Reporting that as "your scope is too
     small" would send an agent looking for a bigger token, and there is not one. */
  if (p.kind === 'token' && (need === 'decide' || need === 'owner'))
    return {
      code: 'PERSON_REQUIRED',
      fix: `This needs ${need}, and no token reaches it — a person has to do it, signed in.`,
      allowed: reach,
    };

  /* AND THE REMEDY, WHICH IS DIFFERENT FOR THE TWO CODES. `This needs write, and you have a propose
     token on read access` was complete about the STATE and silent about what to do next — which is
     half a sentence, and the half a caller does not need. A scope that is too small is a token the
     owner can mint bigger; a `propose` token at its ceiling has another way through, which is to
     propose. `PERSON_REQUIRED` above already reads like this and is the shape being copied. */
  const short = p.kind === 'token' && !TOKEN_REACH[p.scope].includes(need);
  const next =
    p.kind !== 'token'
      ? ' Ask an owner to raise your access.'
      : short && p.scope === 'propose' && need === 'write'
        ? ' Send it as a proposal, or ask the owner for a write token.'
        : short
          ? ' Ask the owner for a token with a wider scope.'
          : ' Ask the owner to raise the access this token was minted against.';

  return {
    code: short ? 'SCOPE_INSUFFICIENT' : 'LEVEL_REQUIRED',
    fix: `This needs ${need}, and you have ${has}.${next}`,
    allowed: reach,
  };
}

/** And may they touch this register? A ceiling is a list, and `'*'` is no ceiling at all. */
export function reaches(ctx: CallContext, register: string): Refusal | null {
  const ceiling = ctx.registers ?? '*';
  if (ceiling === '*' || ceiling.includes(register)) return null;
  /* AND WHAT IT DOES REACH. The list was already in `allowed` for a machine and nowhere in the
     sentence for a person, so a refusal that could have ended the search sent them back to the
     owner to ask what they had. */
  return {
    code: 'FORBIDDEN',
    fix: `This token does not reach ${register}. It reaches ${[...ceiling].join(', ')}.`,
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
  /** The outbox kinds this deployment can deliver. The doorbell rings for those and no others. */
  delivers?: readonly OutboxKind[] | undefined;
  /**
   * What signs an exported `.dog`, when this host holds the record's signing key.
   *
   * IT IS A CALLBACK AND NOT A KEY, all the way down. `12 §6` puts the key hierarchy in the host;
   * this package and the kernel below it hold sealed bytes they cannot open, and a signer that
   * arrived as a key would be that rule broken at the one boundary it exists to protect.
   */
  sign?: Signer | undefined;
};

export async function createRecordApi(deps: RecordDeps) {
  const kernel = await openRecord(deps.sql, deps.clock, {
    ...(deps.delivers === undefined ? {} : { delivers: deps.delivers }),
    ...(deps.sign === undefined ? {} : { sign: deps.sign }),
  });
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
  const guard = (ctx: CallContext, need: Need, register?: string): Refusal | null => {
    /* THE REGISTER'S OWN LEVEL WHEN IT HAS ONE, which is what makes a level per register a rule
       rather than a decoration. A bookkeeper with `read` on the record and `write` on one register
       is the point; so is an owner held to `read` on the one that carries the payroll. */
    /* `Object.hasOwn`, BECAUSE THE KEY COMES FROM THE CALLER. `ctx.levels['constructor']` is
       `Object`, not `undefined` — so `GET /api/list?register=constructor` ran the permission check
       with a level of `Object`, `LEVEL_REACH[Object]` was `undefined`, and `.includes` threw a
       `TypeError` out of the one function this package promises never throws over. A 500 from the
       authorisation check is not an escalation and is not a thing that should be possible. */
    const held =
      register !== undefined && Object.hasOwn(ctx.levels ?? {}, register) ? ctx.levels?.[register] : undefined;
    const at: CallContext =
      held === undefined || ctx.principal.kind === 'system'
        ? ctx
        : { ...ctx, principal: { ...ctx.principal, level: held } };

    return allows(at, need) ?? (register ? reaches(ctx, register) : null);
  };

  /**
   * The guard for a read that names no register AND FILTERS BY THE CEILING ITSELF.
   *
   * TWO KINDS OF REGISTER-LESS METHOD, and treating them alike broke one of them. `members`,
   * `whoami` and `markRead` are about the RECORD: somebody who holds only named registers holds none
   * of it, and `guard` refusing a `null` level is right. But `boot`, `search`, `page`, `metric`,
   * `governance` and `digestToday` are about ROWS, and every one of them already filters what it
   * returns to the caller's ceiling — refusing them outright made a scoped member unable to see even
   * their own registers' figures, and made every one of those filters dead code, which is how a
   * ceiling stops being enforced by being enforced twice.
   *
   * SO A SCOPED MEMBER READS AT THE HIGHEST LEVEL THEY HOLD ANYWHERE, and the filter does the rest.
   * That is not a widening: the ladder still refuses `write` to somebody who only holds `read`, and
   * `reaches` still refuses every register they were not given. It is the difference between "may
   * you ask this question at all" and "which rows are in the answer".
   */
  const scoped = (ctx: CallContext, need: Need): Refusal | null => {
    const p = ctx.principal;
    if (p.kind === 'system' || p.level !== null) return guard(ctx, need);

    const held = Object.values(ctx.levels ?? {});
    if (held.length === 0) return guard(ctx, need);
    const best = held.sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0]!;
    return allows({ ...ctx, principal: { ...p, level: best } }, need);
  };

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

  /**
   * The ADMIN gate: an owner, in a browser, and no token of any kind.
   *
   * IT IS THE VAULT'S ARGUMENT APPLIED TO SHAPE. A pack changes what the record IS — the registers,
   * the pages, the rules that run while nobody is looking — and ADR-060 says there is no `admin`
   * scope to issue for that. The refusal names the thing that IS missing rather than a bigger token
   * somebody would then go looking for.
   */
  const admin = (ctx: CallContext): Refusal | null => {
    if (ctx.principal.kind === 'token')
      return {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'Open this from the app; a token cannot change what this record is.',
        at: 'principal',
      };
    return allows(ctx, 'owner');
  };

  /** The declaration state a plan is built against. */
  const installedState = (): Installed => ({
    format: FORMAT_VERSION,
    primitives: PRIMITIVES_VERSION,
    record_version: kernel.version(),
    packs: kernel.packs(),
    declarations: kernel.declarations() as Installed['declarations'],
    rows: kernel.census(),
  });

  /**
   * The four functions a pack install needs from the record, with the caller bound.
   *
   * THE SEEDS GO THROUGH THE WRITE PATH like every other row — coerced, validated, refused by the
   * register's own rules — and with `cascade: false`, because a pack's example rows firing a
   * customer's notification rules on the day they install it is the worst first impression there is.
   */
  const packHost = (ctx: CallContext): Host => ({
    count: (register) => kernel.count(register),
    stage: (batch) => kernel.stageInstall(batch as never),
    transaction: (fn) => kernel.transaction(fn),
    reload: () => kernel.reload(),
    retire: (ids) => kernel.retire(ids),
    seed: (register, fields, note) =>
      kernel.create(register, { ...fields, tags: exampleTag(fields) }, {
        actor: actorOf(ctx),
        cascade: false,
        ...(note === undefined ? {} : { note }),
      } as never),
    remember: (row) => kernel.rememberPack(row),
    forget: (id) => kernel.forgetPack(id),
    claimed: (pack) => kernel.packClaims(pack),
  });

  /**
   * The `example` marker, which IS the value `example` in a register's own `tags` field.
   *
   * A SEEDED ROW NOBODY CAN TELL FROM A REAL ONE IS A ROW NOBODY DELETES. The marker is a value in
   * a declared field rather than a column, because a column would be a thing every register carries
   * for the sake of the few that are seeded.
   */
  const exampleTag = (fields: Record<string, unknown>): string[] => {
    const already = Array.isArray(fields.tags) ? (fields.tags as unknown[]).map(String) : [];
    return already.includes('example') ? already : [...already, 'example'];
  };

  /**
   * The fields a predicate filters on that this register has no index for.
   *
   * THE DECLARATION IS THE AUTHORITY, not the SQL plan. `index:` on a field is what puts a partial
   * index on it at install, so a field without it is a scan by construction — no `EXPLAIN` needed,
   * and no dependence on a planner whose choices differ between the two runtimes this ships to.
   */
  const unindexed = (register: string, where: Predicate | undefined): string[] => {
    if (!where) return [];
    const decl = kernel.register(register);
    if (!decl) return [];
    const indexed = new Set(
      decl.fields.filter((f) => (f as { index?: boolean }).index || f.unique).map((f) => f.id),
    );
    const out = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      for (const key of ['all', 'any', 'none'])
        if (Array.isArray(n[key])) {
          for (const child of n[key] as unknown[]) walk(child);
          return;
        }
      if (typeof n.field === 'string' && !indexed.has(n.field)) out.add(n.field);
    };
    walk(where);
    return [...out];
  };

  /**
   * Whether a governance row is about a register this caller cannot reach.
   *
   * ONLY A `rowset` NAMES ONE. An `options` body is a question and its answers, a `pattern` is a
   * declaration, a `change` is a diff — none of them carries somebody's rows. A `rowset` does, up to
   * two hundred of them, with every field value in the body.
   */
  const holds = (ctx: CallContext, row: Record<string, unknown>): boolean => {
    const body = row.body as Record<string, unknown> | undefined;
    /* EVERY BODY THAT NAMES A REGISTER, not only a `rowset`. A `pattern` carries a whole ingest
       declaration with `writes.register` on it and a `change` carries a `declaration_id`; both name
       a register and both used to pass unfiltered while the one that carries ROWS was filtered. */
    const named =
      row.body_kind === 'rowset'
        ? body?.register
        : row.body_kind === 'pattern'
          ? ((body?.ingest as { body?: { register?: unknown } } | undefined)?.body?.register ??
            (body?.ingest as { writes?: { register?: unknown } } | undefined)?.writes?.register)
          : row.body_kind === 'change'
            ? String(body?.declaration_id ?? '').replace(/^register\./, '')
            : undefined;
    return typeof named === 'string' && named !== '' && reaches(ctx, named) !== null;
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
      const stop = scoped(ctx, 'read');
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

      /* A FILTER ON A FIELD WITH NO INDEX IS A SCAN, AND THE RECORD COUNTS IT. `query.scan` is one
         of the four detectors the observe loop ships with — the one with the most carefully derived
         threshold, two hundred in thirty days, from the point where an index stops being a liability
         and starts paying for itself — and nothing in the product emitted the signal, so it could
         never fire. The declaration already knows which fields are indexed; this is the one place
         that knows which fields a caller actually filtered on.

         AFTER THE GUARD, so a refused read is not evidence about anything, and outside the answer,
         so counting never changes what comes back. */
      for (const field of unindexed(args.register, args.where))
        kernel.observe([{ kind: 'query.scan', subject: `${args.register}.${field}` }]);

      /* AND THAT THE REGISTER WAS READ AT ALL. `24 §4.2` lists "register never read, page never
         rendered" as a signal, and a NEVER is only answerable if the reads are counted — the
         absence of a row is the whole finding, so there is nothing to compute at analysis time and
         nothing to infer from anywhere else.

         ONE ROW PER REGISTER PER DAY. `observe` is an upsert on `(kind, subject, day)`, so a
         thousand reads of one register on one day are one row and one increment. It makes a read a
         write, which is the price of the question: a record that cannot say which of its registers
         nobody has opened in six months cannot suggest retiring one. */
      kernel.observe([{ kind: 'register.read', subject: args.register }]);

      return kernel.list(args);
    },

    /**
     * `append` and not `write`, and the difference is the point.
     *
     * A colleague invited to add rows can add rows. Editing what is already there is a different
     * permission, because the risk is different: a wrong new row is visible and a wrong edit to an
     * old one is not.
     */
    async create(args: { register: string; fields: Patch; note?: string; op_id?: string }, ctx: CallContext): Promise<Result<Entry>> {
      const stop = guard(ctx, 'append', args.register);
      if (stop) return { ok: false, refusal: stop };
      return tail(
        kernel.create(args.register, args.fields, {
          actor: actorOf(ctx),
          ...(args.note === undefined ? {} : { note: args.note }),
          ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
          /* A RETRY IS ONE ROW. An agent whose answer was lost sends the same request again, and
             without its own id the record has no way to know the second is the first. */
          ...(args.op_id === undefined ? {} : { opId: args.op_id }),
        }),
      );
    },

    async update(
      args: { register: string; seq: number; patch: Patch; version?: number; note?: string; op_id?: string },
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
          ...(args.op_id === undefined ? {} : { opId: args.op_id }),
        }),
      );
    },

    /* ── pages and figures ─────────────────────────────────────── */

    /** Every page a person could open, templates expanded into one page per row. */
    async pages(ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      /* SCOPED, LIKE `boot` IS. This returned every page a record declares, to anybody with `read` on
         anything — and a page's title is a sentence about what the record holds. "Payroll, monthly"
         tells a bookkeeper invited to one register that there is a payroll register, which is the
         exact inference `boot` filters its own list to prevent: a list of names is itself
         information.

         A PAGE IS VISIBLE IF ANY REGISTER IT DRAWS FROM IS. Not every one — `page()` already refuses
         the blocks a caller cannot reach and draws the rest, so a page they can see three fifths of
         is a page they can use. A page bound to no register at all is prose, and prose is for
         anybody who may read. */
      return ok(
        kernel
          .pages()
          /* A PAGE IS VISIBLE IF ANY REGISTER IT DRAWS FROM IS. `page()` already refuses the blocks a
             caller cannot reach and draws the rest, so a page they can see three fifths of is a page
             they can use. One that names none is prose, and prose is for anybody who may read. */
          .filter((p) => p.registers.length === 0 || p.registers.some((id) => !reaches(ctx, id)))
          /* AND THE REGISTER LIST DOES NOT TRAVEL. It is what the filter is FOR, and shipping it
             would hand back the names the filter exists to withhold. */
          .map((p) => ({ slug: p.slug, title: p.title })),
      );
    },

    /**
     * One page, with every block run.
     *
     * A PAGE IS SCOPED LIKE ANYTHING ELSE. A block over a register the caller cannot reach comes back
     * refused rather than filled — and the page still draws, because one block's refusal is one
     * block. A caller who can see three of five registers sees three blocks and two sentences.
     */
    async page(args: { slug: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      /* THE OTHER HALF OF "never read, never rendered" (24 §4.2). One row per page per day, and the
         finding is the page that has none — a page nobody opens is a page whose blocks cost a query
         every time the schedule runs and tell nobody anything. */
      if (typeof args?.slug === 'string' && args.slug) kernel.observe([{ kind: 'page.render', subject: args.slug }]);
      /* COERCED AT THE EDGE. These arrive from a query string a stranger wrote, and `.split` on an
         absent one threw a TypeError out of the route — a refusal is a value here, an exception is
         not, and the exception did not even reach the client: the request simply hung. */
      if (typeof args?.slug !== 'string' || !args.slug)
        return no('REQUIRED_MISSING', 'A page is asked for by its slug.', { at: 'slug' });
      const out = kernel.page(args.slug);
      if (!out.ok) return out;
      return ok({
        ...out.value,
        blocks: out.value.blocks.map((b) => {
          const register = b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null;
          const beyond = register ? reaches(ctx, register) : null;
          return beyond ? { ...b, rows: [], matched: 0, refusals: [beyond] } : b;
        }),
      });
    },

    /** One figure, by the id a `stat` cell names. */
    async metric(args: { metric: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (typeof args?.metric !== 'string' || !args.metric)
        return no('REQUIRED_MISSING', 'A figure is asked for by its id, optionally with a parameter after a colon.', { at: 'metric' });
      /* The FIRST colon separates: a parameter may contain one, and splitting on every colon read
         `project-owed:C:\Repos` as a project called `C`. */
      const at = args.metric.indexOf(':');
      const id = at < 0 ? args.metric : args.metric.slice(0, at);
      const param = at < 0 ? undefined : args.metric.slice(at + 1);
      /* THE CEILING BEFORE THE EXISTENCE CHECK, and the order is the whole point. Answering
         `METRIC_UNKNOWN` for a name that does not exist and `FORBIDDEN` for one that does, over a
         register the caller cannot see, is an enumeration oracle: one probe per guess tells you
         which figures this business keeps. `boot` goes to trouble to hide register names on the
         grounds that a list of names is itself information, and this handed the same list back a
         name at a time.

         SO A METRIC OVER A REGISTER YOU CANNOT REACH IS A METRIC THAT DOES NOT EXIST, said in those
         words. It is the same answer somebody outside the ceiling would get for a name nobody ever
         declared, which is the only shape of answer that leaks nothing. */
      const decl = kernel.metricDecl(id ?? '');
      const filled = decl && param !== undefined ? (fill(decl, null, param) as typeof decl) : decl;
      const register = filled?.source.startsWith('register.') ? filled.source.slice('register.'.length) : null;
      if (!filled || (register && reaches(ctx, register)))
        return no('METRIC_UNKNOWN', `There is no metric called ${args.metric}.`, { at: 'metric' });
      return kernel.metric(filled);
    },

    /**
     * What a rule WOULD do, without doing any of it.
     *
     * A READ, and scoped like one: the sample it returns names rows, so a caller who cannot reach
     * the register cannot preview a rule against it. Nothing in it calls the write path — which is
     * what makes it safe to hand to whoever is writing the rule rather than only to an owner.
     */
    async dryRun(args: { rule: RuleDecl; limit?: number }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args?.rule?.register);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.rule?.register || !Array.isArray(args.rule.then))
        return no('VALUE_MALFORMED', 'A rule names a register and what it would then do.', { at: 'rule' });
      return kernel.dryRun(args.rule, args.limit);
    },

    /**
     * Who the caller is, as the record sees them.
     *
     * THE FIRST CALL AN AGENT SHOULD MAKE, and the one every product forgets to ship. An agent that
     * cannot ask what it may do finds out by being refused, one verb at a time, in front of whoever
     * is watching — and the answer it works out that way is a guess it will still be acting on
     * three turns later.
     *
     * IT SAYS THE INTERSECTION, not the token's scope. A write token held by somebody with read
     * access reads, and reporting the scope alone would be reporting the half that is not binding.
     */
    async whoami(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };

      const p = ctx.principal;
      const may = NEEDS.filter((need) => allows(ctx, need) === null);
      return ok({
        kind: p.kind,
        id: p.kind === 'system' ? 'system' : p.id,
        person: p.kind === 'token' ? p.person : p.kind === 'person' ? p.id : null,
        level: p.kind === 'system' ? 'owner' : p.level,
        scope: p.kind === 'token' ? p.scope : null,
        /* WHICH REGISTERS, when the caller is held to some of them. `null` is "all of them", which
           is a different answer from "none" and the two must never be one value. */
        registers: ctx.registers ?? null,
        may,
      });
    },

    /**
     * What a digest would say if it went now. It sends nothing.
     *
     * THE SAME ASSEMBLY THE SCHEDULED ONE USES. A "today" screen computed by a second code path is
     * a screen that disagrees with the email on the day one of them is wrong, and the person
     * reading both has no way to tell which.
     */
    async digestToday(args: { digest?: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };

      /* AND IT IS HELD TO THE CALLER'S CEILING. `boot` hides a register this caller cannot reach and
         `list` refuses it — and then a digest section over it handed the rows across. A section is a
         read of a register like any other, and it answers to the same ceiling. */
      return ok(
        kernel.digestToday(args?.digest).map((d) => {
          const sections = d.sections.filter((s) => {
            const register = s.source.startsWith('register.') ? s.source.slice('register.'.length) : null;
            return register === null || !reaches(ctx, register);
          });
          return { ...d, sections, carrying: carryingOf(sections).length, headline: headline(d.name, carryingOf(sections)) };
        }),
      );
    },

    /**
     * How far this person has read.
     *
     * A PERSON, NOT A TOKEN. A read mark is a fact about somebody's attention, and an agent polling
     * a record does not have any — letting a token move it would mean a person coming back to a
     * record their own agent had marked as read.
     *
     * AND IT IS NOT AN EVENT. Every glance at a screen would otherwise be a line in somebody's
     * history, and the history is the thing that has to stay worth reading.
     */
    async markRead(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (ctx.principal.kind !== 'person')
        return no('PERSON_REQUIRED', 'A read mark belongs to a person, and a token is not one.', { at: 'principal' });
      return ok({ at: kernel.markRead(ctx.principal.id), seen_at: kernel.seenAt(ctx.principal.id) });
    },

    /**
     * A note against a row.
     *
     * IT CHANGES NOTHING AND IS STILL A WRITE, because it is a thing somebody said and the record
     * keeps what was said. It goes through `update` with an empty patch, so it answers to the same
     * permission, lands in the same history, and cannot become a second way to write a field.
     */
    async log(args: { register: string; seq: number; note?: string }, ctx: CallContext) {
      const note = String(args?.note ?? '').trim();
      if (!note) return no('REQUIRED_MISSING', 'A note is one sentence, and this one is empty.', { at: 'note' });
      /* THE LEDGER'S OWN CEILING. `event.note` is 280 characters because a note nobody reads is a
         note nobody writes; cutting it silently would lose the half somebody meant. */
      if (note.length > 280)
        return no('OUT_OF_BOUNDS', `A note is at most 280 characters, and this one is ${note.length}.`, { at: 'note' });
      /* `append`, NOT `write`. 20 §1 puts `log` in the append half beside `create` and `propose` —
         "the conservative half: an appender sees nothing, not even what it filed" — and 45 §5.1 says
         the same. Demanding `write` meant an agent invited to file notes and nothing else could not
         file one. */
      const stop = guard(ctx, 'append', args.register);
      if (stop) return { ok: false as const, refusal: stop };
      /* AND IT IS A `note` EVENT RATHER THAN AN `edit`. This went through `update` with an empty
         patch, so a log entry bumped the row's VERSION — and anybody holding the version they read
         then got a spurious `VERSION_STALE` on their next real change, for a call that changed no
         field. 30 §2: `note` is "the one row a person or an agent writes on purpose". */
      return tail(kernel.log(args.register, args.seq, actorOf(ctx), note));
    },

    /* ── THE DECISION GATE ─────────────────────────── */

    /**
     * The governance rows: what has been proposed, what was decided, what was predicted.
     *
     * A READ, and not scoped by register, because a suggestion is about the record rather than about
     * one register — and one that the person who has to answer it cannot see is a proposal that was
     * never made.
     */
    async governance(args: { register?: string; id?: string; status?: string; limit?: number }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const register = (args?.register ?? 'suggestion') as GovernRegister;
      if (args?.id) {
        /* AND ONE BY ID ANSWERS TO THE SAME CEILING. The list path was filtered and this was not,
           and the ids are sequential — `SG1`, `SG2` — so one extra query parameter walked the whole
           queue. A row you may not see does not exist, which is the same answer a missing id gets. */
        const row = kernel.governanceRow(register, String(args.id));
        return ok(row && holds(ctx, row) ? null : row);
      }
      const rows = kernel.governance(register, {
        ...(args?.status === undefined ? {} : { status: String(args.status) }),
        ...(args?.limit === undefined ? {} : { limit: Number(args.limit) }),
      });
      if (!rows.ok) return rows;

      /* AND IT IS HELD TO THE CALLER'S CEILING, like every other read of rows. A `rowset` body is
         `{ register, rows: […] }` and carries up to two hundred field-value objects verbatim — so
         a bookkeeper scoped to expenses could read every proposed payroll row out of the queue,
         through a method that names no register and therefore ran no ceiling check. `list` refuses
         that register, `boot` hides it, and the digest was taught the same lesson one commit
         earlier; the gate is the last read that had not been. */
      return ok(rows.value.filter((r) => !holds(ctx, r)));
    },

    /**
     * Open one.
     *
     * `propose` IS ITS OWN RUNG, and it is the whole reason the token ladder has three. An agent that
     * can propose and not write is an agent whose mistakes are a queue rather than a diff.
     */
    async propose(args: Proposal, ctx: CallContext) {
      /* THE REGISTER A `rowset` NAMES IS ONE THE CALLER MUST REACH. `propose` took no register, and
         `checkBody` only asks whether the named one EXISTS — so a `propose` token scoped to expenses
         could put payroll rows in the queue an owner reads, and (before the line above) every other
         scoped member could then read them. A proposal is not a write, but it is rows about a
         register, and naming one you cannot see is the same information leak in the other
         direction. */
      const named = args?.body_kind === 'rowset' ? (args.body as { register?: unknown })?.register : undefined;
      const stop = guard(ctx, 'propose', typeof named === 'string' ? named : undefined);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.propose(args, actorOf(ctx));
    },

    /**
     * Answer one.
     *
     * `decide` IS A RUNG NO TOKEN REACHES (ADR-060). An agent may put a question in front of a
     * person; it may not answer its own question, and that is not a scope somebody can be issued.
     * An accepted `pattern` or `change` is installed here, after the gate has said yes and before
     * the suggestion is resolved — a decision that resolved before its change landed would be a lie.
     */
    async decide(args: { id: string; decide?: { option: string; reason: string }; defer?: { until: string; why: string }; resolved_as?: 'wont-fix' | 'incorrect'; reason?: string }, ctx: CallContext) {
      const stop = guard(ctx, 'decide');
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which suggestion?', { at: 'id' });

      const verdict = (
        args.decide ? { decide: args.decide } : args.defer ? { defer: args.defer } : { resolved_as: args.resolved_as, reason: args.reason }
      ) as Verdict;
      /* THE TAIL, LIKE EVERY OTHER WRITE PATH. Accepting a `change` that carries a prediction writes
         a `score` row into `schedule`, and this returned bare — so the alarm was never compared
         against it. `setDeclaration` wraps the same `kernel.install` in `tail` twenty lines below,
         which is the proof this was an omission rather than a decision. On a provisioned record the
         hourly purge row re-armed within the hour; on one without an identity row, nothing did. */
      const out = kernel.decide(args.id, verdict, actorOf(ctx));
      if (!out.ok || !out.value.install) return tail(out);

      /* THE DECLARATION LANDS BEFORE THE ANSWER DOES. If it will not install, the gate's own
         transaction has already committed — so the suggestion is reopened rather than left resolved
         with nothing behind it. */
      const decl = out.value.install as { id?: string; kind?: string; body?: unknown };
      const put = await kernel.install([decl as never]);
      if (!put.ok) {
        kernel.reopen(out.value.suggestion);
        return tail(put);
      }
      return tail(out);
    },

    /* ── ADMIN: PACKS ───────────────────────────────── */

    /**
     * What installing this pack would do to this record. It writes nothing.
     *
     * A BROWSER SESSION AND AN OWNER, and no token of any scope (ADR-060). A pack changes what a
     * record IS, and there is no scope that can be issued for that — saying `SCOPE_INSUFFICIENT`
     * would send somebody looking for a bigger token, and there is not one.
     */
    async planPack(args: { doc: unknown; source?: PackSource }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };

      const pack = await normalise(args?.doc, args?.source ?? { kind: 'local' });
      if (!pack.ok) return pack;
      return ok({ diff: await plan(pack.value, installedState()), pack: pack.value.manifest });
    },

    /**
     * Apply the plan somebody approved, and nothing else.
     *
     * THE HASH IS THE APPROVAL. `planHash` carries the record's version and the pack's checksum, so
     * a record that moved and a pack that was edited between the plan and the install are both
     * `PLAN_STALE` — and the second one is the case no version number can see.
     */
    async installPack(args: { doc: unknown; source?: PackSource; planHash: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.planHash) return no('REQUIRED_MISSING', 'Read the plan first; installing is approving one.', { at: 'planHash' });

      const pack = await normalise(args.doc, args.source ?? { kind: 'local' });
      if (!pack.ok) return pack;
      const diff = await plan(pack.value, installedState());
      return tail(await install(pack.value, diff, packHost(ctx), args.planHash));
    },

    /** Take one back out. Its declarations are retired and its rows are kept, which is the point. */
    async uninstallPack(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which pack?', { at: 'id' });
      return tail(uninstall(args.id, packHost(ctx)));
    },

    /** What is installed, and at what version. A read, because a list of names is not a change. */
    async packs(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.packs());
    },

    /**
     * One declaration, set from the app.
     *
     * THE SAME LINT A PACK GETS. A rule edited in a text box and a rule installed from a file are
     * the same declaration, and letting the in-app path skip the checks would mean the two disagree
     * about what is legal — with the app being the one that lets a broken rule through.
     *
     * IT BELONGS TO NO PACK. `pack_id` is null, so a later `uninstall` of anything cannot take it,
     * and a pack that claims the same id is a `PROVIDES_CONFLICT` rather than a silent overwrite.
     */
    async setDeclaration(args: { body: unknown }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };

      /* WRAPPED AS A ONE-DECLARATION PACK, because that is where the reading of a document lives.
         A second parser for the in-app form would be a second grammar. */
      const one = await normalise(
        {
          pack: 'in-app',
          version: '0.0.0',
          summary: 'One declaration, set from the app.',
          author: 'this record',
          license: 'none',
          declarations: [args?.body],
        },
        { kind: 'local' },
      );
      if (!one.ok) return one;

      const decl = one.value.declarations[0]!;
      return tail(await kernel.install([{ id: decl.id, kind: decl.kind, body: decl.body as never }]));
    },

    /** Retire one. Its rows stay; a declaration is a shape, not the things under it. */
    async retireDeclaration(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which declaration?', { at: 'id' });
      return tail(kernel.retire([args.id]));
    },

    /**
     * Run one installed rule over the rows that are already there.
     *
     * THERE IS NO UNDO, BY DESIGN. Sixty writes is not a thing to reverse from a button — the DRY
     * RUN is the undo, and it is the same walk with nothing written, which is why `dry` is a
     * parameter rather than a second method: two code paths would be two answers.
     *
     * AND IT ONLY FILLS GAPS. A row whose field the rule would set already has a value is left alone
     * and counted, because somebody put it there and the write path says a mechanism does not
     * overwrite what a person set.
     */
    async ruleApply(args: { id: string; dry?: boolean; limit?: number }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which rule?', { at: 'id' });
      const out = kernel.applyRule(args.id, { ...(args.dry === undefined ? {} : { dry: args.dry }), ...(args.limit === undefined ? {} : { limit: args.limit }) });
      return args.dry ? out : tail(out);
    },

    /* ── ADMIN: WHO IS ON THE RECORD ───────────────────── */

    /** Everybody on it, with what they hold and where. A read: a colleague list is not a secret. */
    async members(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.members());
    },

    /**
     * Put somebody on the record, or move them.
     *
     * A LEVEL PER REGISTER, because the alternative is a product where inviting a bookkeeper means
     * showing them everything — and what people do then is not invite the bookkeeper.
     *
     * AN INVITATION IS THE WHOLE OF WHAT THEY HOLD, not a patch: a register left out of a second one
     * is a register taken away, revoked out loud rather than left standing.
     */
    async invite(args: { person: string; email?: string; name?: string; level?: Level; registers?: Record<string, Level> }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.invite(actorOf(ctx), args ?? ({} as never)));
    },

    /** Take somebody off. Never the last owner, and every register they held is revoked out loud. */
    async removeMember(args: { person: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.person) return no('REQUIRED_MISSING', 'Who?', { at: 'person' });
      return tail(kernel.removeMember(actorOf(ctx), args.person));
    },

    /**
     * Stop somebody without deciding about them, or start them again.
     *
     * REMOVAL IS THE OTHER VERB AND IT LOSES THINGS. It deletes the membership and every level with
     * it, so restoring somebody means re-inviting them and remembering what they held. Suspension
     * keeps every row and stops all of them working — which is what you reach for when somebody has
     * left for a fortnight, or when you are not yet sure. The alternative to having it is that
     * people use removal for both and lose the second half.
     *
     * AND IT REACHES THEIR AGENTS. A token is a capability handed to an agent BY a person, so the
     * token ladder reads the suspension too; stopping somebody whose agent kept writing would be
     * the shape of half-measure that makes people distrust the whole mechanism.
     */
    async suspendMember(args: { person: string; suspended?: boolean }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.person) return no('REQUIRED_MISSING', 'Who?', { at: 'person' });
      return tail(kernel.suspendMember(actorOf(ctx), args.person, args.suspended !== false));
    },

    /* ── ADMIN: AGENT TOKENS ──────────────────────────── */

    /**
     * Mint one.
     *
     * THE SECRET IS IN THE ANSWER AND NOWHERE ELSE. What the record keeps is its hash, so a copy of
     * the database is a copy of hashes rather than a set of working keys — and nothing in this
     * product can show you a token you made last month, which is the point.
     *
     * A TOKEN IS ALWAYS SOMEBODY'S. It writes as the person who minted it and can never do more
     * than they can; the intersection is checked on every call, so a colleague whose access is
     * removed does not keep writing through a token they were issued last year.
     */
    async createToken(args: { scope: Scope; label?: string; days?: number }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      /* AND MINTING NEEDS A CREDENTIAL OF ITS OWN, which is not true of any other ADMIN method here.
         A self-host with no `BRAINDOG_TOKEN` treats an unauthenticated request as the owner — right
         for one person on one machine, where the process binds loopback and the machine is the
         boundary. This call is the one that hands out something which OUTLIVES that boundary: a
         bearer works from anywhere, for thirty days, including after the operator later sets a token
         and the process binds every interface. Anything that can reach loopback for a moment — a
         postinstall script, a container sharing the namespace, a browser talked into a request —
         walks away with a portable owner credential.

         `49 §5.2` step 7: ADMIN admits a cookie, `config.token`, or an operation grant. A request
         carrying nothing is none of the three, and this is the method where that matters. */
      if (ctx.credentialed === false)
        return {
          ok: false as const,
          refusal: {
            code: 'NEEDS_BROWSER_SESSION',
            fix: 'A bearer works from anywhere, so minting one needs a credential. Set BRAINDOG_TOKEN and send it, or open this from the app.',
            at: 'principal',
          },
        };
      return tail(await kernel.createToken(actorOf(ctx), args ?? ({} as never)));
    },

    /** Every token, with a revoke button's worth of information and never the hash. */
    async listTokens(ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.listTokens());
    },

    /** Revoke one. The second call says the same as the first. */
    async revokeToken(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!args?.id) return no('REQUIRED_MISSING', 'Which token?', { at: 'id' });
      return tail(kernel.revokeToken(actorOf(ctx), args.id));
    },

    /* ── ADMIN: THE RECORD AS A FILE ───────────────────── */

    /**
     * Take your record and go.
     *
     * THE WHOLE PROMISE, IN ONE METHOD. A `.dog` file is the record: line per row, checkable with
     * `sed` and `sha256sum`, and it imports into a fresh record and comes back out identical. A
     * product whose export is a JSON dump nobody can re-import has an export button and not an exit.
     *
     * `local` DOES NOT TRAVEL. Tokens, device grants and failed logins are facts about one
     * installation rather than about the record, and carrying them would move somebody's
     * credentials to a machine they did not authorise.
     */
    async export(args: { sections?: readonly string[]; redactGrants?: boolean; kek_id?: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };

      /* A SECTION NOBODY HAS IS NOT AN EMPTY EXPORT. `sections: "data"` — the easy JSON mistake —
         and `sections: []` both used to come back `ok` with a structurally valid `.dog` file
         containing every table header and no rows: a backup of nothing that looks like a backup. */
      if (args?.sections !== undefined) {
        if (!Array.isArray(args.sections) || args.sections.length === 0)
          return no('VALUE_MALFORMED', `Sections are a list, and one of ${TRAVELS.join(', ')}.`, { at: 'sections' });
        const wrong = args.sections.find((x) => !(TRAVELS as readonly unknown[]).includes(x));
        if (wrong !== undefined)
          return no('ENUM_VALUE_UNKNOWN', `${String(wrong)} is not a section of a .dog file.`, {
            at: 'sections',
            allowed: TRAVELS,
          });
      }
      /* THE SEALED BYTES ARE A VAULT READ, WHEREVER THEY LEAVE FROM. `openGrant` is unrouted so a
         credential cannot be reached by anything holding a token, and this method handed out every
         grant's `ciphertext` at once. So the default is redacted.

         AND THE FULL FILE NEEDS THE WRAPPING KEY NAMED. An earlier version of this gated it on
         `vault(ctx)`, which is the SAME PREDICATE as the `admin(ctx)` two lines above — both refuse
         a token and then ask for owner — so it was not a second bar at all: any caller who reached
         this line had already cleared it, and the flag was the whole of the permission. Naming the
         `kek_id` is a bar `admin` cannot clear by definition: the bytes are wrapped by that key, so
         a caller who has it can open them anyway, and one who does not gains nothing from the file.
         It is the same check `openGrant` makes, on the path that copies every grant instead of one.

         The rows still travel under redaction: labels, what each key opens, its kind, its rotation
         dates and its scopes. What is missing is the bytes. */
      if (args?.redactGrants === false) {
        const held = kernel.wrappingKey();
        if (!held || args.kek_id !== held)
          return no(
            'WRONG_KEY',
            held
              ? `The sealed bytes are wrapped by ${held}. An export carrying them names that key.`
              : 'This record has no vault, so there are no sealed bytes to carry.',
            { at: 'kek_id' },
          );
      }

      return kernel.export({
        ...(args?.sections ? { sections: args.sections as never } : {}),
        redactGrants: args?.redactGrants !== false,
        actor: actorOf(ctx),
      });
    },

    /**
     * A file into an empty record.
     *
     * EMPTY, AND THAT IS THE WHOLE OF THE RULE. Importing into a record that already holds rows
     * would merge two businesses by primary key, and there is no answer to what that should do that
     * is better than refusing.
     */
    async import(args: { lines?: readonly string[] }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (!Array.isArray(args?.lines)) return no('REQUIRED_MISSING', 'An import is the lines of a .dog file.', { at: 'lines' });
      /* AND EVERY ONE OF THEM IS A LINE. `[null]` cleared the array check and then threw out of the
         reader — across the boundary this package promises nothing throws over. */
      if (!args.lines.every((line) => typeof line === 'string'))
        return no('VALUE_MALFORMED', 'A .dog file is lines of text, and one of these is not.', { at: 'lines' });
      return tail(await kernel.import(args.lines));
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
      const stop = scoped(ctx, 'read');
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
