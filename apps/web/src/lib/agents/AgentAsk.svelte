<!--
  A question an agent asked him, answered where he reads it (the Agents page of 24 Nov): Today's Needs you and the Needs
  you page draw each one as the question on one line in the agent's words, who asks and on which project, and the
  answer in place: Yes and No for a yes or no question, and a box for anything else. Never the agent's whole message.

  HIS ANSWER IS THE THREAD'S NEXT WORD (`sendReply`), to the run that asked while it is open, so it lands in the same
  conversation on the Agents page and the agent hears it at its next step. The question leaves the list at once; a
  refusal puts it back with the record's reason under it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { control, type Project } from '$lib/record/instruct.ts';
  import type { ToldNeed } from '$lib/record/told-live.ts';
  import { heardTold, toldNow } from '$lib/home/told-now.svelte.ts';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import { agentKindOf } from '$lib/ui/face.ts';

  let { need, thread = null, compact = false }: { need: ToldNeed; thread?: string | null; compact?: boolean } = $props();

  const words = {
    reply: 'Reply',
    send: 'Send',
    sending: 'Sending',
    box: (who: string) => `Answer ${who}`,
    open: 'Open the thread',
  } as const;

  const uid = $props.id();
  let said = $state('');
  let writing = $state(false);
  let busy = $state(false);
  let fault = $state<string | null>(null);
  let project = $state<string | null>(null);

  /* THE PROJECT BY NAME, from the tab's own walk of the projects (`control().projects`), once a card is drawn. */
  $effect(() => {
    const key = need.project;
    if (key === null) return;
    void control(apiBase())
      .projects([{ project: key } as never])
      .then((m: Map<string, Project>) => (project = m.get(key)?.name ?? null))
      .catch(() => undefined);
  });

  async function answer(text: string): Promise<void> {
    const note = text.trim();
    if (note === '' || busy) return;
    busy = true;
    fault = null;
    const before = toldNow();
    /* IT LEAVES THE LIST AT ONCE, as a press anywhere in Needs you does. */
    heardTold({ ...before, needs: before.needs.filter((t) => t.id !== need.key) });
    try {
      const out = await control(apiBase()).reply(need.key, note);
      if (!out.ok) {
        heardTold(before);
        fault = out.fix;
      } else said = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="ask" data-compact={compact ? '' : undefined} aria-busy={busy ? 'true' : undefined}>
  <span class="ask-face" aria-hidden="true"><AgentMark kind={agentKindOf(need.agent)} size="s" /></span>
  <div class="ask-body">
    <p class="ask-q" dir="auto">{need.line}</p>
    <p class="ask-who">{need.who}{#if project}{' · '}{project}{/if}{#if thread}{' · '}<a class="ask-link" href={at(thread)}>{words.open}</a>{/if}</p>
    <form class="ask-do" aria-label={words.box(need.who)} onsubmit={(e) => (e.preventDefault(), void answer(said))}>
      {#each need.quick as q (q)}<button type="button" class="ask-btn" disabled={busy} onclick={() => void answer(q)}>{q}</button>{/each}
      {#if need.quick.length === 0 || writing}
        <label class="sr" for="{uid}-said">{words.box(need.who)}</label>
        <input id="{uid}-said" class="ask-input" type="text" bind:value={said} maxlength="2000" autocomplete="off" enterkeyhint="send" placeholder="{words.box(need.who)}…" />
        <button type="submit" class="ask-btn" data-weight="send" disabled={busy}>{busy ? words.sending : words.send}</button>
      {:else}
        <button type="button" class="ask-btn" data-weight="quiet" onclick={() => (writing = true)}>{words.reply}</button>
      {/if}
    </form>
    {#if fault}<p class="ask-fault" role="alert">{fault}</p>{/if}
  </div>
</div>

<style>
  .ask {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .ask-face {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .ask-body {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .ask-q {
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: calc(22px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ON A PHONE THE QUESTION WRAPS, up to three lines: cut to one, what it asks fell off the end. */
  @media (width < 640px) {
    .ask-q {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      white-space: normal;
    }
  }

  .ask-who {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .ask-link {
    color: var(--ink-2);
    text-decoration: none;
  }

  .ask-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .ask-input {
    flex: 1 1 200px;
    box-sizing: border-box;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .ask-input::placeholder {
    color: var(--ink-3);
  }

  .ask-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: var(--ctl-h);
    min-inline-size: 64px;
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .ask-btn[data-weight='send'] {
    background: var(--ink);
    color: var(--tile);
  }

  .ask-btn[data-weight='quiet'] {
    min-inline-size: 0;
    background: transparent;
    color: var(--ink-2);
  }

  .ask-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .ask-btn:focus-visible,
  .ask-input:focus-visible,
  .ask-link:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .ask-btn:not([data-weight='send']):hover {
      background: var(--hover);
    }

    .ask-link:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  @media (pointer: coarse) {
    .ask-btn,
    .ask-input {
      min-block-size: var(--tap, 44px);
    }
  }

  .ask-fault {
    margin: var(--sp-1) 0 0;
    color: var(--red);
    font-size: var(--fs-meta);
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
