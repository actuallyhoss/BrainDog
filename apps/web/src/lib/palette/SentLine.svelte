<!--
  A message Slash sent to an agent, followed in the thread: what was said, whether it arrived, what the agent is at, what
  came back, and the way to its run.

  READ AGAIN WHEN THE RECORD'S VERSION MOVES (`live.version`), which an agent seeing it, taking it or replying does, and
  never after it has ended or while the panel holding it is closed (`resting`). No timer of its own.

  WHAT COMES BACK IS DRAWN AS TEXT AND GOES NOWHERE ELSE. It is the agent's words: this reads them to the person, and
  Slash's model reads them only if asked, marked as an agent's (`told`).
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { live } from '../data/live.svelte.ts';
  import { ENDED, one, stateWords, type Sent, type SendState } from '../send/send.ts';
  import { agentsNow, isQuietNow, readAgents, sinceSaid } from './agents-now.svelte.ts';
  import type { ChatSent } from './slash-chat.ts';

  let { sent, base, resting = false }: { sent: ChatSent; base: string; resting?: boolean } = $props();

  const words = {
    label: 'What happened to it',
    it: 'It said',
    open: 'Open the run',
    notSeen: 'Not seen yet.',
    quiet: (since: string) => `It was last heard ${since} ago, so it may not see this soon.`,
    gone: 'It has stopped answering, so this waits until it comes back.',
    waiting: 'It waits for the next agent to start.',
  } as const;

  let now = $state<Sent | null>(null);
  const stands = $derived<SendState>(now?.state ?? 'sent');
  const ended = $derived(ENDED.has(stands));
  const runId = $derived(now?.run ?? sent.run ?? null);
  const href = $derived(runId !== null && /^S[1-9][0-9]*$/u.test(runId) ? `/r/session/${runId.slice(1)}` : null);

  /* AT MOST ONE READ IN THIS LONG, whatever the version does, and the last move is read a beat late. */
  const EVERY_MS = 4000;
  let lastRead = 0;
  $effect(() => {
    void live.version;
    if (ended || resting) return;
    const read = (): void => {
      lastRead = Date.now();
      void one(base, sent.id).then((got) => {
        if (got) now = got;
      });
      if (sent.run) void readAgents(base);
    };
    const wait = EVERY_MS - (Date.now() - lastRead);
    if (wait <= 0) return read();
    const t = setTimeout(read, wait);
    return () => clearTimeout(t);
  });

  /* NOT SEEN YET: where the run stands now, read from who is running, so a run gone quiet mid-question says so. */
  const hint = $derived.by((): string | null => {
    if (stands !== 'sent' || now?.progress) return null;
    if (!sent.run) return words.waiting;
    if (!agentsNow.read) return words.notSeen;
    const r = agentsNow.rows.find((x) => x.run === sent.run);
    if (!r) return words.gone;
    const t = Date.now();
    return isQuietNow(r, t) ? words.quiet(sinceSaid(r, t)) : words.notSeen;
  });
</script>

<div class="sl" aria-label={words.label} data-state={stands}>
  {#if sent.said}<p class="sl-said" dir="auto">{sent.said}</p>{/if}
  <p class="sl-state" role="status">
    <span class="sl-mark" aria-hidden="true"></span>
    <span class="sl-word">{stateWords[stands]}</span>
    {#if now?.progress && !ended}<span class="sl-doing" dir="auto">{now.progress}</span>{/if}
    {#if hint}<span class="sl-doing">{hint}</span>{/if}
    {#if href}<a class="sl-open tap" href={at(href)}>{words.open}</a>{/if}
  </p>
  {#if now?.reply}
    <div class="sl-reply">
      <p class="sl-it">{words.it}</p>
      <p class="sl-words" dir="auto">{now.reply}</p>
    </div>
  {/if}
</div>

<style>
  .sl {
    display: grid;
    gap: var(--sp-1);
    margin-block-start: var(--sp-1);
    max-inline-size: var(--measure);
    grid-column: 1 / -1;
  }

  .sl p {
    margin: 0;
  }

  .sl-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .sl-state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .sl-mark {
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    box-shadow: inset 0 0 0 1px var(--ink-3);
  }

  .sl[data-state='seen'] .sl-mark,
  .sl[data-state='working'] .sl-mark {
    background: var(--live);
    box-shadow: none;
  }

  .sl[data-state='done'] .sl-mark {
    background: var(--ink);
    box-shadow: none;
  }

  .sl[data-state='needs_you'] .sl-mark,
  .sl[data-state='declined'] .sl-mark,
  .sl[data-state='expired'] .sl-mark {
    background: var(--warn);
    box-shadow: none;
  }

  .sl-word {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .sl-doing {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .sl-open {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
    text-underline-offset: 3px;
  }

  .sl-reply {
    padding-inline-start: var(--sp-2);
    border-inline-start: 2px solid var(--rule);
  }

  .sl-it {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .sl-words {
    max-block-size: 14rem;
    overflow-y: auto;
    color: var(--ink);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
