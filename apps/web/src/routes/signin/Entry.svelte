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
  import Lockup from '$lib/ui/Lockup.svelte';

  let {
    wide = false,
    aside,
    end,
    children,
  }: { wide?: boolean; aside?: Snippet | undefined; end?: Snippet | undefined; children: Snippet } = $props();
</script>

<div class="entry" data-shape={wide ? 'wide' : 'sheet'}>
  <header class="entry-brand">
    <Lockup />
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
    inline-size: min(420px, 100%);
    min-inline-size: 0;
  }

  /* THE SHEET, IN THE OPS STYLE (3 Nov): one solid card on the ambient ground, the sheet's 22px corner, a 1px edge in its
     own colour and the soft two-layer card shadow in light (none in dark, where the lighter fill carries it). Never
     glass: people read and type on it. */
  .entry-sheet {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    padding: 32px;
    background: var(--tile);
    border: 1px solid var(--card-edge);
    border-radius: var(--r-sheet);
    box-shadow: var(--shadow-card);
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
      padding: 24px 20px;
    }
  }

  /* FROM 900PX THE SHEET STANDS 48 UNDER THE BRAND ROW. With a rail, the sheet keeps its 440 and the rail beside it is
     as wide as its short lines need, both from the same top edge, and the pair is centred as one: a rail given the rest
     of 1040 held the sheet left of centre with an empty third on its right (audit f, AF24). */
  /* AND IT STANDS IN THE UPPER THIRD OF A LAPTOP'S WINDOW, not pinned under the brand row: the eye lands on the title
     where it expects a sign-in to be, and the ground stays quiet round it. */
  @media (width >= 900px) {
    .entry {
      row-gap: clamp(var(--sp-7), 12vh, 136px);
      padding-block-start: calc(var(--sp-5) + env(safe-area-inset-top));
    }

    .entry-board[data-paired] {
      grid-template-columns: minmax(0, 420px) minmax(0, 320px);
      column-gap: var(--sp-6);
      inline-size: min(calc(420px + var(--sp-6) + 320px), 100%);
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
    letter-spacing: var(--track-page, -0.021em);
    line-height: 32px;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  /* `tabindex="-1"` moves focus to a title when a step changes, for a screen reader; it is never in the tab order. */
  .entry :global(.entry-title:focus:not(:focus-visible)),
  .entry :global(.empty-title:focus:not(:focus-visible)) {
    /* focus-ok: the title takes focus only by script, as a step changes, so a reader is told where it is; a ring there would read as a control. */
    outline: none;
  }

  /* THE ONE SENTENCE UNDER IT, in the second ink. */
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
      letter-spacing: -0.015em;
    }
  }

  /* ── Fields and buttons on every entry screen (ops 4.22, 4.5) ─────────── */

  /* A FIELD IS A 12PX BOX WITH A HAIRLINE EDGE on the sheet's own fill, 44 tall, and focus is the accent's 2px ring on
     the box with no gap (ops: a text field shows focus by its edge, never an outline a step away). */
  .entry :global(.entry-sheet .field) {
    min-block-size: 44px;
    padding-inline: 14px;
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-field);
    transition:
      border-color var(--d-state) var(--ease-out),
      box-shadow var(--d-state) var(--ease-out);
  }

  .entry :global(.entry-sheet .field:focus-within) {
    outline: none;
    border-color: transparent;
    box-shadow: 0 0 0 2px var(--focus-ring);
  }

  .entry :global(.entry-sheet .field .field-input) {
    min-block-size: 42px;
  }

  /* EVERY BUTTON ON AN ENTRY SCREEN IS A CAPSULE (ops: circles and capsules, never rounded squares). */
  .entry :global(.entry-sheet .btn) {
    border-radius: var(--r-pill);
  }

  @media (forced-colors: active) {
    .entry :global(.entry-sheet .field:focus-within) {
      outline: 2px solid Highlight;
    }
  }

  /* Forced colours drop the fill, so the sheet keeps an edge to be told from the page by. */
  @media (forced-colors: active) {
    .entry-sheet {
      outline: 1px solid CanvasText;
    }
  }
</style>
