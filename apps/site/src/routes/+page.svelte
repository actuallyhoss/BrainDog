<script lang="ts">
  /**
   * brain.dog's home page.
   *
   * WHAT THE OWNER SAID ON 2026-09-21, WHICH IS THE THIRD DIRECTION ABOUT THIS PAGE IN ONE DAY, and
   * `loop/DIRECTION.md` §19 carries it verbatim: *i dont like how it's so long, and it's all records
   * and text. i want it to be more graphical, and shows the value, not what it does technically (at
   * least not for the first blocks). it should be an exciting tool to use, not a boring text-based
   * tool. less of those silly ai-looking stats of tools, templates, etc. i want a high value elevated
   * design please*
   *
   * THE PAGE HE WAS LOOKING AT, MEASURED BEFORE ANY OF THIS WAS TOUCHED. Driven over
   * `apps/site/build` at 1440 by 900, device scale 1, motion reduced, dark scheme: the document was
   * 5,658px over seven bands of 904, 966, 630, 726, 1,153, 573 and 397, and 7,042px at 390. Four of
   * those seven bands opened with a sentence and then argued in a table, a list or a grid.
   *
   * WHAT CAME OUT, AND WHY EACH ONE RATHER THAN A TRIM EVERYWHERE:
   *
   *   - THE FOUR COUNTED FIGURES UNDER THE HERO. `16 tools an agent can call`, `5 resource
   *     templates beside them`, `1 file holds your record`, `30 nightly backups, either host`.
   *     Every one was counted off a real declaration and not one of them answered a question a
   *     reader had arrived with. They were 130px of the first screen, which is the most expensive
   *     130px on the site.
   *   - THE WHOLE `Over MCP` BAND, which was the sixteen tool names in a four-column grid, five
   *     resource-template grammars as chips, and two uppercase list headings over them: 726px to
   *     print a protocol's declaration order at a stranger. Its two sentences survive, in the last
   *     band before the close, where a reader who wants the mechanism will find them.
   *   - THE `Typed rows` BAND'S HEADING BLOCK, 235px of mark, heading and lead sitting between the
   *     hero and the product photograph it introduced. The photograph moved INTO the hero and the
   *     heading block did not come with it, because the picture was never the illustration for that
   *     sentence: it is the best thing this product has and it was being used as a footnote to a
   *     paragraph about data modelling.
   *   - THE FOUR-ROW SPECIFICATION OF WHAT A REPORT KEY CAN DO, off the dashboard band. Every
   *     figure in it is true and the whole table is a thing a reader wants at the moment they are
   *     about to paste a credential into a deploy script, which is not this moment.
   *
   * WHAT DID NOT COME OUT, AND THIS IS THE RULE WITH TEETH. `loop/DIRECTION.md` is explicit that a
   * shorter page must not become a truer-sounding one. Every stated limit is still on the page: the
   * three lines of `Not built yet`, the three refusals of `It will not do`, the note that agents
   * reach a self-hosted record today, and the note that rules draft the arrangement unless a model
   * is configured. The only sentence deleted for length rather than for mechanism is the thirty
   * nightly backups, and that is a strength, not a limit, and it is a counted figure of the kind he
   * named. Length came out of bands and pictures.
   *
   * WHAT IT IS NOW: FIVE BANDS, VALUE FIRST, AND WHAT EACH ONE IS LED BY, WRITTEN OUT RATHER THAN
   * SLOGANISED.
   *
   *   HERO        the promise, one action, and the product PHOTOGRAPHED at the width of the screen,
   *               cropping off the bottom of the fold the way Linear runs its 1,344px shot off the
   *               first screen.
   *   0001        the switcher, DRAWN IN CSS and running the full width of the screen: the record
   *               becoming the reader's own, redrawn as they press.
   *   0002        the dashboard PHOTOGRAPHED, wider than the screen, with the sentence lying on its
   *               top strip.
   *   0003        the mechanism, all of it, in one band: registers, agents, the ledger arriving,
   *               and the three honest columns.
   *   close       the accent as a whole field.
   *
   * THIS PARAGRAPH USED TO READ *EVERY ONE OF THE FIRST THREE LED BY SOMETHING DRAWN RATHER THAN
   * WRITTEN*, AND OF THE THREE, 0001 WAS NOT. Counted off `apps/site/build/index.html` on
   * 2026-09-22: the hero holds one `<img>` and 0002 holds one, and 0001 holds no `<img>` and no
   * `<svg>` at all. What 0001 draws it draws in CSS, which is a picture by any fair reading, but it
   * was the FOURTH thing in the band. Above it stood a mark, a heading and a 23-word lead: 31 words
   * of prose between the hairline that opens the band and the first drawn pixel in it. The lead
   * moved UNDER the rail, where it answers what a reader has just watched happen rather than
   * introducing a control nobody has seen yet, and the band now says eight words before the
   * switcher. The claim above is written as what each band is led BY, because the slogan is what
   * stopped anybody checking.
   *
   * AND THE ARITHMETIC THAT ARRIVED WITH THE COMPLAINT IS RIGHT ABOUT THE MARKUP AND WRONG ABOUT
   * THE READER, WHICH IS WORTH RECORDING BECAUSE IT NEARLY BOUGHT THIS BAND A PHOTOGRAPH IT DOES
   * NOT NEED. The report was that the two bands with no picture carry 303 of the page's 414 words
   * and all 46 of its list items. Counting whitespace-separated tokens once tags and entities are
   * stripped, the bytes say 122 words in 0001 and 181 in 0003 and 46 list items in the two of them,
   * so the numerator is exact; the five bands hold 417 and not 414, which is the same 73 per cent
   * OF THE MARKUP. Recount it off the same file and bound the closing band at its own `</section>`:
   * running that last slice to the end of the document counts the 16-word footer as well, which is
   * where 433 words and 70 per cent come from. What the number cannot see is that a reader is never
   * shown it. Four of the switcher's five panels are `visibility: hidden`, so 30 of those words and
   * 26 of those list items are off the screen, out of the tab order and out of the accessibility
   * tree at any one moment. What a reader actually meets in 0001 is 92 words and ten rows.
   *
   * WHAT WOULD MAKE 0001'S DRAWING A DRAWING RATHER THAN A LIST OF NOUNS IS NOT IN THIS FILE. Every
   * row of the rail carries a grey square where the application draws a glyph, and
   * `lib/Arrange.svelte:390` says so itself at its `.mark` rule: *there is no glyph to draw for a
   * row that is only a name*. The application draws 63 of them, counted off the keys of
   * `apps/web/src/lib/ui/icons.ts`, and `lib/icons.ts:17` carries four, because four is all this
   * site has asked for so far. Ten real glyphs down that rail is the difference between a picture
   * of a navigation rail and a bulleted list, and it costs two files that this one does not own.
   *
   * WHAT SURVIVED FROM THE TWO PASSES BEFORE THIS ONE, because those measurements are still the
   * reason these shapes are the shapes:
   *
   *   - FIVE DISTINCT LAYOUTS IN FIVE BANDS at 1024 and above. `research-site-reference.md` counts
   *     FirstLook at ten in ten and the page before last at one in six.
   *   - THE FRAME IS FILLED. The fault that redesign existed to fix was a MEDIAN rightmost ink of
   *     x=389 of 1440, with 519 of 1,092 sampled rows holding nothing but a hairline. Two of the
   *     five bands here reach the edge of the screen and the rest reach the edge of the column.
   *   - FOUR GROUND CHANGES over five bands, three of them inversions at 15.41:1 in light and
   *     17.61:1 in dark. `app.css` holds the mechanism and the arithmetic.
   *   - ONE FILLED BUTTON ABOVE THE CLOSE, which is `app.css`'s rule.
   *   - THE ACCENT IS SPENT FOUR WAYS and it is a true red now, `#DB2527` at the mark's own hue
   *     (DIRECTION §19): the last two words of the headline, the glow the product picture rises
   *     out of, the sequence number on the bands that sit on the page's own ground, and the
   *     closing band's whole field.
   *
   *     THE SEQUENCE NUMBER IS RED ON ONE BAND OF THE THREE AND NOT ON ALL THREE, which the line
   *     above used to claim. `.band-seq` is `--accent-text`, and `app.css` redefines
   *     `--accent-text` on a flipped band to the flipped ink, for a reason that is not negotiable:
   *     a flipped band is the OTHER scheme's ground, `--accent-text` is solved against the five
   *     DECLARED surfaces of the current one, and on a flipped band it measures about 1.9:1 in
   *     dark and 2.5:1 in light, under the 3:1 a focus indicator needs. So 0002 opens in red and
   *     0001 and 0003 open in ink, and that is the accessibility rule winning an argument with the
   *     decoration, which is the right result. What would fix it properly is a token for the other
   *     scheme's accent text, and that belongs in `packages/theme` rather than here.
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
   * something is. That reason got stronger on 2026-09-21, when the accent itself became a red.
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
     THE FIRST SCREEN IS A PROMISE AND A PRODUCT, AND NOTHING ELSE IS ALLOWED ON IT.

     It used to carry the promise, a five-row ledger at 1,200px, and four counted figures across the
     column, which is three things competing to be looked at first and two of them made of text. The
     ledger is a list of records, which is literally what he said the page was all of, and the four
     figures are the stats he called silly. Both are gone from here: the ledger is the evidence in
     band 0003, and the figures are gone from the site.

     THERE IS NO SEQUENCE MARK ABOVE THE HEADLINE. Every other band opens with one, and on the hero
     it would be an uppercase eyebrow over an `h1`, which `loop/DIRECTION.md` §1 lists by name as a
     regression. The numbering therefore runs 0001 to 0003 across the three bands after this one,
     which reads as three chapters rather than as a form with a missing first field. -->
<section class="band hero" data-ground="page" aria-labelledby="hero-title">
  <!-- `.in` AND NOTHING ELSE. This carried `hero-say` until the checker read it: the rule of that
       name became `.hero-row` on the inner grid in the same pass, so the class on this element
       styled nothing, in a file whose own rule is that a name nothing renders is deleted. It also
       no longer carries `reveal`, which is right and is worth saying: the hero is on screen when
       the page opens, and a `view()` timeline on something already in view resolves at the end of
       its own range and does nothing. The picture below has an on-load animation instead. -->
  <div class="in">
    <h1 class="display" id="hero-title">{site.hero.title} <span class="hl">{site.hero.titleAccent}</span></h1>

    <div class="hero-row">
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

  <!--
    THE PRODUCT, AT THE WIDTH OF THE SCREEN, RISING OUT OF THE ACCENT.

    This picture was band 0002 and it had 235px of heading above it. Measured at 1440 on the page
    before this one, the 0001/0002 hairline was at y=953.06 and the picture's top edge at y=1188.06,
    so a reader met a rule, a mark, a two-column heading and a paragraph before they saw the product
    at all. It is the first thing under the headline now.

    IT IS PAINTED AT ITS OWN SIZE AND CROPPED AT THE BOTTOM, which is Linear's move: a 1,344px
    product shot that starts inside the first screen and runs off it. The capture is 1440 CSS px
    wide (2880 at a device scale of 2), so at a 1440 viewport this paints exactly one device pixel
    per captured pixel and the caption's claim is literal.

    FOUR SOURCES, AND THE NARROW PAIR IS A DIFFERENT PHOTOGRAPH RATHER THAN THE SAME ONE SMALLER. A
    1440-wide capture painted into 358px is a twelve per cent scale, which puts the app's 14px text
    on the page at under two pixels: a grey texture in the one picture whose whole argument is look
    at this. `scripts/product.mjs` takes the narrow pair at 390 by 844 at a device scale of 3, which
    is what that class of device actually has, so on a phone the type is the size the type is. It is
    also the truthful picture: somebody reading this on a phone is deciding whether to open the app
    on a phone.

    `width` and `height` on every source so the box is reserved before the bytes arrive and nothing
    below it moves while somebody is reading. No `loading="lazy"`: this is above the fold now, and a
    lazy first screen is a first screen that arrives late.
  -->
  <figure class="stage">
    <picture>
      <source
        media="(prefers-color-scheme: dark) and (width < 700px)"
        srcset="/shots/home-phone-dark.webp"
        width="1170"
        height="2532"
      />
      <source media="(width < 700px)" srcset="/shots/home-phone-light.webp" width="1170" height="2532" />
      <source media="(prefers-color-scheme: dark)" srcset="/shots/home-dark.webp" width="2880" height="1800" />
      <img src="/shots/home-light.webp" width="2880" height="1800" alt={site.hero.alt} decoding="async" />
    </picture>
    <figcaption class="caption in">{site.hero.caption}</figcaption>
  </figure>
</section>

<!-- ── 0001 · Arranged for you ──────────────────────────────────────────────
     THE FIRST BAND AFTER THE HERO ANSWERS "WHAT IS THIS WORTH TO ME", which is the order §19 asks
     for and the reverse of the order this page had. It used to be the third band, behind typed rows
     and behind the full-bleed photograph; ahead of it a reader met a sentence about registers.

     The switcher is the argument: pressing a case redraws the rail in front of the reader, so the
     claim is made by the page doing the thing rather than by a sentence about it. It is a strip.
     The control runs the width of the SCREEN between two hairlines, the thing it redraws sits under
     it, and the sentences run the width of the column below that. Nothing is beside anything, so
     there is no short column to leave a hole under.

     THE LEAD IS UNDER THE RAIL AND NOT OVER IT, WHICH IS THE WHOLE OF WHAT CHANGED HERE ON
     2026-09-22. This band holds no photograph and no `<svg>`, so the switcher is its picture, and
     the picture was the fourth thing in the band: counted off the built page, 31 words stood
     between the hairline that opens the band and the first drawn pixel in it, of which 23 were a
     lead introducing a control the reader had not seen. Eight stand there now, and they are the
     band's number, its tag and its heading. The sentence lost nothing: it says *the pages, the
     lists and the words follow*, which is a description of what the rail has just done, and under
     the rail it is read by somebody who has watched it happen. -->
<section class="band" data-ground="flip" aria-labelledby="arrange-title">
  <div class="in reveal">
    <p class="band-mark">
      <span class="band-seq">0001</span>
      <span class="band-rule"></span>
      <span class="band-tag">{site.arrange.tag}</span>
    </p>
    <h2 class="title" id="arrange-title">{site.arrange.title}</h2>
  </div>

  <div class="arrange-strip reveal">
    <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} />
  </div>

  <div class="in">
    <p class="lead lead-wide">{site.arrange.lead}</p>
    <p class="note">{site.arrange.note}</p>
  </div>
</section>

<!-- ── 0002 · Numbers arrive ────────────────────────────────────────────────
     The dashboard runs the full width of the screen and past both edges of it, and the sentence
     sits ON it rather than beside it.

     A CARD LYING ON THE PICTURE IS THE ONE LAYERED THING ON THE PAGE. It is the only place where
     two surfaces overlap. The card is opaque `--s1` inside a `--line` hairline, so nothing behind
     it is read through it and the contrast is the page's own, which is why this costs no new token
     and no new shadow. WHAT IT MAY LIE ON IS THE PICTURE'S TOP STRIP AND NOTHING ELSE: every third
     of this dashboard holds a money figure, so a card parked against either margin hides one, and
     it hid one for two passes. The measurement is in the stylesheet beside the overlap.

     THE CARD LOST ITS SPECIFICATION AND KEPT ITS SHAPE. It held a four-row table of what a report
     key can do beside the heading; that table is now a comment in `copy.ts` and nothing on the
     page. The two columns stay, because a heading alone in a 1,136px strip is the empty-frame
     fault this page was rebuilt to remove: the title takes the left five twelfths and the sentence
     the right six, and the strip reaches both edges of the reading column. -->
<section class="band" data-ground="page" aria-labelledby="report-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0002</span>
      <span class="band-rule"></span>
      <span class="band-tag">{site.report.tag}</span>
    </p>
  </div>
  <div class="report reveal">
    <!-- THE HEADING COMES FIRST IN THE MARKUP AND LAST IN THE PAINT ORDER. A reader with a screen
         reader meets the heading and then the picture, which is the order the section is written
         in; `z-index` alone decides which of the two grid items is on top. -->
    <div class="report-card">
      <h2 class="title" id="report-title">{site.report.title}</h2>
      <p class="lead">{site.report.lead}</p>
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

<!-- ── 0003 · Plain about what it is ────────────────────────────────────────
     EVERY SENTENCE ABOUT MECHANISM ON THIS SITE IS IN THIS ONE BAND, and that is the whole of what
     §19 asked for structurally. Registers, MCP, the ledger and the limits were four bands over
     3,000px, spread from the second screen to the sixth. They are one band at the foot of the page
     now, for the reader who has been convinced and wants to know what they would be buying.

     THE LEDGER IS THE EVIDENCE FOR THE SENTENCE ABOVE IT AND NOT AN ORNAMENT. The lead ends `every
     change carries a name`; the `who` column is You, Codex, a rule and Claude, and three of the
     four arrive while the reader is looking at it. In the hero, where it used to live, it was
     proving a sentence two lines above it that nobody had a reason to doubt yet.

     THE OPENER IS ONE LINE. The heading sits on the mark's own line and the rule runs from the end
     of the words to the tag, so the band starts with three lines of chrome fewer than the two above
     it and no two bands on the page open the same way. -->
<section class="band" data-ground="flip" aria-labelledby="plain-title">
  <div class="in reveal">
    <div class="band-mark band-mark-line">
      <span class="band-seq">0003</span>
      <h2 class="title title-inline" id="plain-title">{site.plain.title}</h2>
      <span class="band-rule"></span>
      <span class="band-tag">{site.plain.tag}</span>
    </div>
    <p class="lead lead-wide">{site.plain.lead}</p>
  </div>

  <!-- THE LEDGER AT THE READING COLUMN AND ITS GUTTERS, which is 1,200px at 1440 and 83 per cent
       of the screen. The rows are five columns of tabular text and the room goes to `what`, which
       is the column that ellipsises first: the one element whose job is to prove nothing is
       overwritten must not be truncating its own sentences. `overflow: hidden` because the rows
       animate in from the right. -->
  <div class="proof reveal">
    <Ledger
      events={site.ledger.events}
      head={site.ledger.head}
      only={site.ledger.only}
      all={site.ledger.all}
    />
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
     A band is the full width of the screen and the column inside it is `.in` (app.css).

     THE AIR CAME DOWN AND IT IS THE ONE PLACE LENGTH WAS TAKEN OUT OF SOMETHING THAT WAS RIGHT.
     `--sp-9` each side is 192px between band bodies, which `research-site-reference.md` measured as
     identical to FirstLook's and three times PostHog's 64px, and concluded was already right. It
     was right for seven bands of argument; this page has five and the first three are pictures. The
     `clamp` runs from 96px between bands on a phone to 176px at 1600 and beyond, which keeps the
     generous end of the range where a wide screen can afford it and saves about 100px over the four
     seams on a phone, where the document was 7,042px and length hurts most. */
  .band {
    padding-block: clamp(var(--sp-8), 5.5vw, 88px);
  }

  /* A HAIRLINE AT EVERY SEAM, which is how PostHog marks a section off: each of the seven stacked
     sections on `/product-analytics` carries a 1px top border and nothing else. THE GROUNDS ARE
     `page, flip, page, flip, brand`: four changes, and THREE of them are inversions rather than all
     four. Sampled off the built page by reading each band's computed background and running the
     WCAG formula over the pair, the three inversions are 15.41:1 in light and 17.61:1 in dark; the
     fourth, `flip` to `brand` at the last seam, is the scheme's ink meeting the accent, which is a
     weaker change and a real one.

     EVERY SEAM ON THIS PAGE NOW INVERTS OR LANDS ON THE BRAND, which the page before it could not
     say: it had two seams marked by the rule alone, one of them 235px above the picture that was
     supposed to be marking it. Merging four bands into one is what bought that. `+` rather than a
     rule on every band, so the first one has no line hanging off the header above it. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .hero {
    padding-block-start: var(--sp-7);
  }

  /* ── Type ─────────────────────────────────────────────────────────────────

     68px AT 1440, AND THE `14ch` CAP IS GONE.

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
     schemes, so this is the one accent role that may carry words. It is a true red now rather than
     the crimson that read pink, which is DIRECTION §19 and is why the glow under the picture is
     worth having at all. */
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

  /* ── The hero ─────────────────────────────────────────────────────────── */

  /* THE SENTENCE AND THE TWO ACTIONS SHARE A ROW, and both halves are text, which is what stops
     this reading as the copy-beside-widget shape the page used three times. `align-items: end`
     sets them on one baseline at the bottom, so the row reads as one line of the page rather than
     as two columns that happen to start together. */
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

  /**
   * THE STAGE, AND THE GLOW IS THE ONE PIECE OF DECORATION ON THE WHOLE SITE.
   *
   * It is there because the picture's top edge is the seam between a page and a product, and a
   * hairline alone makes that seam read as the top of a box. It is painted BEHIND the image and
   * nothing is read through it, so it carries no contrast obligation of its own, and it is the
   * only decoration on the site that is not also a piece of information.
   *
   * IT WAS `--accent-wash` AND `--accent-wash` WAS NOT VISIBLE. The theme's wash is
   * `color-mix(in srgb, var(--accent) 12%, transparent)`, which is solved for a tint BEHIND TEXT
   * and is therefore as quiet as a colour can be while still existing. Over 64px of near-black it
   * came out as nothing at all in the dark capture and as a faint smear in the light one, which is
   * a decoration that costs a rule and pays nothing. 28 per cent is the same mix at the strength
   * this job needs. No colour is spelled out either way, and the mix follows the accent wherever
   * the accent goes: it was a crimson this morning and it is a true red now, and this rule did not
   * have to know.
   *
   * The gradient's stop is at 72 per cent of a 56-per-cent-wide ellipse anchored on the picture's
   * top edge, which puts the strongest part of it directly under the middle of the product and
   * nothing at either margin. A wash that reached the margins would read as a band of its own.
   */
  .stage {
    position: relative;
    margin: var(--sp-8) 0 0;
  }

  .stage::before {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block-start: calc(-1 * var(--sp-8));
    block-size: var(--sp-8);
    background: radial-gradient(
      56% 100% at 50% 100%,
      color-mix(in srgb, var(--accent) 28%, transparent),
      transparent 72%
    );
    pointer-events: none;
  }

  /**
   * THE PICTURE IS PAINTED AT ITS OWN SIZE AND CROPPED AT THE BOTTOM.
   *
   * The capture is 1440 CSS px wide (2880 at a device scale of 2), so at a 1440 viewport this
   * paints exactly one device pixel per captured pixel. Above 1440 the image scales up to keep
   * covering the width, which crops further off the BOTTOM and never off the side, because `cover`
   * matches the wider axis first.
   *
   * `object-position: 0 0` anchors the top-left corner, so the app's own rail is never the thing
   * that gets trimmed. It is the one physical-feeling value on the page and it is deliberate: the
   * photograph is of a left-to-right screen and mirroring it under `dir(rtl)` would show the
   * reader a screenshot of an application that does not exist.
   *
   * 40vw AND NOT 42vw, AND THE CEILING CAME DOWN FROM 640px TO 584px. The picture is on the first
   * screen now rather than on the second, so its job changed: it has to leave the headline and the
   * action above it intact on a 900px viewport and still show enough of the app to be worth
   * looking at.
   *
   * THE CEILING IS NOT THE OPERATIVE TERM AT 1440 AND THIS COMMENT SAID IT WAS. `40vw` is what
   * decides the height at every width this page has ever been driven at: measured on the built page
   * at 1440, the frame is 576px and not 584, and 584 is only reached at a 1,460px viewport and
   * above. So what a reader at 1440 is shown is the top 576 of the 900 CSS px the app was captured
   * at, which ends inside the list of what falls due rather than at the first heading. The ceiling
   * is worth keeping for what it does above 1460, which is stop a very wide window turning the
   * first screen into a photograph.
   */
  .stage img {
    display: block;
    inline-size: 100%;
    block-size: clamp(300px, 40vw, 584px);
    object-fit: cover;
    object-position: 0 0;
    border-block-start: 1px solid var(--line);
  }

  /* ── 0001 · The switcher ──────────────────────────────────────────────── */

  /* THE SENTENCE UNDER THE RAIL NEEDS NO RULE OF ITS OWN, AND IT HAD ONE UNTIL IT WAS CHECKED.
     `.arrange-lead { margin-block-start: var(--sp-5) }` stood here and changed nothing: `.lead`
     above already declares `margin-block: var(--sp-5) 0`, the only override of it on this page is
     `.report-card .lead`, and no media query touches either. So the gap the note used to sit at is
     the gap the lead sits at by default, and band 0003 writes the same paragraph the same way with
     `class="lead lead-wide"` and nothing else. `.lead-wide` rather than the 46ch measure: with
     nothing on its right, a 430px paragraph in a 1,136px row is the empty-frame fault this page was
     rebuilt to remove. The note keeps its base `--sp-4`, the gap between two paragraphs.

     The component is a child of the band and not of `.in`, which is the whole of how its control
     strip reaches both edges of the screen. `Arrange.svelte` puts the buttons back inside `.in`
     itself, so only the rules are full-bleed. */
  .arrange-strip {
    margin-block-start: var(--sp-7);
  }

  /* ── 0002 · The dashboard ─────────────────────────────────────────────── */

  /**
   * THE CARD LIES ON THE PICTURE'S TOP EDGE AND NOWHERE ELSE, AND THE PICTURE DECIDED THAT.
   *
   * It lay across the middle of the dashboard for two passes, first on the left and then on the
   * right, and both of those hide a money figure. Measured on the capture itself
   * (`static/shots/usecase-founder-dashboard-light.webp`, 2,880 x 1,800 for a 1,440px app):
   * the three columns start at x=547, x=1319 and x=2091, which is 19.0, 45.8 and 72.6 per cent of
   * the width, and the label, the figure and the limit under it all start on the same three. A
   * figure occupies every third of the picture, so a 480px card covers one wherever it is put
   * sideways. The right edge was no better than the left: it cut `no more than GBP 50,000.00`,
   * which runs from x=2092 to x=2371, in half.
   *
   * WHAT IS ACTUALLY FREE IS THE TOP. Nothing above `Across your organisations` is a number: the
   * strip holds the breadcrumb, the page title and two controls. Profiled by ink over three
   * column windows centred on those three percentages, the label row runs 333 to 355 and the
   * topmost pixel of any of the three figures is source row 381, in the `Coming in` and
   * `Going out` columns; `GBP 24,800.00` starts at 385.
   *
   * SO THE LAYER SURVIVES AND THE HAZARD DOES NOT. This is still the one place on the page where
   * two surfaces overlap. It overlaps by an amount that is measured against the picture rather
   * than chosen against the composition, which means a new capture is checked by looking at where
   * its first number is, not by looking at whether the page still seems fine.
   *
   * AND THE CARD IS SHORTER THAN IT WAS, WHICH MAKES THE OVERLAP SAFER RATHER THAN RISKIER. The
   * four-row report-key specification came off it. A shorter card sits higher against the same
   * picture, so more of the clear strip is left under it, and nothing about the arithmetic below
   * had to move.
   */
  .report {
    display: grid;
    gap: 0;
  }

  /* THE STRIP IS THE READING COLUMN, so the card starts where every heading on the page starts and
     ends where they end, rather than being a block of an invented width parked against one margin.
     Two columns because a heading alone across 1,136px is the empty-frame fault: the title takes
     five twelfths and the sentence six, and the pair reaches the far edge. */
  .report-card {
    position: relative;
    z-index: var(--z-raise);
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: var(--sp-6) var(--sp-7);
    align-items: center;
    inline-size: min(100% - 2 * var(--sp-6), var(--site-max));
    /**
     * THE OVERLAP IS A SOURCE ROW NOW, AND IT WAS A LENGTH THAT LANDED THROUGH A HEADING.
     *
     * It was `clamp(40px, 5vw, 88px)`, which is -72px at 1440. A rendered pixel is viewport/2556
     * of a source pixel, so 72px at 1440 is source row 127.8, and source row 127.8 is inside the
     * capture's page title: the card's bottom edge cut the word `Dashboard` in half, in both
     * schemes, and it is visible in the review screenshots of 21 September.
     *
     * WHAT THE PICTURE ACTUALLY OFFERS, profiled on both captures at 1:1 over the columns this
     * card covers (source x 213 to 2343, ink being a pixel more than 25 luma steps from the median
     * of its own row, which is `test/crop.test.ts`'s own definition, and a row counted clear at
     * four deviating pixels or fewer so the navigation rail's vertical edge does not read as ink
     * at every height):
     *
     *   rows   0..56    clear, the chrome above the breadcrumb
     *   rows  57..94    the breadcrumb
     *   rows  95..118   clear
     *   rows 119..148   THE PAGE TITLE, which is what the old overlap was landing in
     *   rows 149..255   CLEAR, 107 rows, the widest run anywhere in the top strip
     *   rows 256..280   `Across your organisations`
     *   rows 333..355   the three column labels
     *   rows 381..      the three money figures
     *
     * So the edge belongs at source row 202, the middle of the 107-row run, with 53 clear rows
     * above it and 53 below. Both captures profile identically to within one row.
     *
     * AND IT IS WRITTEN AS THE RATIO RATHER THAN AS A LENGTH, which is what makes it hold at every
     * width. A percentage margin resolves against the containing block's INLINE size, and this
     * card's containing block is the band, which is the same width the picture's own
     * `inline-size: calc(100% * 2880 / 2556)` is a percentage of. So the rendered overlap is
     * bandWidth * 202/2556 and the source row it reaches is that times 2556/bandWidth, which is
     * 202 with the width cancelled out. The clamp had to go for the same reason its floor and
     * ceiling existed at all: they were compensating for a picture that used to be painted at a
     * fixed 1,760px, and nothing has been fixed-width here since that was corrected. Below 900px
     * the narrow treatment sets this to 0 and stacks the two, because there is no picture behind
     * the card there.
     */
    margin-block-end: calc(-100% * 202 / 2556);
    margin-inline: auto;
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .report-card .lead {
    margin-block-start: 0;
    max-inline-size: 46ch;
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
   * BOTH EDGES OF THIS FRAME ARE A RECTANGLE OF THE CAPTURE, AND THE CAPTURE CHOSE THE RECTANGLE.
   *
   * THE FRAME WAS CUTTING A MONEY FIGURE, WHICH IS THE ONE HARM THE CARD ABOVE WAS MOVED TO STOP.
   * The picture used to be painted at a fixed `1760px` with a `clamp` for its height, so the
   * viewport decided where both edges landed. Driven over `apps/site/build` at a device scale of
   * 1, motion reduced, in both schemes, the right edge landed at source column 2356 at 1440,
   * 2095 at 1280, 1676 at 1024 and 1473 at 900, and the bottom edge at source row 1035, 920, 736
   * and 686. Counting ink as a pixel more than 25 luminance steps from the median of its own row,
   * over both captures and over every pixel the frame shows: column 2356 carries 3, column 2095
   * carries 27, column 1473 carries 14, and all four rows carry 79, 27, 50 and 71. Column 2356
   * at 1440 lands inside the final `0` of `no more than GBP 50,000.00`, and rows 736 and 686 land
   * inside the words `Ledger` and `Overview` in the navigation rail.
   *
   * SO NEITHER EDGE IS A LENGTH ANY MORE AND NEITHER HAS THE VIEWPORT IN IT.
   * `inline-size: calc(100% * 2880 / 2556)` paints the capture so the figure's own right edge
   * falls on source column 2556, because the figure is the width of the screen and the image is
   * 2880/2556 of it: the width cancels. `aspect-ratio: 2880 / 1214` then makes the box short
   * enough that `object-fit: cover`, whose scale is set by the width, crops the bottom at source
   * row 1250, or three rows above it once the 1px top rule inside this border box is taken off,
   * which is why the guard holds the four rows ending at the declared one rather than that one
   * alone. The figures in the sentence before this one were driven at 1440, 1280, 1024, 999 and
   * 900 in both schemes against the 1214 cut: the right edge landed on 2556.0 every time and the
   * bottom within a pixel of 1211.
   *
   * 2556 AND 1250 ARE INSIDE CLEAR RUNS IN THE PICTURE. Columns 2535 to 2577 carry no ink over the
   * rows this frame shows, which is 43 columns wide. A panel edge that runs the whole height and a
   * rule that runs the whole width are not ink for this purpose, because a crop that lands on a
   * rule reads as a rule.
   *
   * THE ROW MOVED FROM 1214 TO 1250 BECAUSE THE PICTURE GAINED THREE BARS. The capture was taken
   * against a build whose "Balance by organisation" drew its empty line on a record whose three
   * organisations each hold an account, which was a defect in the record app (`page-live.ts`, the
   * linked map keyed by the ULID after `entryOf` began answering the sequence). With the bars back,
   * everything under them sits about 110 source rows lower and the old cut fell inside a glyph, on
   * 70 columns of the dark capture. Re-profiled over rows 1150 to 1400, counting ink the way
   * `test/crop.test.ts` counts it, the rows clear in BOTH schemes are 1177 to 1185, 1245 to 1257,
   * 1280 to 1281, 1307 to 1341 and 1366 to 1400. 1250 sits in the middle of the nearest run to the
   * old cut, which keeps the band the height it was designed at rather than moving the composition
   * to suit an image.
   *
   * THIS IS WHY THIS BAND IS STILL THE TALLEST ON THE PAGE AND WHY IT WAS NOT TRIMMED FOR LENGTH.
   * Every number above was profiled against the pixels of one capture. A shorter frame is a
   * different rectangle of a different picture and would have to be profiled again, and guessing
   * at it is how the crop came to land inside a glyph in the first place.
   *
   * A top rule and no side rules, because there is no side for one to be on.
   */
  .report-shot img {
    display: block;
    inline-size: calc(100% * 2880 / 2556);
    max-inline-size: none;
    block-size: auto;
    aspect-ratio: 2880 / 1250;
    object-fit: cover;
    object-position: 0 0;
    border-block-start: 1px solid var(--line);
  }

  .report-shot .caption {
    margin-block-start: var(--sp-3);
  }

  /* ── 0003 · Plain about what it is ────────────────────────────────────── */

  /* THE ONE-LINE OPENER. A `div` and not a `p`, because it carries the band's `h2`: the rest of
     the page's marks are a paragraph of three spans and cannot be, and a heading inside a
     paragraph is markup a validator refuses whatever it looks like. The baseline is the shared
     one, with the rule centred against it, so the number, the words and the tag sit on one line
     and the rule runs between them. */
  .band-mark-line {
    align-items: baseline;
    gap: var(--sp-4);
    margin-block-end: var(--sp-4);
  }

  .band-mark-line .band-rule {
    align-self: center;
  }

  /* The measure comes off, because the heading is not setting a column here: it is one item in a
     row that ends at the far edge. */
  .title-inline {
    max-inline-size: none;
  }

  /* THE LEDGER'S STAGE IS THE SCREEN AND THE LEDGER INSIDE IT IS THE READING COLUMN. The padding
     is `max(--sp-6, (100% - --site-max) / 2)`, so at 1440 it puts 120px on each side and the
     ledger measures x=120, w=1200, which is the reading column plus its two gutters and 83 per
     cent of the screen. At 1,200px the room goes to `what`, which is the column that was
     ellipsising first when this component lived in a 540px box. */
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

  /* ── The two things that move ─────────────────────────────────────────────

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

    /**
     * AND THE PRODUCT ARRIVES ON LOAD, WHICH IS THE ONE THING ON THIS SITE THAT IS NOT A SCROLL
     * TIMELINE, because the element it is on is already in view when the page opens.
     *
     * `view()` resolves against where the element sits in the scrollport, so a `view()` animation
     * on something that starts on screen resolves near the end of its own range and does nothing
     * visible. The hero picture is the first thing under the headline and it has to have a moment,
     * because "an exciting tool to use" is a judgement a reader makes in the first second and a
     * page where nothing has happened yet has not made its case.
     *
     * It is a rise and a fade over 640ms with a 120ms wait, not a scale: a scale on a photograph of
     * type resamples every glyph in it while it runs, and the whole argument of this picture is
     * that the type in it is the size the type is. The delay is short enough that the picture is
     * moving before a reader has finished the headline and long enough that it is a second event
     * rather than the same one.
     *
     * UNDER THE OTHER BRANCH THERE IS NO ANIMATION AT ALL, which matters beyond the preference:
     * `scripts/shot.mjs` photographs with `reducedMotion: 'reduce'`, so what he is sent is the page
     * at rest rather than the page mid-entrance.
     */
    .stage {
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
    .hero-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-7);
    }

    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE CARD COMES OFF THE PICTURE AND THE PICTURE STOPS RUNNING OFF THE EDGE. Below 900px a 480px
     card laid on the screen would cover most of it, and the wide capture is past the point of
     being worth looking at: the frame is 427px tall at 900 and the capture is painted at 0.352 of
     its source pixels there, which is 70 per cent of the size the application itself drew at,
     because the source is a 2x shot. The two go back to being stacked, and the narrow capture is
     the dashboard as a phone draws it, at the column's own width, with every figure on it
     readable. */
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
      gap: var(--sp-4);
      align-items: start;
      inline-size: 100%;
      /* NO OVERLAP UNDER 900px, because the narrow treatment swaps the wide capture for a phone
         one and lays the two out in a column. There is no picture behind the card to lie on. */
      margin-block-end: 0;
      margin-inline-start: 0;
      padding: 0;
      background: none;
      border: 0;
    }

    /* `aspect-ratio: auto` UNDOES THE CROP, which is the half that is easy to forget, and it is
       the keyword that carries it now rather than `block-size`. The wide treatment is a landscape
       rectangle of a 2,880 by 1,800 capture; left in place it would squeeze a 1,170 by 2,532
       phone capture into a 2880/1214 box and `object-fit: fill` would stretch it to match. The
       narrow captures are a whole phone screen and they keep their own shape. */
    .report-shot img {
      inline-size: 100%;
      max-inline-size: 420px;
      block-size: auto;
      aspect-ratio: auto;
      object-fit: fill;
      border: 1px solid var(--line);
      border-radius: var(--r-lg);
    }

    .report-shot .caption {
      padding-inline: 0;
    }
  }

  /* THE NARROW PAIR OF CAPTURES IS A WHOLE PHONE SCREEN, so the frame has to be tall enough to be
     worth looking at. 40vw is 156px at 390 and the floor does all the work there, which would show
     the top third of an 844px screen. 460px is a little over half of it, ending inside the list of
     what falls due this week rather than immediately under the heading.

     700 AND NOT 640, because this number belongs to the `<picture>` above rather than to the
     grid: the narrow captures are selected at `(width < 700px)` in the markup, and a frame height
     that disagreed with the source that fills it would crop the wrong photograph for sixty
     pixels. The blocks in this section descend, so a wider one never wins a tie on source order
     against a narrower one. */
  @media (width < 700px) {
    .stage img {
      block-size: 460px;
    }
  }

  @media (width < 640px) {
    .col {
      padding: var(--sp-4);
    }

    .report {
      padding-inline: var(--sp-4);
    }
  }
</style>
