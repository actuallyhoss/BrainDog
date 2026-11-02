<!--
  What one agent run did, under a section that declares `panel: run` on the run's own page (the run docked
  beside the runs board): every change it made that is still there, in plain lines, and Undo this run.

  READ FROM THE PLAN UNDO WOULD PUT BACK (`undo-write.ts` `undoPlan`, dry): the record's own list of the run's changes in
  names, which is exactly what Undo this run would touch, so the lines above the press never promise more than it does.
  Said the other way round, as what the run did (`run-lines.ts`).

  UNDO THIS RUN ASKS ONCE, IN WORDS: how many changes go back and how many are left alone because somebody changed them
  since, then Put back sends the plan that was read, by its hash, so a write that slipped in between is never undone
  blind. The record's sentence is the receipt; the page is read again and the plan with it.

  THE RUN AS A CONVERSATION, TOP TO BOTTOM (`run-talk.ts`): who it was and where it worked; its
  stretches; what it said it is doing; what it changed, with Undo; what it asked; its dead ends; the step it left and
  what became of it; its helpers; the run whose step it took. A part with nothing true to say is not drawn, heading and
  all, so a run that only started says who and when.

  WHAT THE RUN LEFT: the next step it handed on, when, and what became of it ("Taken by Claude Code, 2h
  later"), read off the run's own row (`api.ts` `stepLeft`). A step nobody has taken yet can be closed here, with a
  reason, through the record's `handoff` `drop`.

  WHAT HE TOLD IT, AND HIS WAY TO TELL IT, PAUSE IT OR STOP IT (agents and MCP plan §7.1): while the run is open, its
  live row first (where it is, how long, when it was last heard, and what can stop it: its hooks at its next tool call,
  or only its next BrainDog call), with Tell, Pause and Stop; then every instruction it was sent, saw or took, with its
  state, its reply and Undo all on what it changed. The record answers both only to the owner, so nobody else sees
  either. Worded by `$lib/record/instruct.ts`, drawn by braindog-render's control room parts.

  A LIST WITHOUT A BOX under the section's own heading ("What it did"), each part under a 13px line of its own once the
  run's row is read (what it changed says "What it changed" then, and nothing before), and no red:
  putting a run back is a choice, not an alarm. A HOST PANEL (`panel-of.ts`), drawn by `BlockSlot.svelte` only on a page
  drawn for a run, and imported by it alone.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { runWho, stepLeft, type StepLeft } from '$lib/record/api.ts';
  import { undoApply, undoPlan, type UndoPlan } from '$lib/record/undo-write.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { runLines, runWords } from './run-lines.ts';
  import { readRunParts, runTalk, type RunParts, type RunRow, type TalkKey } from './run-talk.ts';
  import { PRESENCE_WORDS, presenceSaid } from '$lib/ui/presence-words.ts';
  import { Instruct, Instructions, Presence, type ControlMark } from 'braindog-render/svelte';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { composerOf, control, controlWords, instructArgs, presenceOf, runsOf, threadOf, threadOrder, told, undoAll, unknownRuns, type LiveRun, type Project, type RunKnown, type Thread } from '$lib/record/instruct.ts';

  let {
    run,
    title,
    onchanged = null,
  }: {
    /** The run's handle (`S42`), which the record puts back by; never drawn. */
    run: string;
    /** The run's name as its page is titled, for a screen reader's name of the press. */
    title: string;
    /** Reads the page again once the run is put back, so the rows it changed are drawn as they now are. */
    onchanged?: (() => Promise<void> | void) | null;
  } = $props();

  let from = $state<'reading' | 'ready' | 'refused'>('reading');
  let plan = $state.raw<UndoPlan | null>(null);
  let fix = $state('');
  let confirming = $state(false);
  let busy = $state(false);

  async function load(handle: string) {
    const out = await undoPlan(apiBase(), { run: handle });
    /* A READ FOR A RUN THE PAGE HAS LEFT is not this one's. */
    if (handle !== run) return;
    if (out.from === 'plan') {
      plan = out.plan;
      from = 'ready';
    } else {
      fix = out.fix;
      from = 'refused';
    }
  }

  /* READ AGAIN FOR ANOTHER RUN, and not for each draw of the page. */
  $effect(() => {
    const handle = run;
    untrack(() => {
      from = 'reading';
      confirming = false;
      void load(handle);
    });
  });

  const said = $derived(plan ? runLines(plan.steps) : { lines: [], more: null });
  /** The heading over what it changed, said once the conversation's other parts stand round it. */
  const didSaid = 'What it changed';

  /* ── the step it left ──────────────────────────────────────────────────── */

  let step = $state.raw<StepLeft | null>(null);
  /** Whether its row, and what was said beside it, have been read, landed or not. */
  let rowRead = $state(false);
  let partsRead = $state(false);
  /* THE RUN'S OWN ROW AND WHAT WAS READ BESIDE IT, which the conversation is said from (`run-talk.ts`). */
  let held = $state.raw<RunRow | null>(null);
  let parts = $state.raw<RunParts>({});
  const settled = $derived(from !== 'reading' && rowRead && (held === null || partsRead));
  let beside = false;
  const talk = $derived(held ? runTalk(held, parts) : []);
  /* WHERE THE RUN IS NOW, in the record's six words (`presence-words.ts`), read off its row as it lands: a run that
     finished says Ended, one that handed on a step says Left a step, one carried in by an import says From before. */
  const now = $derived.by(() => {
    if (!held) return null;
    const p = presenceSaid(held.state, held.fields, Date.now());
    /* SAID ONCE: a finished run whose stretch already says "Ended 14:02" is not told Ended twice. */
    const ended = PRESENCE_WORDS.ended;
    if (p === 'ended' && talk.some((s) => s.key === 'stretches' && s.lines.some((l) => l.startsWith(`${ended} `)))) return null;
    return PRESENCE_WORDS[p];
  });
  /** The parts said before what it changed, between that and the step it left, and after the step. */
  const BEFORE: readonly TalkKey[] = ['who', 'stretches', 'doing'];
  const BETWEEN: readonly TalkKey[] = ['asked', 'tried', 'noted'];
  const AFTER: readonly TalkKey[] = ['helpers', 'took'];
  let closing = $state(false);
  let why = $state('');
  let shutting = $state(false);

  const stepSaid = {
    heading: 'Left this next step',
    close: 'Close this step',
    why: 'Why it is no longer needed',
    keep: 'Keep it',
    shut: 'Close it',
    closed: 'Step closed.',
  } as const;

  /** A run's row by its handle, `S42`, as its number, state and fields, or `null` where this reader may not open it. */
  async function runRow(handle: string): Promise<RunRow | null> {
    const seq = Number(/^S([1-9][0-9]*)$/u.exec(handle)?.[1]);
    if (!Number.isInteger(seq)) return null;
    const out = await createClient({ base: apiBase() }).get('session', seq);
    const row = out.ok && typeof out.value === 'object' && out.value !== null ? (out.value as { state?: unknown; fields?: unknown }) : null;
    return row && typeof row.fields === 'object' && row.fields !== null ? { seq, state: row.state, fields: row.fields as Record<string, unknown> } : null;
  }

  async function readStep(handle: string) {
    const row = await runRow(handle).catch(() => null);
    if (handle !== run) return;
    held = row;
    rowRead = true;
    if (!row) return void (step = null);
    /* WHAT IS SAID BESIDE THE ROW is read once for a run, and drawn as it lands: the row's own parts do not wait. */
    if (!beside) {
      beside = true;
      void readRunParts(apiBase(), row)
        .then((read) => {
          if (handle === run) parts = read;
        })
        .catch(() => undefined)
        .finally(() => {
          if (handle === run) partsRead = true;
        });
    }
    /* WHO TOOK IT, BY NAME: the taker's own row, read once, and never its handle. */
    const by = typeof row.fields.taken_by === 'string' ? await runRow(row.fields.taken_by) : null;
    if (handle !== run) return;
    step = stepLeft(row.fields, row.state, Date.now(), by ? runWho(by.fields) : null);
  }

  $effect(() => {
    const handle = run;
    untrack(() => {
      step = null;
      held = null;
      parts = {};
      rowRead = false;
      partsRead = false;
      beside = false;
      closing = false;
      why = '';
      void readStep(handle);
    });
  });

  async function closeStep() {
    const reason = why.trim();
    if (reason === '' || shutting) return;
    shutting = true;
    try {
      const out = await createClient({ base: apiBase() }).call<unknown>('handoff', { drop: run, why: reason });
      if (out.ok) {
        toasts.push(stepSaid.closed, { intent: 'good' });
        closing = false;
        await readStep(run);
      } else toasts.push('refusal' in out ? out.refusal.fix : stepSaid.close, { intent: 'warn' });
    } finally {
      shutting = false;
    }
  }

  /* ── what he told it, and Tell, Pause and Stop while it is open ─────────── */

  const io = control(apiBase());
  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);
  let open = $state.raw<LiveRun[]>([]);
  let toldIt = $state.raw<Thread[] | null>(null);
  let places = $state.raw<Map<string, Project>>(new Map());
  let runsKnown = $state.raw<Map<string, RunKnown>>(new Map());
  let telling = $state(false);
  let tellSaid = $state('');
  let tellBusy = $state(false);
  let tellFault = $state<string | null>(null);
  let holding = $state(false);
  let undoneIt = $state.raw<Map<string, string>>(new Map());

  async function readTold(handle: string) {
    const [p, t] = await Promise.all([io.presence(), io.threads(20, handle)]);
    if (handle !== run) return;
    open = p.ok ? p.value : [];
    /* THE RECORD LISTS THREADS TO THE OWNER ALONE: a refusal here is a reader who may not tell, and draws nothing. */
    toldIt = t.ok ? t.value : null;
    const seen = runsOf(open);
    const missing = toldIt ? unknownRuns(toldIt, seen) : [];
    runsKnown = missing.length === 0 ? seen : new Map([...seen, ...(await io.runs(missing))]);
    if (places.size === 0 && open.some((r) => r.run === handle)) places = await io.projects(open);
  }

  $effect(() => {
    const handle = run;
    untrack(() => {
      toldIt = null;
      telling = false;
      tellSaid = '';
      tellFault = null;
      void readTold(handle);
    });
  });

  onMount(() => {
    const off = told.on(() => void readTold(run));
    /* THE LIVE LINE ("heard 10 s ago") IS A CLOCK, and a pulse moves no version, so it is read again every fifteen seconds. */
    const clock = setInterval(() => void readTold(run), 15_000);
    return () => {
      off();
      clearInterval(clock);
    };
  });

  /* A RUN GONE QUIET IS STILL OPEN, so it keeps its live row, with how long it has been quiet and Tell and Stop beside it
     (audit 6g, AG10); only an ended run has none. The record's `presence` lists the runs present now, so a quiet one is
     read off its own row: what a person sees of it is the same row, said as quiet. */
  const quiet = $derived.by((): LiveRun | null => {
    if (!held || presenceSaid(held.state, held.fields, Date.now()) !== 'quiet') return null;
    const f = held.fields;
    const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    const heard = Date.parse(t(f.pulse_at) ?? t(f.last_seen) ?? '');
    return {
      run,
      name: t(f.doing),
      agent: t(f.agent),
      machine: t(f.host),
      seat: t(f.seat),
      project: t(f.project),
      repo: t(f.repo),
      worktree: t(f.worktree),
      branch: t(f.branch),
      doing: t(f.doing),
      state: 'gone',
      instruction: null,
      task: null,
      stopped: f.stopped === 'stop' || f.stopped === 'pause' ? f.stopped : null,
      helpers: [],
      parent: t(f.parent),
      for_s: 0,
      heard_s: Number.isFinite(heard) ? Math.max(0, Math.round((recordNow() - heard) / 1000)) : 0,
      reach: 'next_call',
    };
  });
  const me = $derived(open.find((r) => r.run === run && r.state !== 'ended') ?? quiet);
  const meRow = $derived(me ? { ...presenceOf(me, open, places, toldIt ?? []), href: null, busy: holding } : null);
  const tellView = $derived.by(() => {
    /* A QUIET RUN IS TOLD AS ITSELF, read when it next checks in: the composer's runs are the ones present now, so it is
       handed this one as waiting, or Tell would have gone to anybody. */
    const rows = me !== null && me.state === 'gone' ? [...open.filter((r) => r.run !== run), { ...me, state: 'waiting' as const }] : open;
    const c = composerOf({ to: `run:${run}`, on: '', when: null }, rows, places);
    return { ...c, to: c.to.filter((x) => x.key === c.toKey), busy: tellBusy, fault: tellFault };
  });
  const toldViews = $derived(toldIt ? threadOrder(toldIt).map((t) => threadOf(t, { now: recordNow(), runs: runsKnown, projects: places, undone: undoneIt })) : []);

  async function hold(kind: 'stop' | 'pause' | 'resume', why: string) {
    holding = true;
    try {
      const out = await io.hold(run, kind, why);
      if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    } finally {
      holding = false;
    }
    told.say();
  }

  async function sendTell() {
    if (tellBusy) return;
    const words = tellSaid;
    if (words.trim() === '') return void (tellFault = controlWords.empty);
    tellBusy = true;
    tellFault = null;
    try {
      const out = await io.send(instructArgs(tellView, words));
      if (out.ok) {
        tellSaid = '';
        telling = false;
      } else tellFault = out.fix;
    } finally {
      tellBusy = false;
    }
    told.say();
  }

  async function takeBackIt(key: string) {
    const out = await io.takeBack(key);
    if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    told.say();
  }

  async function undoIt(key: string) {
    const t = toldIt?.find((x) => x.id === key);
    if (!t?.receipts) return;
    undoneIt = new Map([...undoneIt, [key, await undoAll(apiBase(), t.receipts)]]);
    told.say();
    await load(run);
    await onchanged?.();
  }

  async function putBack() {
    const read = plan;
    if (!read || busy) return;
    busy = true;
    try {
      const out = await undoApply(apiBase(), { run }, read);
      confirming = false;
      if (out.from === 'undone') toasts.push(out.said, { intent: 'good' });
      else toasts.push(out.fix, { intent: 'warn' });
      /* PUT BACK OR MOVED MEANWHILE, the plan is read again: what is left, or what moved. */
      await load(run);
      if (out.from === 'undone') await onchanged?.();
    } finally {
      busy = false;
    }
  }
