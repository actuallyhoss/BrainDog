/**
 * `braindog automations list|show|run|cancel` and `braindog scripts list|resume`: the record's automations and scripts from a
 * terminal, over the methods the canvas and an agent's MCP tools already call.
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
 * `scripts list` WAS REFUSED HERE UNTIL THE RECORD HAD A READ TO ANSWER IT. Measured across
 * `packages/host/src/index.ts`'s route table: no method read the `schedule` rows of kind `script` or listed script
 * declarations, and `actions` filters to `pull`, `call` and `poll`, so a list verb here would have had to invent its
 * answer. The record's READ+ `scripts` is that read now, held to the lists each script touches, and `list` prints it.
 *
 * PLAIN SENTENCES FOR A PERSON, THE RECORD'S OWN OBJECTS FOR AN AGENT. Under `--json` the value is exactly what the
 * record answered, handed over with `io.answer`, so an agent branches on `state` and `last.state` rather than splitting
 * the lines below back apart.
 *
 * EVERY LINE IS BUILT FROM A SCRUBBED COPY. Almost every string these lines print was written by somebody other than the
 * person running the command: a step's answer is what a row's field filled it with, and the row belongs to whoever may
 * append to the list. An audit measured an OSC 52, an OSC 0 and a CR plus CSI 2K reaching the owner's
 * terminal byte for byte through `show`. Each verb now passes the record's answer through `printable` once, before any
 * line is built, and a refusal's sentence through it as well; the value `io.answer` hands an agent is the one the record
 * sent, untouched.
 */

import { parseArgs } from 'node:util';

