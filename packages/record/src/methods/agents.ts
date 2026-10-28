/**
 * The record's methods for agents, written beside `index.ts` rather than inside it.
 *
 * `usedBy` IS THE FIRST, built as the worked example of `methods/`: a real method a caller needs, so the first change
 * that carries the mechanism proves it end to end, from this file through `methods/index.ts` and the route row in
 * `host/src/routes/agents.ts` to a caller. `triage` is beside it: the one door an agent's token files or sets aside an
 * arrival by. `end` is the third: how a session that closed says so, once. `beat` is the fourth: how a session that is
 * reading, thinking or editing files says it is still at work, with no write.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { INSTRUCTIONS, SEEN_HOW, agentOf, liveStateOf, sessionDeclaration, type ArrivalSettled, type Entry, type LiveState, type Patch, type SeenHow, type Stop, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';
import { listFor } from '../agent-lists.ts';
import { readSight } from '../sight.ts';
import { appOfRun, verifiedBy, type RunToken } from '../run-verified.ts';
import { OWN_RUN, stopLine, toldOf, toldTo, type Told } from './instructions.ts';

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
 * The tools list this method answers for beside the keys, and the field a key's grant id is held in, as the agents pack
 * declares them (`packages/seed/src/packs/agents.ts`). The list of keys by name is the one that plays `keys-index`
 * (`agent-lists.ts` `listFor`), read per call.
 */
const KEY_FIELD = 'value';
const TOOLS = 'tools';

/** The kernel's own list of runs, whose rows are spoken `S47`: every write an agent makes is signed with that name. */
const RUN = sessionDeclaration().body as unknown as { id: string; seq_prefix: string; title: string };

/** The field a run's name is held in, which `presence` answers as `name`. */
const RUN_TITLE = RUN.title;

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
 * `version` only with `back`, where it is the filed row's.
 */
export type TriageArgs = { arrival: string; register?: string; fields?: Patch; ignore?: true; note?: string; back?: true; version?: number };

/** The keys `triage` takes, named in the sentence that refuses any other. */
const TRIAGE_TAKES = ['arrival', 'register', 'fields', 'ignore', 'note', 'back', 'version'] as const;

/** The sentence every token without the `inbox` reach is given, whatever else it holds. */
const NO_REACH = 'Triage needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.';

/**
 * What `end` answers, as the kernel's `endRun` gives it: the run by its spoken id, the state it ended in, and whether
 * this call changed it. `changed: false` is a run that had already ended, which a second end leaves as it was.
 */
export type Ended = { run: string; state: 'done' | 'handoff'; changed: boolean };

/** The keys `end` takes. No `state`: the record picks it from what the run left (`endRun` in the kernel). */
const END_TAKES = ['branch', 'head'] as const;

/** What `beat` answers: the caller's run by its spoken id when the record found it, or `null` when it found none. */
export type Beat = { run: string | null };

/** The longest branch or commit `end` takes, as `attach` and `handoff` hold every line they take (`LINE` in `index.ts`). */
const END_LINE = 280;

/**
 * What `pulse` answers (plan §2.3 C, §8.3): the caller's run, its stamp, what is pending for it as the inbox file holds
 * it, what stops it, and the lines in his voice for what is new since the stamp the bridge sent. `run: null` when the
 * session has no run yet, which is not a refusal: a bridge that pulses before the first write has nothing to keep.
 */
export type Pulse = {
  run: string | null;
  stamp: string | null;
  changed: boolean;
  pending: { id: string; kind: string; said: string; at: string; to: string; line: string }[];
  stop: Stop | null;
  lines: string[];
};

/** What `pulse` takes: the bridge's last stamp, and the instructions it showed since, with how. */
const PULSE_TAKES = ['stamp', 'shown', 'how'] as const;

/** The most ids one pulse says were shown. */
const SHOWN_MOST = 50;

/**
 * One row of `presence`: a session open now, with where it is, what it says it is doing, what it holds
 * from him, its helpers, how long it has run and when it was last heard, and how a stop reaches it.
 */
