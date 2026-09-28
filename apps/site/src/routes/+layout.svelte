<!--
  The site shell: a bar, the page, a footer. Which pages the bar and the footer name is `nav.ts`'s.

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
  import { site } from '$lib/copy.ts';
  import { SIGNIN, SIGNUP, SOURCE } from '$lib/links.ts';
  import { LIVE, type Group } from '$lib/nav.ts';

  let { children } = $props();

  let menuOpen = $state(false);
  let menu: HTMLDetailsElement | undefined = $state();

  type Link = { href: string; label: string; rel?: 'external' };

  /* THE HEADER'S LINKS ARE `nav.ts`'s, so each page appears the day its route does and never
     before. `GitHub` is drawn from `SOURCE`, which is published ahead of the repository going
     public, on the owner's word. */
  const github: Link[] = SOURCE ? [{ href: SOURCE, label: site.nav.source }] : [];
  const links: Link[] = [...LIVE.filter((p) => p.header).map((p) => ({ href: p.path, label: p.label })), ...github];

  /* `rel="external"` ON EVERY LINK UNDER `/app`, because `/app` is on this site's name and is not a
     page of this site. Without it the prerender crawler follows the link and the build stops at
     "404 /app". SvelteKit's crawler skips a link marked `external` and its router leaves the click
     to the browser, so it is an ordinary page load. */
  const signin: Link = { href: SIGNIN, label: site.nav.signin, rel: 'external' };

  /* THE FOOTER: three groups of the same pages beside the brand. GitHub sits with Build and Sign in
     with Product, and the licence is named only on /legal. */
  const group = (g: Group): Link[] => LIVE.filter((p) => p.group === g).map((p) => ({ href: p.path, label: p.label }));
  const columns: { title: string; links: Link[] }[] = [
    { title: site.footer.groups.product, links: [...group('product'), signin] },
    { title: site.footer.groups.build, links: [...group('build'), ...github] },
    { title: site.footer.groups.trust, links: group('trust') },
  ].filter((c) => c.links.length > 0);

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

    <!-- SIGN IN QUIET AND START FILLED: the site describes the finished product (`loop/DIRECTION.md`
         §33), where a stranger's one action is to start a record and a customer's is to sign in. -->
    <a class="signin" href={signin.href} rel="external">{signin.label}</a>
    <a class="btn btn-sm btn-primary cta" href={SIGNUP} rel="external">{site.nav.start}</a>

    <!-- THE PHONE'S BAR IS ONE ROW: the brand, the action and this button. The links and Sign in
         live in this disclosure in 44px rows, so the page's first word sits near the top. -->
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
        <a class="menu-link" href={signin.href} rel="external">{signin.label}<Icon name="arrow" size="s" /></a>
        <a class="btn btn-primary menu-app" href={SIGNUP} rel="external">{site.nav.start}</a>
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

    {#each columns as column}
      <nav class="foot-col" aria-label={column.title}>
        <h2 class="foot-title">{column.title}</h2>
        {#each column.links as link}<a href={link.href} rel={link.rel}>{link.label}</a>{/each}
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

  /* Poppins here and nowhere else on the site: the wordmark is the one place the display face is the brand. */
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

  .signin {
    display: inline-flex;
    flex: none;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
  }

  .signin:hover {
    color: var(--ink);
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

  /* The brand and its slogan take the widest column, and the three groups share the rest. */
  .foot-in {
    display: grid;
    grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-7);
    padding-block: var(--sp-7) var(--sp-8);
  }

  .foot-brand {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 34ch;
  }

  .foot-tagline {
    color: var(--dim);
    font-size: var(--t-site-small);
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

    .links,
    .signin {
      display: none;
    }

    .cta {
      margin-inline-start: auto;
    }

    .menu {
      display: block;
    }

    /* Two columns of groups under the brand, each row a thumb's height. */
    .foot-in {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-6) var(--sp-5);
    }

    .foot-brand {
      grid-column: 1 / -1;
    }

    .foot-col a {
      min-block-size: var(--tap);
    }
  }

  @media (width < 370px) {
    .cta {
      display: none;
    }

    .foot-in {
      grid-template-columns: minmax(0, 1fr);
    }

    .menu {
      margin-inline-start: auto;
    }
  }
</style>
