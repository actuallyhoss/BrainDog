<!--
  The landing page.

  One idea per section, in the order somebody actually asks them: what is it, is it real, will my
  agents use it, can I leave, what does it cost, and what will it not do. The last one is on the page
  rather than in a FAQ because the buyer here reads specifications for a living and a page that lists
  only strengths is a page nobody believes twice.

  The screenshots below the fold are the REAL app, shot by `apps/web/scripts/shot.mjs` on the same
  synthetic record the demo opens. The one at the top is drawn from that record instead, for the
  reason `Preview.svelte` gives, and nothing in it is invented either.

  WHAT THE SECOND DESIGN PASS CHANGED, AND WHY. The words barely moved. The owner's verdict on the
  first pass was "boring" and "a corporate tool", and it was right about the shape:

    - ONE GROUND, NOT STRIPES. Every section alternated `--bg` and `--sunk` with a rule at each
      edge, which on a near-black page is a stack of grey bars. Sections now share one ground and
      are separated by space and one hairline.
    - A SMALL COLOURED GLYPH OVER EVERY SECTION instead of an uppercase eyebrow. Same words, in
      sentence case (`Tag.svelte`).
    - CARDS WHERE THE CONTENT IS A SET: the four facts, the four mechanisms, the three limits. Prose
      stays prose.
    - THE CAVEATS LOST THEIR QUOTE BAR and got a glyph instead (`Note.svelte`).
    - PILLS, AND ONE FILLED PER VIEW. See `app.css`.
-->
<script lang="ts">
  import Code from '$lib/Code.svelte';
  import Fields from '$lib/Fields.svelte';
  import Icon from '$lib/Icon.svelte';
  import Note from '$lib/Note.svelte';
  import Preview from '$lib/Preview.svelte';
  import Shot from '$lib/Shot.svelte';
  import Tag from '$lib/Tag.svelte';
  import type { Hue, IconName } from '$lib/icons.ts';
  import { APP, DOCS, site } from '$lib/copy.ts';

  const s = site.sections;

  type Section = { kicker: string; title: string; body: readonly string[]; note?: string };

  /* One glyph per fact, in the order `copy.ts` lists them. */
  type Mark = { icon: IconName; hue: Hue };
  const MARKS: Mark[] = [
    { icon: 'money', hue: 'earn' },
    { icon: 'calendar', hue: 'warn' },
    { icon: 'key', hue: 'accent' },
    { icon: 'decide', hue: 'info' },
  ];
  const PLAIN: Mark = { icon: 'info', hue: 'accent' };
  const knows = site.hero.knows.map((text, i) => ({ text, ...(MARKS[i] ?? PLAIN) }));
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

