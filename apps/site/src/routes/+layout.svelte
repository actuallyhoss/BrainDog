<!--
  The site shell: a sticky bar, the page, a fat footer.

  NO JAVASCRIPT IS REQUIRED TO READ THIS SITE. The nav is links, the theme follows the operating
  system, and there is nothing to hydrate — the only interactive thing on any page is the anchor you
  click. That is not a performance stunt; it is what a prerendered document IS, and every script a
  marketing page adds is a script between a stranger and the first sentence.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';
  import '../app.css';

  import { page } from '$app/state';
  import Mark from '$lib/Mark.svelte';
  import { APP, DOCS, SOURCE, site } from '$lib/copy.ts';

  let { children } = $props();

  const here = (href: string) => page.url.pathname === href;
</script>

<a class="skip" href="#main">Skip to content</a>

<header class="bar">
  <div class="bar-in">
    <a class="brand" href="/">
      <Mark height={26} />
      <span class="wordmark">{site.product}</span>
    </a>

    <nav class="links" aria-label="Site">
      <a href="/pricing" aria-current={here('/pricing') ? 'page' : undefined}>{site.nav.pricing}</a>
      <a href="/changelog" aria-current={here('/changelog') ? 'page' : undefined}>{site.nav.changelog}</a>
      <a href={DOCS}>{site.nav.docs}</a>
      <a href={SOURCE}>{site.nav.source}</a>
    </nav>

    <a class="cta" href={APP}>{site.nav.open}</a>
  </div>
</header>

<main id="main">{@render children()}</main>

<footer class="foot">
  <div class="foot-in">
    <div class="foot-brand">
      <a class="brand" href="/">
        <Mark height={22} />
        <span class="wordmark">{site.product}</span>
      </a>
      <p class="foot-tagline">{site.footer.tagline}</p>
      <p class="foot-licence">{site.footer.licence}</p>
    </div>

    {#each site.footer.columns as column}
      <nav class="foot-col" aria-label={column.title}>
        <h2 class="foot-title">{column.title}</h2>
        {#each column.links as link}<a href={link.href}>{link.label}</a>{/each}
      </nav>
    {/each}
  </div>
</footer>

<style>
  .skip {
    position: fixed;
    inset-block-start: var(--sp-2);
    inset-inline-start: var(--sp-2);
    z-index: var(--z-hint);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* Translucent and blurred, and this is the ONE place in the product that gets to be. The app
     refuses it because translucency behind a column of small tabular digits is a measurable
     legibility cost with no information gain; a marketing page has no such column, and a bar you
     can see the page moving under is the cheapest way to say the page is long. */
  .bar {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-hint);
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: blur(14px);
    border-block-end: 1px solid var(--line);
  }

  .bar-in,
  .foot-in {
    display: flex;
    align-items: center;
    gap: var(--sp-5);
    max-inline-size: 1140px;
    margin-inline: auto;
    padding: var(--sp-3) var(--sp-5);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .links {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .links a {
    padding: 6px var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .links a:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .links a[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 72%, var(--sunk));
    border-radius: var(--r-md);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
    font-size: var(--t-ui);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .cta:hover {
    background: color-mix(in srgb, var(--accent) 90%, var(--sunk));
  }

  .foot {
    margin-block-start: var(--sp-9);
    background: var(--sunk);
    border-block-start: 1px solid var(--line);
  }

  .foot-in {
    align-items: flex-start;
    gap: var(--sp-8);
    padding-block: var(--sp-7);
  }

  .foot-brand {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 34ch;
  }

  .foot-tagline {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .foot-licence {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .foot-col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 12ch;
  }

  .foot-title {
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .foot-col a {
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .foot-col a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  @media (width < 760px) {
    /* The two outbound links go first: on a phone the bar has room for the two destinations
       somebody arrived intending to reach, and `Design` and `Source` are one tap away in the
       footer of every page. */
    .links a:nth-child(n + 3) {
      display: none;
    }

    .bar-in,
    .foot-in {
      padding-inline: var(--sp-4);
      gap: var(--sp-3);
    }

    .foot-in {
      flex-wrap: wrap;
      gap: var(--sp-6);
    }

    .foot-brand {
      flex-basis: 100%;
    }
  }
</style>
