<!--
  THE FIRST RUN'S CONVERSATION, one part for /start and /signup (1 Nov, the owner: "i need the who are you to be a
  conversation with questions. not just a field").

  ONE QUESTION ON THE SCREEN (5 Nov, the owner: the first run "feels very overwhelming"). Only what is being asked now is
  drawn; what was said before opens from one quiet control, for whoever wants to read it back.

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

  /** Before the first answer, with the first question up: the hello and that question are one message. */
  const opening = $derived(turns.length === 0 && current !== null && current !== undefined && !thinking);
  let text = $state('');
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  let nudge = $state(false);
  let earlier = $state(false);

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

{#snippet earlierToggle()}
  <Button weight="bare" size="sm" aria-expanded={earlier} onclick={() => (earlier = !earlier)}>{earlier ? chatWords.earlierHide : chatWords.earlierShow}</Button>
{/snippet}

<div class="chat">
  <p class="sr" aria-live="polite" aria-atomic="true">{spoken}</p>

  <ol class="log" aria-label={chatWords.dog}>
    <!-- THE HELLO AND THE FIRST QUESTION ARE ONE MESSAGE UNDER ONE MARK (UI pass, 3 Nov): drawn as two, the screen opened
         on the same face twice, one over the other. Until the first answer the hello rides in the asking message. -->
    {#if earlier && !opening}
      <li class="msg dog">
        <span class="mark" aria-hidden="true"><Mark height={14} /></span>
        <div class="dog-body">
          {@render dog(hello, true)}
          {#if turns.length > 0}{@render dog(turns[0]!.ask.question)}{/if}
        </div>
      </li>
    {/if}

    {#if earlier}
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
          <span class="mark" aria-hidden="true"><Mark height={14} /></span>
          <div class="dog-body">
            {#if t.ack}{@render dog(t.ack, true)}{/if}
            {@render dog(turns[i + 1]!.ask.question)}
          </div>
        </li>
      {/if}
    {/each}
    {/if}

    {#if thinking}
      <li class="msg dog" in:arrive={{ rise: 4 }}>
        <span class="mark" aria-hidden="true"><Mark height={14} /></span>
        <span class="typing" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
      </li>
    {:else if current}
      {#key current}
        <li class="msg dog asking" in:arrive={{ rise: 8 }}>
          <span class="mark" aria-hidden="true"><Mark height={14} /></span>
          <div class="dog-body">
            {#if opening}{@render dog(hello, true)}{/if}
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
        <span class="mark" aria-hidden="true"><Mark height={14} /></span>
        <div class="dog-body">
          {#if turns.at(-1)?.ack}{@render dog(turns.at(-1)!.ack!, true)}{/if}
          {@render dog(closing)}
        </div>
      </li>
    {/if}
  </ol>

  {#if done}
    {#if turns.length > 0}{@render earlierToggle()}{/if}
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
        {#if turns.length > 0}{@render earlierToggle()}{/if}
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

  /* BRAINDOG'S MARK, IN A 28PX CIRCLE AT THE LINE'S FIRST BASELINE: a face is round (ops: faces and wells are circles). */
  .mark {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--tile-2);
    box-shadow: inset 0 0 0 1px var(--sep, var(--rule));
  }

  /* THE WORDS START ON THE MARK'S MIDDLE: a 20px first line in a 28px mark is 4 down. */
  .dog-body {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
  }

  /* ON THE TYPE SCALE (UI pass, 3 Nov; it spoke at 17 and asked at 19, neither on it): a line at the row's 15/20 in ink,
     its thanks before a question at the body's 14 in the second ink, and the question as a section heading, 17/24 600. */
  .dog-line,
  .question {
    margin: 0;
    max-inline-size: 60ch;
    color: var(--ink);
    font-size: var(--fs-row);
    line-height: var(--lead-row);
    text-wrap: pretty;
  }

  .dog-line[data-quiet] {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  /* THE ONE THING ON THE SCREEN, so it reads as the screen's subject. */
  .question {
    font-weight: 600;
    font-size: var(--fs-figure);
    line-height: calc(28px * var(--type, 1));
    letter-spacing: var(--track-head, -0.01em);
  }

  /* THE PERSON'S ANSWER: a quiet bubble at the right, the words as typed, never wider than four fifths. */
  .you {
    justify-content: flex-end;
  }

  .bubble {
    max-inline-size: min(80%, 36rem);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-tile) var(--r-tile) var(--r-xs) var(--r-tile);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(24px * var(--type, 1));
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

  /* CAPSULES (the ops style, 3 Nov: every control is a circle or a capsule; Look B's bordered squares are retired): the
     tile's own fill, a hairline edge, 36 tall (40 under a thumb). A chosen one (several may be) takes the chosen fill. */
  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding: 0 var(--ctl-pad, 16px);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pill);
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

  .pick[data-suggested] {
    border-color: var(--ink-3);
  }

  .pick[aria-pressed='true'] {
    background: var(--chosen);
    border-color: transparent;
  }

  .pick:disabled {
    cursor: default;
    opacity: 0.6;
  }

  @media (pointer: coarse) {
    .pick {
      min-block-size: 40px;
    }
  }

  /* ON A PHONE THE ANSWERS TAKE THE WHOLE LINE, under the mark too: kept to the words' column they wrapped one to a row. */
  @media (width < 640px) {
    .taps {
      margin-inline-start: calc(-28px - var(--sp-3));
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
    gap: calc(5px * var(--dense, 1));
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
    border-radius: var(--r-field);
    background: var(--tile);
    transition:
      border-color var(--d-state) var(--ease-out),
      box-shadow var(--d-state) var(--ease-out);
  }

  /* FOCUS IS THE ACCENT'S 2PX RING ON THE BOX, as on every field (ops 4.22): a 2px ink frame read as a black box. */
  .box:focus-within {
    border-color: transparent;
    box-shadow: 0 0 0 2px var(--focus-ring);
  }

  .field {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 26px;
    margin: 0;
    padding: 7px 0;
    border: 0;
    /* THE BOX IS THE FIELD: the shared `.field`'s ring and corner drew a second frame inside it. */
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 16px;
    line-height: calc(24px * var(--type, 1));
    resize: none;
    outline: none;
    scroll-margin-block: var(--sp-6) var(--sp-8);
  }

  /* UNDER A THUMB THE FIELD ITSELF IS 44 TALL, so a tap anywhere on its line lands in it. */
  @media (pointer: coarse) {
    .field {
      padding-block: 10px;
    }
  }

  .field::placeholder {
    color: var(--ink-3);
  }

  .nudge {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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
