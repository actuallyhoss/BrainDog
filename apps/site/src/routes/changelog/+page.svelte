<!--
  The changelog: the log drawn as a chart, the newest day in full, and every other day folded under its month, with
  a filter per kind and an Atom feed beside it.

  14 §5 calls this page "proof of life". Proof of life is only proof if it is true, which is why the entries live in
  `./entries.ts`, where `../../../scripts/changelog.mjs` holds them against `git log`. The chart and its one line are
  counted from the same entries when the page is built, so neither can drift from the list.

  THE PAGE IS TILES ON THE GROUND (the design system). The opening tile holds the heading, the count, the feed and the three
  kinds as filters; beside it every entry is drawn by the day it shipped, stacked by kind. Under them, the newest day
  is open in full, and each month is a tile of folded days, a row each.

  IT READS WITHOUT SCRIPTING. The folds are native `<details>`, so every entry is one press away with no script at all.
  The filters and the permalink reveal are the only parts that need it.

  THE SHAPING IS `./log.ts`, shared with `/changelog.xml`, so an entry's anchor here and its id in the feed are one
  string. Nothing sorts: the order inside a day is editorial, and `entries.ts` owns it.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link to
  one would be a 404 with a promise attached.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { Hue } from '$lib/icons.ts';
  import { site } from '$lib/copy.ts';
  import { FEED } from '$lib/links.ts';
  import { DAYS, ITEMS, KINDS, LATEST, MONTHS, parts, tally, type Item, type Kind, type Tally } from './log.ts';

  const copy = site.changelog;

  /* The word is the meaning and the hue agrees with it: green for new work, blue for a repair, amber for a change of
     course. Never red: nothing in a log of what shipped needs the reader. */
  const HUE: Record<Kind, Hue> = { shipped: 'earn', fixed: 'info', changed: 'warn' };

  /** Counted from `entries.ts`, so the numbers cannot drift from the list. */
  const ALL = tally(ITEMS);

  const shortDate = (date: string): string => {
    const d = parts(date);
    return copy.day(d.day, d.month);
  };

  const longDate = (date: string): string => {
    const d = parts(date);
    return copy.date(d.day, d.month, d.year);
  };

  /* ── The chart: every calendar day from the first entry to the newest, stacked by kind ─────────────────────────── */

  const DAY_MS = 86_400_000;
  const utc = (date: string): number => {
    const d = parts(date);
    return Date.UTC(d.year, d.month - 1, d.day);
  };
  const EMPTY: Tally = { shipped: 0, fixed: 0, changed: 0 };
  const byDate = new Map(DAYS.map((d) => [d.date, tally(d.entries)]));
  const oldest = DAYS.at(-1)?.date ?? '';
  const newest = DAYS[0]?.date ?? '';
  const span = oldest === '' ? 0 : Math.round((utc(newest) - utc(oldest)) / DAY_MS) + 1;
  const CHART = Array.from({ length: span }, (_, i) => {
    const date = new Date(utc(oldest) + i * DAY_MS).toISOString().slice(0, 10);
    const count = byDate.get(date) ?? EMPTY;
    return { date, day: parts(date).day, count, total: count.shipped + count.fixed + count.changed };
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

  /**
   * THE KINDS A READER HAS ASKED FOR, and none means all. A pill adds its kind and a second press takes it away, so
   * "Shipped and Fixed" is two presses and clearing is the same presses again.
   */
  let only = $state<Kind[]>([]);
  const filtering = $derived(only.length > 0);
  const shows = (kind: Kind): boolean => only.length === 0 || only.includes(kind);
  const any = (entries: readonly Item[]): boolean => entries.some((e) => shows(e.kind));
  const toggle = (kind: Kind): void => {
    only = only.includes(kind) ? only.filter((k) => k !== kind) : [...only, kind];
  };

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

<svelte:head>
  <title>{site.meta.changelog.title}</title>
  <meta name="description" content={site.meta.changelog.description} />
  <link rel="canonical" href="https://brain.dog/changelog" />
  <link rel="alternate" type="application/atom+xml" title={copy.feedTitle} href={FEED} />
  <meta property="og:url" content="https://brain.dog/changelog" />
  <meta property="og:title" content={site.meta.changelog.title} />
  <meta property="og:description" content={site.meta.changelog.description} />
</svelte:head>

{#snippet tallies(count: Record<Kind, number>)}
  <span class="tallies">
    {#each KINDS as kind}
      {#if count[kind] > 0}
        <span class="tally" data-hue={HUE[kind]}><span class="dot"></span>{copy.tally(count[kind], copy.kind[kind])}</span>
      {/if}
    {/each}
  </span>
{/snippet}

<!-- ONE ENTRY, drawn the same under "Latest" and inside a month: its kind as a dot and a word, then its title and
     its body. Only its heading level differs, because inside a month it sits one level deeper. -->
{#snippet entry(item: Item, level: 'h3' | 'h4')}
  <li class="entry" id={item.anchor} hidden={!shows(item.kind)}>
    <span class="kind" data-hue={HUE[item.kind]}><span class="dot"></span>{copy.kind[item.kind]}</span>
    <div class="entry-main">
      <svelte:element this={level} class="entry-title">
        {item.title}
        <a class="permalink" href="#{item.anchor}" aria-label={copy.permalink(item.title)}><Icon name="link" size="s" /></a>
      </svelte:element>
      <p class="entry-body">{item.body}</p>
    </div>
  </li>
{/snippet}

<section class="band" aria-labelledby="changelog-title">
  <div class="in">
    <div class="tiles">
      <!-- THE OPENING TILE: what the log is, how much of it there is, the feed, and the kinds as filters. -->
      <article class="tile lead span-4 opening">
        <h1 class="h2" id="changelog-title">{copy.title}</h1>
        <p class="lede">{copy.lede}</p>
        <p class="count">
          <span class="count-all">{copy.count(ITEMS.length, DAYS.length)}</span>
          <a class="btn btn-sm" href={FEED}>{copy.follow}<Icon name="arrow" size="s" /></a>
        </p>
        <!-- THE FILTERS ARE THE COUNTS, so the tile says how many of each kind there are and offers to show only
             those. They need scripting; without it the folds below still read. -->
        <div class="filters-wrap">
          <p class="filters-label" id="filters-label">{copy.filters}</p>
          <div class="filters" role="group" aria-labelledby="filters-label">
            {#each KINDS as kind}
              <button type="button" class="pill" data-hue={HUE[kind]} aria-pressed={only.includes(kind)} onclick={() => toggle(kind)}>
                <span class="dot"></span>{copy.filter[kind]}<span class="pill-n num">{ALL[kind]}</span>
              </button>
            {/each}
          </div>
        </div>
      </article>

      <!-- EVERY ENTRY BY THE DAY IT SHIPPED, stacked by kind, with the one line that says what the chart shows. -->
      {#if CHART.length > 0}
        <section class="tile lead span-8 by-day" aria-labelledby="days-title">
          <header class="tile-head">
            <span class="well"><Icon name="bars" /></span>
            <h2 class="tile-title" id="days-title">{copy.byDay}</h2>
            <span class="tile-meta">{copy.span(shortDate(oldest), shortDate(newest))}</span>
          </header>
          <ul class="legend" aria-hidden="true">
            {#each KINDS as kind}<li data-hue={HUE[kind]}><span class="swatch"></span>{copy.kind[kind]}</li>{/each}
          </ul>
          <div class="chart" role="img" aria-label={copy.chartLabel(shortDate(oldest), shortDate(newest), shortDate(busiest), most)}>
            <div class="plot" aria-hidden="true">
              {#each TICKS as t}
                <span class="grid-line" style="--at: {t / top}"><span class="tick num">{t}</span></span>
              {/each}
              <div class="cols" style="--n: {CHART.length}">
                {#each CHART as c (c.date)}
                  <span class="col">
                    {#each KINDS as kind}
                      {#if c.count[kind] > 0}
                        <span class="seg" data-hue={HUE[kind]} style="--v: {c.count[kind] / top}"></span>
                      {/if}
                    {/each}
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
    </div>
  </div>
</section>

<!-- No name of its own: the band above is the region the page title names, and this one named the same was a second landmark with that name. -->
<section class="band">
  <div class="in">
    <div class="tiles">
      {#if LATEST}
        <section class="tile lead span-6 latest" hidden={!any(LATEST.entries)} aria-labelledby="latest-title">
          <header class="tile-head">
            <span class="well"><Icon name="today" /></span>
            <h2 class="tile-title" id="latest-title">{copy.latest}</h2>
            <time class="tile-meta num" datetime={LATEST.date}>{longDate(LATEST.date)} · {copy.dayEntries(LATEST.entries.length)}</time>
          </header>
          <ol class="entries">
            {#each LATEST.entries as item (item.anchor)}
              {@render entry(item, 'h3')}
            {/each}
          </ol>
        </section>
      {/if}

      <!-- ONE TILE PER MONTH, the newest open, each day a folded row inside it. A filter opens every fold, because a
           reader who asked for fixes wants to see them, not a column of closed rows. -->
      <div class="months" class:span-6={!!LATEST && any(LATEST.entries)}>
        {#each MONTHS as month, i (month.key)}
          <details class="tile month" open={filtering || i === 0} hidden={!month.days.some((d) => any(d.entries))}>
            <summary class="month-sum">
              <span class="well"><Icon name="calendar" /></span>
              <h2 class="tile-title">{copy.month(month.month, month.year)}</h2>
              <span class="sum-side">
                <span class="sum-count">{copy.entries(month.total)}</span>
                <span class="chev" aria-hidden="true"><Icon name="chevron-down" size="m" /></span>
              </span>
            </summary>
            <p class="month-tally">{@render tallies(month.tally)}</p>
            <div class="days">
              {#each month.days as day (day.date)}
                <details class="day" open={filtering} hidden={!any(day.entries)}>
                  <summary class="day-sum">
                    <h3 class="day-date"><time class="num" datetime={day.date}>{shortDate(day.date)}</time></h3>
                    <span class="day-first">
                      <span class="dot" data-hue={HUE[day.entries[0]?.kind ?? 'shipped']}></span>
                      <span class="day-first-title">{day.entries[0]?.title}</span>
                    </span>
                    <span class="day-n">{copy.dayEntries(day.entries.length)}</span>
                    <span class="chev" aria-hidden="true"><Icon name="chevron-down" size="m" /></span>
                  </summary>
                  <ol class="entries">
                    {#each day.entries as item (item.anchor)}
                      {@render entry(item, 'h4')}
                    {/each}
                  </ol>
                </details>
              {/each}
            </div>
          </details>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  /* An author `display` beats the `hidden` attribute, so every element a filter hides says so here. */
  .latest[hidden],
  .month[hidden],
  .day[hidden],
  .entry[hidden] {
    display: none;
  }

  /* ── The opening tile ───────────────────────────────────────────────── */

  .count {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
  }

  .count-all {
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .filters-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: auto;
  }

  .filters-label {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* PILLS, because they are toggles and not a navigation: pressed, a pill takes the ink's own fill. */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: 14px;
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-site-small);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .pill:hover {
    background: var(--tile-2);
  }

  .pill[aria-pressed='true'] {
    background: var(--ink);
    color: var(--on-red);
  }

  .pill-n {
    color: var(--ink-3);
  }

  .pill[aria-pressed='true'] .pill-n {
    color: inherit;
  }

  .dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-ctl);
  }

  /* ── The chart ──────────────────────────────────────────────────────── */

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-app-sm);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .swatch {
    inline-size: 8px;
    block-size: 8px;
    background: var(--hue);
    border-radius: 2px;
  }

  .chart {
    --axis: 28px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE PLOT IS 184 TALL, its grid lines at each step up the axis, and the bars stand on the bottom one. */
  .plot {
    position: relative;
    block-size: 184px;
    margin-block-start: var(--sp-2);
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
    inline-size: calc(var(--axis) - 8px);
    color: var(--ink-3);
    font-size: var(--t-app-xs);
    line-height: 16px;
    text-align: end;
  }

  .cols,
  .x {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 4px;
    margin-inline-start: var(--axis);
  }

  .cols {
    position: absolute;
    inset-block: 0;
    inset-inline: var(--axis) 0;
    margin-inline-start: 0;
  }

  /* A DAY'S BAR, its kinds stacked from the ground up, each part its share of the axis's height. */
  .col {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    block-size: 100%;
  }

  .seg {
    flex: none;
    block-size: calc(var(--v) * 100% - 2px);
    min-block-size: 3px;
    background: var(--hue);
    border-radius: 3px;
  }

  .x-day {
    color: var(--ink-3);
    font-size: var(--t-app-xs);
    text-align: center;
    white-space: nowrap;
  }

  /* ── Latest ─────────────────────────────────────────────────────────── */

  .entries {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* AN ENTRY IS A ROW: its kind in a narrow column, then its title and its body, with a hairline between entries. */
  .entry {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: var(--sp-3);
    padding-block: var(--sp-4);
    /* A permalink lands below the floating bar, not under it. */
    scroll-margin-block-start: calc(var(--inset) + 56px + var(--sp-4));
  }

  .entry + .entry {
    border-block-start: 1px solid var(--rule);
  }

  .kind {
    display: inline-flex;
    align-items: center;
    align-self: start;
    gap: 6px;
    min-block-size: 24px;
    color: var(--ink-3);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .entry-main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .entry-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 24px;
    letter-spacing: 0;
    text-wrap: pretty;
  }

  /* Always drawn, because a phone has no hover to find it with; quiet until it is pointed at. */
  .permalink {
    display: inline-flex;
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    vertical-align: -0.1em;
    opacity: 0.55;
    transition: opacity var(--d-state) var(--ease-out);
  }

  /* THE LINK GLYPH IS 12PX AND THE PRESS IS NOT: a 44px square round it, drawn by nothing. */
  .permalink {
    position: relative;
  }

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
    max-inline-size: 72ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 22px;
    text-wrap: pretty;
  }

  /* ── The months ─────────────────────────────────────────────────────── */

  .months {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
  }

  .month {
    display: block;
  }

  /* A FOLD'S HEAD IS THE TILE'S HEADING ROW: the well, the name, the count and a chevron, the whole row the control.
     The browser's own triangle goes, because the chevron sits where the eye ends the row. */
  .month-sum,
  .day-sum {
    display: flex;
    align-items: center;
    gap: 10px;
    list-style: none;
    cursor: pointer;
  }

  .month-sum::-webkit-details-marker,
  .day-sum::-webkit-details-marker {
    display: none;
  }

  .month-sum {
    min-block-size: max(var(--well), var(--tap));
  }

  .sum-side {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .sum-count {
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .chev {
    display: grid;
    place-items: center;
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-out);
  }

  details[open] > summary .chev {
    transform: rotate(180deg);
  }

  .month-tally {
    margin: var(--sp-3) 0 var(--sp-2);
  }

  .tallies {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .tally {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-size: var(--t-site-small);
    font-variant-numeric: tabular-nums;
  }

  .day {
    border-block-start: 1px solid var(--rule);
  }

  /* A DAY IS ONE ROW: its date, its first entry's kind and title, how many it holds, and the chevron. */
  .day-sum {
    min-block-size: var(--tap);
    padding-block: var(--sp-2);
    border-radius: var(--r-pop);
  }

  .day-sum:hover {
    background: var(--hover);
  }

  .day-date {
    flex: none;
    inline-size: 110px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
    font-weight: 500;
    letter-spacing: 0;
  }

  .day-first {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .day-first-title {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-site-small);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .day-n {
    flex: none;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .day .entries {
    margin-block-end: var(--sp-3);
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--rule);
  }

  /* 13 §7: 44 under a thumb, on the filters and on every fold's row. */
  @media (width < 640px), (pointer: coarse) {
    .pill {
      min-block-size: var(--tap);
    }
  }

  /* THE PHONE: an entry's kind sits over its title, a day's first title gives way to its count, and the chart keeps
     every bar but only its end dates. */
  @media (width < 640px) {
    .entry {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .day-date {
      inline-size: auto;
    }

    .day-first {
      display: none;
    }

    .day-n {
      margin-inline-start: auto;
    }

    .plot {
      block-size: 140px;
    }

    .cols,
    .x {
      gap: 2px;
    }

    .x-day:not(:first-child, :last-child) {
      visibility: hidden;
    }
  }
</style>
