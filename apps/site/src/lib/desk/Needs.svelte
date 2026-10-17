<!--
  The desk's Needs you: what waits for Maya's yes, beside what was handled today, each with an undo.

  THE ASKS ARE SHARED (`needs.svelte.ts`) with the tab's count and the home page's red card. Yes moves an ask across
  with its done line and an Undo; Not now drops it with none; Undo puts it back in its first place. The answer
  buttons work only with scripting, so they are left out of the page a reader gets without it, and every ask and
  every handled line is still there to read.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { HANDLED, NEEDS } from '../demo/maya.ts';
  import { needs } from './needs.svelte.ts';
  import { DESK } from './words.ts';

  let leaving = $state<string | null>(null);
  let undone = $state<number[]>([]);
  let list: HTMLDivElement;

  const open = $derived(NEEDS.filter((n) => needs.open.includes(n.id)));
  const done = $derived(needs.done.map((id) => NEEDS.find((n) => n.id === id)!).filter(Boolean));

  function answer(id: string, yes: boolean): void {
    let reduced = false;
    try {
      reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
    leaving = id;
    setTimeout(
      () => {
        needs.answer(id, yes);
        leaving = null;
        list?.focus({ preventScroll: true });
      },
      reduced ? 0 : 260,
    );
  }
</script>

<div class="grid">
  <div class="t s7" bind:this={list} tabindex="-1">
    <p class="th">
      <span class="dotr" aria-hidden="true"></span>{DESK.needs.title}<span class="r"
        >{open.length ? DESK.waiting(open.length) : DESK.needs.clear}</span
      >
    </p>
    {#each open as n (n.id)}
      <div class="q" class:gone={leaving === n.id}>
        <div class="by"><span class="kind">{n.kind}</span>· {DESK.needs.asked} {n.by}</div>
        <div class="ask">{n.ask}</div>
        <p class="why">{n.why}</p>
        <div class="acts desk-js">
          <button type="button" class="dbtn" data-tone="tint" onclick={() => answer(n.id, true)}>{n.yes}</button>
          <button type="button" class="dbtn" data-tone="quiet" onclick={() => answer(n.id, false)}>{n.no}</button>
        </div>
      </div>
    {:else}
      <p class="empty">{DESK.needs.empty}</p>
    {/each}
  </div>

  <div class="t s5">
    <p class="th"><Icon name="check" />{DESK.needs.handled}<span class="r">{DESK.needs.withUndo}</span></p>
    {#each done as n (n.id)}
      <div class="h-item fresh">
        <Icon name="check" />
        <p>{n.done}</p>
        <button type="button" class="undo desk-js" onclick={() => needs.undo(n.id)}>{DESK.needs.undo}</button>
      </div>
    {/each}
    {#each HANDLED as h, i}
      {#if !undone.includes(i)}
        <div class="h-item">
          <Icon name="check" />
          <p>{h.text}<span class="tag"> · {h.why}</span></p>
          <button type="button" class="undo desk-js" onclick={() => (undone = [...undone, i])}>{DESK.needs.undo}</button>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .t:focus {
    /* focus-ok: tabindex="-1", a landing place for focus once an ask leaves, never a control; every button inside keeps its own ring. */
    outline: none;
  }

  .q {
    display: grid;
    gap: 8px;
    padding: 14px 0;
    border-block-start: 1px solid var(--rule2);
  }

  .th + .q {
    border-block-start: 0;
    padding-block-start: 2px;
  }

  .by {
    font-size: var(--t-app-xs);
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .kind {
    font-weight: 600;
    color: var(--red-ink);
  }

  .ask {
    font-size: var(--t-site-16);
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  .why {
    font-size: var(--t-app-sm);
    color: var(--ink2);
    margin: 0;
  }

  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 2px;
  }

  .q.gone {
    animation: out 0.3s ease both;
  }

  @keyframes out {
    to {
      opacity: 0;
      transform: translateX(14px);
    }
  }

  .h-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-block-start: 1px solid var(--rule2);
    font-size: var(--t-app-sm);
    color: var(--good);
  }

  .th + .h-item {
    border-block-start: 0;
  }

  .h-item p {
    margin: 0;
    flex: 1;
    min-width: 0;
    color: var(--ink);
  }

  .undo {
    all: unset;
    cursor: pointer;
    font-size: var(--t-app-sm);
    font-weight: 500;
    color: var(--red-ink);
  }

  .undo:hover {
    text-decoration: underline;
  }

  .undo:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .h-item.fresh {
    animation: land 0.5s ease both;
  }

  @keyframes land {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .empty {
    color: var(--muted);
    font-size: var(--t-app-sm);
    padding: 10px 0 2px;
    margin: 0;
  }

  @media (pointer: coarse) {
    .undo {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      padding: 0 6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .q.gone,
    .h-item.fresh {
      animation: none;
    }
  }
</style>
