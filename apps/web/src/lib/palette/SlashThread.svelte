<!--
  The panel's half of a conversation: where it scrolls, and what it says before there is one. The conversation itself is
  drawn by `Conversation.svelte`, the Slash page's own, so it looks the same wherever it is opened.

  OPENED EMPTY IT SAYS WHAT MATTERS NOW, when the record says, else three questions fitted to the page behind.

  IT REMEMBERS WHERE IT WAS LEFT. A conversation scrolled up to read something older comes back there, through a close, a
  reload or a trip to another one, and stays there while a new answer comes; one left at its end stays at its end.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { tick, untrack } from 'svelte';
  import { at } from '../at.ts';
  import Icon from '../ui/Icon.svelte';
  import type { SentMention } from '../mention/mention.ts';
  import Conversation from '../../routes/slash/Conversation.svelte';
  import { keepScroll, scrollOf } from './conversations.svelte.ts';
  import { now as nowLines, starters, threadWords, type NowLine, type PageContext } from './slash-chat.ts';
  import { convo } from './thread.svelte.ts';

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
    onask: (question: string, mentions?: readonly SentMention[]) => void;
    /** A link in the thread was followed, so the palette goes. */
    onleave: () => void;
  } = $props();

  let scroller = $state<HTMLDivElement>();
  let view = $state<ReturnType<typeof Conversation> | null>(null);

  const icons = $derived(new Map(((page.data as { index?: { registers?: { id: string; icon: string }[] } }).index?.registers ?? []).map((r) => [r.id, String(r.icon)] as const)));

  /* WHAT MATTERS NOW, asked once for each base while the thread is empty, and the starters until it answers or if it never does. */
  let said = $state<{ base: string; lines: NowLine[] | null } | null>(null);
  $effect(() => {
    if (convo.turns.length > 0 || convo.id !== null || said?.base === base) return;
    const want = base;
    const stop = new AbortController();
    said = { base: want, lines: null };
    void nowLines(want, stop.signal).then((lines) => {
      if (said?.base === want) said = { base: want, lines };
    });
    return () => stop.abort();
  });
  const opening = $derived<NowLine[]>(said?.lines ?? starters(here).map((text) => ({ text })));

  /** Enter, with nothing typed: does what the card the keys are on asks. True when it was taken. */
  export function enter(): boolean {
    return view?.enter() ?? false;
  }

  /** Esc: puts the waiting card away. True when there was one. */
  export function escape(): boolean {
    return view?.escape() ?? false;
  }

  /** Whether a card is waiting on Enter, for the field's hint. */
  export function waiting(): boolean {
    return view?.waiting() ?? false;
  }

  /* THE NEWEST WORDS STAY IN VIEW while they stream, unless the reader scrolled up to read something older. */
  let pinned = true;
  let placed: string | null = null;
  const onscroll = () => {
    if (!scroller || placed === null || placed !== convo.id) return;
    pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    keepScroll('panel', placed, pinned ? null : scroller.scrollTop);
  };

  /* A CONVERSATION OPENED, ONCE ITS TURNS ARE DRAWN, GOES WHERE IT WAS LEFT. */
  $effect(() => {
    const id = convo.id;
    const ready = !convo.loading && convo.turns.length > 0;
    if (!scroller) return;
    untrack(() => {
      if (!ready || id === placed) return;
      const to = id === null ? null : scrollOf('panel', id);
      pinned = to === null;
      void tick().then(() => {
        if (!scroller || convo.id !== id) return;
        scroller.scrollTop = to ?? scroller.scrollHeight;
        placed = id;
      });
    });
  });
  $effect(() => {
    const last = convo.turns.at(-1);
    void convo.turns.length;
    if (last?.role === 'slash') void [last.text.length, last.steps.length, last.actions.length, last.streaming];
    if (scroller && pinned) void tick().then(() => scroller && pinned && (scroller.scrollTop = scroller.scrollHeight));
  });

  const leave = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('a')) onleave();
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="t" bind:this={scroller} {onscroll} onclick={leave}>
  {#if convo.turns.length === 0 && !convo.loading}
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
  {:else}
    <Conversation bind:this={view} {base} {icons} onretry={onask} />
  {/if}
</div>

<style>
  /* THE THREAD SCROLLS, under the field and inside the palette's cap. */
  .t {
    flex: 1;
    min-block-size: 0;
    min-inline-size: 0;
    padding: var(--sp-4);
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

  .t-starts {
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
</style>
