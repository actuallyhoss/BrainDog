<!--
  Row 2 of a project's page: its Path and its Money (proj F3 and F8, section 4).

  THE PATH IS A STEPPER, NOT A TIME AXIS: the project's own work (`pathOf`), the last two finished, the one under way, the
  next three, evenly spaced along one line, never its bills (Money and More about say those). A finished stop is filled
  in the project's colour with a check, the one now is ringed in it, a late one or one waiting on a person is ringed in
  the red and says so in words, the rest are a plain ring. "All 17" in the head opens the whole list for the project.
  Under 640px it turns on its side: a 44px row a stop, the line down the left.

  MONEY LEADS WITH ITS FIGURE: what it earned this period at 22, how that compares with the period before in words (good
  or red), the two periods as 8px bars, what is still to come in as one line, and month bars only when there are three
  months with two of them above nought; otherwise the total is a line. Bars in the project's colour, the period before at
  45% of it over the tile so it holds in dark.

  ONE AT A TIME ON A PROJECT'S PAGE (24 October): Path and Money are each a block of the page (`only`), laid side by
  side by the page's own flow (`project-parts.ts`); with no `only` both are drawn in one row, as before.

  EACH TILE IS AS TALL AS ITS CONTENT (`align-self: start`), so neither stretches to the other. "Show the data" waits for
  the pointer on a wide screen with a fine pointer, and is always there on a phone.
-->
<script lang="ts">
  import { monthShort } from 'braindog-render';
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { at } from '$lib/at.ts';
  import { monthsDrawn, type Months, type Path, type Trend } from '$lib/record/visuals.ts';
  import type { DataRow, MoneyLine } from '$lib/record/project.ts';
  import { moneyShown } from './project-parts.ts';

  let {
    path = null,
    pathHref = null,
    stopHref = () => null,
    inByMonth = null,
    outByMonth = null,
    trend = null,
    earnedSaid = false,
    format,
    money = [],
    moneyRows = [],
    arrived = new Set<string>(),
    only = null,
  }: {
    path?: Path | null;
    /** The whole work list narrowed to the project, for "All 17". */
    pathHref?: string | null;
    /** Where a stop opens: its row. */
    stopHref?: (seq: number | null) => string | null;
    inByMonth?: Months | null;
    outByMonth?: Months | null;
    /** What it earned this period against the period before, where the project says both. */
    trend?: Trend | null;
    /** Whether the hero above already says what it earned, so this tile does not say the same figure again (P18). */
    earnedSaid?: boolean;
    format: (minor: number, currency: string) => string;
    /** The project's money this month, as the shape reads it (`moneyLines`). */
    money?: readonly MoneyLine[];
    /** The rows behind the money lines, for "Show the data". */
    moneyRows?: readonly DataRow[];
    /** Which figures changed in the read just landed (`data-arrived`, proj F9). */
    arrived?: ReadonlySet<string>;
    /** The one tile to draw, where the page lays each as a block of its own. */
    only?: 'path' | 'money' | null;
  } = $props();

  const uid = $props.id();

  /* ── money ── */
  const LINE: Record<MoneyLine['key'], string> = { in: 'In this month', out: 'Out this month', owed: 'Still to come in' };
  const FIGURE: Record<MoneyLine['key'], string> = { in: 'came in this month', out: 'went out this month', owed: 'still to come in' };
  /* THE FIGURE: what it earned this period where the project says so, else the first line of this month's money. */
  /* NOT WHAT IT EARNED WHEN THE HERO SAYS IT (P18): Kiln read "£18,400" in its hero and again here, so the tile leads
     with what is still to come in, and says how the earning moved in its line under it. */
  const lead = $derived.by(() => {
    if (earnedSaid) {
      const m = money.find((x) => x.key === 'owed') ?? money.find((x) => x.key === 'in') ?? money[0];
      if (m) return { key: m.key, value: m.value, currency: m.currency, label: FIGURE[m.key] };
    }
    if (trend && trend.now > 0) return { key: 'earned', value: trend.now, currency: trend.currency, label: 'earned this period' };
    const m = money.find((x) => x.key === 'in') ?? money[0];
    return m ? { key: m.key, value: m.value, currency: m.currency, label: FIGURE[m.key] } : null;
  });
  const lines = $derived(money.filter((m) => m.key !== lead?.key));
  const change = $derived.by(() => {
    if (!trend || trend.before <= 0) return null;
    const share = Math.round((Math.abs(trend.now - trend.before) / trend.before) * 100);
    /* WHAT IT EARNED, NAMED, when the figure over it is another one. */
    const what = lead?.key === 'earned' ? '' : 'Earned ';
    if (share === 0) return { text: what ? 'Earned the same as the period before' : 'The same as the period before', tone: 'same' };
    return trend.now > trend.before ? { text: `${what}${share}% above the period before`, tone: 'good' } : { text: `${what}${share}% below the period before`, tone: 'bad' };
  });
  const scale = $derived(trend ? Math.max(trend.now, trend.before, 1) : 1);
  /* THE MONTHS: what came in where that is a shape, else what went out; otherwise one line saying the total. */
  const months = $derived(monthsDrawn(inByMonth) ? { m: inByMonth, title: 'Money in by month' } : monthsDrawn(outByMonth) ? { m: outByMonth, title: 'Money out by month' } : null);
  const monthName = (key: string): string => monthShort(+key.slice(5, 7) - 1);
  const monthLong = (key: string): string => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const since = $derived.by(() => {
    if (months) return null;
    const firstOf = (m: Months) => m.months.find((x) => x.value > 0)?.key ?? m.months[0]?.key;
    for (const [m, word] of [[inByMonth, 'in'], [outByMonth, 'out']] as const) {
      if (m && m.total > 0) {
        const from = firstOf(m);
        return `${format(m.total, m.currency)} ${word}${from ? ` since ${monthLong(from)}` : ''}`;
      }
    }
    return null;
  });
  const peak = (m: Months): number => Math.max(...m.months.map((x) => x.value), 1);
  /* WHETHER MONEY SAYS ANYTHING, by the rule the page lays its part by (`moneyShown`), so the two never disagree. */
  const hasMoney = $derived(moneyShown(money, trend, inByMonth, outByMonth));
  const monthRows = $derived<DataRow[]>(months ? months.m.months.map((x) => ({ key: `m#${x.key}`, title: monthLong(x.key), detail: format(x.value, months.m.currency), href: null })) : []);
  const trendRows = $derived<DataRow[]>(
    trend
      ? [
          { key: 'rev#now', title: 'This period', detail: format(trend.now, trend.currency), href: null },
          { key: 'rev#before', title: 'The period before', detail: format(trend.before, trend.currency), href: null },
        ]
      : [],
  );
  const dataRows = $derived([...moneyRows, ...trendRows, ...monthRows]);
  let open = $state(false);

  /* ── the path ── */
  const doneCount = $derived(path ? path.stops.filter((s) => s.kind === 'done').length : 0);
