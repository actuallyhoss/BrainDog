<!--
  A figure that changes in place (motion section 3, "Number changes"; 2.A.3).

  WHEN IT CHANGES, THE OLD FIGURE GOES AND THE NEW ONE RISES 0.35em AND FADES IN over `--d-swap`, on tabular figures so
  nothing beside it moves. Used by tile-head counts, Today's counts, Money's figures, the project hero, card figures and
  `Count`.

  A FIGURE'S FIRST DRAW NEVER ROLLS, AND THAT IS DECIDED WHEN ITS ELEMENT IS MADE. The roll was armed by a flag on the
  wrapper, set in an effect, and an effect can run before the browser first styles the figure, so a figure drawn as a
  page opened could take its first style already armed and fade in from nothing. The top bar's Needs you badge was
  photographed that way, a red dot with a ghost of its 8. Now each figure element says when it is made whether it is a
  change (`data-roll`), and only one made after the first draw is.

  ONE MOTION AND NO LAYOUT: both figures sit in one grid cell, so the box is the wider of the two for the moment they
  overlap and the line never reflows. Under `prefers-reduced-motion` the figure simply changes.

  THE OLD FIGURE LEAVES OVER `--d-exit` WHILE THE NEW ONE RISES (fluid F12), or the count was empty for a frame: the 8
  gone and the 7 not yet in. It was removed at once and the new one began at nothing.

  A FIGURE THAT IS ONE NUMBER BEFORE AND AFTER COUNTS TO IT INSTEAD (the record forming, `$lib/motion/count.ts`): "£1,240"
  becoming "£1,310" runs through the numbers between over `--form-count`, in place, with no roll and no old figure
  fading. A word, a sign that flipped or another currency rolls as before. Never on the first draw, nor in a screen's
  first second.

  NOR DOES IT ROLL WHILE THE SCREEN OPENS (audit 11-01, AP5): the record's answer landing over the copy a screen drew
  first is the screen settling (`calm`), not the figure changing, so a load, a reload or a new tab never rolls one.
-->
<script lang="ts">
  import { ms, still } from './motion.ts';
  import { calm } from '$lib/motion/index.ts';
  import { counts, countText } from '$lib/motion/count.ts';

  let { value }: { value: string | number } = $props();

  /* Opacity only, in the exit step; for a reader who asked for less motion the figure is simply gone, and so is one the
     new figure counts on from, and one going while the screen settles or a filter's answer lands (`calm`): the 3 stood
     over the 1 for 90ms. */
  const leave = (figure: Element) => ({ duration: still() || calm() || counting(figure.textContent ?? '', said) ? 0 : ms('--d-exit', 90), css: (t: number) => `opacity:${t}` });

  /* THE FIGURE LAST DRAWN, to count from; not state. */
  let shown: string | null = null;
  /* UNDER REDUCED MOTION IT STILL GOES TO `countText`, which counts nothing there and holds the arrival wash a moment. */
  const counting = (from: string | null, to: string): boolean => from !== null && drawn.yet && !calm() && counts(from, to) !== null;
  /* AS EACH FIGURE IS MADE: one that can count from the last takes over its text and counts, and does not roll. */
  const tally = (node: HTMLElement) => {
    const now = node.textContent ?? '';
    const from = shown;
    shown = now;
    const text = node.firstChild;
    if (from !== null && counting(from, now) && text instanceof Text && countText(text, from, now)) node.removeAttribute('data-roll');
  };

  /* Not state: read once as each figure element is made, so a figure already drawn never gains the roll. */
  const drawn = { yet: false };
  $effect(() => {
    drawn.yet = true;
  });

  const said = $derived(typeof value === 'number' ? value.toLocaleString('en') : value);
</script>

<span class="fig num">{#key said}<span class="roll" data-roll={drawn.yet && !calm() ? '' : undefined} out:leave {@attach tally}>{said}</span>{/key}</span>

<style>
  .fig {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
  }

  .roll {
    grid-area: 1 / 1;
  }

  .roll[data-roll] {
    transition:
      translate var(--d-swap) var(--ease-out),
      opacity var(--d-swap) var(--ease-out);
  }

  @starting-style {
    .roll[data-roll] {
      translate: 0 0.35em;
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .roll[data-roll] {
      transition: none;
    }
  }
</style>
