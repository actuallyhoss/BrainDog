<!--
  The account's usage: `/usage` (`loop/research-scheduled-actions.md` §6.3).

  THIS MONTH, AND NOTHING TO SET. Runs, requests, bytes and failures, per project and per action, as
  lists without boxes, and one bar per week drawn with the `bar` kind every page uses.

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and on a plan with a limit this draws
  the month against it with the `gauge` kind, and says plainly when actions are waiting for next month.
  A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all is the record's refusal:
  it drew the sample's month, counted against projects nobody has, until DIRECTION 26.

  ONE READ, THROUGH `read()` (ARC-5). The page draws the month and hands waiting, refused and offline
  to `ReadState`, so this screen fails the way every screen that reads fails, with Retry. Its two empty
  answers keep their own sentences, because each says what will be here and why it is not yet: a host
  with nothing to count, and a month with no runs.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import type { Block as Drawn } from 'braindog-render';
  import { Block } from 'braindog-render/svelte';
  import '$lib/blocks-charts.css';
  import { titleOf } from '$lib/title.ts';
  import { countsOf, monthWords, readUsage, words, type Named, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';

  /**
   * The month, or `null` for a host with no ledger and no run events to count.
   *
   * `null` IS AN ANSWER, NOT A REFUSAL. `readUsage` says `none` for a host without the route, which is a
   * designed empty state; only its refusal is the record saying no. The raw `fetch` stays until
   * `readUsage` reads through the client: the ledger is a host door, not a record method.
   */
  async function usageOf(): Promise<Result<UsageView | null>> {
    const out = await readUsage((url, init) => fetch(url, init), Date.now(), '', apiBase(page.url));
    if (out.ok === true) return { ok: true, value: out.view };
    if (out.ok === 'none') return { ok: true, value: null };
    return { ok: false, refusal: out.refusal };
  }

  /* THE RECORD'S ADDRESS IS THE QUESTION, so moving to another record under the same route asks again
     rather than drawing the last record's month under the new one's name. */
  const usage = read(() => apiBase(page.url), usageOf, { empty: (v) => v === null || v.totals.runs === 0 });

  /** A block of one of the existing kinds, from rows this page worked out. */
  const block = (kind: 'bar' | 'gauge', rows: Drawn['rows']): Drawn => ({ type: 'block', kind, rows, raw: '', start: 0, end: 0 });
  const n = (v: number): string => v.toLocaleString('en-GB');

  const view = $derived(usage.value);
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

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's,
     not as a page of its own. -->
<PageHead icon="observe" title={words.usage} />
<div class="page">
  {#if usage.state === 'waiting' || usage.state === 'refused' || usage.state === 'offline'}
    <ReadState state={usage.state} refusal={usage.refusal} onretry={usage.reread} />
  {:else if !view}
    <Empty kind="no-data-yet" title={words.noLedger} />
  {:else}
    <!-- THE MONTH NAMES THE FIRST SECTION, NOT THE HEAD. Above the title it read as the page's parent,
         which is what that line means on every other screen, and the section under it said "This
         month" without saying which. -->
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
  {/if}
</div>

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
