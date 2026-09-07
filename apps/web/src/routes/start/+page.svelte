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
  import { firstRun } from '$lib/first-run.ts';
  import { addKey } from '$lib/start.ts';
  import Define from '$lib/ui/Define.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  /* The five live in `copy.ts` with every other sentence in the product, so the scope this screen
     claims can be checked against the rest of it in one pass rather than found in a component. */
  const CHOICES = firstRun.firstChoices;

  let picked = $state<string | null>(null);
  /* What the generated form would refuse, bound out of it so the button can be dead while it is
     true rather than answering a press with a toast. */
  let problems = $state<string[]>([]);

  /**
   * The number under each choice, and it did nothing.
   *
   * THE KEYBOARD SHEET DOCUMENTS IT — "AT THE GATE · `1–9` Highlight an option. It does not choose
   * it" — and `/decide` obeys. This screen DRAWS the badges and had no handler, so the one place the
   * hint is printed on the control it describes was the one place pressing it did nothing.
   *
   * HIGHLIGHT AND NOT CHOOSE, exactly as the sheet says. A number that committed would make a
   * mis-keyed digit the first irreversible act somebody performs, on the screen 19 §6 says has no
   * skip; a number that moves focus lets them read what they landed on and press Enter.
   */
  let lit = $state(-1);

  function key(e: KeyboardEvent) {
    if (picked !== null || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > CHOICES.length) return;
    e.preventDefault();
    lit = n - 1;
    queueMicrotask(() => choices?.querySelectorAll('button')[lit]?.focus());
  }

  let choices = $state<HTMLDivElement | undefined>(undefined);

  /* THE FORM PUTS ITS OWN CARET IN. This screen used to hold a `field` binding nothing ever bound —
     the form below is generated from the declaration, so the page cannot reach its first input — and
     the `focus()` was a no-op for its whole life. `RowForm`'s `autofocus` does it from inside, where
     the first control is. */

  /**
   * CHOOSING A CARD IS A NAVIGATION, and it was a variable.
   *
   * Both first-run screens lived at `/start` with the choice in component state, so the FIRST screen
   * of the product broke the browser two ways at once. Back from the form left `/start` entirely and
   * landed on `/` — a stranger's fully populated record, nineteen controls, on somebody's first
   * thirty seconds. Reload went to screen one and threw away the row they had typed.
   *
   * THE ADDRESS ALREADY EXISTED. `?add=<register>` is read below, honoured once per value, and
   * accepts the word on the tile as well as the register id — screen two's own cards navigate to it.
   * The five cards on screen one were the only thing that reached the form without it.
   *
   * `19 §5`'s rule decides it: what defines WHICH SCREEN YOU ARE LOOKING AT belongs in the URL. The
   * caret, the typed values and the validation stay where they are, because those are about the
   * moment rather than the place.
   */
  const choose = (key: string) => void goto(`/start?add=${key}`, { keepFocus: true });

  /**
   * `/start?add=<register>` LANDS ON THAT REGISTER'S FORM.
   *
   * Screen two's cards send people here to add a second kind of thing, and this screen ignored the
   * parameter — so every card dropped them back on the choice list they had already answered, one
   * step further back than where they pressed. A deep link that lands somewhere else is worse than
   * no deep link: they have to work out that they are in the right place and just earlier.
   *
   * ONLY A KEY THIS SCREEN OFFERS. The parameter comes from a URL, and a register the choice list
   * does not carry has no question written for it.
   */
  /**
   * AND IT TAKES THE WORD ON THE TILE, not only the register id behind it.
   *
   * THE FIVE TILES SAY *Money*, *The estate*, *People*, *Projects*, *Work* and the five keys are
   * `obligations`, `services`, `people`, `things`, `tasks` — so three of the five words a person can
   * read on this screen fell through to the choice list. Nothing on the page writes the parameter,
   * so nothing was broken; it is a link somebody types or shares from what is in front of them, and
   * it worked two times in five.
   *
   * NORMALISED TO LETTERS AND DIGITS, and `the` dropped from the front, so `the-estate`, `The
   * Estate` and `estate` are one thing. Not a fuzzy match: an exact comparison against two names the
   * screen already publishes.
   */
  /**
   * AND IT IS HONOURED ONCE PER VALUE, WHICH IS WHAT MAKES *Back* WORK.
   *
   * THE GUARD WAS `picked === null`, AND `picked` IS READ INSIDE THE EFFECT — so pressing Back set it
   * to null, the effect re-ran, saw null, and put the person straight back on the form they had just
   * left. Arriving by `?add=` meant there was no way out of that screen except the browser's own
   * back button.
   *
   * REMEMBERING THE PARAMETER instead of the state fixes both halves: the effect no longer depends
   * on `picked` at all, and a genuinely different `?add=` — an in-app navigation to another one —
   * still lands where it says.
   */
  let honoured: string | null = null;

  /* AND IT MIRRORS THE ADDRESS BOTH WAYS, which is the half that makes Back mean anything.
     
     It only ever SET the choice, so leaving `?add=` behind — the browser's Back, or this screen's
     own — changed the URL and left the form on screen: you were at `/start`, looking at the second
     screen, with no way to the first except pressing Back again into whatever came before the
     product. An unknown key resets too, because a register the choice list does not carry has no
     question written for it and screen one is the honest landing. */
  $effect(() => {
    const asked = page.url.searchParams.get('add');
    if (asked === honoured) return;
    honoured = asked;
    picked = (asked ? addKey(asked, CHOICES) : undefined) ?? null;
  });

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
    /* THE BUTTON IS ALREADY DISABLED WHEN THIS IS TRUE. Kept as the second door, because Enter in a
       text field submits a form whatever its button looks like. */
    if (problems.length > 0) return;
    toasts.push(copy.notWritten(`the first row in ${choice.label} would be written`));
    /* AND IT SAYS WHERE IT CAME FROM. `19 §6`'s screen two is "the register, with their one row in
       it" — the screen you LAND on, not a standing property of a record that happens to hold one
       register. Reading it off the register count alone made it unreachable on any record with a
       second list, which includes every record anybody demonstrates. */
    void goto(`/r/${choice.key}?first=1`);
  }

  async function copyCommand() {
    await navigator.clipboard?.writeText(firstRun.agentCommand).catch(() => {});
    toasts.push(firstRun.agentCopied);
  }
