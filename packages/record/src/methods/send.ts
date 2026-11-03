/**
 * "Send to…": from any row in the app he sends a request to someone who can work on it, and the answer comes back onto
 * that row. The agent side of it; the app draws the button, the sheet and the strip.
 *
 * FOUR DOORS, ALL HIS. `sendTargets` lists who he can send to now: Slash (quick and deep, which the app asks itself),
 * Claude on each machine whose runner claimed in the last two minutes, each agent session open now, and whoever starts
 * next on the row's project. `sendTo` sends one request and says where it went. `sent` reads one back with its reply,
 * who saw it and what the run changed; `sentList` is what he sent that is still in flight, or everything sent about one
 * row lately.
 *
 * EVERY SEND IS AN INSTRUCTION (`packages/kernel/src/instruction.ts`), made by `instruct` and so a person's alone,
 * never a token's: the rows he sent are on it (`attach`) and whether it may change files (`may_change`). It moves Sent,
 * Seen, Working, then Done, Needs you or Declined as any instruction does, so a session open now hears it as it hears any
 * other (at its next prompt or tool call, or at once through the channel where that is on).
 *
 * CLAUDE ON A MACHINE IS A JOB. The request goes as an instruction bound to one job (`job` on it), of the kind
 * `job.claude` (reads, and proposes) or `job.claude-change` (may change files in the folder he picked), each approved
 * once in Decide with the Jobs on your machine add-on, and once on the machine (`braindog runner allow`). The job's
 * Claude Code takes the instruction through the record's own `instructions` tool and replies on it; a job that ends
 * with it still open answers it from how it ended (`settleJob`).
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { INSTRUCTIONS, MACHINE_NAME, SEAT_NAME, type Instr, type JobEvent, type RunnerHeard } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { readSight } from '../sight.ts';
import { receiptsOf, toldOf, type Receipts, type Told } from './instructions.ts';
import type { RecordDeps } from './index.ts';

/** Who a request can go to, as the sheet lists it. */
export type TargetKind = 'slash' | 'mac' | 'session' | 'next';

/**
 * One place a request can go. `id` is what `sendTo` takes back. A machine says the profiles and folders it offers
 * (`profiles`, `repos`), a session its run (`run`), and every one the project it is on where it has one.
 */
export type Target = {
  id: string;
  kind: TargetKind;
  label: string;
  detail: string;
  live: boolean;
  project?: string;
  machine?: string;
  profiles?: string[];
  repos?: string[];
  run?: string;
};

/** Where a send went: the instruction, said, and who it reached; or Slash, which the app asks itself. */
export type Sent = { id: string; routed_to: { kind: TargetKind; label: string }; job?: string } | { route: 'slash'; routed_to: { kind: 'slash'; label: string } };

/** One send as the strip on its row reads it: the instruction, who it went to, what the run is doing, and its receipts. */
export type SentOne = Omit<Told, 'job'> & {
  routed_to: { kind: TargetKind; label: string };
  seen: { run: string; how: string; at: string }[];
  /** What the run changed while it held it, one line a batch, newest first: `said` is "2 changes: Fix the login, tasks#12". */
  receipts: { batch: string; said: string; at: string; rows: string[] }[];
  /** The run, its head before and after, and how many changes in all, or `null` before a run took it. */
  changed: Omit<Receipts, 'batches'> | null;
  /** What the run is at now, one short line, while it works: the job's last step, or the session's own. */
  progress: string | null;
  /** The job carrying it to a machine, as the queue holds it, or `null` for one sent to a session or whoever is next. */
  job: { id: string; status: string; cost_minor: number | null; cost_currency: string | null; ms: number | null } | null;
};

/** How recently a machine's runner must have claimed to be offered as live. */
export const LIVE_MS = 2 * 60_000;

/** The two kinds a machine runs a request as: reading and proposing, or changing files in one folder. */
export const ASK_KIND = 'job.claude';
export const CHANGE_KIND = 'job.claude-change';

/** The most sends one `sentList` answers, and how far back a row's settled sends are read. */
const LIST_MOST = 50;
const ROW_DAYS = 7;

/** What each door takes. */
const TARGETS_TAKES = ['row', 'project'] as const;
const SEND_TAKES = ['target', 'note', 'attach', 'may_change', 'profile', 'repo', 'row', 'project'] as const;
const SENT_TAKES = ['id'] as const;
const LIST_TAKES = ['row', 'open'] as const;
const REPLY_TAKES = ['id', 'note'] as const;

/** Each agent as a person calls it. */
const AGENT_SAID: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
};

/** A folder's name as a machine maps it, the kernel's own grammar for one. */
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;

