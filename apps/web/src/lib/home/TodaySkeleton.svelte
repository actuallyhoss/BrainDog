<!--
  TODAY WHILE THE RECORD ANSWERS: a card of bars in each cell the board last drew a card in, at the height it had, its
  bars where its lines were (`today-shape.ts`). Drawn in the board's own grid, so when each card fills its cell nothing
  around it moves. A device that never drew Today stands Today's first cards where the record lays them by default.

  AS `ui/Waiting.svelte` DRAWS ITS BARS: no shimmer, ink at a fixed strength so they read on a card and on the ground,
  no word or figure of any record, one hidden word for a screen reader and `aria-busy` while it stands. The page itself
  only shows after its short wait (`PAGE_WAIT_MS` in `Home.svelte`), so a quick answer never flashes it.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { ShapeCard, TodayShape } from './today-shape.ts';

  let { shape }: { shape: TodayShape } = $props();

  /* Widths that read as lines of different lengths, never a barcode of equal ones. */
  const W = ['58%', '42%', '66%', '36%', '52%', '47%', '61%', '39%'];
  const w = (i: number) => W[i % W.length];
  /* A name's bar, a little different card to card. */
  const NAME = ['84px', '108px', '72px', '96px', '120px', '64px'];
  const name = (c: ShapeCard, i: number) => NAME[(c.key.length + i) % NAME.length];
  /* As many lines as the card held, never more than its height can show (the card clips the rest). */
  const lines = (c: ShapeCard) => Array.from({ length: Math.max(1, Math.min(c.rows, 8)) }, (_, i) => i);
</script>

