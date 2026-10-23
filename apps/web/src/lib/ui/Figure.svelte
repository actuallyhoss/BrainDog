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
-->
<script lang="ts">
  import { ms, still } from './motion.ts';

  let { value }: { value: string | number } = $props();

  /* Opacity only, in the exit step; for a reader who asked for less motion the figure is simply gone. */
  const leave = (_figure: Element) => ({ duration: still() ? 0 : ms('--d-exit', 90), css: (t: number) => `opacity:${t}` });

  /* Not state: read once as each figure element is made, so a figure already drawn never gains the roll. */
  const drawn = { yet: false };
  $effect(() => {
    drawn.yet = true;
  });

  const said = $derived(typeof value === 'number' ? value.toLocaleString('en') : value);
</script>

<span class="fig num">{#key said}<span class="roll" data-roll={drawn.yet ? '' : undefined} out:leave>{said}</span>{/key}</span>

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