/** The first words of a question, for `auto`'s reading of one that needs no repository. */
const ASKS = /^(?:what|why|how|when|where|who|which|whose|is|are|was|were|do|does|did|can|could|should|would|will|has|have|had|any|tell me|explain|summari[sz]e)\b/iu;

/** Words that mean work on code, which `auto` sends to Claude and never to Slash. */
const CODE_WORK = /\b(?:fix|implement|refactor|build|deploy|commit|branch|merge|patch|bug|test|code|repo|repository|pr|pull request|migrat\w*|typecheck|compile)\b/iu;

/**
 * A machine as a person calls it: the model in its name where it says one ("MacBook Pro"), else its name with `.local`
 * and its dashes gone.
 */
export function machineCalled(host: string | null): string {
  if (host === null || host.trim() === '') return 'this machine';
  const bare = host.replace(/\.(?:local|lan|home|localdomain)$/iu, '');
  const model = /(MacBook[- ]?(?:Pro|Air)?|Mac[- ]?mini|Mac[- ]?Studio|Mac[- ]?Pro|iMac)/iu.exec(bare)?.[1];
  return (model ?? bare).replace(/-/gu, ' ').trim() || 'this machine';
}

/** Whether a note reads as a question with no work on code in it: what `auto` hands to Slash. */
export function readsAsQuestion(note: string): boolean {
  const said = note.trim();
  if (said === '' || CODE_WORK.test(said)) return false;
  return said.endsWith('?') || ASKS.test(said);
}

