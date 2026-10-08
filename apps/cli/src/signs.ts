/**
 * `braindog signs [--json]`: the record's vital signs, read now (PRF-A01, DIRECTION §40 "a daily check watches all of
 * that"). Whether bank messages are being filed, whether project numbers still arrive, whether questions pile up on one
 * cause, how old the oldest open question is, and whether runs end true, each as the record says it.
 *
 * ONE READ AND NOTHING ELSE. It sends the record's `signs`, a GET, and no session headers, so it names no run, opens
 * none and fires no hook: a person or an agent asking whether the record is alive has not started any work. Under
 * `--json` the record's answer goes out untouched, which is what the loop and the batch report quote.
 *
 * THE ANSWER IS READ AS THE RECORD GIVES IT, a part it leaves out read as nothing, so a sign the kernel adds later is
 * printed by its own name and sentence without a change here. Every line is scrubbed for the terminal first
 * (`printable`).
 */

import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE = 'braindog signs takes [--json] and [--host <host>], as in braindog signs --json.';

/** A sign's state as the kernel stores it (`sign_reading.state`): green, red, or none when nothing could be read. */
export type SignState = 'green' | 'red' | 'none';

/** One sign as this command reads it: its name, its state, its sentence, its facts, and its last days oldest first. */
export type SignRead = { id: string; name: string; state: SignState; said: string; facts: string[]; days: SignState[] };

/**
 * What each of the five signs is called (`SIGNS` in `packages/kernel/src/signs.ts`), so a person reads a name and never
 * the id. A sign that is not here, or that the record names itself, is read by the record's name.
 */
const NAMES: Record<string, string> = {
  'arrivals-filed': 'Arrivals filed',
  'numbers-arrive': 'Numbers arriving',
  'questions-by-cause': 'Questions by cause',
  'oldest-question': 'Oldest question',
  'runs-true': 'Runs ending true',
};

/** The word beside each state, so the state is never a colour alone (DIRECTION §42). */
const WORDS: Record<SignState, string> = { red: 'Needs a look', green: 'Fine', none: 'Not read yet' };

/** The most facts printed under one sign; the record keeps them short already. */
export const FACTS_SHOWN = 3;

const stateOf = (v: unknown): SignState => (v === 'green' || v === 'red' ? v : 'none');
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A sign's id as a name: the record's own, the known five, or the id with its dashes as spaces. */
function nameOf(id: string, said: unknown): string {
  const own = text(said);
  if (own !== '') return own;
  const known = NAMES[id];
  if (known !== undefined) return known;
  const plain = id.replace(/[-_.]+/g, ' ').trim();
  return plain === '' ? 'A sign' : `${plain[0]!.toUpperCase()}${plain.slice(1)}`;
}

/**
 * The record's answer (`signs()` in the kernel), read as `unknown`: a list of signs, or an object holding one under
 * `signs`. Each sign by `sign` or `id`, with `state`, `said`, `facts`, and its last days under `days` (or `past`), each a
 * state or `{ day, state }`.
 */
export function readSigns(value: unknown): SignRead[] {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.signs) ? value.signs : [];
  return list.flatMap((one): SignRead[] => {
    if (!isObject(one)) return [];
    const id = text(one.sign) || text(one.id);
    if (id === '') return [];
    const past = Array.isArray(one.days) ? one.days : Array.isArray(one.past) ? one.past : [];
    return [
      {
        id,
        name: nameOf(id, one.name),
        state: stateOf(one.state),
        said: text(one.said),
        facts: Array.isArray(one.facts) ? one.facts.flatMap((f) => (text(f) === '' ? [] : [text(f)])) : [],
        days: past.map((d) => stateOf(isObject(d) ? d.state : d)),
      },
    ];
  });
}

/** A sentence closed with a full stop only when it has none of its own. */
const closed = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * What the signs say, a person's way: one line for the whole, then each sign with its word, its sentence, a few of its
 * facts, and how many of its last days it read red.
 */
export function signLines(signs: readonly SignRead[]): string[] {
  if (signs.length === 0) return ['Your record has no signs to read yet.'];
  const red = signs.filter((s) => s.state === 'red').length;
  const out = [
    red === 0
      ? `${signs.length === 1 ? 'The one sign is' : `All ${String(signs.length)} signs are`} fine${signs.some((s) => s.state === 'none') ? ', or not read yet' : ''}.`
      : `${String(red)} of ${String(signs.length)} signs need a look.`,
  ];
  for (const s of signs) {
    out.push('', `${s.name}: ${WORDS[s.state]}`);
    if (s.said !== '') out.push(`  ${closed(s.said)}`);
    for (const fact of s.facts.slice(0, FACTS_SHOWN)) out.push(`  ${closed(fact)}`);
    const reds = s.days.filter((d) => d === 'red').length;
    if (s.days.length > 0) out.push(`  Red on ${String(reds)} of the last ${String(s.days.length)} ${s.days.length === 1 ? 'day' : 'days'}.`);
  }
  return out;
}

/** The sentence for a record that will not answer, by why. */
function refusalLine(r: Result<unknown>, to: Target): string {
  if (!refused(r)) return printable(fixOf(r));
  const { code } = r.refusal;
  if (code === 'UNREACHABLE') return `${to.key} did not answer.`;
  if (code === 'ROUTE_UNKNOWN' || code === 'NOT_IN_THIS_BUILD') return 'Your record is older than this command and cannot read its signs yet. It will once it is updated.';
  return printable(fixOf(r));
}

/** `braindog signs [--json] [--host <host>]`, and the exit code: 0 read, 1 refused, 3 unreachable. */
export async function signsCommand(args: string[], io: AgentIo): Promise<number> {
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
  const answer: Result<unknown> = await client.call('signs');
  if (!answer.ok) return refuse(io, answer, refusalLine(answer, to));
  io.answer?.({ value: answer.value });
  for (const line of signLines(printable(readSigns(answer.value)))) io.out(line);
  return 0;
}
