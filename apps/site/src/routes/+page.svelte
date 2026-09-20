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

    <div class="hero-row">
      <div class="hero-copy">
        <p class="sub">{site.hero.sub}</p>
        <div class="actions">
          <!-- THE PAGE'S ONE FILLED PRIMARY, and the only one above the close. -->
          <a class="btn btn-primary btn-lg" href={APP}>{site.hero.primary}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{site.hero.secondary}</a>
        </div>
        <p class="note">{site.hero.note}</p>
      </div>

      <!-- THE CLAIM, BEING DEMONSTRATED BESIDE IT. "The log only grows" is a claim about behaviour
           over time, and no still picture can carry one. A list that only ever grows, watched for
           four seconds, can. -->
      <Ledger
        events={site.ledger.events}
        head={site.ledger.head}
        only={site.ledger.only}
        all={site.ledger.all}
      />
    </div>

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
<section class="band" data-ground="sunk" aria-labelledby="typed-title">
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
     claim is made by the page doing the thing rather than by a sentence about it. -->
<section class="band" data-ground="page" aria-labelledby="arrange-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0003</span>
      <span class="band-rule"></span>
      <span class="band-tag">Made of parts</span>
    </p>
    <div class="arrange-grid">
      <div class="arrange-copy">
        <h2 class="title" id="arrange-title">{site.arrange.title}</h2>
        <p class="lead">{site.arrange.lead}</p>
        <p class="note">{site.arrange.note}</p>
      </div>
      <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} />
    </div>
  </div>
</section>

<!-- ── 0004 · Agents, on the flipped ground ─────────────────────────────────
     The strongest thing this product has to say and the page used to spend three chips on it.
     `loop/research-site-copy.md` ranks it first of eight: an agent gets a typed surface, not a
     chat window. So the surface itself is the picture, all twenty-one names of it, on the one
     band that changes the ground out from under the reader. -->
<section class="band" data-ground="flip" aria-labelledby="agents-title">
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
     Copy and a specification on the left, the dashboard those numbers drew on the right, painted
     at its own size and running off the edge of the screen. The band clips rather than scrolls, so
     the picture is a window onto something wider without costing the reader a scroll trap. -->
<section class="band" data-ground="page" aria-labelledby="report-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0005</span>
      <span class="band-rule"></span>
      <span class="band-tag">Reported</span>
    </p>
  </div>
  <div class="report-grid reveal">
    <div class="report-copy">
      <h2 class="title" id="report-title">{site.report.title}</h2>
      <p class="lead">{site.report.lead}</p>

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
      <figcaption class="caption">{site.report.caption}</figcaption>
    </figure>
  </div>
</section>

<!-- ── 0006 · Plain about what it is ────────────────────────────────────────
     Three columns at one weight, in a grid whose dividers are the gap. The limits are not a
     footnote; they are the reason the rest is believable. -->
