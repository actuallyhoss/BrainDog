<!--
  The red card: "It does the chores. You make the calls." What waits for Maya beside what got done on its own, with
  counts. Answer an ask and it moves across with an Undo; the desk's Needs you count follows, because both read one
  store (`lib/desk/needs.svelte.ts`). Under them, the floor no rule and no agent can lower.

  FINISHED WITHOUT SCRIPTING. The HTML holds all three asks and all four chores, each with its reason. The answer
  and Undo buttons are drawn only once the script runs, so a reader without it meets no control that does nothing.
  The words are `copy/home.ts`; the asks and chores are Maya's record, `demo/maya.ts`.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { HANDLED, NEEDS } from '$lib/demo/maya.ts';
  import { needs } from '$lib/desk/needs.svelte.ts';

  const words = home.cards.chores;
  const byId = new Map(NEEDS.map((n) => [n.id, n]));

  const open = $derived(needs.open.map((id) => byId.get(id)).filter((n) => n !== undefined));
  const done = $derived(needs.done.map((id) => byId.get(id)).filter((n) => n !== undefined));

  /* A chore undone here leaves the list: the drawing's undo, as the app's puts the thing back where it was. */
  const undone = new SvelteSet<number>();
  const chores = $derived(HANDLED.map((c, i) => ({ ...c, i })).filter((c) => !undone.has(c.i)));

  let live = $state(false);
  $effect(() => {
    live = true;
  });

  /* FOCUS FOLLOWS THE ASK, so a keyboard reader is never left on a button that has gone. */
  let card: HTMLElement | undefined = $state();
  async function answer(id: string, yes: boolean) {
    needs.answer(id, yes);
    await tick();
    const next = yes ? card?.querySelector<HTMLElement>(`[data-undo="${id}"]`) : card?.querySelector<HTMLElement>('.waits');
    next?.focus();
  }
  async function undo(id: string) {
    needs.undo(id);
    await tick();
    card?.querySelector<HTMLElement>(`[data-ask="${id}"] button`)?.focus();
  }
</script>

<article class="card redc reveal chores-card" aria-labelledby="chores-title" bind:this={card}>
  <div class="top-head">
    <h2 id="chores-title">{words.title}</h2>
    <p class="say">{words.say}</p>
  </div>
  <div class="body">
    <div class="wait">
      <p class="th waits" tabindex="-1"><span class="dot" aria-hidden="true"></span>{words.waits}<span class="r num">{words.waiting(open.length)}</span></p>
      {#if open.length === 0}
        <p class="empty">{words.empty}</p>
      {:else}
        <ul class="asks">
          {#each open as ask (ask.id)}
            <li class="ask" data-ask={ask.id}>
              <p class="by"><span class="kind">{ask.kind}</span> · {words.askedBy} {ask.by}</p>
              <p class="q">{ask.ask}</p>
              <p class="why">{ask.why}</p>
              {#if live}
                <div class="acts">
                  <button type="button" class="btn tint sm" onclick={() => answer(ask.id, true)}>{ask.yes}</button>
                  <button type="button" class="btn quiet sm" onclick={() => answer(ask.id, false)}>{ask.no}</button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="done">
      <p class="th"><Icon name="check" size="s" />{words.done}<span class="r num">{words.today(chores.length + done.length)}</span></p>
      <ul class="items" aria-live="polite">
        {#each done as ask (ask.id)}
          <li class="item fresh">
            <Icon name="check" size="s" />
            <p>{ask.done}</p>
            {#if live}<button type="button" class="undo" data-undo={ask.id} onclick={() => undo(ask.id)}>{words.undo}</button>{/if}
          </li>
        {/each}
        {#each chores as chore (chore.i)}
          <li class="item">
            <Icon name="check" size="s" />
            <p>{chore.text}<span class="tag"> · {chore.why}</span></p>
            {#if live}<button type="button" class="undo" onclick={() => undone.add(chore.i)}>{words.undo}</button>{/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
  <p class="floor">
    <Icon name="lock" size="m" />
    <b>{words.floor} <span>{words.floorMore}</span></b>
  </p>
</article>

<style>
  .top-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 40px;
    margin-block-end: 40px;
    flex-wrap: wrap;
  }

  .top-head .say {
    margin: 0;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 40px;
    align-items: start;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  p {
    margin: 0;
  }

  .th {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 600 13.5px/1.2 var(--ui);
  }

  .th .r {
    margin-inline-start: auto;
    font-weight: 600;
  }

  .th:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 4px;
  }

  /* WHAT WAITS, on a white tile inside the red card. */
  .wait {
    background: var(--tile);
    color: var(--ink);
    border-radius: 20px;
    padding: 22px;
    min-width: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--red);
    flex: none;
  }

  .ask {
    display: grid;
    gap: 8px;
    padding: 14px 0;
    border-block-start: 1px solid var(--rule2);
  }

  .ask:first-child {
    border-block-start: 0;
    padding-block-start: 2px;
  }

  .by {
    font-size: var(--t-app-xs);
    color: var(--muted);
  }

  .kind {
    font-weight: 600;
    color: var(--red-ink);
  }

  .q {
    font-size: var(--t-site-16);
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  .why {
    font-size: var(--t-app-sm);
    color: var(--ink2);
  }

  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 2px;
  }

  .empty {
    color: var(--muted);
    font-size: var(--t-app-sm);
    padding: 10px 0 2px;
  }

  /* WHAT GOT DONE, on the red ground itself. */
  .done .th {
    color: var(--on-red);
    margin: 20px 0 4px;
    padding-block-end: 12px;
    border-block-end: 1px solid var(--red-rule);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-block-start: 1px solid var(--red-rule);
    font-size: var(--t-site-small);
    color: var(--on-red);
  }

  .item:first-child {
    border-block-start: 0;
  }

  .item p {
    flex: 1;
    min-width: 0;
  }

  .tag {
    font-size: var(--t-app-xs);
    color: var(--on-red);
  }

  .undo {
    all: unset;
    cursor: pointer;
    font-size: var(--t-app-sm);
    font-weight: 500;
    color: var(--on-red);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .undo:focus-visible {
    outline: 2px solid var(--on-red);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .fresh {
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

  /* THE FLOOR, one line under both. */
  .floor {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 40px 0 0;
    padding-block-start: 24px;
    border-block-start: 1px solid var(--red-rule);
    font-size: var(--t-site-16-5);
    line-height: 1.5;
    color: var(--on-red);
  }

  .floor :global(.icon) {
    margin-block-start: 3px;
  }

  .floor span {
    color: var(--on-red);
  }

  @media (pointer: coarse) {
    .undo {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      padding-inline: 6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
  }

  @media (max-width: 1060px) {
    .body {
      grid-template-columns: 1fr;
      gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .wait {
      padding: 16px;
    }

    .top-head {
      gap: 18px;
      margin-block-end: 28px;
    }
  }
</style>
