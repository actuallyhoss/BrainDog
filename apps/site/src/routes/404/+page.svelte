<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.

  IT OPENS THE WAY EVERY OTHER BAND ON THIS SITE OPENS, because the one page a stranger meets by
  accident has to tell them which site they are on. Its list is every page `nav.ts` knows exists, so
  it names a page the day its folder lands.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';
  import { PAGES } from '$lib/nav.ts';

  const n = site.notFound;
</script>

<svelte:head>
  <title>{site.meta.notFound.title}</title>
  <meta name="description" content={site.meta.notFound.description} />
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="band head" data-ground="sunk">
  <div class="in">
    <h1 class="title">{n.title}</h1>
    <p class="lede">{n.lede}</p>
    <ul class="part-links">
      {#each PAGES as link}
        <li><a href={link.path}>{link.label}</a></li>
      {/each}
    </ul>
  </div>
</section>

<style>
  /* The site's band, at the legal page's air: this is one screen with a row of links on it and the
     footer under it, so it takes less air than the home page's bands. */
  .band {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .head .in {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .title {
    font-family: var(--font-ui);
    font-size: var(--t-site-display);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .lede {
    max-inline-size: 48ch;
    color: var(--ink2);
    font-size: var(--t-site-lead);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .part-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-5);
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    list-style: none;
  }

  /* 36 under a mouse and 44 under a thumb, like every other row of links on this site. */
  .part-links a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    min-inline-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .part-links a:active {
    opacity: var(--press-dim);
  }

  @media (width < 640px) {
    .band {
      padding-block: var(--sp-6) var(--sp-7);
    }
  }
</style>
