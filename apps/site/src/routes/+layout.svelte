<!--
  The site shell: a glass bar, the page, and the footer tile. Which pages the bar and the footer name is `nav.ts`'s.

  THE SHELL IS SYSTEM §10's. The bar is glass, floating one inset below the top of the window and lined up with the
  tiles under it: the mark and the name, the page links, GitHub, "Sign in" and "Start your record" as the one ink pill.
  The page is the ground with its light, and the footer is one tile, the last on every page.

  NOTHING HERE IS NEEDED TO READ THE SITE. The nav is links, the theme follows the operating system, and every page is
  finished HTML. The one thing scripting adds is closing the phone menu after a tap, on a press of Escape or on a tap
  outside it; without scripting it is a native disclosure that opens and closes on its own 44px button, and a link
  inside it loads the next page anyway.
-->
<script lang="ts">
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two (28 §4). */
  import '@braindog/skin/house.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-charts.css';
  import '../app.css';

  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { site } from '$lib/copy.ts';
  import { SIGNIN, SIGNUP, SOURCE } from '$lib/links.ts';
  import { LIVE, type Group } from '$lib/nav.ts';

  let { children } = $props();

  let menuOpen = $state(false);
  let menu: HTMLDetailsElement | undefined = $state();

  type Link = { href: string; label: string; rel?: 'external' };

  /* THE HEADER'S LINKS ARE `nav.ts`'s, so each page appears the day its route does and never before. GitHub is drawn
     from `SOURCE` at the bar's end with the code glyph, because it is not a page of this site. */
  const github: Link[] = SOURCE ? [{ href: SOURCE, label: site.nav.source }] : [];
  const links: Link[] = LIVE.filter((p) => p.header).map((p) => ({ href: p.path, label: p.label }));

  /* `rel="external"` ON EVERY LINK UNDER `/app`, because `/app` is on this site's name and is not a page of this site.
     Without it the prerender crawler follows the link and the build stops at "404 /app". */
  const signin: Link = { href: SIGNIN, label: site.nav.signin, rel: 'external' };

  /* THE FOOTER: three groups of the same pages beside the brand. GitHub sits with Build and Sign in with Product, and
     the licence is named only on /legal. */
  const group = (g: Group): Link[] => LIVE.filter((p) => p.group === g).map((p) => ({ href: p.path, label: p.label }));
  const columns: { title: string; links: Link[] }[] = [
    { title: site.footer.groups.product, links: [...group('product'), signin] },
    { title: site.footer.groups.build, links: [...group('build'), ...github] },
    { title: site.footer.groups.trust, links: group('trust') },
  ].filter((c) => c.links.length > 0);

  const here = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

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
      <Mark height={20} />
      <span class="wordmark">{site.product}</span>
    </a>

    <nav class="links" aria-label="Site">
      {#each links as link}
        <a href={link.href} aria-current={here(link.href) ? 'page' : undefined}>{link.label}</a>
      {/each}
    </nav>

    <div class="ends">
      {#each github as link}
        <a class="end gh" href={link.href} rel="external"><Icon name="code" size="m" />{link.label}</a>
      {/each}
      <a class="end signin" href={signin.href} rel="external">{signin.label}</a>
      <a class="btn btn-primary cta" href={SIGNUP} rel="external">{site.nav.start}</a>
    </div>

    <!-- THE PHONE'S BAR IS ONE ROW: the brand and this 44px button. The links, Sign in and the action live in this
         disclosure in 44px rows, and the action comes first in each page's opening tile instead. -->
    <details class="menu" bind:open={menuOpen} bind:this={menu}>
      <summary class="menu-btn" aria-label={site.nav.menu}>
        <Icon name={menuOpen ? 'close' : 'menu'} size="l" />
      </summary>
      <nav class="menu-panel" aria-label="Site">
        {#each [...links, ...github] as link}
          <a
            class="menu-link"
            href={link.href}
            rel={link.href === SOURCE ? 'external' : undefined}
            aria-current={here(link.href) ? 'page' : undefined}
            onclick={() => (menuOpen = false)}>{link.label}<Icon name="chevron-right" size="m" /></a
          >
        {/each}
        <a class="menu-link" href={signin.href} rel="external">{signin.label}<Icon name="chevron-right" size="m" /></a>
        <a class="btn btn-primary btn-lg menu-app" href={SIGNUP} rel="external">{site.nav.start}</a>
      </nav>
    </details>
  </div>
</header>

<main id="main">{@render children()}</main>

<footer class="foot">
  <div class="foot-tile">
    <div class="foot-brand">
      <a class="brand" href="/">
        <Mark height={20} />
        <span class="wordmark">{site.product}</span>
      </a>
      <p class="foot-tagline">{site.footer.tagline}</p>
    </div>

    {#each columns as column}
      <nav class="foot-col" aria-label={column.title}>
        <h2 class="foot-title">{column.title}</h2>
        {#each column.links as link}<a href={link.href} rel={link.rel}>{link.label}</a>{/each}
      </nav>
    {/each}
  </div>
</footer>

<style>
  /* The skip link takes `--tap`, which is 44 whatever the pointer is, because its audience is not using a pointer. */
  .skip {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    position: fixed;
    inset-block-start: var(--sp-2);
    inset-inline-start: var(--sp-2);
    z-index: var(--z-hint);
    padding-inline: var(--sp-4);
    background: var(--bg);
    border-radius: var(--r-pill);
    box-shadow: var(--e2);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* ── The bar ────────────────────────────────────────────────────────────── */

  /* FLOATING ONE INSET BELOW THE TOP OF THE WINDOW, in the tiles' own column, so its edges are theirs. The wrapper
     is the sticky thing; the glass is the row inside it. */
  .bar {
    position: sticky;
    inset-block-start: var(--inset);
    z-index: var(--z-hint);
    max-inline-size: calc(var(--site-max) + 2 * var(--site-gutter));
    margin: var(--inset) auto 0;
    padding-inline: var(--site-gutter);
  }

  /* GLASS, AND IT HOLDS ONLY CHROME: the frosted fill, its blur, the hairline pair and level two (SYSTEM §2, §4). */
  .bar-in {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: 56px;
    padding-inline: var(--sp-4) 10px;
    background: var(--glass);
    border-radius: var(--r-lg);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
  }

  .brand {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    text-decoration: none;
  }

  /* GEIST, AS EVERY WORD IS. The wordmark is the name set at the group step, and the mark beside it is the red. */
  .wordmark {
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .links {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .links a,
  .end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background var(--d-state) var(--ease-out),
      opacity var(--d-release) var(--ease-out);
  }

  .links a:hover,
  .end:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* THE PAGE YOU ARE ON is drawn chosen as the rail draws its place: the tile fill on the glass, in ink at 600. */
  .links a[aria-current] {
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }

  .links a:active,
  .end:active,
  .menu-link:active {
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .ends {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
    margin-inline-start: auto;
  }

  .signin {
    color: var(--ink);
  }

  .cta {
    margin-inline-start: 6px;
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
    border-radius: var(--r-pill);
    color: var(--ink);
    cursor: pointer;
    list-style: none;
  }

  .menu-btn::-webkit-details-marker {
    display: none;
  }

  .menu[open] .menu-btn {
    background: var(--hover-wash);
  }

  /* UNDER THE BAR, the bar's own width: glass-strong at level two, where legibility over the page matters (SYSTEM §6). */
  .menu-panel {
    position: absolute;
    inset-block-start: calc(100% + var(--sp-2));
    inset-inline: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2);
    background: var(--glass-strong);
    border-radius: var(--r-lg);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
  }

  /* CLOSED, THE PANEL IS NOT LAID OUT AT ALL. A closed disclosure only skips painting its content, so a measurement
     still finds the links, squeezed into the button's own box and past the edge of the screen. */
  .menu:not([open]) .menu-panel {
    display: none;
  }

  .menu-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    border-radius: var(--r-md);
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

  /* ── The footer tile ────────────────────────────────────────────────────── */

  /* The last tile on every page, one inset under the band above it and above the window's edge. */
  .foot {
    max-inline-size: calc(var(--site-max) + 2 * var(--site-gutter));
    margin: var(--inset) auto var(--inset);
    padding-inline: var(--site-gutter);
  }

  .foot-tile {
    display: grid;
    grid-template-columns: minmax(0, 6fr) repeat(3, minmax(0, 2fr));
    align-items: start;
    gap: var(--sp-5) var(--inset);
    padding: clamp(24px, 2vw + 12px, 40px);
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .foot-brand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .foot-tagline {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
  }

  .foot-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-inline-size: 0;
  }

  .foot-title {
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 20px;
  }

  /* Each row is its own target: 36 under a mouse and 44 under a thumb, never narrower than tall. */
  .foot-col a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    min-inline-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-site-small);
    text-decoration: none;
  }

  .foot-col a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .foot-col a:active {
    opacity: var(--press-dim);
  }

  /* ── Narrower than a desk ───────────────────────────────────────────────── */

  /* BELOW 1100 THE LINKS GO INTO THE MENU, and the bar keeps the brand, Sign in and the action. */
  @media (width < 1100px) {
    .links,
    .gh {
      display: none;
    }

    .menu {
      display: block;
    }
  }

  /* THE PHONE'S BAR IS THE BRAND AND THE MENU BUTTON (SITE-SHELLS.md, Phone header), each a thumb's height. */
  @media (width < 640px) {
    .bar-in {
      min-block-size: 56px;
      padding-inline: var(--sp-4) 6px;
    }

    .ends {
      display: none;
    }

    .menu {
      margin-inline-start: auto;
    }

    .foot-tile {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .foot-brand {
      grid-column: 1 / -1;
    }

    .foot-col a {
      min-block-size: var(--tap);
    }
  }

  @media (640px <= width < 1100px) {
    .menu {
      order: 3;
    }
  }

  @media (width < 360px) {
    .foot-tile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
