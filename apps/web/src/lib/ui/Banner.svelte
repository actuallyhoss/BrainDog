<!--
  The one banner (frame F21): a line across the work, under the top bar, that says a
  thing about the whole record and not one screen of it. Billing lapsed (`LapseLine`) and offline (`Pull`) are the two.

  ONE SHAPE: 48 tall at least, 12 by 16 in, radius 12, inset by the gutter, filled by what it means: `late` is
  `--red-tint` with a `--red` glyph (it needs him), `warn` is `--warn-tint` with a `--warn` glyph, and `note` is the
  tile's own fill with a `--ink-2` glyph, for a line that tells and asks nothing (a share's first open). The words are 15
  in ink, the actions at the end edge, a primary first. No shadow and no tile: it is a fill on the board.

  IT ENTERS WITH THE PAGE and never animates on its own, so nothing moves under a reader's eye after the screen has
  settled. On a phone the actions go under the words, full width, at the thumb's height.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    tone,
    icon,
    children,
    actions,
  }: {
    tone: 'late' | 'warn' | 'note';
    icon: IconName;
    children: Snippet;
    actions?: Snippet | undefined;
  } = $props();
</script>

<div class="banner" data-tone={tone} role="status">
  <p class="banner-text">
    <span class="banner-glyph"><Icon name={icon} size="m" /></span>
    <span class="banner-words">{@render children()}</span>
  </p>
  {#if actions}<div class="banner-actions">{@render actions()}</div>{/if}
</div>

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    box-sizing: border-box;
    min-block-size: 48px;
    margin: var(--inset) var(--gutter) 0;
    padding: 10px 10px 10px var(--sp-4);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .banner[data-tone='late'] {
    --banner-glyph: var(--red);

    background: var(--red-tint);
  }

  .banner[data-tone='warn'] {
    --banner-glyph: var(--warn);

    background: var(--warn-tint);
  }

  /* A NOTE IS A CARD (ops 2.7.2): the tile, its edge and its soft shadow. */
  .banner[data-tone='note'] {
    --banner-glyph: var(--ink-2);

    background: var(--tile);
    border: 1px solid var(--card-edge);
    box-shadow: var(--shadow-card);
  }

  .banner-text {
    display: flex;
    flex: 1 1 30ch;
    align-items: flex-start;
    gap: var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* THE GLYPH SITS ON THE FIRST LINE'S MIDDLE: a box one line tall, the icon centred in it. */
  .banner-glyph {
    display: flex;
    flex: none;
    align-items: center;
    block-size: 22px;
    color: var(--banner-glyph);
  }

  .banner-words {
    min-inline-size: 0;
  }

  .banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A BUTTON ON THE TINT IS THE TILE'S COLOUR, so the quiet one still reads as a control on red or amber. */
  .banner .banner-actions :global(.btn[data-weight='quiet']) {
    --btn-fill: var(--tile);
  }

  /* ON THE TILE'S OWN FILL, a step under it, as on any tile. */
  .banner[data-tone='note'] .banner-actions :global(.btn[data-weight='quiet']) {
    --btn-fill: var(--soft-fill);
  }

  /* ON A PHONE THE ACTIONS ARE FULL-WIDTH ROWS UNDER THE WORDS, at the touch height, so neither is a narrow button
     squeezed beside wrapped text. */
  @media (width < 640px) {
    .banner-actions {
      flex: 1 1 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .banner-actions :global(.btn) {
      justify-content: center;
      min-block-size: var(--tap);
    }
  }
</style>