import type { Automation, AutomationRow, AutomationRun, ScriptRow } from '@braindog/client';
import { fixOf, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { refuse as refuseAll } from './json.ts';
import { connect, type AgentIo } from './skills.ts';

/* A REFUSAL'S SENTENCE QUOTES WHAT IT WAS HANDED: `DECLARATION_UNKNOWN` names the rule back, and the record, not this
   command, decides what else a `fix` carries. So the sentence goes to the terminal as one clean line, and the refusal
   itself to an agent whole, exactly as `json.ts` sends it. `printable` AND NOT `oneLine`, because `fixOf` is typed
   string but hands back whatever the host put in `fix`: a `fix` of 7 made `oneLine` throw, and the refusal's code never
   reached the `--json` envelope. `printable` scrubs a string and passes anything else through, as before the scrub. */
const refuse = (io: AgentIo, r: Result<unknown>): number => refuseAll(io, r, printable(fixOf(r)));

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
   field filled it with, and printed as kept, a note's line breaks split the step list into lines that named no step.
   `printable` has already made it one line, control characters and all, by the time it reaches here. */
const ANSWER_SHOWN = 120;

function runLines(r: AutomationRun): string[] {
  const lines = [`  ${r.id}  ${r.state}  ${when(r.started_at)}, by ${r.actor} ${began(r.trigger)}.${r.say ? ` ${closed(r.say)}` : ''}`];
  for (const s of r.steps) {
    const answer = typeof s.answer !== 'string' ? '' : ` (${s.answer.length > ANSWER_SHOWN ? `${s.answer.slice(0, ANSWER_SHOWN)}...` : s.answer})`;
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
    for (const a of printable(answer.value)) io.out(listLine(a));
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
  const kept: Automation = answer.value;
  if (typeof kept?.id !== 'string' || !Array.isArray(kept.runs)) {
    io.say(`${got.name} came back in a shape this build does not recognise as an automation.`);
    return 1;
  }
  const a = printable(kept);
  io.out(`${a.id}  ${a.name}, version ${String(a.version)}.`);
  io.out([starts(a), a.enabled ? 'On.' : 'Turned off.', origin(a), a.next === null ? null : `Next ${when(a.next)}.`].filter((s): s is string => s !== null).join(' '));
  io.out([month(a.month) ?? 'No run this month.', a.open > 0 ? `${plural(a.open, 'run', 'runs')} open.` : null].filter((s): s is string => s !== null).join(' '));
  if (a.runs.length === 0) io.out(a.path === 'inline' ? 'No runs to show: it happens inside the write that starts it.' : 'No run yet.');
  else {
    io.out('Recent runs, newest first:');
    for (const r of a.runs) for (const line of runLines(r)) io.out(line);
  }
  io.answer?.({ value: kept });
  return 0;
}

async function run(args: string[], io: AgentIo): Promise<number> {
  const got = oneArgument(args, io, 'braindog automations run takes one automation, as in braindog automations run chase, and --host.');
  if (!got) return 1;
  const at = await connect(got.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.automationRun(got.name);
  if (!answer.ok) return refuse(io, answer);
  /* THE ID IS THE RECORD'S, NOT A CONSTANT. These three verbs print one field each and skipped `printable` on the
     grounds that an id is not somebody's words; a stub answering `run` with a DEL and a U+009B in it put both on the
     terminal. The name typed is the person's own and is printed as typed. */
  io.out(`${got.name} started as ${printable(answer.value).run}. The next drain takes it.`);
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
  io.out(`${printable(answer.value).run} is cancelled. A run stopped while it waits never resumes.`);
  io.answer?.({ value: answer.value });
  return 0;
}

const SCRIPTS_USAGE = 'braindog scripts takes list, or resume <id>, and --host.';

/** How a script starts, as a sentence: its clock, the door that hands it an arrival, a rule's `run:`, or any of them. */
function scriptStarts(r: ScriptRow['runs']): string {
  const ways = [r.every === null ? null : `Every ${r.every}`, r.door === null ? null : `When ${r.door} receives an arrival`, r.rule ? 'When a rule runs it' : null].filter((w): w is string => w !== null);
  if (ways.length === 0) return 'Nothing starts it.';
  return `${ways.map((w, i) => (i === 0 ? w : w.charAt(0).toLowerCase() + w.slice(1))).join(', or ')}.`;
}

function scriptLine(s: ScriptRow): string {
  const said = [
    s.title === s.script ? null : closed(s.title),
    scriptStarts(s.runs),
    /* PAUSED SAYS WHERE THE BUTTON IS: `resume` from this command is ADMIN and a token is refused at that door. */
    s.status === 'paused' ? `Paused: its last ${String(s.refused.pauses_at)} runs were refused, and it runs again only when somebody resumes it in the app.` : null,
    s.pack === null ? null : `From ${s.pack}.`,
    s.next === null ? null : `Next ${when(s.next)}.`,
    s.last === null ? 'No run yet.' : `Last run ${s.last.outcome} at ${when(s.last.at)}${s.last.say ? `: ${closed(s.last.say)}` : '.'}`,
    s.status !== 'paused' && s.refused.in_a_row > 0 ? `${plural(s.refused.in_a_row, 'refused run', 'refused runs')} in a row; ${String(s.refused.pauses_at)} pause it.` : null,
    s.month.runs === 0 ? null : `This month ${plural(s.month.runs, 'run', 'runs')}: ${String(s.month.ok)} ok, ${String(s.month.refused)} refused.`,
    s.reads.length === 0 ? null : `Reads ${s.reads.join(', ')}.`,
    s.writes.length === 0 ? null : `Writes ${s.writes.join(', ')}.`,
    s.egress.length === 0 ? null : `Fetches from ${s.egress.join(', ')}.`,
  ].filter((x): x is string => x !== null);
  return `  ${s.script}  ${said.join(' ')}`;
}

/** `braindog scripts list|resume`, and the exit code the command decides. */
export async function scripts(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'list') return scriptList(rest, io);
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
  io.out(`${printable(answer.value).script} runs again now. Three more refused runs in a row pause it again.`);
  io.answer?.({ value: answer.value });
  return 0;
}

async function scriptList(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    io.say('braindog scripts list takes --host <host>, and nothing else.');
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.scripts();
  if (!answer.ok) return refuse(io, answer);
  if (!Array.isArray(answer.value)) {
    io.say(`${at.to.key} answered scripts in a shape this build does not recognise.`);
    return 1;
  }
  /* "YOU CAN READ", as for automations: the record shows a script only to a caller who reads every list it touches. */
  if (answer.value.length === 0) io.out('No script you can read is installed on this BrainDog.');
  else {
    io.out('Scripts on this BrainDog:');
    for (const s of printable(answer.value)) io.out(scriptLine(s));
  }
  io.answer?.({ value: answer.value });
  return 0;
}
