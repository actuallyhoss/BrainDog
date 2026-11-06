<!--
  What Slash spent, on `/usage`: one small tile beside the month's other limits, opening to the whole of it.

  TWO ALLOWANCES, APART. His asks against his cap and the background work's own month (the daily look, an automation's
  question, a digest's prose, a pattern drafted for the inbox), because one never spends the other. That is all the tile
  says shut, a ring each.

  DETAILS OPENS IT WHERE IT STANDS, across the page's width: one line for each thing the asks were for ("Read what
  arrived: 4", "Page headlines: 9"), the most spent first, the asks by day as bars, and each day's lines, what was asked,
  when, what it cost and a link to what it filed. Eight lines, then "Show all". This was a section of its own, and a busy
  month made it the longest thing on the page by four screens. The rules are `slash-asks.ts`, which the tests hold; this draws what they answer.

  RUNNING OUT SAYS SO, shut or open, and `SlashOut` offers the two ways on beside the sentence.

  THE OWNER'S, AND ONLY WHERE A MODEL IS. The ledger's door answers the owner alone, and a host with no model has nothing to
  count, so the page mounts this for the owner and it draws nothing on a host without Slash. A failed read draws nothing
  either: the page's own read above already says when the record cannot be reached, and this is one section of it.

  ONE COLUMN AT 390, the rings side by side, and a line's question wraps above its cost rather than pushing the figure off the edge.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type SlashAsked, type SlashStatus } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import {
    asksLine,
    atCap,
    backgroundLine,
    costSaid,
    LEDGER_FETCHED,
    metered,
    purposeLines,
    resetsWords,
    spentIn,
    words,
  } from '$lib/ui/slash-asks.ts';
  import SlashOut from '$lib/ui/SlashOut.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import Ring from '$lib/viz/Ring.svelte';

  /* `month` is the page's `YYYY-MM`, and the page mounts this on the current month only: the status door says this
     month's count and nothing of a month gone. */
  let { month }: { month: string } = $props();

  /* THIS SECTION'S OWN WORDS FOR ITS TILES. The sentences are `slash-asks.ts`'s. */
  const said = {
    asks: 'Your questions',
    background: 'Background work',
    of: (used: number, cap: number) => `${used.toLocaleString('en-GB')} of ${cap.toLocaleString('en-GB')}`,
    busiest: (label: string, n: number) => `Busiest ${label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : `on ${label}`}, with ${n === 1 ? '1 question' : `${n.toLocaleString('en-GB')} questions`}.`,
    asksSubject: 'Questions by day',
    details: 'Details',
    hide: 'Hide details',
    all: (n: number) => `Show all ${n.toLocaleString('en-GB')}`,
    fewer: 'Show fewer',
  } as const;

  let status = $state<SlashStatus | null>(null);
  let rows = $state<SlashAsked[] | null>(null);
  /* ITS TILE STANDS WHILE ITS READS ARE OUT: it came a beat after the page and halved the allowance beside it. */
  const offered = Boolean(page.data.live) && page.data.slash === true;
  let asking = $state(offered);

  onMount(() => {
    if (!offered) return;
    const client = createClient({ base: apiBase() });
    void Promise.all([client.slashStatus(), client.slashAsks(LEDGER_FETCHED)])
      .then(([s, a]) => {
        if (!s.ok || !a.ok) return;
        status = s.value;
        rows = a.value.asks;
      })
      .catch(() => {
        /* Nothing to draw; the page's own read says when the record cannot be reached. */
      })
      .finally(() => {
        asking = false;
      });
  });

  const spent = $derived(rows ? spentIn(rows, month) : null);
  const mine = $derived(status ? asksLine(status) : null);

  /** A ring's tone: ink with room, amber from 80%, red once it is spent. */
  const toneOf = (used: number, cap: number): 'ink' | 'warn' | 'danger' => (cap <= 0 || used >= cap ? 'danger' : used >= cap * 0.8 ? 'warn' : 'ink');

  /* THE BACKGROUND ALLOWANCE IS THE HOST'S TO SAY (`status.background`): its count and its size, drawn as a ring. A host
     that says neither gets the ledger's own count as a figure, with no allowance copied here to measure it to. */
  const background = $derived(
    !spent
      ? null
      : status?.background
        ? { used: status.background.used, cap: status.background.cap as number | null, line: backgroundLine(spent, status.background) }
        : { used: spent.background, cap: null, line: backgroundLine(spent) },
  );

  /* WHAT THE ASKS WERE FOR, a line a purpose. His own are listed only when they were for more than one thing, since
     one line would say the count above it again. */
  const mineFor = $derived.by(() => {
    const lines = spent ? purposeLines(spent, false) : [];
    return lines.length > 1 ? lines : [];
  });
  const backgroundFor = $derived(spent ? purposeLines(spent, true) : []);

  /* THE ASKS BY DAY, newest first as the lines below are, the busiest day in ink and the rest greys. */
  const busiest = $derived(spent && spent.days.length > 0 ? spent.days.reduce((a, b) => (b.asks > a.asks ? b : a)) : null);
  /* NOTHING ASKED AND NOTHING IN THE BACKGROUND IS ONE LINE, NOT TWO RINGS OF NOUGHT (empty states, 2 Nov): a new record
     drew "0 of 20" and "0 of 600" in two tiles over a sentence saying nothing was asked. */
  const quiet = $derived(!!status && !!spent && status.asks.used === 0 && (background?.used ?? 0) === 0 && spent.days.length === 0 && !atCap(status));
  const bars = $derived(spent ? spent.days.map((d) => ({ label: d.label, value: d.asks, tone: busiest && d.day === busiest.day ? 'ink' : undefined })) : []);

  let open = $state(false);
  let whole = $state(false);
  /* EIGHT LINES, NEWEST FIRST, under their days, and eight days of bars, until "Show all". */
  const TOP = 8;
  const lineCount = $derived(spent ? spent.days.reduce((n, d) => n + d.lines.length, 0) : 0);
  const daysShown = $derived.by(() => {
    if (!spent || whole) return spent?.days ?? [];
    let left = TOP;
    return spent.days.flatMap((d) => {
      if (left <= 0) return [];
      const lines = d.lines.slice(0, left);
      left -= lines.length;
      return [{ ...d, lines }];
    });
  });
  const barsShown = $derived(whole ? bars : bars.slice(0, TOP));
  const longer = $derived(lineCount > TOP || bars.length > TOP);
