<!--
  The landing page.

  One idea per section, in the order somebody actually asks them: what is it, is it real, will my
  agents use it, can I leave, what does it cost, and what will it not do. The last one is on the page
  rather than in a FAQ because the buyer here reads specifications for a living and a page that lists
  only strengths is a page nobody believes twice.

  Every screenshot is the REAL app, shot by `apps/web/scripts/shot.mjs` at 1440x900 on the same
  synthetic record the mock-up ships. A marketing page whose product shots were drawn in a design
  tool is a page that will not survive the first person who opens the app.
-->
<script lang="ts">
  import Shot from '$lib/Shot.svelte';
  import { APP, DOCS, site } from '$lib/copy.ts';

  const s = site.sections;
</script>

<svelte:head>
  <!-- THE TITLE AND THE DESCRIPTION ARE THEIR OWN SENTENCES, in `copy.ts`, and they were the
       page's own. `<title>` was the bare brand under an `og:site_name` that is also the bare
       brand, and the description was 304 characters of hero body whose first four clauses are
       rhetorical questions, so the snippet a stranger reads never reached the sentence that says
       what this is. -->
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <!-- THE CANONICAL AND THE PREVIEW, from the same two sentences the page already has, so there is
       one description per page rather than two that can disagree. The canonical matters because
       `www` 301s here and a preview fetcher that followed the redirect would otherwise cite the
       hostname it started from. -->
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
</svelte:head>

