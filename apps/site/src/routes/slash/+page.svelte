<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { faqOf } from '$lib/site/seo.ts';
  /**
   * /slash: Slash on a page of its own (the redo of 2 November), on the app's board like every page.
   *
   *   head       the / key in a well, the page's one h1 and its lead.
   *   modes      the three things Slash does as the app's tiles: Ask across the row, its words beside its drawn
   *              answer, so one question and its answer are on the first screen; Find and Make side by side under it
   *              (one column on a phone); and the questions to try for all three behind one More examples.
   *   facts      how questions are counted beside Slash and your AI tools, then four questions.
   *   strip      the early access strip.
   *
   * THE WORDS ARE `copy/slash.ts`; the questions and every name and figure in a drawing are the made-up record's
   * (`demo/maya.ts`), and every count of questions is `PLAN_TABLE`'s. Nothing here types a figure.
   */
  import Icon from '$lib/Icon.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Mini from '$lib/slash/Mini.svelte';
  import { site } from '$lib/copy.ts';
  import { slashPage as s, type Mode } from '$lib/copy/slash.ts';
  import { ASKS, FINDS, MAKES } from '$lib/demo/maya.ts';
  import type { IconName } from '$lib/icons.ts';

  const MODES: { mode: Mode; icon: IconName; words: { title: string; body: readonly string[] }; tries: readonly string[] }[] = [
    { mode: 'ask', icon: 'message', words: s.ask, tries: ASKS.map((a) => a.q) },
    { mode: 'find', icon: 'search', words: s.find, tries: FINDS.map((f) => f.q) },
    { mode: 'make', icon: 'plus', words: s.make, tries: MAKES.map((m) => m.q) },
  ];
</script>

<Seo title={site.meta.slash.title} description={site.meta.slash.description} path="/slash" ld={[faqOf(s.faq.questions)]} />
<PageHead title={s.head.title} lead={s.head.lead}>
  {#snippet before()}<span class="keycap" aria-hidden="true">/</span>{/snippet}
</PageHead>

<section class="section" aria-label={site.meta.slash.title}>
  <div class="wrap">
    <div class="tiles">
      {#each MODES as m, i (m.mode)}
        <article class="tile lead mode reveal" class:span-6={i > 0} class:wide={i === 0} aria-labelledby="mode-{m.mode}">
          <div class="words">
            <h2 class="tile-head">
              <span class="well"><Icon name={m.icon} /></span>
              <span class="tile-name" id="mode-{m.mode}">{m.words.title}</span>
            </h2>
            {#each m.words.body as p (p)}<p class="tile-say">{p}</p>{/each}
          </div>
          <Mini mode={m.mode} />
        </article>
      {/each}
    </div>

    <details class="more">
      <summary><Icon name="chevron-down" size="s" />{s.moreExamples}</summary>
      <div class="egs">
        {#each MODES as m (m.mode)}
          <div>
            <h3 class="h3">{m.words.title}</h3>
            <ul class="eg" aria-label={s.examples}>
              {#each m.tries as q (q)}<li><span class="sl" aria-hidden="true">/</span>{q}</li>{/each}
            </ul>
          </div>
        {/each}
      </div>
    </details>
  </div>
</section>

<section class="section" aria-labelledby="tally-title">
  <div class="wrap">
    <div class="tiles">
      <section class="tile lead span-5 reveal" aria-labelledby="tally-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="gauge" /></span>
          <span class="tile-name" id="tally-title">{s.tally.title}</span>
        </h2>
        <p class="tile-say">{s.tally.say}</p>
        <p class="tile-say">{s.tally.after}</p>
      </section>

      <section class="tile lead span-7 reveal" aria-labelledby="agents-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="agent" /></span>
          <span class="tile-name" id="agents-title">{s.agents.title}</span>
        </h2>
        <p class="tile-say">{s.agents.say}</p>
        <div class="tablebox">
          <table class="ptable">
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
      </section>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="faq-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="faq-title">{s.faq.title}</h2>
    </div>
    <div class="faq">
      {#each s.faq.questions as f (f.q)}
        <div><h3>{f.q}</h3><p>{f.a}</p></div>
      {/each}
    </div>
  </div>
</section>

<EarlyStrip />

<style>
  /* THE / KEY over the title (PageHead's `before`): the app's key cap, the tile's fill with its 1px edge. */
  .keycap {
    display: grid;
    place-items: center;
    inline-size: 48px;
    block-size: 48px;
    border: 1px solid var(--rule-strong);
    border-block-end-width: 3px;
    border-radius: var(--r-pop);
    background: var(--tile);
    color: var(--ink);
    font: 600 22px/1 var(--font-display);
  }

  /* A MODE: its words over its drawn answer; Ask, across the row, has them side by side. */
  .mode {
    gap: var(--sp-5);
  }

  .words {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
  }

  .mode > :global(.mini) {
    margin-block-start: auto;
  }

  @media (width >= 900px) {
    .wide {
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      gap: var(--sp-7);
      align-items: start;
    }

    .wide > :global(.mini) {
      margin: 0;
    }
  }

  /* THE QUESTIONS TO TRY, all three modes', behind one disclosure under the tiles. */
  .more {
    margin-block-start: var(--sp-4);
  }

  .more summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-15);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
  }

  .more summary::-webkit-details-marker {
    display: none;
  }

  .more summary :global(svg) {
    color: var(--ink-3);
  }

  @media (prefers-reduced-motion: no-preference) {
    .more summary :global(svg) {
      transition: rotate var(--d-state) var(--ease-out);
    }
  }

  .more[open] summary :global(svg) {
    rotate: 180deg;
  }

  .egs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-5);
    padding-block: var(--sp-3) 0;
  }

  .eg {
    display: grid;
    gap: 8px;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .eg li {
    display: flex;
    gap: 10px;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .sl {
    color: var(--ink-3);
    font: 600 15px/1.5 var(--font-display);
  }

  .tablebox {
    margin-block-start: var(--sp-2);
  }

  @media (max-width: 899px) {
    .egs {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
