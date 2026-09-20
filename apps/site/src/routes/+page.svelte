<script lang="ts">
  /**
   * brain.dog's home page, drawn as the thing it sells.
   *
   * THE PAGE IS THE RECORD. One hairline runs down the left of every band, and each band is
   * numbered `0001`, `0002`, `0003` in the identifier face, ascending and never repeating. The
   * sections are events in an append-only log. That is the whole device, it costs one border and
   * one number per band, and it is the product's own thesis: nothing here is overwritten.
   *
   * WHAT THIS REPLACED, and why. The page before it was 1,804 words and ten pictures of the
   * product, seven of them screenshots painted at about 75 per cent, so the app's own 14px text
   * landed at 11px and every one of them read as the same grey table. A reader was shown the
   * product ten times and could read it none of them. It also carried eight bands of identical
   * shape, forty headings and ten calls to action, three of them in the first screen, against
   * `app.css`'s own rule that exactly one per view is filled.
   *
   * THE RULES THIS PAGE HOLDS ITSELF TO NOW. Both numbers below were wrong in the first draft of
   * this comment and an audit measured them, which is the argument for counting rather than
   * estimating: a rule stated in a file and broken in the same file is worth less than no rule.
   *   - Under 400 words. Measured on the built `<main>`: 373 counting the band numbers and the
   *     rail's contents, 320 without them. The page before it was 1,804.
   *   - Two product images, each painted at 1:1 inside a window that scrolls. An image is never
   *     scaled below full size: at full size a reader can read it, and shrunk they cannot, so the
   *     frame gives way rather than the pixels.
   *   - One thing moves, the ledger, and it stops when it has said what it had to say.
   *   - Two display sizes and four from the scale. The two are `clamp()` expressions, one for the
   *     hero and one for the close, because `tokens.css` has no step above `--t-xl` and a display
   *     face that does not answer the viewport is a headline that wraps to four lines on a phone.
   *     Everything else is `--t-xl`, `--t-md`, `--t-base`, `--t-sm` and `--t-xs`.
   *   - Colour is spent twice: the filled primary, and `--accent-ground` under the closing band.
   */
  import Arrange from '$lib/Arrange.svelte';
  import Icon from '$lib/Icon.svelte';
  import Ledger from '$lib/Ledger.svelte';
  import { APP, site } from '$lib/copy.ts';
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

