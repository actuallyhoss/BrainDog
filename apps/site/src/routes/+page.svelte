<!--
  The landing page.

  THE THIRD PASS, AND WHY. The owner's verdict on the second was "boring", and the question was
  "what are all these boring screenshots?". A screenshot of a record is a photograph of a database:
  it shows values at rest, it is four pixels tall on a phone, and the thing BrainDog is about is
  the part no still picture holds, which is the record moving while you are away and asking you
  about what matters. So the page is now drawings of the product doing that, built from the same
  tokens as the app and from words read off the demo record:

    - THE HERO is the demo's home screen filling up (`Moment.svelte`).
    - THE BENTO is seven features in miniature, each with one line under it (`bento/`).
    - HOW IT WORKS is the one chain in the demo that runs from an email to rows (`Steps.svelte`).
    - SAID OUT LOUD is what a reader can hold the product to, beside what is not built yet.
    - AND IT ENDS on one tinted card and one action.

  It gets more specific as it goes: a promise, then the product, then the mechanism, then the
  limits. Every loop stops under `prefers-reduced-motion` and shows its finished state.
-->
<script lang="ts">
  import Fields from '$lib/Fields.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import Moment from '$lib/Moment.svelte';
  import Note from '$lib/Note.svelte';
  import Steps from '$lib/Steps.svelte';
  import Tag from '$lib/Tag.svelte';
  import Ask from '$lib/bento/Ask.svelte';
  import Export from '$lib/bento/Export.svelte';
  import History from '$lib/bento/History.svelte';
  import Inbox from '$lib/bento/Inbox.svelte';
  import Money from '$lib/bento/Money.svelte';
  import Vault from '$lib/bento/Vault.svelte';
  import type { Hue, IconName } from '$lib/icons.ts';
  import { APP, site } from '$lib/copy.ts';

  const b = site.bento;
  const t = site.trust;

  /* One glyph and one hue per thing you can count on, in the order `copy.ts` lists them. */
  const KEEP: { icon: IconName; hue: Hue }[] = [
    { icon: 'code', hue: 'accent' },
    { icon: 'home', hue: 'info' },
    { icon: 'download', hue: 'earn' },
    { icon: 'history', hue: 'warn' },
  ];
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
</svelte:head>

<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-copy">
      <a class="badge" href="/changelog">
        <span class="badge-tag">{site.hero.badge.tag}</span>
        <span class="badge-text">{site.hero.badge.text}</span>
        <Icon name="arrow" size="s" />
      </a>
      <h1 class="hero-title">{site.hero.title}</h1>
      <p class="hero-sub">{site.hero.sub}</p>
      <div class="actions">
        <!-- THE PAGE'S ONE FILLED PRIMARY in its first screen. It opens the demo, and the note
             under it says what the demo is. -->
        <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" /></a>
        <a class="btn btn-lg" href="#how">{site.hero.secondary}</a>
      </div>
      <p class="hero-note">{site.hero.note}</p>
    </div>

    <div class="hero-moment">
      <Moment />
    </div>
  </div>
</section>

<section class="band" aria-labelledby="inside-title">
  <div class="wrap">
    <div class="sec-head">
      <Tag icon="grid" hue="info" label={b.kicker} />
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
      <Tag icon="code" hue="accent" label={site.steps.kicker} />
      <h2 class="title" id="how-title">{site.steps.title}</h2>
      <p class="lead">{site.steps.body}</p>
    </div>
    <div class="steps-at"><Steps /></div>
    <!-- THE LIMIT, under the steps and not in a footnote: the tools are written and the transport
         that carries them is not. -->
    <div class="note-at"><Note text={site.steps.note} /></div>
  </div>
</section>

