/**
 * A PATTERN QUESTION'S MESSAGES, AS THE PATTERN WOULD READ THEM: who each is from, then each field and its value, and
 * how many more like them wait with what they come to.
 *
 * Decide drew a pattern as its rule and a count ("Drawn from 3 messages"), so a person said yes to a rule without
 * seeing what it would take out of a single message. The record already rehearses a rule over arrivals (`tryPattern`,
 * which the builder runs), and the question already names the arrivals it was drawn from, so this asks the one with
 * the other and says the answer in a person's words.
 *
 * HOW MANY WAIT IS THE KERNEL'S GROUPING, read here. The question carries its samples' ids and not the count
 * (`slash/src/jobs.ts` files `{ ingest, samples }`), so the waiting arrivals are walked and grouped by `shapeOf`, the same
 * key `owedShapes` counts when it owes the shape a draft. `Tried.waited` is not it: that is how many of the rowsets a
 * rule opened were accepted, a different number.
 *
 * THE TOTAL IS SAID ONLY WHEN EVERYTHING WAITING WAS READ. The record reads at most ten arrivals in one rehearsal, so a
 * shape with more waiting than that has its count and no total, never a total of the first ten passed off as all of
 * them. Money is summed in one currency or not at all.
 *
 * A ROUTE-ONLY MODULE, loaded with `PatternReads.svelte` only when the question is a pattern.
 */

import { createClient, type InboxLine } from '@braindog/client';
import { shapeOf } from '@braindog/kernel';
import { money } from 'braindog-render';

import { readSamples, tryPattern, type Sample, type Tried } from '../../../lib/pattern/api.ts';
import { draftOf, type Json } from '../../../lib/pattern/draft.ts';
import { valueSaid } from '../../../lib/pattern/words.ts';
import { humanize } from '../../../lib/record/names.ts';
import { schemaOf } from '../../../lib/record/page-write.ts';
import type { PatternAsked } from './proposed.ts';

/** One message as the pattern reads it: who it is from, then each field the rule fills, by its label, and its value. */
export type Read = { from: string | null; fields: { field: string; value: string }[] };

/**
 * The question's reads: at most `SHOWN` messages, how many more alike wait, what all that waits comes to, and what
 * pressing Accept would do with what waits (`acceptSaid`), `null` when the waiting ones could not be read.
 */
export type PatternReads = { rows: Read[]; waiting: number; total: string | null; accept: string | null };

/** Of the arrivals the rehearsal read, how many the rule reads whole and how many only in part. */
export type Counted = { whole: number; part: number };

/** What the reads say on the screen. Here and not in `copy.ts`: new words go in a `words` object in the module that says them. */
export const words = {
  /** The group's name for a screen reader, which hears the messages apart from the rule above them. */
  group: 'The messages as this rule reads them',
  /** While the record rehearses the rule over them. */
  reading: 'Reading the messages as this rule would.',
  /** A message with no sender on it, which a text from a short code can be. */
  noSender: 'No sender',
  /** A field the rule did not find in this message. */
  missed: 'Not found',
  more: (n: number) => (n === 1 ? '1 more like these waits.' : `${n.toLocaleString('en')} more like these wait.`),
  total: (said: string) => `All that waits comes to ${said}.`,
  /* What Accept does, said before the press. The record files what the pattern reads whole and leaves the rest
     waiting in this one question ("Filed 4 with this pattern. 1 still waits: it reads only part of it."), so the
     part sentence is said the way that closing note says it. */
  filesNone: 'Accept keeps the pattern; nothing it reads yet would be filed.',
  filesNoneRead: 'Accept keeps the pattern; nothing it has read yet would be filed.',
  filesOne: 'Accept files the one it reads, with Undo.',
  files: (n: number) => `Accept files the ${n.toLocaleString('en')} it reads, with one Undo.`,
  part: (n: number) => (n === 1 ? '1 keeps waiting: it reads only part of it.' : `${n.toLocaleString('en')} keep waiting: it reads only part of them.`),
  unread: (n: number | null) =>
    n === null ? 'It reads the rest that wait when you accept.' : n === 1 ? 'It reads the other one when you accept.' : `It reads the other ${n.toLocaleString('en')} when you accept.`,
} as const;

