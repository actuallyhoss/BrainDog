/**
 * `braindog automations list|show|run|cancel` and `braindog scripts resume`: the record's automations and scripts from a
 * terminal, over the methods the canvas and an agent's MCP tools already call (`loop/DIRECTION.md` §22).
 *
 * READING IS FOR ANY TOKEN; STARTING, STOPPING AND RESUMING ARE A BROWSER'S. `automations` is READ+, held to the lists
 * the caller reads, so `list` and `show` answer a login from this machine. `automationRun`, `cancelRun` and
 * `resumeScript` are ADMIN, and `packages/record/src/index.ts`'s `admin()` refuses every `token` principal before it
 * reads the arguments, with "Open this from the app; a token cannot start an automation." Every bearer this command
 * holds is a token, so `run`, `cancel` and `resume` are built exactly as the record takes them and show that sentence
 * today, the way `page push` shows its own. They are not left out: the day the record opens a door for a proven session
 * that is not a browser cookie, they work with no change here, and until then a person reading the refusal learns where
 * the button is rather than learning that the command does not exist.
 *
 * THERE IS NO `scripts list`, AND THAT IS THE RECORD'S GAP, NOT THIS FILE'S. Measured on 2026-09-22 across
 * `packages/host/src/index.ts`'s route table: no method reads the `schedule` rows of kind `script` or lists script
 * declarations, and `actions` filters to `pull`, `call` and `poll`. A list verb here would have to invent its answer.
 * The pause event names the script (`script-run.ts`: "<script> is paused: its last 3 runs were refused"), which is where
 * the id for `resume` comes from until a read exists.
 *
 * PLAIN SENTENCES FOR A PERSON, THE RECORD'S OWN OBJECTS FOR AN AGENT. Under `--json` the value is exactly what the
 * record answered, handed over with `io.answer`, so an agent branches on `state` and `last.state` rather than splitting
 * the lines below back apart.
 */

import { parseArgs } from 'node:util';

import type { Automation, AutomationRow, AutomationRun } from '@braindog/client';

import { refuse } from './json.ts';
import { connect, type AgentIo } from './skills.ts';

/** `2026-09-21 14:02 UTC` from the record's ISO instant, which a person reads faster than the milliseconds and the `Z`. */
const when = (iso: string): string => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso) ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso);

/** A sentence the record wrote, closed with a full stop only when it has none of its own. */
const closed = (text: string): string => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

/** What starts an automation, as the opening of a sentence. The record says it at length on Decide; a list needs the gist. */
function starts(a: Pick<AutomationRow, 'trigger' | 'register' | 'path'>): string {
  const what =
    a.trigger === 'written'
      ? `When a row of ${a.register ?? 'no list'} is written`
      : a.trigger === 'arrival'
        ? 'When something arrives'
        : a.trigger === 'every'
          ? 'On a clock'
          : a.trigger === 'metric'
            ? 'When a figure crosses its line'
            : a.trigger === 'decided'
              ? 'When something is decided'
              : a.trigger === 'manual'
                ? 'When somebody presses Run now in the app'
                : `On ${String(a.trigger)}`;
  /* THE TWO PATHS READ DIFFERENTLY TO SOMEBODY DEBUGGING ONE: an inline rule has no runs to show, because it happens
     inside the write, so `show` listing none is the answer and not a fault. */
  return `${what}, ${a.path === 'inline' ? 'inside the write itself' : 'as a run'}.`;
}

/** Where it came from, when it came from a pack or belongs to one project. */
function origin(a: Pick<AutomationRow, 'pack' | 'project'>): string | null {
  if (a.pack !== null) return `From ${a.pack}${a.project === null ? '' : `, for ${a.project}`}.`;
  return a.project === null ? null : `For ${a.project}.`;
}

