/**
 * ONE TIMELINE FOR A ROW: what happened to it and what people said about it, newest first, in one list.
 *
 * The page drew Comments and History as two groups in two different treatments, one above the other, so a comment
 * made after an edit sat above it in one place and below it in the other. Merged here, a reader goes down one list and
 * meets each thing in the order it happened. Out of the component so `node --test` can run it, as `said.ts` is.
 */

import type { Thread } from '$lib/record/comments.ts';
import type { Line as Event } from '$lib/record/history-live.ts';

/** One entry on the timeline: a change the record kept, or a comment with its replies under it. */
export type Moment = { kind: 'event'; at: string; event: Event } | { kind: 'comment'; at: string; thread: Thread };

/** The words the timeline draws, beside the function that orders it. */
export const timelineWords = {
  heading: 'Activity',
  composer: 'Write a comment',
  send: 'Comment',
  empty: 'No activity yet.',
} as const;

const timeOf = (iso: string): number => Date.parse(iso);

/**
 * A CHANGE'S WORDS AFTER WHO MADE IT: the record's "created" reads "added this", so the first line of a row's history
 * says "BrainDog added this" (money F9). Every other note is the record's own.
 *
 * A NOTE THAT OPENS ON ITS VERB FOLLOWS THE NAME IN LOWER CASE: an import writes
 * "Imported again from Kiln Notes.", and the line read "An agent Imported again from Kiln Notes." A note that opens on
 * a name keeps it.
 */
export const noteSaid = (note: string): string => {
  const said = note.trim();
  if (said === 'created') return 'added this';
  /* AN IMPORT SAYS IT IMPORTED THIS, and the day is the line's own. The product this record came from by its old name
     is "your old notes", never that name. */
  const imported = /^imported (?:again )?from (.+?)\.?$/iu.exec(said);
  if (imported) return OLD_NAME.test(imported[1]!) ? 'imported this from your old notes' : `imported this from ${imported[1]!}`;
  if (VERB_FIRST.test(said)) return `${said[0]!.toLowerCase()}${said.slice(1)}`;
  /* A NOTE WITH NO VERB OF ITS OWN IS WHAT THE AGENT WROTE DOWN: "An agent Partner on Koala." is "An agent noted:
     Partner on Koala." A note that says what somebody did ("Halden sent this.") keeps its words. */
  const first = said.split(/(?<=[.!?])\s/u)[0] ?? said;
  if (/^[A-Z]/u.test(said) && !PAST.test(first)) return `noted: ${said}`;
  return said;
};

/**
 * The name of a notes product a record imported from before BrainDog, which a screen never says: one named a brain (a
 * "Second Brain", "Mara Brain"). BrainDog itself is one word and does not match.
 */
export const OLD_NAME = /\bbrain\b/iu;
/** A note that opens on a verb in the past: "Imported…", "Moved…", "Set…". */
const VERB_FIRST = /^(?:[A-Z][a-z]+ed|Set|Put|Took|Gave|Made|Sent|Kept|Left|Met|Wrote|Ran|Undid|Got|Found|Told|Split|Paid|Read|Cut|Drew|Saw|Heard)\b/u;
/** A verb in the past anywhere in a sentence, which makes it a sentence about something done. */
const PAST = /\b(?:[a-z]+ed|set|put|took|gave|made|sent|kept|left|met|wrote|ran|undid|got|found|told|split|paid|cut|drew|saw|heard|is|are|was|were|has|have|had)\b/u;

/**
 * A LINE THAT IS A WHOLE SENTENCE OF ITS OWN, for the rules that meet people and organisations: the bank text that
 * filed an organisation says "Filed from a bank text", where the line read "Meet payees added this". `null` for any
 * other line, which is said as who and then what.
 */
export function lineWhole(by: string, note: string): string | null {
  if (note.trim() !== 'created') return null;
  const rule = /^rule[.:](.+)$/u.exec(by.trim())?.[1];
  if (rule === 'meet-payees') return 'Filed from a bank text';
  if (rule === 'meet-senders' || rule === 'meet-sender-organisations') return 'Added from a mail';
  return null;
}

/**
 * THE HISTORY AND THE COMMENTS AS ONE LIST, NEWEST FIRST.
 *
 * The history comes newest first, so this is one merge and not a sort of it: a line whose time does not read keeps
 * its place in its own list, and on a tie the change goes first, because a comment is usually about the change it sits
 * beside. The threads are put newest first here and not trusted to arrive in order: `threadsOf` puts a reply whose
 * comment has gone at the end, whenever it was written, and one out of place would split a day in two (`daysOf`), two
 * headings with one key.
 */
export function momentsOf(history: readonly Event[], threads: readonly Thread[]): Moment[] {
  const events = history.map((event): Moment => ({ kind: 'event', at: event.at, event }));
  /* A TIME THAT DOES NOT READ SORTS AS THE OLDEST, so the comparison stays consistent and the sort stable. */
  const when = (t: Thread): number => {
    const n = timeOf(t.comment.at);
    return Number.isFinite(n) ? n : -Infinity;
  };
  const said = [...threads]
    .map((thread, k) => ({ thread, k, t: when(thread) }))
    .sort((x, y) => (x.t === y.t ? y.k - x.k : y.t > x.t ? 1 : -1))
    .map(({ thread }): Moment => ({ kind: 'comment', at: thread.comment.at, thread }));
  const out: Moment[] = [];
  let i = 0;
  let j = 0;
  while (i < events.length && j < said.length) {
    const a = timeOf(events[i]!.at);
    const b = timeOf(said[j]!.at);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) out.push(events[i++]!);
    else out.push(said[j++]!);
  }
  return out.concat(events.slice(i), said.slice(j));
}
