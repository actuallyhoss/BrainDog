<!--
  Not found.

  PRERENDERED AS `404.html`, which `wrangler.jsonc` names with `not_found_handling: "404-page"`, so
  a path the build has no file for answers a 404 status with this page in the site's own shell,
  rather than a blank white page. It is not in the sitemap and asks not to be indexed.

  IT OPENS THE WAY EVERY OTHER BAND ON THIS SITE OPENS, and the number in the mark is the status
  code. The redesign left this page on the old document layout on purpose, and the reason given
  was that it is a signpost rather than a pitch. That is still true of the WORDS, and they have
  not changed: one sentence and the four addresses the site has. What was wrong was that the one
  page a stranger meets by accident was the one page that did not look like the site, at the
  moment they most need telling which site they are on.
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

<section class="band head" data-ground="sunk">
  <div class="in">
    <h1 class="title">{n.title}</h1>
    <p class="lede">{n.lede}</p>
    <ul class="part-links">
      {#each n.links as link}
        <li><a href={link.href}>{link.label}</a></li>
      {/each}
    </ul>
  </div>
</section>

<style>
  /* The site's band, at the legal page's air: this is one screen with four links on it and the
     footer under it, so it takes the same 128px each side rather than the home page's 192. */
  .band {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .head .in {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .title {
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
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
    .band {
      padding-block: var(--sp-6) var(--sp-7);
    }
  }
</style>
