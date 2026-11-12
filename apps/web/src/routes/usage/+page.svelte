<!--
  The account's usage: `/usage`.

  A MONTH AT A TIME, this one first, with a switcher for the year before it in the toolbar. `?project=` is one
  project's slice, which is where its "Runs on" links.

  THE FIRST SCREEN SAYS WHETHER A LIMIT IS NEAR AND WHAT IS USING IT, AND THE REST IS UNDER IT, three rows of tiles that
  wrap to one column on a phone. A chart with nothing behind it is no tile at all, and a row with no tile takes no room.

  THE LIMITS: the month's allowance, its four meters as rings, amber once one is near its limit and red once actions
  wait on it, with the plan's limits and extra usage under them (`ExtraCap`), and beside it Slash and the room for files.
  WHAT USED THEM: the projects, and the one list of what ran. A project's row is a filter on that list, `?project=`, and
  no project's actions are listed anywhere else. THE REST OF THE MONTH: the weeks, the days, the deliveries and arrivals.

  LONG LISTS STOP AT EIGHT, busiest first, with "Show all" opening them where they stand. A list never scrolls inside itself.

  THE LEDGER FIRST. `GET /account/usage` is the Directory's count, and there is ONE allowance, the Directory's, read
  from its answer. A host without the route (404), or no host, falls back to the record's own run events, which say
  nothing about limits because the record cannot see them. No record at all is the record's refusal.

  ONE READ, THROUGH `read()`. The page draws the month and hands waiting, refused and offline to `ReadState`,
  so this screen fails the way every screen that reads fails, with Retry. A month that could not be drawn from an
  answer that came is a draw fault, said as one ("This screen could not be drawn", and Usage named), never as a record
  out of reach: the reader's own build of the month returns it, and a boundary round the board catches the rest. Its two empty answers keep their own
  sentences: a host with nothing to count, and a month with no runs, which says so once rather than over zeroes.

  DELIVERIES AND ARRIVALS, from a second read of the same ledger (`countedOf` below): what the outbox sent and what
  reached a door, counted and never limited, so they sit under everything the allowance is about rather than inside it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import { apiBase, at } from '$lib/at.ts';
  import { bytes } from 'braindog-render';
  import { humanize } from '$lib/record/names.ts';
  import { titleOf } from '$lib/title.ts';
  import { countsOf, monthRange, monthsBeside, monthWords, readUsage, words, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import SlashUsage from '$lib/ui/SlashUsage.svelte';
  import FilesRoom from '$lib/attach/FilesRoom.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import { lineIn } from '$lib/motion';
  import HeatGrid from '$lib/viz/HeatGrid.svelte';
  import Ring from '$lib/viz/Ring.svelte';
  import { homeCurrency } from '$lib/record/api.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { asksOf, byProject, daysSaid, earlierOf, groupName, heatOf, offCloud, projectsSaid, placeOf, ringsOf, said as reading, sentenceOf, weekBars, weeksSaid } from './reading.ts';
  import { extraOffered, hostedHere, readBilling, type BillingAnswer } from '../settings/billing.ts';
  import ExtraCap from './ExtraCap.svelte';
  import { askUsageEarly } from '$lib/data/usage-early.ts';
  import { askEarly, takeEarly } from '$lib/data/early-asks.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import { saidRowPages } from '$lib/record/row-href.ts';
  import { put } from '$lib/clipboard.ts';
  import { inStoreApp } from '$lib/shell.ts';
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
    /* THE CLOUD'S LIVE SHELL IS SOMEBODY SIGNED IN, so the ledger and the names are asked together (`readUsage`). */
    const shell = page.data as unknown as Shell;
    const out = await readUsage((url, init) => fetch(url, init), recordNow(), '', apiBase(page.url), month, homeCurrency(), hostedHere(shell) ? (shell.me?.owner === true ? 'owner' : 'member') : false);
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

  /** What Billing's answer asked ahead is held under: this record's, since the answer is the person's on this host. */
  const billingKey = (): string => `usage billing ${apiBase(page.url)}`;

  /* WHAT THE TILES UNDER THE MONTH READ IS ASKED NOW, beside the month (`usage-early.ts`): each waited for the month to draw
     and then read alone. Only this month draws them, Slash's and the cap only for the owner on the Cloud. */
  untrack(() => {
    const shell = page.data as unknown as Shell;
    const now = recordNow();
    const current = monthRange(now, page.url.searchParams.get('month') ?? undefined).to === new Date(now).toISOString().slice(0, 10);
    if (!current || !shell.live || shell.refused) return;
    const owner = shell.me?.owner === true && hostedHere(shell);
    askUsageEarly(apiBase(page.url), { slash: owner && page.data.slash === true, room: true });
    if (owner) askEarly(billingKey(), () => readBilling());
  });

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
      /* The answer asked as the page opened, where it is still fresh, else asked now. */
      const out = (await (takeEarly<Awaited<ReturnType<typeof readBilling>>>(billingKey()) ?? null)) ?? (await readBilling());
      return { ok: true, value: out.ok ? out.value : null };
    },
  );
  const capOffered = (record: string): boolean => {
    const answer = billed.value ?? null;
    return extraOffered(answer?.records.find((b) => b.record === record) ?? null, answer);
  };

  /* WITH SEVERAL RECORDS BOTH NAMES START WITH THE RECORD'S, and a row said it twice: "studio · Pull servers · studio · Marsh". */
  const placeBeside = (place: string, name: string): string => {
    const cut = place.indexOf(' · ');
    return cut > 0 && name.startsWith(place.slice(0, cut + 3)) ? place.slice(cut + 3) : place;
  };

  /* THE ONE LIST OF WHAT RAN, BUSIEST FIRST: the month's, or the project's when the page is its slice, each row naming the
     project it ran in only where the list holds more than one. The bar is the share of the busiest row, one ink. */
  const actionRows = $derived(
    groups
      .flatMap((g) => g.actions.map((a) => ({ ...a, scope: g.scope, project: sliced.length > 0 ? '' : placeBeside(placeOf(g), a.name) })))
      .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name)),
  );
  /* EIGHT ROWS TO A LIST (the owner's 34 scripts were a page of their own); the rest open where they stand. */
  const TOP = 8;
  const usageMenu = { project: 'Open the project', only: 'Show only its project', copy: 'Copy the name' };
  /* A ROW'S VERBS AT THE POINTER. A project's row is a link, so its menu leads with that link's three (`context-menu.ts`). */
  type Pointed = { name: string; page: string | null; slice: string | null };
  let pointed = $state.raw<Pointed | null>(null);
  let pointedAt = $state.raw<MenuAt | null>(null);
  const pointAt = (what: Pointed, p: MenuAt): void => {
    pointed = what;
    pointedAt = p;
  };
  const pageOfGroup = (g: { name: string }): string | null => {
    const found = (saidRowPages().pages as readonly { slug: string; title?: string }[]).find((x) => x.title === g.name);
    return found ? `/p/${found.slug}` : null;
  };

  let allActions = $state(false);
  let allProjects = $state(false);
  let allCounted = $state(false);
  /* ANOTHER PROJECT OR MONTH IS ANOTHER LIST, and starts short. */
  $effect(() => {
    void project;
    void month;
    allActions = false;
  });
  const mostRuns = $derived(Math.max(1, ...actionRows.map((a) => a.runs)));
  const actionsShown = $derived(allActions ? actionRows : actionRows.slice(0, TOP));
  /* WHAT THE SLICE CAME TO, which is where a project's requests, data and run time are said. */
  const sliceTotals = $derived(
    sliced.reduce(
      (sum, g) => ({
        runs: sum.runs + g.totals.runs,
        requests: sum.requests + g.totals.requests,
        bytes: sum.bytes + g.totals.bytes,
        ms: sum.ms + (g.totals.ms ?? 0),
        failures: sum.failures + g.totals.failures,
      }),
      { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0 },
    ),
  );
  /* A ROW A PROJECT, BUSIEST FIRST, the month's whichever slice is open. Not for a month that ran in none, or in one alone,
     where the list of what ran already says it. */
  const projectRows = $derived(view ? [...view.groups].sort((a, b) => b.totals.runs - a.totals.runs || groupName(a).localeCompare(groupName(b))) : []);
  const split = $derived(view !== null && byProject(view.groups) && view.groups.length > 1);
  const mostProject = $derived(Math.max(1, ...projectRows.map((g) => g.totals.runs)));
  /* THE OPEN SLICE STAYS IN THE LIST, whatever its place in it. */
  const isOpen = (scope: string): boolean => sliced.length > 0 && scope === project;
  const projectsShown = $derived(allProjects ? projectRows : projectRows.filter((g, i) => i < TOP || isOpen(g.scope)));
  /* ON A PHONE THE LIST A PROJECT'S ROW FILTERS IS A SCREEN BELOW IT, so a press would seem to do nothing: the page goes to
     the list. Beside it, at a desk, it stays where it is. */
  let pressedProject = false;
  afterNavigate(() => {
    if (!pressedProject) return;
    pressedProject = false;
    const list = document.getElementById('use-what');
    if (list && list.getBoundingClientRect().top > window.innerHeight * 0.6) list.scrollIntoView({ block: 'start' });
  });
  /* WHETHER THE WEEKS TILE IS DRAWN: only where a day of a run is known (see the tile). */
  const weekly = $derived(view !== null && view.totals.runs > 0 && view.days.length > 0 && !(view.records.length > 0 && view.records.every((r) => r.meters.length === 0)));
  /* AND WHERE: beside the limits where nothing else would stand there at full width, a month gone or a month with no allowance
     tile, and with the days otherwise. */
  const weeksFirst = $derived(view !== null && (!view.current || view.records.length === 0));
  /** Whether the allowance tile says the empty month itself: drawn, with limits, and nothing used against any of them. */
  const idleTile = $derived(view !== null && view.current && view.records.some((r) => r.meters.length > 0) && view.records.every((r) => ringsOf(r).every((m) => m.share === 0)));

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
    all: (n: number) => `Show all ${n.toLocaleString('en-GB')}`,
    fewer: 'Show fewer',
  } as const;

  const said = {
    counted: 'Deliveries and arrivals',
    countedWhy: 'Not held by the monthly limit.',
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

  /** The rows as one list, the busiest first, each kind named in words and led by the way it went: out of the record, or into it. */
  const countedRows = $derived(
    (counted.value ?? [])
      .flatMap((c): { key: string; name: string; counts: string; icon: IconName; runs: number }[] =>
        c.action.startsWith('deliver:')
          ? [{ key: c.action, name: humanize(c.action.slice('deliver:'.length)), counts: said.sentCount(n(c.runs)), icon: 'arrowUp', runs: c.runs }]
          : c.action.startsWith('in:')
            ? [{ key: c.action, name: humanize(c.action.slice('in:'.length)), counts: said.arrivedCount(n(c.runs), bytes(c.bytes)), icon: 'arrowDown', runs: c.runs }]
            : [],
      )
      .sort((a, b) => b.runs - a.runs),
  );
  const countedShown = $derived(allCounted ? countedRows : countedRows.slice(0, TOP));
</script>

<svelte:head><title>{titleOf(words.usage)}</title></svelte:head>

{#snippet more(open: boolean, total: number, toggle: () => void)}
  <button type="button" class="use-more tap" aria-expanded={open} onclick={toggle}><Icon name="chevronDown" size="s" />{open ? usageWords.fewer : usageWords.all(total)}</button>
{/snippet}

{#snippet weeks(v: UsageView)}
  <Tile icon="history" title={reading.weeks}>
    <p class="figure num">{n(v.totals.runs)}<span class="figure-unit">{reading.runs(v.totals.runs)}</span></p>
    <Bars items={weekBars(v)} subject={words.overTime} />
    <p class="reading">{weeksSaid(v)}</p>
  </Tile>
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
  {:else if usage.state === 'waiting' && !wide.current}
    <!-- ITS ROOM HELD ON A PHONE WHILE THE MONTH IS READ: the switch landed under the sentence and pushed the page down. -->
    <div class="months-held" aria-hidden="true"></div>
  {/if}
{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's,
     not as a page of its own. -->
<!-- THE MONTHS UNDER THE SENTENCE, the page's own switch, full width on a phone: on the name's row they pushed it. -->
<!-- THE MONTH SWITCH IS THE SENTENCE ROW'S ACTION ON A DESK (plan F10), not a second row under it; a phone keeps it under
     the sentence, where the bar has no room for three months. -->
<PageHead icon="chart-bar" title={words.usage} sentence={sentence?.text} needs={sentence?.needs} heldLines={1} actions={wide.current ? months : undefined} below={wide.current ? undefined : months} />
<Menu label={pointed?.name ?? words.usage} open={pointed !== null} at={pointedAt} onclose={() => (pointed = null)}>
  {#if pointed?.page}<a role="menuitem" href={at(pointed.page)}><Icon name="arrow" size="s" />{usageMenu.project}</a>{/if}
  {#if pointed?.slice}<a role="menuitem" href={at(pointed.slice)} data-sveltekit-noscroll><Icon name="filter" size="s" />{usageMenu.only}</a>{/if}
  <button type="button" role="menuitem" onclick={() => pointed && void put(pointed.name)}><Icon name="copy" size="s" />{usageMenu.copy}</button>
</Menu>

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
      <!-- THE LIMITS. -->
      <div class="band limits">
        <!-- ONE TILE A RECORD THE PERSON OWNS: the four meters as rings, each with its own line under it. A plan with no limit
             has no rings; its tile holds the month's runs by week instead, so the week bars are not drawn twice. The plan is
             named beside the record's name when there are several. -->
        {#each view.records as r (r.name)}
          {@const rings = ringsOf(r)}
          {@const bound = rings.find((m) => m.binding)}
          {@const used = rings.some((m) => m.share > 0)}
          <Tile
            data-wide=""
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
                    <span class="ring-said">
                      <span class="ring-name">{m.name}</span>
                      <span class="ring-line num">{m.amount}</span>
                    </span>
                  </li>
                {/each}
              </ul>
              <!-- THE HEAD'S SENTENCE READS THE FIRST RECORD'S BINDING METER, so its tile does not say it again; a second
                   record's tile keeps its own line, which no sentence above says. -->
              {#if view.records.length > 1 && r.waiting && r.binding}
                <p class="reading">{words.waitingUntil(r.resets, r.binding)}</p>
              {:else if view.records.length > 1 && bound}
                <p class="reading">{bound.name}: {bound.said}</p>
              {/if}
            {:else}
              <p class="figure num">{n(view.totals.runs)}<span class="figure-unit">{reading.runs(view.totals.runs)}</span></p>
              {#if view.totals.runs > 0}<Bars items={weekBars(view)} subject={words.overTime} />{/if}
              <p class="reading">{words.noLimit}</p>
            {/if}
            <div class="allow-foot">
              <!-- THE SLASH LINE when there is no allowance of asks to draw a ring against, which is every host today. -->
              {#if r.slash && !asksOf(r) && !(rings.length > 0 && !used)}<p class="aside-line">{r.slash}</p>{/if}
              <!-- THE PLAN'S LIMITS IN ONE SENTENCE, then extra usage: its running amount, and the cap where one may be set. -->
              {#if r.planLine}<p class="aside-line">{r.planLine}</p>{/if}
              <!-- NEITHER IN THE IPHONE APP (App Store 3.1.1): what extra usage costs and the cap on it are bought at brain.dog. -->
              {#if r.extraUse && capOffered(r.record) && !inStoreApp}
                <ExtraCap record={r.record} on={r.extraUse.on} cap={r.extraUse.cap} said={r.extra} onset={usage.reread} />
              {:else if r.extra && !inStoreApp}
                <p class="aside-line">{r.extra}</p>
              {/if}
            </div>
            <!-- THE WAY TO START AN EMPTY MONTH, last in the tile, under what the month's limits are. -->
            {#if rings.length > 0 && !used && view.current}
              <div class="idle-act">
                {#if (view.fired ?? 0) > 0}<Button weight="quiet" href="/automations">{usageWords.seeAutomations}</Button>
                {:else}<Button weight="quiet" href="/settings/agents">{usageWords.connect}</Button>{/if}
              </div>
            {/if}
          </Tile>
        {/each}

        {#if weekly && weeksFirst}{@render weeks(view)}{/if}

        {#each view.records as r (r.name)}
          {@const c = asksOf(r)}
          {#if c && r.slash}
            <Tile icon="slash" title={reading.asks} meta={view.records.length > 1 ? r.name : undefined}>
              <div class="meter">
                <Ring value={c.used} max={c.max} tone={c.tone} size={72} summary={r.slash} />
                <p class="meter-line">{r.slash}</p>
              </div>
            </Tile>
          {/if}
        {/each}

        <!-- SLASH, THIS MONTH AND THE OWNER'S ONLY: the ledger's door answers the owner alone, and the status door says this
             month's count and nothing of a month gone. It draws nothing on a host without a model. -->
        {#if view.current && view.owner}
          <SlashUsage month={view.month} />
        {/if}
        <!-- THE ROOM FOR ATTACHED FILES, THIS RECORD'S: how much its files take of what its plan keeps for them. -->
        {#if view.current}<FilesRoom />{/if}
      </div>

      <!-- WHAT USED THEM. A MONTH WITH NO RUNS SAYS SO ONCE, in place of the lists it would have. -->
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
      {:else}
        <div class="band uses">
          <!-- A ROW A PROJECT IS A FILTER ON THE LIST BESIDE IT: pressing one opens its slice, pressing it again shuts it. -->
          {#if split}
            <Tile class="section" data-surface="tile" icon="board" title={words.byProject} count={projectRows.length} meta={projectsSaid(view.groups) ?? undefined}>
              <div class="section-body use-body">
                <ul class="ledger use-list use-bars use-projects">
                  {#each projectsShown as g (g.key)}
                    <li {@attach ownMenu((p) => pointAt({ name: groupName(g), page: pageOfGroup(g), slice: null }, p))}>
                      <a
                        class="line use-row use-bar-row use-project"
                        data-faint={g.faint ? '' : undefined}
                        data-selected={isOpen(g.scope) ? '' : undefined}
                        aria-current={isOpen(g.scope) ? 'true' : undefined}
                        data-sveltekit-noscroll
                        onclick={() => (pressedProject = true)}
                        href={at(isOpen(g.scope) ? `/usage?month=${view.month}` : `/usage?month=${view.month}&project=${encodeURIComponent(g.scope)}`)}
                      >
                        <span class="line-title">{groupName(g)}</span>
                        <span class="use-bar" aria-hidden="true"><span class="use-bar-fill" style:inline-size={`${Math.max(2, (g.totals.runs / mostProject) * 100)}%`}></span></span>
                        <span class="line-when use-counts">{reading.runsSaid(g.totals.runs)}</span>
                      </a>
                    </li>
                  {/each}
                </ul>
                {#if projectRows.length > TOP}{@render more(allProjects, projectRows.length, () => (allProjects = !allProjects))}{/if}
              </div>
            </Tile>
          {/if}
          <Tile id="use-what" class="section use-what" data-surface="tile" icon="rows" title={sliced.length > 0 ? reading.ranIn(sliced[0] ?? { key: '', name: '' }) : reading.ran} count={actionRows.length || undefined}>
            {#snippet actions()}
              {#if sliced.length > 0}<a class="use-all tap" data-sveltekit-noscroll href={at(`/usage?month=${view.month}`)}>{words.allProjects}</a>{/if}
            {/snippet}
            <div class="section-body use-body">
              {#if sliced.length > 0}<p class="use-why">{countsOf(sliceTotals)}</p>{/if}
              <ul class="ledger use-list use-bars">
                {#each actionsShown as a, i (`${a.project} ${a.name} ${i}`)}
                  <li in:lineIn {@attach ownMenu((p) => pointAt({ name: a.name, page: null, slice: a.project && view ? `/usage?month=${view.month}&project=${encodeURIComponent(a.scope)}` : null }, p))}>
                    <div class="line use-row use-bar-row" data-faint={a.faint ? '' : undefined}>
                      <span class="line-title">{a.name}{#if a.project}<span class="use-in">{` · ${a.project}`}</span>{/if}</span>
                      <span class="use-bar" aria-hidden="true"><span class="use-bar-fill" style:inline-size={`${Math.max(2, (a.runs / mostRuns) * 100)}%`}></span></span>
                      <span class="line-when use-counts">{countsOf(a)}</span>
                    </div>
                  </li>
                {/each}
              </ul>
              {#if actionRows.length > TOP}{@render more(allActions, actionRows.length, () => (allActions = !allActions))}{/if}
            </div>
          </Tile>
        </div>
      {/if}

      <!-- THE REST OF THE MONTH. -->
      <div class="band rest">
        <!-- ONLY WHERE A DAY OF A RUN IS KNOWN: an automation's runs are counted for the month and not by day, and a figure
             over bars of nothing read as runs that happened on no day. -->
        {#if weekly && !weeksFirst}{@render weeks(view)}{/if}

        {#if heat}
          <Tile icon="calendar" title={reading.days}>
            <HeatGrid rows={heat.rows} cols={heat.cols} values={heat.values} subject={reading.days} />
            <p class="reading">{daysSaid(view)}</p>
          </Tile>
        {/if}

        <!-- DELIVERIES AND ARRIVALS, EACH KIND ONE ROW, the busiest first. A month with neither draws nothing, since there is
             nothing the owner can do about a zero here. -->
        {#if countedRows.length > 0}
          <Tile class="section" data-surface="tile" icon="mail" title={said.counted}>
            <div class="section-body use-body">
              <ul class="ledger use-list use-counted">
                {#each countedShown as r (r.key)}
                  <li {@attach ownMenu((p) => pointAt({ name: r.name, page: null, slice: null }, p))}>
                    <div class="line use-row use-kind">
                      <Icon name={r.icon} size="s" />
                      <span class="line-title">{r.name}</span>
                      <span class="line-when use-counts">{r.counts}</span>
                    </div>
                  </li>
                {/each}
              </ul>
              {#if countedRows.length > TOP}{@render more(allCounted, countedRows.length, () => (allCounted = !allCounted))}{/if}
              <p class="reading use-foot">{said.countedWhy}</p>
            </div>
          </Tile>
        {/if}
      </div>
      {#snippet failed(_error, reset)}
        <!-- A SENTENCE UNDER DETAILS, NEVER THE EXCEPTION: the thrown message reaches the console through `onerror`. -->
        <ReadState state="fault" screen={words.usage} refusal={words.usageThrew} onretry={reset} />
      {/snippet}
    </svelte:boundary>
  {/if}
</div>

<style>
  .page {
    --head-glyph: 18px;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
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

  .months-held {
    block-size: 48px;
  }

  :global(.months) .month {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  /* A ROW OF TILES THAT WRAPS, so one that draws nothing leaves no hole and the rest take its room, and a phone is one
     column. Tiles beside each other are one height. A row with no tile takes no gap (audit 6f AF22). */
  .band {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--tile-gap);
  }

  .band:not(:has(> :global(.tile))) {
    display: none;
  }

  .band > :global(.tile) {
    flex: 1 1 280px;
  }

  .limits > :global(.tile) {
    flex: 1 1 240px;
  }

  /* A SMALL TILE ALONE ON ITS ROW STAYS SMALL, rather than one ring or one heat grid in 1100px of white. */
  @media (width >= 640px) {
    .limits > :global(.tile) {
      max-inline-size: 420px;
    }
  }

  @media (width >= 640px) {
    .rest > :global(.tile) {
      max-inline-size: 640px;
    }
  }

  .limits > :global(.tile[data-wide]) {
    flex: 2 1 520px;
    max-inline-size: none;
  }

  /* SLASH OPEN TAKES THE ROW UNDER THE OTHERS. */
  .limits > :global(.tile[data-open]) {
    flex: 1 1 100%;
    order: 1;
    max-inline-size: none;
  }

  .uses > :global(.tile) {
    flex: 1 1 300px;
  }

  .uses > :global(.use-what) {
    flex: 2 1 520px;
    scroll-margin-block-start: var(--sp-8);
  }

  /* ROWS TIGHTEN AT A DESK, where eight of them and the limits above have to share a screen. A thumb keeps its 44. */
  @media (width >= 640px) and (pointer: fine) {
    .uses {
      --row-h: 36px;
    }
  }

  /* THE FIGURE (`t-figure`): 22 on 26 at 600, and the unit beside it in the meta step. */
  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: var(--lead-figure, 26px);
    letter-spacing: var(--track-figure, -0.02em);
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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
    line-height: var(--lh-body);
  }

  /* THE WAY TO START AN EMPTY MONTH, under its line in the allowance tile. */
  .idle-act {
    display: flex;
    margin-block-start: var(--sp-3);
  }

  /* THE PLAN'S LINES AND EXTRA USAGE, at the tile's foot and close together. */
  .allow-foot {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin-block-start: auto;
  }

  .allow-foot:empty {
    display: none;
  }

  .aside-line {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
  }

  /* FOUR RINGS IN A ROW, each with its name and figures under it, and two by two on a phone. */
  .rings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
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

  .ring-said {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  /* ON A PHONE TWO BY TWO WITH THE WORDS BESIDE EACH RING: under it they cost a hundred pixels a row. */
  @media (width < 640px) {
    .rings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ring {
      flex-direction: row;
      align-items: center;
      gap: var(--sp-2);
    }

    .ring :global(.viz-ring) {
      flex: 0 0 72px;
      margin-block-end: 0;
    }
  }

  .ring-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui, 20px);
  }

  .ring-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
    font-variant-numeric: tabular-nums;
  }

  /* A RING WITH ITS LINE BESIDE IT, for a tile too small for the line under it. */
  .meter {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .meter :global(.viz-ring) {
    flex: 0 0 72px;
  }

  .meter-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
  }

  /* THE LISTS: a section's rows, and at their foot whatever opens or reads them, level across a row of tiles. */
  .use-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }

  .use-foot {
    padding-block-start: var(--sp-3);
  }

  .use-counts {
    flex: none;
    gap: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 400;
    line-height: var(--lead-meta, 18px);
    font-variant-numeric: tabular-nums;
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

  /* A BAR A ROW (G26): the name, its bar, its figure at the end. Under 640 the row has no bar, its words go under its name. */
  .use-bar-row {
    grid-template-columns: minmax(0, 1fr) minmax(3rem, 0.3fr) max-content;
    column-gap: var(--sp-4);
  }

  /* THE FIGURE'S COLUMN IS AS WIDE AS ITS LONGEST FIGURE, the same on every row, so the bars start and end level. */
  @media (width >= 640px) {
    .use-bars {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(3rem, 0.3fr) max-content;
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

  /* A ROW A PROJECT PRESSES AS ONE, and is told as the slice that is open by the rows' own selection. */
  .use-project .line-title {
    color: var(--ink);
  }

  .use-project[data-faint] .line-title {
    color: var(--ink-2);
  }

  /* A KIND OF DELIVERY OR ARRIVAL: which way it went, its name, its count. A row nobody presses can be small. */
  .use-kind {
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: var(--sp-2);
    min-block-size: 28px;
    padding-block: var(--sp-1);
    color: var(--ink-3);
  }

  .use-kind .line-title {
    color: var(--ink);
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

  /* THE REST OF THE LIST BEHIND ONE PRESS: a 28 capsule on the rows' text edge, its chevron turning once they show. */
  .use-more {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-1);
    min-block-size: var(--ctl-panel);
    margin-block-start: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--soft-fill);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ctl, 20px);
    cursor: pointer;
  }

  .use-more :global(svg) {
    transition: rotate var(--d-state, 120ms) var(--ease-out, ease-out);
  }

  .use-more[aria-expanded='true'] :global(svg) {
    rotate: 180deg;
  }

  @media (hover: hover) and (pointer: fine) {
    .use-more:hover {
      background: var(--soft-fill-hover);
      color: var(--ink);
    }
  }

  /* THE PROJECT AN ACTION RUNS IN, quieter than its name. */
  .use-in {
    color: var(--ink-3);
  }

  .use-why {
    margin: 0 0 var(--sp-2);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
  }

  .use-all {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .use-all:hover {
      color: var(--ink);
    }
  }

  /* ON A PHONE A ROW IS ITS NAME WITH ITS COUNTS UNDER IT, WRAPPING, AND NO BAR: the order already says which ran most, and
     the bar beside the counts squeezed both. A project's row is one line, its name and its runs. */
  @media (width < 640px) {
    .use-bar {
      display: none;
    }

    .use-bar-row {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--row-stack, 2px);
    }

    .use-bar-row .line-title,
    .use-bar-row .use-counts {
      grid-column: 1;
    }

    .use-bar-row .use-counts {
      grid-row: 2;
      justify-content: flex-start;
      text-align: start;
      white-space: normal;
    }

    .use-project {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--sp-3);
    }

    .use-project .use-counts {
      grid-column: 2;
      grid-row: 1;
      white-space: nowrap;
    }

    .use-kind {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .use-kind .use-counts {
      grid-column: 3;
      grid-row: 1;
    }
  }
</style>
