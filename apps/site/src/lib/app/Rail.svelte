<!--
  The drawn app's rail, 900px and wider: the new app's floating rail card (SYSTEM §5), cut down to what an example
  record shows.

  THE SAME ORDER AS THE PRODUCT'S. The record switcher at the top (the mark, the record's name and its chevron), the
  ask field, then the places: the spine (Home, Decide and Inbox, with Decide's count) and the record's own pages in
  the order they were declared, each an 18px glyph in a 26px well. Then Working now, one row per agent at work, read
  off the record's own Agents page, and at the foot whatever the host puts there.

  GLASS, AND IT HOLDS ONLY CHROME. The chosen place has an ink well with the glyph in the on-ink colour and its row in
  the tile fill. Decide's count is the square badge, drawn in ink here rather than red: on the site, red is the mark's
  and nothing else's (SYSTEM §10), and the app draws it red.

  EACH PLACE IS A BUTTON THAT OPENS ITS PAGE in the drawn app's page area, and the place on show carries
  `aria-current`. Focus stays on the row pressed, which is still there. The ask field and the agents' rows are drawn,
  not pressed: an example record has nothing behind them, and a control that opens nothing is a broken one.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import { markedOf } from '../agent-marks.ts';
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Mark from '../Mark.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';

  type Entry = { id: string; title: string; glyph: string };
  type Agent = { who: string; when: string };

  let {
    name,
    pages,
    current,
    open = 0,
    working = [],
    pick,
    foot,
  }: {
    /** The record's name, which is the example's label. */
    name: string;
    pages: readonly Entry[];
    current: string;
    /** How many questions wait on Decide. */
    open?: number;
    /** The agents at work on the record, from its Agents page. */
    working?: readonly Agent[];
    pick: (id: string) => void;
    /** What sits at the rail's foot. */
    foot?: Snippet;
  } = $props();

  /* THE SPINE, as `apps/web/src/lib/spine.ts` draws it on a record that has used Decide and Inbox. */
  const SPINE = new Set(['home', 'decide', 'inbox']);
  const spine = $derived(pages.filter((p) => SPINE.has(p.id)));
  const rest = $derived(pages.filter((p) => !SPINE.has(p.id)));
  const w = cases.drawn;

  /* THE LIVE RING'S ARC. An agent that wrote this minute draws three quarters of its ring, and one that wrote a few
     minutes ago draws the whole ring faint: working, with no step reported. The circle is r 10, so 62.83 round. */
  const ARC = 62.83;
</script>

{#snippet row(p: Entry)}
  <li>
    <button type="button" class="item tap" aria-current={p.id === current ? 'page' : undefined} onclick={() => pick(p.id)}>
      <span class="well">{#if isIconName(p.glyph)}<Icon name={p.glyph} size="m" />{/if}</span>
      <span class="item-name">{p.title}</span>
      {#if p.id === 'decide' && open > 0}<span class="badge num" aria-hidden="true">{open}</span><span class="hide">{w.toDecide(open)}</span>{/if}
    </button>
  </li>
{/snippet}

<div class="rail" role="group" aria-label={w.rail}>
  <p class="record">
    <Mark height={18} />
    <span class="record-name">{name}</span>
    <span class="chev" aria-hidden="true"><Icon name="chevron-down" size="m" /></span>
  </p>

  <p class="ask" aria-hidden="true">
    <Icon name="search" size="m" />
    <span class="ask-words">{w.ask}</span>
    <span class="cap">/</span>
  </p>

  <ul class="places">
    {#each spine as p (p.id)}{@render row(p)}{/each}
    {#each rest as p (p.id)}{@render row(p)}{/each}
  </ul>

  {#if working.length > 0}
    <p class="section">{w.working}</p>
    <ul class="agents">
      {#each working as a, i (a.who)}
        {@const marked = markedOf(a.who)}
        <li class="agent">
          <span class="face" data-marked={marked ? '' : undefined} aria-hidden="true"><svg viewBox="0 0 24 24">
            <circle class="ring-track" cx="12" cy="12" r="10" />
            <circle
              class="ring"
              data-live={i === 0 ? '' : undefined}
              cx="12"
              cy="12"
              r="10"
              stroke-dasharray={i === 0 ? `${ARC * 0.75} ${ARC}` : `${ARC} ${ARC}`}
              transform="rotate(-90 12 12)"
            />
            <circle class="disc" cx="12" cy="12" r="8" />
</svg>{#if marked}<span class="mark"><AgentMark agent={marked} /></span>{:else}<span class="initial">{a.who.slice(0, 1)}</span>{/if}</span>
          <span class="agent-name">{a.who}</span>
          <span class="agent-when">{a.when}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if foot}<div class="foot">{@render foot()}</div>{/if}
</div>

<style>
  /* THE RAIL CARD: glass, radius 22, padding 10, floating one inset from the window's edge (SYSTEM §5). */
  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-block-size: 0;
    padding: 10px;
    border-radius: var(--r-lg);
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
  }

  /* The record switcher: the mark at 18, the record's name at 15/600, and its chevron. */
  .record {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 40px;
    margin: 0;
    padding-inline: 8px;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .record-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chev {
    color: var(--ink2);
  }

  /* THE ASK FIELD, drawn: a 36px field in the wash, the search glyph, the words and the `/` key cap. */
  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    margin: 6px 0 10px;
    padding-inline: 10px 6px;
    border-radius: var(--r-md);
    background: var(--hover-wash);
    color: var(--dim);
    font-size: var(--t-base);
  }

  .ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .cap {
    display: inline-grid;
    place-items: center;
    min-inline-size: 18px;
    block-size: 18px;
    padding-inline: 4px;
    border-radius: var(--r-sm);
    background: var(--s1);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .places,
  .agents {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A PLACE, as the new rail draws one: a 26px well with the glyph, the name at 14/500, and a count at the end. */
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    inline-size: 100%;
    min-block-size: var(--rail-item-h);
    padding: 0 10px 0 5px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

  .well {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--r-well);
    background: var(--hover-wash);
    color: var(--ink2);
  }

  .item[aria-current='page'] {
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }

  .item[aria-current='page'] .well {
    background: var(--ink);
    color: var(--on-ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .item:hover:not([aria-current='page']) {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  .item-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* THE SQUARE COUNT: Decide's, the one filled badge, in ink on the site. */
  .badge {
    display: inline-grid;
    place-items: center;
    min-inline-size: 20px;
    block-size: 20px;
    padding-inline: 5px;
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--on-ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* ── Working now ─────────────────────────────────────────────────────── */

  .section {
    margin: 16px 0 2px;
    padding-inline: 10px;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .agent {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    padding: 0 10px 0 4px;
    color: var(--ink);
  }

  /* THE FACE: a circle with the agent's initial, inside a 2px ring in the live colour whose arc is its progress. */
  .face {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
  }

  .face svg {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  .ring-track {
    fill: none;
    stroke: var(--line);
    stroke-width: 2;
  }

  .ring {
    fill: none;
    stroke: var(--live);
    stroke-width: 2;
    stroke-linecap: round;
    opacity: 0.4;
  }

  .ring[data-live] {
    opacity: 1;
  }

  .disc {
    fill: var(--ink2);
  }

  /* A MAKER'S MARK ON A PLAIN DISC (the owner's "use real ones"): an ink disc would swallow Codex's black knot. */
  .face[data-marked] .disc {
    fill: var(--bg);
    stroke: var(--line);
    stroke-width: 1;
  }

  .mark {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 70%;
    block-size: 70%;
    color: var(--ink);
  }

  .initial {
    position: relative;
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .agent-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    font-size: var(--t-base);
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .agent-when {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .foot {
    display: flex;
    flex-direction: column;
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
  }

  /* Read by a screen reader and not drawn: the count said as words, where the figure alone says nothing. */
  .hide {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
