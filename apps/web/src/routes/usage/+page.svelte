<!--
  The account's usage: `/usage`.

  A MONTH AT A TIME, this one first, with a switcher for the year before it in the toolbar. `?project=` is one
  project's slice, which is where its "Runs on" links.

  THE FIGURES ARE TILES, EACH WITH ITS CHART AND THE LINE THAT READS IT. The month's allowance leads:
  its four meters as rings, amber once one is near its limit and red once actions wait on it, with the binding meter's
  own sentence under them. Then the runs by week as bars, the projects as one stacked bar, the days as a heat grid, and
  Slash's asks as a ring where the answer carries an allowance of them. A chart with nothing behind it is no tile at
  all: with no allowance, the Slash line sits under the month's allowance instead.

  THE LISTS SIT ON THE GROUND UNDER THEM: a row a project and a row an action, busiest first, or one project's actions
  under it when the page is its slice; then the deliveries and arrivals, then Slash's own section, `SlashUsage`.

  THE PLAN'S LIMITS IN ONE SENTENCE under the rings, and extra usage under it: the month's running amount against the
  cap, and on a paid record of a host that sells it, the cap itself to set (`ExtraCap`).

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and there is ONE allowance, the Directory's, read
  from its answer. A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all is the record's refusal.

  ONE READ, THROUGH `read()`. The page draws the month and hands waiting, refused and offline to `ReadState`,
  so this screen fails the way every screen that reads fails, with Retry. A month that could not be drawn from an
  answer that came is a draw fault, said as one ("This screen could not be drawn", and Usage named), never as a record
  out of reach: the reader's own build of the month returns it, and a boundary round the board catches the rest. Its two empty answers keep their own
  sentences: a host with nothing to count, and a month with no runs, which says so once rather than over zeroes.

  DELIVERIES AND ARRIVALS LAST, from a second read of the same ledger (`countedOf` below): what the outbox sent and what
  reached a door, counted and never limited, so they sit under everything the allowance is about rather than inside it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import { apiBase, at } from '$lib/at.ts';
  import { bytes } from 'braindog-render';
  import { humanize } from '$lib/record/names.ts';
  import { titleOf } from '$lib/title.ts';
  import { countsOf, monthRange, monthsBeside, monthWords, readUsage, words, type Named, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import SlashUsage from '$lib/ui/SlashUsage.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import { lineIn } from '$lib/motion';
  import HeatGrid from '$lib/viz/HeatGrid.svelte';
  import Ring from '$lib/viz/Ring.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import { homeCurrency } from '$lib/record/api.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { asksOf, byProject, daysSaid, earlierOf, groupName, heatOf, offCloud, projectParts, projectsSaid, placeOf, ringsOf, said as reading, sentenceOf, weekBars, weeksSaid } from './reading.ts';
  import { extraOffered, hostedHere, readBilling, type BillingAnswer } from '../settings/billing.ts';
  import ExtraCap from './ExtraCap.svelte';
  import { inIosApp } from '$lib/shell.ts';
  import type { Shell } from '$lib/record/boot-live.ts';

  /* THE MONTH AND THE PROJECT ARE THE ADDRESS'S, so the switcher is two links, Back returns to the month before, and
     a project's "Runs on" can link straight to its slice (`usageHref`). A month the ledger cannot answer is this one. */
  const month = $derived(monthRange(recordNow(), page.url.searchParams.get('month') ?? undefined).month);
  const project = $derived(page.url.searchParams.get('project'));
  const beside = $derived(monthsBeside(recordNow(), month));
  /** A desk, where the month switch sits at the end of the sentence's row. */
  const wide = new MediaQuery('(width >= 900px)', true);

  /**
   * The month, or `null` for a host with no ledger and no run events to count.
   *
   * `null` IS AN ANSWER, NOT A REFUSAL. `readUsage` says `none` for a host without the route, which is a
   * designed empty state; only its refusal is the record saying no. The raw `fetch` stays until
   * `readUsage` reads through the client: the ledger is a host door, not a record method.
   */
  async function usageOf(): Promise<Result<UsageView | Fault | null>> {
    const out = await readUsage((url, init) => fetch(url, init), recordNow(), '', apiBase(page.url), month, homeCurrency());
    if (out.ok === true) return { ok: true, value: out.view };
    if (out.ok === 'none') return { ok: true, value: null };
    /* AN ANSWER, NOT A REFUSAL: the record was reached, and the fault is this screen's, drawn below as one. */
    if (out.ok === 'fault') return { ok: true, value: { fault: out.refusal.fix } };
    return { ok: false, refusal: out.refusal };
  }

  /** A month the reader could not draw from the answer it was given, and the reason, for Details. */
  type Fault = { fault: string };

  /* THE RECORD'S ADDRESS AND THE MONTH ARE THE QUESTION, so moving to another record, or another month, asks again
     rather than drawing the last answer under the new name. The project is not: a slice is drawn from the same month. */
  const usage = read(() => `${apiBase(page.url)} ${month}`, usageOf, { empty: (v) => v === null || ('totals' in v && v.totals.runs === 0) });

  const n = (v: number): string => v.toLocaleString('en-GB');

  const fault = $derived(usage.value && 'fault' in usage.value ? usage.value.fault : null);
  /* ONLY THE CLOUD HOLDS A RECORD TO AN ALLOWANCE: anywhere else the month is its counts and
     charts, with no rings and no plan, as Billing says there is nothing to bill. */
  const hosted = $derived(hostedHere(page.data as unknown as Shell));
  const view = $derived(usage.value && !('fault' in usage.value) ? (hosted ? usage.value : offCloud(usage.value)) : null);
  /* NO MONTH FROM BEFORE THE RECORD WAS MADE. */
  const earlier = $derived(view ? earlierOf(beside, view) : beside.earlier);
  /* A SLICE THAT MATCHES NOTHING SHOWS EVERY PROJECT, with the link back, rather than an empty page under a filter. */
  const sliced = $derived(view && project !== null ? view.groups.filter((g) => g.scope === project) : []);
  const groups = $derived(view ? (sliced.length > 0 ? sliced : view.groups) : []);

  /* WHAT THE FIGURES SAY, from `reading.ts`, where the tests hold them. Today is the ledger's day on the record's clock (`recordNow`), in UTC, so the heat
     grid draws nothing for a day that has not come. */
  const today = new Date(recordNow()).toISOString().slice(0, 10);
  /* THE HEAD SITS OUTSIDE THE BOARD'S BOUNDARY, so a sentence that cannot be said is no sentence, and the board says why. */
  const sentence = $derived.by(() => {
    try {
      return view ? sentenceOf(view) : null;
    } catch {
      return null;
    }
  });
  const heat = $derived(view ? heatOf(view, today) : null);

  /* WHETHER EACH RECORD MAY SET A CAP ON EXTRA USAGE: Billing's answer, asked only of the owner's ledger on the Cloud. A
     host that does not answer it offers no cap, and the month above is drawn whatever it says. */
  const billed = read(
    () => (view && view.from === 'ledger' && view.owner && hosted && view.current ? `${apiBase(page.url)} billing` : null),
    async (): Promise<Result<BillingAnswer | null>> => {
      const out = await readBilling();
      return { ok: true, value: out.ok ? out.value : null };
    },
  );
  const capOffered = (record: string): boolean => {
    const answer = billed.value ?? null;
    return extraOffered(answer?.records.find((b) => b.record === record) ?? null, answer);
  };

  /* A ROW AN ACTION, BUSIEST FIRST, each with the project it runs in, so the month's heaviest work reads from the top. */
  const actionRows = $derived(
    groups
      .flatMap((g) => g.actions.map((a) => ({ ...a, project: placeOf(g) })))
      .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name)),
  );
  /* A BAR A ROW, AND THE TOP FIVE (G26): nineteen rows of "36 runs" were a table to read; the bars read at a glance, and
     the rest wait behind "14 more". The bar is the share of the busiest action, one ink. */
  const TOP = 5;
  let allActions = $state(false);
  const mostRuns = $derived(Math.max(1, ...actionRows.map((a) => a.runs)));
  const actionsShown = $derived(allActions ? actionRows : actionRows.slice(0, TOP));
  /* WHETHER A ROW A PROJECT SAYS ANYTHING: not when every run was in none. */
  const split = $derived(byProject(groups));
  /* A ROW A PROJECT, BUSIEST FIRST, linking to its slice. Everywhere has no slice and no link. */
  const projectRows = $derived([...groups].sort((a, b) => b.totals.runs - a.totals.runs || groupName(a).localeCompare(groupName(b))));
  const parts = $derived(view ? projectParts(view.groups) : null);
  /* WHETHER THE WEEKS TILE IS DRAWN: only where a day of a run is known (see the tile). */
  const weekly = $derived(view !== null && view.totals.runs > 0 && view.days.length > 0 && !(view.records.length > 0 && view.records.every((r) => r.meters.length === 0)));
  /* AND WHETHER ANY TILE IS: an empty row of tiles still took its gaps, a band of nothing between the months and the list
     (audit 6f AF22), on a month whose runs were all rules', which no day is kept for. */
  const tiled = $derived(view !== null && (view.records.length > 0 || weekly || parts !== null || heat !== null));
  /** Whether the allowance tile says the empty month itself: drawn, with limits, and nothing used against any of them. */
  const idleTile = $derived(
    tiled && view !== null && view.current && view.records.some((r) => r.meters.length > 0) && view.records.every((r) => ringsOf(r).every((m) => m.share === 0)),
  );

  /**
   * THIS PAGE'S OWN WORDS. The rest are `actions.ts`'s
   * and `reading.ts`'s.
   */
  /* The empty month's words. */
  const usageWords = {
    seeAutomations: 'Automations',
    /* WHAT FILLS AN EMPTY MONTH, AND THE WAY TO START IT (empty states, 2 Nov). Agents, `/p/agents`, is a page a new
       record does not have yet, so the way in is connecting one. */
    idle: 'Each run of an automation or an agent counts here.',
    idleRules: 'Automations count here each time they run.',
    connect: 'Connect an agent',
    moreActions: (n: number) => `${n} more`,
    fewer: 'Show the top five',
  } as const;

  const said = {
    counted: 'Deliveries and arrivals',
    countedWhy: 'Not held by the monthly limit.',
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
    const range = monthRange(recordNow(), month);
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
    <Segmented tag="nav" class="months" aria-label={words.months} full>
      {#if earlier}
        <a class="segment month" href={at(`/usage?month=${earlier}`)} aria-label={words.monthIn(monthWords(earlier))}>{monthWords(earlier)}</a>
      {/if}
      <span class="segment month" data-on aria-current="page">{monthWords(view.month)}</span>
      {#if beside.later}
        <a class="segment month" href={at(`/usage?month=${beside.later}`)} aria-label={words.monthIn(monthWords(beside.later))}>{monthWords(beside.later)}</a>
      {/if}
    </Segmented>
  {/if}
{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's,
     not as a page of its own. -->
<!-- THE MONTHS UNDER THE SENTENCE, the page's own switch, full width on a phone: on the name's row they pushed it. -->
<!-- THE MONTH SWITCH IS THE SENTENCE ROW'S ACTION ON A DESK (plan F10), not a second row under it; a phone keeps it under
     the sentence, where the bar has no room for three months. -->
<PageHead icon="chart-bar" title={words.usage} sentence={sentence?.text} needs={sentence?.needs} actions={wide.current ? months : undefined} below={wide.current ? undefined : months} />
<div class="page">
  {#if usage.state === 'waiting' || usage.state === 'refused' || usage.state === 'offline'}
    <ReadState state={usage.state} refusal={usage.refusal} onretry={usage.reread} />
  {:else if fault !== null}
    <ReadState state="fault" screen={words.usage} refusal={fault} onretry={usage.reread} />
  {:else if !view}
    <Empty kind="no-data-yet" glyph="chart-bar" title={words.noLedger} />
  {:else}
    <!-- A THROW WHILE DRAWING THE BOARD IS THIS SCREEN'S FAULT, said as one with the reason under Details, and never the
         offline sentence: by this point the record has answered. -->
    <svelte:boundary onerror={(e) => console.error(e)}>
      {#if tiled}<div class="tiles">
        <!-- THE ALLOWANCE LEADS, one tile a record the person owns: the four meters as rings, each with its own line under
             it, and the binding meter's sentence as the line that reads them. A plan with no limit has no rings; its tile
             holds the month's runs by week instead, so the week bars are not drawn twice. The plan is named beside the
             record's name when there are several, or the tile drew no plan at all for an owner of more than one. -->
        {#each view.records as r (r.name)}
          {@const rings = ringsOf(r)}
          {@const bound = rings.find((m) => m.binding)}
          {@const used = rings.some((m) => m.share > 0)}
          <Tile
            data-wide=""
            lead
            icon="observe"
            title={!hosted ? reading.monthTitle(view.current, view.month) : view.current ? reading.allowance : reading.allowanceIn(monthWords(view.month))}
            meta={view.records.length > 1 ? [r.name, r.plan].filter(Boolean).join(' · ') : (r.plan ?? undefined)}
          >
            {#if rings.length > 0 && !used}
              <!-- NOTHING USED IS NO RINGS (empty states, 2 Nov): four rings of 0% said one thing four times on a new record,
                   under a sentence that already says it. The plan's limits are the line below; what fills the month and
                   the way to start it are said here, in the tile, rather than in a card stranded under it. -->
              <p class="reading">{view.current && (view.fired ?? 0) === 0 ? usageWords.idle : usageWords.idleRules}</p>
            {:else if rings.length > 0}
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
            <!-- THE SLASH LINE HERE when there is no allowance of asks to draw a ring against, which is every host today. -->
            {#if r.slash && !asksOf(r) && !(rings.length > 0 && !used)}<p class="slash-line">{r.slash}</p>{/if}
            <!-- THE PLAN'S LIMITS IN ONE SENTENCE, then extra usage: its running amount, and the cap where one may be set. -->
            {#if r.planLine}<p class="aside-line">{r.planLine}</p>{/if}
            <!-- THE WAY TO START AN EMPTY MONTH, last in the tile, under what the month's limits are. -->
            {#if rings.length > 0 && !used && view.current}
              <div class="idle-act">
                {#if (view.fired ?? 0) > 0}<Button weight="quiet" href="/automations">{usageWords.seeAutomations}</Button>
                {:else}<Button weight="quiet" href="/settings/agents">{usageWords.connect}</Button>{/if}
              </div>
            {/if}
            <!-- NEITHER IN THE IPHONE APP (App Store 3.1.1): what extra usage costs and the cap on it are bought at brain.dog. -->
            {#if r.extra && !inIosApp}<p class="aside-line">{r.extra}</p>{/if}
            {#if r.extraUse && capOffered(r.record) && !inIosApp}
              <ExtraCap record={r.record} on={r.extraUse.on} cap={r.extraUse.cap} onset={usage.reread} />
            {/if}
          </Tile>
        {/each}

        <!-- ONLY WHERE A DAY OF A RUN IS KNOWN: an automation's runs are counted for the month and not by day, and a figure
             over bars of nothing read as runs that happened on no day. -->
        {#if weekly}
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
          {@const c = asksOf(r)}
          {#if c && r.slash}
            <Tile icon="slash" title={reading.asks} meta={view.records.length > 1 ? r.name : undefined}>
              <div class="ring-solo"><Ring value={c.used} max={c.max} tone={c.tone} size={112} label={reading.asksOf(c.max)} summary={r.slash} /></div>
              <p class="reading">{r.slash}</p>
            </Tile>
          {/if}
        {/each}
      </div>{/if}

      <!-- A MONTH WITH NO RUNS SAYS SO ONCE, in place of the lists it would have. -->
      {#if view.totals.runs === 0 && idleTile}
        <!-- SAID IN THE ALLOWANCE TILE, above. -->
      {:else if view.totals.runs === 0}
        <!-- WHAT WOULD BE COUNTED, AND WHERE IT RUNS FROM (money F14): the tile said a month was empty and stopped. -->
        <Empty
          kind="no-data-yet"
          glyph="chart-bar"
          title={view.current ? ((view.fired ?? 0) > 0 ? reading.noActionRun : words.noUsage) : words.noUsageIn(monthWords(view.month))}
        >
          {#snippet actions()}
            {#if (view.fired ?? 0) > 0}<Button weight="quiet" href="/automations">{usageWords.seeAutomations}</Button>
            {:else}<Button weight="quiet" href="/settings/agents">{usageWords.connect}</Button>{/if}
          {/snippet}
        </Empty>
      {:else if sliced.length === 0}
        <!-- A ROW A PROJECT, then A ROW AN ACTION, each with its counts beside it; a project's row opens its slice. -->
        {#if split}<Tile class="section" data-surface="tile" icon="board" title={words.byProject} count={projectRows.length || undefined}>
          <div class="section-body">
            <ul class="ledger use-list">
              {#each projectRows as g (g.key)}
                <li>
                  <div class="line use-row" data-faint={g.faint ? '' : undefined}>
                    {#if g.scope !== ''}
                      <a class="line-title tap" href={at(`/usage?month=${view.month}&project=${encodeURIComponent(g.scope)}`)}>{groupName(g)}</a>
                    {:else}
                      <span class="line-title">{groupName(g)}</span>
                    {/if}
                    <span class="line-when use-counts">{countsOf(g.totals)}</span>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </Tile>{/if}
        <Tile class="section" data-surface="tile" icon="play" title={words.byAction} count={actionRows.length || undefined}>
          <div class="section-body">
            <ul class="ledger use-list use-bars">
              {#each actionsShown as a, i (`${a.project} ${a.name} ${i}`)}
                <li in:lineIn>
                  <div class="line use-row use-bar-row" data-faint={a.faint ? '' : undefined}>
                    <span class="line-title">{a.name}{#if a.project}<span class="use-in">{` · ${a.project}`}</span>{/if}</span>
                    <span class="use-bar" aria-hidden="true"><span class="use-bar-fill" style:inline-size={`${Math.max(2, (a.runs / mostRuns) * 100)}%`}></span></span>
                    <span class="line-when use-counts">{countsOf(a)}</span>
                  </div>
                </li>
              {/each}
            </ul>
            {#if actionRows.length > TOP}
              <button type="button" class="use-more tap" aria-expanded={allActions} onclick={() => (allActions = !allActions)}
                >{allActions ? usageWords.fewer : usageWords.moreActions(actionRows.length - TOP)}</button
              >
            {/if}
          </div>
        </Tile>
      {:else}
        <!-- ONE PROJECT'S SLICE, ITS ACTIONS UNDER IT; the link beside the heading shows every project again. -->
        <Tile class="section" data-surface="tile" icon="projects" title={sliced.length > 0 ? words.only(sliced[0]?.name ?? '') : reading.projects} count={(sliced.length > 0 ? 0 : groups.length) || undefined}>
          {#snippet actions()}
            {#if sliced.length > 0}<a class="use-all tap" href={at(`/usage?month=${view.month}`)}>{words.allProjects}</a>{/if}
          {/snippet}
          <div class="section-body">
            <div class="use-groups">
              {#each groups as g (g.key)}
                <div class="use-group" data-faint={g.faint ? '' : undefined}>
                  <h3 class="use-group-h">
                    <IconWell name={g.faint ? 'globe' : 'board'} size="l" />
                    <span class="use-group-name">{groupName(g)}</span>
                    <span class="use-counts num">{countsOf(g.totals)}</span>
                  </h3>
                  {@render list(g.actions)}
                </div>
              {/each}
            </div>
          </div>
        </Tile>
      {/if}

      <!-- DELIVERIES AND ARRIVALS, EACH KIND ONE ROW: the name and its count beside it, wrapping under it on a phone. A
           month with neither draws nothing, since there is nothing the owner can do about a zero here. -->
      {#if countedRows.sent.length > 0 || countedRows.arrived.length > 0}
        <Tile class="section" data-surface="tile" icon="mail" title={said.counted}>
          <div class="section-body">
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
          </div>
        </Tile>
      {/if}

      <!-- SLASH'S SECTION, THIS MONTH AND THE OWNER'S ONLY: the ledger's door answers the owner alone, and the status door
           says this month's count and nothing of a month gone. It draws nothing on a host without a model. -->
      {#if view.current && view.owner}
        <SlashUsage month={view.month} />
      {/if}
      {#snippet failed(_error, reset)}
        <!-- A SENTENCE UNDER DETAILS, NEVER THE EXCEPTION: the thrown message reaches the console through `onerror`. -->
        <ReadState state="fault" screen={words.usage} refusal={words.usageThrew} onretry={reset} />
      {/snippet}
    </svelte:boundary>
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
  /* AS WIDE AS ITS MONTHS AT A DESK: stretched under the sentence its track ran on past the last month as an empty bar.
     A phone's is the page's width (`full`), its months sharing it. */
  @media (width >= 640px) {
    :global(.segmented.months) {
      align-self: flex-start;
      justify-self: start;
      inline-size: max-content;
    }
  }

  :global(.months) .month {
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
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: 34px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    letter-spacing: 0;
  }

  /* THE ONE LINE THAT READS THE CHART, at the foot of its tile. Waiting actions are said here in ink: the
     ring that ran out is red, and so is the phrase in the sentence, which is enough red for one fact. */
  .reading {
    margin: auto 0 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  /* THE WAY TO START AN EMPTY MONTH, under its line in the allowance tile. */
  .idle-act {
    display: flex;
    margin-block-start: var(--sp-3);
  }

  .slash-line {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .aside-line {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .ring-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    font-size: var(--fs-body);
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
    color: var(--ink-2);
  }

  .use-counts {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* AN ACTION'S ROW STARTS WHERE THE TILE'S NAME DOES, past its heading well, so the list reads as that heading's own.
     It was the 32 of a row's well under a 28 heading well (8 off the name), and on a tile with no well a 44 indent
     under nothing. */
  .use-list {
    margin-inline-start: var(--well);
  }

  .use-row {
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: var(--row-h);
  }

  .use-row .line-title {
    font-size: var(--fs-body);
    text-wrap: pretty;
  }

  .use-row[data-faint] .line-title {
    color: var(--ink-2);
  }

  /* A BAR A ROW (G26): the name, its bar, its figure at the end. The bar is one ink on the well's fill, at a third of
     the row from 900 up, and under the name on a phone. */
  .use-bar-row {
    grid-template-columns: minmax(0, 1fr) minmax(6rem, 0.6fr) 4.5rem;
    column-gap: var(--sp-4);
  }

  /* THE FIGURE'S COLUMN IS AS WIDE AS ITS LONGEST FIGURE, the same on every row: at 4.5rem "101 runs · under a minute"
     ran back under the bar's end (live verify, 2 Nov). The rows share one grid, so the bars still start and end level. */
  @media (width >= 640px) {
    .use-bars {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(6rem, 0.6fr) max-content;
      column-gap: var(--sp-4);
    }

    .use-bars > li,
    .use-bars .use-bar-row {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
    }

    .use-bar-row .use-counts {
      white-space: nowrap;
    }
  }

  .use-bar-row .use-counts {
    justify-content: flex-end;
    text-align: end;
  }

  .use-bar {
    display: block;
    block-size: 8px;
    background: var(--tile-2);
    border-radius: var(--r-xs);
    overflow: hidden;
  }

  .use-bar-fill {
    display: block;
    block-size: 100%;
    background: var(--ink-2);
    border-radius: var(--r-xs);
  }

  .use-bar-row[data-faint] .use-bar-fill {
    background: var(--ink-3);
  }

  .use-more {
    margin-block-start: var(--sp-2);
    margin-inline-start: calc(var(--well) + var(--sp-3));
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .use-more:hover {
      color: var(--ink);
    }
  }

  @media (width < 640px) {
    .use-row.use-bar-row {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--sp-3);
      row-gap: var(--sp-1);
    }

    .use-row.use-bar-row .line-title {
      grid-column: 1 / -1;
    }

    .use-row.use-bar-row .use-bar {
      grid-column: 1;
      grid-row: 2;
      align-self: center;
    }

    .use-row.use-bar-row .use-counts {
      grid-column: 2;
      grid-row: 2;
      white-space: nowrap;
    }

    .use-more {
      margin-inline-start: 0;
    }
  }

  /* THE PROJECT AN ACTION RUNS IN, quieter than its name. */
  .use-in {
    color: var(--ink-3);
  }

  .use-why {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .use-all {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink-2);
    font-size: var(--fs-meta);
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

    /* ONLY A PROJECT'S HEADING SETS ITS COUNTS PAST A WELL: an action's row has none, and its "36 runs" sat indented under
       its name as if under a missing icon (audit 6f AF22). */
    .use-group-h .use-counts {
      flex-basis: 100%;
      padding-inline-start: calc(var(--well-l) + var(--sp-3));
    }
  }
</style>
