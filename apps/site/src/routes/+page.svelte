<!--
  The landing page.

  THE FOURTH PASS, AND WHY. The app was redesigned into a quiet, monochrome ledger, and a landing
  page drawn in the old lavender, with a glow behind every picture and a tinted glyph above every
  heading, was selling a product that no longer looked like that. The best product pages (Linear,
  Mercury, Vercel, Attio) share a short list of habits, and this page takes them:

    - ONE PROMISE, then the product itself. The headline is the slogan and the first picture is the
      demo's real home screen, photographed by `scripts/product.mjs`, not a drawing of it.
    - COLOUR IS STATE. Ink for words and actions; a colour appears only where the product would
      show one (overdue, refused).
    - HIERARCHY FROM TYPE, not boxes. No kicker over a heading, no card around a paragraph.
    - HONEST COPY. What it keeps, how agents work with it, and then what is not built and what it
      will not do, set as a plain ledger rather than a feature grid.

  THE FIFTH PASS, AND WHY (September 17th). The page read as a product for small businesses, and
  BrainDog is for every kind of person (`loop/DIRECTION.md` §11). The slogan stays until the owner
  picks another, and everything under it speaks to all of them: who it is for, with a photograph of
  each use case from a fresh record; the facade and the modules under it; the founder story of
  numbers arriving; the same parts for everyone; agents over MCP; then the limits.

  It gets more specific as it goes: a promise, the people, the idea, the mechanism, the limits.
-->
<script lang="ts">
  import Fields from '$lib/Fields.svelte';
  import Icon from '$lib/Icon.svelte';
  import Note from '$lib/Note.svelte';
  import Steps from '$lib/Steps.svelte';
  import Ask from '$lib/bento/Ask.svelte';
  import Export from '$lib/bento/Export.svelte';
  import History from '$lib/bento/History.svelte';
  import Inbox from '$lib/bento/Inbox.svelte';
  import Money from '$lib/bento/Money.svelte';
  import Vault from '$lib/bento/Vault.svelte';
  import { APP, site } from '$lib/copy.ts';

  const b = site.bento;
  const w = site.who;
  const f = site.founder;
  const t = site.trust;
</script>

<svelte:head>
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <!-- THE CANONICAL AND THE PREVIEW, from the same two sentences the page already has. The
       canonical matters because `www` 301s here and a preview fetcher that followed the redirect
       would otherwise cite the hostname it started from. -->
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
  <!-- The hero picture is the largest paint on the page, so the browser hears about it first. -->
  <link rel="preload" as="image" href="/shots/home-light.webp" media="(min-width: 640px) and (prefers-color-scheme: light)" />
  <link rel="preload" as="image" href="/shots/home-dark.webp" media="(min-width: 640px) and (prefers-color-scheme: dark)" />
</svelte:head>

<section class="hero">
  <div class="wrap">
    <div class="hero-copy">
      <h1 class="hero-title">{site.hero.title}</h1>
      <p class="hero-sub">{site.hero.sub}</p>
      <div class="actions">
        <!-- THE PAGE'S ONE FILLED PRIMARY. It opens the demo, and the note under it says what the
             demo is. -->
        <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" size="s" /></a>
        <a class="btn btn-lg" href="#who">{site.hero.secondary}</a>
      </div>
      <p class="hero-note">{site.hero.note}</p>
    </div>

    <!-- THE PRODUCT, AS IT IS. A phone gets the phone's own capture, because the wide one shrinks
         to unreadable in a 358px box, and each scheme gets its own. `width` and `height` on every
         source reserve the box, so nothing below it moves when it arrives. -->
    <div class="shot">
      <picture>
        <source
          media="(max-width: 639px) and (prefers-color-scheme: dark)"
          srcset="/shots/home-phone-dark.webp"
          width="1170"
          height="2532"
        />
        <source media="(max-width: 639px)" srcset="/shots/home-phone-light.webp" width="1170" height="2532" />
        <source media="(prefers-color-scheme: dark)" srcset="/shots/home-dark.webp" width="2880" height="1800" />
        <img
          src="/shots/home-light.webp"
          width="2880"
          height="1800"
          alt={site.hero.shotAlt}
          fetchpriority="high"
          decoding="async"
        />
      </picture>
    </div>
  </div>
</section>

