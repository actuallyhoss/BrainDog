/**
 * The one decision card (`DecisionCard.svelte`), loaded once for the tab beside the page's data, not ahead of the first
 * paint.
 *
 * TODAY AND EVERY PAGE WITH A QUEUE DRAW IT, AND NONE OF THEM DRAWS IT BEFORE ITS DATA. A question is read with the page
 * it sits on, so a card has nothing to show until that read lands. Imported where it is drawn, the card and what it
 * reads (the arranged view, the flow, the jobs and the kernel's decision rules behind them) were part of the script every
 * first open waited for, a sixth of it. `QueueAnswer.svelte` asks for it as it loads, so it
 * arrives beside the page's read, and draw it once it has.
 *
 * ONE ASK FOR THE TAB, kept, so the tenth card on a page does not ask again and a card drawn after the first draws at once.
 */

import type DecisionCard from './DecisionCard.svelte';

type Card = typeof DecisionCard;

let loaded: Card | null = null;
let loading: Promise<Card> | null = null;

/** The card, if it has arrived. */
export const cardNow = (): Card | null => loaded;

/** The card, asked once for the tab. A chunk that did not arrive is asked again by the next caller. */
export function loadCard(): Promise<Card> {
  loading ??= import('./DecisionCard.svelte').then(
    (m) => (loaded = m.default),
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}
