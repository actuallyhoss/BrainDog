<!--
  The docs search: a field that filters an index of every page's title, headings and summary.

  THE INDEX IS BUILT AT PRERENDER (`searchIndex` in `index.ts`) and arrives as the page's data, so a
  search asks no server and loads no library: `search` in `pages.ts` is a loop over a few words a page.

  IN THE HTML FROM THE FIRST PAINT, so nothing under it moves when the script runs (it arrived with the script before,
  and the docs' head and the nav's list jumped down by its height: the docs' only layout shift). With scripting off a
  `<noscript>` rule takes it away, because a field that filters nothing is a control that cannot act; the section list
  beside it is the way in then.

  THE FIELD IS LOOK B'S: the label above it, a flat fill a step off the ground it sits on, radius 8,
  44 high, the search glyph at its start and a 2px ring in the ground's ink on focus. The hits are a list under it.
  `night` draws it on the night ground of the docs' PageHead, in the night's inks; otherwise it sits on the board.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { search, type Entry } from './pages.ts';
  import { docsWords } from './words.ts';

  let { index, id, night = false }: { index: readonly Entry[]; id: string; night?: boolean } = $props();

  const w = docsWords.search;

  let query = $state('');
  const asked = $derived(query.trim());
  const hits = $derived(search(index, asked));

  const clear = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      query = '';
    }
  };
</script>

<noscript>
  <style>
    .search[role='search'] { display: none !important; }
  </style>
</noscript>

<div class="search" class:night role="search">
  <label class="search-label" for={id}>{w.label}</label>
  <span class="search-field">
    <Icon name="search" size="m" />
    <input
      {id}
      class="search-input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder={w.placeholder}
      bind:value={query}
      onkeydown={clear}
    />
  </span>
  <p class="search-said" role="status">{asked === '' ? '' : hits.length > 0 ? w.found(hits.length) : w.none(asked)}</p>
  {#if hits.length > 0}
    <ul class="search-hits">
      {#each hits as hit (hit.href)}
        <li>
          <a class="search-hit" href={hit.href} onclick={() => (query = '')}>
            <span class="hit-title">{hit.title}</span>
            <span class="hit-where">{hit.section}</span>
            {#if hit.line}<span class="hit-line">{hit.line}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* NEVER WIDER THAN ITS RAIL (audit 31 Oct i, AI12): an input's own width (twenty characters) set the column, so in the
     220px rail the field ran 22px past it, its × and the end of its placeholder cut. The track is the rail, and the input
     takes what the field leaves. */
  .search {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
  }

  .search-label {
    color: var(--ink2);
    font-size: var(--t-label);
    font-weight: 500;
    line-height: 1.4;
  }

  .search-field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    background: var(--tile);
    border-radius: 8px;
    color: var(--muted);
  }

  /* THE FIELD DRAWS THE RING, offset 2 in ink, so the input inside it draws none of its own. */
  .search-field:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* SIXTEEN PIXELS IN THE FIELD, so a phone does not zoom the page when it takes focus. */
  .search-input {
    flex: 1;
    inline-size: 0;
    min-inline-size: 0;
    min-block-size: var(--tap);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-text);
    /* focus-ok: the ring is drawn on `.search-field:focus-within`, round the whole field. */
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .search-said {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-label);
  }

  /* NOTHING TO SAY YET: out of the grid, so it adds no gap, and still in the page so what it says next is heard. */
  .search-said:empty {
    position: absolute;
  }

  .search-hits {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .search-hits li + li {
    border-block-start: 1px solid var(--rule);
  }

  .search-hit {
    display: grid;
    gap: 2px;
    min-block-size: var(--tap);
    padding: var(--sp-2);
    border-radius: 8px;
    color: var(--ink2);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) {
    .search-hit:hover {
      background: var(--tile);
    }

    .night .search-hit:hover {
      background: var(--night-tint-2);
    }
  }

  .hit-title {
    color: var(--ink);
    font-size: var(--t-label);
    font-weight: 600;
  }

  .hit-where,
  .hit-line {
    font-size: var(--t-label);
  }

  .hit-where {
    color: var(--muted);
  }

  .hit-line {
    overflow-wrap: anywhere;
  }

  /* ON THE NIGHT GROUND: the night's second fill under the field, its two inks for the words, its hairline. */
  .night .search-label,
  .night .search-said,
  .night .hit-where,
  .night .search-hit {
    color: var(--on-night-2);
  }

  .night .search-field {
    background: var(--night-2);
    color: var(--on-night-2);
  }

  .night .search-field:focus-within {
    outline-color: var(--on-night);
  }

  .night .search-input,
  .night .hit-title {
    color: var(--on-night);
  }

  .night .search-input::placeholder {
    color: var(--on-night-2);
  }

  .night .search-hits li + li {
    border-block-start-color: var(--night-rule);
  }
</style>
