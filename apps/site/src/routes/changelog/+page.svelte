<!--
  The changelog: the newest day in full, then every month before it folded, with a filter per kind
  and an Atom feed beside it.

  14 §5 calls this page "proof of life". Proof of life is only proof if it is true, which is why the
  entries left this file for `./entries.ts`, where `../../../scripts/changelog.mjs` holds them against
  `git log`: it said "nothing has shipped yet" for six days after something had, because the only
  check on a list typed into a component was a person opening it.

  WHY IT FOLDS. With every entry open at once the page was the whole history in one column, twenty
  screens at 1440, and a stranger skimming for what shipped met a wall. The entries were not the
  problem (their writing rules are at the top of `entries.ts`, and the checker enforces them); the
  page had no unit bigger than a day. Now a month is one row with its tallies, a day is one row
  inside it, and only the newest day and the newest month are open.

  IT READS WITHOUT SCRIPTING. The folds are native `<details>`, so every entry is one press away with
  no script at all. The filters and the permalink reveal are the only parts that need it.

  THE SHAPING IS `./log.ts`, shared with `/changelog.xml`, so an entry's anchor here and its id in the
  feed are one string. Nothing sorts: the order inside a day is editorial, and `entries.ts` owns it.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link to
  one would be a 404 with a promise attached.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { Hue } from '$lib/icons.ts';
  import { site } from '$lib/copy.ts';
  import { FEED } from '$lib/links.ts';
  import { DAYS, ITEMS, KINDS, LATEST, MONTHS, parts, tally, type Item, type Kind } from './log.ts';

  const copy = site.changelog;

  /* The word is the meaning and the hue agrees with it: green for new work, blue for a repair, amber
     for a change of course. Each kind keeps its own hue, so the colour a reader learns from the first
     two is never contradicted by a grey third. */
  const HUE: Record<Kind, Hue> = { shipped: 'earn', fixed: 'info', changed: 'warn' };

  /** Counted from `entries.ts`, so the numbers cannot drift from the list. */
  const ALL = tally(ITEMS);

  /**
   * THE KINDS A READER HAS ASKED FOR, and none means all. A pill adds its kind and a second press
   * takes it away, so "Shipped and Fixed" is two presses and clearing is the same presses again.
   */
  let only = $state<Kind[]>([]);
  const filtering = $derived(only.length > 0);
  const shows = (kind: Kind): boolean => only.length === 0 || only.includes(kind);
  const any = (entries: readonly Item[]): boolean => entries.some((e) => shows(e.kind));
  const toggle = (kind: Kind): void => {
    only = only.includes(kind) ? only.filter((k) => k !== kind) : [...only, kind];
  };

  /**
   * A PERMALINK INTO A CLOSED FOLD OPENS IT. A browser scrolls to a fragment only if the element has
   * a box, and an entry inside a closed `<details>` has none, so a shared link would land on the top
   * of the page. This opens every fold around the target and then scrolls to it, on arrival and
   * whenever the fragment changes.
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

  const shortDate = (date: string): string => {
    const d = parts(date);
    return copy.day(d.day, d.month);
  };

  const longDate = (date: string): string => {
    const d = parts(date);
    return copy.date(d.day, d.month, d.year);
  };
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

<!-- ONE ENTRY, drawn the same under "Latest" and inside a month. Only its heading level differs,
     because it sits one level deeper inside a month's day than under "Latest". -->
{#snippet entry(item: Item, level: 'h3' | 'h4')}
  <li class="entry" id={item.anchor} data-hue={HUE[item.kind]} hidden={!shows(item.kind)}>
    <svelte:element this={level} class="entry-title">
      <span class="kind" data-hue={HUE[item.kind]}><span class="dot"></span>{copy.kind[item.kind]}</span>{item.title}
      <a class="permalink" href="#{item.anchor}" aria-label={copy.permalink(item.title)}><Icon name="link" size="s" /></a>
    </svelte:element>
    <p class="entry-body">{item.body}</p>
  </li>
{/snippet}

<!-- THE HEAD GETS ITS OWN GROUND, as on the home and pricing pages: one block about the whole log,
     then the log. -->
<section class="band" data-ground="sunk">
  <div class="col">
    <h1 class="title">{copy.title}</h1>
    <p class="lede">{copy.lede}</p>
    <p class="meta">
      <span class="count-all">{copy.count(ITEMS.length, DAYS.length)}</span>
      <a class="btn btn-sm" href={FEED}>{copy.follow}</a>
    </p>
    <!-- THE FILTERS ARE THE COUNTS, so the head says how many of each kind there are and offers to
         show only those in one row. They need scripting; without it the folds below still read. -->
    <div class="filters" role="group" aria-label={copy.filters}>
      {#each KINDS as kind}
        <button type="button" class="pill" data-hue={HUE[kind]} aria-pressed={only.includes(kind)} onclick={() => toggle(kind)}>
          <span class="dot"></span>{copy.filter[kind]}<span class="pill-n num">{ALL[kind]}</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<div class="band" data-ground="page">
  <div class="col">
    {#if LATEST}
      <section class="latest" hidden={!any(LATEST.entries)}>
        <div class="latest-head">
          <h2 class="section-title">{copy.latest}</h2>
          <time class="latest-date num" datetime={LATEST.date}>{longDate(LATEST.date)}</time>
        </div>
        <ol class="entries">
          {#each LATEST.entries as item (item.anchor)}
            {@render entry(item, 'h3')}
          {/each}
        </ol>
      </section>
    {/if}

    <!-- ONE FOLD PER MONTH, the newest open, each day inside it folded again. A filter opens every
         fold, because a reader who asked for fixes wants to see them, not a column of closed rows. -->
    <div class="months">
      {#each MONTHS as month, i (month.key)}
        <details class="month" open={filtering || i === 0} hidden={!month.days.some((d) => any(d.entries))}>
          <summary class="month-sum">
            <h2 class="section-title">{copy.month(month.month, month.year)}</h2>
            <span class="sum-side">
              <span class="sum-count">{copy.entries(month.total)}</span>
              {@render tallies(month.tally)}
              <span class="chev" aria-hidden="true"></span>
            </span>
          </summary>
          <div class="days">
            {#each month.days as day (day.date)}
              <details class="day" open={filtering} hidden={!any(day.entries)}>
                <summary class="day-sum">
                  <h3 class="day-date"><time class="num" datetime={day.date}>{shortDate(day.date)}</time></h3>
                  <span class="sum-side">
                    {@render tallies(tally(day.entries))}
                    <span class="chev" aria-hidden="true"></span>
                  </span>
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

<style>
  .col {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  .band {
    padding-block: var(--sp-8);
  }

  /* The seam, as on the other pages. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  /* An author `display` beats the `hidden` attribute, so every element a filter hides says so here. */
  .latest[hidden],
  .month[hidden],
  .day[hidden],
  .entry[hidden] {
    display: none;
  }

  .title {
    font-family: var(--font-display);
    font-size: var(--t-site-display);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .lede {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-site-lead);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-5);
  }

  .count-all {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* PILLS, because they are toggles and not a navigation: pressed, a pill takes the ink's own fill,
     which is the one state on this page that reads the same in both schemes without a new colour. */
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .pill:hover {
    border-color: var(--edge);
  }

  .pill[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .pill-n {
    color: var(--dim);
  }

  .pill[aria-pressed='true'] .pill-n {
    color: inherit;
  }

  .latest-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-5);
  }

  .section-title {
    font-family: var(--font-display);
    font-size: var(--t-site-h3);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .latest-date {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .months {
    margin-block-start: var(--sp-7);
  }

  .latest[hidden] + .months {
    margin-block-start: 0;
  }

  .month {
    border-block-start: 1px solid var(--line);
  }

  .month:last-child {
    border-block-end: 1px solid var(--line);
  }

  /* A FOLD IS ONE ROW: its name at the start, its tallies and a chevron at the end, the whole row the
     control. The browser's own triangle goes, because the chevron sits where the eye ends the row. */
  .month-sum,
  .day-sum {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    list-style: none;
    cursor: pointer;
  }

  .month-sum::-webkit-details-marker,
  .day-sum::-webkit-details-marker {
    display: none;
  }

  .month-sum {
    padding-block: var(--sp-5);
  }

  .sum-side {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-4);
  }

  .sum-count {
    color: var(--dim);
    font-size: var(--t-sm);
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
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  /* Pointing along the row when closed and down when open, drawn from two borders so it takes the
     ink's own colour in either scheme. */
  .chev {
    inline-size: 8px;
    block-size: 8px;
    margin-inline: var(--sp-1);
    border-block-end: 1.5px solid var(--dim);
    border-inline-end: 1.5px solid var(--dim);
    transform: rotate(-45deg);
    transition: transform var(--d-state) var(--ease-out);
  }

  details[open] > summary .chev {
    transform: rotate(45deg);
  }

  .days {
    padding-block-end: var(--sp-5);
  }

  .day {
    border-block-start: 1px solid var(--line-soft);
  }

  .day-sum {
    min-block-size: var(--ctl-h);
    padding-block: var(--sp-3);
  }

  .day-sum:hover .day-date {
    color: var(--ink);
  }

  .day-date {
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 500;
    letter-spacing: 0;
  }

  .day .entries {
    margin-block: var(--sp-2) var(--sp-5);
  }

  /* A RAIL DOWN THE DAY, and a quiet mark on it for each entry, so a day reads as a short run of
     things that happened rather than a stack of paragraphs. */
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    margin: 0;
    padding-inline: var(--sp-5) 0;
    border-inline-start: 1px solid var(--line);
    list-style: none;
  }

  .entry {
    position: relative;
    /* A permalink lands below the site's sticky header, not under it. */
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* THE KIND'S HUE IS THE MARK ON THE RAIL, and the word beside the title carries the kind for a
     reader who does not see the colour. One dot per entry, not a second one beside the word. */
  .entry::before {
    content: '';
    position: absolute;
    inset-block-start: 0.6em;
    inset-inline-start: calc(var(--sp-5) * -1 - 3px);
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-pill);
    box-shadow: 0 0 0 3px var(--bg);
  }

  .entry .dot {
    display: none;
  }

  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0;
    vertical-align: 0.1em;
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-pill);
  }

  .entry-title {
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  /* Always drawn, because a phone has no hover to find it with; quiet until it is pointed at. */
  .permalink {
    display: inline-flex;
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    vertical-align: -0.15em;
    opacity: 0.55;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .entry:hover .permalink,
  .permalink:focus-visible {
    opacity: 1;
  }

  .entry-body {
    max-inline-size: 74ch;
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  /* 13 §7: 44 under a thumb, on the filters and on every fold's row. */
  @media (width < 640px), (pointer: coarse) {
    .pill,
    .day-sum {
      min-block-size: var(--tap);
    }
  }

  @media (width < 640px) {
    .col {
      padding-inline: var(--sp-4);
    }

    .band {
      padding-block: var(--sp-7);
    }

    .entries {
      padding-inline-start: var(--sp-4);
    }

    .entry::before {
      inset-inline-start: calc(var(--sp-4) * -1 - 3px);
    }
  }
</style>
