/**
 * A list's own name, changed from Settings > Words and money where no use case gives a word for it (the audit of 25
 * October, Y21: the area drew 13 of a record's 29 lists, the ones the speaking use case declares).
 *
 * THE DECLARATION'S NAME, FILED AS A CHANGE TO THE WHOLE LIST, the way a field's rename is (`field-write.ts`
 * `renameField`): read fresh from the record, the name swapped, and the owner's accepted at once. A colleague's waits
 * in Needs you. The id the rows are kept under stays, so every filter, view and agent's call still finds the list.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from './boot-live.ts';
import { fileChange, type Added } from './field-write.ts';

/** The lists `spoken` (a use case's) leaves out: every other list the record holds, in its order. */
export const othersOf = <T extends { id: string }>(spoken: readonly string[], lists: readonly T[]): T[] => lists.filter((l) => !spoken.includes(l.id));

const fold = (s: string): string => s.trim().toLocaleLowerCase();

/** The name a rename asks for, or the sentence saying why not. */
export function listNameOf(lists: readonly { id: string; name: string }[], id: string, typed: string): { ok: true; name: string } | { ok: false; fix: string } {
  const name = typed.trim().replace(/\s+/gu, ' ');
  if (name === '') return { ok: false, fix: 'Give the list a name.' };
  const was = lists.find((l) => l.id === id);
  if (was && was.name === name) return { ok: false, fix: `${name} is its name already.` };
  const other = lists.find((l) => l.id !== id && fold(l.name) === fold(name));
  if (other) return { ok: false, fix: `This record already has a list called ${other.name}.` };
  return { ok: true, name };
}

/** The list's declaration with only its name changed. */
export const renamedBody = <T extends object>(body: T, name: string): T & { name: string } => ({ ...body, name });

/** Rename list `id` to `name`, filed as a change to the list and accepted at once for the owner. */
export async function renameList(base: string, id: string, was: string, name: string, owner: boolean, io?: Fetch): Promise<Added> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const read = await client.schema(id);
  if (!read.ok) return { from: 'refused', fix: 'refusal' in read ? read.refusal.fix : `${was} could not be read, so it was not renamed.` };
  const body = read.value as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return { from: 'refused', fix: `${was} could not be read, so it was not renamed.` };
  const change = { declaration_id: `register.${id}`, to: { id: `register.${id}`, kind: 'register', body: renamedBody(body, name) } };
  return fileChange(base, id, `Rename the list ${was} to ${name}?`, change, owner, 'Renamed by the owner.', io);
}
