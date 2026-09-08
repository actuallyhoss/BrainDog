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

/**
 * ONE SUBSCRIPTION, AND IT IS THE PACKAGE'S. `Table` asks the same question one layer down — it
 * carries its own card body and had the identical defect, 54,786 hidden nodes of 83,871 on a
 * desktop register — so the answer moved into `braindog-render/svelte` where both layers can read
 * it. Two `matchMedia` listeners could disagree for a paint, which would draw a register's cards
 * inside a grid, or neither body at all.
 *
 * Re-exported rather than re-implemented, so the app keeps its own name for it and there is still
 * exactly one place the 640px line is written down in code.
 */
export { rowsAsCards } from 'braindog-render/svelte';
