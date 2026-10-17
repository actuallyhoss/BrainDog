<script lang="ts">
  /**
   * brain.dog's home page, the second design of 17 October (DIRECTION §47, `loop/site-2026-10-17/src/site.html`).
   *
   * THE PRODUCT, WORKING, AND FEW WORDS. A dark hero with the slogan huge and the mark drawn as a thin line behind it,
   * two buttons and the makers it works with, then Maya's desk across the hero's edge (`lib/desk/Desk.svelte`). Under
   * it, four cards, each a value drawn as the product doing it, with no label or time over them (§47 his notes):
   *
   *   brief    white: it tells you where things stand, every figure opening where it comes from.
   *   agents   black: your agents share one memory, with the connect line.
   *   chores   red: it does the chores, you make the calls, sharing the desk's Needs you.
   *   slash    white: press / and ask anything.
   *
   * Then "It stays yours" in three short columns, Free first in the plans, and the close.
   *
   * EVERY PAGE READS WITH SCRIPTING OFF. Every card's content is in the prerendered HTML, and a control that only a
   * script can work is drawn once it runs. `scripts/product.mjs` reads `section.hero`, `#hero-title` and `.sub` here
   * for the social picture, so those three stay.
   *
   * EVERY WORD IS IN `lib/copy/home.ts`; the names and figures in the drawings are `lib/demo/maya.ts`, and the plan
   * figures are `lib/plans.ts`. The title and description are `copy/shell.ts`.
   */
  import AgentMark from '$lib/AgentMark.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { site } from '$lib/copy.ts';
  import { home } from '$lib/copy/home.ts';
  import Desk from '$lib/desk/Desk.svelte';
  import AgentsCard from '$lib/home/AgentsCard.svelte';
  import Brief from '$lib/home/Brief.svelte';
  import Chores from '$lib/home/Chores.svelte';
  import SlashCard from '$lib/home/SlashCard.svelte';
  import { plan } from '$lib/plans.ts';
  import Plans from '$lib/pricing/Plans.svelte';
  import Close from '$lib/site/Close.svelte';
  import Start from '$lib/site/Start.svelte';

  const cloud = plan('cloud').price;
</script>

<svelte:head>
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
</svelte:head>

<section class="hero night" aria-labelledby="hero-title">
  <span class="hero-mark" aria-hidden="true"><Mark tone="line" height={731} /></span>
  <div class="wrap copy">
    <h1 id="hero-title">{home.hero.title}</h1>
    <p class="lead sub">{home.hero.sub}</p>
    <div class="ctas">
      <Start />
      <a class="btn ghost" href="/agents">{home.hero.secondary}<Icon name="arrow-right" size="s" /></a>
    </div>
    <p class="works">
      {home.hero.works}
      {#each home.hero.makers as maker}<span class="maker"><AgentMark id={maker.id} size={16} />{maker.name}</span>{/each}
    </p>
  </div>
  <div class="stage">
    <div class="wrap">
      <Desk />
    </div>
  </div>
</section>

<section class="wrap story">
  <Brief />
  <AgentsCard />
  <Chores />
  <SlashCard />
</section>

<section class="wrap yours reveal" aria-labelledby="yours-title">
  <h2 id="yours-title">{home.yours.title}</h2>
  <div class="three">
    {#each home.yours.points as point}
      <div>
        <h3>{point.title}</h3>
        <p>{point.body}</p>
      </div>
    {/each}
  </div>
</section>

<section class="wrap sec reveal" aria-labelledby="plans-title">
  <h2 id="plans-title">{home.plans.title}</h2>
  <p class="say">{home.plans.say(cloud)}</p>
  <Plans compact />
  <a class="more" href="/pricing">{home.plans.more}<Icon name="arrow-right" size="s" /></a>
</section>

<Close title={home.closing.title} body={home.closing.body} />

<style>
  /* THE HERO: night ground, the slogan huge, the mark a thin line behind it. */
  .hero {
    position: relative;
    overflow: hidden;
  }

  .hero-mark {
    position: absolute;
    inset-inline-end: -170px;
    inset-block-start: 30px;
    width: 940px;
    color: var(--night-mark);
    pointer-events: none;
  }

  .hero-mark :global(svg) {
    width: 100%;
    height: auto;
  }

  .copy {
    position: relative;
    padding-block: 72px 56px;
  }

  h1 {
    font-size: clamp(3.3rem, 7.6vw, 6.9rem);
    line-height: 0.95;
    letter-spacing: -0.05em;
    max-width: 11ch;
    text-wrap: balance;
  }

  .lead {
    margin: 28px 0 0;
    font-size: clamp(1.08rem, 1.55vw, 1.32rem);
    line-height: 1.5;
    color: var(--on-night-2);
    max-width: 31em;
    text-wrap: pretty;
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-block-start: 34px;
  }

  .works {
    margin: 26px 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: var(--t-site-small);
    color: var(--on-night-2);
  }

  .maker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--on-night);
  }

  /* THE DESK ACROSS THE HERO'S EDGE: the page's ground comes up under its lower part. */
  .stage {
    position: relative;
  }

  .stage::after {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    inset-inline-end: 0;
    inset-block-end: 0;
    height: 42%;
    background: var(--page);
  }

  .stage .wrap {
    position: relative;
    z-index: var(--z-raise);
  }

  /* THE FOUR CARDS, one under another. The cards' grounds, titles and lines are the shell's (`app.css`), and each
     card's inside is its own component's. */
  .story {
    display: grid;
    gap: 20px;
    padding-block-start: 112px;
  }

  /* IT STAYS YOURS, in three short columns. */
  .yours {
    padding-block-start: 140px;
  }

  .yours h2,
  .sec h2 {
    font-size: clamp(2.4rem, 5vw, 4.4rem);
    line-height: 1;
    letter-spacing: -0.045em;
  }

  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 40px;
    margin-block-start: 44px;
  }

  .three > div {
    padding-block-start: 22px;
    border-block-start: 1.5px solid var(--ink);
  }

  .three h3 {
    font-size: var(--t-figure);
    line-height: 1.15;
    letter-spacing: -0.03em;
  }

  .three p {
    margin: 10px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-16);
  }

  /* THE PLANS, Free first. */
  .sec {
    padding-block-start: 140px;
  }

  .sec .say {
    margin: 16px 0 0;
    font-size: var(--t-site-19);
    color: var(--ink2);
    max-width: 30em;
  }

  @media (max-width: 1060px) {
    .hero-mark {
      width: 700px;
      inset-inline-end: -260px;
    }

    .three {
      grid-template-columns: 1fr;
      gap: 26px;
    }
  }

  @media (max-width: 760px) {
    .copy {
      padding-block: 40px 36px;
    }

    .hero-mark {
      width: 520px;
      inset-inline-end: -250px;
      inset-block-start: 120px;
    }

    .story {
      padding-block-start: 80px;
      gap: 14px;
    }

    .yours,
    .sec {
      padding-block-start: 96px;
    }
  }

  @media (pointer: coarse) {
    .more {
      min-height: 44px;
    }
  }
</style>
