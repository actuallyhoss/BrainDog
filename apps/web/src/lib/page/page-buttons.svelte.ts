/**
 * THE PAGE'S OWN BUTTONS, HANDED TO THE TILE THAT LEADS IT (1 Nov).
 *
 * A project's page has no sentence in the head: the bar says the name and the first tile says where things stand. So the
 * head was a row holding Share and "⋯" alone at its far end, 56px of board over the hero. From 900px the
 * page hands its buttons to the lead tile (`PageView` sets this; the project's hero reads it), which
 * draws them at the end of its top row, and the head gives the row back.
 *
 * THE TILE SAYS IT HAS THEM by holding a `take()` while they are drawn, so the head draws them itself whenever no tile
 * does (a project still being read, a hero with nothing to say), and never twice.
 */
import { getContext, setContext, untrack, type Snippet } from 'svelte';

const KEY = Symbol('page-buttons');

export type PageButtons = {
  /** The buttons, while a tile may take them: set by the page, null on a phone, while arranging or reading the source. */
  buttons: Snippet | null;
  /** How many tiles are drawing them now (one, in practice). */
  held: number;
};

export function hostButtons(): PageButtons {
  const host = $state<PageButtons>({ buttons: null, held: 0 });
  setContext(KEY, host);
  return host;
}

export function pageButtons(): PageButtons | undefined {
  return getContext<PageButtons | undefined>(KEY);
}

/** An attachment for the element the tile draws them in: counted while it is on the screen. */
export const take =
  (host: PageButtons) =>
  (_el: HTMLElement): (() => void) => {
    /* UNTRACKED, or the attachment reads the count it writes and runs again for ever. */
    untrack(() => (host.held += 1));
    return () => {
      untrack(() => (host.held -= 1));
    };
  };
