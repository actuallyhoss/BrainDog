<!--
  "Free while in early access" (site 2a section 6): the page's last call to action, so nothing closes the page after it.
  ONE TILE SINCE PLAN F12: "It stays yours" went up into the chores band, so this is the ask alone, its words at the
  start and Start at the end of one row on a desk. The figures are `TABLE.free`'s (`lib/plans.ts`), never typed; the
  words are `copy/home.ts`.
-->
<script lang="ts">
  import { home } from '$lib/copy/home.ts';
  import { TABLE } from '$lib/plans.ts';
  import Start from '$lib/site/Start.svelte';

  const f = home.free;
</script>

<section class="band band--yours" aria-label={f.title}>
  <div class="wrap reveal">
    <article class="ftile free">
      <div class="words">
        <h3>{f.title}</h3>
        <p class="say">{f.say}</p>
        <p class="figs">{f.figures(TABLE.free.agents, TABLE.free.credits)}</p>
      </div>
      <div class="go-btn"><Start /></div>
    </article>
  </div>
</section>

<style>
  .free {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 24px 48px;
    min-inline-size: 0;
    background: var(--night);
    color: var(--on-night);
  }

  .words {
    flex: 1 1 28rem;
    min-inline-size: 0;
  }

  h3 {
    font-size: var(--t-site-28);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .say {
    max-inline-size: 40em;
    margin: 12px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-site-16);
    line-height: 1.5;
  }

  .figs {
    margin: 8px 0 0;
    color: var(--on-night);
    font-size: var(--t-site-17);
    line-height: 1.45;
  }

  .go-btn {
    flex: none;
  }

  @media (max-width: 760px) {
    h3 {
      font-size: var(--t-site-24);
    }

    .go-btn {
      flex: 1 1 100%;
    }

    .go-btn :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
