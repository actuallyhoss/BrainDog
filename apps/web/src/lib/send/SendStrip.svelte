<!--
  THE CONVERSATION UNDER A ROW: what was sent from it, to whom, and what came back.

  A THIN STRIP, NOT A CARD: one line "↗ Sent to Claude on MacBook · 2 min ago · Working ●", then the answer's words as
  they arrive, the receipts of what was changed with Undo on each, and a Reply field to go on. Slash streams its answer;
  an agent's instruction is read again every few seconds while the strip is on the screen, and stops once it has ended.

  THE NEWEST IS OPEN, AND EACH EARLIER ONE IS ITS LINE, opened by a press, so a row keeps every strip it has had.
  Nothing is drawn for a row nothing was sent from. Red is the dot of an instruction that needs the person, and nothing else.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import { answerAct, busy, convos, forRef, poll, replyAgent, replySlash, undoKept, withdrawConvo, type Convo } from './convos.svelte.ts';
  import { openSheet } from './open.ts';
  import { ENDED, POLL_MS, ago, sendWords, stateWords } from './send.ts';

  let { ref, kind, label = '' }: { ref: string; kind: string; label?: string } = $props();

  const mine = $derived((convos.list, forRef(ref)));
  let now = $state(Date.now());
  let drafts = $state<Record<string, string>>({});
  let opened = $state<Record<string, boolean>>({});

  onMount(() => {
    const clock = setInterval(() => (now = Date.now()), 30_000);
    const ask = () => {
      if (document.hidden) return;
      for (const c of forRef(ref)) if (c.via === 'agent' && !(c.state !== null && ENDED.has(c.state))) void poll(c);
    };
    ask();
    const watch = setInterval(ask, POLL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(watch);
    };
  });

  /** The strip's state word and its dot: answering or answered for Slash, the instruction's state for an agent. */
  function where(c: Convo): { word: string; dot: 'live' | 'needs' | 'done' | null } {
    if (c.via === 'slash') return busy(c) ? { word: 'Answering', dot: 'live' } : { word: 'Answered', dot: null };
    const s = c.state ?? 'sent';
    return { word: stateWords[s], dot: s === 'working' || s === 'seen' ? 'live' : s === 'needs_you' ? 'needs' : s === 'done' ? 'done' : null };
  }

  function reply(c: Convo, e: SubmitEvent) {
    e.preventDefault();
    const said = (drafts[c.key] ?? '').trim();
    if (said === '') return;
    drafts[c.key] = '';
    if (c.via === 'slash') replySlash(c, said);
    else void replyAgent(c, said);
  }

  function toMac(anchor: EventTarget | null) {
    void openSheet({ kind, attach: [{ ref, label }], preset: 'mac', anchor: anchor instanceof Element ? anchor : null });
  }
</script>