<div class="wrap">
  <div class="log">
    <section class="band" aria-labelledby="hero-title">
      <p class="seq" aria-hidden="true">0001</p>
      <div class="band-body hero">
        <div class="hero-copy">
          <h1 class="display" id="hero-title">{site.hero.title}</h1>
          <p class="sub">{site.hero.sub}</p>
          <div class="actions">
            <!-- THE PAGE'S ONE FILLED PRIMARY, and the only one above the close. -->
            <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" size="s" /></a>
          </div>
          <p class="note">{site.hero.note}</p>
        </div>

        <!-- THE CLAIM, BEING DEMONSTRATED FOUR FEET TO ITS RIGHT. "The log only grows" is a claim
             about behaviour over time, and no still picture can carry one. A list that only ever
             grows, watched for four seconds, can. -->
        <Ledger
          events={site.ledger.events}
          head={site.ledger.head}
          only={site.ledger.only}
          all={site.ledger.all}
        />
      </div>
    </section>

    <section class="band" aria-labelledby="arrange-title">
      <p class="seq" aria-hidden="true">0002</p>
      <div class="band-body">
        <h2 class="title" id="arrange-title">{site.arrange.title}</h2>
        <p class="lead">{site.arrange.lead}</p>
        <!-- FIVE SCREENSHOTS OF FIVE NEAR-IDENTICAL APPS WERE THE WORST PASSAGE ON THE OLD PAGE.
             One control that rearranges in front of a reader makes the point in one gesture, and
             the point is that the product rearranges itself: the device and the claim are the
             same thing. -->
        <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} />
      </div>
    </section>

    <section class="band" aria-labelledby="typed-title">
      <p class="seq" aria-hidden="true">0003</p>
      <div class="band-body">
        <h2 class="title" id="typed-title">{site.typed.title}</h2>
        <p class="lead">{site.typed.lead}</p>
        <figure class="shot">
          <!-- 1:1 AND NOT A PIXEL SMALLER. The capture is a 1440pt screen at 2x, so painting it
               1440 wide puts the app's 14px text on the page at 14px. The window scrolls; the
               image does not shrink. -->
          <!-- NAMED FOR WHAT THE REGION IS, not for what the picture shows. The `<figure>` already
               takes its accessible name from the caption below, so repeating the caption here made
               a screen reader say the same eight words twice before reaching the alt text. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region is a keyboard focus stop under WCAG 2.1.1, and this one is named) -->
          <div class="window" tabindex="0" role="group" aria-label={site.typed.region}>
            <picture>
              <source media="(prefers-color-scheme: dark)" srcset="/shots/home-dark.webp" width="2880" height="1800" />
              <!-- LAZY, AND IT IS THE THIRD BAND DOWN. It is 263 KB and well below the fold, so
                   eager it competed with the hero for bandwidth on the first paint. -->
              <img
                src="/shots/home-light.webp"
                width="2880"
                height="1800"
                alt={site.typed.alt}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <figcaption class="caption">{site.typed.caption}</figcaption>
        </figure>
      </div>
    </section>

    <section class="band" aria-labelledby="agents-title">
      <p class="seq" aria-hidden="true">0004</p>
      <div class="band-body">
        <h2 class="title" id="agents-title">{site.agents.title}</h2>
        <p class="lead">{site.agents.lead}</p>
        <!-- A DRAWN DIAGRAM STOOD HERE AND SAID NOTHING: three nodes on one line, no labels, the
             line at `--line` so it was invisible at 1px anyway. A reader saw three dots. The three
             chips below already carry every word it was trying to carry, so the dots went. -->
        <ul class="chips">
          {#each site.agents.chips as chip (chip)}<li class="chip">{chip}</li>{/each}
        </ul>
        <p class="note">{site.agents.note}</p>
      </div>
    </section>

    <section class="band" aria-labelledby="report-title">
      <p class="seq" aria-hidden="true">0005</p>
      <div class="band-body">
        <h2 class="title" id="report-title">{site.report.title}</h2>
        <p class="lead">{site.report.lead}</p>
        <figure class="shot">
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region is a keyboard focus stop under WCAG 2.1.1, and this one is named) -->
          <div class="window" tabindex="0" role="group" aria-label={site.report.region}>
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcset="/shots/usecase-founder-dashboard-dark.webp"
                width="2880"
                height="1800"
              />
              <img
                src="/shots/usecase-founder-dashboard-light.webp"
                width="2880"
                height="1800"
                alt={site.report.alt}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <figcaption class="caption">{site.report.caption}</figcaption>
        </figure>
      </div>
    </section>

    <section class="band" aria-labelledby="plain-title">
      <p class="seq" aria-hidden="true">0006</p>
      <div class="band-body">
        <h2 class="title" id="plain-title">{site.plain.title}</h2>
        <!-- NO CARD, NO TICK AND NO CROSS. The three columns read at one weight on purpose: the
             limits are not a footnote, they are the reason the rest is believable. -->
        <div class="cols">
          {#each site.plain.columns as column (column.head)}
            <div>
              <h3 class="col-head">{column.head}</h3>
              <ul class="lines">
                {#each column.lines as line (line)}<li>{line}</li>{/each}
              </ul>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </div>

  <section class="close" aria-labelledby="close-title">
    <h2 class="display close-title" id="close-title">{site.closing.title}</h2>
    <p class="close-body">{site.closing.body}</p>
    <div class="actions">
      <a class="btn btn-primary btn-lg" href={APP}>{site.closing.primary}<Icon name="arrow" size="s" /></a>
      <a class="quiet" href="/pricing">{site.closing.secondary}</a>
    </div>
  </section>
</div>

<style>
  .wrap {
    max-inline-size: var(--site-max);
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  /* ── The device ───────────────────────────────────────────────────── */

  /* ONE HAIRLINE FOR THE WHOLE PAGE, not one per band. Bands are separated by space, which is
     what `tokens.css` asks for: "a rule is what you reach for when there is no space to spend."
     The only rule on this page is the log's own line, and it means something. */
  .log {
    border-inline-start: 1px solid var(--line);
  }

  .band {
    display: grid;
    grid-template-columns: minmax(0, 96px) minmax(0, 1fr);
    padding-block: var(--sp-9);
  }

  .band:first-child {
    padding-block-start: var(--sp-7);
  }

  .seq {
    margin: 0;
    padding-inline-start: var(--sp-4);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: var(--lh-body);
  }

  .band-body {
    min-inline-size: 0;
  }

  /* ── Type ─────────────────────────────────────────────────────────── */

  /* THE DISPLAY FACE IS SPENT TWICE on the whole page, here and at the close. `--lh-3xl` and
     `--tr-tight` exist in `tokens.css` and had no caller until this page: a display step without
     leading and tracking is why nothing had used them. */
  .display {
    margin: 0;
    max-inline-size: 14ch;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.75rem, 6vw, 6rem);
    font-weight: 600;
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
  }

  .title {
    margin: 0;
    max-inline-size: 22ch;
    font-size: var(--t-xl);
    line-height: var(--lh-tight);
    letter-spacing: var(--tr-tight);
  }

  .sub,
  .lead {
    max-inline-size: 46ch;
    margin-block: var(--sp-5) 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .note {
    margin-block: var(--sp-4) 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .caption {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
    margin-block-start: var(--sp-6);
  }

  /* A THUMB HAS TO HIT IT. Drawn quietly beside the primary action, but 21px of text is not a
     target on a coarse pointer, so `--tap` gives it the height the rest of this repository keeps.
     `inline-flex` rather than padding, so the extra height does not push the row apart. */
  .quiet {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ── The hero ─────────────────────────────────────────────────────── */

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: start;
  }

  .hero-copy {
    min-inline-size: 0;
  }

  /* ── The two windows ──────────────────────────────────────────────── */

  .shot {
    /* The one place the window's height is written, so the fade over its right edge and the
       narrow override cannot drift apart from the box they are measured against. */
    --window-h: 420px;

    position: relative;
    margin: var(--sp-6) 0 0;
  }

  /* `overscroll-behavior` IS THE DIFFERENCE BETWEEN A WINDOW AND A TRAP. These boxes are 420px
     tall over an image 900px tall, so a reader scrolling the page with the pointer over one is
     held there for roughly 480px of image before the page moves again, twice on the way down.
     `contain` keeps the wheel inside the box only while the box has somewhere to go, and hands
     the rest to the page. `Ledger.svelte` already had this; these two did not. */
  .window {
    overflow: auto;
    overscroll-behavior: contain;
    block-size: var(--window-h);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* THERE IS MORE OF THE PICTURE THAN THE FRAME, and a hard cut at the right edge reads as a
     screenshot somebody trimmed badly rather than as a window onto a wider thing. The image is
     1440px and the band is about 1,024 at the design width, so roughly a third of every shot is
     past the edge; a reader who cannot tell it is there will never look for it, and the whole
     argument for painting these at full size collapses.

     A fade and not a sentence, because `ui-copy` says a control gets a label and never an
     explanation, and this is not even a control. It sits on the figure rather than inside the
     scroller so it does not travel with the content, and it takes no pointer events so it cannot
     eat a drag. It stays visible at the far right of the scroll, which is a small lie and cheaper
     than the scroll-driven animation that would tell the truth. */
  .shot::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 1px;
    block-size: var(--window-h);
    inline-size: var(--sp-8);
    background: linear-gradient(to left, var(--bg), transparent);
    border-start-end-radius: var(--r-lg);
    border-end-end-radius: var(--r-lg);
    pointer-events: none;
  }

  .window img {
    display: block;
    inline-size: 1440px;
    max-inline-size: none;
    block-size: auto;
  }

  /* ── The agents chips ─────────────────────────────────────────────── */

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block: var(--sp-5) 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    padding: var(--sp-1) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* ── Plain about what it is ───────────────────────────────────────── */

  .cols {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-7);
    margin-block-start: var(--sp-6);
  }

  .col-head {
    margin: 0 0 var(--sp-4);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    text-transform: uppercase;
  }

  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lines li {
    padding-block: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .lines li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* ── The close ────────────────────────────────────────────────────── */

  /* THE ONE PLACE COLOUR IS SPENT AS A SURFACE. `tokens.css` says what `--accent-ground` is for:
     brain.dog's closing band and the recommended plan card, and nothing else. */
  .close {
    margin-block: var(--sp-8) var(--sp-9);
    padding: var(--sp-8) var(--sp-7);
    background: var(--accent-ground);
    border-radius: var(--r-lg);
  }

  .close-title {
    max-inline-size: 18ch;
    font-size: clamp(1.75rem, 3.5vw, 3rem);
  }

  .close-body {
    max-inline-size: 46ch;
    margin-block: var(--sp-4) 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
  }

  @media (width < 900px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-7);
    }

    .cols {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }
  }

  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }

    /* THE SEQUENCE NUMBER SITS ABOVE ITS BAND ON A PHONE rather than beside it, because 96px of a
       390px screen is a quarter of the page spent on four characters. The line stays. */
    .band {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-2);
      padding-block: var(--sp-8);
    }

    .seq {
      padding-inline-start: var(--sp-3);
    }

    .band-body {
      padding-inline-start: var(--sp-3);
    }

    .shot {
      --window-h: 300px;
    }

    .close {
      padding: var(--sp-6) var(--sp-5);
    }
  }
</style>
