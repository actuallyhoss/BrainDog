<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';

  const n = site.notFound;
</script>

<svelte:head>
  <title>{site.meta.notFound.title}</title>
  <meta name="description" content={site.meta.notFound.description} />
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="wrap head">
  <h1 class="title">{n.title}</h1>
  <p class="lede">{n.lede}</p>
  <ul class="part-links">
    {#each n.links as link}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
</section>

<style>
  .wrap {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  /* The legal page's heading and its row of links, with the page's own bottom under them. */
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding-block: clamp(56px, 7vw, 104px) var(--sp-8);
  }

  .title {
    font-size: clamp(36px, 2.4vw + 22px, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .lede {
    max-inline-size: 48ch;
    color: var(--ink2);
    font-size: clamp(17px, 0.4vw + 15px, 20px);
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
    .wrap {
      padding-inline: var(--sp-4);
    }
  }
</style>
