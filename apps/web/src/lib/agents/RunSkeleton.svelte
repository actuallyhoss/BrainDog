<!--
  The skeleton of a card of runs while it reads: rows shaped like the rows it will draw (a face and two lines, 44 tall),
  or a run's parts (a label and its words, side by side from a tablet up), as many as it drew last time (`last-size.ts`).

  CALM: nothing for the first 300ms, so an answer that lands sooner never flashes bars; then the bars fade up once and
  hold still. No sweep. It is drawn only before a card's first answer; a re-read keeps what is drawn.
-->
<script lang="ts">
  let { kind = 'rows', count = 3, label = 'Loading' }: { kind?: 'rows' | 'pairs'; count?: number; label?: string } = $props();
  const n = $derived(Math.max(1, Math.min(12, Math.round(count))));
  const TITLE = ['56%', '42%', '64%', '38%', '50%', '46%'];
  const META = ['30%', '22%', '36%', '26%'];
</script>

<div class="rs" data-kind={kind} role="status" aria-busy="true">
  <span class="rs-said">{label}</span>
  {#each { length: n } as _, i (i)}
    {#if kind === 'rows'}
      <span class="rs-row" aria-hidden="true">
        <span class="rs-dot"></span>
        <span class="rs-stack"><span class="rs-bar" style:inline-size={TITLE[i % TITLE.length]}></span><span class="rs-bar rs-meta" style:inline-size={META[i % META.length]}></span></span>
      </span>
    {:else}
      <span class="rs-pair" aria-hidden="true"><span class="rs-bar rs-meta rs-label"></span><span class="rs-bar" style:inline-size={TITLE[i % TITLE.length]}></span></span>
    {/if}
  {/each}
</div>

<style>
  .rs {
    --rs-ink: color-mix(in oklab, var(--ink) 8%, transparent);
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
    container-type: inline-size;
    animation: rs-up 200ms var(--ease-out, ease-out) 300ms both;
  }

  .rs[data-kind='pairs'] {
    gap: var(--sp-4);
  }

  .rs-said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rs-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: var(--row-gap, 12px);
    min-block-size: var(--row-h, 44px);
  }

  .rs-dot {
    inline-size: 24px;
    block-size: 24px;
    border-radius: var(--r-pill, 999px);
    background: var(--rs-ink);
  }

  .rs-stack {
    display: grid;
    gap: 6px;
  }

  .rs-bar {
    display: block;
    block-size: 10px;
    border-radius: var(--r-xs, 6px);
    background: var(--rs-ink);
  }

  .rs-meta {
    block-size: 8px;
  }

  .rs-pair {
    display: grid;
    gap: var(--sp-2);
  }

  .rs-label {
    inline-size: 6rem;
  }

  @container (inline-size >= 560px) {
    .rs-pair {
      grid-template-columns: 12rem minmax(0, 1fr);
      column-gap: var(--sp-4);
      align-items: center;
    }
  }

  @keyframes rs-up {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rs {
      animation: none;
    }
  }
</style>
