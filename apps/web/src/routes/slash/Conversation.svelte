<!--
  A conversation with Slash on its own page (`thread.svelte.ts` holds it, the same one the palette's Ask holds).

  WHAT YOU ASKED, ON THE RIGHT, AND WHAT SLASH DID ABOUT IT, ON THE LEFT, AS STRUCTURE:
  - one quiet line for the steps it is taking, the newest moving while it works, kept as one line once it is done;
  - until its first words come, two bars the height of the words, so the answer lands without the page jumping;
  - its words through `Said`, each row it names a mention with its list's glyph, one press to the row, and an amount in
    the record's money, appended as they stream and never animated in, so nothing blinks;
  - each thing it did or asks to do as a card: what it changes and on which row, its state as a word, and its buttons.
    Asked: Do it (Enter) and Not now (Esc). Done: Undo for six seconds, the time left drawn as a shrinking line.

  A THING THAT WENT WRONG IS ONE FULL-WIDTH LINE WITH "ASK AGAIN", never a sentence lost among the words.

  ONE LIVE REGION, `role="log"`, busy while an answer streams, so a screen reader hears each answer once it is whole.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import SlashOut from '$lib/ui/SlashOut.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { listName } from '$lib/record/names.ts';
  import { copy } from '$lib/copy.ts';
  import { threadWords } from '$lib/palette/slash-chat.ts';
  import { answer, convo, rethink, rethinkable, undo, UNDO_MS, type LiveAction, type SlashTurn } from '$lib/palette/thread.svelte.ts';
  import type DecisionCardType from '$lib/decide/DecisionCard.svelte';
  import Said from './Said.svelte';
  import { actionSaid, iconOfRef } from './with.ts';

  let {
    base,
    icons,
    onretry,
  }: {
    base: string;
    /** Each list's glyph, by its id. */
    icons: ReadonlyMap<string, string>;
    /** Ask a question again, after one that did not go through. */
    onretry: (question: string) => void;
  } = $props();

  const words = {
    waiting: 'Waiting for your yes',
    done: 'Done',
    undone: 'Put back',
    dismissed: 'Left as it is',
    failed: 'Did not go through',
    again: 'Ask again',
    harder: 'Think harder',
    harderWhy: 'Ask this again on the deeper model',
    working: 'Working',
    stepsDone: (n: number) => (n === 1 ? '1 step' : `${n} steps`),
    undoLeft: 'Time left to undo',
  } as const;

  /* THE NEWEST ANSWER, and on it the card the keys are on: the newest still waiting, else the two-pass card. */
  const last = $derived.by((): SlashTurn | undefined => {
    const t = convo.turns.at(-1);
    return t?.role === 'slash' ? t : undefined;
  });
  const pending = $derived(last?.actions.findLast((a) => a.kind === 'ask' && a.state === 'open') ?? null);
  let Card = $state<typeof DecisionCardType | null>(null);
  let card = $state<ReturnType<typeof DecisionCardType> | null>(null);
  const legacyCard = $derived(!pending && last?.legacy?.card && !last.streaming ? last.legacy.card : null);
  $effect(() => {
    if (Card || !convo.turns.some((t) => t.role === 'slash' && t.legacy?.card)) return;
    void import('$lib/decide/DecisionCard.svelte').then(
      (m) => (Card = m.default),
      () => {},
    );
  });

  /** Enter with nothing typed: does what the waiting card asks. True when it was taken. */
  export function enter(): boolean {
    if (pending) {
      void answer(pending, true, base);
      return true;
    }
    if (legacyCard && card && !card.answered()) return card.accept();
    return false;
  }

  /** Esc with nothing typed: leaves the waiting card as it is. True when there was one. */
  export function escape(): boolean {
    if (!pending) return false;
    void answer(pending, false, base);
    return true;
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

  /** The steps, said short: "Reading Tasks" and "Reading Projects" are "Tasks · Projects" once done. */
  const stepsSaid = (steps: readonly string[]): string => [...new Set(steps.map((s) => s.replace(/^Reading /u, '').replace(/…$/u, '')))].join(' · ');

  /** The question a turn answered, for "Ask again". */
  function askedBefore(i: number): string | null {
    for (let j = i - 1; j >= 0; j--) {
      const t = convo.turns[j];
      if (t?.role === 'you') return t.text;
    }
    return null;
  }

  /** Why it waits, without saying again that it waits: the badge says that. */
  const why = (detail: string): string => detail.replace(/,?\s*so it waits for (?:your|their) yes\.?$/u, '.').replace(/\.\.$/u, '.');

  const stateOf = (a: LiveAction): { word: string; tone: 'warn' | 'good' | 'info' | 'bad' | undefined } =>
    a.state === 'open' || (a.state === 'busy' && a.kind === 'ask' && !a.receipt)
      ? { word: words.waiting, tone: 'warn' }
      : a.state === 'done' || (a.state === 'busy' && a.receipt)
        ? { word: words.done, tone: 'good' }
        : a.state === 'undone'
          ? { word: words.undone, tone: 'info' }
          : a.state === 'dismissed'
            ? { word: words.dismissed, tone: undefined }
            : { word: words.failed, tone: 'bad' };
</script>

<ol class="turns" role="log" aria-live="polite" aria-busy={convo.busy} aria-label={threadWords.label}>
  {#each convo.turns as turn, i (i)}
    {#if turn.role === 'you'}
      <li class="you"><p class="you-said" dir="auto">{turn.text}</p></li>
    {:else}
      <li class="slash" data-streaming={turn.streaming ? '' : undefined}>
        <span class="mark" aria-hidden="true"><Icon name="slash" size="s" /></span>
        <div class="body">
          {#if turn.steps.length > 0 || turn.streaming}
            <p class="steps" title={turn.steps.join(', ')}>
              {#if turn.streaming}<span class="spin" aria-hidden="true"></span>{:else}<Icon name="check" size="s" />{/if}
              <span class="steps-said">{turn.streaming ? (turn.steps.at(-1) ?? copy.slashAsking) : stepsSaid(turn.steps)}</span>
            </p>
          {/if}

          {#if turn.legacy}
            {#if turn.legacy.where}<p class="where">{turn.legacy.where}</p>{/if}
            {#if turn.legacy.rows.length > 0}
              <ul class="rows">
                {#each turn.legacy.rows as row (row.id)}
                  <li>
                    <a class="row-chip tap" href={at(row.href)}
                      ><Icon name={(icons.get(row.register) ?? 'rows') as IconName} size="s" /><span class="row-name" dir="auto">{row.title}</span><span class="row-in">{listName(row.register)}</span></a
                    >
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}

          {#if turn.text}
            <p class="text" dir="auto"><Said text={turn.text} figures={turn.figures} {icons} /></p>
          {:else if turn.streaming}
            <!-- HELD UNTIL THE WORDS COME, even under a card that came first, so the words take the bars' place and the
                 card under them does not move. -->
            <div class="skeleton" aria-hidden="true"><span></span><span></span></div>
          {/if}

          {#each turn.actions as a (a.id)}
            {@const said = actionSaid(a.receipt ?? a.title)}
            {@const st = stateOf(a)}
            <div class="act" data-state={a.state} data-armed={a === pending ? '' : undefined}>
              <div class="act-head">
                <span class="act-glyph" data-tone={st.tone}
                  ><Icon name={a.state === 'undone' ? 'history' : a.state === 'done' ? 'check' : a.state === 'dismissed' ? 'close' : 'edit'} size="s" /></span
                >
                <p class="act-title" dir="auto">
                  {#if said.verb}
                    <span class="act-verb">{said.verb}</span>{#each said.fields as f (f)}<span class="act-field">{f}</span>{/each}{#if said.list}<span class="act-in">in {said.list}</span>{/if}
                  {:else}
                    {a.receipt ?? a.title}
                  {/if}
                </p>
                {#if !(a.state === 'done' && /^(Changed|Added|Drafted)$/u.test(said.verb))}<span class="pill-badge act-state" data-tone={st.tone}>{st.word}</span>{/if}
              </div>
              {#if said.name}
                {#if a.href}
                  <a class="row-chip act-row tap" href={at(a.href)}><Icon name={(iconOfRef(a.href.replace(/^\/r\/([^/]+)\/(\d+).*$/u, '$1#$2'), icons) ?? 'rows') as IconName} size="s" /><span class="row-name" dir="auto">{said.name}</span></a>
                {:else}
                  <span class="row-chip act-row"><Icon name="rows" size="s" /><span class="row-name" dir="auto">{said.name}</span></span>
                {/if}
              {/if}
              {#if a.kind === 'ask' && a.state === 'open' && a.detail && a.detail !== a.title}<p class="act-why" dir="auto">{why(a.detail)}</p>{/if}
              {#if a.note}<p class="act-note" role="status">{a.note}</p>{/if}
              {#if (a.kind === 'ask' && (a.state === 'open' || (a.state === 'busy' && !a.receipt))) || undoable(a)}
                <div class="act-do">
                  {#if a.kind === 'ask' && (a.state === 'open' || (a.state === 'busy' && !a.receipt))}
                    <button type="button" class="btn tap" disabled={a.state === 'busy'} onclick={() => answer(a, false, base)}>{threadWords.no}{#if a === pending}<span class="key"><Kbd keys="Esc" /></span>{/if}</button>
                    <button type="button" class="btn yes tap" disabled={a.state === 'busy'} onclick={() => answer(a, true, base)}>{threadWords.yes}{#if a === pending}<span class="key"><Kbd keys="↵" /></span>{/if}</button>
                  {/if}
                  {#if undoable(a)}
                    <button type="button" class="btn tap undo" onclick={() => undo(a, base)}>
                      <Icon name="history" size="s" />{copy.undo}
                      <span class="undo-left" style:animation-duration={`${Math.max(0, (a.until ?? 0) - tick)}ms`} aria-label={words.undoLeft}></span>
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}

          {#if turn.legacy?.card && !turn.streaming && Card}
            <div class="legacy-card" data-armed={turn === last && legacyCard ? '' : undefined}>
              {#if turn === last}
                <Card bind:this={card} question={turn.legacy.card} whole={false} />
              {:else}
                <Card question={turn.legacy.card} whole={false} />
              {/if}
            </div>
          {/if}

          {#if turn.go.length > 0}
            <p class="go">
              {#each turn.go as go (go.href)}<a class="btn tap" href={at(go.href)}>{go.label}<Icon name="arrow" size="s" /></a>{/each}
            </p>
          {/if}

          {#if turn.error}
            <div class="err" role="status">
              <Icon name="alert" size="s" />
              <p class="err-said">{turn.error}</p>
              {#if !turn.spent && askedBefore(i) && turn === last}
                <button type="button" class="btn tap" onclick={() => onretry(askedBefore(i) ?? '')}>{words.again}</button>
              {/if}
            </div>
            {#if turn.spent}<SlashOut />{/if}
          {/if}

          {#if turn.legacy?.footer && !turn.streaming}<p class="model">{turn.legacy.footer}</p>{/if}

          {#if turn === last && !turn.streaming && rethinkable()}
            <p class="after">
              <button type="button" class="quiet tap" title={words.harderWhy} onclick={() => rethink(base)}><Icon name="refresh" size="s" />{words.harder}</button>
            </p>
          {/if}
        </div>
      </li>
    {/if}
  {/each}
</ol>

<style>
  .turns {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* WHAT YOU ASKED: a soft capsule on the right, never wider than four fifths of the column. */
  .you {
    display: flex;
    justify-content: flex-end;
  }

  .you-said {
    max-inline-size: min(80%, 36rem);
    margin: 0;
    padding: 10px 14px;
    background: var(--soft-fill);
    border-radius: 18px 18px 6px 18px;
    color: var(--ink);
    font-size: var(--fs-row, 15px);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  /* WHAT SLASH SAID: its mark in a 28 well, the body on the text edge beside it. */
  .slash {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
  }

  .mark {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--red-tint, var(--soft-fill));
    color: var(--red);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding-block-start: 3px;
  }

  /* THE STEPS: one line, 22 tall whatever it says, so the words under it never move when a step changes. */
  .steps {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    block-size: 22px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .steps :global(svg) {
    flex: none;
  }

  .steps-said {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spin {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border: 2px solid color-mix(in oklab, var(--ink) 18%, transparent);
    border-block-start-color: var(--red);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .text {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-row, 15px);
    line-height: calc(24px * var(--type, 1));
    white-space: pre-wrap;
  }

  /* TWO BARS THE HEIGHT OF TWO LINES OF WORDS, still, so the first words take their place and nothing jumps. */
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-block: 5px;
  }

  .skeleton span {
    block-size: 14px;
    border-radius: 7px;
    background: var(--soft-fill);
  }

  .skeleton span:first-child {
    inline-size: 88%;
  }

  .skeleton span:last-child {
    inline-size: 56%;
  }

  @media (prefers-reduced-motion: no-preference) {
    .skeleton span {
      animation: breathe 1.6s ease-in-out infinite;
    }
    .skeleton span:last-child {
      animation-delay: 0.2s;
    }
  }

  @keyframes breathe {
    50% {
      opacity: 0.55;
    }
  }

  .where,
  .model {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE ROWS IT NAMED: chips, one press to each, with their list's glyph and name. */
  .rows {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-inline-size: 100%;
    min-block-size: var(--ctl-panel, 28px);
    padding-inline: 10px 12px;
    background: var(--soft-fill);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    transition: background var(--d-state, 120ms) var(--ease-out, ease);
  }

  .row-chip :global(svg) {
    flex: none;
    color: var(--ink-3);
  }

  a.row-chip:hover {
    background: var(--row-wash-press, var(--soft-fill));
  }

  .row-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-in {
    flex: none;
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
  }

  /* A THING SLASH DID OR ASKS TO DO: a card of its own, what and where on the first line, its state as a word. */
  .act {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--tile);
    border: 1px solid var(--rule);
    border-radius: var(--r-tile);
  }

  .act[data-armed] {
    border-color: color-mix(in oklab, var(--warn) 45%, var(--rule));
  }

  .act-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
  }

  .act-glyph {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    border-radius: var(--r-pill);
    background: var(--soft-fill);
    color: var(--ink-2);
  }

  .act-glyph[data-tone='good'] {
    background: var(--good-tint);
    color: var(--good);
  }

  .act-glyph[data-tone='warn'] {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .act-title {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }

  .act-field {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: var(--soft-fill);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .act-in {
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
  }

  .act-state {
    flex: none;
  }

  .act-row {
    margin-inline-start: 32px;
  }

  .act-why,
  .act-note {
    margin: 0 0 0 32px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
  }

  .act-note {
    color: var(--red);
  }

  .act-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-inline-start: 32px;
  }

  .btn,
  .quiet {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: var(--ctl-panel, 28px);
    padding-inline: 12px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--soft-fill);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    overflow: hidden;
  }

  .btn.yes {
    background: var(--red-fill);
    color: var(--on-red, #fff);
    box-shadow: var(--shadow-raised);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  @media (hover: hover) {
    .btn:not(.yes):not(:disabled):hover,
    .quiet:hover {
      background: var(--row-wash-press, var(--soft-fill));
    }
  }

  .key {
    display: inline-flex;
    opacity: 0.8;
  }

  /* NO KEYS UNDER A THUMB. */
  @media (pointer: coarse) {
    .key {
      display: none;
    }
  }

  /* THE UNDO'S TIME LEFT: a line along its foot that runs out with it. */
  .undo-left {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: 2px;
    background: var(--ink-3);
    transform-origin: left;
    animation-name: runout;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes runout {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  .legacy-card[data-armed] {
    border-radius: var(--r-tile);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--warn) 45%, transparent);
  }

  .go {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
  }

  /* WHAT WENT WRONG: the width of the answer, its glyph and its sentence, and the one way on. */
  .err {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--red-tint, var(--soft-fill));
    border-radius: var(--r-ctl);
    color: var(--red);
  }

  .err :global(svg) {
    flex: none;
  }

  .err-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .after {
    margin: 0;
  }

  .quiet {
    background: none;
    color: var(--ink-2);
    padding-inline: 8px;
    margin-inline-start: -8px;
  }

  @media (pointer: coarse) {
    .btn,
    .quiet {
      block-size: 36px;
      padding-inline: 14px;
    }
  }
</style>
