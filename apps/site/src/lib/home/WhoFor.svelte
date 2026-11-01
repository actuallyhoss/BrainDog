<!--
  "Who it's for" (2a section 2): three readers, three tiles, a real icon in a 40px well, a title, one line, a small
  drawing that differs per tile, and the way on. ONE NEUTRAL TILE FOR ALL THREE, AND THE ICON CARRIES THE COLOUR (plan
  F14, Look B: no tinted cards for decoration): amber for a small business, ink for building with AI, blue for your own
  life, each in its well. The words are
  `copy/home.ts`; the names in the drawings are Maya's (`demo/maya.ts`).

  YOUR OWN LIFE (29 October, personal use as much as business) is drawn as what is coming up in Maya's own book, the
  same rows the Money band shows.

  ON A PHONE, THREE PLAIN LINES: each tile is its icon and its way on, one line with an arrow, and the title is
  said to a screen reader. The cards and their sentences were most of a screen at 390.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { MONEY_BAND, usd } from '$lib/demo/maya.ts';
  import { spark } from '$lib/desk/draw.ts';

  const w = home.who;
  /* The small business's drawing: the cash over three months, as a shape and never as money. */
  const cash = spark([48.2, 47.1, 46.4], 220, 56);
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
        <span class="fwell"><Icon name="house" /></span>
        <h3>{w.life.title}</h3>
        <p class="say">{w.life.say}</p>
        <div class="draw">
          {#each MONEY_BAND.coming as c (c.name)}
            <p class="due"><span>{c.name}</span><span class="when">{c.when}</span><b class="num">{usd(c.cents)}</b></p>
          {/each}
        </div>
        <a class="go" href={w.life.href}>{w.life.link}<Icon name="arrow-right" size="s" /></a>
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

  .ftile {
    background: var(--band-yours-tile);
    color: var(--ink);
  }

  .amber {
    --well: var(--cat-amber-tint);
    --well-ink: var(--cat-amber);
  }

  .night {
    --well: color-mix(in srgb, var(--ink) 8%, transparent);
    --well-ink: var(--ink);
  }

  .blue {
    --well: var(--cat-blue-tint);
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

  /* THE TERMINAL IS A DRAWING OF ONE, so it keeps the night's ground inside the plain tile. */
  .term {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    background: var(--night);
    border-radius: 8px;
    font: 400 13px/1.45 var(--mono);
    color: var(--on-night-2);
  }

  .term .first {
    color: var(--night-accent);
    font-weight: 500;
  }

  /* WHAT IS COMING UP IN HER OWN BOOK: three rows, the name, the day and the amount, as the app's Coming up lists them. */
  .due {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 12px;
    padding: 6px 0;
    border-block-start: 1px solid var(--rule, color-mix(in srgb, var(--ink) 10%, transparent));
    color: var(--ink);
    font-size: var(--t-site-14);
  }

  .due:first-child {
    border-block-start: 0;
  }

  .due .when {
    color: var(--ink2);
  }

  .due b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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

  /* ON A PHONE each tile is one plain line, its icon and its way on with the arrow: the drawings and the sentences
     are a desk's luxury, and the title is said to a screen reader. */
  @media (max-width: 760px) {
    .draw,
    .say {
      display: none;
    }

    .trio {
      gap: 8px;
      margin-block-start: 20px;
    }

    .ftile {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      align-items: center;
      column-gap: 12px;
      padding-block: 12px;
    }

    h3 {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .go {
      align-self: center;
      font-size: var(--t-site-16);
    }
  }
</style>
