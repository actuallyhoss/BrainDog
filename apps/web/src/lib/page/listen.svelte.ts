/**
 * A PAGE THAT LISTENS: it reads itself again when the record moves, so a reply an agent wrote while the reader looked
 * at the page appears under its note without a reload.
 *
 * The record's version is `live.version`, which the shell's poll (`lib/data/live.ts`, about every 1.5 s while the tab has focus) moves only when it
 * hears a different one. This follows it from a component: call `listen` while the component initialises, and the
 * effects it makes go with the component, so it stops on unmount with no teardown of the caller's.
 *
 * THE OLD CONTENT STAYS UNTIL THE NEW READ LANDS (no blank flash, no spinner where the old content can
 * stay). `reread` is the caller's read that draws over the page only once it has answered, and a read that fails draws
 * nothing, so the page as drawn stands until there is a newer one to move to (`recompose.ts` then plays the move).
 *
 * AND A CHANGE HEARD WHILE NOBODY IS LOOKING IS READ WHEN SOMEBODY IS. A tab in the background answers no recomposition
 * (`recompose.ts` draws a hidden page in one frame), so a page read there changed with nobody to see it move, and read
 * again on the poll that follows anyway. The read waits for the tab to be shown, and the change then moves in place in
 * front of the reader, once, however many versions passed while it was away.
 */
import { untrack } from 'svelte';
import { live } from '$lib/data/live.svelte.ts';

/* HOW OFTEN A RE-READ HELD BACK BY `busy()` LOOKS AGAIN. `busy` is a plain function, often a question about the DOM (a
   finger down, a field focused), which no rune tracks, so the wait is a short timer rather than an effect. A change
   heard meanwhile only sets the same flag, so however fast the poll runs, the reader's typing is waited out once. */
const RETRY_MS = 1_000;

/**
 * Reads again, through `reread`, each time `live.version` changes: at most once per change, however many land while
 * a read is out, and never while `busy()` says the reader is in the middle of something of their own (a write going
 * out, a field being typed into), in which case it waits for them to finish and reads then.
 */
export function listen(reread: () => Promise<void>, busy: () => boolean): void {
  /* The version the page was drawn at. A plain `let`, because it is compared and never drawn. */
  let heard = untrack(() => live.version);
  /* A change heard and not yet read. One flag, not a count: two changes while the reader types are one re-read. */
  let owed = false;
  /* A re-read out now. A change that lands meanwhile sets `owed` again, and is read once this one answers. */
  let out = false;
  let wait: ReturnType<typeof setTimeout> | null = null;
  let gone = false;
  /* THE LISTENER WAITING FOR THE TAB TO BE SHOWN, while a change is held for it. */
  let shown: (() => void) | null = null;

  const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

  const whenShown = () => {
    if (shown !== null || gone) return;
    shown = () => {
      if (hidden()) return;
      document.removeEventListener('visibilitychange', shown!);
      shown = null;
      void settle();
    };
    document.addEventListener('visibilitychange', shown);
  };

  const later = () => {
    if (wait === null && !gone) wait = setTimeout(() => ((wait = null), void settle()), RETRY_MS);
  };

  async function settle(): Promise<void> {
    if (gone || !owed || out) return;
    if (hidden()) return whenShown();
    if (busy()) return later();
    owed = false;
    out = true;
    try {
      await reread();
    } catch {
      /* A failed re-read keeps the page as drawn. A failed poll is the hairline's to say, and the next change tries
         again, so there is nothing for the reader here. */
    } finally {
      out = false;
    }
    if (owed) void settle();
  }

  $effect(() => {
    const now = live.version;
    if (now === null || now === heard) return;
    heard = now;
    owed = true;
    untrack(() => void settle());
  });

  /* STOPS ON UNMOUNT: a wait still pending would otherwise read a page nobody is looking at. */
  $effect(() => () => {
    gone = true;
    if (wait !== null) clearTimeout(wait);
    wait = null;
    if (shown !== null) document.removeEventListener('visibilitychange', shown);
    shown = null;
  });
}
