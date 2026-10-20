<!--
  "It stays yours" and "Free while in early access" (site 2a section 6): two tiles, the page's last call to action, so
  nothing closes the page after it. The figures are `TABLE.free`'s (`lib/plans.ts`), never typed; the words are
  `copy/home.ts`.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { home } from '$lib/copy/home.ts';
  import { TABLE } from '$lib/plans.ts';
  import Start from '$lib/site/Start.svelte';

  const y = home.yours;
  const f = home.free;
</script>

<section class="band band--yours" aria-label={y.title}>
  <div class="wrap reveal cols">
    <article class="ftile c7 mine">
      <h3>{y.title}</h3>
      <ul>
        {#each y.points as point (point.text)}
          <li><span class="well"><Icon name={point.icon as IconName} /></span>{point.text}</li>
        {/each}
      </ul>
      <a class="go" href={y.href}>{y.link}<Icon name="arrow-right" size="s" /></a>
    </article>
    <article class="ftile c5 free">
      <h3>{f.title}</h3>
      <p class="say">{f.say}</p>
      <ul class="figs">
        <li><b>{f.every}</b></li>
        <li><b class="num">{TABLE.free.agents}</b><span>{f.tools}</span></li>
        <li><b class="num">{TABLE.free.credits}</b><span>{f.asks}</span></li>
      </ul>
      <div class="go-btn"><Start /></div>
    </article>
  </div>
</section>

<style>
  .ftile {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  h3 {
    font-size: 28px;
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .mine {
    background: var(--band-yours-tile);
    color: var(--ink);
  }

  .mine ul {
    display: grid;
    gap: 12px;
    margin: 24px 0 0;
    padding: 0;
    list-style: none;
  }

  .mine li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
  }

  .well {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: 8px;
    background: var(--band-yours);
    color: var(--ink2);
  }

  .well :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    min-block-size: 32px;
    margin-block-start: auto;
    padding-block-start: 24px;
    color: var(--ink);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
  }

  .go:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .free {
    background: var(--night);
    color: var(--on-night);
  }

  .say {
    margin: 12px 0 0;
    color: var(--on-night-2);
    font-size: 16px;
    line-height: 1.5;
  }

  .figs {
    display: grid;
    grid-template-columns: repeat(3, auto);
    justify-content: start;
    gap: 24px;
    margin: 24px 0 0;
    padding: 0;
    list-style: none;
  }

  .figs li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 17px;
  }

  .figs b {
    font: 600 28px/1 var(--head);
    letter-spacing: -0.035em;
  }

  .figs span {
    max-inline-size: 11em;
    color: var(--on-night-2);
    font-size: 13px;
  }

  .go-btn {
    margin-block-start: 24px;
  }

  @media (pointer: coarse) {
    .go {
      min-block-size: var(--tap);
    }
  }

  @media (max-width: 1059px) {
    .free {
      margin-block-start: 16px;
    }
  }

  @media (max-width: 760px) {
    h3 {
      font-size: 24px;
    }

    .mine li {
      font-size: 16px;
    }

    .figs {
      gap: 16px;
    }

    .figs b {
      font-size: 22px;
    }

    .figs span {
      max-inline-size: 8em;
    }

    .go-btn :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
