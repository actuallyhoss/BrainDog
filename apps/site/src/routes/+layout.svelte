<!--
  The site shell: the night header, the page, and the dark footer (the site design of 17 October).

  THE HEADER IS ON THE NIGHT GROUND AND SCROLLS AWAY WITH THE PAGE, 64px tall. Every page opens on the night ground
  too (its own head, `lib/site/PageHead.svelte`, or the home page's hero), so the band runs on from the header
  unbroken. It holds the brand, Slash, Agents, Pricing, Security and Docs (`nav.ts`), "Sign in", and "Get early
  access" in red. Signed in, the last two become "Open BrainDog" (`lib/site/Start.svelte`, `signed-in.ts`).
  At 760 and under the links go and the button stays at the right, small, with a 44px menu beside it holding the links.

  THE FOOTER IS PLAIN TEXT COLUMNS: the brand with nothing under it, Product, Who it's for and Help.

  NOTHING HERE IS NEEDED TO READ THE SITE. The nav is links, the theme follows the operating system, and every page is
  finished HTML. Scripting adds one thing: closing the phone menu after a tap, on a press of Escape or on a tap outside
  it; without scripting it is a native disclosure that opens and closes on its own 44px button, and a link inside it
  loads the next page anyway.

  `header .brand` is read by `scripts/product.mjs`, which draws the shared card from the built home page.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two (28 §4). */
  import '@braindog/skin/house.css';
  /* LOOK B, the site design's colours and faces. */
  import '@braindog/skin/look-b.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';
  /* The product's blocks, whose rows, icon wells and section heads every page draws with. Their kinds and charts are
     100 KB more that only a page drawing blocks waits on, so `lib/app/Page.svelte` and `lib/docs/Body.svelte` bring
     those. */
  import '@braindog/skin/blocks.css';
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

  /* THE HEADER'S LINKS ARE `nav.ts`'s, so each page appears the day its route does and never before. */
  const links = LIVE.filter((p) => p.header).map((p) => ({ href: p.path, label: p.label }));
  const groups = footerGroups();

  const here = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

  afterNavigate(() => {
    menuOpen = false;
  });

  /* THE CURRENT LINK'S UNDERLINE SLIDES TO THE NEXT ON A PAGE CHANGE (plan F11, as the app's lit row does with
     `litSlide`): one 2px bar under the row of links, moved and sized to the link of the page you are on over `--d-swap`
     on the out curve, and faded where no link is current. Placed still on its first draw, so a page opening does not
     slide it in; a reader who asked for less motion sees it jump. Without scripting the current link underlines itself. */
  let row: HTMLElement | undefined = $state();
  let under = $state<{ x: number; y: number; w: number } | null>(null);
  let sliding = $state(false);
  $effect(() => {
    void page.url.pathname;
    const box = row;
    if (!box) return;
    const place = () => {
      const a = box.querySelector<HTMLElement>('a[aria-current="page"]');
      if (a) under = { x: a.offsetLeft, y: a.offsetTop + a.offsetHeight / 2 + 14, w: a.offsetWidth };
      else if (under) under = { ...under, w: 0 };
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

  /* A PAGE CHANGE CROSS-FADES (`app.css`, ui pass of 1 Nov) where the browser has view transitions, and the header holds
     still. Not for a reader who asked for less motion, nor for a jump within one page. */
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

<svelte:window onclick={outside} onkeydown={escape} />

<a class="skip" href="#main">Skip to content</a>

<header class="nav night">
  <div class="wrap bar">
    <a class="brand" href="/" aria-label="{site.product} home"><Mark height={24} tone="inherit" />{site.product}</a>

    <nav class="links" aria-label="Site" bind:this={row} data-slides={under ? '' : undefined}>
      {#each links as link}
        <a href={link.href} aria-current={here(link.href) ? 'page' : undefined}>{link.label}</a>
      {/each}
      <SignIn />
      {#if under}<span class="links-under" data-moving={sliding ? '' : undefined} aria-hidden="true" style:translate="{under.x}px {under.y}px" style:inline-size="{under.w}px" style:opacity={under.w > 0 ? 1 : 0}></span>{/if}
    </nav>

    <div class="go"><Start size="md" /></div>

    <!-- THE PHONE'S HEADER IS ONE ROW: the brand, the start button and this 44px button, which holds the links. -->
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

<footer class="night site-foot">
  <div class="wrap">
    <div class="foot">
      <div>
        <a class="brand" href="/" aria-label="{site.product} home"><Mark height={24} tone="inherit" />{site.product}</a>
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
    background: var(--page);
    border-radius: 8px;
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* ── The header ─────────────────────────────────────────────────────────── */

  /* ON THE NIGHT GROUND, NOT STICKY: it scrolls away with the page, as the design draws it. */
  .nav {
    position: relative;
    z-index: var(--z-hint);
    /* HELD STILL through a page change's cross-fade (`app.css`). */
    view-transition-name: site-bar;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 28px;
    block-size: 64px;
  }

  /* THE BRAND: the mark in red and the name at 600, the footer's the same. */
  .brand {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    color: inherit;
    font: 600 20px/1 var(--head);
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .brand :global(.mark) {
    color: var(--red-fill);
  }

  .links {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-inline-start: auto;
    color: var(--on-night-2);
    font-size: var(--t-label);
  }

  .links a,
  .links :global(a) {
    color: inherit;
    text-decoration: none;
    /* 24 TALL UNDER A MOUSE (WCAG 2.5.8) and nothing moves: the air is the link's and the line does not grow. */
    padding-block: 3px;
  }

  .links a[aria-current] {
    color: var(--on-night);
  }

  @media (hover: hover) {
    .links a:hover,
    .links :global(a:hover) {
      color: var(--on-night);
    }
  }

  /* THE CURRENT LINK, UNDERLINED: by itself without scripting, by the sliding bar with it. */
  .links {
    position: relative;
  }

  .links a[aria-current] {
    text-decoration: underline 2px;
    text-underline-offset: 10px;
  }

  .links[data-slides] a[aria-current] {
    text-decoration: none;
  }

  .links-under {
    position: absolute;
    inset-block-start: 0;
    left: 0;
    block-size: 2px;
    border-radius: 1px;
    background: var(--on-night);
    pointer-events: none;
  }

  .links-under[data-moving] {
    transition:
      translate var(--d-swap) var(--ease-out),
      inline-size var(--d-swap) var(--ease-out),
      opacity var(--d-swap) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .links-under[data-moving] {
      transition: none;
    }
  }

  /* 44 tall under a thumb, on a tablet wide enough to show the links. */
  @media (pointer: coarse) {
    .links a,
    .links :global(a) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }

    .brand {
      min-block-size: var(--tap);
    }

  }

  .go {
    display: flex;
    flex: none;
  }

  @media (pointer: coarse) {
    .go :global(.btn) {
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
    border-radius: 8px;
    color: var(--on-night);
    cursor: pointer;
    list-style: none;
  }

  .menu-btn::-webkit-details-marker {
    display: none;
  }

  /* SHUT, THE PANEL IS NOT DRAWN AT ALL. A closed disclosure's content is skipped, but its links' boxes still answer a
     measurement, at their own widths and past the phone's edge; taking it out of the layout leaves nothing to reach. */
  .menu:not([open]) .menu-panel {
    display: none;
  }

  .menu[open] .menu-btn {
    background: var(--night-2);
  }

  /* UNDER THE HEADER, the column's width: one flat tile on the night ground, a 44px line per page. */
  .menu-panel {
    position: absolute;
    inset-block-start: 100%;
    inset-inline: 16px;
    display: flex;
    flex-direction: column;
    padding: 8px;
    background: var(--night-2);
    border-radius: 16px;
    /* IT DROPS IN FROM THE BUTTON (ui pass, 1 Nov): 4px and 98% to its place over the menu's step, from the button's
       corner; shutting is at once, as a disclosure's is. A fade alone under reduced motion. */
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

  .menu-panel a,
  .menu-panel :global(.menu-link) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--tap);
    padding-inline: 12px;
    border-radius: 8px;
    color: var(--on-night);
    font-size: var(--t-text);
    font-weight: 500;
    text-decoration: none;
  }

  .menu-panel a[aria-current] {
    background: var(--night-rule);
  }

  @media (hover: hover) {
    .menu-panel a:hover,
    .menu-panel :global(.menu-link:hover) {
      background: var(--night-rule);
    }
  }

  @media (max-width: 760px) {
    .bar {
      gap: 8px;
      block-size: 64px;
    }

    .links {
      display: none;
    }

    .go {
      margin-inline-start: auto;
    }

    .go :global(.btn) {
      block-size: 34px;
      padding-inline: 12px;
      font-size: var(--t-meta);
    }

    .menu {
      display: block;
    }
  }

  /* AND STILL 44 UNDER A THUMB, as every small button on the site (`app.css`): the rule above is later than the one that
     gave it 44, and a phone got a 34px start button. */
  @media (max-width: 760px) and (pointer: coarse) {
    .go :global(.btn) {
      block-size: var(--tap);
    }
  }

  /* THE NARROWEST PHONES: the brand, "Get early access" and the menu came to 340 in a 320 window, and the menu went off
     its edge. The brand's name steps down and the spaces close up, so all three stay on the one row. */
  @media (max-width: 359px) {
    .bar {
      gap: 6px;
    }

    .brand {
      gap: 6px;
      font-size: var(--t-site-17);
    }

    .go :global(.btn) {
      padding-inline: 10px;
    }
  }

  /* ── The footer ─────────────────────────────────────────────────────────── */

  /* THE FOOTER ON THE NIGHT, with the page's band air above it at a desk (64, 48 on a phone) rather than a tighter 48:
     it closes the page, so it takes room like a band does. */
  .site-foot {
    padding: clamp(48px, 2.2vw + 32px, 64px) 0 calc(32px + env(safe-area-inset-bottom, 0px));
    border-block-start: 1px solid var(--foot-rule);
    font-size: var(--t-label);
  }

  .foot {
    display: grid;
    grid-template-columns: 1.5fr repeat(3, 1fr);
    gap: 32px;
  }

  .foot h2 {
    margin: 0 0 14px;
    color: var(--on-night-2);
    font: 500 var(--t-meta) / 1 var(--ui);
  }

  .foot ul {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .foot a {
    color: inherit;
    text-decoration: none;
    padding-block: 3px;
  }

  /* 44 TALL UNDER A THUMB: each link grows to the site's tap height and the rows close up to meet, so the targets touch
     without overlapping and the words keep their places at the list's ends. */
  @media (pointer: coarse) {
    .foot ul {
      gap: 0;
      margin-block: -10px;
    }

    .foot a {
      display: inline-block;
      padding-block: 10px;
      line-height: 24px;
    }
  }

  @media (hover: hover) {
    .foot ul a:hover {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  }

  .owner {
    margin: 40px 0 0;
    padding-block-start: 20px;
    border-block-start: 1px solid var(--night-rule);
    color: var(--on-night-2);
    font-size: var(--t-meta);
  }

  @media (max-width: 1060px) {
    .foot {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .foot > :first-child {
      grid-column: 1 / -1;
    }
  }

  /* A PHONE'S FOOTER IS TWO COLUMNS: three at 390 squeezed "Teams and agencies" onto two lines. The brand takes its own
     row above them. */
  @media (max-width: 760px) {
    .foot {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 32px 16px;
    }

    .owner {
      margin-block-start: 32px;
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
