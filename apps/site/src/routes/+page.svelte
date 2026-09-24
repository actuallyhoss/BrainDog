<script lang="ts">
  /**
   * brain.dog's home page.
   *
   * WHAT THE OWNER SAID ON 22 SEPTEMBER, which is what this version of the page answers: *i hate
   * those screenshots. they look terrible. dont just add scnreehots like that. instead maybe push
   * that interactive multi-tab section to be overlapping with th ejumbotron, in a neat way, and make
   * the actual records interactble to show different pages, etc. i dont like the "0001" stuff
   * either. remove that.* And of the closing band: *make the what would you keep in it less red
   * please*.
   *
   * SO THERE IS NO PHOTOGRAPH ON THIS PAGE. The hero's picture of the work board and the founder's
   * dashboard under it are gone, and so are the files, the script passes that made them and the
   * test that measured their crop. What stands in their place is `lib/Arrange.svelte`: the app,
   * drawn in HTML and CSS from `copy.ts`, raised on the page and lying across the bottom edge of the
   * hero, with its cases, its lists, its rows, Decide and Automations all pressable.
   *
   * THE BANDS, AND WHAT EACH ONE IS LED BY:
   *
   *   hero      the promise, one action, and the drawn app starting inside the hero and running
   *             past its bottom edge.
   *   arranged  the rest of the app's window, then the sentence that says what it just showed.
   *   plain     the mechanism, all of it, in one band: agents, an agent's proposal decided by a
   *             person and landing under the agent's name, and the three honest columns.
   *   close     the question, with the accent in its last three words and nowhere else.
   *
   * THE DASHBOARD BAND IS GONE RATHER THAN REWORKED. It was a title, one sentence and a photograph,
   * and the photograph was the band: without it, it is two lines of text about report keys in the
   * middle of the page. The sentence is not lost. `/agents` carries the same idea in full, with the
   * limits a report key has, and the founder's case in the drawn app shows a reported figure in
   * its Datapoints list.
   *
   * THE BANDS ARE NOT NUMBERED. They opened with `0001`, `0002` and `0003` in the accent until 22
   * September; each now opens on its own word and a rule, or on its heading.
   *
   * WHAT DID NOT COME OUT, AND THIS IS THE RULE WITH TEETH. `loop/DIRECTION.md` is explicit that a
   * shorter page must not become a truer-sounding one. Every stated limit is still on the page: the
   * three lines of what is not yours to use yet, the three refusals, the note that says when a
   * reader's agent gets a record to reach, and the note that rules draft the arrangement unless a
   * model is configured.
   */
  import Arrange from '$lib/Arrange.svelte';
  import Icon from '$lib/Icon.svelte';
  import Decide from '$lib/Decide.svelte';
  import { APP, site } from '$lib/copy.ts';
  import type { Hue } from '$lib/icons.ts';

  /**
   * THE THREE COLUMNS OF THE PROMISE TABLE, EACH WITH A STATE MARK.
   *
   * `app.css` paints exactly three hues and `icons.ts` narrows the type to the same three, so a
   * column asking for a colour this site cannot paint will not typecheck. What holds is `earn`, what
   * is not here yet is `warn`, and what will never be here is `info`, because it is a decision
   * rather than a fault. `danger` is deliberately not among them: on a page with nothing wrong on
   * it, a red mark says something is.
   */
  const COLUMN_HUE: readonly Hue[] = ['earn', 'warn', 'info'];
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

<!-- ── The hero ─────────────────────────────────────────────────────────────
     A PROMISE AND THE PRODUCT, AND NOTHING ELSE. The headline, one sentence beside the one filled
     action, and under them the drawn app, which starts inside this band and runs past its bottom
     edge into the next one: the product sitting on the page rather than framed inside it. -->
<section class="band hero" data-ground="page" aria-labelledby="hero-title">
  <div class="in">
    <h1 class="display" id="hero-title">{site.hero.title} <span class="hl">{site.hero.titleAccent}</span></h1>

    <div class="hero-row">
      <p class="sub">{site.hero.sub}</p>
      <div class="hero-do">
        <div class="actions">
          <!-- THE PAGE'S ONE FILLED PRIMARY above the close. -->
          <a class="btn btn-primary btn-lg" href={APP} rel="external">{site.hero.primary}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{site.hero.secondary}</a>
        </div>
        <p class="note">{site.hero.note}</p>
      </div>
    </div>
  </div>

  <div class="in showcase">
    <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} app={site.arrange.app} />
  </div>
