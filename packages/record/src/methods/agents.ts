/**
 * The record's methods for agents (`loop/finish/contracts.md` §2.3), written beside `index.ts` rather than inside it.
 *
 * `usedBy` IS THE FIRST, built as the worked example of `methods/` (ARC-6, on AGT-4's behalf): a real method a later
 * unit needs, so the first push that carries the mechanism proves it end to end, from this file through
 * `methods/index.ts` and the route row in `host/src/routes/agents.ts` to a caller. `triage` is beside it: the one door
 * an agent's token files or sets aside an arrival by (agents C2).
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { sessionDeclaration, type ArrivalSettled, type Entry, type Patch, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One run's use of a key or a tool: the run by its spoken id, its agent and machine, when it last used it, and how often. */
export type UsedByRun = { run: string; agent: string | null; machine: string | null; at: string; count: number };
export type UsedBy = { runs: UsedByRun[] };

/** The most runs one answer names: the ten that used the key or the tool last. */
export const USED_BY_MOST = 10;

/**
 * The most uses one answer walks, newest first: a run's `count` is its uses among these.
 *
 * A KEY AN AGENT OPENS ON EVERY START HAS A USE FOR EVERY START, and counting all of them would walk that key's whole
 * life on every read of its row. Five thousand uses is years of an agent a day, read through the event table's index on
 * `(target, ts)`.
 */
export const USED_BY_WALK = 5_000;

/**
 * The two lists this method answers for, and the field a key's grant id is held in, as the agents pack declares them
 * (`packages/seed/src/packs/agents.ts`) and as `index.ts` reads a key (`KEYS`, `KEY_FIELD`).
 */
const KEYS = 'credentials';
const KEY_FIELD = 'value';
const TOOLS = 'tools';

/** The kernel's own list of runs, whose rows are spoken `S47`: every write an agent makes is signed with that name. */
const RUN = sessionDeclaration().body as unknown as { id: string; seq_prefix: string };

/**
 * A run's name as a `GLOB` reads it: the prefix, with any character `GLOB` would read as a pattern put in brackets so
 * it is read as itself.
 */
const globbed = (prefix: string): string => prefix.replace(/[*?[\]]/g, (c) => `[${c}]`);

/**
 * The events that are a use of a tool: every write of its `seen`, which an agent stamps when it finds the tool on its
 * machine.
 *
 * A `create` IS A WRITE OF `seen` TOO when the row arrived holding one, and its event carries the whole row as JSON
 * rather than one field. `json_valid` comes first and inside a `CASE`, because an erased row's `to_v` is not JSON and
 * `json_extract` throws on it.
 */
const SEEN_WRITTEN =
  "((kind = 'edit' AND field = 'seen') OR (kind = 'create' AND CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.seen') END IS NOT NULL))";

type Use = { actor: string; count: number; at: string };

/**
 * What `triage` takes. Exactly one of `register`, `ignore` or `back`; `fields` and `note` only with `register`, and
 * `version` only with `back`, where it is the filed row's (`loop/finish/contracts.md` §2.3).
 */
export type TriageArgs = { arrival: string; register?: string; fields?: Patch; ignore?: true; note?: string; back?: true; version?: number };

/** The keys `triage` takes, named in the sentence that refuses any other. */
const TRIAGE_TAKES = ['arrival', 'register', 'fields', 'ignore', 'note', 'back', 'version'] as const;