<section class="hero">
  <div class="hero-copy">
    <h1 class="hero-title">{site.hero.title}</h1>
    <p class="hero-lead">{site.hero.lead}</p>
    <!-- A LIST, BECAUSE IT IS A LIST. Four things a business knows, marked rather than run
         together, so the eye can take one and stop. -->
    <ul class="hero-knows">
      {#each site.hero.knows as one}<li>{one}</li>{/each}
    </ul>
    <p class="hero-body">{site.hero.body}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="{APP}/start">{site.hero.primary}</a>
      <!-- THE SECOND ACTION IS THE CHANGELOG WHILE THE DESIGN IS NOT READABLE. It pointed at the
           `docs/` tree in a private repository, so the one thing this page offers a reader who is
           not ready to open the app was a 404. The changelog is the honest substitute: it is the
           account of what is built and what is not, it is on this site, and it is what the design
           link was being read for. -->
      <a class="btn" href={DOCS ?? '/changelog'}>{DOCS ? site.hero.secondary : site.hero.changelog}</a>
    </div>
    <!-- WHAT THE BUTTON ABOVE ACTUALLY DOES. The pricing page says "hosting has no billing and no
         sign-up" and the changelog says the app draws a synthetic record; the page carrying the
         button said neither, and the button said `Start a record`. -->
    <p class="hero-note">{site.hero.note}</p>
  </div>

  <!-- `eager`, and only here. The hero screenshot is the largest contentful paint on this page, and
       lazy-loading the LCP element is the most common way a fast page measures slow. -->
  <Shot
    name="home"
    eager
    alt="The BrainDog home screen: the open questions waiting on a decision, the money that is late in both directions, and what changed since you last looked."
    caption={site.hero.caption}
  />
</section>

<!-- FULL WIDTH, and this one has to be. The section's claim is that the grid is dense and legible;
     beside a column of copy the screenshot renders at 44% and its own type is four pixels tall, so
     the picture argues the opposite of the sentence next to it. -->
<section class="band">
  <div class="stack">
    <div class="stack-copy">
      <p class="kicker">{s.typed.kicker}</p>
      <h2 class="row-title">{s.typed.title}</h2>
      <p class="row-body">{s.typed.body}</p>
      <p class="row-note">{s.typed.note}</p>
    </div>
    <!-- THE COLUMN NAMES ARE THE SCREEN'S, and they were the field ids and the labels those
         columns used to carry. This is what a screen reader user is told the picture shows, so it
         is the one alt string on the page that has to match the product's own words. -->
    <Shot name="grid" alt="The money register as a dense grid: number, description, who, which way, amount, due, status and project." />
  </div>
</section>

<section class="band band-sunk">
  <div class="row row-narrow">
    <div class="row-copy">
      <p class="kicker">{s.agents.kicker}</p>
      <h2 class="row-title">{s.agents.title}</h2>
      <p class="row-body">{s.agents.body}</p>
      <!-- THE LIMIT, in the section that makes the claim rather than in a footnote. The tools are
           written and the transport is not, and a buyer who reads specifications will find that out
           in about four minutes. Better it comes from us. -->
      <p class="row-note">{s.agents.note}</p>
    </div>
    <pre class="code"><code>{s.agents.code}</code></pre>
  </div>
</section>

<section class="band">
  <div class="row row-flip">
    <div class="row-copy">
      <p class="kicker">{s.pages.kicker}</p>
      <h2 class="row-title">{s.pages.title}</h2>
      <p class="row-body">{s.pages.body}</p>
      <p class="row-note">{s.pages.note}</p>
    </div>
    <!-- `declared page` was the word here, and `19 §9` bans it: say the thing's own name. It also
         described three figures and a bar chart, on a page that has four figures and no chart. -->
    <Shot name="money" alt="The money page: four figures against their targets, how many items sit in each status, and a table walking the balance forward to the day it goes under." />
  </div>
</section>

<!-- The two sections the widget system earns. `project` states the idea; `arrange` shows the
     controls, because "you can rearrange it" is a claim and a screenshot of the handles is not. -->
<section class="band band-sunk">
  <div class="row row-narrow">
    <div class="row-copy">
      <p class="kicker">{s.project.kicker}</p>
      <h2 class="row-title">{s.project.title}</h2>
      <p class="row-body">{s.project.body}</p>
      <p class="row-note">{s.project.note}</p>
    </div>
    <Shot name="project" alt="A project page: open tasks, live agent sessions, money owed, and what it costs to run." />
  </div>
</section>

<!-- TWO SECTIONS THAT ARE NOT SCREENSHOTS. Both describe a mechanism rather than a surface, and a
     picture of a track page is a picture of a list — the interesting part is the rule underneath it,
     which is a sentence. A shot here would be decoration, and this page has a rule against those. -->
<section class="band">
  <div class="pair">
    <article class="card">
      <p class="kicker">{s.tracks.kicker}</p>
      <h2 class="card-title">{s.tracks.title}</h2>
      <p class="card-body">{s.tracks.body}</p>
      <p class="row-note">{s.tracks.note}</p>
    </article>
    <article class="card">
      <p class="kicker">{s.forecast.kicker}</p>
      <h2 class="card-title">{s.forecast.title}</h2>
      <p class="card-body">{s.forecast.body}</p>
      <p class="row-note">{s.forecast.note}</p>
    </article>
  </div>
</section>

<section class="band band-sunk">
  <div class="stack">
    <div class="stack-copy">
      <p class="kicker">{s.arrange.kicker}</p>
      <h2 class="row-title">{s.arrange.title}</h2>
      <p class="row-body">{s.arrange.body}</p>
      <p class="row-note">{s.arrange.note}</p>
    </div>
    <!-- `phone={false}`: arranging is a STATE and its setup presses a control a narrow window
         puts somewhere else, so `product.mjs` takes no narrow capture of it and this falls back
         to the wide one. -->
    <Shot name="arrange" phone={false} alt="The same page being arranged: a handle, a width control reading Full, Half and Third, and move and remove buttons on every block." />
  </div>
</section>

<section class="band">
  <div class="pair">
    <article class="card">
      <p class="kicker">{s.vault.kicker}</p>
      <h2 class="card-title">{s.vault.title}</h2>
      <p class="row-body">{s.vault.body}</p>
      <!-- THE CAVEAT THIS SECTION WAS THE ONLY ONE WITHOUT. Every other section describing an
           unbuilt half carries it in the same place, and this one was making the strongest
           promise on the page. -->
      <p class="row-note">{s.vault.note}</p>
    </article>
    <article class="card">
      <p class="kicker">{s.own.kicker}</p>
      <h2 class="card-title">{s.own.title}</h2>
      <p class="row-body">{s.own.body}</p>
    </article>
  </div>
</section>

<section class="band">
  <div class="limits">
    <p class="kicker">{site.limits.kicker}</p>
    <h2 class="row-title">{site.limits.title}</h2>
    <div class="limit-grid">
      {#each site.limits.items as item}
        <article class="limit">
          <h3 class="limit-title">{item.title}</h3>
          <p class="row-body">{item.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="band band-sunk">
  <div class="close">
    <h2 class="close-title">{site.hero.title}</h2>
    <div class="hero-actions">
      <a class="btn btn-primary" href="{APP}/start">{site.hero.primary}</a>
      <a class="btn" href="/pricing">{site.nav.pricing}</a>
    </div>
  </div>
</section>

<style>
  .band {
    padding-block: var(--sp-8);
  }

  .band-sunk {
    background: var(--sunk);
    border-block: 1px solid var(--line);
  }

  .hero,
  .row,
  .stack,
  .pair,
  .limits,
  .close {
    max-inline-size: 1140px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    padding-block: var(--sp-8) var(--sp-7);
  }

  /* One rule and not two. There were two `.hero-copy` blocks in this file, thirty lines apart, and
     the second set `max-inline-size: none` over the first one's `24ch` — so the measure the first
     rule existed to set had never once applied. */
  .hero-copy {
    max-inline-size: none;
  }

  /* `clamp` and not a media query, because the headline's job is to fit. A step scale gives you
     one size that is slightly too big at 900px and another slightly too small at 901. */
  .hero-title {
    font-size: clamp(40px, 6.4vw, 68px);
    line-height: 1.03;
    letter-spacing: -0.033em;
    text-wrap: balance;
  }

  .hero-lead {
    /* The headline is set at `line-height: 1.03` and `text-wrap: balance`, so its last line has
       almost no descender room under it. A lead sentence at the container's own gap sits on top
       of the headline rather than under it. */
    margin: var(--sp-4) 0 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.5;
  }

  /* The marker is a rule rather than a bullet: four one-line facts under a lead sentence read as
     evidence, and a bulleted list of four reads as a feature table. */
  .hero-knows {
    display: grid;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 var(--sp-1);
    padding: 0;
    list-style: none;
  }

  .hero-knows li {
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.45;
  }

  .hero-body {
    max-inline-size: 62ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-block-start: var(--sp-5);
  }

  /* Under the buttons and not beside them: it is about what pressing one does, and a caveat set
     beside a control reads as a caption for the page rather than for the press. */
  .hero-note {
    max-inline-size: 56ch;
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    padding: 0 var(--sp-5);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--ink) 12%, transparent);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    text-decoration: none;
  }

  .btn:hover {
    background: var(--s2);
    border-color: var(--edge);
  }

  .btn-primary {
    background: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 72%, var(--sunk));
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, var(--sunk));
    border-color: color-mix(in srgb, var(--accent) 58%, var(--sunk));
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: center;
    gap: var(--sp-7);
  }

  .row-narrow {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  /**
   * THE FLIPPED ROW WAS GIVING THE SCREENSHOT THE NARROW COLUMN.
   *
   * `.row` is 5fr of copy beside 7fr of picture, and `order: 2` on the copy moved it to the second
   * track without moving the track widths with it. So the one section whose whole argument is a
   * screenshot got 5fr of it and the sentence got 7fr: the money page rendered at 41% of the row and
   * its own type was five pixels tall, which is the exact failure the `typed` section above is a
   * full-width band to avoid. The columns swap with the content.
   */
  .row-flip {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  /* The copy keeps a reading measure even though the picture under it is the full width. A 1140px
     line of prose is a line the eye loses its place in. */
  .stack-copy {
    max-inline-size: 62ch;
  }

  .row-flip .row-copy {
    order: 2;
  }

  .kicker {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .row-title,
  .close-title {
    font-size: clamp(28px, 3.4vw, 38px);
    letter-spacing: -0.026em;
    text-wrap: balance;
  }

  .row-body {
    margin-block-start: var(--sp-3);
    max-inline-size: 56ch;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* The line that says the specific true thing. Smaller and dimmer than the body, because it is for
     the reader who has already decided they are interested and wants to know how. */
  .row-note {
    margin-block-start: var(--sp-4);
    padding-inline-start: var(--sp-4);
    border-inline-start: 2px solid var(--edge);
    max-inline-size: 56ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .code {
    margin: 0;
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    line-height: 1.8;
    overflow-x: auto;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5);
  }

  .card {
    padding: var(--sp-6);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .card-title {
    font-size: var(--t-xl);
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .limit-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-5);
    margin-block-start: var(--sp-6);
  }

  .limit-title {
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .limit .row-body {
    font-size: var(--t-ui);
  }

  .close {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-6);
    text-align: center;
  }

  .close-title {
    max-inline-size: 20ch;
  }

  @media (width < 900px) {
    .row,
    .row-narrow,
    .pair,
    .limit-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    /* The flipped row un-flips: on one column the copy always comes first, because a picture above
       the sentence that explains it is a picture nobody has been told to look at yet. */
    .row-flip .row-copy {
      order: 0;
    }

    .band {
      padding-block: var(--sp-7);
    }

    .hero,
    .row,
    .stack,
    .pair,
    .limits,
    .close {
      padding-inline: var(--sp-4);
    }
  }
</style>