{#if mine.length > 0}
  <section class="cs" aria-label={sendWords.conversation}>
    {#each mine as c, i (c.key)}
      {@const w = where(c)}
      {@const open = i === 0 || opened[c.key] === true}
      <div class="cs-one" data-open={open ? '' : undefined}>
        <button type="button" class="cs-line" aria-expanded={open} onclick={() => (opened[c.key] = !open)} disabled={i === 0}>
          <span class="cs-arrow" aria-hidden="true">↗</span>
          <span class="cs-to" dir="auto">{sendWords.sentTo(c.to.label)}</span>
          <span class="cs-sep" aria-hidden="true">{' · '}</span>
          <span class="cs-when">{ago(c.at, now)}</span>
          <span class="cs-sep" aria-hidden="true">{' · '}</span>
          <span class="cs-state" data-dot={w.dot ?? undefined}>{w.word}{#if w.dot && w.dot !== 'done'}<span class="cs-dot" aria-hidden="true"></span>{/if}</span>
        </button>
        {#if open}
          {#if c.progress && c.state !== null && !ENDED.has(c.state)}<p class="cs-progress" dir="auto">{c.progress}</p>{/if}
          {#each c.turns as t, n (n)}
            {#if t.role === 'you'}
              <p class="cs-you" dir="auto">{t.text}</p>
            {:else}
              {#if t.streaming && t.text === '' && t.steps.length > 0}<p class="cs-step">{t.steps.at(-1)}</p>{/if}
              {#if t.text}<p class="cs-said" dir="auto">{t.text}</p>{/if}
              {#if t.error}<p class="cs-fix" role="status">{t.error}</p>{/if}
              {#if t.route === 'mac' && !t.streaming}
                <p class="cs-route">
                  <button type="button" class="cs-act tap" onclick={(e) => toMac(e.currentTarget)}>{sendWords.toMac('Claude on your Mac')}</button>
                </p>
              {/if}
              {#each t.actions.filter((a) => a.kind === 'ask' && (a.state === 'open' || a.state === 'busy')) as a (a.id)}
                <div class="cs-ask">
                  <span class="cs-ask-title" dir="auto">{a.title}</span>
                  <button type="button" class="cs-act tap" disabled={a.state === 'busy'} onclick={() => void answerAct(c, a, true)}>{sendWords.doIt}</button>
                  <button type="button" class="cs-act cs-bare tap" disabled={a.state === 'busy'} onclick={() => void answerAct(c, a, false)}>{sendWords.notNow}</button>
                  {#if a.note}<span class="cs-fix">{a.note}</span>{/if}
                </div>
              {/each}
            {/if}
          {/each}
          {#if c.receipts.length > 0}
            <ul class="cs-receipts">
              {#each c.receipts as k (k.batch)}
                <li class="cs-receipt" data-undone={k.state === 'undone' ? '' : undefined}>
                  <Icon name={k.state === 'undone' ? 'history' : 'check'} size="s" />
                  <span dir="auto">{k.said}</span>
                  {#if k.state !== 'undone'}<button type="button" class="cs-act cs-bare tap" disabled={k.state === 'busy'} onclick={() => void undoKept(k)}>{sendWords.undo}</button>{/if}
                  {#if k.note}<span class="cs-fix">{k.note}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if c.fix}<p class="cs-fix" role="status">{c.fix}</p>{/if}
          <div class="cs-foot">
            <form class="cs-reply" onsubmit={(e) => reply(c, e)}>
              <input
                class="cs-input"
                type="text"
                aria-label={sendWords.reply}
                placeholder={sendWords.replyPlaceholder}
                autocomplete="off"
                enterkeyhint="send"
                disabled={busy(c)}
                bind:value={drafts[c.key]}
              />
              <button type="submit" class="cs-act tap" disabled={busy(c)}>{sendWords.reply}</button>
            </form>
            {#if c.via === 'agent' && c.state === 'sent'}
              <button type="button" class="cs-act cs-bare tap" onclick={() => void withdrawConvo(c)}>{sendWords.withdraw}</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  /* A THIN STRIP: a 2px rule at its start, no tile of its own, the line in 13 and the answer in 15. */
  .cs {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--rule-strong);
  }

  .cs-one {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .cs-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    text-align: start;
    cursor: pointer;
  }

  .cs-line:disabled {
    cursor: default;
  }

  /* A LINE THAT OPENS IS A 44 TARGET UNDER A THUMB, its drawn 19 unchanged. The first is always open and takes no press. */
  @media (pointer: coarse) {
    .cs-line:not(:disabled) {
      position: relative;
    }

    .cs-line:not(:disabled)::before {
      content: '';
      position: absolute;
      inset-block: calc((100% - var(--tap)) / 2);
      inset-inline: 0;
    }
  }

  .cs-to {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .cs-arrow,
  .cs-sep {
    color: var(--ink-3);
  }

  .cs-state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .cs-state[data-dot='needs'] {
    color: var(--red);
  }

  .cs-dot {
    inline-size: 7px;
    block-size: 7px;
    background: var(--live);
    border-radius: var(--r-round);
  }

  .cs-state[data-dot='needs'] .cs-dot {
    background: var(--red);
  }

  .cs-progress,
  .cs-step,
  .cs-you {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .cs-you {
    color: var(--ink-3);
  }

  .cs-said {
    margin: 0;
    max-inline-size: var(--measure);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .cs-fix {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .cs-route,
  .cs-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
  }

  .cs-ask-title {
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
  }

  .cs-receipts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cs-receipt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-ctl);
  }

  .cs-receipt :global(.icon) {
    color: var(--ink-3);
  }

  .cs-receipt[data-undone] {
    color: var(--ink-3);
  }

  .cs-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .cs-reply {
    display: flex;
    flex: 1;
    gap: var(--sp-2);
    min-inline-size: 220px;
    max-inline-size: var(--measure);
  }

  .cs-input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-2);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  /* THE STRIP'S VERBS ARE THE SMALL QUIET RECTANGLE, and the ones that only answer are bare. */
  .cs-act {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-2);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .cs-bare {
    background: none;
    color: var(--ink-2);
  }

  .cs-act:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    .cs-act:hover:not(:disabled) {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .cs-act,
    .cs-input {
      min-block-size: var(--tap);
    }
  }
</style>
