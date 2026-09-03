<!--
  The first run. ONE ROW, TYPED BY HAND.

  Not pack selection, not a capture box, not a dashboard. Three properties matter and each was
  arrived at by deleting something (19 §6):

    - No pack vocabulary on screen one. The word "pack" does not appear until the user goes looking
      for a second register.
    - No model, no agent, no MCP required. Everything here works on a fresh self-host with nothing
      configured — an earlier draft made the core loop a capture field whose rows come from Spark,
      which v1 does not ship and self-host does not have. A first run that depends on an absent
      component is not a first run.
    - Nothing to approve. Selecting a PACK means reading an install diff written in the language of
      metrics and nav order, and asking a brand-new user to approve four schema reviews before they
      have seen one of their own rows is worse than a tour.

  And there is no skip, because a record with zero registers has no legal screen.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Button from '$lib/ui/Button.svelte';

  const CHOICES = [
    { key: 'obligations', label: copy.firstOwed, register: 'obligations', field: 'What is it, and how much?' },
    { key: 'services', label: copy.firstRenewing, register: 'services', field: 'What renews, and when?' },
    { key: 'decisions', label: copy.firstDecision, register: 'decisions', field: 'What do you keep re-deciding?' },
  ];

  let picked = $state<string | null>(null);
  let field = $state<HTMLInputElement>();

  function pick(key: string) {
    picked = key;
    queueMicrotask(() => field?.focus());
  }

  const choice = $derived(CHOICES.find((c) => c.key === picked));
</script>

<div class="start">
  <div class="frame">
    <header class="head">
      <Mark height={34} />
      <span class="wordmark">{copy.product}</span>
    </header>

    {#if !choice}
      <h1 class="question">{copy.firstQuestion}</h1>

      <div class="choices" role="group" aria-label={copy.firstQuestion}>
        {#each CHOICES as c, i}
          <button type="button" class="choice" onclick={() => pick(c.key)}>
            <span class="choice-n">{i + 1}</span>
            <span class="choice-label">{c.label}</span>
            <span class="choice-register">{c.register}</span>
          </button>
        {/each}
      </div>

      <p class="hint">{copy.firstHint}</p>
    {:else}
      <h1 class="question">{choice.field}</h1>

      <form class="form" onsubmit={(e) => e.preventDefault()}>
        <label class="label" for="first">Your first {choice.register.replace(/s$/, '')}</label>
        <input bind:this={field} id="first" class="input" type="text" placeholder="" spellcheck="false" />

        <label class="label" for="due">Due</label>
        <!-- Pre-filled to a plausible value they can overwrite. Their first act is typing one true
             fact about their own business, and it takes under thirty seconds. -->
        <input id="due" class="input" type="date" value="2026-10-01" />

        <div class="actions">
          <Button weight="primary" type="submit">Add it</Button>
          <Button weight="bare" onclick={() => (picked = null)}>Back</Button>
        </div>
      </form>

      <p class="hint">
        A register is <em>{copy.defRegister}</em>. You can add the rest later, and delete this one.
      </p>
    {/if}
  </div>
</div>

<style>
  .start {
    display: grid;
    place-items: center;
    min-block-size: 100dvh;
    padding: var(--sp-5);
  }

  .frame {
    inline-size: min(560px, 100%);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-block-end: var(--sp-7);
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  .question {
    margin-block-end: var(--sp-5);
    font-size: var(--t-2xl);
    letter-spacing: -0.028em;
  }

  .choices {
    display: flex;
    flex-direction: column;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    overflow: hidden;
  }

  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 56px;
    padding: 0 var(--sp-4);
    background: none;
    border: 0;
    border-block-end: 1px solid var(--line);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .choice:last-child {
    border-block-end: 0;
  }

  .choice:hover {
    background: var(--s2);
  }

  .choice-n {
    inline-size: 20px;
    block-size: 20px;
    border: 1px solid var(--edge);
    border-radius: 999px;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 18px;
    text-align: center;
  }

  .choice-register {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* A label is visible, always. A placeholder is not a label — it disappears exactly when a user
     needs it, and it fails contrast in most themes (06 §8). */
  .label {
    color: var(--dim);
    font-size: var(--t-xs);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .label + .input {
    margin-block-end: var(--sp-3);
  }

  .input {
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-base);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .hint {
    margin-block-start: var(--sp-4);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-ui);
  }
</style>
