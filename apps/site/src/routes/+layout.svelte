<!--
  The site shell: the bar, the page, and the footer, in the app's own frame (the redo of 2 November).

  THE BAR IS THE APP'S BAR: `--nav` (white in light, the crimson #2E0C18 in dark) with its hairline under it, and it
  stays at the top as the app's does. It holds the mark and the name, Slash, Agents, Pricing, Security and Docs
  (`nav.ts`), "Sign in", and "Get early access" in ink: the page's own red is its main action, one red to a screen
  (Look B). Signed in, the last two become "Open BrainDog" (`lib/site/Start.svelte`, `signed-in.ts`). The place you
  are on wears the app's selected fill, `--nav-selected`, as the rail's current place does, and the fill slides to the
  next place on a page change. At 760 and under the links go into a 44px menu beside the start button.

  THE FOOTER IS THE APP'S CHROME TOO, `--nav` with its hairline over it: the brand with nothing under it, then Product,
  Who it's for and Help (`lib/site/footer.ts`).

  NOTHING HERE IS NEEDED TO READ THE SITE. The nav is links, the scheme follows the operating system or the one chosen
  in BrainDog (`/signed-in.js`), and every page is finished HTML. Scripting adds the sliding fill and closing the phone
  menu after a tap, on Escape or on a tap outside it; without scripting the menu is a native disclosure.

  `header .brand` is read by `scripts/product.mjs`, which draws the shared card from the built home page.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR: `BRAINDOG_ENV` aliases this specifier (`vite.config.ts`), so an alpha build
     resolves it to `alpha.css` and ships one palette. The same five sheets the app's root layout imports, in its order:
     the site has no palette of its own. */
  import '@braindog/skin/house.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';
  import '../app.css';

  import { afterNavigate, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { site } from '$lib/copy.ts';
  import { LIVE } from '$lib/nav.ts';
  import { footerGroups } from '$lib/site/footer.ts';
  import SignIn from '$lib/site/SignIn.svelte';
  import Start from '$lib/site/Start.svelte';

  let { children } = $props();

  let menuOpen = $state(false);
  let menu: HTMLDetailsElement | undefined = $state();

  /* THE BAR'S LINKS ARE `nav.ts`'s, so each page appears the day its route does and never before. */
  const links = LIVE.filter((p) => p.header).map((p) => ({ href: p.path, label: p.label }));
  const groups = footerGroups();

  const here = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

  afterNavigate(() => {
    menuOpen = false;
  });

  /* THE SELECTED FILL SLIDES TO THE NEXT PLACE ON A PAGE CHANGE, as the app's lit row does (`$lib/motion/lit.ts`): one
     `--nav-selected` box behind the row of links, moved and sized to the current link over `--d-swap` on the out curve,
     and gone where no link is current. Placed still on its first draw, so a page opening does not slide it in; a reader
     who asked for less motion sees it jump. Without scripting the current link wears the fill itself. */
  let row: HTMLElement | undefined = $state();
  let lit = $state<{ x: number; w: number } | null>(null);
  let sliding = $state(false);
  $effect(() => {
    void page.url.pathname;
    const box = row;
    if (!box) return;
    const place = () => {
      const a = box.querySelector<HTMLElement>('a[aria-current="page"]');
      if (a) lit = { x: a.offsetLeft, w: a.offsetWidth };
      else if (lit) lit = { ...lit, w: 0 };
    };
    place();
    const ready = requestAnimationFrame(() => (sliding = true));
    void document.fonts?.ready.then(place);
    addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(ready);
      removeEventListener('resize', place);
    };
  });

  /* A PAGE CHANGE CROSS-FADES where the browser has view transitions, and the bar holds still. Not for a reader who
     asked for less motion, nor for a jump within one page. */
  onNavigate((nav) => {
    if (typeof document.startViewTransition !== 'function') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!nav.from || !nav.to || nav.from.url.pathname === nav.to.url.pathname) return;
    return new Promise<void>((done) => {
      document.startViewTransition(async () => {
        done();
        await nav.complete.catch(() => undefined);
      });
    });
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

<svelte:head>
  <!-- A PHONE'S OWN BAR TAKES THE SITE BAR'S COLOUR, the app's `--nav` for each scheme, read from the palette this build
       ships (`vite.config.ts`), so the browser's chrome and the bar are one band, as in the app. -->
  <meta name="theme-color" content={__SITE_NAV__.light} media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content={__SITE_NAV__.dark} media="(prefers-color-scheme: dark)" />
</svelte:head>

<svelte:window onclick={outside} onkeydown={escape} />

<a class="skip" href="#main">Skip to content</a>

<header class="bar">
  <div class="wrap bar-in">
    <a class="brand" href="/" aria-label="{site.product} home"><Mark height={22} />{site.product}</a>

    <nav class="links" aria-label="Site" bind:this={row} data-slides={lit ? '' : undefined}>
      {#if lit}<span class="links-lit" data-moving={sliding ? '' : undefined} aria-hidden="true" style:translate="{lit.x}px 0" style:inline-size="{lit.w}px" style:opacity={lit.w > 0 ? 1 : 0}></span>{/if}
      {#each links as link}
        <a href={link.href} aria-current={here(link.href) ? 'page' : undefined}>{link.label}</a>
      {/each}
    </nav>

    <div class="go">
      <SignIn class="signin" />
      <Start tone="ink" />
    </div>

    <!-- THE PHONE'S BAR IS ONE ROW: the brand, the start button and this 44px button, which holds the links. -->
    <details class="menu" bind:open={menuOpen} bind:this={menu}>
      <summary class="menu-btn" aria-label={site.nav.menu}>
        <Icon name={menuOpen ? 'close' : 'menu'} size="l" />
      </summary>
      <nav class="menu-panel" aria-label="Site menu">
        {#each links as link}
          <a
            class="menu-link"
            href={link.href}
            aria-current={here(link.href) ? 'page' : undefined}
            onclick={() => (menuOpen = false)}>{link.label}<Icon name="chevron-right" size="m" /></a
          >
        {/each}
        <SignIn class="menu-link" />
      </nav>
    </details>
  </div>
</header>

<main id="main">{@render children()}</main>

<footer class="site-foot">
  <div class="wrap">
    <div class="foot">
      <div class="foot-brand">
        <a class="brand" href="/" aria-label="{site.product} home"><Mark height={22} />{site.product}</a>
      </div>
      {#each groups as group}
        <nav aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {#each group.links as link}<li><a href={link.href} rel={link.rel}>{link.label}</a></li>{/each}
          </ul>
        </nav>
      {/each}
    </div>
    <p class="owner">{site.footer.owner}</p>
  </div>
</footer>

<style>
  /* The skip link takes `--tap`, which is 44 whatever the pointer is, because its audience is not using a pointer. */
  .skip {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    position: fixed;
    inset-block-start: 8px;
    inset-inline-start: 8px;
    z-index: var(--z-hint);
    padding-inline: 16px;
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* ── The bar ─────────────────────────────────────────────────────────────── */

  /* THE APP'S BAR: `--nav` with the hairline under it, held at the top. */
  .bar {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sheet);
    background: var(--nav);
    border-block-end: 1px solid var(--rule);
    /* HELD STILL through a page change's cross-fade (`app.css`). */
    view-transition-name: site-bar;
  }

  .bar-in {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    block-size: var(--bar-h);
  }

  /* THE BRAND: the mark in the house red and the name in Lexend 600, the footer's the same. */
  .brand {
    display: flex;
    flex: none;
    align-items: center;
    gap: 9px;
    color: var(--ink);
    font: 600 19px/1 var(--font-display);
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .links {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--fs-ctl);
    font-weight: 500;
  }

  .links a {
    position: relative;
    z-index: var(--z-raise);
    display: inline-flex;
    align-items: center;
    block-size: 34px;
    padding-inline: 12px;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .links a:hover {
    background: var(--hover);
    color: var(--ink);
  }

  /* THE CURRENT PLACE: the app's selected fill, by itself without scripting and by the sliding box with it. */
  .links a[aria-current] {
    background: var(--nav-selected);
    color: var(--ink);
  }

  .links[data-slides] a[aria-current] {
    background: transparent;
  }

  .links-lit {
    position: absolute;
    inset-block-start: calc(50% - 17px);
    left: 0;
    block-size: 34px;
    border-radius: var(--r-ctl);
    background: var(--nav-selected);
    pointer-events: none;
  }

  .links-lit[data-moving] {
    transition:
      translate var(--d-swap) var(--ease-out),
      inline-size var(--d-swap) var(--ease-out),
      opacity var(--d-swap) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .links-lit[data-moving] {
      transition: none;
    }
  }

  @media (pointer: coarse) {
    .links a {
      block-size: var(--tap);
    }

    .links-lit {
      inset-block-start: calc(50% - 22px);
      block-size: var(--tap);
    }
  }

  .go {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .go :global(.signin) {
    display: inline-flex;
    align-items: center;
    block-size: 34px;
    padding-inline: 12px;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: 500;
    text-decoration: none;
  }

  .go :global(.signin:hover) {
    background: var(--hover);
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .go :global(.signin) {
      block-size: var(--tap);
    }
  }

  /* ── The phone's menu ───────────────────────────────────────────────────── */

  .menu {
    display: none;
  }

  .menu-btn {
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    border-radius: var(--r-ctl);
    color: var(--ink);
    cursor: pointer;
    list-style: none;
  }

  .menu-btn::-webkit-details-marker {
    display: none;
  }

  /* SHUT, THE PANEL IS NOT DRAWN AT ALL, so nothing in it can be reached or measured past the phone's edge. */
  .menu:not([open]) .menu-panel {
    display: none;
  }

  .menu[open] .menu-btn {
    background: var(--nav-selected);
  }

  /* UNDER THE BAR, the column's width: one flat tile with the floating edge (`--rule-strong`, the design system's one
     edge for what floats), a 44px line per page. It drops in from the button over the menu's step; shutting is at once,
     as a disclosure's is. A fade alone under reduced motion. */
  .menu-panel {
    position: absolute;
    inset-block-start: calc(100% + 8px);
    inset-inline: var(--site-gutter);
    display: flex;
    flex-direction: column;
    padding: var(--sp-2);
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    transform-origin: 100% 0;
    transition:
      opacity var(--d-menu) var(--ease-out),
      transform var(--d-menu) var(--ease-out);
  }

  @starting-style {
    .menu[open] .menu-panel {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-panel {
      transition: opacity var(--d-menu) var(--ease-out);
    }

    @starting-style {
      .menu[open] .menu-panel {
        transform: none;
      }
    }
  }

  .menu-panel a,
  .menu-panel :global(.menu-link) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--tap);
    padding-inline: 12px;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--t-site-16);
    font-weight: 500;
    text-decoration: none;
  }

  .menu-panel a :global(svg) {
    color: var(--ink-3);
  }

  .menu-panel a:hover,
  .menu-panel :global(.menu-link:hover),
  .menu-panel a[aria-current] {
    background: var(--tile-2);
  }

  @media (max-width: 760px) {
    .bar-in {
      gap: var(--sp-2);
    }

    .links,
    .go :global(.signin) {
      display: none;
    }

    .menu {
      display: block;
    }
  }

  /* THE NARROWEST PHONES: the brand, the start button and the menu stay on the one row. */
  @media (max-width: 359px) {
    .brand {
      gap: 6px;
      font-size: var(--t-site-17);
    }

    .go :global(.btn) {
      padding-inline: 10px;
    }
  }

  /* ── The footer ─────────────────────────────────────────────────────────── */

  .site-foot {
    padding: clamp(40px, 3vw + 28px, 64px) 0 calc(28px + env(safe-area-inset-bottom, 0px));
    background: var(--nav);
    border-block-start: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--t-site-15);
  }

  .foot {
    display: grid;
    grid-template-columns: 1.6fr repeat(3, 1fr);
    gap: var(--sp-6);
  }

  .foot h2 {
    margin: 0 0 12px;
    color: var(--ink-3);
    font: 500 var(--t-site-small) / 20px var(--font-ui);
  }

  .foot ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .foot ul a {
    color: var(--ink-2);
    text-decoration: none;
  }

  .foot ul a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }

  .owner {
    margin: clamp(32px, 2vw + 24px, 48px) 0 0;
    padding-block-start: 20px;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  @media (max-width: 1060px) {
    .foot {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .foot > :first-child {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px) {
    .foot {
      gap: var(--sp-5) var(--sp-3);
      font-size: var(--t-site-14);
    }
  }

  /* ON A PHONE, TWO GROUPS TO A ROW, so "Teams and agencies" keeps to one line. */
  @media (max-width: 480px) {
    .foot {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* A 44px target for each footer link under a thumb. */
  @media (pointer: coarse) {
    .foot ul {
      gap: 0;
    }

    .foot ul a {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }
  }
</style>
