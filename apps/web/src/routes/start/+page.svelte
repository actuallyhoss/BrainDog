<!--
  The first run. ONE ROW, TYPED BY HAND.

  Not pack selection, not a capture box, not a dashboard. Three properties matter and each was
  arrived at by deleting something (19 §6):

    - No pack vocabulary on screen one. The word "pack" does not appear until the user goes looking
      for a second register.
    - No model, no agent, no MCP required. Everything here works on a fresh self-host with nothing
      configured — an earlier draft made the core loop a capture field whose rows come from a model,
      which v1 does not ship and self-host does not have. A first run that depends on an absent
      component is not a first run.
    - Nothing to approve. Selecting a PACK means reading an install diff written in the language of
      metrics and nav order, and asking a brand-new user to approve four schema reviews before they
      have seen one of their own rows is worse than a tour.

  And there is no skip, because a record with zero registers has no legal screen.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { goto } from '$app/navigation';

  /* The five live in `copy.ts` with every other sentence in the product, so the scope this screen
     claims can be checked against the rest of it in one pass rather than found in a component. */
  const CHOICES = copy.firstChoices;

  let picked = $state<string | null>(null);
  let field = $state<HTMLInputElement>();
  /* FROM THE RECORD'S CLOCK, not a literal. A hardcoded date is a PAST date within weeks, on the
     one screen where a wrong default is the first thing anybody sees. */
  let form = $state<{ problems: () => string[] } | undefined>(undefined);

  function pick(key: string) {
    picked = key;
    queueMicrotask(() => field?.focus());
  }

  const choice = $derived(CHOICES.find((c) => c.key === picked));

  /**
   * The first row.
   *
   * IT SAYS WHAT IT WOULD HAVE WRITTEN AND GOES WHERE THE ROW WOULD BE. This app is a mock-up of
   * the record and has no write path; the rule it keeps everywhere else is that an action which
   * cannot happen says so once, in the toast, rather than doing nothing — because a control that
   * does nothing is indistinguishable from a broken one. This is the highest-stakes control in the
   * product and it was the one that broke that rule.
   */
  function commit(event: SubmitEvent) {
    event.preventDefault();
    if (!choice) return;
    /* AND A VALUE THE RECORD WOULD REFUSE IS SAID BEFORE ANYBODY LEAVES THIS SCREEN. The form knows
       — it marks the field and prints the sentence — and this is the first row somebody writes. */
    const said = form?.problems() ?? [];
    if (said.length > 0) {
      toasts.push(said[0]!, { intent: 'warn' });
      return;
    }
    toasts.push(copy.notWritten(`the first row in ${choice.label} would be written`));
    void goto(`/r/${choice.key}`);
  }

  async function copyCommand() {
    await navigator.clipboard?.writeText(copy.agentCommand).catch(() => {});
    toasts.push(copy.agentCopied);
  }
</script>

<svelte:head><title>{titleOf('Start')}</title></svelte:head>

