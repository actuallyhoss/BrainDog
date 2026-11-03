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
  /* THE HEAD'S AIR: 64 above at a desk, under the header's own 64, and 72 below, a step more because the ground
     changes under it; 40 and 48 on a phone. */
  .page-head {
    padding-block: clamp(40px, 2.2vw + 32px, 64px) clamp(48px, 2.3vw + 39px, 72px);
  }

  h1 {
    max-inline-size: 14ch;
    font-size: var(--t-page);
    line-height: 1.04;
    letter-spacing: -0.021em;
    text-wrap: balance;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  /* THE LINE UNDER THE NAME at the lead step the home page's own line takes (20 at a desk, 18 on a phone). */
  .lead {
    max-inline-size: 34em;
    margin: 24px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-lead);
    line-height: 1.5;
    text-wrap: pretty;
  }
</style>
