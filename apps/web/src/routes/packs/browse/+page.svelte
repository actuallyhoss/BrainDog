<!--
  Everything a record can add, in one grid: `/packs/browse`.

  ONE LISTING MODEL. The modules this build ships, its built-in use cases and every entry the Kennel answers are read into
  `Listing`s by `listingsOf` (`$lib/market/listing.ts`), so they are searched, counted, filtered and sorted the same
  way. A search reads the title, the summary, the id, the lists and pages it adds, who made it and its categories; a chip
  keeps one category; the order is For you, Most installed or Newest. With nothing searched, BrainDog's own and the ways
  of working lead.

  NOTHING HERE INSTALLS. A card opens the listing's own page, where the file is verified and the record's plan is read
  before anything can be pressed. The record's packs are read only to say on a card what is already in.

  A HOST WITH NO KENNEL, OR A RECORD THAT DOES NOT ANSWER, still draws every built-in listing: neither is what browse is
  about, and a signed-out visitor from the site's Install link is shown what there is before being asked to sign in.

  THE LOOK (and the site's catalogue board): the search field and the order are glass in the title row's
  toolbar, and the sentence under the title says how many there are and how many this record holds already. The
  categories are a glass segmented control on the ground under it: a row of up to nine chips does not fit a toolbar
  beside a title, and a toolbar that wraps under itself reads as two toolbars. Then the grid of tiles, 12 apart.
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
  import Icon from '$lib/ui/Icon.svelte';
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

  /* HOW MANY THIS RECORD HOLDS ALREADY, in or turned off or behind an update, once it has answered. */
  const held = $derived(states ? listings.filter((l) => actionOf(l, states!).kind !== 'install').length : null);

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

<PageHead icon="packs" title={copy.browseTitle} sentence={words.sentence(listings.length, held)}>
  {#snippet actions()}
    <div class="find">
      <Icon name="search" size="m" />
      <input class="find-input" type="search" bind:value={query} aria-label={words.searchLabel} placeholder={words.searchHint} autocomplete="off" enterkeyhint="search" />
    </div>
    <div class="segmented order" role="group" aria-label={words.orderLabel}>
      {#each ORDERS as o (o)}
        <button type="button" class="segment" aria-pressed={order === o} data-on={order === o ? '' : undefined} onclick={() => (order = o)}>{words.orders[o]}</button>
      {/each}
    </div>
  {/snippet}
</PageHead>

<div class="page">
  <!-- THE CATEGORIES, EACH WITH ITS COUNT: one glass segmented control on the ground, which wraps rather than hiding a
       chip past its edge. -->
  <div class="segmented chips" role="group" aria-label={words.categoriesLabel}>
    <button type="button" class="segment chip" aria-pressed={picked === null} data-on={picked === null ? '' : undefined} onclick={() => (category = null)}>
      {words.all}<span class="n">{searched.length}</span>
    </button>
    {#each chips as c (c.category)}
      <button type="button" class="segment chip" aria-pressed={picked === c.category} data-on={picked === c.category ? '' : undefined} onclick={() => (category = picked === c.category ? null : c.category)}>
        {c.name}<span class="n">{c.count}</span>
      </button>
    {/each}
  </div>

  {#if kennelRefused}<Empty kind="error" title={kennelRefused} />{/if}

  <p class="count" role="status">{words.results(shown.length)}</p>

  {#if shown.length === 0}
    <Empty kind="no-results" title={words.nothingFound} body={words.nothingFoundBody} />
  {:else}
    <ul class="catalogue">
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

  /**
   * THE SEARCH FIELD IN THE TOOLBAR: a field (the `--r-md` corner, the search glyph, 36 tall and 44 under a thumb) in
   * the toolbar's glass rather than the field's `--s1`, because it sits on the ground with the other toolbar controls.
   * Its focus is the field's ring, on the wrapper.
   */
  .find {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 18rem;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--glass);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-md);
    box-shadow: var(--glass-edge);
    color: var(--dim);
  }

  .find:focus-within {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .find-input {
    flex: 1;
    align-self: stretch;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    appearance: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .find-input:focus-visible {
    /* focus-ok: `.find:focus-within` above draws the ring on the wrapper, as a field's does. */
    outline: none;
  }

  .find-input::placeholder {
    color: var(--dim);
  }

  .find-input::-webkit-search-cancel-button {
    appearance: none;
    display: none;
  }

  /* IN THE COMPACT BAR THE TOOLBAR DROPS ITS OWN GLASS, as the bar's buttons do: the bar is glass, and glass never holds
     glass. Only where the bar is drawn, from 900px up. */
  @media (width >= 900px) {
    :global(.head[data-under]) .find,
    :global(.head[data-under]) .order {
      background: var(--hover-wash);
      box-shadow: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  .chips {
    align-self: start;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
  }

  .n {
    color: var(--dim);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .count {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ONE COLUMN OF TILES ON A PHONE, TWO FROM 640PX AND THREE FROM 900PX, 12 apart, set by the breakpoints
     rather than by a tile's least width, so the count is the same at 390 and at 1440 whatever the rail takes. */
  .catalogue {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (pointer: coarse) {
    .find,
    .find-input {
      min-block-size: var(--tap);
    }

    .find-input {
      font-size: var(--t-md);
    }
  }

  /* ON A PHONE THE FIELD TAKES THE TOOLBAR'S WHOLE LINE and the order the next, each as wide as the screen allows. */
  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .find {
      flex: 1 1 100%;
      inline-size: auto;
    }
  }

  @media (width >= 640px) {
    .catalogue {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 900px) {
    .catalogue {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