/** The sentence every token without the `inbox` reach is given, whatever else it holds (agents C2). */
const NO_REACH = 'Triage needs a token its owner gave the inbox reach.';

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, readable, admin, no, tail } = deps;

  /**
   * Whether the caller reads the record as a whole, rather than the lists they were invited to: `wholeRecord` in
   * `index.ts`, asked the same way, since the inbox holds whatever was sent in, about any list or none.
   */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    /* AND A LEVEL THAT READS, as `wholeRecord` now asks: `append` reads nothing of the record (`20 §1`). */
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /**
   * Who a token's triage is by, as the kernel's `WriteContext` says it: the token, its run's hints, and the run's own
   * name as the actor, so the row the ladder signs and the arrival's `state` event carry the same `S<n>`.
   *
   * THE RUN IS FOUND OR OPENED FIRST, as `index.ts`'s `runFor` does for `attach`, and then named in the hints, so the
   * write's ladder lands on that run rather than opening a second one. A person signs as themselves, as `writerOf` in
   * `index.ts` has it, because a person is never a run.
   */
  const signerOf = (ctx: CallContext): Result<Pick<WriteContext, 'actor' | 'principal' | 'session'>> => {
    const p = ctx.principal;
    if (p.kind !== 'token') return ok({ actor: p.id });
    const hints = ctx.session ?? {};
    const w = { actor: `agent:${hints.agent ?? 'other'}`, principal: { kind: 'token' as const, token: p.id }, session: hints };
    const found = kernel.runFor(w, 'opened: triage');
    if (!found.ok) return found as Result<never>;
    return ok({ ...w, actor: found.value.spoken, session: { ...hints, spoken: found.value.spoken } });
  };

  /**
   * A filing's refusal, when the list it named went off with its pack: the pack's sentence in place of `REGISTER_UNKNOWN`,
   * as `offRegister` in `index.ts` answers `fileArrival`. That helper lives inside `createRecordApi` and `RecordDeps`
   * does not carry it, so the same two reads are made here over the same kernel, and every other refusal passes through.
   */
  const offRegister = <T>(register: string, out: Result<T>): Result<T> => {
    if (out.ok || !('refusal' in out) || out.refusal.code !== 'REGISTER_UNKNOWN') return out;
    const pack = kernel.packStates().find((p) => p.disabled_at !== null && p.registers.includes(register));
    return pack === undefined
      ? out
      : no<T>('PACK_DISABLED', `${register} belongs to ${pack.id}, which is turned off. Enable ${pack.id} first.`, { at: 'pack', allowed: [pack.id] });
  };

  /**
   * The runs among the newest uses of one target, grouped by run, the run that used it last first.
   *
   * ONLY AN ACTOR THAT IS A RUN'S NAME: the prefix and then digits and nothing else. A person opening a key in a browser
   * signs as themselves and an agent with no run as `agent:<name>`, and neither is a run to name here; the key's own
   * history names them.
   */
  const usesOf = (target: string, which: string): Use[] =>
    sql.all<Use>(
      `SELECT actor, COUNT(*) AS count, MAX(ts) AS at, MAX(r) AS last
         FROM (SELECT actor, ts, rowid AS r FROM event WHERE target = ? AND ${which} ORDER BY ts DESC LIMIT ?)
        WHERE actor GLOB ? AND substr(actor, ?) NOT GLOB '*[^0-9]*'
        GROUP BY actor
        ORDER BY last DESC
        LIMIT ?`,
      target,
      USED_BY_WALK,
      `${globbed(RUN.seq_prefix)}[1-9]*`,
      RUN.seq_prefix.length + 1,
      USED_BY_MOST,
    );

  /** What a key's uses are: every open of its sealed value, which the vault writes as `grant.read` on the grant. */
  const keyUses = (row: Entry): Use[] => {
    const held = row.fields[KEY_FIELD];
    return typeof held === 'string' && held !== '' ? usesOf(`grant:${held}`, "kind = 'grant.read'") : [];
  };

  /** What a tool's uses are: every write of its `seen` (`SEEN_WRITTEN`). */
  const toolUses = (row: Entry): Use[] => usesOf(`entry:${row.id}`, SEEN_WRITTEN);

  return {
    /**
     * Which runs used a key or a tool, the one that used it last first: at most `USED_BY_MOST`, each with its agent, its
     * machine, when it last used it and how many times among the newest `USED_BY_WALK` uses.
     *
     * A KEY'S ROW SAYS WHAT IT OPENS AND NOTHING ABOUT WHO OPENED IT. The vault counts every open and signs each with
     * the run that asked, so the answer was in the log and nothing read it back; a key's row and a tool's row can now
     * say "last used by S47 (Claude) 2 days ago".
     *
     * A ROW THE CALLER CANNOT READ IS ANSWERED AS A ROW THAT IS NOT THERE, in the same sentence, so asking is no way to
     * learn which keys a record holds. A run's agent and machine are named only to a caller who reads the runs.
     */
    async usedBy(args: { spoken: string }, ctx: CallContext): Promise<Result<UsedBy>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = typeof args?.spoken === 'string' ? args.spoken.trim() : '';
      if (!said) return no('REQUIRED_MISSING', 'Name the key or the tool by its spoken id, such as credentials#3 or tools#2.', { at: 'spoken' });
      const row = kernel.get(said);
      if (!row || readable(ctx, row.register) !== null)
        return no('REF_UNKNOWN', 'There is no key or tool you can read by that name.', { at: 'spoken' });
      if (row.register !== KEYS && row.register !== TOOLS)
        return no('VALUE_MALFORMED', `That is a row of ${kernel.register(row.register)?.name ?? row.register}, and only a key or a tool has uses to list.`, { at: 'spoken' });

      const uses = row.register === KEYS ? keyUses(row) : toolUses(row);
      const seesRuns = readable(ctx, RUN.id) === null;
      return ok({
        runs: uses.map((use) => {
          const run = seesRuns ? kernel.get(use.actor, { includeDeleted: true }) : null;
          const of = (field: string): string | null => {
            const v = run?.register === RUN.id ? run.fields[field] : undefined;
            return typeof v === 'string' && v !== '' ? v : null;
          };
          return { run: use.actor, agent: of('agent'), machine: of('host'), at: use.at, count: Number(use.count) };
        }),
      });
    },

    /**
     * File one arrival from the inbox as a row in a list, or set it aside: `fileArrival` or `archiveArrival`, behind
     * one door an agent can be given (agents C2).
     *
     * A PERSON IS ADMITTED AS THOSE TWO ADMIT ONE: an owner, in a browser, reading the whole record. A TOKEN ONLY WHEN
     * ITS OWNER GAVE IT THE `inbox` REACH, the same test `inbox` makes: an owner's token for the whole record whose row
     * names the reach. Before this an agent could read the arrivals it was meant to triage and act on none of them,
     * because both verbs ask `admin`, which refuses every token. Every other token is told the one thing it lacks.
     *
     * THE TOKEN WRITES AT ITS SCOPE AS WELL. The reach opens the inbox and lifts nothing: filing makes a row, so a token
     * that could not `create` in that list cannot file into it, and a `read` token with the reach reads the inbox and
     * changes nothing. The row and the arrival's `state` event are both signed by the token's run, `S<n>`.
     *
     * AGAIN IS THE SAME ANSWER, as the kernel's verbs give it: an arrival already filed answers with its row and writes
     * nothing, so an agent retrying a lost answer files one row.
     *
     * `back` TAKES A FILING OR AN ARCHIVING BACK, through the kernel's `returnArrival` and no verb of its own, so an agent
     * that filed the wrong thing puts it back through the same door it filed by (contracts X34). A filed arrival's row is
     * archived at the `version` the caller saw, so the caller needs the right to archive a row in that row's list; a rule's
     * filing is refused in the kernel's sentence, since there is nothing a person did to take back.
     */
    async triage(args: TriageArgs, ctx: CallContext): Promise<Result<ArrivalSettled>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const p = ctx.principal;
      if (p.kind === 'token') {
        /* `Array.isArray`, as `inbox` asks it, because `includes` is also a string's and a reach of "no-inbox" would
           otherwise be admitted as a substring. */
        const reached = p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox');
        if (!reached) return no('FORBIDDEN', NO_REACH, { at: 'principal' });
      } else {
        const person = admin(ctx);
        if (person) return { ok: false, refusal: person };
      }
      if (!whole(ctx)) return no('FORBIDDEN', 'The inbox belongs to the whole record, and this caller is held to part of it.', { at: 'principal' });

      /* THE ARGUMENTS ARE READ AFTER THE DOOR, so a caller who is refused is not told what triage takes. */
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(a).find((k) => !(TRIAGE_TAKES as readonly string[]).includes(k));
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something triage takes. It takes ${TRIAGE_TAKES.join(', ')}.`, { at: stray, allowed: [...TRIAGE_TAKES] });
      const arrival = typeof a.arrival === 'string' ? a.arrival.trim() : '';
      if (!arrival) return no('REQUIRED_MISSING', 'Which arrival? Name it by the id the inbox gives it.', { at: 'arrival' });
      /* `ignore: false` IS NO ANSWER AT ALL, since an MCP client sends a boolean; only `true` sets an arrival aside. */
      if (a.ignore !== undefined && typeof a.ignore !== 'boolean')
        return no('VALUE_MALFORMED', 'ignore is true, to set the arrival aside without filing it.', { at: 'ignore' });
      const ignore = a.ignore === true;
      if (a.back !== undefined && typeof a.back !== 'boolean')
        return no('VALUE_MALFORMED', 'back is true, to put a filed or archived arrival back in the inbox.', { at: 'back' });
      const back = a.back === true;
      const register = typeof a.register === 'string' ? a.register.trim() : '';
      if (a.register !== undefined && !register) return no('VALUE_MALFORMED', 'register names a list by its id, such as transactions.', { at: 'register' });
      if ([ignore, register !== '', back].filter(Boolean).length !== 1)
        return no(
          'REQUIRED_MISSING',
          'Say one of three things: register, the list to file the arrival in; ignore: true, to set it aside; or back: true, to put it back in the inbox.',
          { at: 'register', allowed: ['register', 'ignore', 'back'] },
        );
      if (a.version !== undefined && !back) return no('VALUE_MALFORMED', 'A version goes with back: true, and names the filed row it archives.', { at: 'version' });
      if (a.note !== undefined && (typeof a.note !== 'string' || a.note.length > 280))
        return no('VALUE_MALFORMED', 'A note is one sentence a person reads, in 280 characters or fewer.', { at: 'note' });
      const note = typeof a.note === 'string' && a.note.trim() !== '' ? a.note.trim() : null;

      if (back) {
        /* THE KERNEL WRITES ITS OWN NOTE on the row it archives ("Put back in the inbox."), and a put back makes no row,
           so neither fields nor a note has anywhere to go. */
        if (a.fields !== undefined) return no('VALUE_MALFORMED', 'Putting an arrival back files no row, so it takes no fields.', { at: 'fields' });
        if (note !== null) return no('VALUE_MALFORMED', 'Putting an arrival back writes its own note, so it takes none.', { at: 'note' });
        const version: unknown = a.version;
        if (version !== undefined && !(typeof version === 'number' && Number.isSafeInteger(version) && version >= 1))
          return no('VALUE_MALFORMED', 'A version is a whole number from 1, the one the filed row had when you read it.', { at: 'version' });
        /* THE RIGHT IS THE FILED ROW'S LIST'S. Archiving that row is a write on its list, so the caller is held to it
           there; an archived arrival made no row, and putting it back moves the arrival alone. */
        const was = kernel.arrivalSettlement(arrival);
        const may = was?.row ? guard(ctx, 'write', was.row.register) : guard(ctx, 'append');
        if (may) return { ok: false, refusal: may };
        if (was?.row && version === undefined)
          return no('REQUIRED_MISSING', 'This arrival was filed as a row, so name the version of that row you read; braindog:inbox gives it.', {
            at: 'version',
          });
        const by = signerOf(ctx);
        if (!by.ok) return tail(by as Result<never>);
        return tail(
          kernel.returnArrival(arrival, typeof version === 'number' ? version : 0, {
            ...by.value,
            ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
          }),
        );
      }

      if (ignore) {
        /* NOTHING IS WRITTEN BUT THE ARRIVAL'S STATE, so there is nowhere for fields or a note to go, and taking them
           would say they were kept. */
        if (a.fields !== undefined) return no('VALUE_MALFORMED', 'Setting an arrival aside files no row, so it takes no fields.', { at: 'fields' });
        if (note !== null) return no('VALUE_MALFORMED', 'Setting an arrival aside files no row, so there is nothing for a note to go on.', { at: 'note' });
        const may = guard(ctx, 'append');
        if (may) return { ok: false, refusal: may };
        const by = signerOf(ctx);
        if (!by.ok) return tail(by as Result<never>);
        return tail(kernel.archiveArrival(arrival, by.value.actor));
      }

      const fields: unknown = a.fields;
      if (fields !== undefined && (typeof fields !== 'object' || fields === null || Array.isArray(fields)))
        return no('VALUE_MALFORMED', 'The fields are an object of field names and their values.', { at: 'fields' });
      const may = guard(ctx, 'append', register);
      if (may) return { ok: false, refusal: may };
      const by = signerOf(ctx);
      if (!by.ok) return tail(by as Result<never>);
      return tail(
        offRegister(
          register,
          kernel.fileArrival(arrival, register, (fields as Patch | undefined) ?? null, {
            ...by.value,
            ...(note === null ? {} : { note }),
            ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
          }),
        ),
      );
    },
  };
}