<section class="band" id="who" aria-labelledby="who-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="who-title">{w.title}</h2>
      <p class="lead">{w.body}</p>
      <!-- ALL FIVE NAMED AT ONCE, before the long run of pictures, so a reader finds themselves
           without scrolling past four other people first. -->
      <nav class="jump" aria-label={w.jump}>
        {#each w.cases as c (c.id)}<a class="btn" href="#uc-{c.id}">{c.title}</a>{/each}
      </nav>
    </div>

    <!-- FIVE USE CASES, each a row: what it is for and what it opens on, beside its own first page.
         The picture is cropped to the rail and the main column, at a scale where the words in it
         can be read, and a phone gets the phone's own capture. A use case with no picture yet is
         text only and carries `data-reshoot`, so the next run of `scripts/usecases.mjs` finds it. -->
    <div class="cases">
      {#each w.cases as c (c.id)}
        <article class="case" id="uc-{c.id}" class:case-text={!c.shot} data-reshoot={c.shot ? undefined : c.id} aria-labelledby="case-{c.id}">
          <div class="case-copy">
            <h3 class="case-title" id="case-{c.id}">{c.title}</h3>
            <p class="case-body">{c.body}</p>
            <p class="case-holds">{c.holds}</p>
            {#if !c.shot}<div class="case-note"><Note text={w.pending} /></div>{/if}
          </div>
          {#if c.shot}
            <div class="case-shot">
              <picture>
                <source media="(max-width: 639px) and (prefers-color-scheme: dark)" srcset="/shots/usecase-{c.shot}-phone-dark.webp" width="1170" height="2532" />
                <source media="(max-width: 639px)" srcset="/shots/usecase-{c.shot}-phone-light.webp" width="1170" height="2532" />
                <source media="(prefers-color-scheme: dark)" srcset="/shots/usecase-{c.shot}-dark.webp" width="2880" height="1800" />
                <img src="/shots/usecase-{c.shot}-light.webp" width="2880" height="1800" alt={c.alt} loading="lazy" decoding="async" />
              </picture>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="band" aria-labelledby="facade-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="facade-title">{site.facade.title}</h2>
      <p class="lead">{site.facade.body}</p>
    </div>
    <ul class="items">
      {#each site.facade.items as item}
        <li class="item">
          <h3 class="item-title">{item.title}</h3>
          <p class="item-body">{item.body}</p>
        </li>
      {/each}
    </ul>
  </div>
</section>

<section class="band" aria-labelledby="founder-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="founder-title">{f.title}</h2>
      <p class="lead">{f.body}</p>
    </div>
    <ol class="items items-3 flow">
      {#each f.steps as step, i}
        <li class="item">
          <span class="flow-n num" aria-hidden="true">{i + 1}</span>
          <h3 class="item-title">{step.title}</h3>
          <p class="item-body">{step.body}</p>
        </li>
      {/each}
    </ol>
    <div class="shot">
      <picture>
        <source media="(max-width: 639px) and (prefers-color-scheme: dark)" srcset="/shots/usecase-founder-dashboard-phone-dark.webp" width="1170" height="2532" />
        <source media="(max-width: 639px)" srcset="/shots/usecase-founder-dashboard-phone-light.webp" width="1170" height="2532" />
        <source media="(prefers-color-scheme: dark)" srcset="/shots/usecase-founder-dashboard-dark.webp" width="2880" height="1800" />
        <img src="/shots/usecase-founder-dashboard-light.webp" width="2880" height="1800" alt={f.alt} loading="lazy" decoding="async" />
      </picture>
    </div>
    <div class="note-at"><Note text={f.note} /></div>
  </div>
</section>

<section class="band" aria-labelledby="inside-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="inside-title">{b.title}</h2>
      <p class="lead">{b.body}</p>
    </div>

    <!-- SEVEN TILES, each a feature doing its one thing, with its one line under it. The drawings
         are `aria-hidden` and the line is the content, except the typed row, which is a real
         definition list because what it says is the sentence under it. -->
    <div class="bento">
      <article class="tile t-wide">
        <div class="stage"><Money /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.money.title}</h3>
          <p class="tile-caption">{b.money.caption}</p>
        </div>
      </article>

      <article class="tile">
        <div class="stage"><Ask /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.ask.title}</h3>
          <p class="tile-caption">{b.ask.caption}</p>
        </div>
      </article>

      <article class="tile">
        <div class="stage"><Inbox /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.inbox.title}</h3>
          <p class="tile-caption">{b.inbox.caption}</p>
        </div>
      </article>

      <article class="tile t-wide">
        <div class="stage">
          <Fields register={b.typed.figure.register} row={b.typed.figure.row} fields={b.typed.figure.fields} />
        </div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.typed.title}</h3>
          <!-- THE TEACHING SENTENCE, in one text node: `test/content.test.ts` reads it back out of
               the served bytes and checks the registers it names against the seed. -->
          <p class="tile-caption">{b.typed.caption}</p>
        </div>
      </article>

      <article class="tile">
        <div class="stage"><Vault /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.vault.title}</h3>
          <p class="tile-caption">{b.vault.caption}</p>
        </div>
      </article>

      <article class="tile">
        <div class="stage"><History /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.history.title}</h3>
          <p class="tile-caption">{b.history.caption}</p>
        </div>
      </article>

      <article class="tile t-last">
        <div class="stage"><Export /></div>
        <div class="tile-copy">
          <h3 class="tile-title">{b.export.title}</h3>
          <p class="tile-caption">{b.export.caption}</p>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="band" id="how" aria-labelledby="how-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="how-title">{site.steps.title}</h2>
      <p class="lead">{site.steps.body}</p>
    </div>
    <Steps />
    <!-- THE LIMIT, under the steps and not in a footnote: the tools are written and the transport
         that carries them is not. -->
    <ul class="items items-3 ways">
      {#each site.steps.ways as way}
        <li class="item">
          <h3 class="item-title">{way.title}</h3>
          <p class="item-body">{way.body}</p>
        </li>
      {/each}
    </ul>
    <div class="note-at"><Note text={site.steps.note} /></div>
  </div>
</section>

<section class="band" aria-labelledby="trust-title">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="title" id="trust-title">{t.title}</h2>
    </div>

    <!-- A LEDGER, NOT A GRID OF CARDS. Three groups, each a label on the left and its lines on the
         right, divided by a hairline, so the limits read with the same weight as the promises. -->
    <div class="ledger">
      <section class="group" aria-labelledby="keep-title">
        <h3 class="group-title" id="keep-title">{t.keepTitle}</h3>
        <ul class="items">
          {#each t.keep as item}
            <li class="item">
              <h4 class="item-title">{item.title}</h4>
              <p class="item-body">{item.body}</p>
            </li>
          {/each}
        </ul>
      </section>

      <section class="group" aria-labelledby="notyet-title">
        <h3 class="group-title" id="notyet-title">{t.notYetTitle}</h3>
        <ul class="lines">
          {#each t.notYet as line}<li>{line}</li>{/each}
        </ul>
      </section>

      <section class="group" aria-labelledby="limits-title">
        <h3 class="group-title" id="limits-title">{site.limits.title}</h3>
        <ul class="items">
          {#each site.limits.items as item}
            <li class="item">
              <h4 class="item-title">{item.title}</h4>
              <p class="item-body">{item.body}</p>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
</section>

<section class="band close">
  <div class="wrap close-in">
    <div>
      <h2 class="close-title">{site.tagline}</h2>
      <p class="close-body">{site.closing.body}</p>
    </div>
    <div class="actions">
      <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" size="s" /></a>
      <a class="btn btn-lg" href="/pricing">{site.closing.secondary}</a>
    </div>
  </div>
</section>

<style>
  .wrap {
    max-inline-size: var(--site-max);
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  /* ── The hero ─────────────────────────────────────────────────────── */

  .hero {
    padding-block: clamp(56px, 7vw, 104px) clamp(56px, 7vw, 96px);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-inline-size: 760px;
  }

  /* `clamp` and not a media query, because the headline's job is to fit. */
  .hero-title {
    max-inline-size: 14ch;
    font-size: clamp(40px, 3.4vw + 20px, 68px);
    font-weight: 600;
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .hero-sub {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-5);
    color: var(--ink2);
    font-size: clamp(17px, 0.4vw + 15px, 20px);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-6);
  }

  .hero-note {
    max-inline-size: 60ch;
    margin-block-start: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.55;
    text-wrap: pretty;
  }

  /* The screen sits on the page the way the app sits on the desk: a hairline and a radius, no glow
     and no tilt. */
  .shot {
    margin-block-start: clamp(48px, 6vw, 80px);
    overflow: hidden;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .shot img {
    display: block;
    inline-size: 100%;
    block-size: auto;
  }

  /* ── Sections ─────────────────────────────────────────────────────── */

  .band {
    padding-block: clamp(64px, 8vw, 112px);
    border-block-start: 1px solid var(--line);
  }

  .sec-head {
    max-inline-size: 720px;
    margin-block-end: clamp(32px, 4vw, 48px);
  }

  .title {
    font-size: clamp(28px, 1.2vw + 20px, 40px);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .lead {
    max-inline-size: 58ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .note-at {
    margin-block-start: var(--sp-7);
  }

  /* ── Who it's for ─────────────────────────────────────────────────── */

  .cases {
    display: flex;
    flex-direction: column;
  }

  /* One row per use case: the words on the left, the record on the right, a hairline between rows. */
  .case {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: var(--sp-7);
    align-items: start;
    padding-block: var(--sp-7);
    border-block-start: 1px solid var(--line);
  }

  .jump {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
  }

  /* Clear of the sticky bar when a jump link lands here. */
  .case {
    scroll-margin-block-start: 72px;
  }

  .case:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .case-text {
    grid-template-columns: minmax(0, 1fr);
  }

  .case-copy {
    max-inline-size: 44ch;
  }

  .case-title {
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .case-body {
    margin-block-start: var(--sp-2);
    font-size: var(--t-md);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .case-holds {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .case-note {
    margin-block-start: var(--sp-4);
  }

  /* THE CROP, and why it is a crop. The whole 1440px screen in a 780px box is text at half size;
     the rail and the main column, the left 70 per cent of it, are text a reader can read. The
     feed on the right is what is cut, and it is the same on every use case. */
  .case-shot {
    aspect-ratio: 16 / 11;
    overflow: hidden;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .case-shot img {
    display: block;
    inline-size: 142%;
    max-inline-size: none;
    block-size: auto;
  }

  /* ── The facade, the founder story and the agents' ways in ───────── */

  .items.items-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .items.ways {
    margin-block-start: var(--sp-7);
    padding-block-start: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .flow-n {
    display: block;
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── The bento ────────────────────────────────────────────────────── */

  .bento {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .t-wide {
    grid-column: span 2;
  }

  .tile {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    overflow: hidden;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 260px;
    padding: var(--sp-5);
    background: var(--sunk);
  }

  .stage > :global(*) {
    inline-size: 100%;
    max-inline-size: 400px;
  }

  .t-wide .stage > :global(*) {
    max-inline-size: 620px;
  }

  .tile-copy {
    padding-block: var(--sp-4) var(--sp-5);
    padding-inline: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .tile-title {
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  .tile-caption {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* ── The ledger ───────────────────────────────────────────────────── */

  .group {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
    gap: var(--sp-5);
    padding-block: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .group-title {
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  .items {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5) var(--sp-7);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item-title {
    font-size: var(--t-base);
    font-weight: 500;
    letter-spacing: 0;
  }

  .item-body {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lines li {
    max-inline-size: 72ch;
    padding-block: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .lines li:first-child {
    padding-block-start: 0;
  }

  .lines li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* ── The close ────────────────────────────────────────────────────── */

  .close-in {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-6);
  }

  .close-title {
    font-size: clamp(28px, 1.2vw + 20px, 40px);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .close-body {
    max-inline-size: 48ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .close .actions {
    margin-block-start: 0;
  }

  /* Somebody pointing at a drawing is reading it. */
  @media (prefers-reduced-motion: no-preference) {
    .tile:hover :global(*) {
      animation-play-state: paused;
    }
  }

  @media (width < 1080px) {
    .bento {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .t-last {
      grid-column: span 2;
    }
  }

  @media (width < 960px) {
    .case {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    .items.items-3 {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 860px) {
    .group {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
    }
  }

  @media (width < 700px) {
    .bento {
      grid-template-columns: minmax(0, 1fr);
    }

    .t-wide,
    .t-last {
      grid-column: auto;
    }

    .items {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /**
   * THE PHONE, designed for rather than survived. The two actions are one column of full-width
   * buttons, and the hero shows the top of the phone capture, cut where the first list begins,
   * because a screen three phones tall is a scroll trap in the middle of a page.
   */
  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }

    .actions {
      flex-direction: column;
      align-items: stretch;
      align-self: stretch;
    }

    .close .actions {
      inline-size: 100%;
    }

    .shot img {
      aspect-ratio: 390 / 560;
      object-fit: cover;
      object-position: top;
    }

    /* A phone shows the phone's own capture whole-width, cut where a thumb would start scrolling. */
    .case-shot {
      aspect-ratio: 390 / 520;
    }

    .case-shot img {
      inline-size: 100%;
    }

    .stage {
      min-block-size: 0;
      padding: var(--sp-4);
    }

    .tile-copy {
      padding: var(--sp-4);
    }
  }
</style>
