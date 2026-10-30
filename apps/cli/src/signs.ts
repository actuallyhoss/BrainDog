/**
 * `braindog signs [--json] [--strict]`: the record's vital signs, read now (a daily check watches all of
 * that). Whether bank messages are being filed, whether project numbers still arrive, whether questions pile up on one
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

const USAGE = 'braindog signs takes [--json], [--strict] and [--host <host>], as in braindog signs --strict.';

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

/** The word beside each state, so the state is never a colour alone. */
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

/** The signs a terminal can print for the codes a person reads most; any other currency keeps its code. */
const SIGN: Readonly<Record<string, string>> = { GBP: '£', EUR: '€', USD: '$', JPY: '¥', INR: '₹' };

/** The runtime's tender list, so "ISO 4217" in a sentence is the standard's name and not four thousand of anything. */
const TENDER: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/**
 * MONEY IN A SIGN'S SENTENCE AS A PERSON SAYS IT (audit 6g, AG1). A rule's question keeps its amount the way the record
 * writes money into a sentence, "GBP 2,400.00", and the oldest question's fact printed it so: now "£2,400", the pence
 * kept only where they are not round, and "EGP 58,185.54" for a currency with no sign here.
 */
export function moneySaid(text: string): string {
  return text.replace(/\b([A-Z]{3}) ([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\b/gu, (hit, code: string, minus: string, whole: string, fraction?: string) => {
    if (!TENDER.has(code)) return hit;
    const digits = whole.replace(/,/gu, '').replace(/\B(?=(?:\d{3})+$)/gu, ',');
    const cents = fraction !== undefined && /^\.0+$/u.test(fraction) ? '' : (fraction ?? '');
    const sign = SIGN[code];
    const less = minus === '' ? '' : '−';
    return sign === undefined ? `${code} ${less}${digits}${cents}` : `${less}${sign}${digits}${cents}`;
  });
}

/**
 * The one line for the whole. A sign not read yet is never counted as fine: a record where nothing could be read said
 * "All 16 signs are fine, or not read yet.", which a person reads as fine.
 */
function headline(signs: readonly SignRead[]): string {
  const red = signs.filter((s) => s.state === 'red').length;
  const none = signs.filter((s) => s.state === 'none').length;
  if (red > 0) return `${String(red)} of ${String(signs.length)} signs need a look.`;
  if (none === signs.length) return signs.length === 1 ? 'The one sign has not been read yet.' : 'No sign has been read yet.';
  const fine = signs.length - none;
  if (none === 0) return signs.length === 1 ? 'The one sign is fine.' : `All ${String(signs.length)} signs are fine.`;
  return `${fine === 1 ? '1 sign is' : `${String(fine)} signs are`} fine. ${none === 1 ? '1 has' : `${String(none)} have`} not been read yet.`;
}

/**
 * What the signs say, a person's way: one line for the whole, then each sign with its word, its sentence, a few of its
 * facts, and how many of its last days it read red, when any did.
 */
export function signLines(signs: readonly SignRead[]): string[] {
  if (signs.length === 0) return ['Your BrainDog has no signs to read yet.'];
  const out = [headline(signs)];
  for (const s of signs) {
    out.push('', `${s.name}: ${WORDS[s.state]}`);
    if (s.said !== '') out.push(`  ${closed(moneySaid(s.said))}`);
    for (const fact of s.facts.slice(0, FACTS_SHOWN)) out.push(`  ${closed(moneySaid(fact))}`);
    const reds = s.days.filter((d) => d === 'red').length;
    /* ONLY WHEN IT WAS RED AT ALL (AG34): "Red on 0 of the last 14 days." under every fine sign said nothing. */
    if (reds > 0) out.push(`  Red on ${String(reds)} of the last ${String(s.days.length)} ${s.days.length === 1 ? 'day' : 'days'}.`);
  }
  return out;
}

/** The sentence for a record that will not answer, by why. */
function refusalLine(r: Result<unknown>, to: Target): string {
  if (!refused(r)) return printable(fixOf(r));
  const { code } = r.refusal;
  if (code === 'UNREACHABLE') return `${to.key} did not answer.`;
  if (code === 'ROUTE_UNKNOWN' || code === 'NOT_IN_THIS_BUILD') return 'Your BrainDog is older than this command and cannot read its signs yet. It will once it is updated.';
  return printable(fixOf(r));
}

/**
 * `braindog signs [--json] [--strict] [--host <host>]`, and the exit code: 0 read, 1 refused, 3 unreachable.
 *
 * A RED SIGN STILL EXITS 0, ON PURPOSE. The command read the signs, and a sign that needs a look is the answer, not a
 * failure of the command: a person, a hook or the loop quoting it should not be told the read failed. A script that
 * wants to stop on a red asks for `--strict`, which exits 2 when any sign reads red and says so on stderr.
 */
export async function signsCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; strict?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { host: { type: 'string' }, strict: { type: 'boolean' } } }));
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
  const signs = printable(readSigns(answer.value));
  for (const line of signLines(signs)) io.out(line);
  const red = signs.filter((s) => s.state === 'red').length;
  if (values.strict !== true || red === 0) return 0;
  io.say(`${red === 1 ? '1 sign needs' : `${String(red)} signs need`} a look, so this ends with exit 2 as --strict asks.`);
  return 2;
}
