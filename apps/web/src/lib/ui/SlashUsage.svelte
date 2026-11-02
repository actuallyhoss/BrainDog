<!--
  What Slash spent, on `/usage`: the page's Slash section.

  TWO ALLOWANCES, APART. His asks against his cap, then the background work's own month (the daily look, an
  automation's question, a digest's prose, a pattern drafted for the inbox), because one never spends the other.
  Each is a tile with its ring and the line that reads it, then one line for each thing the asks were for ("Read what
  arrived: 4", "Page headlines: 9"), the most spent first, and the asks by day are a third, as bars. Under the tiles, on the ground, each day's lines: what was asked, when, what it cost and a
  link to what it filed. The rules are `slash-asks.ts`, which the tests hold; this draws what they answer.

  RUNNING OUT SAYS SO, and `SlashOut` offers the two ways on beside the sentence.

  THE OWNER'S, AND ONLY WHERE A MODEL IS. The ledger's door answers the owner alone, and a host with no model has nothing to
  count, so the page mounts this for the owner and it draws nothing on a host without Slash. A failed read draws nothing
  either: the page's own read above already says when the record cannot be reached, and this is one section of it.

  ONE COLUMN AT 390. The tiles stack, and a line's question wraps above its cost rather than pushing the figure off the edge.
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
    of: (cap: number) => `of ${cap.toLocaleString('en-GB')}`,
    busiest: (label: string, n: number) => `Busiest ${label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : `on ${label}`}, with ${n === 1 ? '1 question' : `${n.toLocaleString('en-GB')} questions`}.`,
    asksSubject: 'Questions by day',
  } as const;

  let status = $state<SlashStatus | null>(null);
  let rows = $state<SlashAsked[] | null>(null);

  onMount(() => {
    if (!page.data.live || page.data.slash !== true) return;
    const client = createClient({ base: apiBase() });
    void Promise.all([client.slashStatus(), client.slashAsks(LEDGER_FETCHED)])
      .then(([s, a]) => {
        if (!s.ok || !a.ok) return;
        status = s.value;
        rows = a.value.asks;
      })
      .catch(() => {
        /* Nothing to draw; the page's own read says when the record cannot be reached. */
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
</script>

{#if status && spent}
  <Tile class="section" data-surface="tile" title={words.title}>
    <div class="section-body">
      {#if !quiet}<div class="spent-tiles">
        {#if mine}
          <Tile icon="slash" title={said.asks}>
            {#if metered(status)}
              <div class="spent-ring">
                <Ring value={status.asks.used} max={status.asks.cap} tone={toneOf(status.asks.used, status.asks.cap)} size={112} label={said.of(status.asks.cap)} summary={mine} />
              </div>
            {:else}
              <p class="spent-figure num">{status.asks.used.toLocaleString('en-GB')}</p>
            {/if}
            <p class="spent-reading">{mine}</p>
            {#if mineFor.length > 0}
              <ul class="spent-for" aria-label={words.forWhat}>
                {#each mineFor as line (line)}<li>{line}</li>{/each}
              </ul>
            {/if}
          </Tile>
        {/if}

        {#if background}
          <Tile icon="observe" title={said.background}>
            {#if background.cap !== null}
              <div class="spent-ring">
                <Ring value={background.used} max={background.cap} tone={toneOf(background.used, background.cap)} size={112} label={said.of(background.cap)} summary={background.line} />
              </div>
            {:else}
              <p class="spent-figure num">{background.used.toLocaleString('en-GB')}</p>
            {/if}
            <p class="spent-reading">{background.line}</p>
            {#if backgroundFor.length > 0}
              <ul class="spent-for" aria-label={words.forWhat}>
                {#each backgroundFor as line (line)}<li>{line}</li>{/each}
              </ul>
            {/if}
          </Tile>
        {/if}

        <!-- ONLY WHEN HE ASKED ANYTHING: a day of background work alone is a zero bar, and bars of zeroes say nothing. -->
        {#if busiest && busiest.asks > 0}
          <Tile icon="history" title={words.byDay}>
            <Bars items={bars} subject={said.asksSubject} />
            <p class="spent-reading">{said.busiest(busiest.label, busiest.asks)}{#if !spent.whole}{' '}{words.partial}{/if}</p>
          </Tile>
        {/if}
      </div>{/if}

      {#if !spent.whole && !(busiest && busiest.asks > 0)}<p class="spent-said spent-gap">{words.partial}</p>{/if}

      {#if atCap(status)}
        <div class="spent-out">
          <p class="spent-said" data-needs>{words.out(resetsWords(status.asks.resets))}</p>
          <SlashOut />
        </div>
      {/if}

      {#if spent.days.length === 0}
        <p class="spent-said">{words.none}</p>
      {:else}
        {#each spent.days as d (d.day)}
          <section class="spent-day" aria-label={d.label}>
            <h3 class="spent-h">{d.label}<span class="spent-h-n num">{d.lines.length}</span></h3>
            <ul class="ledger spent-list">
              {#each d.lines as l (l.id)}
                <li>
                  <div class="line line-tall spent-row">
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
      {/if}
    </div>
  </Tile>
{/if}

<style>
  /* THE TILES, 12 apart: one column on a phone, and as many as fit from there, each at least a ring's width and its line. */
  .spent-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: var(--inset);
    margin-block-end: var(--sp-5);
  }

  .spent-ring {
    display: flex;
    justify-content: center;
  }

  /* THE FIGURE, for his asks on his own key, where there is no cap for a ring to measure against. */
  .spent-figure {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: 34px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE LINE THAT READS THE CHART, at the foot of its tile. */
  .spent-reading {
    margin: auto 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
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
    line-height: 20px;
    font-variant-numeric: tabular-nums;
  }

  .spent-out {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    margin-block-end: var(--sp-5);
  }

  .spent-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .spent-gap {
    margin-block-end: var(--sp-4);
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
    line-height: 18px;
  }

  .spent-h-n {
    font-variant-numeric: tabular-nums;
  }

  /* A LINE: the question and when over each other, the cost at the end, and the way to what it filed after it. */
  .spent-row {
    grid-template-columns: minmax(0, 1fr) auto auto;
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
