<!--
  The Agents page's composer and what he told agents (`panel: instruct`, agents and MCP plan §2.1, §7.1): the box he
  tells an agent in, and under it each instruction's live state, the agent's reply and Undo all on what it changed.

  THE HOST'S HALF ONLY. braindog-render draws (`Instruct`, `Instructions`); `$lib/record/instruct.ts` words every line
  and makes every write. This file holds what he chose and typed, reads the record when it moves (`listen`, the shell's
  version poll) and when the other panel says something changed (`told`), and is aimed at a run by a run row's Tell
  (`aim`).

  THE ROW APPEARS AT ONCE (§2.1). Send draws the thread as On its way before the record answers; the answer replaces it
  with the record's own, or takes it away and puts his words back in the field with the record's reason under it.
  Take back is the thread's own undo while no run has taken it.

  HIS ALONE (`level: owner`): the record refuses `instruct` to anyone but a person, and lists the threads to the owner.

  ON THE AGENTS PAGE AND A PROJECT'S, ONE LINE, AND WHAT HE TOLD BESIDE IT: the field, To and Send on one row, the other choices once he
  starts (`Instruct`'s `line`), and the last three threads in a column of their own beside it where the tile is wide
  enough, under it where it is not. ON A PHONE THE LINE IS A PRESS THAT OPENS THE SHEET with the whole composer in it,
  so the page opens on a line and the form takes the screen only while he writes. A run row's Tell opens it too.

  SCOPED WHERE ANOTHER SCREEN HOLDS IT. `run` opens the composer aimed at that run and lists what went to it
  (Today's run sheet); `project` fixes "On" to that project, offers only the runs working there and lists what he told
  agents on it (a project's page). `projectName` names the project before the projects are read, so the composer is
  whole at its first paint.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Instruct, Instructions, type ControlMark, type ThreadView } from 'braindog-render/svelte';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import { apiBase } from '$lib/at.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { listen } from '../listen.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import {
    NO_PLACES,
    PICK_FIRST,
    aim,
    composerOf,
    control,
    fill,
    controlWords,
    instructArgs,
    runsOf,
    scopedThreads,
    sendingOf,
    threadOf,
    threadOrder,
    told,
    undoAll,
    unknownRuns,
    type LiveRun,
    type Chosen,
    type Places,
    type Project,
    type RunKnown,
    type Thread,
  } from '$lib/record/instruct.ts';

  let {
    owner = false,
    run = null,
    project = null,
    projectName = null,
    first = 6,
  }: {
    owner?: boolean;
    /** Aim at this run, by handle (`S883`), and list what went to it. */
    run?: string | null;
    /** Tell agents on this project alone, by handle (`things#1`). */
    project?: string | null;
    /** The project's name, for "On" before the projects are read. */
    projectName?: string | null;
    /** How many threads are drawn before "Show earlier". */
    first?: number;
  } = $props();

  /** How many more threads each "Show earlier" press shows. */
  const STEP = 20;

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let threads = $state.raw<Thread[]>([]);
  /* THE PROJECT THIS PANEL IS ON, known before the read, so "On Kiln" is drawn at once. */
  const seeded = (): Map<string, Project> => (project && projectName ? new Map([[project, { key: project, name: projectName, hue: null }]]) : new Map());
  let projects = $state.raw<Map<string, Project>>(seeded());
  let known = $state.raw<Map<string, RunKnown>>(new Map());
  /* THE MACHINES AND PROFILES "MACHINE" AND "PROFILE" OFFER, read with the threads (migration 44). */
  let places = $state.raw<Places>(NO_PLACES);
  const firstPick = (): Chosen => (run ? { ...PICK_FIRST, to: `run:${run}` } : project ? { ...PICK_FIRST, on: project } : { ...PICK_FIRST });
  let pick = $state<Chosen>(firstPick());
  let said = $state('');
  let busy = $state(false);
  let fault = $state<string | null>(null);
  let sending = $state.raw<ThreadView | null>(null);
  let undone = $state.raw<Map<string, string>>(new Map());
  let pressing = $state.raw<Set<string>>(new Set());
  /** How many threads stand beside the line on the Agents page, where the column beside it is short. */
  const SHOWN_BESIDE = 3;
  const firstShown = (): number => (run === null && project === null ? Math.min(first, SHOWN_BESIDE) : first);
  let shown = $state(firstShown());
  let now = $state(recordNow());
  let box = $state<{ focus(): void } | undefined>(undefined);
  let here = $state<HTMLElement | undefined>(undefined);

  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);

  /* THE AGENTS PAGE'S OWN FORM: one line, what he told beside it, and the sheet on a phone. A PROJECT'S PAGE TOO: the whole form, its To, On and When and a full-width Send, stood on every project's page
     and was the biggest thing on a phone after the name. Only a run's own sheet keeps the box. */
  const line = $derived(run === null);
  /* A PHONE, by the width the app's sheets turn at (`PHONE_WIDTH` in `panel.ts`), read and followed while mounted. */
  let narrow = $state(false);
  let sheetOpen = $state(false);

  async function read(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), io.threads(50, run ?? undefined, project ?? undefined)]);
    now = recordNow();
    if (p.ok) rows = p.value;
    if (t.ok) {
      threads = t.value;
      places = t.places ?? NO_PLACES;
    }
    const seen = new Map([...known, ...runsOf(rows)]);
    const missing = unknownRuns(threads, seen);
    known = missing.length === 0 ? seen : new Map([...seen, ...(await io.runs(missing))]);
    if (projects.size <= (project ? 1 : 0) || rows.some((r) => r.project !== null && !projects.has(r.project))) projects = new Map([...seeded(), ...(await io.projects(rows))]);
  }

  onMount(() => {
    void read();
    const phone = matchMedia('(width < 640px)');
    const follow = () => (narrow = phone.matches);
    follow();
    phone.addEventListener('change', follow);
    const off = [told.on(() => void read()), aim.on((run) => void aimAt(run)), fill.on((words) => void fillWith(words)), () => phone.removeEventListener('change', follow)];
    /* THE WORDS THAT ARE A CLOCK ("Working 9 min") move once a minute between reads. */
    const clock = setInterval(() => (now = recordNow()), 30_000);
    return () => {
      for (const f of off) f();
      clearInterval(clock);
    };
  });

  /* READ AGAIN WHEN THE RECORD MOVES, never mid-send: a reply landing is drawn while he looks. */
  listen(read, () => busy);

  async function aimAt(run: string): Promise<void> {
    pick = { ...pick, to: `run:${run}`, when: null };
    fault = null;
    if (line && narrow) sheetOpen = true;
    await tick();
    here?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    box?.focus();
  }

  /* A STEP HANDED ON: its words in the field, to whoever is next at their next start, his to send or change. */
  async function fillWith(words: string): Promise<void> {
    said = words;
    pick = { ...PICK_FIRST, when: 'next' };
    fault = null;
    if (line && narrow) sheetOpen = true;
    await tick();
    here?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    box?.focus();
  }

  const composer = $derived(composerOf(pick, rows, projects, project, places));
  const view = $derived({ ...composer, busy, fault });

  async function send(): Promise<void> {
    if (busy) return;
    const words = said;
    if (words.trim() === '') {
      fault = controlWords.empty;
      box?.focus();
      return;
    }
    busy = true;
    fault = null;
    const was = composer;
    sending = sendingOf(`outgoing:${String(Date.now())}`, words, was);
    said = '';
    try {
      const out = await io.send(instructArgs(was, words));
      if (out.ok) {
        /* `instruct` ANSWERS THE INSTRUCTION ALONE: nobody has seen it and the run has changed nothing yet. */
        threads = [{ ...out.value, seen: [], receipts: null }, ...threads.filter((t) => t.id !== out.value.id)];
        pick = { ...pick, when: null };
        told.say();
      } else {
        said = words;
        fault = out.fix;
        box?.focus();
      }
    } finally {
      sending = null;
      busy = false;
    }
    void read();
  }

  const press = (key: string, on: boolean) => {
    const next = new Set(pressing);
    if (on) next.add(key);
    else next.delete(key);
    pressing = next;
  };

  async function takeBack(key: string): Promise<void> {
    press(key, true);
    try {
      const out = await io.takeBack(key);
      if (out.ok) threads = threads.map((t) => (t.id === key ? out.value : t));
      else fault = out.fix;
    } finally {
      press(key, false);
    }
    told.say();
  }

  /* THE LIST LOSES IT AT ONCE; a refusal puts it back and says why. */
  async function close(key: string): Promise<void> {
    const before = threads;
    threads = threads.filter((t) => t.id !== key);
    const out = await io.close(key);
    if (!out.ok) {
      threads = before;
      fault = out.fix;
    }
    told.say();
  }

  async function undo(key: string): Promise<void> {
    const t = threads.find((x) => x.id === key);
    if (!t?.receipts) return;
    press(key, true);
    try {
      const line = await undoAll(apiBase(), t.receipts);
      undone = new Map([...undone, [key, line]]);
    } finally {
      press(key, false);
    }
    told.say();
  }

  const ordered = $derived(threadOrder(scopedThreads(threads, { run, project })));
  const drawn = $derived.by(() => {
    const ctx = { now, runs: known, projects, undone, busy: pressing };
    const list = ordered.slice(0, shown).map((t) => threadOf(t, ctx));
    return sending ? [sending, ...list] : list;
  });
