<!--
  The agents working now on the Agents page (`panel: presence`, agents and MCP plan §4.4, §7.1): one run row each, a
  helper folded under the run it works for, and for the owner Tell, Pause and Stop.

  THE HOST'S HALF ONLY. braindog-render's `Presence` draws; `$lib/record/instruct.ts` words each row and makes the
  writes. Tell aims the composer above (`aim`); a stop, a pause or a resume is an instruction the record applies at once,
  and the other panel is told to read again (`told`).

  ON THE AGENTS PAGE, ONE LINE A RUN (`openNow`): each run is named by its app and where it
  works ("Claude Code in Lanternfish", "Claude in the Developer folder"), with the last thing it did under it ("Asked you: …",
  "Wrote 3 changes"), how many changes it wrote and when it was last heard. Only those runs are counted. The ones open
  with nothing written fold into one line ("2 open, nothing written") that opens onto them; each machine silent over an
  hour is one quiet row ("Windows PC, 3 Claude sessions on D:\"); a run whose key only reads is never counted and is
  said once at the foot. Tell, Pause and Stop are behind one More press, which a mouse finds on hover; what each reaches
  is said in the ask before it is sent. The machines the runs are on are one quiet line at the foot. With nothing open
  the tile says so in one line.

  READ BY ANYONE WHO READS THE RUNS (`level: read`); the presses are drawn for the owner alone, since only a person
  signed in as the owner can instruct.

  SCOPED WHERE ANOTHER SCREEN HOLDS IT: `run` draws that one run (Today's run sheet), `project` the runs on
  that project (a project's "Working here now"), and `oncount` tells the host how many it draws, for its heading. Both
  keep the full row with its presses, since there the run is what the screen is about.
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
    changesSaid,
    control,
    heardSaid,
    idleSaid,
    isAtWork,
    lastSaid,
    looksSaid,
    openNow,
    presenceOf,
    quietSaid,
    runTitle,
    scopedLeads,
    standsSaid,
    told,
    type LiveRun,
    type Project,
    type Thread,
  } from '$lib/record/instruct.ts';
  import { UNNAMED, machinesOf } from './machines.ts';
  import NamedAgents from '$lib/agents/NamedAgents.svelte';

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
    quiet: 'Quiet',
    /* WHERE THEY RUN, said as a sentence (1 Nov): "On MacBook Pro" stood alone under the runs and read as a stray label. */
    on: (said: string) => `Running on ${said}`,
    unnamed: 'a machine with no name',
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

  const viewOf = (r: LiveRun): PresenceView => {
    /* ONE RUN ALONE (Today's sheet) SAYS NO PROFILE AND NO BRANCH. */
    const v = presenceOf(r, rows, projects, threads, { bare: run !== null });
    /* ON A PROJECT'S OWN PAGE A ROW DOES NOT SAY THE PROJECT: "on Kiln" on Kiln's page said where he already is, and its
       "on" sat alone on its line where the name wrapped (audit of 31 October, A19). */
    return { ...v, ...(project !== null ? { project: null } : {}), href: v.href ? at(v.href) : null, busy: pressing.has(r.run) };
  };

  /* THE ONE-LINE ROW: who and where ("Claude Code in Lanternfish"), the last thing it did under it,
     how many changes it wrote, and when it was last heard; never "Working now" again on every row. */
  const projectOf = (r: LiveRun): string | null => (r.project === null ? null : (projects.get(r.project)?.name ?? null));
  /* ONE LINE FOR WHO AND WHERE, ONE FOR WHAT IT IS DOING (Q44 of 29 October): "Wrote 2 changes" over "2 changes heard
     just now" said the count twice, so the count stands beside when it was heard only when the line above says
     something else (a question, what it is doing). */
  const lineOf = (r: LiveRun): PresenceView => {
    const last = lastSaid(r);
    const counted = typeof r.wrote === 'number' && r.wrote > 0 && !last.startsWith('Wrote ');
    return {
      ...viewOf(r),
      project: null,
      name: runTitle(r, projectOf(r)),
      last,
      doing: null,
      time: counted ? changesSaid(r.wrote!) : '',
      stands: r.stopped ? standsSaid(r) : heardSaid(r),
    };
  };

  /* WHO IS OPEN NOW (`openNow`): the runs that did something, then the ones that wrote nothing folded into a line, then
     each machine silent over an hour as one quiet row; a run whose key only reads is never counted. */
  const open = $derived(line ? openNow(rows) : { shown: [], idle: [], quiet: [], looks: [] });
  const shownViews = $derived(open.shown.map(lineOf));
  const idleViews = $derived(open.idle.map(lineOf));
  /* THE MACHINES THE RUNS DRAWN ARE ON, in one quiet line: "On MacBook Pro, as work". */
  const foot = $derived.by((): string | null => {
    if (!line) return null;
    const drawnRuns = [...open.shown, ...open.idle];
    const m = machinesOf(drawnRuns.filter(isAtWork), drawnRuns.filter((r) => !isAtWork(r)), NO_PLACES);
    /* A MACHINE WITH NO NAME IS SAID MID-SENTENCE IN LOWER CASE (domains lane, 2 Nov): "Running on A machine not named". */
    const named = (name: string) => (name === UNNAMED ? words.unnamed : name);
    const on = m.lines.map((l) => `${named(l.name)}${l.seats.length > 0 ? `, as ${l.seats.join(', ')}` : ''}`);
    return on.length === 0 ? null : words.on(on.join(' and '));
  });
  const quietRows = $derived(
    open.quiet.map((q) => {
      const said = quietSaid(q);
      return { key: q.machine ?? '', name: q.said, title: q.machine !== null && q.machine !== q.said ? q.machine : undefined, runs: q.runs.length, what: said.what, said: said.said };
    }),
  );
  const views = $derived(line ? [] : scopedLeads(rows, { run, project }).map(viewOf));
  const drawn = $derived(line ? open.shown.length + open.idle.length + open.quiet.length : views.length);

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

  /* THE ROW'S MENU: the run it is for, where it opens, and the list whose row asks before a stop or a pause. */
  let menu = $state<{ key: string; group: string; at: { x: number; y: number; height: number } } | null>(null);
  let menuOpen = $state(false);
  let lists = $state<Record<string, { confirm(key: string, kind: 'stop' | 'pause'): void } | undefined>>({});
  const menuRun = $derived(menu ? (rows.find((r) => r.run === menu!.key) ?? null) : null);
  const menuView = $derived(menuRun ? viewOf(menuRun) : null);

  function openMenu(group: string, key: string, rect: { x: number; y: number; height: number }): void {
    menu = { key, group, at: rect };
    menuOpen = true;
  }

  const ask = (kind: 'stop' | 'pause') => {
    if (menu) lists[menu.group]?.confirm(menu.key, kind);
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

{#if line}
  {#if !read}
    <!-- NOT READ YET: nothing but the mark that it is reading, rather than a line that may be wrong a moment later. -->
    <span class="at-work-busy" data-seen-none hidden aria-busy="true"></span>
  {:else if drawn === 0}
    <p class="at-work-none">{words.none}</p>
    <!-- THE AGENTS HE NAMED THAT HAVE NOT CALLED YET, each with Connect (`NamedAgents.svelte`), for the owner. -->
    {#if owner}<NamedAgents />{/if}
  {:else}
    <div class="at-work">
      {#if shownViews.length > 0}{@render list('shown', shownViews)}{/if}
      {#if idleViews.length > 0}
        <!-- OPEN AND NOTHING WRITTEN, ONE LINE: the runs are a press away, each with its presses. -->
        <details class="fold">
          <summary class="fold-head">{idleSaid(idleViews.length)}</summary>
          {@render list('idle', idleViews)}
        </details>
      {/if}
      {#if quietRows.length > 0}
        <h3 class="part-head">{words.quiet}<span class="machine-n num">{quietRows.reduce((n, q) => n + q.runs, 0).toLocaleString('en')}</span></h3>
        <ul class="quiet">
          {#each quietRows as q (q.key)}
            <li class="quiet-row">
              <span class="quiet-face" aria-hidden="true"><Icon name="monitor" size="s" /></span>
              <span class="quiet-body">
                <span class="quiet-head"><b class="quiet-name" title={q.title}>{q.name}</b> <span class="quiet-what">{q.what}</span></span>
                <span class="quiet-said">{q.said}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if foot || open.looks.length > 0}
        <p class="at-work-foot">{[foot, open.looks.length > 0 ? looksSaid(open.looks.length) : null].filter((x) => x !== null).join(' ')}</p>
      {/if}
    </div>
  {/if}
  {#if menuView && menuRun}
    <Menu label={words.menu(menuView.name)} bind:open={menuOpen} at={menu?.at ?? null}>
      {#if menuRun.stopped}
        <button type="button" role="menuitem" onclick={() => void hold(menuRun.run, 'resume', '')}><Icon name="play" size="m" /><span class="mi-name">{words.resume}</span></button>
        {#if menuRun.stopped === 'pause'}<button type="button" role="menuitem" onclick={() => ask('stop')}><Icon name="square" size="m" /><span class="mi-name">{words.stop}</span></button>{/if}
      {:else}
        <button type="button" role="menuitem" onclick={() => aim.say(menuRun.run)}><Icon name="edit" size="m" /><span class="mi-name">{words.tell}</span></button>
        <button type="button" role="menuitem" onclick={() => ask('pause')}><Icon name="pause" size="m" /><span class="mi-name">{words.pause}</span></button>
        <button type="button" role="menuitem" onclick={() => ask('stop')}><Icon name="square" size="m" /><span class="mi-name">{words.stop}</span></button>
      {/if}
      {#if menuView.href}<a role="menuitem" href={at(menuView.href)}><Icon name="arrow-right" size="m" /><span class="mi-name">{words.open}</span></a>{/if}
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

  /* QUIET, over the machines silent for an hour: the meta size in the third ink, how many runs at its end. */
  .part-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
  }

  .machine-n {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
  }

  /* OPEN AND NOTHING WRITTEN: one quiet line that opens onto the runs. */
  .fold {
    min-inline-size: 0;
  }

  .fold-head {
    display: flex;
    align-items: center;
    min-block-size: 32px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    cursor: pointer;
  }

  .fold-head:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* ONE ROW A QUIET MACHINE: its glyph, its name and what is open on it, and what they did and how long it is silent. */
  .quiet {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .quiet-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
    gap: 0 var(--sp-3);
    padding-block: var(--sp-1);
  }

  .quiet-row + .quiet-row {
    border-block-start: 1px solid var(--rule);
  }

  .quiet-face {
    display: inline-grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    color: var(--ink-3);
  }

  .quiet-body {
    display: grid;
    min-inline-size: 0;
  }

  .quiet-head {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quiet-name {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .quiet-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .at-work-none,
  .at-work-foot {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .at-work-none {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }
</style>