/**
 * What pressing Accept would do, from the rehearsal the reads already ran: `reads` counts the waiting arrivals it read,
 * whole and in part, and `waiting` is how many alike wait in all, those read among them, or `null` when more wait than
 * the walk reached. Whatever waits beyond the rehearsal's ten is read by the record as it files, so it is said as that
 * and never guessed at from the ten.
 */
export function acceptSaid(reads: Counted, waiting: number | null): string {
  const unread = waiting === null ? null : Math.max(0, waiting - reads.whole - reads.part);
  const head =
    reads.whole === 0 ? (unread === 0 ? words.filesNone : words.filesNoneRead) : reads.whole === 1 ? words.filesOne : words.files(reads.whole);
  return [head, ...(reads.part > 0 ? [words.part(reads.part)] : []), ...(unread !== 0 ? [words.unread(unread)] : [])].join(' ');
}

/**
 * The record's own closing note on a resolved pattern question ("Filed 4 with this pattern. ..."), passed through as
 * the record wrote it, or `null` while the question is open or when it closed with nothing said.
 */
export function closedSaid(note: unknown, resolved: boolean): string | null {
  return resolved && typeof note === 'string' && note.trim() !== '' ? note : null;
}

/**
 * Of the arrivals at `indices`, how many the rule reads whole: claimed, with every field it writes found and not
 * empty. One it does not claim or finds a field missing in is read in part, and keeps waiting.
 */
export function wholeOf(tried: Tried, indices: readonly number[]): Counted {
  const whole = indices.filter(
    (i) => tried.claims[i] === true && tried.fields.every((f) => f.cells[i]?.ok === true && f.cells[i]!.value !== null && f.cells[i]!.value !== ''),
  ).length;
  return { whole, part: indices.length - whole };
}

/** The most messages drawn under the rule: the three the kernel drafts a pattern from. */
export const SHOWN = 3;

/** The most arrivals one rehearsal reads, as the record's `tryPattern` takes them (`SAMPLES_MOST`). */
const TRIED_MOST = 10;

/** The most pages of waiting arrivals walked to count the alike ones, a page being the most the inbox answers at once. */
const PAGES_MOST = 5;
const PAGE = 200;

/** An arrival's shape, as the kernel keys it: the channel and the address it came from (or went to). */
const shapeOfLine = (a: Pick<InboxLine, 'channel' | 'from' | 'to'>): string =>
  shapeOf(a.channel as Parameters<typeof shapeOf>[0], { from: a.from, to: a.to });

const isMoney = (v: Json | null): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.amount === 'number' && Number.isInteger(v.amount) && typeof v.currency === 'string';

/**
 * What the arrivals at `indices` come to, read by the first field that reads money in any of them: summed when they
 * share a currency, `null` when they do not, when no field reads money, or when there are none. Only an arrival the
 * rule claims counts, since one it does not take files nothing.
 */
export function totalOf(tried: Tried, indices: readonly number[]): string | null {
  for (const f of tried.fields) {
    const values = indices.flatMap((i) => {
      const c = f.cells[i];
      return tried.claims[i] && c?.ok && isMoney(c.value) ? [c.value] : [];
    });
    if (values.length === 0) continue;
    const currency = values[0]!.currency;
    if (values.some((v) => v.currency !== currency)) return null;
    return money(values.reduce((sum, v) => sum + v.amount, 0), currency);
  }
  return null;
}

/**
 * The reads, from the rehearsal: `shown` are the samples drawn, first in the order they were tried; `waiting.more` is
 * how many alike wait beyond them, and `waiting.tried` the places in the rehearsal of every alike arrival that waits,
 * or `null` when some were not read and so no total can be said. `waiting.read` is the places of the waiting arrivals
 * the rehearsal did read and `waiting.all` how many alike wait in all (`null` past the walk), which say what Accept
 * would do; without `read` the waiting ones were not read and Accept is not said.
 *
 * A FIELD THE RULE MISSES IN A MESSAGE IS THERE AND EMPTY, so a rule that reads the amount in two of three is seen to.
 */
export function readsOf(
  shown: readonly Sample[],
  tried: Tried,
  labelOf: (field: string) => string,
  waiting: { more: number; tried: readonly number[] | null; read?: readonly number[]; all?: number | null },
): PatternReads {
  const rows = shown.slice(0, SHOWN).map((s, i) => ({
    from: s.from.trim() === '' ? null : s.from.trim(),
    fields: tried.fields.map((f) => {
      const c = f.cells[i];
      return { field: labelOf(f.field), value: c?.ok ? valueSaid(c.value) : '' };
    }),
  }));
  const accept = waiting.read === undefined ? null : acceptSaid(wholeOf(tried, waiting.read), waiting.all ?? null);
  return { rows, waiting: waiting.more, total: waiting.tried === null ? null : totalOf(tried, waiting.tried), accept };
}

