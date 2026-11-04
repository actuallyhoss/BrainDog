/**
 * What this browser keeps of what one person read, dropped when their session ends: a sign-out, a session the record no
 * longer knows, access that ended, an account closed.
 *
 * A SHARED DEVICE (review 3, P1): the owner signed out, a member of the same record signed in, and every screen drew the
 * owner's late counts on the member's projects, counts that took in rows kept private from the member. The kept shell
 * and the local copy went on sign-out; the sidebar's week, its counts, the projects' order, the Slash threads and the
 * answers beside them, the places opened last and the marks of what was seen stayed. Each of these keys holds words, ids
 * or numbers read off the record as that person, so each goes with them. What stays is the device's own: its look, its
 * nav, its notifications, a list's default (kept by person already), and each person's publisher key, which is kept
 * under their own id (`author-key.ts`) and is reached only by them.
 *
 * NOT THE PICTURES DRAWN WIDGETS LEFT (`drawn-pictures.ts`), which went here once (SEC23) and are now kept under the
 * person and the BrainDog they were drawn for, so the next person is never drawn one and the same person's sign-in does
 * not redraw every widget from nothing (sec-follow M3). A picture kept before that, under the code and size alone
 * (`LEGACY_PICTURE`), is never read again and belongs to nobody it can name, so a sign-out drops it (RE11).
 *
 * WHAT ONLY AN EXPLICIT SIGN-OUT DROPS is not here: this runs on every session end, a lapse too. The person's own
 * pictures go at the press alone (`auth.ts` `forgetOwn`, his call of 23 Oct). Their publisher key stays at any sign-out,
 * kept under their id, since the store takes an update only with the key that signed the add-on (`author-key-forget.ts`).
 *
 * THE KEYS ARE WRITTEN OUT HERE, not imported, so sign-out loads none of the screens that keep them;
 * `signed-out.test.ts` holds each to the constant its own module keeps it under.
 *
 * PURE, AND NODE LOADS IT: the stores are handed in.
 */

/** Keys kept in `localStorage` whole. */
export const SIGNED_OUT_KEYS = [
  /* the shell (`boot-copy.ts`) and the sidebar's list beside it (`side-copy.ts`) */
  'braindog.boot-copy',
  'braindog.side-copy',
  /* the rows the palette's search found, by their names, so the next letters answer at once (`search-kept.ts`) */
  'braindog.find-copy',
  /* every name on the record, for the search field to answer before it asks (`search-kept.ts`) */
  'braindog.find-names',
  /* the sidebar's week, counts, projects' order and lists' facts (`side-read.ts`, `side.ts`, `project-order.ts`) */
  'bd_side_week',
  'bd_side_counts',
  'bd_side_order',
  'bd_side_facts',
  /* Slash's threads by their first question (`slash-chat.ts`), the sends and their answers (`convos.svelte.ts`), the
     last place sent to (`send.ts`) */
  'bd_slash_threads',
  'bd_send_convos',
  'bd_send_last',
  /* the places opened last, by their names (`opened.ts`) */
  'bd_opened',
  /* the lines and questions put aside today (`late-verb.ts`, `slot.ts`), the list mail goes into (inbox) */
  'today-late-aside',
  'braindog:slot:aside',
  'braindog.inbox.into',
] as const;

/** Keys kept in `localStorage` one a page, a record or a board, by what they start with. */
export const SIGNED_OUT_PREFIXES = [
  /* what was seen on each page, row by row (`byline.ts`) */
  'braindog.seen.',
  /* the shares whose first line was shown (`sharing.ts`) */
  'braindog.welcomed:',
  /* a board's unsaved arrangement (`Home.svelte`) */
  'bd_board_draft:',
  /* Slash's threads, one list a person a BrainDog (`slash-chat.ts` `threadsKey`) */
  'bd_slash_threads:',
  /* Today's Tell line and what it last added, one a person a BrainDog (`tell-line.ts`) */
  'bd.tell:',
] as const;

/** A drawn widget's picture in the shape kept before it was kept per person (`<code>.<size>.<mode>`, no `whose.`). */
export const LEGACY_PICTURE = /^bd\.drawn\.pic\.[^.]+\.[^.]+\.(?:light|dark)$/u;

/** Keys kept in `sessionStorage`: who this tab sees the record as (`see-as.svelte.ts`), never carried to the next session. */
export const SIGNED_OUT_SESSION_KEYS = ['braindog.see-as'] as const;

type Store = Pick<Storage, 'length' | 'key' | 'removeItem'>;

const reach = (which: 'localStorage' | 'sessionStorage'): Store | null => {
  try {
    return globalThis[which] ?? null;
  } catch {
    return null;
  }
};

function drop(store: Store | null, keys: readonly string[], prefixes: readonly string[], shapes: readonly RegExp[] = []): void {
  if (!store) return;
  try {
    const gone = new Set<string>(keys);
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k !== null && (prefixes.some((p) => k.startsWith(p)) || shapes.some((r) => r.test(k)))) gone.add(k);
    }
    for (const k of gone) store.removeItem(k);
  } catch {
    /* blocked storage keeps nothing to drop */
  }
}

/** Drop what this browser keeps of what the person who just left read. Never throws. */
export function forgetSignedOut(local: Store | null = reach('localStorage'), session: Store | null = reach('sessionStorage')): void {
  drop(local, SIGNED_OUT_KEYS, SIGNED_OUT_PREFIXES, [LEGACY_PICTURE]);
  drop(session, SIGNED_OUT_SESSION_KEYS, []);
}
