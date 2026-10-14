/**
 * `braindog tidy [--json]`: what went stale on the record, read now, and the call that clears each (AGT-D03, over
 * AGT-C18's registry). Steps left earlier that nobody took, questions that waited, and a line for each finder that
 * found something, each as the record says it.
 *
 * ONE READ AND NOTHING ELSE. It sends the record's `stale`, a GET, and no session headers, so it names no run, opens
 * none and fires no hook. It files nothing and answers nothing: the line under each kind says the call that clears it,
 * and making that call is the reader's. Under `--json` the record's answer goes out untouched.
 *
 * THE ANSWER IS READ AS THE RECORD GIVES IT, a part it leaves out read as nothing, so a kind a finder adds later is
 * printed by its own sentence without a change here. The kind itself is the record's handle for a line and is never
 * printed. Every line is scrubbed for the terminal first (`printable`).
 */

import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE = 'braindog tidy takes [--json] and [--host <host>], as in braindog tidy --json. It reads only, so there is nothing to apply.';

/** What a record with no such read is told, which is not a failure of the command. */
const OLDER = 'This BrainDog is older than this command and cannot say what is stale yet. It will once it is updated.';

/** One kind of stale thing as this command reads it: its sentence, how many, and the call that clears it ('' when none). */
export type StaleLine = { said: string; count: number; clear: string };

/** The record's answer as this command reads it: a line a kind, and how many things in all. */
export type StaleRead = { lines: StaleLine[]; count: number };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * The record's answer (`stale` in `packages/record/src/methods/stale.ts`), read as `unknown`: `{ lines, count }`, each
 * line `{ kind, said, count, clear }`. A line with no sentence, or that counts nothing, is not a line. The whole is the
 * record's own number when it gives one, and the lines' counts added up when it does not.
 */
export function readStale(value: unknown): StaleRead {
  const list = isObject(value) && Array.isArray(value.lines) ? value.lines : [];
  const lines = list.flatMap((one): StaleLine[] => {
    if (!isObject(one)) return [];
    const said = text(one.said);
    const count = whole(one.count);
    return said === '' || count === 0 ? [] : [{ said, count, clear: text(one.clear) }];
  });
  const own = isObject(value) && typeof value.count === 'number' ? whole(value.count) : null;
  return { lines, count: own ?? lines.reduce((sum, l) => sum + l.count, 0) };
}

/** A sentence closed with a full stop only when it has none of its own. */
const closed = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * What is stale, a person's way: a line a kind with its count first, the call that clears it under it, and the whole
 * last. The counts are set to one width, so every sentence starts in the same column.
 */
export function tidyLines(read: StaleRead): string[] {
  if (read.lines.length === 0 && read.count === 0) return ['Nothing is stale.'];
  const width = Math.max(0, ...read.lines.map((l) => String(l.count).length));
  const out: string[] = [];
  for (const l of read.lines) {
    out.push(`${String(l.count).padStart(width)}  ${closed(l.said)}`);
    if (l.clear !== '') out.push(`${' '.repeat(width + 2)}Clear it: ${closed(l.clear)}`);
  }
  if (out.length > 0) out.push('');
  out.push(read.count === 1 ? '1 thing is stale.' : `${String(read.count)} things are stale.`);
  return out;
}

/** Whether the record refused because it has no such read: an older build, or a host that knows no such route. */
const older = (r: Result<unknown>): boolean => refused(r) && (r.refusal.code === 'NOT_IN_THIS_BUILD' || r.refusal.code === 'ROUTE_UNKNOWN');

/**
 * `braindog tidy [--json] [--host <host>]`, and the exit code: 0 read, 1 refused, 3 unreachable.
 *
 * STALE THINGS STILL EXIT 0, as a red sign does in `braindog signs`: the command read them, and that is the answer. A
 * RECORD OLDER THAN THE COMMAND EXITS 0 TOO, with one sentence: nothing is wrong with what the person typed, and a
 * script that runs this on every machine should not stop on the one not updated yet.
 */
export async function tidyCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /* NO SESSION HEADERS, so the read names no run and the record has no run to open or move. */
  const client = clientFor(to, async () => ({}), AbortSignal.timeout(budgetOf(io.env)));
  const answer: Result<unknown> = await client.call('stale');
  if (!answer.ok) {
    if (older(answer)) {
      io.out(OLDER);
      return 0;
    }
    return refuse(io, answer, refused(answer) && answer.refusal.code === 'UNREACHABLE' ? `${to.key} did not answer.` : printable(fixOf(answer)));
  }
  io.answer?.({ value: answer.value });
  for (const line of tidyLines(printable(readStale(answer.value)))) io.out(line);
  return 0;
}
