/**
 * ACTIVITY STAMPS THE READER'S MARK WHEN THEY LEAVE (PGS-C02): a screen that draws what is new since the mark moves the
 * mark, with the newest line it held. Only Home did, and only where Home drew a feed of the log, so on a record whose
 * home has none the mark stood still and Activity said the same sixty things were new each time it was opened.
 *
 * Nothing here reaches the record: the page hands `stampOf` the send (`markAll` in `lib/record/news-live.ts`).
 */

import type { Cursor } from '@braindog/client';

/**
 * The cursor to stamp, or `null` for no stamp at all.
 *
 * `upTo` IS THE SHELL'S, the newest line of what was new when `boot` answered, and the shell keeps that answer for the
 * tab. So it can be older than what this page drew, and `null` when nothing was new at the time. `held` is the number
 * of the newest line the page's log holds, which the record sends only to a reader of the whole record (`readLog`
 * draws anybody else's as 0): where both are numbers the newer one is sent, and a member held to named lists sends
 * back the cursor she was handed, exactly as it came, since a number is what the record refuses her.
 *
 * `unseen` IS HOW MANY LINES THE AWAY READ ANSWERED WITH, and `null` when it did not answer. Nothing unseen is nothing
 * to stamp, and a page that could not say what was new has shown nothing to mark read.
 *
 * NEVER A BARE MARK. `markRead` with no cursor marks up to the record's newest line, which this page may never have held.
 */
export function readMarkOf(upTo: Cursor | null, unseen: number | null, held = 0): Cursor | null {
  if (unseen === null || unseen <= 0) return null;
  if (typeof upTo === 'string') return upTo;
  const drawn = Number.isSafeInteger(held) && held >= 1 ? held : null;
  if (upTo === null) return drawn;
  return drawn !== null && drawn > upTo ? drawn : upTo;
}

/** What the away read holds once the mark has landed: nothing unseen, which the title's sentence says as nothing new. */
export function seenAfter(): { actors: string[]; capped: boolean; byWho: null } {
  return { actors: [], capped: false, byWho: null };
}

export type Stamp = {
  /** Send the mark, once. `true` only for the call whose mark landed. */
  leave: (upTo: Cursor | null) => Promise<boolean>;
  landed: () => boolean;
};

/**
 * ONE STAMP A VISIT. A reader leaves twice (the tab is hidden, then another screen opens) and one mark is sent. A mark
 * that did not land, refused or never reached, leaves the record's where it was and may be tried at the next leave, so
 * the same lines come back rather than being lost.
 */
export function stampOf(send: (upTo: Cursor) => Promise<boolean>): Stamp {
  let going = false;
  let done = false;
  return {
    async leave(upTo) {
      if (going || done || upTo === null) return false;
      going = true;
      try {
        done = await send(upTo);
      } catch {
        done = false;
      } finally {
        going = false;
      }
      return done;
    },
    landed: () => done,
  };
}
