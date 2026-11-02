<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { faqOf } from '$lib/site/seo.ts';
  /**
   * /slash: Slash on a page of its own, for a reader who wants to know more ("have a separate page for
   * Slash ... make it super readable and neat"). The prototype's `#slash`:
   *
   *   head       the / key on the night ground, the page's one h1 and its lead.
   *   modes      Ask leads, its words beside its drawn answer, so one question and its answer are on the first
   *              screen; Find and Make as a two-column bento under it (one column on a phone), and the questions to
   *              try for all three behind one More examples (plan F15, F16: the page was 4,358 tall at 1512).
   *   facts      how asks are counted (one paragraph, no plan table), Slash beside your AI tools, and four questions.
   *   strip      the early access strip.
   *
   * THE WORDS ARE `copy/slash.ts`; the questions and every name and figure in a drawing are the made-up record's
   * (`demo/maya.ts`), and every count of asks is `PLAN_TABLE`'s. Nothing here types a figure.
   */
  import Icon from '$lib/Icon.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Mini from '$lib/slash/Mini.svelte';
  import { site } from '$lib/copy.ts';
  import { slashPage as s, type Mode } from '$lib/copy/slash.ts';
  import { ASKS, FINDS, MAKES } from '$lib/demo/maya.ts';

  const MODES: { mode: Mode; words: { title: string; body: readonly string[] }; tries: readonly string[] }[] = [
    { mode: 'ask', words: s.ask, tries: ASKS.map((a) => a.q) },
    { mode: 'find', words: s.find, tries: FINDS.map((f) => f.q) },
    { mode: 'make', words: s.make, tries: MAKES.map((m) => m.q) },
  ];
</script>

