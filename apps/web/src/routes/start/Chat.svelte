<!--
  THE FIRST RUN'S CONVERSATION, one part for /start and /signup (1 Nov, the owner: "i need the who are you to be a
  conversation with questions. not just a field").

  BRAINDOG ASKS, ONE QUESTION AT A TIME. Its lines are plain text beside its mark, on the tile; the person's answers are
  quiet bubbles at the right. The question being asked comes last, with two to four answers to tap under it (plain
  bordered buttons, never pills) and the field under those, so on a phone the taps sit just over the keyboard. Enter
  sends, Shift+Enter starts a new line; every question can be skipped, and "That's enough, build it" ends it at any time.

  WHAT THE PAGE DOES WITH AN ANSWER IS THE PAGE'S (`onanswer`): it reads it, lays it on the build and hands the next
  question back as `current`. While it reads, `thinking` draws BrainDog typing. The questions themselves are chosen in
  `$lib/start/chat.ts`.

  FOR A SCREEN READER, a polite live region says BrainDog's newest line (its thanks and its question) once, and focus
  goes to the field each time a question arrives. Lines arrive with `$lib/motion`'s `arrive` (a fade under reduced
  motion); the dots are still under reduced motion.

  `done` ENDS THE TALK: the field goes, and the page's `after` (the summary and Make it mine) stands in its place.
