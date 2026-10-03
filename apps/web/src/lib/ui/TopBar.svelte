<!--
  The top bar: the record's name, the flat list the tab bar draws (`flatNav`), search and the person.

  ONE CHOICE AWAY IN SETTINGS, AND NO LONGER THE DEFAULT: the floating rail card is the shell
  (DIRECTION 37), and this is the strip for somebody who picked it. It sits straight on the board,
  with no glass and no panel: the record's name on the left, the places as plain rows with the one
  you are on in the rail's ink wash, search as a field on the right and the person's face at the end.

  IT STATES WHAT IT HIDES. The record's name opens the same sheet the phone opens, which holds every
  section, every list, the utilities and the other records, and the More row says how many places
  sit there, so nothing is unreachable at any width.

  BELOW 900px THIS IS NOT DRAWN AT ALL. The tab bar stays there whatever the shape says, and the
  shell hides this slot rather than this component reasoning about width.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import Mark from './Mark.svelte';

  let {
    entries,
    behind = 0,
    record = '',
    person = '',
    onmore,
    onfind,
  }: {
    /** The flat list (`flatNav`), the same rows the rail and the tab bar draw. */
    entries: readonly FlatItem[];
    /** How many places are under More, said on its row. */
    behind?: number | undefined;
    /** The record's name, beside the mark. */
    record?: string | undefined;
    /** The person reading, by the name the record told them. */
    person?: string | undefined;
    onmore?: (() => void) | undefined;
    onfind?: (() => void) | undefined;
  } = $props();

  const words = { unnamed: 'My BrainDog', you: 'You', find: 'Ask, add, or jump to anything' } as const;

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
</script>

<nav class="topbar" aria-label="Record">
  <button type="button" class="bar-record tap" onclick={() => onmore?.()} aria-label={copy.more}>
    <Mark height={20} /><span class="bar-record-name">{record || words.unnamed}</span><Icon name="chevronDown" size="s" />
  </button>

  <div class="bar-places">
    {#each entries as item (item.key)}
      <a class="bar-item tap" href={at(item.href)} aria-current={isHere(item, path) ? 'page' : undefined}>
        <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
        {#if item.count}<span class="tally num" data-waiting={item.key === 'decide' ? '' : undefined} aria-label={`${item.count} ${copy.openQuestions}`}
            >{item.count}</span
          >{/if}
      </a>
    {/each}
    <button
      type="button"
      class="bar-item bar-more tap"
      aria-label={behind ? copy.navBehindMore(behind) : copy.more}
      title={behind ? copy.navBehindMore(behind) : copy.more}
      onclick={() => onmore?.()}
    >
      <Icon name="more" size="m" />
    </button>
  </div>

  <button type="button" class="bar-find tap" onclick={() => onfind?.()}>
    <Icon name="search" size="m" /><span class="bar-find-words">{words.find}</span><kbd>/</kbd>
  </button>
  <a class="bar-face tap" href={at('/settings')} aria-label={copy.settings} title={person || words.you}>{(person || words.you).slice(0, 1)}</a>
</nav>

<style>
  /* ON THE BOARD, no panel: the strip is the page's own top line. Its places read at the rail's 14, a step under the
     page's 15, and the place you are on is the rail's ink wash, so the two shapes say "here" the same way. */
  .topbar {
    --bar-text: calc(var(--t-sm) + 1px);

    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-inline-size: 0;
    min-block-size: 44px;
  }

  .bar-record {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    padding: 6px 10px 6px 4px;
    border: 0;
    background: none;
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    cursor: pointer;
  }

  .bar-record-name {
    max-inline-size: 180px;
    overflow: hidden;
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

  /* A PLACE: glyph, name, count. Where you are is the ink wash, the name at 600. */
  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-block-size: 40px;
    padding: 0 14px;
    border: 0;
    background: none;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--bar-text);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .bar-item[aria-current='page'] {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
    font-weight: 600;
  }

  /* HOVER ONLY WHERE THERE IS ONE, as the rail's is: a lift toward white on the board, never on the place you are on. */
  @media (hover: hover) and (pointer: fine) {
    .bar-record:hover {
      background: var(--hover-wash);
    }

    .bar-item:hover:not([aria-current='page']) {
      background: var(--bg);
      color: var(--ink);
    }
  }

  .bar-more {
    padding: 0 10px;
  }

  .bar-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tally {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Decide's is the red square, the one filled count and the one red in the strip, as it is on the rail. */
  .tally[data-waiting] {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 20px;
    block-size: 20px;
    padding: 0 5px;
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-weight: 600;
    line-height: 1;
  }

  /* SEARCH, DRAWN AS THE FIELD IT OPENS. A button, so the palette owns the typing. */
  .bar-find {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 400px;
    min-inline-size: 180px;
    min-block-size: 40px;
    padding: 0 8px 0 14px;
    border: 1px solid color-mix(in srgb, var(--ink) 22%, transparent);
    background: var(--bg);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--bar-text);
    text-align: start;
    cursor: text;
  }

  .bar-find-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-find kbd {
    display: inline-grid;
    place-items: center;
    min-inline-size: 22px;
    block-size: 22px;
    background: var(--sunk);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-xs);
  }

  .bar-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    background: var(--ink);
    border-radius: var(--r-pill);
    color: var(--on-ink);
    font-size: var(--t-base);
    font-weight: 600;
    text-decoration: none;
  }

  @media (forced-colors: active) {
    .bar-item[aria-current='page'],
    .bar-find {
      border: 1px solid CanvasText;
    }
  }
</style>
