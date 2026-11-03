<!--
  The changelog: what shipped and when, drawn as a chart of days, every day under its month, a control that shows one
  kind at a time, and an Atom feed.

  14 §5 calls this page "proof of life". Proof of life is only proof if it is true, which is why the entries live in
  `./entries.ts`, where `../../../scripts/changelog.mjs` holds them against `git log`. The chart, its one line and every
  count are taken from the same entries when the page is built, so none of them can drift from the list.

  THE SITE'S DESIGN: the night head with the count and the feed, then the board. At a desk the control and
  the chart sit in a column that stays in view beside the months; on a phone they come first. A month is a heading and
  its tally, and each day under it is a tile that folds, the newest open and marked "Latest". The month's count is every
  entry in it, the newest day's included, so a month and its days never disagree.

  NO HUES. A kind is a word beside its own glyph (a plus for shipped, a tick for fixed, arrows for changed), so it is
  told by shape and word, and the chart is one ink with the busiest day in the strong one.

  IT READS WITHOUT SCRIPTING. The folds are native `<details>`, so every entry is one press away with no script at all.
  The control and the permalink reveal are the only parts that need it.

  THE SHAPING IS `./log.ts`, shared with `/changelog.xml`, so an entry's anchor here and its id in the feed are one
  string. Nothing sorts: the order inside a day is editorial, and `entries.ts` owns it.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link to
  one would be a 404 with a promise attached.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { site } from '$lib/copy.ts';
  import { FEED } from '$lib/links.ts';
  import PageHead from '$lib/site/PageHead.svelte';
  import { DAYS, ITEMS, KINDS, LATEST, MONTHS, parts, tally, type Item, type Kind } from './log.ts';

  const copy = site.changelog;

  /* The kind's shape: new work is a plus, a repair a tick, a change of course two arrows. */
  const GLYPH: Record<Kind, IconName> = { shipped: 'plus', fixed: 'check', changed: 'repeat' };

  /** Counted from `entries.ts`, so the numbers cannot drift from the list. */
  const ALL = tally(ITEMS);

  const shortDate = (date: string): string => {
    const d = parts(date);
    return copy.day(d.day, d.month);
  };

  /* ── The chart: every calendar day from the first entry to the newest, one bar a day ───────────────────────────── */

  const DAY_MS = 86_400_000;
  const utc = (date: string): number => {
    const d = parts(date);
    return Date.UTC(d.year, d.month - 1, d.day);
  };
  const byDate = new Map(DAYS.map((d) => [d.date, d.entries.length]));
  const oldest = DAYS.at(-1)?.date ?? '';
  const newest = DAYS[0]?.date ?? '';
  const span = oldest === '' ? 0 : Math.round((utc(newest) - utc(oldest)) / DAY_MS) + 1;
  const CHART = Array.from({ length: span }, (_, i) => {
    const date = new Date(utc(oldest) + i * DAY_MS).toISOString().slice(0, 10);
    return { date, day: parts(date).day, total: byDate.get(date) ?? 0 };
  });
  const most = Math.max(0, ...CHART.map((c) => c.total));
  /* The busiest day, the newest of them on a tie, because it is the one a reader has not heard about yet. */
  const busiest = CHART.findLast((c) => c.total === most)?.date ?? newest;
  const quiet = CHART.filter((c) => c.total === 0).length;
  /* THREE STEPS UP THE AXIS, each a whole number of entries, so the top line is at or just over the busiest day. */
  const step = Math.max(1, Math.ceil(most / 3));
  const top = step * 3;
  const TICKS = [3, 2, 1, 0].map((n) => n * step);
  /* A date under the first bar, the last, and every seventh between: the rest would be a row of digits. */
  const labelled = (i: number): boolean => i === 0 || i === CHART.length - 1 || (i % 7 === 0 && CHART.length - 1 - i > 2);

  /** THE KIND A READER HAS ASKED FOR, one at a time as a segmented control is, and `null` for all of them. */
  let only = $state<Kind | null>(null);
  const filtering = $derived(only !== null);
  const shows = (kind: Kind): boolean => only === null || only === kind;
  const any = (entries: readonly Item[]): boolean => entries.some((e) => shows(e.kind));

  /** A month's tally as one line: "17 entries · 14 shipped · 2 fixed · 1 changed", a kind it has none of left out. */
  const said = (total: number, count: Record<Kind, number>): string =>
    [copy.entries(total), ...KINDS.filter((k) => count[k] > 0).map((k) => copy.tally(count[k], copy.kind[k]))].join(' · ');

  /**
   * A PERMALINK INTO A CLOSED FOLD OPENS IT. A browser scrolls to a fragment only if the element has a box, and an
   * entry inside a closed `<details>` has none, so a shared link would land on the top of the page. This opens every
   * fold around the target and then scrolls to it, on arrival and whenever the fragment changes.
   */
  const reveal = (): void => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    for (let fold = target.closest('details'); fold; fold = fold.parentElement?.closest('details') ?? null) fold.open = true;
    target.scrollIntoView({ block: 'start' });
  };

  $effect(() => {
    reveal();
  });
