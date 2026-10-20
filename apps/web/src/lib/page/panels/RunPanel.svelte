<!--
  What one agent run did, under a section that declares `panel: run` on the run's own page (DIRECTION §37, the run docked
  beside the runs board): every change it made that is still there, in plain lines, and Undo this run.

  READ FROM THE PLAN UNDO WOULD PUT BACK (`undo-write.ts` `undoPlan`, dry): the record's own list of the run's changes in
  names, which is exactly what Undo this run would touch, so the lines above the press never promise more than it does.
  Said the other way round, as what the run did (`run-lines.ts`).

  UNDO THIS RUN ASKS ONCE, IN WORDS: how many changes go back and how many are left alone because somebody changed them
  since, then Put back sends the plan that was read, by its hash, so a write that slipped in between is never undone
  blind. The record's sentence is the receipt; the page is read again and the plan with it.

  THE RUN AS A CONVERSATION, TOP TO BOTTOM (AGT-C12 build 5, `run-talk.ts`): who it was and where it worked; its
  stretches; what it said it is doing; what it changed, with Undo; what it asked; its dead ends; the step it left and
  what became of it; its helpers; the run whose step it took. A part with nothing true to say is not drawn, heading and
  all, so a run that only started says who and when.

  WHAT THE RUN LEFT (AGT-C05): the next step it handed on, when, and what became of it ("Taken by Claude Code, 2h
  later"), read off the run's own row (`api.ts` `stepLeft`). A step nobody has taken yet can be closed here, with a
  reason, through the record's `handoff` `drop`.

  A LIST WITHOUT A BOX under the section's own heading ("What it did"), each part under a 13px line of its own once the
  run's row is read (what it changed says "What it changed" then, and nothing before), and no red:
  putting a run back is a choice, not an alarm. A HOST PANEL (`panel-of.ts`), drawn by `BlockSlot.svelte` only on a page
  drawn for a run, and imported by it alone.
-->
<script lang="ts">
  import { untrack } from 'svelte';
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
  /* THE RUN'S OWN ROW AND WHAT WAS READ BESIDE IT, which the conversation is said from (`run-talk.ts`). */
  let held = $state.raw<RunRow | null>(null);
  let parts = $state.raw<RunParts>({});
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
    const row = await runRow(handle);
    if (handle !== run) return;
    held = row;
    if (!row) return void (step = null);
    /* WHAT IS SAID BESIDE THE ROW is read once for a run, and drawn as it lands: the row's own parts do not wait. */
    if (!beside) {
      beside = true;
      void readRunParts(apiBase(), row).then((read) => {
        if (handle === run) parts = read;
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

<section class="run" aria-label={runWords.heading} aria-busy={from === 'reading'}>
  {#if now}<p class="run-now">{now}</p>{/if}
  {@render spoken(BEFORE)}
  <div class="run-part" role="group" aria-label={didSaid}>
    {#if talk.length > 0}<h3 class="run-meta run-head">{didSaid}</h3>{/if}
    {#if from === 'reading'}
      <Waiting rows={3} />
    {:else if from === 'refused'}
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

  /* A RECTANGLE, as every field is (DIRECTION §39): radius 8, the field's flat fill, no border of its own. */
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