</script>

{#snippet meter(name: string, used: number, cap: number | null, shut: string, summary: string)}
  <li class="spent-meter">
    {#if cap !== null}
      <Ring value={used} max={cap} tone={toneOf(used, cap)} size={72} {summary} />
    {:else}
      <span class="spent-figure num">{used.toLocaleString('en-GB')}</span>
    {/if}
    <span class="spent-said-beside">
      <span class="spent-name">{name}</span>
      <span class="spent-amount num">{shut}</span>
    </span>
  </li>
{/snippet}

{#if !(status && spent)}
  {#if asking}
    <Tile class="section" data-surface="tile" icon="slash" title={words.title} ready={false} skeleton="lines" rows={2} shape="slash-usage" data-standing="">
      <div></div>
    </Tile>
  {/if}
{:else}
  <Tile class="section" data-surface="tile" icon="slash" title={words.title} data-open={open ? '' : undefined}>
    {#snippet actions()}
      {#if !quiet}
        <button type="button" class="spent-toggle tap" aria-expanded={open} onclick={() => (open = !open)}>{open ? said.hide : said.details}</button>
      {/if}
    {/snippet}
    <div class="section-body spent-body">
      {#if !quiet}
        <ul class="spent-meters">
          {#if mine}
            {@render meter(said.asks, status.asks.used, metered(status) ? status.asks.cap : null, metered(status) ? said.of(status.asks.used, status.asks.cap) : mine, mine)}
          {/if}
          {#if background}
            {@render meter(said.background, background.used, background.cap, background.cap !== null ? said.of(background.used, background.cap) : background.line, background.line)}
          {/if}
        </ul>
      {/if}

      {#if atCap(status)}
        <div class="spent-out">
          <p class="spent-said" data-needs>{words.out(resetsWords(status.asks.resets))}</p>
          <SlashOut />
        </div>
      {/if}

      {#if quiet}<p class="spent-said">{words.none}</p>{/if}

      {#if open}
        <div class="spent-open">
          <div class="spent-side">
            {#if mine}
              <div>
                <p class="spent-reading">{mine}</p>
                {#if mineFor.length > 0}
                  <ul class="spent-for" aria-label={words.forWhat}>
                    {#each mineFor as line (line)}<li>{line}</li>{/each}
                  </ul>
                {/if}
              </div>
            {/if}
            {#if background}
              <div>
                <p class="spent-reading">{background.line}</p>
                {#if backgroundFor.length > 0}
                  <ul class="spent-for" aria-label={words.forWhat}>
                    {#each backgroundFor as line (line)}<li>{line}</li>{/each}
                  </ul>
                {/if}
              </div>
            {/if}
            <!-- ONLY WHEN HE ASKED ANYTHING: a day of background work alone is a zero bar, and bars of zeroes say nothing. -->
            {#if busiest && busiest.asks > 0}
              <div class="spent-days">
                <h3 class="spent-h">{words.byDay}</h3>
                <Bars items={barsShown} subject={said.asksSubject} />
                <p class="spent-reading">{said.busiest(busiest.label, busiest.asks)}</p>
              </div>
            {/if}
            {#if !spent.whole}<p class="spent-said">{words.partial}</p>{/if}
          </div>

          <div class="spent-lines">
            {#if spent.days.length === 0}
              <p class="spent-said">{words.none}</p>
            {:else}
              {#each daysShown as d (d.day)}
                <section class="spent-day" aria-label={d.label}>
                  <h3 class="spent-h">{d.label}<span class="spent-h-n num">{spent.days.find((x) => x.day === d.day)?.lines.length ?? d.lines.length}</span></h3>
                  <ul class="ledger spent-list">
                    {#each d.lines as l (l.id)}
                      <li>
                        <div class="line spent-row">
                          <span class="line-main">
                            <span class="line-title spent-what" dir="auto">{l.what}</span>
                            <span class="line-detail">{l.refused ? `${l.when}, ${words.refused}` : l.when}</span>
                          </span>
                          <span class="line-when spent-cost">{costSaid(l.cost, l.background)}</span>
                          {#if l.href}<a class="spent-filed tap" href={at(l.href)}>{words.filed}</a>{/if}
                        </div>
                      </li>
                    {/each}
                  </ul>
                </section>
              {/each}
              {#if longer}
                <button type="button" class="spent-more tap" aria-expanded={whole} onclick={() => (whole = !whole)}
                  ><Icon name="chevronDown" size="s" />{whole ? said.fewer : said.all(lineCount)}</button
                >
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </Tile>
{/if}

<style>
  .spent-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* A RING AND ITS WORDS BESIDE IT: stacked in the small tile, side by side wherever two fit. */
  .spent-meters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spent-meter {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .spent-meter :global(.viz-ring) {
    flex: 0 0 72px;
  }

  .spent-said-beside {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .spent-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui, 20px);
  }

  .spent-amount {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
    font-variant-numeric: tabular-nums;
  }

  /* "Background" IS WIDER THAN THE ROOM BESIDE A RING ON A PHONE, at the body's size. */
  @media (width < 640px) {
    .spent-meter {
      gap: var(--sp-2);
    }

    .spent-name {
      font-size: var(--fs-meta);
      line-height: var(--lead-meta, 18px);
    }
  }

  .spent-toggle,
  .spent-more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-panel);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
    cursor: pointer;
  }

  .spent-more {
    align-self: flex-start;
    margin-block-start: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--soft-fill);
    border-radius: var(--r-pill);
    font-size: var(--fs-ctl);
    line-height: var(--lead-ctl, 20px);
  }

  .spent-more :global(svg) {
    transition: rotate var(--d-state, 120ms) var(--ease-out, ease-out);
  }

  .spent-more[aria-expanded='true'] :global(svg) {
    rotate: 180deg;
  }

  @media (hover: hover) and (pointer: fine) {
    .spent-toggle:hover {
      color: var(--ink);
    }

    .spent-more:hover {
      background: var(--soft-fill-hover);
      color: var(--ink);
    }
  }

  /* OPEN: what the asks were for and the days down one side, each day's lines down the other. */
  .spent-open {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block-start: var(--sp-2);
  }

  @media (width >= 900px) {
    .spent-open {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    }
  }

  .spent-side,
  .spent-lines,
  .spent-days {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .spent-side {
    gap: var(--sp-4);
  }

  .spent-days {
    gap: var(--sp-2);
  }

  /* THE FIGURE, for his asks on his own key, where there is no cap for a ring to measure against. */
  .spent-figure {
    flex: none;
    min-inline-size: 40px;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: calc(34px * var(--type, 1));
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE LINE THAT READS THE CHART, at the foot of its tile. */
  .spent-reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  /* WHAT THE ASKS WERE FOR, a line a purpose under the reading, in the same size. */
  .spent-for {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
    font-variant-numeric: tabular-nums;
  }

  .spent-out {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .spent-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  /* OUT OF ASKS NEEDS HIM: the words carry it, in red at 500 so the colour is never a hairline. */
  .spent-said[data-needs] {
    color: var(--red);
    font-weight: 500;
  }

  /* EACH DAY UNDER A META HEADING, as the palette heads its groups, and its lines on the ground under it. */
  .spent-day + .spent-day {
    margin-block-start: var(--sp-4);
  }

  .spent-h {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
  }

  .spent-h-n {
    font-variant-numeric: tabular-nums;
  }

  /* A LINE: the question and when over each other, the cost at the end, and the way to what it filed after it. */
  .spent-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-auto-flow: column;
  }

  .spent-what {
    overflow-wrap: anywhere;
  }

  .spent-cost {
    white-space: nowrap;
  }

  .spent-filed {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .spent-filed:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* ON A PHONE THE COST AND THE LINK SIT UNDER THE QUESTION, so a long one wraps rather than pushing them off. */
  @media (width < 640px) {
    .spent-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .spent-row .line-main {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .spent-row .line-when {
      grid-column: 1;
      grid-row: 2;
      justify-content: flex-start;
    }

    .spent-filed {
      grid-column: 2;
      grid-row: 2;
    }
  }
</style>
