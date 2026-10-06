/**
 * WHAT ONE AGENT RUN DID, IN PLAIN LINES (`RunPanel.svelte`, DIRECTION §37): "Added Fix the login", "Set Status on Fix
 * the login to Done", "Changed Amount on Invoice 12", read off the plan the record would put back (`undo-write.ts`
 * `undoPlan` for the run), which is every change the run made that is still there to undo, in names.
 *
 * THE PLAN SAYS WHAT UNDO WOULD DO, and a run's line says the opposite of it: a row Undo would remove is one the run
 * added, one it would restore is one the run deleted, one it would delete again is one the run brought back, a mail it
 * would stop is one the run lined up, and a field it would set back is one the run changed. A value is
 * said only where it is words a person wrote (a state, a short text): a number may be money in minor units and an id is
 * no word, so either leaves the line at "Changed Amount on Invoice 12".
 *
 * PURE, AND NODE LOADS IT: no import at all.
 */

/** One change in the plan, as `undo-write.ts` reads it. */
export type PlanStep = { title: string; label: string | null; from: unknown; to: unknown; do: string };

/** One change the plan leaves alone, and why. */
export type PlanSkip = { title: string; why: string };

/** How many lines a run's panel says before the rest is a count. */
export const RUN_LINES = 8;

export const runWords = {
  heading: 'What this run did',
  added: (t: string) => `Added ${t}`,
  deleted: (t: string) => `Deleted ${t}`,
  restored: (t: string) => `Brought back ${t}`,
  /** A mail, an alert or a call to another app the run lined up, which has not gone yet. */
  queued: (t: string) => `Lined up ${t} to go out`,
  changedTo: (label: string, t: string, to: string) => `Set ${label} on ${t} to ${to}`,
  changed: (label: string, t: string) => `Changed ${label} on ${t}`,
  cleared: (label: string, t: string) => `Cleared ${label} on ${t}`,
  changedRow: (t: string) => `Changed ${t}`,
  tagged: (t: string, tag: string) => `Added ${tag} to ${t}`,
  untagged: (t: string, tag: string) => `Took ${tag} off ${t}`,
  /** Something the record would not name to this reader. */
  aRow: 'one without a name',
  more: (n: number) => (n === 1 ? 'and 1 more change' : `and ${n.toLocaleString('en-GB')} more changes`),
  nothing: 'This run has not changed anything that is still here to put back.',
  undo: 'Undo this run',
  /** The confirm, before anything goes back: how many, and how many are left alone and why. */
  sure: (n: number, skipped: number) =>
    `${n === 1 ? 'This puts back 1 change.' : `This puts back ${n.toLocaleString('en-GB')} changes.`}${
      skipped === 0 ? '' : skipped === 1 ? ' 1 is left as it is: it changed since or cannot come back.' : ` ${skipped.toLocaleString('en-GB')} are left as they are: they changed since or cannot come back.`
    }`,
  putBack: 'Put back',
  keep: 'Keep',
  reading: 'Reading what this run did',
} as const;

/* WHAT IS NO WORD: an id (a ULID, a handle such as `tasks#3`, a person's `p_`), a path, or a bare figure, which the
   record speaks as digits (`undo.ts` `spoken`) and which may be money in minor units. */
const NOT_A_WORD = /[0-9A-HJKMNP-TV-Z]{26}|^[pt]_|#\d|[\\/]|^[-+]?[\d.,\s]+$/u;

/* THE RECORD'S WORD FOR A FIELD WITH NOTHING IN IT (`undo.ts` `spoken`). */
const EMPTY = 'empty';

/** A value as a person reads it, or `null` where it is not words a person wrote. */
function wordOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || t.length > 40 || NOT_A_WORD.test(t) ? null : t;
}

/** One step of the plan as the line of what the run did. */
export function lineOf(s: PlanStep): string {
  const t = s.title.trim() || runWords.aRow;
  const verb = s.do.toLowerCase();
  /* `remove` TAKES AWAY A ROW THE RUN ADDED; `delete` DELETES AGAIN ONE IT BROUGHT BACK (`kernel/undo.ts`). */
  if (/remove|archive/u.test(verb)) return runWords.added(t);
  if (/^delete/u.test(verb)) return runWords.restored(t);
  if (/restore|put.?back|undelete/u.test(verb)) return runWords.deleted(t);
  if (verb === 'stop') return runWords.queued(t);
  if (/untag/u.test(verb)) return wordOf(s.to) ?? wordOf(s.from) ? runWords.tagged(t, (wordOf(s.to) ?? wordOf(s.from))!) : runWords.changedRow(t);
  if (/tag/u.test(verb)) return wordOf(s.to) ?? wordOf(s.from) ? runWords.untagged(t, (wordOf(s.to) ?? wordOf(s.from))!) : runWords.changedRow(t);
  const label = s.label?.trim() ?? '';
  if (label === '') return runWords.changedRow(t);
  /* THE VALUE THE RUN WROTE: the plan's `to` is the value as it stands, which the run wrote. */
  if (s.to === EMPTY) return runWords.cleared(label, t);
  const to = wordOf(s.to);
  return to === null ? runWords.changed(label, t) : runWords.changedTo(label, t, to);
}

/** The panel's lines: at most `RUN_LINES`, then how many more, each said once where several steps say the same. */
export function runLines(steps: readonly PlanStep[]): { lines: string[]; more: string | null } {
  const said: string[] = [];
  for (const s of steps) {
    const line = lineOf(s);
    if (!said.includes(line)) said.push(line);
  }
  const rest = said.length - RUN_LINES;
  return { lines: said.slice(0, RUN_LINES), more: rest > 0 ? runWords.more(rest) : null };
}
