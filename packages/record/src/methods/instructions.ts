/**
 * What he tells an agent from the app, as the record answers it (agents and MCP plan §2, §8.2; the kernel's half is
 * `packages/kernel/src/instruction.ts`).
 *
 * FOUR DOORS. `instruct` and `withdrawInstruction` are his, a person signed in to BrainDog: every token is refused
 * `NEEDS_BROWSER_SESSION`, so no agent instructs another and text an agent read in a mail never becomes an order to a
 * second one (§10.1). `instructionList` is his read of the threads, each with who saw it and how, and the receipts.
 * `instructionsMine` is the agent's: what is pending for its own run (and marking it seen), taking one, and answering
 * it. The MCP tool `instructions` is that door.
 *
 * HIS VOICE IS MARKED (§10.2). Every instruction reaches an agent as `Teodor said in BrainDog (IN4): "…"`, a line built
 * here once (`toldOf`), which the briefing, the pulse and this door all hand on, so no path words it another way.
 *
 * RECEIPTS ARE NOT STORED (§8.1). They are read from the log: the run's batches between `taken_at` and `replied_at`,
 * and the run's head before and after (`receiptsOf`).
 */

import type { Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';
import {
  INSTRUCTIONS,
  INSTRUCTION_KINDS,
  INSTRUCTION_PREFIX,
  INSTRUCTION_STATES,
  INSTRUCTION_TO,
  INSTRUCTION_WHEN,
  PROFILE_KINDS,
  REPLY_STATES,
  SEEN_HOW,
  agentOf as kindOf,
  instructionsTakenBy,
  type Instr,
  type InstructInput,
  type Kernel,
  type SeenHow,
  type Stop,
  type WriteContext,
} from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { readSight } from '../sight.ts';
import { tellFinished } from '../push.ts';
import type { RecordDeps } from './index.ts';

/* ── what every path hands an agent ─────────────────────────────────────── */

/**
 * One instruction as an agent and the app read it: the kernel's row, who said it by name, and the one line in his
 * voice (`line`) that every path hands on whole.
 */
export type Told = Instr & { by_name: string; line: string };

/** The name a person is said by, from the record's own mirror of the Directory, or "The owner" when it holds none. */
export function personNamed(sql: Sql, id: string | null): string {
  if (id === null || !id.startsWith('p_')) return 'The owner';
  const row = sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', id);
  const name = typeof row?.name === 'string' ? row.name.trim() : '';
  return name === '' ? 'The owner' : name;
}

/**
 * The line an instruction reaches an agent as, in his voice and marked as his (§10.2): what he said, quoted, with the
 * one thing to do about it. A stop or a pause says what the record now refuses.
 */
export function lineOf(i: Instr, by: string): string {
  const said = i.said.replace(/\s+/gu, ' ').trim();
  if (i.kind === 'stop') return `${by} stopped this run in BrainDog (${i.id}): "${said}". Reply with instructions, then end.`;
  if (i.kind === 'pause') return `${by} paused this run in BrainDog (${i.id}): "${said}". Wait; reply with instructions if you must.`;
  if (i.kind === 'resume') return `${by} resumed this run in BrainDog (${i.id}): "${said}".`;
  const answer = i.taken_by === null ? `Take it with instructions take ${i.id}.` : `Reply with instructions reply ${i.id} when it is done.`;
  return `${by} said in BrainDog (${i.id}): "${said}". ${answer}`;
}

/** An instruction as `Told`, its maker named once. */
export function toldOf(sql: Sql, i: Instr): Told {
  const by = personNamed(sql, i.by);
  return { ...i, by_name: by, line: lineOf(i, by) };
}

/** What stops a run, as its one line: `null` while nothing does. */
export function stopLine(sql: Sql, kernel: Kernel, stop: Stop | null): string | null {
  if (stop === null) return null;
  const i = stop.id === '' ? null : kernel.instruction(stop.id);
  const by = personNamed(sql, i?.by ?? null);
  const said = stop.said.replace(/\s+/gu, ' ').trim();
  const why = said === '' ? '' : `: "${said}"`;
  return stop.kind === 'stop'
    ? `${by} stopped this run in BrainDog${stop.id === '' ? '' : ` (${stop.id})`}${why}. Reply with instructions, then end.`
    : `${by} paused this run in BrainDog${stop.id === '' ? '' : ` (${stop.id})`}${why}. Wait until it is resumed.`;
}

/**
 * One batch the run wrote while it held an instruction: when, how many changes, the rows it touched as said (`S42`),
 * and each one's name in its title field beside it (`names`, the handle again for a row with no title).
 */
export type ReceiptBatch = { batch: string; at: string; changes: number; rows: string[]; names: string[] };

/**
 * What a run did while it held an instruction: its batches between `taken_at` and `replied_at` (or now), and its head
 * as it stood before and after. Read from the log, never stored (§8.1). The run's own row and every instruction's row
 * are its bookkeeping and are left out. `null` before a run took it.
 *
 * ONE WRITE IS ONE INSTRUCTION'S. A run that holds two at once works the one it took last, as its `instruction` in
 * hand says (`takeFor`), so a write made while a later one was open is that one's, never also the earlier one's: of
 * the run's instructions open at the write, the newest taken has it (`inHandAt`).
 */
export type Receipts = { run: string; batches: ReceiptBatch[]; changes: number; head_before: string | null; head_after: string | null };

/** The most batches a receipt names, newest first. */
export const RECEIPT_BATCHES = 20;

export function receiptsOf(sql: Sql, kernel: Kernel, i: Instr, nowIso: string, ctx: CallContext, sight: ReturnType<typeof readSight>): Receipts | null {
  if (i.taken_by === null || i.taken_at === null) return null;
  const run = kernel.get(i.taken_by, { includeDeleted: true });
  /* A RUN SHE IS NOT SHOWN HAS NO RECEIPT FOR HER, and its writes are named only where she is shown the row. */
  if (run !== null && !sight.admits(ctx, run)) return null;
  const until = i.replied_at ?? nowIso;
  const rows = sql.all<{ batch: string | null; id: string; ts: string; target: string | null }>(
    `SELECT batch, id, ts, target FROM event
      WHERE actor = ? AND ts >= ? AND ts <= ?
        AND (target IS NULL OR (target <> ? AND target NOT IN (SELECT 'entry:' || id FROM entry WHERE register = ?)))
        AND kind NOT IN ('note', 'read', 'grant.read')
      ORDER BY ts DESC, rowid DESC LIMIT 2000`,
    i.taken_by,
    i.taken_at,
    until,
    run === null ? '' : `entry:${run.id}`,
    INSTRUCTIONS,
  );
  const held = instructionsTakenBy(sql, i.taken_by).filter((x) => x.kind !== 'resume' && x.taken_at !== null);
  const byBatch = new Map<string, ReceiptBatch>();
  for (const r of rows) {
    if (inHandAt(held, r.ts, nowIso)?.row !== i.row) continue;
    const key = r.batch ?? r.id;
    const was = byBatch.get(key) ?? { batch: key, at: r.ts, changes: 0, rows: [], names: [] };
    was.changes += 1;
    if (r.ts > was.at) was.at = r.ts;
    const id = typeof r.target === 'string' && r.target.startsWith('entry:') ? r.target.slice('entry:'.length) : null;
    const target = id === null || !sight.admits(ctx, kernel.get(id, { includeDeleted: true })) ? null : kernel.nameOf(id);
    if (id !== null && target !== null && !was.rows.includes(target) && was.rows.length < 10) {
      was.rows.push(target);
      was.names.push(kernel.titleOfRow(id) ?? target);
    }
    byBatch.set(key, was);
  }
  const headAt = (before: boolean): string | null => {
    if (run === null) return null;
    const line = sql.one<{ to_v: string | null }>(
      `SELECT to_v FROM event WHERE target = ? AND field = 'head' AND ts ${before ? '<' : '<='} ? ORDER BY ts DESC, rowid DESC LIMIT 1`,
      `entry:${run.id}`,
      before ? i.taken_at! : until,
    );
    if (typeof line?.to_v !== 'string') return before ? null : typeof run.fields.head === 'string' ? run.fields.head : null;
    try {
      const v = JSON.parse(line.to_v) as unknown;
      return typeof v === 'string' ? v : null;
    } catch {
      return line.to_v;
    }
  };
  const batches = [...byBatch.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    run: i.taken_by,
    batches: batches.slice(0, RECEIPT_BATCHES),
    changes: batches.reduce((n, b) => n + b.changes, 0),
    head_before: headAt(true),
    head_after: headAt(false),
  };
}

/** A number for an instruction's spoken name (`IN4` is 4), so two taken at one instant are told apart. */
const seqOf = (x: Instr): number => Number(x.id.slice(INSTRUCTION_PREFIX.length)) || 0;

/**
 * The instruction a run was working at `ts`: of those it took, open then (taken by `ts`, not answered before it), the
 * one taken last, the later one when two were taken at once. `null` when none was open.
 */
export function inHandAt(held: readonly Instr[], ts: string, nowIso: string): Instr | null {
  let best: Instr | null = null;
  for (const x of held) {
    if (x.taken_at === null || x.taken_at > ts || (x.replied_at ?? nowIso) < ts) continue;
    if (best === null || x.taken_at > best.taken_at! || (x.taken_at === best.taken_at && seqOf(x) > seqOf(best))) best = x;
  }
  return best;
}

/* ── the doors ──────────────────────────────────────────────────────────── */

/** What `instruct` takes, beside what the kernel reads (`InstructInput`). */
const INSTRUCT_TAKES = ['said', 'kind', 'when', 'to', 'to_run', 'to_agent', 'project', 'task', 'repo', 'replaces', 'waits_ms'] as const;

/** What `instructionList` takes. */
const LIST_TAKES = ['state', 'project', 'task', 'run', 'limit', 'cursor'] as const;

/** What `instructionsMine` takes: nothing (what is pending), `take`, `reply` with `said` and `state`, or `seen`. */
const MINE_TAKES = ['take', 'reply', 'said', 'state', 'seen', 'how'] as const;

/** At most this many instructions a minute on one record (plan §10.9). */
export const INSTRUCT_PER_MINUTE = 30;

/** The most threads one page of `instructionList` answers, and the page when none is asked. */
const LIST_MOST = 200;
const LIST_PAGE = 50;

/** The most ids one call says were shown. */
const SEEN_MOST = 50;

/** What a person is told who is not one: a token never tells, and never takes an instruction back. */
const BROWSER_ONLY = 'Only a person tells an agent, signed in to BrainDog. An agent answers with instructions.';

/** One thread of `instructionList`: the instruction, who was shown it and how, and what the run did while it held it. */
export type Thread = Told & { seen: { run: string; how: SeenHow; at: string }[]; receipts: Receipts | null };

/** What `instructionsMine` answers: the run, its stamp, what is pending for it, what stops it, and the lines to say. */
export type Mine = {
  run: string;
  stamp: string;
  pending: Told[];
  stop: Stop | null;
  lines: string[];
  /** The one it took or answered in this call, as it now stands, with its receipts after a reply. */
  instruction?: Told;
  receipts?: Receipts | null;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no, tail, clock } = deps;
  const nowIso = (): string => new Date(clock.now()).toISOString();
  const sight = readSight(kernel);

  /** Done and Needs you ring his phones per the run's settings row, once per state (`tellFinished`); never fails the reply. */
  const tellDone = (i: Instr, runId: string): void => {
    try {
      const f = (kernel.get(runId, { includeDeleted: true })?.fields ?? {}) as Record<string, unknown>;
      const str = (k: string): string | null => (typeof f[k] === 'string' && f[k] !== '' ? (f[k] as string) : null);
      const profile = kernel.profileFor({ kind: str('agent'), token: str('token_id'), host: str('host') });
      tellFinished({ sql, outbox: (kind, payload) => void kernel.outbox(kind, payload), nowMs: clock.now(), tz: kernel.identity()?.tz ?? 'UTC' }, i, profile);
    } catch {
      /* A PUSH IS NEVER WORTH AN ANSWER: the reply is written either way. */
    }
  };

  /** The keys of `args` none of `takes` names, the first refused in a sentence naming what the door takes. */
  const strayOf = (name: string, args: Record<string, unknown>, takes: readonly string[]) => {
    const stray = Object.keys(args).find((k) => !takes.includes(k));
    return stray === undefined
      ? null
      : no<never>('FIELD_UNKNOWN', `${stray} is not something ${name} takes. It takes ${takes.join(', ')}.`, { at: stray, allowed: [...takes] });
  };

  /** The list projects are kept in: the one declaring `scopes`, which `context` places a run in. */
  const projectsList = () => [...kernel.registers().values()].find((d) => d.scopes !== undefined) ?? null;

  /**
   * A project as runs hold it, by its spoken name (`things#23`), from the spoken name, the row's id or its title. `null`
   * with no such project, or more than one by that title.
   */
  const projectNamed = (ctx: CallContext, said: string): string | null => {
    const list = projectsList();
    if (list === null) return null;
    const row = kernel.get(said);
    if (row !== null && row.register === list.id) return sight.admits(ctx, row) ? kernel.nameOf(row.id) : null;
    /* ONLY A PROJECT THE CALLER IS SHOWN IS MATCHED BY ITS TITLE, so a title never says another one exists. */
    const titled = [
      ...sight.admitted(
        ctx,
        list.id,
        sql
          .all<{ id: string }>(
            `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND lower(trim(json_extract(fields, ?))) = lower(trim(?)) LIMIT 50`,
            list.id,
            `$."${list.title}"`,
            said,
          )
          .map((r) => r.id),
      ),
    ];
    return titled.length === 1 ? kernel.nameOf(titled[0]!) : null;
  };

  /** A row's project as runs hold it: its scope field read off the row, by spoken name, or `null`. */
  const projectOfRow = (ctx: CallContext, register: string, fields: Record<string, unknown>): string | null => {
    const decl = kernel.register(register);
    const f = decl?.fields.find((field) => field.scope !== undefined && !field.retired);
    const v = f === undefined ? undefined : fields[f.id];
    if (typeof v !== 'string' || v.trim() === '') return null;
    return projectNamed(ctx, v) ?? ((row) => (row === null ? kernel.nameOf(v) : sight.admits(ctx, row) ? kernel.nameOf(row.id) : null))(kernel.get(v));
  };

  /** Who a person's call is by, for the kernel's instruction path. */
  const personOf = (ctx: CallContext): WriteContext => ({ actor: ctx.principal.kind === 'person' ? ctx.principal.id : 'system', principal: { kind: 'person' } });

  /** Who a token's call is by, as `writerOf` in `index.ts` has it, so the kernel's ladder finds the run this session wrote as. */
  const agentOf = (ctx: CallContext): WriteContext => ({
    actor: `agent:${kindOf(ctx.session ?? {}).agent ?? 'other'}`,
    principal: { kind: 'token', token: ctx.principal.kind === 'token' ? ctx.principal.id : '' },
    session: ctx.session ?? {},
    ...(ctx.batch === undefined ? {} : { batch: ctx.batch }),
  });

  /** The run a token's call is, found or opened, by its spoken name. */
  const runOfCaller = (ctx: CallContext, note: string): Result<string> => {
    const found = kernel.runFor(agentOf(ctx), note);
    return found.ok ? ok(found.value.spoken) : (found as Result<never>);
  };

  /** What is open for one run now, a stop or a pause first, each as `Told`. */
  const pendingFor = (run: string): Told[] => kernel.instructionFor({}, run).map((i) => toldOf(sql, i));

  /** Marks each of `ids` seen by `run`, `how`; an id that is not the run's is passed over, since a list may be old. */
  const markSeen = (ids: readonly string[], run: string, how: SeenHow): void => {
    for (const id of ids) kernel.seenInstruction(id, run, how);
  };

  /** What a run is answered with: its stamp, what is pending, what stops it, and the lines in his voice. */
  const mineOf = (run: string, extra: Partial<Mine> = {}): Mine => {
    const pending = pendingFor(run);
    const stop = kernel.stopOf(run);
    const held = stopLine(sql, kernel, stop);
    const lines = [...(held === null ? [] : [held]), ...pending.filter((i) => i.kind !== 'stop' && i.kind !== 'pause').map((i) => i.line)];
    return { run, stamp: kernel.stampFor(run), pending, stop, lines: lines.length === 0 ? ['Nothing new for you.'] : lines, ...extra };
  };

  return {
    /**
     * He tells an agent (§2.1): one instruction to a run, a kind of agent, whoever is next, or a task, now or at the next
     * start; or a stop, pause, resume or redirect to one run, applied at once. DATA, and a person's alone.
     *
     * A PROJECT AND A TASK ARE SAID AS RUNS HOLD THEM. The app names a project by its title or handle and a task by its
     * handle; both are read back to the spoken name a run's own `project` and `task` carry, so the kernel's predicates
     * compare like with like. A task's lane (`hand.agent`) and project fill `to_agent` and `project` when he names
     * neither, so "Hand to Claude, with a note" reaches Claude on that project.
     */
    async instruct(args: InstructInput | undefined, ctx: CallContext): Promise<Result<Told>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', BROWSER_ONLY, { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('instruct', a, INSTRUCT_TAKES);
      if (stray) return stray;
      for (const key of ['said', 'to_run', 'to_agent', 'project', 'task', 'repo', 'replaces'] as const)
        if (a[key] !== undefined && a[key] !== null && typeof a[key] !== 'string') return no('VALUE_MALFORMED', `${key} is text.`, { at: key });
      for (const [key, list] of [['kind', INSTRUCTION_KINDS], ['when', INSTRUCTION_WHEN], ['to', INSTRUCTION_TO]] as const)
        if (a[key] !== undefined && !(list as readonly unknown[]).includes(a[key]))
          return no('ENUM_VALUE_UNKNOWN', `${key} is one of ${list.join(', ')}.`, { at: key, allowed: list });
      if (a.waits_ms !== undefined && (typeof a.waits_ms !== 'number' || !Number.isFinite(a.waits_ms)))
        return no('VALUE_MALFORMED', 'waits_ms is how long it waits for a run, in milliseconds.', { at: 'waits_ms' });
      const agent = text(a.to_agent);
      if (agent !== null && !(PROFILE_KINDS as readonly string[]).includes(agent))
        return no('ENUM_VALUE_UNKNOWN', `to_agent is one of ${PROFILE_KINDS.join(', ')}.`, { at: 'to_agent', allowed: PROFILE_KINDS });

      /* AT MOST THIRTY A MINUTE (§10.9): a person types slower than that, and a page that loops does not fill a run's inbox. */
      const since = new Date(clock.now() - 60_000).toISOString();
      const lately = sql.one<{ n: number; first: string | null }>(
        "SELECT count(*) AS n, min(created_at) AS first FROM entry WHERE register = 'instructions' AND created_at >= ?",
        since,
      );
      if ((lately?.n ?? 0) >= INSTRUCT_PER_MINUTE) {
        const wait = Math.max(1, Math.ceil((Date.parse(lately?.first ?? since) + 60_000 - clock.now()) / 1000));
        return {
          ok: false,
          refusal: { code: 'RATE_LIMITED', fix: `That is ${String(INSTRUCT_PER_MINUTE)} instructions this minute. Send this one again in ${String(wait)} seconds.`, at: 'said', retry_after: wait },
        };
      }

      const input: InstructInput = { said: '' };
      for (const key of ['said', 'to_run', 'repo', 'replaces'] as const) if (typeof a[key] === 'string') input[key] = a[key] as string;
      if (agent !== null) input.to_agent = agent;
      if (a.kind !== undefined) input.kind = a.kind as InstructInput['kind'];
      if (a.when !== undefined) input.when = a.when as InstructInput['when'];
      if (a.to !== undefined) input.to = a.to as InstructInput['to'];
      if (typeof a.waits_ms === 'number') input.waits_ms = a.waits_ms;
      const project = text(a.project);
      if (project !== null) {
        const named = projectNamed(ctx, project);
        if (named === null) return no('ROW_UNKNOWN', `There is no project called ${project}, or more than one.`, { at: 'project' });
        input.project = named;
      }
      const task = text(a.task);
      if (task !== null) {
        const row = kernel.get(task);
        if (row === null || !sight.admits(ctx, row)) return no('ROW_UNKNOWN', `There is no task called ${task}.`, { at: 'task' });
        input.task = kernel.nameOf(row.id);
        /* THE TASK'S LANE AND PROJECT, when he named neither: "hand this to Claude" reaches Claude where the task is. */
        const lane = kernel.register(row.register)?.hand?.agent;
        const laneSaid = lane === undefined ? null : text(row.fields[lane]);
        const kind = laneSaid?.toLowerCase().replace(/^agent:/u, '') ?? null;
        if (input.to_agent === undefined && kind !== null && (PROFILE_KINDS as readonly string[]).includes(kind)) input.to_agent = kind;
        if (input.project === undefined) {
          const at = projectOfRow(ctx, row.register, row.fields);
          if (at !== null) input.project = at;
        }
      }
      const made = kernel.instruct(personOf(ctx), input);
      return tail(made.ok ? ok(toldOf(sql, made.value)) : made);
    },

    /** He takes back an instruction no run has taken yet: it ends Withdrawn. DATA, and a person's alone. */
    async withdrawInstruction(args: { id?: unknown } | undefined, ctx: CallContext): Promise<Result<Told>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', 'Only the person who told it takes an instruction back, in BrainDog.', { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('withdrawInstruction', a, ['id']);
      if (stray) return stray;
      const id = text(a.id);
      if (id === null) return no('REQUIRED_MISSING', 'Say which instruction to take back, as IN4.', { at: 'id' });
      const out = kernel.withdrawInstruction(personOf(ctx), id);
      return tail(out.ok ? ok(toldOf(sql, out.value)) : out);
    },

    /**
     * His read of what he told agents, newest first: each thread with who was shown it and how ("Seen by S883 at start"),
     * and the receipts of the run that took it. In one state (`open` for Sent, Seen and Working together), on one
     * project or task, or to or by one run. READ+, the owner's.
     */
    async instructionList(args: { state?: string; project?: string; task?: string; run?: string; limit?: number; cursor?: string } | undefined, ctx: CallContext): Promise<Result<{ rows: Thread[]; cursor: string | null }>> {
      const stop = guard(ctx, 'owner');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('instructionList', a, LIST_TAKES);
      if (stray) return stray;
      const state = text(a.state);
      if (state !== null && state !== 'open' && !(INSTRUCTION_STATES as readonly string[]).includes(state))
        return no('ENUM_VALUE_UNKNOWN', `state is open, or one of ${INSTRUCTION_STATES.join(', ')}.`, { at: 'state', allowed: ['open', ...INSTRUCTION_STATES] });
      const limit = a.limit === undefined || a.limit === null ? LIST_PAGE : a.limit;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > LIST_MOST)
        return no('OUT_OF_BOUNDS', `limit is a whole number from 1 to ${String(LIST_MOST)}.`, { at: 'limit' });
      const cursor = a.cursor === undefined || a.cursor === null ? null : a.cursor;
      if (cursor !== null && (typeof cursor !== 'string' || !/^IN[1-9][0-9]*$/u.test(cursor)))
        return no('VALUE_MALFORMED', 'A cursor is the last instruction the page above answered with, as IN4.', { at: 'cursor' });
      const project = text(a.project);
      const projectSaid = project === null ? null : (projectNamed(ctx, project) ?? project);
      const task = text(a.task);
      const taskRow = task === null ? null : ((r) => (r !== null && sight.admits(ctx, r) ? r : null))(kernel.get(task));
      const taskSaid = task === null ? null : taskRow === null ? task : kernel.nameOf(taskRow.id);
      const run = text(a.run);
      const runRow = run === null ? null : ((r) => (r !== null && sight.admits(ctx, r) ? r : null))(kernel.get(run, { includeDeleted: true }));
      const runSaid = run === null ? null : runRow === null ? run : kernel.nameOf(runRow.id);

      const where: string[] = ["register = 'instructions'", 'deleted_at IS NULL'];
      const params: (string | number)[] = [];
      if (state === 'open') where.push("state IN ('sent', 'seen', 'working')");
      else if (state !== null) {
        where.push('state = ?');
        params.push(state);
      }
      if (projectSaid !== null) {
        where.push("json_extract(fields, '$.project') = ?");
        params.push(projectSaid);
      }
      if (taskSaid !== null) {
        where.push("json_extract(fields, '$.task') = ?");
        params.push(taskSaid);
      }
      if (runSaid !== null) {
        where.push(
          "(json_extract(fields, '$.to_run') = ? OR json_extract(fields, '$.taken_by') = ? OR EXISTS (SELECT 1 FROM instruction_seen s WHERE s.instruction = entry.id AND s.run = ?))",
        );
        params.push(runSaid, runSaid, runSaid);
      }
      if (cursor !== null) {
        where.push('seq < ?');
        params.push(Number(cursor.slice(2)));
      }
      const seqs = sql.all<{ seq: number }>(`SELECT seq FROM entry WHERE ${where.join(' AND ')} ORDER BY seq DESC LIMIT ?`, ...params, limit + 1);
      const now = nowIso();
      const rows = seqs.slice(0, limit).flatMap(({ seq }) => {
        const i = kernel.instruction(`IN${String(seq)}`);
        return i === null ? [] : [{ ...toldOf(sql, i), seen: kernel.instructionSeen(i.id), receipts: receiptsOf(sql, kernel, i, now, ctx, sight) }];
      });
      return ok({ rows, cursor: seqs.length > limit ? `IN${String(seqs[limit - 1]!.seq)}` : null });
    },

    /**
     * An agent's own instructions (the MCP tool `instructions`): with nothing, what is pending for its run, each marked
     * seen (`how`, `asked` unless the caller says it was shown another way); `take`, one of them, compare and set, so of
     * two runs the first wins and the second is told who has it; `reply`, its answer to one it holds, `said` and Done,
     * Needs you or Declined, answered with the receipts; `seen`, the ids a client showed it, with `how`.
     *
     * A TOKEN'S, AND ITS OWN RUN'S. The run is found or opened as its writes are, so no agent reads or answers another
     * run's instructions. A STOPPED OR PAUSED RUN STILL REACHES THIS DOOR: answering is what it is asked to do.
     */
    async instructionsMine(
      args: { take?: string; reply?: string; said?: string; state?: string; seen?: string[]; how?: string } | undefined,
      ctx: CallContext,
    ): Promise<Result<Mine>> {
      const stop = guard(ctx, 'propose', OWN_RUN);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'token')
        return no('FORBIDDEN', 'instructionsMine is how an agent reads what it was told, and a person is never a run. His threads are instructionList.', { at: 'principal' });
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('instructions', a, MINE_TAKES);
      if (stray) return stray;
      const asked = ['take', 'reply', 'seen'].filter((k) => a[k] !== undefined && a[k] !== null);
      if (asked.length > 1) return no('VALUE_MALFORMED', `Send one of take, reply or seen in a call, not ${asked.join(' and ')}.`, { at: asked[1]! });
      for (const key of ['take', 'reply', 'said'] as const)
        if (a[key] !== undefined && a[key] !== null && typeof a[key] !== 'string') return no('VALUE_MALFORMED', `${key} is text${key === 'said' ? '' : ', as IN4'}.`, { at: key });
      if ((a.said !== undefined || a.state !== undefined) && a.reply === undefined)
        return no('VALUE_MALFORMED', 'said and state go with reply, the instruction they answer.', { at: a.said !== undefined ? 'said' : 'state' });
      if (a.state !== undefined && !(REPLY_STATES as readonly unknown[]).includes(a.state))
        return no('ENUM_VALUE_UNKNOWN', `state is one of ${REPLY_STATES.join(', ')}.`, { at: 'state', allowed: REPLY_STATES });
      if (a.how !== undefined && !(SEEN_HOW as readonly unknown[]).includes(a.how))
        return no('ENUM_VALUE_UNKNOWN', `how is one of ${SEEN_HOW.join(', ')}.`, { at: 'how', allowed: SEEN_HOW });
      if (a.seen !== undefined && (!Array.isArray(a.seen) || a.seen.length > SEEN_MOST || a.seen.some((s) => typeof s !== 'string')))
        return no('VALUE_MALFORMED', `seen is a list of at most ${String(SEEN_MOST)} instructions, as ["IN4"].`, { at: 'seen' });
      const how = (a.how as SeenHow | undefined) ?? 'asked';

      const run = runOfCaller(ctx, 'opened: instructions');
      if (!run.ok) return tail(run as Result<never>);
      if (typeof a.take === 'string') {
        const taken = kernel.takeInstruction(a.take.trim(), run.value);
        if (!taken.ok) return tail(taken as Result<never>);
        return tail(ok(mineOf(run.value, { instruction: toldOf(sql, taken.value) })));
      }
      if (typeof a.reply === 'string') {
        const answered = kernel.replyInstruction(a.reply.trim(), run.value, {
          said: typeof a.said === 'string' ? a.said : '',
          ...(a.state === undefined ? {} : { state: a.state as (typeof REPLY_STATES)[number] }),
        });
        if (!answered.ok) return tail(answered as Result<never>);
        tellDone(answered.value, run.value);
        return tail(ok(mineOf(run.value, { instruction: toldOf(sql, answered.value), receipts: receiptsOf(sql, kernel, answered.value, nowIso(), ctx, sight) })));
      }
      const ids = Array.isArray(a.seen) ? (a.seen as string[]) : pendingFor(run.value).map((i) => i.id);
      markSeen(ids, run.value, how);
      return tail(ok(mineOf(run.value)));
    },
  };
}

/**
 * THE GUARD'S WORD FOR A CALL ABOUT THE CALLER'S OWN RUN (`guard(ctx, need, OWN_RUN)` in `index.ts`): no list is asked,
 * and a stopped or paused run still reaches it, because answering, handing off and ending are what a stopped run is
 * asked to do (§2.4). A name no list can have, as `BOUND` is.
 */
export const OWN_RUN = 'the run itself';
