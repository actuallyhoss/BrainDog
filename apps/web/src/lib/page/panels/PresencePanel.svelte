<!--
  The agents working now on the Agents page (`panel: presence`, agents and MCP plan §4.4, §7.1): one row a live session,
  a helper folded under the run it works for, and for the owner Tell, Pause and Stop.

  THE HOST'S HALF ONLY. `$lib/record/instruct.ts` and `$lib/agents/threads.ts` word each row and make the writes. Tell
  aims the composer above (`aim`); a stop, a pause or a resume is an instruction the record applies at once, and the
  other panel is told to read again (`told`).

  ON THE AGENTS PAGE, ONE ROW A LIVE SESSION, LED BY ITS PROJECT (the Agents page of 24 Nov): the project's picture (its
  logo, as the sidebar draws it, else its letter) and name, what the session is doing now in its own words (the newer of its last `doing` and its newest note, never the
  first thing it said, `nowOf`), and when it was last heard. The sessions silent over an hour or open with nothing
  written fold into one "3 quiet" line. No machine, no profile, no folder: where a session runs is on its own page.
  Tell, Pause and Stop are behind one More press; a pause or a stop asks once, in place, with what it will do.

  READ BY ANYONE WHO READS THE RUNS (`level: read`); the presses are drawn for the owner alone, since only a person
  signed in as the owner can instruct.

  SCOPED WHERE ANOTHER SCREEN HOLDS IT: `run` draws that one run (Today's run sheet), `project` the runs on
  that project (a project's "Working here now"), and `oncount` tells the host how many it draws, for its heading. Both
  keep the full row with its presses (braindog-render's `Presence`), since there the run is what the screen is about.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Presence, type ControlMark, type PresenceView } from 'braindog-render/svelte';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { listen } from '../listen.svelte.ts';
  import {
    NO_PLACES,
    aim,
    agentNamed,
    agoSaid,
    control,
    doingSaid,
    folderSaid,
    isAtWork,
    lastSaid,
    openNow,
    presenceOf,
    scopedLeads,
    told,
    type LiveRun,
    type Project,
    type Thread,
  } from '$lib/record/instruct.ts';
  import NamedAgents from '$lib/agents/NamedAgents.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { initialOf, slotOf } from '$lib/ui/face.ts';
  import { pictureNow } from '$lib/picture/pictures.svelte.ts';
  import { nowOf } from '$lib/agents/threads.ts';
  import RunSkeleton from '$lib/agents/RunSkeleton.svelte';
  import { keepCount, lastCount } from '$lib/agents/last-size.ts';

  let {
    owner = false,
    run = null,
    project = null,
    oncount,
  }: {
    owner?: boolean;
    /** Draw this run alone, by handle (`S883`). */
    run?: string | null;
    /** Draw the runs on this project alone, by handle (`things#1`). */
    project?: string | null;
    /** How many runs it draws, each time that changes. */
    oncount?: ((n: number) => void) | undefined;
  } = $props();

  const words = {
    menu: (name: string) => `Tell, pause or stop ${name}`,
    tell: 'Tell it something',
    pause: 'Pause',
    stop: 'Stop',
    resume: 'Resume',
    open: 'Open its page',
    none: 'No agent has a run open.',
    nobody: 'Nobody is working right now.',
    quietN: (n: number) => `${n.toLocaleString('en')} quiet`,
  } as const;

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let threads = $state.raw<Thread[]>([]);
  let projects = $state.raw<Map<string, Project>>(new Map());
  let pressing = $state.raw<Set<string>>(new Set());
  let read = $state(false);

  /* THE AGENTS PAGE'S OWN FORM: one line a run, the presses behind More. A scoped panel keeps the full row. */
  const line = $derived(run === null && project === null);

  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);

  async function load(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), owner ? io.threads(20, run ?? undefined) : Promise.resolve({ ok: false as const, fix: '' })]);
    if (p.ok) rows = p.value;
    if (t.ok) threads = t.value;
    /* THE ROWS DRAW ONCE PRESENCE IS READ; their projects' names follow, a read of their own. */
    read = true;
    if (projects.size === 0 || rows.some((r) => r.project !== null && !projects.has(r.project))) projects = await io.projects(rows);
  }

  onMount(() => {
    void load();
    const off = told.on(() => void load());
    /* "HEARD 3 MIN AGO" IS A CLOCK, and a pulse moves no version, so the rows are read again every fifteen seconds too. */
    const clock = setInterval(() => void load(), 15_000);
    return () => {
      off();
      clearInterval(clock);
    };
  });

  listen(load, () => pressing.size > 0);

  const rowsByKey = $derived(new Map(rows.map((r) => [r.run, r])));
  const viewOf = (r: LiveRun): PresenceView => {
    /* ONE RUN ALONE (Today's sheet) SAYS NO PROFILE AND NO BRANCH. */
    const v = presenceOf(r, rows, projects, threads, { bare: run !== null });
    /* ON A PROJECT'S OWN PAGE A ROW DOES NOT SAY THE PROJECT: "on Kiln" on Kiln's page said where he already is, and its
       "on" sat alone on its line where the name wrapped (audit of 31 October, A19). */
    return { ...v, ...(project !== null ? { project: null } : {}), href: v.href ? at(v.href) : null, busy: pressing.has(r.run) };
  };

  /* WHO IS OPEN NOW (`openNow`): the sessions that did something lately lead, and the ones silent over an hour or open
     with nothing written fold into "3 quiet"; a session whose key only reads is never counted. */
  const open = $derived(line ? openNow(rows) : { shown: [], idle: [], quiet: [], looks: [] });
  const quietRuns = $derived([...open.idle, ...open.quiet.flatMap((q) => q.runs)]);
  /* THE AGENT'S NAME BESIDE THE PROJECT ONLY WHERE TWO KINDS ARE LIVE: on a record of Claude alone, "Claude" on every
     row said nothing the mark does not. */
  const kinds = $derived(new Set([...open.shown, ...quietRuns].map((r) => r.agent ?? 'other')).size);

  /** One live session, worded: its project and mark, what it is doing now, and when it was last heard. */
  type LiveRow = { key: string; title: string; letter: string; slot: string | null; picture: string | null; now: string; when: string; working: boolean; held: string | null; href: string | null; busy: boolean };
  const liveOf = (r: LiveRun): LiveRow => {
    const p = r.project === null ? null : (projects.get(r.project) ?? null);
    const folder = folderSaid(r.cwd);
    const where = p?.name ?? r.repo ?? (folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : 'No project');
    const who = agentNamed(r.agent);
    const own = (d: string) => doingSaid({ doing: d, agent: r.agent, repo: r.repo, branch: r.branch, name: r.name }) !== d;
    const working = isAtWork(r);
    return {
      key: r.run,
      title: kinds > 1 && who ? `${where} · ${who}` : where,
      letter: initialOf(where),
      slot: p ? slotOf(p.hue) : null,
      /* ITS PICTURE, ITS LOGO, AS THE SIDEBAR DRAWS IT (`pictureNow`: what this tab just wrote first), and its letter only
         where it holds none. */
      picture: p ? pictureNow(p.key, p.picture ?? null) : null,
      now: nowOf(r, own) ?? lastSaid({ ...r, doing: null }),
      /* WHEN IT WAS LAST HEARD, every row: "Working now" under a tile called Working now said nothing; the dot says it. */
      when: `Heard ${agoSaid(r.heard_s)}`,
      working,
      held: r.stopped === 'stop' ? 'Stopped by you' : r.stopped === 'pause' ? 'Paused by you' : null,
      href: /^S[1-9][0-9]*$/u.test(r.run) ? `/r/session/${r.run.slice(1)}` : null,
      busy: pressing.has(r.run),
    };
  };
  const shownRows = $derived(open.shown.map(liveOf));
  const quietRows = $derived(quietRuns.map(liveOf));
  const views = $derived(line ? [] : scopedLeads(rows, { run, project }).map(viewOf));
  /* THE TILE'S SIZE, KEPT FOR ITS NEXT OPEN (3 Nov): the lines it drew, so its skeleton stands at that size while it
     reads, where the whole tile came in late and pushed the next tile down. Only the Agents page's own tile. */
  const SIZE = 'at-work';
  const lastSize = $derived(line ? lastCount(SIZE) : null);
  $effect(() => {
    if (line && read) keepCount(SIZE, Math.max(1, shownRows.length + (quietRows.length > 0 ? 1 : 0)));
  });
  const drawn = $derived(line ? shownRows.length + quietRows.length : views.length);

  $effect(() => oncount?.(line ? open.shown.length : views.length));

  async function hold(run: string, kind: 'stop' | 'pause' | 'resume', why: string): Promise<void> {
    pressing = new Set([...pressing, run]);
    try {
      const out = await io.hold(run, kind, why);
      if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    } finally {
      pressing = new Set([...pressing].filter((x) => x !== run));
    }
    told.say();
  }

  /* THE ROW'S MENU: the run it is for, and where it opens. A pause or a stop asks under the row it is for. */
  let menu = $state<{ key: string; group: string; at: { x: number; y: number; height: number } } | null>(null);
  let menuOpen = $state(false);
  let lists = $state<Record<string, { confirm(key: string, kind: 'stop' | 'pause'): void } | undefined>>({});
  const menuRun = $derived(menu ? (rows.find((r) => r.run === menu!.key) ?? null) : null);
  const menuView = $derived(menuRun ? viewOf(menuRun) : null);
  let asking = $state<{ key: string; kind: 'stop' | 'pause' } | null>(null);
  let why = $state('');
  const uid = $props.id();

  function openMenu(group: string, key: string, rect: { x: number; y: number; height: number }): void {
    menu = { key, group, at: rect };
    menuOpen = true;
  }

  const ask = (kind: 'stop' | 'pause') => {
    if (!menu) return;
    if (line) {
      asking = { key: menu.key, kind };
      why = '';
    } else lists[menu.group]?.confirm(menu.key, kind);
  };

  const rectOf = (e: MouseEvent): { x: number; y: number; height: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.top, height: r.height };
  };
