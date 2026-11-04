<!--
  Slash's conversation, drawn in the palette under the field it was asked in (`thread.svelte.ts` holds it).

  A QUESTION, THEN THE STEPS SLASH TAKES, THEN ITS ANSWER AS IT STREAMS. Each step is one quiet line ("Reading Money…"),
  the newest one moving while the answer is on its way. The answer is drawn through `Cited`, so a row it names is a link
  to the row and no brace is ever printed.

  THEN WHAT IT DID AND WHAT IT ASKS. An action it took is a receipt with Undo for six seconds, and stays in the thread
  after; an action it asks to take is a card the keyboard is on: Enter does it, Esc puts it away, and the field keeps the
  caret for the next question either way.

  OPENED EMPTY IT SAYS WHAT MATTERS NOW, when the record says, else three questions fitted to the page behind.

  ONE LIVE REGION FOR THE WHOLE THREAD, `role="log"`, busy while an answer streams, so a screen reader hears each answer
  once it is whole rather than a word at a time.
-->
<script lang="ts">
  import { arrive, lineIn, listMotion } from '$lib/motion/index.ts';
  import { at } from '../at.ts';
  import Cited from '../ui/Cited.svelte';
  import Icon from '../ui/Icon.svelte';
  import Kbd from '../ui/Kbd.svelte';
  import SlashOut from '../ui/SlashOut.svelte';
  import DecisionCard from '$lib/decide/DecisionCard.svelte';
  import { listName } from '../record/names.ts';
  import { copy } from '../copy.ts';
  import { now as nowLines, starters, threadWords, type NowLine, type PageContext } from './slash-chat.ts';
  import { answer, convo, undo, type LiveAction, type SlashTurn } from './thread.svelte.ts';
  import { stepLines } from './steps.ts';

  let {
    here,
    base,
    onask,
    onleave,
  }: {
    /** The page behind the palette, for the starters. */
    here: PageContext;
    /** The record's base, for `now`. */
    base: string;
    /** Ask a question in the thread. */
    onask: (question: string) => void;
    /** A link in the thread was followed, so the palette goes. */
    onleave: () => void;
  } = $props();

  let scroller = $state<HTMLDivElement>();
  let card = $state<ReturnType<typeof DecisionCard> | null>(null);

  /* WHAT MATTERS NOW, asked once for each base while the thread is empty, and the starters until it answers or if it never does. */
  let said = $state<{ base: string; lines: NowLine[] | null } | null>(null);
  $effect(() => {
    if (convo.turns.length > 0 || said?.base === base) return;
    const want = base;
    const stop = new AbortController();
    said = { base: want, lines: null };
    void nowLines(want, stop.signal).then((lines) => {
      if (said?.base === want) said = { base: want, lines };
    });
    return () => stop.abort();
  });
  const opening = $derived<NowLine[]>(said?.lines ?? starters(here).map((text) => ({ text })));

  /* THE NEWEST ANSWER, and on it the action the keys are on: the newest still waiting, else the two-pass card. */
  const last = $derived.by((): SlashTurn | undefined => {
    const t = convo.turns.at(-1);
    return t?.role === 'slash' ? t : undefined;
  });
  const pending = $derived(last?.actions.findLast((a) => a.kind === 'ask' && a.state === 'open') ?? null);
  const legacyCard = $derived(!pending && last?.legacy?.card && !last.streaming ? last.legacy.card : null);

  /** Enter, with nothing typed: does what the card the keys are on asks. True when it was taken. */
  export function enter(): boolean {
    if (pending) {
      void answer(pending, true, base);
      return true;
    }
    if (legacyCard && card && !card.answered()) return card.accept();
    return false;
  }

  /** Esc: puts the waiting card away. True when there was one. */
  export function escape(): boolean {
    if (!pending) return false;
    void answer(pending, false, base);
    return true;
  }

  /** Whether a card is waiting on Enter, for the field's hint. */
  export function waiting(): boolean {
    return pending !== null || (legacyCard !== null && card !== null && !card.answered());
  }

  /* THE CLOCK THE UNDOS READ, moved on when the next one lapses and not on a timer that ticks for nothing. */
  let tick = $state(Date.now());
  $effect(() => {
    const next = convo.turns
      .flatMap((t) => (t.role === 'slash' ? t.actions : []))
      .map((a) => a.until ?? 0)
      .filter((u) => u > tick)
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const t = setTimeout(() => (tick = Date.now()), next - Date.now() + 20);
    return () => clearTimeout(t);
  });
  const undoable = (a: LiveAction) => a.state === 'done' && a.undo !== undefined && (a.until ?? 0) > tick;

  /* THE NEWEST WORDS STAY IN VIEW while they stream, unless the reader scrolled up to read something older. */
  let pinned = true;
  const onscroll = () => {
    if (!scroller) return;
    pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
  };
  $effect(() => {
    void convo.turns.length;
    void last?.text.length;
    void last?.steps.length;
    void last?.actions.length;
    if (scroller && pinned) scroller.scrollTop = scroller.scrollHeight;
  });

  const leave = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('a')) onleave();
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="t" bind:this={scroller} {onscroll} onclick={leave}>
  {#if convo.turns.length === 0}
    {#if convo.loading}
      <p class="t-quiet" role="status">{threadWords.loading}</p>
    {:else}
      <p class="t-head">{said?.lines ? threadWords.now : threadWords.try}</p>
      <ul class="t-starts">
        {#each opening as line (line.text)}
          <li>
            {#if line.href}
              <a class="t-start tap" href={at(line.href)}><Icon name="arrow" size="s" /><span>{line.text}</span></a>
            {:else}
              <button type="button" class="t-start tap" onclick={() => onask(line.text)}><Icon name="ask" size="s" /><span>{line.text}</span></button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- AN ANSWER LANDING rises into place (`$lib/motion`): a turn as it comes, then what it found, its words, what it
         offers and its card, each as it arrives in a turn already drawn. Never on opening a thread already there. -->
    <ol class="t-turns" role="log" aria-live="polite" aria-busy={convo.busy} aria-label={threadWords.label} {@attach listMotion('li', { leave: false })}>
      {#each convo.turns as turn, i (i)}
        {#if turn.role === 'you'}
          <li class="t-you" dir="auto">{turn.text}</li>
        {:else}
          <li class="t-slash">
            {#if turn.steps.length > 0}
              <ul class="t-steps" aria-label={threadWords.steps}>
                {#each stepLines(turn.steps) as step (step.text)}
                  <li in:lineIn data-now={turn.streaming && step.last && turn.text === '' ? '' : undefined}><Icon name={step.icon} size="s" /><span>{step.text}{step.times > 1 ? ` (${step.times})` : ''}</span></li>
                {/each}
              </ul>
            {/if}
            {#if turn.legacy}
              {#if turn.legacy.where}<p class="t-where">{turn.legacy.where}</p>{/if}
              {#if turn.legacy.rows.length > 0}
                <ul class="t-rows" in:arrive>
                  {#each turn.legacy.rows as row (row.id)}
                    <li><a class="t-row tap" href={at(row.href)}><span dir="auto">{row.title}</span><span class="t-row-in">{listName(row.register)}</span></a></li>
                  {/each}
                </ul>
              {/if}
            {/if}
            {#if turn.text}
              <p class="t-text" dir="auto" in:arrive={{ rise: 6, from: 1 }}><Cited text={turn.text} figures={turn.figures} /></p>
            {:else if turn.streaming && turn.steps.length === 0}
              <p class="t-quiet">{copy.slashAsking}</p>
            {/if}
            {#each turn.actions as a (a.id)}
              <div class="t-act" in:arrive data-kind={a.kind} data-state={a.state} data-armed={a === pending ? '' : undefined}>
                <span class="t-act-mark"><Icon name={a.kind === 'done' || a.state === 'done' ? 'check' : a.state === 'undone' ? 'history' : 'ask'} size="s" /></span>
                <div class="t-act-words">
                  <p class="t-act-title" dir="auto">{a.receipt ?? a.title}</p>
                  {#if a.detail && a.detail !== a.receipt}<p class="t-act-detail" dir="auto">{a.detail}</p>{/if}
                  {#if a.state === 'dismissed'}<p class="t-act-detail">{threadWords.dismissed}</p>{/if}
                  {#if a.note}<p class="t-act-note" role="status">{a.note}</p>{/if}
                </div>
                <span class="t-act-do">
                  {#if a.kind === 'ask' && (a.state === 'open' || (a.state === 'busy' && !a.receipt))}
                    <button type="button" class="t-btn t-yes tap" disabled={a.state === 'busy'} onclick={() => answer(a, true, base)}>{threadWords.yes}{#if a === pending}<span class="t-key" aria-hidden="true"><Kbd keys="↵" /></span>{/if}</button>
                    <button type="button" class="t-btn tap" disabled={a.state === 'busy'} onclick={() => answer(a, false, base)}>{threadWords.no}</button>
                  {/if}
                  {#if undoable(a)}
                    <button type="button" class="t-btn tap" onclick={() => undo(a, base)}>{copy.undo}</button>
                  {/if}
                  {#if a.href}<a class="t-link tap" href={at(a.href)}>{threadWords.open}</a>{/if}
                </span>
              </div>
            {/each}
            {#if turn.legacy?.card && !turn.streaming}
              <div class="t-card" in:arrive data-armed={turn === last && legacyCard ? '' : undefined}>
                {#if turn === last}
                  <DecisionCard bind:this={card} question={turn.legacy.card} whole={false} />
                {:else}
                  <DecisionCard question={turn.legacy.card} whole={false} />
                {/if}
              </div>
            {/if}
            {#if turn.go.length > 0}
              <p class="t-go" in:arrive={{ rise: 6, from: 1 }}>
                {#each turn.go as go (go.href)}<a class="t-link tap" href={at(go.href)}>{go.label}</a>{/each}
              </p>
            {/if}
            {#if turn.error}
              <p class="t-error" role="status">{turn.error}</p>
              {#if turn.spent}<SlashOut />{/if}
            {/if}
            {#if turn.legacy && !turn.streaming}
              {#if turn.legacy.footer}<p class="t-model">{turn.legacy.footer}</p>{/if}
              <!-- PIN THE ANSWER, loaded only once there is an answer to pin (`PinTo.svelte`). -->
              {#await import('./PinTo.svelte') then { default: PinTo }}<PinTo reading={turn.legacy.reading} asked={turn.legacy.question} proposal={turn.text ? { text: turn.text, figures: turn.figures } : null} />{/await}
              <!-- ASKED AGAIN: the widget that answers it, offered from use ("You've asked this 3 times"). -->
              {#await import('../board/AskedAgain.svelte') then { default: AskedAgain }}<AskedAgain asked={turn.legacy.question} />{/await}
              <details class="t-fold">
                <summary class="tap">{copy.slashFold}</summary>
                <ul>
                  {#each turn.legacy.fold as line, j (j)}<li>{line}</li>{/each}
                </ul>
              </details>
            {/if}
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* THE THREAD SCROLLS, under the field and inside the palette's cap. */
  .t {
    flex: 1;
    min-block-size: 0;
    padding: var(--sp-2) var(--sp-4) var(--sp-3);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .t-head {
    margin: 0;
    padding: var(--sp-2) 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .t-starts,
  .t-turns,
  .t-steps,
  .t-rows,
  .t-fold ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A STARTER IS A ROW: a glyph and the question, the wash under the pointer. */
  .t-start {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-1) var(--sp-2);
    margin-inline: calc(-1 * var(--sp-2));
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .t-start :global(svg) {
    flex: none;
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .t-start:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .t-turns {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding-block: var(--sp-2);
  }

  /* WHAT WAS ASKED, on the end side in a quiet well, so the thread reads as two voices without bubbles shouting. */
  .t-you {
    align-self: flex-end;
    max-inline-size: 85%;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile-2);
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .t-slash {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE STEPS: quiet lines, the newest moving while the answer is on its way. */
  .t-steps {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .t-steps li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .t-steps li > :global(svg) {
    flex: none;
  }

  .t-steps li[data-now] {
    color: var(--ink-2);
    animation: t-breathe 1.2s var(--ease-out) infinite alternate;
  }

  @keyframes t-breathe {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .t-steps li[data-now] {
      animation: none;
    }
  }

  .t-text,
  .t-where,
  .t-quiet,
  .t-error,
  .t-model,
  .t-go {
    margin: 0;
    max-inline-size: var(--measure);
    overflow-wrap: anywhere;
  }

  .t-text {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-line;
  }

  .t-where,
  .t-quiet,
  .t-model {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .t-error {
    color: var(--ink-2);
  }

  .t-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-1) 0;
    color: var(--ink);
    text-decoration: none;
  }

  .t-row-in {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  @media (hover: hover) and (pointer: fine) {
    .t-row:hover span:first-child {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* AN ACTION: one hairline box, its mark, what it is, and its buttons at the end; ringed while the keys are on it. */
  .t-act {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
  }

  .t-act[data-armed] {
    border-color: var(--rule-strong);
    background: var(--hover);
  }

  .t-act[data-state='dismissed'],
  .t-act[data-state='undone'] {
    color: var(--ink-3);
  }

  .t-act-mark {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
  }

  .t-act[data-state='done'] .t-act-mark {
    color: var(--ink);
  }

  .t-act-words {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }

  .t-act-title,
  .t-act-detail,
  .t-act-note {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .t-act-title {
    color: inherit;
  }

  .t-act[data-state='open'] .t-act-title,
  .t-act[data-state='done'] .t-act-title {
    color: var(--ink);
  }

  .t-act-detail,
  .t-act-note {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .t-act-do {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .t-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    cursor: pointer;
  }

  .t-yes {
    border-color: var(--rule-strong);
    font-weight: var(--fw-medium);
  }

  .t-btn:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .t-key {
    display: inline-flex;
  }

  /* THE KEY ON "DO IT" is for a keyboard, and not drawn under a thumb. */
  @media (hover: none) and (pointer: coarse) {
    .t-key {
      display: none;
    }
  }

  .t-go {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .t-link {
    color: var(--ink);
    font-size: var(--fs-ctl);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }

  .t-card {
    container-type: inline-size;
    padding: var(--sp-3);
    border-radius: var(--r-pop);
  }

  .t-card[data-armed] {
    background: var(--hover);
  }

  .t-card > :global(.queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }

  .t-fold {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .t-fold summary {
    cursor: pointer;
  }

  .t-fold ul {
    margin-block-start: var(--sp-1);
    overflow-wrap: anywhere;
  }

  @media (forced-colors: active) {
    .t-act {
      border-color: CanvasText;
    }
  }
</style>
