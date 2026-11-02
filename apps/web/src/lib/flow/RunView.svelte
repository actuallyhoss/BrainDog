<!--
  One run, drawn on the automation's own canvas: every step of the version it ran under, each painted with how it went
  and what it handed back, and Run it again for a run that has finished.

  THE VERSION IT RAN UNDER, NOT THE ONE ON THE PAGE. A run is pinned to its version for its life, and the runner numbers
  its steps by their place in that version's plan (`packages/kernel/src/flow.ts` `plan`), so step 3 of an older run is
  a different card once the steps were moved. The page hands in that version's body when it has it; without one the
  steps are listed by their verbs, as the Runs tab listed them before.

  A STEP THE RUN NEVER REACHED IS STILL DRAWN, hollow and said as not reached, because a failed run that stopped at step
  two is read from what it did not do as much as from what it did.
-->
<script lang="ts">
  import { since } from 'braindog-render';
  import Button from '$lib/ui/Button.svelte';
  import { VERB_LABELS, draftOf, sayStep, words, type Body, type Node, type Verb } from './flow.ts';
  import { durationOf, editWords, pathsOf, planPlaces, stepAnswer, type RunRow, type RunStep } from './source.ts';
  import { plainFail } from './plain-fail.ts';

  let {
    run,
    rule,
    body,
    now,
    retrying = false,
    onretry,
  }: {
    run: RunRow;
    /** The bare id of the automation, which a body's draft is opened under. */
    rule: string;
    /** The body of the version the run started under, or `null` when the page does not have it. */
    body: Body | null;
    now: number;
    retrying?: boolean;
    /** Start it again. Offered only once the run has finished. */
    onretry?: (() => void) | undefined;
  } = $props();

  /** A step's state in words: the runner's four, and not reached for a place with no step row. */
  const STEP_WORD: Record<RunStep['state'], string> = { done: 'Done', waiting: 'Waiting', failed: 'Failed', skipped: 'Not reached' };
  /** Past this many characters an answer folds under a disclosure, so one long reply does not bury the steps after it. */
  const FOLD = 140;

  const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
  const verbWord = (kind: string): string => (Object.hasOwn(VERB_LABELS, kind) ? VERB_LABELS[kind as Verb] : kind);

  const finished = $derived(run.state === 'done' || run.state === 'failed' || run.state === 'cancelled');
  const took = $derived(durationOf(run));
  const said = $derived(plainFail(run.say));
  const started = $derived(run.trigger !== null && Object.hasOwn(editWords.startedBy, run.trigger) ? editWords.startedBy[run.trigger] : null);

  /** The canvas of the version it ran under, and each card's step row, found by its place in the plan. */
  const canvas = $derived.by(() => {
    if (body === null) return null;
    const nodes = draftOf(rule, body).steps;
    const places = planPlaces(body);
    const byPlace = new Map<string, RunStep>();
    for (const s of run.steps) {
      const place = places[s.n];
      if (place !== undefined && place !== '') byPlace.set(place, s);
    }
    const paths = pathsOf(nodes, Array.isArray(body.steps) ? 'steps' : 'then');
    const stepOf = (key: string): RunStep | null => {
      const place = paths.get(key);
      return place === undefined ? null : (byPlace.get(place) ?? null);
    };
    return { nodes, stepOf };
  });
</script>

