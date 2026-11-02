<!--
  The chores band: "It does the filing, you make the calls, and it stays yours." (site 2a sections 3 and 6, one band
  since plan F12: eight bands was too many for a page whose job is one ask). UNDER THE DRAWING, WHAT KEEPS IT YOURS: the
  floor and the three promises of "It stays yours", four short lines in a row, and the way to how it is kept safe. What waits for a person, on a tile,
  beside what got done on its own, on the band's grey; under both, the floor no rule and no AI tool can lower. The band
  was red until 1 Nov; the only solid red on a page is Start free now, so the answer is ink as the app draws one.

  THE QUESTIONS HERE ARE NOT THE DESK'S: the desk's Today already shows Northbound and Dana, so this band
  asks the two only a person decides (a merge and a key), from their own store (`asked` in `desk/needs.svelte.ts`).
  Answer yes and the question moves across with an Undo, a 200ms slide and nothing else. One question is drawn
  at a time, and a line under it says how many more wait, so the count beside the heading is one a reader can see.

  FINISHED WITHOUT SCRIPTING. The HTML holds both questions and all four chores, each with its reason. The answer and
  Undo buttons are drawn only once the script runs, so a reader without it meets no control that does nothing.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '$lib/Icon.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { home } from '$lib/copy/home.ts';
  import { ASKED, HANDLED } from '$lib/demo/maya.ts';
  import { asked } from '$lib/desk/needs.svelte.ts';

  const words = home.chores;
  const y = home.yours;
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
                    <button type="button" class="btn ink sm" onclick={() => answer(ask.id, true)}>{ask.yes}</button>
                    <button type="button" class="btn line sm" onclick={() => answer(ask.id, false)}>{ask.no}</button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          {#if open.length > 1}<p class="after">{words.after(open.length - 1)}</p>{/if}
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
    <ul class="keeps">
      <li class="floor"><Icon name="lock" size="m" /><b>{words.floor}</b></li>
      {#each y.points as point (point.text)}
        <li><Icon name={point.icon as IconName} size="m" />{point.text}</li>
      {/each}
    </ul>
    <p class="on"><a class="onward" href={y.href}>{y.link}<Icon name="arrow-right" size="s" /></a></p>
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
    margin-block-start: var(--head-gap);
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

  /* WHAT WAITS, on its tile on the band. */
  .wait {
    background: var(--band-yours-tile);
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
    font-size: var(--t-site-13);
  }

  .kind {
    color: var(--ink2);
    font-weight: 600;
  }

  .q {
    font-size: var(--t-site-16);
    font-weight: 600;
  }

  .why {
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .after {
    margin-block-start: 12px;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 8px;
  }

  .empty {
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  /* WHAT GOT DONE, on the band's ground itself; each reason on its own line at 13px, in the second ink. Its heading
     sits on the line the tile's heading beside it sits on: the tile's padding less the heading's own 8 above it. */
  .done {
    color: var(--ink);
  }

  @media (width >= 1060px) {
    .done {
      padding-block-start: calc(var(--site-tile-pad) - 8px);
    }
  }

  .done .hd .n,
  .why2 {
    color: var(--ink2);
  }

  .done .hd {
    padding-block: 8px 12px;
    margin: 0;
    border-block-end: 1px solid var(--rule);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-block-end: 1px solid var(--rule);
    font-size: var(--t-site-15);
  }

  .item p {
    flex: 1;
    min-inline-size: 0;
  }

  .why2 {
    display: block;
    margin-block-start: 2px;
    font-size: var(--t-site-13);
    font-weight: 400;
  }

  .undo {
    all: unset;
    cursor: pointer;
    color: var(--ink);
    font-size: var(--t-site-14);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .undo:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .fresh {
    animation: across var(--d-page) var(--ease-out) both;
  }

  @keyframes across {
    from {
      translate: -12px 0;
    }
    to {
      translate: 0 0;
    }
  }

  /* WHAT KEEPS IT YOURS, under both: the floor first and in the ink at 600, then the three promises, four across a desk
     over a hairline, two by two below 1060 and one under another on a phone. */
  .keeps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px 24px;
    margin-block-start: 24px;
    padding-block-start: 20px;
    border-block-start: 1px solid var(--rule);
  }

  .keeps li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .keeps :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ink);
  }

  .floor b {
    color: var(--ink);
    font-weight: 600;
  }

  /* THE WAY ON TO HOW IT IS KEPT SAFE, the site's one (`.onward`), a tile's gap under the promises. */
  .on {
    margin-block-start: 24px;
  }

  @media (max-width: 1059px) {
    .keeps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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

  /* STACKED BELOW 1060, the line sits the grid's own 16 under its title, as a line under a title does on every page. */
  @media (max-width: 1059px) {
    .head .band-say {
      margin-block-start: 0;
    }
  }

  /* ONE QUESTION AT A TIME, answering it brings the next up, beside three chores (two on a phone). The rest stay in
     the HTML for a reader without the drawing. */
  .ask:nth-child(n + 2),
  .item:nth-child(n + 4) {
    display: none;
  }

  .ask:first-child {
    padding-block-end: 0;
  }

  @media (max-width: 760px) {
    .keeps {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    /* The question says itself on a phone; its reason is the desk's. */
    .why,
    .item:nth-child(n + 3) {
      display: none;
    }
  }
</style>
