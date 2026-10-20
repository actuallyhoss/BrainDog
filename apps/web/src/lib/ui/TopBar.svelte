<!--
  The top bar of 19 October (his call 1, 20 October): the shell's navigation from 900px up, unless somebody picked the
  side rail in Settings > Navigation.

  ONE FLAT STRIP, 56 TALL, ON THE TILE'S WHITE WITH ONE HAIRLINE UNDER IT. The mark with "BrainDog" over the record's
  name on the left, then the five places as 32px rectangles (radius 8, 14 medium): Today, Needs you with its count,
  Projects, Money, Agents (`tabsOf`, the phone bar's five). A "⋯" after them opens the sheet that holds Work and every
  other place, list and record. At the right, "Ask or change anything", the one way to ask, then who is working with a
  live dot, then the person's face.

  THE PLACE YOU ARE ON IS THE BOARD'S GREY INSIDE THE WHITE BAR, no accent. The only red is the count of what needs you.

  THE KEY HINT IS SHOWN ON HOVER AND FOCUS ONLY: printed at rest it is one more thing to read on every screen.

  NARROWER THAN 1,100 THE PLACES ARE THEIR GLYPHS, each named for a screen reader and on hover; narrower than 1,280 the
  working chip is its marks and dot. BELOW 900px THIS IS NOT DRAWN AT ALL: the tab bar is the navigation there.
-->
<script lang="ts">
  import { BASE, at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import type { Working } from '../record/boot-live.ts';
  import AgentMark from './AgentMark.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import Mark from './Mark.svelte';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    entries,
    behind = 0,
    record = '',
    person = '',
    working = [],
    agents = '/p/agents',
    onmore,
    onfind,
  }: {
    /** The five places (`tabsOf`), the same the phone's tab bar draws. */
    entries: readonly FlatItem[];
    /** How many places are under More, said on its button. */
    behind?: number | undefined;
    /** The record's name, under "BrainDog". */
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
    account: 'Your account and settings',
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
  /** The makers of the agents at work, each once, three at most. */
  const crew = $derived([...new Set(working.map((w) => w.kind))].slice(0, 3));
  const moreSaid = $derived(behind ? copy.navBehindMore(behind) : copy.more);
</script>

<nav class="topbar" aria-label="Record">
  <!-- THE MARK, "BrainDog", AND THE RECORD UNDER IT. It opens the sheet that switches records and holds every place. -->
  <button type="button" class="bar-brand tap" onclick={() => onmore?.()} aria-label={`${words.product}, ${record || words.you}. ${copy.more}`}>
    <Mark height={20} />
    <span class="bar-brand-words">
      <span class="bar-product">{words.product}</span>
      {#if record}<span class="bar-record">{record}</span>{/if}
    </span>
  </button>

  <div class="bar-places">
    {#each entries as item (item.key)}
      <a class="bar-item tap" href={at(item.href)} aria-current={isHere(item, path) ? 'page' : undefined} title={item.label}>
        <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
        {#if item.count && item.key === 'decide'}<span class="tally num" aria-label={`${item.count} ${copy.openQuestions}`}>{item.count}</span>{/if}
      </a>
    {/each}
    <button type="button" class="bar-item bar-more tap" aria-label={moreSaid} title={moreSaid} onclick={() => onmore?.()}>
      <Icon name="more" size="m" />
    </button>
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`). -->
  <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K" onclick={() => onfind?.()}>
    <Icon name="search" size="m" /><span class="bar-ask-words">{copy.palettePlaceholder}</span><kbd aria-hidden="true">/</kbd>
  </button>

  {#if working.length > 0}
    <a class="bar-crew tap" href={at(agents)} title={words.open}>
      <span class="bar-crew-marks" aria-hidden="true">
        {#each crew as kind (kind)}<AgentMark {kind} size="s" />{/each}
      </span>
      <span class="bar-crew-words">{words.working(working)}</span>
      <span class="bar-live" aria-hidden="true"></span>
    </a>
  {/if}

  <!-- THE FACE OPENS A SMALL MENU: Settings, and Sign out, the two things a person does to their own session. -->
  <div class="bar-person">
    <Menu label={person || words.you} align="end">
      {#snippet trigger()}
        <span class="bar-face" title={person || words.you}><span aria-hidden="true">{(person || words.you).slice(0, 1)}</span><span class="sr-only">{words.account}</span></span>
      {/snippet}
      <a class="bar-mi" role="menuitem" href={at('/settings')}><Icon name="settings" size="s" />{copy.settings}</a>
      <button type="button" class="bar-mi" role="menuitem" onclick={signOut}><Icon name="lock" size="s" />{copy.signOut}</button>
    </Menu>
  </div>
</nav>

<style>
  /* THE STRIP: 56 tall on the tile's white, the page's gutter at each end, so its edges line up with the work under it. */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    block-size: 56px;
    padding-inline: var(--gutter);
  }

  .bar-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex: none;
    min-inline-size: 0;
    min-block-size: 40px;
    margin-inline-start: -6px;
    padding: 0 8px 0 6px;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink);
    text-align: start;
    cursor: pointer;
  }

  /* "BrainDog" OVER THE RECORD'S NAME: the product at 15 semibold, the record a step down in `--dim`. */
  .bar-brand-words {
    display: grid;
    min-inline-size: 0;
    line-height: 1.15;
  }

  .bar-product {
    font-size: var(--t-md);
    font-weight: 600;
  }

  .bar-record {
    max-inline-size: 160px;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE STRIP CLIPS RATHER THAN THE DOCUMENT SCROLLING SIDEWAYS. */
  .bar-places {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
  }

  /* A PLACE: a 32px rectangle, radius 8, glyph, name at 14 medium, and the count of what needs you. */
  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 32px;
    padding: 0 12px;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: calc(var(--t-sm) + 1px);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* HERE IS THE BOARD'S GREY INSIDE THE WHITE BAR, and ink. */
  .bar-item[aria-current='page'] {
    background: var(--board);
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-brand:hover {
      background: var(--hover-wash);
    }

    .bar-item:hover:not([aria-current='page']) {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  .bar-more {
    padding: 0 8px;
    color: var(--dim);
  }

  /* THE COUNT OF WHAT NEEDS YOU, the one red in the strip. */
  .tally {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 5px;
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-action);
    font-size: var(--t-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 320 wide in the board's grey, the words in `--dim`. A button, so the palette owns
     the typing. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 320px;
    min-inline-size: 200px;
    block-size: 36px;
    margin-inline-start: auto;
    padding: 0 10px 0 12px;
    border: 0;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: start;
    cursor: text;
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE KEY, ON HOVER AND FOCUS ONLY. */
  .bar-ask kbd {
    display: none;
    place-items: center;
    min-inline-size: 20px;
    block-size: 20px;
    background: var(--tile);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .bar-ask:is(:hover, :focus-visible) kbd {
    display: inline-grid;
  }

  /* WHO IS WORKING: their makers' marks, the words, and a live dot in the live colour, never the red. */
  .bar-crew {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 36px;
    padding: 0 12px 0 10px;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  .bar-crew-marks {
    display: inline-flex;
    gap: 2px;
  }

  .bar-live {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--live-fill);
    animation: bar-live calc(var(--d-panel) * 8) var(--ease-standard) infinite;
  }

  @keyframes bar-live {
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-live {
      animation: none;
    }
  }

  .bar-person {
    flex: none;
  }

  .bar-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    background: var(--field);
    border-radius: var(--r-round);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
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
    color: var(--ink2);
    text-decoration: none;
    cursor: pointer;
  }

  .bar-mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .bar-mi :global(.icon) {
    color: var(--dim);
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
      padding: 0 10px;
    }
  }

  @media (forced-colors: active) {
    .bar-item[aria-current='page'],
    .bar-ask {
      border: 1px solid CanvasText;
    }
  }
</style>
