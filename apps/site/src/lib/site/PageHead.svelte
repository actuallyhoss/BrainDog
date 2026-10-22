<!--
  A page's head on the night ground, under the header's own night band so the two read as one:
  the page's one h1, huge and set tight, its lead in the night's second ink, and room below for what the page puts
  there (the Slash key, the connect box).

  THE PAGE'S FIRST SECTION. The header above it is night too and draws no edge, so the band runs on unbroken.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, lead, before, children }: { title: string; lead?: string; before?: Snippet; children?: Snippet } = $props();
</script>

<section class="night">
  <div class="wrap page-head">
    {@render before?.()}
    <h1>{title}</h1>
    {#if lead}<p class="lead">{lead}</p>{/if}
    {@render children?.()}
  </div>
</section>

<style>
  .page-head {
    padding-block: 64px;
  }

  h1 {
    max-inline-size: 14ch;
    font-size: clamp(44px, 5.6vw, 80px);
    line-height: 0.95;
    letter-spacing: -0.05em;
    text-wrap: balance;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .lead {
    max-inline-size: 31em;
    margin: 28px 0 0;
    color: var(--on-night-2);
    font-size: clamp(1.08rem, 1.55vw, 1.32rem);
    line-height: 1.5;
    text-wrap: pretty;
  }

  @media (max-width: 760px) {
    .page-head {
      padding-block: 36px 44px;
    }
  }
</style>
