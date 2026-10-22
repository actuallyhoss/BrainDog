/**
 * Which list plays each part the first run reads by, from what the lists declare, never from what they are called.
 *
 * A LIST SAYS WHAT IT PLAYS (`packages/kernel/src/roles.ts`): `meets:` is the people `meet` writes, `rates:` the rates
 * money converts by, `hand:` the work a person or an agent picks up. The projects are the list the people's `projects`
 * part links to. So "where Money is kept" is a list that plays `rates`, not a module the web knows by its id, and a
 * record whose people are in a list called `contacts` is read the same (`tools/gates/web-lists.mjs`).
 *
 * READ OFF THE MODULES THIS BUILD SHIPS, and asked of the lists a record holds, so a part is played here only when the
 * record keeps the list that plays it. The seed says which list that is (`@braindog/seed/packs/lists` `PLAYED_BY`), and its
 * test reads it back off the modules' documents the way this file once did. This file used to build those documents
 * itself, and Today asks it on the first open, so every module's document and example rows came with the first screen.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screens only call it.
 */

import { PLAYED_BY, listsOfModule, type Part } from '@braindog/seed/packs/lists';

/** A part the first run reads a list by. */
export type { Part };

/** The list that plays `part`, or `null` where no module this build ships declares one. */
export const playedBy = (part: Part): string | null => (Object.hasOwn(PLAYED_BY, part) ? PLAYED_BY[part] : null);

/** Whether one of `lists` plays `part`. */
export const plays = (lists: Iterable<string>, part: Part): boolean => {
  const by = playedBy(part);
  return by !== null && new Set(lists).has(by);
};

/** The lists the modules `ids` bring, for a record made from them a moment ago and not read back yet. */
export const listsOfModules = (ids: readonly string[]): string[] => ids.flatMap((id) => listsOfModule(id) ?? []);

/** The lists a record holds on: every list of every pack that is on, from what `packs` answers. */
export const listsOn = (packs: readonly { disabled_at: string | null; registers?: readonly string[] }[]): string[] =>
  packs.flatMap((p) => (p.disabled_at === null ? (p.registers ?? []) : []));
