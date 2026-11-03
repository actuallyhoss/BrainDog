<!--
  WHILE THE RECORD IS ANSWERING. Hold the final geometry, no shimmer, and only
  after 300ms. The geometry is a list's: rows the height of a row, each with the 32px
  well a row leads with and one bar where its title goes.

  Eight screens drew nothing at all here, on the argument that a placeholder list is rows that are
  not there. That argument is about the SAMPLE flashing over a live record, and it still holds: these
  are bars, not rows, and carry no word or figure of any record. What drawing nothing cost was a
  blank panel for as long as the record took, which on a slow link read as a broken screen.

  AFTER 300ms, because an answer that lands sooner should not flash bars on the way in. The delay is
  an animation delay, so it costs no timer and nothing to clean up.

  `head` draws the title's bar too, for a screen whose head waits on the same answer. `role="status"`
  and one hidden word, so a screen reader hears that something is on its way and not a list of shapes.

  `aria-busy="true"` for as long as it stands: it is never switched off here, because the skeleton is
  taken off the screen when the answer lands. The bars stay hidden, so busy adds to the word and does
  not replace it.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Skeleton from './Skeleton.svelte';

  let { head = false, rows = 5 }: { head?: boolean; rows?: number } = $props();
</script>

<!-- THE SAME BARS AS EVERY CARD'S SKELETON (`Skeleton.svelte`, ui-perfect 3 Nov): one look for loading everywhere. -->
<div class="waiting" class:head>
  {#if head}<span class="bar title" aria-hidden="true"></span>{/if}
  <Skeleton kind="rows" count={rows} label={copy.waiting} />
</div>

<style>
  .waiting {
    display: grid;
    gap: 0;
  }

  /* With its own head, it stands where the page head and its list would: the same gutter. */
  .waiting.head {
    padding: var(--sp-5) var(--gutter);
  }

  .bar.title {
    display: block;
    inline-size: min(240px, 60%);
    block-size: var(--sp-5);
    margin-block-end: var(--sp-4);
    background: color-mix(in oklab, var(--ink) 8%, transparent);
    border-radius: var(--r-pill);
    animation: waiting-in var(--d-state) var(--ease-out) 300ms backwards;
  }

  @keyframes waiting-in {
    from {
      opacity: 0;
    }
  }
</style>
