/**
 * Home's read mark: everything up to a cursor marked read, and the shell's feed asked again behind it.
 *
 * ITS OWN MODULE, APART FROM `news-live.ts`, BECAUSE TODAY IMPORTS IT WITH THE SCREEN. `news-live.ts` also draws a figure
 * as a tile from the declared metrics, and a module shared between chunks is bundled whole: importing `markAll` from
 * there put every metric declaration of the seed on Today's first load. `news-live.ts` re-exports it.
 */

import { createClient, type Cursor } from '@braindog/client';

import { refreshShell, type Fetch } from './boot-live.ts';

/**
 * Mark everything up to `upTo` read, and ask the shell's `boot` again behind it, whose feed it was. `upTo` is the record's cursor
 * for the newest line: a rowid for the owner, `e.<id>` for a member held to named lists, handed back as it came.
 *
 * THE REQUEST IS MADE BEFORE THIS FIRST WAITS: nothing is awaited between the call and the client's fetch, so a screen
 * that calls it as it is left (`pagehide`) has sent the mark in that turn. Keep it so: an `await` above `markRead`
 * loses the mark of a closing tab.
 */
export async function markAll(base: string, upTo: Cursor | null, io?: Fetch): Promise<boolean> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.markRead(upTo ?? undefined);
  /* ONLY THE SHELL, WHOSE FEED IT WAS, and asked again behind the kept one so the next screen does not wait on it. The
     mark moves no row and no declaration: dropping the schemas and kept reads with it (`forget`) had the next screen
     ask every list's schema and walk again on every leave of Today. */
  refreshShell(base);
  return out.ok;
}
