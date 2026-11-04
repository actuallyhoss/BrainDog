/**
 * FACTS ABOUT A PERSON GO IN THEIR FIELDS, NOT IN THEIR NOTE (3 Nov, Sam: "instead of just long text, i want them to be
 * parsed as fields"). People 4.7.0 gave the list a field for each thing a note used to say: a legal name, a nationality,
 * a Discord id, a deal, the paperwork still open. An agent that writes "Legal name Callum Doran. Irish. Discord id ..."
 * into `note` puts them back where nobody can sort or edit them apart, so `create` and `update` read a note sent to a
 * list that has those fields with the pack's own reader (`noteFacts`, the one People's script runs) and refuse it,
 * with the call that puts each fact in its field as the `try`.
 *
 * ONLY WHAT THE READER IS SURE OF. A sentence it cannot read whole stays in the note and is never a reason to refuse,
 * and a fact the row already holds a different value for is left in the note, so an agent is never told to overwrite.
 */

import type { Refusal } from '@braindog/ports';
import { noteFacts } from '@braindog/record';

import { callOf } from './words.ts';

type Args = Record<string, unknown>;

/** "legal name, nationality and Discord id". */
const said = (l: readonly string[]): string => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l.join(''));

/** A list keeps people as fields when it has the fields People 4.7.0 added: a record on an older People has none. */
export const keepsFacts = (fields: readonly { id: string }[] | undefined): boolean =>
  Array.isArray(fields) && fields.some((f) => f.id === 'legal_name') && fields.some((f) => f.id === 'discord');

/**
 * The refusal for a note that holds facts the fields should, or `null` when it holds none. `row` is what the row holds
 * now, `{}` for a new one. `rebuild` makes the corrected call from the fields to write.
 */
export function noteRefusal(note: unknown, row: Args, at: string, rebuild: (fields: Args) => string): Refusal | null {
  if (typeof note !== 'string' || note.trim() === '') return null;
  const read = noteFacts(note, row);
  if (read === null) return null;
  const { note: rest, ...facts } = read.patch;
  if (Object.keys(facts).length === 0) return null;
  const named = Object.keys(facts).join(', ');
  return {
    code: 'VALUE_MALFORMED',
    fix: `The note says their ${said(read.found)}, and each has a field of its own: ${named}. Put them there and keep the note for what no field holds.`,
    at,
    try: rebuild({ ...facts, ...(rest === undefined ? {} : { note: rest }) }),
  } as Refusal;
}

/** The corrected `create` and `update` calls, as `try` says them. */
export const createTry = (args: Args, fields: Args): string => callOf('create', { ...args, fields: { ...(args.fields as Args), ...fields } });
export const updateTry = (args: Args, fields: Args): string => callOf('update', { ...args, patch: { ...(args.patch as Args), ...fields } });
