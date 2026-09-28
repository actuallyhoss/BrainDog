<!--
  What Slash spent, on `/usage` (`loop/finish/agents.md` AGT-29; the page's Slash section, `contracts.md` X44).

  TWO ALLOWANCES, APART. His asks against his cap first, then the background work's own month (the daily look, an
  automation's question, a digest's prose, a pattern drafted for the inbox), because one never spends the other
  (`contracts.md` §7.5 and X41). Under them, the asks by day as bars, then each day's lines: what was asked, when, what it
  cost and a link to what it filed. The rules are `slash-asks.ts`, which the tests hold; this draws what they answer.

  RUNNING OUT SAYS SO, and `SlashOut` offers the two ways on beside the sentence.

  THE OWNER'S, AND ONLY WHERE A MODEL IS. The ledger's door answers the owner alone, and a host with no model has nothing to
  count, so the page mounts this for the owner and it draws nothing on a host without Slash. A failed read draws nothing
  either: the page's own read above already says when the record cannot be reached, and this is one section of it.

  ONE COLUMN AT 390. The meters stack, the bars are the `bar` kind every page uses (label, bar, figure on one row), and a
  line's question wraps above its cost rather than pushing the figure off the edge.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type SlashAsked, type SlashStatus } from '@braindog/client';
  import type { Block as Drawn } from 'braindog-render';
  import { Block } from 'braindog-render/svelte';
  import { apiBase, at } from '$lib/at.ts';
  import {
    asksLine,
    atCap,
    backgroundLine,
    BACKGROUND_ASKS_MONTH,
    costSaid,
    LEDGER_FETCHED,
    metered,
    resetsWords,
    spentIn,
    words,
  } from '$lib/ui/slash-asks.ts';
  import Section from '$lib/ui/Section.svelte';
  import SlashOut from '$lib/ui/SlashOut.svelte';

  /* `month` is the page's `YYYY-MM`, and the page mounts this on the current month only: the status door says this
     month's count and nothing of a month gone. */
  let { month }: { month: string } = $props();

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
  const share = (used: number, cap: number): string => `${cap <= 0 ? 100 : Math.round(Math.min(1, used / cap) * 1000) / 10}%`;
  const bars = $derived<Drawn | null>(
    spent && spent.days.length > 0
      ? { type: 'block', kind: 'bar', rows: spent.days.map((d) => ({ cells: [d.label, String(d.asks)] })), raw: '', start: 0, end: 0 }
      : null,
  );
</script>

{#if status && spent}
  <Section title={words.title}>
    <ul class="spent-meters">
      {#if mine}
        <li class="spent-meter" data-near={metered(status) && status.asks.used >= status.asks.cap * 0.8 ? '' : undefined}>
          <span class="spent-meter-line num">{mine}</span>
          {#if metered(status)}
            <span class="spent-bar" aria-hidden="true"><span class="spent-fill" style:inline-size={share(status.asks.used, status.asks.cap)}></span></span>
          {/if}
        </li>
      {/if}
      <li class="spent-meter" data-near={spent.background >= BACKGROUND_ASKS_MONTH * 0.8 ? '' : undefined}>
        <span class="spent-meter-line num">{backgroundLine(spent)}</span>
        <span class="spent-bar" aria-hidden="true"><span class="spent-fill" style:inline-size={share(spent.background, BACKGROUND_ASKS_MONTH)}></span></span>
      </li>
    </ul>

    {#if atCap(status)}
      <div class="spent-out">
        <p class="spent-said spent-warn">{words.out(resetsWords(status.asks.resets))}</p>
        <SlashOut />
      </div>
    {/if}

    {#if spent.days.length === 0}
      <p class="spent-said">{words.none}</p>
    {:else}
      <h3 class="spent-h">{words.byDay}</h3>
      {#if bars}<Block block={bars} />{/if}
      {#if !spent.whole}<p class="spent-said">{words.partial}</p>{/if}
      {#each spent.days as d (d.day)}
        <div class="spent-day">
          <h3 class="spent-h">{d.label}</h3>
          <ul class="spent-list">
            {#each d.lines as l (l.id)}
              <li class="spent-row">
                <span class="spent-top">
                  <span class="spent-what" dir="auto">{l.what}</span>
                  <span class="spent-cost num">{costSaid(l.cost, l.background)}</span>
                </span>
                <span class="spent-meta">
                  <span>{l.refused ? `${l.when}, ${words.refused}` : l.when}</span>
                  {#if l.href}<a class="spent-filed" href={at(l.href)}>{words.filed}</a>{/if}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </Section>
{/if}

<style>
  /* THE PAGE'S METERS, REDRAWN HERE because that page's rules are scoped to it: the line, a thin bar under it, the bar
     hidden from a screen reader, which has the line. */
  .spent-meters {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .spent-meter {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .spent-meter-line {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .spent-bar {
    display: block;
    block-size: 4px;
    border-radius: var(--r-pill);
    background: var(--line-soft);
    overflow: hidden;
  }

  .spent-fill {
    display: block;
    block-size: 100%;
    border-radius: var(--r-pill);
    background: var(--ink2);
  }

  .spent-meter[data-near] .spent-fill {
    background: var(--warn);
  }

  .spent-out {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
  }

  .spent-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .spent-warn {
    color: var(--warn);
  }

  .spent-h {
    margin: var(--sp-4) 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .spent-day {
    display: flex;
    flex-direction: column;
  }

  .spent-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A LIST WITHOUT BOXES, a hairline between rows: the question and its cost on the first line, when and what it filed
     under it. */
  .spent-row {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--line-soft);
  }

  .spent-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-4);
  }

  .spent-what {
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  .spent-cost {
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .spent-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .spent-filed {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    color: var(--ink2);
  }
</style>