</script>

{#snippet list(group: string, shown: readonly PresenceView[])}
  <Presence
    bind:this={lists[group]}
    rows={shown}
    {mark}
    line
    ontell={owner ? (key) => aim.say(key) : undefined}
    onstop={owner ? (key, kind, why) => void hold(key, kind, why) : undefined}
    onresume={owner ? (key) => void hold(key, 'resume', '') : undefined}
    onmenu={owner ? (key, rect) => openMenu(group, key, rect) : undefined}
  />
{/snippet}

{#snippet live(rows: readonly LiveRow[])}
  <ul class="live" aria-label="Agents working now">
    {#each rows as r (r.key)}
      {@const run = rowsByKey.get(r.key)}
      <li class="live-row" data-working={r.working ? '' : undefined} aria-busy={r.busy ? 'true' : undefined}>
        <span class="live-mark"><IconWell letter={r.letter} picture={r.picture} slot={(r.slot ?? undefined) as never} size="l" />{#if r.working}<span class="live-dot" aria-hidden="true"></span>{/if}</span>
        <span class="live-words">
          {#if r.href}<a class="live-title" href={at(r.href)}>{r.title}</a>{:else}<span class="live-title">{r.title}</span>{/if}
          <span class="live-now" title={r.now}>{r.now}</span>
        </span>
        <span class="live-when" data-held={r.held ? '' : undefined}>{r.held ?? r.when}</span>
        {#if owner && run}
          <button type="button" class="live-more" aria-haspopup="menu" aria-label={words.menu(r.title)} disabled={r.busy} onclick={(e) => openMenu('line', r.key, rectOf(e))}
            ><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.25" /><circle cx="8" cy="8" r="1.25" /><circle cx="12.5" cy="8" r="1.25" /></svg></button
          >
        {/if}
        {#if asking?.key === r.key && run}
          {@const v = viewOf(run)}
          <form class="live-ask" aria-label={asking.kind === 'stop' ? words.stop : words.pause} onsubmit={(e) => (e.preventDefault(), void hold(r.key, asking!.kind, why.trim()), (asking = null))}>
            <p class="live-sure" role="status">{asking.kind === 'stop' ? v.confirm.stop : v.confirm.pause}</p>
            <label class="live-why" for="{uid}-why">Why, if you want to say (it reads this)</label>
            <input id="{uid}-why" class="live-input" type="text" bind:value={why} autocomplete="off" enterkeyhint="send" maxlength="400" />
            <div class="live-do">
              <button type="button" class="live-btn" onclick={() => (asking = null)}>Keep it going</button>
              <button type="submit" class="live-btn" data-weight="primary">{asking.kind === 'stop' ? 'Stop it' : 'Pause it'}</button>
            </div>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if line}
  {#if !read}
    <!-- NOT READ YET: rows shaped like the ones it drew last time, at that count, or where it has never been seen here,
         nothing but the mark that it is reading, rather than a line that may be wrong a moment later. -->
    {#if lastSize !== null && lastSize > 0}<RunSkeleton count={lastSize} />{:else}<span class="at-work-busy" data-seen-none hidden aria-busy="true"></span>{/if}
  {:else if drawn === 0}
    <p class="at-work-none">{words.none}</p>
    <!-- THE AGENTS HE NAMED THAT HAVE NOT CALLED YET, each with Connect (`NamedAgents.svelte`), for the owner. -->
    {#if owner}<NamedAgents />{/if}
  {:else}
    <div class="at-work">
      {#if shownRows.length > 0}{@render live(shownRows)}{:else}<p class="at-work-none">{words.nobody}</p>{/if}
      {#if quietRows.length > 0}
        <!-- THE QUIET ONES, ONE LINE: silent over an hour, or open with nothing written; each a press away. -->
        <details class="fold">
          <summary class="fold-head">{words.quietN(quietRows.length)}</summary>
          {@render live(quietRows)}
        </details>
      {/if}
    </div>
  {/if}
  {#if menuView && menuRun}
    <Menu label={words.menu(menuView.name)} bind:open={menuOpen} at={menu?.at ?? null}>
      {#if menuRun.stopped}
        <button type="button" role="menuitem" onclick={() => void hold(menuRun.run, 'resume', '')}><Icon name="play" size="m" /><span class="mi-name">{words.resume}</span></button>
        {#if menuRun.stopped === 'pause'}<button type="button" role="menuitem" onclick={() => ask('stop')}><Icon name="stop" size="m" /><span class="mi-name">{words.stop}</span></button>{/if}
      {:else}
        <button type="button" role="menuitem" onclick={() => aim.say(menuRun.run)}><Icon name="ask" size="m" /><span class="mi-name">{words.tell}</span></button>
        <button type="button" role="menuitem" onclick={() => ask('pause')}><Icon name="pause" size="m" /><span class="mi-name">{words.pause}</span></button>
        <button type="button" role="menuitem" onclick={() => ask('stop')}><Icon name="stop" size="m" /><span class="mi-name">{words.stop}</span></button>
      {/if}
      {#if menuView.href}<a role="menuitem" href={at(menuView.href)}><Icon name="arrow" size="m" /><span class="mi-name">{words.open}</span></a>{/if}
    </Menu>
  {/if}
{:else if drawn === 0}
  <!-- NOTHING OPEN, OR NOT READ YET: the tile is left out whole, heading and all (`BlockSlot.svelte`'s rule for a panel
       that drew nothing). -->
  <span data-seen-none hidden aria-busy={!read ? 'true' : undefined}></span>
{:else}
  <Presence
    rows={views}
    {mark}
    ontell={owner ? (key) => aim.say(key) : undefined}
    onstop={owner ? (key, kind, why) => void hold(key, kind, why) : undefined}
    onresume={owner ? (key) => void hold(key, 'resume', '') : undefined}
  />
{/if}

<style>
  .at-work {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    container-type: inline-size;
  }

  /* THE QUIET ONES: one quiet line that opens onto them. */
  .fold {
    min-inline-size: 0;
  }

  .fold-head {
    display: flex;
    align-items: center;
    min-block-size: 32px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    cursor: pointer;
  }

  .fold-head:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* ONE ROW A LIVE SESSION: its project's mark, the project and what it is doing now, when it was last heard, More. */
  .live {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .live-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0 var(--sp-3);
    padding-block: var(--sp-2);
  }

  .live-row + .live-row {
    border-block-start: 1px solid var(--rule);
  }

  .live-mark {
    position: relative;
    display: inline-grid;
  }

  /* AT WORK IS A DOT on the mark's corner, cut out of it by the tile's own ground. */
  .live-dot {
    position: absolute;
    inset-block-end: -2px;
    inset-inline-end: -2px;
    inline-size: 10px;
    block-size: 10px;
    border: 2px solid var(--tile);
    border-radius: 50%;
    background: var(--live, var(--good));
  }

  .live-words {
    display: grid;
    gap: 1px;
    min-inline-size: 0;
  }

  .live-title {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: calc(22px * var(--type, 1));
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-now {
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .live-row[data-working] .live-when {
    color: var(--ink-2);
  }

  .live-when[data-held] {
    color: var(--warn, var(--ink-2));
  }

  .live-more {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  .live-more svg {
    inline-size: 16px;
    block-size: 16px;
    fill: currentColor;
  }

  .live-more:focus-visible,
  .live-btn:focus-visible,
  .live-input:focus-visible,
  .live-title:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .live-more:hover {
      background: var(--hover);
      color: var(--ink);
    }

    a.live-title:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* A PAUSE OR A STOP ASKS ONCE, UNDER ITS ROW, the whole width. */
  .live-ask {
    display: grid;
    grid-column: 1 / -1;
    gap: var(--sp-2);
    margin-block: var(--sp-2) 0;
    padding: var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .live-sure,
  .live-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .live-input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .live-do {
    display: flex;
    gap: var(--sp-2);
  }

  .live-btn {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .live-btn[data-weight='primary'] {
    background: var(--red-fill);
    color: var(--on-red);
  }

  @media (pointer: coarse) {
    .live-more {
      inline-size: var(--tap, 44px);
      block-size: var(--tap, 44px);
    }
  }

  /* ON A NARROW TILE WHEN IT WAS HEARD GOES UNDER WHAT IT IS DOING, so the words keep the width. */
  @container (width < 420px) {
    .live-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .live-when {
      grid-column: 2;
      grid-row: 2;
    }

    .live-more {
      grid-column: 3;
      grid-row: 1 / span 2;
    }
  }

  .at-work-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .at-work-none {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }
</style>
