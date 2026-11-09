<!--
  One project as a card, the same on Today, on Projects and on the site's desk (proj section
  4): the one card everywhere.

  A TILE ON THE BOARD IN THE PROJECT'S COLOUR, NEVER A STRIPE: `--tile`, radius 16, no border, no shadow and no edge across
  the top. Its colour is its slot (`slotStyle`), worn by the well, the meter, the line and the arrow, and by the fill
  under the pointer. The whole card is the link to the project's page.

  FIVE ROWS, each drawn only when it has something to say:
    A  the mark in its 40 well, the name (Geist 17/600) with its lane and how it is going under it, and "3 late" at the
       end (a red dot and the word, never a pill);
    B  its figure at 28 at 600 with its label, and its line at the right from three points. THE FIGURE IS THE
       PROJECT'S LEAD KEY NUMBER where it keeps one (`card.kpi`, the KPI plan of 21 October, 2.5): its name small, the
       figure, how it moved under them ("Up 36% on Aug", or "Not updated since 3 Oct" in the warn colour, never red),
       and its own line, never tasks done by week. With no key number it is the money figure as before, and a project
       with no money leads with how far along it is instead ("35%", "of the way"), so no card has a hole;
    C  the meter, "60% · aiming 20 Sep";
    D  the next step after an arrow, two lines at most;
    E  pinned to the foot, ITS ONE LIVE LINE (`lifeOf`): who is on it now, else who worked on
       it last from the runs, else how long since its work moved, else since when it has been quiet, with a face or a
       dot in its colour. On a phone too, since on an empty card it is the one thing said.
  No brief: the project's page says what it is in its hero. NO HEIGHT OF ITS OWN, SINCE the same audit: every card was
  248px whatever it held, so a name and a lane sat over 170px of white; a row is as tall as its tallest card.

  NOTHING LIFTS: under the pointer the fill takes 5% of the project's colour (8% dark) over `--d-state`, pressed
  10% (12% dark) over `--d-press`, and the focus is the one ring. A figure that changes while the card is on screen
  washes for a second and a half (`--arrived`) and rolls in (proj F9).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { at } from '$lib/at.ts';
  import Icon from './Icon.svelte';
  import ProjectWell from './ProjectWell.svelte';
  import AgentFace from './AgentFace.svelte';
  import { renames } from '../things/rename.ts';
  import { money } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { Sparkline } from '$lib/viz/index.ts';
  import { laneLabelsOf, laneSaid, shownName } from '$lib/shell/side.ts';
  import { HEALTH, daySaid, lifeOf, slotStyle, workedSaid, type ProjectCard } from '$lib/home/project-cards.ts';

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

  /* THE LANE AS THE LIST SAYS IT, by the label its state field gives the value (a person's "Active", where the value is
     `building`), as the lane bar over the cards and the project's own page say it; else the value with its first
     letter up, since a list keeps it lower case. Personal's card said "Building" over a status of Active. */
  const lane = $derived(card.lane === '' ? '' : laneSaid(laneLabelsOf(REGISTERS[card.key.slice(0, Math.max(card.key.indexOf('#'), 0))]), card.lane));
  const health = $derived(HEALTH[card.health] ?? null);
  /* ITS LEAD KEY NUMBER, where its project keeps one: its figure, its name and its own line stand for the money ones. */
  const kpi = $derived(card.kpi ?? null);
  const drawn = $derived(kpi === null && trend && trend.values.length >= 3 ? trend : null);
  const figure = $derived(kpi ? kpi.figure : card.figure ? symbolText(money(card.figure.minor, card.figure.currency), homeCurrency(), true) : null);
  const figureLabel = $derived(kpi ? kpi.name : label);
  /** THE LABEL CUT AT A WORD, never mid-word beside the figure; the whole name is on hover. */
  const LABEL_MAX = 16;
  const labelShort = $derived.by(() => {
    const t = figureLabel;
    if (t.length <= LABEL_MAX) return t;
    const head = t.slice(0, LABEL_MAX + 1);
    const at = head.lastIndexOf(' ');
    return `${(at > 3 ? head.slice(0, at) : t.slice(0, LABEL_MAX)).trimEnd()}…`;
  });
  /* THE SAME LABEL SAID SHORT WHERE THE CARD IS NARROW (T3): "Revenue a m…" at 1280 reads "Revenue/mo". Only a label
     ending in how often ("a month", "a year", "a week") has a short form; any other is cut as before. */
  const SHORT_EVERY: Record<string, string> = { month: '/mo', year: '/yr', week: '/wk' };
  const labelTight = $derived.by(() => {
    const m = / (?:a|per) (month|year|week)$/iu.exec(labelShort);
    return m ? `${labelShort.slice(0, m.index)}${SHORT_EVERY[m[1]!.toLowerCase()]}` : null;
  });
  /* A PROJECT WITH NO MONEY LEADS WITH HOW FAR ALONG IT IS, so its card has no hole where the figure would be. */
  const leadsWithProgress = $derived(figure === null && card.progress !== null);
  const meterSaid = $derived.by(() => {
    if (card.progress === null) return '';
    const aim = card.aim ? `aiming ${daySaid(card.aim)}` : '';
    if (leadsWithProgress) return aim ? aim.charAt(0).toUpperCase() + aim.slice(1) : '';
    return aim ? `${card.progress}% · ${aim}` : `${card.progress}%`;
  });
  /* ITS ONE LIVE LINE (`lifeOf`): who is on it, who worked on it last, how long since its work moved, or since when it
     has been quiet. How long since its work moved stands beside who is on it now, as before. */
  const life = $derived(lifeOf(card, agents));
  /* THE NAME A CARD SAYS IS THE PROJECT'S TITLE, a handle spaced and capitalised as the rail says it (`shownName`). */
  const title = $derived(shownName(card.name));
  /* A CARD WITH NOTHING ELSE TO SAY SAYS THAT, in one honest line: no next step, figure, progress or sign of life. */
  const empty = $derived(!card.next && figure === null && !leadsWithProgress && card.progress === null && life === null);
  const worked = $derived(life?.kind === 'working' && card.worked ? workedSaid(card.worked) : '');
  /* ONLY ITS NAME AND HOW IT STANDS ("Tallow · Building"): a grid that shares its row out draws it small, never as a
     whole-width card of white under one line (audit 31 Oct n, AN20). */
  /* AND WHEN ALL IT ADDS IS WHEN IT LAST MOVED (audit 31 Oct o, AO17): a fresh Tallow says "Nothing changed since 31 Oct"
     under its name, and was drawn the whole width for it. */
  const thin = $derived(figure === null && !leadsWithProgress && card.progress === null && !card.next && (life === null || life.kind === 'quiet'));
  const named = $derived(
    [
      title,
      lane.toLowerCase(),
      health?.word.toLowerCase(),
      kpi ? kpi.sentence : figure ? `${figure} ${label.toLowerCase()}`.trim() : '',
      card.progress !== null ? `${card.progress}% along` : '',
      card.late > 0 ? `${card.late} late` : '',
    ]
      .filter(Boolean)
      .join(', '),
  );

  /* ── things landing ── A FIGURE THAT CHANGES WHILE THE CARD IS DRAWN washes and rolls in; the first draw is no arrival.
     NOR IS THE FRESH READ THAT REPLACES THE KEPT ONE as the page opens: Kiln's "1 late" washed on every Today load and
     every Back (VERIFY H44), so what changes in the card's first `SETTLING_MS` is taken as the page arriving. */
  const SETTLING_MS = 2000;
  const born = typeof performance === 'undefined' ? 0 : performance.now();
  let was = $state<{ figure: string | null; progress: number | null; late: number } | null>(null);
  let arrived = $state<ReadonlySet<'figure' | 'progress' | 'late'>>(new Set());
  $effect(() => {
    const now = { figure, progress: card.progress, late: card.late };
    untrack(() => {
      const before = was;
      was = now;
      if (!before || performance.now() - born < SETTLING_MS) return;
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

<a class="pcard" href={at(card.href)} style={slotStyle(card.hue)} aria-label={named} data-thin={thin ? '' : undefined} {@attach renames(card.href)}>
  <span class="pc-a">
    <ProjectWell mark={card.mark} name={title} hue={card.hue} />
    <span class="pc-id">
      <span class="pc-name own-dir">{title}</span>
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
        {#if figureLabel}<span class="pc-label own-dir" title={labelShort === figureLabel && labelTight === null ? undefined : figureLabel}
            >{#if labelTight}<span class="pc-l-long">{labelShort}</span><span class="pc-l-tight">{labelTight}</span>{:else}{labelShort}{/if}</span
          >{/if}
      {:else}
        {#key card.progress}<span class="pc-num num" data-arrived={arrived.has('progress') ? '' : undefined}>{card.progress}%</span>{/key}
        <span class="pc-label">of the way</span>
      {/if}
      {#if kpi?.line}
        <!-- ITS OWN LINE, AS THE RENDERER PLANNED IT for every screen that draws this number, in the project's colour, and in
             the quiet ink once it has stopped arriving. -->
        <span class="pc-line" data-stale={kpi.stale ? '' : undefined}
          ><svg class="pc-trend" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"
            >{#if kpi.line.area}<path class="pc-trend-area" d={kpi.line.area} />{/if}<path class="pc-trend-line" d={kpi.line.line} vector-effect="non-scaling-stroke" />{#if kpi.line.partial}<path class="pc-trend-dot" data-partial="" d={kpi.line.partial} vector-effect="non-scaling-stroke" />{/if}{#if kpi.line.end}<path class="pc-trend-dot" d={kpi.line.end} vector-effect="non-scaling-stroke" />{/if}</svg
          ></span
        >
      {:else if drawn}<span class="pc-line"><Sparkline values={drawn.values} width={84} height={28} tone="var(--ph)" subject={drawn.label} /></span>{/if}
    </span>
    {#if kpi && (kpi.stale || kpi.move)}
      <!-- HOW IT MOVED, IN WORDS, or that it has stopped arriving, in the warn colour with the words: never red. -->
      <span class="pc-move" data-tone={kpi.stale ? 'stale' : (kpi.move?.tone ?? undefined)}>{kpi.stale ?? kpi.move?.said}</span>
    {/if}
  {/if}
  {#if card.progress !== null}
    <span class="pc-c">
      <span class="meter" aria-hidden="true"><span class="meter-fill" data-grow style:inline-size="{card.progress}%"></span></span>
      {#if meterSaid}<span class="pc-quiet">{meterSaid}</span>{/if}
    </span>
  {/if}
  {#if card.next}
    <span class="pc-next"><Icon name="arrow" size="m" /><span class="sr">Next step: </span><span class="pc-next-words own-dir">{card.next}</span></span>
  {/if}
  {#if empty}
    <span class="pc-foot pc-empty"><span class="pc-mark" aria-hidden="true"></span><span class="pc-quiet pc-who">Nothing written yet. <span class="pc-add">Add a next step</span></span></span>
  {/if}
  {#if life}
    <span class="pc-foot" data-life={life.kind}>
      {#if life.kind === 'working'}
        <span class="faces">{#each agents.slice(0, 3) as a (a.agent)}<AgentFace agent={a.agent} run="" live="working" size="xs" />{/each}</span>
        <span class="pc-quiet pc-who">{life.said}</span>
        {#if worked}<span class="pc-quiet pc-worked" data-quiet={card.worked?.quiet ? '' : undefined}>{worked}</span>{/if}
      {:else if life.kind === 'run'}
        <span class="faces"><AgentFace agent={life.agent} run="" live="stopped" size="xs" /></span>
        <span class="pc-quiet pc-who">{life.said}</span>
      {:else}
        <span class="pc-mark" aria-hidden="true"></span>
        <span class="pc-quiet pc-who" data-quiet={life.kind === 'worked' && life.quiet ? '' : undefined}>{life.said}</span>
      {/if}
    </span>
  {/if}
</a>

<style>
  .pcard {
    --ph: var(--ink);
    --ph-tint: var(--tile-2);
    container: pcard / inline-size;
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-inline-size: 0;
    box-sizing: border-box;
    padding: calc(20px * var(--dense, 1));
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
    gap: var(--sp-3);
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
    line-height: calc(22px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-meta {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-health {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* AT RISK IS A WAITING DOT AND DIM WORDS; OFF TRACK THE WARNING DOT AND WORD AT 600 (VERIFY H5). Red on a card is
     for what is late, and only that. */
  .pc-health[data-tone='off'] {
    color: var(--warn);
    font-weight: 600;
  }

  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--warn-fill);
  }

  .pc-health[data-tone='off'] .dot {
    background: var(--warn-fill);
  }

  .pc-late {
    display: inline-flex;
    flex: none;
    align-items: center;
    align-self: start;
    gap: calc(6px * var(--dense, 1));
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: calc(20px * var(--type, 1));
  }

  .pc-late .dot {
    background: var(--red);
  }

  /* ── row B: the figure ── */
  .pc-b {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-block-size: 34px;
    min-inline-size: 0;
    margin-block-start: var(--sp-4);
  }

  .pc-num {
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    line-height: calc(34px * var(--type, 1));
    white-space: nowrap;
  }

  .pc-label {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pc-l-tight {
    display: none;
  }

  @container pcard (inline-size < 340px) {
    .pc-l-long {
      display: none;
    }

    .pc-l-tight {
      display: inline;
    }
  }

  .pc-line {
    align-self: center;
    flex: none;
    inline-size: 84px;
    margin-inline-start: auto;
  }

  /* ITS OWN LINE, drawn in the renderer's box at the card's size: the stroke and the dots keep their width as it stretches. */
  .pc-trend {
    display: block;
    inline-size: 100%;
    block-size: 28px;
    overflow: visible;
  }

  .pc-trend-line {
    fill: none;
    stroke: var(--ph);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .pc-trend-area {
    fill: color-mix(in oklab, var(--ph) 12%, transparent);
  }

  .pc-trend-dot {
    fill: none;
    stroke: var(--ph);
    stroke-width: 6;
    stroke-linecap: round;
  }

  /* THE MONTH STILL RUNNING is a faint dot, never a fall. */
  .pc-trend-dot[data-partial] {
    opacity: 0.4;
  }

  .pc-line[data-stale] .pc-trend-line,
  .pc-line[data-stale] .pc-trend-dot {
    stroke: var(--ink-3);
  }

  .pc-line[data-stale] .pc-trend-area {
    fill: color-mix(in oklab, var(--ink-3) 10%, transparent);
  }

  /* HOW IT MOVED: the good way in the good colour, the other in the warn, and stale in the warn, each with its words. */
  .pc-move {
    margin-block-start: 2px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .pc-move[data-tone='good'] {
    color: var(--good);
  }

  .pc-move[data-tone='warn'],
  .pc-move[data-tone='stale'] {
    color: var(--warn);
  }

  /* ── row C: how far along ── */
  .pc-c {
    display: grid;
    gap: calc(6px * var(--dense, 1));
    margin-block-start: var(--sp-3);
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
    background: var(--ph-fill, var(--ph));
    transition: inline-size var(--d-recompose) var(--ease-emphasis);
  }

  .pc-quiet {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* ── row D: the next step ── */
  .pc-next {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    line-height: calc(20px * var(--type, 1));
  }

  .pc-next :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ph);
  }

  .pc-next-words {
    display: -webkit-box;
    min-inline-size: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* ── row E: who is on it, and how long since anybody was ── */
  .pc-foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: auto;
    /* THE FOOT HOLDS ITS OWN AIR, 12 over its rule and 12 under, never closer than that to the row above. The air was the
       row above's margin, so where a page hides the foot (Today's project cards) the card ended 14 taller at the bottom
       than the top. */
    position: relative;
    padding-block-start: calc(25px * var(--dense, 1));
    min-inline-size: 0;
  }

  .pc-foot::before {
    content: '';
    position: absolute;
    inset-block-start: 12px;
    inset-inline: 0;
    block-size: 1px;
    background: var(--rule);
  }

  .faces {
    display: flex;
    flex: none;
  }

  .faces > :global(* + *) {
    margin-inline-start: calc(-6px * var(--dense, 1));
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

  .pc-worked[data-quiet],
  .pc-who[data-quiet] {
    color: var(--red);
  }

  /* A LINE WITH NO FACE BEFORE IT WEARS THE PROJECT'S COLOUR as a dot, so every card's live line is in its own colour. */
  .pc-add {
    color: var(--ink-2);
    text-decoration: underline;
  }

  .pc-mark {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    margin-inline: var(--sp-1);
    border-radius: var(--r-round);
    background: var(--ph-fill, var(--ph));
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
  }

  /* ── a phone: 16 round, the figure at 24, one line of next step, the live line without its rule ── */
  @media (width < 640px) {
    .pcard {
      padding: var(--sp-4);
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
      margin-block-start: var(--sp-3);
    }

    .pc-num {
      font-size: calc(var(--fs-figure) + 2px);
      line-height: calc(30px * var(--type, 1));
    }

    .pc-line {
      inline-size: 64px;
    }

    .pc-next-words {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }

    /* THE LIVE LINE STAYS ON A PHONE, under no rule: it is the one thing an empty card says. */
    .pc-foot {
      padding-block-start: var(--sp-3);
    }

    .pc-foot::before {
      display: none;
    }

    .pc-worked {
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