{#snippet answerOf(verb: string, answer: string | null)}
  {@const said = stepAnswer(verb, answer)}
  {#if said !== null && said.length > FOLD}
    <details class="rv-fold">
      <summary class="rv-summary tap">{editWords.handedBack}</summary>
      <p class="rv-answer">{said}</p>
    </details>
  {:else if said !== null}
    <span class="rv-answer">{said}</span>
  {/if}
{/snippet}

{#snippet tree(list: readonly Node[], stepOf: (key: string) => RunStep | null)}
  <ol class="rv-list">
    {#each list as node (node.key)}
      {@const s = stepOf(node.key)}
      <li class="rv-card" data-state={s?.state ?? 'unreached'}>
        <p class="rv-said">{sayStep(node.step)}</p>
        <p class="rv-state">
          <span class="rv-dot" data-state={s?.state ?? 'unreached'} aria-hidden="true"></span>
          <span class="rv-word">{s ? STEP_WORD[s.state] : editWords.notReached}</span>
          {#if s}{@render answerOf(s.kind, s.answer)}{/if}
        </p>
        {#if node.then && node.then.length > 0}
          <p class="rv-arm">{words.then}</p>
          {@render tree(node.then, stepOf)}
        {/if}
        {#if node.else && node.else.length > 0}
          <p class="rv-arm">{words.otherwise}</p>
          {@render tree(node.else, stepOf)}
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

<div class="rv">
  <p class="rv-head">
    <span class="rv-dot" data-state={run.state} aria-hidden="true"></span>
    <span class="rv-word">{cap(words.runState[run.state] ?? run.state)}</span>
    <span class="rv-meta">{since(run.started, now)}</span>
    {#if took !== null}<span class="rv-meta">{editWords.took(took)}</span>{/if}
    {#if started}<span class="rv-meta">{started}</span>{/if}
  </p>
  <!-- THE REASON IN PLAIN WORDS (L46), and the record's own words one press under it when they were said again. -->
  {#if said}
    <p class="rv-say">{said.plain}</p>
    {#if said.plain !== said.raw}
      <details class="rv-raw"><summary>As written</summary><p>{said.raw}</p></details>
    {/if}
  {/if}

  {#if canvas}
    {@render tree(canvas.nodes, canvas.stepOf)}
  {:else if run.steps.length > 0}
    <ol class="rv-list">
      {#each run.steps as s (s.n)}
        <li class="rv-card" data-state={s.state}>
          <p class="rv-said">{verbWord(s.kind)}</p>
          <p class="rv-state">
            <span class="rv-dot" data-state={s.state} aria-hidden="true"></span>
            <span class="rv-word">{STEP_WORD[s.state]}</span>
            {@render answerOf(s.kind, s.answer)}
          </p>
        </li>
      {/each}
    </ol>
  {/if}

  {#if finished && onretry}
    <div class="rv-actions">
      <Button disabled={retrying} onclick={() => onretry?.()}>{editWords.retry}</Button>
    </div>
  {/if}
</div>

<style>
  .rv {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* A FULL-SCREEN SHEET ON A PHONE: the sheet is content-sized, so the run's detail asks
     for the height itself, and a short run still reads as a page of its own rather than a strip over the list. */
  @media (width < 640px) {
    .rv {
      min-block-size: 80dvh;
    }
  }

  .rv-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .rv-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .rv-raw {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
  .rv-raw summary {
    cursor: pointer;
    width: fit-content;
    color: var(--ink-2);
  }
  .rv-raw p {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
  }
  .rv-say {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .rv-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A BRANCH'S ARMS SIT UNDER IT, indented by a line, as the canvas draws them. */
  .rv-list .rv-list {
    margin-block-start: var(--sp-1);
    padding-inline-start: var(--sp-3);
    border-inline-start: 1px solid var(--rule);
  }

  /* A STEP OF THE RUN, INSIDE THE SHEET: the sheet is a tile's surface and a tile never holds a tile, so a step is the
     surface's inner fill at the field's corner, with no border. */
  .rv-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  /* NOT REACHED IS HOLLOW: no fill, and a hairline ring where the fill would be. */
  .rv-card[data-state='unreached'] {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .rv-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .rv-state {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .rv-word {
    color: var(--ink);
  }

  .rv-answer {
    margin: 0;
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .rv-fold {
    inline-size: 100%;
  }

  .rv-summary {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink-2);
    cursor: pointer;
  }

  .rv-arm {
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* A STATE IS A 6PX DOT AND ITS WORD, each in its meaning: going now `--live`, done green, parked on a
     person amber, failed red, stopped the quiet ink, and a step never reached a hollow ring. */
  .rv-dot {
    display: inline-block;
    flex: none;
    box-sizing: border-box;
    inline-size: var(--dot);
    block-size: var(--dot);
    border-radius: var(--r-ctl);
    background: var(--ink-3);
  }

  .rv-dot[data-state='pending'],
  .rv-dot[data-state='running'] {
    background: var(--live);
  }

  .rv-dot[data-state='done'] {
    background: var(--good);
  }

  .rv-dot[data-state='waiting'] {
    background: var(--warn-fill);
  }

  .rv-dot[data-state='failed'] {
    background: var(--red);
  }

  .rv-dot[data-state='skipped'],
  .rv-dot[data-state='unreached'] {
    background: transparent;
    border: 1.5px solid var(--ink-3);
  }

  .rv-actions {
    display: flex;
    gap: var(--sp-2);
  }
</style>
