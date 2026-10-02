/**
 * What a declared page does with ONE ROW it draws, beyond ticking it: open it in the docked panel, change it there in one
 * write, set its state, its day or its project from its menu, delete it, and keep it in Just changed for ten minutes.
 * Work did all of it by hand over one list (`lib/work/Work.svelte`); a declared page does it over any list a block
 * draws, by asking the list's own declaration what it has (`work/board.ts` `shapeOf`), so a pack's list gets the same
 * verbs as Tasks and nothing here names Tasks.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, type imports for the rest), so `row-verbs.test.ts` holds each rule
 * without a component. The writes themselves are `row-host.svelte.ts`'s, and the drawing is the components'.
 */

import type { Entry, Fields } from '../record/schema.ts';
import { addDays, dayIn, daySaid, dueSaid, nextMonday, projectOf, type Shape } from '../work/board.ts';

/** One row of the record, as a page names it: its list and its number. */
export type RowAt = { register: string; seq: number };

/** The key a page's cursor holds a row by, which is the renderer's own `register#seq` (`braindog-render` `rowKey`). */
export const keyOf = (r: RowAt): string => `${r.register}#${r.seq}`;

/**
 * The row a drawn key names, or `null` for a key that is a place in a fence and no row of the record. `q:` is a
 * question's (`QueueAnswer.svelte`), and a question is answered, never edited.
 */
