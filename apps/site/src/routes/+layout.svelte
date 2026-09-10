<!--
  The site shell: a bar, the page, a footer.

  NO JAVASCRIPT IS REQUIRED TO READ THIS SITE. The nav is links, the theme follows the operating
  system, and there is nothing to hydrate: the only interactive thing on any page is the anchor you
  click. That is not a performance stunt; it is what a prerendered document IS, and every script a
  marketing page adds is a script between a stranger and the first sentence.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two (28 §4). */
  import '@braindog/skin/house.css';
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
      <!-- `Design` AND `Source` ARE ABSENT WHILE THE REPOSITORY IS PRIVATE. A link in a site's own
           navigation that answers 404 is the loudest thing a site can say about how carefully it
           was made. They come back with the repository, from one constant. -->
      {#if DOCS}<a href={DOCS}>{site.nav.docs}</a>{/if}
      {#if SOURCE}<a href={SOURCE}>{site.nav.source}</a>{/if}
    </nav>

    <!-- AN OUTLINE PILL AND NOT A FILLED ONE. Every page has its own filled primary (the hero, the
         hosted plan, the changelog's status) and a filled button up here made two answers to "what
         do I do" in the first screen of each. This one is the way in from anywhere, and it stays
         visible and one tap away without competing with the page it sits over. -->
    <a class="btn btn-sm cta" href={APP}>{site.nav.open}</a>
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
  /* The skip link takes `--tap`, which is 44 whatever the pointer is, because its audience is not
     using a pointer at all. */
  .skip {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
    position: fixed;
    inset-block-start: var(--sp-2);
    inset-inline-start: var(--sp-2);
    z-index: var(--z-hint);
    padding-block: var(--sp-2);
    padding-inline: var(--sp-4);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* Translucent and blurred, and this is the ONE place in the product that gets to be. The app
     refuses it because translucency behind a column of small tabular digits is a measurable
     legibility cost; a marketing page has no such column, and a bar you can see the page moving
     under is the cheapest way to say the page is long. */
  .bar {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-hint);
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    backdrop-filter: blur(14px);
    border-block-end: 1px solid var(--line);
  }

  /* `flex-wrap`, because a brand, links and an action in one non-wrapping row once ran 472px wide
     inside a 320px screen and pushed the whole document sideways. */
  .bar-in,
  .foot-in {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    max-inline-size: 1140px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .bar-in {
    gap: var(--sp-2) var(--sp-4);
    padding-block: 10px;
  }

  /* `--ctl-h` is 36 on a fine pointer and 44 under a thumb, which is `13 §7`'s rule for every
     target in the bar: as small as a mouse allows, as large as a finger needs. */
  .brand {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
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
    gap: 2px;
    margin-inline-start: auto;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      opacity var(--d-release) var(--ease-out);
  }

  .links a:hover,
  .links a[aria-current] {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .links a:active {
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  /**
   * NO MARGIN OVER THE FOOTER, and each page pays for its own bottom instead. A margin on a shared
   * shell cannot know whether the thing above it is a card or a paragraph, and only the page knows
   * that. The same ground as the page, and one hairline.
   */
  .foot {
    border-block-start: 1px solid var(--line);
  }

  .foot-in {
    align-items: flex-start;
    gap: var(--sp-7);
    padding-block: var(--sp-7) var(--sp-8);
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
    min-inline-size: 12ch;
  }

  /* A sentence-case heading in the ink, not a tracked uppercase label in the dim. */
  .foot-title {
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    letter-spacing: 0;
  }

  /* Each row is its own target: 36 under a mouse and 44 under a thumb, and never narrower than it
     is tall. Three links in a 60px band was the classic wrong-link tap. */
  .foot-col a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    min-inline-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .foot-col a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .foot-col a:active {
    opacity: var(--press-dim);
  }

  /* THE TWO LINKS THIS DROPS ARE NOT DRAWN TODAY. `Design` and `Source` are absent while the
     repository is private, so `.links` holds exactly two anchors and this matches nothing. It is
     here for the day the repository opens and the bar has four links to fit. */
  @media (width < 760px) {
    .links a:nth-child(n + 3) {
      display: none;
    }
  }

  /**
   * THE PHONE: TWO ROWS, AND THEY SCROLL AWAY.
   *
   * A brand, two links and an action need about 450px in one row and a phone has 320 to 430, so
   * the bar is two rows here: the brand on the left and the action on the right, where every phone
   * puts one, and the links on their own line beneath. `order` rather than a second markup, so a
   * screen reader and a keyboard still meet brand, navigation, action in that order.
   *
   * NOT STICKY ON A PHONE. Two rows pinned is over a hundred pixels, an eighth of the screen spent
   * for the whole scroll on a bar the reader needs once. On a phone the page's own actions are
   * full-width pills a thumb reaches anyway.
   */
  @media (width < 640px) {
    .bar {
      position: static;
    }

    .bar-in,
    .foot-in {
      padding-inline: var(--sp-4);
    }

    /* `> .brand`, because the footer's brand is a `.brand` too and moving it would introduce the
       company after quoting its slogan. */
    .bar-in > .brand {
      order: 1;
    }

    .cta {
      order: 2;
      margin-inline-start: auto;
    }

    .links {
      order: 3;
      flex-basis: 100%;
      /* The first link's own padding, pulled back so its text starts on the brand's left edge. It
         also cancels the `auto` that pushes the links right on every wider screen. */
      margin-inline-start: calc(var(--sp-3) * -1);
    }

    .foot-in {
      gap: var(--sp-6) var(--sp-7);
    }

    .foot-brand {
      flex-basis: 100%;
    }
  }
</style>