</script>

{#snippet spoken(keys: readonly TalkKey[])}
  {#each talk.filter((t) => keys.includes(t.key)) as part (part.key)}
    <div class="run-part" role="group" aria-label={part.heading}>
      <h3 class="run-meta run-head">{part.heading}</h3>
      {#if part.lines.length === 1}
        <p class="run-next">{part.lines[0]}</p>
      {:else}
        <ul class="run-lines">
          {#each part.lines as line}<li class="run-line">{line}</li>{/each}
        </ul>
      {/if}
    </div>
  {/each}
{/snippet}

<section class="run" aria-label={runWords.heading} aria-busy={!settled}>
  <!-- THE BARS WHILE ANY OF ITS THREE READS IS OUT, A PART OF THEIR OWN, given back whole when they have all landed: drawn
       in What it changed, that part stayed while its row, its plan and what was said beside it landed over it one by
       one and pushed it down (0.02 to 0.03 on a cold open). -->
  {#if !settled}
  <div class="run-part"><Waiting rows={3} /></div>
  {:else}
  <!-- AN OPEN RUN SAYS WHERE IT IS ON ITS LIVE ROW, from the record's clock, so the word is not said twice. -->
  {#if now && !(meRow && toldIt)}<p class="run-now">{now}</p>{/if}
  {#if meRow && toldIt}
    <div class="run-part run-live" role="group" aria-label="Open now">
      <Presence
        rows={[meRow]}
        {mark}
        ontell={() => (telling = !telling)}
        onstop={(_key, kind, why) => void hold(kind, why)}
        onresume={() => void hold('resume', '')}
      />
      {#if telling}
        <Instruct view={tellView} bind:said={tellSaid} {mark} onto={() => {}} onon={() => {}} onwhen={() => {}} onsend={() => void sendTell()} />
      {/if}
    </div>
  {/if}
  {#if toldViews.length > 0}
    <div class="run-part" role="group" aria-label="What you told it">
      <h3 class="run-meta run-head">What you told it</h3>
      <Instructions threads={toldViews} {mark} ontakeback={(k) => void takeBackIt(k)} onundo={(k) => void undoIt(k)} />
    </div>
  {/if}
  {@render spoken(BEFORE)}
  <div class="run-part" role="group" aria-label={didSaid}>
    {#if talk.length > 0}<h3 class="run-meta run-head">{didSaid}</h3>{/if}
    {#if from === 'refused'}
      <p class="run-said" role="status">{fix}</p>
    {:else if plan && plan.steps.length === 0}
      <p class="run-said">{runWords.nothing}</p>
    {:else if plan}
      <ul class="run-lines">
        {#each said.lines as line}<li class="run-line">{line}</li>{/each}
      </ul>
      {#if said.more}<p class="run-said">{said.more}</p>{/if}
      <div class="run-do" role="group" aria-label={runWords.undo}>
        {#if confirming}
          <p class="run-sure" role="status">{runWords.sure(plan.steps.length, plan.skipped.length)}</p>
          <Button size="sm" onclick={() => (confirming = false)}>{runWords.keep}</Button>
          <Button size="sm" weight="primary" disabled={busy} onclick={() => void putBack()}>{runWords.putBack}</Button>
        {:else}
          <Button size="sm" aria-label="{runWords.undo}: {title}" onclick={() => (confirming = true)}>{runWords.undo}</Button>
        {/if}
      </div>
    {/if}
  </div>
  {@render spoken(BETWEEN)}
  {#if step}
    <div class="run-part run-step" role="group" aria-label={stepSaid.heading}>
      <p class="run-meta">{step.left ?? stepSaid.heading}</p>
      <p class="run-next">{step.next}</p>
      {#if step.fate}<p class="run-said" role="status">{step.fate}.</p>{/if}
      {#if step.open}
        {#if closing}
          <form class="run-do" onsubmit={(e) => (e.preventDefault(), void closeStep())}>
            <label class="run-why"
              ><span class="run-meta">{stepSaid.why}</span><input class="run-input" type="text" bind:value={why} autocomplete="off" enterkeyhint="done" /></label
            >
            <Button size="sm" onclick={() => (closing = false)}>{stepSaid.keep}</Button>
            <Button size="sm" weight="primary" type="submit" disabled={shutting || why.trim() === ''}>{stepSaid.shut}</Button>
          </form>
        {:else}
          <div class="run-do"><Button size="sm" onclick={() => (closing = true)}>{stepSaid.close}</Button></div>
        {/if}
      {/if}
    </div>
  {/if}
  {@render spoken(AFTER)}
  {/if}
</section>

<style>
  .run {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding-block-start: var(--sp-2);
  }

  /* ONE PART OF THE CONVERSATION: its heading as a 13px line, then what it says, a hairline between it and the part
     above. The step it left is one of them: when, the step at the body size, then what became of it. */
  .run-part {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  /* THE OPEN RUN'S LIVE ROW AND, WHEN TELL IS PRESSED, THE BOX UNDER IT, a step apart. */
  .run-live {
    gap: var(--sp-3);
  }

  .run-part + .run-part {
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  .run-head {
    font-weight: 500;
  }

  .run-meta {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .run-next {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .run-why {
    display: grid;
    flex: 1 1 100%;
    gap: var(--sp-1);
  }

  /* THE RUN'S WORD, first and at the body size: the one thing a person asks of a run before what it did. */
  .run-now {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 1.55;
  }

  /* A RECTANGLE, as every field is: radius 8, the field's flat fill, no border of its own. */
  .run-input {
    min-block-size: 36px;
    padding-inline: var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .run-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE CHANGE A LINE, at the body size and its line height, a hairline between, as the page's other lists. */
  .run-line {
    padding-block: var(--sp-2);
    border-block-start: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .run-line:first-child {
    border-block-start: 0;
  }

  .run-said {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 1.55;
  }

  .run-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
  }

  /* THE CONFIRM'S SENTENCE takes its own line, so the two presses under it never squeeze it on a phone. */
  .run-sure {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
  }
</style>
