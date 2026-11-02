<!--
  The docs' section nav: the search, then every section with its pages, the open page marked.

  FLAT ON THE BOARD, NO TILE, as the app's rail sits on its ground: the search field, "All sections", then each
  section's name with its pages under it, and the page you are on on the tile's fill with an ink mark at its start and
  in bold, so it is told by more than colour (red is kept for the start button).

  TWO DRAWINGS OF ONE LIST, and only one is ever shown. At 900px and wider it is a column beside the page that stays in
  view as the page scrolls. Below 900px it is a disclosure at the top of the page, closed, so the page's first words
  are near the top of a phone. A `<details>` cannot be told to stay open on a wide screen and closed on a narrow one
  without a script, and the list has to work without one, so each width has its own element and the other is not
  displayed (which also takes it out of the accessibility tree, so a reader never meets the list twice).
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import Search from './Search.svelte';
  import { docsWords } from './words.ts';
  import type { SectionCard } from './index.ts';
  import type { Entry } from './pages.ts';

  let { sections, current, index }: { sections: readonly SectionCard[]; current: string; index: readonly Entry[] } = $props();

  const w = docsWords.nav;

  const filled = $derived(sections.filter((s) => s.pages.length > 0));
</script>

{#snippet list(phone: boolean)}
  <a class="nav-home" class:nav-tap={phone} href="/docs"><Icon name="arrow-left" size="m" />{w.home}</a>
  {#each filled as section (section.id)}
    <p class="nav-sec">{section.label}</p>
    <ul class="nav-pages">
      {#each section.pages as page (page.path)}
        <li>
          <a class="nav-page" class:nav-tap={phone} href={page.path} aria-current={page.path === current ? 'page' : undefined}>{page.title}</a>
        </li>
      {/each}
    </ul>
  {/each}
{/snippet}

<details class="nav-phone">
  <summary class="nav-open"><Icon name="book" size="m" /><span>{w.open}</span><Icon name="chevron-down" size="m" /></summary>
  <nav class="nav-in" aria-label={w.label}>
    <Search {index} id="docs-search-phone" />
    {@render list(true)}
  </nav>
</details>

<nav class="nav-desk" aria-label={w.label}>
  <Search {index} id="docs-search" />
  {@render list(false)}
</nav>

<style>
  /* THE PHONE'S DISCLOSURE: one 44px line with a hairline under it, on the board like the rest. */
  .nav-phone {
    border-block-end: 1px solid var(--rule);
  }

  .nav-open {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-16);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }

  .nav-open::-webkit-details-marker {
    display: none;
  }

  .nav-open span {
    flex: 1;
  }

  .nav-phone[open] .nav-open :global(svg:last-child) {
    rotate: 180deg;
  }

  @media (prefers-reduced-motion: no-preference) {
    .nav-open :global(svg:last-child) {
      transition: rotate var(--d-state) var(--ease-out);
    }
  }

  .nav-in {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-2) var(--sp-4);
  }

  .nav-desk {
    display: none;
  }

  .nav-home,
  .nav-page {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding-inline: 10px;
    border-inline-start: 3px solid transparent;
    border-radius: 8px;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .nav-home:hover,
  .nav-page:hover {
    background: var(--tile);
    color: var(--ink);
  }

  /* THE OPEN PAGE: the tile's fill, the ink, bold, and the red mark at its start. */
  .nav-page[aria-current='page'],
  .nav-page[aria-current='page']:hover {
    background: var(--tile);
    border-inline-start-color: var(--ink);
    color: var(--ink);
    font-weight: 600;
  }

  /* A THUMB'S ROW on the phone's list, whatever the pointer says, because the list is only drawn there below 900px. */
  .nav-tap {
    min-block-size: var(--tap);
  }

  /* A tablet held wide draws the column, and a thumb needs the same 44px row there. */
  @media (pointer: coarse) {
    .nav-home,
    .nav-page {
      min-block-size: var(--tap);
    }
  }

  .nav-sec {
    margin: var(--sp-5) 0 var(--sp-1);
    padding-inline: 13px;
    color: var(--ink-3);
    font-size: var(--t-site-15);
    font-weight: 600;
  }

  .nav-pages {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width >= 900px) {
    .nav-phone {
      display: none;
    }

    /* IN VIEW AS THE PAGE SCROLLS, and scrolling by itself only when the list is taller than the window. */
    /* Under the site's bar, which stays at the top. */
    .nav-desk {
      position: sticky;
      inset-block-start: calc(var(--bar-h) + var(--sp-5));
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      max-block-size: calc(100dvh - var(--bar-h) - 2 * var(--sp-5));
      overflow-y: auto;
    }

  }

  /* The search sits clear of the list under it, and so does the room held for it before the script draws it. */
  .nav-in > :global(.search),
  .nav-desk > :global(.search),
  .nav-in > :global(.search-room),
  .nav-desk > :global(.search-room) {
    margin-block-end: var(--sp-3);
  }
</style>
