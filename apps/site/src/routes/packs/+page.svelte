<!--
  `/packs`: the catalogue's public face. A tile for every public listing, with a search field and a filter for each
  category a listing is in.

  TWO BANDS, AS THE BENTO PACKS BOARD LAYS THEM OUT. The first is the opening tile (the heading, what a pack is, the
  search and the filters) beside a tile that draws the catalogue by kind, from the same counts the filters carry. The
  second is the packs themselves, a tile each: an icon well on the heading row, the summary, what it adds as chips,
  and who made it and which version as the meta line.

  EVERY CARD IS IN THE HTML. The load hands the page every public card at build time, so the page reads whole with
  scripting off; the search and the filters narrow what is drawn once the script runs, and nothing is fetched to do it.

  THE WHOLE CARD IS THE TARGET, through its title's link stretched over it, so the card's lists stay lists and a screen
  reader hears the title as the link's name rather than every word on the card.
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

  /* THE KINDS, LARGEST FIRST, for the chart: the filters' own counts, so the drawing and the controls never disagree.
     `made-by-braindog` is who made them rather than what they are, so it is a filter and not a bar. */
  const kinds = $derived(
    [...filters.filter((f) => f.category !== 'made-by-braindog')].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  );
  const most = $derived(Math.max(1, ...kinds.map((k) => k.count)));

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

