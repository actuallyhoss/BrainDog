<!--
  The one frame every entry screen stands in: sign in, sign up, an invitation, connecting an app, the desktop return,
  and /start (first F5).

  THE BRAND IS ON THE GROUND, TOP LEFT, ON EVERY ONE OF THEM: the mark at 24 and the word at 17/600 in a 44px row at the
  gutter. A person moves between these screens in one sitting (sign-up, the mail, sign in, /start), so the brand never
  jumps from a corner to the middle of the window as they go. `end` is the row's other edge (sign-up's way to sign in).

  THE SHEET (the default): one tile, 440 wide, centred from 900px and starting 48 under the brand row; at the full width
  between the gutters on a phone. A single-column screen stands in it.

  `aside` IS THE RAIL BESIDE THE SHEET: sign-up's "What happens next". From 900px it stands to the right of the sheet,
  both starting at the top; below that it stacks under the sheet, so the form comes first under a thumb.

  `wide` DRAWS NO SHEET: the column under the brand runs the whole window between the gutters, for the two-column screens
  (sign-up's describe and keep, /start) whose talk column and build are tiles of their own, and a tile never holds a tile.

  THE FRAME STARTS AT THE TOP, never the middle: on a 390 by 664 phone the title and the first way in are on screen
  together and nothing hangs in empty space.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';

  let {
    wide = false,
    aside,
    end,
    children,
  }: { wide?: boolean; aside?: Snippet | undefined; end?: Snippet | undefined; children: Snippet } = $props();
</script>

<div class="entry" data-shape={wide ? 'wide' : 'sheet'}>
  <header class="entry-brand">
    <span class="entry-mark">
      <Mark height={24} />
      <span class="entry-word">{copy.product}</span>
    </span>
    {#if end}<span class="entry-end">{@render end()}</span>{/if}
  </header>
  {#if wide}
    <div class="entry-col">{@render children()}</div>
  {:else}
    <div class="entry-board" data-paired={aside ? '' : undefined}>
      <!-- `data-surface="tile"`: a quiet button inside takes the tile's own quiet fill, not the ground's (`Button`). -->
      <div class="entry-sheet" data-surface="tile">{@render children()}</div>
      {#if aside}<div class="entry-aside">{@render aside()}</div>{/if}
    </div>
  {/if}
</div>

<style>
  /* THE TOP INSET IS PAID HERE ONCE, because the app is `viewport-fit=cover` and an entry screen has no bar to pay it;
     the bottom one pads the last control clear of a phone's home indicator. */
  .entry {
    display: grid;
    align-content: start;
    row-gap: var(--sp-5);
    min-block-size: 100dvh;
    min-inline-size: 0;
    padding-block: calc(var(--inset) + env(safe-area-inset-top)) calc(var(--sp-7) + env(safe-area-inset-bottom));
    padding-inline: var(--gutter);
  }

  .entry-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    min-inline-size: 0;
  }

  .entry-mark {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .entry-word {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .entry-end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* ── The sheet ─────────────────────────────────────────────────────────── */

  /* `min(…, 100%)` so nothing outgrows a phone, and `min-inline-size: 0` so a long word inside wraps rather than
     widening the track past the screen. */
  .entry-board {
    display: grid;
    align-items: start;
    gap: var(--sp-3);
    justify-self: center;
    inline-size: min(440px, 100%);
    min-inline-size: 0;
  }

  /* A TILE: its fill and radius, 24 in (20 on a phone). No border and no shadow: a tile is told by its fill. */
  .entry-sheet {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .entry-aside {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .entry-col {
    min-inline-size: 0;
  }

  @media (width < 640px) {
    .entry-sheet {
      padding: 20px;
    }
  }

  /* FROM 900PX THE SHEET STANDS 48 UNDER THE BRAND ROW. With a rail, the sheet keeps its 440 and the rail takes the rest
     of 1040, both from the same top edge. */
  @media (width >= 900px) {
    .entry {
      row-gap: var(--sp-7);
      padding-block-start: calc(var(--sp-5) + env(safe-area-inset-top));
    }

    .entry-board[data-paired] {
      grid-template-columns: minmax(0, 440px) minmax(0, 1fr);
      column-gap: var(--sp-6);
      inline-size: min(1040px, 100%);
    }
  }

  /* ── The words every entry screen opens with ───────────────────────────── */

  /* THE ENTRY SCREENS' ONE TITLE, a page's name as PageHead draws one: Lexend 600 at 28/34, 22/28 under 900. The same
     at every width in one face, so the title never changes typeface as the window narrows (first F7). */
  .entry :global(.entry-title),
  .entry :global(h1.empty-title) {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 34px;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  /* `tabindex="-1"` moves focus to a title when a step changes, for a screen reader; it is never in the tab order. */
  .entry :global(.entry-title:focus:not(:focus-visible)) {
    /* focus-ok: the title takes focus only by script, as a step changes, so a reader is told where it is; a ring there would read as a control. */
    outline: none;
  }

  /* THE ONE SENTENCE UNDER IT: 15/22 in the second ink. */
  .entry :global(.entry-lede) {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .entry :global(.entry-title),
    .entry :global(h1.empty-title) {
      font-size: var(--fs-figure);
      line-height: 28px;
    }
  }

  /* Forced colours drop the fill, so the sheet keeps an edge to be told from the page by. */
  @media (forced-colors: active) {
    .entry-sheet {
      outline: 1px solid CanvasText;
    }
  }
</style>
