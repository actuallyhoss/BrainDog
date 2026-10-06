/**
 * `braindog understand --dry-run`: what the record's walk over what it already holds would do now (DIRECTION §38,
 * "understanding is the engine's first job"), read from the record's `understandPlan`. How much of each kind it read,
 * how many of each it would link, the first of those links, and what it would ask on Decide, all in names.
 *
 * ONLY THE DRY RUN. The walk itself links rows on every list it reads and files questions for the whole record, so it is
 * the record's own each night and an owner's in the app on ask; this command never starts it. Without `--dry-run` it says
 * so and sends nothing.
 *
 * `understandPlan` IS A READ, the walk's dry half as a GET a token may send, so a login from this machine reads it. Who
 * may is the record's to say (the owner, reading the whole record), and its refusal is shown as it gives it. A record
 * built before the read answers that it has no such method, and is told it is older than this command.
 *
 * THE ANSWER IS READ AS THE RECORD GIVES IT (`Understood` in `@braindog/client`), a part it leaves out read as nothing:
 * how much of each kind it read and would link, the first changes in names and how many more, its questions and how
 * many in all, and whether the slice reaches the end. Every line is scrubbed for the terminal first (`printable`), and
 * under `--json` the record's value goes to the agent untouched.
 */

import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE = 'braindog understand takes --dry-run and [--host <host>], as in braindog understand --dry-run.';

/** The most planned links a dry run names; the rest are counted. */
export const PLANNED_SHOWN = 10;

/** The most questions a dry run names; the rest are counted. */
export const ASKED_SHOWN = 5;

/** What each kind is called after a count of how many were read. */
const READ: Record<string, [one: string, many: string]> = {
  payments: ['payment', 'payments'],
  runs: ['run', 'runs'],
  services: ['service', 'services'],
};

/** What one kind reads as after its count, in the words a person uses for their own things. */
const KINDS: Record<string, [one: string, many: string]> = {
  payments: ['payment linked to who it was with', 'payments linked to who they were with'],
  runs: ['run placed in its project', 'runs placed in their projects'],
  services: ['service linked to its project', 'services linked to their projects'],
  organisations: ['organisation added', 'organisations added'],
};

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const sentences = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((s) => (typeof s === 'string' && s.trim() !== '' ? [s.trim()] : [])) : []);

/** A kind as a person reads it after its count: the known ones in plain words, any other with its dashes as spaces. */
export function kindLine(kind: string, n: number): string {
  const said = KINDS[kind.toLowerCase()];
  const words = said === undefined ? kind.replace(/[-_.]+/g, ' ').trim() : said[n === 1 ? 0 : 1];
  return `${n.toLocaleString('en-GB')} ${words}`;
}

/** How many of one kind a walk read: `200 payments`, and any other kind with its dashes as spaces. */
export function readLine(kind: string, n: number): string {
  const said = READ[kind.toLowerCase()];
  return `${n.toLocaleString('en-GB')} ${said === undefined ? kind.replace(/[-_.]+/g, ' ').trim() : said[n === 1 ? 0 : 1]}`;
}

/**
 * What a dry run reads as: how many of each kind it read, what it would link by kind, the changes it names and how many
 * in all, the questions it names and how many in all, whether this slice reaches the end of the record, and what it
 * left out.
 */
export type DryRead = { looked: [string, number][]; counts: [string, number][]; planned: string[]; plannedAll: number; asked: string[]; askedAll: number; done: boolean; dropped: string[] };

/**
 * The record's dry answer (`Understood` in `@braindog/client`), read as `unknown` so an answer missing a part reads as
 * nothing of it: `kinds` each with what it would link, and the organisations the payments would add; `writes` and `more`;
 * `questions` and `asks`, the count of every question by kind; `done`; `dropped`.
 */
