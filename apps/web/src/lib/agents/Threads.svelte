<!--
  What he told agents, as conversations (the Agents page of 24 Nov). One thread a thing he said: its first words as the
  title, who has it and where, one plain line of where it stands, then his words and the agent's in turn, and a box to
  write back inside it. A finished thread is one line until it is opened; Close and Take back are quiet words at its foot.

  A QUESTION THE AGENT ASKED IS THE THREAD'S RED, and nothing else is: the status says "Claude asks you", the question is
  marked, and Yes and No answer it in one press where it is a yes or no question. Every other reply goes in the box.

  IT READS NOTHING. The host groups and words each thread (`threads.ts`), and hears a reply, a close and a take back by
  the thread's key; a reply's refusal comes back as the words to show under the box.
-->
<script lang="ts">
  import type { ControlMark } from 'braindog-render/svelte';
  import { agentMarkFill } from 'braindog-render';
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import type { ThreadCard } from './threads.ts';

  let {
    cards,
    mark,
    onreply,
    onclose,
    ontakeback,
    busy = new Set<string>(),
    more = 0,
    onmore,
  }: {
    cards: readonly ThreadCard[];
    mark?: ((agent: string) => ControlMark | null) | undefined;
    /** His reply inside a thread, by its key; answers the reason it was refused, or `null` once it is sent. */
    onreply?: ((key: string, said: string) => Promise<string | null>) | undefined;
    onclose?: ((key: string) => void) | undefined;
    ontakeback?: ((id: string) => void) | undefined;
    busy?: ReadonlySet<string>;
    more?: number;
    onmore?: (() => void) | undefined;
  } = $props();

  const words = {
    you: 'You',
    reply: (name: string) => `Reply to ${name}`,
    replyShort: 'Reply',
    send: 'Send',
    sending: 'Sending',
    close: 'Close',
    takeBack: 'Take back',
    open: (title: string) => `Open “${title}”`,
    more: (n: number) => `Show ${n.toLocaleString('en')} earlier`,
  } as const;

  const uid = $props.id();
  /* WHICH FINISHED THREADS HE OPENED, and what he is writing in each, by key, so a read of the record keeps both. */
  let opened = $state.raw<Set<string>>(new Set());
  let drafts = $state<Record<string, string>>({});
  let faults = $state<Record<string, string>>({});
  let sending = $state.raw<Set<string>>(new Set());

  /* WHICH THREADS HE CHOSE TO WRITE IN: a thread waiting on him opens with its box, every other one on a quiet Reply. */
  let writing = $state.raw<Set<string>>(new Set());
  const write = (key: string) => {
    writing = new Set([...writing, key]);
    queueMicrotask(() => document.getElementById(`${uid}-${key}`)?.focus());
  };

  const toggle = (key: string) => {
    const next = new Set(opened);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    opened = next;
  };

  async function reply(key: string, said: string): Promise<void> {
    const text = said.trim();
    if (text === '' || !onreply || sending.has(key)) return;
    sending = new Set([...sending, key]);
    faults = { ...faults, [key]: '' };
    try {
      const fix = await onreply(key, text);
      if (fix === null) {
        drafts = { ...drafts, [key]: '' };
        writing = new Set([...writing].filter((k) => k !== key));
      }
      else faults = { ...faults, [key]: fix };
    } finally {
      sending = new Set([...sending].filter((k) => k !== key));
    }
  }

  function keydown(e: KeyboardEvent, key: string): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void reply(key, drafts[key] ?? '');
    }
  }

  /* HIS FIRST WORDS ARE THE THREAD'S TITLE, so the first message says them again only where the title had to cut them. */
  const shownMessages = (c: ThreadCard) => (c.messages[0]?.from === 'you' && c.messages[0].text.replace(/\s+/gu, ' ').trim() === c.title ? c.messages.slice(1) : c.messages);
</script>

