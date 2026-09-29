<!--
  A content tile: the white surface that holds a figure, its chart and the one line saying what the chart means
  (SYSTEM §6, §12.2).

  THE HEADING ROW IS THE TILE'S OWN, so every tile on every screen starts the same way: a 28px icon well, the title at
  the row size and 600, an optional count in the quiet ink, and at the far end either a link word with its arrow or a
  line of meta. `actions` sits there too, for a tile whose heading carries a control of its own.

  NO TILE INSIDE A TILE, NO GLASS UNDER ONE, NO BORDER ROUND IT. The tile is told from the ground by its fill and its
  level-one shadow in light, and by its fill alone in dark (the `--e1` token is empty there).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { at } from '../at.ts';
  import Icon from './Icon.svelte';
  import IconWell from './IconWell.svelte';
  import type { IconName } from './icons.ts';

  let {
    icon,
    title,
    count,
    meta,
    lead = false,
    href,
    hrefLabel,
    actions,
    children,
    ...rest
  }: {
    /** The glyph in the heading's well. */
    icon?: IconName | undefined;
    title?: string | undefined;
    /** Beside the title in the quiet ink. A zero is a count too here, since a tile that holds a number says it. */
    count?: number | string | undefined;
    /** A short line at the right of the heading, when there is no link. */
    meta?: string | undefined;
    /** The screen's lead tile: 24 of padding rather than 20. */
    lead?: boolean | undefined;
    /** Where the heading's link word goes; drawn only with `hrefLabel`. */
    href?: string | undefined;
    hrefLabel?: string | undefined;
    actions?: Snippet | undefined;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const head = $derived(Boolean(icon || title || actions || meta || (href && hrefLabel)));
</script>

<section class="tile" data-lead={lead ? '' : undefined} {...rest}>
  {#if head}
    <header class="tile-head">
      {#if icon}<IconWell name={icon} size="m" />{/if}
      {#if title}
        <h2 class="tile-title">
          <span class="tile-name">{title}</span>
          {#if count !== undefined && count !== ''}<span class="tile-count num">{count}</span>{/if}
        </h2>
      {/if}
      {#if actions || (href && hrefLabel) || meta}
        <div class="tile-aside">
          {#if actions}{@render actions()}{/if}
          {#if href && hrefLabel}
            <a class="tile-link tap" href={at(href)}>{hrefLabel}<Icon name="arrow" size="s" /></a>
          {:else if meta}
            <span class="tile-meta">{meta}</span>
          {/if}
        </div>
      {/if}
    </header>
  {/if}
  {@render children()}
</section>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
    padding: 20px;
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .tile[data-lead] {
    padding: var(--sp-5);
  }

  .tile-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    min-block-size: var(--well);
  }

  .tile-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .tile-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-count {
    flex: none;
    color: var(--dim);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .tile-aside {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .tile-meta {
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .tile-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition: color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .tile-link:hover {
      color: var(--ink);
    }
  }
</style>
