<!--
  The drawn app's navigation, 900px and wider: the app's top bar, cut down to what an example record shows.

  THE SAME ORDER AS THE PRODUCT'S. The record's name with its chevron beside the mark, then the places: the spine
  (Home, Decide and Inbox, with Decide's count) and the record's own pages in the order they were declared, each a
  glyph and a name, and the search field at the end.

  FLAT ON THE BOARD, AND IT HOLDS ONLY CHROME. The chosen place is an ink pill. Decide's count is the badge in the house
  red, as the app draws it: a question waiting on you is what the accent is for.

  EACH PLACE IS A BUTTON THAT OPENS ITS PAGE in the drawn app's page area, and the place on show carries
  `aria-current`. Focus stays on the place pressed, which is still there. The search field is drawn, not pressed: an
  example record has nothing behind it, and a control that opens nothing is a broken one.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Mark from '../Mark.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';

  type Entry = { id: string; title: string; glyph: string };

  let {
    name,
    pages,
    current,
    open = 0,
    pick,
    foot,
  }: {
    /** The record's name, which is the example's label. */
    name: string;
    pages: readonly Entry[];
    current: string;
    /** How many questions wait on Decide. */
    open?: number;
    pick: (id: string) => void;
    /** What sits at the rail's foot. */
    foot?: Snippet;
  } = $props();

  /* THE SPINE, as `apps/web/src/lib/spine.ts` draws it on a record that has used Decide and Inbox. */
  const SPINE = new Set(['home', 'decide', 'inbox']);
  const spine = $derived(pages.filter((p) => SPINE.has(p.id)));
  const rest = $derived(pages.filter((p) => !SPINE.has(p.id)));
  const w = cases.drawn;
</script>

{#snippet row(p: Entry)}
  <li>
    <button type="button" class="item tap" aria-current={p.id === current ? 'page' : undefined} onclick={() => pick(p.id)}>
      {#if isIconName(p.glyph)}<Icon name={p.glyph} size="s" />{/if}
      <span class="item-name">{p.title}</span>
      {#if p.id === 'decide' && open > 0}<span class="badge num" aria-hidden="true">{open}</span><span class="hide">{w.toDecide(open)}</span>{/if}
    </button>
  </li>
{/snippet}

<div class="rail" role="group" aria-label={w.rail}>
  <p class="record">
    <Mark height={18} />
    <span class="record-name">{name}</span>
    <span class="chev" aria-hidden="true"><Icon name="chevron-down" size="s" /></span>
  </p>

  <ul class="places">
    {#each spine as p (p.id)}{@render row(p)}{/each}
    {#each rest as p (p.id)}{@render row(p)}{/each}
  </ul>

  <p class="ask" aria-hidden="true">
    <Icon name="search" size="s" />
    <span class="ask-words">{w.ask}</span>
    <span class="cap">/</span>
  </p>

  {#if foot}<div class="foot">{@render foot()}</div>{/if}
</div>

<style>
  /* THE BAR: one line on the board, no panel round it. */
  .rail {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    min-block-size: 40px;
  }

  /* The record switcher: the mark at 18, the record's name at 15/600, and its chevron. */
  .record {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    white-space: nowrap;
  }

  .chev {
    display: grid;
    color: var(--dim);
  }

  /* THE PLACES CLIP RATHER THAN WRAP: the bar is one line whatever the record holds. */
  .places {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 2px;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    list-style: none;
  }

  .places li {
    flex: none;
  }

  /* A PLACE: glyph and name, and where you are is the ink pill. */
  .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .item[aria-current='page'] {
    background: var(--ink);
    color: var(--on-ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .item:not([aria-current='page']):hover {
      background: var(--bg);
      color: var(--ink);
    }
  }

  /* Decide's count: the one filled badge, in the house red. */
  .badge {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 5px;
    border-radius: var(--r-pill);
    background: var(--danger);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  /* SEARCH, drawn as the white field the app has at the end of its bar. */
  .ask {
    display: flex;
    flex: 0 1 220px;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    min-block-size: 34px;
    margin: 0;
    padding: 0 6px 0 12px;
    border-radius: var(--r-pill);
    background: var(--bg);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap {
    display: inline-grid;
    place-items: center;
    min-inline-size: 20px;
    block-size: 20px;
    border-radius: var(--r-sm);
    background: var(--sunk);
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .foot {
    flex: none;
  }

  .hide {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
