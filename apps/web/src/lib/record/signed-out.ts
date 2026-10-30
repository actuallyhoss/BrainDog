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
 * AND THE PICTURES DRAWN WIDGETS LEFT (`drawn-pictures.ts`): each is what a component drew from the record as the person
 * who last saw it, keyed by its code and size alone, so the next person's board drew it at once, before their own
 * component ran.
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
  /* the list of drawn widgets' pictures kept (`drawn-pictures.ts`) */
  'bd.drawn.pics',
] as const;

/** Keys kept in `localStorage` one a page, a record or a board, by what they start with. */
export const SIGNED_OUT_PREFIXES = [
  /* what was seen on each page, row by row (`byline.ts`) */
  'braindog.seen.',
  /* the shares whose first line was shown (`sharing.ts`) */
  'braindog.welcomed:',
  /* a board's unsaved arrangement (`Home.svelte`) */
  'bd_board_draft:',
  /* each drawn widget's picture, as it last drew the record (`drawn-pictures.ts`) */
  'bd.drawn.pic.',
] as const;

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

function drop(store: Store | null, keys: readonly string[], prefixes: readonly string[]): void {
  if (!store) return;
  try {
    const gone = new Set<string>(keys);
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k !== null && prefixes.some((p) => k.startsWith(p))) gone.add(k);
    }
    for (const k of gone) store.removeItem(k);
  } catch {
    /* blocked storage keeps nothing to drop */
  }
}

/** Drop what this browser keeps of what the person who just left read. Never throws. */
export function forgetSignedOut(local: Store | null = reach('localStorage'), session: Store | null = reach('sessionStorage')): void {
  drop(local, SIGNED_OUT_KEYS, SIGNED_OUT_PREFIXES);
  drop(session, SIGNED_OUT_SESSION_KEYS, []);
}
