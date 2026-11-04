<!--
  Up next, on the Agents page (`panel: left-steps`): the steps runs left that nobody has taken, from the record's own
  `handoffs.open`, the read a new run is handed its step from, so the page never lists a step the briefing would not
  offer.

  ONE ROW A STEP, THE WHOLE WIDTH, AND A STEP LEFT THREE TIMES IS ONE ROW (the audit's "the same step 3 times"): the step in
  its own words first, then under it the project it was left in as a chip, who left it, when, and how many times. The
  newest three are drawn and the rest are folded under a count, so the tile never grows past what a glance takes in. It
  was a narrow column beside At work, where a step wrapped to six lines and left a hole under the runs.

  TAKE AND DROP, FOR HIM, quiet at the row's end (under the words on a narrow tile). A step is work for a run, and only an
  agent takes one in the record (`handoff` with `take`), so Take hands it on: the composer above takes its words, to
  whoever is next at their next start, for him to send or change (`fill`). Drop closes it, every run that left it, with
  his reason in words (`handoff` with `drop`), and the others on the page read again (`told`).

  A HOST PANEL loaded by `import()` from `BlockSlot.svelte` only. With no step left the tile is left out whole.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { fill, told } from '$lib/record/instruct.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { listen } from '../listen.svelte.ts';
  import { stepSaid, stepsOf, type Step } from './steps.ts';
  import { readQuestionWords, refsParts } from './run-talk.ts';

  let { owner = false }: { owner?: boolean } = $props();

  const words = {
    take: 'Take',
    drop: 'Drop',
    takeSaid: (step: string) => `Take the step left for the next run: ${step}`,
    takeLabel: (step: string) => `Take: ${step}`,
    dropLabel: (step: string) => `Drop: ${step}`,
    why: 'Why drop it? The record keeps your words.',
    dropIt: 'Drop it',
    keep: 'Keep it',
    dropped: (n: number) => (n === 1 ? 'Dropped.' : `Dropped, all ${n} times it was left.`),
    left: (who: string, when: string, times: number) => `${who}, ${when}${times > 1 ? `, left ${times} times` : ''}`,
    more: (n: number) => `Show ${n.toLocaleString('en')} more`,
    fewer: 'Show fewer',
    someone: 'An agent',
  } as const;

  /** How many steps are drawn before the rest are folded. */
  const FIRST = 3;

  const client = createClient({ base: apiBase() });
  let steps = $state.raw<Step[]>([]);
  /* THE QUESTIONS A STEP NAMES BY HANDLE, read for their words so a step never prints `SG288`. */
  let questions = $state.raw<ReadonlyMap<string, string>>(new Map());
  let drew = $state<boolean | null>(null);
  let all = $state(false);
  let asking = $state<string | null>(null);
  let why = $state('');
  let busy = $state<string | null>(null);
  const uid = $props.id();

  async function load(): Promise<void> {
    const body = {
      page: 'left-over',
      title: 'Steps',
      blocks: [{ kind: 'cards', source: 'handoffs.open', columns: [{ field: 'next_said', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'left_at', as: 'when' }, { field: 'run' }, { field: 'next' }, { field: 'mark' }], limit: 50 }],
    };
    const out = await client.call<{ blocks?: unknown }>('previewPage', { body }).catch(() => null);
    if (!out?.ok) {
      drew = steps.length > 0;
      return;
    }
    const [block] = Array.isArray(out.value.blocks) ? out.value.blocks : [];
    steps = stepsOf(block);
    questions = (await readQuestionWords(client, steps.map((s) => s.next))) ?? new Map();
    drew = steps.length > 0;
  }

  onMount(() => {
    void load();
    return told.on(() => void load());
  });
  listen(load, () => busy !== null);

  const shown = $derived(all ? steps : steps.slice(0, FIRST));

  async function drop(s: Step): Promise<void> {
    if (busy !== null) return;
    busy = s.key;
    try {
      let n = 0;
      let fix: string | null = null;
      for (const run of s.runs) {
        const out = await client.call('handoff', { drop: run, ...(why.trim() ? { why: why.trim() } : {}) }).catch(() => null);
        if (out?.ok) n += 1;
        else fix ??= out && 'refusal' in out ? (out.refusal?.fix ?? null) : null;
      }
      if (n > 0) toasts.push(words.dropped(n), { intent: 'good' });
      if (fix) toasts.push(fix, { intent: 'warn' });
      asking = null;
      why = '';
    } finally {
      busy = null;
    }
    told.say();
    await load();
  }
</script>

{#if drew !== true}
  <!-- NOTHING LEFT, OR NOT READ YET: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew nothing),
       and says it is still reading while it is. -->
  <span data-seen-none hidden aria-busy={drew === null ? 'true' : undefined}></span>
{:else}
  <div class="steps">
    <ol class="steps-list">
      {#each shown as s (s.key)}
        <li class="step" data-earlier={s.earlier ? '' : undefined}>
          <p class="step-next">{#each refsParts(stepSaid(s.next), questions) as part}{#if part.href}<a class="step-ref" href={at(part.href)}>{part.text}</a>{:else}{part.text}{/if}{/each}</p>
          <p class="step-meta">
            {#if s.project}<span class="step-proj">{s.project}</span>{/if}<span>{words.left(s.agent || words.someone, since(s.at, recordNow()), s.runs.length)}</span>
          </p>
          {#if owner}
            {#if asking === s.key}
              <form class="step-ask" aria-label={words.drop} onsubmit={(e) => (e.preventDefault(), void drop(s))}>
                <label class="step-why" for="{uid}-{s.key}">{words.why}</label>
                <input id="{uid}-{s.key}" class="step-input" type="text" bind:value={why} maxlength="400" autocomplete="off" enterkeyhint="done" />
                <div class="step-do">
                  <button type="button" class="step-btn" onclick={() => ((asking = null), (why = ''))}>{words.keep}</button>
                  <button type="submit" class="step-btn" data-weight="primary" disabled={busy === s.key}>{words.dropIt}</button>
                </div>
              </form>
            {:else}
              <div class="step-do step-acts">
                <button type="button" class="step-btn" aria-label={words.takeLabel(s.next)} onclick={() => fill.say(words.takeSaid(s.next))}>{words.take}</button>
                <button type="button" class="step-btn" aria-label={words.dropLabel(s.next)} onclick={() => ((asking = s.key), (why = ''))}>{words.drop}</button>
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
    {#if steps.length > FIRST}
      <button type="button" class="steps-more" onclick={() => (all = !all)}>{all ? words.fewer : words.more(steps.length - FIRST)}</button>
    {/if}
  </div>
{/if}

<style>
  .steps {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    container-type: inline-size;
  }

  .steps-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE STEP: its words at the body size, the project and who left it under them, the two quiet presses at the end. */
  .step {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-4);
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .step:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .step:last-child {
    padding-block-end: 0;
  }

  .step-ref {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .step-next {
    grid-column: 1;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .step[data-earlier] .step-next {
    color: var(--ink-2);
  }

  .step-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    grid-column: 1;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* THE PROJECT AS A QUIET CHIP, as At work says a run's. */
  .step-proj {
    padding: 1px var(--sp-2);
    border-radius: var(--r-xs);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .step > .step-acts {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .step-do {
    display: flex;
    gap: var(--sp-1);
  }

  /* QUIET PRESSES: no fill until the pointer is on one; the confirm's second press is the one red fill. */
  .step-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: var(--btn-h-sm, var(--ctl-h-sm));
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
  }

  .step-btn[data-weight='primary'] {
    background: var(--red-fill);
    color: var(--on-red);
  }

  .step-btn:focus-visible,
  .step-input:focus-visible,
  .steps-more:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .step-btn:not([data-weight='primary']):hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .step-ask {
    display: grid;
    grid-column: 1 / -1;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .step-ask .step-btn:not([data-weight='primary']) {
    background: var(--tile);
    color: var(--ink);
  }

  .step-why {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .step-input {
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

  .steps-more {
    justify-self: start;
    min-block-size: var(--btn-h-sm, var(--ctl-h-sm));
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .steps-more:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* ON A NARROW TILE the presses go under the words, at the start, so the step keeps the width to read in. */
  @container (width < 520px) {
    .step {
      grid-template-columns: minmax(0, 1fr);
    }

    .step > .step-acts {
      grid-column: 1;
      grid-row: auto;
      margin-block-start: var(--sp-1);
    }

    /* ON A PHONE the two presses are real buttons: a fill, 40px tall, a gap between them. */
    .step-acts {
      gap: var(--sp-2);
    }

    .step-acts .step-btn {
      min-block-size: 40px;
      min-inline-size: 72px;
      padding-inline: var(--sp-4);
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  /* UNDER A THUMB every press is 44 tall. */
  @media (pointer: coarse) {
    .step-btn,
    .steps-more {
      min-block-size: var(--tap, 44px);
      padding-inline: var(--sp-3);
    }

    .steps-more {
      padding-inline: 0;
    }
  }
</style>