<section class="band" aria-labelledby="trust-title">
  <div class="wrap">
    <div class="sec-head">
      <Tag icon="check" hue="earn" label={t.kicker} />
      <h2 class="title" id="trust-title">{t.title}</h2>
    </div>

    <div class="trust">
      <ul class="keep">
        {#each t.keep as item, i}
          <li class="keep-card">
            <span class="glyph" data-hue={KEEP[i]?.hue ?? 'accent'}><Icon name={KEEP[i]?.icon ?? 'check'} /></span>
            <h3 class="keep-title">{item.title}</h3>
            <p class="keep-body">{item.body}</p>
          </li>
        {/each}
      </ul>

      <div class="notyet">
        <h3 class="notyet-title"><span class="glyph" data-hue="warn"><Icon name="clock" /></span>{t.notYetTitle}</h3>
        <ul class="notyet-list">
          {#each t.notYet as line}<li>{line}</li>{/each}
        </ul>
      </div>
    </div>

    <h3 class="limits-title">{site.limits.title}</h3>
    <!-- NUMBERED, AND THE HEADING ALREADY SAID THREE. The numeral is the count the sentence makes. -->
    <ol class="limit-grid">
      {#each site.limits.items as item, i}
        <li class="limit">
          <span class="limit-n num" aria-hidden="true">{i + 1}</span>
          <h4 class="limit-title">{item.title}</h4>
          <p class="limit-body">{item.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<section class="band band-close">
  <div class="wrap">
    <!-- THE ONE TINTED GROUND ON THE PAGE, under the last action. -->
    <div class="close">
      <Mark height={36} />
      <h2 class="close-title">{site.tagline}</h2>
      <p class="close-body">{site.closing.body}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" /></a>
        <a class="btn btn-lg" href="/pricing">{site.closing.secondary}</a>
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
    position: relative;
    isolation: isolate;
    padding-block: clamp(32px, 5vw, 80px) clamp(64px, 8vw, 112px);
  }

  /* A faint grid under the hero, fading out from the top: the page's one texture, drawn in the
     hairline colour so it is a surface and never a pattern anybody reads. */
  .hero::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0;
    background-image:
      linear-gradient(color-mix(in srgb, var(--line) 55%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--line) 55%, transparent) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, var(--ink), transparent);
    pointer-events: none;
  }

  .hero-in {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: clamp(40px, 5vw, 64px);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    max-inline-size: 100%;
    min-block-size: 32px;
    padding-block: 4px;
    padding-inline: 4px 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
    transition: border-color var(--d-state) var(--ease-out);
  }

  .badge:hover {
    border-color: var(--edge);
    color: var(--ink);
  }

  .badge-tag {
    flex: none;
    padding-block: 2px;
    padding-inline: 8px;
    background: var(--accent-wash);
    border-radius: var(--r-pill);
    color: var(--accent-text);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .badge-text {
    min-inline-size: 0;
  }

  /* `clamp` and not a media query, because the headline's job is to fit. */
  .hero-title {
    margin-block-start: var(--sp-5);
    max-inline-size: 11ch;
    font-size: clamp(44px, 3.6vw + 26px, 80px);
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .hero-sub {
    margin-block-start: var(--sp-5);
    max-inline-size: 36ch;
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-block-start: var(--sp-6);
  }

  .hero-note {
    max-inline-size: 48ch;
    margin-block-start: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .hero-moment {
    min-inline-size: 0;
  }

  /* ── Sections ─────────────────────────────────────────────────────── */

  .band {
    padding-block: clamp(64px, 8vw, 120px);
    border-block-start: 1px solid var(--line);
  }

  .sec-head {
    max-inline-size: 760px;
    margin-block-end: clamp(32px, 4vw, 56px);
  }

  .title {
    margin-block-start: var(--sp-4);
    font-size: clamp(30px, 2.2vw + 18px, 48px);
    line-height: 1.08;
    letter-spacing: -0.032em;
    text-wrap: balance;
  }

  .lead {
    max-inline-size: 52ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .note-at {
    margin-block-start: var(--sp-6);
  }

  /* ── The bento ────────────────────────────────────────────────────── */

  .bento {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-4);
  }

  .t-wide {
    grid-column: span 2;
  }

  .tile {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    overflow: hidden;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: calc(var(--r-lg) + 4px);
    box-shadow: var(--e1);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .tile:hover {
    border-color: var(--edge);
  }

  /* The drawing sits on the sunk ground with a little of the accent lit from above, so each tile
     reads as a window onto the product and the words under it read as the caption. */
  .stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 260px;
    padding: var(--sp-5);
    background:
      radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%),
      var(--sunk);
    border-block-end: 1px solid var(--line);
  }

  .stage > :global(*) {
    inline-size: 100%;
    max-inline-size: 400px;
  }

  .t-wide .stage > :global(*) {
    max-inline-size: 640px;
  }

  .tile-copy {
    padding-block: var(--sp-4) var(--sp-5);
    padding-inline: var(--sp-5);
  }

  .tile-title {
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .tile-caption {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* ── Said out loud ────────────────────────────────────────────────── */

  .trust {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    align-items: stretch;
    gap: var(--sp-4);
  }

  .keep {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .keep-card {
    padding: var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .keep-title {
    margin-block-start: var(--sp-4);
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .keep-body {
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* Not built yet is a different kind of fact from the four beside it, and it looks different: a
     dashed edge on the sunk ground, the way the app draws something that is not there yet. */
  .notyet {
    padding: var(--sp-5);
    background: var(--sunk);
    border: 1px dashed var(--edge);
    border-radius: var(--r-lg);
  }

  .notyet-title {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .notyet-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
    padding: 0;
    list-style: none;
  }

  .notyet-list li {
    display: flex;
    gap: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .notyet-list li::before {
    content: '';
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    margin-block-start: 0.6em;
    background: var(--warn);
    border-radius: var(--r-pill);
  }

  .limits-title {
    margin-block-start: var(--sp-8);
    font-size: var(--t-xl);
    letter-spacing: -0.02em;
  }

  .limit-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-4);
    margin-block-start: var(--sp-5);
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
    color: var(--accent-text);
    font-size: var(--t-sm);
    font-weight: 700;
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

  /* ── The close ────────────────────────────────────────────────────── */

  .band-close {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .close {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    overflow: hidden;
    padding-block: clamp(48px, 7vw, 96px);
    padding-inline: var(--sp-5);
    background: var(--accent-ground);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
    border-radius: calc(var(--r-lg) + 6px);
    text-align: center;
  }

  .close::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-block: -40% 40%;
    inset-inline: 10%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 22%, transparent), transparent);
  }

  .close-title {
    max-inline-size: 14ch;
    font-size: clamp(32px, 3vw + 18px, 56px);
    line-height: 1.05;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .close-body {
    max-inline-size: 40ch;
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: balance;
  }

  .close .actions {
    justify-content: center;
    margin-block-start: var(--sp-2);
  }

  /**
   * ARRIVAL, AND IT CANNOT FAIL OPEN. Only where the browser has scroll-driven animation and the
   * reader has not asked for less motion; the resting style is the finished one, and the fade
   * starts at 0.4 so even a wedged animation leaves legible type.
   */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .tile,
      .steps-at,
      .keep-card,
      .notyet,
      .limit,
      .close {
        animation: arrive linear both;
        animation-timeline: view();
        animation-range: entry 5% cover 22%;
      }
    }
  }

  @keyframes arrive {
    from {
      opacity: 0.4;
      transform: translateY(18px);
    }
  }

  /* Somebody pointing at a drawing is reading it. */
  @media (prefers-reduced-motion: no-preference) {
    .tile:hover :global(*) {
      animation-play-state: paused;
    }
  }

  @media (width >= 1080px) {
    .hero-in {
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
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
    .trust {
      grid-template-columns: minmax(0, 1fr);
    }

    .limit-grid {
      grid-template-columns: minmax(0, 1fr);
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
  }

  /**
   * THE PHONE, designed for rather than survived. The headline reads from the left edge like every
   * other paragraph here, the two actions are one column of full-width pills, the hero's moment
   * sits under the words at the width of the screen, and each tile keeps its drawing and its motion.
   */
  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }

    .hero-sub,
    .lead,
    .close-body {
      font-size: var(--t-md);
    }

    .actions {
      flex-direction: column;
      align-self: stretch;
    }

    .keep {
      grid-template-columns: minmax(0, 1fr);
    }

    .stage {
      min-block-size: 0;
      padding: var(--sp-4);
    }

    .tile-copy {
      padding: var(--sp-4);
    }

    .keep-card,
    .notyet,
    .limit {
      padding: var(--sp-4);
    }

    .close {
      padding-inline: var(--sp-4);
    }

    .close .actions {
      align-self: stretch;
    }
  }

  @media (pointer: coarse) {
    .badge {
      min-block-size: var(--tap);
    }
  }
</style>
