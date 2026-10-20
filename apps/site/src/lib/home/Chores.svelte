<!--
  The red band: "It does the chores. You make the calls." (site 2a section 3). What waits for a person, on a tile,
  beside what got done on its own, on the red itself; under both, the floor no rule and no AI tool can lower.

  THE QUESTIONS HERE ARE NOT THE DESK'S (site F1): the desk's Today already shows Northbound and Dana, so this band
  asks the two only a person decides (a merge and a key), from their own store (`asked` in `desk/needs.svelte.ts`).
  Answer yes and the question moves across with an Undo, a 200ms slide and nothing else (site F25).

  FINISHED WITHOUT SCRIPTING. The HTML holds both questions and all four chores, each with its reason. The answer and
  Undo buttons are drawn only once the script runs, so a reader without it meets no control that does nothing.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { ASKED, HANDLED } from '$lib/demo/maya.ts';
  import { asked } from '$lib/desk/needs.svelte.ts';

  const words = home.chores;
  const byId = new Map(ASKED.map((n) => [n.id, n]));

  const open = $derived(asked.open.map((id) => byId.get(id)).filter((n) => n !== undefined));
  const done = $derived(asked.done.map((id) => byId.get(id)).filter((n) => n !== undefined));

  /* A chore undone here leaves the list: the drawing's undo, as the app's puts the thing back where it was. */
  const undone = new SvelteSet<number>();
  const chores = $derived(HANDLED.map((c, i) => ({ ...c, i })).filter((c) => !undone.has(c.i)));

  let live = $state(false);
  $effect(() => {
    live = true;
  });

  /* FOCUS FOLLOWS THE QUESTION, so a keyboard reader is never left on a button that has gone. */
  let band: HTMLElement | undefined = $state();
  async function answer(id: string, yes: boolean) {
    asked.answer(id, yes);
    await tick();
    const next = yes ? band?.querySelector<HTMLElement>(`[data-undo="${id}"]`) : band?.querySelector<HTMLElement>('.waits');
    next?.focus();
  }
  async function undo(id: string) {
    asked.undo(id);
    await tick();
    band?.querySelector<HTMLElement>(`[data-ask="${id}"] button`)?.focus();
  }
</script>

<section class="band band--chores" aria-labelledby="chores-title" bind:this={band}>
  <div class="wrap reveal">
    <div class="cols head">
      <h2 id="chores-title" class="band-h2 c7">{words.title}</h2>
      <p class="band-say c5">{words.say}</p>
    </div>
    <div class="cols body">
      <div class="ftile wait c7">
        <p class="hd waits" tabindex="-1">{words.waits}<span class="n num">{open.length}</span></p>
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
                    <button type="button" class="btn red sm" onclick={() => answer(ask.id, true)}>{ask.yes}</button>
                    <button type="button" class="btn line sm" onclick={() => answer(ask.id, false)}>{ask.no}</button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="done c5">
        <p class="hd"><Icon name="check" size="s" />{words.done}<span class="n num">{words.today(chores.length + done.length)}</span></p>
        <ul class="items" aria-live="polite">
          {#each done as ask (ask.id)}
            <li class="item fresh">
              <p>{ask.done}</p>
              {#if live}<button type="button" class="undo" data-undo={ask.id} onclick={() => undo(ask.id)}>{words.undo}</button>{/if}
            </li>
          {/each}
          {#each chores as chore (chore.i)}
            <li class="item">
              <p>{chore.text}<span class="why2">{chore.why}</span></p>
              {#if live}<button type="button" class="undo" onclick={() => undone.add(chore.i)}>{words.undo}</button>{/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>
    <p class="floor"><Icon name="lock" size="m" /><b>{words.floor}</b></p>
  </div>
</section>

<style>
  .head {
    align-items: end;
  }

  .head .band-say {
    margin: 0;
  }

  .body {
    align-items: start;
    margin-block-start: 32px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  p {
    margin: 0;
  }

  .hd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font: 600 15px/1.2 var(--ui);
  }

  .n {
    margin-inline-start: auto;
    font-weight: 500;
  }

  .hd:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 4px;
  }

  /* WHAT WAITS, on its tile on the red. */
  .wait {
    background: var(--band-red-tile);
    color: var(--ink);
  }

  .wait .n {
    color: var(--muted);
  }

  .ask {
    display: grid;
    gap: 2px;
    padding: 12px 0;
    border-block-start: 1px solid var(--rule);
  }

  .ask:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .ask:last-child {
    padding-block-end: 0;
  }

  .by {
    color: var(--muted);
    font-size: 13px;
  }

  .kind {
    color: var(--ink2);
    font-weight: 600;
  }

  .q {
    font-size: 16px;
    font-weight: 600;
  }

  .why {
    color: var(--ink2);
    font-size: 14px;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 8px;
  }

  .empty {
    color: var(--muted);
    font-size: 14px;
  }

  /* WHAT GOT DONE, on the red ground itself; each reason on its own line at 13px, full white (site F23). */
  .done {
    color: var(--on-red);
  }

  .done .hd {
    padding-block: 8px 12px;
    margin: 0;
    border-block-end: 1px solid var(--red-rule);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-block-end: 1px solid var(--red-rule);
    font-size: 15px;
  }

  .item p {
    flex: 1;
    min-inline-size: 0;
  }

  .why2 {
    display: block;
    margin-block-start: 2px;
    font-size: 13px;
    font-weight: 400;
  }

  .undo {
    all: unset;
    cursor: pointer;
    color: var(--on-red);
    font-size: 14px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .undo:focus-visible {
    outline: 2px solid var(--on-red);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .fresh {
    animation: across 200ms ease-out both;
  }

  @keyframes across {
    from {
      translate: -12px 0;
    }
    to {
      translate: 0 0;
    }
  }

  /* THE FLOOR, one line under both. */
  .floor {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin-block-start: 24px;
    padding-block-start: 20px;
    border-block-start: 1px solid var(--red-rule);
    font-size: 17px;
    line-height: 1.5;
  }

  .floor :global(.icon) {
    margin-block-start: 3px;
  }

  .floor b {
    font-weight: 600;
  }

  @media (pointer: coarse) {
    .undo {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
      padding-inline: 6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
  }

  @media (max-width: 1059px) {
    .head .band-say {
      margin-block-start: 16px;
    }
  }

  @media (max-width: 760px) {
    .body {
      margin-block-start: 28px;
    }

    /* ON A PHONE, ONE QUESTION AT A TIME AND TWO CHORES: answering one brings the next up. */
    .ask:nth-child(n + 2),
    .item:nth-child(n + 3) {
      display: none;
    }
  }
</style>
