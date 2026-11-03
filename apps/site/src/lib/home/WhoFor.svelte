<!--
  "How it works" (3 November, the site story; it was "Who it's for"): three steps, three tiles, a real icon in a 40px
  well, a title, one line, a small drawing that differs per tile, and the way on. ONE NEUTRAL TILE FOR ALL THREE, AND
  THE ICON CARRIES THE COLOUR (plan F14, Look B: no tinted cards for decoration): amber to connect, ink for the session
  that starts caught up, blue for what waits on you, each in its well. The words are `copy/home.ts`; the names in the
  drawings are Maya's (`demo/maya.ts`).

  The first step draws the makers it connects, the second `braindog context` in a terminal window (`lib/site/TermWindow.svelte`), the third the first of Maya's
  questions as Needs you draws it, with its two answers (drawn, not pressable: the desk above is where they work).

  ON A PHONE, THREE SHORT TILES: each is its icon, the step's title and its way on under it. The cards and their
  sentences were most of a screen at 390.
-->
<script lang="ts">
  import AgentMark from '$lib/AgentMark.svelte';
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { NEEDS } from '$lib/demo/maya.ts';
  import TermWindow from '$lib/site/TermWindow.svelte';

  const w = home.who;
  const ask = NEEDS[0]!;
</script>

<section class="band band--who" aria-labelledby="who-title">
  <div class="wrap reveal">
    <h2 id="who-title" class="band-h2">{w.title}</h2>
    <div class="cols trio">
      <article class="ftile c4 amber">
        <span class="fwell"><Icon name="plug" /></span>
        <h3>{w.small.title}</h3>
        <p class="say">{w.small.say}</p>
        <div class="draw">
          <p class="marks" aria-hidden="true">
            {#each home.hero.makers as maker (maker.id)}<span class="mk"><AgentMark id={maker.id} size={20} /></span>{/each}
          </p>
          <p class="fig"><b>{w.small.figure}</b> <span>{w.small.figureSay}</span></p>
        </div>
        <a class="onward" href={w.small.href}>{w.small.link}<Icon name="arrow-right" size="s" /></a>
      </article>

      <article class="ftile c4 ink">
        <span class="fwell"><Icon name="terminal" /></span>
        <h3>{w.build.title}</h3>
        <p class="say">{w.build.say}</p>
        <div class="draw"><TermWindow title={w.build.term.title} label={w.build.term.label} lines={w.build.term.lines} /></div>
        <a class="onward" href={w.build.href}>{w.build.link}<Icon name="arrow-right" size="s" /></a>
      </article>

      <article class="ftile c4 blue">
        <span class="fwell"><Icon name="inbox" /></span>
        <h3>{w.life.title}</h3>
        <p class="say">{w.life.say}</p>
        <div class="draw ask">
          <p class="q">{ask.ask}</p>
          <p class="acts" aria-hidden="true"><span class="btn ink sm">{ask.yes}</span><span class="btn line sm">{ask.no}</span></p>
        </div>
        <a class="onward" href={w.life.href}>{w.life.link}<Icon name="arrow-right" size="s" /></a>
      </article>
    </div>
  </div>
</section>

<style>
  .trio {
    margin-block-start: var(--head-gap);
  }

  .ftile {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .ink {
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
    border-radius: 50%;
    background: var(--well);
    color: var(--well-ink);
  }

  .fwell :global(.icon) {
    inline-size: 20px;
    block-size: 20px;
  }

  /* A TILE'S TITLE AT THE CARD STEP every tile on the site takes, and its line at the text step. */
  h3 {
    margin-block-start: 6px;
    font-size: var(--t-card);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .say {
    margin: 0;
    font-size: var(--t-text);
    line-height: 1.55;
    color: var(--ink2);
    text-wrap: pretty;
  }

  .draw {
    margin-block-start: auto;
    padding-block-start: 8px;
  }

  .draw p {
    margin: 0;
  }

  /* THE MAKERS IT CONNECTS, each mark in a small round chip, in the hero's order. */
  .marks {
    display: flex;
    gap: 8px;
  }

  .mk {
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }

  .fig {
    margin-block-start: 8px !important;
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .fig b {
    color: var(--ink);
    font: 600 28px/1 var(--head);
    letter-spacing: -0.024em;
  }

  /* ONE QUESTION AS NEEDS YOU DRAWS IT: the ask, then its two answers as the app's small buttons, drawn only. */
  .ask {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .ask .q {
    color: var(--ink);
    font-size: var(--t-site-14);
    line-height: 1.45;
    font-weight: 500;
  }

  .acts {
    display: flex;
    gap: 6px;
  }

  .acts .btn {
    pointer-events: none;
  }

  /* THE WAY ON is the site's one (`.onward`), at the tile's foot. */
  .onward {
    align-self: flex-start;
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
    }

    /* THE STEP'S TITLE BESIDE ITS ICON, and the way on under it, so three steps still read as three steps. */
    .ftile {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      grid-template-rows: auto auto;
      align-items: center;
      column-gap: 12px;
      row-gap: 2px;
      padding-block: 14px;
    }

    .fwell {
      grid-row: 1 / 3;
    }

    h3 {
      margin: 0;
      font-size: var(--t-text);
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .onward {
      align-self: start;
      color: var(--ink2);
      font-size: var(--t-site-14);
    }
  }
</style>
