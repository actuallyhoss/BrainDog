<!--
  /docs: the page's head with the search in it, then every section of the docs as a card with its pages.

  THE LOOK IS LOOK B'S (LAUNCH 103 job 7): `PageHead` on the night ground, holding the search and the
  link for agents in its slot, then the sections as flat --paper cards on the page, each with its name,
  its sentence and its pages as a quiet list. No bare page count: a number with no word beside it read as noise.

  A SECTION WITH NO PAGE YET IS STILL A CARD, saying so, because the sections are the shape of the docs
  and each fills as its pages are written. Its title links nowhere until it has a page to open, so no card sends a reader
  to an address with nothing at it.

  `/llms.txt` IS LINKED FROM HERE, so the prerender crawler reaches it from a page as well as from the sitemap, and so a
  person who wants to hand the docs to an agent finds where they are.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Search from '$lib/docs/Search.svelte';
  import { docsWords } from '$lib/docs/words.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = docsWords;

  /* THE CARDS IN COLUMNS, so a short card never leaves a hole beside a long one: Start here across the
     top, then the sections as three columns of about the same height at a desk, each column's cards one under another.
     A section not named here goes in the last column. */
  const COLUMNS: readonly (readonly string[])[] = [['start'], ['use', 'api'], ['agents', 'dialect'], ['packs']];
  const groups = $derived.by(() => {
    const named = new Set(COLUMNS.flat());
    const out = COLUMNS.map((ids) => data.sections.filter((s) => ids.includes(s.id)));
    out.at(-1)!.push(...data.sections.filter((s) => !named.has(s.id)));
    return out.filter((g) => g.length > 0);
  });
</script>

<Seo title={w.meta.title} description={w.meta.description} path="/docs" />
<PageHead title={w.title} lead={w.lede}>
  <a class="more" href="/llms.txt" data-sveltekit-reload>{w.forAgents}<Icon name="arrow" size="m" /></a>
  <div class="head-search">
    <Search index={data.index} id="docs-search" night />
  </div>
</PageHead>

<!-- No name of its own: the head above is the region the page title names, and this one named the same was a second landmark with that name. -->
<section class="wrap secs">
  <div class="cards">
    {#each groups as group, gi (gi)}
    <ul class="col" class:top={group[0]?.id === 'start'}>
    {#each group as section (section.id)}
      {#if section.id === 'start'}
        <li class="sec start">
          <div class="sec-head">
            <Icon name={section.glyph} size="m" />
            <h2 class="sec-title">{section.label}</h2>
          </div>
          <ul class="start-links">
            {#each w.start as link (link.href)}
              <li><a class="sec-page" href={link.href}><span>{link.label}</span><Icon name="chevron-right" size="m" /></a></li>
            {/each}
          </ul>
        </li>
      {:else}
      {@const first = section.pages[0]?.path ?? null}
      <li class="sec">
        <div class="sec-head">
          <Icon name={section.glyph} size="m" />
          <h2 class="sec-title">
            {#if first}<a class="sec-link" href={first}>{section.label}</a>{:else}{section.label}{/if}
          </h2>
        </div>
        <p class="sec-blurb">{section.blurb}</p>
        {#if section.pages.length > 0}
          <ul class="sec-pages">
            {#each section.pages as page (page.path)}
              <li>
                <a class="sec-page" href={page.path}><span>{page.title}</span><Icon name="chevron-right" size="m" /></a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="sec-empty">{w.empty}</p>
        {/if}
      </li>
      {/if}
    {/each}
    </ul>
    {/each}
  </div>
</section>

<style>
  /* THE LINK FOR AGENTS IS ON THE NIGHT GROUND, so it takes the night's text: the page's red is for the paper. */
  .more {
    color: var(--on-night);
  }

  /* THE SEARCH IN THE HEAD'S SLOT, under the link for agents, at a width a field reads well at. */
  .head-search {
    max-inline-size: 560px;
    margin-block-start: var(--sp-5);
  }

  .secs {
    padding-block: 56px 96px;
  }

  /* THREE COLUMNS OF CARDS AT A DESK, two between, one on a phone; Start here across the top. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 16px;
  }

  .col {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .col.top {
    grid-column: 1 / -1;
  }

  /* A CARD: flat --paper, radius 24, no edge and no shadow, as the design's plans are. */
  /* The product's section kind (`kinds/section.css`) used to reach these cards by their class names on every page, and
     this page drew with what it set: the centring, the UI face on the title and the count's weight. The kind's sheet
     now loads only where blocks are drawn, so the card says them itself. */
  .sec {
    display: grid;
    flex-wrap: wrap;
    align-items: center;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: 28px 28px 24px;
    border-block-end: 0;
    background: var(--paper);
    border-radius: 16px;
  }

  /* START HERE's three links sit side by side at a desk. */
  .start-links {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 32px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width >= 900px) {
    .start-links {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .sec-head {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
  }

  .sec-title {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    font-family: var(--font-ui);
    color: var(--ink);
    font-size: var(--t-site-21);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }

  .sec-link {
    color: inherit;
    text-decoration: none;
  }

  /* A THUMB'S TARGET WITHOUT MOVING A LINE: 10px above and below takes a 25px link past 44, and the negative margin
     gives it back, so the words sit where they did and the press lands on a 44px box. */
  @media (pointer: coarse) {
    .sec-link {
      display: inline-block;
      min-inline-size: var(--tap);
      padding-block: 10px;
      margin-block: -10px;
    }
  }

  .sec-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sec-blurb,
  .sec-empty {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .sec-empty {
    color: var(--muted);
  }

  /* THE PAGES SIT IN THE CARD AS A LIST, with a hairline between them and the tile's fill under the pointer. */
  .sec-pages {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sec-pages li + li {
    border-block-start: 1px solid var(--rule);
  }

  .sec-page {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: 10px;
    margin-inline: -10px;
    border-radius: 8px;
    color: var(--ink);
    font-size: var(--t-site-15);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .sec-page :global(svg) {
    flex: none;
    color: var(--muted);
  }

  .sec-page:hover {
    background: var(--tile);
  }

  @media (width >= 700px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1060px) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .secs {
      padding-block: 32px 64px;
    }

    .sec {
      padding: 22px 20px 18px;
    }
  }
</style>
