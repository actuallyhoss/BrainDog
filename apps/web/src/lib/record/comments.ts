/**
 * The comment thread on a row, a question or a decision: read it, add to it, reply under a comment, and resolve one
 * with the reason (`docs/20-COLLABORATION.md` §5; the record's half is `packages/record/src/methods/comments.ts`).
 *
 * A ROUTE-ONLY MODULE, like `history-live.ts`: the client carries the route table as a value, so only the screens
 * that draw a thread (`lib/ui/Thread.svelte`, mounted on the row page and on Decide) import it.
 *
 * ONE LEVEL OF REPLIES, AND THE RECORD HOLDS IT THERE: a reply names the comment that opened its thread, never
 * another reply, so `threadsOf` hangs every reply under its comment and a screen offers Reply only on a comment.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. A thing the caller may not see answers as a thing that is not there,
 * and that sentence quotes no id, so it can be shown as it comes. A host that did not answer is said calmly, with
 * the socket's own words kept for Details.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';

/** One comment or reply as `comments` answers it, oldest first. `resolved` is always `null` on a reply. */
export type Line = {
  id: string;
  by: string;
  at: string;
  body: string;
  reply_to: string | null;
  resolved: { as: Way | null; why: string; by: string; at: string } | null;
};

/** The three ways a comment is resolved, in the order a person is offered them. */
export const WAYS = ['addressed', 'wont-fix', 'incorrect'] as const;
export type Way = (typeof WAYS)[number];

/** The most characters a comment or a reply holds, as the kernel counts them (`COMMENT_MOST`). */
export const COMMENT_MOST = 280;

/** A comment and the replies under it, oldest first. */
export type Thread = { comment: Line; replies: Line[] };

/** What reading a thread came to. */
export type Heard =
  | { from: 'live'; lines: Line[]; now: number }
  | { from: 'refused'; fix: string }
  | { from: 'unreachable'; why: string };

/** What a write came to: the record's sentence when it did not land. */
export type Said = { ok: true } | { ok: false; fix: string };

/** The words a thread draws. They are the thread's alone, so they live beside it rather than in the copy aggregate. */
export const commentWords = {
  heading: 'Comments',
  reading: 'Reading the comments.',
  addLabel: 'Add a comment',
  add: 'Add comment',
  reply: 'Reply',
  replyLabel: (name: string) => `Reply to ${name}`,
  addReply: 'Add reply',
  resolve: 'Resolve',
  resolveLegend: 'How it was resolved',
  ways: { addressed: 'Addressed', 'wont-fix': 'Will not fix', incorrect: 'Incorrect' } satisfies Record<Way, string>,
  why: 'Why',
  resolveAction: 'Resolve comment',
  cancel: 'Cancel',
  /** The folded line of a resolved comment: how, by whom and when, then what it said. */
  resolvedAs: (way: Way | null, name: string, when: string) =>
    `${way === null ? 'Resolved' : `Resolved as ${commentWords.ways[way].toLowerCase()}`} by ${name}, ${when}`,
  replies: (n: number) => (n === 1 ? '1 reply' : `${n} replies`),
  /** Said when the box holds more than the record keeps, before a press is refused for it. */
  tooLong: (over: number) => `${over} ${over === 1 ? 'character' : 'characters'} over. Say it shorter, or split it into a reply.`,
};

/** How many characters are over the most a comment holds, counted as the kernel counts them; 0 when it fits. */
export function overBy(text: string): number {
  return Math.max(0, [...text.trim()].length - COMMENT_MOST);
}

/**
 * Every comment with its replies under it, oldest first. A reply whose comment is not among the lines (it was
 * erased) is kept as a comment of its own, so no words the record answered go undrawn.
 */
export function threadsOf(lines: readonly Line[]): Thread[] {
  const threads: Thread[] = [];
  const byId = new Map<string, Thread>();
  for (const line of lines) {
    if (line.reply_to === null) {
      const t = { comment: line, replies: [] };
      byId.set(line.id, t);
      threads.push(t);
    }
  }
  for (const line of lines) {
    if (line.reply_to === null) continue;
    const parent = byId.get(line.reply_to);
    if (parent) parent.replies.push(line);
    else threads.push({ comment: line, replies: [] });
  }
  return threads;
}

/** How long a thread may take to read before it says it could not. */
const READ_MS = 10_000;

type Failed = { ok: false; refusal?: { code: string; fix: string } };

const failedOf = (out: Failed): Said => ({
  ok: false,
  fix: out.refusal === undefined || out.refusal.code === 'UNREACHABLE' ? copy.writeNotReached : out.refusal.fix,
});

/** The thread on one thing, named as the record takes it: `tasks#3`, `suggestion:<id>` or `decision:<id>`. */
export async function readThread(base: string, on: string, clock: () => number = Date.now): Promise<Heard> {
  /* A READ THAT NEVER ANSWERS SETTLES AS UNREACHABLE, so the card never says Reading for good. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<Failed>((done) => (timer = setTimeout(() => done({ ok: false, refusal: { code: 'UNREACHABLE', fix: '' } }), READ_MS)));
  /* AND A READ THAT THROWS SETTLES TOO: a client that fails before it answers left the thread at "Reading the
     comments." for good, with no Retry. It is said as unreachable, with the way to try again. */
  let out: { ok: true; value: Line[] } | Failed;
  try {
    out = (await Promise.race([Promise.resolve().then(() => createClient({ base }).comments(on)), slow])) as { ok: true; value: Line[] } | Failed;
  } catch (e) {
    out = { ok: false, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : '' } };
  } finally {
    clearTimeout(timer);
  }
  if (out.ok && !Array.isArray(out.value)) return { from: 'live', lines: [], now: clock() };
  if (out.ok) return { from: 'live', lines: out.value, now: clock() };
  if (out.refusal === undefined || out.refusal.code === 'UNREACHABLE') return { from: 'unreachable', why: out.refusal?.fix ?? '' };
  return { from: 'refused', fix: out.refusal.fix };
}

/** Say something about one thing, or reply under the comment `reply_to` names. */
export async function sayComment(base: string, args: { on: string; body: string; reply_to?: string }): Promise<Said> {
  const out = (await createClient({ base }).comment(args)) as { ok: true } | Failed;
  return out.ok ? { ok: true } : failedOf(out);
}

/** Resolve one comment, with the way and the reason. */
export async function resolveComment(base: string, args: { id: string; as: Way; why: string }): Promise<Said> {
  const out = (await createClient({ base }).resolveComment(args)) as { ok: true } | Failed;
  return out.ok ? { ok: true } : failedOf(out);
}

/** One person an @ may name: who may see what the thread is on (`mentionable` on the record). */
export type Mentionable = { id: string; name: string };

/**
 * WHO AN @ MAY NAME ON ONE THING, asked of the record, which answers the people who may see it by the same check a
 * mention rings by, so the list never offers a name the record would keep quiet. Empty when it does not answer: an
 * @ list that offers nobody is safer than one that offers somebody who cannot see the row.
 */
export async function readMentionable(base: string, on: string): Promise<Mentionable[]> {
  try {
    const out = (await createClient({ base }).mentionable(on)) as { ok: true; value: Mentionable[] } | Failed;
    return out.ok && Array.isArray(out.value) ? out.value : [];
  } catch {
    return [];
  }
}
