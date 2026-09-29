<!--
  The account's usage: `/usage`.

  A MONTH AT A TIME, this one first, with a switcher for the year before it in the toolbar. `?project=` is one
  project's slice, which is where its "Runs on" links.

  THE FIGURES ARE TILES, EACH WITH ITS CHART AND THE LINE THAT READS IT. The month's allowance leads:
  its four meters as rings, amber once one is near its limit and red once actions wait on it, with the binding meter's
  own sentence under them. Then the runs by week as bars, the projects as one stacked bar, the days as a heat grid, and
  Slash's credits as a ring where the host counts them. A chart with nothing behind it is no tile at all.

  THE LISTS SIT ON THE GROUND UNDER THEM: the projects, each with its actions under
  it and the global ones under Everywhere, then the deliveries and arrivals, then Slash's own section, `SlashUsage`.

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and there is ONE allowance, the Directory's, read
  from its answer. A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all is the record's refusal.

  ONE READ, THROUGH `read()`. The page draws the month and hands waiting, refused and offline to `ReadState`,
  so this screen fails the way every screen that reads fails, with Retry. Its two empty answers keep their own
  sentences: a host with nothing to count, and a month with no runs, which says so once rather than over zeroes.

  DELIVERIES AND ARRIVALS LAST, from a second read of the same ledger (`countedOf` below): what the outbox sent and what
  reached a door, counted and never limited, so they sit under everything the allowance is about rather than inside it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { bytes } from 'braindog-render';
  import { humanize } from '$lib/record/names.ts';
  import { titleOf } from '$lib/title.ts';
  import { countsOf, monthRange, monthsBeside, monthWords, readUsage, words, type Named, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import SlashUsage from '$lib/ui/SlashUsage.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import HeatGrid from '$lib/viz/HeatGrid.svelte';
  import Ring from '$lib/viz/Ring.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import { creditsOf, daysSaid, heatOf, projectParts, projectsSaid, ringsOf, said as reading, sentenceOf, weekBars, weeksSaid } from './reading.ts';

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

  const n = (v: number): string => v.toLocaleString('en-GB');

  const view = $derived(usage.value);
  /* A SLICE THAT MATCHES NOTHING SHOWS EVERY PROJECT, with the link back, rather than an empty page under a filter. */
  const sliced = $derived(view && project !== null ? view.groups.filter((g) => g.scope === project) : []);
  const groups = $derived(view ? (sliced.length > 0 ? sliced : view.groups) : []);

  /* WHAT THE FIGURES SAY, from `reading.ts`, where the tests hold them. Today is the ledger's day, in UTC, so the heat
     grid draws nothing for a day that has not come. */
  const today = new Date().toISOString().slice(0, 10);
  const sentence = $derived(view ? sentenceOf(view) : null);
  const heat = $derived(view ? heatOf(view, today) : null);
  const parts = $derived(view ? projectParts(view.groups) : null);

  /**
   * THIS PAGE'S OWN WORDS. The rest are `actions.ts`'s
   * and `reading.ts`'s.
   */
  const said = {
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

  /* THE TWO LISTS UNDER ONE HEADING, each led by the way it went: out of the record, or into it. */
  const countedGroups = $derived<{ key: string; title: string; icon: IconName; rows: { key: string; name: string; counts: string }[] }[]>([
    { key: 'sent', title: said.sent, icon: 'arrowUp', rows: countedRows.sent },
    { key: 'arrived', title: said.arrived, icon: 'arrowDown', rows: countedRows.arrived },
  ]);
</script>

<svelte:head><title>{titleOf(words.usage)}</title></svelte:head>

{#snippet list(rows: Named[])}
  <ul class="ledger use-list">
    {#each rows as r (r.name)}
      <li>
        <div class="line use-row" data-faint={r.faint ? '' : undefined}>
          <span class="line-title">{r.name}</span>
          <span class="line-when use-counts">{countsOf(r)}</span>
        </div>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet months()}
  <!-- THE SWITCHER IS THE TOOLBAR'S GLASS SEGMENTED CONTROL: the month before, this one, the month after, each by its
       name, and neither past the year the ledger keeps or ahead of this month. Links, so Back is the month before. -->
  {#if view}
    <nav class="segmented months" aria-label={words.months}>
      {#if beside.earlier}
        <a class="segment month" href={at(`/usage?month=${beside.earlier}`)} aria-label={words.monthIn(monthWords(beside.earlier))}>{monthWords(beside.earlier)}</a>
      {/if}
      <span class="segment month" data-on aria-current="page">{monthWords(view.month)}</span>
      {#if beside.later}
        <a class="segment month" href={at(`/usage?month=${beside.later}`)} aria-label={words.monthIn(monthWords(beside.later))}>{monthWords(beside.later)}</a>
      {/if}
    </nav>
  {/if}
{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's,
     not as a page of its own. -->
<PageHead title={words.usage} sentence={sentence?.text} needs={sentence?.needs} actions={months} />
<div class="page">
  {#if usage.state === 'waiting' || usage.state === 'refused' || usage.state === 'offline'}
    <ReadState state={usage.state} refusal={usage.refusal} onretry={usage.reread} />
  {:else if !view}
    <Empty kind="no-data-yet" title={words.noLedger} />
  {:else}
    <div class="tiles">
      <!-- THE ALLOWANCE LEADS, one tile a record the person owns: the four meters as rings, each with its own line under
           it, and the binding meter's sentence as the line that reads them. A plan with no limit has no rings; its tile
           holds the month's runs by week instead, so the week bars are not drawn twice. -->
      {#each view.records as r (r.name)}
        {@const rings = ringsOf(r)}
        {@const bound = rings.find((m) => m.binding)}
        <Tile
          data-wide=""
          lead
          icon="observe"
          title={view.current ? reading.allowance : reading.allowanceIn(monthWords(view.month))}
          meta={view.records.length > 1 ? r.name : (r.plan ?? undefined)}
        >
          {#if rings.length > 0}
            <ul class="rings">
              {#each rings as m (m.key)}
                <li class="ring">
                  <Ring value={m.share} max={1} tone={m.tone} size={72} format={() => m.figure} summary={`${m.line}. ${m.said}`} />
                  <span class="ring-name">{m.name}</span>
                  <span class="ring-line num">{m.amount}</span>
                </li>
              {/each}
            </ul>
            {#if r.waiting && r.binding}
              <p class="reading">{words.waitingUntil(r.resets, r.binding)}</p>
            {:else if bound}
              <p class="reading">{bound.name}: {bound.said}</p>
            {/if}
          {:else}
            <p class="figure num">{n(view.totals.runs)}<span class="figure-unit">{reading.runs(view.totals.runs)}</span></p>
            {#if view.totals.runs > 0}<Bars items={weekBars(view)} subject={words.overTime} />{/if}
            <p class="reading">{words.noLimit}</p>
          {/if}
          {#if r.extra}<p class="aside-line">{r.extra}</p>{/if}
        </Tile>
      {/each}

      {#if view.totals.runs > 0 && !(view.records.length > 0 && view.records.every((r) => r.meters.length === 0))}
        <Tile icon="history" title={reading.weeks}>
          <p class="figure num">{n(view.totals.runs)}<span class="figure-unit">{reading.runs(view.totals.runs)}</span></p>
          <Bars items={weekBars(view)} subject={words.overTime} />
          <p class="reading">{weeksSaid(view)}</p>
        </Tile>
      {/if}

      {#if parts}
        <Tile icon="board" title={reading.byProject} count={parts.length}>
          <Stacked {parts} subject={reading.byProject} />
          <p class="reading">{projectsSaid(view.groups)}</p>
        </Tile>
      {/if}

      {#if heat}
        <Tile icon="calendar" title={reading.days}>
          <HeatGrid rows={heat.rows} cols={heat.cols} values={heat.values} subject={reading.days} />
          <p class="reading">{daysSaid(view)}</p>
        </Tile>
      {/if}

      {#each view.records as r (r.name)}
        {@const c = creditsOf(r)}
        {#if c && r.slash}
          <Tile icon="slash" title={reading.credits} meta={view.records.length > 1 ? r.name : undefined}>
            <div class="ring-solo"><Ring value={c.used} max={c.max} tone={c.tone} size={112} label={reading.creditsOf(c.max)} summary={r.slash} /></div>
            <p class="reading">{r.slash}</p>
          </Tile>
        {/if}
      {/each}
    </div>

    <!-- A MONTH WITH NO RUNS SAYS SO ONCE, in place of the lists it would have. -->
    {#if view.totals.runs === 0}
      <Empty kind="no-data-yet" title={view.current ? words.noUsage : words.noUsageIn(monthWords(view.month))} />
    {:else}
      <!-- BY PROJECT, EACH PROJECT'S ACTIONS UNDER IT and the global ones last under Everywhere; a project's "Runs on"
           opens its slice, and the link beside the heading shows every project again. -->
      <Section title={sliced.length > 0 ? words.only(sliced[0]?.name ?? '') : reading.projects} count={sliced.length > 0 ? 0 : groups.length}>
        {#snippet aside()}
          {#if sliced.length > 0}<a class="use-all tap" href={at(`/usage?month=${view.month}`)}>{words.allProjects}</a>{/if}
        {/snippet}
        <div class="use-groups">
          {#each groups as g (g.key)}
            <div class="use-group" data-faint={g.faint ? '' : undefined}>
              <h3 class="use-group-h">
                <IconWell name={g.faint ? 'globe' : 'board'} size="l" />
                <span class="use-group-name">{g.name}</span>
                <span class="use-counts num">{countsOf(g.totals)}</span>
              </h3>
              {@render list(g.actions)}
            </div>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- DELIVERIES AND ARRIVALS, EACH KIND ONE ROW: the name and its count beside it, wrapping under it on a phone. A
         month with neither draws nothing, since there is nothing the owner can do about a zero here. -->
    {#if countedRows.sent.length > 0 || countedRows.arrived.length > 0}
      <Section title={said.counted}>
        <p class="use-why">{said.countedWhy}</p>
        <div class="use-groups">
          {#each countedGroups as g (g.key)}
            {#if g.rows.length > 0}
              <div class="use-group">
                <h3 class="use-group-h">
                  <IconWell name={g.icon} size="l" />
                  <span class="use-group-name">{g.title}</span>
                </h3>
                <ul class="ledger use-list">
                  {#each g.rows as r (r.key)}
                    <li>
                      <div class="line use-row">
                        <span class="line-title">{r.name}</span>
                        <span class="line-when use-counts">{r.counts}</span>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/each}
        </div>
      </Section>
    {/if}

    <!-- SLASH'S SECTION, THIS MONTH AND THE OWNER'S ONLY: the ledger's door answers the owner alone, and the status door
         says this month's count and nothing of a month gone. It draws nothing on a host without a model. -->
    {#if view.current && view.owner}
      <SlashUsage month={view.month} />
    {/if}
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* THE SWITCHER, in the toolbar. The chosen month is the white pill (`controls.css`); a link is a segment like any
     other, and never underlined. */
  .months .month {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  /* THE TILES: one column on a phone, two from a tablet's width, three from a desk's, 12 apart. The
     allowance takes two columns wherever there are two. */
  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    align-items: stretch;
  }

  @container (inline-size >= 600px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles > :global([data-wide]) {
      grid-column: span 2;
    }
  }

  @container (inline-size >= 960px) {
    .tiles {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* THE FIGURE (`t-figure`): 30 on 34 at 600, and the unit beside it in the meta step. */
  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-figure);
    font-weight: 600;
    line-height: 34px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  /* THE ONE LINE THAT READS THE CHART, at the foot of its tile. Waiting actions are said here in ink: the
     ring that ran out is red, and so is the phrase in the sentence, which is enough red for one fact. */
  .reading {
    margin: auto 0 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .aside-line {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* FOUR RINGS IN A ROW, and two by two where four do not fit. Each ring's name and figures sit under it. */
  .rings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    gap: var(--sp-4) var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ring {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .ring :global(.viz-ring) {
    margin-block-end: var(--sp-2);
  }

  .ring-name {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 20px;
  }

  .ring-line {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
  }

  .ring-solo {
    display: flex;
    justify-content: center;
  }

  /* THE LISTS ON THE GROUND: a project's heading with its well and its counts, and its actions under it as 44px rows. */
  .use-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .use-group-h {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    margin: 0;
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .use-group-name {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .use-group[data-faint] .use-group-name {
    color: var(--ink2);
  }

  .use-counts {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* AN ACTION'S ROW STARTS WHERE ITS PROJECT'S NAME DOES, past the well, so the list reads as the project's own. */
  .use-list {
    margin-inline-start: var(--well-l);
  }

  .use-row {
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: var(--row-h);
  }

  .use-row .line-title {
    font-size: var(--t-base);
  }

  .use-row[data-faint] .line-title {
    color: var(--ink2);
  }

  .use-why {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .use-all {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .use-all:hover {
      color: var(--ink);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE A ROW'S COUNTS WRAP UNDER ITS NAME rather than squeezing it, and an action's row starts at the gutter. */
  @media (width < 640px) {
    .use-list {
      margin-inline-start: 0;
    }

    .use-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }

    .use-row .line-when {
      grid-column: 1;
      grid-row: 2;
      justify-content: flex-start;
      white-space: normal;
    }

    .use-group-h {
      flex-wrap: wrap;
      row-gap: 2px;
    }

    .use-counts {
      flex-basis: 100%;
      padding-inline-start: calc(var(--well-l) + var(--sp-3));
    }
  }
</style>