</script>

{#snippet field(oneLine: boolean)}
  <Instruct
    bind:this={box}
    {view}
    bind:said
    {mark}
    line={oneLine}
    onto={(key) => ((pick = { ...pick, to: key, when: null }), (fault = null))}
    onon={(key) => ((pick = { ...pick, on: key, when: null }), (fault = null))}
    onwhen={(w) => (pick = { ...pick, when: w })}
    onmachine={(key) => ((pick = { ...pick, machine: key, when: null }), (fault = null))}
    onseat={(key) => ((pick = { ...pick, seat: key, when: null }), (fault = null))}
    onsend={() => void send()}
  />
{/snippet}

{#if owner}
  <div class="tell" data-line={line ? '' : undefined} bind:this={here}>
    <div class="tell-compose">
      {#if line && narrow}
        <!-- THE PHONE'S LINE: a press that looks like the field and opens the sheet, his draft in it if he has one. -->
        <button type="button" class="tell-open" data-said={said.trim() ? '' : undefined} aria-haspopup="dialog" onclick={() => (sheetOpen = true)}><span class="tell-open-text">{said.trim() || 'Tell an agent what to do…'}</span></button>
        <Sheet bind:open={sheetOpen} title="Tell an agent">
          {#if sheetOpen}{@render field(false)}{/if}
        </Sheet>
      {:else}
        {@render field(line)}
      {/if}
    </div>
    {#if drawn.length > 0}
      <div class="tell-told">
        <h3 class="told-head">What you told agents</h3>
        <Instructions threads={drawn} {mark} more={Math.max(0, ordered.length - shown)} ontakeback={(k) => void takeBack(k)} onclose={(k) => void close(k)} onundo={(k) => void undo(k)} onmore={() => (shown += STEP)} />
      </div>
    {/if}
  </div>
{:else}
  <!-- NOT HIS RECORD TO TELL: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew nothing). -->
  <span data-seen-none hidden></span>
{/if}

<style>
  .tell {
    display: grid;
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
    scroll-margin-block: var(--sp-8);
    container-type: inline-size;
  }

  .tell-compose,
  .tell-told {
    display: grid;
    align-content: start;
    min-inline-size: 0;
  }

  /* WHAT HE TOLD, BESIDE THE LINE where the tile is wide enough: the line takes seven parts and the threads five, with no
     rule over them, since the column is their edge. */
  @container (width >= 760px) {
    .tell[data-line] {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: var(--sp-6);
    }

    .tell[data-line] .tell-told :global(.told-head) {
      margin-block-start: 0;
      padding-block-start: 0;
      border-block-start: 0;
    }
  }

  /* THE PHONE'S LINE: the field's fill, its height and its quiet words, as a press. */
  .tell-open {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: var(--tap, 44px);
    padding-inline: var(--sp-3);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: text;
  }

  .tell-open-text {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tell-open[data-said] {
    color: var(--ink);
  }

  .tell-open:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>
