<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.

  THE NIGHT HEAD, then every page `nav.ts` knows exists, each a 44px link with its arrow in one flat tile, so it names
  a page the day its folder lands and a reader who arrived by accident is one press from somewhere real.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { site } from '$lib/copy.ts';
  import Icon from '$lib/Icon.svelte';
  import { PAGES } from '$lib/nav.ts';
  import PageHead from '$lib/site/PageHead.svelte';

  const n = site.notFound;
</script>

<Seo title={site.meta.notFound.title} description={site.meta.notFound.description} path="/404" noindex />
<PageHead title={n.title} lead={n.lede} />

<section class="wrap pages" aria-label="The pages">
  <ul>
    {#each PAGES as link}
      <li><a href={link.path}><span>{link.label}</span><Icon name="chevron-right" size="m" /></a></li>
    {/each}
  </ul>
</section>

<style>
  .pages {
    padding-block: 56px 96px;
  }

  /* ONE FLAT TILE holding the pages, two columns at a desk and one on a phone. */
  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 32px;
    max-inline-size: 820px;
    margin: 0;
    padding: 12px 24px;
    background: var(--paper);
    border-radius: 16px;
    list-style: none;
  }

  li {
    border-block-end: 1px solid var(--rule);
  }

  a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-16);
    font-weight: 500;
    text-decoration: none;
  }

  a:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 640px) {
    ul {
      grid-template-columns: minmax(0, 1fr);
      padding-inline: 16px;
    }
  }
</style>
