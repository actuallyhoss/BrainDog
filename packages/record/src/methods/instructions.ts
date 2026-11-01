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
 * HIS VOICE IS MARKED (§10.2). Every instruction reaches an agent as `Teodor said in BrainDog: "…"`, a line built
 * here once (`toldOf`), which the briefing, the pulse and this door all hand on, so no path words it another way.
 *
 * RECEIPTS ARE NOT STORED (§8.1). They are read from the log: the run's batches between `taken_at` and `replied_at`,
 * and the run's head before and after (`receiptsOf`).
 *
 * AN ORDER MAY NAME QUESTIONS AND HIS ANSWER TO EACH. "Accept SG243", sent from BrainDog, where it is provably him,
 * lets the run that takes it answer SG243 with Accept, once, and nothing else: `instructionsMine`'s `answer`. The
 * answer is his own `decide`, made as him and said as his order's (`ordered`), so Undo takes it back as any decision,
 * and `admin` and `keychain` refuse it. Only the run that took the order, under his own key, while it holds it; only the
 * answer he named; only a choice or a set of rows; and only the question as he saw it. A run that read outside text
 * still files every other write as a question: the order names what it may answer, and the run chooses nothing.
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
  MACHINE_NAME,
  PROFILE_KINDS,
  REPLY_STATES,
  SEEN_HOW,
  SEAT_NAME,
  SESSION,
  SESSION_PREFIX,
  ANSWERS_MOST,
  agentOf as kindOf,
  instructionsTakenBy,
  placesHeard,
  askedKeyOf,
  tokenOfRun,
  type Instr,
  type InstrAnswer,
  type InstructInput,
  type Kernel,
  type SeenHow,
  type Stop,
  type WriteContext,
} from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { readSight } from '../sight.ts';
import { PRESSABLE, answersSaid, answersTaken, questionVersion } from './chat-answer.ts';
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
/**
 * A person's name in the middle of a sentence: "the owner" where the record has no name for them, never "on The owner's
 * word" (audit 10k, AK23).
 */
export function nameMid(name: string): string {
  return name === 'The owner' ? 'the owner' : name;
}

/**
 * Words quoted at the end of a sentence, with the sentence's full stop only where the quote does not end in one already:
 * `"Send Tom the PDFs today.".` was two (AK23).
 */
export function quotedEnd(said: string): string {
  return /[.!?…]$/u.test(said) ? `"${said}"` : `"${said}".`;
}

/**
 * An answer as the question offered it: an option's own label ("Halden"), never its id ("a"), and accept or reject as
 * yes or no (audit 10k, AK15).
 */
function optionSaid(row: Record<string, unknown>, option: string): string {
  const body = typeof row.body === 'object' && row.body !== null ? (row.body as Record<string, unknown>) : {};
  for (const o of Array.isArray(body.options) ? body.options : []) {
    const { id, label } = (typeof o === 'object' && o !== null ? o : {}) as { id?: unknown; label?: unknown };
    if (id === option && typeof label === 'string' && label.trim() !== '') return `"${label.trim().replace(/\s+/gu, ' ').slice(0, 60)}"`;
  }
  return option === 'accept' ? 'yes' : option === 'reject' ? 'no' : option;
}

/** A question by its own words with its handle beside them, "Which licence? (SG14)", or the handle where it has none. */
function askedSaid(row: Record<string, unknown>, given: string): string {
  const words = typeof row.question === 'string' ? row.question.replace(/\s+/gu, ' ').trim() : '';
  if (words === '') return given;
  return `"${words.length > 80 ? `${words.slice(0, 79)}…` : words}" (${given})`;
}

export function lineOf(i: Instr, by: string): string {
  const said = i.said.replace(/\s+/gu, ' ').trim();
  if (i.kind === 'stop') return `${by} stopped this run in BrainDog (${i.id}): ${quotedEnd(said)} Reply with instructions, then end.`;
  if (i.kind === 'pause') return `${by} paused this run in BrainDog (${i.id}): ${quotedEnd(said)} Wait; reply with instructions if you must.`;
  if (i.kind === 'resume') return `${by} resumed this run in BrainDog (${i.id}): ${quotedEnd(said)}`;
  const answer = i.taken_by === null ? `Take it with instructions take ${i.id}.` : `Reply with instructions reply ${i.id} when it is done.`;
  /* THE QUESTIONS IT NAMES, by name, with the call that answers one: the run gives his answer, never its own. */
  const open = (i.answers ?? []).filter((a) => !(i.answered ?? []).includes(a.question)).map((a) => a.question);
  const named = open.length === 0 ? '' : ` It lets you answer ${open.join(', ')} as ${by} said, with instructions answer ${open[0]!}${i.taken_by === null ? ' once you take it' : ''}.`;
  /* WHAT HE SENT WITH IT AND WHETHER IT MAY CHANGE FILES, said in the same line, so every path hands both on. */
  const rows = (i.attach ?? []).length === 0 ? '' : ` ${by} sent ${i.attach.join(', ')} with it: read each with get.`;
  const leave = i.may_change === true ? ' You may change files for it.' : i.may_change === false ? ' Change no file for it; propose what should change instead.' : '';
  return `${by} said in BrainDog (${i.id}): ${quotedEnd(said)}${rows}${leave} ${answer}${named}`;
}

