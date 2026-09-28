<!--
  The docs' section nav: the search, then every section with its pages, the open page marked.

  TWO DRAWINGS OF ONE LIST, and only one is ever shown. At 900px and wider it is a column beside the
  page that stays in view as the page scrolls. Below 900px it is a disclosure at the top of the page,
  closed, so the page's first words are near the top of a phone. A `<details>` cannot be told to stay
  open on a wide screen and closed on a narrow one without a script, and the list has to work without
  one, so each width has its own element and the other is not displayed (which also takes it out of
  the accessibility tree, so a reader never meets the list twice).
-->
<script lang="ts">
  import Search from './Search.svelte';
  import { docsWords } from './words.ts';
  import type { SectionCard } from './index.ts';
  import type { Entry } from './pages.ts';

  let { sections, current, index }: { sections: readonly SectionCard[]; current: string; index: readonly Entry[] } = $props();

  const w = docsWords.nav;

  const filled = $derived(sections.filter((s) => s.pages.length > 0));
</script>

{#snippet list(phone: boolean)}
  <a class="nav-home" class:nav-tap={phone} href="/docs">{w.home}</a>
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
  <summary class="nav-open">{w.open}</summary>
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
  .nav-phone {
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--s1);
  }

  .nav-open {
    display: flex;
    align-items: center;
    min-block-size: var(--tap);
    padding-inline: var(--sp-4);
    color: var(--ink);
    font-weight: 600;
    cursor: pointer;
  }

  .nav-in {
    display: grid;
    gap: var(--sp-1);
    padding: 0 var(--sp-4) var(--sp-4);
  }

  .nav-desk {
    display: none;
  }

  .nav-home,
  .nav-page {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-site-small);
    text-decoration: none;
  }

  .nav-home:hover,
  .nav-page:hover {
    background: var(--s2);
    color: var(--ink);
  }

  /* The open page in ink on a raised ground: marked by more than colour, as the header marks its own. */
  .nav-page[aria-current='page'] {
    background: var(--s2);
    color: var(--ink);
    font-weight: 600;
  }

  /* A THUMB'S ROW on the phone's list, whatever the pointer says, because the list is only drawn there
     below 900px. */
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
    margin-block: var(--sp-4) var(--sp-1);
    margin-inline: 0;
    padding-inline: var(--sp-2);
    color: var(--ink);
    font-size: var(--t-site-small);
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

    /* IN VIEW AS THE PAGE SCROLLS, under the site's sticky bar, and scrolling by itself only when the
       list is taller than the window. */
    .nav-desk {
      position: sticky;
      inset-block-start: calc(var(--sp-8) + var(--sp-4));
      display: grid;
      gap: var(--sp-1);
      max-block-size: calc(100vh - var(--sp-8) - var(--sp-6));
      overflow-y: auto;
      padding-block-end: var(--sp-5);
    }
  }
</style>