export type PresenceRow = {
  run: string;
  name: string | null;
  agent: string | null;
  machine: string | null;
  /** The Claude Code profile it runs under, by name (`studio`), or `null` when its agent said none (migration 44). */
  seat: string | null;
  project: string | null;
  repo: string | null;
  worktree: string | null;
  branch: string | null;
  doing: string | null;
  state: LiveState;
  instruction: string | null;
  task: string | null;
  stopped: 'stop' | 'pause' | null;
  helpers: string[];
  parent: string | null;
  /** Seconds it has been at it this stretch: since it opened, came back, or began writing again, whichever is latest. */
  for_s: number;
  heard_s: number;
  /** Seconds since its last call, `null` when it has made none: how long a run that waits on him has been quiet. */
  quiet_s: number | null;
  /** `hooks`: a stop halts its next tool call. `next_call`: it is told at its next BrainDog call, and keeps editing till then. */
  reach: 'hooks' | 'next_call';
  /** Its key proves the app it says it is (`run-verified.ts`): a checked client document, or a key made for that app. */
  verified: boolean;
  /** The app its client says it is, by name ("Claude Code", `appOfRun`), or `null` where it names no client. */
  app: string | null;
  /** The folder it opened in, as its agent said it, so a run with no project is still somewhere ("the Developer folder"). */
  cwd: string | null;
  /** How many writes it has made, or `null` on a run from before the record counted them. */
  wrote: number | null;
  /** The newest question it asked that still waits on him, in its words, or `null`. */
  asked: string | null;
  /** Its key reads and nothing more, so it can write nothing: a look, never a run at work. */
  looks: boolean;
};

