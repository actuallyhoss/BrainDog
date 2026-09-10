<!--
  The site shell: a sticky bar, the page, a fat footer.

  NO JAVASCRIPT IS REQUIRED TO READ THIS SITE. The nav is links, the theme follows the operating
  system, and there is nothing to hydrate — the only interactive thing on any page is the anchor you
  click. That is not a performance stunt; it is what a prerendered document IS, and every script a
  marketing page adds is a script between a stranger and the first sentence.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two — 28 §4. */
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
      <!-- `Design` AND `Source` ARE ABSENT WHILE THE REPOSITORY IS PRIVATE. They were two of the
           four links in the header of every page and both 404. A link in a site's own navigation
           that answers 404 is the loudest thing a site can say about how carefully it was made,
           and this one appeared three times, on three pages, above a paragraph arguing that its
           claims are checkable. They come back with the repository, from one constant. -->
      {#if DOCS}<a href={DOCS}>{site.nav.docs}</a>{/if}
      {#if SOURCE}<a href={SOURCE}>{site.nav.source}</a>{/if}
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
  /* 127x41 — four pixels under, on every page, on the control a keyboard user reaches first. The web
     app had the identical defect in the identical rule; both take `--tap`, which is 44 whatever the
     pointer is, because the audience for this one is not using a pointer at all. */
  .skip {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
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

  /**
   * IT WRAPPED NOWHERE AND RAN 472px WIDE INSIDE A 320px SCREEN.
   *
   * A brand, four links and a call-to-action in one non-wrapping row, so the whole document scrolled
   * sideways on every page of the marketing site and the *Open the app* button — the one control the
   * site exists to be pressed — sat entirely off the right edge. Measured on all three pages at 320
   * and 360.
   *
   * It survived because no layout gate had ever loaded this app: `a11y` serves it and runs
   * `wcag21aa`, which has no overflow rule and whose `target-size` is `wcag22aa`. The shop window
   * was the least-measured surface in the repository.
   *
   * `flex-wrap` and a smaller gap below the fold of a phone. The row still reads left to right; it
   * just takes two lines when two lines is what fits.
   */
  .bar-in,
  .foot-in {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3) var(--sp-5);
    max-inline-size: 1140px;
    margin-inline: auto;
    padding: var(--sp-3) var(--sp-5);
  }

  /* 129x29, on the first target anybody who is not a user ever presses. `13 §7`: 44 on both axes
     under a thumb. */
  .brand {
    display: flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
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

  /* 71x35 under a thumb. The padding grew the box and not the target. */
  .links a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
    padding: 6px var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      opacity var(--d-release) var(--ease-out);
  }

  .links a:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .links a:active {
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .links a[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }

  /* The one control the site exists to be pressed, and it answered a finger with nothing. The
     press is a scale AND an opacity for the reason `tokens.css` gives beside those two values:
     under `prefers-reduced-motion` a11y collapses every duration to 1ms, so a press written as a
     transform alone is not damped for those readers, it is absent. */
  .cta {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: var(--accent);
    border: 1px solid var(--accent-edge);
    border-radius: var(--r-md);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
    font-size: var(--t-ui);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition:
      transform var(--d-release) var(--ease-out),
      opacity var(--d-release) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  /* 127x36 MEASURED ON A PHONE, on the one control this site exists to be pressed. `--ctl-h` is
     36 here because the site does not carry the app's coarse-pointer density, and every other target
     on the page keeps 44. `13 §7` is 44 on both axes under a thumb. */
  @media (pointer: coarse) {
    .cta {
      min-block-size: var(--tap, 44px);
    }
  }

  .cta:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .cta:active {
    background: var(--accent-press);
    transform: scale(var(--press-scale));
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  /**
   * NO MARGIN OVER THE FOOTER ANY MORE, and each page pays for its own bottom instead.
   *
   * `--sp-9` here put 96 pixels of `--bg` between the last section and the footer, so on the home
   * page the closing band, an empty stripe and then the footer read as the page ending three
   * times. A margin on a shared shell cannot know whether the thing above it is a tinted call to
   * action or a paragraph, and only the page knows that.
   */
  .foot {
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

  /* NO GAP BETWEEN THE LINKS, and it is not a density change: each one is already a 44px box, so
     an 8px gap on top of that made a 52px rhythm for 20px of text and a column of three links
     read as three unrelated things. The targets are untouched. */
  .foot-col {
    display: flex;
    flex-direction: column;
    min-inline-size: 12ch;
  }

  .foot-title {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  /* 108x20 in a column with `--sp-2` between them — three links in a 60px band, which is the
     classic wrong-link tap. The column keeps its rhythm; each row becomes its own target. */
  .foot-col a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
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

  @media (width < 760px) {
    /* THE BAR IS ONE LINE ON A PHONE, and the two links this rule drops are the two that are not
       drawn at all today: `Design` and `Source` are absent while the repository is private, and
       the footer column that used to hold them is the Licence column now, so `.links` holds
       exactly two anchors and this rule matches nothing. It said they were one tap away in the
       footer, which was a present-tense claim about a column that no longer exists. It is here for
       the day the repository opens and the two come back. */
    .links a:nth-child(n + 3) {
      display: none;
    }

    .bar-in,
    .foot-in {
      padding-inline: var(--sp-4);
      gap: var(--sp-3);
    }

    /**
     * AND THE ROW IT WRAPS TO WAS THE WRONG ONE.
     *
     * Wrapping fixed the 472px overflow and left the order alone, so a phone got the brand and two
     * text links on the first line and *Open the app* alone on the second, hard against the left
     * edge. The one control this site exists to be pressed was the widest thing on the header, in
     * the corner a thumb reaches last, under two links to pages nobody came for.
     *
     * Brand left, the call to action right, the links on their own line beneath. Same two rows,
     * same height, and the primary action is where every phone in the world puts one.
     *
     * `order` and not a second markup, because the reading order is right already: a screen reader
     * and a keyboard still meet the brand, then the navigation, then the action, which is the
     * order the source has and the order `bar-in` gives every wider screen.
     */
    /**
     * SCOPED TO THE BAR, AND IT WAS NOT.
     *
     * `.brand` matches the header's brand link and the FOOTER'S, and `.foot-brand` is a flex
     * column, so `order: 1` moved the logo below the tagline and the licence line on every page
     * of the site under 760px. Measured on the built page at 390: the tagline sat at 10310, the
     * licence at 10338 and the wordmark at 10364, which is the footer introducing the company
     * after quoting its slogan. The header's own fix is right and stays; it just has to say
     * which brand it means.
     */
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
      /* The first link's own padding, pulled back so its text starts on the brand's left edge
         rather than one step in from it. It also cancels the `auto` that pushes the links right
         on every wider screen. */
      margin-inline-start: calc(var(--sp-3) * -1);
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