{#snippet face(c: ThreadCard)}
  {@const m = c.agent && mark ? mark(c.agent) : null}
  <span class="tt-face" aria-hidden="true"
    >{#if m}<svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" fill="currentColor" style={agentMarkFill(m.tone) ?? undefined}
        ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
      >{:else}<Icon name="session" size="s" />{/if}</span
  >
{/snippet}

{#if cards.length > 0}
  <ol class="threads" aria-label="What you told agents">
    {#each cards as c (c.key)}
      {@const open = !c.folded || opened.has(c.key)}
      {@const shown = shownMessages(c)}
      <li class="tt" data-tone={c.tone} data-open={open ? '' : undefined} aria-busy={busy.has(c.key) || sending.has(c.key) ? 'true' : undefined}>
        {#if c.folded}
          <button type="button" class="tt-head tt-press" aria-expanded={open} aria-label={words.open(c.title)} onclick={() => toggle(c.key)}>
            {@render face(c)}
            <span class="tt-words"><span class="tt-title">{c.title}</span><span class="tt-meta">{c.who}</span></span>
            <span class="tt-status" data-tone={c.tone}>{#if c.tone === 'done'}<Icon name="check" size="s" />{/if}{c.status}</span>
            <span class="tt-chev" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
          </button>
        {:else}
          <div class="tt-head">
            {@render face(c)}
            <span class="tt-words"><span class="tt-title">{c.title}</span><span class="tt-meta">{c.who}</span></span>
            <span class="tt-status" data-tone={c.tone}>{c.status}</span>
          </div>
        {/if}
        {#if open}
          <div class="tt-body">
            {#if shown.length > 0}
              <ol class="msgs">
                {#each shown as m (m.key)}
                  <li class="msg" data-from={m.from} data-asks={m.asks ? '' : undefined}>
                    <p class="msg-by"><b>{m.from === 'you' ? words.you : c.name.charAt(0).toUpperCase() + c.name.slice(1)}</b>{#if m.when}<span class="msg-when">{m.when}</span>{/if}</p>
                    <p class="msg-text" dir="auto">{m.text}</p>
                  </li>
                {/each}
              </ol>
            {/if}
            {#if c.reply && onreply && (c.tone === 'needs' || writing.has(c.key))}
              <form class="tt-reply" aria-label={words.reply(c.name)} onsubmit={(e) => (e.preventDefault(), void reply(c.key, drafts[c.key] ?? ''))}>
                {#if c.quick.length > 0}
                  <div class="tt-quick">
                    {#each c.quick as q (q)}<button type="button" class="tt-btn" data-weight="quick" disabled={sending.has(c.key)} onclick={() => void reply(c.key, q)}>{q}</button>{/each}
                  </div>
                {/if}
                <div class="tt-line">
                  <label class="sr" for="{uid}-{c.key}">{words.reply(c.name)}</label>
                  <textarea
                    id="{uid}-{c.key}"
                    class="tt-input"
                    rows="1"
                    maxlength="2000"
                    enterkeyhint="send"
                    autocomplete="off"
                    placeholder="{words.reply(c.name)}…"
                    value={drafts[c.key] ?? ''}
                    oninput={(e) => (drafts = { ...drafts, [c.key]: e.currentTarget.value })}
                    onkeydown={(e) => keydown(e, c.key)}
                    aria-invalid={faults[c.key] ? 'true' : undefined}
                  ></textarea>
                  <button type="submit" class="tt-btn" data-weight="send" disabled={sending.has(c.key)}>{sending.has(c.key) ? words.sending : words.send}</button>
                </div>
                {#if faults[c.key]}<p class="tt-fault" role="alert">{faults[c.key]}</p>{/if}
              </form>
            {/if}
            {#if c.changes || (c.takeBack && ontakeback) || (c.close && onclose) || (c.reply && onreply && c.tone !== 'needs' && !writing.has(c.key))}
              <div class="tt-foot">
                {#if c.reply && onreply && c.tone !== 'needs' && !writing.has(c.key)}<button type="button" class="tt-quiet" onclick={() => write(c.key)}>{words.replyShort}</button>{/if}
                {#if c.changes}<a class="tt-quiet" href={at(c.changes.href)}>{c.changes.said}</a>{/if}
                {#if c.takeBack && ontakeback}<button type="button" class="tt-quiet" disabled={busy.has(c.key)} onclick={() => ontakeback(c.takeBack!)}>{words.takeBack}</button>{/if}
                {#if c.close && onclose}<button type="button" class="tt-quiet" disabled={busy.has(c.key)} onclick={() => onclose(c.key)}>{words.close}</button>{/if}
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  {#if more > 0 && onmore}<button type="button" class="tt-more" onclick={onmore}>{words.more(more)}</button>{/if}
{/if}

<style>
  .threads {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tt {
    display: grid;
    min-inline-size: 0;
    border-block-start: 1px solid var(--rule);
  }

  .tt:first-child {
    border-block-start: 0;
  }

  /* THE HEAD: the agent's mark, his words as the title with who has it under them, and where it stands at the end. */
  .tt-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    min-inline-size: 0;
  }

  .tt-press {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    inline-size: 100%;
    margin: 0;
    padding-inline: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .tt-press:focus-visible,
  .tt-btn:focus-visible,
  .tt-quiet:focus-visible,
  .tt-more:focus-visible,
  .tt-input:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .tt-face {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: 50%;
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .tt-face .agent-mark {
    inline-size: 16px;
    block-size: 16px;
  }

  .tt-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .tt-title {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: calc(22px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tt-meta {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tt-status {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    white-space: nowrap;
  }

  .tt-status[data-tone='needs'] {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  .tt-status[data-tone='done'] {
    color: var(--ink-3);
  }

  .tt-status[data-tone='ended'] {
    color: var(--ink-3);
  }

  .tt-chev {
    display: inline-flex;
    color: var(--ink-3);
    transition: transform 120ms ease;
  }

  .tt[data-open] .tt-chev {
    transform: rotate(180deg);
  }

  /* THE CONVERSATION, under the head and in from the mark, so the words line up with the title. */
  .tt-body {
    display: grid;
    gap: var(--sp-3);
    padding-block-end: var(--sp-4);
    padding-inline-start: calc(32px + var(--sp-3));
    min-inline-size: 0;
  }

  .msgs {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .msg {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
    max-inline-size: 72ch;
  }

  /* HIS WORDS ON A SOLID FILL, the agent's on the tile: two voices told apart by ground, not by bubbles. */
  .msg[data-from='you'] {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .msg[data-asks] {
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--red);
  }

  .msg-by {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .msg-by b {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .msg-when {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .msg-text {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .tt-reply {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: 72ch;
  }

  .tt-quick {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .tt-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--sp-2);
  }

  .tt-input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    max-block-size: 160px;
    padding: 9px var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
    resize: none;
    field-sizing: content;
  }

  .tt-input::placeholder {
    color: var(--ink-3);
  }

  .tt-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
  }

  .tt-btn[data-weight='send'] {
    background: var(--ink);
    color: var(--tile);
  }

  .tt-btn[data-weight='quick'] {
    min-inline-size: 72px;
  }

  .tt-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .tt-fault {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* THE QUIET WORDS AT A THREAD'S FOOT: what it changed, and Close or Take back. No fill until the pointer is on one. */
  .tt-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
  }

  .tt-quiet,
  .tt-more {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--btn-h-sm, var(--ctl-h-sm));
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    text-decoration: none;
    cursor: pointer;
  }

  .tt-more {
    justify-self: start;
    margin-block-start: var(--sp-2);
  }

  @media (hover: hover) and (pointer: fine) {
    .tt-quiet:hover,
    .tt-more:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .tt-press:hover .tt-title {
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .tt-btn:not([data-weight='send']):hover {
      background: var(--hover);
    }
  }

  @media (pointer: coarse) {
    .tt-quiet,
    .tt-more {
      min-block-size: var(--tap, 44px);
    }

    .tt-btn {
      min-block-size: var(--tap, 44px);
    }
  }

  /* ON A PHONE THE CONVERSATION TAKES THE WIDTH: it starts under the mark, and the status goes under the title. */
  /* ON A PHONE the words wrap to two lines and where it stands sits under who has it, tight to it. */
  @media (width < 640px) {
    .tt-head {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      row-gap: 2px;
    }

    .tt-title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      white-space: normal;
    }

    .tt-status {
      font-size: var(--fs-meta);
    }

    .tt-press {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .tt-head > .tt-status {
      grid-column: 2;
    }

    .tt-press > .tt-status {
      grid-column: 2;
      grid-row: 2;
    }

    .tt-press > .tt-chev {
      grid-column: 3;
      grid-row: 1 / span 2;
    }

    .tt-body {
      padding-inline-start: 0;
    }
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