/** What `presence` takes: one project or one repository. */
const PRESENCE_TAKES = ['project', 'repo'] as const;

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, readable, admin, no, tail, clock } = deps;

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

  /** What a key's uses are: every open of its sealed value, which the keychain writes as `grant.read` on the grant. */
  const keyUses = (row: Entry): Use[] => {
    const held = row.fields[KEY_FIELD];
    return typeof held === 'string' && held !== '' ? usesOf(`grant:${held}`, "kind = 'grant.read'") : [];
  };

  /** What a tool's uses are: every write of its `seen` (`SEEN_WRITTEN`). */
  const toolUses = (row: Entry): Use[] => usesOf(`entry:${row.id}`, SEEN_WRITTEN);

  return {
    /**
     * A session closed: end the caller's run, once. A token's call, needing `propose`, and the end hook's one write.
     *
     * THE RECORD PICKS THE STATE, NOT THE CALLER. The hook used to write `idle`, and twelve hours later the
     * sweep took every idle run as abandoned, so about 740 of the owner's 752 runs that closed normally read Abandoned a
     * day later. The kernel's `endRun` decides instead: a run that left a fresh next step and works for nobody waits as a
     * handoff; any other is done, its old next step cleared and "Ended at <head> with no next step." written. Its helpers
     * that are still open end as done in the same write.
     *
     * IT FINDS THE CALLER'S RUN AND OPENS NONE, which is why it does not go through `runFor` as `triage` does: a session
     * that closes without ever having written has nothing to end, and opening a run only to end it would be a run nobody
     * worked in. The kernel refuses that call in its own words.
     *
     * ENDING AN ENDED RUN CHANGES NOTHING and answers `changed: false`, so a hook that fires twice, or a retry after a
     * lost answer, writes one end. A person is never a run; a person closes one from the app with `handoff`.
     */
    async end(args: { branch?: string; head?: string } | undefined, ctx: CallContext): Promise<Result<Ended>> {
      const stop = guard(ctx, 'propose', OWN_RUN);
      if (stop) return { ok: false, refusal: stop };
      const p = ctx.principal;
      if (p.kind !== 'token')
        return no('FORBIDDEN', 'end is how an agent says its session closed, and a person is never a run. Close a run from the app.', { at: 'principal' });
      const a = (args ?? {}) as Record<string, unknown>;
      if (a.state !== undefined)
        return no('FIELD_UNKNOWN', 'end picks the state itself from what the run left, so it takes none. Send branch and head only.', {
          at: 'state',
          allowed: [...END_TAKES],
        });
      const stray = Object.keys(a).find((k) => !(END_TAKES as readonly string[]).includes(k));
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something end takes. It takes ${END_TAKES.join(' and ')}.`, { at: stray, allowed: [...END_TAKES] });
      const said: { branch?: string; head?: string } = {};
      for (const key of END_TAKES) {
        const v = a[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== 'string' || v.trim() === '') return no('VALUE_MALFORMED', `${key} is a line of text, such as ${key === 'branch' ? 'main' : 'the commit the session stopped at'}.`, { at: key });
        if (v.trim().length > END_LINE) return no('OUT_OF_BOUNDS', `${key} is at most ${String(END_LINE)} characters, and this one is ${String(v.trim().length)}.`, { at: key });
        said[key] = v.trim();
      }
      /* WHO ENDS IT, AS `writerOf` IN `index.ts` SAYS A TOKEN'S WRITE: its kind of agent, its token and its run's hints,
         so the kernel's ladder finds the run this session wrote as, by its client id or its spoken name. */
      const hints = { ...(ctx.session ?? {}), ...said };
      const w: WriteContext = {
        actor: `agent:${agentOf(hints).agent ?? 'other'}`,
        principal: { kind: 'token', token: p.id },
        session: hints,
        ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
      };
      return tail(kernel.endRun(w, said));
    },

    /**
     * A session is still working: the caller's run is heard from now, and nothing else changes. A token's call, needing
     * `propose`, as `end` and `attach` do.
     *
     * A HEARTBEAT IS NOT A WRITE. Last seen moved only when a run wrote, so a session that read, thought or edited
     * files for half an hour read as Quiet beside one that had died. The kernel's `heartbeat` moves `last_seen` in place
     * (`beatRun`): no version, no event, no line in the run's history, at most once a minute.
     *
     * IT FINDS THE CALLER'S RUN AND OPENS NONE, and revives none: a session that never wrote has no run to keep alive,
     * and a run that ended, left a step or was written off stays where it stopped. Either answers `{ run: null }`, which
     * is not a refusal, because a hook that beats on every tool call has nothing to do about it.
     */
    async beat(args: Record<string, never> | undefined, ctx: CallContext): Promise<Result<Beat>> {
      const stop = guard(ctx, 'propose', OWN_RUN);
      if (stop) return { ok: false, refusal: stop };
      const p = ctx.principal;
      if (p.kind !== 'token')
        return no('FORBIDDEN', 'beat is how an agent says it is still working, and a person is never a run.', { at: 'principal' });
      const stray = Object.keys((args ?? {}) as Record<string, unknown>)[0];
      if (stray !== undefined) return no('FIELD_UNKNOWN', `${stray} is not something beat takes. It takes nothing: the run is the caller's own.`, { at: stray, allowed: [] });
      /* WHO BEATS, AS `end` SAYS IT: the token and its run's hints, so the kernel's ladder finds the run this session
         wrote as, by its client id or its spoken name. */
      const hints = ctx.session ?? {};
      const w: WriteContext = {
        actor: `agent:${agentOf(hints).agent ?? 'other'}`,
        principal: { kind: 'token', token: p.id },
        session: hints,
        ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
      };
      return ok({ run: kernel.heartbeat(w) });
    },

    /**
     * The bridge says the session is open (plan §2.3 C, §4.4): the caller's run's `pulse_at` moves, with no version and
     * no event, and the answer is what the inbox file holds: the run's stamp, what is pending for it, what stops it, and
     * the lines in his voice for what changed since the stamp the bridge sent. A token's call, needing `propose`, as
     * `beat` does; a stopped or paused run still pulses, since the pulse is how it hears that it is stopped.
     *
     * `shown` ARE THE INSTRUCTIONS THE BRIDGE PUT IN FRONT OF THE AGENT SINCE ITS LAST PULSE, with `how` (a prompt's
     * hook by default), so the app can say "Seen by S883 on its next prompt". An id that is not the run's is passed
     * over: the file may be older than a withdrawal.
     *
     * IT FINDS THE CALLER'S RUN AND OPENS NONE, as `beat` does. No run answers `run: null`, which is not a refusal.
     * A pulse closer than ten seconds to the last moves nothing (`PULSE_MIN_MS`) and is still answered in full, since
     * reading the stamp costs one indexed read.
     */
    async pulse(args: { stamp?: string; shown?: string[]; how?: string } | undefined, ctx: CallContext): Promise<Result<Pulse>> {
      const stop = guard(ctx, 'propose', OWN_RUN);
      if (stop) return { ok: false, refusal: stop };
      const p = ctx.principal;
      if (p.kind !== 'token') return no('FORBIDDEN', 'pulse is how an agent’s bridge says its session is open, and a person is never a run.', { at: 'principal' });
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(a).find((k) => !(PULSE_TAKES as readonly string[]).includes(k));
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something pulse takes. It takes ${PULSE_TAKES.join(', ')}.`, { at: stray, allowed: [...PULSE_TAKES] });
      if (a.stamp !== undefined && a.stamp !== null && (typeof a.stamp !== 'string' || a.stamp.length > 64))
        return no('VALUE_MALFORMED', 'stamp is the one the last pulse answered with.', { at: 'stamp' });
      if (a.shown !== undefined && (!Array.isArray(a.shown) || a.shown.length > SHOWN_MOST || a.shown.some((s) => typeof s !== 'string' || s.length > 64)))
        return no('VALUE_MALFORMED', `shown is a list of at most ${String(SHOWN_MOST)} instructions, as ["IN4"].`, { at: 'shown' });
      if (a.how !== undefined && !(SEEN_HOW as readonly unknown[]).includes(a.how))
        return no('ENUM_VALUE_UNKNOWN', `how is one of ${SEEN_HOW.join(', ')}.`, { at: 'how', allowed: SEEN_HOW });
      const found = kernel.findRun(ctx.session ?? {}, p.id);
      if (found === null) return ok({ run: null, stamp: null, changed: false, pending: [], stop: null, lines: [] });
      const run = kernel.nameOf(found.id);
      /* AND THE PROFILE ITS HEADERS NAME, written once onto a run that opened without one (migration 44). */
      kernel.pulseRun(run, undefined, ctx.session?.seat ?? null);
      const shown = (a.shown as string[] | undefined) ?? [];
      const how = (a.how as SeenHow | undefined) ?? 'prompt';
      /* WHAT IT IS HANDED AND NO MORE (`toldTo`): a member's agent is never handed his words to his own agents, nor marks
         one seen by naming it. */
      const handed = toldTo(readable, ctx, kernel.instructionFor({}, run));
      const mine = new Set(handed.map((i) => i.id));
      for (const id of shown) if (mine.has(id) || readable(ctx, INSTRUCTIONS) === null) kernel.seenInstruction(id, run, how);
      const was = typeof a.stamp === 'string' ? a.stamp : '';
      const delta = kernel.changedSince(run, was);
      const pending = handed.map((i) => toldOf(sql, i));
      const fresh = new Set(delta.pending.map((i) => i.id));
      const held = stopLine(sql, kernel, delta.stop);
      const lines = delta.changed
        ? [...(held === null ? [] : [held]), ...pending.filter((i: Told) => fresh.has(i.id) && i.kind !== 'stop' && i.kind !== 'pause').map((i) => i.line)]
        : [];
      return tail(
        ok({
          run,
          stamp: delta.stamp,
          changed: delta.changed,
          pending: pending.map((i) => ({ id: i.id, kind: i.kind, said: i.said, at: i.at, to: i.to, line: i.line })),
          stop: delta.stop,
          lines,
        }),
      );
    },

    /**
     * The sessions open now, newest heard from first: Today's "Working now", the Agents page and a
     * project's "Working here now", in one read. Each row says the agent, its machine, project, repository, worktree,
     * branch and what it says it is doing; the instruction and the task in hand; its helpers; how long it has run and
     * when it was last heard; whether he paused or stopped it; and whether a stop halts its next tool call (Claude Code
     * with hooks) or reaches it only at its next BrainDog call.
     *
     * READ+, TO ANYBODY WHO MAY READ THE RUNS, as `sessionsLive` is. A helper is a row of its own and is named on its
     * lead's row. `project` or `repo` narrows to one place.
     */
    async presence(args: { project?: string; repo?: string } | undefined, ctx: CallContext): Promise<Result<PresenceRow[]>> {
      const stop = guard(ctx, 'read', RUN.id);
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(a).find((k) => !(PRESENCE_TAKES as readonly string[]).includes(k));
      if (stray !== undefined)
        return no('FIELD_UNKNOWN', `${stray} is not something presence takes. It takes ${PRESENCE_TAKES.join(' and ')}.`, { at: stray, allowed: [...PRESENCE_TAKES] });
      for (const key of PRESENCE_TAKES)
        if (a[key] !== undefined && a[key] !== null && (typeof a[key] !== 'string' || (a[key] as string).trim() === ''))
          return no('VALUE_MALFORMED', `${key} is a name.`, { at: key });
      const now = clock.now();
      /* THE RUNS SHE IS SHOWN, under her grant on the runs list and never one kept private from her. */
      const sight = readSight(kernel);
      const present = kernel.presentRuns();
      const shown = sight.admitted(ctx, RUN.id, present.map((r) => r.id));
      const rows = present.filter((r) => shown.has(r.id));
      const of = (f: Record<string, unknown>, key: string): string | null => (typeof f[key] === 'string' && (f[key] as string).trim() !== '' ? (f[key] as string) : null);
      const spoken = (r: { seq: number }): string => `${RUN.seq_prefix}${String(r.seq)}`;
      /* THE PROJECT AS RUNS HOLD IT, by spoken name; one named by title or id is read to it first. */
      const projectSaid =
        typeof a.project === 'string'
          ? ((row) => (row === null || !sight.admits(ctx, row) ? (a.project as string).trim() : kernel.nameOf(row.id)))(kernel.get((a.project as string).trim()))
          : null;
      const repoSaid = typeof a.repo === 'string' ? a.repo.trim() : null;
      const helpersOf = new Map<string, string[]>();
      for (const r of rows) {
        const parent = of(r.fields, 'parent');
        if (parent !== null) helpersOf.set(parent, [...(helpersOf.get(parent) ?? []), spoken(r)]);
      }
      const secs = (iso: string | null): number => (iso === null ? 0 : Math.max(0, Math.floor((now - Date.parse(iso)) / 1000)));
      /* HOW LONG IT HAS BEEN AT IT, FROM THIS STRETCH: the latest of when it opened, when it last came back from an end
         or a rest (`revivedAt`), and when its current stretch of writes began (`stretch_at`). A session resumed after
         two days is "for 5 min", not "for 2 days". */
      const back = kernel.revivedAt(rows.map((r) => r.id));
      const began = (r: (typeof rows)[number]): string => {
        const f = r.fields as Record<string, unknown>;
        const at = [of(f, 'started') ?? r.created_at, back.get(r.id) ?? null, of(f, 'stretch_at')].filter((v): v is string => v !== null && Number.isFinite(Date.parse(v)));
        return at.reduce((a, z) => (Date.parse(z) > Date.parse(a) ? z : a), at[0] ?? r.created_at);
      };
      /* THE KEYS THE RUNS SPOKE WITH, read once, so each row can say whether its key proves its app. */
      const keys = new Map<string, RunToken>();
      const readOnly = new Set<string>();
      for (const t of kernel.listTokens())
        for (const k of [t, ...(t.children ?? [])]) {
          keys.set(k.id, { label: k.label, ...(k.client ? { client: k.client } : {}) });
          if (t.scope === 'read') readOnly.add(k.id);
        }
      /* THE NEWEST QUESTION EACH RUN ASKED THAT STILL WAITS, by the run that signed it (`opened_by`, its spoken name), said
         only to a caller who reads the record whole, as the questions themselves are. */
      const asked = new Map<string, string>();
      const open = whole(ctx) ? (deps.everyOpen?.() ?? kernel.openSuggestions({ apart: 'with' })) : null;
      if (open?.ok)
        for (const s of [...open.value].sort((a, b) => String(a.opened_at ?? '').localeCompare(String(b.opened_at ?? '')))) {
          const by = typeof s.opened_by === 'string' ? s.opened_by : '';
          const said = /^S[1-9][0-9]*$/u.test(by) ? kernel.question(String(s.id)) : null;
          if (said) asked.set(by, said);
        }
      const out: PresenceRow[] = rows
        .filter((r) => (projectSaid === null || of(r.fields, 'project') === projectSaid) && (repoSaid === null || of(r.fields, 'repo') === repoSaid))
        .map((r) => {
          const f = r.fields as Record<string, unknown>;
          const agent = of(f, 'agent');
          const heard = [of(f, 'last_seen'), of(f, 'pulse_at')].filter((v): v is string => v !== null).sort().at(-1) ?? null;
          const profile = kernel.profileFor({ kind: agent, token: of(f, 'token_id'), host: of(f, 'host'), seat: of(f, 'seat') });
          const stopped = f.stopped === 'stop' || f.stopped === 'pause' ? f.stopped : null;
          return {
            run: spoken(r),
            name: of(f, RUN_TITLE),
            agent,
            machine: of(f, 'host'),
            seat: of(f, 'seat'),
            project: of(f, 'project'),
            repo: of(f, 'repo'),
            worktree: of(f, 'worktree'),
            branch: of(f, 'branch'),
            doing: of(f, 'doing'),
            state: liveStateOf(r, now),
            instruction: of(f, 'instruction'),
            task: of(f, 'task'),
            stopped,
            helpers: helpersOf.get(spoken(r)) ?? [],
            parent: of(f, 'parent'),
            for_s: secs(began(r)),
            heard_s: secs(heard),
            quiet_s: of(f, 'last_seen') === null ? null : secs(of(f, 'last_seen')),
            reach: agent === 'claude' && profile.enforce.hooks ? 'hooks' : 'next_call',
            verified: verifiedBy(f, keys.get(of(f, 'token_id') ?? '') ?? null),
            app: of(f, 'client') === null ? null : appOfRun(f),
            cwd: of(f, 'cwd'),
            wrote: typeof f.wrote === 'number' ? f.wrote : null,
            asked: asked.get(spoken(r)) ?? null,
            looks: readOnly.has(of(f, 'token_id') ?? ''),
          };
        });
      return ok(out);
    },

    /**
     * Which runs used a key or a tool, the one that used it last first: at most `USED_BY_MOST`, each with its agent, its
     * machine, when it last used it and how many times among the newest `USED_BY_WALK` uses.
     *
     * A KEY'S ROW SAYS WHAT IT OPENS AND NOTHING ABOUT WHO OPENED IT. The keychain counts every open and signs each with
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
      /* AND A ROW HER GRANT DOES NOT ADMIT, or one kept private from her, is not there either (`sight`). */
      if (!row || readable(ctx, row.register) !== null || !deps.sight.admits(ctx, row))
        return no('REF_UNKNOWN', 'There is no key or tool you can read by that name.', { at: 'spoken' });
      const KEYS = listFor('keys-index', kernel.registers());
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
     * one door an agent can be given.
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
     * `back` TAKES A FILING OR AN ARCHIVING BACK, through the kernel's `returnArrival` and no verb of its own, so an
     * agent that filed the wrong thing puts it back through the same door it filed by. A filed arrival's row is
     * archived at the `version` the caller saw, so the caller needs the right to archive a row in that row's list; a
     * rule's filing is refused in the kernel's sentence, since there is nothing a person did to take back.
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
