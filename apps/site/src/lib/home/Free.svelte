<!--
  "Free while in early access" (the redo of 2 November): the home page's last section and its last ask, one tile. The
  ask on one side (the heading, what pressing the button leads to, and the start button, the page's second and last
  red) and the plan on the other, in the tile's well: Free at $0 with what it holds (`TABLE.free`, `lib/plans.ts`,
  said in one sentence and never typed), and under a hairline the paid plans, coming soon while billing is off, with
  the way to the pricing page. The words are `copy/home.ts`.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { home } from '../copy/home.ts';
  import { TABLE } from '../plans.ts';
  import Start from '../site/Start.svelte';

  const f = home.free;
</script>

<section class="section" id="free" aria-labelledby="free-title">
  <div class="wrap">
    <div class="tile lead close reveal">
      <div class="ask">
        <h2 class="h2" id="free-title">{f.title}</h2>
        <p class="lede">{f.say}</p>
        <div class="go"><Start size="lg" /></div>
      </div>
      <div class="plan">
        <p class="plan-name">{f.plan}</p>
        <p class="figure big num">{f.price}</p>
        <p class="what">{f.figures(TABLE.free.agents, TABLE.free.credits)}</p>
        <div class="later">
          <p><b>{f.later}.</b> {f.laterSay}</p>
          <a class="onward" href="/pricing">{f.pricing}<Icon name="arrow-right" size="s" /></a>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .close {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
  }

  .ask {
    display: grid;
    justify-items: start;
    align-content: center;
    gap: var(--sp-4);
  }

  .go {
    padding-block-start: var(--sp-2);
  }

  /* THE PLAN IN THE TILE'S WELL: its name, its price as a figure, and what it holds in one sentence. */
  .plan {
    display: grid;
    align-content: start;
    gap: 4px;
    padding: var(--sp-5);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }

  p {
    margin: 0;
  }

  .plan-name {
    color: var(--ink-2);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .what {
    color: var(--ink);
    font-size: var(--t-site-15);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .later {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--t-site-small);
    line-height: 1.5;
  }

  .later b {
    color: var(--ink);
    font-weight: 600;
  }

  @media (width >= 900px) {
    .close {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: var(--sp-7);
    }
  }

  @media (max-width: 640px) {
    .go,
    .go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