</section>

<!-- ── Arranged for you ─────────────────────────────────────────────────────
     THE BAND THE WINDOW LANDS IN. Its top padding is the overlap plus its own air, so the window's
     lower part sits on this band's ground and the words start under it. The line under the window
     says it can be pressed; the heading and the sentence say what it has just shown. -->
<section class="band arranged" data-ground="page" aria-labelledby="arrange-title">
  <div class="in">
    <p class="hint">{site.arrange.hint}</p>

    <div class="arranged-row reveal">
      <div>
        <p class="band-mark">
          <span class="band-tag">{site.arrange.tag}</span>
          <span class="band-rule"></span>
        </p>
        <h2 class="title" id="arrange-title">{site.arrange.title}</h2>
      </div>
      <div>
        <p class="lead">{site.arrange.lead}</p>
        <p class="note">{site.arrange.note}</p>
      </div>
    </div>
  </div>
</section>

<!-- ── Plain about what it is ───────────────────────────────────────────────
     EVERY SENTENCE ABOUT MECHANISM ON THIS SITE IS IN THIS ONE BAND, at the foot of the page, for
     the reader who has been convinced and wants to know what they would be buying.

     THE DRAWN DECISION IS THE EVIDENCE FOR THE SENTENCE ABOVE IT. The lead ends `every change
     carries a name`; the scene is Claude proposing a change, a person accepting it, and the row
     landing in the history with Claude's name on it.

     THE OPENER IS ONE LINE: the heading, a rule from the end of its words, and the tag. -->