<section class="band" data-ground="sunk" aria-labelledby="plain-title">
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
     `1px rgb(191,193,183)` top border, and nothing else. Two of the six ground changes on this
     page are a 15:1 jump and need no help; the other four are `--sunk` against `--bg`, which is
     1.07:1, a real step in the eye's adaptation and not one a reader can point at. The rule is
     what turns it into an edge. `+` rather than a rule on every band, so the first one has no line
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

  /* 1.05fr AND NOT 1fr. The left column holds a 46ch sentence and a button row; the right holds
     the ledger, whose rows are five columns of tabular text. At an even split the ledger's `what`
     column was the first thing to ellipsis, and a component whose job is to prove that nothing is
     overwritten should not be the one truncating its own sentences. */
  .hero-row {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: start;
    margin-block-start: var(--sp-7);
  }

  .hero-copy {
    min-inline-size: 0;
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

  /* THE SENTENCE ON THE LEFT AND THE THING IT DESCRIBES ON THE RIGHT, so the band's ink reaches
     both edges of the column. The rail's own 240px cap was the other half of that fix and it is
     lifted in `Arrange.svelte`, with the measurement that condemned it written beside the rule. */
  .arrange-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: start;
  }

  .arrange-copy {
    min-inline-size: 0;
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

  /* `start` AND NOT `center`. Centring a 450px copy column against a 900px picture left 225px of
     nothing above the heading and 225px below the specification, which is the exact fault this
     redesign is answering everywhere else on the page. Both columns begin at the same line now,
     and the picture is cropped rather than the band stretched. */
  /* 0.85 AGAINST 1.15 AND NOT AN EVEN SPLIT. The picture is painted at its own size, so the column
     width decides how much of the application a reader sees: at an even split the visible 545px
     was the record's 240px rail and about 300px of dashboard, which is a picture of a sidebar. The
     wider column shows the rail and roughly 540px of the page beside it, which is the cash figure,
     the balance bar and the first of the drawn numbers. The copy column loses about 70px and still
     holds a 46ch measure. */
  .report-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: var(--sp-8);
    align-items: start;
    padding-inline-start: max(var(--sp-6), calc((100% - var(--site-max)) / 2 + var(--sp-6)));
  }

  .report-copy {
    min-inline-size: 0;
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
   * THE LEFT EDGE IS THE COLUMN'S AND THE RIGHT EDGE IS THE SCREEN'S. `.report-grid` pads only its
   * inline start, so this column's right edge IS the viewport's right edge at every width; the
   * picture is 1,440px inside a box about 700 wide, and what falls past the box falls past the
   * screen. Clipping here and clipping at the band are therefore the same picture.
   *
   * IT WAS `overflow: clip` ON THE BAND AND THE LAYOUT GATE READ IT AS AN OVERFLOW.
   * `tools/gates/layout.mjs` excuses an element that sticks out only when an ancestor contains it,
   * and its test is `overflowX` in `auto | scroll | hidden`. `clip` is not on that list, so the
   * gate reported `site/ @1180 img reaches 1997px` on a picture that is doing exactly what it was
   * designed to do. The gate is right to be strict and the keyword is the thing to change, not the
   * gate: nothing about this design needs `clip` specifically.
   *
   * AND IT MUST NOT BE THE BAND. `overflow: hidden` makes an element a scroll container, and
   * `.report-grid` carries the page's scroll-driven reveal: with the clip on the band, the band
   * would become the nearest scrollport and the reveal's timeline would resolve against something
   * that never scrolls. On the figure it cannot, because the figure is a child of the animated
   * element rather than an ancestor of it.
   */
  .report-shot {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
  }

  /* 1440 natural pixels in a column about 700 wide, so a reader sees the left half of the
     dashboard at full size and the rest of it is past the edge of the screen. Not a scroll box:
     `research-site-reference.md` found both of the old windows cost a reader roughly 480px of
     trapped wheel on the way down the page, twice. */
  .report-shot img {
    display: block;
    inline-size: 1440px;
    max-inline-size: none;
    block-size: clamp(340px, 33vw, 540px);
    object-fit: cover;
    object-position: 0 0;
    border-start-start-radius: var(--r-lg);
    border-end-start-radius: var(--r-lg);
    border: 1px solid var(--line);
    border-inline-end: 0;
  }

  .report-shot .caption {
    padding-inline-start: 2px;
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
    .hero-row,
    .head-two,
    .arrange-grid {
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

  /* THE DASHBOARD STOPS RUNNING OFF THE EDGE AND BECOMES ITS OWN PHOTOGRAPH. Below 900px the two
     columns stack, so "the left half at full size" would be a 1440px image in a 900px column: a
     crop of a crop. The narrow capture is the dashboard as a phone draws it, so it goes back to
     the column's own width and every figure on it is readable. */
  @media (width < 900px) {
    .report-grid {
      grid-template-columns: minmax(0, 1fr);
      padding-inline: var(--sp-6);
      max-inline-size: var(--site-max);
      margin-inline: auto;
    }

    /* `block-size: auto` UNDOES THE CROP, which is the half that is easy to forget: the wide
       treatment is a 1440px image cut to 540px tall, and applying that to a 2532px-tall phone
       capture would show the reader the dashboard's title and nothing under it. */
    .report-shot img {
      inline-size: 100%;
      max-inline-size: 420px;
      block-size: auto;
      object-fit: fill;
      border-inline-end: 1px solid var(--line);
      border-radius: var(--r-lg);
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

    .report-grid {
      padding-inline: var(--sp-4);
    }
  }
</style>
