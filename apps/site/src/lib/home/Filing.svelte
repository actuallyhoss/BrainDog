<!--
  The home page's first section after the hero: it does the filing, you make the calls (the redo of 2 November).

  THREE TILES, ONE IDEA. What BrainDog did on its own today, each with the reason it was allowed and an undo; the
  question only a person answers, one at a time, with its two answers; and the floor, drawn as what it is: money,
  keys, sharing and deletes all go through your yes. Each tile is the app's (its heading row, its rows), on Maya's
  made-up record (`demo/maya.ts`), and its answers work: Undo puts a filing back, an answer takes the question away
  with the app's motion and brings the next one.

  WITH SCRIPTING OFF every filing, the first question and the floor are in the HTML, and the answers do nothing.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';
  import { ASKED, HANDLED } from '../demo/maya.ts';
  import { asked } from '../desk/needs.svelte.ts';
  import { home } from '../copy/home.ts';
  import { arrive, rowIn, rowOut } from '../motion.ts';
  import type { IconName } from '../icons.ts';

  const f = home.filing;

  /* WHICH FILINGS HAVE BEEN PUT BACK, by their place in the list, and which were ever pressed: a row changes in place
     over the app's swap step only once it has been pressed, never on the page's first draw. */
  let undone = $state<number[]>([]);
  let touched = $state<number[]>([]);
  const flip = (i: number): void => {
    undone = undone.includes(i) ? undone.filter((x) => x !== i) : [...undone, i];
    if (!touched.includes(i)) touched = [...touched, i];
  };

  const byId = new Map(ASKED.map((a) => [a.id, a]));
  const open = $derived(asked.open.map((id) => byId.get(id)!).filter(Boolean));
  const done = $derived(asked.done.map((id) => byId.get(id)!).filter(Boolean));
  const first = $derived(open[0]);

  const FLOOR: readonly IconName[] = ['cash', 'key', 'users', 'trash'];

  /* FOCUS IS NEVER DROPPED (as in Today's Needs you): an answer hands it to the next question's suggested answer, or when
     none waits to the latest done line's Undo, or to the heading; an Undo hands it to the question it put back. */
  let box: HTMLElement | undefined = $state();
  let head: HTMLElement | undefined = $state();
  const control = (selector: string): HTMLElement | null => box?.querySelector<HTMLElement>(selector) ?? null;

  async function answer(id: string, yes: boolean): Promise<void> {
    asked.answer(id, yes);
    await tick();
    (control('.ask .answers .btn') ?? control('.done .btn') ?? head)?.focus();
  }

  async function undo(id: string): Promise<void> {
    asked.undo(id);
    await tick();
    (control('.ask .answers .btn') ?? head)?.focus();
  }
</script>

