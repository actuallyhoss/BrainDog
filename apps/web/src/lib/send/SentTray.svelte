<!--
  The bell's "Sent": everything handed to an agent and not finished, newest first, with where each stands. A line opens
  the row it was sent from; Withdraw takes one back while no agent has it yet. Read when the bell opens and every few
  seconds while it stays open. A host with no such door, or nothing in flight, draws nothing here: the bell is calm.
  Its lines are the bell's to walk with the arrows (`data-bell-item`).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase, at } from '../at.ts';
  import { byId } from './convos.svelte.ts';
  import { POLL_MS, hrefOfRef, open as readOpen, sendWords, stateWords, withdraw, type Sent } from './send.ts';

  let list = $state<Sent[] | null | undefined>(undefined);
  let busy = $state<string | null>(null);

  async function read() {
    const got = await readOpen(apiBase());
    list = got;
  }

  onMount(() => {
    void read();
    const every = setInterval(() => void read(), POLL_MS);
    return () => clearInterval(every);
  });

  /** What a line says: the target and the row, from what this device sent, else the agent's own progress. */
  function said(s: Sent): { text: string; href: string | null } {
    const c = byId(s.id);
    const row = c?.refs.map(hrefOfRef).find((h) => h !== null) ?? null;
    const first = c?.turns.find((t) => t.role === 'you')?.text;
    return { text: c ? `${c.to.label}${first ? `: ${first}` : ''}` : (s.progress ?? sendWords.tray), href: row };
  }

  async function take(s: Sent) {
    busy = s.id;
    const out = await withdraw(apiBase(), s.id);
    busy = null;
    if (out.ok) {
      const c = byId(s.id);
      if (c) c.state = 'withdrawn';
      void read();
    }
  }
</script>

{#if list && list.length > 0}
  <h3 class="st-head">{sendWords.tray}</h3>
  {#each list.slice(0, 6) as s (s.id)}
    {@const line = said(s)}
    {#if line.href}
      <a class="st-mi" data-bell-item href={at(line.href)}>
        <span class="st-dot" data-state={s.state} aria-hidden="true"></span><span class="mi-name" dir="auto">{line.text}</span><span class="st-state">{stateWords[s.state]}</span>
      </a>
    {:else}
      <span class="st-mi" aria-disabled="true">
        <span class="st-dot" data-state={s.state} aria-hidden="true"></span><span class="mi-name" dir="auto">{line.text}</span><span class="st-state">{stateWords[s.state]}</span>
      </span>
    {/if}
    {#if s.state === 'sent'}
      <button type="button" class="st-mi st-take" data-bell-item disabled={busy === s.id} onclick={() => void take(s)}>{sendWords.withdraw}</button>
    {/if}
  {/each}
{/if}

<style>
  /* AS THE BELL'S DAYS ARE HEADED: 13 in the quiet ink. */
  .st-head {
    margin: 0;
    padding-block: var(--sp-3) var(--sp-1);
    padding-inline: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* AS THE BELL'S ROWS ARE DRAWN: 36 tall, 14, the hover under the pointer, the ring inside the row. */
  .st-mi {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 36px;
    padding-inline: var(--sp-3);
    appearance: none;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    text-align: start;
    text-decoration: none;
  }

  a.st-mi,
  button.st-mi {
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    a.st-mi:hover,
    button.st-mi:hover:not(:disabled) {
      background: var(--hover);
    }
  }

  .st-mi:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .st-mi .mi-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .st-state {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .st-take {
    padding-inline-start: calc(var(--sp-3) + 7px + var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .st-dot {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    background: var(--ink-3);
    border-radius: var(--r-round);
  }

  .st-dot[data-state='working'],
  .st-dot[data-state='seen'] {
    background: var(--live);
  }

  .st-dot[data-state='needs_you'] {
    background: var(--red);
  }
</style>
