<!--
  The plugin screens while they are read: the cards' own shells at the size they land at, so nothing jumps when the
  record answers and nothing is a page-wide spinner (3 Nov, Sam: "proper skeleton loading on cards at their cached
  sizes"). The shell lane is building one shared system for this; until it lands, this is the plugins' own.

  THREE SHAPES: the store's shelves (two of four cards, under its real search and chips), a plugin's page as this record holds it
  (the lead beside what it adds, then a wide card, then three), and the store's page for one (the same, with its plan).
  Each shell is a `.surface-card` holding quiet bars where the words will be. Hidden from a screen reader, which hears
  the region is busy instead.
-->
<script lang="ts">
  import PageHead from '$lib/ui/PageHead.svelte';
  import { words } from '$lib/market/words.ts';
  import { STORE_AT } from './moved.ts';

  let { kind, title = null }: { kind: 'store' | 'installed' | 'listing'; title?: string | null } = $props();
</script>

{#if kind !== 'store'}
  <PageHead icon="packs" kicker={words.plugins} back={STORE_AT} title={title ?? ''} sentence="" />
{/if}

<div class={kind === 'store' ? 'shelves' : 'page'} aria-busy="true" aria-label={words.reading}>
  {#if kind === 'store'}
    {#each [0, 1] as shelf (shelf)}
      <div class="shelf" aria-hidden="true">
        <span class="bar head"></span>
        <div class="cards">
          {#each [0, 1, 2, 3] as c (c)}
            <div class="surface-card card store-card">
              <span class="bar glyph"></span>
              <span class="bar line w60"></span>
              <span class="bar line w90"></span>
              <span class="bar line w70"></span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <div class="tiles" aria-hidden="true">
      <div class="surface-card card lead">
        <span class="bar line w40 strong"></span>
        <span class="bar line w90"></span>
        <span class="bar line w80"></span>
        <span class="bar line w30"></span>
        <span class="bar pill btn"></span>
      </div>
      <div class="surface-card card side">
        <span class="bar line w50 strong"></span>
        {#each [0, 1, 2] as r (r)}<span class="row"><span class="bar dot"></span><span class="bar line w60"></span></span>{/each}
      </div>
      <div class="surface-card card wide">
        <span class="bar line w30 strong"></span>
        <span class="bar line w70"></span>
        <span class="bar line w50"></span>
        <span class="bar pill btn"></span>
      </div>
      {#each [0, 1, 2] as c (c)}
        <div class="surface-card card third">
          <span class="bar line w40 strong"></span>
          <span class="bar line w80"></span>
          <span class="bar line w60"></span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    min-inline-size: 0;
  }

  .shelves {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
  }

  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--tile-pad);
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .store-card {
    min-block-size: 156px;
  }

  .lead {
    min-block-size: 232px;
  }

  .side {
    min-block-size: 200px;
  }

  .wide {
    min-block-size: 180px;
  }

  .third {
    min-block-size: 140px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A BAR WHERE WORDS WILL BE: the soft fill, a slow breath, and still for anybody who asks for less motion. */
  .bar {
    display: block;
    block-size: 12px;
    border-radius: var(--r-pill);
    background: var(--soft-fill, var(--tile-2));
    animation: breathe 1.6s var(--ease-out, ease-out) infinite alternate;
  }

  .bar.strong {
    block-size: 14px;
  }

  .bar.head {
    inline-size: 160px;
    block-size: 16px;
  }

  .bar.glyph,
  .bar.dot {
    inline-size: 28px;
    block-size: 28px;
    flex: none;
  }

  .bar.pill.btn {
    inline-size: 112px;
    block-size: 28px;
    margin-block-start: auto;
  }

  .w30 { inline-size: 30%; }
  .w40 { inline-size: 40%; }
  .w50 { inline-size: 50%; }
  .w60 { inline-size: 60%; }
  .w70 { inline-size: 70%; }
  .w80 { inline-size: 80%; }
  .w90 { inline-size: 90%; }

  @keyframes breathe {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
    }
  }

  @media (width >= 640px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 900px) {
    .tiles {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .lead {
      grid-column: span 7;
    }

    .side {
      grid-column: span 5;
    }

    .wide {
      grid-column: 1 / -1;
    }

    .third {
      grid-column: span 4;
    }
  }

  @media (width >= 1100px) {
    .cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
