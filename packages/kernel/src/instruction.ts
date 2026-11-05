/**
 * What he tells an agent from the app, and how it reaches one (agents and MCP plan §2, §8.1, §8.3; migrations 42, 44).
 *
 * ONE ROW OF `instructions` PER THING HE SAID, `IN4`, written by a person and never by a token: `instruct` refuses a
 * token, so no agent instructs another and text an agent read in a mail never becomes an order to a second one (§10.1).
 * It moves Sent, then Seen (by whom, how and when), then Working once a run takes it, then Done, Needs you or Declined
 * as the run answers; or Expired by the hourly sweep, or Withdrawn by him before it is taken.
 *
 * WHO IT REACHES IS ONE PREDICATE PER ROW OF §2.2, over the run's own fields (`reaches`):
 *
 *   - to a run (`S883`): that run. Its helpers obey a stop or a pause (`stopOf`), but are not told a tell.
 *   - to an agent kind, on a project or a repository: every open run of that kind there (`now`), or a run of that kind
 *     that starts there after he said it (`next`).
 *   - to whoever is next, on a project: the same, any kind.
 *   - to a task: the run whose task in hand it is; while no open run holds it, the next run on the task's project whose
 *     kind matches (`to_agent`, the task's lane, filled in by whoever made the instruction).
 *
 * ON A MACHINE AND AS A PROFILE (migration 44): every one but one sent to a run by name may also say the machine a run
 * must be on (`machine`, as the run's `host` says it) and the Claude Code profile it must run under (`seat`, the run's
 * own), and reaches only the runs that are. Each narrows, as the project does: an instruction to whoever is next, on
 * BrainDog, on the Mac, as studio, is the next run there that is both.
 *
 * TAKEN BY ONE RUN, COMPARE AND SET (`takeInstruction`): the read and the move are one transaction, so of two runs
 * taking one instruction the first wins and the second is told "S884 has it". One sent to a run is taken by that run
 * as it first sees it. A run's reply is the run's, signed by it, and only the run that took it may write one.
 *
 * THE DELIVERY FIELDS AND THE REPLY ARE THE KERNEL'S (`INSTRUCTION_KERNEL_WRITTEN`), so the write path refuses them from
 * every caller; every move here goes through the record's own write (`InstructionWrite`, wired in `index.ts`), so each
 * is a line in the log with its note, as a handoff's close is. Receipts are not stored: they are the run's batches
 * between `taken_at` and `replied_at` in that log.
 *
 * NAMES ARE SPOKEN. A run is `S883`, an instruction `IN4`, as a run's `taken_by` and `parent` are, so `Instr.id` is what
 * an agent passes back and what the app says. Every function here takes an instruction by its spoken name or its row
 * id, and a run likewise.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { isPresent } from './presence.ts';
import { SESSION, SESSION_PREFIX } from './session.ts';

/* ── the vocabulary ──────────────────────────────────────────────────────── */

/** The register's id. */
export const INSTRUCTIONS = 'instructions';

/** What an instruction is called out loud: `IN` for `IN4` (the register's `seq_prefix`, migration 42). */
export const INSTRUCTION_PREFIX = 'IN';

export const INSTRUCTION_KINDS = ['tell', 'stop', 'pause', 'resume', 'redirect'] as const;
export type InstrKind = (typeof INSTRUCTION_KINDS)[number];

export const INSTRUCTION_WHEN = ['now', 'next'] as const;
export type InstrWhen = (typeof INSTRUCTION_WHEN)[number];

export const INSTRUCTION_TO = ['run', 'agent', 'anyone', 'task'] as const;
export type InstrTo = (typeof INSTRUCTION_TO)[number];

export const INSTRUCTION_STATES = ['sent', 'seen', 'working', 'done', 'needs_you', 'declined', 'expired', 'withdrawn'] as const;
export type InstrState = (typeof INSTRUCTION_STATES)[number];

/** How a run was shown an instruction: at its start, on a prompt, in a tool answer, by channel, by job, or when it asked. */
export const SEEN_HOW = ['start', 'prompt', 'tool', 'channel', 'job', 'asked'] as const;
export type SeenHow = (typeof SEEN_HOW)[number];

/** The states an instruction still waits for a run in: not yet taken, or taken and not yet answered. */
export const OPEN_STATES: readonly InstrState[] = ['sent', 'seen', 'working'];

/** The states a run answers with (`replyInstruction`). `needs_you` counts in Needs you and on Today. */
export const REPLY_STATES = ['done', 'needs_you', 'declined'] as const;
export type ReplyState = (typeof REPLY_STATES)[number];

/**
 * The fields only the kernel writes: how it was delivered, and the run's answer, which reaches the row only through
 * `replyInstruction`. A caller's patch naming one is refused `IMMUTABLE_FIELD`; `state` is among them, so a person
 * moves an instruction only by withdrawing it.
 */
export const INSTRUCTION_KERNEL_WRITTEN: readonly string[] = [
  'state',
  'seen_by',
  'seen_how',
  'seen_at',
  'taken_by',
  'taken_at',
  'reply',
  'replied_at',
  'job',
];

const DAY_MS = 86_400_000;

/** How long an instruction waits for a run to take it: "next start" waits 14 days (a setting). */
export const WAIT_MS = 14 * DAY_MS;

/** The longest an instruction may be, in characters: one a person reads at a glance and an agent holds whole. */
export const SAID_MOST = 2_000;

/** The note on an instruction the sweep closes. */
export const EXPIRED_NOTE = 'No run took this in time.';

/* ── the shapes wave 2 builds on (§8.3) ──────────────────────────────────── */

/**
 * One instruction as every reader here answers it.
 *
 * `id` IS ITS SPOKEN NAME, `IN4`, which an agent passes back to `instructions` and which the app says; `row` is the
 * entry's own id. Runs are spoken too (`S883`). Every text field the row does not hold is `null`.
 */
export type Instr = {
  id: string;
  row: string;
  said: string;
  kind: InstrKind;
  when: InstrWhen;
  to: InstrTo;
  to_run: string | null;
  to_agent: string | null;
  project: string | null;
  task: string | null;
  repo: string | null;
  /** The machine a run must be on to be told it, as the run's `host` says it (migration 44). */
  machine: string | null;
  /** The Claude Code profile a run must be under to be told it, as the run's `seat` says it (migration 44). */
  seat: string | null;
  /** The instruction a redirect replaced, spoken. */
  replaces: string | null;
  expires_at: string | null;
  state: InstrState;
  seen_by: string | null;
  seen_how: SeenHow | null;
  seen_at: string | null;
  taken_by: string | null;
  taken_at: string | null;
  reply: string | null;
  replied_at: string | null;
  /**
   * The job that carries it to Claude on his machine (`sendTo` in the record), `j_…`: such an instruction reaches the
   * run that job's own bearer opened, and no other (`reaches`).
   */
  job: string | null;
  /** The rows he sent with it, as spoken refs (`tasks#12`), for the run to read through the record. Empty for most. */
  attach: string[];
  /** Whether he let the run change files for it: `true`, `false`, or `null` when he said neither (an older send). */
  may_change: boolean | null;
  /**
   * The questions he named for the run that takes it to answer, each with the answer he gave (`InstrAnswer`), and the
   * ones it already answered (`answered`, by question). Empty for nearly every instruction.
   */
  answers: InstrAnswer[];
  answered: string[];
  /** Who made it: the actor of its `create` line, a person's id. */
  by: string | null;
  /** When he said it. */
  at: string;
  updated_at: string;
};

