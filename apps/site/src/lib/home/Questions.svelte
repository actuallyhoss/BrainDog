<!--
  Questions (site 2a section 7): an FAQ-style accordion. The heading and the support address on the left, five
  native disclosures on the right, the first open, each a flat tile whose chevron turns in 160ms. A disclosure opens
  and shuts with no script, and every answer is in the HTML.

  THREE, THEN MORE QUESTIONS: the rest sit behind one plain disclosure, so a phone reads
  three questions and not five before the footer.

  ON THE PRICING PAGE SINCE PLAN F12, where the questions are asked: the home page's, after the pricing page's own
  (`questions`), and no longer on the home page, whose job is one ask.
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

<section class="band band--faq" aria-labelledby="faq-title">
  <div class="wrap reveal cols">
    <div class="c4 side">
      <h2 id="faq-title" class="band-h2">{q.title}</h2>
      <p class="aside">{q.aside} <a href="mailto:{q.email}">{q.email}</a>.</p>
    </div>
    <div class="c8 qs">
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
  </div>
</section>

<style>
  .aside {
    margin: 16px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-16);
  }

  .aside a {
    color: var(--red);
    text-underline-offset: 3px;
  }

  /* 44 BY 44 UNDER A THUMB, grown by a `::before` as `.tap` grows one (`a11y.css`); the address alone was 21 tall. */
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

  .qs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  details {
    background: var(--band-faq-tile);
    border-radius: 16px;
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-block-size: 56px;
    padding: 0 20px;
    cursor: pointer;
    font-size: var(--t-site-17);
    font-weight: 600;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary :global(.icon) {
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    color: var(--ink2);
    transition: rotate 160ms ease-out;
  }

  details[open] > summary :global(.icon) {
    rotate: 180deg;
  }

  /* MORE QUESTIONS IS A PLAIN LINE, not a tile: the questions it opens are the tiles. */
  .rest {
    background: none;
  }

  .rest-open {
    color: var(--ink2);
    font-weight: 500;
  }

  .rest-qs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  summary:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
    border-radius: 16px;
  }

  details p {
    margin: -4px 0 0;
    padding: 0 20px 20px;
    max-inline-size: 40em;
    color: var(--ink2);
    font-size: var(--t-site-16);
    line-height: 1.55;
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

  @media (max-width: 1059px) {
    .qs {
      margin-block-start: 24px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    summary :global(.icon) {
      transition: none;
    }
  }
</style>
