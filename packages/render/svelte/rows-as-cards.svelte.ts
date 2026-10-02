/**
 * Whether rows are drawn as cards or as a grid — one subscription, one answer, for the whole app.
 *
 * `13 §10` MAKES THE CARD LIST THE PHONE'S BODY AND THE TABLE THE DESKTOP'S, and both `Table` and
 * the app's own `RowCards` enforced it with `display: none` in both directions. That hides one body
 * and **builds both**. Branching the app-level one was half the fix: `Table` carries its own
 * `.table-cards` list, so on a desktop register of 2,614 rows the document held 2,000 grid rows AND
 * 2,000 cards — a `.table-cards` subtree of **54,786 nodes out of 83,871 under `#main`, 65% of the
 * document, none of it on the screen.**
 *
 * `22 §4` prices what that costs: ~27 µs a row on a desktop and ~167 µs at 4× throttle, at nine
 * nodes a row. The cap `13 §4.3` puts on the DOM was being paid twice at every width.
 *
 * IT LIVES HERE, IN THE PACKAGE, BECAUSE TWO LAYERS ASK THE SAME QUESTION. The register asks it to
 * choose between `RowCards` and `Table`; `Table` asks it to choose between its own two bodies. Two
 * `matchMedia` listeners could answer differently for one paint — a register showing cards inside a
 * grid, or neither — and one of them would be a component-scoped leak per instance. The app's
 * `lib/ui/body.svelte.ts` re-exports this rather than keeping a second copy.
 *
 * THE PACKAGE SUPPLIES THE SHAPE AND THE HOST SUPPLIES THE RULES, which this bends by a hair and
 * on purpose: the 640px line is not a token or a policy, it is `13 §10` itself, and it is already
 * written into this package's stylesheet contract twice. A prop would put the same constant in
 * every call site instead.
 */
const CARDS = '(width < 640px)';

let cards = $state(false);

/* `typeof window`, because this module is imported by tests and by the SSR pass that builds the
   shell. Neither has a viewport, and the answer for a page with no window is the grid — the same
   default the stylesheet has. */
if (typeof window !== 'undefined') {
  const mq = window.matchMedia(CARDS);
  cards = mq.matches;
  mq.addEventListener('change', (e) => (cards = e.matches));
}

/** True where a list draws two-line cards rather than a grid (`13 §10`). */
export const rowsAsCards = (): boolean => cards;