/**
 * One question an instruction lets the run that takes it answer: the question as the kernel keys it (`SG243`), the
 * answer he gave, and the question's version as he saw it when he sent it, so a question that moved since is not
 * answered with his word on the old one.
 */
export type InstrAnswer = { question: string; option: string; version: string };

/** The most questions one instruction may name. */
export const ANSWERS_MOST = 10;

/** The line on an instruction that names its questions (`field`), and the line on it that spends one. */
export const ANSWERS_FIELD = 'answers';
export const ANSWERED_FIELD = 'answered';
/** When he closed a finished one, which takes it off his list. */
export const CLOSED_FIELD = 'closed_at';

/** The lines on an instruction that name the rows sent with it, and whether it may change files (`sendTo`). */
export const ATTACH_FIELD = 'attach';
export const MAY_CHANGE_FIELD = 'may_change';

/** The most rows one instruction may carry, and the longest ref of one. */
export const ATTACH_MOST = 20;
export const ATTACH_REF_MOST = 120;

/** A job's id, as `createJob` mints it. */
const JOB_REF = /^j_[0-9A-Z]{26}$/u;

/** The line on a decision made on his order (`field`), the instruction in `to_v`. */
export const ORDERED_FIELD = 'answered_on';

/** The line on a decision a run made on his word, said to it in the conversation (`field`), the run in `to_v`. */
export const ON_WORD_FIELD = 'answered_on_word';

/** What stops a run: a stop or a pause he sent it (or its parent), by instruction. `null` from `stopOf` when none. */
export type Stop = { kind: 'stop' | 'pause'; id: string; said: string };

/**
 * What `changedSince` answers: the run's stamp now, whether it moved from the one given, the open instructions for the
 * run that are new or changed since that stamp (every open one when the stamp is not one this kernel made), and what
 * stops it. `pending` is empty when nothing changed.
 */
export type Delta = { stamp: string; changed: boolean; pending: Instr[]; stop: Stop | null };

/**
 * What a run says of where it is, for a run whose row does not say it yet: its kind, repository, project, task in
 * hand, machine and profile. The run's own fields win where it has them, so a caller cannot move a run into another
 * place by saying so.
 */
export type RunHints = {
  agent?: string | undefined;
  repo?: string | undefined;
  project?: string | undefined;
  task?: string | undefined;
  host?: string | undefined;
  seat?: string | undefined;
};

/** What `instruct` is given: what he said, and to whom. `to_run`, `replaces` and `task` take a spoken name or an id. */
export type InstructInput = {
  said: string;
  kind?: InstrKind | undefined;
  when?: InstrWhen | undefined;
  to?: InstrTo | undefined;
  to_run?: string | undefined;
  to_agent?: string | undefined;
  project?: string | undefined;
  task?: string | undefined;
  repo?: string | undefined;
  /** The machine a run must be on, as runs name it (`host`). */
  machine?: string | undefined;
  /** The profile a run must be under, as runs name it (`seat`): `studio`, `default`. */
  seat?: string | undefined;
  replaces?: string | undefined;
  /** How long it waits for a run, in milliseconds; `WAIT_MS` when absent. */
  waits_ms?: number | undefined;
  /** The questions the run that takes it may answer, each with his answer. Only on a tell. */
  answers?: InstrAnswer[] | undefined;
  /** The job that carries it to Claude on his machine (`j_…`), which must be on the record. Only on a tell. */
  job?: string | undefined;
  /** The rows he sends with it, as spoken refs (`tasks#12`). Only on a tell. */
  attach?: string[] | undefined;
  /** Whether the run may change files for it. Only on a tell. */
  may_change?: boolean | undefined;
};

/* ── the writes, wired by the record ─────────────────────────────────────── */

/**
 * One write of an instruction, for the caller to send through the write path: the told fields that change (`patch`,
 * with `state` when it moves), the kernel's own fields (`stamp`), the line's note and who signs it. `id` null makes one.
 */
export type InstructionChange = { patch: Record<string, Json>; stamp: Record<string, Json>; note: string | null; actor: string };
export type InstructionWrite = (id: string | null, change: InstructionChange) => Result<{ id: string }>;

/** One write of a run's own kernel fields (`stopped`, `instruction`), in place of a patch nobody may send. */
export type RunStampWrite = (id: string, stamp: Record<string, Json>, actor: string, note: string | null) => Result<unknown>;

/** What the functions below read and write through. `now` is the record's clock, in milliseconds. */
export type InstructionDeps = { sql: Sql; now: number; write: InstructionWrite; runWrite: RunStampWrite; mint: () => string };

/* ── reading ─────────────────────────────────────────────────────────────── */

const iso = (ms: number): string => new Date(ms).toISOString();
const text = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const ofList = <T extends string>(list: readonly T[], v: Json | undefined, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

type Row = {
  id: string;
  seq: number | null;
  state: string | null;
  fields: string;
  created_at: string;
  updated_at: string;
  by: string | null;
  answers?: string | null;
  answered?: string | null;
  attach?: string | null;
  may_change?: string | null;
};

/** A line's JSON, or `null` when it is not what it should be. */
const parsed = (v: string | null | undefined): unknown => {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return null;
  }
};

/** The questions an instruction names, as its line holds them; anything not of the shape is passed over. */
function answersIn(v: string | null | undefined): InstrAnswer[] {
  const list = parsed(v);
  if (!Array.isArray(list)) return [];
  return list.flatMap((a): InstrAnswer[] => {
    const o = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
    return typeof o.question === 'string' && typeof o.option === 'string' && typeof o.version === 'string'
      ? [{ question: o.question, option: o.option, version: o.version }]
      : [];
  });
}

/* THE QUESTIONS IT NAMES AND THE ONES SPENT ARE LINES ON THE ROW, `note`s with their own `field`, so they need no
   migration and no caller's patch can write them. */
const COLUMNS = `e.id, e.seq, e.state, e.fields, e.created_at, e.updated_at,
  (SELECT actor FROM event WHERE target = 'entry:' || e.id AND kind = 'create' ORDER BY ts LIMIT 1) AS by,
  (SELECT to_v FROM event WHERE target = 'entry:' || e.id AND kind = 'note' AND field = '${ANSWERS_FIELD}' ORDER BY rowid DESC LIMIT 1) AS answers,
  (SELECT json_group_array(to_v) FROM event WHERE target = 'entry:' || e.id AND kind = 'note' AND field = '${ANSWERED_FIELD}') AS answered,
  (SELECT to_v FROM event WHERE target = 'entry:' || e.id AND kind = 'note' AND field = '${ATTACH_FIELD}' ORDER BY rowid DESC LIMIT 1) AS attach,
  (SELECT to_v FROM event WHERE target = 'entry:' || e.id AND kind = 'note' AND field = '${MAY_CHANGE_FIELD}' ORDER BY rowid DESC LIMIT 1) AS may_change`;

