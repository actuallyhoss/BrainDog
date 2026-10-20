<!--
  What a project's page draws beside its shape blocks: a roadmap of its dated tasks, and the visuals its data earns
  (`visuals.ts`): money in and out by month as small bars, a dues calendar, a revenue trend.

  ROW 2 OF A PROJECT IS ITS PATH AND ITS MONEY (the plan of 20 October, batch 3b): the roadmap at eight columns of
  twelve and money at four from 1100px, money's lines with its first month-by-month bars under them, each bar at most
  24px wide with a rounded top, in the project's colour (`hue`), its value on hover and three months named under them.
  The rest of the visuals follow, half a row each.

  NOTHING DRAWN EMPTY: a roadmap needs two dated tasks, a visual needs its data, and each is a tile only while it has
  something to say. Each has "Show the data" under it, as the blocks above do. The roadmap is a horizontal line of time
  from 640px and the same marks as a list below it, so a phone reads it top to bottom. Both themes, from the tokens.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { lanesOf, roadmapOf, visualsFor, type Listing, type Months, type Mark } from '$lib/record/visuals.ts';
  import type { DataRow, MoneyLine } from '$lib/record/project.ts';

  let {
    fields,
    decl,
    inByMonth = null,
    outByMonth = null,
    listings,
    format,
    money = [],
    hue = null,
    moneyRows = [],
  }: {
    fields: Readonly<Record<string, unknown>>;
    decl: Parameters<typeof visualsFor>[0]['decl'];
    inByMonth?: Months | null;
    outByMonth?: Months | null;
    listings: readonly Listing[];
    format: (minor: number, currency: string) => string;
    /** The project's money this month, as the shape reads it (`moneyLines`): the lines over the Money tile's bars. */
    money?: readonly MoneyLine[];
    /** The project's own hue, which the bars and the path's finished stops are drawn in; none draws them in ink. */
    hue?: number | null;
    /** The rows behind the money lines, for the Money tile's "Show the data". */
    moneyRows?: readonly DataRow[];
  } = $props();

  /* THE READER'S DAY, not the server's. */
  const today = $derived.by(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const uid = $props.id();

  const road = $derived(roadmapOf(listings, today));
  const all = $derived(visualsFor({ fields, decl }, { inByMonth, outByMonth, listings, today, format }));
  /* THE FIRST MONTH-BY-MONTH BARS GO UNDER MONEY'S LINES, in row 2; the rest follow as tiles of their own. */
  const bars0 = $derived(all.find((v): v is Extract<typeof v, { kind: 'in' | 'out' }> => v.kind === 'in' || v.kind === 'out') ?? null);
  /* AND WHAT IT EARNED AGAINST THE PERIOD BEFORE: money is one tile, not three. */
  const rev = $derived(all.find((v): v is Extract<typeof v, { kind: 'revenue' }> => v.kind === 'revenue') ?? null);
  const visuals = $derived(all.filter((v) => v !== bars0 && v !== rev));
  const hasMoney = $derived(money.length > 0 || bars0 !== null || rev !== null);
  const MONEY: Record<MoneyLine['key'], string> = { in: 'In this month', out: 'Out this month', owed: 'Still to come in' };

  /* The marks with a "now" step among them in time order, so the phone's list and the line read the same. */
  type Step = (Mark & { now?: false }) | { now: true; key: string; at: number };
  const steps = $derived.by((): Step[] => {
    if (!road) return [];
    const out: Step[] = [...road.marks];
    const at = road.marks.findIndex((m) => m.day > road.today);
    out.splice(at === -1 ? out.length : at, 0, { now: true, key: 'now', at: road.todayAt });
    return out;
  });
  /* WHICH LINE EACH LABEL HANGS ON, from where each is drawn (`lanesOf`), so no two run into each other at any width:
     measured once drawn, again when the tile changes width or the fonts land. Until then, and on a phone where the road
     is a list, every third label steps down as before. */
  let roadEl = $state<HTMLOListElement>();
  let lanes = $state.raw<Readonly<Record<string, number>>>({});
  let laneCount = $state(3);
  $effect(() => {
    void steps;
    const el = roadEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (!matchMedia('(width >= 640px)').matches) return;
      const at = el.getBoundingClientRect().left;
      const items = [...el.querySelectorAll<HTMLElement>('li.step[data-key]')];
      const got = lanesOf(items.map((li) => {
        const r = li.getBoundingClientRect();
        return { left: r.left - at, right: r.right - at };
      }));
      const next = Object.fromEntries(items.map((li, i) => [li.dataset.key!, got[i]!]));
      if (JSON.stringify(next) !== JSON.stringify(lanes)) lanes = next;
      laneCount = Math.max(1, ...got.map((l) => l + 1));
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    void document.fonts?.ready.then(measure);
    return () => seen.disconnect();
  });
  const STATE: Record<Mark['state'], string> = { done: 'Done', late: 'Late', next: 'Next', later: 'Later' };
  const dayWords = (day: string): string => new Date(`${day}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const roadRows = $derived<DataRow[]>((road?.marks ?? []).map((m) => ({ key: `road#${m.key}`, title: m.title, detail: `${dayWords(m.day)}, ${STATE[m.state].toLowerCase()}${m.milestone ? ', milestone' : ''}`, href: null })));

  let open = $state<ReadonlySet<string>>(new Set());
  const toggle = (k: string) => {
    const next = new Set(open);
    if (!next.delete(k)) next.add(k);
    open = next;
  };

  const monthName = (key: string): string => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const monthLong = (key: string): string => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const peak = (m: Months): number => Math.max(...m.months.map((x) => x.value), 1);
  const change = (before: number, now: number): string => {
    if (before <= 0) return 'Nothing earned the period before.';
    const share = Math.round((Math.abs(now - before) / before) * 100);
    return share === 0 ? 'The same as the period before.' : `${share}% ${now > before ? 'above' : 'below'} the period before.`;
  };
  const ICON = { revenue: 'money', in: 'money', out: 'money', dues: 'calendar' } as const;
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
</script>

{#snippet disclosure(k: string, list: readonly DataRow[], label: string)}
  {#if list.length > 0}
    <button type="button" class="more" aria-expanded={open.has(k)} aria-controls="{uid}-{k}" onclick={() => toggle(k)}>
      {open.has(k) ? 'Hide the data' : 'Show the data'}<Icon name="chevron" size="s" />
    </button>
    {#if open.has(k)}
      <ul id="{uid}-{k}" class="items" aria-label={label}>
        {#each list as r (r.key)}
          <li class="item"><span class="item-title" dir="auto">{r.title}</span>{#if r.detail}<span class="item-detail">{r.detail}</span>{/if}</li>
        {/each}
      </ul>
    {/if}
  {/if}
{/snippet}

{#snippet bars(m: Months, tone: string)}
  {@const ticks = new Set([0, Math.floor((m.months.length - 1) / 2), m.months.length - 1])}
  <ol class="months" data-tone={tone} aria-label="{monthName(m.months[0]!.key)} to {monthName(m.months.at(-1)!.key)}">
    {#each m.months as x, n (x.key)}
      <li title="{monthLong(x.key)}: {format(x.value, m.currency)}">
        <span class="mval num" aria-hidden="true">{format(x.value, m.currency)}</span>
        <span class="col" data-partial={x.partial} style:block-size="{Math.max(x.value > 0 ? 4 : 1, Math.round((x.value / peak(m)) * 100))}%"></span>
        <span class="mname">{ticks.has(n) ? monthName(x.key) : ''}</span>
      </li>
    {/each}
  </ol>
  <p class="quiet">{format(m.total, m.currency)} over {m.months.length} months</p>
{/snippet}

{#snippet earned(w: Extract<(typeof all)[number], { kind: 'revenue' }>)}
  <ul class="trend">
    <li><span class="t-name">This period</span><span class="t-amount num">{format(w.trend.now, w.trend.currency)}</span><span class="t-bar"><span style:inline-size="{Math.max(4, Math.round((w.trend.now / Math.max(w.trend.now, w.trend.before, 1)) * 100))}%"></span></span></li>
    <li><span class="t-name">The period before</span><span class="t-amount num">{format(w.trend.before, w.trend.currency)}</span><span class="t-bar" data-before="true"><span style:inline-size="{Math.max(w.trend.before > 0 ? 4 : 0, Math.round((w.trend.before / Math.max(w.trend.now, w.trend.before, 1)) * 100))}%"></span></span></li>
  </ul>
  <p class="quiet">{change(w.trend.before, w.trend.now)}</p>
{/snippet}

{#if road || hasMoney || visuals.length > 0}
  <div class="visuals" data-hued={hue === null ? undefined : ''} style={hue === null ? undefined : `--hue:${hue}`}>
    {#if road}
      <div class="vis path" data-alone={hasMoney ? undefined : ''}>
        <Tile icon="task" title="Path">
          <ol class="road" aria-label="Path" bind:this={roadEl} style:--lanes={laneCount}>
            {#each steps as s (s.key)}
              {#if 'now' in s && s.now}
                <li class="step now" style:--at={s.at}><span class="dot" aria-hidden="true"></span><span class="what">Now</span></li>
              {:else}
                {@const m = s as Mark}
                <li class="step" data-key={m.key} data-state={m.state} data-milestone={m.milestone} style:--at={m.at} style:--lane={lanes[m.key] ?? steps.indexOf(s) % 3} title="{dayWords(m.day)}">
                  <span class="dot" aria-hidden="true"></span>
                  <span class="what" dir="auto">{m.title}</span>
                  <span class="when">{dayWords(m.day)}{#if m.state === 'late'}, late{/if}</span>
                </li>
              {/if}
            {/each}
          </ol>
          {@render disclosure('road', roadRows, 'Path')}
        </Tile>
      </div>
    {/if}
    {#if hasMoney}
      <div class="vis money" data-alone={road ? undefined : ''}>
        <Tile icon="money" title="Money">
          {#if money.length > 0}
            <ul class="lines">
              {#each money as m (m.key)}
                <li><span class="t-name">{MONEY[m.key]}</span><span class="t-amount num">{format(m.value, m.currency)}</span></li>
              {/each}
            </ul>
          {/if}
          {#if rev}{@render earned(rev)}{/if}
          {#if bars0}
            <p class="bars-name">{bars0.title}</p>
            {@render bars(bars0.months, bars0.kind)}
          {/if}
          {@render disclosure('money', [...moneyRows, ...(rev?.rows ?? []), ...(bars0?.rows ?? [])], 'Money')}
        </Tile>
      </div>
    {/if}
    {#each visuals as v (v.kind)}
      {@const w = v}
      <div class="vis" data-kind={w.kind}>
        <Tile icon={ICON[w.kind]} title={w.title}>
          {#if w.kind === 'in' || w.kind === 'out'}
            {@render bars(w.months, w.kind)}
          {:else if w.kind === 'dues'}
            <div class="cals">
              {#each w.calendar as c (c.key)}
                <div class="cal">
                  <p class="cal-name">{monthLong(c.key)}</p>
                  <ol class="grid" aria-label={monthLong(c.key)}>
                    {#each DAYS as d, i (i)}<li class="dow" aria-hidden="true">{d}</li>{/each}
                    {#each { length: c.lead } as _, i (i)}<li aria-hidden="true"></li>{/each}
                    {#each { length: c.days } as _, i (i)}
                      {@const p = c.dues.get(i + 1)}
                      <li class="d" data-pay={p ? (p.late ? 'late' : 'on') : undefined} title={p ? `${i + 1} ${monthName(c.key)}: ${p.what}${p.late ? ', late' : ''}` : undefined}>{i + 1}</li>
                    {/each}
                  </ol>
                </div>
              {/each}
            </div>
          {/if}
          {@render disclosure(w.kind, w.rows, w.title)}
        </Tile>
      </div>
    {/each}
  </div>
{/if}

<style>
  .visuals {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    margin-block-start: var(--inset);
  }

  .vis {
    display: grid;
    min-inline-size: 0;
  }

  .visuals {
    --ph: var(--ink);
  }

  .visuals[data-hued] {
    --ph: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  @media (width >= 640px) {
    .visuals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .vis.path,
    .vis[data-kind='dues'] {
      grid-column: 1 / -1;
    }
  }

  /* ROW 2 ON A WIDE SCREEN: the path at eight of twelve and money at four, and either alone across the row. */
  @media (width >= 1100px) {
    .visuals {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .vis {
      grid-column: span 6;
    }

    .vis.path {
      grid-column: span 8;
    }

    .vis.money {
      grid-column: span 4;
    }

    .vis.path[data-alone],
    .vis[data-kind='dues'] {
      grid-column: 1 / -1;
    }

    .vis.money[data-alone] {
      grid-column: span 6;
    }
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .lines li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .bars-name {
    margin: var(--sp-4) 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .quiet {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE ROADMAP: on a phone a list, a dot and a line to a row; from 640px the same rows lie along one line of time. */
  .road {
    position: relative;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    position: relative;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .what {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .when {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .dot {
    inline-size: 10px;
    block-size: 10px;
    justify-self: center;
    border: 2px solid var(--ink);
    border-radius: 50%;
    background: var(--bg, transparent);
  }

  .step[data-state='done'] .dot {
    border-color: var(--ph);
    background: var(--ph);
  }

  .step[data-state='later'] .dot {
    border-color: var(--dim);
  }

  .step[data-state='late'] .dot {
    border-color: var(--accent);
    background: var(--accent);
  }

  .step[data-state='late'] .when {
    color: var(--accent-text);
  }

  .step[data-state='done'] .what {
    color: var(--ink2);
  }

  .step[data-milestone='true'] .dot {
    border-radius: 2px;
    transform: rotate(45deg);
  }

  .now .dot {
    border: 0;
    inline-size: 16px;
    block-size: 2px;
    border-radius: 1px;
    background: var(--ink);
  }

  .now .what {
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  @media (width >= 640px) {
    .road {
      display: block;
      /* The line, then one 20px line of labels for each lane they need. */
      block-size: calc(56px + var(--lanes, 3) * 20px);
      padding-block-start: 20px;
    }

    .road::before {
      content: '';
      position: absolute;
      inset-inline: 0;
      inset-block-start: 26px;
      block-size: 2px;
      border-radius: 1px;
      background: var(--s2, var(--s1));
    }

    /* Each label hangs from its day and is slid by its own share of its width, so neither end leaves the tile. */
    .step {
      position: absolute;
      inset-inline-start: calc(var(--at) * 100%);
      inset-block-start: 20px;
      display: block;
      min-block-size: 0;
      max-inline-size: 11rem;
      transform: translateX(calc(var(--at) * -100%));
      font-size: var(--t-sm);
    }

    .step .dot {
      position: absolute;
      inset-block-start: 1px;
      inset-inline-start: calc(var(--at) * 100%);
      margin-inline-start: -5px;
    }

    .step .what {
      display: block;
      padding-block-start: calc(18px + var(--lane, 0) * 20px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .step .when {
      display: none;
    }

    .now {
      inset-block-start: 0;
      transform: translateX(calc(var(--at) * -100%));
    }

    .now .dot {
      inline-size: 2px;
      block-size: 18px;
      inset-block-start: 6px;
      margin-inline-start: -1px;
    }

    .now .what {
      padding: 0;
    }
  }

  /* MONEY BY MONTH: one column a month, the partial month lighter, in ink for what came in and dimmer for what went out. */
  .months {
    display: flex;
    align-items: stretch;
    gap: 3px;
    block-size: 72px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .months li {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-inline-size: 0;
  }

  /* AT MOST 24px WIDE WITH A ROUNDED TOP, in the project's colour; what went out a step lighter of the same. */
  .col {
    display: block;
    inline-size: 100%;
    max-inline-size: 24px;
    min-block-size: 1px;
    border-radius: 4px 4px 0 0;
    background: var(--ph);
  }

  [data-tone='out'] .col {
    background: color-mix(in oklab, var(--ph) 60%, var(--field));
  }

  /* THE VALUE ON HOVER, over its bar; the bar's title says it to a pointer that stays, and the data says it to everyone. */
  .mval {
    position: absolute;
    inset-block-start: -18px;
    padding: 0 var(--sp-1);
    border-radius: 4px;
    background: var(--tile);
    color: var(--ink);
    font-size: var(--t-xs);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .months li:hover .mval {
      opacity: 1;
    }
  }

  .col[data-partial='true'] {
    opacity: 0.45;
  }

  .mname {
    flex: none;
    min-block-size: 12px;
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 12px;
    text-align: center;
    white-space: nowrap;
  }

  .months li {
    position: relative;
  }

  .trend {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .trend li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-3);
    align-items: baseline;
  }

  .t-name {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .t-amount {
    color: var(--ink);
    font-weight: 500;
  }

  .t-bar {
    grid-column: 1 / -1;
    block-size: 6px;
    border-radius: 3px;
    background: var(--s1);
    overflow: hidden;
  }

  .t-bar span {
    display: block;
    block-size: 100%;
    border-radius: 3px;
    background: var(--ph);
  }

  .t-bar[data-before='true'] span {
    background: color-mix(in oklab, var(--ph) 45%, var(--field));
  }

  /* DUES: a small month at a time, a dot under each due day, the missed ones in the accent. */
  .cals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
    gap: var(--sp-4);
  }

  .cal-name {
    margin: 0 0 var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .grid li {
    position: relative;
    padding-block: 3px 8px;
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 14px;
    text-align: center;
  }

  .dow {
    color: var(--dim);
  }

  .d[data-pay]::after {
    content: '';
    position: absolute;
    inset-inline-start: calc(50% - 3px);
    inset-block-end: 1px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--ink);
  }

  .d[data-pay='late']::after {
    background: var(--accent);
  }

  .d[data-pay] {
    color: var(--ink);
  }

  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 32px;
    margin-block-start: var(--sp-2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .more {
      min-block-size: var(--tap);
    }
  }

  .more :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .more[aria-expanded='true'] :global(svg) {
    transform: rotate(90deg);
  }

  @media (hover: hover) and (pointer: fine) {
    .more:hover {
      color: var(--ink);
    }
  }

  .items {
    display: flex;
    flex-direction: column;
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-block-size: 44px;
    padding: 6px 0;
  }

  .item-title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .item-detail {
    color: var(--ink2);
    font-size: var(--t-sm);
  }
</style>
