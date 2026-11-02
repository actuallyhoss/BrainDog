<!--
  The three plans as the app's tiles, Free first: the pricing page draws them under its head once billing is on (the
  redo of 2 November: no black card; Free leads by its place and its figure, and its start button is the page's red).

  EVERY FIGURE AND EVERY WORD IS `cards.ts`'s, which reads `TABLE` (`plans.ts`) and `copy/pricing.ts`; this file only
  lays them out. Free's button is the shell's `Start`, which draws both "Start free" and "Open BrainDog" and lets
  `html[data-in]` show one. Free's tag does the same with the shell's `when-out` and `when-in` classes. A paid card
  links its plan only while `LAUNCH.billing` is on; while it is off the card says "Coming soon" in the button's place,
  plain and not red, because the only solid red on a page is Start free.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { LAUNCH } from '$lib/launch.ts';
  import { cardsFor } from '$lib/pricing/cards.ts';
  import Start from '$lib/site/Start.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  const cards = cardsFor(LAUNCH);
</script>

<div class="plans" class:compact>
  {#each cards as card (card.id)}
    <div class="plan {card.id}" role="group" aria-labelledby="plan-{card.id}">
      <p class="name">
        <span id="plan-{card.id}">{card.name}</span>
        {#if card.tag}<em class="when-out">{card.tag.out}</em><em class="when-in">{card.tag.in}</em>{/if}
      </p>
      <p class="price" class:quiet={card.quiet}>{card.price}<span>{card.per}</span></p>
      <ul>
        {#each card.lines as line (line)}
          <li><Icon name="check" /><span>{line}</span></li>
        {/each}
      </ul>
      {#if card.button.kind === 'start'}
        <div class="go"><Start /></div>
      {:else if card.button.kind === 'link'}
        <a class="btn line" href={card.button.href} rel="external">{card.button.label}</a>
      {:else}
        <p class="soon">{card.button.label}</p>
      {/if}
    </div>
  {/each}
</div>

<style>
  .plans {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: var(--tile-gap);
    margin-block-start: 0;
  }

  .plans.compact {
    margin-block-start: 44px;
  }

  .plan {
    border-radius: var(--r-tile);
    padding: clamp(16px, 0.8vw + 13px, 24px);
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 18px;
    align-content: start;
    background: var(--tile);
    color: var(--ink);
  }

  .name {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font: 600 18px/1 var(--font-display);
    letter-spacing: -0.02em;
  }

  .name em {
    font: 500 var(--t-site-small) / 1 var(--font-ui);
    font-style: normal;
    color: var(--ink-2);
    letter-spacing: 0;
  }

  .price {
    margin: 0;
    font: 600 var(--t-h2) / 1 var(--font-display);
    letter-spacing: -0.03em;
  }

  /* A PAID CARD'S PRICE, read and not shouted: Free's $0 is the one figure at headline size. */
  .price.quiet {
    font: 600 22px/1.2 var(--font-display);
    letter-spacing: -0.02em;
  }

  .price span {
    font: 400 15px/1 var(--font-ui);
    letter-spacing: 0;
    color: var(--ink-3);
    margin-inline-start: 6px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    align-content: start;
    font-size: var(--t-site-15);
    color: var(--ink-2);
  }

  li {
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: 8px;
  }

  /* Past the glyph's own size rule (`Icon.svelte`), to the prototype's 17px. */
  .plan li :global(.icon) {
    width: 17px;
    height: 17px;
    margin-block-start: 3px;
  }

  .go :global(.btn),
  .plan > .btn {
    width: 100%;
  }

  .plan > .btn.line {
    --btn-fill: var(--tile-2);
  }

  /* In the button's place and the button's size, so the three cards end level; plain words, nothing to press. */
  .soon {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    font: 500 var(--t-site-15) / 1.2 var(--font-ui);
    color: var(--ink-3);
  }

  @media (max-width: 1060px) {
    .plans {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .plan {
      padding: 24px;
    }
  }
</style>
