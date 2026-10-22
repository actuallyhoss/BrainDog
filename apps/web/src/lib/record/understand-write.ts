/**
 * READ WHAT YOU ALREADY HAVE ("understanding is the engine's first job"): the record's walk over what it
 * holds, asked for by hand from Settings › People. Each old payment linked to who it was with, each run to its project,
 * each service to what it is for, a slice at a time, the doubtful ones filed on Decide as questions.
 *
 * A DRY LOOK FIRST, THEN DO IT. `understand({ dry: true })` answers what the next slice would do, in names, and keeps
 * nothing; `understand({})` does it and answers the batches its Undo takes back (`understand({ undo })`). The record's
 * `understandPlan`, where a build has it, is the same look under its own name, and is asked first.
 *
 * OWNER ONLY, as the record is (ADMIN): anybody else is refused with its own sentence. A ROUTE-ONLY MODULE, like
 * `undo-write.ts`: the fetch is handed in, so a test drives every branch without a socket.
 */

import { createClient } from '@braindog/client';

import { list } from '../copy/english.ts';
import { forget, type Fetch } from './boot-live.ts';

/** What the look or the walk said, in a person's words. */
export type Look = {
  /** One sentence for the whole of it: what it links, and what it adds. */
  said: string;
  /** The first changes, in names, as the record says them ("Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios"). */
  lines: string[];
  /** How many changes past those lines, said, or `null`. */
  more: string | null;
  /** What it would ask, or asked, on Decide, or `null` when nothing. */
  asks: string | null;
  /** Whether this slice read to the end, so there is no next part. */
  done: boolean;
  /** Whether it links or asks nothing at all, which leaves no Do it to press. */
  empty: boolean;
};

export type Read =
  | { from: 'look'; look: Look }
  | { from: 'done'; look: Look; undo: string[] }
  | { from: 'undone'; said: string }
  | { from: 'refused'; fix: string }
  | { from: 'missing'; fix: string };

export const understandWords = {
  title: 'Read what you already have',
  hint: 'Link your old payments, runs and services to who and what they are about. Nothing changes until you say.',
  look: 'Look first',
  looking: 'Reading',
  doIt: 'Do it',
  notNow: 'Not now',
  undo: 'Undo',
  lookAgain: 'Look at the next part',
  close: 'Done',
  payments: (n: number) => (n === 1 ? '1 payment to who it was with' : `${fmt(n)} payments to who they were with`),
  runs: (n: number) => (n === 1 ? '1 run to its project' : `${fmt(n)} runs to their projects`),
  services: (n: number) => (n === 1 ? '1 service to what it is for' : `${fmt(n)} services to what they are for`),
  organisations: (n: number) => (n === 1 ? '1 organisation' : `${fmt(n)} organisations`),
  would: (links: string[], orgs: string | null) => `This would link ${list(links)}${orgs ? `, and add ${orgs}` : ''}.`,
  did: (links: string[], orgs: string | null) => `Linked ${list(links)}${orgs ? `, and added ${orgs}` : ''}.`,
  wouldAdd: (orgs: string) => `This would add ${orgs}.`,
  added: (orgs: string) => `Added ${orgs}.`,
  nothing: 'Nothing new to link: what you have is read already.',
  nothingDone: 'Nothing new was linked.',
  more: (n: number) => (n === 1 ? 'and 1 more' : `and ${fmt(n)} more`),
  wouldAsk: (n: number) => (n === 1 ? '1 it is not sure of goes to Needs you as a question.' : `${fmt(n)} it is not sure of go to Needs you as questions.`),
  asked: (n: number) => (n === 1 ? '1 question is in Needs you.' : `${fmt(n)} questions are in Needs you.`),
  nextPart: 'There is more after this part.',
  /** A record whose answer this build cannot read. */
  unread: 'BrainDog answered in a way this page cannot read. Nothing was changed.',
} as const;

function fmt(n: number): string {
  return n.toLocaleString('en-GB');
}

