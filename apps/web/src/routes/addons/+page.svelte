<!--
  The store: everything a record can add, at `/addons`. The other half of Add-ons (`AddonsTabs.svelte`).

  ONE LISTING MODEL. The modules this build ships, its built-in use cases and every entry the Kennel answers are read into
  `Listing`s by `listingsOf` (`$lib/market/listing.ts`), so they are searched, counted, filtered and sorted the same
  way. A search reads the title, the summary, the id, the lists and pages it adds, who made it and its categories; the
  chips keep one section; the sort is For you, Most installed or Newest.

  THREE SECTIONS, SINCE the screens scope of 24 October (E20): Ready-made setups, Add-ons and Looks, and the chips are
  the same three with the same counts. A setup is a way of working, so each is a card, three across from 900px and one on
  a phone, each as tall as what it holds, with no miniature: its grey bars read as a page still loading. An add-on, built
  in or from outside, is a thing you hold, so it is a list of rows, as /packs lists what is installed. A chip that would
  keep every listing is not drawn, and neither is a count that repeats the sentence.

  NOTHING HERE INSTALLS. A card or a row opens the listing's own page, where the file is verified and the record's plan
  is read before anything can be pressed. The record's packs are read only to say what is already in.

  A HOST WITH NO KENNEL, OR A RECORD THAT DOES NOT ANSWER, still draws every built-in listing: neither is what browse is
  about, and a signed-out visitor from the site's Install link is shown what there is before being asked to sign in.

  ON A PHONE: the search the screen's width, then the filter with Sort at its end (agents F8).
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueIndex } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import { VOICE_LINES } from '$lib/voice.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import ListingCard from '$lib/market/ListingCard.svelte';
  import ListingRow from '$lib/market/ListingRow.svelte';
  import { categoryName, folds, sectionChips, sectionOf, SECTIONS, type Section } from '$lib/market/categories.ts';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, listingsOf, ordered, searchListings, type Listing, type Order } from '$lib/market/listing.ts';
  import { words } from '$lib/market/words.ts';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import AddonsTabs from './AddonsTabs.svelte';
  import { installedCount, words as packWords } from './words.ts';
  import { glyphOf as placeGlyph } from './glyph.ts';
  import { miniOf } from './mini.ts';
  import { readHostCatalogue } from './catalogue.ts';

  let kennel = $state.raw<CatalogueIndex | null>(null);
  let kennelRefused = $state<string | null>(null);
  let counts = $state.raw<Record<string, number> | null>(null);
  /** This record's packs, `null` until it answers or when it does not. */
  let states = $state.raw<PackState[] | null>(null);

  let query = $state(page.url.searchParams.get('q') ?? '');
  let category = $state<Section | null>(null);
  let order = $state<Order>('for-you');

  const listings = $derived(listingsOf({ kennel, counts }));
  const searched = $derived(searchListings(listings, query, categoryName));
  /* THE CHIPS ARE THE SECTIONS (E20), so each says the count its heading says. One section alone draws no chips: a filter
     that keeps every listing says nothing. */
  const chips = $derived(sectionChips(searched).filter((c) => c.count < searched.length));
  /* A CHIP THAT A NEW SEARCH EMPTIED lets go, so the page never says nothing matches because of a chip no longer drawn. */
  const picked = $derived(category !== null && chips.some((c) => c.section === category) ? category : null);
  const inSection = (ls: readonly Listing[], s: Section | null): Listing[] => (s === null ? [...ls] : ls.filter((l) => sectionOf(l) === s));
  /* WITH A SEARCH, THE BEST MATCH LEADS under For you; the other orders are what a person asked for, search or not. */
  const shown = $derived(order === 'for-you' && query.trim() !== '' ? inSection(searched, picked) : ordered(inSection(searched, picked), order));
  const ORDERS: readonly Order[] = ['for-you', 'installed', 'newest'];

  /* ON A PHONE EACH SECTION SHOWS FOUR, the rest a press away (audit C, X14): 41 entries in one column were about 6,000px.
     A search or a chip shows them all. The fold is the phone's alone (the styles); wider, every card fits the grid. */
  let opened = $state<Partial<Record<Section, boolean>>>({});

  /* HOW MANY THIS RECORD HOLDS ALREADY, in or turned off or behind an update, once it has answered: the number Installed
     says (audit Z10), and not only the ones this catalogue lists. */
  const held = $derived(installedCount(states));

  /* A BUILT-IN USE CASE'S HOME IN MINIATURE, and the glyph it is known by. */
  const voiced = (u: NonNullable<ReturnType<typeof useCase>>) => (key: string): string | null =>
    (u.voice as Record<string, string | undefined>)[key] ?? (VOICE_LINES as Record<string, string | undefined>)[key] ?? null;
  const miniFor = (l: Listing) => {
    const u = l.kind === 'usecase' && l.source === 'bundled' ? useCase(l.id) : undefined;
    return u ? miniOf(u, voiced(u)) : null;
  };
  const asGlyph = (name: string | null | undefined): IconName | null => (name && isGlyph(name) ? name : null);
  /* A USE CASE'S OWN GLYPH WHERE TWO WOULD WEAR ONE (UI pass of 21 October, P44): the guide took Personal's star from its
     first list, and Solo founder took Small business's grid from its Home. */
  const KNOWN_BY: Readonly<Record<string, IconName>> = { guide: 'check', founder: 'projects' };

  /* A BUILT-IN WEARS THE GLYPH OF THE PLACE IT BRINGS, as its row on /packs does (`glyph.ts`). */
  const modules = new Map(firstPartyModules().map((m) => [m.id, m]));
  const rowGlyph = (l: Listing): IconName | null => {
    if (l.kind !== 'module') return null;
    const g = placeGlyph(modules.get(l.id)?.pages, page.data.nav ?? []);
    return g === 'packs' ? null : g;
  };

  /* A STORE THAT DID NOT ANSWER SAYS SO, WITH TRY AGAIN (Y9): Browse had listed the built-ins alone and said nothing. */
  let retry = $state(false);
  function readStore(): void {
    kennelRefused = null;
    void readHostCatalogue(fetch).then((got) => {
      if (got.ok) kennel = got.index;
      else {
        kennelRefused = got.fix;
        retry = got.retry === true;
      }
    });
  }

  onMount(() => {
    readStore();
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

<svelte:head><title>{titleOf(packWords.tabs.browse, copy.packs)}</title></svelte:head>

<PageHead icon="packs" title={copy.packs} sentence={words.sentence(listings.length, held)}>
  {#snippet below()}<AddonsTabs current="browse" />{/snippet}
</PageHead>

<div class="page">
  <div class="tools">
    <div class="find">
      <Icon name="search" size="m" />
      <input class="find-input" type="search" bind:value={query} aria-label={words.searchLabel} placeholder={words.searchHint} autocomplete="off" enterkeyhint="search" />
    </div>
    <div class="filter">
      {#if chips.length > 0}
        <Segmented full class="chips" role="group" aria-label={words.categoriesLabel}>
          <button type="button" class="segment chip" aria-pressed={picked === null} data-on={picked === null ? '' : undefined} onclick={() => (category = null)}>
            {words.all}<span class="n">{searched.length}</span>
          </button>
          {#each chips as c (c.section)}
            <button type="button" class="segment chip" aria-pressed={picked === c.section} data-on={picked === c.section ? '' : undefined} onclick={() => (category = picked === c.section ? null : c.section)}>
              {c.name}<span class="n">{c.count}</span>
            </button>
          {/each}
        </Segmented>
      {/if}
      <label class="sort">
        <span class="sort-word">{words.sortLabel}</span>
        <select class="sort-select" bind:value={order} aria-label={words.orderLabel}>
          {#each ORDERS as o (o)}<option value={o}>{words.orders[o]}</option>{/each}
        </select>
      </label>
    </div>
  </div>

  {#if kennelRefused}
    <Empty kind="error" title={kennelRefused}>
      {#snippet actions()}{#if retry}<Button onclick={readStore}>{copy.tryAgain}</Button>{/if}{/snippet}
    </Empty>
  {/if}

  {#if shown.length === 0}
    <Empty kind="no-results" title={words.nothingFound} body={words.nothingFoundBody} />
  {:else}
    {#each SECTIONS as section (section)}
      {@const items = shown.filter((l) => sectionOf(l) === section)}
      {#if items.length > 0}
        {@const folded = folds(items.length, { searching: query.trim() !== '', picked: picked !== null, opened: opened[section] === true })}
        <section class="part" aria-labelledby="browse-{section}" data-folded={folded ? '' : undefined}>
          <h2 class="part-h" id="browse-{section}">{words.sections[section]}<span class="n num">{items.length}</span></h2>
          {#if section === 'setups'}
            <!-- NO MINIATURE (E20): grey bars under a heading read as a page still loading. The card is its glyph, its
                 name, what it is for and the lists it brings. -->
            <ul class="cards">
              {#each items as l (l.key)}
                {@const mini = miniFor(l)}
                <ListingCard listing={l} action={states ? actionOf(l, states) : null} glyph={KNOWN_BY[l.id] ?? asGlyph(mini?.glyph)} />
              {/each}
            </ul>
          {:else}
            <ul class="rows">
              {#each items as l (l.key)}
                <ListingRow listing={l} action={states ? actionOf(l, states) : null} glyph={rowGlyph(l)} />
              {/each}
            </ul>
          {/if}
          {#if folded}
            <div class="show-all"><Button weight="bare" onclick={() => (opened = { ...opened, [section]: true })}>{words.showAll(items.length)}</Button></div>
          {/if}
        </section>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  /* SEARCH, THE FILTER AND SORT: one row from 900px, and on a phone the search its own line over the other two. */
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .filter {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE SEARCH FIELD: the tile's fill on the board, the search glyph, `--ctl-h` tall and 44 under a thumb. Its focus is
     the field's ring, on the wrapper. */
  .find {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 20rem;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-ctl);
    box-shadow: inset 0 0 0 1px var(--switch-off);
    color: var(--ink-3);
  }

  .find:focus-within {
    outline: 2px solid var(--focus);
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
    font-size: var(--fs-ctl);
  }

  .find-input:focus-visible {
    /* focus-ok: `.find:focus-within` above draws the ring on the wrapper, as a field's does. */
    outline: none;
  }

  .find-input::placeholder {
    color: var(--ink-3);
  }

  .find-input::-webkit-search-cancel-button {
    appearance: none;
    display: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
  }

  .n {
    color: var(--ink-3);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
  }

  /* SORT, AT THE FILTER'S END: its word and the order chosen, the select's own chevron after it. */
  .sort {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  .sort-select {
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3) var(--sp-6);
    background-color: var(--tile);
    border: 0;
    border-radius: var(--r-ctl);
    box-shadow: inset 0 0 0 1px var(--switch-off);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
  }

  .sort-select:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* A SECTION ON THE BOARD: its name and count, then what it holds. */
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .part-h {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
  }

  /* THE CARDS: one column on a phone, two from 640px and three from 900px, 12 apart, EACH AS TALL AS WHAT IT HOLDS. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--tile-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE ROWS: one tile, the rows inside it. */
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: var(--sp-2);
    background: var(--tile);
    border-radius: var(--r-tile);
    list-style: none;
  }

  @media (pointer: coarse) {
    .find,
    .find-input,
    .sort-select {
      min-block-size: var(--tap);
    }

    .find-input {
      font-size: var(--fs-body);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .find {
      flex: 1 1 100%;
      inline-size: auto;
    }

    /* THE CHIPS TAKE THE LINE AND SORT GOES UNDER THEM, at the start: beside them it left the strip a third of a phone,
       and "Building blocks" was cut to "Bu" against the select. */
    .filter {
      flex: 1 1 100%;
      flex-wrap: wrap;
    }

    .filter > :global(.segmented) {
      flex: 1 1 100%;
      min-inline-size: 0;
    }

    .sort {
      margin-inline-start: 0;
    }

    /* ON A PHONE THE WORD "SORT" GOES, and the select says the order: room for the filter. */
    .sort-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  .show-all {
    display: none;
  }

  /* FOLDED ON A PHONE: the first four of a section, and Show all under them. */
  @media (width < 640px) {
    .part[data-folded] .cards > :global(:nth-child(n + 5)),
    .part[data-folded] .rows > :global(:nth-child(n + 5)) {
      display: none;
    }

    .part[data-folded] .show-all {
      display: flex;
    }
  }

  @media (width >= 640px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 900px) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .find {
      flex: none;
    }

    /* A LONE LAST CARD FILLS ITS ROW, and not a third of it beside two empty ones. */
    .cards > :global(:last-child:nth-child(3n + 1)) {
      grid-column: 1 / -1;
    }
  }

  @media (width >= 640px) and (width < 900px) {
    .cards > :global(:last-child:nth-child(2n + 1)) {
      grid-column: 1 / -1;
    }
  }
</style>