-->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { arrive } from '$lib/motion';
  import { chatWords, type ChatAsk, type ChatTurn } from '$lib/start/chat.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Mark from '$lib/ui/Mark.svelte';

  let {
    turns,
    current,
    thinking = false,
    done = false,
    busy = false,
    hello = chatWords.hello,
    closing = null,
    onanswer,
    onskip,
    onenough,
    tools,
    after,
  }: {
    /** The questions asked and answered so far, oldest first. */
    turns: readonly ChatTurn[];
    /** The question being asked now, or `null` while BrainDog reads or once the talk is done. */
    current: ChatAsk | null;
    /** BrainDog is reading the last answer: its dots are drawn. */
    thinking?: boolean;
    /** The talk is over: no field, and `after` in its place. */
    done?: boolean;
    busy?: boolean;
    hello?: string;
    /** BrainDog's last line, once done ("Here is what I'll make"). */
    closing?: string | null;
    /** The answer: what was typed or tapped. */
    onanswer: (answer: string) => void;
    onskip: () => void;
    onenough: () => void;
    /** The page's own quiet controls beside Skip (the other way in: a file). */
    tools?: Snippet | undefined;
    /** What stands where the field was once the talk is done. */
    after?: Snippet | undefined;
  } = $props();

  let text = $state('');
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  let nudge = $state(false);

  /* A TAP ON A QUESTION THAT TAKES SEVERAL (`many`) ADDS ITS WORDS TO THE FIELD, or takes them out; on any other it is
     the answer. */
  const picked = $derived(current?.many ? text.split(/,\s*|\s+and\s+/u).map((s) => s.trim().toLocaleLowerCase()) : []);
  function tapped(label: string): void {
    if (busy || thinking || !current) return;
    if (!current.many) return send(label);
    const low = label.toLocaleLowerCase();
    const parts = text.split(/,\s*/u).map((s) => s.trim()).filter((s) => s !== '');
    const next = picked.includes(low) ? parts.filter((p) => p.toLocaleLowerCase() !== low) : [...parts, label];
    text = next.join(', ');
    nudge = false;
  }

  function send(answer = text): void {
    if (busy || thinking || !current) return;
    if (answer.trim() === '') {
      nudge = true;
      field?.focus();
      return;
    }
    nudge = false;
    text = '';
    onanswer(answer.trim());
  }

  function skip(): void {
    if (busy || thinking || !current) return;
    nudge = false;
    text = '';
    onskip();
  }

  /* ENTER SENDS AND SHIFT+ENTER STARTS A NEW LINE, as a chat box does; a composing IME keeps its Enter. */
  function keydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    send();
  }

  /* THE FIELD GROWS WITH WHAT IS TYPED, up to six lines, and scrolls after that. */
  $effect(() => {
    void text;
    if (!field) return;
    field.style.blockSize = 'auto';
    field.style.blockSize = `${Math.min(field.scrollHeight, 6 * 24 + 26)}px`;
  });

  /* EACH NEW QUESTION TAKES THE FOCUS, so the next answer is typed straight away. The page's first draw does not. */
  let lastAsked: ChatAsk | null = null;
  let first = true;
  $effect(() => {
    const q = current;
    if (q === null || q === lastAsked) return;
    lastAsked = q;
    if (first) {
      first = false;
      return;
    }
    void tick().then(() => {
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });

  /** BrainDog's newest line, said once to a screen reader. */
  /* AND, WHILE IT READS, THAT IT IS READING: said through this one region, which is there from the first draw, rather
     than a status mounted with its words (which a screen reader may never hear). */
  const spoken = $derived(done ? (closing ?? '') : thinking ? chatWords.typing : current ? [turns.at(-1)?.ack ?? '', current.question].filter((s) => s !== '').join(' ') : '');
</script>

{#snippet dog(words: string, quiet = false)}
  <span class="dog-line" data-quiet={quiet ? '' : undefined}>{words}</span>
{/snippet}

<div class="chat">
  <p class="sr" aria-live="polite" aria-atomic="true">{spoken}</p>

  <ol class="log" aria-label={chatWords.dog}>
    <li class="msg dog">
      <span class="mark" aria-hidden="true"><Mark height={16} /></span>
      <div class="dog-body">
        {@render dog(hello, true)}
        {#if turns.length > 0}{@render dog(turns[0]!.ask.question)}{/if}
      </div>
    </li>

    {#each turns as t, i (i)}
      <li class="msg you" in:arrive={{ rise: 6 }}>
        <span class="sr">{chatWords.you}: </span>
        {#if t.answer === null}
          <span class="bubble skipped">{chatWords.skipped}</span>
        {:else}
          <span class="bubble">{t.answer}</span>
        {/if}
      </li>
      <!-- BRAINDOG'S LINE BACK AND ITS NEXT QUESTION, once that question is answered too; the newest stands below. -->
      {#if turns[i + 1]}
        <li class="msg dog">
          <span class="mark" aria-hidden="true"><Mark height={16} /></span>
          <div class="dog-body">
            {#if t.ack}{@render dog(t.ack, true)}{/if}
            {@render dog(turns[i + 1]!.ask.question)}
          </div>
        </li>
      {/if}
    {/each}

    {#if thinking}
      <li class="msg dog" in:arrive={{ rise: 4 }}>
        <span class="mark" aria-hidden="true"><Mark height={16} /></span>
        <span class="typing" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
      </li>
    {:else if current}
      {#key current}
        <li class="msg dog asking" in:arrive={{ rise: 8 }}>
          <span class="mark" aria-hidden="true"><Mark height={16} /></span>
          <div class="dog-body">
            {#if turns.length > 0 && turns.at(-1)?.ack}{@render dog(turns.at(-1)!.ack!, true)}{/if}
            <p class="question" id="chat-q">{current.question}</p>
            {#if current.choices.length > 0}
              <div class="taps" role="group" aria-labelledby="chat-q">
                {#each current.choices as c, n (c.value)}
                  {@const on = picked.includes(c.label.toLocaleLowerCase())}
                  <button
                    type="button"
                    class="pick"
                    data-suggested={current.suggested === c.value ? '' : undefined}
                    aria-pressed={current.many ? on : undefined}
                    disabled={busy}
                    style:--i={n}
                    onclick={() => tapped(c.label)}
                  >
                    {#if current.many && on}<Icon name="check" size="s" />{/if}{c.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </li>
      {/key}
    {:else if done && closing}
      <li class="msg dog" in:arrive={{ rise: 8 }}>
        <span class="mark" aria-hidden="true"><Mark height={16} /></span>
        <div class="dog-body">
          {#if turns.at(-1)?.ack}{@render dog(turns.at(-1)!.ack!, true)}{/if}
          {@render dog(closing)}
        </div>
      </li>
    {/if}
  </ol>

  {#if done}
    {@render after?.()}
  {:else}
    <form
      class="composer"
      onsubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div class="box" data-busy={thinking ? '' : undefined}>
        <textarea
          class="field"
          rows="1"
          autocomplete="off"
          maxlength="600"
          aria-labelledby={current ? 'chat-q' : undefined}
          aria-label={current ? undefined : chatWords.placeholder}
          placeholder={turns.length === 0 ? chatWords.placeholderFirst : chatWords.placeholder}
          bind:this={field}
          bind:value={text}
          onkeydown={keydown}
          disabled={busy}
        ></textarea>
        <Button weight="primary" type="submit" disabled={busy} aria-busy={thinking} kbd={text.trim() === '' || thinking ? undefined : '↵'}>
          {chatWords.send}
        </Button>
      </div>
      {#if nudge}<p class="nudge" role="status">{chatWords.empty}</p>{/if}
      <div class="foot">
        {@render tools?.()}
        <span class="foot-end">
          <Button weight="bare" size="sm" disabled={busy || thinking || !current} aria-label={chatWords.more} onclick={skip}>{chatWords.skip}</Button>
          {#if turns.length > 0}
            <Button weight="quiet" size="sm" disabled={busy || thinking} onclick={onenough}>{chatWords.enough}</Button>
          {/if}
        </span>
      </div>
    </form>
  {/if}
</div>

<style>
  /* ONE TRACK THAT MAY SHRINK (`minmax(0, 1fr)`): an implicit track took the composer's widest line and pushed the log
     12px past the tile at 320 (skills pass, 2 Nov). */
  .chat {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── the log ───────────────────────────────────────────────────────────── */

  .log {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
    min-inline-size: 0;
  }

  .msg {
    display: flex;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* BRAINDOG'S MARK, IN A 28PX SQUARE AT THE LINE'S FIRST BASELINE. */
  .mark {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .dog-body {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding-block-start: 2px;
  }

  /* BIG, READABLE, PLAIN: BrainDog speaks at 17 in ink, and its thanks before a question in the second ink. */
  .dog-line,
  .question {
    margin: 0;
    max-inline-size: 60ch;
    color: var(--ink);
    font-size: 17px;
    line-height: 26px;
    text-wrap: pretty;
  }

  .dog-line[data-quiet] {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  .question {
    font-weight: var(--fw-medium);
    font-size: 19px;
    line-height: 28px;
  }

  /* THE PERSON'S ANSWER: a quiet bubble at the right, the words as typed, never wider than four fifths. */
  .you {
    justify-content: flex-end;
  }

  .bubble {
    max-inline-size: min(80%, 36rem);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-pop) var(--r-pop) var(--r-xs) var(--r-pop);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 24px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble.skipped {
    background: transparent;
    border: 1px dashed var(--rule-strong);
    color: var(--ink-3);
  }

  /* ── the answers to tap ────────────────────────────────────────────────── */

  .taps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
  }

  /* PLAIN BORDERED BUTTONS (Look B): the tile's own fill, a firm edge, 40 tall (44 under a thumb). A tap fills it; a
     chosen one (several may be) takes the ink edge and a check. */
  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 40px;
    padding: 0 var(--sp-4);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background-color var(--d-press) var(--ease-standard),
      border-color var(--d-press) var(--ease-standard);
  }

  /* HOVER ONLY WHERE THERE IS A POINTER TO HOVER: on a phone a tapped answer kept the hover edge, which read as chosen. */
  @media (hover: hover) {
    .pick:hover {
      background: var(--hover);
      border-color: var(--ink-3);
    }
  }

  .pick:active {
    background: var(--tile-2);
  }

  .pick[aria-pressed='true'],
  .pick[data-suggested] {
    border-color: var(--ink);
  }

  .pick[aria-pressed='true'] {
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .pick:disabled {
    cursor: default;
    opacity: 0.6;
  }

  @media (pointer: coarse) {
    .pick {
      min-block-size: var(--tap, 44px);
    }
  }

  /* THE TAPS COME IN ONE AFTER ANOTHER, 30 APART, all in under 150ms. */
  @media (prefers-reduced-motion: no-preference) {
    .asking .pick {
      animation: pick-in var(--d-swap) var(--ease-emphasis) both;
      animation-delay: calc(min(var(--i), 3) * 30ms + 120ms);
    }
  }

  @keyframes pick-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }

  /* ── typing ────────────────────────────────────────────────────────────── */

  .typing {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    block-size: 28px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: var(--ink-3);
  }

  @media (prefers-reduced-motion: no-preference) {
    .dot {
      animation: blink 1.1s var(--ease-standard) infinite;
    }

    .dot:nth-child(2) {
      animation-delay: 0.15s;
    }

    .dot:nth-child(3) {
      animation-delay: 0.3s;
    }
  }

  @keyframes blink {
    0%,
    60%,
    100% {
      opacity: 0.35;
      translate: 0 0;
    }

    30% {
      opacity: 1;
      translate: 0 -2px;
    }
  }

  /* ── the field ─────────────────────────────────────────────────────────── */

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-2);
  }

  /* THE FIELD AND SEND IN ONE WELL, 16PX TYPE SO A PHONE DOES NOT ZOOM, the focus ring on the well. */
  .box {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-2);
    padding: var(--sp-2);
    padding-inline-start: var(--sp-4);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
    background: var(--tile);
  }

  .box:focus-within {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .field {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 26px;
    margin: 0;
    padding: 7px 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 16px;
    line-height: 24px;
    resize: none;
    outline: none;
    scroll-margin-block: var(--sp-6) var(--sp-8);
  }

  .field::placeholder {
    color: var(--ink-3);
  }

  .nudge {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    min-block-size: 32px;
  }

  .foot-end {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  @media (forced-colors: active) {
    .pick,
    .box,
    .bubble {
      border: 1px solid CanvasText;
    }
  }
</style>
