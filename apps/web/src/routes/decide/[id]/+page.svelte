<!--
  The gate. One question, its options, one decider, a mandatory reason.

  DELIBERATELY SLOWER THAN EVERY PRECEDENT, and every part of that is on purpose:

    1–9   HIGHLIGHT an option. It does not choose it.
    ↵     opens the commit step, and focus moves to the EMPTY, REQUIRED reason field.
    ⌘↵    commits — only from inside the reason, only with content.
    d     defers: also a reason, plus a wake date.
    Esc   leaves. The question stays open. Leaving costs nothing.

  NO SINGLE KEYSTROKE EVER COMMITS A DECISION. Linear binds 1 accept / 3 decline, which is correct
  for triaging an issue and wrong for an immutable row with a named decider.

  And THE RECOMMENDATION IS DISPLAYED, NEVER PRE-SELECTED. If it were highlighted on open, three
  keystrokes would rubber-stamp the machine's answer with a reason typed under its influence (19 §4).
-->
<script lang="ts">
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DECIDED, NOW, QUESTIONS } from '$lib/record/api.ts';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const question = $derived([...QUESTIONS, ...DECIDED].find((q) => q.id === page.params.id));

  /** Highlighted, not chosen. The two are different states and the interface says so. */
  let highlighted = $state<string | null>(null);
  let committing = $state<string | null>(null);
  let reason = $state('');
  let field = $state<HTMLTextAreaElement>();

  const short = $derived(reason.trim().length > 0 && reason.trim().length < 25);

  function choose(key: string) {
    committing = key;
    reason = '';
    queueMicrotask(() => field?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (!question || question.decided) return;
    const typing = e.target instanceof HTMLElement && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (committing && reason.trim()) commit();
      return;
    }
    if (typing) return;

    const n = Number(e.key);
    if (n >= 1 && n <= question.options.length) {
      e.preventDefault();
      highlighted = question.options[n - 1]!.key;
      return;
    }
    if (e.key === 'Enter' && highlighted) {
      e.preventDefault();
      choose(highlighted);
      return;
    }
    if (e.key === 'Escape' && committing) {
      e.preventDefault();
      committing = null;
    }
  }

  /** The mock-up stops here: nothing writes, and the record is unchanged. */
  let committed = $state(false);
  function commit() {
    committed = true;
  }
</script>

<svelte:window {onkeydown} />