function instrOf(row: Row): Instr {
  const f = JSON.parse(row.fields) as Record<string, Json>;
  return {
    id: `${INSTRUCTION_PREFIX}${String(row.seq ?? '')}`,
    row: row.id,
    said: typeof f.said === 'string' ? f.said : '',
    kind: ofList(INSTRUCTION_KINDS, f.kind, 'tell'),
    when: ofList(INSTRUCTION_WHEN, f.when, 'next'),
    to: ofList(INSTRUCTION_TO, f.to, 'anyone'),
    to_run: text(f.to_run),
    to_agent: text(f.to_agent),
    project: text(f.project),
    task: text(f.task),
    repo: text(f.repo),
    machine: text(f.machine),
    seat: text(f.seat),
    replaces: text(f.replaces),
    expires_at: text(f.expires_at),
    state: ofList(INSTRUCTION_STATES, row.state ?? f.state, 'sent'),
    seen_by: text(f.seen_by),
    seen_how: typeof f.seen_how === 'string' && (SEEN_HOW as readonly string[]).includes(f.seen_how) ? (f.seen_how as SeenHow) : null,
    seen_at: text(f.seen_at),
    taken_by: text(f.taken_by),
    taken_at: text(f.taken_at),
    reply: text(f.reply),
    replied_at: text(f.replied_at),
    job: text(f.job),
    attach: ((v) => (Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string').slice(0, ATTACH_MOST) : []))(parsed(row.attach)),
    may_change: ((v) => (typeof v === 'boolean' ? v : null))(parsed(row.may_change)),
    answers: answersIn(row.answers),
    answered: ((v) => (Array.isArray(v) ? v.filter((q): q is string => typeof q === 'string') : []))(parsed(row.answered)),
    by: row.by,
    at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** One instruction by its spoken name (`IN4`) or its row id, live, or null. */
export function instructionOf(sql: Sql, ref: string): Instr | null {
  const said = ref.trim();
  const bySeq = said.startsWith(INSTRUCTION_PREFIX) && /^[1-9][0-9]*$/u.test(said.slice(INSTRUCTION_PREFIX.length));
  const row = sql.one<Row>(
    `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.${bySeq ? 'seq' : 'id'} = ?`,
    INSTRUCTIONS,
    bySeq ? Number(said.slice(INSTRUCTION_PREFIX.length)) : said,
  );
  return row ? instrOf(row) : null;
}

/** Every open instruction, oldest first: few on any record, read through `entry_state`. */
export function openInstructions(sql: Sql): Instr[] {
  return sql
    .all<Row>(
      `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.state IN ('sent', 'seen', 'working') ORDER BY e.seq`,
      INSTRUCTIONS,
    )
    .map(instrOf);
}

/**
 * Every instruction one run took, by its spoken name (`S883`), oldest first, answered or not: the windows its receipts
 * are cut by, since a run holding two at once did each one's work in turn.
 */
export function instructionsTakenBy(sql: Sql, run: string): Instr[] {
  return sql
    .all<Row>(
      `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND json_extract(e.fields, '$.taken_by') = ? ORDER BY e.seq`,
      INSTRUCTIONS,
      run,
    )
    .map(instrOf);
}

/** A run as the predicates read it. */
export type RunOf = { id: string; spoken: string; seq: number; state: string | null; fields: Record<string, Json>; created_at: string };

/** A run by its spoken name (`S883`) or its row id, live or finished, or null. */
export function runOf(sql: Sql, ref: string): RunOf | null {
  const said = ref.trim();
  const bySeq = said.startsWith(SESSION_PREFIX) && /^[1-9][0-9]*$/u.test(said.slice(SESSION_PREFIX.length));
  const row = sql.one<{ id: string; seq: number; state: string | null; fields: string; created_at: string }>(
    `SELECT id, seq, state, fields, created_at FROM entry WHERE register = ? AND deleted_at IS NULL AND ${bySeq ? 'seq' : 'id'} = ?`,
    SESSION,
    bySeq ? Number(said.slice(SESSION_PREFIX.length)) : said,
  );
  if (!row) return null;
  return { ...row, spoken: `${SESSION_PREFIX}${String(row.seq)}`, fields: JSON.parse(row.fields) as Record<string, Json> };
}

const OPEN_RUN = ['active', 'idle'];

/**
 * The job whose bearer opened a run, `j_…`, or `null` for a run no job opened. Read off the token that opened it
 * (`token_id`, stamped as the run opens and never written after), whose label a claim set to `job:<id>`, so nothing a
 * caller says makes a run a job's.
 */
export function jobOfRun(sql: Sql, run: RunOf): string | null {
  const token = text(run.fields.token_id);
  if (token === null) return null;
  const label = sql.one<{ label: string | null }>('SELECT label FROM token WHERE id = ?', token)?.label ?? '';
  const job = label.startsWith('job:') ? label.slice('job:'.length) : '';
  return JOB_REF.test(job) ? job : null;
}

/** The place a run stands in and who it is, its own fields first and the hints for what they lack. */
function placeOf(run: RunOf, hints: RunHints = {}, job: string | null = null) {
  const f = run.fields;
  const pick = (own: Json | undefined, said: string | undefined): string | null => text(own) ?? (typeof said === 'string' && said.trim() !== '' ? said : null);
  return {
    agent: pick(f.agent, hints.agent),
    repo: pick(f.repo, hints.repo),
    project: pick(f.project, hints.project),
    task: pick(f.task, hints.task),
    host: pick(f.host, hints.host),
    seat: pick(f.seat, hints.seat),
    parent: text(f.parent),
    job,
    started: Date.parse(text(f.started) ?? run.created_at),
    called: Date.parse(text(f.last_seen) ?? ''),
  };
}

/** Whether a run stands where the instruction was aimed: its project; with none, its repository; with neither, anywhere. */
function inPlace(i: Instr, at: ReturnType<typeof placeOf>): boolean {
  if (i.project && i.repo) return at.project === i.project || (at.project === null && at.repo === i.repo);
  if (i.project) return at.project === i.project;
  if (i.repo) return at.repo === i.repo;
  return true;
}

/** Whether a run is on the machine and under the profile the instruction names, each where it names one. */
const onSeat = (i: Instr, at: ReturnType<typeof placeOf>): boolean =>
  (i.machine === null || at.host === i.machine) && (i.seat === null || at.seat === i.seat);

/**
 * Whether `i` reaches `run` now (§2.2), its taker aside. `holder` is the open run holding the instruction's task, when
 * one does.
 */
function reaches(i: Instr, run: RunOf, at: ReturnType<typeof placeOf>, nowMs: number, holder: string | null): boolean {
  if (!OPEN_RUN.includes(run.state ?? '')) return false;
  if (i.expires_at !== null && Date.parse(i.expires_at) < nowMs) return false;
  /* ONE SENT BY JOB REACHES THAT JOB'S RUN AND NO OTHER, and a job's run is told only what was sent to it by its job or
     to it by name: it was started for one request, and a word for whoever is next is not that request. */
  if (i.job !== null) return at.job === i.job;
  if (i.to === 'run') return i.to_run === run.spoken;
  if (at.job !== null) return false;
  /* A HELPER IS NEVER TOLD A TELL: it works for its parent, which is told. It obeys its parent's stop (`stopOf`). */
  if (at.parent !== null) return false;
  /* ON THAT MACHINE AND AS THAT PROFILE, WHERE IT SAYS ONE, whatever else it is aimed at: a run elsewhere is not told,
     even one holding its task, which then waits for that run to end or for one that is there. */
  if (!onSeat(i, at)) return false;
  /* "NEXT START" IS A RUN THAT STARTED AFTER HE SAID IT, OR ONE ALREADY OPEN ONCE IT CALLS AGAIN: its own call moves
     `last_seen` (the bridge's pulse moves `pulse_at`, which is not one), so a live run is told at its next call and not
     pushed mid-work. "NOW" IS ANY OPEN RUN THERE. */
  const said = Date.parse(i.at);
  const timely = i.when === 'now' || (Number.isFinite(at.started) && at.started >= said) || (Number.isFinite(at.called) && at.called >= said);
  if (i.to === 'task') {
    if (i.task !== null && at.task === i.task) return true;
    if (holder !== null) return false;
  }
  if ((i.to === 'agent' || i.to === 'task') && i.to_agent !== null && at.agent !== i.to_agent) return false;
  return timely && inPlace(i, at);
}

/** The open runs holding a task in hand, by task. */
function holders(sql: Sql, tasks: readonly string[]): Map<string, string> {
  if (tasks.length === 0) return new Map();
  return new Map(
    sql
      .all<{ task: string; seq: number }>(
        `SELECT json_extract(fields, '$.task') AS task, seq FROM entry
         WHERE register = ? AND deleted_at IS NULL AND state IN ('active', 'idle')
           AND json_extract(fields, '$.task') IN (SELECT value FROM json_each(?))`,
        SESSION,
        JSON.stringify([...new Set(tasks)]),
      )
      .map((r) => [r.task, `${SESSION_PREFIX}${String(r.seq)}`]),
  );
}

/**
 * The open instructions for one run (`instructionFor` in §8.3): every one that reaches it and that no other run has
 * taken, and every one it took and has not answered. A stop or pause first, then oldest first. `hints` fill what the
 * run's row does not say of where it is.
 */
export function instructionFor(sql: Sql, hints: RunHints, runRef: string, nowMs: number): Instr[] {
  const run = runOf(sql, runRef);
  if (!run) return [];
  const at = placeOf(run, hints, jobOfRun(sql, run));
  const open = openInstructions(sql);
  const held = holders(sql, open.filter((i) => i.to === 'task' && i.task !== null).map((i) => i.task!));
  const mine = open.filter((i) => {
    if (i.taken_by !== null) return i.taken_by === run.spoken;
    const holder = i.task === null ? null : (held.get(i.task) ?? null);
    return reaches(i, run, at, nowMs, holder === run.spoken ? null : holder);
  });
  const first = (i: Instr): number => (i.kind === 'stop' || i.kind === 'pause' ? 0 : 1);
  return mine.sort((a, b) => first(a) - first(b) || Number(a.id.slice(INSTRUCTION_PREFIX.length)) - Number(b.id.slice(INSTRUCTION_PREFIX.length)));
}

/* ── stop, and the run's stamp ───────────────────────────────────────────── */

/**
 * What stops a run (`stopOf` in §8.3): a stop or a pause he sent it, or sent the run it works for, which a helper obeys
 * too. `null` while nothing does. Read off the run's `stopped`, which `instruct` writes and a resume clears; the
 * instruction is the newest stop or pause sent to that run that he has not withdrawn.
 */
export function stopOf(sql: Sql, runRef: string): Stop | null {
  const run = runOf(sql, runRef);
  if (!run) return null;
  const parent = text(run.fields.parent);
  const holder = run.fields.stopped === 'stop' || run.fields.stopped === 'pause' ? run : parent !== null ? runOf(sql, parent) : null;
  const kind = holder?.fields.stopped;
  if (!holder || (kind !== 'stop' && kind !== 'pause')) return null;
  /* THE NEWEST STOP OR PAUSE SINCE THE NEWEST RESUME, of the kind the run holds: one a resume lifted is history. */
  const row = sql.one<Row>(
    `SELECT ${COLUMNS} FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.state <> 'withdrawn'
       AND json_extract(e.fields, '$.to_run') = ? AND json_extract(e.fields, '$.kind') = ?
       AND e.seq > coalesce((SELECT max(r.seq) FROM entry r WHERE r.register = e.register AND r.deleted_at IS NULL
         AND json_extract(r.fields, '$.to_run') = ? AND json_extract(r.fields, '$.kind') = 'resume'), 0)
     ORDER BY e.seq DESC LIMIT 1`,
    INSTRUCTIONS,
    holder.spoken,
    kind,
    holder.spoken,
  );
  const i = row ? instrOf(row) : null;
  return { kind, id: i?.id ?? '', said: i?.said ?? '' };
}

/** FNV-1a over a string, as eight hex digits: a stamp has to change when its input does, and nothing more. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The stamp's two parts: the newest change among the run's instructions, and a hash of what they are. */
const STAMP = /^([0-9a-z]+)\.([0-9a-f]{8})$/u;

function stampOver(pending: readonly Instr[], stop: Stop | null): string {
  const newest = Math.max(0, ...pending.map((i) => Date.parse(i.updated_at)).filter(Number.isFinite));
  const what = JSON.stringify([pending.map((i) => [i.id, i.state, i.updated_at]), stop]);
  return `${newest.toString(36)}.${fnv(what)}`;
}

/**
 * The run's version stamp (`stampFor` in §8.3): an opaque string that moves whenever an instruction for the run is
 * made, seen, taken, answered, withdrawn or expires, or the run is stopped, paused or resumed. Every tool answer and
 * every pulse carries it, so an agent that holds the same stamp has nothing new to read.
 */
export function stampFor(sql: Sql, runRef: string, nowMs: number): string {
  return stampOver(instructionFor(sql, {}, runRef, nowMs), stopOf(sql, runRef));
}

/**
 * What moved for a run since `stamp` (`changedSince` in §8.3): `changed: false` and nothing pending while the stamp is
 * the same; otherwise the open instructions changed after the moment the old stamp carries, or all of them when it
 * carries none this kernel made.
 */
export function changedSince(sql: Sql, runRef: string, stamp: string, nowMs: number): Delta {
  const pending = instructionFor(sql, {}, runRef, nowMs);
  const stop = stopOf(sql, runRef);
  const now = stampOver(pending, stop);
  if (now === stamp) return { stamp: now, changed: false, pending: [], stop };
  const was = STAMP.exec(stamp);
  const since = was ? parseInt(was[1]!, 36) : NaN;
  return { stamp: now, changed: true, pending: Number.isFinite(since) ? pending.filter((i) => Date.parse(i.updated_at) > since) : pending, stop };
}

/* ── making one ──────────────────────────────────────────────────────────── */

const KIND_TO_RUN: readonly InstrKind[] = ['stop', 'pause', 'resume', 'redirect'];

/** A machine as runs name it, the `host` hint's grammar: `Adas-MacBook-Pro.local`. */
export const MACHINE_NAME = /^[A-Za-z0-9._-]{1,128}$/u;
/** A profile as runs name it, the `seat` hint's grammar: a short name, never a path and never `..`. */
export const SEAT_NAME = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

/**
 * Make one instruction, `actor` being the person who said it (`instruct`, the kernel's half of the record method). The
 * caller has already refused a token (§10.1); this checks the shape and writes:
 *
 *   - a stop, pause, resume or redirect goes to one run, by name (`to: run`), and is `now`;
 *   - a redirect names the instruction it replaces, which ends Declined, and goes to the run that had it;
 *   - a stop or pause marks the run `stopped` at once, so the record refuses its next write; a resume clears it and
 *     closes the stop or pause it lifts (Done once taken, Withdrawn before);
 *   - one to anyone but a named run may say the machine and the profile a run must be on (`machine`, `seat`); one to a
 *     run keeps neither, since the run is already one machine and one profile;
 *   - it waits `WAIT_MS` (or `waits_ms`) for a run before the sweep expires it.
 */
export function instruct(d: InstructionDeps, actor: string, input: InstructInput): Result<Instr> {
  const said = typeof input?.said === 'string' ? input.said.trim() : '';
  if (said === '') return no('REQUIRED_MISSING', 'Say what the agent should do.', { at: 'said' });
  if ([...said].length > SAID_MOST)
    return no('OUT_OF_BOUNDS', `An instruction is at most ${String(SAID_MOST)} characters; say it shorter, or put the detail in a task.`, { at: 'said' });
  const kind = input.kind ?? 'tell';
  if (!(INSTRUCTION_KINDS as readonly string[]).includes(kind))
    return no('ENUM_VALUE_UNKNOWN', `kind is one of ${INSTRUCTION_KINDS.join(', ')}.`, { at: 'kind', allowed: INSTRUCTION_KINDS });
  let to: InstrTo = input.to ?? (input.to_run ? 'run' : input.task ? 'task' : input.to_agent ? 'agent' : 'anyone');
  if (!(INSTRUCTION_TO as readonly string[]).includes(to))
    return no('ENUM_VALUE_UNKNOWN', `to is one of ${INSTRUCTION_TO.join(', ')}.`, { at: 'to', allowed: INSTRUCTION_TO });
  let when: InstrWhen = input.when ?? (KIND_TO_RUN.includes(kind) ? 'now' : 'next');
  if (!(INSTRUCTION_WHEN as readonly string[]).includes(when))
    return no('ENUM_VALUE_UNKNOWN', `when is one of ${INSTRUCTION_WHEN.join(', ')}.`, { at: 'when', allowed: INSTRUCTION_WHEN });
  const waits = input.waits_ms ?? WAIT_MS;
  if (!Number.isFinite(waits) || waits < 60_000 || waits > 90 * DAY_MS)
    return no('OUT_OF_BOUNDS', 'An instruction waits between a minute and ninety days for a run.', { at: 'waits_ms' });
  /* THE QUESTIONS IT NAMES, each once, on a tell alone: a stop, a pause or a redirect asks nothing of a question. */
  const answers: InstrAnswer[] = [];
  if (input.answers !== undefined) {
    if (!Array.isArray(input.answers) || input.answers.length > ANSWERS_MOST)
      return no('VALUE_MALFORMED', `answers is a list of at most ${String(ANSWERS_MOST)} questions, each with its answer.`, { at: 'answers' });
    if (input.answers.length > 0 && kind !== 'tell') return no('VALUE_MALFORMED', 'Only an instruction to do something names questions to answer.', { at: 'answers' });
    for (const [n, a] of input.answers.entries()) {
      const o = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
      const q = typeof o.question === 'string' ? o.question.trim() : '';
      const option = typeof o.option === 'string' ? o.option.trim() : '';
      if (q === '' || option === '' || typeof o.version !== 'string' || o.version === '')
        return no('VALUE_MALFORMED', 'Each answer names a question and the answer to give it.', { at: `answers[${String(n)}]` });
      if (answers.some((x) => x.question === q)) return no('VALUE_MALFORMED', `${q} is named twice. Give it one answer.`, { at: `answers[${String(n)}]` });
      answers.push({ question: q, option, version: o.version });
    }
  }
  /* WHAT GOES WITH IT, on a tell alone: the rows he sent, whether it may change files, and the job carrying it. */
  const attach: string[] = [];
  if (input.attach !== undefined && input.attach !== null) {
    if (!Array.isArray(input.attach) || input.attach.length > ATTACH_MOST)
      return no('VALUE_MALFORMED', `attach is a list of at most ${String(ATTACH_MOST)} rows, as ["tasks#12"].`, { at: 'attach' });
    for (const [n, r] of input.attach.entries()) {
      const ref = typeof r === 'string' ? r.trim() : '';
      if (ref === '' || ref.length > ATTACH_REF_MOST || /[\p{Cc}]/u.test(ref))
        return no('VALUE_MALFORMED', 'Each row sent with it is named as BrainDog says it, like tasks#12.', { at: `attach[${String(n)}]` });
      if (!attach.includes(ref)) attach.push(ref);
    }
  }
  if (input.may_change !== undefined && input.may_change !== null && typeof input.may_change !== 'boolean')
    return no('VALUE_MALFORMED', 'may_change is true or false.', { at: 'may_change' });
  const job = typeof input.job === 'string' && input.job.trim() !== '' ? input.job.trim() : null;
  if (input.job !== undefined && input.job !== null && (job === null || !JOB_REF.test(job)))
    return no('VALUE_MALFORMED', 'job is a job as BrainDog names it, j_ and twenty-six letters and digits.', { at: 'job' });
  if ((job !== null || attach.length > 0 || typeof input.may_change === 'boolean') && kind !== 'tell')
    return no('VALUE_MALFORMED', 'Only an instruction to do something carries rows, a job or leave to change files.', { at: job !== null ? 'job' : attach.length > 0 ? 'attach' : 'may_change' });
  if (job !== null && d.sql.one('SELECT 1 AS y FROM job WHERE id = ?', job) === undefined)
    return no('ROW_UNKNOWN', 'There is no such job here.', { at: 'job' });

  const place: { machine?: string; seat?: string } = {};
  for (const [key, grammar, fix] of [
    ['machine', MACHINE_NAME, 'Name the machine as its runs name it, like Adas-MacBook-Pro.local.'],
    ['seat', SEAT_NAME, 'Name the profile as its runs name it, like studio or default: a name, never a folder.'],
  ] as const) {
    const v: unknown = input[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
    if (typeof v !== 'string' || !grammar.test(v.trim())) return no('VALUE_MALFORMED', fix, { at: key });
    place[key] = v.trim();
  }

  return d.sql.transactionSync((): Result<Instr> => {
    let replaced: Instr | null = null;
    let runName: string | null = null;
    if (kind === 'redirect') {
      const ref = typeof input.replaces === 'string' ? input.replaces.trim() : '';
      if (ref === '') return no('REQUIRED_MISSING', 'A redirect names the instruction it replaces.', { at: 'replaces' });
      replaced = instructionOf(d.sql, ref);
      if (!replaced) return no('ROW_UNKNOWN', `There is no instruction called ${ref}.`, { at: 'replaces' });
      if (!OPEN_STATES.includes(replaced.state))
        return no('TRANSITION_ILLEGAL', `${replaced.id} is already ${replaced.state.replace('_', ' ')}; tell the run something new instead.`, { at: 'replaces' });
      runName = replaced.taken_by ?? replaced.to_run;
      if (runName === null && !input.to_run)
        return no('REQUIRED_MISSING', `${replaced.id} is with no run yet; withdraw it and say the new thing instead.`, { at: 'replaces' });
    }
    if (KIND_TO_RUN.includes(kind)) {
      to = 'run';
      when = 'now';
    }
    const asked = typeof input.to_run === 'string' && input.to_run.trim() !== '' ? input.to_run : runName;
    let run: RunOf | null = null;
    if (to === 'run') {
      if (asked === null) return no('REQUIRED_MISSING', 'Say which run this is for, by its name (S883).', { at: 'to_run' });
      run = runOf(d.sql, asked);
      if (!run) return no('ROW_UNKNOWN', `There is no run called ${asked}.`, { at: 'to_run' });
      if (!OPEN_RUN.includes(run.state ?? '') && kind !== 'tell')
        return no('TRANSITION_ILLEGAL', `${run.spoken} has ended, so there is nothing to ${kind}.`, { at: 'to_run' });
      if (kind === 'resume' && run.fields.stopped !== 'stop' && run.fields.stopped !== 'pause')
        return no('TRANSITION_ILLEGAL', `${run.spoken} is not paused or stopped.`, { at: 'to_run' });
    }
    const agent = typeof input.to_agent === 'string' && input.to_agent.trim() !== '' ? input.to_agent.trim() : null;
    if (to === 'agent' && agent === null) return no('REQUIRED_MISSING', 'Say which kind of agent this is for (claude, codex…).', { at: 'to_agent' });
    const task = typeof input.task === 'string' && input.task.trim() !== '' ? input.task.trim() : null;
    if (to === 'task' && task === null) return no('REQUIRED_MISSING', 'Say which task this is for.', { at: 'task' });

    const patch: Record<string, Json> = { said, kind, when, to, expires_at: iso(d.now + waits) };
    if (run) patch.to_run = run.spoken;
    /* ONE TO A RUN SAYS THE RUN'S OWN KIND, so his thread names its agent without reading the run. Who it reaches is
       still the run alone (`reaches`), and the kind is the run's, never one he typed. */
    if (to === 'run') {
      if (run && text(run.fields.agent)) patch.to_agent = run.fields.agent!;
    } else if (agent !== null) patch.to_agent = agent;
    for (const key of ['project', 'repo'] as const) {
      const v = input[key];
      if (typeof v === 'string' && v.trim() !== '') patch[key] = v.trim();
    }
    if (run && patch.project === undefined && text(run.fields.project)) patch.project = run.fields.project!;
    /* ONE TO A NAMED RUN IS ALREADY ON ONE MACHINE, UNDER ONE PROFILE, so it keeps neither. */
    if (to !== 'run') Object.assign(patch, place);
    if (task !== null) patch.task = task;
    if (replaced) patch.replaces = replaced.id;
    /* THE JOB IS THE KERNEL'S FIELD, written here through the door only this file opens, so no caller's patch names one. */
    if (job !== null) patch.job = job;

    const made = d.write(null, { patch, stamp: {}, note: null, actor });
    if (!made.ok) return made;
    const i = instructionOf(d.sql, made.value.id)!;
    /* WHAT IT LETS THE RUN ANSWER, one line on the row in his name, beside the line that made it. */
    if (answers.length > 0)
      d.sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note) VALUES (?, ?, ?, 'note', ?, 'entry', ?, ?, ?)",
        d.mint(),
        iso(d.now),
        actor,
        `entry:${i.row}`,
        ANSWERS_FIELD,
        JSON.stringify(answers),
        `Lets the run that takes it answer ${answers.map((a) => a.question).join(', ')}.`,
      );

    /* WHAT GOES WITH IT, two lines on the row in his name, as the questions it names are: no migration, no patch. */
    const line = "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note) VALUES (?, ?, ?, 'note', ?, 'entry', ?, ?, ?)";
    if (attach.length > 0)
      d.sql.exec(line, d.mint(), iso(d.now), actor, `entry:${i.row}`, ATTACH_FIELD, JSON.stringify(attach), `Sent with ${attach.join(', ')}.`);
    if (typeof input.may_change === 'boolean')
      d.sql.exec(
        line,
        d.mint(),
        iso(d.now),
        actor,
        `entry:${i.row}`,
        MAY_CHANGE_FIELD,
        JSON.stringify(input.may_change),
        input.may_change ? 'May change files for it.' : 'Changes no file for it.',
      );

    if (replaced) {
      const closed = d.write(replaced.row, { patch: { state: 'declined' }, stamp: {}, note: `Redirected: ${i.id}.`, actor });
      if (!closed.ok) return closed;
    }
    if (run && (kind === 'stop' || kind === 'pause')) {
      const marked = d.runWrite(run.id, { stopped: kind }, actor, `${kind === 'stop' ? 'Stopped' : 'Paused'} by ${i.id}.`);
      if (!marked.ok) return marked as Result<never>;
    }
    if (run && kind === 'resume') {
      const lifted = d.runWrite(run.id, { stopped: null }, actor, `Resumed by ${i.id}.`);
      if (!lifted.ok) return lifted as Result<never>;
      for (const held of openInstructions(d.sql))
        if (held.to_run === run.spoken && (held.kind === 'stop' || held.kind === 'pause')) {
          const to = held.state === 'working' ? 'done' : 'withdrawn';
          const closed = d.write(held.row, { patch: { state: to }, stamp: {}, note: `Lifted by ${i.id}.`, actor });
          if (!closed.ok) return closed;
        }
    }
    return ok(instructionOf(d.sql, i.row)!);
  });
}

/**
 * He takes back an instruction no run has taken: it ends Withdrawn. One a run took is refused with what to do instead;
 * a stop or pause withdrawn before it was taken lifts the run's `stopped` with it.
 */
export function withdrawInstruction(d: InstructionDeps, actor: string, ref: string): Result<Instr> {
  return d.sql.transactionSync((): Result<Instr> => {
    const i = instructionOf(d.sql, ref);
    if (!i) return no('ROW_UNKNOWN', `There is no instruction called ${ref.trim()}.`, { at: 'id' });
    if (i.state === 'working' || i.state === 'needs_you')
      return no('TRANSITION_ILLEGAL', `${i.taken_by ?? 'A run'} already took ${i.id}; tell it to stop or redirect it instead.`, { at: 'id' });
    if (i.state !== 'sent' && i.state !== 'seen') return no('TRANSITION_ILLEGAL', `${i.id} is already ${i.state.replace('_', ' ')}.`, { at: 'id' });
    /* WHETHER THIS IS WHAT HOLDS THE RUN, read before it is withdrawn and no longer counts. */
    const holding = (i.kind === 'stop' || i.kind === 'pause') && i.to_run !== null && stopOf(d.sql, i.to_run)?.id === i.id;
    const closed = d.write(i.row, { patch: { state: 'withdrawn' }, stamp: {}, note: null, actor });
    if (!closed.ok) return closed;
    if (holding && i.to_run !== null) {
      const run = runOf(d.sql, i.to_run);
      if (run && run.fields.stopped === i.kind) {
        const lifted = d.runWrite(run.id, { stopped: null }, actor, `${i.id} withdrawn.`);
        if (!lifted.ok) return lifted as Result<never>;
      }
    }
    return ok(instructionOf(d.sql, i.row)!);
  });
}

/**
 * HE CLOSES ONE THAT IS OVER, and it leaves the list of what he told agents. Nothing about it is lost: it stays on the
 * record with its history, and the stamp only says he has finished looking at it. One still in a run's hands, or waiting
 * on him, is not over.
 */
export function closeInstruction(d: InstructionDeps, actor: string, ref: string): Result<Instr> {
  return d.sql.transactionSync((): Result<Instr> => {
    const i = instructionOf(d.sql, ref);
    if (!i) return no('ROW_UNKNOWN', `There is no instruction called ${ref.trim()}.`, { at: 'id' });
    if (OPEN_STATES.includes(i.state) || i.state === 'needs_you') return no('TRANSITION_ILLEGAL', `${i.id} is not finished yet, so it stays open.`, { at: 'id' });
    const closed = d.write(i.row, { patch: {}, stamp: { [CLOSED_FIELD]: new Date(d.now).toISOString() }, note: null, actor });
    if (!closed.ok) return closed;
    return ok(instructionOf(d.sql, i.row)!);
  });
}

/* ── seen, taken, answered ───────────────────────────────────────────────── */

/** Whether `i` is for `run`: it reaches the run now, or the run took it. */
function forRun(sql: Sql, i: Instr, run: RunOf, nowMs: number): boolean {
  if (i.taken_by !== null) return i.taken_by === run.spoken;
  const holder = i.task === null ? null : (holders(sql, [i.task]).get(i.task) ?? null);
  return reaches(i, run, placeOf(run, {}, jobOfRun(sql, run)), nowMs, holder === run.spoken ? null : holder);
}

/** The refusal for an instruction that is not there, and for one that is not the run's: the same words. */
const unknown = (ref: string): Result<never> => no('ROW_UNKNOWN', `There is no instruction called ${ref.trim()} for this run. instructions {} lists yours.`, { at: 'id' });

/** The move that takes `i` for `run`, through the write path, with the run marked as having it in hand. */
function takeFor(d: InstructionDeps, i: Instr, run: RunOf, how: SeenHow): Result<Instr> {
  const now = iso(d.now);
  const stamp: Record<string, Json> = { taken_by: run.spoken, taken_at: now };
  if (i.seen_by === null) Object.assign(stamp, { seen_by: run.spoken, seen_how: how, seen_at: now });
  const taken = d.write(i.row, { patch: { state: 'working' }, stamp, note: `Taken by ${run.spoken}.`, actor: run.spoken });
  if (!taken.ok) return taken;
  d.sql.exec('INSERT OR IGNORE INTO instruction_seen (instruction, run, how, at) VALUES (?, ?, ?, ?)', i.row, run.spoken, how, now);
  /* A RESUME ASKS NOTHING OF THE RUN: taken, it is done, and the run is not left holding it. */
  if (i.kind === 'resume') {
    const done = d.write(i.row, { patch: { state: 'done' }, stamp: {}, note: null, actor: run.spoken });
    if (!done.ok) return done;
    return ok(instructionOf(d.sql, i.row)!);
  }
  const held = d.runWrite(run.id, { instruction: i.id }, run.spoken, null);
  if (!held.ok) return held as Result<never>;
  return ok(instructionOf(d.sql, i.row)!);
}

/**
 * A run was shown `ref` (`seenInstruction` in §8.3): one line in `instruction_seen` per run, the first `how` kept, and
 * the first run to see it is its `seen_by`. One sent to this run by name is taken as it is first seen. Answers the
 * instruction as it now stands.
 */
export function seenInstruction(d: InstructionDeps, ref: string, runRef: string, how: SeenHow): Result<Instr> {
  if (!(SEEN_HOW as readonly string[]).includes(how))
    return no('ENUM_VALUE_UNKNOWN', `how is one of ${SEEN_HOW.join(', ')}.`, { at: 'how', allowed: SEEN_HOW });
  return d.sql.transactionSync((): Result<Instr> => {
    const i = instructionOf(d.sql, ref);
    const run = runOf(d.sql, runRef);
    if (!i || !run || !forRun(d.sql, i, run, d.now)) return unknown(ref);
    const now = iso(d.now);
    d.sql.exec('INSERT OR IGNORE INTO instruction_seen (instruction, run, how, at) VALUES (?, ?, ?, ?)', i.row, run.spoken, how, now);
    if (i.to === 'run' && i.taken_by === null && (i.state === 'sent' || i.state === 'seen')) return takeFor(d, i, run, how);
    if (i.state === 'sent') {
      const seen = d.write(i.row, { patch: { state: 'seen' }, stamp: { seen_by: run.spoken, seen_how: how, seen_at: now }, note: null, actor: run.spoken });
      if (!seen.ok) return seen;
    }
    return ok(instructionOf(d.sql, i.row)!);
  });
}

/**
 * `runRef` takes `ref` (`takeInstruction` in §8.3), compare and set: the first run wins, a second is told who has it,
 * and a run taking one it already holds is answered as it stands. Only an instruction that reaches the run.
 */
export function takeInstruction(d: InstructionDeps, ref: string, runRef: string): Result<Instr> {
  return d.sql.transactionSync((): Result<Instr> => {
    const i = instructionOf(d.sql, ref);
    const run = runOf(d.sql, runRef);
    if (!i || !run) return unknown(ref);
    if (i.taken_by === run.spoken) return ok(i);
    if (i.taken_by !== null) return no('TRANSITION_ILLEGAL', `${i.taken_by} has it, since ${i.taken_at ?? 'earlier'}.`, { at: 'id' });
    if (i.state !== 'sent' && i.state !== 'seen') return no('TRANSITION_ILLEGAL', `${i.id} is ${i.state.replace('_', ' ')}, so there is nothing to take.`, { at: 'id' });
    if (!forRun(d.sql, i, run, d.now)) return unknown(ref);
    return takeFor(d, i, run, 'asked');
  });
}

/**
 * The run that took `ref` answers it (`replyInstruction` in §8.3): its words and Done, Needs you or Declined, signed by
 * the run. A run that has not taken it, and that it reaches, takes it in the same move; a run it is not for is refused.
 * An answer of Needs you may be followed by a second answer once he has replied.
 */
export function replyInstruction(d: InstructionDeps, ref: string, runRef: string, answer: { said: string; state?: ReplyState | undefined }): Result<Instr> {
  const said = typeof answer?.said === 'string' ? answer.said.trim() : '';
  const state = answer?.state ?? 'done';
  if (!(REPLY_STATES as readonly string[]).includes(state))
    return no('ENUM_VALUE_UNKNOWN', `state is one of ${REPLY_STATES.join(', ')}.`, { at: 'state', allowed: REPLY_STATES });
  if (said === '' && state !== 'done') return no('REQUIRED_MISSING', 'Say in a line why, so they can answer it.', { at: 'said' });
  if ([...said].length > SAID_MOST) return no('OUT_OF_BOUNDS', `A reply is at most ${String(SAID_MOST)} characters.`, { at: 'said' });
  return d.sql.transactionSync((): Result<Instr> => {
    let i = instructionOf(d.sql, ref);
    const run = runOf(d.sql, runRef);
    if (!i || !run) return unknown(ref);
    if (i.taken_by !== null && i.taken_by !== run.spoken)
      return no('FORBIDDEN', `${i.taken_by} took ${i.id}, so only it answers.`, { at: 'id' });
    if (i.taken_by === null) {
      if (i.state !== 'sent' && i.state !== 'seen') return no('TRANSITION_ILLEGAL', `${i.id} is ${i.state.replace('_', ' ')}.`, { at: 'id' });
      if (!forRun(d.sql, i, run, d.now)) return unknown(ref);
      const taken = takeFor(d, i, run, 'asked');
      if (!taken.ok) return taken;
      i = taken.value;
    }
    if (i.state !== 'working' && i.state !== 'needs_you') return no('TRANSITION_ILLEGAL', `${i.id} is already ${i.state.replace('_', ' ')}.`, { at: 'id' });
    /* A SECOND "NEEDS YOU" REWRITES THE QUESTION, with no move. */
    const stamp: Record<string, Json> = { replied_at: iso(d.now) };
    if (said !== '') stamp.reply = said;
    const answered = d.write(i.row, { patch: i.state === state ? {} : { state }, stamp, note: null, actor: run.spoken });
    if (!answered.ok) return answered;
    if (state !== 'needs_you' && run.fields.instruction === i.id) {
      /* THE ONE IT HELD BEFORE IS IN HAND AGAIN: answering the newer of two leaves the run working the older. */
      const before = instructionsTakenBy(d.sql, run.spoken)
        .filter((x) => x.row !== i!.row && x.kind !== 'resume' && x.state === 'working')
        .pop();
      const cleared = d.runWrite(run.id, { instruction: before?.id ?? null }, run.spoken, null);
      if (!cleared.ok) return cleared as Result<never>;
    }
    return ok(instructionOf(d.sql, i.row)!);
  });
}

/**
 * A question answered on his order: the answer is spent on the instruction, signed by the run that gave it, and the
 * decision says whose order it was, signed by him, both in the decision's batch. The record has already answered the
 * question as him (`orderAnswer` in `packages/record/src/methods/instructions.ts`); this keeps the two lines that say
 * so, and that make the answer one the run cannot give twice.
 */
export function keepOrderAnswer(
  d: Pick<InstructionDeps, 'sql' | 'now' | 'mint'>,
  k: { instruction: Instr; question: string; run: string; decision: string; by: string; byName: string; batch?: string | undefined },
): void {
  const at = iso(d.now);
  const line = "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, ?)";
  d.sql.exec(line, d.mint(), at, k.run, `entry:${k.instruction.row}`, 'entry', ANSWERED_FIELD, k.question, `${k.run} answered ${k.question} as told.`, k.batch ?? null);
  d.sql.exec(
    line,
    d.mint(),
    at,
    k.by,
    `decision:${k.decision}`,
    'decision',
    ORDERED_FIELD,
    k.instruction.id,
    `Answered by ${k.run} on ${k.byName === 'The owner' ? 'the owner' : k.byName}'s order (${k.instruction.id}).`,
    k.batch ?? null,
  );
}

/**
 * A question a run answered on his word, his own words quoted (`instructionsMine`'s `answer` with `said`): the decision
 * says which run gave it and what he told it, signed by him, in the decision's batch. The record has already answered
 * the question as him; this keeps the line History and Activity say it by.
 */
export function keepWordAnswer(
  d: Pick<InstructionDeps, 'sql' | 'now' | 'mint'>,
  k: { run: string; decision: string; by: string; byName: string; said: string; batch?: string | undefined },
): void {
  d.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, 'note', ?, 'decision', ?, ?, ?, ?)",
    d.mint(),
    iso(d.now),
    k.by,
    `decision:${k.decision}`,
    ON_WORD_FIELD,
    k.run,
    `Answered by ${k.run} on ${k.byName === 'The owner' ? 'the owner' : k.byName}'s word: "${k.said}"`,
    k.batch ?? null,
  );
}

/** The runs shown an instruction, and how: "Seen by S883 and S884" (`instruction_seen`). */
export function seenBy(sql: Sql, ref: string): { run: string; how: SeenHow; at: string }[] {
  const i = instructionOf(sql, ref);
  if (!i) return [];
  return sql.all<{ run: string; how: SeenHow; at: string }>('SELECT run, how, at FROM instruction_seen WHERE instruction = ? ORDER BY at, run', i.row).map((r) => ({ ...r }));
}

/* ── the hourly sweep ────────────────────────────────────────────────────── */

/**
 * The sweep's part (called from the record's hourly sweep, as `expireHandoffs` is): an instruction no run took is
 * closed Expired once it has waited its time; and one sent to a run that ended before it saw it falls back to the next
 * run of that kind on that project, waiting afresh ("S883 ended before it saw this; it goes to the next Claude Code run
 * on BrainDog"). A stop, pause or resume to a run that ended is moot and expires. Signed by `system`. Answers how many
 * moved, `limit` at most.
 */
export function expireInstructions(d: InstructionDeps, limit = 100): number {
  let n = 0;
  for (const i of openInstructions(d.sql)) {
    if (n >= limit) break;
    if (i.taken_by !== null) continue;
    const late = i.expires_at !== null && Date.parse(i.expires_at) < d.now;
    if (i.to === 'run' && i.to_run !== null && i.seen_by === null) {
      const run = runOf(d.sql, i.to_run);
      if (!run || !OPEN_RUN.includes(run.state ?? '')) {
        if (i.kind === 'tell' && !late && run) {
          const patch: Record<string, Json> = { to: 'agent', when: 'next', expires_at: iso(d.now + WAIT_MS) };
          const agent = text(run.fields.agent);
          if (agent) patch.to_agent = agent;
          if (!i.project && text(run.fields.project)) patch.project = run.fields.project!;
          if (!i.project && !text(run.fields.project) && !i.repo && text(run.fields.repo)) patch.repo = run.fields.repo!;
          const moved = d.write(i.row, { patch, stamp: {}, note: `${run.spoken} ended before it saw this; it goes to the next run.`, actor: 'system' });
          if (moved.ok) n++;
          continue;
        }
        if (d.write(i.row, { patch: { state: 'expired' }, stamp: {}, note: run ? `${run.spoken} ended before it saw this.` : EXPIRED_NOTE, actor: 'system' }).ok) n++;
        continue;
      }
    }
    if (late && d.write(i.row, { patch: { state: 'expired' }, stamp: {}, note: EXPIRED_NOTE, actor: 'system' }).ok) n++;
  }
  return n;
}

/* ── a job that carried one ended ────────────────────────────────────────── */

/** What an instruction its job left unanswered ends as, by how the job ended, and the line said when the job said none. */
const JOB_SETTLES: Readonly<Record<string, { state: ReplyState; said: string }>> = {
  ok: { state: 'done', said: 'Finished on the machine, with nothing more to say.' },
  needs_decision: { state: 'needs_you', said: 'It filed a proposal for you to decide.' },
  refused: { state: 'needs_you', said: 'The machine would not run it.' },
  limit: { state: 'needs_you', said: 'It ran out of turns before it finished.' },
  error: { state: 'needs_you', said: 'It failed on the machine.' },
  interrupted: { state: 'needs_you', said: 'It was interrupted on the machine before it finished.' },
  cancelled: { state: 'declined', said: 'Stopped from the app.' },
};

/**
 * A job that carried instructions has ended: each it carried that is still open is answered for it, signed `system`,
 * with what the run said last (the job's `result.text`), else the job's error, else a line for how it ended. Done when
 * it finished, Needs you when it stopped short or filed a proposal, Declined when he stopped it. One the run answered
 * itself is left as it answered. Answers how many moved; a job still waiting or running moves none.
 */
export function settleJobInstructions(d: InstructionDeps, job: string): number {
  const row = d.sql.one<{ status: string; result: string | null; error: string | null }>('SELECT status, result, error FROM job WHERE id = ?', job);
  const settle = row === undefined ? undefined : JOB_SETTLES[row.status];
  if (row === undefined || settle === undefined) return 0;
  const result = parsed(row.result);
  const said = (typeof result === 'object' && result !== null && typeof (result as { text?: unknown }).text === 'string' ? (result as { text: string }).text : '').trim();
  const reply = [...(said !== '' ? said : (row.error ?? '').trim() !== '' ? row.error!.trim() : settle.said)].slice(0, SAID_MOST).join('');
  let n = 0;
  for (const i of openInstructions(d.sql)) {
    if (i.job !== job) continue;
    const note = `Its job ended ${row.status.replace('_', ' ')}.`;
    if (settle.state !== 'declined' && i.state !== 'working') {
      const moved = d.write(i.row, { patch: { state: 'working' }, stamp: {}, note: null, actor: 'system' });
      if (!moved.ok) continue;
    }
    const closed = d.write(i.row, { patch: { state: settle.state }, stamp: { reply, replied_at: iso(d.now) }, note, actor: 'system' });
    if (!closed.ok) continue;
    n++;
    const run = i.taken_by === null ? null : runOf(d.sql, i.taken_by);
    if (run && run.fields.instruction === i.id) d.runWrite(run.id, { instruction: null }, 'system', null);
  }
  return n;
}

/**
 * The sweep's part for jobs: every job that ended while an instruction it carried is still open settles it
 * (`settleJobInstructions`), so one the queue ended by itself (waited a day, or its machine went silent) is answered
 * within the hour. Answers how many moved.
 */
export function settleEndedJobs(d: InstructionDeps): number {
  const ended = d.sql.all<{ job: string }>(
    `SELECT DISTINCT j.id AS job FROM entry e JOIN job j ON j.id = json_extract(e.fields, '$.job')
     WHERE e.register = ? AND e.deleted_at IS NULL AND e.state IN ('sent', 'seen', 'working') AND j.status NOT IN ('queued', 'claimed')
     LIMIT 100`,
    INSTRUCTIONS,
  );
  return ended.reduce((n, r) => n + settleJobInstructions(d, r.job), 0);
}

/** Whether a run could be told something now (open and heard from), for the app's "Now" chip: `isPresent`. */
export const reachableNow = (run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): boolean => isPresent(run, nowMs);