export function rowOfKey(key: string | undefined): RowAt | null {
  const m = key?.match(/^([a-z][\w-]*)[#:](\d+)$/u);
  return m && m[1] !== 'q' ? { register: m[1]!, seq: Number(m[2]) } : null;
}

/** A block as this reads it: the list it draws and the rows it was answered with. */
type Held = { register?: string | undefined; entries: readonly Entry[] };

/** The row as the page last read it, from whichever block drew it, or `undefined` when no block holds it now. */
export function entryIn(blocks: readonly Held[], at: RowAt): Entry | undefined {
  for (const b of blocks) {
    if (b.register !== at.register) continue;
    const e = b.entries.find((x) => x.seq === at.seq);
    if (e) return e;
  }
  return undefined;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** What a row is called, by its list's title field, or its number when it has no words. */
export const titleOf = (e: Pick<Entry, 'seq' | 'fields'>, s: Pick<Shape, 'title'> | null): string => (s ? text(e.fields[s.title]).trim() : '') || `#${e.seq}`;

/* ── the panel's one write ─────────────────────────────────────────────────── */

/** What the panel edits, as text, so an empty box and an unset field are the same thing. */
export type Form = { title: string; state: string; project: string; due: string; tier: string };

export const formOf = (e: Entry, s: Shape): Form => ({
  title: titleOf(e, s) === `#${e.seq}` ? '' : titleOf(e, s),
  state: s.state ? text(e.fields[s.state]) : '',
  project: String(projectOf(e.fields, s) ?? ''),
  due: s.due ? dayIn(e.fields[s.due]) : '',
  tier: s.priority ? text(e.fields[s.priority.field]) : '',
});

/**
 * EVERY FIELD THE PANEL CHANGED, AND NOTHING ELSE, as one patch: one write and one Undo, as Work's Save is. A title
 * emptied is not a change (a row needs its words), and a box emptied is the field cleared.
 */
export function patchOf(form: Form, e: Entry, s: Shape): Fields {
  const was = formOf(e, s);
  const out: Fields = {};
  const title = form.title.trim();
  if (title !== '' && title !== was.title) out[s.title] = title;
  if (s.state && form.state !== was.state && form.state !== '') out[s.state] = form.state;
  if (s.project && form.project !== was.project) out[s.project.field] = form.project === '' ? null : Number(form.project);
  if (s.due && form.due !== was.due) out[s.due] = form.due === '' ? null : form.due;
  if (s.priority && form.tier !== was.tier) out[s.priority.field] = form.tier === '' ? null : form.tier;
  return out;
}

/** Whether the panel has something typed that is not saved yet, so the cursor moving does not throw it away. */
export const dirty = (form: Form, e: Entry, s: Shape): boolean => Object.keys(patchOf(form, e, s)).length > 0;

/** Whether a row is in one of its list's finished states. */
export const finished = (e: Entry, s: Shape): boolean => s.state !== null && s.done.includes(text(e.fields[s.state]));

/* ── the menu ──────────────────────────────────────────────────────────────── */

/** The days the menu offers, in the order a person reaches for them, each with the words its line says. */
export function daysFor(today: string): { day: string; label: string }[] {
  const monday = nextMonday(today);
  return [
    { day: today, label: words.today },
    { day: addDays(today, 1), label: words.tomorrow },
    { day: monday, label: words.nextWeek(daySaid(monday)) },
  ];
}

/** The states a row can be moved to from where it is: every one its list declares but its own. */
export const movesFor = (e: Entry, s: Shape): string[] => (s.state ? s.states.filter((v) => v !== text(e.fields[s.state!])) : []);

/* ── Just changed ──────────────────────────────────────────────────────────── */

/** How long a row somebody touched stays in Just changed: ten minutes, as on Work. */
export const JUST_MS = 10 * 60_000;

/**
 * One row touched from this page: when, what happened to it in a word or two, its words then, and whether it was
 * deleted, which is what puts Put back on its line.
 */
export type Touch = { at: number; mark: string; title: string; gone: boolean };

/** The rows still in Just changed at `now`, the latest first. */
export function justNow(touched: ReadonlyMap<string, Touch>, now: number): { key: string; row: RowAt; touch: Touch }[] {
  return [...touched]
    .filter(([, t]) => now - t.at < JUST_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .flatMap(([key, touch]) => {
      const row = rowOfKey(key);
      return row ? [{ key, row, touch }] : [];
    });
}

/* ── the words ─────────────────────────────────────────────────────────────── */

/**
 * WHAT THESE VERBS SAY, in a `words` object beside them by the rule every area keeps. Past tense with the row named for
 * a receipt, a word or two for a mark, and the person's own names for their things (the list's states and projects,
 * never a field id).
 */
export const words = {
  /** The panel's title for a list that names none of its rows. */
  panel: 'Details',
  title: 'Title',
  state: 'State',
  project: 'Project',
  noProject: 'No project',
  due: 'Due',
  tier: 'Tier',
  save: 'Save',
  cancel: 'Cancel',
  open: 'Open',
  more: 'More',
  deleteAsk: 'Delete…',
  deleteSure: 'Delete it? It stays in Just changed, with Put back, for ten minutes.',
  deleteYes: 'Delete',
  keep: 'Keep it',
  menu: (t: string) => `What to do with ${t}`,
  edit: 'Edit',
  /** The menu's verb on a finished row; its mark in Just changed is the past tense, `marks.reopened`. */
  reopen: 'Reopen',
  dayOf: 'Set the day…',
  move: 'Move…',
  fileUnder: 'File under…',
  delete: 'Delete',
  today: 'Today',
  tomorrow: 'Tomorrow',
  nextWeek: (d: string) => `Next week, ${d}`,
  pickDay: 'Pick a day',
  noDue: 'No due day',
  moveTo: (s: string) => `Move to ${s}`,
  fileTo: (p: string) => `File under ${p}`,
  unfile: 'Take it off its project',
  just: 'Just changed',
  putBack: 'Put back',
  marks: {
    edited: 'Edited',
    done: 'Done',
    reopened: 'Reopened',
    moved: (s: string) => `Moved to ${s}`,
    due: (d: string) => `Due ${d}`,
    undated: 'No due day',
    filed: (p: string) => `Now under ${p}`,
    deleted: 'Deleted',
    putBack: 'Put back',
    added: 'Added',
  },
  said: {
    edited: (t: string) => `Saved “${t}”.`,
    done: (t: string) => `Marked “${t}” done.`,
    reopened: (t: string) => `Reopened “${t}”.`,
    moved: (t: string, s: string) => `Moved “${t}” to ${s}.`,
    due: (t: string, d: string) => `“${t}” is due ${d}.`,
    undated: (t: string) => `“${t}” has no due day now.`,
    filed: (t: string, p: string) => `Filed “${t}” under ${p}.`,
    deleted: (t: string) => `Deleted “${t}”.`,
    putBack: (t: string) => `Put “${t}” back.`,
  },
} as const;

/** The mark and the receipt a new due day says, against the reader's day. */
export const dueWords = (title: string, day: string | null, today: string): { mark: string; said: string } =>
  day === null ? { mark: words.marks.undated, said: words.said.undated(title) } : { mark: words.marks.due(dueSaid(day, today)), said: words.said.due(title, daySaid(day)) };
