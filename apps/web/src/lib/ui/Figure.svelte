<!--
  A figure that changes in place (motion section 3, "Number changes"; 2.A.3).

  WHEN IT CHANGES, THE OLD FIGURE GOES AND THE NEW ONE RISES 0.35em AND FADES IN over `--d-swap`, on tabular figures so
  nothing beside it moves. Used by tile-head counts, Today's counts, Money's figures, the project hero, card figures and
  `Count`. A page opening does not roll every number: the roll is armed after the first draw.

  ONE MOTION AND NO LAYOUT: both figures sit in one grid cell, so the box is the wider of the two for the moment they
  overlap and the line never reflows. Under `prefers-reduced-motion` the figure simply changes.
-->
<script lang="ts">
  let { value }: { value: string | number } = $props();

  let live = $state(false);
  /* After the first draw, so a page opening does not roll every number on it. */
  $effect(() => {
    live = true;
  });

  const said = $derived(typeof value === 'number' ? value.toLocaleString('en') : value);
</script>

<span class="fig num" data-live={live || undefined}>{#key said}<span class="roll">{said}</span>{/key}</span>

<style>
  .fig {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
  }

  .roll {
    grid-area: 1 / 1;
  }

  .fig[data-live] .roll {
    transition:
      translate var(--d-swap) var(--ease-out),
      opacity var(--d-swap) var(--ease-out);
  }

  @starting-style {
    .fig[data-live] .roll {
      translate: 0 0.35em;
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fig[data-live] .roll {
      transition: none;
    }
  }
</style>
