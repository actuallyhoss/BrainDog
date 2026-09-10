<!--
  The landing page.

  One idea per section, in the order somebody actually asks them: what is it, is it real, will my
  agents use it, can I leave, what does it cost, and what will it not do. The last one is on the page
  rather than in a FAQ because the buyer here reads specifications for a living and a page that lists
  only strengths is a page nobody believes twice.

  Every screenshot is the REAL app, shot by `apps/web/scripts/shot.mjs` at 1440x900 on the same
  synthetic record the mock-up ships. A marketing page whose product shots were drawn in a design
  tool is a page that will not survive the first person who opens the app.

  WHAT THE DESIGN PASS CHANGED, AND WHY, because the words did not move and the shape did.

  The page was one colour, one column and one density: twelve sections, each a kicker, a two-line
  heading, a paragraph of five to eleven lines and a quoted note, separated by whitespace and a
  hairline. Measured on the built page at 390 and 1440 in both schemes, the whole document had
  exactly one thing in it that was a colour, and it was the primary button.

  Four changes, in the order they matter:

    - THE BANDS ALTERNATE, strictly, `--bg` and `--sunk` all the way down, so a section boundary is
      a change of ground rather than an absence of type. Two `--bg` bands used to sit against each
      other between the second pair of cards and the limits, which is where the page read as
      having ended and then continued.
    - THE BODY IS PARAGRAPHS. Every long section's copy is an array in `copy.ts` now, split only
      where it already had a full stop, with the first entry set a step larger. Same words. A
      reader gets an entry point per section instead of a wall.
    - THE SCALE GOES SOMEWHERE. Hero, section heading, lead, body, note, kicker: six steps, where
      there were three and everything under the heading was 17px.
    - A DRAWING, once. `Fields.svelte` draws the one claim on this page that no photograph can
      carry, which is that the fields have declared types. Everything else visual here is a
      photograph of a surface, and a surface shows values.
-->
<script lang="ts">
  import Code from '$lib/Code.svelte';
  import Fields from '$lib/Fields.svelte';
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
         together, so the eye can take one and stop. TWO BY TWO once there is room: in one column
         at 1140px the four facts made a 300px ladder down the left third of the screen and left
         the right two thirds empty, which is the same defect as setting them as a paragraph, in
         the other direction. -->
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
       lazy-loading the LCP element is the most common way a fast page measures slow.
       `lead`, and only here: see `Shot.svelte`. -->
  <Shot
    name="home"
    eager
    lead
    alt="The BrainDog home screen: the open questions waiting on a decision, the money that is late in both directions, and what changed since you last looked."
    caption={site.hero.caption}
  />
</section>

<!-- FULL WIDTH, and this one has to be. The section's claim is that the grid is dense and legible;
     beside a column of copy the screenshot renders at 44% and its own type is four pixels tall, so
     the picture argues the opposite of the sentence next to it. -->
