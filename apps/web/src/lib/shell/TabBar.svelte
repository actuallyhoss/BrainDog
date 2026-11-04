<!--
  Below 900px the rail becomes a tab bar. Not a shrunken desktop.

  FOUR PLACES AND MENU: Today, Needs you, Projects and Money (`tabsOf`, or the four picked in Settings › Navigation),
  with the sidebar's glyphs and words, then Menu, which is the sidebar drawn as a page: every other place, the projects,
  every list and Settings. MENU IS LIT FOR EVERY PAGE THE FOUR ARE NOT, so one tab is lit on every page, and it wears
  the agents' live dot while one is at work. Search and the bell are in each page's head, never tabs.

  FLAT, AND DOCKED TO THE BOTTOM EDGE, on the nav's own surface with one hairline over it, as the top bar
  is: equal tabs, 24px glyphs over 12/500 captions, every target 44 or more. The tab you are on wears its glyph on a
  soft fill (frame B), over its word in ink; the rest are the quiet ink. The only red is the count of what waits on you, the one `Count`, cut out of its glyph.

  IT HOLDS STILL WHILE A PAGE CHANGES (motion F3): named `tabbar` for the view transition, which `app.css` does not
  animate, so the page's two pictures pass under it and its labels never blink.

  Safe-area insets are paid exactly once, on the fixed element only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { litSlide } from '../motion/lit.ts';
  import { arrive } from '$lib/motion/index.ts';
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy/frame.ts';
  import Count from '../ui/Count.svelte';
  import Icon, { type IconName } from '../ui/Icon.svelte';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';

  let {
    tabs,
    menu,
    live = false,
    nowhere = false,
  }: {
    /** The four tabs, as `tabsOf` reads them from the rail's places. */
    tabs: readonly FlatItem[];
    /** Where Menu opens: the sidebar as a page. */
    menu: string;
    /** An agent is at work now: Menu wears the live dot. */
    live?: boolean;
    /** The address names no page here (`AppFrame`'s `stray`): no tab is lit. */
    nowhere?: boolean;
  } = $props();

  const words = { menu: 'Menu', working: 'An agent is at work' } as const;

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
  const lit = $derived(nowhere ? null : (tabs.find((t) => isHere(t, path))?.key ?? null));
</script>