/** One step of a job as a line of what it is doing: a tool by its name and the head of what it was given, or its words. */
function stepLine(e: JobEvent): string | null {
  const body = (typeof e.body === 'object' && e.body !== null ? e.body : {}) as Record<string, unknown>;
  const cut = (t: string, n: number): string => {
    const one = t.replace(/\s+/gu, ' ').trim();
    return one.length > n ? `${one.slice(0, n - 1)}…` : one;
  };
  if (e.kind === 'tool' && typeof body.name === 'string') {
    const name = body.name.replace(/^mcp__braindog__/u, 'BrainDog ').replace(/^mcp__[^_]+__/u, '');
    let input = '';
    try {
      const o = JSON.parse(typeof body.input === 'string' ? body.input : '{}') as Record<string, unknown>;
      const first = ['file_path', 'path', 'pattern', 'command', 'q', 'spoken', 'query'].map((k) => o[k]).find((v) => typeof v === 'string');
      input = typeof first === 'string' ? first : '';
    } catch {
      input = '';
    }
    return cut(input === '' ? name : `${name} ${input}`, 120);
  }
  if ((e.kind === 'say' || e.kind === 'note' || e.kind === 'error') && typeof body.text === 'string' && body.text.trim() !== '') return cut(body.text, 140);
  if (e.kind === 'start') return 'Started on the machine.';
  return null;
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, admin, no, tail, clock } = deps;
  const sight = readSight(kernel);

  const strayOf = (name: string, args: Record<string, unknown>, takes: readonly string[]) => {
    const stray = Object.keys(args).find((k) => !takes.includes(k));
    return stray === undefined ? null : no<never>('FIELD_UNKNOWN', `${stray} is not something ${name} takes. It takes ${takes.join(', ')}.`, { at: stray, allowed: [...takes] });
  };
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

  /** The list projects are kept in: the one declaring `scopes`. */
  const projectsList = () => [...kernel.registers().values()].find((d) => d.scopes !== undefined) ?? null;

  /** A project by its spoken name, id or title, as runs hold it (`things#23`), or `null`. */
  const projectNamed = (ctx: CallContext, said: string): string | null => {
    const list = projectsList();
    if (list === null) return null;
    const row = kernel.get(said);
    if (row !== null && row.register === list.id) return sight.admits(ctx, row) ? kernel.nameOf(row.id) : null;
    const titled = sql
      .all<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND lower(trim(json_extract(fields, ?))) = lower(trim(?)) LIMIT 2`,
        list.id,
        `$."${list.title}"`,
        said,
      )
      .map((r) => r.id);
    const only = titled.length === 1 ? kernel.get(titled[0]!) : null;
    return only !== null && sight.admits(ctx, only) ? kernel.nameOf(only.id) : null;
  };

  /** The project a row is on, by its scope field, or the row itself when it is a project; `null` for neither. */
  const projectOfRow = (ctx: CallContext, ref: string): string | null => {
    const row = kernel.get(ref);
    if (row === null || !sight.admits(ctx, row)) return null;
    const list = projectsList();
    if (list !== null && row.register === list.id) return kernel.nameOf(row.id);
    const field = kernel.register(row.register)?.fields.find((f) => f.scope !== undefined && !f.retired);
    const v = field === undefined ? undefined : (row.fields as Record<string, unknown>)[field.id];
    return typeof v === 'string' && v.trim() !== '' ? (projectNamed(ctx, v.trim()) ?? null) : null;
  };

  /** A project's title, for a label, or its spoken name when it has none or the caller is not shown it. */
  const projectTitle = (ctx: CallContext, spoken: string): string => {
    const row = kernel.get(spoken);
    return (row === null || !sight.admits(ctx, row) ? null : kernel.titleOfRow(row.id)) ?? spoken;
  };

  /** The project a door is about: the one named, else the row's. */
  const projectFor = (ctx: CallContext, a: Record<string, unknown>): string | null => {
    const named = text(a.project);
    if (named !== null) return projectNamed(ctx, named);
    const row = text(a.row);
    return row === null ? null : projectOfRow(ctx, row);
  };

  /** Whether a run was opened by a job's bearer: such a run works one request and is never offered as a session. */
  const byJob = (token: string | null): boolean =>
    token !== null && (sql.one<{ label: string | null }>('SELECT label FROM token WHERE id = ?', token)?.label ?? '').startsWith('job:');

  /**
   * The sessions there now, as targets, those on `project` first. WHETHER ONE IS THERE IS THE ONE CLOCK'S
   * (`presentRuns`, `packages/kernel/src/presence.ts`): its bridge pulsed lately, or it called lately where it has no
   * pulse, so this list and the Agents page never say two numbers.
   */
  const sessions = (ctx: CallContext, project: string | null): Target[] => {
    if (guard(ctx, 'read', 'session') !== null) return [];
    const present = kernel.presentRuns();
    const shown = sight.admitted(ctx, 'session', present.map((r) => r.id));
    const of = (f: Record<string, unknown>, k: string): string | null => (typeof f[k] === 'string' && (f[k] as string).trim() !== '' ? (f[k] as string).trim() : null);
    const out: Target[] = [];
    for (const r of present) {
      if (!shown.has(r.id)) continue;
      const f = r.fields as Record<string, unknown>;
      if (of(f, 'parent') !== null || f.stopped === 'stop' || f.stopped === 'pause' || byJob(of(f, 'token_id'))) continue;
      const run = kernel.nameOf(r.id);
      const where = of(f, 'project');
      const label = [AGENT_SAID[of(f, 'agent') ?? ''] ?? 'An agent', machineCalled(of(f, 'host')), where === null ? of(f, 'repo') : projectTitle(ctx, where)].filter((x) => x !== null).join(' · ');
      out.push({
        id: `session:${run}`,
        kind: 'session',
        label,
        detail: of(f, 'doing') ?? of(f, 'title') ?? of(f, 'name') ?? 'Open, between steps.',
        live: true,
        run,
        ...(where === null ? {} : { project: where }),
        ...(of(f, 'host') === null ? {} : { machine: of(f, 'host')! }),
      });
    }
    return out.sort((a, b) => Number(b.project === project && project !== null) - Number(a.project === project && project !== null));
  };

  /** The machines whose runner claimed within `LIVE_MS`, as targets. */
  const machines = async (): Promise<{ target: Target; runner: RunnerHeard }[]> => {
    const heard = await kernel.jobs.heard(LIVE_MS);
    return heard.map((r) => {
      const profiles = r.seats.filter((s) => SEAT_NAME.test(s));
      const repos = r.repos.filter((x) => REPO_NAME.test(x));
      const parts = [
        profiles.length === 0 ? null : `as ${profiles.join(', ')}`,
        repos.length === 0 ? 'no folders mapped yet' : `in ${repos.slice(0, 6).join(', ')}${repos.length > 6 ? ` and ${String(repos.length - 6)} more` : ''}`,
      ].filter((p): p is string => p !== null);
      return {
        runner: r,
        target: {
          id: `mac:${r.id}`,
          kind: 'mac' as const,
          label: `Claude on ${machineCalled(r.host)}`,
          detail: parts.join(', '),
          live: true,
          ...(r.host === null ? {} : { machine: r.host }),
          profiles,
          repos,
        },
      };
    });
  };

  /** Whoever starts next on the project, as a target: never live, since it waits for a run to start. */
  const nextTarget = (ctx: CallContext, project: string | null): Target => ({
    id: 'next',
    kind: 'next',
    label: project === null ? 'Whoever starts next' : `Next Claude on ${projectTitle(ctx, project)}`,
    detail: project === null ? 'Waits for the next Claude Code session to start, anywhere.' : 'Waits for the next Claude Code session on this project to start.',
    live: false,
    ...(project === null ? {} : { project }),
  });

  const SLASH: readonly Target[] = [
    { id: 'slash-quick', kind: 'slash', label: 'Slash', detail: 'A quick answer from what your BrainDog holds.', live: true },
    { id: 'slash-deep', kind: 'slash', label: 'Slash, thinking longer', detail: 'A longer look across your BrainDog, for a harder question.', live: true },
  ];

  /** Who an instruction went to, as the strip says it. */
  const routedOf = (ctx: CallContext, i: Instr): { kind: TargetKind; label: string } => {
    if (i.job !== null) return { kind: 'mac', label: `Claude on ${machineCalled(i.machine)}` };
    if (i.to === 'run' && i.to_run !== null) {
      const run = kernel.get(i.to_run, { includeDeleted: true });
      const f = (run !== null && sight.admits(ctx, run) ? run.fields : {}) as Record<string, unknown>;
      const agent = typeof f.agent === 'string' ? (AGENT_SAID[f.agent] ?? 'An agent') : 'A session';
      return { kind: 'session', label: `${agent} · ${machineCalled(typeof f.host === 'string' ? f.host : null)} (${i.to_run})` };
    }
    return { kind: 'next', label: i.project === null ? 'Whoever starts next' : `Next Claude on ${projectTitle(ctx, i.project)}` };
  };

  /** The job behind an instruction as the strip reads it, and its last step as a line. */
  const jobOf = (i: Instr): { job: SentOne['job']; doing: string | null } => {
    if (i.job === null) return { job: null, doing: null };
    const row = sql.one<{ status: string; seq: number; cost_minor: number | null; cost_currency: string | null; ms: number | null }>(
      'SELECT status, seq, cost_minor, cost_currency, ms FROM job WHERE id = ?',
      i.job,
    );
    if (row === undefined) return { job: null, doing: null };
    let doing: string | null = row.status === 'queued' ? 'Waiting for the machine to take it.' : null;
    if (row.status === 'claimed') {
      const got = kernel.jobs.events({ id: i.job, after: Math.max(0, row.seq - 12) });
      const steps = got.ok ? got.value.events : [];
      for (const e of [...steps].reverse()) {
        const line = stepLine(e);
        if (line !== null) {
          doing = line;
          break;
        }
      }
      doing ??= 'Working on the machine.';
    }
    return { job: { id: i.job, status: row.status, cost_minor: row.cost_minor, cost_currency: row.cost_currency, ms: row.ms }, doing };
  };

  /** One send as the strip reads it. */
  const sentOne = (ctx: CallContext, i: Instr): SentOne => {
    const { job, doing } = jobOf(i);
    let said = doing;
    if (said === null && i.state === 'working' && i.taken_by !== null && i.job === null) {
      const run = kernel.get(i.taken_by, { includeDeleted: true });
      const d = run !== null && sight.admits(ctx, run) ? (run.fields as Record<string, unknown>).doing : undefined;
      said = typeof d === 'string' && d.trim() !== '' ? d.trim() : null;
    }
    const r = receiptsOf(sql, kernel, i, new Date(clock.now()).toISOString(), ctx, sight);
    const { batches, ...changed } = r ?? { batches: [] as Receipts['batches'] };
    return {
      ...toldOf(sql, i),
      routed_to: routedOf(ctx, i),
      seen: kernel.instructionSeen(i.id),
      receipts: batches.map((b) => ({
        batch: b.batch,
        at: b.at,
        rows: b.rows,
        said: `${String(b.changes)} ${b.changes === 1 ? 'change' : 'changes'}${b.names.length === 0 ? '' : `: ${b.names.join(', ')}`}`,
      })),
      changed: r === null ? null : (changed as Omit<Receipts, 'batches'>),
      progress: said,
      job,
    };
  };

  /**
   * One thing sent with a request, as the run reads it, or `null` when he is not shown it or it is not there: a row as
   * `tasks#12` (its spoken name, from `list#seq` or an id), a question or decision as `decide:SG12` said `SG12`, a run
   * as `run:S883` said `S883`, and a sign as `sign:<id>`, kept so, since a sign is no row.
   */
  const attachedAs = (ctx: CallContext, given: string): string | null => {
    const ref = given.trim();
    if (ref === '' || ref.length > 120) return null;
    const colon = /^(decide|run|sign):(.+)$/u.exec(ref);
    if (colon?.[1] === 'decide') {
      const id = colon[2]!.trim();
      const key = deps.spokenAs(id) ?? id;
      return deps.sightOf(ctx, `suggestion:${key}`) ?? deps.sightOf(ctx, `decision:${key}`);
    }
    if (colon?.[1] === 'sign') {
      const id = colon[2]!.trim();
      const signs = kernel.signs();
      return signs.ok && signs.value.signs.some((x) => x.sign === id) ? `sign:${id}` : null;
    }
    const got = kernel.get(colon?.[1] === 'run' ? colon[2]!.trim() : ref, { includeDeleted: colon?.[1] === 'run' });
    if (got === null || !sight.admits(ctx, got)) return null;
    if (colon?.[1] === 'run' && got.register !== 'session') return null;
    return kernel.nameOf(got.id);
  };

  /** Who a person's call is, for the kernel's instruction path. */
  const asPerson = (ctx: CallContext) => ({ actor: ctx.principal.kind === 'person' ? ctx.principal.id : 'system', principal: { kind: 'person' as const } });

  return {
    /**
     * Who he can send a request to from a row, now: Slash, Claude on each machine heard from in the last two minutes,
     * each session open now (those on the row's project first), and whoever starts next there. READ+, the owner's.
     */
    async sendTargets(args: { row?: string; project?: string } | undefined, ctx: CallContext): Promise<Result<{ targets: Target[]; project: string | null }>> {
      const stop = guard(ctx, 'owner');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sendTargets', a, TARGETS_TAKES);
      if (stray) return stray;
      const project = projectFor(ctx, a);
      const macs = admin(ctx, 'send a request to a machine') === null ? (await machines()).map((m) => m.target) : [];
      return ok({ targets: [...SLASH, ...macs, ...sessions(ctx, project), nextTarget(ctx, project)], project });
    },

    /**
     * He sends one request: to a target `sendTargets` listed (`slash-quick`, `mac:<runner>`, `session:S883`, `next`) or
     * to `auto`, which hands a plain question with no folder to Slash and anything else to a live session on the
     * row's project, else Claude on a machine heard from now, else whoever starts next there. Every send but Slash's is
     * one instruction, his and never a token's, with the rows he sent (`attach`, the row first) and whether it may
     * change files. To a machine it is also one job, of `job.claude` or `job.claude-change`. DATA, a person's alone.
     */
    async sendTo(args: Record<string, unknown> | undefined, ctx: CallContext): Promise<Result<Sent>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', 'Only a person sends a request, signed in to BrainDog. An agent answers with instructions.', { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sendTo', a, SEND_TAKES);
      if (stray) return stray;
      for (const key of ['target', 'note', 'profile', 'repo', 'row', 'project'] as const)
        if (a[key] !== undefined && a[key] !== null && typeof a[key] !== 'string') return no('VALUE_MALFORMED', `${key} is text.`, { at: key });
      if (a.may_change !== undefined && a.may_change !== null && typeof a.may_change !== 'boolean') return no('VALUE_MALFORMED', 'may_change is true or false.', { at: 'may_change' });
      if (a.attach !== undefined && a.attach !== null && (!Array.isArray(a.attach) || a.attach.some((r) => typeof r !== 'string')))
        return no('VALUE_MALFORMED', 'attach is a list of rows as BrainDog names them, like ["tasks#12"].', { at: 'attach' });
      const target = text(a.target) ?? 'auto';
      const note = text(a.note) ?? '';
      const mayChange = a.may_change === true;
      const profile = text(a.profile);
      const repo = text(a.repo);
      const row = text(a.row);
      if (profile !== null && !SEAT_NAME.test(profile)) return no('VALUE_MALFORMED', 'Name the profile as its runs name it, like studio or default: a name, never a folder.', { at: 'profile' });
      if (repo !== null && !REPO_NAME.test(repo)) return no('VALUE_MALFORMED', "Name the folder as the machine maps it, like braindog: a name, never a path.", { at: 'repo' });

      /* WHAT IT CARRIES, THE ROW IT WAS SENT FROM FIRST, each one he is shown (`attachedAs`). */
      const attach: string[] = [];
      for (const ref of [...(row === null ? [] : [row]), ...((a.attach as string[] | undefined) ?? [])]) {
        const named = attachedAs(ctx, ref);
        if (named === null) return no('ROW_UNKNOWN', `There is nothing called ${ref.trim().slice(0, 80)} to send.`, { at: 'attach' });
        if (!attach.includes(named)) attach.push(named);
      }
      const project = projectFor(ctx, a);
      const said = note !== '' ? note : attach.length > 0 ? `Look at ${attach.join(', ')} and tell me what you find.` : '';
      if (said === '') return no('REQUIRED_MISSING', 'Say what you want done, or send it from a row.', { at: 'note' });

      /* WHERE IT GOES. `auto` reads the note: a plain question with no folder and no leave to change is Slash's. */
      let kind: TargetKind;
      let chosen: string = target;
      if (target === 'slash-quick' || target === 'slash-deep') return ok({ route: 'slash', routed_to: { kind: 'slash', label: target === 'slash-deep' ? 'Slash, thinking longer' : 'Slash' } });
      if (target === 'auto') {
        if (!mayChange && repo === null && readsAsQuestion(note)) return ok({ route: 'slash', routed_to: { kind: 'slash', label: 'Slash' } });
        const live = sessions(ctx, project).find((s) => project !== null && s.project === project);
        const macs = admin(ctx, 'send a request to a machine') === null ? await machines() : [];
        const mac = macs.find((m) => repo === null || m.runner.repos.includes(repo)) ?? null;
        chosen = live !== undefined ? live.id : mac !== null ? mac.target.id : 'next';
      }
      if (chosen.startsWith('session:')) kind = 'session';
      else if (chosen.startsWith('mac:')) kind = 'mac';
      else if (chosen === 'next') kind = 'next';
      else return no('ENUM_VALUE_UNKNOWN', 'target is auto, slash-quick, slash-deep, next, or an id sendTargets listed (mac:…, session:S883).', { at: 'target' });

      const common = { said, attach, may_change: mayChange, ...(project === null ? {} : { project }) };

      if (kind === 'session') {
        const run = chosen.slice('session:'.length);
        const made = kernel.instruct(asPerson(ctx), {
          ...common,
          kind: 'tell',
          to: 'run',
          to_run: run,
          when: 'now',
          ...(repo === null ? {} : { repo }),
        });
        if (!made.ok) return tail(made as Result<never>);
        return tail(ok({ id: made.value.id, routed_to: routedOf(ctx, made.value) }));
      }

      if (kind === 'next') {
        const made = kernel.instruct(asPerson(ctx), {
          ...common,
          kind: 'tell',
          to: 'agent',
          to_agent: 'claude',
          when: 'next',
          ...(repo === null ? {} : { repo }),
          ...(profile === null ? {} : { seat: profile }),
        });
        if (!made.ok) return tail(made as Result<never>);
        return tail(ok({ id: made.value.id, routed_to: routedOf(ctx, made.value) }));
      }

      /* CLAUDE ON A MACHINE: STARTING A JOB IS THE OWNER'S, IN A BROWSER, as `createJob` is. */
      const barred = admin(ctx, 'send a request to a machine');
      if (barred) return { ok: false, refusal: barred };
      const runnerId = chosen.slice('mac:'.length);
      const mac = (await machines()).find((m) => m.runner.id === runnerId) ?? null;
      if (mac === null) return no('ROW_UNKNOWN', 'That machine has not been heard from in the last two minutes. Start braindog runner run on it, then send again.', { at: 'target' });
      if (profile !== null && mac.runner.seats.length > 0 && !mac.runner.seats.includes(profile))
        return no('ENUM_VALUE_UNKNOWN', `${machineCalled(mac.runner.host)} runs Claude Code as ${mac.runner.seats.join(', ')}.`, { at: 'profile', allowed: mac.runner.seats });
      if (repo !== null && !mac.runner.repos.includes(repo))
        return no('ENUM_VALUE_UNKNOWN', `${machineCalled(mac.runner.host)} has no folder called ${repo}. On it, run braindog runner repos add ${repo} <folder>.`, { at: 'repo', allowed: mac.runner.repos });
      if (mayChange && repo === null) return no('REQUIRED_MISSING', 'Pick the folder it may change.', { at: 'repo', allowed: mac.runner.repos });

      const host = mac.runner.host !== null && MACHINE_NAME.test(mac.runner.host) ? mac.runner.host : null;
      const jobKind = mayChange ? CHANGE_KIND : ASK_KIND;
      const started = kernel.jobs.create({
        kind: jobKind,
        args: { repo: repo ?? '-' },
        ...(attach.length > 0 ? { about: attach[0] } : {}),
        ...(host === null ? {} : { machine: host }),
        ...(profile === null ? {} : { seat: profile }),
      });
      if (!started.ok) {
        if ('refusal' in started && started.refusal.code === 'DECLARATION_UNKNOWN')
          return no(
            'DECLARATION_UNKNOWN',
            `Claude on your machine needs the ${mayChange ? 'change files' : 'ask'} kind of job, which comes with the Jobs on your machine plugin. Install or update it from the store and approve it in Decide, then send again.`,
            { at: 'target' },
          );
        return tail(started as Result<never>);
      }
      const made = kernel.instruct(asPerson(ctx), {
        ...common,
        kind: 'tell',
        to: 'agent',
        to_agent: 'claude',
        when: 'now',
        job: started.value.id,
        waits_ms: 86_400_000,
        ...(repo === null ? {} : { repo }),
        ...(host === null ? {} : { machine: host }),
        ...(profile === null ? {} : { seat: profile }),
      });
      if (!made.ok) {
        kernel.jobs.cancel({ id: started.value.id });
        return tail(made as Result<never>);
      }
      return tail(ok({ id: made.value.id, routed_to: routedOf(ctx, made.value), job: started.value.id }));
    },

    /** One send, by its spoken name (`IN12`): where it went, its state and reply, who saw it, what it is at, its receipts. */
    async sent(args: { id?: string } | undefined, ctx: CallContext): Promise<Result<SentOne>> {
      const stop = guard(ctx, 'owner');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sent', a, SENT_TAKES);
      if (stray) return stray;
      const id = text(a.id);
      if (id === null) return no('REQUIRED_MISSING', 'Say which send, as IN12.', { at: 'id' });
      const i = kernel.instruction(id);
      if (i === null) return no('ROW_UNKNOWN', `There is no request called ${id.slice(0, 40)}.`, { at: 'id' });
      return ok(sentOne(ctx, i));
    },

    /**
     * What he sent that is still in flight (Sent, Seen, Working or Needs you), newest first: the Sent tray. With `row`,
     * every send that carried that row from the last week, settled ones too, for the strip on the row.
     */
    async sentList(args: { row?: string; open?: string } | undefined, ctx: CallContext): Promise<Result<{ sent: SentOne[] }>> {
      const stop = guard(ctx, 'owner');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sentList', a, LIST_TAKES);
      if (stray) return stray;
      const rowSaid = text(a.row);
      const row = rowSaid === null ? null : kernel.get(rowSaid);
      if (rowSaid !== null && (row === null || !sight.admits(ctx, row))) return no('ROW_UNKNOWN', `There is no row called ${rowSaid.slice(0, 80)}.`, { at: 'row' });
      const me = ctx.principal.kind === 'person' ? ctx.principal.id : null;
      const inFlightOnly = typeof a.open === 'string' && /^(?:1|true|yes)$/iu.test(a.open);
      const since = new Date(clock.now() - ROW_DAYS * 86_400_000).toISOString();
      const seqs =
        row === null
          ? sql.all<{ seq: number }>(
              `SELECT seq FROM entry WHERE register = ? AND deleted_at IS NULL AND state IN ('sent', 'seen', 'working', 'needs_you') ORDER BY seq DESC LIMIT ?`,
              INSTRUCTIONS,
              LIST_MOST * 2,
            )
          : sql.all<{ seq: number }>(
              `SELECT e.seq AS seq FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.created_at >= ?
                 AND EXISTS (SELECT 1 FROM event v WHERE v.target = 'entry:' || e.id AND v.kind = 'note' AND v.field = 'attach'
                   AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(v.to_v) THEN v.to_v ELSE '[]' END) j WHERE j.value = ?))
               ORDER BY e.seq DESC LIMIT ?`,
              INSTRUCTIONS,
              since,
              kernel.nameOf(row.id),
              LIST_MOST,
            );
      const out: SentOne[] = [];
      for (const { seq } of seqs) {
        const i = kernel.instruction(`IN${String(seq)}`);
        if (i === null || (me !== null && i.by !== me) || (row === null && i.kind !== 'tell')) continue;
        /* `open=1` WITH A ROW: only what is still in flight about it. */
        if (inFlightOnly && !['sent', 'seen', 'working', 'needs_you'].includes(i.state)) continue;
        out.push(sentOne(ctx, i));
        if (out.length >= LIST_MOST) break;
      }
      return ok({ sent: out });
    },

    /**
     * He takes back a send (`POST /api/send/<id>/withdraw`): one no run has taken is Withdrawn; one a machine is working
     * on stops its job, and ends Declined once the machine stops. One a session took is refused with what to do
     * instead, as `withdrawInstruction` says it. DATA, a person's alone.
     */
    async sendWithdraw(args: { id?: string } | undefined, ctx: CallContext): Promise<Result<SentOne>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', 'Only the person who sent it takes a request back, in BrainDog.', { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sendWithdraw', a, SENT_TAKES);
      if (stray) return stray;
      const id = text(a.id);
      const i = id === null ? null : kernel.instruction(id);
      if (i === null) return no('ROW_UNKNOWN', `There is no request called ${(id ?? '').slice(0, 40)}.`, { at: 'id' });
      if (i.job !== null) {
        const barred = admin(ctx, 'stop a request on a machine');
        if (barred) return { ok: false, refusal: barred };
        const cancelled = kernel.jobs.cancel({ id: i.job });
        if (cancelled.ok && cancelled.value.status === 'cancelled') kernel.settleJob(i.job);
        if (i.state === 'sent' || i.state === 'seen') {
          const out = kernel.withdrawInstruction(asPerson(ctx), i.id);
          if (!out.ok && kernel.instruction(i.id)?.state !== 'declined') return tail(out as Result<never>);
        }
        return tail(ok(sentOne(ctx, kernel.instruction(i.id) ?? i)));
      }
      const out = kernel.withdrawInstruction(asPerson(ctx), i.id);
      if (!out.ok) return tail(out as Result<never>);
      return tail(ok(sentOne(ctx, out.value)));
    },

    /**
     * He follows up a send (`POST /api/send/<id>/reply`, `{ note }`): a new instruction, his, to the same place, carrying
     * the same rows and leave, its words saying which send it follows. To the run that took the first while that run is
     * open; to the same job while that job still runs; else the same way the first went (the same machine, a fresh job,
     * or whoever is next there). Answers the new send, as `sendTo` does. DATA, a person's alone.
     */
    async sendReply(args: { id?: string; note?: string } | undefined, ctx: CallContext): Promise<Result<Sent>> {
      const stop = guard(ctx, 'owner');
      if (ctx.principal.kind === 'token') return no('NEEDS_BROWSER_SESSION', 'Only a person sends a request, signed in to BrainDog. An agent answers with instructions.', { at: 'principal' });
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = strayOf('sendReply', a, REPLY_TAKES);
      if (stray) return stray;
      const id = text(a.id);
      const note = text(a.note);
      if (note === null) return no('REQUIRED_MISSING', 'Say what to add.', { at: 'note' });
      const first = id === null ? null : kernel.instruction(id);
      if (first === null) return no('ROW_UNKNOWN', `There is no request called ${(id ?? '').slice(0, 40)}.`, { at: 'id' });
      const head = `Following up ${first.id}: `;
      const said = [...`${head}${note}`].slice(0, 2_000).join('');
      const carried = { said, attach: first.attach, ...(first.may_change === null ? {} : { may_change: first.may_change }), ...(first.project === null ? {} : { project: first.project }) };
      const where = { ...(first.repo === null ? {} : { repo: first.repo }), ...(first.machine === null ? {} : { machine: first.machine }), ...(first.seat === null ? {} : { seat: first.seat }) };

      /* THE RUN THAT TOOK IT, WHILE IT IS OPEN: a session hears it at its next step, a job's run when it asks again. */
      const runRow = first.taken_by === null ? null : kernel.get(first.taken_by);
      const runOpen = runRow !== null && (runRow.state === 'active' || runRow.state === 'idle');
      const jobOpen = first.job !== null && ['queued', 'claimed'].includes(sql.one<{ status: string }>('SELECT status FROM job WHERE id = ?', first.job)?.status ?? '');
      if (first.job !== null && jobOpen) {
        const made = kernel.instruct(asPerson(ctx), { ...carried, ...where, kind: 'tell', to: 'agent', to_agent: 'claude', when: 'now', job: first.job, waits_ms: 86_400_000 });
        return tail(made.ok ? ok({ id: made.value.id, routed_to: routedOf(ctx, made.value), job: first.job }) : (made as Result<never>));
      }
      if (first.job === null && runOpen) {
        const made = kernel.instruct(asPerson(ctx), { ...carried, ...(first.repo === null ? {} : { repo: first.repo }), kind: 'tell', to: 'run', to_run: first.taken_by!, when: 'now' });
        return tail(made.ok ? ok({ id: made.value.id, routed_to: routedOf(ctx, made.value) }) : (made as Result<never>));
      }
      if (first.job !== null) {
        /* THE SAME MACHINE, A FRESH JOB: the first one's ended, and its words are on the first send for the run to read. */
        const barred = admin(ctx, 'send a request to a machine');
        if (barred) return { ok: false, refusal: barred };
        const started = kernel.jobs.create({
          kind: first.may_change === true ? CHANGE_KIND : ASK_KIND,
          args: { repo: first.repo ?? '-' },
          ...(first.attach.length > 0 ? { about: first.attach[0] } : {}),
          ...(first.machine === null ? {} : { machine: first.machine }),
          ...(first.seat === null ? {} : { seat: first.seat }),
        });
        if (!started.ok) return tail(started as Result<never>);
        const made = kernel.instruct(asPerson(ctx), { ...carried, ...where, kind: 'tell', to: 'agent', to_agent: 'claude', when: 'now', job: started.value.id, waits_ms: 86_400_000 });
        if (!made.ok) {
          kernel.jobs.cancel({ id: started.value.id });
          return tail(made as Result<never>);
        }
        return tail(ok({ id: made.value.id, routed_to: routedOf(ctx, made.value), job: started.value.id }));
      }
      const made = kernel.instruct(asPerson(ctx), { ...carried, ...where, kind: 'tell', to: 'agent', to_agent: first.to_agent ?? 'claude', when: 'next' });
      return tail(made.ok ? ok({ id: made.value.id, routed_to: routedOf(ctx, made.value) }) : (made as Result<never>));
    },
  };
}
