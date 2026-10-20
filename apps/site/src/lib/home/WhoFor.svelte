<!--
  "Who it's for" (site F2, 2a section 2): three readers, three tiles, each with its own fill, a real icon in a 40px
  well, a title, one line, a small drawing that differs per tile, and the way on. Fills are category slots, not status
  hues (SPEC 0.2): amber for a small business, the night for building with AI, blue for a team. The words are
  `copy/home.ts`; the names in the drawings are Maya's (`demo/maya.ts`).
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { PEOPLE, slotVars } from '$lib/demo/maya.ts';
  import { spark } from '$lib/desk/draw.ts';

  const w = home.who;
  /* The small business's drawing: the cash over three months, as a shape and never as money. */
  const cash = spark([48.2, 47.1, 46.4], 220, 56);
  const faces = (['dana', 'leo', 'sam'] as const).map((id) => PEOPLE[id]);
</script>

<section class="band band--who" aria-labelledby="who-title">
  <div class="wrap reveal">
    <h2 id="who-title" class="band-h2">{w.title}</h2>
    <div class="cols trio">
      <article class="ftile c4 amber">
        <span class="fwell"><Icon name="store" /></span>
        <h3>{w.small.title}</h3>
        <p class="say">{w.small.say}</p>
        <div class="draw">
          <svg class="cash" viewBox="0 0 220 56" preserveAspectRatio="none" aria-hidden="true">
            <path class="a" d={cash.fill} /><path class="l" d={cash.line} vector-effect="non-scaling-stroke" />
          </svg>
          <p class="fig"><b>{w.small.figure}</b> <span>{w.small.figureSay}</span></p>
        </div>
        <a class="go" href={w.small.href}>{w.small.link}<Icon name="arrow-right" size="s" /></a>
      </article>

      <article class="ftile c4 night">
        <span class="fwell"><Icon name="terminal" /></span>
        <h3>{w.build.title}</h3>
        <p class="say">{w.build.say}</p>
        <div class="draw term" aria-hidden="true">
          {#each w.build.lines as line, i}<p class:first={i === 0}>{line}</p>{/each}
        </div>
        <a class="go" href={w.build.href}>{w.build.link}<Icon name="arrow-right" size="s" /></a>
      </article>

      <article class="ftile c4 blue">
        <span class="fwell"><Icon name="users" /></span>
        <h3>{w.team.title}</h3>
        <p class="say">{w.team.say}</p>
        <div class="draw">
          <p class="faces" aria-hidden="true">
            {#each faces as f (f.initials)}<span class="face" style={slotVars(f.slot)}>{f.initials}</span>{/each}
          </p>
          <p class="moved">{w.team.line}</p>
        </div>
        <a class="go" href={w.team.href}>{w.team.link}<Icon name="arrow-right" size="s" /></a>
      </article>
    </div>
  </div>
</section>

<style>
  .trio {
    margin-block-start: 32px;
  }

  .ftile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-inline-size: 0;
  }

  .amber {
    background: var(--cat-amber-tint);
    color: var(--ink);
    --well: color-mix(in srgb, var(--cat-amber) 16%, transparent);
    --well-ink: var(--cat-amber);
  }

  .night {
    background: var(--night);
    color: var(--on-night);
    --well: var(--night-tint-2);
    --well-ink: var(--on-night);
  }

  .blue {
    background: var(--cat-blue-tint);
    color: var(--ink);
    --well: color-mix(in srgb, var(--cat-blue) 16%, transparent);
    --well-ink: var(--cat-blue);
  }

  .fwell {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 8px;
    background: var(--well);
    color: var(--well-ink);
  }

  .fwell :global(.icon) {
    inline-size: 20px;
    block-size: 20px;
  }

  h3 {
    margin-block-start: 4px;
    font-size: var(--t-site-24);
    line-height: 1.15;
    letter-spacing: -0.03em;
  }

  .say {
    margin: 0;
    font-size: var(--t-site-15);
    line-height: 1.5;
    color: var(--ink2);
  }

  .night .say {
    color: var(--on-night-2);
  }

  .draw {
    margin-block-start: auto;
    padding-block-start: 8px;
  }

  .draw p {
    margin: 0;
  }

  .cash {
    display: block;
    inline-size: 100%;
    block-size: 40px;
  }

  .cash .l {
    fill: none;
    stroke: var(--cat-amber);
    stroke-width: 2;
  }

  .cash .a {
    fill: color-mix(in srgb, var(--cat-amber) 14%, transparent);
  }

  .fig {
    margin-block-start: 8px !important;
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .fig b {
    color: var(--ink);
    font: 600 28px/1 var(--head);
    letter-spacing: -0.035em;
  }

  .term {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    background: var(--night-tint);
    border-radius: 8px;
    font: 400 13px/1.45 var(--mono);
    color: var(--on-night-2);
  }

  .term .first {
    color: var(--night-accent);
    font-weight: 500;
  }

  .faces {
    display: flex;
  }

  .face {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--ph-tint);
    color: var(--ph);
    font: 600 12px/1 var(--ui);
    box-shadow: 0 0 0 2px var(--cat-blue-tint);
  }

  .face + .face {
    margin-inline-start: -6px;
  }

  .moved {
    margin-block-start: 8px !important;
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    min-block-size: 32px;
    color: inherit;
    font-size: var(--t-site-15);
    font-weight: 600;
    text-decoration: none;
  }

  .go:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  @media (pointer: coarse) {
    .go {
      min-block-size: var(--tap);
    }
  }

  /* ON A PHONE each tile is its icon, title, line and way on: the drawings are a desk's luxury. */
  @media (max-width: 760px) {
    .draw {
      display: none;
    }

    .trio {
      gap: 12px;
    }

    /* The icon sits beside the title, so a tile is four short lines. */
    .ftile {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      align-items: center;
      column-gap: 12px;
    }

    h3 {
      margin: 0;
      font-size: var(--t-site-22);
    }

    .say,
    .go {
      grid-column: 1 / -1;
    }
  }
</style>
