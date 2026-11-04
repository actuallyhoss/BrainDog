<!--
  The top bar: where you are, and asking. It runs across the work's column only, from the sidebar's edge to the window's,
  and moves with that edge when the sidebar is dragged, hidden or narrowed to its rail. Every place is the sidebar's.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE, the sidebar's, with one hairline under it on the same line as the
  hairline under the sidebar's head. Left to right: the crumb ("Money › Ledger", "Projects › Kiln"), each step but the
  last a link back; "Ask or change anything" with its "/" key; the bell (what happened, never what was asked); and the
  face (how you sign in, the keyboard keys, Sign out).

  THE LAST STEP IS THE PAGE'S TITLE, AND THE ONLY TIME IT IS SAID (29 October): "Today" on Today (plan F5), "Needs
  you" with its count as a quiet figure, "Projects › Kiln". The page under it draws no name of its own (`PageHead`).

  ITS START IS THE WORK'S START: the bar pads its start by the page's gutter, so the crumb and the first tile under it
  share one edge at every width. BELOW 900px THIS IS NOT DRAWN: each page's head carries the phone's bar. ON `/search`
  THE ASK FIELD IS NOT DRAWN: the page's own field is.

  WITH NO SIDEBAR (the "One button" navigation) THE BAR'S START IS THE MENU: one button, its count of what needs you, and
  then the same crumb, field, bell and face. It opens every place as a panel (`AppFrame.svelte`).
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import Bell from '../shell/Bell.svelte';
  import HereFaces from '$lib/shell/HereFaces.svelte';
  import { frame } from '../shell/frame.svelte.ts';
  import type { Crumb } from '../shell/side.ts';
  import YouMenu from '../shell/YouMenu.svelte';
  import Count from './Count.svelte';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';

  let {
    crumb = [],
    onfind,
    onmenu,
    menuOpen = false,
    waiting = 0,
  }: {
    /** Where you are, place first: each step a link back but the last. */
    crumb?: readonly Crumb[];
    onfind?: (() => void) | undefined;
    /** Given only where there is no sidebar: opens the panel that holds every place. */
    onmenu?: (() => void) | undefined;
    menuOpen?: boolean;
    /** What needs the person, said on the button, since the row that says it is behind it. */
    waiting?: number;
  } = $props();

  const words = { where: 'You are here', menu: 'Menu', needs: (n: number) => `${n.toLocaleString('en-GB')} need you` } as const;

  /* THE ASK FIELD STANDS DOWN ON THE SEARCH PAGE, which draws the field itself (money F12). */
  const searching = $derived(inside(page.url.pathname) === '/search');
</script>

