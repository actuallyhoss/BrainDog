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

<section class="wrap read">
  {#each MODES.slice(0, 1) as m (m.mode)}
    <div class="srow">
      <div class="stext">
        <h2>{m.words.title}</h2>
        {#each m.words.body as p (p)}<p>{p}</p>{/each}
      </div>
      <Mini mode={m.mode} />
    </div>
  {/each}
  <div class="bento">
    {#each MODES.slice(1) as m (m.mode)}
      <article class="stile">
        <h2>{m.words.title}</h2>
        {#each m.words.body as p (p)}<p>{p}</p>{/each}
        <Mini mode={m.mode} />
      </article>
    {/each}
  </div>
  <details class="more-eg">
    <summary>{s.moreExamples}</summary>
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

<section class="wrap read">
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

  .read {
    max-inline-size: 1120px;
  }

  .srow {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 64px;
    align-items: start;
    padding-block: 56px 32px;
  }

  /* FIND AND MAKE, side by side on a desk: each its words over its drawn answer, on the page's paper. */
  .bento {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .stile {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-inline-size: 0;
    padding: 28px;
    border: 1px solid var(--rule);
    border-radius: 16px;
  }

  .stile h2 {
    font-size: var(--t-site-28);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .stile p {
    margin: 12px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-16);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .stile :global(.mini) {
    margin-block-start: auto;
  }

  .stile p:last-of-type {
    margin-block-end: 24px;
  }

  /* THE QUESTIONS TO TRY, all three modes', behind one disclosure under the drawings. */
  .more-eg {
    margin-block: 24px 72px;
  }

  .more-eg summary {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    font-size: var(--t-site-16);
    font-weight: 600;
    cursor: pointer;
  }

  .egs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    padding-block-start: 12px;
  }

  .egs h3 {
    font-size: var(--t-site-17);
    letter-spacing: -0.02em;
  }

  .egs .eg {
    margin-block-start: 12px;
  }

  .stext h2,
  .facts h2 {
    font-size: clamp(2.2rem, 4vw, 3.2rem);
    line-height: 1;
    letter-spacing: -0.045em;
  }

  .stext p,
  .facts p {
    max-inline-size: 32em;
    margin: 18px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-18);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .eg {
    display: grid;
    gap: 10px;
    margin: 26px 0 0;
    padding: 0;
    list-style: none;
  }

  .eg li {
    display: flex;
    gap: 12px;
    font-size: var(--t-site-16-5);
  }

  .eg li::before {
    content: '/';
    color: var(--red);
    font: 600 16px/1.55 var(--head);
  }

  .facts {
    padding-block: 72px;
    border-block-start: 1px solid var(--rule);
  }

  .tablebox {
    max-inline-size: 760px;
    margin-block-start: 28px;
    overflow-x: auto;
  }

  .ptable {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-site-15);
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
    font-size: var(--t-site-13-5);
    font-weight: 500;
  }

  .ptable tbody th {
    font-weight: 400;
  }

  .ptable:not(.plain-left) td,
  .ptable:not(.plain-left) thead th {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .faq {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 34px 56px;
    margin-block-start: 40px;
  }

  .faq h3 {
    margin-block-end: 8px;
    font-size: var(--t-site-21);
    letter-spacing: -0.03em;
  }

  .faq p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-16);
  }

  @media (max-width: 1060px) {
    .srow {
      grid-template-columns: 1fr;
      gap: 32px;
      padding-block: 40px 24px;
    }

    .bento,
    .egs {
      grid-template-columns: minmax(0, 1fr);
    }

    .faq {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .facts {
      padding-block: 64px;
    }

    .stile {
      padding: 20px;
    }
  }
</style>