type Wire = { ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

const isRow = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

/* A RECORD WITH NO SUCH WALK, or a host with no such route. */
const MISSING = new Set(['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN']);

const failed = (out: Exclude<Wire, { ok: true }>): Extract<Read, { from: 'refused' | 'missing' }> =>
  'conflict' in out ? { from: 'refused', fix: understandWords.unread } : MISSING.has(out.refusal.code) ? { from: 'missing', fix: out.refusal.fix } : { from: 'refused', fix: out.refusal.fix };

/**
 * The record's answer in a person's words, or `null` for one this build cannot read. `dry` picks the tense: what it
 * would do, or what it did.
 */
export function lookOf(v: unknown, dry: boolean): Look | null {
  if (!isRow(v) || !Array.isArray(v.kinds)) return null;
  const w = understandWords;
  const linked = { payments: 0, runs: 0, services: 0 };
  let orgs = 0;
  for (const k of v.kinds) {
    if (!isRow(k) || typeof k.kind !== 'string' || !(k.kind in linked)) continue;
    linked[k.kind as keyof typeof linked] += count(k.linked);
    orgs += count(k.organisations);
  }
  const links = [
    ...(linked.payments > 0 ? [w.payments(linked.payments)] : []),
    ...(linked.runs > 0 ? [w.runs(linked.runs)] : []),
    ...(linked.services > 0 ? [w.services(linked.services)] : []),
  ];
  const added = orgs > 0 ? w.organisations(orgs) : null;
  /* WHAT IT ASKS: dry, every question it would file, counted by kind; done, the ones it filed. */
  const asked = Object.values(isRow(v.asks) ? v.asks : {}).reduce<number>((n, c) => n + count(c), 0);
  const asks = dry ? Math.max(asked, strings(v.questions).length) : Array.isArray(v.filed) ? v.filed.length : 0;
  const lines = strings(v.writes);
  const more = count(v.more);
  const empty = links.length === 0 && added === null && asks === 0;
  const said =
    links.length > 0 ? (dry ? w.would(links, added) : w.did(links, added)) : added !== null ? (dry ? w.wouldAdd(added) : w.added(added)) : dry ? w.nothing : w.nothingDone;
  return {
    said,
    lines,
    more: more > 0 ? w.more(more) : null,
    asks: asks === 0 ? null : dry ? w.wouldAsk(asks) : w.asked(asks),
    done: v.done !== false,
    empty,
  };
}

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/** The dry look: what the next part would do, and nothing kept. `understandPlan` first, where the record has it. */
export async function lookFirst(base: string, io?: Fetch): Promise<Read> {
  const client = clientOf(base, io);
  const planned = (await client.call('understandPlan', {})) as Wire;
  const read = planned.ok ? lookOf(planned.value, true) : null;
  if (read) return { from: 'look', look: read };
  /* NO `understandPlan` HERE, or an answer in a shape this build does not read: the same look, by its older name. A
     refusal that is not a missing route is the record's own, and is said. */
  if (!planned.ok && !('conflict' in planned) && !MISSING.has(planned.refusal.code)) return failed(planned);
  const out = (await client.call('understand', { dry: true })) as Wire;
  if (!out.ok) return failed(out);
  const look = lookOf(out.value, true);
  return look ? { from: 'look', look } : { from: 'refused', fix: understandWords.unread };
}

/** Do it: the next part, as the night would have, with what Undo takes back. */
export async function doIt(base: string, io?: Fetch): Promise<Read> {
  const out = (await clientOf(base, io).call('understand', {})) as Wire;
  if (!out.ok) return failed(out);
  forget();
  const look = lookOf(out.value, false);
  if (!look) return { from: 'refused', fix: understandWords.unread };
  return { from: 'done', look, undo: isRow(out.value) ? strings(out.value.undo) : [] };
}

/** Put back what Do it did, by the batches it answered. The sentence is the record's. */
export async function undoIt(base: string, undo: readonly string[], io?: Fetch): Promise<Read> {
  const out = (await clientOf(base, io).call('understand', { undo: [...undo] })) as Wire;
  if (!out.ok) return failed(out);
  forget();
  const said = isRow(out.value) && typeof out.value.said === 'string' && out.value.said.trim() !== '' ? out.value.said.trim() : understandWords.nothingDone;
  return { from: 'undone', said };
}