<section class="band band-sunk">
  <div class="stack">
    <div class="split">
      <div class="split-copy">
        <p class="kicker">{s.typed.kicker}</p>
        <h2 class="row-title">{s.typed.title}</h2>
        {#each s.typed.body as para, i}
          <p class={i === 0 ? 'row-lead' : 'row-body'}>{para}</p>
        {/each}
        <p class="row-note">{s.typed.note}</p>
      </div>
      <!-- THE TYPES, DRAWN, beside the sentence that claims they exist. -->
      <Fields
        register={s.typed.figure.register}
        row={s.typed.figure.row}
        fields={s.typed.figure.fields}
        caption={s.typed.figure.caption}
      />
    </div>
    <!-- THE COLUMN NAMES ARE THE SCREEN'S, and they were the field ids and the labels those
         columns used to carry. This is what a screen reader user is told the picture shows, so it
         is the one alt string on the page that has to match the product's own words. -->
    <Shot name="grid" alt="The money register as a dense grid: number, description, who, which way, amount, due, status and project." />
  </div>
</section>

<section class="band">
  <div class="row row-narrow">
    <div class="row-copy">
      <p class="kicker">{s.agents.kicker}</p>
      <h2 class="row-title">{s.agents.title}</h2>
      {#each s.agents.body as para, i}
        <p class={i === 0 ? 'row-lead' : 'row-body'}>{para}</p>
      {/each}
      <!-- THE LIMIT, in the section that makes the claim rather than in a footnote. The tools are
           written and the transport is not, and a buyer who reads specifications will find that out
           in about four minutes. Better it comes from us. -->
      <p class="row-note">{s.agents.note}</p>
    </div>
    <Code code={s.agents.code} label="How an agent calls the record" />
  </div>
</section>

<section class="band band-sunk">
  <div class="row row-flip">
    <div class="row-copy">
      <p class="kicker">{s.pages.kicker}</p>
      <h2 class="row-title">{s.pages.title}</h2>
      {#each s.pages.body as para, i}
        <p class={i === 0 ? 'row-lead' : 'row-body'}>{para}</p>
      {/each}
      <p class="row-note">{s.pages.note}</p>
    </div>
    <!-- `declared page` was the word here, and `19 §9` bans it: say the thing's own name. It also
         described three figures and a bar chart, on a page that has four figures and no chart. -->
    <Shot name="money" alt="The money page: four figures against their targets, how many items sit in each status, and a table walking the balance forward to the day it goes under." />
  </div>
</section>

<!-- The two sections the widget system earns. `project` states the idea; `arrange` shows the
     controls, because "you can rearrange it" is a claim and a screenshot of the handles is not. -->
<section class="band">
  <div class="row row-narrow">
    <div class="row-copy">
      <p class="kicker">{s.project.kicker}</p>
      <h2 class="row-title">{s.project.title}</h2>
      {#each s.project.body as para, i}
        <p class={i === 0 ? 'row-lead' : 'row-body'}>{para}</p>
      {/each}
      <p class="row-note">{s.project.note}</p>
    </div>
    <Shot name="project" alt="A project page: open tasks, live agent sessions, money owed, and what it costs to run." />
  </div>
</section>

<!-- TWO SECTIONS THAT ARE NOT SCREENSHOTS. Both describe a mechanism rather than a surface, and a
     picture of a thread page is a picture of a list: the interesting part is the rule underneath
     it, which is a sentence. A shot here would be decoration, and this page has a rule against
     those. -->
<section class="band band-sunk">
  <div class="pair">
    <article class="card">
      <p class="kicker">{s.tracks.kicker}</p>
      <h2 class="card-title">{s.tracks.title}</h2>
      {#each s.tracks.body as para, i}
        <p class={i === 0 ? 'card-lead' : 'card-body'}>{para}</p>
      {/each}
      <p class="row-note">{s.tracks.note}</p>
    </article>
    <article class="card">
      <p class="kicker">{s.forecast.kicker}</p>
      <h2 class="card-title">{s.forecast.title}</h2>
      {#each s.forecast.body as para, i}
        <p class={i === 0 ? 'card-lead' : 'card-body'}>{para}</p>
      {/each}
      <p class="row-note">{s.forecast.note}</p>
    </article>
  </div>
</section>

<section class="band">
  <div class="stack">
    <div class="stack-copy">
      <p class="kicker">{s.arrange.kicker}</p>
      <h2 class="row-title">{s.arrange.title}</h2>
      {#each s.arrange.body as para, i}
        <p class={i === 0 ? 'row-lead' : 'row-body'}>{para}</p>
      {/each}
      <p class="row-note">{s.arrange.note}</p>
    </div>
    <!-- `phone={false}`: arranging is a STATE and its setup presses a control a narrow window
         puts somewhere else, so `product.mjs` takes no narrow capture of it and this falls back
         to the wide one. -->
    <Shot name="arrange" phone={false} alt="The same page being arranged: a handle, a width control reading Full, Half and Third, and move and remove buttons on every block." />
  </div>
</section>

<section class="band band-sunk">
  <div class="pair">
    <article class="card">
      <p class="kicker">{s.vault.kicker}</p>
      <h2 class="card-title">{s.vault.title}</h2>
      {#each s.vault.body as para, i}
        <p class={i === 0 ? 'card-lead' : 'card-body'}>{para}</p>
      {/each}
      <!-- THE CAVEAT THIS SECTION WAS THE ONLY ONE WITHOUT. Every other section describing an
           unbuilt half carries it in the same place, and this one was making the strongest
           promise on the page. -->
      <p class="row-note">{s.vault.note}</p>
    </article>
    <article class="card">
      <p class="kicker">{s.own.kicker}</p>
      <h2 class="card-title">{s.own.title}</h2>
      {#each s.own.body as para, i}
        <p class={i === 0 ? 'card-lead' : 'card-body'}>{para}</p>
      {/each}
    </article>
  </div>
</section>

<section class="band">
  <div class="limits">
    <p class="kicker">{site.limits.kicker}</p>
    <h2 class="row-title">{site.limits.title}</h2>
    <!-- NUMBERED, AND THE HEADING ALREADY SAID THREE. Three bare columns of prose under a heading
         that counts them is the one place on the page where a numeral is free: it is not a claim,
         it is the count the sentence above already makes, and it is the only figure on a page
         that otherwise shows none. -->
    <ol class="limit-grid">
      {#each site.limits.items as item, i}
        <li class="limit">
          <span class="limit-n num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <h3 class="limit-title">{item.title}</h3>
          <p class="limit-body">{item.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<section class="band band-close">
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

  /**
   * THE LADDER, AND IT IS THE WHOLE REASON THE PAGE HAS A RHYTHM NOW.
   *
   * `--sunk` and `--bg` are eight values apart in the light scheme, which is exactly right for a
   * band boundary and useless as the only thing separating two sections a screen apart. The fix
   * is not more contrast, it is ALTERNATION: every section changes ground, so the boundary is
   * read as a change rather than measured as a difference. The border stays, because under
   * forced colours every surface collapses to Canvas and the border is the only boundary left.
   */
  .band-sunk {
    background: var(--sunk);
    border-block: 1px solid var(--line);
  }

  /**
   * THE ONE TINTED GROUND ON THE SITE, and it is under the last action.
   *
   * A `color-mix` and not a token: this is the accent at seven per cent, which is a ground rather
   * than a colour anybody has to read anything against, and it exists so the closing band is not
   * the ninth grey band in a row. Both schemes get it from the same expression, because
   * `--accent` and `--bg` both move with the scheme.
   */
  .band-close {
    background: var(--accent-ground);
    border-block-start: 1px solid var(--line);
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
    padding-block: var(--sp-8) var(--sp-8);
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
    font-size: var(--t-lg);
    font-weight: 500;
    line-height: 1.4;
    text-wrap: balance;
  }

  /* The marker is a rule rather than a bullet: four one-line facts under a lead sentence read as
     evidence, and a bulleted list of four reads as a feature table. */
  .hero-knows {
    display: grid;
    gap: var(--sp-3) var(--sp-6);
    margin: var(--sp-5) 0 0;
    padding: 0;
    list-style: none;
  }

  .hero-knows li {
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--edge);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.45;
  }

  .hero-body {
    max-inline-size: 52ch;
    margin-block-start: var(--sp-6);
    color: var(--ink);
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
    margin-block-start: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  /**
   * THE PRESS, AND THE SITE HAD NONE.
   *
   * A count of `:active` across this app's three stylesheets returned zero, on a page whose only
   * interactive elements are the six things somebody might actually press. `tokens.css` carries
   * `--press-scale`, `--press-dim` and `--ease-push` for exactly this and nothing here read them.
   *
   * TWO PROPERTIES, AND THAT IS THE POINT OF THE PAIR. `a11y.css` collapses every duration to 1ms
   * under `prefers-reduced-motion`, so a press expressed only as a scale is not damped for those
   * readers, it is gone. Opacity is a STATE rather than a duration and still lands.
   */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    transition:
      transform var(--d-release) var(--ease-out),
      opacity var(--d-release) var(--ease-out),
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .btn:hover {
    background: var(--s2);
    border-color: var(--edge);
  }

  .btn:active {
    transform: scale(var(--press-scale));
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent-edge);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
  }

  /* The generated palette solves a hover and a press value for the accent in both schemes. This
     was two hand-written `color-mix` expressions towards `--sunk`, which is a third answer to a
     question the theme had already answered twice. */
  .btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .btn-primary:active {
    background: var(--accent-press);
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

  /* Copy on the left, the drawing on the right, and the full-width photograph under both. The
     three are three different KINDS of evidence for one claim, in the order they can be taken:
     the sentence, the mechanism, the surface. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
    align-items: start;
    gap: var(--sp-7);
  }

  .row-flip .row-copy {
    order: 2;
  }

  /**
   * THE SECTION MARK, and it is the second thing on this page that is a colour.
   *
   * A kicker set in 11px dim uppercase is a label a reader's eye skips, which is why nine of them
   * down one page separated nothing. The bar is the brand at full strength, twenty pixels of it,
   * repeated at every section: it costs one pseudo-element and it is what makes the top of a
   * section visible in peripheral vision while you are still reading the one above.
   */
  .kicker {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .kicker::before {
    content: '';
    inline-size: 20px;
    block-size: 3px;
    flex: none;
    background: var(--accent);
    border-radius: var(--r-sm);
  }

  .row-title,
  .close-title {
    font-size: clamp(var(--t-2xl), 3.4vw, 40px);
    line-height: 1.12;
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  /**
   * THE FIRST PARAGRAPH IS A SIZE OF ITS OWN, AND IT IS THE WHOLE TYPE SCALE FIX.
   *
   * Everything under a heading used to be 17px: the argument, the detail and, one step down, the
   * caveat. `--t-lg` on the claim and `--t-base` on the detail is one step of the ladder spent
   * where a reader is deciding whether to keep going, and it costs no words.
   */
  .row-lead {
    margin-block-start: var(--sp-4);
    max-inline-size: 46ch;
    color: var(--ink);
    font-size: var(--t-lg);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .row-body {
    margin-block-start: var(--sp-4);
    max-inline-size: 56ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  /* The line that says the specific true thing. Smaller and dimmer than the body, because it is for
     the reader who has already decided they are interested and wants to know how. */
  .row-note {
    margin-block-start: var(--sp-5);
    padding-inline-start: var(--sp-4);
    border-inline-start: 2px solid var(--edge);
    max-inline-size: 56ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5);
  }

  /**
   * A CARD WAS THE SAME COLOUR AS THE BAND IT SAT IN.
   *
   * `background: var(--bg)` on a card inside a `--bg` band is an outline around nothing, and all
   * four cards on this page were drawn that way. They sit on `--sunk` bands now and take `--s1`,
   * which is the next step up the ladder in both schemes, plus the first level of the elevation
   * the theme generates and this app painted at none of its three levels.
   */
  .card {
    display: flex;
    flex-direction: column;
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--raise);
  }

  .card-title {
    font-size: var(--t-xl);
    line-height: 1.18;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  /**
   * `.card-body` WAS A CLASS NO RULE DEFINED.
   *
   * Two of the four cards wrote `class="card-body"` and two wrote `class="row-body"`, and there
   * has never been a `.card-body` rule in this file: so the thread and forecast cards set their
   * copy at the inherited 15px hard against the heading, and the vault and data cards set the
   * same copy at 17px with a gap over it. Two pairs of cards, drawn to two different
   * specifications, on the same page. Both pairs take the same two rules now.
   */
  .card-lead {
    margin-block-start: var(--sp-3);
    color: var(--ink);
    font-size: var(--t-md);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .card-body {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .card .row-note {
    margin-block-start: auto;
    padding-block-start: var(--sp-5);
  }

  .limit-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-6) var(--sp-5);
    margin: var(--sp-7) 0 0;
    padding: 0;
    list-style: none;
  }

  .limit {
    padding-block-start: var(--sp-4);
    border-block-start: 2px solid var(--line);
  }

  .limit-n {
    display: block;
    margin-block-end: var(--sp-2);
    color: var(--accent-text);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .limit-title {
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .limit-body {
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* `--sp-4` and it was `--sp-7`, which the band's own `--sp-8` was already sitting under: 112
     pixels of nothing over a two-line heading and 112 under it, so the last thing on the page was
     mostly the absence of anything. */
  .close {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-4);
    text-align: center;
  }

  .close-title {
    max-inline-size: 20ch;
  }

  /**
   * ARRIVAL, AND IT CANNOT FAIL OPEN.
   *
   * Nothing on this page has ever moved. A section that rises the last few pixels as it comes into
   * view is the cheapest thing a document can do to stop reading like a document, and it is worth
   * having only if the page is correct in every case where it does not run.
   *
   *   - `@supports (animation-timeline: view())` so a browser without scroll-driven animation gets
   *     no animation at all, rather than every band on the page animating at once on load, which
   *     is what a `view()` declaration that gets dropped leaves behind.
   *   - `prefers-reduced-motion: no-preference` so the whole thing is absent rather than damped.
   *     There is no state here to preserve: an arrival is not a state change, it is an entrance.
   *   - The BASE style is the finished one and the keyframe holds the start, so any failure mode
   *     is the page as it was, and the fade starts at 0.4 rather than 0 so even a wedged animation
   *     leaves legible type rather than a blank band.
   */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .stack,
      .row,
      .pair,
      .limits,
      .close {
        animation: arrive linear both;
        animation-timeline: view();
        animation-range: entry 10% cover 24%;
      }
    }
  }

  @keyframes arrive {
    from {
      opacity: 0.4;
      transform: translateY(16px);
    }
  }

  @media (width >= 760px) {
    .hero-knows {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      max-inline-size: 68ch;
    }
  }

  /**
   * THE LEAD SHOT IS WIDER THAN THE MEASURE, and it is the only one that is.
   *
   * Five screenshots at 1140px is five pictures of equal importance. This one is the product,
   * above the fold, and it steps out of the reading column by one space unit each side so it is
   * the widest thing on the page as well as the only one carrying `--e2`.
   *
   * THE THRESHOLD IS ARITHMETIC AND NOT TASTE. The container is 1140 with `--sp-5` of padding, so
   * the picture is 1092 + 96 = 1188 wide; below 1236px of viewport that is wider than the window.
   * 1240 leaves 26px of gutter at the narrowest width where the rule applies, and the overflow
   * measurement at 320, 360, 390, 430, 768 and 1440 is what checks it rather than this comment.
   */
  @media (width >= 1240px) {
    .hero :global(.shot) {
      margin-inline: calc(var(--sp-7) * -1);
    }
  }

  @media (width < 900px) {
    .row,
    .row-narrow,
    .split,
    .pair,
    .limit-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
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

  /* Two buttons of different widths, stacked, are two ragged edges under a headline. On a phone
     they are one column and they are the same width. */
  @media (width < 560px) {
    .hero-actions .btn {
      flex: 1 1 100%;
    }
  }
</style>