<section class="band" data-ground="flip" aria-labelledby="plain-title">
  <div class="in reveal">
    <div class="band-mark band-mark-line">
      <h2 class="title title-inline" id="plain-title">{site.plain.title}</h2>
      <span class="band-rule"></span>
      <span class="band-tag">{site.plain.tag}</span>
    </div>
    <p class="lead lead-wide">{site.plain.lead}</p>
  </div>

  <!-- THE SCENE AT THE READING COLUMN AND ITS GUTTERS. `overflow: hidden` stays because the
       scene's rows move while it plays. -->
  <div class="proof reveal">
    <Decide scene={site.decide} />
  </div>

  <div class="in">
    <p class="note proof-note">{site.plain.note}</p>

    <div class="cols hair">
      {#each site.plain.columns as column, i (column.head)}
        <div class="col" data-hue={COLUMN_HUE[i]}>
          <h3 class="col-head"><span class="dot" aria-hidden="true"></span>{column.head}</h3>
          <ul class="lines">
            {#each column.lines as line (line)}<li>{line}</li>{/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ── The close ────────────────────────────────────────────────────────────
     ON THE PAGE'S OWN GROUND, AND THE RED IS IN THE WORDS. This band was the accent as a whole
     field until 22 September, when the owner asked for it to be much less red. The last three words
     of the heading carry `--accent-text`, the token solved for text on the page ground in both
     schemes, and a soft wash of the accent sits behind the heading so the band still reads as the
     brand's without being painted in it. The button stays ink, as every primary on the site is. -->
<section class="band close" data-ground="page" aria-labelledby="close-title">
  <div class="in reveal">
    <h2 class="display close-title" id="close-title">{site.closing.title} <span class="hl">{site.closing.titleAccent}</span></h2>
    <!-- THE SENTENCE AND THE ACTION ON ONE ROW, so the band's last line reaches both edges. -->
    <div class="close-row">
      <p class="close-body">{site.closing.body}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={APP} rel="external">{site.closing.primary}<Icon name="arrow" size="s" /></a>
        <a class="quiet" href="/pricing">{site.closing.secondary}</a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── The band ─────────────────────────────────────────────────────────────
     A band is the full width of the screen and the column inside it is `.in` (app.css). The
     `clamp` runs from 64px between bands on a phone to 88px on a wide screen. */
  .band {
    padding-block: clamp(var(--sp-8), 5.5vw, 88px);
  }

  /* A HAIRLINE AT EVERY SEAM. `+` rather than a rule on every band, so the first one has no line
     hanging off the header above it. The grounds are `sunk, page, flip, page`: the first seam is the
     one the window lies across, and the other two invert. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  /* ── Type ───────────────────────────────────────────────────────────── */

  /* 68px AT 1440, and `text-wrap: balance` rather than a character cap, so the wrap is decided by
     the width available. */
  .display {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  /* THE ONE PHRASE OF COLOUR IN A HEADLINE, the hero's and the close's. `--accent-text` is the token
     solved for 4.5:1 as text on every declared surface in both schemes, so it is the one accent role
     that may carry words, and both headlines sit on a declared surface. */
  .hl {
    color: var(--accent-text);
  }

  .title {
    margin: 0;
    max-inline-size: 26ch;
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

  /* On a band with nothing beside the sentence it may run to 64 characters, inside the 45-to-75
     band every typographic reference agrees on. */
  .lead-wide {
    max-inline-size: 64ch;
  }

  .note {
    margin-block: var(--sp-4) 0;
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
    margin-block-start: var(--sp-6);
  }

  /* A THUMB HAS TO HIT IT: `--tap` gives the quiet link the height the rest of this repository
     keeps, and `inline-flex` keeps the extra height from pushing the row apart. */
  .quiet {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ── The hero, and the window across its edge ───────────────────────── */

  /**
   * THE HERO IS THE APP'S CANVAS AND THE WINDOW SITS ON IT.
   *
   * The hero's ground is `--sunk`, one step below the page, which is the step the app itself takes
   * between its canvas and the page it lifts off it. The band under the hero is the page ground, so
   * the seam the window lies across is a real change of ground and a hairline, and the window's
   * lower part is visibly on the next band rather than inside a taller hero. `--sunk` is one of the
   * five surfaces `packages/theme` solves every text role against, so the headline, the sentence
   * and the accent phrase keep their certified contrast on it in both schemes.
   *
   * `flow-root` IS WHAT MAKES THE OVERLAP. The window's negative bottom margin would otherwise
   * collapse through the band's zero bottom padding and move the band's own edge down with it; in
   * its own formatting context the band ends `--overlap` above the window's bottom edge, and the
   * next band starts there.
   */
  /* HOW FAR THE WINDOW RUNS PAST THE HERO, declared on both bands at once because a sibling cannot
     read the other's custom property: the hero gives the window up by it and the next band pads its
     words down by it. */
  .hero,
  .arranged {
    --overlap: clamp(120px, 14vw, 216px);
  }

  .hero {
    display: flow-root;
    padding-block: var(--sp-7) 0;
    background: var(--sunk);
  }

  /* THE SENTENCE AND THE TWO ACTIONS SHARE A ROW, set on one baseline at the bottom so the row reads
     as one line of the page rather than as two columns that happen to start together. */
  .hero-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-7) var(--sp-8);
    align-items: end;
    margin-block-start: var(--sp-7);
  }

  .hero-do {
    min-inline-size: 0;
  }

  /* THE ROW'S OWN GAP IS THE SPACE, and the two margins the sentence and the actions carry elsewhere
     are dropped inside it. With them the headline stood 72px off its sentence at 1440, and on a
     phone the sentence, the actions and the note were three islands 56px apart. */
  .hero-row .sub,
  .hero-do .actions {
    margin-block-start: 0;
  }

  /**
   * THE SHOWCASE: THE WINDOW, RAISED OVER THE NEXT BAND, WITH THE ACCENT GLOWING UNDER ITS TOP EDGE.
   *
   * `z-index` puts it over the band below, whose ground and hairline would otherwise paint across
   * its lower part. The glow is the one piece of decoration on the page: a wash of the accent,
   * mixed from the token so it follows the accent wherever the accent goes, strongest under the
   * middle of the window and gone at both margins. It sits behind the window and nothing is read
   * through it, so it carries no contrast obligation of its own.
   */
  .showcase {
    position: relative;
    z-index: var(--z-raise);
    margin-block: var(--sp-8) calc(-1 * var(--overlap));
  }

  .showcase::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-inline: 0;
    inset-block-start: calc(-1 * var(--sp-8));
    block-size: calc(2 * var(--sp-8));
    background: radial-gradient(
      50% 100% at 50% 100%,
      color-mix(in srgb, var(--accent) 24%, transparent),
      transparent 72%
    );
    pointer-events: none;
  }

  /* ── Arranged for you ───────────────────────────────────────────────── */

  .arranged {
    padding-block-start: calc(var(--overlap) + var(--sp-5));
  }

  .hint {
    margin: 0 0 var(--sp-8);
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  .arranged-row {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: var(--sp-5) var(--sp-8);
    align-items: end;
  }

  .arranged-row .lead {
    margin-block-start: 0;
  }

  /* ── Plain about what it is ─────────────────────────────────────────── */

  /* THE ONE-LINE OPENER. A `div` and not a `p`, because it carries the band's `h2`. The heading,
     the rule and the tag sit on one baseline, with the rule centred against it. */
  .band-mark-line {
    align-items: baseline;
    gap: var(--sp-4);
    margin-block-end: var(--sp-4);
  }

  .band-mark-line .band-rule {
    align-self: center;
  }

  .title-inline {
    max-inline-size: none;
  }

  /* THE SCENE'S STAGE IS THE SCREEN AND THE SCENE INSIDE IT IS THE READING COLUMN AND ITS GUTTERS. */
  .proof {
    margin-block-start: var(--sp-7);
    padding-inline: max(var(--sp-6), calc((100% - var(--site-max)) / 2));
    overflow: hidden;
  }

  .proof-note {
    margin-block-start: var(--sp-4);
  }

  .cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-block-start: var(--sp-7);
  }

  .col {
    padding: var(--sp-5);
  }

  .col-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* The column's state, as one mark. `--hue` is set by `data-hue` in `app.css`. */
  .dot {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--hue);
    border-radius: var(--r-pill);
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

  /* ── The close ──────────────────────────────────────────────────────── */

  /**
   * THE PAGE'S GROUND WITH A SOFT WASH OF THE ACCENT BEHIND THE HEADING, AND NO RED FIELD.
   *
   * The wash is 9 per cent of the accent at its strongest, in the top middle of the band, and gone
   * well before either margin, so every word on the band sits on something within a few per cent of
   * the page ground. Checked against the strongest point of the wash: `--dim` stays over 6:1 in
   * both schemes and `--accent-text` over 6.5:1, so AA holds for every role on the band.
   */
  .close {
    background:
      radial-gradient(70% 90% at 50% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%),
      var(--bg);
  }

  /* LOUDER THAN THE HERO, which is the one place that is allowed: the last thing a reader sees, and
     the only place on the site where type is the event. */
  .close-title {
    font-size: clamp(2.5rem, 6vw, 5.5rem);
  }

  .close-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--sp-6);
    margin-block-start: var(--sp-6);
    padding-block-start: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .close-body {
    max-inline-size: 42ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .close-row .actions {
    margin-block-start: 0;
  }

  /* ── The two things that move ─────────────────────────────────────────────

     A SCROLL TIMELINE REVEALS EACH BAND, with no observer and no script, and two guards:
     `prefers-reduced-motion` is the reader's answer and `@supports` is the browser's. Where
     `view()` is not implemented the page is simply finished HTML. The range ends at 18 per cent of
     the element's travel, so a reader scrolling at any speed meets the band at full strength. */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .reveal {
        animation: rise auto both;
        animation-timeline: view();
        animation-range: entry 4% cover 18%;
      }
    }

    /* AND THE WINDOW ARRIVES ON LOAD, because it is already in view when the page opens and a
       `view()` timeline on it would resolve at its end and do nothing. A rise and a fade, never a
       scale, so the drawn type is never resampled while it moves. */
    .showcase {
      animation: stage-in 640ms var(--ease-out) 120ms both;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(var(--sp-5));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes stage-in {
    from {
      opacity: 0;
      transform: translateY(var(--sp-6));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 1000px) {
    .hero-row,
    .arranged-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ON A PHONE THE WINDOW TAKES THE WIDTH. The column's 32px gutters would leave the drawn app
     326px of a 390px screen; 16px gives it 358, which is the difference between a list that
     shows its figures and one that does not. */
  @media (width < 640px) {
    .showcase {
      margin-block-start: var(--sp-7);
      padding-inline: var(--sp-4);
    }

    .hint {
      margin-block-end: var(--sp-7);
    }

    .col {
      padding: var(--sp-4);
    }
  }
</style>
