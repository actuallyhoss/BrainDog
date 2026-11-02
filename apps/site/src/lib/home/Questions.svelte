<!--
  Questions (the redo of 2 November): the questions people ask, as one tile of native disclosures, the first open, a
  hairline between them and a chevron that turns over the skin's state step. A disclosure opens and shuts with no
  script (its height eases open, `app.css`), and every answer is in the HTML. Under them, where to write for anything
  else.

  THREE, THEN MORE QUESTIONS: the rest sit behind one plain disclosure, so a phone reads three questions and not seven
  before the footer.

  ON THE PRICING PAGE, where the questions are asked: the home page's (`home.faq`), after the pricing page's own
  (`questions`).
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';

  type Asked = { q: string; a: string; link?: { label: string; href: string } };

  let { questions = home.faq.questions, title = home.faq.title }: { questions?: readonly Asked[]; title?: string } = $props();

  const q = $derived({ ...home.faq, questions, title });
  /** How many questions are drawn before More questions. */
  const FIRST = 3;
</script>

{#snippet asked(item: Asked, open: boolean)}
  <details {open}>
    <summary>{item.q}<Icon name="chevron-down" /></summary>
    <p>
      {item.a}
      {#if item.link}<a class="more" href={item.link.href}>{item.link.label}<Icon name="arrow-right" size="s" /></a>{/if}
    </p>
  </details>
{/snippet}

<section class="tile lead questions" aria-labelledby="faq-title">
  <h2 class="tile-head">
    <span class="well"><Icon name="help" /></span>
    <span class="tile-name" id="faq-title">{q.title}</span>
  </h2>
  <div class="qs">
    {#each q.questions.slice(0, FIRST) as item, i (item.q)}{@render asked(item, i === 0)}{/each}
    {#if q.questions.length > FIRST}
      <details class="rest">
        <summary class="rest-open">{q.more}<Icon name="chevron-down" /></summary>
        <div class="rest-qs">
          {#each q.questions.slice(FIRST) as item (item.q)}{@render asked(item, false)}{/each}
        </div>
      </details>
    {/if}
  </div>
  <p class="aside">{q.aside} <a href="mailto:{q.email}">{q.email}</a>.</p>
</section>

<style>
  .qs {
    display: grid;
  }

  details + details,
  .rest-qs > details {
    border-block-start: 1px solid var(--rule);
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    min-block-size: 52px;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 1.35;
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  @media (prefers-reduced-motion: no-preference) {
    summary :global(.icon) {
      transition: rotate var(--d-state) var(--ease-out);
    }
  }

  details[open] > summary :global(.icon) {
    rotate: 180deg;
  }

  /* MORE QUESTIONS IS A PLAIN LINE in the second ink: the questions it opens are the rows. */
  .rest-open {
    color: var(--ink-2);
    font-size: var(--t-site-15);
    font-weight: 500;
  }

  details p {
    margin: 0;
    padding-block-end: var(--sp-4);
    max-inline-size: 60ch;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 1.6;
  }

  .more {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-start: 4px;
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .more:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .aside {
    margin: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--t-site-15);
  }

  .aside a {
    color: var(--ink);
    font-weight: 500;
    text-underline-offset: 3px;
  }

  /* 44 BY 44 UNDER A THUMB, grown by a `::before`; the address alone is 21 tall. */
  @media (pointer: coarse) {
    .aside a {
      position: relative;
    }

    .aside a::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }
</style>
