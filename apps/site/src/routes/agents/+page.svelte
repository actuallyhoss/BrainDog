<!--
  For agents and services.

  THE PAGE THE HOME PAGE'S TECHNICAL MATERIAL MOVED TO. `loop/DIRECTION.md` §19 is the owner's own
  instruction: the counted figures and the tool grid come off the home page, and what is worth
  keeping goes on a page a curious reader reaches on purpose. For one hour on 21 September there was
  no such page and the material sat in `copy.ts` comments, drawn nowhere.

  IT COUNTS THINGS, AND THAT IS THE POINT OF IT. The rule that a figure must not be counted at a
  stranger is a rule about a stranger: somebody who arrived at a headline and is being shown a
  number they did not ask for. A reader who opens a page called For agents has asked. Every figure
  here is read off a declaration and the file it came from is in the comment beside its copy.

  NO SCREENSHOTS, AND ONE DRAWING. The other pages carry the product's own screens because a screen
  is the argument there, and a screenshot of a terminal here would be a decoration standing where
  the reader wants a specification. What this page had instead was two lists of identifiers under
  two uppercase headings, which is the counted-stat texture §19 named: sixteen names with nothing
  saying how they relate. `loop/research-site-now.md` change 5 asked for the relation to be drawn,
  so the first band is a diagram of a client reaching the record, the writes arriving as named events on
  one side and the reads leaving on the other, built from the same strings and nothing new.

  FOUR BANDS ON `page, flip, page, page`, AND THEY WERE `page, sunk, page, sunk`. `--sunk` against
  `--bg` is 1.07:1, which the eye adapts to rather than reads, so the alternation was four bands
  that looked like one. One band turns over now, the one carrying the drawing. The last seam is the
  hairline alone and that is a knowing cost: the two bands after the drawing are two different
  subjects, a key and a refusal, and folding them into one to buy an inversion would put two layouts
  in one band, which is the other half of the rule. No two bands open the same way, and
  `bands.test.ts` beside this file holds both.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { SOURCE, site } from '$lib/copy.ts';

  const a = site.agents;
</script>

<svelte:head>
  <title>{site.meta.agents.title}</title>
  <meta name="description" content={site.meta.agents.description} />
  <link rel="canonical" href="https://brain.dog/agents" />
  <meta property="og:url" content="https://brain.dog/agents" />
  <meta property="og:title" content={site.meta.agents.title} />
  <meta property="og:description" content={site.meta.agents.description} />
</svelte:head>

<!-- NO MARK OVER THE HEADLINE, for the home page's reason: an uppercase eyebrow over an `h1` is a
     regression `DIRECTION.md` §1 lists by name. The page's own name is in the nav a reader just
     pressed. So the numbering starts at the drawing, and the tag this band used to wear is gone
     from the page rather than moved. -->
<section class="band head" data-ground="page">
  <div class="in head-row">
    <h1 class="display">{a.title}</h1>
    <p class="lead">{a.lead}</p>
  </div>
</section>

<!-- ── Over MCP ────────────────────────────────────────────────────────────────
     THE DRAWING IS ONE `<figure>` AND THE LISTS INSIDE IT ARE STILL LISTS. A reader who is not
     looking at it meets the same three headed lists it replaced, in the order they are drawn; the
     wires, the bus and the arrowheads are borders on elements that are otherwise empty, so none of
     them is read out and none of them is a colour spelled in this file. -->
