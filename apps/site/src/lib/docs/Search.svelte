<!--
  The docs search: a box that filters an index of every page's title, headings and summary.

  THE INDEX IS BUILT AT PRERENDER (`searchIndex` in `index.ts`) and arrives as the page's data, so a
  search asks no server and loads no library: `search` in `pages.ts` is a loop over a few words a page.

  DRAWN ONLY ONCE THE SCRIPT HAS RUN, as `lib/app/Page.svelte` draws its switch, because a box that
  filters nothing with scripting off is a control that cannot act. Without a script the section list
  beside it is the way in.
-->
<script lang="ts">
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
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  /* SIXTEEN PIXELS IN THE BOX, so a phone does not zoom the page when it takes focus. */
  .search-input {
    inline-size: 100%;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
  }

  .search-said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .search-hits {
    display: grid;
    gap: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--line);
    list-style: none;
  }

  .search-hit {
    display: grid;
    gap: 2px;
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    background: var(--bg);
    color: var(--ink2);
    text-decoration: none;
  }

  .search-hit:hover {
    background: var(--s1);
  }

  .hit-title {
    color: var(--ink);
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
</style>
