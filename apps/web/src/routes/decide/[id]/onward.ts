/**
 * WHERE A QUESTION WENT AND WHAT IS NEXT, for `/decide/<id>` once the question on it is no longer open.
 *
 * THE NEXT QUESTION WAS `openIds[here + 1]`, AND THAT IS WRONG TWICE. A card link on `/decide` lands
 * anywhere in the queue, so the last question in the order can have three open ones above it, and
 * `+ 1` off the end found nothing and drew nothing. A decided question is not in the open list at all,
 * so `here` is -1 and it happened to work, which is why nobody saw the first case. After this one comes
 * first, then the queue wraps, and the question on the screen is never its own next.
 *
 * IT IS A MODULE AND NOT A LINE IN THE ROUTE so `node --test` can read it, as `../answering.ts` is.
 */

/** The open question after `id` in the queue's order, then the first one before it, never `id` itself. */
export function nextOpen(open: readonly string[], id: string): string | undefined {
  const at = open.indexOf(id);
  return [...open.slice(at + 1), ...open.slice(0, Math.max(at, 0))].find((q) => q !== id);
}

/** How many open questions wait besides the one on the screen. */
export const stillWaiting = (open: readonly string[], id: string): number => open.filter((q) => q !== id).length;

/**
 * THE WORDS, kept beside the rule they describe. `left(0)` is the list page's "Nothing waits on you"
 * with the one word that makes it true here: this reader may be looking at a question they just
 * answered, and "nothing waits" read under it sounds like the answer was lost.
 */
export const words = {
  where: 'It no longer waits on anybody, and Needs you keeps it under Decided.',
  left: (n: number): string =>
    n === 0 ? 'Nothing else waits on you.' : n === 1 ? 'One more question waits in Needs you.' : `${String(n)} more questions wait in Needs you.`,
  back: 'Back to Needs you',
};