/** An instruction as `Told`, its maker named once. */
/**
 * The open instructions a run is handed, as its caller may read them: every one to whoever reads the owner's list of
 * them (his own agents, and one a grant names the list to, as `list` asks it), and to anybody else's agent only the
 * ones sent to its own run by name. Whoever is next, any Claude and a task's note are his words to his own agents: a
 * member's agent was handed them whole on `context`, `attach`, `pulse` and `instructionsMine`, while `list` refused it
 * the list they are rows of (`kernelStop`).
 */
export function toldTo(readable: RecordDeps['readable'], ctx: CallContext, open: readonly Instr[]): Instr[] {
  /* ONE A JOB CARRIES IS ITS RUN'S AS ONE SENT BY NAME IS: it reaches no run but the one that job's bearer opened. */
  return readable(ctx, INSTRUCTIONS) === null ? [...open] : open.filter((i) => i.to === 'run' || i.job !== null);
}

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
  /* FROM THE TAKE ITSELF, NOT ITS MILLISECOND (audit 10k, AK11): writes in the same instant as the take, before it in the
     log, are what the run did before it held this, and a reply called them "while you held it". The take is the run's
     first line on the instruction's row at or after `taken_at`, so only what the log holds after it counts. */
  const took = sql.one<{ r: number | null }>('SELECT min(rowid) AS r FROM event WHERE target = ? AND actor = ? AND ts >= ?', `entry:${i.row}`, i.taken_by, i.taken_at)?.r ?? 0;
  const rows = sql.all<{ batch: string | null; id: string; ts: string; target: string | null }>(
    `SELECT batch, id, ts, target FROM event
      WHERE actor = ? AND ts >= ? AND ts <= ? AND rowid > ?
        AND (target IS NULL OR (target <> ? AND target NOT IN (SELECT 'entry:' || id FROM entry WHERE register = ?)))
        AND kind NOT IN ('note', 'read', 'grant.read')
      ORDER BY ts DESC, rowid DESC LIMIT 2000`,
    i.taken_by,
    i.taken_at,
    until,
    took,
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
const INSTRUCT_TAKES = ['said', 'kind', 'when', 'to', 'to_run', 'to_agent', 'project', 'task', 'repo', 'machine', 'seat', 'replaces', 'waits_ms', 'answers'] as const;

/** What `instructionList` takes. */
const LIST_TAKES = ['state', 'project', 'task', 'run', 'limit', 'cursor'] as const;

/**
 * What `instructionsMine` takes: nothing (what is pending), `take`, `reply` with `said` and `state`, `seen`, or `answer`,
 * alone for a question his order named, or with `option` and `said` for one he told the run to answer (`wordAnswer`).
 */
const MINE_TAKES = ['take', 'reply', 'said', 'state', 'seen', 'how', 'answer', 'option'] as const;

/** The words he may say a yes or a no in, each group one answer, its question's own id found among them. */
const SAME_ANSWER: readonly (readonly string[])[] = [
  ['accept', 'approve', 'yes'],
  ['reject', 'decline', 'no'],
];

/** At most this many instructions a minute on one record. */
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

/**
 * The machines and Claude Code profiles an instruction may be aimed at, by name, as runs say them: those on the runs
 * he is shown from the last `PLACES_DAYS` days, and those on his Profiles and Places when that add-on is on. Names
 * only, never a folder, and only to whoever reads the runs already.
 */
export type Places = {
  machines: string[];
  seats: string[];
  /** The kinds of agent heard on those runs (`claude`, `codex`), so Tell offers the agents he has and not every kind (audit 6g, AG27). */
  agents: string[];
};

/** An agent's kind as a run names it and `instruct` takes it after `agent:`, one of the kinds a profile may be. */
const AGENT_KIND = new RegExp(`^(?:${PROFILE_KINDS.filter((k) => k !== 'other' && k !== 'runner' && k !== 'script').join('|')})$`, 'u');

/** How far back the runs are read for the machines and profiles the composer offers. */
export const PLACES_DAYS = 30;

/** The most machines or profiles offered, newest heard first. */
const PLACES_MOST = 20;

/** The most recent runs read for them. */
const PLACES_RUNS = 500;

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
  /** The question it answered on his order or his word in this call (`answer`), and the line it says. */
  answered?: { question: string; option: string; decision: string | null; said: string };
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, readable, sightOf, spokenAs, no, tail, clock } = deps;
  const nowIso = (): string => new Date(clock.now()).toISOString();
  const sight = readSight(kernel);

  /** Done and Needs you ring his phones per the run's settings row, once per state (`tellFinished`); never fails the reply. */
  const tellDone = (i: Instr, runId: string): void => {
    try {
      const f = (kernel.get(runId, { includeDeleted: true })?.fields ?? {}) as Record<string, unknown>;
      const str = (k: string): string | null => (typeof f[k] === 'string' && f[k] !== '' ? (f[k] as string) : null);
      const profile = kernel.profileFor({ kind: str('agent'), token: str('token_id'), host: str('host'), seat: str('seat') });
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

  /** What is open for one run now, a stop or a pause first, each as `Told`, as its caller may be handed them (`toldTo`). */
  const pendingFor = (run: string, ctx: CallContext): Told[] => toldTo(readable, ctx, kernel.instructionFor({}, run)).map((i) => toldOf(sql, i));

  /** Marks each of `ids` seen by `run`, `how`; an id that is not the run's is passed over, since a list may be old. */
  const markSeen = (ids: readonly string[], run: string, how: SeenHow): void => {
    for (const id of ids) kernel.seenInstruction(id, run, how);
  };

  /**
   * The machines and profiles the composer offers (`Places`): off the runs the caller is shown from the last
   * `PLACES_DAYS` days, newest heard first, and off the Profiles add-on's two lists where the caller reads them, which
   * are personal, so only their owner ever does.
   */
  const placesFor = (ctx: CallContext): Places => {
    const runs = placesHeard(sql, clock.now(), PLACES_DAYS * 86_400_000, PLACES_RUNS);
    const shown = guard(ctx, 'read', 'session') === null ? sight.admitted(ctx, 'session', runs.map((r) => r.id)) : new Set<string>();
    const machines: string[] = [];
    const seats: string[] = [];
    const agents: string[] = [];
    /* ONLY A NAME `instruct` TAKES IS OFFERED: a profile he called "Second account" on his Profiles list is no name a run
       says, and offered, it would only be refused. */
    const add = (list: string[], v: unknown, grammar: RegExp): void => {
      const name = typeof v === 'string' ? v.trim() : '';
      if (grammar.test(name) && !list.includes(name) && list.length < PLACES_MOST) list.push(name);
    };
    for (const r of runs) {
      if (!shown.has(r.id)) continue;
      add(machines, r.host, MACHINE_NAME);
      add(seats, r.seat, SEAT_NAME);
      add(agents, r.agent, AGENT_KIND);
    }
    /* THE OWNER'S PROFILES AND PLACES, the add-on's lists found by what they are and not by an id: the list playing
       `profiles`, and the one with a link to it and a `host`. Each is personal, so its owner alone is let through. */
    const lists = [...kernel.registers().values()];
    const profiles = lists.find((d) => (d as { role?: unknown }).role === 'profiles') ?? null;
    if (profiles !== null && guard(ctx, 'read', profiles.id) === null) {
      for (const r of sql.all<{ name: unknown }>(
        `SELECT json_extract(fields, ?) AS name FROM entry WHERE register = ? AND deleted_at IS NULL AND coalesce(state, '') <> 'retired' ORDER BY updated_at DESC LIMIT ?`,
        `$."${profiles.title}"`,
        profiles.id,
        PLACES_MOST,
      ))
        add(seats, r.name, SEAT_NAME);
      const places =
        lists.find((d) => d.id !== profiles.id && d.fields.some((f) => f.to === profiles.id && !f.retired) && d.fields.some((f) => f.id === 'host' && !f.retired)) ?? null;
      if (places !== null && guard(ctx, 'read', places.id) === null)
        for (const r of sql.all<{ host: unknown }>(
          `SELECT json_extract(fields, '$.host') AS host FROM entry WHERE register = ? AND deleted_at IS NULL AND coalesce(state, '') <> 'retired' ORDER BY updated_at DESC LIMIT ?`,
          places.id,
          PLACES_MOST,
        ))
          add(machines, r.host, MACHINE_NAME);
    }
    return { machines, seats, agents };
  };

  /**
   * The questions an order names, each as the kernel keys it, with his answer and the question's version as he sees it
   * now. Each is one he is shown, open, a choice or a set of rows, and answered with one of its own answers; a
   * pack, a script or a setting installs, and is answered in BrainDog, where what it installs is shown whole.
   */
  const answersNamed = async (ctx: CallContext, given: unknown): Promise<Result<InstrAnswer[]>> => {
    if (!Array.isArray(given) || given.length > ANSWERS_MOST)
      return no('VALUE_MALFORMED', `answers is a list of at most ${String(ANSWERS_MOST)} questions, each with its answer, as [{"question":"SG243","option":"accept"}].`, { at: 'answers' });
    const out: InstrAnswer[] = [];
    for (const [n, x] of given.entries()) {
      const at = `answers[${String(n)}]`;
      const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
      const said = typeof o.question === 'string' ? o.question.trim() : '';
      const word = typeof o.option === 'string' ? o.option.trim() : '';
      if (said === '' || word === '') return no('VALUE_MALFORMED', 'Each answer names a question and the answer to give it.', { at });
      const id = spokenAs(said) ?? said;
      const row = kernel.governanceRow('suggestion', id);
      /* A QUESTION HE IS NOT SHOWN IS ONE THAT IS NOT THERE, as `decide` answers it. */
      if (row === null || sightOf(ctx, `suggestion:${id}`) === null) return no('OUT_OF_BOUNDS', `There is no question called ${said}.`, { at });
      if (row.status !== 'open') return no('TRANSITION_ILLEGAL', `${said} is already answered.`, { at });
      if (!PRESSABLE.has(String(row.body_kind ?? '')))
        return no('FORBIDDEN', `${said} changes what this BrainDog is, so it is answered in BrainDog, where that is shown whole.`, { at });
      const takes = answersTaken(row);
      /* HIS WORD AS HE SAYS IT: "approve" or "yes" is the yes this question takes, "decline" or "no" its no. */
      const same = SAME_ANSWER.find((g) => g.includes(word.toLowerCase()));
      const option = takes.includes(word) ? word : (same?.find((w) => takes.includes(w)) ?? word);
      if (!takes.includes(option)) return no('ENUM_VALUE_UNKNOWN', `${said} is answered with one of ${answersSaid(row, takes)}.`, { at, allowed: takes });
      if (out.some((y) => y.question === id)) return no('VALUE_MALFORMED', `${said} is named twice. Give it one answer.`, { at });
      out.push({ question: id, option, version: await questionVersion(row) });
    }
    return ok(out);
  };

  /**
   * A run answers a question his order named: the order it took and holds, which names that question, and his
   * answer to it, given as his own `decide`. Every check is the order's, not the run's: the run's key is his, the order
   * is his and he is an owner still, the question is the one he saw and is open, and it is answered once.
   */
  const orderAnswer = async (run: string, given: string, ctx: CallContext): Promise<Result<Mine>> => {
    const id = spokenAs(given) ?? given;
    const held = instructionsTakenBy(sql, run).filter((i) => i.state === 'working' && i.answers.some((x) => x.question === id));
    const i = held.at(-1);
    if (i === undefined)
      return no('LEVEL_REQUIRED', `No order you hold names ${given}. Only the person answers it, in BrainDog, unless they told you to: then send option, and said in their words.`, { at: 'answer' });
    const named = i.answers.find((x) => x.question === id)!;
    if (i.answered.includes(id)) return no('TRANSITION_ILLEGAL', `You already answered ${given} on ${i.id}.`, { at: 'answer' });
    /* HIS ORDER, UNDER HIS OWN KEY: a run on somebody else's key never answers as him, whatever it took. */
    const by = i.by;
    if (by === null || !by.startsWith('p_') || ctx.principal.kind !== 'token' || ctx.principal.person !== by)
      return no('FORBIDDEN', `${i.id} is not an order to this key, so it answers nothing.`, { at: 'answer' });
    if (kernel.access(by)?.level !== 'owner') return no('FORBIDDEN', `${i.id} was sent by somebody who no longer owns this BrainDog.`, { at: 'answer' });
    const row = kernel.governanceRow('suggestion', id);
    if (row === null || row.status !== 'open') return no('TRANSITION_ILLEGAL', `${given} is already answered.`, { at: 'answer' });
    if ((await questionVersion(row)) !== named.version)
      return no('VERSION_STALE', `${given} changed since the person sent ${i.id}, so their answer is not given. Reply needs_you and they answer it in BrainDog.`, { at: 'answer' });
    if (deps.decideAs === undefined) return no('NOT_IN_THIS_BUILD', 'Answering on an order is not in this build.', { at: 'answer' });
    const byName = personNamed(sql, by);
    const as: CallContext = { principal: { kind: 'person', id: by, level: 'owner' }, registers: '*', credentialed: true, ordered: i.id };
    const said = i.said.replace(/\s+/gu, ' ').trim();
    const out = await deps.decideAs({ id, decide: { option: named.option, reason: `${byName} said in BrainDog (${i.id}): "${said}"` } }, as);
    if (!out.ok) return out as Result<never>;
    const decided = (typeof out.value === 'object' && out.value !== null ? out.value : {}) as { decision?: unknown; batch?: unknown };
    const decision = typeof decided.decision === 'string' ? decided.decision : null;
    if (decision !== null)
      kernel.keepOrderAnswer({ instruction: i, question: id, run, decision, by, byName, batch: typeof decided.batch === 'string' ? decided.batch : undefined });
    const now = kernel.instruction(i.row) ?? i;
    return ok(
      mineOf(run, ctx, {
        instruction: toldOf(sql, now),
        answered: { question: given, option: named.option, decision, said: `Answered ${askedSaid(row, given)} with ${optionSaid(row, named.option)}, on ${nameMid(byName)}'s order (${i.id}).` },
      }),
    );
  };

  /** Who drafted a question, which keeps the key that asked through a run no key opened (`askedKeyOf`). */
  const draftedOf = (id: string): string | null => sql.one<{ d: string | null }>('SELECT drafted_by AS d FROM suggestion WHERE id = ?', id)?.d ?? null;

  /**
   * Whether a question's asker is anybody but `by` and the record's own, read through every way a question is signed.
   *
   * THE KEY THAT CALLED, NEVER THE RUN IT IS FILED UNDER (RM1). A run no key opened is signed by whichever key it is
   * shared with, so its question keeps that key (`askedKeyOf`, `drafted_by: token:<id>`), and the key's person is who
   * asked. Only a question no key is kept on falls back to the run: an automation's is the record's own, and one a person
   * made in the app is that person's (RL1), since only their own keys may work as it now (`othersRun`).
   */
  const askedBySomebodyElse = (opener: string, drafted: unknown, by: string): boolean => {
    const keyOf = (token: string): boolean => {
      const key = sql.one<{ person_id: string | null; label: string | null }>('SELECT person_id, label FROM token WHERE id = ?', token);
      if (key === undefined || (key.label ?? '').startsWith('report:')) return true;
      return key.person_id !== by;
    };
    const kept = askedKeyOf(sql, '', drafted);
    if (kept !== null) return keyOf(kept);
    if (opener === '' || opener === 'system' || opener === 'slash' || opener.startsWith('rule:') || opener.startsWith('script:')) return false;
    if (opener.startsWith('p_')) return opener !== by;
    const named = opener.startsWith('token:') ? opener.slice(6) : opener;
    const run = new RegExp(`^${SESSION_PREFIX}[1-9]\\d*$`, 'u').test(named);
    const token = named.startsWith('t_') ? named : run ? tokenOfRun(sql, named) : null;
    if (token !== null) return keyOf(token);
    if (!run) return true;
    const made = sql.one<{ a: string }>(
      `SELECT e.actor AS a FROM entry n JOIN event e ON e.target = 'entry:' || n.id AND e.kind = 'create'
       WHERE n.register = '${SESSION}' AND n.seq = ? ORDER BY e.rowid LIMIT 1`,
      Number(named.slice(SESSION_PREFIX.length)),
    )?.a;
    if (made === undefined) return true;
    if (made === 'system' || made === 'slash' || made.startsWith('rule:') || made.startsWith('script:')) return false;
    /* A RUN A KEY MADE WITHOUT STAMPING IT is that key's person's, read as a key named outright. */
    if (made.startsWith('token:t_')) return keyOf(made.slice(6));
    return made !== by;
  };

  /**
   * A run answers a question he told it to answer, in the conversation, his words sent as `said` (the owner's decision
   * of 27 October; `wordOf` and `wordFault` in `index.ts` say who may and what no word reaches). The answer is his own
   * `decide`, made as him and said as given on his word (`onWord`), so Undo takes it back as any decision. Unlike an
   * order the run names the answer, so the question takes any of its own answers, an install's among them, and the
   * decision keeps his words and the run that carried them.
   */
  const wordAnswer = async (run: string, given: string, option: unknown, said: unknown, ctx: CallContext): Promise<Result<Mine>> => {
    if (deps.wordOf === undefined || deps.wordFault === undefined || deps.decideAs === undefined)
      return no('NOT_IN_THIS_BUILD', 'Answering on their word is not in this build. Ask with propose.', { at: 'said' });
    const word = deps.wordOf(ctx, said);
    if (!word.ok) return word as Result<never>;
    const id = spokenAs(given) ?? given;
    const row = kernel.governanceRow('suggestion', id);
    /* A QUESTION HE IS NOT SHOWN IS ONE THAT IS NOT THERE, as `decide` answers it. */
    if (row === null || sightOf(ctx, `suggestion:${id}`) === null) return no('OUT_OF_BOUNDS', `There is no question called ${given}.`, { at: 'answer' });
    if (row.status !== 'open') return no('TRANSITION_ILLEGAL', `${given} is already answered.`, { at: 'answer' });
    /* A QUESTION THIS AGENT ASKED IS NEVER ITS OWN TO ANSWER (audit 10k, AK2). Its key asked the person, so an answer from
       the same key is the agent deciding for them, whatever words it carries: they answer it in BrainDog. A change they
       told it to make goes in with said on create or update, which takes the question back (AK16); a choice it asked is
       taken back with withdraw once they have said. */
    const askedBy = String(row.opened_by ?? '');
    const key = ctx.principal.kind === 'token' ? ctx.principal.id : null;
    /* WHILE HE LETS HIS AGENTS DO EVERYTHING WITHOUT ASKING (`bypass`), a question it asked before is its to settle too. */
    if (ctx.bypass === undefined && (askedBy === run || (key !== null && (askedBy === key || askedKeyOf(sql, askedBy, draftedOf(id)) === key))))
      return no(
        'FORBIDDEN',
        `You asked ${given} yourself, so the person answers it in BrainDog. If they told you what to do, make that change with said on create or update, or take the question back.`,
        { at: 'answer', try: `propose ${JSON.stringify({ withdraw: given })}` },
      );
    const kind = String(row.body_kind ?? '');
    const takes = PRESSABLE.has(kind) ? answersTaken(row) : ['accept', 'reject'];
    const asked = typeof option === 'string' ? option.trim() : '';
    if (asked === '') return no('REQUIRED_MISSING', `Which answer did they give? Send option, one of ${answersSaid(row, takes)}.`, { at: 'option', allowed: takes });
    /* HIS WORD AS HE SAYS IT, as an order's: "approve" or "yes" is the yes this question takes, "decline" or "no" its no. */
    const same = SAME_ANSWER.find((g) => g.includes(asked.toLowerCase()));
    const chosen = takes.includes(asked) ? asked : (same?.find((w) => takes.includes(w)) ?? asked);
    if (!takes.includes(chosen)) return no('ENUM_VALUE_UNKNOWN', `${given} is answered with one of ${answersSaid(row, takes)}.`, { at: 'option', allowed: takes });
    /* WHAT THE ANSWER WOULD DO, AND NOTHING ELSE: a no to a set of rows or an install changes nothing, and of a choice only
       the option picked is read, so a key named by another option never holds this one back. */
    const body = typeof row.body === 'object' && row.body !== null ? (row.body as Record<string, unknown>) : {};
    const options = Array.isArray(body.options) ? body.options : [];
    const weighed = kind === 'options' ? { ...row, body: { ...body, options: options.filter((o) => typeof o === 'object' && o !== null && (o as { id?: unknown }).id === chosen) } } : row;
    const fault = kind !== 'options' && (chosen === 'reject' || chosen === 'apart') ? null : deps.wordFault(weighed, ctx);
    if (fault !== null) return no('FORBIDDEN', fault, { at: 'answer' });
    const { by, byName, said: words } = word.value;
    /* A QUESTION SOMEBODY ELSE OPENED IS THEIR WORDS, which the run had to read to answer: another person's, a feed's or
       a project key's, or an agent of somebody else's. It is answered in BrainDog, never on a word carried past them.
       EVERY WAY A QUESTION IS SIGNED (audit 31k, RK1): a token's question is signed by its run (`S41`), so the run is
       read back to its key and the key to its person; a key named outright (`t_…`, `token:t_…`) the same. Only his own
       keys pass, and a run no key opened (an automation), a rule, a script, Slash or the system, which are the record's
       own. An agent no run was opened for (`agent:<name>`) names nobody, so it is refused with the rest. */
    if (askedBySomebodyElse(String(row.opened_by ?? ''), draftedOf(id), by))
      return no('FORBIDDEN', `${given} was asked by somebody else, so it is answered in BrainDog and not on a word. Ask ${byName} to answer it there.`, { at: 'answer' });
    const as: CallContext = { principal: { kind: 'person', id: by, level: 'owner' }, registers: '*', credentialed: true, onWord: run };
    const out = await deps.decideAs({ id, decide: { option: chosen, reason: `${byName} told ${run}: "${words}"` } }, as);
    if (!out.ok) return out as Result<never>;
    const decided = (typeof out.value === 'object' && out.value !== null ? out.value : {}) as { decision?: unknown; batch?: unknown };
    const decision = typeof decided.decision === 'string' ? decided.decision : null;
    if (decision !== null) kernel.keepWordAnswer({ run, decision, by, byName, said: words, batch: typeof decided.batch === 'string' ? decided.batch : undefined });
    return ok(mineOf(run, ctx, { answered: { question: given, option: chosen, decision, said: `Answered ${askedSaid(row, given)} with ${optionSaid(row, chosen)}, on ${nameMid(byName)}'s word. Undo is in BrainDog.` } }));
  };

  /** What a run is answered with: its stamp, what is pending, what stops it, and the lines in his voice. */
  const mineOf = (run: string, ctx: CallContext, extra: Partial<Mine> = {}): Mine => {
    const pending = pendingFor(run, ctx);
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
     *
     * ON A MACHINE, AS A PROFILE: `machine` and `seat` are names as runs say them (`Places`), and narrow any but a named
     * run to the runs there (migration 44); the kernel holds each to its grammar.
     */
    async instruct(args: InstructInput | undefined, ctx: CallContext): Promise<Result<Told>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', BROWSER_ONLY, { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('instruct', a, INSTRUCT_TAKES);
      if (stray) return stray;
      for (const key of ['said', 'to_run', 'to_agent', 'project', 'task', 'repo', 'machine', 'seat', 'replaces'] as const)
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
      for (const key of ['said', 'to_run', 'repo', 'machine', 'seat', 'replaces'] as const) if (typeof a[key] === 'string') input[key] = a[key] as string;
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
      if (a.answers !== undefined && a.answers !== null) {
        const named = await answersNamed(ctx, a.answers);
        if (!named.ok) return named as Result<never>;
        if (named.value.length > 0) input.answers = named.value;
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
     *
     * AND THE MACHINES AND PROFILES THE COMPOSER OFFERS (`places`), off the runs he is shown and his Profiles and Places,
     * with the page, so the box he tells an agent in needs no read of its own.
     */
    async instructionList(
      args: { state?: string; project?: string; task?: string; run?: string; limit?: number; cursor?: string } | undefined,
      ctx: CallContext,
    ): Promise<Result<{ rows: Thread[]; cursor: string | null; places: Places }>> {
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
      return ok({ rows, cursor: seqs.length > limit ? `IN${String(seqs[limit - 1]!.seq)}` : null, places: placesFor(ctx) });
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
      args: { take?: string; reply?: string; said?: string; state?: string; seen?: string[]; how?: string; answer?: string } | undefined,
      ctx: CallContext,
    ): Promise<Result<Mine>> {
      const stop = guard(ctx, 'propose', OWN_RUN);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'token')
        return no(
          'FORBIDDEN',
          'Only an agent with a token of its own reads what it was told, and this one is signed in as the person. Connect this agent with a token: braindog token create --scope write, or braindog setup again.',
          { at: 'principal' },
        );
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('instructions', a, MINE_TAKES);
      if (stray) return stray;
      const asked = ['take', 'reply', 'seen', 'answer'].filter((k) => a[k] !== undefined && a[k] !== null);
      if (asked.length > 1) return no('VALUE_MALFORMED', `Send one of take, reply, seen or answer in a call, not ${asked.join(' and ')}.`, { at: asked[1]! });
      for (const key of ['take', 'reply', 'said', 'answer'] as const)
        if (a[key] !== undefined && a[key] !== null && typeof a[key] !== 'string') return no('VALUE_MALFORMED', `${key} is text${key === 'said' ? '' : key === 'answer' ? ', as SG243' : ', as IN4'}.`, { at: key });
      if (a.state !== undefined && a.reply === undefined) return no('VALUE_MALFORMED', 'state goes with reply, the instruction it answers.', { at: 'state' });
      if (a.said !== undefined && a.reply === undefined && a.answer === undefined)
        return no('VALUE_MALFORMED', 'said goes with reply, the instruction it answers, or with answer and option: the words the person told you it in.', { at: 'said' });
      if (a.option !== undefined && (a.answer === undefined || typeof a.option !== 'string'))
        return no('VALUE_MALFORMED', 'option is text, and goes with answer and said: the answer the person gave, in their words.', { at: 'option' });
      if (a.state !== undefined && !(REPLY_STATES as readonly unknown[]).includes(a.state))
        return no('ENUM_VALUE_UNKNOWN', `state is one of ${REPLY_STATES.join(', ')}.`, { at: 'state', allowed: REPLY_STATES });
      if (a.how !== undefined && !(SEEN_HOW as readonly unknown[]).includes(a.how))
        return no('ENUM_VALUE_UNKNOWN', `how is one of ${SEEN_HOW.join(', ')}.`, { at: 'how', allowed: SEEN_HOW });
      if (a.seen !== undefined && (!Array.isArray(a.seen) || a.seen.length > SEEN_MOST || a.seen.some((s) => typeof s !== 'string')))
        return no('VALUE_MALFORMED', `seen is a list of at most ${String(SEEN_MOST)} instructions, as ["IN4"].`, { at: 'seen' });
      const how = (a.how as SeenHow | undefined) ?? 'asked';

      const run = runOfCaller(ctx, 'opened: instructions');
      if (!run.ok) return tail(run as Result<never>);
      /* A QUESTION HE TOLD IT TO ANSWER, his words sent with it (`wordAnswer`); else one his order named, as he said. */
      if (typeof a.answer === 'string' && (a.said !== undefined || a.option !== undefined)) return tail(await wordAnswer(run.value, a.answer.trim(), a.option, a.said, ctx));
      if (typeof a.answer === 'string') return tail(await orderAnswer(run.value, a.answer.trim(), ctx));
      if (typeof a.take === 'string') {
        /* ONLY ONE IT IS HANDED (`toldTo`): an agent that may not read his instructions guessed `IN4` and took it whole. The
           sentence is the kernel's for an instruction that is not this run's to take. */
        const asked = a.take.trim();
        if (readable(ctx, INSTRUCTIONS) !== null && !pendingFor(run.value, ctx).some((i) => i.id === asked))
          return tail(no('ROW_UNKNOWN', `There is no open instruction called ${asked} for this run.`, { at: 'take' }));
        const taken = kernel.takeInstruction(asked, run.value);
        if (!taken.ok) return tail(taken as Result<never>);
        return tail(ok(mineOf(run.value, ctx, { instruction: toldOf(sql, taken.value) })));
      }
      if (typeof a.reply === 'string') {
        const answered = kernel.replyInstruction(a.reply.trim(), run.value, {
          said: typeof a.said === 'string' ? a.said : '',
          ...(a.state === undefined ? {} : { state: a.state as (typeof REPLY_STATES)[number] }),
        });
        if (!answered.ok) return tail(answered as Result<never>);
        tellDone(answered.value, run.value);
        return tail(ok(mineOf(run.value, ctx, { instruction: toldOf(sql, answered.value), receipts: receiptsOf(sql, kernel, answered.value, nowIso(), ctx, sight) })));
      }
      /* AND ONLY WHAT IT IS HANDED IS MARKED SEEN BY IT, so a member's agent naming his broadcast never marks it seen. */
      const handed = new Set(pendingFor(run.value, ctx).map((i) => i.id));
      const ids = Array.isArray(a.seen) ? (a.seen as string[]).filter((id) => readable(ctx, INSTRUCTIONS) === null || handed.has(id)) : [...handed];
      markSeen(ids, run.value, how);
      return tail(ok(mineOf(run.value, ctx)));
    },
  };
}

/**
 * THE GUARD'S WORD FOR A CALL ABOUT THE CALLER'S OWN RUN (`guard(ctx, need, OWN_RUN)` in `index.ts`): no list is asked,
 * and a stopped or paused run still reaches it, because answering, handing off and ending are what a stopped run is
 * asked to do (§2.4). A name no list can have, as `BOUND` is.
 */
export const OWN_RUN = 'the run itself';
