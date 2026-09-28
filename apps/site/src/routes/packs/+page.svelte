<!--
  `/packs`: the catalogue's public face. A card for every public listing, with a search box and a filter
  for each category a listing is in.

  EVERY CARD IS IN THE HTML. The load hands the page every public card at build time, so the page reads
  whole with scripting off; the search and the filters narrow what is drawn once the script runs, and
  nothing is fetched to do it.

  THE WHOLE CARD IS THE TARGET, through its title's link stretched over it, so the card's lists stay
  lists and a screen reader hears the title as the link's name rather than every word on the card.

  THREE COLUMNS AT 1440, ONE UNDER 640: the grid fits as many 300px tracks as the column holds. The
  filters wrap onto a second line rather than scrolling sideways, and each is 44px tall.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { PACKS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import { filtersOf, matches, type Category } from '$lib/packs/catalogue.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = packs.packs;

  let query = $state('');
  let picked = $state<Category | null>(null);

  const filters = $derived(filtersOf(data.cards));
  const shown = $derived(data.cards.filter((c) => (picked === null || c.categories.includes(picked)) && matches(c, query)));

  function showAll() {
    query = '';
    picked = null;
  }
</script>

<svelte:head>
  <title>{w.meta.title}</title>
  <meta name="description" content={w.meta.description} />
  <link rel="canonical" href="https://brain.dog/packs" />
  <meta property="og:url" content="https://brain.dog/packs" />
  <meta property="og:title" content={w.meta.title} />
  <meta property="og:description" content={w.meta.description} />
</svelte:head>

<section class="packs-head" data-ground="page" aria-labelledby="packs-h1">
  <div class="in">
    <h1 class="display" id="packs-h1">{w.title}</h1>
    <p class="lede">{w.lede}</p>
  </div>
</section>

<section class="packs-body" data-ground="page">
  <div class="in">
    {#if data.cards.length === 0}
      <p class="none">{w.none}</p>
    {:else}
      <div class="tools">
        <label class="search">
          <span class="search-label">{w.search}</span>
          <input type="search" bind:value={query} placeholder={w.searchHint} autocomplete="off" spellcheck="false" />
        </label>
        <div class="filters" role="group" aria-label={w.filters}>
          <button type="button" class="filter" aria-pressed={picked === null} onclick={() => (picked = null)}>{w.all}</button>
          {#each filters as f (f.category)}
            <button type="button" class="filter" aria-pressed={picked === f.category} onclick={() => (picked = picked === f.category ? null : f.category)}>
              {f.name}<span class="filter-count num">{f.count}</span>
            </button>
          {/each}
        </div>
        <p class="shown" role="status">{w.shown(shown.length)}</p>
      </div>

      {#if shown.length === 0}
        <div class="no-match">
          <p>{w.noMatch}</p>
          <button type="button" class="btn" onclick={showAll}>{w.showAll}</button>
        </div>
      {:else}
        <ul class="cards">
          {#each shown as card (card.slug)}
            <li class="card">
              <span class="glyph"><Icon name={card.glyph} /></span>
              <h2 class="card-title"><a class="card-link" href="{PACKS}/{card.slug}">{card.title}</a></h2>
              <p class="summary">{card.summary}</p>
              <p class="meta">
                <span>{w.by(card.publisher)}</span>
                <span class="num">{w.version(card.version)}</span>
                {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
              </p>
              {#if card.adds.length}
                <ul class="adds">
                  {#each card.adds as add (add)}
                    <li class="chip">{add}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</section>

<style>
  .packs-head {
    padding-block: clamp(48px, 6vw, 96px) var(--sp-6);
  }

  .packs-head .lede {
    margin-block-start: var(--sp-4);
  }

  .packs-body {
    padding-block: 0 clamp(56px, 7vw, 104px);
  }

  .none {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
  }

  .tools {
    display: grid;
    gap: var(--sp-4);
    margin-block-end: var(--sp-6);
  }

  .search {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: 36rem;
  }

  .search-label {
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* 16PX TEXT IN THE FIELD so a phone does not zoom into it, and the field is a full tap tall. */
  .search input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .filter[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--bg);
  }

  .filter-count {
    color: inherit;
    font-weight: 400;
  }

  .shown {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .no-match {
    display: grid;
    justify-items: start;
    gap: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .no-match p {
    margin: 0;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-5);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--s1);
  }

  .glyph {
    display: inline-grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    margin-block-end: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--sunk);
    color: var(--ink);
  }

  .card-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  /* THE TITLE'S LINK COVERS THE CARD, so a press anywhere on it opens the pack. */
  .card-link::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-lg);
  }

  .summary {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    margin-block-start: var(--sp-2);
    padding: 0;
    list-style: none;
  }

  /* A long host name wraps inside its chip rather than pushing the card wider than the column. */
  .adds .chip {
    min-block-size: 26px;
    max-inline-size: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      border-color: var(--ink2);
    }

    .filter:hover {
      border-color: var(--ink2);
    }
  }
</style>