{#snippet copy(c: Section, icon: IconName, hue: Hue)}
  <Tag {icon} {hue} label={c.kicker} />
  <h2 class="title">{c.title}</h2>
  {#each c.body as para, i}<p class:lead={i === 0} class:para={i > 0}>{para}</p>{/each}
  {#if c.note}<div class="note-at"><Note text={c.note} /></div>{/if}
{/snippet}

{#snippet card(c: Section, icon: IconName, hue: Hue)}
  <article class="card">
    <Tag {icon} {hue} label={c.kicker} />
    <h2 class="card-title">{c.title}</h2>
    {#each c.body as para, i}<p class:lead={i === 0} class:para={i > 0}>{para}</p>{/each}
    {#if c.note}<div class="note-at"><Note text={c.note} /></div>{/if}
  </article>
{/snippet}

<section class="hero">
  <div class="wrap hero-copy">
    <h1 class="hero-title">{site.hero.title}</h1>
    <p class="hero-lead">{site.hero.lead}</p>
    <!-- A LIST, BECAUSE IT IS A LIST. Four things a business knows, each a small card with its own
         glyph, so the eye can take one and stop. They sat behind a grey rule each, which set four
         plain facts as four quotations. -->
    <ul class="knows">
      {#each knows as one}
        <li class="know">
          <span class="glyph" data-hue={one.hue}><Icon name={one.icon} /></span>
          <span>{one.text}</span>
        </li>
      {/each}
    </ul>
    <p class="hero-body">{site.hero.body}</p>
    <div class="actions">
      <!--
        THE BUTTON THAT SAYS DEMO OPENS THE DEMO, AND IT USED TO OPEN A FORM.

        It read `Open the demo record` and pointed at `{APP}/start`, the first-run screen, which
        asks a stranger what their business is before showing them anything. `{APP}` is the demo,
        and the note under this button promises "a made-up business, not yours", which is what it
        is. `/start` is still one tap away, from the sample bar's `Start your own` inside the demo,
        for the person who has seen enough to want one. The closing card repeats this button and
        points at the same place.
      -->
      <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" /></a>
      <!-- THE SECOND ACTION IS THE CHANGELOG WHILE THE DESIGN IS NOT READABLE. It pointed at the
           `docs/` tree in a private repository, so the one thing this page offers a reader who is
           not ready to open the app was a 404. The changelog is the honest substitute: it is the
           account of what is built and what is not, and it is on this site. -->
      <a class="btn btn-lg" href={DOCS ?? '/changelog'}>{DOCS ? site.hero.secondary : site.hero.changelog}</a>
    </div>
    <!-- WHAT THE BUTTON ABOVE ACTUALLY DOES, under it rather than beside it: it is about what
         pressing one does, and a caveat beside a control reads as a caption for the page. -->
    <p class="hero-note">{site.hero.note}</p>
  </div>

  <div class="wrap preview-at">
    <Preview />
  </div>
</section>

<!-- THE GRID IS FULL WIDTH, and it has to be. The section's claim is that the grid is dense and
     legible; beside a column of copy the screenshot renders at 44% and its own type is four pixels
     tall, so the picture argues the opposite of the sentence next to it. -->
<section class="band">
  <div class="wrap stack">
    <div class="split">
      <div class="copy">{@render copy(s.typed, 'rows', 'info')}</div>
      <!-- THE TYPES, DRAWN, beside the sentence that claims they exist. -->
      <Fields
        register={s.typed.figure.register}
        row={s.typed.figure.row}
        fields={s.typed.figure.fields}
        caption={s.typed.figure.caption}
      />
    </div>
    <!-- THE COLUMN NAMES ARE THE SCREEN'S. This is what a screen reader user is told the picture
         shows, so it is the one alt string on the page that has to match the product's own words. -->
    <Shot name="grid" alt="The money register as a dense grid: number, description, who, which way, amount, due, status and project." />
  </div>
</section>

<section class="band">
  <div class="wrap row row-even">
    <!-- THE LIMIT is in the section's own note rather than in a footnote. The tools are written and
         the transport is not, and a buyer who reads specifications will find that out in about
         four minutes. Better it comes from us. -->
    <div class="copy">{@render copy(s.agents, 'code', 'accent')}</div>
    <Code code={s.agents.code} label="How an agent calls the record" />
  </div>
</section>

<section class="band">
  <div class="wrap row row-flip">
    <div class="copy">{@render copy(s.pages, 'doc', 'earn')}</div>
    <Shot name="money" alt="The money page: four figures against their targets, how many items sit in each status, and a table walking the balance forward to the day it goes under." />
  </div>
</section>

<!-- The two sections the widget system earns, now side by side in the page's order. `project`
     states the idea; `arrange` shows the controls, because "you can rearrange it" is a claim and a
     screenshot of the handles is not. -->
<section class="band">
  <div class="wrap row row-even">
    <div class="copy">{@render copy(s.project, 'thing', 'warn')}</div>
    <Shot name="project" alt="A project page: open tasks, live agent sessions, money owed, and what it costs to run." />
  </div>
</section>

<section class="band">
  <div class="wrap stack">
    <div class="copy stack-copy">{@render copy(s.arrange, 'grid', 'info')}</div>
    <!-- `phone={false}`: arranging is a STATE and its setup presses a control a narrow window
         puts somewhere else, so `product.mjs` takes no narrow capture of it and this falls back
         to the wide one. -->
    <Shot name="arrange" phone={false} alt="The same page being arranged: a handle, a width control reading Full, Half and Third, and move and remove buttons on every block." />
  </div>
</section>

<!-- FOUR MECHANISMS, NOT SCREENSHOTS, and together now rather than split in two pairs by a
     picture. Each describes a rule rather than a surface, and a picture of a thread page is a
     picture of a list: the interesting part is the rule underneath it, which is a sentence. -->
<section class="band">
  <div class="wrap cards">
    {@render card(s.tracks, 'link', 'accent')}
    {@render card(s.forecast, 'calendar', 'earn')}
    <!-- The vault's note is the caveat that it cannot reveal a secret yet. It was the only section
         describing an unbuilt half without one, and it makes the strongest promise on the page. -->
    {@render card(s.vault, 'lock', 'warn')}
    {@render card(s.own, 'download', 'info')}
  </div>
</section>

<section class="band">
  <div class="wrap limits">
    <Tag icon="ban" hue="accent" label={site.limits.kicker} />
    <h2 class="title">{site.limits.title}</h2>
    <!-- NUMBERED, AND THE HEADING ALREADY SAID THREE. The numeral is not a claim, it is the count
         the sentence above already makes. -->
    <ol class="limit-grid">
      {#each site.limits.items as item, i}
        <li class="limit">
          <span class="limit-n num" aria-hidden="true">{i + 1}</span>
          <h3 class="limit-title">{item.title}</h3>
          <p class="limit-body">{item.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<section class="band band-close">
  <div class="wrap">
    <div class="close">
      <h2 class="close-title">{site.hero.title}</h2>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" /></a>
        <a class="btn btn-lg" href="/pricing">{site.nav.pricing}</a>
      </div>
    </div>
  </div>
</section>

<style>
  .wrap {
    max-inline-size: 1140px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  /* ── The hero ─────────────────────────────────────────────────────── */

  .hero {
    padding-block: clamp(40px, 6vw, 88px) clamp(56px, 7vw, 96px);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  /* `clamp` and not a media query, because the headline's job is to fit. A step scale gives you
     one size that is slightly too big at 900px and another slightly too small at 901. */
  .hero-title {
    max-inline-size: 14em;
    font-size: clamp(38px, 4.2vw + 16px, 64px);
    line-height: 1.04;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .hero-lead {
    max-inline-size: 36ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.45;
    text-wrap: balance;
  }

  .knows {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-3);
    inline-size: 100%;
    margin-block-start: var(--sp-7);
    padding: 0;
    list-style: none;
    text-align: start;
  }

  .know {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding-block: var(--sp-4) 18px;
    padding-inline: 18px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.45;
  }

  .hero-body {
    max-inline-size: 44ch;
    margin-block-start: var(--sp-7);
    color: var(--ink);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: balance;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-5);
  }

  .hero-note {
    max-inline-size: 52ch;
    margin-block-start: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
    text-wrap: balance;
  }

  .preview-at {
    margin-block-start: clamp(40px, 6vw, 72px);
  }

  /* ── Sections ─────────────────────────────────────────────────────── */

  /* One ground all the way down, and a hairline where one section hands over to the next. Under
     forced colours the hairline is the boundary that survives, which is why it is a border. */
  .band {
    padding-block: clamp(56px, 7vw, 96px);
    border-block-start: 1px solid var(--line);
  }

  .title {
    margin-block-start: var(--sp-4);
    font-size: clamp(26px, 1.4vw + 18px, 36px);
    line-height: 1.15;
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  /**
   * THE FIRST PARAGRAPH IS A SIZE OF ITS OWN. `--t-lg` on the claim and `--t-base` on the detail is
   * one step of the ladder spent where a reader is deciding whether to keep going, and it costs no
   * words.
   */
  .lead {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-4);
    color: var(--ink);
    font-size: var(--t-lg);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .para {
    max-inline-size: 58ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .note-at {
    margin-block-start: var(--sp-5);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: center;
    gap: var(--sp-7);
  }

  .row-even {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  /**
   * THE FLIPPED ROW SWAPS ITS TRACKS WITH ITS CONTENT. `order` alone moved the copy into the second
   * track without moving the widths with it, so the one section whose argument is a screenshot gave
   * it the narrow column and its type rendered five pixels tall.
   */
  .row-flip {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  }

  .row-flip .copy {
    order: 2;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
  }

  /* The copy keeps a reading measure even though the picture under it is the full width. */
  .stack-copy {
    max-inline-size: 62ch;
  }

  /* Copy, then the drawing, then the full-width photograph under both: the sentence, the
     mechanism, the surface. */
  .split {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-7);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
  }

  /* A card sits one step up the ladder from the ground it is on, with the first level of the
     elevation the theme generates. A card the same colour as its ground is an outline around
     nothing. */
  .card {
    display: flex;
    flex-direction: column;
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .card-title {
    margin-block-start: var(--sp-4);
    font-size: var(--t-lg);
    line-height: 1.25;
    letter-spacing: -0.018em;
    text-wrap: balance;
  }

  .card .lead {
    max-inline-size: none;
    margin-block-start: var(--sp-3);
    font-size: var(--t-md);
  }

  .card .para {
    max-inline-size: none;
  }

  /* The note sits at the foot of the card, so two cards of different lengths still end on the
     same kind of line. */
  .card .note-at {
    margin-block-start: auto;
    padding-block-start: var(--sp-5);
  }

  .limit-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-4);
    margin-block-start: var(--sp-6);
    padding: 0;
    list-style: none;
  }

  .limit {
    padding: var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .limit-n {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-block-end: var(--sp-3);
    background: var(--accent-wash);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
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

  /**
   * THE ONE TINTED GROUND ON THE SITE, and it is under the last action. It is a card now rather
   * than a full-width band, so the page ends on one object with an edge instead of a coloured
   * stripe, a grey one and then the footer. `--accent-ground` is the accent mixed into `--bg`,
   * which is a ground rather than a colour anybody has to read against.
   */
  .band-close {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .close {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-block: clamp(40px, 6vw, 72px);
    padding-inline: var(--sp-5);
    background: var(--accent-ground);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    text-align: center;
  }

  .close-title {
    max-inline-size: 16ch;
    font-size: clamp(28px, 2.4vw + 16px, 44px);
    line-height: 1.1;
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  /**
   * ARRIVAL, AND IT CANNOT FAIL OPEN.
   *
   *   - `@supports (animation-timeline: view())` so a browser without scroll-driven animation gets
   *     no animation at all, rather than every section animating at once on load.
   *   - `prefers-reduced-motion: no-preference` so the whole thing is absent rather than damped.
   *   - The BASE style is the finished one and the keyframe holds the start, so any failure mode
   *     is the page as it was, and the fade starts at 0.4 so even a wedged animation leaves
   *     legible type rather than a blank section.
   */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .stack,
      .row,
      .cards,
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

  @media (width < 1000px) {
    .knows {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 900px) {
    .row,
    .row-even,
    .row-flip,
    .split,
    .limit-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }

    /* On one column the copy always comes first: a picture above the sentence that explains it is
       a picture nobody has been told to look at yet. */
    .row-flip .copy {
      order: 0;
    }
  }

  @media (width < 760px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /**
   * THE PHONE, designed for rather than survived.
   *
   * The hero reads from the left edge like every other paragraph on a phone, the four facts become
   * one grouped card of four rows rather than four boxes stacked down a screen, and the two actions
   * are one column of full-width pills: two buttons of different widths stacked are two ragged
   * edges under a headline.
   */
  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }

    .hero-copy {
      align-items: stretch;
      text-align: start;
    }

    .hero-lead,
    .hero-body,
    .lead {
      font-size: var(--t-md);
    }

    .knows {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      margin-block-start: var(--sp-6);
      background: var(--s1);
      border: 1px solid var(--line);
      border-radius: var(--r-lg);
      box-shadow: var(--e1);
    }

    .know {
      flex-direction: row;
      align-items: center;
      padding-block: var(--sp-3);
      padding-inline: var(--sp-4);
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .know + .know {
      border-block-start: 1px solid var(--line);
    }

    .hero-body {
      margin-block-start: var(--sp-6);
    }

    .actions {
      flex-direction: column;
      align-items: stretch;
    }

    .card {
      padding: var(--sp-5);
    }

    .close {
      padding-inline: var(--sp-4);
    }

    .close .actions {
      align-self: stretch;
    }
  }
</style>
