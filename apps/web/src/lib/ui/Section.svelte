<!--
  A section heading, and an optional action beside it.

  The container below it draws the boundary, so the heading does not need a rule to say where the
  group begins — two devices doing one job is the cheapest kind of clutter to remove.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    children,
    aside,
  }: { title: string; count?: number; children: Snippet; aside?: Snippet } = $props();
</script>

<section class="section">
  <div class="section-head">
    <h2 class="section-title">
      {title}
      {#if count !== undefined}<span class="section-count num">{count}</span>{/if}
    </h2>
    {#if aside}<div class="section-aside">{@render aside()}</div>{/if}
  </div>
  {@render children()}
</section>

<style>
  .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  .section-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
    letter-spacing: 0.005em;
  }

  .section-count {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 400;
  }

  .section-aside {
    margin-inline-start: auto;
  }
</style>