</script>

<svelte:window onhashchange={reveal} />

<Seo title={site.meta.changelog.title} description={site.meta.changelog.description} path="/changelog" />
<svelte:head>
  <link rel="alternate" type="application/atom+xml" title={copy.feedTitle} href={FEED} />
</svelte:head>
<!-- ONE ENTRY: its kind as a glyph and a word, then its title with its permalink, and its body. -->
{#snippet entry(item: Item)}
  <li class="entry" id={item.anchor} hidden={!shows(item.kind)}>
    <span class="kind"><Icon name={GLYPH[item.kind]} size="s" />{copy.filter[item.kind]}</span>
    <div class="entry-main">
      <h4 class="entry-title">
        {item.title}
        <a class="permalink" href="#{item.anchor}" aria-label={copy.permalink(item.title)}><Icon name="link" size="s" /></a>
      </h4>
      <p class="entry-body">{item.body}</p>
    </div>
  </li>
{/snippet}

<PageHead title={copy.title} lead={copy.lede}>
  <p class="head-row">
    <span class="head-count num">{copy.count(ITEMS.length, DAYS.length)}</span>
    <a class="more" href={FEED}>{copy.follow}<Icon name="arrow" size="m" /></a>
  </p>
</PageHead>

<!-- No name of its own: the head above is the region the page title names. -->
<section class="board">
  <div class="wrap layout">
    <aside class="side">
      <!-- ONE SEGMENTED CONTROL: all, or one kind. It needs scripting; without it every fold still reads. -->
      <div class="track" role="group" aria-label={copy.filters}>
        <button type="button" class="seg" aria-pressed={only === null} onclick={() => (only = null)}>
          {copy.all}<span class="seg-n num">{ITEMS.length}</span>
        </button>
        {#each KINDS as kind (kind)}
          <button type="button" class="seg" aria-pressed={only === kind} onclick={() => (only = kind)}>
            <Icon name={GLYPH[kind]} size="s" />{copy.filter[kind]}<span class="seg-n num">{ALL[kind]}</span>
          </button>
        {/each}
      </div>

      {#if CHART.length > 0}
        <section class="tile chart-tile" aria-labelledby="days-title">
          <header class="chart-head">
            <h2 class="tile-h" id="days-title">{copy.byDay}</h2>
            <span class="chart-span">{copy.span(shortDate(oldest), shortDate(newest))}</span>
          </header>
          <div class="chart" role="img" aria-label={copy.chartLabel(shortDate(oldest), shortDate(newest), shortDate(busiest), most)}>
            <div class="plot" aria-hidden="true">
              {#each TICKS as t (t)}
                <span class="grid-line" style="--at: {t / top}"><span class="tick num">{t}</span></span>
              {/each}
              <div class="bars" style="--n: {CHART.length}">
                {#each CHART as c (c.date)}
                  <span class="col">
                    {#if c.total > 0}<span class="bar" class:most={c.date === busiest} style="--v: {c.total / top}"></span>{/if}
                  </span>
                {/each}
              </div>
            </div>
            <div class="x" aria-hidden="true" style="--n: {CHART.length}">
              {#each CHART as c, i (c.date)}
                <span class="x-day num">{labelled(i) ? c.day : ''}</span>
              {/each}
            </div>
          </div>
          <p class="reading">{copy.reading(shortDate(busiest), most, ALL.shipped, ALL.fixed, quiet)}</p>
        </section>
      {/if}
    </aside>

    <div class="months">
      {#each MONTHS as month (month.key)}
        <section class="month" aria-labelledby="m-{month.key}" hidden={!month.days.some((d) => any(d.entries))}>
          <header class="month-head">
            <h2 class="month-title" id="m-{month.key}">{copy.month(month.month, month.year)}</h2>
            <p class="month-tally num">{said(month.total, month.tally)}</p>
          </header>
          <div class="days">
            {#each month.days as day (day.date)}
              <!-- A filter opens every fold, because a reader who asked for fixes wants to see them, not closed rows. -->
              <details class="day" open={filtering || day === LATEST} hidden={!any(day.entries)}>
                <summary class="day-sum">
                  <h3 class="day-date"><time class="num" datetime={day.date}>{shortDate(day.date)}</time></h3>
                  {#if day === LATEST}<span class="latest">{copy.latest}</span>{/if}
                  <span class="day-first">{day.entries[0]?.title}</span>
                  <span class="day-n num">{copy.dayEntries(day.entries.length)}</span>
                  <span class="chev" aria-hidden="true"><Icon name="chevron-down" size="m" /></span>
                </summary>
                <ol class="entries">
                  {#each day.entries as item (item.anchor)}
                    {@render entry(item)}
                  {/each}
                </ol>
              </details>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
</section>

<style>
  /* An author `display` beats the `hidden` attribute, so every element the control hides says so here. */
  .month[hidden],
  .day[hidden],
  .entry[hidden] {
    display: none;
  }

  /* ── The head, on the night ground ─────────────────────────────────────── */

  .head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 24px;
    margin: 28px 0 0;
  }

  .head-count {
    color: var(--on-night-2);
    font-size: var(--t-site-15);
  }

  .head-row .more {
    margin: 0;
    color: var(--on-night);
  }

  /* ── The board ─────────────────────────────────────────────────────────── */

  .board {
    padding-block: 56px 96px;
    background: var(--board);
  }

  /* THE CONTROL AND THE CHART IN A COLUMN BESIDE THE MONTHS at a desk, staying in view; above them under 1060. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }

  .side {
    display: grid;
    gap: 16px;
    min-inline-size: 0;
  }

  @media (width >= 1060px) {
    .layout {
      grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
      gap: 48px;
    }

    .side {
      position: sticky;
      inset-block-start: 24px;
    }
  }

  /* ── The control: one pill track, the chosen segment in ink ─────────────── */

  .track {
    display: flex;
    gap: 2px;
    justify-self: start;
    max-inline-size: 100%;
    padding: 4px;
    overflow-x: auto;
    border-radius: 999px;
    background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--rule);
    scrollbar-width: none;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  .seg {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    min-block-size: 36px;
    padding-inline: 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink2);
    font: 500 var(--t-site-14) / 1 var(--ui);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .seg:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .seg[aria-pressed='true'] {
    background: var(--ink);
    color: var(--page);
  }

  .seg-n {
    margin-inline-start: 2px;
    color: var(--muted);
    font-weight: 400;
  }

  .seg[aria-pressed='true'] .seg-n {
    color: inherit;
    opacity: 0.7;
  }

  /* ── The chart tile ────────────────────────────────────────────────────── */

  /* A TILE: flat, radius 16, no edge and no shadow. */
  .tile {
    gap: 16px;
    padding: 24px;
    border-radius: 16px;
  }

  .chart-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }

  .tile-h {
    font-size: var(--t-site-21);
    line-height: 1.2;
    letter-spacing: -0.021em;
  }

  .chart-span {
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .chart {
    --axis: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* THE PLOT IS 128 TALL, its grid lines at each step up the axis, and the bars stand on the bottom one. */
  .plot {
    position: relative;
    block-size: 128px;
    margin-block-start: 8px;
  }

  .grid-line {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(var(--at) * 100%);
    border-block-end: 1px solid var(--rule);
  }

  .tick {
    position: absolute;
    inset-inline-start: 0;
    inset-block-end: -8px;
    inline-size: calc(var(--axis) - 6px);
    color: var(--muted);
    font-size: var(--t-app-xs);
    line-height: 16px;
    text-align: end;
  }

  .bars,
  .x {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
    margin-inline-start: var(--axis);
  }

  .bars {
    position: absolute;
    inset-block: 0;
    inset-inline: var(--axis) 0;
    margin-inline-start: 0;
  }

  .col {
    display: flex;
    flex-direction: column-reverse;
    block-size: 100%;
  }

  /* A DAY'S BAR in the chart's quiet ink; the busiest day in the strong one. */
  .bar {
    block-size: calc(var(--v) * 100%);
    min-block-size: 3px;
    border-radius: 3px 3px 1px 1px;
    background: var(--bar);
  }

  .bar.most {
    background: var(--chart);
  }

  .x-day {
    color: var(--muted);
    font-size: var(--t-app-xs);
    text-align: center;
    white-space: nowrap;
  }

  /* ── The months ────────────────────────────────────────────────────────── */

  .months {
    display: grid;
    gap: 48px;
    min-inline-size: 0;
  }

  .month-head {
    display: grid;
    gap: 6px;
    margin-block-end: 16px;
  }

  .month-title {
    font-size: clamp(28px, 2.6vw, 36px);
    line-height: 1.05;
    letter-spacing: -0.028em;
  }

  .month-tally {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-site-15);
  }

  .days {
    display: grid;
    gap: 8px;
  }

  /* A DAY IS A TILE THAT FOLDS: its head the whole row, the entries under it. */
  .day {
    border-radius: 16px;
    background: var(--tile);
  }

  .day-sum {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 60px;
    padding: 8px 20px;
    border-radius: 16px;
    list-style: none;
    cursor: pointer;
  }

  .day-sum::-webkit-details-marker {
    display: none;
  }

  .day-sum:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .day-date {
    flex: none;
    min-inline-size: 7.5em;
    color: var(--ink);
    font-size: var(--t-site-17);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  /* "LATEST", a word in a quiet pill and never a colour. */
  .latest {
    flex: none;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--board);
    color: var(--ink);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .day-first {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-site-15);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .day[open] .day-first {
    visibility: hidden;
  }

  .day-n {
    flex: none;
    margin-inline-start: auto;
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .chev {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--muted);
    transition: transform var(--d-state) var(--ease-out);
  }

  .day[open] > summary .chev {
    transform: rotate(180deg);
  }

  /* ── An entry ──────────────────────────────────────────────────────────── */

  .entries {
    display: grid;
    margin: 0;
    padding: 0 20px 8px;
    list-style: none;
  }

  /* AN ENTRY IS A ROW: its kind in a narrow column, then its title and its body, a hairline above each. */
  .entry {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    gap: 12px;
    padding-block: 16px;
    border-block-start: 1px solid var(--rule);
    /* A permalink lands with room above it. */
    scroll-margin-block-start: 24px;
  }

  .kind {
    display: inline-flex;
    align-items: center;
    align-self: start;
    justify-self: start;
    gap: 5px;
    min-block-size: 24px;
    padding-inline: 8px 10px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--rule);
    color: var(--ink2);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .entry-main {
    display: grid;
    gap: 4px;
    min-inline-size: 0;
  }

  .entry-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--ui);
    font-size: var(--t-site-16);
    font-weight: 600;
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* Always drawn, because a phone has no hover to find it with; quiet until it is pointed at. */
  .permalink {
    position: relative;
    display: inline-flex;
    margin-inline-start: 6px;
    color: var(--muted);
    vertical-align: -0.1em;
    opacity: 0.6;
    transition: opacity var(--d-state) var(--ease-out);
  }

  /* THE LINK GLYPH IS SMALL AND THE PRESS IS NOT: a 44px square round it, drawn by nothing. */
  .permalink::before {
    content: '';
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: var(--tap);
    block-size: var(--tap);
    translate: -50% -50%;
  }

  .entry:hover .permalink,
  .permalink:focus-visible {
    opacity: 1;
  }

  .entry-body {
    max-inline-size: 42em;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.55;
    text-wrap: pretty;
  }

  @media (hover: hover) and (pointer: fine) {
    .seg[aria-pressed='false']:hover {
      background: var(--soft);
      color: var(--ink);
    }

    .day-sum:hover .chev,
    .day-sum:hover .day-date {
      color: var(--ink);
    }
  }

  /* ── A phone: 44 under a thumb, the kind over its title, and a day's first title gives way to its count ───── */

  @media (max-width: 760px) {
    .board {
      padding-block: 24px 64px;
    }

    .seg {
      min-block-size: var(--tap);
    }

    .tile {
      padding: 20px;
    }

    .plot {
      block-size: 104px;
    }

    .x-day:not(:first-child, :last-child) {
      visibility: hidden;
    }

    .months {
      gap: 40px;
    }

    .day-sum {
      padding-inline: 16px;
    }

    .day-date {
      min-inline-size: 0;
    }

    .day-first {
      display: none;
    }

    .entries {
      padding-inline: 16px;
    }

    .entry {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
  }
</style>