<div class="skel-board" role="status" aria-busy="true">
  <span class="said">{copy.waiting}</span>
  {#each shape.cards as c, i (c.key)}
    {#if c.kind === 'projects'}
      <!-- THE PROJECTS ARE CARDS UNDER A HEAD OF THEIR OWN, on the ground, as they draw. -->
      <div class="sk-group" style="grid-area:{c.area};block-size:{c.h}px" aria-hidden="true">
        <span class="sk-head"><span class="g"></span><span class="b" style:inline-size="72px"></span></span>
        <span class="sk-cards">
          {#each { length: Math.max(1, Math.min(c.rows, shape.cols === 2 ? 1 : 3)) } as _, n (n)}
            <span class="sk-card surface-card"><span class="sk-row"><span class="o w32"></span><span class="st"><span class="b" style:inline-size="56%"></span><span class="b s" style:inline-size="34%"></span></span></span><span class="b fig" style:inline-size="44%"></span></span>
          {/each}
        </span>
      </div>
    {:else}
      <div class="sk surface-card" data-kind={c.kind} style="grid-area:{c.area};block-size:{c.h}px" aria-hidden="true">
        <span class="sk-head"><span class="g"></span><span class="b" style:inline-size={name(c, i)}></span></span>
        {#if c.kind === 'ask'}
          {#each lines(c) as n (n)}
            <span class="sk-row ask"><span class="o w32"></span><span class="st"><span class="b" style:inline-size={w(n)}></span><span class="b s" style:inline-size="30%"></span></span><span class="caps"><span class="cap"></span><span class="cap"></span></span></span>
          {/each}
        {:else if c.kind === 'late'}
          {#each lines(c) as n (n)}
            <span class="sk-row"><span class="st"><span class="b" style:inline-size={w(n + 2)}></span><span class="b s" style:inline-size="28%"></span></span><span class="end"><span class="b" style:inline-size="56px"></span><span class="cap"></span></span></span>
          {/each}
        {:else if c.kind === 'faces'}
          {#each lines(c) as n (n)}
            <span class="sk-row"><span class="o w28"></span><span class="st"><span class="b" style:inline-size={w(n + 1)}></span><span class="b s" style:inline-size={w(n + 4)}></span></span></span>
          {/each}
        {:else if c.kind === 'feed'}
          {#each lines(c) as n (n)}
            <span class="sk-row"><span class="b s" style:inline-size="48px"></span><span class="o w20"></span><span class="st"><span class="b" style:inline-size={w(n + 3)}></span><span class="b s" style:inline-size="24%"></span></span></span>
          {/each}
        {:else if c.kind === 'cash'}
          <span class="sk-cash">
            <span class="st"><span class="b s" style:inline-size="64px"></span><span class="b hero" style:inline-size="148px"></span><span class="b s" style:inline-size="58%"></span></span>
            <span class="sk-pairs">
              {#each { length: Math.max(1, Math.min(c.rows - 1, 3)) } as _, n (n)}<span class="sk-pair"><span class="b s" style:inline-size="72px"></span><span class="b" style:inline-size="64px"></span></span>{/each}
            </span>
          </span>
        {:else if c.kind === 'figures'}
          <span class="sk-cols" style="--n:{Math.max(1, Math.min(c.rows, shape.cols === 2 ? 2 : 4))}">
            {#each { length: Math.max(1, Math.min(c.rows, shape.cols === 2 ? 2 : 4)) } as _, n (n)}
              <span class="st"><span class="b s" style:inline-size={w(n + 1)}></span><span class="b fig" style:inline-size="48%"></span><span class="b s" style:inline-size="36%"></span></span>
            {/each}
          </span>
        {:else if c.kind === 'figure'}
          <span class="sk-cols" style="--n:{Math.max(1, Math.min(c.rows, 2))}">
            {#each { length: Math.max(1, Math.min(c.rows, 2)) } as _, n (n)}
              <span class="st"><span class="b s" style:inline-size={w(n + 3)}></span><span class="b fig" style:inline-size="52%"></span></span>
            {/each}
          </span>
        {:else if c.kind === 'dates'}
          {#each lines(c) as n (n)}
            <span class="sk-row"><span class="date"><span class="b xs"></span><span class="b day"></span></span><span class="st"><span class="b" style:inline-size={w(n + 5)}></span></span><span class="b" style:inline-size="52px"></span></span>
          {/each}
        {:else}
          {#each lines(c) as n (n)}
            <span class="sk-row"><span class="o w20 ring"></span><span class="st"><span class="b" style:inline-size={w(n)}></span><span class="b s" style:inline-size="22%"></span></span></span>
          {/each}
        {/if}
      </div>
    {/if}
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

  /* A CARD AS THE BOARD DRAWS ONE: the tile's padding, its head row and 12 under it, and what does not fit is cut. */
  .sk {
    display: flex;
    flex-direction: column;
    gap: var(--card-head-gap);
    min-inline-size: 0;
    align-self: start;
    padding: var(--tile-pad);
    overflow: hidden;
    container-type: inline-size;
    animation: sk-in var(--d-state) var(--ease-out) backwards;
  }

  .sk-group {
    display: flex;
    flex-direction: column;
    gap: var(--card-head-gap);
    min-inline-size: 0;
    align-self: start;
    overflow: hidden;
    animation: sk-in var(--d-state) var(--ease-out) backwards;
  }

  .sk-group > .sk-head {
    padding-inline: var(--title-inset, 12px);
  }

  .sk-cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    flex: 1;
    min-block-size: 0;
  }

  .sk-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--tile-pad);
  }

  /* THE ONE CARD HEAD (RHYTHM.md §5): a 28 row, an 18 glyph, the name beside it. */
  .sk-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 28px;
  }

  .sk-head > .b {
    block-size: 12px;
  }

  .sk-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    min-inline-size: 0;
  }

  /* NEEDS YOU'S QUESTION: its well, its two lines and its answers on the second line at the right. */
  .sk-row.ask {
    align-items: start;
    padding-block: var(--sp-1);
  }

  .st {
    display: grid;
    gap: var(--sp-2);
    flex: 1;
    min-inline-size: 0;
  }

  .end {
    display: grid;
    justify-items: end;
    gap: var(--sp-2);
  }

  .caps {
    display: flex;
    gap: var(--sp-2);
    align-self: end;
  }

  /* INK AT A FIXED STRENGTH (as `Waiting.svelte`): the bars read on a card in light and in dark alike. */
  .b {
    display: block;
    block-size: 10px;
    max-inline-size: 100%;
    background: color-mix(in oklab, var(--ink) 9%, transparent);
    border-radius: var(--r-xs);
  }

  .b.s {
    block-size: 8px;
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .b.xs {
    inline-size: 22px;
    block-size: 6px;
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .b.day {
    inline-size: 18px;
    block-size: 16px;
  }

  .b.fig {
    block-size: 20px;
    border-radius: var(--r-ctl);
  }

  .b.hero {
    block-size: 26px;
    border-radius: var(--r-ctl);
  }

  .g,
  .o {
    flex: none;
    display: block;
    border-radius: var(--r-round, 999px);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .g {
    inline-size: var(--head-glyph, 18px);
    block-size: var(--head-glyph, 18px);
  }

  .o.w32 {
    inline-size: 32px;
    block-size: 32px;
  }

  .o.w28 {
    inline-size: 28px;
    block-size: 28px;
  }

  .o.w20 {
    inline-size: 20px;
    block-size: 20px;
  }

  /* A TASK'S TICK IS A RING, as it is drawn. */
  .o.ring {
    background: none;
    box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--ink) 12%, transparent);
  }

  .cap {
    display: block;
    inline-size: 60px;
    block-size: 28px;
    border-radius: var(--r-pill, 999px);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .date {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    inline-size: 32px;
  }

  .sk-cash {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--sp-3) var(--sp-5);
    align-items: start;
  }

  .sk-pairs {
    display: grid;
    gap: var(--sp-3);
    padding-block-start: var(--sp-1);
  }

  .sk-pair {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A NARROW CARD STACKS ITS CASH: the figure over the two beside it, as the card does under 480. And a question's
     answers take their own line under it, at its text's edge, as they do on a phone. */
  @container (inline-size < 30rem) {
    .sk-cash {
      grid-template-columns: minmax(0, 1fr);
    }

    .sk-row.ask {
      flex-wrap: wrap;
    }

    .sk-row.ask > .caps {
      flex-basis: 100%;
      padding-inline-start: 44px;
    }
  }

  .sk-cols {
    display: grid;
    grid-template-columns: repeat(var(--n, 1), minmax(0, 1fr));
    gap: var(--sp-5);
  }

  @keyframes sk-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk,
    .sk-group {
      animation: none;
    }
  }
</style>
