<!--
  Pricing.

  TWO PLANS AND STILL NO TABLE OF TICKS. A feature matrix exists to make the cheaper column look
  incomplete, and there is nothing to make incomplete here: the self-hosted build is the same
  software with the same features. What is being sold is somebody else running it.

  THERE IS A TABLE NOW AND IT IS NOT THAT TABLE. `loop/research-site-reference.md` measured this
  page's problem as the home page's: one flat ground, one layout, and ink that stops well short of
  the column. The answer is not ticks, it is the six things that actually differ when you choose
  who runs it, four of which answer the SAME for both plans. A matrix says "look what you do not
  get"; this says "look how little of it is about the software", which is the honest pitch for a
  product whose whole argument is that the two builds are one build.

  The paragraph about there being no free hosted tier stays on the page. A price nobody explains
  reads as a price somebody is embarrassed by, and the reason is a good one.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { APP, BUILD, site } from '$lib/copy.ts';

  const p = site.pricing;
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<section class="band head" data-ground="page">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0001</span>
      <span class="band-rule"></span>
      <span class="band-tag">Pricing</span>
    </p>
    <div class="head-row">
      <h1 class="display">{p.title}</h1>
      <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can
           be accepted today. Saying so once, before the plans, is what lets the plans describe
           themselves in the present tense without the page lying. -->
      <div class="status">
        <h2 class="status-title"><span class="dot" aria-hidden="true"></span>{p.statusTitle}</h2>
        <p class="status-body">{p.status}</p>
      </div>
    </div>
  </div>
</section>

