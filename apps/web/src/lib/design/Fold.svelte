<!--
  ONE SECTION OF A DESIGN SHEET THAT OPENS (L50, 1 Nov). The sheets are a reference, so long is fine once opened, but the
  controls sheet stood 3,965px tall at 1512 with everything out. Each section is its name, how many parts it holds and a
  chevron, closed when the sheet is drawn, so the closed sections are the sheet's contents, one name a row. It opens on
  its height (180ms, the house curve; at once under reduced motion).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { id, name, count, children }: { id: string; name: string; count?: number | undefined; children: Snippet } = $props();
</script>

<details class="fold" {id}>
  <summary class="fold-head">
    <span class="fold-name">{name}</span>
    {#if count !== undefined}<span class="fold-n num">{count}</span>{/if}
    <span class="fold-turn" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
  </summary>
  <div class="fold-body">{@render children()}</div>
</details>

<style>
  .fold {
    min-inline-size: 0;
    border-block-end: 1px solid var(--rule);
    interpolate-size: allow-keywords;
  }

  .fold::details-content {
    block-size: 0;
    overflow: clip;
    transition:
      block-size var(--d-state, 180ms) var(--ease-out),
      content-visibility var(--d-state, 180ms) allow-discrete;
  }

  .fold[open]::details-content {
    block-size: auto;
  }

  .fold-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    cursor: pointer;
    list-style: none;
    font-size: var(--fs-head);
    font-weight: 600;
  }

  .fold-head::-webkit-details-marker {
    display: none;
  }

  .fold-n {
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
  }

  .fold-turn {
    display: grid;
    place-items: center;
    margin-inline-start: auto;
    color: var(--ink-2);
    transition: rotate var(--d-state, 180ms) var(--ease-out);
  }

  .fold[open] .fold-turn {
    rotate: 180deg;
  }

  .fold-body {
    padding-block: var(--sp-2) var(--sp-6);
  }

  @media (hover: hover) and (pointer: fine) {
    .fold-head:hover .fold-turn {
      color: var(--ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fold::details-content,
    .fold-turn {
      transition: none;
    }
  }
</style>
