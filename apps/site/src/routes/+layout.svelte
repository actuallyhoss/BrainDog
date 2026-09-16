<!--
  The site shell: a bar, the page, a footer.

  NOTHING HERE IS NEEDED TO READ THE SITE. The nav is links, the theme follows the operating system,
  and every page is finished HTML. The one thing scripting adds is closing the phone menu after a
  tap, on a press of Escape or on a tap outside it; without scripting it is a native disclosure
  that opens and closes on its own button, and a link inside it loads the next page anyway.
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

  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { APP, DOCS, SOURCE, site } from '$lib/copy.ts';

  let { children } = $props();

  let menuOpen = $state(false);
  let menu: HTMLDetailsElement | undefined = $state();

  /* `Design` IS ABSENT UNTIL `DOCS` HAS AN ADDRESS. `GitHub` is drawn from `SOURCE`, which is
     published ahead of the repository going public, on the owner's word (see `copy.ts`). */
  const links: { href: string; label: string }[] = [
    { href: '/pricing', label: site.nav.pricing },
    { href: '/changelog', label: site.nav.changelog },
    ...(DOCS ? [{ href: DOCS, label: site.nav.docs }] : []),
    ...(SOURCE ? [{ href: SOURCE, label: site.nav.source }] : []),
  ];

  const here = (href: string) => page.url.pathname === href;

  afterNavigate(() => {
    menuOpen = false;
  });

  const outside = (event: MouseEvent) => {
    if (menuOpen && menu && event.target instanceof Node && !menu.contains(event.target)) menuOpen = false;
  };

  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !menuOpen) return;
    menuOpen = false;
    menu?.querySelector('summary')?.focus();
  };
</script>

<svelte:window onclick={outside} onkeydown={escape} />

<a class="skip" href="#main">Skip to content</a>

<header class="bar">
  <div class="bar-in">
    <a class="brand" href="/">
      <Mark height={22} />
      <span class="wordmark">{site.product}</span>
    </a>

    <nav class="links" aria-label="Site">
      {#each links as link}
        <a href={link.href} aria-current={here(link.href) ? 'page' : undefined}>{link.label}</a>
      {/each}
    </nav>

    <!-- A QUIET PILL AND NOT A FILLED ONE. Every page has its own filled primary (the hero, the
         hosted plan, the changelog's status), and a filled button up here made two answers to
         "what do I do" in the first screen of each. -->
    <a class="btn btn-sm cta" href={APP}>{site.nav.open}</a>

    <!-- THE PHONE'S BAR IS ONE ROW. It was two: the brand and the action, then the links on a line
         of their own, over a hundred pixels before the first word of the page. The links live in
         this disclosure under a thumb-sized button instead, and the action stays in the bar. -->
    <details class="menu" bind:open={menuOpen} bind:this={menu}>
      <summary class="menu-btn" aria-label={site.nav.menu}>
        <Icon name={menuOpen ? 'close' : 'rows'} />
      </summary>
      <nav class="menu-panel" aria-label="Site">
        {#each links as link}
          <a
            class="menu-link"
            href={link.href}
            aria-current={here(link.href) ? 'page' : undefined}
            onclick={() => (menuOpen = false)}>{link.label}<Icon name="arrow" size="s" /></a
          >
        {/each}
        <a class="btn menu-app" href={APP}>{site.nav.open}</a>
      </nav>
    </details>
  </div>
</header>

<main id="main">{@render children()}</main>

<footer class="foot">
  <div class="foot-in">
    <div class="foot-brand">
      <a class="brand" href="/">
        <Mark height={20} />
        <span class="wordmark">{site.product}</span>
      </a>
      <p class="foot-tagline">{site.footer.tagline}</p>
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
    border-radius: var(--r-sm);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* Solid, with a hairline under it. It was translucent and blurred, and glass is one of the
     surfaces the redesign retired: the page under the bar is words, and words behind frosted words
     are noise. */
  .bar {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-hint);
    background: var(--bg);
    border-block-end: 1px solid var(--line);
  }

  .bar-in,
  .foot-in {
    max-inline-size: var(--site-max);
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  .bar-in {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    padding-block: 8px;
  }

  /* `--ctl-h` is 36 on a fine pointer and 44 under a thumb: as small as a mouse allows, as large as
     a finger needs. */
  .brand {
    display: flex;
    flex: none;
    align-items: center;
    min-block-size: var(--ctl-h);
    gap: 10px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.02em;
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
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      opacity var(--d-release) var(--ease-out);
  }

  .links a:hover,
  .links a[aria-current] {
    color: var(--ink);
  }

  .links a:active,
  .menu-link:active {
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .cta {
    flex: none;
  }

  .menu {
    display: none;
  }

  .menu-btn {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    cursor: pointer;
    list-style: none;
  }

  .menu-btn::-webkit-details-marker {
    display: none;
  }

  .menu[open] .menu-btn {
    background: var(--s2);
    border-color: var(--edge);
  }

  /* Under the bar, the width of the screen less its gutters, and the bar is what positions it. */
  .menu-panel {
    position: absolute;
    inset-block-start: calc(100% + var(--sp-2));
    inset-inline: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }

  /* CLOSED, THE PANEL IS NOT LAID OUT AT ALL. A closed disclosure only skips painting its content,
     so a measurement still finds the links, squeezed into the button's own box and past the edge
     of the screen. */
  .menu:not([open]) .menu-panel {
    display: none;
  }

  .menu-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
    text-decoration: none;
  }

  .menu-link:hover,
  .menu-link[aria-current] {
    background: var(--hover-wash);
  }

  .menu-app {
    margin-block-start: var(--sp-2);
  }

  /* No margin over the footer: each page pays for its own bottom, because only the page knows
     whether the thing above it is a card or a paragraph. */
  .foot {
    border-block-start: 1px solid var(--line);
  }

  .foot-in {
    display: flex;
    flex-wrap: wrap;
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

  .foot-col {
    display: flex;
    flex-direction: column;
    min-inline-size: 12ch;
  }

  .foot-title {
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    letter-spacing: 0;
  }

  /* Each row is its own target: 36 under a mouse and 44 under a thumb, never narrower than tall. */
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

  /**
   * THE PHONE: ONE ROW. The brand, the app pill and the menu button, and nothing wraps. Under 370px
   * the pill steps into the menu too, because a brand, a pill and a button need about 345px and the
   * narrowest screens this is measured at are 320 and 360.
   */
  @media (width < 640px) {
    .bar-in,
    .foot-in {
      padding-inline: var(--sp-4);
    }

    .bar-in {
      gap: var(--sp-2);
    }

    .links {
      display: none;
    }

    .cta {
      margin-inline-start: auto;
    }

    .menu {
      display: block;
    }

    .foot-in {
      gap: var(--sp-6) var(--sp-7);
    }

    .foot-brand {
      flex-basis: 100%;
    }
  }

  @media (width < 370px) {
    .cta {
      display: none;
    }

    .menu {
      margin-inline-start: auto;
    }
  }
</style>