<Seo title={site.meta.slash.title} description={site.meta.slash.description} path="/slash" ld={[faqOf(s.faq.questions)]} />
<PageHead title={s.head.title} lead={s.head.lead}>
  {#snippet before()}<span class="keycap" aria-hidden="true">/</span>{/snippet}
</PageHead>

<section class="wrap modes">
  <div class="bento">
    {#each MODES.slice(0, 1) as m (m.mode)}
      <article class="stile srow">
        <div class="stext">
          <h2>{m.words.title}</h2>
          {#each m.words.body as p (p)}<p>{p}</p>{/each}
        </div>
        <Mini mode={m.mode} />
      </article>
    {/each}
    {#each MODES.slice(1) as m (m.mode)}
      <article class="stile pair">
        <div class="stext">
          <h2>{m.words.title}</h2>
          {#each m.words.body as p (p)}<p>{p}</p>{/each}
        </div>
        <Mini mode={m.mode} />
      </article>
    {/each}
  </div>
  <details class="more-eg">
    <summary>{s.moreExamples}<Icon name="chevron-down" /></summary>
    <div class="egs">
      {#each MODES as m (m.mode)}
        <div>
          <h3>{m.words.title}</h3>
          <ul class="eg" aria-label={s.examples}>
            {#each m.tries as q (q)}<li>{q}</li>{/each}
          </ul>
        </div>
      {/each}
    </div>
  </details>
</section>

<section class="wrap facts-all">
  <div class="facts">
    <h2>{s.tally.title}</h2>
    <p>{s.tally.say}</p>
    <p>{s.tally.after}</p>
  </div>

  <div class="facts">
    <h2>{s.agents.title}</h2>
    <p>{s.agents.say}</p>
    <div class="tablebox">
      <table class="ptable plain-left">
        <thead>
          <tr><td></td>{#each s.agents.head as h (h)}<th scope="col">{h}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each s.agents.lines as [what, slash, agents] (what)}
            <tr><th scope="row">{what}</th><td>{slash}</td><td>{agents}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="facts">
    <h2>{s.faq.title}</h2>
    <div class="faq">
      {#each s.faq.questions as f (f.q)}
        <div><h3>{f.q}</h3><p>{f.a}</p></div>
      {/each}
    </div>
  </div>
</section>

<EarlyStrip />

<style>
  /* THE / KEY on the night ground, above the title (PageHead's `before`). */
  .keycap {
    display: grid;
    place-items: center;
    inline-size: 60px;
    block-size: 60px;
    margin-block-end: 26px;
    border-radius: 15px;
    background: var(--night-2);
    box-shadow:
      inset 0 0 0 1px var(--night-rule),
      inset 0 -3px 0 var(--night-rule);
    color: var(--night-accent);
    font: 600 28px/1 var(--head);
  }

  /* THE THREE WAYS TO USE IT AS ONE BOARD OF TILES (polish, 2 November): Ask across the top, its words beside its
     answer, then Find and Make side by side. Each is the site's one tile, the paper fill with no edge; Find and Make were
     outlined boxes and Ask was loose on the page. The column is the site's own `.wrap`: it was 1120 here, so every
     heading on Slash started 40px inside the header's edge. */
  .modes {
    padding-block: var(--first-pad) 0;
  }

  .bento {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  /* THE TILE IS THE PAPER, and what the drawing raises on it takes the tile a step up from the paper in both schemes
     (`--band-yours-tile`, white in light): in dark the paper and the tile are one colour, so the answer's cards vanished
     into the tile under them. */
  .stile {
    --tile: var(--band-yours-tile);
    min-inline-size: 0;
    padding: var(--site-tile-pad);
    background: var(--paper);
    border-radius: 16px;
    color: var(--ink);
  }

  /* ASK: its words beside its answer, across both columns. */
  .srow {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 48px;
    align-items: start;
  }

  /* FIND AND MAKE: the words, then the answer, on rows the two tiles share, so both drawings start on one line however
     long either tile's words run. */
  .pair {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    row-gap: 24px;
  }

  .stile h2 {
    font-size: var(--t-feature);
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .stile p {
    max-inline-size: 34em;
    margin: 12px 0 0;
    color: var(--ink2);
    font-size: var(--t-text);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* THE DRAWING SITS ON THE TILE ITSELF: its own frame would be the tile's fill again. */
  .bento .stile :global(.mini) {
    padding: 0;
    background: none;
  }

  /* THE QUESTIONS TO TRY, all three modes', behind one disclosure under the drawings, with the chevron every disclosure
     on the site draws: it was bold words alone, with nothing to say they open. */
  .more-eg {
    margin-block-start: 16px;
  }

  .more-eg summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 44px;
    font-size: var(--t-label);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }

  .more-eg summary::-webkit-details-marker {
    display: none;
  }

  .more-eg summary :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
    color: var(--ink2);
    transition: rotate var(--d-swap) var(--ease-out);
  }

  .more-eg[open] summary :global(.icon) {
    rotate: 180deg;
  }

  .egs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    padding-block: 12px 8px;
  }

  .egs h3 {
    font-size: var(--t-label);
    letter-spacing: -0.01em;
  }

  .egs .eg {
    margin-block-start: 12px;
  }

  .eg {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .eg li {
    display: flex;
    gap: 12px;
    color: var(--ink2);
    font-size: var(--t-text);
  }

  .eg li::before {
    content: '/';
    color: var(--red);
    font: 600 16px/1.55 var(--head);
  }

  /* HOW IT IS COUNTED, BESIDE YOUR AI TOOLS, AND THE QUESTIONS: sections at the page's band step, each title at the
     section step and its line at the say step, with space between them and no rule. */
  .facts-all {
    padding-block-end: var(--band-pad);
  }

  .facts {
    padding-block-start: var(--band-pad);
  }

  .facts h2 {
    font-size: var(--t-section);
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .facts p {
    max-inline-size: 34em;
    margin: 16px 0 0;
    color: var(--ink2);
    font-size: var(--t-say);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .facts .faq p {
    margin: 0;
    font-size: var(--t-text);
    line-height: 1.55;
  }

  .tablebox {
    max-inline-size: 760px;
    margin-block-start: var(--head-gap);
    overflow-x: auto;
  }

  .ptable {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-label);
  }

  .ptable th,
  .ptable td {
    padding: 14px 10px;
    border-block-start: 1px solid var(--rule);
    text-align: start;
  }

  .ptable thead th,
  .ptable thead td {
    border-block-start: 0;
    color: var(--muted);
    font-size: var(--t-meta);
    font-weight: 500;
  }

  .ptable tbody th {
    color: var(--muted);
    font-weight: 400;
  }

  .ptable:not(.plain-left) td,
  .ptable:not(.plain-left) thead th {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .faq {
    margin-block-start: var(--head-gap);
  }

  @media (max-width: 1060px) {
    .srow {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
    }

    .bento,
    .egs {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .more-eg summary :global(.icon) {
      transition: none;
    }
  }
</style>
