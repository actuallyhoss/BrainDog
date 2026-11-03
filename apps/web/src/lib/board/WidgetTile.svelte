<!--
  A WIDGET DRAWN AS THE BOARD DRAWS IT (the validator's audit of 30 October, 13 and 14): one block, read by the record's
  `previewPage` and mounted in the page reader every page goes through (`PageView`, `mode: 'preview'`, inert), in a frame
  the shape of its size on the board. So what Make your own and the inspector show is the tile that lands, the same
  renderer at the same proportions, and not the gallery's small sketch (`WidgetPreview.svelte`, kept for the gallery,
  where two dozen are read at once).

  READ A BREATH AFTER THE LAST CHANGE, so an inspector's choices do not ask the record once a keystroke. The reader is
  loaded on first use, as Home loads it, so the sheet costs nothing until a widget is drawn.
-->
<script lang="ts">
  import { SIZE_SAID, type WidgetSize } from 'braindog-render';
  import type { Component } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import type { Opened } from '$lib/record/page-live.ts';

  let {
    block,
    size,
    onread,
  }: {
    block: Record<string, unknown>;
    size: WidgetSize;
    /** The record's sentence when it would not draw the block, or `null` once it drew it. */
    onread?: ((fix: string | null) => void) | undefined;
  } = $props();

  let View = $state.raw<Component<{ slug: string; got: Opened; mode: 'preview' }> | null>(null);
  let got = $state.raw<Opened | null>(null);
  let waiting = $state(true);

  $effect(() => {
    /* THE WHOLE TILE IS THE BLOCK'S: a board block carries its place on Today's twelve columns (`span: 3` for Cash ahead),
       which drawn alone on a page laid it in a quarter of the frame. The frame is the size; the block fills it. */
    /* A JSON COPY, NOT `$state.snapshot`, whose clone sits in the Svelte chunk every screen's entry loads (`Arrange.svelte`). */
    const { draft: _d, size: _s, key: _k, span: _p, ...rest } = JSON.parse(JSON.stringify(block)) as Record<string, unknown>;
    const plain: Record<string, unknown> = { ...rest, span: 12 };
    waiting = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const [{ createClient }, { openedOf }, viewMod] = await Promise.all([
            import('@braindog/client'),
            import('$lib/market/preview.ts'),
            View === null ? import('$lib/page/PageView.svelte') : Promise.resolve(null),
          ]);
          if (viewMod) View = viewMod.default as unknown as typeof View;
          const title = typeof plain.heading === 'string' && plain.heading !== '' ? plain.heading : 'Widget';
          const out = await createClient({ base: apiBase() }).call<{ blocks?: unknown[] }>('previewPage', { body: { page: 'widget', title, blocks: [plain] } });
          if (!out.ok) {
            got = null;
            onread?.('refusal' in out ? out.refusal.fix : null);
            return;
          }
          const blocks = Array.isArray(out.value.blocks) ? out.value.blocks : [];
          const refusals = blocks[0] && typeof blocks[0] === 'object' && Array.isArray((blocks[0] as { refusals?: unknown }).refusals) ? ((blocks[0] as { refusals: { fix?: unknown }[] }).refusals) : [];
          onread?.(refusals.length > 0 && typeof refusals[0]?.fix === 'string' ? (refusals[0].fix as string) : null);
          got = openedOf({ page: 'widget', title, blocks } as never, Date.now());
        } catch {
          got = null;
          onread?.(null);
        } finally {
          waiting = false;
        }
      })();
    }, 180);
    return () => clearTimeout(t);
  });

  const cols = $derived(SIZE_SAID[size].cols);
  const rows = $derived(SIZE_SAID[size].rows);
</script>

