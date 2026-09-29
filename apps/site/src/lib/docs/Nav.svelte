<!--
  The docs' section nav: the search, then every section with its pages, the open page marked.

  A TILE BESIDE THE PAGE: the search field, "All sections", then each section under its
  glyph and name with its pages as rows, and the page you are on filled in ink.

  TWO DRAWINGS OF ONE LIST, and only one is ever shown. At 900px and wider it is a tile beside the page that stays in
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
    <p class="nav-sec"><Icon name={section.glyph} size="m" /><span>{section.label}</span></p>
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
  .nav-phone,
  .nav-desk {
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .nav-open {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: 20px;
    color: var(--ink);
    font-size: var(--t-row);
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
    transform: rotate(180deg);
  }

  .nav-in {
    display: grid;
    gap: 2px;
    padding: 0 var(--sp-3) var(--sp-4);
  }

  .nav-desk {
    display: none;
  }

  .nav-home,
  .nav-page {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: 10px;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .nav-home:hover,
  .nav-page:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* THE OPEN PAGE IN INK, as the rail fills the place you are in: marked by more than colour. */
  .nav-page[aria-current='page'],
  .nav-page[aria-current='page']:hover {
    background: var(--ink);
    color: var(--on-ink);
    font-weight: 600;
  }

  /* A THUMB'S ROW on the phone's list, whatever the pointer says, because the list is only drawn there below 900px. */
  .nav-tap {
    min-block-size: var(--tap);
  }

  /* A tablet held wide draws the tile, and a thumb needs the same 44px row there. */
  @media (pointer: coarse) {
    .nav-home,
    .nav-page {
      min-block-size: var(--tap);
    }
  }

  .nav-sec {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-4) 0 var(--sp-1);
    padding-inline: 10px;
    color: var(--dim);
    font-size: var(--t-site-small);
    font-weight: 500;
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

    /* IN VIEW AS THE PAGE SCROLLS, under the floating bar, and scrolling by itself only when the list is taller than
       the window. */
    .nav-desk {
      position: sticky;
      inset-block-start: calc(56px + 2 * var(--inset));
      display: grid;
      gap: 2px;
      max-block-size: calc(100vh - 56px - 4 * var(--inset));
      overflow-y: auto;
      padding: var(--sp-3);
    }
  }
</style>
