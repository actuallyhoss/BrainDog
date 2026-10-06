<!--
  The first run's frame, on `/signup` and on `/start`: the mark and the name at the top left, then the screen's own
  content across the whole window.

  FULL WIDTH WITH THE FLUID GUTTER (DIRECTION §36 and §37), never a narrow column in empty ground: at 1,512 and 1,728 the
  conversation and the BrainDog building beside it share the window, and the gutter (`--gutter`, 16 on a phone to 40)
  keeps them off its edges. Reading measure is kept inside each column, not by starving the page.

  NO SHEET AND NO RAIL CARD. These screens come before there is a record to put a rail round, and the build beside the
  words is made of tiles, so the frame itself draws nothing but the brand on the lit ground (`app.css`).

  THE FRAME STARTS AT THE TOP, and pays the top inset once, because the app is `viewport-fit=cover` and an entry screen
  has no bar to pay it; the bottom one pads the last control clear of a phone's home indicator.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';

  let { children, end }: { children: Snippet; end?: Snippet | undefined } = $props();
</script>

<div class="first-frame">
  <header class="first-brand">
    <span class="first-mark">
      <Mark height={24} />
      <span class="first-word">{copy.product}</span>
    </span>
    {#if end}<span class="first-end">{@render end()}</span>{/if}
  </header>
  <div class="first-body">{@render children()}</div>
</div>

<style>
  .first-frame {
    display: grid;
    align-content: start;
    row-gap: var(--sp-6);
    min-block-size: 100dvh;
    padding-block: calc(var(--inset) + env(safe-area-inset-top)) calc(var(--sp-7) + env(safe-area-inset-bottom));
    padding-inline: var(--gutter);
    min-inline-size: 0;
  }

  .first-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
  }

  .first-mark {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* GEIST, AS EVERY WORD IS. */
  .first-word {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .first-end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .first-body {
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .first-frame {
      row-gap: var(--sp-7);
      padding-block-start: calc(var(--sp-5) + env(safe-area-inset-top));
    }
  }
</style>
