<!--
  The docs search: a field that filters an index of every page's title, headings and summary.

  THE INDEX IS BUILT AT PRERENDER (`searchIndex` in `index.ts`) and arrives as the page's data, so a
  search asks no server and loads no library: `search` in `pages.ts` is a loop over a few words a page.

  DRAWN ONLY ONCE THE SCRIPT HAS RUN, as `lib/app/Page.svelte` draws its switch, because a field that
  filters nothing with scripting off is a control that cannot act. Without a script the section list
  beside it is the way in.

  THE FIELD IS THE DESIGN SYSTEM'S: the label above it, the tile's second fill, radius 12, 40 high and 44 on a
  phone, the search glyph at its start and the 2px ink ring on focus. The hits are a list in the tile.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { search, type Entry } from './pages.ts';
  import { docsWords } from './words.ts';

  let { index, id }: { index: readonly Entry[]; id: string } = $props();

  const w = docsWords.search;

  let live = $state(false);
  $effect(() => {
    live = true;
  });

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

{#if live}
  <div class="search" role="search">
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
{/if}

<style>
  .search {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .search-label {
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .search-field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
    padding-inline: var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--dim);
  }

  /* THE FIELD DRAWS THE RING, offset 2 in ink, so the input inside it draws none of its own. */
  .search-field:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* SIXTEEN PIXELS IN THE FIELD, so a phone does not zoom the page when it takes focus. */
  .search-input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    /* focus-ok: the ring is drawn on `.search-field:focus-within`, round the whole field. */
    outline: none;
  }

  .search-said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .search-said:empty {
    display: none;
  }

  .search-hits {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .search-hits li + li {
    border-block-start: 1px solid var(--line);
  }

  .search-hit {
    display: grid;
    gap: 2px;
    min-block-size: var(--tap);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    color: var(--ink2);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .search-hit:hover {
    background: var(--hover-wash);
  }

  .hit-title {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .hit-where,
  .hit-line {
    font-size: var(--t-site-small);
  }

  .hit-where {
    color: var(--dim);
  }

  .hit-line {
    overflow-wrap: anywhere;
  }

  @media (width < 640px) {
    .search-field,
    .search-input {
      min-block-size: var(--tap);
    }
  }
</style>