<section class="section" id="filing" aria-labelledby="filing-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="filing-title">{f.title}</h2>
      <p>{f.say}</p>
    </div>

    <div class="tiles">
      <section class="tile span-7 reveal" aria-labelledby="done-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="check" /></span>
          <span class="tile-title" id="done-title">{f.done}</span>
          <span class="tile-meta">{f.today(HANDLED.length)}</span>
        </h3>
        <ul class="rows">
          {#each HANDLED as h, i (h.text)}
            {@const back = undone.includes(i)}
            {@const moved = touched.includes(i)}
            <li class:back>
              {#key back}
                <span class="mark" class:swap-in={moved} aria-hidden="true"><Icon name={back ? 'undo' : 'check'} size="m" /></span>
                <span class="what" class:swap-in={moved}>
                  <span class="text">{h.text}</span>
                  <span class="why">{back ? f.undone : h.why}</span>
                </span>
              {/key}
              <button type="button" class="btn bare sm" aria-label="{back ? f.redo : f.undo}: {h.text}" onclick={() => flip(i)}>{back ? f.redo : f.undo}</button>
            </li>
          {/each}
        </ul>
      </section>

      <section class="tile span-5 reveal" aria-labelledby="waits-title" bind:this={box}>
        <h3 class="tile-head" tabindex="-1" bind:this={head}>
          <span class="well"><Icon name="person" /></span>
          <span class="tile-title" id="waits-title">{f.waits}</span>
          <span class="tile-count num">{open.length}</span>
        </h3>
        <div class="asks" aria-live="polite">
          {#if first}
            {#key first.id}
              <div class="ask" in:arrive>
                <p class="by"><span class="chip">{first.kind}</span><span>{f.askedBy} {first.by}</span></p>
                <p class="q">{first.ask}</p>
                <p class="why-q">{first.why}</p>
                <div class="answers">
                  <button type="button" class="btn ink" onclick={() => answer(first.id, true)}>{first.yes}</button>
                  <button type="button" class="btn" onclick={() => answer(first.id, false)}>{first.no}</button>
                </div>
                {#if open.length > 1}<p class="after">{f.after(open.length - 1)}</p>{/if}
              </div>
            {/key}
          {:else}
            <p class="empty" in:arrive>{f.empty}</p>
          {/if}
          <ul class="done">
            {#each done as a (a.id)}
              <li in:rowIn out:rowOut>
                <Icon name="check" size="m" /><span class="grow">{a.done}</span>
                <button type="button" class="btn bare sm" onclick={() => undo(a.id)}>{f.undo}</button>
              </li>
            {/each}
          </ul>
        </div>
      </section>

      <section class="tile span-12 floor reveal" aria-labelledby="floor-title">
        <div class="floor-words">
          <h3 class="tile-head">
            <span class="well"><Icon name="lock" /></span>
            <span class="tile-title" id="floor-title">{f.floor.title}</span>
          </h3>
          <p class="tile-say">{f.floor.say}</p>
        </div>
        <!-- THE FLOOR, DRAWN: the four things that always go through a person's yes. The sentence beside it says the
             same, so the drawing is hidden from a screen reader rather than read twice. -->
        <div class="gate" aria-hidden="true">
          <span class="parts">
            {#each f.floor.parts as part, i (part)}
              <span class="chip"><Icon name={FLOOR[i] ?? 'lock'} size="m" />{part}</span>
            {/each}
          </span>
          <span class="arrow"><Icon name="arrow-right" size="l" /></span>
          <span class="yes"><Icon name="check" size="m" />{f.floor.yes}</span>
        </div>
      </section>
    </div>
  </div>
</section>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── Done on its own ─────────────────────────────────────────────────── */

  .rows li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block: 12px;
  }

  .rows li + li {
    border-block-start: 1px solid var(--rule);
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well-l);
    block-size: var(--well-l);
    border-radius: var(--r-ctl);
    background: var(--good-tint);
    color: var(--good);
  }

  .back .mark {
    background: var(--tile-2);
    color: var(--ink-3);
  }

  .what {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .text {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .back .text {
    color: var(--ink-3);
  }

  .why {
    color: var(--ink-3);
    font-size: var(--t-site-small);
    line-height: 1.45;
  }

  /* ── Waits for you ───────────────────────────────────────────────────── */

  .asks {
    display: grid;
    gap: var(--sp-3);
  }

  .ask {
    display: grid;
    gap: var(--sp-2);
  }

  .by {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .by .chip {
    block-size: 24px;
    padding-inline: 8px;
    font-size: var(--fs-cap);
  }

  .q {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 1.35;
    text-wrap: pretty;
  }

  .why-q {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .answers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .after,
  .empty {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .empty {
    color: var(--ink-2);
    font-size: var(--t-site-15);
  }

  .done li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block: 6px;
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  .done li :global(svg) {
    color: var(--good);
  }

  .grow {
    flex: 1;
    min-inline-size: 0;
  }

  /* ── The floor ───────────────────────────────────────────────────────── */

  .floor {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-5) var(--sp-7);
  }

  .floor-words {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: 30rem;
  }

  .gate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .parts .chip {
    block-size: 36px;
    padding-inline: 12px;
    color: var(--ink);
  }

  .parts .chip :global(svg) {
    color: var(--ink-2);
  }

  .arrow {
    display: grid;
    color: var(--ink-3);
  }

  /* THE YES IS INK, the strong neutral: red is never "on", "chosen" or "safe" in this system. */
  .yes {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: 36px;
    padding-inline: 12px;
    border-radius: var(--r-ctl);
    background: var(--ink);
    color: var(--tile);
    font-size: var(--fs-ctl);
    font-weight: 600;
  }

  /* ON A PHONE THE FOUR GO TWO BY TWO, the arrow turns down, and the yes sits under them. */
  @media (max-width: 640px) {
    .arrow {
      rotate: 90deg;
    }

    .gate {
      flex-direction: column;
      align-items: flex-start;
    }

    .parts {
      display: grid;
      grid-template-columns: repeat(2, max-content);
    }
  }
</style>
