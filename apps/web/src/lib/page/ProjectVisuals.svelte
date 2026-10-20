<!--
  What a project's page draws beside its shape blocks: a roadmap of its dated tasks, and the visuals its data earns
  (`visuals.ts`): money in and out by month as small bars, a dues calendar, a revenue trend.

  NOTHING DRAWN EMPTY: a roadmap needs two dated tasks, a visual needs its data, and each is a tile only while it has
  something to say. Each has "Show the data" under it, as the blocks above do. The roadmap is a horizontal line of time
  from 640px and the same marks as a list below it, so a phone reads it top to bottom. Both themes, from the tokens.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { roadmapOf, visualsFor, type Listing, type Months, type Mark } from '$lib/record/visuals.ts';
  import type { DataRow } from '$lib/record/project.ts';

  let {
    fields,
    decl,
    inByMonth = null,
    outByMonth = null,
    listings,
    format,
  }: {
    fields: Readonly<Record<string, unknown>>;
    decl: Parameters<typeof visualsFor>[0]['decl'];
    inByMonth?: Months | null;
    outByMonth?: Months | null;
    listings: readonly Listing[];
    format: (minor: number, currency: string) => string;
  } = $props();

  /* THE READER'S DAY, not the server's. */
  const today = $derived.by(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const uid = $props.id();

  const road = $derived(roadmapOf(listings, today));
  const visuals = $derived(visualsFor({ fields, decl }, { inByMonth, outByMonth, listings, today, format }));

  /* The marks with a "now" step among them in time order, so the phone's list and the line read the same. */
  type Step = (Mark & { now?: false }) | { now: true; key: string; at: number };
  const steps = $derived.by((): Step[] => {
    if (!road) return [];
    const out: Step[] = [...road.marks];
    const at = road.marks.findIndex((m) => m.day > road.today);
    out.splice(at === -1 ? out.length : at, 0, { now: true, key: 'now', at: road.todayAt });
    return out;
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
  <ol class="months" data-tone={tone} aria-label="{monthName(m.months[0]!.key)} to {monthName(m.months.at(-1)!.key)}">
    {#each m.months as x (x.key)}
      <li title="{monthLong(x.key)}: {format(x.value, m.currency)}">
        <span class="col" data-partial={x.partial} style:block-size="{Math.max(x.value > 0 ? 4 : 1, Math.round((x.value / peak(m)) * 100))}%"></span>
        <span class="mname">{monthName(x.key).charAt(0)}</span>
      </li>
    {/each}
  </ol>
  <p class="quiet">{format(m.total, m.currency)} over {m.months.length} months</p>
{/snippet}

{#if road || visuals.length > 0}
  <div class="visuals">
    {#if road}
      <div class="vis wide">
        <Tile icon="task" title="Roadmap">
          <ol class="road" aria-label="Roadmap">
            {#each steps as s (s.key)}
              {#if 'now' in s && s.now}
                <li class="step now" style:--at={s.at}><span class="dot" aria-hidden="true"></span><span class="what">Now</span></li>
              {:else}
                {@const m = s as Mark}
                <li class="step" data-state={m.state} data-milestone={m.milestone} style:--at={m.at} style:--lane={steps.indexOf(s) % 3} title="{dayWords(m.day)}">
                  <span class="dot" aria-hidden="true"></span>
                  <span class="what" dir="auto">{m.title}</span>
                  <span class="when">{dayWords(m.day)}{#if m.state === 'late'}, late{/if}</span>
                </li>
              {/if}
            {/each}
          </ol>
          {@render disclosure('road', roadRows, 'Roadmap')}
        </Tile>
      </div>
    {/if}
    {#each visuals as v (v.kind)}
      {@const w = v}
      <div class="vis" data-kind={w.kind}>
        <Tile icon={ICON[w.kind]} title={w.title}>
          {#if w.kind === 'in' || w.kind === 'out'}
            {@render bars(w.months, w.kind)}
          {:else if w.kind === 'revenue'}
            <ul class="trend">
              <li><span class="t-name">This period</span><span class="t-amount num">{format(w.trend.now, w.trend.currency)}</span><span class="t-bar"><span style:inline-size="{Math.max(4, Math.round((w.trend.now / Math.max(w.trend.now, w.trend.before, 1)) * 100))}%"></span></span></li>
              <li><span class="t-name">The period before</span><span class="t-amount num">{format(w.trend.before, w.trend.currency)}</span><span class="t-bar" data-before="true"><span style:inline-size="{Math.max(w.trend.before > 0 ? 4 : 0, Math.round((w.trend.before / Math.max(w.trend.now, w.trend.before, 1)) * 100))}%"></span></span></li>
            </ul>
            <p class="quiet">{change(w.trend.before, w.trend.now)}</p>
          {:else}
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
    min-inline-size: 0;
  }

  @media (width >= 640px) {
    .visuals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .vis.wide,
    .vis[data-kind='dues'] {
      grid-column: 1 / -1;
    }
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
    background: var(--ink);
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
      block-size: 112px;
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
    justify-content: flex-end;
    gap: 2px;
    min-inline-size: 0;
  }

  .col {
    display: block;
    min-block-size: 1px;
    border-radius: 2px 2px 0 0;
    background: var(--ink);
  }

  [data-tone='out'] .col {
    background: var(--dim);
  }

  .col[data-partial='true'] {
    opacity: 0.45;
  }

  .mname {
    flex: none;
    color: var(--dim);
    font-size: 10px;
    line-height: 12px;
    text-align: center;
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
    background: var(--ink);
  }

  .t-bar[data-before='true'] span {
    background: var(--dim);
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
    font-size: 11px;
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
