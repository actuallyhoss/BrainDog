<!--
  The account's usage: `/usage` (`loop/research-scheduled-actions.md` §6.3).

  A MONTH AT A TIME, this one first, with a switcher for the year before it. Runs, requests, bytes, run time and
  failures, by project with each project's actions under it and the global ones under Everywhere, as lists without
  boxes, and one bar per week drawn with the `bar` kind every page uses. `?project=` is one project's slice, which is
  where its "Runs on" links.

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and on a plan with a limit this draws the plan, and
  the month against each of its four meters with a thin bar and a sentence, names the one nearest its limit, and says
  plainly when actions are waiting for next month and which meter held them. There is ONE allowance, the Directory's,
  read from its answer: the web's own copy of the figure went. Slash's credits and extra usage are said when the
  host counts them; the rest of Slash is its own section under the month, `SlashUsage`: his asks and the background
  work's allowance apart, the asks by day with what each cost and filed, and the two ways on when the month is spent.
  A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all is the record's refusal:
  it drew the sample's month, counted against projects nobody has, until DIRECTION 26.

  ONE READ, THROUGH `read()` (ARC-5). The page draws the month and hands waiting, refused and offline
  to `ReadState`, so this screen fails the way every screen that reads fails, with Retry. Its two empty
  answers keep their own sentences, because each says what will be here and why it is not yet: a host
  with nothing to count, and a month with no runs. A month with no runs says so once: the zero line
  under the meters went, since "0 runs · 0 requests · 0 B" over "Nothing has run this month" was the
  same fact twice (`loop/finish/design.md` 2.14).

  DELIVERIES AND ARRIVALS LAST, from a second read of the same ledger (`countedOf` below): what the
  outbox sent and what reached a door, counted and never limited, so they sit under everything the
  allowance is about rather than inside it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { bytes, type Block as Drawn } from 'braindog-render';
  import { humanize } from '$lib/record/names.ts';
  import { Block } from 'braindog-render/svelte';
  import '@braindog/skin/blocks-charts.css';
  import { titleOf } from '$lib/title.ts';
  import { countsOf, monthRange, monthsBeside, monthWords, readUsage, words, type Named, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import SlashUsage from '$lib/ui/SlashUsage.svelte';

  /* THE MONTH AND THE PROJECT ARE THE ADDRESS'S, so the switcher is two links, Back returns to the month before, and
     a project's "Runs on" can link straight to its slice (`usageHref`). A month the ledger cannot answer is this one. */
  const month = $derived(monthRange(Date.now(), page.url.searchParams.get('month') ?? undefined).month);
  const project = $derived(page.url.searchParams.get('project'));
  const beside = $derived(monthsBeside(Date.now(), month));

  /**
   * The month, or `null` for a host with no ledger and no run events to count.
   *
   * `null` IS AN ANSWER, NOT A REFUSAL. `readUsage` says `none` for a host without the route, which is a
   * designed empty state; only its refusal is the record saying no. The raw `fetch` stays until
   * `readUsage` reads through the client: the ledger is a host door, not a record method.
   */
  async function usageOf(): Promise<Result<UsageView | null>> {
    const out = await readUsage((url, init) => fetch(url, init), Date.now(), '', apiBase(page.url), month);
    if (out.ok === true) return { ok: true, value: out.view };
    if (out.ok === 'none') return { ok: true, value: null };
    return { ok: false, refusal: out.refusal };
  }

  /* THE RECORD'S ADDRESS AND THE MONTH ARE THE QUESTION, so moving to another record, or another month, asks again
     rather than drawing the last answer under the new name. The project is not: a slice is drawn from the same month. */
  const usage = read(() => `${apiBase(page.url)} ${month}`, usageOf, { empty: (v) => v === null || v.totals.runs === 0 });

  /** A block of one of the existing kinds, from rows this page worked out. */
  const block = (kind: 'bar', rows: Drawn['rows']): Drawn => ({ type: 'block', kind, rows, raw: '', start: 0, end: 0 });
  const n = (v: number): string => v.toLocaleString('en-GB');

  const view = $derived(usage.value);
  const weeks = $derived(view ? block('bar', view.weeks.map((w) => ({ cells: [w.label, n(w.runs)] }))) : null);
  /* A SLICE THAT MATCHES NOTHING SHOWS EVERY PROJECT, with the link back, rather than an empty page under a filter. */
  const sliced = $derived(view && project !== null ? view.groups.filter((g) => g.scope === project) : []);
  const groups = $derived(view ? (sliced.length > 0 ? sliced : view.groups) : []);

  /**
   * THIS PAGE'S OWN WORDS (`loop/finish/contracts.md` X44 gives the page's words to EDT-4). The rest are `actions.ts`'s.
   *
   * THE MONTH'S HEADING SAYS RUNS, NOT "SCHEDULED ACTIONS". The ledger counts an automation's runs and a script's
   * against the same allowance (`loop/finish/decisions.md` C34), so a heading naming only one of those kinds was wrong
   * about the figures under it.
   */
  const said = {
    month: (month: string) => `What ran in ${month}`,
    counted: 'Deliveries and arrivals',
    countedWhy: 'Counted here and never held by the monthly limit, because neither is work this record chose to run: one is a notice it owed somebody, the other is something sent to it.',
    sent: 'Sent',
    arrived: 'Arrived',
    sentCount: (n: string) => `${n} sent`,
    arrivedCount: (n: string, size: string) => `${n} arrived · ${size}`,
  };

  /** One kind of delivery or arrival over the month: its name in the ledger, how many, and for an arrival its bytes. */
  type Counted = { action: string; runs: number; bytes: number };

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  /**
   * The deliveries and arrivals of the month on screen, every owned record summed by kind.
   *
   * THE LEDGER'S `counted` ROWS (`@braindog/record` `directory.ts`, `COUNTED_ONLY`): a notice the outbox sent is
   * `deliver:<kind>` and a message that reached a door is `in:<channel>`, written by `@braindog/host`'s `deliveryRun`
   * and `arrivalRun`. `readUsage` keeps only the keys the rest of this page draws, so they are asked for here.
   *
   * A SECOND READ, ASKED ONCE THE MONTH HAS DRAWN, so rows that sit under everything else never hold the page back.
   * Anything short of a ledger answer (an older host, a member, a dropped line) is no rows and no section: this is a
   * count to glance at, and the month above has already said whether the record could be reached.
   */
  async function countedOf(): Promise<Result<Counted[]>> {
    const range = monthRange(Date.now(), month);
    let body: unknown;
    try {
      const res = await fetch(`/account/usage?from=${range.from}&to=${range.to}`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: true, value: [] };
      }
      body = await res.json();
    } catch {
      return { ok: true, value: [] };
    }
    const value = typeof body === 'object' && body !== null && 'ok' in body && body.ok === true && 'value' in body ? body.value : null;
    const records = typeof value === 'object' && value !== null && 'records' in value && Array.isArray(value.records) ? (value.records as unknown[]) : [];
    const by = new Map<string, Counted>();
    for (const r of records) {
      const rows = typeof r === 'object' && r !== null && 'counted' in r && Array.isArray(r.counted) ? (r.counted as unknown[]) : [];
      for (const c of rows) {
        if (typeof c !== 'object' || c === null || !('action' in c) || typeof c.action !== 'string') continue;
        const had = by.get(c.action) ?? { action: c.action, runs: 0, bytes: 0 };
        had.runs += num('runs' in c ? c.runs : 0);
        had.bytes += num('bytes' in c ? c.bytes : 0);
        by.set(c.action, had);
      }
    }
    return { ok: true, value: [...by.values()].filter((c) => c.runs > 0) };
  }

  /* ASKED ONLY OF THE OWNER'S LEDGER, the one answer that carries these rows, and again when the month changes. */
  const counted = read(() => (view && view.from === 'ledger' && view.owner ? `${apiBase(page.url)} ${view.month} counted` : null), countedOf);

  /** The rows as two lists, what was sent and what arrived, each named by its kind in words. */
  const countedRows = $derived.by(() => {
    const rows = counted.value ?? [];
    const named = (prefix: string): Counted[] => rows.filter((c) => c.action.startsWith(prefix)).sort((a, b) => b.runs - a.runs);
    return {
      sent: named('deliver:').map((c) => ({ key: c.action, name: humanize(c.action.slice('deliver:'.length)), counts: said.sentCount(n(c.runs)) })),
      arrived: named('in:').map((c) => ({ key: c.action, name: humanize(c.action.slice('in:'.length)), counts: said.arrivedCount(n(c.runs), bytes(c.bytes)) })),
    };
  });
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
    <!-- THE SWITCHER FIRST, two links as tall as a thumb: the month before and the month after, each by its name, and
         neither past the year the ledger keeps or ahead of this month. -->
    <nav class="usage-months" aria-label={words.months}>
      {#if beside.earlier}
        <a class="usage-month" href={at(`/usage?month=${beside.earlier}`)} aria-label={words.monthIn(monthWords(beside.earlier))}>{monthWords(beside.earlier)}</a>
      {/if}
      <span class="usage-month usage-month-now" aria-current="page">{monthWords(view.month)}</span>
      {#if beside.later}
        <a class="usage-month" href={at(`/usage?month=${beside.later}`)} aria-label={words.monthIn(monthWords(beside.later))}>{monthWords(beside.later)}</a>
      {/if}
    </nav>

    <!-- THE MONTH NAMES THE FIRST SECTION, NOT THE HEAD. Above the title it read as the page's parent,
         which is what that line means on every other screen, and the section under it said "This
         month" without saying which. -->
    <Section title={said.month(monthWords(view.month))}>
      <!-- A MEMBER IS TOLD WHY THERE IS NO PLAN HERE, and sees the record's own runs under it when the record answers. -->
      {#if !view.owner}
        <p class="usage-said">{view.from === 'events' ? words.notOwner : words.notOwnerNone}</p>
      {/if}
      {#each view.records as r (r.name)}
        <div class="usage-record">
          {#if view.records.length > 1}<p class="usage-name">{r.name}</p>{/if}
          {#if r.planLine}<p class="usage-said">{r.planLine}</p>{/if}
          {#if r.meters.length > 0}
            <ul class="usage-meters">
              {#each r.meters as m (m.key)}
                <li class="usage-meter" data-near={m.share >= 0.8 ? '' : undefined}>
                  <span class="usage-meter-line num">{m.line}</span>
                  <span class="usage-bar" aria-hidden="true"><span class="usage-fill" style:inline-size={`${Math.round(m.share * 1000) / 10}%`}></span></span>
                  <span class="usage-meter-said">{m.said}</span>
                </li>
              {/each}
            </ul>
            {#if r.waiting && r.binding}
              <p class="usage-said usage-warn">{words.waitingUntil(r.resets, r.binding)}</p>
            {:else if r.binding}
              <p class="usage-said">{words.binding(r.binding)}</p>
            {/if}
          {:else}
            <p class="usage-said">{words.noLimit}</p>
          {/if}
          {#if r.slash}<p class="usage-said">{r.slash}</p>{/if}
          {#if r.extra}<p class="usage-said">{r.extra}</p>{/if}
        </div>
      {/each}
      {#if view.totals.runs > 0}<p class="usage-total num">{countsOf(view.totals)}</p>{/if}
    </Section>

    <!-- SLASH'S SECTION, THIS MONTH AND THE OWNER'S ONLY: the ledger's door answers the owner alone, and the status door
         says this month's count and nothing of a month gone. It draws nothing on a host without a model. -->
    {#if view.current && view.owner}
      <SlashUsage month={view.month} />
    {/if}

    {#if view.totals.runs === 0}
      <Empty kind="no-data-yet" title={view.current ? words.noUsage : words.noUsageIn(monthWords(view.month))} />
    {:else}
      <Section title={words.overTime}>
        {#if weeks}<Block block={weeks} />{/if}
      </Section>
      <!-- BY PROJECT, EACH PROJECT'S ACTIONS UNDER IT and the global ones last under Everywhere; a project's "Runs on"
           opens its slice, and the link under it shows every project again. -->
      <Section title={sliced.length > 0 ? words.only(sliced[0]?.name ?? '') : words.byProject}>
        {#each groups as g (g.key)}
          <div class="usage-group">
            <h3 class="usage-row usage-group-h" data-faint={g.faint ? '' : undefined}>
              <span class="usage-name">{g.name}</span>
              <span class="usage-counts num">{countsOf(g.totals)}</span>
            </h3>
            {@render list(g.actions)}
          </div>
        {/each}
        {#if sliced.length > 0}
          <a class="usage-all" href={at(`/usage?month=${view.month}`)}>{words.allProjects}</a>
        {/if}
      </Section>
    {/if}

    <!-- DELIVERIES AND ARRIVALS, EACH KIND ONE ROW, drawn as the projects are: the name on one line and its count beside
         it, wrapping under it on a phone. A month with neither draws nothing, since there is nothing the owner can do
         about a zero here. -->
    {#if countedRows.sent.length > 0 || countedRows.arrived.length > 0}
      <Section title={said.counted}>
        <p class="usage-said">{said.countedWhy}</p>
        {#each [{ key: 'sent', title: said.sent, rows: countedRows.sent }, { key: 'arrived', title: said.arrived, rows: countedRows.arrived }] as g (g.key)}
          {#if g.rows.length > 0}
            <div class="usage-group">
              <h3 class="usage-row usage-group-h"><span class="usage-name">{g.title}</span></h3>
              <ul class="usage-list">
                {#each g.rows as r (r.key)}
                  <li class="usage-row">
                    <span class="usage-name">{r.name}</span>
                    <span class="usage-counts num">{r.counts}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {/each}
      </Section>
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

  /* A SENTENCE NEVER RUNS WIDER THAN `--measure`, and at 1440 the page's 820px is wider than that. */
  .usage-said,
  .usage-total {
    margin: 0;
    max-inline-size: var(--measure);
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

  .usage-warn {
    color: var(--warn);
  }

  /* THE SWITCHER: the month on screen between its neighbours, each a target a thumb can take. */
  .usage-months {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .usage-month {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    padding-inline: var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .usage-month-now {
    color: var(--ink);
    font-weight: 600;
  }

  /* THE FOUR METERS: the line, a thin bar under it, and the sentence. The bar is the line said again, so it is hidden
     from a screen reader, which has the line. */
  .usage-meters {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .usage-meter {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .usage-meter-line {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .usage-meter-said {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .usage-bar {
    display: block;
    block-size: 4px;
    border-radius: var(--r-pill);
    background: var(--line-soft);
    overflow: hidden;
  }

  .usage-fill {
    display: block;
    block-size: 100%;
    border-radius: var(--r-pill);
    background: var(--ink2);
  }

  .usage-meter[data-near] .usage-fill {
    background: var(--warn);
  }

  .usage-group {
    display: flex;
    flex-direction: column;
    margin-block-end: var(--sp-3);
  }

  .usage-group-h {
    margin: 0;
    border-block-end: 1px solid var(--line-soft);
    font-size: inherit;
  }

  .usage-all {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE, ONE COLUMN: each name on one line, cut short if it must be, and its counts wrapping under it. */
  @media (width < 640px) {
    .usage-row {
      flex-direction: column;
      align-items: stretch;
    }

    .usage-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
</style>