</script>

{#if (path && only !== 'money') || (hasMoney && only !== 'path')}
  <div class="row2" data-alone={path && hasMoney && only === null ? undefined : ''}>
    {#if path && only !== 'money'}
      <div class="vis path">
        <Tile icon="observe" title="Path" href={pathHref ?? undefined} hrefLabel={pathHref ? `All ${path.total}` : undefined} id="part-path" data-part="Path" data-part-icon="observe">
          <ol class="steps" aria-label="Path" style:--stops={path.stops.length} style:--done={doneCount} data-many={path.stops.length > 5 ? '' : undefined}>
            {#each path.stops as s (s.key)}
              {@const href = stopHref(s.seq)}
              <li class="stop" data-kind={s.kind} data-arrived={arrived.has(`stop:${s.key}`) ? '' : undefined}>
                <span class="c" aria-hidden="true">{#if s.kind === 'done'}<Icon name="check" size="s" />{/if}</span>
                <span class="words">
                  {#if href}<a class="t" href={at(href)} dir="auto">{s.title}</a>{:else}<span class="t" dir="auto">{s.title}</span>{/if}
                  {#if s.sub}<span class="s" data-red={s.red ? '' : undefined}>{s.sub}</span>{/if}
                </span>
              </li>
            {/each}
          </ol>
        </Tile>
      </div>
    {/if}
    {#if hasMoney && only !== 'path'}
      <div class="vis money">
        <Tile icon="money" title="Money" id="part-money" data-part="Money" data-part-icon="money">
          <div class="mb">
          {#if lead}
            <p class="m-figure" data-arrived={arrived.has('money:lead') ? '' : undefined}>
              <span class="fig num">{format(lead.value, lead.currency)}</span>
              <span class="fig-label">{lead.label}</span>
            </p>
          {/if}
          {#if change}<p class="change" data-tone={change.tone}>{change.text}</p>{/if}
          {#if trend}
            <div class="periods" aria-hidden="true">
              <span class="bar"><span style:inline-size="{Math.max(trend.now > 0 ? 3 : 0, Math.round((trend.now / scale) * 100))}%"></span></span>
              <span class="bar" data-before><span style:inline-size="{Math.max(trend.before > 0 ? 3 : 0, Math.round((trend.before / scale) * 100))}%"></span></span>
            </div>
          {/if}
          {#if lines.length > 0}
            <ul class="m-lines">
              {#each lines as m (m.key)}
                <li data-arrived={arrived.has(`money:${m.key}`) ? '' : undefined}><span>{LINE[m.key]}</span><span class="m-amount num">{format(m.value, m.currency)}</span></li>
              {/each}
            </ul>
          {/if}
          {#if months}
            {@const m = months.m}
            {@const ticks = new Set([0, Math.floor((m.months.length - 1) / 2), m.months.length - 1])}
            <p class="bars-name">{months.title}</p>
            <ol class="months" aria-label="{monthLong(m.months[0]!.key)} to {monthLong(m.months.at(-1)!.key)}">
              {#each m.months as x, n (x.key)}
                <li title="{monthLong(x.key)}: {format(x.value, m.currency)}">
                  <span class="mval num" data-last={n === m.months.length - 1 ? '' : undefined}>{format(x.value, m.currency)}</span>
                  <span class="col" data-partial={x.partial} style:block-size="{Math.max(x.value > 0 ? 4 : 1, Math.round((x.value / peak(m)) * 100))}%"></span>
                  <span class="mname">{ticks.has(n) ? monthName(x.key) : ''}</span>
                </li>
              {/each}
            </ol>
          {:else if since}
            <p class="since">{since}</p>
          {/if}
          {#if dataRows.length > 0}
            <button type="button" class="show-data" aria-expanded={open} aria-controls="{uid}-money" onclick={() => (open = !open)}>
              {open ? 'Hide the data' : 'Show the data'}<Icon name="chevron" size="s" />
            </button>
            {#if open}
              <ul id="{uid}-money" class="data-items" aria-label="Money">
                {#each dataRows as r (r.key)}
                  <li class="data-item"><span class="item-title" dir="auto">{r.title}</span>{#if r.detail}<span class="item-detail num">{r.detail}</span>{/if}</li>
                {/each}
              </ul>
            {/if}
          {/if}
          </div>
        </Tile>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* ROW 2: the path at eight of twelve and money at four from 1100px, either alone across the row; stacked below. */
  .row2 {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    align-items: start;
  }

  .vis {
    display: grid;
    min-inline-size: 0;
  }

  @media (width >= 1100px) {
    .row2 {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }

    .row2[data-alone] {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── the stepper ── */
  .steps {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: repeat(var(--stops), minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE LINE, centre of the first stop to centre of the last, and the finished part of it in the project's colour. */
  .steps::before,
  .steps::after {
    content: '';
    position: absolute;
    z-index: -1;
    inset-block-start: 11px;
    inset-inline-start: calc(100% / var(--stops) / 2);
    block-size: 2px;
    border-radius: 1px;
  }

  .steps::before {
    inset-inline-end: calc(100% / var(--stops) / 2);
    background: var(--rule-strong);
  }

  .steps::after {
    inline-size: calc(100% / var(--stops) * max(var(--done) - 1, 0));
    background: var(--ph-fill, var(--ph));
  }

  .stop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
    padding-inline: 6px;
    text-align: center;
  }

  .c {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    inline-size: 24px;
    block-size: 24px;
    border: 2px solid var(--rule-strong);
    border-radius: 50%;
    background: var(--tile);
    color: var(--tile);
  }

  .c :global(.icon) {
    inline-size: 13px;
    block-size: 13px;
    stroke-width: 2.4;
  }

  .stop[data-kind='done'] .c {
    border-color: var(--ph-fill, var(--ph));
    background: var(--ph-fill, var(--ph));
    color: var(--tile);
    animation: fill-in var(--d-panel) var(--ease-emphasis) both;
  }

  /* NO GLOW (SPEC 1, "Now" stop): the stop being worked on is the project's tint inside its colour's 2px ring, where a
     5px halo of the hue stood round it. */
  .stop[data-kind='now'] .c {
    border: 2px solid var(--ph-fill, var(--ph));
    background: var(--ph-tint, var(--tile-2));
    box-shadow: none;
  }

  .stop:is([data-kind='late'], [data-kind='waits']) .c {
    border-color: var(--red);
  }

  @keyframes fill-in {
    from {
      scale: 0.6;
    }
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  .t {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: 600;
    line-height: 20px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE WHOLE STOP IS THE LINK'S TARGET (P17): the title alone was 20px tall on a phone. The stop is the containing
     block and the title is not, so its clipped words do not clip this. On `::before`, because a touch target is
     measured as the element and its `::before` (`a11y.css`'s `.tap`). */
  a.t::before {
    content: '';
    position: absolute;
    inset: 0;
  }

  a.t:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .stop[data-kind='done'] .t {
    color: var(--ink-2);
  }

  .s {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .s[data-red] {
    color: var(--red);
  }

  /* ON ITS SIDE ON A PHONE: a 44px row a stop, the circle, the title and the day at the right, the line down the left.
     Five stops at most, so the oldest finished one goes when there are six. */
  @media (width < 640px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
    }

    .steps[data-many] .stop:first-child {
      display: none;
    }

    .steps::before,
    .steps::after {
      inset-block: 22px 22px;
      inset-inline-start: 11px;
      inline-size: 2px;
      block-size: auto;
    }

    .steps::after {
      display: none;
    }

    .stop {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-block-size: 44px;
      padding: 0;
      text-align: start;
    }

    .words {
      flex-direction: row;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .t {
      font-size: var(--fs-body);
      font-weight: 500;
      line-height: 20px;
    }

    .s {
      flex: none;
      font-size: var(--fs-meta);
    }
  }

  /* ── money ── */
  .mb {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .m-figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    margin: 0;
  }

  .fig {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 28px;
  }

  .fig-label {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .change {
    margin: 4px 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .change[data-tone='good'] {
    color: var(--good);
  }

  .change[data-tone='bad'] {
    color: var(--red);
  }

  .periods {
    display: grid;
    gap: 6px;
    margin-block-start: 12px;
  }

  .bar {
    display: block;
    block-size: 8px;
    border-radius: 4px;
    background: var(--tile-2);
    overflow: hidden;
  }

  .bar > span {
    display: block;
    block-size: 100%;
    border-radius: 4px;
    background: var(--ph-fill, var(--ph));
  }

  .bar[data-before] > span {
    background: var(--ph-2, color-mix(in oklab, var(--ph-fill, var(--ph)) 45%, var(--tile)));
  }

  .m-lines {
    display: grid;
    gap: 4px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  .m-lines li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .m-amount {
    color: var(--ink);
    font-weight: 600;
  }

  .since {
    margin: 12px 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .bars-name {
    margin: 16px 0 8px;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .months {
    display: flex;
    align-items: stretch;
    gap: 4px;
    block-size: 96px;
    margin: 0;
    padding: 18px 0 0;
    border-block-end: 1px solid var(--rule-strong);
    list-style: none;
  }

  .months li {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    min-inline-size: 0;
  }

  .col {
    display: block;
    inline-size: 100%;
    max-inline-size: 24px;
    min-block-size: 1px;
    border-radius: 4px 4px 0 0;
    background: var(--ph-fill, var(--ph));
  }

  /* A MONTH ONLY PARTLY KEPT IS THE PROJECT'S SECOND TONE (domains lane, 2 Nov): at 45% opacity it took the tile's colour
     through it, an olive bar under a gold project in the dark and a slate one under a blue. */
  .col[data-partial='true'] {
    background: var(--ph-2, color-mix(in oklab, var(--ph-fill, var(--ph)) 45%, var(--tile)));
  }

  .mval {
    position: absolute;
    inset-block-start: -18px;
    color: var(--ink);
    font-size: var(--fs-cap);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
  }

  .mval[data-last] {
    opacity: 1;
  }

  @media (hover: hover) and (pointer: fine) {
    .months:hover .mval[data-last] {
      opacity: 0;
    }

    .months li:hover .mval {
      opacity: 1;
    }
  }

  .mname {
    position: absolute;
    inset-block-end: -18px;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 14px;
    white-space: nowrap;
  }

  .months + .show-data,
  .months ~ .show-data {
    margin-block-start: 26px;
  }

  .show-data {
    align-self: start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-block-size: 32px;
    margin-block-start: 8px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
    transition: opacity var(--d-swap, 120ms) var(--ease-standard, ease);
  }

  .show-data :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .show-data[aria-expanded='true'] :global(svg) {
    transform: rotate(90deg);
  }

  @media (pointer: coarse) {
    .show-data {
      min-block-size: var(--tap);
    }
  }

  /* SHOW THE DATA WAITS FOR THE POINTER on a wide screen: there, but quiet, until the tile is hovered or holds focus. */
  @media (hover: hover) and (pointer: fine) and (width >= 1100px) {
    .show-data[aria-expanded='false'] {
      opacity: 0;
    }

    .vis:hover .show-data,
    .vis:focus-within .show-data {
      opacity: 1;
    }

    .show-data:hover {
      color: var(--ink);
    }
  }

  .data-items {
    display: flex;
    flex-direction: column;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .data-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-block-size: 36px;
    padding-block: 6px;
    border-block-start: 1px solid var(--rule);
    font-size: var(--fs-ctl);
  }

  .item-title {
    color: var(--ink);
  }

  .item-detail {
    color: var(--ink-2);
  }

  [data-arrived] {
    border-radius: 6px;
    animation: landed 1.5s var(--ease-out, ease-out);
  }

  @keyframes landed {
    from {
      background-color: var(--arrived);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-arrived] {
      animation: landed 1.5s step-end;
    }

    .stop[data-kind='done'] .c {
      animation: none;
    }
  }
</style>
