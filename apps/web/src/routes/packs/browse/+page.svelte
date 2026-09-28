<!--
  Everything a record can add, in one grid: `/packs/browse` (`loop/finish/platform.md` PLT-3, §4.0 L).

  ONE LISTING MODEL. The modules this build ships, its built-in use cases and every entry the Kennel answers are read into
  `Listing`s by `listingsOf` (`$lib/market/listing.ts`), so they are searched, counted, filtered and sorted the same
  way. A search reads the title, the summary, the id, the lists and pages it adds, who made it and its categories; a chip
  keeps one category; the order is For you, Most installed or Newest. With nothing searched, BrainDog's own and the ways
  of working lead.

  NOTHING HERE INSTALLS. A card opens the listing's own page, where the file is verified and the record's plan is read
  before anything can be pressed. The record's packs are read only to say on a card what is already in.

  A HOST WITH NO KENNEL, OR A RECORD THAT DOES NOT ANSWER, still draws every built-in listing: neither is what browse is
  about, and a signed-out visitor from the site's Install link is shown what there is before being asked to sign in.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueIndex, Category } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ListingCard from '$lib/market/ListingCard.svelte';
  import { chipsOf, categoryName, inCategory } from '$lib/market/categories.ts';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, listingsOf, ordered, searchListings, type Order } from '$lib/market/listing.ts';
  import { words } from '$lib/market/words.ts';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import Preview from './Preview.svelte';
  import { readHostCatalogue } from './catalogue.ts';

  let kennel = $state.raw<CatalogueIndex | null>(null);
  let kennelRefused = $state<string | null>(null);
  let counts = $state.raw<Record<string, number> | null>(null);
  /** This record's packs, `null` until it answers or when it does not. */
  let states = $state.raw<PackState[] | null>(null);

  let query = $state(page.url.searchParams.get('q') ?? '');
  let category = $state<Category | null>(null);
  let order = $state<Order>('for-you');

  const listings = $derived(listingsOf({ kennel, counts }));
  const searched = $derived(searchListings(listings, query, categoryName));
  const chips = $derived(chipsOf(searched));
  /* A CHIP THAT A NEW SEARCH EMPTIED lets go, so the grid never says nothing matches because of a chip no longer drawn. */
  const picked = $derived(category !== null && chips.some((c) => c.category === category) ? category : null);
  /* WITH A SEARCH, THE BEST MATCH LEADS under For you; the other orders are what a person asked for, search or not. */
  const shown = $derived(order === 'for-you' && query.trim() !== '' ? inCategory(searched, picked) : ordered(inCategory(searched, picked), order));
  const ORDERS: readonly Order[] = ['for-you', 'installed', 'newest'];

  onMount(() => {
    void readHostCatalogue(fetch).then((got) => {
      if (got.ok) kennel = got.index;
      else kennelRefused = got.fix;
    });
    void readCounts(fetch).then((got) => (counts = got));
    void read(async () => {
      const chosen = await choose(createClient({ base: apiBase() }));
      if (!chosen.first.ok) return false;
      states = chosen.first.value;
      return true;
    });
  });
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.browseTitle)}</title></svelte:head>

<PageHead icon="packs" title={copy.browseTitle} />

<div class="page">
  <div class="field field-lg search">
    <input class="field-input" type="search" bind:value={query} aria-label={words.searchLabel} placeholder={words.searchHint} autocomplete="off" enterkeyhint="search" />
  </div>

  <div class="controls">
    <div class="chips" role="group" aria-label={words.categoriesLabel}>
      <button type="button" class="chip" aria-pressed={picked === null} data-on={picked === null ? '' : undefined} onclick={() => (category = null)}>
        {words.all}<span class="n">{searched.length}</span>
      </button>
      {#each chips as c (c.category)}
        <button type="button" class="chip" aria-pressed={picked === c.category} data-on={picked === c.category ? '' : undefined} onclick={() => (category = picked === c.category ? null : c.category)}>
          {c.name}<span class="n">{c.count}</span>
        </button>
      {/each}
    </div>
    <div class="segmented order" role="group" aria-label={words.orderLabel}>
      {#each ORDERS as o (o)}
        <button type="button" class="segment" aria-pressed={order === o} data-on={order === o ? '' : undefined} onclick={() => (order = o)}>{words.orders[o]}</button>
      {/each}
    </div>
  </div>

  {#if kennelRefused}<Empty kind="error" title={kennelRefused} />{/if}

  <p class="count" role="status">{words.results(shown.length)}</p>

  {#if shown.length === 0}
    <Empty kind="no-results" title={words.nothingFound} body={words.nothingFoundBody} />
  {:else}
    <ul class="grid">
      {#each shown as l (l.key)}
        {@const u = l.kind === 'usecase' && l.source === 'bundled' ? useCase(l.id) : undefined}
        {@const action = states ? actionOf(l, states) : null}
        {#if u}
          <ListingCard listing={l} {action}>
            {#snippet drawing()}<Preview preview={previewOf(u)} />{/snippet}
          </ListingCard>
        {:else}
          <ListingCard listing={l} {action} />
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
    min-inline-size: 0;
  }

  .search {
    inline-size: 100%;
    max-inline-size: 40rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE CHIPS SCROLL SIDEWAYS IN THEIR OWN ROW, so the page never does at 390px. */
  .chips {
    display: flex;
    flex: 1 1 20rem;
    gap: var(--sp-2);
    min-inline-size: 0;
    overflow-x: auto;
    padding-block: var(--sp-1);
    scrollbar-width: none;
    /* THE CLIPPED EDGE FADES, as `.table-region` does, so a row of chips that runs on says so. A mask reads only alpha,
       so the opaque stop is any token. */
    mask-image: linear-gradient(to right, var(--ink) calc(100% - var(--sp-6)), transparent);
  }

  /* A CHOICE CHIP: a pill with an `--edge` border, and ink when chosen (design-brief §4); the ring is the shared one. */
  .chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    white-space: nowrap;
    cursor: pointer;
  }

  .chip[data-on] {
    border-color: var(--on);
    background: var(--on);
    color: var(--on-ink);
  }

  .n {
    color: inherit;
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .count {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* ONE COLUMN OF CARDS ON A PHONE, TWO FROM 640PX AND THREE FROM 900PX (design.md DSN-17), set by the breakpoints
     rather than by a card's least width, so the count is the same at 390 and at 1440 whatever the rail takes. */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6) var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (pointer: coarse) {
    .chip {
      min-block-size: var(--tap);
    }
  }

  @media (width < 640px) {
    .search {
      max-inline-size: none;
    }

    .order {
      inline-size: 100%;
    }
  }

  @media (width >= 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 900px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
