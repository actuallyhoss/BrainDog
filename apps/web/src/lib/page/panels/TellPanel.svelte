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
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Instruct, Instructions, type ControlMark, type ThreadView } from 'braindog-render/svelte';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import { apiBase } from '$lib/at.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { listen } from '../listen.svelte.ts';
  import {
    PICK_FIRST,
    aim,
    composerOf,
    control,
    controlWords,
    instructArgs,
    runsOf,
    sendingOf,
    threadOf,
    threadOrder,
    told,
    undoAll,
    unknownRuns,
    type LiveRun,
    type Chosen,
    type Project,
    type RunKnown,
    type Thread,
  } from '$lib/record/instruct.ts';

  let { owner = false }: { owner?: boolean } = $props();

  /** How many threads are drawn before "Show earlier", and how many more each press shows. */
  const FIRST = 6;
  const STEP = 20;

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let threads = $state.raw<Thread[]>([]);
  let projects = $state.raw<Map<string, Project>>(new Map());
  let known = $state.raw<Map<string, RunKnown>>(new Map());
  let pick = $state<Chosen>({ ...PICK_FIRST });
  let said = $state('');
  let busy = $state(false);
  let fault = $state<string | null>(null);
  let sending = $state.raw<ThreadView | null>(null);
  let undone = $state.raw<Map<string, string>>(new Map());
  let pressing = $state.raw<Set<string>>(new Set());
  let shown = $state(FIRST);
  let now = $state(recordNow());
  let box = $state<{ focus(): void } | undefined>(undefined);
  let here = $state<HTMLElement | undefined>(undefined);

  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);

  async function read(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), io.threads()]);
    now = recordNow();
    if (p.ok) rows = p.value;
    if (t.ok) threads = t.value;
    const seen = new Map([...known, ...runsOf(rows)]);
    const missing = unknownRuns(threads, seen);
    known = missing.length === 0 ? seen : new Map([...seen, ...(await io.runs(missing))]);
    if (projects.size === 0 || rows.some((r) => r.project !== null && !projects.has(r.project))) projects = await io.projects(rows);
  }

  onMount(() => {
    void read();
    const off = [told.on(() => void read()), aim.on((run) => void aimAt(run))];
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
    await tick();
    here?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    box?.focus();
  }

  const composer = $derived(composerOf(pick, rows, projects));
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

  const ordered = $derived(threadOrder(threads));
  const drawn = $derived.by(() => {
    const ctx = { now, runs: known, projects, undone, busy: pressing };
    const list = ordered.slice(0, shown).map((t) => threadOf(t, ctx));
    return sending ? [sending, ...list] : list;
  });
</script>

{#if owner}
  <div class="tell" bind:this={here}>
    <Instruct
      bind:this={box}
      {view}
      bind:said
      {mark}
      onto={(key) => ((pick = { ...pick, to: key, when: null }), (fault = null))}
      onon={(key) => ((pick = { ...pick, on: key, when: null }), (fault = null))}
      onwhen={(w) => (pick = { ...pick, when: w })}
      onsend={() => void send()}
    />
    {#if drawn.length > 0}<h3 class="told-head">What you told agents</h3>{/if}
    <Instructions threads={drawn} {mark} more={Math.max(0, ordered.length - shown)} ontakeback={(k) => void takeBack(k)} onundo={(k) => void undo(k)} onmore={() => (shown += STEP)} />
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
  }
</style>
