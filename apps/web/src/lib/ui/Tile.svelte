<!--
  A content tile: the one surface that holds a group of rows, a figure, its chart and the line saying what it means.
  It is the only tile: `Section.svelte`, its older door, went in wave 4.

  THE HEADING ROW IS THE TILE'S OWN, so every tile on every screen starts the same way: a 28px NEUTRAL well with an 18px
  icon, the title at 15/600 in ink, an optional count at 15/500 in `--ink-3`, and at the far end one link ("All 17",
  13/500, with its arrow), a line of meta, or the tile's own `actions`.

  THE WELL NEVER TAKES A TONE. A heading names a group, and a group is not late or good; a tone is for a ROW that means
  it (`IconWell`). `tone` is still accepted so a caller that passes one does not break, and it colours nothing.

  NO TILE INSIDE A TILE, NO BORDER ROUND IT, NO SHADOW. The tile is told from the board by its fill alone, in light and
  in dark: `--tile`, radius 16, padding `--tile-pad` (24 on the screen's lead tile, 16 on a phone).

  A TILE THAT HOLDS ONLY AN EMPTY STATE HUGS IT (frame F20): 640 wide at most, on the page's start edge, rather than a
  sentence at the start of 1440px of white. In a column of full tiles it keeps their width (`data-wide`).

  A GROUP OF ROWS IS `class="section"` WITH ITS ROWS IN ONE `.section-body` (what `Section` drew): the rows keep their own
  flow rather than the tile's 16 between children, `Empty` draws a section's empty state as the compact line, and
  inside a tile or a sheet the section is only its heading and its rows, because a tile never holds a tile. Pass the
  count as `count || undefined` there: "Passkeys 0" over "No passkey yet." says the same fact twice.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { at } from '../at.ts';
  import Icon from './Icon.svelte';
  import IconWell from './IconWell.svelte';
  import type { IconName } from './icons.ts';

  let {
    icon,
    tone: _tone,
    title,
    count,
    meta,
    lead = false,
    href,
    hrefLabel,
    actions,
    children,
    class: extra,
    ...rest
  }: {
    /** The glyph in the heading's well. */
    icon?: IconName | undefined;
    /** Accepted and ignored: a tile's heading well is always neutral. */
    tone?: 'action' | 'danger' | 'earn' | 'live' | 'warn' | undefined;
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
    /** Added to `tile`, never in its place. A caller's scoped style does not reach in here, so style it with `:global` or a data attribute. */
    class?: string | undefined;
    [key: string]: unknown;
  } = $props();

  const head = $derived(Boolean(icon || title || actions || meta || (href && hrefLabel)));
</script>

<section class={['tile', extra]} data-lead={lead ? '' : undefined} {...rest}>
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
  .tile > :global(.section-body) {
    min-inline-size: 0;
  }

  /* A TILE NEVER HOLDS A TILE: inside one, or inside a sheet, a section is its heading and its rows on the surface it
     stands on. */
  :global(:is(.tile, .sheet, .dock-body) .tile.section) {
    padding: 0;
    background: none;
    border-radius: 0;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .tile[data-lead] {
    padding: var(--sp-5);
  }

  /* SIXTEEN ON A PHONE, lead or not: at 390 every pixel of padding is a pixel of the row's words. */
  @media (width < 640px) {
    .tile,
    .tile[data-lead] {
      padding: var(--sp-4);
    }
  }

  /* A TILE OF ONE EMPTY STATE, its heading aside, is as wide as the state and no wider, unless it stands in a column of
     full tiles (`data-wide`), where it is as wide as they are. */
  .tile:not([data-wide]):has(> :global(.empty)):not(:has(> :not(.tile-head, :global(.empty)))) {
    max-inline-size: 640px;
  }

  /* THE ROW WRAPS WHEN IT CANNOT HOLD ITS ASIDE: on a phone a meta line such as "all on <host>" goes under the title
     rather than past the tile's edge, and on a wide tile nothing moves. 28 tall at least, the well's height. */
  .tile-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
    min-block-size: var(--well);
  }

  /* A HEADING WITH NOTHING BESIDE IT KEEPS ITS NAME BY ITS WELL: in a narrow tile (two to a row on a phone) "Quiet
     numbers" dropped under its well as a second line. The name wraps beside the well instead, never cut. */
  .tile-head:not(:has(> .tile-aside)) {
    flex-wrap: nowrap;
  }

  .tile-head:not(:has(> .tile-aside)) .tile-name {
    white-space: normal;
    overflow-wrap: break-word;
  }

  .tile-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .tile-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-count {
    flex: none;
    color: var(--ink-3);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  /* AND THE ASIDE WRAPS WHEN IT CANNOT HOLD ITS OWN CONTROLS: a menu, Lock now and Add a key on a 320px phone. */
  .tile-aside {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    min-inline-size: 0;
    max-inline-size: 100%;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  /* A META LINE THAT DOES NOT FIT WRAPS, never cut (skills pass follow-up, 2 Nov): Activity's "5 by agents · 2 by you ·
     177 by rules · 13 by Br…" ended in an ellipsis with no way to the rest. The head already wraps, so a long one goes
     under the title. */
  .tile-meta {
    min-inline-size: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    overflow-wrap: break-word;
    text-wrap: pretty;
  }

  /* ONE LINK, "All 17": 13/500 in the second ink, its arrow after it. */
  .tile-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    border-radius: var(--r-xs);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
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
