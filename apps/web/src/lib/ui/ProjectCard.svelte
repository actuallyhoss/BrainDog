<!--
  One project as a card, the same on Today, on Projects and on the site's desk (the UI pass of 20 October, proj section
  4, F4, F13, F15): the one card everywhere.

  A TILE ON THE BOARD IN THE PROJECT'S COLOUR, NEVER A STRIPE: `--tile`, radius 16, no border, no shadow and no edge across
  the top. Its colour is its slot (`slotStyle`), worn by the well, the meter, the line and the arrow, and by the fill
  under the pointer. The whole card is the link to the project's page.

  FIVE ROWS, each drawn only when it has something to say:
    A  the mark in its 40 well, the name (Geist 17/600) with its lane and how it is going under it, and "3 late" at the
       end (a red dot and the word, never a pill);
    B  its figure at 28 in Lexend with its label, and its line at the right from three points; a project with no money
       leads with how far along it is instead ("35%", "of the way"), so no card has a hole;
    C  the meter, "60% · aiming 20 Sep";
    D  the next step after an arrow, two lines at most;
    E  pinned to the foot: who is on it, and how long since anybody worked on it. Not on a phone, where Today's Working
       now and the project's page say the agents.
  No brief: the project's page says what it is in its hero.

  NOTHING LIFTS (SF15): under the pointer the fill takes 5% of the project's colour (8% dark) over `--d-state`, pressed
  10% (12% dark) over `--d-press`, and the focus is the one ring. A figure that changes while the card is on screen
  washes for a second and a half (`--arrived`) and rolls in (proj F9).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { at } from '$lib/at.ts';
  import Icon from './Icon.svelte';
  import ProjectWell from './ProjectWell.svelte';
  import AgentFace from './AgentFace.svelte';
  import { money } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { Sparkline } from '$lib/viz/index.ts';
  import { HEALTH, daySaid, slotStyle, workedSaid, type ProjectCard } from '$lib/home/project-cards.ts';

  let {
    card,
    label = '',
    trend = null,
    agents = [],
  }: {
    card: ProjectCard;
    /** What the figure is: its field's label, "Earned in a year". */
    label?: string;
    /** A line of numbers the card's page declares, oldest first: drawn from three points. */
    trend?: { values: readonly number[]; label: string } | null;
    /** The agents on it now: the kind its mark is drawn from (`claude`) and the name a person reads ("Claude"). */
    agents?: readonly { agent: string; name: string }[];
    /** Kept for a caller that still passes it: the card is drawn the same everywhere. */
    inset?: boolean;
  } = $props();

  /* The lane as a word: its first letter up, since a list keeps it lower case. */
  const lane = $derived(card.lane === '' ? '' : card.lane.charAt(0).toUpperCase() + card.lane.slice(1).replace(/_/gu, ' '));
  const health = $derived(HEALTH[card.health] ?? null);
  const drawn = $derived(trend && trend.values.length >= 3 ? trend : null);
  const figure = $derived(card.figure ? symbolText(money(card.figure.minor, card.figure.currency), homeCurrency(), true) : null);
  /* A PROJECT WITH NO MONEY LEADS WITH HOW FAR ALONG IT IS, so its card has no hole where the figure would be. */
  const leadsWithProgress = $derived(figure === null && card.progress !== null);
  const meterSaid = $derived.by(() => {
    if (card.progress === null) return '';
    const aim = card.aim ? `aiming ${daySaid(card.aim)}` : '';
    if (leadsWithProgress) return aim ? aim.charAt(0).toUpperCase() + aim.slice(1) : '';
    return aim ? `${card.progress}% · ${aim}` : `${card.progress}%`;
  });
  const names = $derived([...new Set(agents.map((a) => a.name))]);
  const whoSaid = $derived(names.length === 0 ? '' : `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} working`);
  const worked = $derived(card.worked ? workedSaid(card.worked) : '');
  const named = $derived(
    [
      card.name,
      lane.toLowerCase(),
      health?.word.toLowerCase(),
      figure ? `${figure} ${label.toLowerCase()}`.trim() : '',
      card.progress !== null ? `${card.progress}% along` : '',
      card.late > 0 ? `${card.late} late` : '',
    ]
      .filter(Boolean)
      .join(', '),
  );

  /* ── things landing ── A FIGURE THAT CHANGES WHILE THE CARD IS DRAWN washes and rolls in; the first draw is no arrival. */
  let was = $state<{ figure: string | null; progress: number | null; late: number } | null>(null);
  let arrived = $state<ReadonlySet<'figure' | 'progress' | 'late'>>(new Set());
  $effect(() => {
    const now = { figure, progress: card.progress, late: card.late };
    untrack(() => {
      const before = was;
      was = now;
      if (!before) return;
      const changed = new Set<'figure' | 'progress' | 'late'>();
      if (before.figure !== now.figure) changed.add('figure');
      if (before.progress !== now.progress) changed.add('progress');
      if (before.late !== now.late) changed.add('late');
      if (changed.size === 0) return;
      arrived = changed;
      setTimeout(() => (arrived = new Set()), 1500);
    });
  });
