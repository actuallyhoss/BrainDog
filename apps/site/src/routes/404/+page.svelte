<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.

  IT IS ONE CALM TILE, the way the site's single-purpose pages are drawn: the heading, the one sentence, and every
  page `nav.ts` knows exists as a row with its arrow, so it names a page the day its folder lands and a reader who
  arrived by accident is one press from somewhere real.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';
  import Icon from '$lib/Icon.svelte';
  import { PAGES } from '$lib/nav.ts';

  const n = site.notFound;
</script>

<svelte:head>
  <title>{site.meta.notFound.title}</title>
  <meta name="description" content={site.meta.notFound.description} />
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="band" aria-labelledby="lost-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead lost span-8">
        <span class="well l"><Icon name="help" /></span>
        <h1 class="h2" id="lost-title">{n.title}</h1>
        <p class="lede">{n.lede}</p>
        <ul class="part-links">
          {#each PAGES as link}
            <li><a href={link.path}><span>{link.label}</span><Icon name="chevron-right" size="m" /></a></li>
          {/each}
        </ul>
      </article>
    </div>
  </div>
</section>

<style>
  /* One tile in the middle of the ground, the width of a reading column, with the pages as two columns of rows. */
  @media (width >= 900px) {
    .lost {
      grid-column: 3 / span 8;
    }
  }

  .lost > .well {
    align-self: flex-start;
  }

  .lost .lede {
    max-inline-size: 48ch;
  }

  .part-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 var(--sp-5);
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    list-style: none;
    border-block-start: 1px solid var(--line);
  }

  .part-links li {
    border-block-end: 1px solid var(--line);
  }

  /* Each row is its own target, 44 tall whatever the pointer. */
  .part-links a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
    text-decoration: none;
  }

  .part-links a:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .part-links a:active {
    opacity: var(--press-dim);
  }

  @media (width < 640px) {
    .part-links {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
