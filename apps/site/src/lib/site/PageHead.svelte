<!--
  An inner page's head (the redo of 2 November): on the app's board like the rest of the page, the page's one h1 at
  the page step in Lexend 600, its lead under it in the second ink, and room for what the page puts there (the Slash
  key, the connect box). `before` draws over the heading, such as the page's glyph in a well.

  THE PAGE'S FIRST SECTION, and the same ground as the bar above it in light (the board under a white bar) and in dark
  (the board under the crimson bar), so a page never opens on a slab of its own.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, lead, before, children }: { title: string; lead?: string; before?: Snippet; children?: Snippet } = $props();
</script>

<section class="page-head">
  <div class="wrap">
    {@render before?.()}
    <h1>{title}</h1>
    {#if lead}<p class="lede">{lead}</p>{/if}
    {@render children?.()}
  </div>
</section>

<style>
  .page-head {
    padding-block: clamp(40px, 3vw + 24px, 72px) 0;
  }

  .wrap {
    display: grid;
    justify-items: start;
    gap: var(--sp-4);
  }

  h1 {
    max-inline-size: 20ch;
    color: var(--ink);
    font-size: var(--t-page);
    line-height: 1.06;
    letter-spacing: -0.03em;
    overflow-wrap: break-word;
  }

  .lede {
    max-inline-size: 40rem;
  }
</style>