/**
 * The waiting arrivals shaped like the samples, newest first, and whether the walk reached the end. A sample found
 * waiting gives its own shape; one filed or skipped since is shaped by its sender, which is what the kernel keys on
 * first. `null` when the inbox could not be read.
 */
async function waitingAlike(base: string, samples: readonly Sample[]): Promise<{ lines: InboxLine[]; whole: boolean } | null> {
  const seen: InboxLine[] = [];
  let whole = false;
  try {
    const client = createClient({ base });
    let cursor: number | null = null;
    for (let page = 0; page < PAGES_MOST; page += 1) {
      const asks: { state: 'untriaged'; limit: number; cursor?: number } = { state: 'untriaged', limit: PAGE, ...(cursor === null ? {} : { cursor }) };
      const out = await client.inbox(asks);
      if (!out.ok) return null;
      seen.push(...out.value.arrivals);
      cursor = out.value.cursor;
      if (cursor === null) {
        whole = true;
        break;
      }
    }
  } catch {
    return null;
  }
  const byId = new Map(seen.map((a) => [a.id, a]));
  const shapes = new Set(
    samples.map((s) => {
      const line = byId.get(s.key);
      return line ? shapeOfLine(line) : shapeOfLine({ channel: s.channel ?? 'email', from: s.from, to: '' });
    }),
  );
  return { lines: seen.filter((a) => shapes.has(shapeOfLine(a))), whole };
}

/** The labels of the list the rule files into, by field id; a field the list does not name is said from its id. */
async function labelsOf(base: string, register: string): Promise<(field: string) => string> {
  const declared = await schemaOf(base, register).catch(() => null);
  const labels = new Map<string, string>();
  for (const f of declared?.fields ?? []) {
    const said = f as { id?: unknown; label?: unknown };
    if (typeof said.id === 'string' && typeof said.label === 'string' && said.label !== '') labels.set(said.id, said.label);
  }
  return (field) => labels.get(field) ?? humanize(field);
}

/**
 * The question's reads, or `null` when its samples or the rehearsal cannot be read, or its ingest is not one the
 * builder can open. A waiting count that cannot be read is said as none waiting and no total, since the reads are the
 * part a yes rests on.
 */
export async function patternReads(base: string, pattern: PatternAsked): Promise<PatternReads | null> {
  const draft = draftOf(pattern.ingest, Date.now());
  if (!draft) return null;
  const read = await readSamples(base, pattern.samples);
  if (!read.ok || read.value.samples.length === 0) return null;
  const samples = read.value.samples.slice(0, TRIED_MOST);
  const walked = await waitingAlike(base, samples);
  const alike = walked ?? { lines: [], whole: false };
  const keys = new Set(samples.map((s) => s.key));
  const more = alike.lines.filter((a) => !keys.has(a.id));
  const room = Math.max(0, TRIED_MOST - samples.length);
  const extra: Sample[] = more.slice(0, room).map((a) => ({ key: a.id, channel: a.channel, from: a.from, subject: a.subject, body: a.body ?? '' }));
  const all = [...samples, ...extra];
  const tried = await tryPattern(base, draft, all);
  if (!tried.ok) return null;
  const labelOf = await labelsOf(base, draft.register);
  const waitingIds = new Set(alike.lines.map((a) => a.id));
  const every = alike.whole && more.length <= room;
  const readAt = all.flatMap((s, i) => (waitingIds.has(s.key) ? [i] : []));
  /* AN ARRIVAL NOTHING VOUCHED FOR IS COUNTED AS WAITING TOO, in the count and in what Accept would file, though the
     record offers it no pattern: the reason it carries (`UNVERIFIED`) is not exported from the kernel's index, and a copy of the sentence
     here would drift from it. Until it is, the count is the kernel's shape count, unverified ones in it. */
  return readsOf(samples, tried.value, labelOf, {
    more: more.length,
    tried: every ? readAt : null,
    ...(walked === null ? {} : { read: readAt, all: alike.whole ? alike.lines.length : null }),
  });
}
