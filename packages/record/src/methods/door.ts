/**
 * The agent door's own signs, the record's half: `heard`, DATA, and `doorSigns`, READ+ (so "the
 * agent door lists its tools and its briefing is true").
 *
 * WHAT A MARK IS AND WHAT THE MARKS ADD UP TO IS THE KERNEL'S (`kernel/src/door.ts`): one row a run a kind, a count that
 * adds, a time that keeps the slowest. These two are the doors to it and nothing else.
 *
 * `heard` TAKES FIVE KEYS AND REFUSES ANY OTHER in the usual sentence, so a surface that sends a field by a wrong name is
 * told, not counted wrong. It never opens a run: the kernel writes against the caller's run, or against its token when
 * there is none, because a mark that opened a run would make the session it counts. Anybody who may leave anything on
 * the record may leave a mark about their own connection, a reader and an appender alike, since a session that only
 * reads still said hello and was given the tools.
 *
 * `doorSigns` IS THE WHOLE RECORD'S, as `signs` is: it counts every session of every key, so a member held to one list
 * is refused in one sentence.
 *
 * `doorHealth` IS THE OWNER'S, ADMIN: every connection that can act on the record, a key or a runner machine,
 * with the app its newest run named, the build of the command behind it and when it last called a tool, and seven signs
 * that would each have said something on the week his record had no tools. Each sign is a number, or `null` where there
 * is nothing to judge yet (no run in a day, no build said, no runner set up), because a sign that read 0 there would
 * read green over nothing.
 *
 * THE FIRST HELLO IS ALSO KEPT ONCE, as `first.agent` (`../firsts.ts`), and `firsts` answers it with the briefing's own
 * first to the host's funnel and to nobody else.
 */

