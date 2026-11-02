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
 * "Imported again from Kiln Notes.", and the line read "An agent Imported again from Kiln Notes." Any other note is
 * said as what the writer noted.
 */
export const noteSaid = (note: string, line?: Pick<Event, 'field'> & { from?: unknown }): string => {
  const said = note.trim();
  if (said === 'created') return 'added this';
  /* A CHANGE TO ONE FIELD THAT THE WRITER LEFT NO NOTE ON is said by `noteOf` as the field and then what happened to it,
     "email set to …", and after a name it read "An agent email set to …". The verb goes first. */
  if (line?.field !== undefined && line.field !== '' && 'from' in line) return fieldSaid(said);
  /* AN IMPORT SAYS IT IMPORTED THIS, and the day is the line's own. The product this record came from by its old name
     is "your old notes", never that name. */
  const imported = /^imported (?:again )?from (.+?)\.?$/iu.exec(said);
  if (imported) return OLD_NAME.test(imported[1]!) ? 'imported this from your old notes' : `imported this from ${imported[1]!}`;
  if (VERB_FIRST.test(said) && !DESCRIBES.test(said) && !PASSIVE.test(said)) return `${said[0]!.toLowerCase()}${said.slice(1)}`;
  /* A NOTE THAT DOES NOT OPEN ON WHAT WAS DONE IS WHAT THE WRITER PUT DOWN: "An agent Partner on Koala." is "An agent
     noted: Partner on Koala.", and a note that is a sentence of its own ("Halden sent this.", "Based in Osaka.") is
     quoted the same way, since put after a name it read "An agent Halden sent this." (Q38, recheck of 30 October). */
  if (/^[\p{Lu}\p{N}]/u.test(said)) return `noted: ${said}`;
  return said;
};

/** `noteOf`'s words for one field's change, with the verb first: "set email to …", "changed state from open to paid". */
function fieldSaid(said: string): string {
  const from = /^(.+?) from (.+) to (.+)$/su.exec(said);
  if (from) return `changed ${from[1]!} from ${from[2]!} to ${from[3]!}`;
  const to = /^(.+?) set to (.+)$/su.exec(said);
  if (to) return `set ${to[1]!} to ${to[2]!}`;
  const bare = /^(.+?) (set|cleared|changed)$/su.exec(said);
  if (bare) return `${bare[2]!} ${bare[1]!}`;
  return said;
}

/**
 * The name of a notes product a record imported from before BrainDog, which a screen never says: one named a brain (a
 * "Second Brain", "Mara Brain"). BrainDog itself is one word and does not match.
 */
export const OLD_NAME = /\bbrain\b/iu;
/** A note that opens on a verb in the past: "Imported…", "Moved…", "Set…". */
const VERB_FIRST = /^(?:[A-Z][a-z]+ed|Set|Put|Took|Gave|Made|Sent|Kept|Left|Met|Wrote|Ran|Undid|Got|Found|Told|Split|Paid|Read|Cut|Drew|Saw|Heard|Chose)\b/u;
/**
 * A NOTE THAT OPENS ON A WORD ENDING IN -ED AND DESCRIBES RATHER THAN SAYS WHAT WAS DONE: "Based in Osaka" is about the
 * person, and after a name it read "An agent based in Osaka". "Need" and "Speed" only look like a verb in the past.
 */
const DESCRIBES = /^(?:Based|Interested|Retired|Married|Engaged|Divorced|Located|Related|Involved|Experienced|Qualified|Certified|Licensed|Skilled|Talented|Self-employed|Employed|Unemployed|Need|Needed|Seed|Speed|Feed|Red|Bed|Shed|Hundred|Limited|Detailed|Advanced|Dedicated|Preferred)\b/u;
/** A note that says what was done TO the row and by whom ("Lifted by …"), which cannot follow who did it. */
const PASSIVE = /^\S+\s+by\b/u;

/**
 * A LINE THAT IS A WHOLE SENTENCE OF ITS OWN, for the rules that meet people and organisations: the bank text that
 * filed an organisation says "Filed from a bank text", where the line read "Meet payees added this". `null` for any
 * other line, which is said as who and then what.
 */
export function lineWhole(by: string, note: string): string | null {
  if (note.trim() !== 'created') return null;
  const rule = /^rule[.:](.+)$/u.exec(by.trim())?.[1];
  if (rule === 'meet-payees') return 'Filed from a bank text';
  /* A MEET OF A MAIL'S SENDER, the person or the organisation, as the rule's own id says it (`meet-sender…`). */
  if (rule !== undefined && /^meet-senders?(?:-|$)/u.test(rule)) return 'Added from a mail';
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
  /* A COMMENT ONCE (collab pass 2): the log carries each comment and reply as a line too, and with the thread drawn beside
     it every comment read twice, "Sam Okafor @Mira the photos are up" over the same words in its thread. While the
     thread is there it says them; when it is not, the log's line still does. */
  const threaded = (e: Event): boolean => e.field === 'comment' || e.field === 'resolve' || (typeof e.field === 'string' && e.field.startsWith('reply:'));
  const events = (threads.length > 0 ? history.filter((e) => !threaded(e)) : history).map((event): Moment => ({ kind: 'event', at: event.at, event }));
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
