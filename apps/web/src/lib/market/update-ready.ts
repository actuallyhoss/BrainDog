/**
 * "An update is ready", on the add-on's page for a record that installed an earlier version: what the new version
 * changes, read from the two files the store holds and compared declaration by declaration, so the page says what the
 * plan will say. The person takes it by pressing Update, which opens the plan (an install asks); their own edits to what
 * the add-on installed are the plan's to keep or to show as a conflict, never this page's.
 *
 * THE AUTHOR'S NOTE IS SAID AS THE AUTHOR WROTE IT, and the lines under it are the store's own reading of the files, so
 * a note that says less than the files do cannot hide an added automation or a taken-away list.
 *
 * PLAIN NODE LOADS THIS FILE: its one import is relative, and the declare package is loaded by the comparison only when
 * an update is asked about.
 */

import { changeLines, changesSince, publishedText } from './publish.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const readyWords = {
  heading: 'An update is ready',
  from: (from: string, to: string): string => `Version ${to} is out. This record has ${from}.`,
  author: 'From its author',
  changes: 'What changes',
  nothing: 'Its author listed nothing else that changes.',
  unread: 'What changed could not be read just now. The plan shows it in full before anything is installed.',
  kept: 'Anything you changed in what it installed is kept. If the update clashes with a change of yours, the plan says so before anything is written.',
  asks: 'Updating asks first: you see the plan, and nothing changes until you approve it.',
} as const;

/** What the page draws: the versions, the author's note, and one line per change. */
export type Ready = { from: string; to: string; note: string | null; lines: string[]; read: boolean };

/**
 * The update's changes. `note` is the new version's own note from the index. A file the store cannot give leaves `read`
 * false and no lines, and the page says so rather than guessing.
 */
export async function readyFor(fetcher: Fetcher, id: string, from: string, to: string, note: string | null | undefined, nameOf: (module: string) => string): Promise<Ready> {
  const said = typeof note === 'string' && note.trim() !== '' ? note.trim() : null;
  const [before, after] = await Promise.all([publishedText(fetcher, 'pack', id, from), publishedText(fetcher, 'pack', id, to)]);
  if (after === null) return { from, to, note: said, lines: [], read: false };
  const changed = await changesSince(before, after);
  if (!changed.ok) return { from, to, note: said, lines: [], read: false };
  return { from, to, note: said, lines: changeLines(changed.changes, nameOf), read: true };
}