</script>

<svelte:window onkeydown={key} />

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
      <h1 class="lede">{firstRun.firstLede}</h1>
      <p class="body">{firstRun.firstBody}</p>

      <h2 class="question">{firstRun.firstQuestion}</h2>

      <div class="choices" role="group" aria-label={firstRun.firstQuestion} bind:this={choices}>
        {#each CHOICES as c, i}
          <!-- The register id used to sit on the right of every row. It is the app's own vocabulary
               explained to somebody who has not agreed to learn it yet, on the one screen where
               they have the least reason to care, and it made five plain choices look like a
               schema review. The glyph does the work the id was pretending to do. -->
          <button type="button" class="choice" data-lit={lit === i ? '' : undefined} onclick={() => choose(c.key)}>
            <span class="choice-icon"><Icon name={c.icon as IconName} size="m" /></span>
            <span class="choice-main">
              <span class="choice-label">{c.label}</span>
              <span class="choice-body">{c.body}</span>
            </span>
            <kbd class="choice-n">{i + 1}</kbd>
          </button>
        {/each}
      </div>

      <!-- `row` is defined in the one sentence that already uses it, on the screen where somebody
           is about to make their first one. `19 §6`: one clause, in the sentence that needs it. -->
      <p class="hint">{firstRun.firstHint} <Define noun="row" /></p>

      <section class="agent" aria-labelledby="agent-h">
        <h2 class="agent-h" id="agent-h"><Icon name="session" size="m" />{firstRun.agentTitle}</h2>
        <p class="agent-body">{firstRun.agentBody}</p>
        <div class="agent-cmd">
          <!-- Focusable, because at 390 the command is wider than the card and scrolls. A scrolling
               box a keyboard cannot reach is a box a keyboard cannot read (WCAG 2.1.1) — the same
               fix the sheet body and the declaration block already carry. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <code tabindex="0" aria-label={firstRun.agentCopy}>{firstRun.agentCommand}</code>
          <button type="button" class="agent-copy" onclick={copyCommand} aria-label={firstRun.agentCopy}>
            <Icon name="copy" size="s" />
          </button>
        </div>
        <p class="agent-note">{firstRun.agentNote}</p>
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
        <!-- KEYED ON THE CHOICE. Going Back and picking another register reused the component, so
             an amount typed into Money was still in the field on Projects — and now would count as
             a required field already filled. -->
        {#key choice.key}
          <RowForm
            register={choice.key}
            first
            autofocus
            label={firstRun.firstField[choice.key]}
            bind:problems
          />
        {/key}

        <!-- The same treatment as the register drawer and `/decide`: the sentence, then the dead
             button that points at it. -->
        {#if problems.length > 0}<p class="first-why" id="first-why">{problems[0]}</p>{/if}

        <div class="actions">
          <Button
            weight="primary"
            type="submit"
            disabled={problems.length > 0}
            aria-describedby={problems.length > 0 ? 'first-why' : undefined}>{copy.addTheRow}</Button
          >
          <!-- BACK IS A NAVIGATION TOO, so the browser's own Back and this button end up in the
               same place instead of disagreeing about where "back" is. -->
          <Button weight="bare" onclick={() => void goto('/start')}>{copy.goBack}</Button>
        </div>
      </form>

    {/if}
  </div>
</div>

<style>
  /* The register's own rule, said where the refusal is. Ink rather than the warn hue: nobody has
     done anything wrong yet. */
  .first-why {
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }

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

  /* HIGHLIGHTED BY A NUMBER, and focus does the rest — so the ring somebody sees is the one the
     browser draws for the thing Enter would press, rather than a second convention to learn. */
  .choice[data-lit] {
    border-color: var(--accent);
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