</script>

<a class="pcard" href={at(card.href)} style={slotStyle(card.hue)} aria-label={named}>
  <span class="pc-a">
    <ProjectWell mark={card.mark} name={card.name} hue={card.hue} />
    <span class="pc-id">
      <span class="pc-name" dir="auto">{card.name}</span>
      {#if lane || health}
        <span class="pc-meta"
          >{lane}{#if lane && health}{' · '}{/if}{#if health}<span class="pc-health" data-tone={health.tone}><span class="dot" aria-hidden="true"></span>{health.word}</span>{/if}</span
        >
      {/if}
    </span>
    {#if card.late > 0}<span class="pc-late" data-arrived={arrived.has('late') ? '' : undefined}><span class="dot" aria-hidden="true"></span>{card.late} late</span>{/if}
  </span>
  {#if figure || leadsWithProgress}
    <span class="pc-b">
      {#if figure}
        <!-- SAID SHORT, AS A TILE SAYS A FIGURE: £18,400, never £18,400.00. -->
        {#key figure}<span class="pc-num num" data-arrived={arrived.has('figure') ? '' : undefined}>{figure}</span>{/key}
        {#if label}<span class="pc-label">{label}</span>{/if}
      {:else}
        {#key card.progress}<span class="pc-num num" data-arrived={arrived.has('progress') ? '' : undefined}>{card.progress}%</span>{/key}
        <span class="pc-label">of the way</span>
      {/if}
      {#if drawn}<span class="pc-line"><Sparkline values={drawn.values} width={84} height={28} tone="var(--ph)" subject={drawn.label} /></span>{/if}
    </span>
  {/if}
  {#if card.progress !== null}
    <span class="pc-c">
      <span class="meter" aria-hidden="true"><span class="meter-fill" style:inline-size="{card.progress}%"></span></span>
      {#if meterSaid}<span class="pc-quiet">{meterSaid}</span>{/if}
    </span>
  {/if}
  {#if card.next}
    <span class="pc-next"><Icon name="arrow" size="m" /><span class="sr">Next step: </span><span class="pc-next-words" dir="auto">{card.next}</span></span>
  {/if}
  {#if agents.length > 0 || worked}
    <span class="pc-foot">
      {#if agents.length > 0}
        <span class="faces">{#each agents.slice(0, 3) as a (a.agent)}<AgentFace agent={a.agent} run="" live="working" size="xs" />{/each}</span>
        <span class="pc-quiet pc-who">{whoSaid}</span>
      {/if}
      {#if worked}<span class="pc-quiet pc-worked" data-quiet={card.worked?.quiet ? '' : undefined}>{worked}</span>{/if}
    </span>
  {/if}
</a>

<style>
  .pcard {
    --ph: var(--ink);
    --ph-tint: var(--tile-2);
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 248px;
    box-sizing: border-box;
    padding: 20px;
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink);
    text-decoration: none;
    transition: background-color var(--d-state) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .pcard:hover {
      background: color-mix(in oklab, var(--ph) var(--wash-hover), var(--tile));
    }
  }

  .pcard:active {
    background: color-mix(in oklab, var(--ph) var(--wash-press), var(--tile));
    transition-duration: var(--d-press);
  }

  /* THE WASH IS A STEP STRONGER IN DARK, where 5% of a colour over a dark tile is not seen. */
  .pcard {
    --wash-hover: 5%;
    --wash-press: 10%;
  }

  :global(html[data-scheme='dark']) .pcard {
    --wash-hover: 8%;
    --wash-press: 12%;
  }

  @media (prefers-color-scheme: dark) {
    :global(html:not([data-scheme])) .pcard {
      --wash-hover: 8%;
      --wash-press: 12%;
    }
  }

  .pcard:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* ── row A: the mark, the name and where it stands, and what is late ── */
  .pc-a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 40px;
    min-inline-size: 0;
  }

  .pc-id {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .pc-name {
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-meta {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-health {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* AT RISK IS A WAITING DOT AND DIM WORDS; OFF TRACK THE RED DOT AND THE RED WORD, the one red a card may say. */
  .pc-health[data-tone='off'] {
    color: var(--danger-text);
  }

  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--status-waiting);
  }

  .pc-health[data-tone='off'] .dot {
    background: var(--danger);
  }

  .pc-late {
    display: inline-flex;
    flex: none;
    align-items: center;
    align-self: start;
    gap: 6px;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: 20px;
  }

  .pc-late .dot {
    background: var(--red);
  }

  /* ── row B: the figure ── */
  .pc-b {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-block-size: 34px;
    margin-block-start: 16px;
  }

  .pc-num {
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    line-height: 34px;
    animation: roll var(--d-swap) var(--ease-out);
  }

  .pc-label {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-line {
    align-self: center;
    flex: none;
    inline-size: 84px;
    margin-inline-start: auto;
  }

  /* ── row C: how far along ── */
  .pc-c {
    display: grid;
    gap: 6px;
    margin-block-start: 12px;
  }

  .meter {
    display: block;
    block-size: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--chart-track, var(--tile-2));
  }

  .meter-fill {
    display: block;
    block-size: 100%;
    border-radius: 3px;
    background: var(--ph);
    transition: inline-size var(--d-recompose) var(--ease-emphasis);
  }

  .pc-quiet {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* ── row D: the next step ── */
  .pc-next {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-block-start: 12px;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    line-height: 20px;
  }

  .pc-next :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ph);
  }

  .pc-next-words {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* ── row E: who is on it, and how long since anybody was ── */
  .pc-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: auto;
    padding-block-start: 12px;
    border-block-start: 1px solid var(--rule);
    min-inline-size: 0;
  }

  /* The foot sits at the card's foot, and never closer than 12 under the row above it. */
  .pcard > :has(+ .pc-foot) {
    margin-block-end: 12px;
  }

  .faces {
    display: flex;
    flex: none;
  }

  .faces > :global(* + *) {
    margin-inline-start: -6px;
  }

  .pc-who {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-worked {
    flex: none;
    margin-inline-start: auto;
  }

  .pc-worked[data-quiet] {
    color: var(--red);
  }

  [data-arrived] {
    border-radius: var(--r-xs);
    animation: landed 1.5s var(--ease-out);
  }

  .pc-num[data-arrived] {
    animation:
      landed 1.5s var(--ease-out),
      roll var(--d-swap) var(--ease-out);
  }

  @keyframes landed {
    from {
      background-color: var(--arrived);
    }
  }

  @keyframes roll {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-arrived],
    .pc-num[data-arrived] {
      animation: landed 1.5s step-end;
    }

    .pc-num {
      animation: none;
    }
  }

  /* ── a phone: 16 round, the figure at 24, one line of next step, no foot ── */
  @media (width < 640px) {
    .pcard {
      min-block-size: 0;
      padding: 16px;
    }

    .pc-a {
      min-block-size: 36px;
    }

    .pc-a :global(.well[data-size='card']) {
      inline-size: 36px;
      block-size: 36px;
    }

    .pc-b {
      min-block-size: 30px;
      margin-block-start: 12px;
    }

    .pc-num {
      font-size: calc(var(--fs-figure) + 2px);
      line-height: 30px;
    }

    .pc-line {
      inline-size: 64px;
    }

    .pc-next-words {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }

    .pc-foot {
      display: none;
    }
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