<div class="start">
  <div class="frame">
    <header class="head">
      <Mark height={34} />
      <span class="wordmark">{copy.product}</span>
    </header>

    {#if !choice}
      <!-- SAY WHAT THIS IS BEFORE ASKING WHAT THEY WANT. The question on its own let the three
           examples under it define the product, and three examples always define it downward. -->
      <h1 class="lede">{copy.firstLede}</h1>
      <p class="body">{copy.firstBody}</p>

      <h2 class="question">{copy.firstQuestion}</h2>

      <div class="choices" role="group" aria-label={copy.firstQuestion}>
        {#each CHOICES as c, i}
          <!-- The register id used to sit on the right of every row. It is the app's own vocabulary
               explained to somebody who has not agreed to learn it yet, on the one screen where
               they have the least reason to care, and it made five plain choices look like a
               schema review. The glyph does the work the id was pretending to do. -->
          <button type="button" class="choice" onclick={() => pick(c.key)}>
            <span class="choice-icon"><Icon name={c.icon as IconName} size="m" /></span>
            <span class="choice-main">
              <span class="choice-label">{c.label}</span>
              <span class="choice-body">{c.body}</span>
            </span>
            <kbd class="choice-n">{i + 1}</kbd>
          </button>
        {/each}
      </div>

      <p class="hint">{copy.firstHint}</p>

      <section class="agent" aria-labelledby="agent-h">
        <h2 class="agent-h" id="agent-h"><Icon name="session" size="m" />{copy.agentTitle}</h2>
        <p class="agent-body">{copy.agentBody}</p>
        <div class="agent-cmd">
          <!-- Focusable, because at 390 the command is wider than the card and scrolls. A scrolling
               box a keyboard cannot reach is a box a keyboard cannot read (WCAG 2.1.1) — the same
               fix the sheet body and the declaration block already carry. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <code tabindex="0" aria-label={copy.agentCopy}>{copy.agentCommand}</code>
          <button type="button" class="agent-copy" onclick={copyCommand} aria-label={copy.agentCopy}>
            <Icon name="copy" size="s" />
          </button>
        </div>
        <p class="agent-note">{copy.agentNote}</p>
      </section>
    {:else}
      <h1 class="question step">{choice.field}</h1>

      <!--
        THE ONE CONTROL THAT MATTERS COMMITS. It had no handler at all — no toast, no route, no row,
        and the input was not even bound — which is this app's own rule broken at the highest-stakes
        moment: a control that does nothing is indistinguishable from a broken one, so every action
        that cannot happen here says what it WOULD have done, once, in the toast. Sixteen other
        controls obey that; the first-run commit did not.
      -->
      <!--
        THE REGISTER'S OWN FIELDS, and not a form typed out by hand. This was one hard-coded shape
        for five different questions: a text box and a `Due` date, whatever had been chosen. So
        "What is it, and how much?" stood over a form with no amount in it — on the first screen of a
        product about money — and a person was asked when they are due.

        `first` NARROWS IT TO THE TITLE AND THE REQUIRED ONES, because 19 §6 wants "one true fact
        about their own business" in under thirty seconds and a register has eight fields. Which
        three that is comes from the declaration, so a money register asks for an amount because it
        DECLARES one, and nobody writes a second copy of the schema in markup.
      -->
      <form class="form" onsubmit={commit}>
        <RowForm register={choice.key} first bind:this={form} />

        <div class="actions">
          <Button weight="primary" type="submit">Add it</Button>
          <Button weight="bare" onclick={() => (picked = null)}>Back</Button>
        </div>
      </form>

    {/if}
  </div>
</div>

<style>
  /* `minmax(0, …)` and not `place-items: center`. A centred grid item sizes its track to
     `max-content`, and the one line of `nowrap` monospace in the agent card is wider than a phone —
     so the track grew to fit it and took the whole page sideways at 320 and 360. The gate caught it
     the same minute I wrote it, which is what the gate is for. */
  .start {
    display: grid;
    grid-template-columns: minmax(0, min(560px, 100%));
    justify-content: center;
    align-content: center;
    min-block-size: 100dvh;
    padding: var(--sp-5);
  }

  .frame {
    min-inline-size: 0;
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

  /* The question is now the SECOND thing on the screen, under the claim, so it steps down a level:
     it is a label for the list rather than the headline of the page. On the step after a choice it
     is the headline again, and `.step` puts the size back. */
  .question {
    margin-block: var(--sp-7) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .question.step {
    margin-block: 0 var(--sp-5);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.028em;
    text-transform: none;
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

  /* The claim, at the top, in the display face — the same sentence the marketing site leads with,
     because the first screen of the product and the first screen of the site should not describe
     two different things. */
  .lede {
    max-inline-size: 22ch;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: var(--lh-tight);
  }

  .body {
    margin-block-start: var(--sp-3);
    max-inline-size: 54ch;
    color: var(--dim);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: 66px;
    padding: var(--sp-3) var(--sp-4);
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
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  /* The number is a KEY, so it is drawn as one. A bare circled digit reads as a step in a sequence
     you have to do in order; these are five alternatives and only one gets picked. */
  .choice-n {
    min-inline-size: 20px;
    padding: 2px 6px;
    background: var(--sunk);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    text-align: center;
  }

  /* The glyph, in the accent, because it was the only colour on the screen that was missing and
     five rows of grey text is most of what made this look like a form. */
  .choice-icon {
    display: grid;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent-text);
  }

  .choice-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  /* The name carries the weight and the sentence under it does the explaining. One line each was
     what made the old three read as a list of chores rather than as the parts of a business. */
  .choice-label {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .choice-body {
    color: var(--dim);
    font-size: var(--t-sm);
  }


  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* The label and input styles that were here are `RowForm`'s now, which is the point: one control
     per declared type, drawn one way, wherever a row is written. */

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* No rule above it any more. It belongs to the list it follows, and the card below now does the
     separating — a divider plus a card is two dividers. */
  .hint {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── the agent path ──────────────────────────────────────────────────── */

  /* A CARD, not a rule with text under it. Below a divider reads as a footnote — the thing you put
     after the real content — and this is the path somebody with an agent already open should take
     first. Tinted with the accent rather than the surface ladder, because it is an alternative to
     the list above it and not the next step down from it. */
  .agent {
    margin-block-start: var(--sp-6);
    padding: var(--sp-4) var(--sp-4) var(--sp-5);
    background: color-mix(in srgb, var(--accent) 7%, var(--s1));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    border-radius: var(--r-md);
  }

  .agent-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .agent-h :global(svg) {
    color: var(--accent-text);
  }

  .agent-h {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .agent-body {
    margin-block-start: var(--sp-2);
    max-inline-size: 56ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .agent-cmd {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
    border-radius: var(--r-sm);
  }

  .agent-cmd code {
    flex: 1;
    min-inline-size: 0;
    overflow-x: auto;
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  .agent-copy {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    flex: none;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .agent-copy:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  .agent-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