import type { Result } from '@braindog/ports';
import type { Kernel, DoorMark, TokenRow } from '@braindog/kernel';
import { DOOR_KINDS, endedByCutOff, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { firsts, markFirst, type Firsts } from '../firsts.ts';
import type { RecordDeps } from './index.ts';

type Heard = ReturnType<Kernel['heard']>;
type DoorSigns = ReturnType<Kernel['doorMarks']>;

/** What `heard` takes, in the order its refusal names them. */
export const HEARD_TAKES = ['kind', 'n', 'ms', 'build', 'client'] as const;

/**
 * The marks only the door leaves, through `doorHeard`: a session said hello, was given the tools, made calls, was answered
 * INTERNAL. `heard`, the routed one, refuses them, since a key that could post `called` could turn `delivered`, the tool
 * list's sign and `door_used` green on its own say.
 */
export const DOOR_ONLY = ['hello', 'listed', 'called', 'internal'] as const;

/** The marks a caller may post with `heard`: the start hook's time, the one mark a command really sends (`hooks.ts`). */
export const HEARD_KINDS = ['hook'] as const;

/** What `doorHeard` takes: the door's own mark, never a time, since no door mark carries one. */
export const DOOR_HEARD_TAKES = ['kind', 'n', 'build', 'client'] as const;

/** What `doorSigns` takes: how many days back, 1 to 30, seven when it names none. */
export const DOOR_SIGNS_TAKES = ['days'] as const;

/** The longest build or client name a mark takes, the kernel's own bound (`DOOR_TEXT_MOST`). */
const TEXT_MOST = 80;

/** How far back the signs read at most: the sweep keeps 30 days of marks. */
const DAYS_MOST = 30;

const DAY = 24 * 60 * 60 * 1000;

/**
 * What the host knows of itself and hands the record: its own build, and `MIN_CLI` (`packages/mcp/src/build.ts`), the
 * oldest command its door still works with. The record cannot import the door, which imports the record, so the host
 * hands both in, the way it hands `engineHealth`. Absent, `doorHealth` answers both `null` and `behind` reads `null`.
 */
export type DoorBuild = { host_build: string | null; min_cli: string | null };

/** How one thing acts on the record: a key by how it was made, or a runner machine. */
export type ConnectionKind = 'device' | 'cimd' | 'dcr' | 'key' | 'runner';

/** One connection as `doorHealth` answers it. Every instant is ISO; every count is whole. */
export type DoorConnection = {
  /** A handle, never shown alone: the screen names a connection by `app` and `where`. */
  id: string;
  kind: ConnectionKind;
  /** The app its newest run said it was (`claude-code`) and that app's version, or `null` before any run. */
  app: string | null;
  app_version: string | null;
  /** The machine or the app's own name, as it said it when it was made, or its newest run's machine. */
  where: string | null;
  /** `true` for an app whose address published who it is, `false` for one that only said so, `null` for the rest. */
  verified: boolean | null;
  scope: string | null;
  reach: string[];
  made_at: string;
  ends_at: string | null;
  days_left: number | null;
  last_call_at: string | null;
  /** Which door the last call came through, `api` or `mcp`. */
  last_door: string | null;
  last_tool_at: string | null;
  /** The build of the command behind it, `2026.10.09+1a2b3c4`, or `null` until it says one. */
  cli_build: string | null;
  /** Whole days its build is older than `min_cli`, 0 when it is not; `null` with no build, a checkout's or no `min_cli`. */
  behind: number | null;
  runs_7d: number;
};

/** The seven signs, each a number or `null` where there is nothing yet to judge. 0 is green. */
export type DoorHealthSigns = {
  /** Keys that opened a run in the last day and made no tool call since it began. `null`: no run in a day. */
  delivered: number | null;
  /** Connections whose build is from a day before `min_cli`. `null`: no `min_cli`, or no connection said a build. */
  behind: number | null;
  /** Connections with 14 days or fewer left. */
  ending: number;
  /** Connections with no call in 30 days. */
  silent: number;
  /** Apps that signed in at the address and have made a call. `null`: none has signed in there. */
  door_used: number | null;
  /** Runner machines heard from in the last 40 seconds. `null`: no runner machine is set up. */
  runners_listening: number | null;
  /** Jobs that read lost in the last seven days. */
  jobs_lost_7d: number;
};

export type DoorHealth = { host_build: string | null; min_cli: string | null; connections: DoorConnection[]; signs: DoorHealthSigns };

/** How near an end counts as ending, and how long without a call counts as silent, in days. */
const ENDING_DAYS = 14;
const SILENT_DAYS = 30;
/** A runner polls every few seconds; one not heard from in this long is not listening. */
const LISTENING_MS = 40_000;

/** The day a build was made, as milliseconds, or `null` for a checkout's (`dev+`) or anything that is not a build. */
const buildDay = (build: string | null): number | null => {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})(?:\+|$)/u.exec(build ?? '');
  return m === null ? null : Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const ms = (iso: string | null | undefined): number | null => {
  if (iso === null || iso === undefined) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function methods(deps: RecordDeps) {
  const { kernel, scoped, no, clock, admin, sql } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `signs.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /**
   * A mark's keys checked, each in the sentence a refusal is written in, or the mark the kernel keeps. `heard` and
   * `doorHeard` each name what they take and the kinds they keep; a door's kind posted to `heard` is told why.
   */
  const markOf = (
    args: unknown,
    method: 'heard' | 'doorHeard',
    takes: readonly string[],
    kinds: readonly string[],
  ): { mark: DoorMark } | { refused: Heard } => {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
      return { refused: no('VALUE_MALFORMED', `${method} takes one mark, such as { "kind": "${kinds[0] ?? 'hook'}" }.`, { at: 'args' }) as Heard };
    const a = args as Record<string, unknown>;
    const stray = Object.keys(a).find((k) => !takes.includes(k));
    if (stray !== undefined)
      return { refused: no('FIELD_UNKNOWN', `${stray} is not something ${method} takes. It takes ${takes.join(', ')}.`, { at: stray, allowed: [...takes] }) as Heard };
    if (method === 'heard' && typeof a.kind === 'string' && (DOOR_ONLY as readonly string[]).includes(a.kind))
      return { refused: no('FORBIDDEN', `The agent door marks ${a.kind} itself when a session reaches it, so heard takes only hook.`, { at: 'kind', allowed: [...kinds] }) as Heard };
    if (typeof a.kind !== 'string' || !kinds.includes(a.kind) || !(DOOR_KINDS as readonly string[]).includes(a.kind))
      return { refused: no('ENUM_VALUE_UNKNOWN', `kind is ${kinds.length === 1 ? '' : 'one of '}${kinds.join(', ')}.`, { at: 'kind', allowed: [...kinds] }) as Heard };
    const mark: DoorMark = { kind: a.kind as DoorMark['kind'] };
    for (const key of ['n', 'ms'] as const) {
      const v = a[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
        return { refused: no('VALUE_MALFORMED', `${key} is a whole number, 0 or more${key === 'ms' ? ', in milliseconds' : ''}.`, { at: key }) as Heard };
      mark[key] = v;
    }
    for (const key of ['build', 'client'] as const) {
      const v = a[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' || v.trim() === '')
        return { refused: no('VALUE_MALFORMED', `${key} is a line of text, such as ${key === 'build' ? '0.9.2' : 'claude-code 2.1.4'}.`, { at: key }) as Heard };
      if (v.trim().length > TEXT_MOST)
        return { refused: no('OUT_OF_BOUNDS', `${key} is at most ${String(TEXT_MOST)} characters, and this one is ${String(v.trim().length)}.`, { at: key }) as Heard };
      mark[key] = v.trim();
    }
    return { mark };
  };

  /** What the host handed of itself, when it handed anything (`DoorBuild`). */
  const built = (): DoorBuild => {
    const b = (deps as RecordDeps & { doorBuild?: DoorBuild | (() => DoorBuild) }).doorBuild;
    const read = typeof b === 'function' ? b() : b;
    return { host_build: read?.host_build ?? null, min_cli: read?.min_cli ?? null };
  };

  /* THE OPERATOR'S CUT-OFF (`validFrom`, 53 §5.11), read the way `doorBuild` is, so a key or runner it ended is not
     counted as a connection the day the host hands it in. Until then nothing is ended by it here, as `tokens` reads. */
  const cutOff = (): string | undefined => (deps as RecordDeps & { validFrom?: () => string | undefined }).validFrom?.();

  /** Each key's newest run, with how many it opened in the last seven days, in one read over the runs. */
  const newestRuns = (since: string) =>
    new Map(
      sql
        .all<{ tok: string; seq: number; created_at: string; client: string | null; client_version: string | null; host: string | null; runs_7d: number }>(
          `SELECT tok, seq, created_at, client, client_version, host, runs_7d FROM (
             SELECT json_extract(fields, '$.token_id') AS tok, seq, created_at,
                    json_extract(fields, '$.client') AS client, json_extract(fields, '$.client_version') AS client_version,
                    json_extract(fields, '$.host') AS host,
                    ROW_NUMBER() OVER (PARTITION BY json_extract(fields, '$.token_id') ORDER BY created_at DESC, seq DESC) AS nth,
                    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) OVER (PARTITION BY json_extract(fields, '$.token_id')) AS runs_7d
             FROM entry WHERE register = 'session' AND deleted_at IS NULL AND json_extract(fields, '$.token_id') IS NOT NULL
           ) WHERE nth = 1`,
          since,
        )
        .map((r) => [r.tok, r] as const),
    );

  /** The newest `called` mark against a run or a key, by the name `heard` keeps it under. */
  const calledAt = (run: string): string | null =>
    sql.one<{ at: string }>("SELECT at FROM door_mark WHERE run = ? AND kind = 'called'", run)?.at ?? null;

  /** Jobs that read lost in seven days: a lease the sweep took back, and a lease run out it has not swept yet. */
  const lostJobs = (since: string, now: string): number =>
    sql.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT job_id AS id FROM job_event WHERE kind = 'note' AND json_extract(body, '$.lost') = 1 AND ts >= ?
         UNION
         SELECT id FROM job WHERE status = 'claimed' AND (lease_until IS NULL OR lease_until < ?) AND created_at >= ?
       )`,
      since,
      now,
      since,
    )?.n ?? 0;

  const health = (): DoorHealth => {
    const nowMs = clock.now();
    const now = new Date(nowMs).toISOString();
    const week = new Date(nowMs - 7 * DAY).toISOString();
    const { host_build, min_cli } = built();
    const minDay = buildDay(min_cli);
    const runs = newestRuns(week);
    const live = (t: TokenRow) => t.revoked_at === null && t.ended_by === undefined && (t.expires_at === null || (ms(t.expires_at) ?? 0) > nowMs);
    const left = (ends: string | null) => (ends === null ? null : Math.max(0, Math.ceil(((ms(ends) ?? nowMs) - nowMs) / DAY)));
    let delivered: number | null = null;
    const from = cutOff();
    const connections: DoorConnection[] = kernel.listTokens(from).filter(live).map((t) => {
      const run = runs.get(t.id);
      const day = buildDay(t.last_build);
      if (run !== undefined && (ms(run.created_at) ?? 0) >= nowMs - DAY) {
        const began = run.created_at;
        const called = [t.last_tool_at, calledAt(`S${String(run.seq)}`), calledAt(`token:${t.id}`)].some((at) => at !== null && at >= began);
        delivered = (delivered ?? 0) + (called ? 0 : 1);
      }
      return {
        id: t.id,
        kind: t.client?.kind ?? 'key',
        app: run?.client ?? null,
        app_version: run?.client_version ?? null,
        where: t.label ?? run?.host ?? null,
        verified: t.client?.kind === 'cimd' ? true : t.client?.kind === 'dcr' ? false : null,
        scope: t.scope,
        reach: [...t.reach],
        made_at: t.created_at,
        ends_at: t.expires_at,
        days_left: left(t.expires_at),
        last_call_at: t.last_used_at,
        last_door: t.last_surface,
        last_tool_at: t.last_tool_at,
        cli_build: t.last_build,
        behind: day === null || minDay === null ? null : Math.max(0, Math.round((minDay - day) / DAY)),
        runs_7d: run?.runs_7d ?? 0,
      };
    });
    const runners = sql.all<{ id: string; label: string | null; approved_at: string | null; expires: string; last_used: string | null }>(
      "SELECT id, label, approved_at, expires, last_used FROM device_grant WHERE reach = 'runner' AND status = 'active' AND expires > ? ORDER BY approved_at DESC, id",
      now,
    ).filter((g) => !endedByCutOff(from, g.approved_at));
    for (const r of runners)
      connections.push({
        id: r.id, kind: 'runner', app: null, app_version: null, where: r.label, verified: null, scope: null, reach: [],
        made_at: r.approved_at ?? '', ends_at: r.expires, days_left: left(r.expires), last_call_at: r.last_used, last_door: null,
        last_tool_at: null, cli_build: null, behind: null, runs_7d: 0,
      });
    const said = connections.filter((c) => c.behind !== null);
    const atAddress = connections.filter((c) => c.kind === 'cimd' || c.kind === 'dcr');
    const signs: DoorHealthSigns = {
      delivered,
      behind: said.length === 0 ? null : said.filter((c) => (c.behind ?? 0) > 0).length,
      ending: connections.filter((c) => c.days_left !== null && c.days_left <= ENDING_DAYS).length,
      silent: connections.filter((c) => (ms(c.last_call_at ?? c.made_at) ?? nowMs) < nowMs - SILENT_DAYS * DAY).length,
      door_used: atAddress.length === 0 ? null : atAddress.filter((c) => c.last_call_at !== null).length,
      runners_listening: runners.length === 0 ? null : runners.filter((r) => (ms(r.last_used) ?? 0) >= nowMs - LISTENING_MS).length,
      jobs_lost_7d: lostJobs(week, now),
    };
    return { host_build, min_cli, connections, signs };
  };

  /** `heard` and `doorHeard`, one road: who may leave a mark, the mark checked, kept against the caller's run or key. */
  const mark = (args: unknown, ctx: CallContext, method: 'heard' | 'doorHeard'): Heard => {
    const p = ctx.principal;
    if (p.kind !== 'token' && p.kind !== 'person')
      return no('FORBIDDEN', `${method} is how an agent or a person says how they met the door, and this caller is neither.`, { at: 'principal' }) as Heard;
    const checked = method === 'heard' ? markOf(args, method, HEARD_TAKES, HEARD_KINDS) : markOf(args, method, DOOR_HEARD_TAKES, DOOR_ONLY);
    if ('refused' in checked) return checked.refused;
    const w: WriteContext =
      p.kind === 'token'
        ? { actor: `agent:${ctx.session?.agent ?? 'other'}`, principal: { kind: 'token', token: p.id }, session: ctx.session ?? {} }
        : { actor: p.id, principal: { kind: 'person' } };
    const kept = kernel.heard(w, checked.mark);
    if (kept.ok && checked.mark.kind === 'called' && p.kind === 'token') kernel.noteTool(p.id);
    /* THE RECORD'S FIRST AGENT (`firsts.ts`): the first hello the door keeps, written once, so the funnel still has it
       after the sweep has taken the mark itself. */
    if (kept.ok && method === 'doorHeard' && checked.mark.kind === 'hello') markFirst(kernel, 'first.agent', clock.now());
    return kept;
  };

  return {
    /**
     * How long this session's start hook took, the one mark a caller posts itself. DATA, the routed one (POST
     * /api/heard). The door's own marks, hello, listed, called and internal, are refused here in one sentence and kept
     * only through `doorHeard`, so no key moves a sign by saying it was served. It opens no run and changes no row.
     */
    async heard(args: unknown, ctx: CallContext): Promise<Heard> {
      /* THE GUARD IN THE METHOD'S OWN BODY, where `guards` reads it for the DATA group (30 §10). */
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop } as Heard;
      return mark(args, ctx, 'heard');
    },

    /**
     * One mark the agent door leaves as a session meets it: it said hello, was given the tools, made calls, was answered
     * INTERNAL. NOT ROUTED: the host's route table has no row for it, so only the door, holding the record itself, calls
     * it. A `called` from a key also moves that key's `last_tool_at` (`noteTool`); the door marks
     * `called` at most once a minute a caller, so this is one more statement on that mark and none on most calls.
     */
    async doorHeard(args: unknown, ctx: CallContext): Promise<Heard> {
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop } as Heard;
      return mark(args, ctx, 'doorHeard');
    },

    /**
     * What the door's marks of the last `days` add up to (seven when it names none): sessions that said hello, were given
     * the tools and made a call, the builds they ran, INTERNAL answers, the start hook's times and the longest card,
     * with the one line a person reads. READ+, a reader of the whole record. It changes nothing.
     */
    async doorSigns(args: unknown, ctx: CallContext): Promise<DoorSigns> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as DoorSigns;
      if (!whole(ctx)) return no('FORBIDDEN', 'The door’s signs count every session on the record, and this caller is held to part of it.', { at: 'principal' }) as DoorSigns;
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = typeof a === 'object' && !Array.isArray(a) ? Object.keys(a).find((k) => !(DOOR_SIGNS_TAKES as readonly string[]).includes(k)) : 'args';
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something doorSigns takes. It takes days, how many days back.`, { at: stray, allowed: [...DOOR_SIGNS_TAKES] }) as DoorSigns;
      if (a.days === undefined || a.days === null) return kernel.doorMarks();
      const days = typeof a.days === 'string' && /^\d+$/.test(a.days.trim()) ? Number(a.days) : a.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > DAYS_MOST)
        return no('OUT_OF_BOUNDS', `days is a whole number from 1 to ${String(DAYS_MOST)}, since marks are kept ${String(DAYS_MOST)} days.`, { at: 'days' }) as DoorSigns;
      return kernel.doorMarks(clock.now() - days * DAY);
    },

    /**
     * Every connection that can act on the record, with its app, build and last tool call, and the door's seven signs.
     * ADMIN, the owner's. It takes nothing and changes nothing.
     */
    async doorHealth(_args: unknown, ctx: CallContext): Promise<{ ok: true; value: DoorHealth } | { ok: false; refusal: NonNullable<ReturnType<typeof admin>> }> {
      const stop = admin(ctx, 'read how the agent door is doing');
      if (stop) return { ok: false, refusal: stop };
      return { ok: true, value: health() };
    },

    /**
     * When an agent first said hello at the door and when the briefing first answered a card, each epoch ms or `null`
     * (`firsts.ts`). NOT ROUTED, as `doorHeard` is not: the host's operator funnel asks it of each record with a system
     * principal, and nobody else is answered. It takes nothing and changes nothing.
     */
    async firsts(_args: unknown, ctx: CallContext): Promise<Result<Firsts>> {
      if (ctx.principal.kind !== 'system') return no('FORBIDDEN', 'Only the host reads when this BrainDog first met an agent and a briefing, for its funnel.', { at: 'principal' }) as Result<Firsts>;
      return { ok: true, value: firsts(kernel) };
    },
  };
}
