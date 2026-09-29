<!--
  The one frame every entry screen stands in: sign in, sign up, an invitation, and /start.

  ONE SHEET ON A CALM, LIT GROUND, as the design system draws sign-up. The ground and its
  one light are the body's (`app.css`); on it stands a single sheet-like tile, the mark and the name at its top, and the
  screen's own column under them. A person moves between these screens in one sitting (an invitation leads to sign in,
  sign in to /start), so the brand is in the same place on every one of them.

  `aside` IS THE RAIL BESIDE THE SHEET: sign-up's next steps. From 900px it stands to the right of the sheet, both
  starting at the top; below that it stacks under the sheet at the full width, so the form comes first under a thumb.

  `wide` IS /start's, AND IT DRAWS NO SHEET. /start holds tiles of its own ("Your record, building"), and a tile never
  holds a tile, so there the brand stands on the ground at the top left and the column under it runs to
  1040, room for /start's two columns from 900px.

  THE FRAME STARTS AT THE TOP, never the middle: on a 390 by 664 phone the title and the first way in are on screen
  together and nothing hangs in empty space.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';

  let { wide = false, aside, children }: { wide?: boolean; aside?: Snippet | undefined; children: Snippet } = $props();
</script>

{#snippet brand()}
  <header class="entry-brand">
    <Mark height={24} />
    <span class="entry-word">{copy.product}</span>
  </header>
{/snippet}

<div class="entry" data-shape={wide ? 'wide' : 'sheet'}>
  {#if wide}
    {@render brand()}
    <div class="entry-col">{@render children()}</div>
  {:else}
    <div class="entry-board" data-paired={aside ? '' : undefined}>
      <!-- `data-surface="tile"`: a quiet button inside takes the tile's `--s1` pill, not the ground's wash (`Button`). -->
      <div class="entry-sheet" data-surface="tile">
        {@render brand()}
        <div class="entry-col">{@render children()}</div>
      </div>
      {#if aside}<div class="entry-aside">{@render aside()}</div>{/if}
    </div>
  {/if}
</div>

<style>
  /* THE TOP INSET IS PAID HERE ONCE, because the app is `viewport-fit=cover` and an entry screen has no bar to pay it;
     the bottom one pads the last control clear of a phone's home indicator. 12 is the window inset. */
  .entry {
    display: grid;
    align-content: start;
    row-gap: var(--sp-7);
    min-block-size: 100dvh;
    padding-block: calc(var(--inset) + env(safe-area-inset-top)) calc(var(--sp-7) + env(safe-area-inset-bottom));
    padding-inline: var(--gutter);
  }

  .entry-brand {
    display: flex;
    align-items: center;
    justify-self: start;
    gap: var(--sp-2);
    min-block-size: var(--well-l);
  }

  /* GEIST, AS EVERY WORD IS: the wordmark was the display face, and there is one face now. */
  .entry-word {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  /* ── The sheet ─────────────────────────────────────────────────────────── */

  /* `min(…, 100%)` so nothing outgrows a phone, and `min-inline-size: 0` so a long word inside wraps rather than
     widening the track past the screen. */
  .entry-board {
    display: grid;
    align-items: start;
    gap: var(--inset);
    justify-self: center;
    inline-size: min(440px, 100%);
    min-inline-size: 0;
  }

  /* A LEAD TILE: the tile's fill, radius and level-one shadow (none in dark, where the fill tells it from the ground),
     and the lead tile's 24 of padding. No border: a tile is told by its fill. */
  .entry-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .entry-col {
    min-inline-size: 0;
  }

  .entry-aside {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
    min-inline-size: 0;
  }

  /* ON A PHONE THE SHEET IS A TILE AT THE FULL WIDTH between 16 gutters, with a tile's own 20 of padding. */
  @media (width < 640px) {
    .entry-sheet {
      padding: 20px;
    }
  }

  /* FROM 900PX THE BOARD STANDS A STEP DOWN FROM THE TOP, where the eye lands, and never in the middle. With a rail,
     the sheet keeps its 440 and the rail takes the rest of 1040, both from the same top edge. */
  @media (width >= 900px) {
    .entry[data-shape='sheet'] {
      padding-block-start: calc(var(--sp-8) + env(safe-area-inset-top));
    }

    .entry-board[data-paired] {
      grid-template-columns: minmax(0, 440px) minmax(0, 1fr);
      inline-size: min(1040px, 100%);
    }
  }

  /* ── /start, on the ground ─────────────────────────────────────────────── */

  [data-shape='wide'] .entry-col {
    justify-self: center;
    inline-size: min(1040px, 100%);
  }

  @media (width >= 900px) {
    [data-shape='wide'] .entry-col {
      margin-block-start: var(--sp-5);
    }
  }

  /* Forced colours drop the fill and the shadow, so the sheet keeps an edge to be told from the page by. */
  @media (forced-colors: active) {
    .entry-sheet {
      outline: 1px solid CanvasText;
    }
  }
</style>
