<!--
  The agents working now on the Agents page (`panel: presence`, agents and MCP plan §4.4, §7.1): one run row each, a
  helper folded under the run it works for, and for the owner Tell, Pause and Stop.

  THE HOST'S HALF ONLY. braindog-render's `Presence` draws; `$lib/record/instruct.ts` words each row and makes the
  writes. Tell aims the composer above (`aim`); a stop, a pause or a resume is an instruction the record applies at once,
  and the other panel is told to read again (`told`).

  ON THE AGENTS PAGE, ONE LINE A RUN (the Agents page of 23 October): what the run is doing in plain words leads the row
  (`doingSaid`, never "Claude run" or the agent's name twice), then its project as a chip, how long it has run and how
  it stands (`standsSaid`: working now, or quiet for 40 min). The runs at work come first, then the ones waiting on him
  that called inside three hours (`onDeskOf`); a run quiet longer is left to Recent runs, so a session open and silent
  for two days is not at work. Tell, Pause and Stop are behind one More press, which a mouse finds on hover; what each
  reaches is said in the ask before it is sent. The machines they are on are one quiet line at the foot, and under two
  or more machines each heads its own runs. With nothing at work the tile says so in one line.

  READ BY ANYONE WHO READS THE RUNS (`level: read`); the presses are drawn for the owner alone, since only a person
  signed in as the owner can instruct.

  SCOPED WHERE ANOTHER SCREEN HOLDS IT (plan §7.2): `run` draws that one run (Today's run sheet), `project` the runs on
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
  import { machineSaid } from '$lib/record/machine-name.ts';
  import {
    NO_PLACES,
    aim,
    atWorkOf,
    byMachine,
    control,
    doingSaid,
    onDeskOf,
    presenceOf,
    scopedLeads,
    spanSaid,
    standsSaid,
    told,
    waitingOf,
    type LiveRun,
    type Places,
    type Project,
    type Thread,
  } from '$lib/record/instruct.ts';
  import { machinesOf } from './machines.ts';

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
    machine: (name: string | null, among: readonly string[]) => (name ? machineSaid(name, among) : 'A machine not named'),
    atWork: (n: number) => `${n.toLocaleString('en')} here`,
    menu: (name: string) => `Tell, pause or stop ${name}`,
    tell: 'Tell it something',
    pause: 'Pause',
    stop: 'Stop',
    resume: 'Resume',
    open: 'Open its page',
    none: 'No agent is at work right now.',
    on: (said: string) => `On ${said}`,
    idle: (names: string) => `nothing open on ${names}`,
  } as const;

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let threads = $state.raw<Thread[]>([]);
  let places = $state.raw<Places>(NO_PLACES);
  let projects = $state.raw<Map<string, Project>>(new Map());
  let pressing = $state.raw<Set<string>>(new Set());
  let read = $state(false);

  /* THE AGENTS PAGE'S OWN FORM: one line a run, the presses behind More. A scoped panel keeps the full row. */
  const line = $derived(run === null && project === null);

  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);

  async function load(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), owner ? io.threads(20, run ?? undefined) : Promise.resolve({ ok: false as const, fix: '' })]);
    if (p.ok) rows = p.value;
    if (t.ok) {
      threads = t.value;
      places = ('places' in t ? t.places : undefined) ?? NO_PLACES;
    }
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
    const v = presenceOf(r, rows, projects, threads);
    return { ...v, href: v.href ? at(v.href) : null, busy: pressing.has(r.run) };
  };

  /* THE ONE-LINE ROW: what it is doing, how long it has run, and how it stands. */
  const lineOf = (r: LiveRun): PresenceView => ({ ...viewOf(r), doing: doingSaid(r), time: spanSaid(r.for_s * 1000), stands: standsSaid(r) });

  /* WHO IS AT WORK, AND WHO WAITS ON HIM BUT CALLED LATELY: the rail's count first, never the runs merely open. */
  const desk = $derived(line ? onDeskOf(rows) : []);
  /* A MACHINE IS SAID AS A PERSON SAYS IT (`machineSaid`), its own name kept for the hover. */
  const machineNames = $derived([...new Set(rows.map((r) => r.machine).filter((m): m is string => m !== null))]);
  const groups = $derived(byMachine(desk).map((g) => ({ ...g, said: words.machine(g.machine, machineNames), views: g.rows.map(lineOf) })));
  /* THE MACHINES IN ONE QUIET LINE, where one machine holds them all: "On MacBook Pro, as work". */
  const foot = $derived.by((): string | null => {
    if (!line || groups.length > 1) return null;
    const m = machinesOf(atWorkOf(rows), waitingOf(rows), places);
    const open = m.lines.filter((l) => !l.quiet || l.said !== 'Nothing open').map((l) => `${l.name}${l.seats.length > 0 ? `, as ${l.seats.join(', ')}` : ''}`);
    const idle = m.lines.filter((l) => l.said === 'Nothing open').map((l) => l.name);
    const parts = [open.length > 0 ? words.on(open.join(' and ')) : null, idle.length > 0 ? words.idle(idle.join(' and ')) : null].filter((x): x is string => x !== null);
    return parts.length === 0 ? null : `${parts.join('; ')}.`;
  });
  const views = $derived(line ? [] : scopedLeads(rows, { run, project }).map(viewOf));
  const drawn = $derived(line ? desk.length : views.length);

  $effect(() => oncount?.(line ? atWorkOf(rows).length : views.length));

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
    <span class="at-work-busy" aria-busy="true"></span>
  {:else if drawn === 0}
    <p class="at-work-none">{words.none}</p>
  {:else}
    <div class="at-work">
      {#each groups as g (g.machine ?? '')}
        <section class="machine" aria-label={g.said}>
          {#if groups.length > 1}
            <h3 class="machine-head"><Icon name="monitor" size="s" /><span class="machine-name" title={g.machine ?? undefined}>{g.said}</span><span class="machine-n num">{words.atWork(g.rows.length)}</span></h3>
          {/if}
          {@render list(g.machine ?? '', g.views)}
        </section>
      {/each}
      {#if foot}<p class="at-work-foot">{foot}</p>{/if}
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
  <span data-seen-none hidden></span>
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

  .machine {
    display: grid;
    min-inline-size: 0;
  }

  /* A MACHINE'S NAME OVER ITS RUNS, quiet: the meta size in the second ink, how many at its end. */
  .machine-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
  }

  .machine-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .machine-n {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
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
