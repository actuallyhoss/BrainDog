<!--
  TODAY WHILE THE RECORD ANSWERS: a card of bars in each cell the board last drew a card in, at the height it had, its
  bars where its lines were (`today-shape.ts`). Drawn in the board's own grid, so when each card fills its cell nothing
  around it moves. A device that never drew Today stands Today's first cards where the record lays them by default.

  EACH CARD IS THE SHARED ONE (`ui/SkeletonCard.svelte`, finish 3 Nov), the look a Today card still arriving draws in
  its own cell too. No shimmer, ink at a fixed strength, no word or figure of any record, one hidden word for a screen
  reader and `aria-busy` while it stands. The page itself only shows after its short wait (`PAGE_WAIT_MS` in
  `Home.svelte`), so a quick answer never flashes it.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import SkeletonCard from '$lib/ui/SkeletonCard.svelte';
  import type { TodayShape } from './today-shape.ts';

  let { shape }: { shape: TodayShape } = $props();
</script>

<div class="skel-board" role="status" aria-busy="true">
  <span class="said">{copy.waiting}</span>
  {#each shape.cards as c, i (c.key)}
    <SkeletonCard kind={c.kind} rows={c.rows} h={c.h} area={c.area} cols={shape.cols} seed={c.key.length + i} />
  {/each}
</div>

<style>
  /* THE BOARD'S OWN CELLS: this box gives way, so each card is a cell of the board's grid. */
  .skel-board {
    display: contents;
  }

  .said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
