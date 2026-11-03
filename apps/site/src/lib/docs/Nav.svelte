<!--
  The docs' section nav: the search, then every section with its pages, the open page marked.

  FLAT ON THE BOARD, NO TILE (LAUNCH 103 job 7): the search field, "All sections", then each section's
  name with its pages under it, and the page you are on on the tile's fill with an ink mark at its start and in bold,
  so it is told by more than colour (the mark was red; red is the start button's alone since 1 Nov).

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
    font-size: var(--t-text);
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

  .nav-open :global(svg:last-child) {
    transition: rotate var(--d-swap) var(--ease-out);
  }

  .nav-phone[open] .nav-open :global(svg:last-child) {
    rotate: 180deg;
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-open :global(svg:last-child) {
      transition: none;
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
    padding-inline: 12px;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: var(--t-label);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) {
    .nav-home:hover,
    .nav-page:hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  /* THE OPEN PAGE: the chosen fill and the ink, as the app's sidebar marks the page you are on. */
  .nav-page[aria-current='page'] {
    background: var(--chosen);
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
    color: var(--muted);
    font-size: var(--t-label);
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
    .nav-desk {
      position: sticky;
      inset-block-start: var(--sp-5);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      max-block-size: calc(100vh - 2 * var(--sp-5));
      overflow-y: auto;
      overscroll-behavior: contain;
    }

  }

  /* The search sits clear of the list under it. */
  .nav-in > :global(.search),
  .nav-desk > :global(.search) {
    margin-block-end: var(--sp-3);
  }
</style>
