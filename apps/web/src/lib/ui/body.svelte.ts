/**
 * Which body a list draws — cards or a grid — as a fact the page can read, not only a stylesheet.
 *
 * `13 §10` MADE THE CARD LIST THE PHONE'S BODY AND THE TABLE THE DESKTOP'S, and `RowCards`' own
 * header says the rule out loud: *"ONE BODY AT A TIME. Above 640px this does not exist and the
 * table does; below it, the other way round."* It was enforced with `display: none` in both
 * directions — which hides one body and **builds both**.
 *
 * Measured on a register of 2,614 rows: **4,001 rows in the document and 102,681 nodes**, 2,000 of
 * them table rows and 2,000 of them cards that no pixel of the screen was showing, and eight seconds
 * before the page settled. `22 §4` prices exactly this — ~27 µs a row on a desktop and ~167 µs at 4×
 * throttle — and the cap that `13 §4.3` puts on the DOM was being paid twice, once invisibly.
 *
 * SO THE BRANCH IS IN THE MARKUP AND THE MEDIA QUERY IS THE INPUT TO IT. This is a width question
 * and it is allowed to be: `05 §6`'s rule is that *"a width query never changes a control's SIZE"* —
 * only the pointer may do that — and `13 §10` is a rule about LAYOUT, which width decides. Which of
 * two bodies exists is layout in its plainest form.
 *
 * ONE SUBSCRIPTION FOR THE WHOLE APP. Two list routes need it today and every later one will; a
 * `matchMedia` listener per component is a leak per component and an answer that can drift between
 * two lists on one screen.
 *
 * `RowCards` KEEPS ITS `display: none`. It is no longer load-bearing, and that is why it stays: a
 * second surface that renders the component without asking this question gets the old behaviour
 * rather than two bodies stacked on top of each other.
 */
const CARDS = '(width < 640px)';

let cards = $state(false);

/* `typeof window`, because this module is imported by tests and by the SSR pass that `adapter-static`
   runs to produce the shell. Neither has a viewport, and the answer for a page with no window is the
   grid — the same default the stylesheet has. */
if (typeof window !== 'undefined') {
  const mq = window.matchMedia(CARDS);
  cards = mq.matches;
  mq.addEventListener('change', (e) => (cards = e.matches));
}

/** True where a list draws two-line cards rather than a grid (`13 §10`). */
export const rowsAsCards = (): boolean => cards;