<nav class="tabs" aria-label="Record" style={`--tabs:${tabs.length + 1}`} {@attach litSlide('.tab[aria-current="page"] .badge-slot', { fill: 'var(--chosen)' })}>
  {#each tabs as tab (tab.key)}
    <a class="tab tap" href={at(tab.href)} aria-current={lit === tab.key ? 'page' : undefined} in:arrive>
      <span class="badge-slot">
        <Icon name={tab.icon as IconName} size="xl" />
        {#if tab.count && tab.key === 'decide'}<span class="badge"><Count n={tab.count} size="s" label={`${tab.count} ${copy.openQuestions}`} /></span>{/if}
      </span>
      <span class="tab-name">{tab.label}</span>
    </a>
  {/each}
  <a class="tab tap" href={at(menu)} aria-current={lit === null ? 'page' : undefined}>
    <span class="badge-slot">
      <Icon name="rows" size="xl" />
      {#if live}<span class="tab-live" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
    </span>
    <span class="tab-name">{words.menu}</span>
  </a>
</nav>

<style>
  /**
   * THE BAR: the window's width at the bottom edge, `--tab-h` tall over the home indicator, on the nav's surface with a
   * hairline over it. Opaque, so a row passing under it is never read through it. `--tabbar` (the bar and the indicator)
   * is what the shell and the toasts clear.
   *
   * EQUAL TABS, AND FIVE OF THEM FIT THE NARROWEST PHONE: 320 over five is 64 across, so every tab clears 44 on both axes
   * before a word is shortened.
   */
  /* THE OPS PHONE BAR (3 Nov): a floating glass capsule 12px off each side and 8px over the home indicator, the
     destinations in one capsule. `--tabbar` (style.css) is its height, the gap and the indicator, so what clears the
     bar still clears it. */
  .tabs {
    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + 8px);
    inset-inline: calc(env(safe-area-inset-left) + 12px) calc(env(safe-area-inset-right) + 12px);
    z-index: var(--z-sheet);
    display: grid;
    grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
    box-sizing: border-box;
    block-size: var(--tab-h);
    padding: 4px;
    /* NEARLY SOLID: rows pass under this bar, and their words must not show through it (the chrome film let "Due soon"
       read under "Needs you" in dark). The blur still softens what passes. */
    background: color-mix(in oklab, var(--tile) 92%, transparent);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow: var(--glass-edge), var(--elev-popover);
    border-radius: var(--r-pill);
    /* HELD STILL IN A PAGE CHANGE: the page's pictures pass under it (`app.css` gives this name no animation). */
    view-transition-name: tabbar;
    /* A HELD THUMB ON A TAB IS NOT A LINK TO PREVIEW OR WORDS TO SELECT, as an app's own tab bar is not. */
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN, and four dead targets over the keys somebody is using would sit above
     the sheet being typed into. `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  /* A 24px glyph over its caption, and a target the bar's full height. The caption is 12/500, the one step under the
     meta size, kept for captions under a glyph and the count. */
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-inline-size: 0;
    min-block-size: var(--tap);
    padding: 0 var(--sp-1);
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-2);
    font-size: calc(11px * var(--type, 1));
    font-weight: var(--fw-medium);
    line-height: calc(14 / 11);
    text-decoration: none;
  }

  /* HERE IS A SOFT FILL, as on the top bar: the word in ink a step up and the glyph on the nav's chosen fill,
     44 by 28. The fill glides from the tab you left to this one (`litSlide`, `$lib/motion/lit.ts`), under the glyphs,
     so no glyph crosses it; the words change at once. */
  .tab[aria-current='page'] {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .badge-slot {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 44px;
    block-size: 26px;
    border-radius: var(--r-pill);
  }

  .tab[aria-current='page'] .badge-slot {
    background: var(--chosen);
    color: var(--ink);
  }

  /* THE WHOLE 64 FOR THE WORD ON THE NARROWEST PHONES (skills pass follow-up, 2 Nov): with 4 of padding a side "Needs
     you" was cut to "Needs y…" at 320. The target is the tab's full box either way. */
  @media (width < 390px) {
    .tab {
      padding-inline: 0;
    }
  }

  /* AT LARGE ON THE NARROWEST PHONES the word gets the size that fits the tab: 320 over five leaves 58 for a 12.65 caption. */
  @media (width < 360px) {
    :global(html[data-text='md']) .tab {
      font-size: 11.2px;
    }
  }

  /* THE SAME AT LARGE TEXT, on any phone: "Needs you" at the larger size needs the tab's whole width at 390. */
  :global(html[data-text='md']) .tab {
    padding-inline: 0;
  }

  /* FIVE TABS ON A 320px PHONE ARE 64px EACH, so a long section name ends in an ellipsis rather than pushing its neighbours. */
  .tab-name {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A VERY SHORT WINDOW (a phone on its side, a laptop at 400% zoom, where 900 tall reads as 225): the bar kept a third of
     the screen. It goes down to its glyphs, each still a 44 tall target with its name for a screen reader. */
  @media (height < 360px) {
    :global(:root) {
      --tab-h: 48px;
    }

    .tab-name {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  /* NEEDS YOU'S COUNT ON THE CORNER OF ITS GLYPH: 4 over its top, 14 in from its start, its ring cut out of the glyph. */
  .badge {
    position: absolute;
    inset-block-start: calc(-1 * var(--sp-1));
    inset-inline-start: 24px;
    display: flex;
  }

  /* THE AGENTS' LIVE DOT ON MENU'S CORNER, where Needs you wears its count. */
  .tab-live {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-end: 8px;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--live);
    outline: 2px solid var(--tile);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* FORCED COLOURS KEEP THE BAR'S EDGE, and the tab you are on an outline of its own. */
  @media (forced-colors: active) {
    .tabs {
      border-block-start-color: CanvasText;
    }

    .tab[aria-current='page'] {
      outline: 1px solid CanvasText;
      outline-offset: -4px;
    }
  }
</style>
