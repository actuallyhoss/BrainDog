<!--
  /docs: every section of the docs as a card, with its pages, and a search over all of them.

  A SECTION WITH NO PAGE YET IS STILL A CARD, saying so, because the seven sections are the shape of
  the docs (site.md C7) and each fills as its unit writes it. Its title links nowhere until it has a
  page to open, so no card sends a reader to an address with nothing at it.

  `/llms.txt` IS LINKED FROM HERE, so the prerender crawler reaches it from a page as well as from the
  sitemap, and so a person who wants to hand the docs to an agent finds where they are.
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

<section class="docs-head" data-ground="sunk">
  <div class="in head-in">
    <h1 class="docs-title">{w.title}</h1>
    <p class="lede">{w.lede}</p>
    <a class="for-agents" href="/llms.txt" data-sveltekit-reload>{w.forAgents}</a>
    <div class="head-search">
      <Search index={data.index} id="docs-search" />
    </div>
  </div>
</section>

<section class="docs-cards" aria-label={w.title}>
  <div class="in">
    <ul class="hair cards">
      {#each data.sections as section (section.id)}
        {@const first = section.pages[0]?.path ?? null}
        <li class="card">
          <span class="card-glyph"><Icon name={section.glyph} /></span>
          <h2 class="card-title">
            {#if first}<a class="card-link" href={first}>{section.label}</a>{:else}{section.label}{/if}
          </h2>
          <p class="card-blurb">{section.blurb}</p>
          {#if section.pages.length > 0}
            <ul class="card-pages">
              {#each section.pages as page (page.path)}
                <li><a class="card-page" href={page.path}>{page.title}</a></li>
              {/each}
            </ul>
          {:else}
            <p class="card-empty">{w.empty}</p>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .docs-head {
    padding-block: var(--sp-8);
    border-block-end: 1px solid var(--line);
  }

  .head-in {
    display: grid;
    gap: var(--sp-4);
    justify-items: start;
  }

  .docs-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-h2);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .for-agents {
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  .head-search {
    inline-size: min(100%, 560px);
  }

  .docs-cards {
    padding-block: var(--sp-8);
  }

  .cards {
    grid-template-columns: minmax(0, 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  .card-glyph {
    display: inline-flex;
    color: var(--ink2);
  }

  .card-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-h3);
    font-weight: 600;
    line-height: 1.2;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  .card-link:hover {
    text-decoration: underline;
  }

  .card-blurb,
  .card-empty {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: 1.55;
  }

  .card-empty {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .card-pages {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A 44px row under a thumb and a lighter one under a mouse, like every list of links on the site. */
  .card-page {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  @media (pointer: coarse) {
    .card-page {
      min-block-size: var(--tap);
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
  }
</style>
