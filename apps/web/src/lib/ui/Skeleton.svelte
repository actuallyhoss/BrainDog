<!--
  A SKELETON SHAPED LIKE WHAT WILL BE THERE (ui-perfect, 3 Nov): bars where words go, a circle where a face or a glyph
  goes, a tall bar where a figure goes, capsules where chips go. It holds the place of a card's content while that card
  reads, so the answer lands in the same box and nothing under it moves.

    <Skeleton kind="rows" count={4} />          list rows: a 28 circle, a title bar and a meta bar, 44 tall each
    <Skeleton kind="lines" count={3} />         lines of text at the body's line height
    <Skeleton kind="figure" />                  a label, the big figure, a line under it
    <Skeleton kind="chips" count={5} />         capsules 28 tall, wrapping
    <Skeleton kind="table" count={5} />         a header strip and rows of three cells

  CALM, NOT A SHIMMER. Nothing shows for the first 300ms, so an answer that lands sooner never flashes bars; then the
  bars fade up once and hold still. Only a wait past two seconds gets a slow breath (opacity, 2.4s a cycle) to say the
  read is still out. Under reduced motion the bars are simply there, still, from 300ms. No light sweeps across them:
  a sweep on twelve cards at once is the "blinking" this replaces.

  NO WORDS OF ANY RECORD: the bars carry no text, so a skeleton drawn from the cached shape shows nobody anything.
  One hidden "Loading" for a screen reader, and `aria-busy` on the box.
-->
<script lang="ts">
  import type { SkeletonKind } from './shape.ts';

  let {
    kind = 'rows',
    count,
    label = 'Loading',
  }: {
    kind?: SkeletonKind | undefined;
    /** How many rows, lines, chips or table rows. Defaults: rows 3, lines 3, chips 4, table 4. */
    count?: number | undefined;
    /** Said to a screen reader; never drawn. */
    label?: string | undefined;
  } = $props();

  const DEFAULT: Record<SkeletonKind, number> = { rows: 3, lines: 3, figure: 1, chips: 4, table: 4 };
  const n = $derived(Math.max(1, Math.min(12, Math.round(count ?? DEFAULT[kind]))));
  /* Widths that read as text of different lengths rather than a barcode of equal ones. */
  const TITLE = ['64%', '48%', '72%', '40%', '58%', '44%', '68%', '52%'];
  const META = ['32%', '24%', '38%', '28%', '34%', '22%'];
  const CHIP = [72, 96, 64, 88, 80, 104, 68, 92];
</script>

<div class="sk" data-kind={kind} role="status" aria-busy="true">
  <span class="sk-said">{label}</span>
  {#if kind === 'rows'}
    {#each { length: n } as _, i (i)}
      <span class="sk-row" aria-hidden="true">
        <span class="sk-dot"></span>
        <span class="sk-stack"><span class="sk-bar" style:inline-size={TITLE[i % TITLE.length]}></span><span class="sk-bar sk-meta" style:inline-size={META[i % META.length]}></span></span>
      </span>
    {/each}
  {:else if kind === 'lines'}
    {#each { length: n } as _, i (i)}
      <span class="sk-line" aria-hidden="true"><span class="sk-bar" style:inline-size={i === n - 1 && n > 1 ? '46%' : TITLE[(i + 2) % TITLE.length]}></span></span>
    {/each}
  {:else if kind === 'figure'}
    <span class="sk-fig" aria-hidden="true">
      <span class="sk-bar sk-meta" style:inline-size="28%"></span>
      <span class="sk-bar sk-big" style:inline-size="44%"></span>
      <span class="sk-bar sk-meta" style:inline-size="56%"></span>
    </span>
  {:else if kind === 'chips'}
    <span class="sk-chips" aria-hidden="true">
      {#each { length: n } as _, i (i)}<span class="sk-chip" style:inline-size={`${CHIP[i % CHIP.length]}px`}></span>{/each}
    </span>
  {:else}
    <span class="sk-table" aria-hidden="true">
      <span class="sk-thead"><span class="sk-bar sk-meta" style:inline-size="18%"></span><span class="sk-bar sk-meta" style:inline-size="12%"></span><span class="sk-bar sk-meta" style:inline-size="10%"></span></span>
      {#each { length: n } as _, i (i)}
        <span class="sk-tr"><span class="sk-bar" style:inline-size={TITLE[i % TITLE.length]}></span><span class="sk-bar" style:inline-size="60%"></span><span class="sk-bar" style:inline-size="48%"></span></span>
      {/each}
    </span>
  {/if}
</div>

<style>
  /* UP AFTER 300MS, ONCE, AND STILL; A SLOW BREATH ONLY PAST TWO SECONDS. */
  .sk {
    --sk-ink: color-mix(in oklab, var(--ink) 8%, transparent);
    --sk-ink-2: color-mix(in oklab, var(--ink) 5.5%, transparent);

    display: grid;
    min-inline-size: 0;
    animation:
      sk-in 200ms var(--ease-out) 300ms backwards,
      sk-breathe 2.4s ease-in-out 2s infinite alternate;
  }

  .sk-said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sk-bar {
    display: block;
    block-size: 10px;
    max-inline-size: 100%;
    background: var(--sk-ink);
    border-radius: var(--r-pill);
  }

  .sk-meta {
    block-size: 8px;
    background: var(--sk-ink-2);
  }

  /* A ROW: 44 tall, a 28 circle, the title and its meta on the row's text edge. */
  .sk-row {
    display: flex;
    align-items: center;
    gap: var(--row-gap, 12px);
    box-sizing: border-box;
    min-block-size: var(--row-h, 44px);
    padding-block: var(--sp-2);
  }

  .sk-dot {
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    background: var(--sk-ink-2);
    border-radius: 50%;
  }

  .sk-stack {
    display: grid;
    flex: 1;
    gap: calc(6px * var(--dense, 1));
    min-inline-size: 0;
  }

  /* A LINE: the body's line box, the bar on its middle. */
  .sk-line {
    display: flex;
    align-items: center;
    block-size: calc(var(--fs-body, 14px) * var(--lh-body, 1.5));
  }

  .sk-fig {
    display: grid;
    gap: var(--sp-2);
  }

  .sk-big {
    block-size: 28px;
    border-radius: var(--r-ctl);
  }

  .sk-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .sk-chip {
    block-size: var(--btn-h-sm, 28px);
    max-inline-size: 100%;
    background: var(--sk-ink-2);
    border-radius: var(--r-pill);
  }

  .sk-table {
    display: grid;
  }

  .sk-thead,
  .sk-tr {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    align-items: center;
    gap: var(--sp-4);
    padding-inline: var(--title-inset, 12px);
  }

  .sk-thead {
    block-size: 32px;
  }

  .sk-tr {
    block-size: var(--table-row-h, 44px);
  }

  @keyframes sk-in {
    from {
      opacity: 0;
    }
  }

  @keyframes sk-breathe {
    to {
      opacity: 0.6;
    }
  }

  /* STILL UNDER REDUCED MOTION: up at 300ms in one step, and no breath. */
  @media (prefers-reduced-motion: reduce) {
    .sk {
      animation: sk-in 1ms step-end 300ms backwards;
    }
  }

  @media (forced-colors: active) {
    .sk-bar,
    .sk-dot,
    .sk-chip {
      background: GrayText;
    }
  }
</style>
