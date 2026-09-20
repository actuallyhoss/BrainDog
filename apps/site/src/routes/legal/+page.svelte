<!--
  Legal.

  THE LICENCE LIVES HERE AND IN THE READMES, not on the marketing pages. A licence is a disclaimer
  somebody looks up, not a selling point somebody is sold, so the pages that sell say "open source"
  and point at the code, and this page says which licence and what it does not promise.

  NO INVENTED TERMS. The Terms of Service and the Privacy policy are not written yet, and the page
  says that in one sentence rather than drawing headings that read like a policy.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';

  const l = site.legal;
</script>

<svelte:head>
  <title>{site.meta.legal.title}</title>
  <meta name="description" content={site.meta.legal.description} />
  <link rel="canonical" href="https://brain.dog/legal" />
  <meta property="og:url" content="https://brain.dog/legal" />
  <meta property="og:title" content={site.meta.legal.title} />
  <meta property="og:description" content={site.meta.legal.description} />
</svelte:head>

<section class="wrap head">
  <h1 class="title">{l.title}</h1>
</section>

<section class="wrap part" aria-labelledby="licence-title">
  <h2 class="part-title" id="licence-title">{l.licence.title}</h2>
  {#each l.licence.body as paragraph}
    <p class="part-body">{paragraph}</p>
  {/each}
  <ul class="part-links">
    {#each l.licence.links as link}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
  <p class="part-note">{l.licence.note}</p>
</section>

<section class="wrap part last" aria-labelledby="terms-title">
  <h2 class="part-title" id="terms-title">{l.terms.title}</h2>
  <p class="part-body">{l.terms.body}</p>
</section>

<style>
  .wrap {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  .head {
    padding-block: clamp(56px, 7vw, 104px) var(--sp-7);
  }

  .title {
    font-size: clamp(36px, 2.4vw + 22px, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* Each part is a hairline, a heading and its sentences, the same weight as the pricing page's
     status and its note about the free tier. */
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .part > * {
    max-inline-size: 68ch;
  }

  .part-title {
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
    max-inline-size: none;
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .part-body {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
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

  .part-note {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  /* The page's own bottom: the shell puts no margin over the footer. */
  .last {
    padding-block: var(--sp-7) var(--sp-8);
  }

  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }
  }
</style>
