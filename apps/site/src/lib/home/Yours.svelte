<!--
  "It stays yours" (the redo of 2 November): what keeps a record its owner's, said once on the home page as six plain
  facts in one tile, each with the app's glyph for it, and a way on to the security page that says how. The first
  three are the claims they always were (`lib/claims.ts`); the words are `copy/home.ts`. Static.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { home } from '../copy/home.ts';

  const y = home.yours;
</script>

<section class="section" id="yours" aria-labelledby="yours-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="yours-title">{y.title}</h2>
      <p>{y.say}</p>
    </div>

    <div class="tile lead reveal">
      <ul class="facts">
        {#each y.points as p (p.text)}
          <li><span class="well l"><Icon name={p.icon} /></span><span class="text">{p.text}</span></li>
        {/each}
      </ul>
      <a class="onward" href={y.href}>{y.link}<Icon name="arrow-right" size="s" /></a>
    </div>
  </div>
</section>

<style>
  /* SIX FACTS IN THREE COLUMNS, a hairline over each row after the first: a list to read, not six cards. */
  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding-block: var(--sp-4);
  }

  li:nth-child(n + 4) {
    border-block-start: 1px solid var(--rule);
  }

  li:nth-child(-n + 3) {
    padding-block-start: 0;
  }

  .text {
    padding-block-start: 4px;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .onward {
    align-self: flex-start;
  }

  @media (max-width: 899px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
    }

    li:nth-child(n + 2) {
      border-block-start: 1px solid var(--rule);
    }

    li:nth-child(-n + 3) {
      padding-block-start: var(--sp-4);
    }

    li:first-child {
      padding-block-start: 0;
    }
  }
</style>
