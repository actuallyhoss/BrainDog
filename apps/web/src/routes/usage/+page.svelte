<!--
  The account's usage: `/usage` (`loop/research-scheduled-actions.md` §6.3).

  THIS MONTH, AND NOTHING TO SET. Runs, requests, bytes and failures, per project and per action, as
  lists without boxes, and one bar per week drawn with the `bar` kind every page uses.

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and on a plan with a limit this draws
  the month against it with the `gauge` kind, and says plainly when actions are waiting for next month.
  A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all draws the sample.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Block as Drawn } from 'braindog-render';
  import { Block } from 'braindog-render/svelte';
  import '$lib/blocks-charts.css';
  import { titleOf } from '$lib/title.ts';
  import { NOW } from '$lib/record/api.ts';
  import { countsOf, monthWords, readUsage, words, type Named, type UsageView } from '$lib/record/actions.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  let from = $state<'reading' | 'ready' | 'none' | 'refused'>('reading');
  let view = $state<UsageView | null>(null);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await readUsage((url, init) => fetch(url, init), Date.now(), '', NOW);
    closed(out.ok !== false, at);
    if (out.ok === true) {
      view = out.view;
      from = 'ready';
    } else if (out.ok === 'none') from = 'none';
    else {
      fix = out.refusal.fix;
      from = 'refused';
    }
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && view && view.totals.runs > 0) drew('ready');
  });

  /** A block of one of the existing kinds, from rows this page worked out. */
  const block = (kind: 'bar' | 'gauge', rows: Drawn['rows']): Drawn => ({ type: 'block', kind, rows, raw: '', start: 0, end: 0 });
  const n = (v: number): string => v.toLocaleString('en-GB');

  const weeks = $derived(view ? block('bar', view.weeks.map((w) => ({ cells: [w.label, n(w.runs)] }))) : null);
</script>

<svelte:head><title>{titleOf(words.usage)}</title></svelte:head>

{#snippet list(rows: Named[])}
  <ul class="usage-list">
    {#each rows as r (r.name)}
      <li class="usage-row" data-faint={r.faint ? '' : undefined}>
        <span class="usage-name">{r.name}</span>
        <span class="usage-counts num">{countsOf(r)}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#if from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={fix} />
  </div>
{:else if from === 'none'}
  <PageHead icon="observe" title={words.usage} />
  <div class="page">
    <Empty kind="no-data-yet" heading title={words.noLedger} />
  </div>
{:else if from === 'ready' && view}
  <!-- THE MONTH NAMES THE FIRST SECTION, NOT THE HEAD. Above the title it read as the page's parent,
       which is what that line means on every other screen, and the section under it said "This
       month" without saying which. -->
  <PageHead icon="observe" title={words.usage} />
  <div class="page">
    <Section title={words.usageFor(monthWords(view.month))}>
      {#each view.records as r (r.name)}
        <div class="usage-record">
          {#if view.records.length > 1}<p class="usage-name">{r.name}</p>{/if}
          {#if r.allowance !== null}
            <Block block={block('gauge', [{ cells: [r.name, n(r.used), n(r.allowance)], ...(r.waiting ? { tone: 'warn' as const } : {}) }])} />
            <p class="usage-said">{words.ofAllowance(r.used, r.allowance, r.resets)}</p>
            {#if r.waiting}<p class="usage-said" data-intent="warn">{words.waitingUntil(r.resets)}</p>{/if}
          {:else}
            <p class="usage-said">{words.noLimit}</p>
          {/if}
        </div>
      {/each}
      <p class="usage-total num">{countsOf(view.totals)}</p>
    </Section>

    {#if view.totals.runs === 0}
      <Empty kind="no-data-yet" title={words.noUsage} />
    {:else}
      <Section title={words.overTime}>
        {#if weeks}<Block block={weeks} />{/if}
      </Section>
      <Section title={words.byProject}>{@render list(view.projects)}</Section>
      <Section title={words.byAction}>{@render list(view.actions)}</Section>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  .usage-record {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
  }

  .usage-said,
  .usage-total {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .usage-total {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .usage-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A LIST WITHOUT BOXES: the name on the left, the counts on the right, and space between rows. */
  .usage-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-4);
    padding-block: var(--sp-2);
  }

  .usage-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .usage-counts {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .usage-row[data-faint] .usage-name {
    color: var(--dim);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