<section class="band plans-band" data-ground="sunk">
  <div class="in plans">
    {#each [p.self, p.hosted] as plan, i (plan.name)}
      <article class="plan" data-featured={i === 1 ? '' : undefined}>
        <h2 class="plan-name">{plan.name}</h2>
        <p class="plan-price">
          <span class="plan-figure num">{plan.price}</span>
          <span class="plan-unit">{plan.unit}</span>
        </p>
        <p class="plan-body">{plan.body}</p>
        <ul class="plan-points">
          {#each plan.points as point (point)}
            <li><span class="tick"><Icon name="check" size="s" /></span>{point}</li>
          {/each}
        </ul>
        <!--
          THE SELF-HOSTED PLAN HAS NO ACTION WHILE THE REPOSITORY IS PRIVATE: its action sent you to
          build instructions nobody can read. An absent control and not a disabled one, because a
          greyed button under a price is a product telling you it does not want your business. The
          sentence above the plans already says neither plan is open yet.
        -->
        {#if i === 1}
          <a class="btn btn-primary btn-lg" href={APP}>{plan.cta}<Icon name="arrow" size="s" /></a>
        {:else if BUILD}
          <a class="btn btn-lg" href={BUILD}>{plan.cta}</a>
        {/if}
      </article>
    {/each}
  </div>
</section>

<section class="band" data-ground="page" aria-labelledby="compare-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0002</span>
      <span class="band-rule"></span>
      <span class="band-tag">Side by side</span>
    </p>
    <h2 class="title" id="compare-title">{p.compareTitle}</h2>

    <!--
      A GRID AND NOT A `<table>` ELEMENT, with `role` put back on by hand, which is the treatment
      PostHog's own `OSTable` uses (`src/components/OSTable/index.tsx`: an `inline-grid` with
      `divide-x divide-y`). The reason to prefer it here is the narrow layout: a real table cannot
      restack into two-line rows on a phone without a second copy of its markup, and a grid can,
      because the rows are `display: contents` at the desk and blocks below 760px.

      The roles are spelled out so a screen reader still meets a table: every browser drops the
      implicit table semantics the moment `display` is not `table`, which is the one real cost of
      this technique and the one thing that must not be left to chance.
    -->
    <div class="compare hair" role="table" aria-labelledby="compare-title">
      <div class="crow chead" role="row">
        {#each p.compare.columns as column, i (column)}
          <div class="cell chead-cell" role="columnheader">
            {#if i === 0}<span class="sr">Property</span>{:else}{column}{/if}
          </div>
        {/each}
      </div>
      {#each p.compare.rows as row (row[0])}
        <div class="crow" role="row">
          <!-- NOT KEYED, and it cannot be: the first row answers "The same build" in both
               columns, so the obvious key is a duplicate and Svelte refuses one. The list is
               static and never reorders, so there is nothing for a key to buy here. -->
          {#each row as cell, i}
            <div class="cell" class:cell-term={i === 0} role={i === 0 ? 'rowheader' : 'cell'}>
              {#if i > 0}<span class="cell-of" aria-hidden="true">{p.compare.columns[i]}</span>{/if}
              {cell}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- THE LAST BAND WAS A 16px HEADING AND TWO LINES IN THE LEFT HALF OF A 1,136px COLUMN, which is
     the emptiness fault the home page was rebuilt to remove, on the page that asks for money. It
     opens with the same mark every other band on this site opens with, the question is a heading at
     the size of a heading, and the answer sits beside it so the row reaches both edges. -->
<section class="band" data-ground="sunk" aria-labelledby="honest-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0003</span>
      <span class="band-rule"></span>
      <span class="band-tag">{p.honestTag}</span>
    </p>
    <!-- THE CAP GOES ON THE PARAGRAPH AND NOT ON `.in`. `.in` is `margin-inline: auto`, so
         narrowing the element that carries it centred the whole block in the page: the one section
         on the pricing page that is an aside was the only one not sharing the left edge with
         everything above it. -->
    <div class="honest-row">
      <h2 class="honest-title" id="honest-title">{p.honestTitle}</h2>
      <p class="honest-body">{p.honest}</p>
    </div>
  </div>
</section>

<style>
  .band {
    padding-block: var(--sp-8);
  }

  /* The same seam the home page draws, and for the same measured reason: `--sunk` against `--bg`
     is 1.07:1, which the eye adapts to rather than reads as an edge, and PostHog marks off every
     one of its sections with a 1px top border and 32px of padding either side. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  /* THE TITLE AND THE STATE OF THE PRODUCT ON ONE ROW. They were stacked, which left the right
     half of a 1,440 viewport empty for the whole of the first screen, and the status line, which
     is the most important sentence on the page, sat below the fold's centre of gravity. */
  .head-row {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    align-items: end;
  }

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

  .title {
    margin: 0;
    font-size: var(--t-xl);
    letter-spacing: var(--tr-tight);
  }

  /* A fact about the state of the product, not an alarm: a line of text with one dot of state. */
  .status {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .status-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .dot {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--warn);
    border-radius: var(--r-pill);
  }

  .status-body {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* THE SAME HEIGHT, SIDE BY SIDE. `align-items: start` kept the free plan short because it has no
     action under it while the repository is private, and two cards ending 50px apart read as a
     layout that did not finish. The space under the free plan's list is quieter than a ragged
     edge, and on a phone, where they stack, height does not apply. */
  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: var(--sp-4);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-6);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* THE HOSTED PLAN TAKES A FIRMER EDGE AND THE ACCENT GROUND, and nothing else: no glow, no
     ribbon, no "most popular", no scale transform. `tokens.css` names exactly two callers for
     `--accent-ground`, and this is the second of them; the first, brain.dog's closing band, moved
     to the full accent when the measurement found the tint reading at 1.04:1 against the page.
     Here it is not doing that job: it sits on `--sunk` rather than on `--bg`, so the mix is a step
     away from its surround rather than a step away from nothing. */
  .plan[data-featured] {
    background: var(--accent-ground);
    border-color: var(--accent-edge);
  }

  .plan-name {
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-figure {
    color: var(--ink);
    font-size: clamp(2.5rem, 2vw + 1.75rem, 3.25rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .plan-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-body {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .plan-points {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    list-style: none;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .plan-points li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    line-height: 1.45;
  }

  /* One line-box tall, so the tick centres on the first line of a point that wraps. */
  .tick {
    display: flex;
    align-items: center;
    block-size: 1.45em;
    color: var(--dim);
  }

  .plan .btn {
    align-self: flex-start;
    margin-block-start: var(--sp-3);
  }

  /* ── The comparison ───────────────────────────────────────────────────── */

  .compare {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr);
    margin-block-start: var(--sp-6);
  }

  /* `display: contents` so the twenty-one cells are the grid's children and the hairline gap can
     draw between all of them, while the row element keeps carrying `role="row"` for a reader who
     is walking the table rather than looking at it. */
  .crow {
    display: contents;
  }

  .cell {
    padding: var(--sp-4);
    background: var(--bg);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .chead-cell {
    background: var(--s1);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .cell-term {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /* THE COLUMN'S NAME, CARRIED INTO THE CELL, and invisible until the table stacks. Below 760px
     the header row is gone and a bare "Nightly, thirty kept" belongs to nobody, so each cell says
     which plan it is about. `aria-hidden`, because a reader who is not looking at it already has
     the column header through `role`. */
  .cell-of {
    display: none;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* Named rather than empty: the first column header has no word over it because the words under
     it are the questions, and a blank `columnheader` is a cell a screen reader reads as nothing. */
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The question on the left and the answer on the right, on one row, which is what the closing
     band of the home page does with the same two parts. `align-items: start` rather than `end`,
     because the heading is one line and the answer is three at this width. */
  .honest-row {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--sp-8);
    align-items: start;
  }

  .honest-title {
    margin: 0;
    max-inline-size: 22ch;
    font-size: var(--t-lg);
    font-weight: 600;
    line-height: var(--lh-tight);
    letter-spacing: var(--tr-tight);
  }

  .honest-body {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  @media (width < 900px) {
    .head-row,
    .honest-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }
  }

  @media (width < 760px) {
    .plans {
      grid-template-columns: minmax(0, 1fr);
    }

    /* ONE COLUMN, AND EACH ROW BECOMES A LITTLE BLOCK. Three columns of prose inside 358px is
       about eleven characters a line. The property becomes the row's heading and each answer says
       which plan it belongs to, which is the same information in the shape a narrow screen can
       actually hold. */
    .compare {
      grid-template-columns: minmax(0, 1fr);
    }

    .chead {
      display: none;
    }

    .cell-term {
      background: var(--s1);
      color: var(--ink);
    }

    .cell-of {
      display: block;
    }
  }

  @media (width < 640px) {
    .plan {
      padding: var(--sp-5);
    }

    .plan .btn {
      align-self: stretch;
    }

    .cell {
      padding: var(--sp-3);
    }
  }
</style>
