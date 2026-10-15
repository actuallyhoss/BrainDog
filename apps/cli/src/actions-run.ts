/**
 * `braindog actions run <name>`: the Run now on a scheduled action's row, from a terminal.
 *
 * BY ITS NAME, AS A PERSON SAYS IT. The command reads the record's `actions` (READ+, held to what the caller may read)
 * and finds the one whose name is the one typed: its id as the record spells it, or the same id in words, any case
 * ("tide-tables", "Tide tables"). A name nobody has is a sentence that says which names there are, never a code.
 *
 * THE PRESS IS THE RECORD'S `actionRun({ ingest })`. It moves the action's next turn to now and wakes its clock; it
 * makes no request to the action's host. A paused or held action answers its own sentence and does not run, and a
 * second press inside the minute is `RATE_LIMITED` with `retry_after`, which the door sends as 429 and `Retry-After`.
 * Each is printed as one line: the turn as "runs in a moment", the wait in words, every other refusal as the record
 * wrote it. A token at a door the record keeps for a browser (`NEEDS_BROWSER_SESSION`) is that sentence, as
 * `automations run` prints its own.
 *
 * THE CALL IS HANDED IN, so a test answers it without the route table. `@braindog/client` refuses a method missing
 * from `ROUTES` before it sends anything; the day the host's route table holds `actionRun`, the default below reaches
 * it with no change here, and until then the person reads that the record has no such method.
 *
 * `--json` IS THE RECORD'S ANSWER, untouched, handed over with `io.answer`; the lines go through `printable` first,
 * because an action's name and the record's sentences are text somebody else wrote.
 */

import { parseArgs } from 'node:util';

import type { ActionRow, Client } from '@braindog/client';
import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { refuse as refuseAll } from './json.ts';
import { connect, type AgentIo } from './skills.ts';

/** What `actionRun` answers when the action will run. */
export type Ran = { ingest: string; due_at: string; said?: string };

export type ActionsDeps = {
  /** The press. By default the record's `actionRun` through the client. */
  run?: (client: Client, ingest: string) => Promise<Result<Ran>>;
  /** This machine's clock, for a turn due later than a moment. */
  now?: () => number;
};

const USAGE = 'braindog actions takes run <name>, as in braindog actions run tide-tables, and --host.';

const pressRecord = (client: Client, ingest: string): Promise<Result<Ran>> => client.call<Ran>('actionRun', { ingest });

/** The id in words, as the app names an action: the part after a namespace, its separators as spaces, any case. */
const spoken = (id: string): string =>
  id
    .slice(id.lastIndexOf(':') + 1)
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[-_.\s]+/gu, ' ')
    .trim()
    .toLowerCase();

/** The name as the app shows it (`humanize` in the web's `names.ts`): the id in words, its own capitals kept, with one more. */
const named = (id: string): string => {
  const w = id
    .slice(id.lastIndexOf(':') + 1)
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[-_.\s]+/gu, ' ')
    .trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/* EVERY UNIT HERE TAKES AN S FOR MORE THAN ONE, so the word is written once. */
const count = (n: number, unit: string): string => `${String(n)} ${unit}${n === 1 ? '' : 's'}`;

/** A wait in words: seconds to ninety, then whole minutes rounded up, then hours. Never a bare count past ninety. */
export function waitWords(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s <= 90) return count(s, 'second');
  const m = Math.ceil(s / 60);
  if (m <= 90) return count(m, 'minute');
  return count(Math.ceil(m / 60), 'hour');
}

/** The action whose name is the one typed, every one that shares it, or none. */
export function findAction(rows: readonly ActionRow[], typed: string): ActionRow[] {
  const exact = rows.filter((r) => r.ingest === typed);
  if (exact.length > 0) return exact;
  const want = spoken(typed);
  return want === '' ? [] : rows.filter((r) => spoken(r.ingest) === want);
}

/** `braindog actions run <name>`, and the exit code the command decides. */
export async function actionsCommand(args: string[], io: AgentIo, deps: ActionsDeps = {}): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'run') return run(rest, io, deps);
  io.say(USAGE);
  return 1;
}

async function run(args: string[], io: AgentIo, deps: ActionsDeps): Promise<number> {
  let values: { host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token pasted in the wrong place. */
    io.say(USAGE);
    return 1;
  }
  /* A NAME IN WORDS MAY COME UNQUOTED: `actions run tide tables` is the same action as `tide-tables`. */
  const typed = positionals.join(' ').trim();
  if (typed === '') {
    io.say(USAGE);
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  const listed = await at.client.actions();
  if (!listed.ok) return refuseAll(io, listed, printable(fixOf(listed)));
  if (!Array.isArray(listed.value)) {
    io.say(`${at.to.key} answered actions in a shape this build does not recognise.`);
    return 1;
  }
  const found = findAction(listed.value, typed);
  const shown = printable(typed);
  if (found.length === 0) {
    /* THEIR NAMES IN WORDS, which this command takes as readily as the ids. */
    const names = printable(listed.value.map((r) => named(r.ingest)));
    io.say(
      names.length === 0
        ? `No scheduled action you can read is set up on this BrainDog, so there is no ${shown} to run.`
        : `No scheduled action you can read is called ${shown}. The ones there are: ${names.join(', ')}.`,
    );
    return 1;
  }
  if (found.length > 1) {
    io.say(`More than one action is called ${shown}: ${printable(found.map((r) => r.ingest)).join(', ')}. Name one as it is spelled there.`);
    return 1;
  }
  const action = found[0] as ActionRow;
  const name = printable(named(action.ingest));
  const answer = await (deps.run ?? pressRecord)(at.client, action.ingest);
  if (!answer.ok) {
    if (refused(answer) && answer.refusal.code === 'RATE_LIMITED') {
      const wait = (answer.refusal as { retry_after?: unknown }).retry_after;
      const line =
        typeof wait !== 'number' || !Number.isFinite(wait)
          ? `${name} was pressed a moment ago. Try again in a minute.`
          : wait <= 60
            ? `${name} was pressed a moment ago. Try again in ${waitWords(wait)}.`
            : `Run now has been pressed as often as this hour allows. Try again in ${waitWords(wait)}.`;
      return refuseAll(io, answer, line);
    }
    /* PAUSED, HELD, A TOKEN AT A BROWSER'S DOOR: the record's own sentence, one clean line. */
    return refuseAll(io, answer, printable(fixOf(answer)));
  }
  const v = answer.value;
  const said = typeof v?.said === 'string' && v.said.trim() !== '' ? printable(v.said.trim()) : null;
  const due = typeof v?.due_at === 'string' ? Date.parse(v.due_at) : Number.NaN;
  const ahead = Number.isFinite(due) ? due - (deps.now ?? Date.now)() : 0;
  io.out(said ?? (ahead <= 2 * 60 * 1000 ? `${name} runs in a moment.` : `${name} runs in ${waitWords(ahead / 1000)}.`));
  io.answer?.({ value: v });
  return 0;
}
