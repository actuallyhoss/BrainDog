<!--
  One project as a card, the same on Today's desk and on Projects (the plan of 20 October: "one project card everywhere").

  A WHITE TILE WITH THE PROJECT'S COLOUR AS AN ACCENT, NEVER A GRADIENT: a 3px edge across the top and its mark in a well
  tinted with its hue. Then its name in Lexend with its lane, the one line it is, its figure at 28 with a small line
  when there are three points or more, the next step after an arrow, and the agents on it at the foot. The whole card
  is the link to the project's page. A part with nothing to say is not drawn, and a project with no hue is drawn in none.

  `inset` is a card drawn inside a tile (Projects' In play), which takes the field's fill so it is told from the tile.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from './Icon.svelte';
  import ProjectWell from './ProjectWell.svelte';
  import AgentFace from './AgentFace.svelte';
  import { money } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { Sparkline } from '$lib/viz/index.ts';
  import type { ProjectCard } from '$lib/home/project-cards.ts';

  let {
    card,
    label = '',
    trend = null,
    agents = [],
    inset = false,
  }: {
    card: ProjectCard;
    /** What the figure is: its field's label, "Earned in a year". */
    label?: string;
    /** A line of numbers the card's page declares, oldest first: drawn from three points. */
    trend?: { values: readonly number[]; label: string } | null;
    /** The agents on it now: the kind its mark is drawn from (`claude`) and the name a person reads ("Claude"). */
    agents?: readonly { agent: string; name: string }[];
    inset?: boolean;
  } = $props();

  /* The lane as a word: its first letter up, since a list keeps it lower case. */
  const lane = $derived(card.lane === '' ? '' : card.lane.charAt(0).toUpperCase() + card.lane.slice(1).replace(/_/gu, ' '));
  const drawn = $derived(trend && trend.values.length >= 3 ? trend : null);
</script>

<a class="pcard" href={at(card.href)} data-hued={card.hue === null ? undefined : ''} data-inset={inset ? '' : undefined} style={card.hue === null ? undefined : `--hue:${card.hue}`}>
  <span class="pc-top">
    <ProjectWell mark={card.mark} name={card.name} hue={card.hue} />
    <span class="pc-name">
      <span class="pc-title" dir="auto">{card.name}</span>
      {#if lane}<span class="pc-lane">{lane}</span>{/if}
    </span>
  </span>
  {#if card.brief}<span class="pc-brief" dir="auto">{card.brief}</span>{/if}
  {#if card.figure || drawn}
    <span class="pc-fig">
      {#if card.figure}
        <!-- SAID SHORT, AS A TILE SAYS A FIGURE: £18,400, never £18,400.00. -->
        <span class="pc-num num">{symbolText(money(card.figure.minor, card.figure.currency), homeCurrency(), true)}</span>
        {#if label}<span class="pc-label">{label}</span>{/if}
      {/if}
      {#if drawn}<span class="pc-line"><Sparkline values={drawn.values} width={84} height={28} tone="var(--ph)" subject={drawn.label} /></span>{/if}
    </span>
  {/if}
  {#if card.next}
    <span class="pc-next"><Icon name="arrow" size="s" /><span class="sr">Next step: </span><span dir="auto">{card.next}</span></span>
  {/if}
  {#if agents.length > 0}
    <span class="pc-foot">
      {#each agents as a (a.agent)}<AgentFace agent={a.agent} run="" live="working" size="s" />{/each}
      <span class="pc-who">{[...new Set(agents.map((a) => a.name))].join(', ')}</span>
    </span>
  {/if}
</a>

<style>
  .pcard {
    --ph: var(--dim);
    position: relative;
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    block-size: 100%;
    padding: var(--sp-4) var(--sp-4) var(--sp-4);
    overflow: hidden;
    background: var(--tile);
    border-radius: var(--r-lg);
    color: var(--ink);
    text-decoration: none;
  }

  .pcard[data-inset] {
    background: var(--field);
  }

  .pcard[data-hued] {
    --ph: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* THE EDGE ACROSS THE TOP is the project's colour, the one accent it wears. */
  .pcard::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    block-size: 3px;
    background: var(--ph);
  }

  @media (hover: hover) and (pointer: fine) {
    .pcard:hover {
      background: color-mix(in oklab, var(--ph) 6%, var(--tile));
    }

    .pcard[data-inset]:hover {
      background: color-mix(in oklab, var(--ph) 8%, var(--field));
    }
  }

  .pc-top {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .pc-name {
    display: flex;
    flex: 1;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .pc-title {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 1.2;
  }

  .pc-lane {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .pc-brief {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .pc-fig {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
  }

  .pc-num {
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }

  .pc-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .pc-line {
    margin-inline-start: auto;
    inline-size: 84px;
  }

  .pc-next {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.4;
  }

  .pc-next :global(.icon) {
    flex: none;
    color: var(--ph);
    transform: translateY(2px);
  }

  .pc-foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