<div class="wt" data-size={size} style:--c={cols} style:--r={rows} aria-hidden="true" inert>
  {#if View && got}
    {@const V = View}
    <div class="wt-in"><V slug="widget" {got} mode="preview" /></div>
  {:else if waiting}
    <div class="wt-wait"><span></span><span></span><span></span></div>
  {/if}
</div>

<style>
  /* THE BOARD'S OWN CELL, DRAWN AT ITS OWN SIZE AND SHOWN SMALLER: the laptop's column (286) and row (183) as `Board.svelte`
     draws them at 1512, so the tile's words wrap and its chart fits as on Today, then scaled to the drawer as a picture
     is (`--s`). A Full is four columns, which is what sets the scale. */
  .wt {
    --cw: 286px;
    --rh: 183px;
    --g: var(--tile-gap, 12px);
    --s: 1;
    --w: calc(var(--c) * var(--cw) + (var(--c) - 1) * var(--g));
    --h: calc(var(--r) * var(--rh) + (var(--r) - 1) * var(--g));
    position: relative;
    flex: none;
    inline-size: calc(var(--w) * var(--s));
    max-inline-size: 100%;
    block-size: calc(var(--h) * var(--s));
    overflow: hidden;
    border-radius: 14px;
    background: var(--tile);
    box-shadow: 0 0 0 1px var(--rule);
  }

  /* ONLY A FULL IS SHOWN SMALLER: four columns are wider than any drawer, and every other size fits at its own. */
  .wt[data-size='full'] {
    --s: 0.61;
  }

  .wt-in {
    inline-size: var(--w);
    block-size: var(--h);
    overflow: hidden;
    transform: scale(var(--s));
    transform-origin: 0 0;
    /* WHAT RUNS PAST THE FRAME FADES OVER ITS LAST FEW PIXELS, as the board's frame does (`Board.svelte`). */
    mask-image: linear-gradient(to bottom, var(--ink) calc(100% - 20px), transparent);
  }

  /* A PREVIEWED PAGE SAYS ITS TITLE ABOVE ITS BLOCKS; A TILE SAYS ITS HEADING ONCE, on the block. */
  .wt-in :global(.preview-title) {
    display: none;
  }

  /* THE READER'S OWN PAGE MARGINS ARE A PAGE'S, NOT A TILE'S. */
  .wt-in :global(.page),
  .wt-in :global(.pv),
  .wt-in :global(main) {
    margin: 0;
    padding: 0;
  }

  /* A CHART FITS THE FRAME AS IT DOES ON THE BOARD (`Board.svelte`). */
  .wt :global(.series) {
    --series-h: 60px;
  }

  /* ITS TOP LINE'S FIGURE SITS HALF ABOVE THE PLOT: room for it under the heading. */
  .wt :global(.series-plot) {
    margin-block-start: var(--sp-2);
  }

  .wt:is([data-size='tall'], [data-size='large']) :global(.series) {
    --series-h: 232px;
  }

  @media (width < 720px) {
    .wt:not([data-size='tall'], [data-size='large']) :global(.series) {
      --series-h: 52px;
    }
  }

  /* THREE FIGURES IN A WIDE FRAME, AS TODAY'S CASH AHEAD LAYS THEM (`Home.svelte`, CASH, WIDE): the first with how long
     it lasts on the left, the other two stacked at the right, so the preview holds all three where it squeezed the third
     out and cut the note (the validator's recheck of 30 October, 14). */
  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3))) {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 0 var(--sp-5);
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:nth-child(n + 2) .cell-figure) {
    font-size: var(--fs-body);
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:first-child) {
    grid-row: 1 / span 2;
    grid-column: 1;
    padding-block-end: 0;
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:nth-child(n + 2)) {
    grid-column: 2;
    padding-block: var(--sp-2);
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell + .cell) {
    border-block-start: 0;
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:nth-child(3)) {
    border-block-start: 1px solid var(--rule);
  }

  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:first-child :is(.cell-trend, .cell-trend-ahead)) {
    display: none;
  }

  /* THE NOTE UNDER THE FIGURE WRAPS, never cut (finish F49): "Lowest in the next 12 weeks: −£16,…" lost its money. */
  .wt[data-size='wide'] :global(.block-grid > .grid:has(> .cell:nth-child(3)) > .cell:first-child .cell-note) {
    white-space: normal;
    text-wrap: pretty;
  }

  .wt-wait {
    display: grid;
    gap: var(--sp-2);
    padding: var(--tile-pad);
  }

  .wt-wait span {
    block-size: 10px;
    border-radius: 5px;
    background: var(--tile-2, var(--page));
  }

  .wt-wait span:nth-child(2) {
    inline-size: 70%;
  }

  .wt-wait span:nth-child(3) {
    inline-size: 45%;
  }

  /* ON THE PHONE THE BOARD IS TWO COLUMNS OF WHAT ROOM THERE IS: a Small is half the room, every wider size all of it
     (a Full is drawn as a Wide), so the tile never pushes past the drawer it sits in. */
  @media (width < 720px) {
    .wt {
      --n: min(var(--c), 2);
      --rh: 170px;
      --s: 1;
      inline-size: calc((100% - var(--g)) / 2 * var(--n) + (var(--n) - 1) * var(--g));
    }

    .wt[data-size='full'] {
      --s: 1;
    }

    .wt-in {
      inline-size: 100%;
    }
  }
</style>