<section class="band" data-ground="flip" aria-labelledby="mcp-title">
  <div class="in">
    <div class="band-mark band-mark-line">
      <h2 class="title" id="mcp-title">{a.mcp.title}</h2>
      <span class="band-rule"></span>
      <span class="band-tag">{a.mcp.tag}</span>
    </div>
    <p class="lead">{a.mcp.lead}</p>

    <figure class="reach" aria-labelledby="mcp-title">
      <div class="lane lane-write">
        <h3 class="lane-head">{a.mcp.writesTitle}<Icon name="arrow" size="s" /></h3>
        <ol class="events">
          {#each a.mcp.writes as name (name)}
            <li class="event">
              <span class="ev"><span class="ev-dot" aria-hidden="true"></span><span class="mono">{name}</span></span>
              <span class="wire" aria-hidden="true"></span>
            </li>
          {/each}
        </ol>
      </div>

      <span class="link" aria-hidden="true"></span>

      <!-- THE RECORD IS THE MARK AND NO WORD. It carried the ledger's heading, `History, only ever
           added`, for the length of one typecheck: `site.ledger` left `copy.ts` in the same hour for
           the home page's `decide` scene, and a drawing that borrows another band's words breaks
           when that band is rewritten. A word of its own would be a new key, and new keys are the
           copy deck's to add. Decorative, because the lanes' headings already say what goes in and
           what comes out. -->
      <div class="core">
        <Mark height={44} />
      </div>

      <span class="link" aria-hidden="true"></span>

      <div class="lane lane-read">
        <h3 class="lane-head">{a.mcp.readsTitle}<Icon name="arrow" size="s" /></h3>
        <ul class="taps">
          {#each a.mcp.reads as name (name)}
            <li class="tap"><span class="wire" aria-hidden="true"></span><span class="mono">{name}</span></li>
          {/each}
        </ul>
      </div>

      <!-- THE ADDRESSES HANG OFF THE RECORD, NOT OFF EITHER LANE. They are read directly, without a
           tool call, so the stem runs down from the record itself to the strip that holds them. -->
      <span class="stem" aria-hidden="true"></span>

      <div class="addresses">
        <h3 class="lane-head">{a.mcp.resourcesTitle}</h3>
        <dl class="addr hair">
          {#each a.mcp.resources as one (one.uri)}
            <div class="addr-cell">
              <dt class="mono">{one.uri}</dt>
              <dd>{one.said}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </figure>
  </div>
</section>

<!-- ── Reported ────────────────────────────────────────────────────────────────
     THE ARGUMENT ON THE LEFT AND THE SIX LIMITS AS A GRID ON THE RIGHT. They were a two-column
     definition list under the lead, the same shape as the band after it, so the page had one layout
     twice in a row. Six limits of one or two words each are what a hairline grid is for: each cell
     leads with the limit and the sentence under it is the reason. -->
<section class="band" data-ground="page" aria-labelledby="report-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-tag">{a.report.tag}</span>
      <span class="band-rule"></span>
    </p>
    <div class="split">
      <div>
        <h2 class="title" id="report-title">{a.report.title}</h2>
        <p class="lead">{a.report.lead}</p>
      </div>
      <dl class="limits hair">
        {#each a.report.limits as limit (limit.what)}
          <div class="limit">
            <dt>{limit.what}</dt>
            <dd>{limit.said}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </div>
</section>

<!-- ── Refused ────────────────────────────────────────────────────────────────
     THE MARK STANDS IN A RAIL OF ITS OWN, the third opener on this page and the one the previous
     two cannot be: the tag alone in a narrow left column, and the heading, the
     lead and the refusals sharing one left edge beside it. -->
<section class="band" data-ground="page" aria-labelledby="cannot-title">
  <div class="in side">
    <p class="band-mark band-mark-side">
      <span class="band-tag">{a.cannot.tag}</span>
    </p>
    <div>
      <h2 class="title" id="cannot-title">{a.cannot.title}</h2>
      <p class="lead">{a.cannot.lead}</p>
      <dl class="rows">
        {#each a.cannot.rows as one (one.what)}
          <div class="row">
            <dt>{one.what}</dt>
            <dd>{one.said}</dd>
          </div>
        {/each}
      </dl>
      {#if SOURCE}
        <p class="source"><a href={SOURCE}>{site.nav.source}</a></p>
      {/if}
    </div>
  </div>
</section>

<style>
  .band {
    padding-block: var(--sp-8);
  }

  /* The seam the other pages draw, for the reason the pricing page records: `--sunk` against `--bg`
     is 1.07:1, which the eye adapts to rather than reads as an edge. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  /* THE HEADLINE HAD NO SIZE AND THE NAMES HAD NO FACE. `.display` and `.mono` were written on
     this page's markup and defined nowhere the page could see: `+page.svelte` scopes its own
     `.display`, `app.css` has no `.mono`, so the `h1` fell back to the browser's 2em and the
     sixteen identifiers were set in the proportional face. Both are declared here, at the pricing
     page's values. */
  .display {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 4vw, 3.5rem);
    font-weight: 600;
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  .mono {
    font-family: var(--font-id);
  }

  /* THE TITLE AND WHAT THE PAGE IS FOR ON ONE ROW, so the first screen reaches both edges of the
     column instead of stacking a headline over a paragraph in its left half. */
  .head-row {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: end;
  }

  .head-row .lead {
    margin: 0;
  }

  .lead {
    max-inline-size: 62ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .title {
    margin: 0;
    font-size: var(--t-xl);
    letter-spacing: var(--tr-tight);
  }

  /* THE ONE-LINE OPENER, the home page's mechanism band treatment and the pricing page's table band: the
     heading takes the mark's baseline and the rule runs from the end of its words to the tag.
     `flex-wrap` and a floor under the rule, because this heading is forty-one characters of 24px and
     does not fit beside the tag on a phone; the rule takes the tag to a second line rather than
     shrinking to nothing. */
  .band-mark-line {
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2) var(--sp-4);
  }

  .band-mark-line .band-rule {
    align-self: center;
    min-inline-size: var(--sp-7);
  }

  /* ── The drawing ─────────────────────────────────────────────────────── */

  /* FIVE COLUMNS: what arrives, a link, the record, a link, what leaves. The links are their own
     tracks rather than margins on the record so the wire between a lane's bus and the record is an
     element with a length, which is what lets it be drawn at all without an SVG and a coordinate
     system that would have to be kept in step with the text. The addresses span all five under a
     stem from the record. */
  .reach {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--sp-7) auto var(--sp-7) minmax(0, 1fr);
    align-items: center;
    margin: var(--sp-7) 0 0;
  }

  .lane-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-4);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* THE BUS. Every wire in a lane ends on one vertical stroke on the side facing the record, and
     the link carries that stroke into it: six arrivals become one input, and ten reads fan out
     from one output. `--edge` and not `--line`, because on the flipped ground `--line` is a 22 per
     cent mix meant for a seam, and a wire is the thing being looked at. */
  .events,
  .taps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .events {
    border-inline-end: 1px solid var(--edge);
  }

  .taps {
    border-inline-start: 1px solid var(--edge);
  }

  .event,
  .tap {
    display: flex;
    align-items: center;
  }

  .wire {
    position: relative;
    flex: 1;
    min-inline-size: var(--sp-6);
    block-size: 1px;
    background: var(--edge);
  }

  /* THE ARROWHEAD, two borders of a small square turned 45 degrees, at the end of the wire that
     points the way the event is going: into the bus on the left, out to the name on the right. */
  .wire::after {
    content: '';
    position: absolute;
    inset-inline-end: 0;
    inset-block-start: -3px;
    inline-size: 7px;
    block-size: 7px;
    border-block-start: 1px solid var(--edge);
    border-inline-end: 1px solid var(--edge);
    transform: rotate(45deg);
    transform-origin: 60% 40%;
  }

  .tap .wire {
    flex: 0 0 var(--sp-7);
    margin-inline-end: var(--sp-3);
  }

  .tap .mono {
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A NAMED EVENT IS A SMALL RAISED CARD, the one thing in the drawing with a surface, because an
     arrival is a thing and a read is a passage. The dot is the history's own bullet. */
  .ev {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .ev-dot {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--ink2);
    border-radius: var(--r-pill);
  }

  .event .wire {
    margin-inline-start: var(--sp-3);
  }

  /* The heading starts where the names do, past the wire and its gap. */
  .lane-read .lane-head {
    padding-inline-start: calc(var(--sp-7) + var(--sp-3));
  }

  /* The link rides at the height of the lists and not of the lane, which carries a heading. */
  .link {
    align-self: center;
    block-size: 1px;
    margin-block-start: calc(var(--t-xs) + var(--sp-4));
    background: var(--edge);
  }

  /* THE RECORD STANDS THE HEIGHT OF THE TALLER LANE. Centred in the row it was a box floating
     between the ten reads, and the stem under it hung from nothing: the first screenshot at 1440
     showed about 80px of empty ground between the box's bottom edge and the top of the stem. Stretched,
     its bottom edge is the row's, and the stem leaves from it. */
  .core {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    margin-block-start: calc(var(--t-xs) + var(--sp-4));
    padding: var(--sp-6) var(--sp-7);
    background: var(--sunk);
    border: 1px solid var(--edge);
    border-radius: var(--r-lg);
    text-align: center;
  }

  .stem {
    grid-column: 3;
    justify-self: center;
    inline-size: 1px;
    block-size: var(--sp-7);
    background: var(--edge);
  }

  .addresses {
    grid-column: 1 / -1;
  }

  .addr {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin: 0;
  }

  .addr-cell {
    padding: var(--sp-4);
  }

  .addr-cell dt {
    color: var(--ink);
    font-size: var(--t-xs);
    overflow-wrap: anywhere;
  }

  .addr-cell dd {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  /* ── Reported ────────────────────────────────────────────────────────── */

  .split {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--sp-8);
    align-items: start;
  }

  .limits {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 0;
  }

  .limit {
    padding: var(--sp-5);
  }

  .limit dt {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .limit dd {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  /* ── Refused ────────────────────────────────────────────────────────── */

  .side {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-6);
  }

  /* THE MARK STANDING UP. No rule, because the column it would run across is the rail itself; the
     number and the tag stack and the rail's width is what separates them from the argument. */
  .band-mark-side {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
    margin: 0;
    padding-block-start: var(--sp-2);
  }

  .rows {
    margin: var(--sp-5) 0 0;
    border-block-start: 1px solid var(--line);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 20ch) minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .row dt {
    font-weight: 600;
  }

  .row dd {
    margin: 0;
    color: var(--ink2);
  }

  .source {
    margin-block-start: var(--sp-6);
  }

  /* ── The arrivals move, once, as they scroll in ─────────────────────────
     The home page's scroll timeline and its two guards, for its reasons: `prefers-reduced-motion`
     is the reader's answer, `@supports` is the browser's, and where either says no the drawing is
     simply finished. Each card has a timeline of its own, so the six arrive one after another
     without a delay being written anywhere. */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .event {
        animation: arrive auto both;
        animation-timeline: view();
        animation-range: entry 10% cover 30%;
      }
    }
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateX(calc(-1 * var(--sp-6)));
    }
  }

  @media (width < 1024px) {
    .addr {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* BELOW 900 THE DRAWING STANDS UP. Five columns in a tablet's width leaves each lane about 200px,
     so the lanes stack over the record, the links turn vertical, and the wires and buses go,
     because a horizontal wire that ends on a stroke nobody can see the far end of is a line
     rather than a connection. What is left is the order of the drawing, top to bottom. */
  @media (width < 900px) {
    .head-row,
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }

    .reach {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
    }

    .lane,
    .addresses {
      justify-self: stretch;
    }

    .lane-head,
    .lane-read .lane-head {
      justify-content: center;
      padding-inline-start: 0;
    }

    .events,
    .taps {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--sp-2) var(--sp-4);
      border: 0;
    }

    .wire {
      display: none;
    }

    .link,
    .stem {
      grid-column: auto;
      inline-size: 1px;
      block-size: var(--sp-6);
      margin-block: var(--sp-3);
    }

    .core {
      align-self: auto;
      margin-block-start: 0;
    }
  }

  @media (width < 760px) {
    .side {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-3);
    }

    .band-mark-side {
      flex-direction: row;
      gap: var(--sp-3);
    }

    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-2);
    }
  }

  @media (width < 640px) {
    .addr,
    .limits {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
