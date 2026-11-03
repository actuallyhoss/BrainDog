<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { application, organization, website } from '$lib/site/seo.ts';
  /**
   * brain.dog's home page, rebuilt in the redesign.
   *
   * ONE PRODUCT PICTURE, THEN BANDS THAT EACH SAY ONE NEW THING, AND THE ASK (plan F12, 1 Nov; the order is the site
   * story's, 3 Nov: the band that sells the product comes right after how it works). The dark hero with the headline,
   * two buttons and the early access line (no row of makers' names: "just say agents", Sam), then Maya's desk across the hero's edge
   * (`lib/desk/Desk.svelte`), drawn as the app's own Today. Under it, full-bleed bands, each on its own ground in both
   * schemes so two neighbours never share one (`--band-*` in Look B):
   *
   *   who      How it works: connect your agents, they keep track, you make the calls.
   *   tools    night: every agent knows what the others did, the notes the agents left and the connect line.
   *   chores   agents ask until they've earned your trust: the questions, where each agent stands, what got done,
   *            and under them the floor and the three promises that keep it yours.
   *   money    your money, next to the work: the app's Money home on Maya's books, and the plugins.
   *   together bring your team, and their agents: roles, mentions and faces, read-only links (2 November).
   *   slash    or just ask BrainDog: the bar and its answer.
   *   yours    Free while in early access: the page's last call to action.
   *
   * The questions are the pricing page's now, where they are asked.
   *
   * No close after them: the free tile is the last ask.
   *
   * EVERY PAGE READS WITH SCRIPTING OFF. Every band's content is in the prerendered HTML, and a control that only a
   * script can work is drawn once it runs. `scripts/product.mjs` reads `section.hero`, `#hero-title` and `.sub` here
   * for the social picture, so those three stay.
   *
   * EVERY WORD IS IN `lib/copy/home.ts`; the names and figures in the drawings are `lib/demo/maya.ts`. The title and
   * description are `copy/shell.ts`.
   */
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { site } from '$lib/copy.ts';
  import { home } from '$lib/copy/home.ts';
  import Desk from '$lib/desk/Desk.svelte';
  import Chores from '$lib/home/Chores.svelte';
  import MoneyBand from '$lib/home/MoneyBand.svelte';
  import SlashBand from '$lib/home/SlashBand.svelte';
  import Together from '$lib/home/Together.svelte';
  import Tools from '$lib/home/Tools.svelte';
  import WhoFor from '$lib/home/WhoFor.svelte';
  import Yours from '$lib/home/Yours.svelte';
  import Start from '$lib/site/Start.svelte';

  /* EACH SENTENCE OF THE HEADLINE ON ITS OWN LINE (4 November), so the phone never ends a line on "You". */
  const title = home.hero.title.split(/(?<=\.) /).map((sentence) => sentence.split(' '));
</script>

<Seo title={site.meta.home.title} description={site.meta.home.description} path="/" ld={[organization, website, application]} />
<section class="hero night" aria-labelledby="hero-title">
  <span class="hero-mark" aria-hidden="true"><Mark tone="line" height={731} /></span>
  <div class="wrap copy">
    <!-- A HYPHENATED WORD STAYS WHOLE ("re-explaining"), so the phone never breaks the headline after "re-". -->
    <h1 id="hero-title">{#each title as sentence, s}{#if s > 0}{' '}{/if}<span class="line">{#each sentence as word, i}{#if i > 0}{' '}{/if}{#if word.includes('-')}<span class="whole">{word}</span>{:else}{word}{/if}{/each}</span>{/each}</h1>
    <p class="lead sub">{home.hero.sub}</p>
    <div class="ctas">
      <Start />
      <a class="btn ghost" href="/agents">{home.hero.secondary}<Icon name="arrow-right" size="s" /></a>
    </div>
    <p class="early"><b>{site.early.strong}</b> {site.early.rest}</p>
  </div>
  <div class="stage">
    <div class="wrap">
      <Desk />
    </div>
  </div>
</section>

<WhoFor />
<Tools />
<Chores />
<MoneyBand />
<Together />
<SlashBand />
<Yours />

<style>
  /* THE HERO: night ground, the slogan big, the mark a thin line behind it. */
  .hero {
    position: relative;
    overflow: hidden;
  }

  .hero-mark {
    position: absolute;
    inset-inline-end: -170px;
    inset-block-start: 24px;
    width: 900px;
    color: var(--night-mark);
    pointer-events: none;
  }

  .hero-mark :global(svg) {
    width: 100%;
    height: auto;
  }

  .copy {
    position: relative;
    padding-block: 56px 48px;
  }

  /* Two lines at 1440, three at 390. */
  h1 {
    max-inline-size: 13em;
    font-size: var(--t-display);
    line-height: 1.04;
    letter-spacing: -0.021em;
    text-wrap: balance;
  }

  .whole {
    white-space: nowrap;
  }

  .line {
    display: block;
    text-wrap: balance;
  }

  .lead {
    max-inline-size: 30em;
    margin: 24px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-lead);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 32px;
  }

  .early {
    margin: 16px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-meta);
  }

  .early b {
    color: var(--on-night);
    font-weight: 600;
  }

  /* THE DESK ACROSS THE HERO'S EDGE: the next band's ground comes up under its lower 40%. */
  .stage {
    position: relative;
  }

  .stage::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    height: 40%;
    background: var(--band-who);
  }

  .stage .wrap {
    position: relative;
    z-index: var(--z-raise);
  }

  @media (max-width: 1060px) {
    .hero-mark {
      width: 700px;
      inset-inline-end: -260px;
    }
  }

  /* THE PHONE: full-width buttons stacked, the line under them, and the
     mark's line behind the desk's top edge rather than the buttons. */
  @media (max-width: 760px) {
    .copy {
      padding-block: 32px 40px;
    }

    .hero-mark {
      width: 520px;
      inset-inline-end: -250px;
      inset-block-start: 380px;
      opacity: 0.6;
    }

    .ctas {
      flex-direction: column;
    }

    .ctas :global(.btn) {
      inline-size: 100%;
      block-size: 48px;
    }
  }
</style>
