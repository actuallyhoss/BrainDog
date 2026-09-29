<!--
  /docs: the opening tile with the search, then every section of the docs as a tile with its pages.

  THE LOOK IS SYSTEM §10's: tiles on the ground, each section's tile headed by its glyph in a well, its name and how
  many pages it holds, then its sentence and its pages as a quiet list.

  A SECTION WITH NO PAGE YET IS STILL A TILE, saying so, because the sections are the shape of the docs (site.md C7)
  and each fills as its unit writes it. Its title links nowhere until it has a page to open, so no tile sends a reader
  to an address with nothing at it.

  `/llms.txt` IS LINKED FROM HERE, so the prerender crawler reaches it from a page as well as from the sitemap, and so a
  person who wants to hand the docs to an agent finds where they are.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import Search from '$lib/docs/Search.svelte';
  import { docsWords } from '$lib/docs/words.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = docsWords;
</script>

<svelte:head>
  <title>{w.meta.title}</title>
  <meta name="description" content={w.meta.description} />
  <link rel="canonical" href="https://brain.dog/docs" />
  <meta property="og:url" content="https://brain.dog/docs" />
  <meta property="og:title" content={w.meta.title} />
  <meta property="og:description" content={w.meta.description} />
</svelte:head>

<section class="band" aria-labelledby="docs-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead head">
        <div class="head-words">
          <span class="well l"><Icon name="book" /></span>
          <h1 class="h2" id="docs-title">{w.title}</h1>
          <p class="lede">{w.lede}</p>
          <a class="onward" href="/llms.txt" data-sveltekit-reload>{w.forAgents}<Icon name="arrow" size="m" /></a>
        </div>
        <div class="head-search">
          <Search index={data.index} id="docs-search" />
        </div>
      </div>
    </div>
  </div>
</section>

<section class="band" aria-label={w.title}>
  <div class="in">
    <ul class="tiles cards">
      {#each data.sections as section (section.id)}
        {@const first = section.pages[0]?.path ?? null}
        <li class="tile card span-4">
          <div class="tile-head">
            <span class="well"><Icon name={section.glyph} /></span>
            <h2 class="tile-title">
              {#if first}<a class="card-link" href={first}>{section.label}</a>{:else}{section.label}{/if}
            </h2>
            {#if section.pages.length > 0}<span class="tile-count num">{section.pages.length}</span>{/if}
          </div>
          <p class="card-blurb">{section.blurb}</p>
          {#if section.pages.length > 0}
            <ul class="card-pages">
              {#each section.pages as page (page.path)}
                <li>
                  <a class="card-page" href={page.path}><span>{page.title}</span><Icon name="chevron-right" size="m" /></a>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="card-empty meta">{w.empty}</p>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
  }

  .head-words {
    display: grid;
    justify-items: start;
    gap: var(--sp-3);
  }

  .head-search {
    min-inline-size: 0;
  }

  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    gap: var(--sp-3);
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  .card-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .card-blurb {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .card-empty {
    margin: 0;
  }

  /* THE PAGES SIT IN THE TILE AS A LIST, with a hairline between rows and the row's wash under the pointer. */
  .card-pages {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card-pages li + li {
    border-block-start: 1px solid var(--line);
  }

  .card-page {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-2);
    margin-inline: calc(-1 * var(--sp-2));
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .card-page :global(svg) {
    color: var(--dim);
  }

  .card-page:hover {
    background: var(--hover-wash);
  }

  @media (pointer: coarse) {
    .card-page {
      min-block-size: var(--tap);
    }
  }

  @media (width >= 900px) {
    .head {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      align-items: end;
      gap: var(--sp-7);
    }
  }

  @media (width < 640px) {
    .card-page {
      min-block-size: var(--tap);
    }
  }
</style>
