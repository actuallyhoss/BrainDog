<!--
  WHILE THE RECORD IS ANSWERING. DESIGN-SYSTEM 4.8: hold the final geometry with `s2` blocks, no
  shimmer, and only after 300ms.

  Eight screens drew nothing at all here, on the argument that a placeholder list is rows that are
  not there. That argument is about the SAMPLE flashing over a live record, and it still holds: these
  are bars, not rows, and carry no word or figure of any record. What drawing nothing cost was a
  blank panel for as long as the record took, which on a slow link read as a broken screen.

  AFTER 300ms, because an answer that lands sooner should not flash bars on the way in. The delay is
  an animation delay, so it costs no timer and nothing to clean up.

  `head` draws the title's bar too, for a screen whose head waits on the same answer. `role="status"`
  and one hidden word, so a screen reader hears that something is on its way and not a list of shapes.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';

  let { head = false, rows = 5 }: { head?: boolean; rows?: number } = $props();

  /* Widths that read as text of different lengths rather than a barcode of equal ones. */
  const WIDTHS = ['62%', '48%', '71%', '39%', '56%', '44%', '66%', '52%'];
</script>

<div class="waiting" class:head role="status">
  <span class="said">{copy.waiting}</span>
  {#if head}<span class="bar title" aria-hidden="true"></span>{/if}
  {#each { length: rows } as _, i}
    <span class="bar" style:inline-size={WIDTHS[i % WIDTHS.length]} aria-hidden="true"></span>
  {/each}
</div>

<style>
  .waiting {
    display: grid;
    gap: var(--sp-5);
    animation: waiting-in var(--d-state) var(--ease-out) 300ms backwards;
  }

  /* With its own head, it stands where the page head and its list would: the same gutter. */
  .waiting.head {
    padding: var(--sp-5) var(--gutter);
  }

  .bar {
    display: block;
    block-size: var(--sp-3);
    /* `s3`, not the `s2` 4.8 first named: on the light ground `s2` measured all but invisible. */
    background: var(--s3);
    border-radius: var(--r-sm);
  }

  .bar.title {
    inline-size: min(240px, 60%);
    block-size: var(--sp-5);
    margin-block-end: var(--sp-3);
  }

  .said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes waiting-in {
    from {
      opacity: 0;
    }
  }
</style>
