<!--
  The top bar of 19 October (his call 1, 20 October; 2.A.21): the shell's navigation from 900px up, unless somebody
  picked the side rail in Settings > Navigation.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE (white with one hairline under it in light, the nav's indigo in dark).
  The mark and the record's name on one line with a chevron on the left: it is the switcher, and opens the sheet that
  holds Work and every other place, list and record ("BrainDog" is said at the head of that sheet). Then the five places
  as 32px rectangles (radius 8, 14/500): Today, Needs you with its count, Projects, Money, Agents (`tabsOf`, the phone
  bar's five). A "⋯" after them, named More, opens the same sheet. At the right, "Ask or change anything" with its "/"
  key at rest, the one way to ask; then who is working with a live dot; then the person's face, named Account.

  THE PLACE YOU ARE ON IS THE NAV'S SELECTED FILL inside the bar, in ink at 600, no accent. The only red is the count of
  what needs you, the one `Count`.

  THE LIVE DOT HOLDS STILL (frame F22): a pulse that never stops means nothing, so it pulses once when the working count
  changes, and not at all under reduced motion.

  THE FOCUS RING IS NEVER CLIPPED: the places' strip clips sideways only, with room above and below for the ring.

  NARROWER THAN 1,100 THE PLACES ARE THEIR GLYPHS, each named for a screen reader and on hover; narrower than 1,280 the
  working chip is its marks and dot. BELOW 900px THIS IS NOT DRAWN AT ALL: the tab bar is the navigation there. ON
  `/search` THE ASK FIELD IS NOT DRAWN: the page's own field is the search, and two fields on one screen read as two.
-->
<script lang="ts">
  import { BASE, at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import type { Working } from '../record/boot-live.ts';
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
    onmore,
    onfind,
  }: {
    /** The five places (`tabsOf`), the same the phone's tab bar draws. */
    entries: readonly FlatItem[];
    /** The record's name, beside the mark. */
    record?: string | undefined;
    /** The person reading, by the name the record told them. */
    person?: string | undefined;
    /** The agents at work now, as `boot` sends them; nothing is drawn while this is empty. */
    working?: readonly Working[] | undefined;
    /** Where the working chip goes: the Agents place (`agentsHref`). */
    agents?: string | undefined;
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
    working: (w: readonly Working[]) => {
      const name = w.length === 1 ? MAKERS[w[0]!.kind] : undefined;
      return name ? `${name} is working` : `${w.length} working`;
    },
    open: 'Open Agents',
  } as const;

  /* SIGN OUT AT EVERY WIDTH (LCH-A04), as the rail's account menu and the phone's More say it: auth.ts is loaded on the
     press, and a press that did not end the session leaves the page where it is and says so. */
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
  /** The makers of the agents at work, each once, three at most. */
  const crew = $derived([...new Set(working.map((w) => w.kind))].slice(0, 3));

  /* ONE PULSE WHEN THE WORKING COUNT CHANGES, never on the first draw: the dot is drawn again under a new key, which
     starts its one animation. */
  let armed = $state(false);
  $effect(() => {
    armed = true;
  });
</script>

<nav class="topbar" aria-label="Record">
  <!-- THE MARK AND THE RECORD, AND THE CHEVRON THAT SAYS IT OPENS: the switcher, and every place under More. -->
  <button type="button" class="bar-brand tap" onclick={() => onmore?.()} aria-label={`${words.product}, ${record || words.you}. ${copy.more}`}>
    <Mark height={20} />
    {#if record}<span class="bar-record">{record}</span>{/if}
    <span class="bar-chevron" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
  </button>

  <div class="bar-places">
    {#each entries as item (item.key)}
      <a class="bar-item tap" href={at(item.href)} aria-current={isHere(item, path) ? 'page' : undefined} title={item.label}>
        <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
        {#if item.count && item.key === 'decide'}<Count n={item.count} label={`${item.count} ${copy.openQuestions}`} />{/if}
      </a>
    {/each}
    <button type="button" class="bar-item bar-more tap" aria-label={copy.more} title={copy.more} onclick={() => onmore?.()}>
      <Icon name="more" size="m" />
    </button>
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens from (`data-palette-from`), its key shown at rest. -->
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

  <!-- THE FACE OPENS A SMALL MENU: Settings, and Sign out, the two things a person does to their own session. -->
  <div class="bar-person" data-alone={searching && working.length === 0 ? '' : undefined}>
    <Menu label={person || words.you} align="end">
      {#snippet trigger()}
        <span class="bar-face"><span aria-hidden="true">{(person || words.you).slice(0, 1)}</span><span class="sr-only">{words.account}</span></span>
      {/snippet}
      <a class="bar-mi" role="menuitem" href={at('/settings')}><Icon name="settings" size="s" />{copy.settings}</a>
      <button type="button" class="bar-mi" role="menuitem" onclick={signOut}><Icon name="lock" size="s" />{copy.signOut}</button>
    </Menu>
  </div>
</nav>

<style>
  /* THE STRIP: 56 tall, the page's gutter at each end, so its edges line up with the work under it. Its surface is the
     slot's (`+layout.svelte`). */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    block-size: 56px;
    padding-inline: var(--gutter);
  }

  /* THE MARK AT 20, THE RECORD'S NAME ON ONE LINE AT 15/600, AND A 12px CHEVRON IN THE QUIET INK. The box reaches 4 past
     the mark so its hover fill does not touch it, and is drawn back by as much so the mark sits on the gutter. */
  .bar-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-inline-size: 0;
    min-block-size: 40px;
    margin-inline-start: calc(-1 * var(--sp-2));
    padding-inline: var(--sp-2);
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink);
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .bar-record {
    max-inline-size: 200px;
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-chevron {
    display: inline-grid;
    color: var(--ink-3);
  }

  /* THE STRIP CLIPS SIDEWAYS RATHER THAN THE DOCUMENT SCROLLING, and only sideways: the 4px above and below are the
     focus ring's, which `overflow: hidden` cut to two brackets (frame F4). */
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

  /* A PLACE: a 32px rectangle, radius 8, glyph, name at 14/500, and the count of what needs you. */
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
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* HERE IS THE NAV'S SELECTED FILL, ink, and the weight a step up. */
  .bar-item[aria-current='page'] {
    background: var(--nav-selected);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-brand:hover {
      background: var(--hover);
    }

    .bar-item:hover:not([aria-current='page']) {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .bar-more {
    padding: 0 var(--sp-2);
    color: var(--ink-3);
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 280 wide in the field's fill, the words at 14 in the quiet ink, and its key. A
     button, so the palette owns the typing. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 280px;
    min-inline-size: 200px;
    block-size: 36px;
    margin-inline-start: auto;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border: 0;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: text;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-ask:hover {
      background: var(--hover);
    }
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE KEY, AT REST: a 20px cap in the quiet ink, so the shortcut is learnt by being seen. */
  .bar-ask kbd {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-inline-size: 20px;
    block-size: 20px;
    background: var(--tile);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font: inherit;
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
  }

  /* WHO IS WORKING: their makers' marks, the words, and a live dot in the live colour, never the red. */
  .bar-crew {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 36px;
    padding: 0 var(--sp-3);
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-crew:hover {
      background: var(--hover);
    }
  }

  /* WITH NO ASK FIELD BEFORE IT, the first thing at the end takes the push to the end. */
  .bar-crew[data-alone],
  .bar-person[data-alone] {
    margin-inline-start: auto;
  }

  .bar-crew-marks {
    display: inline-flex;
    gap: var(--sp-1);
  }

  /* STILL, AND ONE PULSE WHEN THE COUNT CHANGES: up to 1.4 and back over two page steps. */
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

  .bar-person {
    flex: none;
  }

  /* THE FACE'S RING FOLLOWS THE FACE: the trigger round it is round, so its focus ring is a circle and not a square. */
  .bar-person :global(.menu-trigger) {
    border-radius: var(--r-round);
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

  /* The face is a letter to the eye, and the trigger says what it opens to a screen reader. */
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

  /* NARROWER THAN 1,280 the working chip is its marks and its dot. */
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

  /* NARROWER THAN 1,100 the places are their glyphs, named on hover and to a screen reader, and the record's name goes. */
  @media (width < 1100px) {
    .bar-name,
    .bar-record {
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
