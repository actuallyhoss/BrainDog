<!--
  One automation on the canvas: `/automations/<id>`, and `/automations/new` for a new one (§6, Brief E).

  THE TRIGGER CARD ON TOP, THEN THE STEPS IN A COLUMN, and a branch's two arms as two columns under it. That is the
  whole geometry: nothing has an x or a y, so every drag, key and menu entry is a move between lists (`lib/flow`).

  ONE DRAFT, SENT ONCE, AS AN AGENT WOULD SEND IT. "Send to Decide" files a `change` to `rule.<id>` through `propose`
  with the whole body and the version it was opened at (`flow.ts` `proposalOf`), the proposal `packages/mcp` documents
  for an agent. Nothing here writes a declaration: the owner's press on Decide installs it, with the calls it makes
  shown there once, and a canvas edit and an agent's edit are the same thing to review.

  WHAT IS WRONG IS SAID BEFORE THE BUTTON, on the card it is about, in the lint's terms (`faultsOf`); the record checks
  again when it is filed and its word is final.

  TRY IT BEFORE SENDING IT. "Try it" hands the drawn body to the record's own `dryRun`, which writes nothing, and draws
  the answer under the column (`Tried.svelte`): how many rows an inline rule matches now, or a run's steps as the record
  says them. Before it, the only way to see whether a condition caught anything was to send it and wait.

  RUNS, AND "AS WRITTEN". Runs lists the record's own runs with each step's outcome and a failed run's sentence, and a
  run that has not finished can be stopped. As written is the declaration itself, one click away and never the only
  way to see it (21 §3.1's text lens).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { since } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { NOW } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/data.ts';
  import { compile, explain } from '$lib/record/where.ts';
  import { openActions, type ActionRow, type CallOut } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { covered } from '$lib/a11y/keys.svelte.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import FlowList from '$lib/flow/FlowList.svelte';
  import Inspector from '$lib/flow/Inspector.svelte';
  import Tried from '$lib/flow/Tried.svelte';
  import { FlowDraft } from '$lib/flow/flow.svelte.ts';
  import { ROOT, VERB_LABELS, callsIn, freshId, sayStart, words, type Verb } from '$lib/flow/flow.ts';
  import { answerWords, openAutomations, type Answer, type AutomationRow, type Source, type Tried as TriedAnswer } from '$lib/flow/source.ts';

  const flow = new FlowDraft({ spark: page.data.spark === true });

  /* THE WORDS THIS PAGE ADDS, kept here while `flow.ts` is another brief's file; they can move into `words` there. */
  const say = {
    rename: 'Rename',
    tryIt: 'Try it',
    trying: 'Trying',
    start: 'Pick what starts it and add a step, then send it to Decide.',
  };
  const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
  /* A RUN'S STEP IS KEPT BY ITS VERB, `ask_person`, and printed raw it was the runner's word on the owner's screen. */
  const verbWord = (kind: string): string => (Object.hasOwn(VERB_LABELS, kind) ? VERB_LABELS[kind as Verb] : kind);

  let from = $state<'reading' | 'ready' | 'missing' | 'refused'>('reading');
  let source = $state<Source | null>(null);
  let row = $state<AutomationRow | null>(null);
  let taken = $state<string[]>([]);
  let fix = $state('');
  let tab = $state<'steps' | 'runs' | 'written'>('steps');
  let busy = $state(false);
  let filed = $state<{ id: string | null } | null>(null);
  let refusal = $state('');
  /** The last Try it, and the body it was asked about, so an edit after it hides an answer about a flow that is gone. */
  let tried = $state<{ body: string; answer: Answer<TriedAnswer> } | null>(null);
  let trying = $state(false);
  /** What a new draft looked like when it opened, so the page can tell a draft nobody has touched from one being drawn. */
  let startedAs = $state('');

  const id = $derived(String(page.params.id ?? ''));
  const fresh = $derived(id === 'new');

  async function load(want: string) {
    const at = opened();
    const out = await openAutomations((url, init) => fetch(url, init), apiBase(), () => NOW);
    source = out.source;
    const rows = out.first.ok ? out.first.value : [];
    taken = rows.map((r) => r.id);
    closed(out.first.ok || out.absent, at);
    if (!out.first.ok && !out.absent) {
      fix = out.first.refusal.fix;
      from = 'refused';
      return;
    }
    filed = null;
    refusal = '';
    tried = null;
    startedAs = '';
    if (want === 'new') {
      row = null;
      flow.open('automation', null, null);
      startedAs = JSON.stringify(flow.body);
      from = 'ready';
      return;
    }
    /* THE LIST CARRIES NO BODY, so the one is asked for by its id. A record without the read cannot open one it has, and
       says so the same way as an id it does not have. */
    const one = out.absent ? null : await out.source.automation(want);
    row = one?.ok ? one.value : null;
    if (!row || !row.body) {
      from = 'missing';
      return;
    }
    flow.open(row.id, row.body, row.version);
    from = 'ready';
  }

  async function readDeclared() {
    const out = await openActions((url, init) => fetch(url, init), apiBase(), () => NOW);
    declared = out.first.ok ? out.first.value : [];
  }

  $effect(() => {
    const want = id;
    untrack(() => void load(want));
  });
  $effect(() => {
    untrack(() => void readDeclared());
  });
  $effect(() => {
    if (from === 'ready') drew('ready');
  });

  const sample = $derived(source?.sample ?? false);
  const now = $derived(sample ? NOW : Date.now());
  const faults = $derived(flow.faults);
  const drawn = $derived(JSON.stringify(flow.body));
  /**
   * A NEW DRAFT NOBODY HAS TOUCHED SAYS NOTHING IS WRONG WITH IT. It has no steps, so the lint says "An automation does at
   * least one step." before anything has been drawn, and the page drew that twice, under the trigger and in the footer,
   * as the first thing a stranger read at `/automations/new` (`loop/research-canvas-ux.md` 1.2).
   *
   * NOT `flow.dirty`, WHICH THE BRIEF NAMED AND WHICH IS NEVER FALSE HERE. `FlowDraft.open` sets what `dirty` compares
   * against to '' for a new draft ("A new one is always dirty", `flow.svelte.ts`), so `!flow.dirty` would have hidden
   * nothing. The page keeps the blank body it opened and compares against that instead. The button still reads
   * `faults`, so nothing that could not be sent becomes sendable.
   */
  const untouched = $derived(fresh && startedAs !== '' && drawn === startedAs);
  const shown = $derived(untouched ? [] : faults);
  const general = $derived(shown.filter((f) => f.key === null));
  const triedNow = $derived(tried !== null && tried.body === drawn ? tried.answer : null);
  const title = $derived(flow.draft.name.trim() || (fresh ? words.newOne : flow.draft.id));
  const manual = $derived('manual' in flow.draft.trigger);

  /**
   * THE CALLS IT MAKES, AS DECIDE WILL LIST THEM, drawn from the record's own `actions` read: the host and the key are on
   * each declared call and were approved when it was installed, so the canvas prints them from there and never from
   * anything typed here. A call the read does not list is left out rather than drawn with a host nobody declared; the
   * record works out its own egress lines when the change is filed (`govern.ts`), and those are the ones approved.
   */
  let declared = $state<ActionRow[]>([]);
  const calls = $derived(
    callsIn(flow.draft.steps).flatMap((name): CallOut[] => {
      const a = declared.find((d) => d.ingest === name);
      return a ? [{ ingest: name, channel: a.channel, host: a.host, every: a.channel === 'call' ? '' : a.every, key: a.key, sends: null, trigger: 'rule', perDay: 100 }] : [];
    }),
  );

  /* THE SAMPLE ONLY, for `Inspector.svelte`'s reason: `where.ts` compiles against the sample record's lists. */
  const fieldsOf = (register: string): string[] => (sample ? (REGISTERS[register]?.fields.map((f) => f.id) ?? []) : []);
  const check = $derived(sample ? (register: string, when: string) => (REGISTERS[register] ? explain(compile(register, when)) : []) : undefined);

  async function send() {
    if (!source || busy || faults.length > 0) return;
    if (fresh) flow.draft = { ...flow.draft, id: freshId(flow.draft.name, taken) };
    busy = true;
    refusal = '';
    const out = await source.propose(flow.proposal());
    busy = false;
    if (!out.ok) {
      refusal = out.refusal.fix;
      return;
    }
    filed = out.value;
    flow.sent();
    toasts.push(source.sample ? words.notFiled : words.filed, source.sample ? { intent: 'warn' } : {});
  }

  /** The record's own dry run of what is drawn now. It writes nothing, so it needs no fault-free body and no Decide. */
  async function tryIt() {
    if (!source || trying) return;
    const body = flow.body;
    const asked = JSON.stringify(body);
    trying = true;
    const answer = await source.dryRun(body);
    trying = false;
    tried = { body: asked, answer };
  }

  async function runNow() {
    if (!source || !row) return;
    const out = await source.run(row.id);
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    toasts.push(words.ran);
    await reread();
  }

  async function stop(run: string) {
    if (!source) return;
    const out = await source.cancel(run);
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    toasts.push(words.cancelled);
    await reread();
  }

  /** The runs again, without reopening the draft: a run started or stopped must not throw away what is being drawn. */
  async function reread() {
    if (!source || !row) return;
    const out = await source.automation(row.id);
    if (out.ok) row = out.value;
  }

  /* ESCAPE DROPS A DRAG WHERE IT STARTED, and only when nothing is over the page: with the inspector open, Escape is
     the sheet's, and it closes one layer per press (`Sheet.svelte`). */
  function onkeydown(e: KeyboardEvent) {
    if (covered()) return;
    if (e.key === 'Escape' && flow.dragging !== null) {
      e.preventDefault();
      flow.cancelDrag();
    }
  }
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>
<svelte:window {onkeydown} />

{#if from === 'refused'}
  <div class="page"><Empty kind="error" heading title={fix} /></div>
{:else if from === 'missing'}
  <div class="page">
    <Empty kind="no-results" heading title={`There is no automation called ${id}.`}>
      {#snippet actions()}<Button href="/automations">{words.heading}</Button>{/snippet}
    </Empty>
  </div>
{:else if from === 'ready'}
  <!-- RENAME OPENS THE TRIGGER'S SHEET, WHOSE FIRST FIELD IS THE NAME, and `Sheet.svelte` puts the caret in the first
       field it holds. A stranger clicked the title and nothing happened; the name was only reachable by opening the
       trigger card, which nothing on it says (`loop/research-canvas-ux.md` 1.13). -->
  <PageHead icon="refresh" kicker={words.heading} {title}>
    {#snippet actions()}<Button onclick={() => flow.select('trigger')}>{say.rename}</Button>{/snippet}
  </PageHead>
  <div class="page">
    {#if sample}<p class="note">{words.sample}</p>{/if}

    <div class="segmented tabs" role="group" aria-label={title}>
      <button type="button" class="segment" aria-pressed={tab === 'steps'} data-on={tab === 'steps' ? '' : undefined} onclick={() => (tab = 'steps')}>{words.steps}</button>
      {#if row}
        <button type="button" class="segment" aria-pressed={tab === 'runs'} data-on={tab === 'runs' ? '' : undefined} onclick={() => (tab = 'runs')}>{words.runs}</button>
      {/if}
      <button type="button" class="segment" aria-pressed={tab === 'written'} data-on={tab === 'written' ? '' : undefined} onclick={() => (tab = 'written')}>{words.written}</button>
    </div>

    {#if tab === 'steps'}
      <div class="canvas">
        <button type="button" class="trigger tap" data-selected={flow.selected === 'trigger' ? '' : undefined} onclick={() => flow.select('trigger')}>
          <span class="trigger-kicker">{words.trigger}</span>
          <span class="trigger-said">{sayStart(flow.draft)}</span>
          <span class="trigger-path">{flow.path === 'inline' ? words.inline : words.asRun}</span>
        </button>
        {#each general as f (f.say)}<p class="fault">{f.say}</p>{/each}
        <FlowList {flow} list={ROOT} nodes={flow.draft.steps} faults={shown} />
      </div>

      {#if triedNow}<Tried tried={triedNow} />{/if}

      {#if calls.length > 0}
        <dl class="calls"><CallsOut {calls} hosted={false} /></dl>
      {/if}

      <div class="bar">
        <!-- SENT SAYS SO ONLY UNTIL THE NEXT EDIT. Kept after one, the footer read "Sent to Decide" over a draft that was
             not, and hid the fault line that said why the button had gone grey. -->
        {#if filed && !flow.dirty}
          <p class="said" role="status">
            {sample ? words.notFiled : words.filed}
            {#if filed.id}<a class="tap" href={at(`/decide/${filed.id}`)}>{words.openDecide}</a>{/if}
          </p>
        {:else if refusal}
          <p class="said" data-intent="warn" role="status">{refusal}</p>
        {:else if untouched}
          <p class="said">{say.start}</p>
        {:else if faults.length > 0}
          <p class="said">{words.faults}: {faults.length === 1 ? faults[0]!.say : `${faults.length} things, each on its card.`}</p>
        {:else if !flow.dirty}
          <p class="said">{words.nothingChanged}</p>
        {/if}
        <div class="bar-actions">
          <Button disabled={!flow.canUndo} onclick={() => flow.undo()}>Undo</Button>
          <Button disabled={trying} onclick={() => void tryIt()}>{trying ? say.trying : say.tryIt}</Button>
          {#if manual && row && !flow.dirty}
            <Button onclick={() => void runNow()}><Icon name="play" size="s" />{words.runNow}</Button>
          {/if}
          <Button weight="primary" disabled={busy || faults.length > 0 || !flow.dirty} onclick={() => void send()}>{busy ? words.saving : words.save}</Button>
        </div>
      </div>
    {:else if tab === 'runs' && row}
      {#if row.runs.length === 0}
        <Empty kind="no-data-yet" compact title={words.noRuns} />
      {:else}
        <ol class="runs">
          {#each row.runs as r (r.id)}
            <!-- STATE FIRST, WITH ITS DOT, AND THE ID LAST (DESIGN-SYSTEM 4.4). The id led in the identifier face and a failed
                 run differed from a finished one by one lower-case word, with `data-state` on the row and nothing styling
                 it (`loop/research-canvas-ux.md` 1.12). -->
            <li class="run">
              <p class="run-head">
                <span class="dot" data-state={r.state} aria-hidden="true"></span>
                <span>{cap(words.runState[r.state] ?? r.state)}, {since(r.started, now)}</span>
                <span class="run-id">{r.id}</span>
                {#if r.state === 'pending' || r.state === 'running' || r.state === 'waiting'}
                  <Button weight="bare" onclick={() => void stop(r.id)}>{words.cancel}</Button>
                {/if}
              </p>
              {#if r.say}<p class="run-say">{r.say}</p>{/if}
              {#if r.steps.length > 0}
                <ol class="run-steps">
                  {#each r.steps as s (s.n)}
                    <li>
                      <span class="run-n num">{s.n + 1}</span>
                      <span class="run-line">
                        <span class="run-kind">{verbWord(s.kind)}</span>
                        <span class="run-state"><span class="dot" data-state={s.state} aria-hidden="true"></span>{words.runState[s.state] ?? s.state}</span>
                        {#if s.answer}<span class="run-answer">{answerWords(s.answer)}</span>{/if}
                      </span>
                    </li>
                  {/each}
                </ol>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    {:else}
      <!-- A SCROLLING BOX A KEYBOARD CAN REACH, for `Sheet.svelte`'s reason: a long body scrolls sideways and down, and
           a box with no focusable node in it cannot be scrolled without a pointer. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="written" tabindex="0">{JSON.stringify(flow.body, null, 2)}</pre>
    {/if}

    <p class="vh" role="status" aria-live="polite">{flow.said}</p>
  </div>

  <Inspector {flow} {fieldsOf} {check} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 960px;
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .tabs {
    align-self: flex-start;
  }

  .canvas {
    display: flex;
    flex-direction: column;
    max-inline-size: 720px;
  }

  .trigger {
    display: grid;
    gap: 2px;
    padding: var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .trigger[data-selected] {
    border-color: var(--accent);
  }

  .trigger-kicker {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .trigger-said {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .trigger-path {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fault {
    margin: var(--sp-2) 0 0;
    padding: var(--sp-1) var(--sp-2);
    background: var(--warn-wash);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .calls {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    max-inline-size: 720px;
    font-size: var(--t-sm);
  }

  /* THE FOOTER STAYS IN REACH ON A LAPTOP. A flow of twenty cards puts the button two screens down, and "Send to
     Decide" is the one thing on the page that does anything outside it.

     AND ON A PHONE IT IS THE END OF THE COLUMN, NOT A LID ON IT. Below 900px the scroller is the shell's `.body`, whose
     scrollport runs to the bottom of the window, and the tab bar is fixed over the last `--tabbar` of it. Sticky at 0,
     this stuck to that edge, under the tab bar: at 390 it is the sentence on one line and the buttons wrapped under it
     (the sentence's 16rem basis and the buttons do not fit 358px together), 12 + 18 + 8 + 44 + 12 = 94px, so an iPhone's
     90px tab bar hid its buttons, and what showed above the tab bar was opaque `--bg` over the arm drawn beneath it,
     "Otherwise" on the sample's "Gold rate". Sticking it above the tab bar instead would still take 94 of the 754px above
     an iPhone's tab bar at 844, over the column, for as long as the column scrolls. In the flow it
     covers nothing, and the column scrolls clear of it by being above it. `canvas-page.test.ts` holds the sticky to
     this query. */
  @media (width >= 900px) {
    .bar {
      position: sticky;
      inset-block-end: 0;
    }
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding: var(--sp-3) 0;
    background: var(--bg);
    border-block-start: 1px solid var(--line);
  }

  .said {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .said[data-intent='warn'] {
    color: var(--ink);
  }

  .bar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .runs,
  .run-steps {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A HAIRLINE BETWEEN RUNS AND NONE ROUND THE LIST (DESIGN-SYSTEM 4.4). */
  .run {
    padding: var(--sp-3) 0;
  }

  .run + .run {
    border-block-start: 1px solid var(--line-soft);
  }

  /* THE ONE COLOURED THING ON A RUN'S LINE, BESIDE THE WORD IT COLOURS (DESIGN-SYSTEM 1.2). Working now takes the accent,
     as progress does (1.3); a finished run is `earn`, a failed one `danger`, one parked on a person `warn`, and one that was
     stopped or skipped is a mark with no intent at all. */
  .dot {
    display: inline-block;
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    border-radius: var(--r-pill);
    background: var(--edge);
  }

  .dot[data-state='pending'],
  .dot[data-state='running'] {
    background: var(--accent);
  }

  .dot[data-state='done'] {
    background: var(--earn-fill);
  }

  .dot[data-state='waiting'] {
    background: var(--warn-fill);
  }

  .dot[data-state='failed'] {
    background: var(--danger-fill);
  }

  .run-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
  }

  .run-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .run-say {
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .run-steps {
    gap: 2px;
    margin-block-start: var(--sp-2);
    padding-inline-start: var(--sp-3);
    border-inline-start: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A NUMBERED SEQUENCE (DESIGN-SYSTEM 4.4): the number in a 3ch column, the step's name first, its answer last. */
  .run-steps li {
    display: grid;
    grid-template-columns: 3ch minmax(0, 1fr);
    gap: var(--sp-2);
  }

  .run-n {
    color: var(--dim);
    text-align: end;
  }

  .run-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    min-inline-size: 0;
  }

  .run-state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
  }

  .run-answer {
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .written {
    margin: 0;
    padding: var(--sp-3);
    overflow: auto;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