<section class="band" aria-labelledby="packs-h1">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-7 opening">
        <h1 class="h2" id="packs-h1">{w.title}</h1>
        <p class="lede">{w.lede}</p>

        {#if data.cards.length > 0}
          <div class="tools">
            <label class="search">
              <span class="search-label">{w.search}</span>
              <span class="field">
                <Icon name="search" size="m" />
                <input type="search" bind:value={query} placeholder={w.searchHint} autocomplete="off" spellcheck="false" />
              </span>
            </label>
            <div class="filters" role="group" aria-label={w.filters}>
              <button type="button" class="filter" aria-pressed={picked === null} onclick={() => (picked = null)}>
                {w.all}<span class="filter-count num">{data.cards.length}</span>
              </button>
              {#each filters as f (f.category)}
                <button
                  type="button"
                  class="filter"
                  aria-pressed={picked === f.category}
                  onclick={() => (picked = picked === f.category ? null : f.category)}
                >
                  {f.name}<span class="filter-count num">{f.count}</span>
                </button>
              {/each}
            </div>
            <p class="shown" role="status">{w.shown(shown.length)}</p>
          </div>
        {/if}
      </div>

      {#if kinds.length > 0}
        <div class="tile span-5 kinds">
          <h2 class="tile-head">
            <span class="well"><Icon name="bars" size="m" /></span>
            <span class="tile-title">{w.kinds}</span>
            <span class="tile-meta num">{w.shown(data.cards.length)}</span>
          </h2>
          <ul class="bars">
            {#each kinds as k, i (k.category)}
              <li class="bar" data-top={i === 0 ? '' : undefined}>
                <span class="bar-name">{k.name}</span>
                <span class="track" aria-hidden="true"><span class="fill" style="--share:{k.count / most}"></span></span>
                <span class="bar-n num">{k.count}</span>
              </li>
            {/each}
          </ul>
          <p class="reading">{w.kindsRead(kinds[0]?.name ?? '', kinds[0]?.count ?? 0)}</p>
        </div>
      {/if}
    </div>
  </div>
</section>

<!-- No name of its own: the band above is the region the page title names, and this one named the same was a second landmark with that name. -->
<section class="band">
  <div class="in">
    {#if data.cards.length === 0}
      <div class="tiles">
        <p class="tile span-12 none">{w.none}</p>
      </div>
    {:else if shown.length === 0}
      <div class="tiles">
        <div class="tile span-12 no-match">
          <p>{w.noMatch}</p>
          <button type="button" class="btn" onclick={showAll}>{w.showAll}</button>
        </div>
      </div>
    {:else}
      <ul class="tiles cards">
        {#each shown as card (card.slug)}
          <li class="tile span-4 card">
            <div class="tile-head">
              <span class="well"><Icon name={card.glyph} size="m" /></span>
              <h2 class="card-title"><a class="card-link" href="{PACKS}/{card.slug}">{card.title}</a></h2>
              <Icon name="chevron-right" size="m" />
            </div>
            <p class="summary">{card.summary}</p>
            {#if card.adds.length}<p class="adds">{card.adds.join(' · ')}</p>{/if}
            <p class="card-meta">
              <span>{w.by(card.publisher)}</span>
              <span class="num">{w.version(card.version)}</span>
              {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
            </p>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  /* ── The opening tile ─────────────────────────────────────────────────── */

  .opening .lede {
    margin-block-start: calc(-1 * var(--sp-2));
  }

  .tools {
    display: grid;
    gap: var(--sp-4);
  }

  .search {
    display: grid;
    gap: 6px;
    max-inline-size: 36rem;
  }

  .search-label {
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  /* THE FIELD: the tile's second fill, radius 12, 40 tall and 44 under a thumb, the search glyph inside it. */
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
    padding-inline: var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile-2);
    color: var(--ink-3);
  }

  .field:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* 16PX TEXT IN THE FIELD so a phone does not zoom into it. The ring is the field's, drawn above. */
  .field input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    /* focus-ok: the field around it draws the 2px ink ring on focus-within. */
    outline: none;
  }

  .field input::placeholder {
    color: var(--ink-3);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: 14px;
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-site-small);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* The kind on show is the chosen segment: ink, with its count in the on-ink word. */
  .filter[aria-pressed='true'] {
    background: var(--ink);
    color: var(--on-red);
  }

  .filter-count {
    color: var(--ink-3);
    font-weight: 400;
  }

  .filter[aria-pressed='true'] .filter-count {
    color: inherit;
  }

  .shown {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  /* ── The kinds tile: one bar a kind, the largest in ink and the rest grey ── */

  .kinds .tile-head {
    font-size: inherit;
    font-weight: inherit;
  }

  .bars {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr) 2.5ch;
    align-items: center;
    gap: var(--sp-3);
  }

  .bar-name {
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-site-small);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .track {
    display: block;
    block-size: 10px;
    border-radius: 3px;
    background: var(--tile-2);
  }

  .fill {
    display: block;
    inline-size: calc(var(--share) * 100%);
    min-inline-size: 6px;
    block-size: 100%;
    border-radius: 3px;
    background: var(--ink-3);
  }

  .bar[data-top] .fill {
    background: var(--ink);
  }

  .bar[data-top] .bar-name {
    color: var(--ink);
    font-weight: 500;
  }

  .bar-n {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
    text-align: end;
  }

  .kinds .reading {
    margin-block-start: auto;
  }

  /* ── The packs, a tile each ───────────────────────────────────────────── */

  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .none,
  .no-match p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
  }

  .no-match {
    align-items: flex-start;
  }

  .card {
    position: relative;
    gap: var(--sp-3);
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .card .tile-head {
    color: var(--ink-3);
  }

  .card-title {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  /* THE TITLE'S LINK COVERS THE CARD, so a press anywhere on it opens the pack. */
  .card-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-tile);
  }

  .summary {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* WHAT IT ADDS, as one quiet line and not a row of chips (DIRECTION §37). A long host name wraps rather than pushing
     the tile wider than the column. */
  .adds {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    margin-block-start: auto;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover {
    }

    .card:hover .tile-head {
      color: var(--ink);
    }

    .filter[aria-pressed='false']:hover {
      background: var(--tile-2);
    }
  }

  /* A THUMB'S TARGETS: every filter and the field 44 tall on a phone. */
  @media (width < 640px) {
    .filter,
    .field,
    .field input {
      min-block-size: var(--tap);
    }
  }
</style>
