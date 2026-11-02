<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.

  THE NIGHT HEAD, then every page `nav.ts` knows exists, each a 44px link with its arrow in one flat tile, so it names
  a page the day its folder lands and a reader who arrived by accident is one press from somewhere real.

  FIRST THE THREE NEAREST THE ADDRESS (plan F29, as the app's not-found screen offers them): this page is one file for
  every miss, so they are found once the script runs and reads the address; without it every page is still listed.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { site } from '$lib/copy.ts';
  import Icon from '$lib/Icon.svelte';
  import { PAGES } from '$lib/nav.ts';
  import PageHead from '$lib/site/PageHead.svelte';
  import { nearestPages, type Near } from '$lib/site/nearest.ts';

  const n = site.notFound;
  let near = $state<Near[]>([]);
  $effect(() => {
    near = nearestPages(location.pathname, PAGES);
  });
</script>

<Seo title={site.meta.notFound.title} description={site.meta.notFound.description} path="/404" noindex />
<PageHead title={n.title} lead={n.lede} />

<section class="wrap pages" aria-label="The pages">
  {#if near.length > 0}
    <h2 class="say">{n.near}</h2>
    <ul class="near">
      {#each near as link (link.path)}
        <li><a href={link.path}><span>{link.label}</span><Icon name="chevron-right" size="m" /></a></li>
      {/each}
    </ul>
    <h2 class="say">{n.all}</h2>
  {/if}
  <ul>
    {#each PAGES as link}
      <li><a href={link.path}><span>{link.label}</span><Icon name="chevron-right" size="m" /></a></li>
    {/each}
  </ul>
</section>

<style>
  .pages {
    padding-block: var(--first-pad) var(--band-pad);
  }

  .say {
    margin: 0 0 12px;
    color: var(--muted);
    font-family: var(--ui);
    font-size: var(--t-label);
    font-weight: 600;
    letter-spacing: 0;
  }

  .near {
    margin-block-end: 32px;
  }

  /* ONE FLAT TILE holding the pages, two columns at a desk and one on a phone. */
  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 32px;
    max-inline-size: 820px;
    margin: 0;
    padding: 6px 24px;
    background: var(--paper);
    border-radius: 16px;
    list-style: none;
  }

  /* A HAIRLINE BETWEEN ROWS and none under the last: each row but the first draws the line above it. It was drawn under
     every link, so the tile ended on two loose lines. */
  li:nth-child(n + 3) {
    border-block-start: 1px solid var(--rule);
  }

  a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-block-size: var(--tap);
    padding-block: 2px;
    color: var(--ink);
    font-size: var(--t-text);
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) {
    a:hover span {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  @media (max-width: 640px) {
    ul {
      grid-template-columns: minmax(0, 1fr);
      padding-inline: 16px;
    }

    li:nth-child(2) {
      border-block-start: 1px solid var(--rule);
    }
  }
</style>
