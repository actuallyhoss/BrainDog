<!--
  The plugin screens while they are read: the cards' own shells at the size they land at, so nothing jumps when the
  record answers and nothing is a page-wide spinner (3 Nov, the owner: "proper skeleton loading on cards at their cached
  sizes"). Each card is the shared one (`ui/SkeletonCard.svelte`, finish 3 Nov), as Today's are: no shimmer, ink at
  a fixed strength; this file only lays the cards out as the plugin screens land.

  THREE SHAPES: the store's shelves (two of four cards, under its real search and chips), a plugin's page as this record holds it
  (the lead beside what it adds, then a wide card, then three), and the store's page for one (the same, with its plan).
  Each shell is a `.surface-card` holding quiet bars where the words will be. Hidden from a screen reader, which hears
  the region is busy instead.
-->
<script lang="ts">
  import PageHead from '$lib/ui/PageHead.svelte';
  import SkeletonCard from '$lib/ui/SkeletonCard.svelte';
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
        <span class="head"></span>
        <div class="cards">
          {#each [0, 1, 2, 3] as c (c)}<div class="store-card"><SkeletonCard kind="store" /></div>{/each}
        </div>
      </div>
    {/each}
  {:else}
    <div class="tiles" aria-hidden="true">
      <div class="lead"><SkeletonCard kind="lead" /></div>
      <div class="side"><SkeletonCard kind="side" /></div>
      <div class="wide"><SkeletonCard kind="wide" /></div>
      {#each [0, 1, 2] as c (c)}<div class="third"><SkeletonCard kind="third" /></div>{/each}
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

  /* EACH CARD AS TALL AS THE ONE IT STANDS FOR LANDS. */
  .store-card,
  .lead,
  .side,
  .wide,
  .third {
    display: grid;
  }

  .store-card {
    min-block-size: 156px;
  }

  .head {
    display: block;
    inline-size: 160px;
    block-size: 16px;
    border-radius: var(--r-xs);
    background: color-mix(in oklab, var(--ink) 9%, transparent);
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