<nav class="topbar" aria-label={words.where}>
  {#if onmenu}
    <button type="button" class="bar-menu tap" data-nav-menu aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="nav-panel" aria-keyshortcuts="[" title={`${words.menu} ([)`} onclick={() => onmenu?.()}>
      <Icon name="rows" size="m" /><span>{words.menu}</span>{#if waiting > 0}<Count n={waiting} size="s" label={words.needs(waiting)} />{/if}
    </button>
  {/if}
  <div class="crumb">
    <ol>
      {#each crumb as step, i (i)}
        <li>
          {#if i > 0}<span class="crumb-sep" aria-hidden="true"><Icon name="chevron" size="s" /></span>{/if}
          {#if step.href}
            <a class="crumb-up" href={at(step.href)}>{step.label}</a>
          {:else}
            <span class="crumb-here" aria-current="page">{step.label}</span>{#if i === crumb.length - 1 && frame.figure}<span class="crumb-figure num">{frame.figure}</span>{/if}
          {/if}
        </li>
      {/each}
    </ol>
  </div>
  <!-- THE PAGE'S OWN BUTTONS BESIDE ITS NAME, where its head says no sentence (`PageHead`'s `inBar`). -->
  {#if frame.actions}<span class="bar-page">{@render frame.actions()}</span>{/if}

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`), its key at rest: `/` finds,
       and ⌘J (Ctrl J off a Mac) opens straight into Ask, which is the key the hint names. -->
  {#if !searching}
    <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K Control+J Meta+J" title={copy.searchKeys} onclick={() => onfind?.()}>
      <!-- WITH NO MODEL, "Search or go to…" and the search's own key (AG5): ⌘J opens Find there, so naming it promised an Ask. -->
      <Icon name="search" size="m" /><span class="bar-ask-words">{page.data.slash === true ? copy.palettePlaceholder : copy.paletteFind}</span><span class="bar-ask-key" aria-hidden="true"><Kbd keys={page.data.slash === true ? '⌘J' : '⌘K'} /></span>
    </button>
  {/if}

  <span class="bar-end" data-alone={searching ? '' : undefined}>
    <HereFaces />
    <Bell />
    <YouMenu />
  </span>
</nav>

<style>
  /* THE STRIP: 56 tall, the work's gutter at each end. Its surface and its edge are the slot's (`+layout.svelte`). */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    /* ON THE WINDOW LINE (rhythm, 3 Nov): the bar's row is 56 under the window inset, so the page name and every
       control centre at 40, the same line as the sidebar's brand row. */
    block-size: calc(56px + var(--window-inset));
    padding-block-start: var(--window-inset);
    padding-inline: var(--gutter);
  }

  /* THE ONE BUTTON: a glass capsule like the field across from it, a page control's height, on the work's own edge. */
  .bar-menu {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: var(--ctl-page);
    padding-inline: var(--ctl-pad-sm) var(--ctl-pad);
    border: 0;
    background: var(--g-fill);
    -webkit-backdrop-filter: var(--g-bf);
    backdrop-filter: var(--g-bf);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ctl);
    cursor: pointer;
    transition: background-color var(--d-state) var(--ease-out);
  }

  /* WITH A COUNT THE CAPSULE'S END IS THE COUNT'S, as near its edge as the glyph is at the start. */
  .bar-menu:has(:global(.badge)) {
    padding-inline-end: var(--sp-2);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-menu:hover {
      background: var(--g-fill-hover);
    }
  }

  /* THE CRUMB: the place in the quiet ink, a small chevron, where you are in ink at 600. One line; a long name ends in
     an ellipsis rather than pushing Ask off the bar. */
  /* WHERE YOU ARE HANDS OVER IN PLACE through a page change (`app.css`, `bar-crumb`): the old words go, then the new
     ones come up, in the same box, so the two never cross. */
  .crumb {
    flex: 1 1 auto;
    min-inline-size: 0;
    view-transition-name: bar-crumb;
  }

  /* WITH THE PAGE'S BUTTONS BESIDE IT, the name takes its own width and the buttons the rest, up to Ask. */
  .crumb:has(+ .bar-page) {
    flex: 0 1 auto;
  }

  .bar-page {
    display: flex;
    flex: 1 0 auto;
    align-items: center;
    min-inline-size: 0;
  }

  .crumb ol {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-ctl);
    white-space: nowrap;
  }

  .crumb li {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .crumb li:last-child {
    flex: 0 1 auto;
    gap: 0;
    /* The title's own room for a tail or an accent (`.crumb-here`), past this box's cut too. */
    margin-block: -4px;
    padding-block: 4px;
    overflow: hidden;
  }

  .crumb li:last-child > .crumb-sep {
    margin-inline-end: var(--sp-1);
  }

  /* EACH STEP TAKES ITS DIRECTION FROM ITS OWN FIRST LETTER (a name somebody typed), from the sheet and not `dir="auto"`,
     which Svelte wrote again on every redraw of the crumb. */
  .crumb-up,
  .crumb-here {
    unicode-bidi: plaintext;
  }

  .crumb-up {
    border-radius: var(--r-xs);
    color: var(--ink-3);
    text-decoration: none;
  }

  /* THE PAGE'S TITLE: 17 at 600 in the display face, as the page names wear it, on one line and cut at its end. */
  .crumb-here {
    /* ROOM FOR A TAIL AND AN ACCENT: the cut is at the padding box, and 32 is under Jakarta's 1.26 em at 28. */
    margin-block: -4px;
    padding-block: 4px;
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: var(--fw-semi);
    line-height: calc(32px * var(--type, 1));
    letter-spacing: var(--track-page);
    text-overflow: ellipsis;
  }

  /* ITS COUNT, quiet, a step after it. */
  .crumb-figure {
    flex: none;
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  .crumb-sep {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
    opacity: 0.7;
  }

  .crumb-sep:dir(rtl) {
    scale: -1 1;
  }

  @media (hover: hover) and (pointer: fine) {
    .crumb-up:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 320 wide on `--tile-2` with a hairline, so it reads as a field on the nav's
     surface in both themes, the words at 14 in the quiet ink, and its key. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 320px;
    min-inline-size: 200px;
    block-size: 36px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    /* A GLASS CAPSULE on the ground (ops 4.1), the search's one door. */
    border: 0;
    background: var(--g-fill);
    -webkit-backdrop-filter: var(--g-bf);
    backdrop-filter: var(--g-bf);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    border-radius: var(--r-pill);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    line-height: var(--lead-ctl);
    text-align: start;
    cursor: text;
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* BELOW 1360 IT ASKS FOR 240 (plan F6): at 320 on a 1280 window it pushed the crumb into an ellipsis. */
  @media (width < 1360px) {
    .bar-ask {
      flex-basis: 240px;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-ask:hover {
      background: var(--g-fill-hover);
    }
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-ask-key {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* THE BELL AND THE FACE, 8 apart, the face's circle on the gutter's edge. */
  .bar-end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
  }

  @media (forced-colors: active) {
    .bar-menu,
    .bar-ask {
      border: 1px solid CanvasText;
    }
  }
</style>