function month(m: AutomationRow['month']): string | null {
  if (m.runs === 0) return null;
  const parts = [m.done ? `${String(m.done)} done` : '', m.failed ? `${String(m.failed)} failed` : '', m.cancelled ? `${String(m.cancelled)} cancelled` : ''].filter((p) => p !== '');
  return `This month ${plural(m.runs, 'run', 'runs')}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

function listLine(a: AutomationRow): string {
  const said = [
    /* The name only when somebody gave one: the record falls back to the bare id, which is already the line's first word. */
    a.name === a.rule ? null : closed(a.name),
    starts(a),
    a.enabled ? null : 'Turned off.',
    origin(a),
    a.next === null ? null : `Next ${when(a.next)}.`,
    a.last === null ? 'No run yet.' : `Last run ${a.last.state} at ${when(a.last.at)}${a.last.say ? `: ${closed(a.last.say)}` : '.'}`,
    a.open > 0 ? `${plural(a.open, 'run', 'runs')} open.` : null,
    month(a.month),
  ].filter((s): s is string => s !== null);
  return `  ${a.rule}  ${said.join(' ')}`;
}

/** How a run began, as the record keeps its trigger's kind. */
const began = (trigger: string): string =>
  trigger === 'written' ? 'on a write' : trigger === 'arrival' ? 'on an arrival' : trigger === 'every' ? 'on the clock' : trigger === 'manual' ? 'by Run now' : trigger === 'metric' ? 'on a figure' : trigger === 'decided' ? 'on a decision' : `on ${trigger}`;

/* A STEP'S ANSWER IS WHATEVER THE STEP KEPT, a call's body among them, so it is cut to one readable line. The whole of
   it is in the `--json` value. ONE LINE MEANS THE NEWLINES GO FIRST: a `set_var` keeps up to 4 KB of what a row's
   field filled it with, and printed as kept, a note's line breaks split the step list into lines that named no step. */
const ANSWER_SHOWN = 120;

function runLines(r: AutomationRun): string[] {
  const lines = [`  ${r.id}  ${r.state}  ${when(r.started_at)}, by ${r.actor} ${began(r.trigger)}.${r.say ? ` ${closed(r.say)}` : ''}`];
  for (const s of r.steps) {
    const flat = s.answer?.replace(/\s+/g, ' ').trim() ?? null;
    const answer = flat === null ? '' : ` (${flat.length > ANSWER_SHOWN ? `${flat.slice(0, ANSWER_SHOWN)}...` : flat})`;
    lines.push(`    ${String(s.n)} ${s.kind}: ${s.state}${answer}`);
  }
  return lines;
}

const USAGE = 'braindog automations takes list, show <id>, run <id> or cancel <run>, and --host where a verb takes it.';

/** `braindog automations list|show|run|cancel`, and the exit code the command decides. */
export async function automations(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'list') return list(rest, io);
  if (verb === 'show') return show(rest, io);
  if (verb === 'run') return run(rest, io);
  if (verb === 'cancel') return cancel(rest, io);
  io.say(USAGE);
  return 1;
}

/** One positional and `--host`, or the sentence that says what the verb takes. */
function oneArgument(args: string[], io: AgentIo, wrong: string): { name: string; host: string | undefined } | null {
  let values: { host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token pasted in the wrong place. */
    io.say(wrong);
    return null;
  }
  const [name, ...more] = positionals;
  if (!name || more.length > 0) {
    io.say(wrong);
    return null;
  }
  return { name, host: values.host };
}

async function list(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    io.say('braindog automations list takes --host <host>, and nothing else.');
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.automations();
  if (!answer.ok) return refuse(io, answer);
  if (!Array.isArray(answer.value)) {
    io.say(`${at.to.key} answered automations in a shape this build does not recognise.`);
    return 1;
  }
  /* "YOU CAN READ", because the record holds the list to the lists the caller reads: a token scoped to one project is
     told it sees none, not that the record has none. */
  if (answer.value.length === 0) io.out('No automation you can read is set up on this BrainDog.');
  else {
    io.out('Automations on this BrainDog:');
    for (const a of answer.value) io.out(listLine(a));
  }
  io.answer?.({ value: answer.value });
  return 0;
}

async function show(args: string[], io: AgentIo): Promise<number> {
  const got = oneArgument(args, io, 'braindog automations show takes one automation, as in braindog automations show chase, and --host.');
  if (!got) return 1;
  const at = await connect(got.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.automation(got.name);
  if (!answer.ok) return refuse(io, answer);
  const a: Automation = answer.value;
  if (typeof a?.id !== 'string' || !Array.isArray(a.runs)) {
    io.say(`${got.name} came back in a shape this build does not recognise as an automation.`);
    return 1;
  }
  io.out(`${a.id}  ${a.name}, version ${String(a.version)}.`);
  io.out([starts(a), a.enabled ? 'On.' : 'Turned off.', origin(a), a.next === null ? null : `Next ${when(a.next)}.`].filter((s): s is string => s !== null).join(' '));
  io.out([month(a.month) ?? 'No run this month.', a.open > 0 ? `${plural(a.open, 'run', 'runs')} open.` : null].filter((s): s is string => s !== null).join(' '));
  if (a.runs.length === 0) io.out(a.path === 'inline' ? 'No runs to show: it happens inside the write that starts it.' : 'No run yet.');
  else {
    io.out('Recent runs, newest first:');
    for (const r of a.runs) for (const line of runLines(r)) io.out(line);
  }
  io.answer?.({ value: a });
  return 0;
}

async function run(args: string[], io: AgentIo): Promise<number> {
  const got = oneArgument(args, io, 'braindog automations run takes one automation, as in braindog automations run chase, and --host.');
  if (!got) return 1;
  const at = await connect(got.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.automationRun(got.name);
  if (!answer.ok) return refuse(io, answer);
  io.out(`${got.name} started as ${answer.value.run}. The next drain takes it.`);
  io.answer?.({ value: answer.value });
  return 0;
}

async function cancel(args: string[], io: AgentIo): Promise<number> {
  const got = oneArgument(args, io, "braindog automations cancel takes one run, as in braindog automations cancel <run id>, and --host. The id is under the automation's recent runs.");
  if (!got) return 1;
  const at = await connect(got.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.cancelRun(got.name);
  if (!answer.ok) return refuse(io, answer);
  io.out(`${answer.value.run} is cancelled. A run stopped while it waits never resumes.`);
  io.answer?.({ value: answer.value });
  return 0;
}

const SCRIPTS_USAGE =
  'braindog scripts takes resume <id>, and --host. There is no list: the record has no read that lists scripts yet, and a paused script is named in the event that paused it.';

/** `braindog scripts resume`, and the exit code the command decides. */
export async function scripts(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb !== 'resume') {
    io.say(SCRIPTS_USAGE);
    return 1;
  }
  const got = oneArgument(rest, io, 'braindog scripts resume takes one script, as in braindog scripts resume fx-rates, and --host.');
  if (!got) return 1;
  const at = await connect(got.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.resumeScript(got.name);
  if (!answer.ok) return refuse(io, answer);
  /* NOT A FIX, as `script-run.ts` says: a source that still fails pauses again, and a person should hear that now. */
  io.out(`${answer.value.script} runs again now. Three more refused runs in a row pause it again.`);
  io.answer?.({ value: answer.value });
  return 0;
}
