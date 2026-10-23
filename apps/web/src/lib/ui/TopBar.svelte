<!--
  The top bar of 19 October, under frame B (23 October): the shell's navigation from 900px up, unless somebody kept the
  side rail of 20 October.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE with one hairline under it, in light and in dark (frame B, U8: the
  dark bar is the nav's indigo and keeps its edge). At the start the sidebar's own button, then the mark and "BrainDog"
  at every width, never the record's name (U8). Then the five places as 32px rectangles (radius 8, 14/500): Today,
  Needs you with its count, Projects, Money, Agents (`tabsOf`, the phone bar's five), and a "⋯" named More that opens
  the sheet. At the right, "Ask or change anything" with its "/" key at rest, the one way to ask; who is working with a
  live dot; the bell, quiet, a dot and no count, opening Arrivals; and the person's face, whose menu holds the record's
  name and its switcher first, then Settings and Sign out.

  WHERE YOU ARE IS A SOFT FILL with the words in ink at 600 (U-A12, U-A18), never the ink block, AND IT MOVES ON THE
  PRESS (F10): a place pressed wears it from the pointer's down, before the page change starts, and the fill snaps
  rather than fading, so two places are never half chosen and a label never crosses its own fill.

  THE LIVE DOT HOLDS STILL (frame F22): it pulses once when the working count changes, and not at all under reduced
  motion. THE FOCUS RING IS NEVER CLIPPED: the places' strip clips sideways only.

  NARROWER THAN 1,100 THE PLACES ARE THEIR GLYPHS, each named for a screen reader and on hover; narrower than 1,280 the
  working chip is its marks and dot. BELOW 900px THIS IS NOT DRAWN AT ALL: the tab bar is the navigation there. ON
  `/search` THE ASK FIELD IS NOT DRAWN: the page's own field is the search.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { BASE, at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import type { Working } from '../record/boot-live.ts';
  import type { NewsItem } from '../record/schema.ts';
  import AgentMark from './AgentMark.svelte';
  import Count from './Count.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import Mark from './Mark.svelte';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    entries,
    record = '',
    person = '',
    working = [],
    agents = '/p/agents',
    records = [],
    news = [],
    side,
    onside,
    onrecord,
    onmore,
    onfind,
  }: {
    /** The five places (`tabsOf`), the same the phone's tab bar draws. */
    entries: readonly FlatItem[];
    /** The record's name, first under the face. */
    record?: string | undefined;
    /** The person reading, by the name the record told them. */
    person?: string | undefined;
    /** The agents at work now, as `boot` sends them; nothing is drawn while this is empty. */
    working?: readonly Working[] | undefined;
    /** Where the working chip goes: the Agents place (`agentsHref`). */
    agents?: string | undefined;
    /** The other records this person can open, for the switcher under the face. */
    records?: readonly { slug: string; name: string }[] | undefined;
    /** What arrived since the reader last looked (`whatsNew`), which the bell opens. */
    news?: readonly NewsItem[] | undefined;
    /** Whether the sidebar is shown; no button is drawn where there is no sidebar. */
    side?: { shown: boolean } | undefined;
    onside?: (() => void) | undefined;
    onrecord?: ((r: { slug: string; name: string }) => void) | undefined;
    onmore?: (() => void) | undefined;
    onfind?: (() => void) | undefined;
  } = $props();

  /* THE MAKERS' NAMES, written here rather than read from `record/names.ts`, which would carry the seed's tables into the
     first paint for six words. */
  const MAKERS: Partial<Record<Working['kind'], string>> = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', gemini: 'Gemini', copilot: 'Copilot', windsurf: 'Windsurf' };

  const words = {
    product: 'BrainDog',
    you: 'You',
    account: 'Account',
    /* "AT WORK", THE AGENTS PAGE'S OWN WORDS, so the pill and that page's line read as one number ("12 at work"). */
    working: (w: readonly Working[]) => {
      const name = w.length === 1 ? MAKERS[w[0]!.kind] : undefined;
      return name ? `${name} is at work` : `${w.length} at work`;
    },
    open: 'Open Agents',
    hide: 'Hide the sidebar',
    show: 'Show the sidebar',
    arrivals: 'Arrivals',
    fresh: 'Something new arrived',
    none: 'Nothing new since you last looked',
    activity: 'All in Activity',
    opens: (name: string) => `Open ${name}`,
  } as const;

  /* SIGN OUT AT EVERY WIDTH (LCH-A04), as the phone's More says it: auth.ts is loaded on the press, and a press that did
     not end the session leaves the page where it is and says so. */
  function signOut(): void {
    void import('../auth.ts')
      .then((m) => m.signOutAndLeave(`${BASE}/signin`))
      .then(
        (out) => {
          if (!out.ok) toasts.push(copy.signOutFailed, { intent: 'warn' });
        },
        () => toasts.push(copy.signOutFailed, { intent: 'warn' }),
      );
  }

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
  /* THE ASK FIELD STANDS DOWN ON THE SEARCH PAGE, which draws the field itself (money F12). */
  const searching = $derived(inside(page.url.pathname) === '/search');
  /** A place's quiet count: its own, or on Agents how many are at work. Nothing for none. */
  const countOf = (item: FlatItem): number | null => {
    const n = item.count ?? (item.href === agents ? working.length : 0);
    return n > 0 ? n : null;
  };

  /* THE PLACE PRESSED, held from the pointer's down until the address changes (F10), so the fill is on the new place in
     the press's own frame. A press that led nowhere lets go after a moment. */
  let pressed = $state<string | null>(null);
  let letGo: ReturnType<typeof setTimeout> | undefined;
  const press = (key: string): void => {
    pressed = key;
    clearTimeout(letGo);
    letGo = setTimeout(() => (pressed = null), 1500);
  };
  $effect(() => {
    void page.url.pathname;
    void page.url.search;
    untrack(() => {
      pressed = null;
      clearTimeout(letGo);
    });
  });
  const current = (item: FlatItem): boolean => (pressed === null ? isHere(item, path) : pressed === item.key);

  /** The makers of the agents at work, each once, three at most. */
  const crew = $derived([...new Set(working.map((w) => w.kind))].slice(0, 3));

  /* ONE PULSE WHEN THE WORKING COUNT CHANGES, never on the first draw: the dot is drawn again under a new key, which
     starts its one animation. THE FIRST COUNT IS NOT A CHANGE, so it arms only once a count was seen and then moved. */
  let armed = $state(false);
  let seen: number | undefined;
  $effect(() => {
    const n = working.length;
    untrack(() => {
      if (seen !== undefined && n !== seen) armed = true;
      if (n > 0) seen = n;
    });
  });

  const others = $derived(records.filter((r) => r.name !== record));
</script>

<nav class="topbar" aria-label="Record">
  {#if side}
    <!-- THE SIDEBAR'S OWN BUTTON, and `[` does the same (frame B, pick 5). -->
    <button type="button" class="bar-side tap" aria-pressed={side.shown} aria-keyshortcuts="[" title={`${side.shown ? words.hide : words.show} ([)`} onclick={() => onside?.()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" /><path d="M9.25 4.75v14.5" /></svg>
      <span class="sr-only">{side.shown ? words.hide : words.show}</span>
    </button>
  {/if}

  <!-- "BRAINDOG" AT EVERY WIDTH (U8): the product's name, opening Today. The record's name is under the face. -->
  <a class="bar-brand tap" href={at('/')}>
    <Mark height={20} />
    <span class="bar-word">{words.product}</span>
  </a>

  <div class="bar-places">
    {#each entries as item (item.key)}
      <a
        class="bar-item tap"
        href={at(item.href)}
        aria-current={current(item) ? 'page' : undefined}
        title={item.label}
        onpointerdown={(e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && press(item.key)}
        onkeydown={(e) => e.key === 'Enter' && press(item.key)}
      >
        <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
        {#if item.count && item.key === 'decide'}<Count n={item.count} label={`${item.count} ${copy.openQuestions}`} />{:else if countOf(item)}<span class="bar-count num">{countOf(item)}</span>{/if}
      </a>
    {/each}
    <button type="button" class="bar-item bar-more tap" aria-label={copy.more} title={copy.more} onclick={() => onmore?.()}>
      <Icon name="more" size="m" />
    </button>
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`, U13), its key at rest. -->
  {#if !searching}
    <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K" onclick={() => onfind?.()}>
      <Icon name="search" size="m" /><span class="bar-ask-words">{copy.palettePlaceholder}</span><kbd aria-hidden="true">/</kbd>
    </button>
  {/if}

  {#if working.length > 0}
    <a class="bar-crew tap" href={at(agents)} title={words.open} data-alone={searching ? '' : undefined}>
      <span class="bar-crew-marks" aria-hidden="true">
        {#each crew as kind (kind)}<AgentMark {kind} size="s" />{/each}
      </span>
      <span class="bar-crew-words">{words.working(working)}</span>
      {#key working.length}<span class="bar-live" data-pulse={armed ? '' : undefined} aria-hidden="true"></span>{/key}
    </a>
  {/if}

  <!-- THE BELL, QUIET (frame B, pick 7): a dot when something arrived, no count, and its menu is Arrivals. -->
  <div class="bar-bell" data-alone={searching && working.length === 0 ? '' : undefined}>
    <Menu label={words.arrivals} align="end">
      {#snippet trigger()}
        <span class="bar-bell-face">
          <Icon name="bell" size="m" />
          {#if news.length > 0}<span class="bar-bell-dot" aria-hidden="true"></span>{/if}
          <span class="sr-only">{news.length > 0 ? `${words.arrivals}. ${words.fresh}` : words.arrivals}</span>
        </span>
      {/snippet}
      {#each news.slice(0, 6) as n, i (i)}
        <a class="bar-mi bar-news" role="menuitem" href={at(n.href)}><span class="mi-name">{n.text}</span></a>
      {:else}
        <span class="bar-mi" role="menuitem" aria-disabled="true">{words.none}</span>
      {/each}
      <hr />
      <a class="bar-mi" role="menuitem" href={at('/audit')}><Icon name="activity" size="s" />{words.activity}</a>
    </Menu>
  </div>

  <!-- THE FACE: the record's name and its switcher first (frame B, pick 8), then Settings and Sign out. -->
  <div class="bar-person">
    <Menu label={person || words.you} align="end">
      {#snippet trigger()}
        <span class="bar-face"><span aria-hidden="true">{(person || words.you).slice(0, 1)}</span><span class="sr-only">{words.account}</span></span>
      {/snippet}
      {#if record}
        <a class="bar-mi" role="menuitem" aria-current="true" href={at('/')}><span class="bar-tile" aria-hidden="true">{record.slice(0, 1)}</span><span class="mi-name">{record}</span></a>
      {/if}
      {#each others as r (r.slug)}
        <button type="button" class="bar-mi" role="menuitem" onclick={() => onrecord?.(r)}><span class="bar-tile" aria-hidden="true">{r.name.slice(0, 1)}</span><span class="mi-name">{words.opens(r.name)}</span></button>
      {/each}
      <hr />
      <a class="bar-mi" role="menuitem" href={at('/settings')}><Icon name="settings" size="s" />{copy.settings}</a>
      <button type="button" class="bar-mi" role="menuitem" onclick={signOut}><Icon name="lock" size="s" />{copy.signOut}</button>
    </Menu>
  </div>
</nav>

<style>
  /* THE STRIP: 56 tall, the page's gutter at each end. Its surface and its edge are the slot's (`+layout.svelte`). */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    block-size: 56px;
    padding-inline: var(--sp-4) var(--gutter);
  }

  /* THE SIDEBAR'S BUTTON: 32 square, the glyph in the quiet ink, drawn here so the shell's icon set stays as it is. */
  .bar-side {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    margin-inline-end: calc(-1 * var(--sp-2));
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .bar-side svg {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* THE MARK AT 20 AND "BRAINDOG" IN THE DISPLAY FACE AT 17/600, the box reaching 4 past the mark for its hover fill. */
  .bar-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-block-size: 40px;
    padding-inline: var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    text-decoration: none;
  }

  .bar-word {
    font-family: var(--font-display);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  /* THE STRIP CLIPS SIDEWAYS RATHER THAN THE DOCUMENT SCROLLING, and only sideways: the 4px above and below are the
     focus ring's (frame F4). */
  .bar-places {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex: 1 1 auto;
    min-inline-size: 0;
    margin-block: calc(-1 * var(--sp-1));
    padding-block: var(--sp-1);
    padding-inline: var(--sp-1);
    margin-inline: calc(-1 * var(--sp-1));
    overflow-x: clip;
    overflow-clip-margin: var(--sp-1);
  }

  /* A PLACE: a 32px rectangle, radius 8, glyph, name at 14/500, and the count of what needs you. Only the hover fades:
     the place you are on snaps (F10). */
  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 32px;
    padding: 0 var(--sp-3);
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }

  /* HERE IS A SOFT FILL with the words in ink at 600 (U-A12), the same in both themes. */
  .bar-item[aria-current='page'] {
    background: var(--nav-selected);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .bar-count {
    color: var(--ink-3);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-side:hover,
    .bar-brand:hover {
      background: var(--hover);
      color: var(--ink);
    }

    .bar-item:hover:not([aria-current='page']) {
      background: var(--hover);
      color: var(--ink);
      transition:
        background var(--d-state) var(--ease-out),
        color var(--d-state) var(--ease-out);
    }
  }

  .bar-more {
    padding: 0 var(--sp-2);
    color: var(--ink-3);
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 320 wide on `--tile-2` with a hairline, so it reads as a field on the nav's
     surface in both themes (U-A12), the words at 14 in the quiet ink, and its key. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 320px;
    min-inline-size: 200px;
    block-size: 36px;
    margin-inline-start: auto;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border: 1px solid var(--rule);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: text;
    transition: border-color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-ask:hover {
      border-color: var(--rule-strong);
    }
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-ask kbd {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-inline-size: 20px;
    block-size: 20px;
    background: var(--tile);
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font: inherit;
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
  }

  /* WHO IS WORKING: their makers' marks, the words, and a live dot in the live colour, on the field's fill. */
  .bar-crew {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 36px;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-crew:hover {
      background: var(--hover);
    }
  }

  .bar-crew[data-alone],
  .bar-bell[data-alone] {
    margin-inline-start: auto;
  }

  .bar-crew-marks {
    display: inline-flex;
    gap: var(--sp-1);
  }

  .bar-live {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  .bar-live[data-pulse] {
    animation: bar-pulse calc(var(--d-page) * 2) var(--ease-out);
  }

  @keyframes bar-pulse {
    50% {
      scale: 1.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-live[data-pulse] {
      animation: none;
    }
  }

  .bar-bell,
  .bar-person {
    flex: none;
  }

  .bar-bell {
    margin-inline-end: calc(-1 * var(--sp-2));
  }

  /* THE RINGS FOLLOW THE SHAPES: the bell's square, the face's circle. */
  .bar-bell :global(.menu-trigger) {
    border-radius: var(--r-ctl);
  }

  .bar-person :global(.menu-trigger) {
    border-radius: var(--r-round);
  }

  .bar-bell-face {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    color: var(--ink-3);
  }

  /* A DOT, NEVER A COUNT: something arrived, in the ink, cut out of the bell's ground by a ring of the nav. */
  .bar-bell-dot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 6px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--nav);
  }

  .bar-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bar-mi {
    color: var(--ink-2);
    text-decoration: none;
    cursor: pointer;
  }

  .bar-mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .bar-mi :global(.icon) {
    color: var(--ink-3);
  }

  /* AN ARRIVAL IS ONE LINE, its end cut. */
  .bar-news {
    max-inline-size: 360px;
  }

  .bar-news .mi-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A RECORD'S TILE: ink with the ground's letter, as the More sheet draws it. */
  .bar-tile {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    background: var(--ink);
    border-radius: var(--r-xs);
    color: var(--tile);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  @media (width < 1280px) {
    .bar-crew-words {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* NARROWER THAN 1,100 the places are their glyphs, named on hover and to a screen reader. */
  @media (width < 1100px) {
    .bar-name,
    .bar-count {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .bar-item {
      padding: 0 var(--sp-2);
    }
  }

  @media (forced-colors: active) {
    .bar-item[aria-current='page'],
    .bar-ask {
      border: 1px solid CanvasText;
    }
  }
</style>
