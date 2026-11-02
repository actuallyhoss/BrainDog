<!--
  Today's Needs you tile, as the app draws it on 1 November: the heading row with its count in red, then each thing
  that waits for Maya with its figure, what it is, how late it is in red, and its two answers (the suggested one in ink,
  because the screen's one red is the page's own action); at its foot what BrainDog did on its own today.

  THE ASKS ARE THE DESK'S (`desk/needs.svelte.ts`), so the rail's count moves with them. Yes takes an ask away with the
  app's motion (it lets go, then the gap closes on the spring) and its done line arrives with an Undo; Not yet takes it
  away with none; Undo puts it back in its first place. With scripting off the asks are drawn and the answers do
  nothing.

  FOCUS IS NEVER DROPPED. The button pressed goes away with its ask, so focus moves on: to the next ask's suggested
  answer, or when none waits to the latest done line's Undo, or to the heading; and an Undo hands it to the answer of
  the ask it put back. A keyboard or a screen reader keeps its place instead of starting from the top of the page.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';
  import { NEEDS, HANDLED } from '../demo/maya.ts';
  import { needs } from '../desk/needs.svelte.ts';
  import { arrive, rowIn, rowOut } from '../motion.ts';
  import { today as w } from '../copy/product.ts';

  let { review = '#filing' }: { review?: string } = $props();

  const byId = new Map(NEEDS.map((n) => [n.id, n]));
  const open = $derived(needs.open.map((id) => byId.get(id)!).filter(Boolean));
  const done = $derived(needs.done.map((id) => byId.get(id)!).filter(Boolean));

  let tile: HTMLElement | undefined = $state();
  let head: HTMLElement | undefined = $state();

  /** The first control of an ask, or of the latest done line, leaving out the one on its way out. */
  const first = (selector: string): HTMLElement | null => tile?.querySelector<HTMLElement>(selector) ?? null;

  async function answer(id: string, yes: boolean): Promise<void> {
    needs.answer(id, yes);
    await tick();
    (first(`.ask:not([data-id="${id}"]) .answers .btn`) ?? first('.done .btn') ?? head)?.focus();
  }

  async function undo(id: string): Promise<void> {
    needs.undo(id);
    await tick();
    (first(`.ask[data-id="${id}"] .answers .btn`) ?? head)?.focus();
  }
</script>

<section class="tile needs" aria-labelledby="needs-title" bind:this={tile}>
  <h3 class="tile-head" tabindex="-1" bind:this={head}>
    <span class="well"><Icon name="inbox" /></span>
    <span class="tile-title" id="needs-title">{w.needs}</span>
    <span class="tile-count late num" aria-label={w.waiting(open.length)}>{open.length}</span>
  </h3>

  <ul class="asks">
    {#each open as n (n.id)}
      <li class="ask" data-id={n.id} in:rowIn out:rowOut>
        <span class="well l" class:in={n.late}><Icon name={n.late ? 'arrow-right' : 'calendar'} /></span>
        <div class="what">
          <p class="title">{n.what}</p>
          <p class="sub"><span class:late={n.late}>{n.sub.split(' · ')[0]}</span>{#if n.sub.includes(' · ')}<span class="meta">{` · ${n.sub.split(' · ').slice(1).join(' · ')}`}</span>{/if}</p>
        </div>
        <p class="amount num">{n.amount}</p>
        <div class="answers">
          <button type="button" class="btn ink" onclick={() => answer(n.id, true)}>{n.yes}</button>
          <button type="button" class="btn" onclick={() => answer(n.id, false)}>{n.no}</button>
        </div>
      </li>
    {:else}
      <li class="empty" in:arrive>{w.allDone}</li>
    {/each}
  </ul>

  <ul class="done" aria-live="polite">
    {#each done as n (n.id)}
      <li in:rowIn out:rowOut>
        <Icon name="check" size="m" />
        <span class="grow">{n.done}</span>
        <button type="button" class="btn bare sm" onclick={() => undo(n.id)}>{w.undo}</button>
      </li>
    {/each}
  </ul>

  <p class="handled">
    <Icon name="check" size="m" />
    <span class="grow">{w.handled(HANDLED.length)}</span>
    <a class="onward" href={review}>{w.review}</a>
  </p>
</section>

<style>
  .needs {
    gap: 0;
  }

  .tile-head {
    margin-block-end: var(--sp-2);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE ASK A ROW, the app's: its well, what it is over how late, its figure at the end, and its answers under the
     figure. The rows part by a hairline; the last has none under it. */
  .ask {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'well what amount'
      'well what answers';
    align-items: start;
    column-gap: var(--sp-3);
    row-gap: var(--sp-2);
    padding-block: var(--sp-4);
  }

  .ask + .ask {
    border-block-start: 1px solid var(--rule);
  }

  .well {
    grid-area: well;
  }

  /* MONEY COMING IN, the app's arrow pointing down into the well. */
  .well.in :global(svg) {
    rotate: 90deg;
  }

  .what {
    grid-area: what;
    min-inline-size: 0;
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 22px;
  }

  .sub {
    margin: 2px 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .sub .late {
    font-weight: 600;
  }

  .sub .meta {
    font-size: inherit;
  }

  .amount {
    grid-area: amount;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 22px;
    text-align: end;
  }

  .answers {
    grid-area: answers;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .empty {
    padding-block: var(--sp-4);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .done li,
  .handled {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .done li {
    padding-block: 6px;
    color: var(--ink);
  }

  .done li :global(svg),
  .handled :global(svg) {
    color: var(--good);
  }

  .handled {
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .grow {
    flex: 1;
    min-inline-size: 0;
  }

  .handled .onward {
    min-block-size: 0;
    font-size: var(--fs-meta);
  }

  /* NARROW (a phone, or the tile beside another): the answers go under the words, from the text's edge. */
  @container desk (width < 560px) {
    .ask {
      grid-template-areas:
        'well what amount'
        'well answers answers';
    }

    .answers {
      justify-content: flex-start;
    }
  }
</style>
