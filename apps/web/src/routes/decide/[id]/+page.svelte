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
  import { titleOf } from '$lib/title.ts';
  import { day, since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { silenced } from '$lib/a11y/keys.svelte.ts';
  import { DECIDED, NOW, QUESTIONS } from '$lib/record/api.ts';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  const question = $derived([...QUESTIONS, ...DECIDED].find((q) => q.id === page.params.id));

  /** Highlighted, not chosen. The two are different states and the interface says so. */
  let highlighted = $state<string | null>(null);
  let committing = $state<string | null>(null);
  /**
   * Deferring is a DECISION about when, and it takes a reason like every other one.
   *
   * 20 §3's rule is that a choice is immutable and carries a mandatory reason; a defer is a choice
   * to not choose yet, and the thing worth recording is why. "Waiting on Halden's answer" six weeks
   * later is the difference between a question you parked and a question you forgot.
   *
   * The wake date is required too, because a defer without one is a dismissal wearing a nicer word.
   */
  let deferring = $state(false);
  let wake = $state('');
  let reason = $state('');
  let field = $state<HTMLTextAreaElement>();

  const short = $derived(reason.trim().length > 0 && reason.trim().length < 25);

  function choose(key: string) {
    committing = key;
    deferring = false;
    reason = '';
    queueMicrotask(() => field?.focus());
  }

  function defer() {
    deferring = true;
    committing = null;
    reason = '';
    /* Seeded a fortnight out — 21 A5, seeds not blanks. A date picker opened on nothing makes the
       person do arithmetic before they can say the thing they already know. */
    wake = new Date(NOW + 14 * 86_400_000).toISOString().slice(0, 10);
    queueMicrotask(() => field?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (!question || question.decided) return;
    const typing = e.target instanceof HTMLElement && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

    /* ONLY FROM INSIDE THE REASON FIELD, and only with content — 19 §4's own row. This branch ran
       before the `typing` test below it, so the one keystroke in this product that writes an
       immutable row with a named decider on it fired from anywhere on the page: with focus on
       Cancel, or aimed at another application. A gate this file's header calls "deliberately slower
       than every precedent" had a commit chord that was faster than everything. */
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (!typing) return;
      e.preventDefault();
      if (committing && reason.trim()) commit();
      return;
    }
    if (typing) return;
    if (silenced(e)) return;

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
    if (e.key === 'd' && !committing && !deferring) {
      e.preventDefault();
      defer();
      return;
    }
    if (e.key === 'Escape' && deferring) {
      e.preventDefault();
      deferring = false;
      return;
    }
    if (e.key === 'Escape' && committing) {
      e.preventDefault();
      committing = null;
    }
  }

  /**
   * The mock-up stops here — and it says what it would have written.
   *
   * IT ANSWERED THE PRODUCT'S CENTRAL ACT WITH THE GENERIC NOTICE. Every other terminal action in
   * this app names the change it would make: the rule that would be written and tested against the
   * last thirty days, the pack whose install plan would be shown first, the row that would be
   * created from an arrival. This one — the immutable row, with a person's name and their reason on
   * it, that the whole gate exists to slow down — said "nothing writes" and stopped. The one act
   * worth describing described itself least.
   */
  let committed = $state(false);
  function commit() {
    committed = true;
    const chosen = question?.options.find((o) => o.key === committing)?.title ?? committing;
    toasts.push(
      copy.notWritten(
        `${chosen} would be recorded as the decision on ${question?.id ?? ''}, with your reason and your name, and the question closed`,
      ),
      { intent: 'warn' },
    );
  }
</script>

<svelte:head><title>{titleOf(question?.title, copy.decide)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !question}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty kind="error" heading title={copy.noSuch('question', String(page.params.id))}>
      {#snippet actions()}<Button href="/decide">Back to Decide</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon="decide" kicker={copy.decide} title={question.title} id={question.id} />

  <div class="page">
    {#if question.decided}
      <div class="settled">
        <p class="settled-head">
          <Icon name="check" size="m" />
          {copy.decidedBy}
          {question.decided.by}, {since(question.decided.at, NOW)}
        </p>
        <p class="settled-choice">{question.options.find((o) => o.key === question.decided!.option)?.title}</p>
        <p class="settled-reason">“{question.decided.reason}”</p>
        <p class="settled-note">{copy.immutable}</p>
      </div>
    {:else}
      <section class="cost">
        <h2 class="cost-label">{copy.costOfDelay}</h2>
        <p class="cost-body">{question.cost}</p>
        <p class="cost-age">Opened {since(question.opened, NOW)}. Nobody has decided it.</p>
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
                {copy.chooseThis(option.title)}
              </Button>
            </article>
          {/each}
        </div>
      </section>

      {#if deferring}
        <section class="commit">
          <h2 class="commit-title">
            {copy.deferTitle}
            <span class="commit-required">{copy.required}</span>
          </h2>
          <textarea
            bind:this={field}
            bind:value={reason}
            class="commit-field"
            rows="2"
            placeholder={copy.deferHint}
            spellcheck="true"
          ></textarea>
          <label class="commit-wake">
            {copy.wakeOn}
            <input class="commit-date" type="date" bind:value={wake} />
          </label>
          <div class="commit-actions">
            <Button
              weight="primary"
              disabled={!reason.trim() || !wake}
              onclick={() => {
                deferring = false;
                /* THE DAY, SPELLED. Every other date in the product reads "17 Sep 2026"; this one
                   printed `2026-09-17`, the storage spelling, in a sentence about when somebody
                   will next look at a decision. `day()` is the one formatter and it was one call
                   away. */
                toasts.push(copy.deferred(day(wake)), { intent: 'warn' });
              }}
            >
              {copy.deferAction}
            </Button>
            <Button weight="bare" onclick={() => (deferring = false)}>{copy.arrangeCancel}</Button>
          </div>
        </section>
      {:else if committing}
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
          <!-- A DISABLED CONTROL SAYS WHY IT IS DISABLED. The only cue was the small word "required"
               above the box, and 23 §8's rule is that a control which refuses without a reason is
               the thing this product does not ship. It is announced too: `aria-describedby` points
               at the sentence, so somebody who cannot see the greying is told the same fact. -->
          {#if !reason.trim()}<p class="commit-why" id="commit-why">{copy.reasonRequired}</p>{/if}
          <div class="commit-actions">
            <Button
              weight="primary"
              disabled={!reason.trim()}
              aria-describedby={reason.trim() ? undefined : 'commit-why'}
              onclick={commit}
            >
              {copy.commit}
              <Kbd keys="⌘↵" />
            </Button>
            <Button weight="bare" onclick={() => (committing = null)}>Cancel</Button>
            <!-- ONE WARNING AT A TIME. `commit-why` above already says "kept for ever and cannot be
                 edited"; this said the same thing in different words six lines below it, so an empty
                 reason produced the same caution twice and neither read as the reason the button was
                 off. It belongs where it is the only thing left to say: the button is live, and the
                 next press is the irreversible one. -->
            {#if reason.trim()}<span class="commit-note">{copy.immutable}</span>{/if}
          </div>
          {#if committed}
            <p class="commit-done">{copy.mockNotice}</p>
          {/if}
        </section>
      {:else}
        <div class="third">
          <!-- The third verb, kept: a queue with only yes and no is a queue that gets rubber-stamped.
               It had no handler, so the one control that stops a gate being cleared by dismissing
               things did nothing — while `d` on the keyboard opened the same flow correctly. -->
          <Button weight="bare" tone="info" onclick={defer}>{copy.defer}<Kbd keys="d" /></Button>
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
    border-radius: var(--r-sm);
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

  .commit-wake {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .commit-date {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /* A HEADING IS AS TALL AS ITS DESCENDERS, AND HAS ROOM UNDER IT. Measured 18.297px against a
     `line-height` of 18.3, with the textarea starting flush at that boundary, so the tails of "Why"
     and "yet" were painted over. An earlier version of this comment blamed `display: flex` for
     collapsing the box; that is wrong — the `display: block` sibling `.options-title` measures the
     same 18.297px, because the height comes from the line box either way. What fixed it is the two
     declarations below: a line-height with room for a descender, and space between the heading and
     the field. The commit-reason panel uses the same `h2` and escaped only because a sub-line
     happens to sit between it and its field. */
  .commit-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
    line-height: 1.4;
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

  .commit-why {
    margin-block: var(--sp-2) 0;
    color: var(--ink2);
    font-size: var(--t-sm);
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