{#if !question}
  <div class="page">
    <Empty kind="error" title="Couldn't find {page.params.id}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/decide">Back to Decide</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead kicker={copy.decide} title={question.title} id={question.id} />

  <div class="page">
    {#if question.decided}
      <div class="settled">
        <p class="settled-head">
          <Icon name="check" size="m" />
          {copy.decidedBy}
          {question.decided.by}, {relative(question.decided.at.slice(0, 10), NOW)}
        </p>
        <p class="settled-choice">{question.options.find((o) => o.key === question.decided!.option)?.title}</p>
        <p class="settled-reason">“{question.decided.reason}”</p>
        <p class="settled-note">{copy.immutable}</p>
      </div>
    {:else}
      <section class="cost">
        <h2 class="cost-label">{copy.costOfDelay}</h2>
        <p class="cost-body">{question.cost}</p>
        <p class="cost-age">Opened {relative(question.opened.slice(0, 10), NOW)}. Nobody has decided it.</p>
      </section>

      <section class="options">
        <div class="options-head">
          <h2 class="options-title">{copy.theOptions}</h2>
          <span class="options-hint">
            <Kbd keys="1–{question.options.length}" /> highlights <Kbd keys="↵" /> opens the reason
          </span>
        </div>

        <div class="cards" data-cells={question.options.length}>
          {#each question.options as option, i}
            <article class="card" data-on={highlighted === option.key ? '' : undefined}>
              <header class="card-head">
                <span class="card-n num">{i + 1}</span>
                <h3 class="card-title">{option.title}</h3>
                <!-- Shown, never pre-selected. -->
                {#if option.recommended}<span class="card-rec">{copy.recommended}</span>{/if}
              </header>
              <p class="card-body">{option.body}</p>
              <Button weight={highlighted === option.key ? 'primary' : 'quiet'} onclick={() => choose(option.key)}>
                {copy.chooseThis}
              </Button>
            </article>
          {/each}
        </div>
      </section>

      {#if committing}
        <section class="commit">
          <h2 class="commit-title">
            {copy.yourReason}
            <span class="commit-required">required</span>
          </h2>
          <p class="commit-choice">
            You are choosing <strong>{question.options.find((o) => o.key === committing)?.title}</strong>.
          </p>
          <textarea
            bind:this={field}
            bind:value={reason}
            class="commit-field"
            rows="3"
            placeholder={copy.reasonHint}
            spellcheck="true"
          ></textarea>
          <!-- Nudged once, never blocked: a person who means it should be able to keep it (20 §3). -->
          {#if short}<p class="commit-nudge">{copy.reasonNudge}</p>{/if}
          <div class="commit-actions">
            <Button weight="primary" disabled={!reason.trim()} onclick={commit}>
              {copy.commit}
              <Kbd keys="⌘↵" />
            </Button>
            <Button weight="bare" onclick={() => (committing = null)}>Cancel</Button>
            <span class="commit-note">{copy.immutable}</span>
          </div>
          {#if committed}
            <p class="commit-done">{copy.mockNotice}</p>
          {/if}
        </section>
      {:else}
        <div class="third">
          <!-- The third verb, kept: a queue with only yes and no is a queue that gets rubber-stamped. -->
          <Button weight="bare" tone="info">{copy.defer}<Kbd keys="d" /></Button>
          <span class="third-note">{copy.deferHint}</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1060px;
  }

  .cost {
    max-inline-size: var(--measure);
  }

  .cost-label {
    color: var(--warn);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .cost-body {
    margin-block-start: var(--sp-1);
    color: var(--ink);
  }

  .cost-age {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .options-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  .options-title {
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .options-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* Told how many things it contains. `auto-fit` with three items in a 962px column generated SEVEN
     tracks, four of them empty — a 550px slab of border colour, with every selector correct (05 §4). */
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--cells, 3), minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .cards[data-cells='2'] {
    --cells: 2;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .card[data-on] {
    border-color: var(--accent);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .card-n {
    inline-size: 20px;
    block-size: 20px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 18px;
    text-align: center;
  }

  .card[data-on] .card-n {
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .card-title {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  .card-rec {
    padding: 1px var(--sp-2);
    border: 1px solid color-mix(in srgb, var(--earn) 45%, transparent);
    border-radius: 999px;
    color: var(--earn);
    font-size: var(--t-xs);
  }

  .card-body {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-ui);
    line-height: 1.55;
  }

  .commit {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--accent);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
  }

  .commit-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .commit-required {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 400;
  }

  .commit-choice {
    margin-block: var(--sp-1) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .commit-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    resize: vertical;
  }

  .commit-nudge {
    margin-block-start: var(--sp-2);
    color: var(--warn);
    font-size: var(--t-ui);
  }

  .commit-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
  }

  .commit-note,
  .third-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .commit-done {
    margin-block-start: var(--sp-3);
    color: var(--accent-text);
    font-size: var(--t-ui);
  }

  .third {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .settled {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-inline-start: 3px solid var(--earn);
    border-radius: var(--r-md);
    max-inline-size: var(--measure);
  }

  .settled-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--earn);
    font-size: var(--t-ui);
  }

  .settled-choice {
    margin-block: var(--sp-2) var(--sp-1);
    font-family: var(--font-display);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .settled-reason {
    color: var(--ink2);
  }

  .settled-note {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    /* The gate is a first-class phone surface, not a degraded one: options as stacked cards, and the
       reason field above the fold. Decisions get made from a phone (19 §3). */
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }

    .options-hint {
      display: none;
    }
  }
</style>
