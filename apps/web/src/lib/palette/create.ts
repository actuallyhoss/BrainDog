/**
 * The palette's row that makes something: `Add to <list>: <text>`, read out of the query and written as a row.
 *
 * THE SENTENCE IS THE WHOLE INTERFACE. There is no form behind the row and no list to pick: the box already holds the
 * list and the title, so reading them is `creation()`, a pure function over the words and the lists the palette
 * already knows. Half a sentence is `null`, and the row is then absent rather than drawn waiting for the rest, which is
 * the palette's standing rule (`admit.ts`).
 *
 * THE WRITE IS THE LIST'S OWN CAPTURE LINE. `capturedFields` is where `/r/[register]` and a page's `capture` decide
 * what a typed line becomes: the title, and every required field nothing pinned at its emptiest value, each one said
 * back. The palette pins nothing, so it is that line typed with no filter, and the row it writes is the row the list
 * would have written. Writing only the title was the obvious shape, and the record refuses it on any list that
 * requires more than a title, which is most of them.
 *
 * `rows-write.ts` IS LOADED ON THE PRESS, NOT WITH THE PALETTE. The client carries the route table as a value, and the
 * palette is in the layout, so a static import would put it in the chunk every screen waits for. This file's own
 * imports are the fixture declarations the palette already loads, and types.
 */

import { REGISTERS } from '../record/api.ts';
import type { List } from '../record/palette.ts';
import type { Fetch } from '../record/row-live.ts';
import type { Wrote } from '../record/rows-write.ts';
import type { Entry } from '../record/schema.ts';
import type { Creation } from './admit.ts';

/** Kept here rather than in `copy.ts`, which no builder in this wave owns. */
export const words = {
  /** The declaration's title, which `admits()` checks. The row draws `row` in its place. */
  declared: 'Add to a list',
  row: (list: string, title: string) => `Add to ${list}: ${title}`,
  /** The sample's half, which goes through `copy.notWritten` as every write there does. */
  would: (list: string, title: string) => `“${title}” would be added to ${list}`,
  added: (list: string, title: string) => `Added “${title}” to ${list}.`,
  /** The heading over the row. It is drawn first, because a whole sentence of intent outranks a match on its words. */
  group: 'Add',
} as const;

/**
 * `add to`, a list, a colon, and the title. THE FIRST COLON ENDS THE LIST, so the title may carry colons of its own,
 * and the list may not, which no list name does.
 */
const SENTENCE = /^\s*add\s+to\s+([^:]+?)\s*:\s*(.*?)\s*$/iu;

/** A name as it is compared: lower case, with runs of space and the id's underscore read as one space. */
const plain = (s: string): string => s.toLowerCase().replace(/[\s_]+/gu, ' ').trim();

/**
 * The row a query asks for, or `null` when the query is not the whole sentence.
 *
 * BY THE NAME A READER SEES, THEN BY THE ID. `things` is drawn everywhere as Projects, so `add to projects:` is the
 * sentence somebody types; the id is kept for the lists whose name and id are the same word, and for an agent that
 * reads ids. A NAME IS NEVER GUESSED: `add to task:` is not Tasks, because the nearest list is how a bill ends up
 * filed under the wrong one with nobody told.
 */
export function creation(query: string, lists: readonly Pick<List, 'id' | 'name'>[]): Creation | null {
  const said = SENTENCE.exec(query);
  if (!said) return null;
  const [, named = '', title = ''] = said;
  if (title === '') return null;
  const want = plain(named);
  const list = lists.find((l) => plain(l.name) === want) ?? lists.find((l) => plain(l.id) === want);
  return list ? { register: list.id, title } : null;
}

/**
 * The lists a row can be added to from here: the ones this build holds a declaration for.
 *
 * THE DECLARATION NAMES THE TITLE FIELD, and the words go nowhere else, which is `capture.ts`'s rule for a page's
 * capture and the same list for the same reason. A live record can hold a list this build has never heard of; its name
 * does not turn the sentence into a row, so the row is absent there rather than written with the words in no field.
 */
export function addable<T extends Pick<List, 'id'>>(lists: readonly T[]): T[] {
  return lists.filter((l) => Boolean(REGISTERS[l.id]?.title));
}

/** What a press answered: the row, what was filled in for the reader, and its way back; or the record's sentence. */
export type Added = { ok: true; entry: Entry; filled: readonly string[]; back: () => Promise<Wrote> } | { ok: false; fix: string };

/**
 * One row, written on a live record.
 *
 * THE WAY BACK IS AN ARCHIVE, at the version the create answered, which is the Put back the list's own add offers: the
 * record has no delete, so the row leaves every list and `restore` can still bring it back. It is handed back as a
 * function rather than run here, because it is the toast's to offer and the reader's to press.
 */
export async function addRow(c: Creation, now: number, base: string, io?: Fetch): Promise<Added> {
  const { capturedFields, rowWriter } = await import('../record/rows-write.ts');
  const { fields, filled } = capturedFields(c.register, c.title, [], now);
  const writer = rowWriter(base, io);
  const out = await writer.create(c.register, fields);
  if (!out.ok) return { ok: false, fix: out.fix };
  const { entry } = out;
  return { ok: true, entry, filled, back: () => writer.archive(c.register, entry.seq, entry.version) };
}
