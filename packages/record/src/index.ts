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
  | { kind: 'person'; id: string; level: Level }
  | { kind: 'token'; id: string; scope: Scope; person: string; level: Level }
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
  /** The outbox kinds this deployment can deliver. The doorbell rings for those and no others. */
  delivers?: readonly OutboxKind[] | undefined;
};

export async function createRecordApi(deps: RecordDeps) {
  const kernel = await openRecord(deps.sql, deps.clock, deps.delivers === undefined ? {} : { delivers: deps.delivers });
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
    const held = register === undefined ? undefined : ctx.levels?.[register];
    const at: CallContext =
      held === undefined || ctx.principal.kind === 'system'
        ? ctx
        : { ...ctx, principal: { ...ctx.principal, level: held } };
    return allows(at, need) ?? (register ? reaches(ctx, register) : null);
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
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.pages());
    },

    /**
     * One page, with every block run.
     *
     * A PAGE IS SCOPED LIKE ANYTHING ELSE. A block over a register the caller cannot reach comes back
     * refused rather than filled — and the page still draws, because one block's refusal is one
     * block. A caller who can see three of five registers sees three blocks and two sentences.
     */
    async page(args: { slug: string }, ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
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
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      if (typeof args?.metric !== 'string' || !args.metric)
        return no('REQUIRED_MISSING', 'A figure is asked for by its id, optionally with a parameter after a colon.', { at: 'metric' });
      /* The FIRST colon separates: a parameter may contain one, and splitting on every colon read
         `project-owed:C:\Repos` as a project called `C`. */
      const at = args.metric.indexOf(':');
      const id = at < 0 ? args.metric : args.metric.slice(0, at);
      const param = at < 0 ? undefined : args.metric.slice(at + 1);
      const decl = kernel.metricDecl(id ?? '');
      if (!decl)
        return no('METRIC_UNKNOWN', `There is no metric called ${args.metric}.`, { at: 'metric' });
      const filled = param === undefined ? decl : (fill(decl, null, param) as typeof decl);
      const register = filled.source.startsWith('register.') ? filled.source.slice('register.'.length) : null;
      const beyond = register ? reaches(ctx, register) : null;
      if (beyond) return { ok: false as const, refusal: beyond };
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
      const stop = guard(ctx, 'read');
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
      const stop = guard(ctx, 'write', args.register);
      if (stop) return { ok: false as const, refusal: stop };
      return tail(kernel.update(args.register, `${args.register}#${args.seq}`, {}, { actor: actorOf(ctx), note }));
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
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      const register = (args?.register ?? 'suggestion') as GovernRegister;
      if (args?.id) {
        const row = kernel.governanceRow(register, String(args.id));
        return ok(row);
      }
      return kernel.governance(register, {
        ...(args?.status === undefined ? {} : { status: String(args.status) }),
        ...(args?.limit === undefined ? {} : { limit: Number(args.limit) }),
      });
    },

    /**
     * Open one.
     *
     * `propose` IS ITS OWN RUNG, and it is the whole reason the token ladder has three. An agent that
     * can propose and not write is an agent whose mistakes are a queue rather than a diff.
     */
    async propose(args: Proposal, ctx: CallContext) {
      const stop = guard(ctx, 'propose');
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
      const out = kernel.decide(args.id, verdict, actorOf(ctx));
      if (!out.ok || !out.value.install) return out;

      /* THE DECLARATION LANDS BEFORE THE ANSWER DOES. If it will not install, the gate's own
         transaction has already committed — so the suggestion is reopened rather than left resolved
         with nothing behind it. */
      const decl = out.value.install as { id?: string; kind?: string; body?: unknown };
      const put = await kernel.install([decl as never]);
      if (!put.ok) {
        kernel.reopen(out.value.suggestion);
        return put;
      }
      return out;
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
    async export(args: { sections?: readonly string[] }, ctx: CallContext) {
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
      return kernel.export(args?.sections ? { sections: args.sections as never } : {});
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
      return tail(kernel.import(args.lines));
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
