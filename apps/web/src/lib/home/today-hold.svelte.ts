/**
 * EACH TODAY CARD HOLDS THE HEIGHT IT HAD LAST TIME WHILE THE PAGE FILLS (`today-shape.ts`). A card's first draw is often
 * short or tall of what it lands as (a question that reads a beat later, a row drawn from the copy with no presses yet): the
 * board stood up, then changed, and every card under it jumped, 0.16 of a phone's screen on a reload. So its cell is that
 * height and no other, clipped, until a moment after the screen has drawn; a card that really did change takes its true height then.
 */
const held = $state<{ h: Record<string, number> }>({ h: {} });

/** The height a card's cell stands at, or nothing: read by every board's cell (`PageBody.svelte`). */
export const holdOf = (key: string | undefined): string | undefined => {
  const h = key === undefined ? undefined : held.h[key];
  return h === undefined ? undefined : `${h}px`;
};

/** Which Today holds them: a Today going away after the next has drawn must not let the next one's cards go. */
let holder = 0;

/** Hold these cards; what comes back lets them go. */
export function holdCards(cards: readonly { key: string; h: number }[]): () => void {
  const mine = ++holder;
  held.h = Object.fromEntries(cards.map((c) => [c.key, c.h]));
  return () => {
    if (mine === holder && Object.keys(held.h).length > 0) held.h = {};
  };
}
