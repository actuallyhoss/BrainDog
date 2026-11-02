<script lang="ts">
  /**
   * brain.dog's home page (the redo of 2 November).
   *
   * THE PRODUCT FIRST, THEN FIVE SECTIONS THAT EACH SAY ONE THING, ON THE APP'S OWN BOARD. The hero is the slogan, one
   * sentence, the start button and the line that says what it leads to, and under them the app itself: Maya's Today in
   * the app's window (`lib/product/`), drawn with the app's tokens and working (an answer in Needs you takes the row
   * away and moves the rail's count). Then one idea a section, each a heading, one sentence and the app's tiles:
   *
   *   filing   It does the filing, you make the calls: what was filed on its own with an undo, the question that
   *            waits for a person, and the floor no rule moves.
   *   tools    Your AI tools share one memory: the brief they start from, the notes they leave, Slash, and the
   *            one line that connects them.
   *   money    Your money, in one place: the app's Money home on Maya's two books.
   *   yours    It stays yours: six plain facts, and the way to the security page.
   *   free     Free while in early access: the plan, the start button again, and what comes later.
   *
   * ONE GROUND, BOTH SCHEMES: every section sits on the app's board and nothing flips to a dark band mid-page; the
   * scheme is the visitor's, or the one they chose in BrainDog (`app.css`). RED IS THE START BUTTON ONLY.
   *
   * EVERY PAGE READS WITH SCRIPTING OFF. `scripts/product.mjs` reads `section.hero`, `#hero-title` and `.sub` here for
   * the social picture, so those three stay. Every word is `lib/copy/home.ts`; the names and figures in the drawings
   * are `lib/demo/maya.ts`; the title and description are `copy/shell.ts`.
   */
  import Seo from '$lib/site/Seo.svelte';
  import { application, organization, website } from '$lib/site/seo.ts';
  import { site } from '$lib/copy.ts';
  import { home } from '$lib/copy/home.ts';
  import { today } from '$lib/copy/product.ts';
  import Filing from '$lib/home/Filing.svelte';
  import Free from '$lib/home/Free.svelte';
  import Money from '$lib/home/Money.svelte';
  import Tools from '$lib/home/Tools.svelte';
  import Yours from '$lib/home/Yours.svelte';
  import Today from '$lib/product/Today.svelte';
  import Window from '$lib/product/Window.svelte';
  import Start from '$lib/site/Start.svelte';
</script>

<Seo title={site.meta.home.title} description={site.meta.home.description} path="/" ld={[organization, website, application]} />

<section class="hero" aria-labelledby="hero-title">
  <div class="wrap">
    <div class="copy">
      <h1 id="hero-title" class="display">{home.hero.title}</h1>
      <p class="lede sub">{home.hero.sub}</p>
      <div class="ctas">
        <Start size="lg" />
        <a class="btn lg" href="/agents">{home.hero.secondary}</a>
      </div>
      <p class="early"><b>{site.early.strong}</b> {site.early.rest}</p>
    </div>
    <div class="stage">
      <Window place={today.title}><Today /></Window>
    </div>
  </div>
</section>

<Filing />
<Tools />
<Money />
<Yours />
<Free />

<style>
  .hero {
    padding-block: clamp(40px, 3vw + 24px, 72px) 0;
  }

  .copy {
    display: grid;
    justify-items: start;
    max-inline-size: 44rem;
  }

  .display {
    max-inline-size: 14ch;
  }

  .sub {
    margin-block-start: var(--sp-4);
    max-inline-size: 38rem;
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-6);
  }

  /* WHAT THE RED BUTTON LEADS TO, in one line under it. */
  .early {
    margin: var(--sp-3) 0 0;
    color: var(--ink-2);
    font-size: var(--t-site-small);
  }

  .early b {
    color: var(--ink);
    font-weight: 600;
  }

  /* THE APP, A STEP UNDER THE WORDS, at the column's full width. */
  .stage {
    margin-block-start: clamp(32px, 2vw + 24px, 56px);
  }

  @media (max-width: 640px) {
    .ctas {
      display: grid;
      inline-size: 100%;
    }

    .ctas :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