export function readDry(value: unknown): DryRead {
  const v = isObject(value) ? value : {};
  const looked = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const one of Array.isArray(v.kinds) ? v.kinds : [])
    if (isObject(one) && typeof one.kind === 'string') {
      const read = count(one.looked);
      if (read !== null) looked.set(one.kind, (looked.get(one.kind) ?? 0) + read);
      const n = count(one.linked);
      if (n !== null) counts.set(one.kind, (counts.get(one.kind) ?? 0) + n);
      const orgs = count(one.organisations);
      if (orgs !== null) counts.set('organisations', (counts.get('organisations') ?? 0) + orgs);
    }
  const planned = sentences(v.writes);
  const asked = sentences(v.questions);
  const asks = isObject(v.asks) ? Object.values(v.asks).reduce<number>((sum, n) => sum + (count(n) ?? 0), 0) : 0;
  return {
    looked: [...looked].filter(([, n]) => n > 0),
    counts: [...counts].filter(([, n]) => n > 0),
    planned,
    plannedAll: planned.length + (count(v.more) ?? 0),
    asked,
    askedAll: Math.max(asked.length, asks),
    done: v.done !== false,
    dropped: sentences(v.dropped),
  };
}

/** A sentence closed with a full stop only when it has none of its own. */
const closed = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);

/**
 * What a dry run says, in quiet groups: how much it read, what it would link, the first of those changes, and what it
 * would ask.
 */
export function dryLines(read: DryRead): string[] {
  const { looked, counts, planned, plannedAll, asked, askedAll, done, dropped } = read;
  const rest = done ? [] : ['', 'This is the next part of what your record holds. The rest is read on later nights.'];
  const reads = and(looked.map(([k, n]) => readLine(k, n)));
  const over = reads === '' ? '' : ` over ${reads}`;
  if (counts.length === 0 && planned.length === 0 && asked.length === 0)
    return [
      done
        ? `Nothing to link and nothing to ask${reads === '' ? '' : ` in ${reads}`}: everything your record holds is already understood.`
        : `Nothing to link and nothing to ask in the next ${reads === '' ? 'part' : reads} of your record. The rest is read on later nights.`,
      ...dropped.map(closed),
    ];
  const out = [`A dry run${over}: nothing was changed and nothing was asked.`];
  if (counts.length > 0) out.push('', 'It would link', ...counts.map(([k, n]) => `  ${kindLine(k, n)}`));
  if (planned.length > 0) {
    const shown = planned.slice(0, PLANNED_SHOWN);
    out.push('', plannedAll > shown.length ? `The first ${String(shown.length)} changes` : 'The changes', ...shown.map((s) => `  ${closed(s)}`));
    if (plannedAll > shown.length) out.push(`  and ${(plannedAll - shown.length).toLocaleString('en-GB')} more`);
  }
  if (asked.length > 0) {
    const shown = asked.slice(0, ASKED_SHOWN);
    out.push('', 'It would ask you on Decide', ...shown.map((s) => `  ${closed(s)}`));
    if (askedAll > shown.length) out.push(`  and ${(askedAll - shown.length).toLocaleString('en-GB')} more`);
  }
  out.push(...rest);
  if (dropped.length > 0) out.push('', ...dropped.map(closed));
  return out;
}

/** The sentence for a record that will not read it for this caller, by why. */
function refusalLine(r: Result<unknown>, to: Target): string {
  if (!refused(r)) return printable(fixOf(r));
  const { code } = r.refusal;
  if (code === 'UNREACHABLE') return `${to.key} did not answer.`;
  if (code === 'ROUTE_UNKNOWN' || code === 'NOT_IN_THIS_BUILD')
    return 'Your record is older than this command and cannot say this yet. It will once it is updated.';
  if (code === 'NEEDS_BROWSER_SESSION') return "Only you, signed in to the app, can read this. A key on this machine cannot.";
  return printable(fixOf(r));
}

/** `braindog understand --dry-run [--host <host>]`, and the exit code: 0 read, 1 refused or not a dry run, 3 unreachable. */
export async function understandCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { 'dry-run'?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { 'dry-run': { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  if (values['dry-run'] !== true) {
    io.say('braindog understand only reads, with --dry-run. Your record links what it holds on its own each night, and asks you on Decide about the rest.');
    return 1;
  }
  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  /* A WALK OVER THE WHOLE RECORD is slower than one read, so it is given several reads' time. */
  const client = clientFor(to, async () => headers, AbortSignal.timeout(budgetOf(io.env) * 10));
  const answer: Result<unknown> = await client.understandPlan();
  if (!answer.ok) return refuse(io, answer, refusalLine(answer, to));
  io.answer?.({ value: answer.value });
  for (const line of dryLines(printable(readDry(answer.value)))) io.out(line);
  return 0;
}
