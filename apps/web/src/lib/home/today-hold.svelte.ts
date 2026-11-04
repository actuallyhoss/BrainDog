/**
 * EACH TODAY CARD HOLDS THE HEIGHT IT HAD LAST TIME WHILE THE PAGE FILLS (`today-shape.ts`). A card's first draw is often
 * short of what it lands as (a question that reads a beat later, a late line): the board stood up, then grew, and every card
 * under it jumped, 0.16 of a phone's screen on a reload. Let go a moment after the screen has drawn, so a card that really
 * did change takes its true height then.
 */
const held = $state<{ h: Record<string, number> }>({ h: {} });

/** The height to hold a card's cell at, or nothing: read by every board's cell (`PageBody.svelte`). */
export const holdOf = (key: string | undefined): string | undefined => {
  const h = key === undefined ? undefined : held.h[key];
  return h === undefined ? undefined : `${h}px`;
};

export function holdCards(cards: readonly { key: string; h: number }[]): void {
  held.h = Object.fromEntries(cards.map((c) => [c.key, c.h]));
}

export function letCardsGo(): void {
  if (Object.keys(held.h).length > 0) held.h = {};
}
