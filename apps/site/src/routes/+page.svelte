<script lang="ts">
  /**
   * brain.dog's home page.
   *
   * WHAT THIS REPLACED, AND THE MEASUREMENTS THAT CONDEMNED IT. The page before it was audited
   * pixel by pixel in `loop/research-site-reference.md` against PostHog, FirstLook, Linear and
   * Supabase, and the findings are not opinions:
   *
   *   - Every band used the same grid and opened with the same move, so ONE layout ran six times.
   *     FirstLook runs ten in ten sections and repeats none.
   *   - The ground did not change for 4,368px. The only second surface on the whole page was a
   *     320px closing band at 1.04:1 against what it sat on. FirstLook flips its ground six times
   *     and each flip is a 15.88:1 jump.
   *   - Sampling every sixth row, 519 of 1,092 rows held nothing but the 1px rule. At three
   *     separate heights a scan of the full 2160px row returned exactly two non-background pixels.
   *     The median row's ink stopped at CSS x=389 of 1440.
   *   - The hero was 86.4px of type, the largest of the five sites measured, squeezed into 441px
   *     by `max-inline-size: 14ch`. Linear's 64px spans 1282px.
   *   - Both product screenshots were boxed in a 420px scrolling window. Not one of the four
   *     references boxes its primary product image.
   *
   * WHAT IT IS NOW, and the rule each answer came from. `apps/site/DESIGN-NOTES.md` carries the
   * source read, with the URL beside every value.
   *
   *   - SEVEN BANDS, SEVEN LAYOUTS, no repeat: a hero whose headline runs the width of the column,
   *     a full-bleed photograph of the product, a switcher, a sixteen-cell grid on a flipped
   *     ground, a specification beside an image that runs off the edge of the screen, a
   *     three-column table, and a closing band in the brand colour.
   *
   * WHAT THE SECOND PASS CHANGED, and the sentence in the first pass's own notes that asked for
   * it: "three bands still share one armature". Bands 0001, 0003 and 0005 were all copy on the
   * left and a widget on the right, so the count above was really five shapes in seven bands, and
   * 0003 carried the emptiness fault at one band's scale with its left column stopping about 120px
   * short of the rail beside it.
   *
   *   - 0003 IS A STRIP. The sentence runs the column, the control runs the whole screen between
   *     two hairlines, and the rail it redraws sits under it. Nothing is beside anything.
   *   - 0005 IS A LAYER. The dashboard is the width of the screen and 1,760px wide inside it, and
   *     the specification lies on the picture in an opaque card rather than in a column next to
   *     it. It is the only place on the site where two surfaces overlap.
   *   - The split survives in the hero alone, which is one use of a shape and not a repeat of one.
   *     Counted the way `loop/research-site-reference.md` counts the references, that is seven
   *     distinct layouts across seven bands, against FirstLook's ten in ten.
   *   - SIX GROUND CHANGES, two of them at the body-text ratio. `app.css` holds the mechanism and
   *     the argument for it; a band names a ground and every component inside it follows.
   *   - THE FRAME IS FILLED. Measured on the built page at 1440, the rightmost ink in each of the
   *     seven bands is 1320, 1440, 1320, 1320, 1440, 1320 and 1320 pixels: every band reaches the
   *     right edge of the 1,200px column, and the two picture bands reach the edge of the screen.
   *     The page this replaces had a MEDIAN rightmost ink of x=389.
   *   - AIR IS UNCHANGED, on purpose. 192px between bands is identical to FirstLook's and three
   *     times PostHog's 64px, so spacing was measured, found already right, and left alone.
   *   - TYPE CAME DOWN, from 86.4px to 67.68px at 1440, and the `14ch` cap went, so the headline
   *     is 970px wide on ONE line where it was 441px on three. Linear's is 64px over 1282px.
   *   - ONE FILLED BUTTON ABOVE THE CLOSE, which is `app.css`'s rule and was already kept.
   *   - COLOUR IS SPENT FOUR WAYS, not one: the last two words of the headline, the sequence
   *     number opening each band, the three state marks in the promise table, and the closing
   *     band's whole field.
   */
  import Arrange from '$lib/Arrange.svelte';
  import Icon from '$lib/Icon.svelte';
  import Ledger from '$lib/Ledger.svelte';
  import { APP, site } from '$lib/copy.ts';
  import type { Hue } from '$lib/icons.ts';

  /**
   * THE THREE COLUMNS OF THE PROMISE TABLE, EACH WITH A STATE MARK.
   *
   * `app.css` paints exactly three hues and `icons.ts` narrows the type to the same three, so a
   * column asking for a colour this site cannot paint will not typecheck. The mapping is the
   * reading: what holds is `earn`, what is not here yet is `warn`, and what will never be here is
   * `info`, because it is a decision rather than a fault. `danger` is deliberately not among them,
   * for the reason `icons.ts` already gives: on a page with nothing wrong on it, a red mark says
   * something is.
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

<!-- ── 0001 · The hero ──────────────────────────────────────────────────────
     The headline runs the full column on one line at 1440 and the two things under it fill the
     rest of the row: the sentence and the action on the left, the ledger on the right. The four
     figures close the band edge to edge, so the first screen has ink from margin to margin at
     three separate heights rather than at none. -->
<section class="band hero" data-ground="page" aria-labelledby="hero-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0001</span>
      <span class="band-rule"></span>
      <span class="band-tag">One record</span>
    </p>

    <h1 class="display" id="hero-title">{site.hero.title} <span class="hl">{site.hero.titleAccent}</span></h1>

    <div class="hero-say">
      <p class="sub">{site.hero.sub}</p>
      <div class="hero-do">
        <div class="actions">
          <!-- THE PAGE'S ONE FILLED PRIMARY, and the only one above the close. -->
          <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{site.hero.secondary}</a>
        </div>
        <p class="note">{site.hero.note}</p>
      </div>
    </div>
  </div>

  <!-- THE CLAIM, BEING DEMONSTRATED UNDER IT AND AT THE WIDTH OF THE SCREEN.

       IT WAS A 540px PANEL BESIDE 46ch OF COPY, which is the armature bands 0002 and 0005 were
       both using: three copies of one shape, and the first one is the shape a stranger meets. The
       hero is the only band on the page that cannot afford to look like the others.

       The reference read measures what the pages he pointed at put on the first screen instead:
       Linear runs a 1,344px product element from y=527 off the bottom of the fold, and 25 distinct
       colours cover the first screen with no single one over 49.8 per cent of it
       (`loop/research-site-reference.md`, section 3). We have no third capture to run off the fold
       and we have something no reference has: an element that is actually running. So the demo
       goes edge to edge under the headline, where the page's widest thing is the one thing on it
       that moves.

       "The log only grows" is a claim about behaviour over time, and no still picture can carry
       one. A list that only ever grows, watched for four seconds, can. -->
  <div class="hero-stage reveal">
    <Ledger
      events={site.ledger.events}
      head={site.ledger.head}
      only={site.ledger.only}
      all={site.ledger.all}
    />
  </div>

  <div class="in">

    <!-- FOUR NUMBERS, EACH ONE COUNTED. `copy.ts` records the command behind every figure and why
         two of the ones asked for are absent: a commit count moves every hour, and this page
         redeploys on a schedule. -->
    <ul class="facts hair">
      {#each site.facts.items as fact (fact.label)}
        <li class="fact">
          <span class="fact-fig num">{fact.figure}</span>
          <span class="fact-lab">{fact.label}</span>
        </li>
      {/each}
    </ul>
  </div>
</section>

<!-- ── 0002 · The product, at the width of the screen ───────────────────────
     The one move every reference makes and this page did not. Linear runs a 1344px product shot
     off the bottom of its first screen; PostHog's wallpaper is full-bleed behind everything;
     FirstLook's section grounds go edge to edge. Ours was 1440 natural pixels inside a 420px
     window, which showed about a third of the picture and asked the reader to scroll a box. -->
<section class="band" data-ground="page" aria-labelledby="typed-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0002</span>
      <span class="band-rule"></span>
      <span class="band-tag">Typed rows</span>
    </p>
    <div class="head-two">
      <h2 class="title" id="typed-title">{site.typed.title}</h2>
      <p class="lead">{site.typed.lead}</p>
    </div>
  </div>

  <figure class="bleed reveal">
    <!-- FOUR SOURCES, AND THE NARROW PAIR IS A DIFFERENT PHOTOGRAPH RATHER THAN THE SAME ONE
         SMALLER. A 1440-wide capture painted into 358px is a twelve per cent scale, which puts the
         app's 14px text on the page at under two pixels: a grey texture in the one band whose
         whole argument is look at this. `scripts/product.mjs` takes the narrow pair at 390 by 844
         at a device scale of 3, which is what that class of device actually has, so on a phone the
         type is the size the type is. It is also the truthful picture: somebody reading this on a
         phone is deciding whether to open the app on a phone.

         `width` and `height` on every source so the box is reserved before the bytes arrive and
         nothing below it moves while somebody is reading. -->
    <picture>
      <source
        media="(prefers-color-scheme: dark) and (width < 700px)"
        srcset="/shots/home-phone-dark.webp"
        width="1170"
        height="2532"
      />
      <source media="(width < 700px)" srcset="/shots/home-phone-light.webp" width="1170" height="2532" />
      <source media="(prefers-color-scheme: dark)" srcset="/shots/home-dark.webp" width="2880" height="1800" />
      <img src="/shots/home-light.webp" width="2880" height="1800" alt={site.typed.alt} decoding="async" />
    </picture>
    <figcaption class="caption in">{site.typed.caption}</figcaption>
  </figure>
</section>

<!-- ── 0003 · Arranged for you ──────────────────────────────────────────────
     The switcher is the argument: pressing a case redraws the rail in front of the reader, so the
     claim is made by the page doing the thing rather than by a sentence about it.

     THIS BAND USED TO BE COPY ON THE LEFT AND THE WIDGET ON THE RIGHT, which was the hero's
     armature and the report band's armature as well, so one shape ran three times on a page whose
     whole brief was that FirstLook runs ten without repeating. It had the emptiness fault too, at
     one band's scale: the copy column ran out about 120px above the rail beside it and the bottom
     left of the band was blank.

     It is a strip now. The sentence runs the width of the column, the control runs the width of
     the SCREEN between two hairlines, and the thing it redraws sits under it. Nothing is beside
     anything, so there is no short column to leave a hole under. -->
<section class="band" data-ground="flip" aria-labelledby="arrange-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0003</span>
      <span class="band-rule"></span>
      <span class="band-tag">Made of parts</span>
    </p>
    <div class="arrange-head">
      <h2 class="title" id="arrange-title">{site.arrange.title}</h2>
      <p class="lead lead-wide">{site.arrange.lead}</p>
    </div>
  </div>

  <div class="arrange-strip reveal">
    <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} />
  </div>

  <div class="in">
    <p class="note arrange-note">{site.arrange.note}</p>
  </div>
</section>

<!-- ── 0004 · Agents, on the flipped ground ─────────────────────────────────
     The strongest thing this product has to say and the page used to spend three chips on it.
     `loop/research-site-copy.md` ranks it first of eight: an agent gets a typed surface, not a
     chat window. So the surface itself is the picture, all twenty-one names of it, on the one
     band that changes the ground out from under the reader. -->
<section class="band" data-ground="page" aria-labelledby="agents-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0004</span>
      <span class="band-rule"></span>
      <span class="band-tag">Over MCP</span>
    </p>
    <h2 class="title" id="agents-title">{site.agents.title}</h2>
    <p class="lead lead-wide">{site.agents.lead}</p>

    <h3 class="sub-head">{site.agents.toolsHead}</h3>
    <ul class="tools hair">
      {#each site.agents.tools as tool (tool)}<li class="tool">{tool}</li>{/each}
    </ul>

    <h3 class="sub-head">{site.agents.templatesHead}</h3>
    <ul class="templates">
      {#each site.agents.templates as template (template)}<li class="template">{template}</li>{/each}
    </ul>

    <p class="note">{site.agents.note}</p>
  </div>
</section>

<!-- ── 0005 · Numbers arrive ────────────────────────────────────────────────
     The dashboard runs the full width of the screen and past both edges of it, and the
     specification sits ON it rather than beside it.

     IT WAS THE THIRD COPY OF ONE ARMATURE. Copy on the left, picture on the right, which the hero
     and the switcher band were both already doing. It had the second fault as well: a 450px copy
     column against a 540px picture leaves the bottom of the left column empty whichever way the
     two are aligned, which is the emptiness this redesign exists to remove.

     A CARD LYING ON THE PICTURE IS THE ONE LAYERED THING ON THE PAGE. It is the only place where
     two surfaces overlap. The card is opaque `--s1` inside a `--line` hairline, so nothing behind
     it is read through it and the contrast is the page's own, which is why this costs no new token
     and no new shadow. WHAT IT MAY LIE ON IS THE PICTURE'S TOP STRIP AND NOTHING ELSE: every third
     of this dashboard holds a money figure, so a card parked against either margin hides one, and
     it hid one for two passes. The measurement is in the stylesheet beside the overlap. -->
<section class="band" data-ground="page" aria-labelledby="report-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0005</span>
      <span class="band-rule"></span>
      <span class="band-tag">Reported</span>
    </p>
  </div>
  <div class="report reveal">
    <!-- THE HEADING COMES FIRST IN THE MARKUP AND LAST IN THE PAINT ORDER. A reader with a screen
         reader meets the heading and then the picture, which is the order the section is written
         in; `z-index` alone decides which of the two grid items is on top. -->
    <div class="report-card">
      <div class="report-say">
        <h2 class="title" id="report-title">{site.report.title}</h2>
        <p class="lead">{site.report.lead}</p>
      </div>

      <div class="report-spec">
        <h3 class="sub-head">{site.report.specHead}</h3>
        <dl class="spec hair">
          {#each site.report.spec as row (row.term)}
            <div class="spec-row">
              <dt class="spec-term">{row.term}</dt>
              <dd class="spec-def">{row.def}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </div>

    <figure class="report-shot">
      <picture>
        <source
          media="(prefers-color-scheme: dark) and (width < 900px)"
          srcset="/shots/usecase-founder-dashboard-phone-dark.webp"
          width="1170"
          height="2532"
        />
        <source
          media="(width < 900px)"
          srcset="/shots/usecase-founder-dashboard-phone-light.webp"
          width="1170"
          height="2532"
        />
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
      <figcaption class="caption in">{site.report.caption}</figcaption>
    </figure>
  </div>
</section>

<!-- ── 0006 · Plain about what it is ────────────────────────────────────────
     Three columns at one weight, in a grid whose dividers are the gap. The limits are not a
     footnote; they are the reason the rest is believable. -->
<section class="band" data-ground="flip" aria-labelledby="plain-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0006</span>
      <span class="band-rule"></span>
      <span class="band-tag">In writing</span>
    </p>
    <h2 class="title" id="plain-title">{site.plain.title}</h2>

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

<!-- ── The close, in the brand colour ───────────────────────────────────────
     It was `--accent-ground`, the accent mixed to 7 per cent, which measured 1.04:1 against the
     page it sat on: a band nobody could see, spending the brand on nothing. This is the accent as
     a whole field, with `--accent-ink` on it, which is the pair `packages/theme` already certifies
     for a filled accent control in both schemes. -->
<section class="band" data-ground="brand" aria-labelledby="close-title">
  <div class="in reveal">
    <h2 class="display close-title" id="close-title">{site.closing.title}</h2>
    <!-- THE SENTENCE AND THE ACTION ON ONE ROW, so the band's last line reaches both edges. They
         were stacked in a 46ch column, which left the right sixty per cent of the loudest surface
         on the page empty. -->
    <div class="close-row">
      <p class="close-body">{site.closing.body}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={APP}>{site.closing.primary}<Icon name="arrow" size="s" /></a>
        <a class="quiet" href="/pricing">{site.closing.secondary}</a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── The band ─────────────────────────────────────────────────────────────
     A band is the full width of the screen and the column inside it is `.in` (app.css). The air is
     unchanged from the page this replaces: `--sp-9` each side is 192px between band bodies, which
     `research-site-reference.md` measured as identical to FirstLook's and three times PostHog's,
     and concluded was already right. What changed is what fills it. */
  .band {
    padding-block: var(--sp-9);
  }

  /* A HAIRLINE AT EVERY SEAM, which is how PostHog marks a section off: each of the seven stacked
     sections on `/product-analytics` carries `padding-top: 32px`, `padding-bottom: 32px` and a
     `1px rgb(191,193,183)` top border, and nothing else. EVERY GROUND CHANGE ON THIS PAGE IS NOW A REAL ONE, WHICH IS WHY
     THERE ARE FEWER OF THEM. There used to be six and four of those were `--sunk` against `--bg`,
     which is 1.07:1: a real step in the eye's adaptation and not one a reader can point at, so the
     page read as one grey field with rules across it. `--sunk` is the application's canvas and it
     is a half step by design, which is right inside the app and wrong on a page somebody scrolls
     once. The grounds are `page, page, flip, page, page, flip, brand`: four inversions at about
     15:1, and at the two seams that do not invert the band opens with a picture that runs edge to
     edge, which is the change. The rule is still what turns a seam into an edge. `+` rather than a rule on every band, so the first one has no line
     hanging off the header above it. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .hero {
    padding-block-start: var(--sp-7);
  }

  /* ── Type ─────────────────────────────────────────────────────────────────

     68px AT 1440, DOWN FROM 86.4px, AND THE `14ch` CAP IS GONE.

     Both numbers are the reference read's. Measured across the five sites: PostHog 36px, Supabase
     46px, Linear 64px, FirstLook 72px, brain.dog 86.4px. Ours was the biggest and it took the
     least room, because `max-inline-size: 14ch` folded twenty-seven characters onto three lines
     inside 441px while Linear's smaller type spanned 1282px on two. The cap was solving the wrong
     problem: a headline does not need a measure, it needs to fit.

     `text-wrap: balance` and not a cap, so the wrap is decided by the width available rather than
     by a character count that means something different at every step of the clamp. */
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

  /* THE ONE PHRASE OF COLOUR IN THE HEADLINE, which is the move taken verbatim from PostHog's own
     hero (`text-red dark:text-yellow` on a phrase inside the `h1`, `src/components/Home/Hero.js`).
     `--accent-text` is the token solved for 4.5:1 as text on every declared surface in both
     schemes, so this is the one accent role that may carry words. */
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

  /* A HEADING FOR A LIST, at the identifier's volume rather than the title's. It is the label over
     a specification, which is what `--font-id` is for, and it is deliberately not on the type
     scale's display steps: `css-rules` refuses that pairing and it is right to. */
  .sub-head {
    margin-block: var(--sp-7) var(--sp-4);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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

  /* On a band with no second column beside it, the sentence may run wider than a narrow measure
     without becoming hard to track: 64 characters is inside the 45-to-75 band every typographic
     reference agrees on, and it stops a 1,136px row carrying a 430px paragraph and nothing else. */
  .lead-wide {
    max-inline-size: 64ch;
  }

  .note {
    margin-block: var(--sp-4) 0;
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
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

  /* ── 0001 · The hero ──────────────────────────────────────────────────── */

  /* THE SENTENCE AND THE TWO ACTIONS SHARE A ROW, and both halves are text, which is what stops
     this reading as the copy-beside-widget shape it replaced. `align-items: end` sets them on one
     baseline at the bottom, so the row reads as one line of the page rather than as two columns
     that happen to start together. */
  .hero-say {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-7) var(--sp-8);
    align-items: end;
    margin-block-start: var(--sp-7);
  }

  .hero-do {
    min-inline-size: 0;
  }

  /* THE STAGE IS THE SCREEN, and the ledger inside it is 100 per cent of that rather than a panel
     of an invented width. Its rows are five columns of tabular text, so the room goes to `what`,
     which is the column that was ellipsising first when the component lived in a 540px box: the
     one element whose job is to prove nothing is overwritten was the one truncating its own
     sentences. `overflow: hidden` because the rows animate in from the right. */
  .hero-stage {
    margin-block-start: var(--sp-8);
    padding-inline: max(var(--sp-6), calc((100% - var(--site-max)) / 2));
    overflow: hidden;
  }

  .facts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-block-start: var(--sp-8);
    padding: 0;
    list-style: none;
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-5);
  }

  /* The figure at a display step and the label at the smallest one, which is the whole hierarchy: a
     number is worth reading and the words under it are what it means. Tabular figures because
     `base.css` is explicit that a quantity gets them on a proportional face and identity gets the
     mono face, and these are quantities. */
  .fact-fig {
    color: var(--ink);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: var(--tr-tight);
    line-height: 1;
  }

  .fact-lab {
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  /* ── 0002 · The full-bleed photograph ─────────────────────────────────── */

  .head-two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: end;
  }

  .head-two .lead {
    margin-block-start: 0;
  }

  /* The figure is a child of the band rather than of `.in`, which is the whole of how it goes
     full-bleed: there is no negative margin and nothing to keep in step with the column width. */
  .bleed {
    margin: var(--sp-7) 0 0;
  }

  /**
   * THE PICTURE IS PAINTED AT ITS OWN SIZE AND CROPPED AT THE BOTTOM, which is Linear's move: a
   * 1344px product shot that starts inside the first screen and runs off it.
   *
   * The capture is 1440 CSS px wide (2880 at a device scale of 2), so at a 1440 viewport this
   * paints exactly one device pixel per captured pixel and the caption's claim is literal. Above
   * 1440 the image scales up to keep covering the width, which crops further off the BOTTOM and
   * never off the side, because `cover` matches the wider axis first.
   *
   * `object-position: 0 0` anchors the top-left corner, so the app's own rail is never the thing
   * that gets trimmed. It is the one physical-feeling value on the page and it is deliberate: the
   * photograph is of a left-to-right screen and mirroring it under `dir(rtl)` would show the
   * reader a screenshot of an application that does not exist.
   *
   * The block size is a clamp rather than the image's own height, because 900px of screenshot on a
   * 900px viewport is a band a reader has to scroll past rather than look at.
   */
  .bleed img {
    display: block;
    inline-size: 100%;
    block-size: clamp(300px, 42vw, 640px);
    object-fit: cover;
    object-position: 0 0;
  }

  /* ── 0003 · The switcher ──────────────────────────────────────────────── */

  /* The heading and the sentence stack, because the control under them is the width of the screen
     and a heading set beside something would put a second column back on the one band that has
     just lost one. `.lead-wide` rather than the 46ch measure for the same reason: with nothing on
     its right, a 430px paragraph in a 1,136px row is the fault this page was rebuilt to remove. */
  .arrange-head {
    min-inline-size: 0;
  }

  /* The component is a child of the band and not of `.in`, which is the whole of how its control
     strip reaches both edges of the screen. `Arrange.svelte` puts the buttons back inside `.in`
     itself, so only the rules are full-bleed. */
  .arrange-strip {
    margin-block-start: var(--sp-7);
  }

  .arrange-note {
    margin-block-start: var(--sp-5);
  }

  /* ── 0004 · The typed surface ─────────────────────────────────────────── */

  /* SIXTEEN CELLS IN FOUR COLUMNS, the dividers being the grid's own 1px gap (`app.css`, `.hair`).
     The names are the declaration's, in declaration order, so this grid is a photograph of
     `packages/mcp/src/index.ts` rather than a drawing of one. */
  .tools {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tool {
    padding: var(--sp-4);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .templates {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A template is a grammar rather than a name, so it is drawn as a chip and not as a cell: a
     reader should see at a glance that the five are a different kind of thing from the sixteen. */
  .template {
    padding: var(--sp-1) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* ── 0005 · The specification beside the dashboard ────────────────────── */

  /**
   * THE CARD LIES ON THE PICTURE'S TOP EDGE AND NOWHERE ELSE, AND THE PICTURE DECIDED THAT.
   *
   * It lay across the middle of the dashboard for two passes, first on the left and then on the
   * right, and both of those hide a money figure. Measured on the capture itself
   * (`static/shots/usecase-founder-dashboard-dark.webp`, 2,880 x 1,800 for a 1,440px app):
   * `Cash now` sits at 19 per cent of the width, `Coming in, 30 days` at 46 and
   * `Going out, 30 days` at 72, and the row under them repeats at 19, 46 and 73. A figure occupies
   * every third of the picture, so a 480px card covers one wherever it is put sideways. The right
   * edge was no better than the left: it turned `GBP 28,320.00` into `320.00` and cut
   * `no more than GBP 50,000.00` in half.
   *
   * WHAT IS ACTUALLY FREE IS THE TOP. Nothing above `Across your organisations` is a number: the
   * strip holds the breadcrumb, the page title and two controls. In source pixels the first figure
   * starts 341px down, which at the 0.611 scale this band paints the capture at is 208 rendered
   * pixels. The overlap is capped at 88px, so there are 120px of clear picture between the card's
   * bottom edge and the top of the tallest glyph in `GBP 24,800.00`.
   *
   * SO THE LAYER SURVIVES AND THE HAZARD DOES NOT. This is still the one place on the page where
   * two surfaces overlap. It overlaps by an amount that is measured against the picture rather
   * than chosen against the composition, which means a new capture is checked by looking at where
   * its first number is, not by looking at whether the page still seems fine.
   */
  .report {
    display: grid;
    gap: 0;
  }

  /* THE STRIP IS THE READING COLUMN, so the card starts where every heading on the page starts and
     ends where they end, rather than being a block of an invented width parked against one margin.
     Two columns because the specification is a table and a table beside a sentence reads as one
     object, where a table under a sentence reads as a second thing that arrived later. */
  .report-card {
    position: relative;
    z-index: var(--z-raise);
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: var(--sp-6) var(--sp-7);
    align-items: start;
    inline-size: min(100% - 2 * var(--sp-6), var(--site-max));
    /* THE OVERLAP, AND IT IS THE ONE NUMBER THIS BAND IS ABOUT. 88px at 1440 against 208px of
       clear picture above the first figure. It shrinks with the viewport because the picture does
       not: the capture is painted at a fixed 1,760px at every width, so the clear strip is 208px
       everywhere and a smaller overlap is only ever safer. */
    margin-block-end: calc(-1 * clamp(40px, 5vw, 88px));
    margin-inline: auto;
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .report-say .lead {
    max-inline-size: 42ch;
  }

  .report-spec .sub-head {
    margin-block-start: 0;
  }

  .spec {
    grid-template-columns: minmax(0, 1fr);
    margin: 0;
  }

  .spec-row {
    display: grid;
    grid-template-columns: minmax(0, 11ch) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: baseline;
    padding: var(--sp-3) var(--sp-4);
  }

  .spec-term {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .spec-def {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  /**
   * THE CLIP LIVES ON THE FIGURE, AND WHICH KEYWORD IT IS MATTERS TWICE.
   *
   * THE FIGURE IS THE WIDTH OF THE SCREEN AND THE PICTURE IS WIDER. What falls past the figure
   * falls past the viewport, so clipping here and clipping at the band are the same picture.
   *
   * IT WAS `overflow: clip` ON THE BAND AND THE LAYOUT GATE READ IT AS AN OVERFLOW.
   * `tools/gates/layout.mjs` excuses an element that sticks out only when an ancestor contains it,
   * and its test is `overflowX` in `auto | scroll | hidden`. `clip` is not on that list, so the
   * gate reported `site/ @1180 img reaches 1997px` on a picture that is doing exactly what it was
   * designed to do. The gate is right to be strict and the keyword is the thing to change, not the
   * gate: nothing about this design needs `clip` specifically.
   *
   * AND IT MUST NOT BE THE BAND. `overflow: hidden` makes an element a scroll container, and
   * `.report` carries the page's scroll-driven reveal: with the clip on the band, the band would
   * become the nearest scrollport and the reveal's timeline would resolve against something that
   * never scrolls. On the figure it cannot, because the figure is a child of the animated element
   * rather than an ancestor of it.
   */
  .report-shot {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
  }

  /**
   * 1,760 NATURAL PIXELS IN A SCREEN OF 1,440, so the dashboard always runs off the right edge
   * rather than ending inside it.
   *
   * The capture is 1,440 CSS px wide, so painting it at 1,760 is a 1.22x enlargement of a 2,880px
   * source: 2.36 device pixels per CSS pixel at a scale of 2, which is still above 1:1 and is why
   * the picture stays sharp while being bigger than the window it is seen through. The old
   * treatment painted it at 1:1 in a 700px column, which showed the rail and about 460px of the
   * page; this shows the rail and roughly 1,200px of it, and the card covers none of it: it laps the top
   * 88px, where the picture has a breadcrumb and a title and no numbers.
   *
   * A top rule and no side rules, because there is no side for one to be on.
   */
  .report-shot img {
    display: block;
    inline-size: 1760px;
    max-inline-size: none;
    /* 44vw IS 633px AT 1440, AND THE NUMBER IS WHERE THE PICTURE HAS A SEAM RATHER THAN A ROW.
       42vw cut the dashboard at 605px, which is nine pixels into the figures under `Active users`,
       `Monthly recurring revenue` and `Signups`: three numbers sliced along their waists. A crop
       that ends between two rows reads as a photograph continuing past the frame, and one that
       ends inside a glyph reads as a mistake. */
    block-size: clamp(420px, 44vw, 700px);
    object-fit: cover;
    object-position: 0 0;
    border-block-start: 1px solid var(--line);
  }

  .report-shot .caption {
    margin-block-start: var(--sp-3);
  }

  /* ── 0006 · Plain about what it is ────────────────────────────────────── */

  .cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-block-start: var(--sp-6);
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

  /* The column's state, as one mark. `--hue` is set by `data-hue` in `app.css` and resolves to a
     text role, so it is legible against both schemes' grounds without being a word. */
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

  /* ── The close ────────────────────────────────────────────────────────── */

  /* LOUDER THAN THE HERO, WHICH IS THE ONE PLACE THAT IS ALLOWED. The hero comes down to 68px so
     it can span its column on one line; this is seventeen characters on the page's only coloured
     field, and at 86px it spans about 800 of the 1,136px column. It is the last thing a reader
     sees and the only place on the site where type is the event. */
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

  /* ── The one thing that moves ─────────────────────────────────────────────

     FIRSTLOOK REVEALS ALL TEN OF ITS SECTIONS and kills the lot under one `prefers-reduced-motion`
     rule (`firstlook.ai` inline stylesheet, `.reveal` at :228, the media query at :254, the
     observer at :624-630). This is the same effect with no observer and no script: a scroll
     timeline is a stylesheet feature, it costs nothing at runtime, and it cannot leave an element
     stuck invisible if a script fails to run.

     TWO GUARDS, AND BOTH ARE LOAD-BEARING. `prefers-reduced-motion` is the reader's answer and
     `@supports` is the browser's: where `view()` is not implemented the rule never applies and the
     page is simply finished HTML, which is what it is anyway. The range ends early, at 18 per cent
     of the way through the element's travel, so a reader scrolling at any speed meets the band at
     full strength rather than watching it catch up. */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .reveal {
        animation: rise auto both;
        animation-timeline: view();
        animation-range: entry 4% cover 18%;
      }
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

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 1000px) {
    .hero-say,
    .head-two {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-7);
    }

    .facts,
    .tools {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE CARD COMES OFF THE PICTURE AND THE PICTURE STOPS RUNNING OFF THE EDGE. Below 900px a 480px
     card laid on the screen would cover most of it, and a 1,760px image in a 900px window is a
     crop of a crop. The two go back to being stacked, and the narrow capture is the dashboard as a
     phone draws it, at the column's own width, with every figure on it readable. */
  @media (width < 900px) {
    .report {
      display: flex;
      flex-direction: column;
      gap: var(--sp-7);
      max-inline-size: var(--site-max);
      margin-inline: auto;
      padding-inline: var(--sp-6);
    }

    .report-card {
      grid-template-columns: minmax(0, 1fr);
      inline-size: 100%;
      /* NO OVERLAP UNDER 900px, because the narrow treatment swaps the wide capture for a phone
         one and lays the two out in a column. There is no picture behind the card to lie on. */
      margin-block-end: 0;
      margin-inline-start: 0;
      padding: 0;
      background: none;
      border: 0;
    }

    /* `block-size: auto` UNDOES THE CROP, which is the half that is easy to forget: the wide
       treatment is a 1,760px image cut to 660px tall, and applying that to a 2532px-tall phone
       capture would show the reader the dashboard's title and nothing under it. */
    .report-shot img {
      inline-size: 100%;
      max-inline-size: 420px;
      block-size: auto;
      object-fit: fill;
      border: 1px solid var(--line);
      border-radius: var(--r-lg);
    }

    .report-shot .caption {
      padding-inline: 0;
    }
  }

  /* THE NARROW PAIR OF CAPTURES IS A WHOLE PHONE SCREEN, so the frame has to be tall enough to be
     worth looking at. `42vw` is 164px at 390 and the floor was doing all the work, which showed
     the top third of an 844px screen. 460px is a little over half of it, ending inside the list of
     what falls due this week rather than immediately under the heading.

     700 AND NOT 640, because this number belongs to the `<picture>` above rather than to the
     grid: the narrow captures are selected at `(width < 700px)` in the markup, and a frame height
     that disagreed with the source that fills it would crop the wrong photograph for sixty
     pixels. The blocks in this section descend, so a wider one never wins a tie on source order
     against a narrower one. */
  @media (width < 700px) {
    .bleed img {
      block-size: 460px;
    }
  }

  @media (width < 640px) {
    .band {
      padding-block: var(--sp-8);
    }

    .facts {
      grid-template-columns: minmax(0, 1fr);
    }

    .fact {
      flex-direction: row;
      align-items: baseline;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
    }

    .fact-fig {
      min-inline-size: 3ch;
      font-size: var(--t-xl);
    }

    .tool {
      padding: var(--sp-3);
    }

    .col {
      padding: var(--sp-4);
    }

    .report {
      padding-inline: var(--sp-4);
    }
  }
</style>
