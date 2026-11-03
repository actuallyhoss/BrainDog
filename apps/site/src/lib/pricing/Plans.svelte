<!--
  The three plans as cards, Free first and black: the pricing page draws them under its head, and
  the home page's plans band draws them `compact`, with the tighter top of the prototype's teaser.

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
    gap: 16px;
    margin-block-start: 56px;
  }

  .plans.compact {
    margin-block-start: 44px;
  }

  .plan {
    border-radius: 24px;
    padding: 30px;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 18px;
    align-content: start;
    background: var(--paper);
    color: var(--ink);
  }

  .plan.free {
    --focus: var(--on-night);
    background: var(--night);
    color: var(--on-night);
  }

  .name {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font: 600 18px/1 var(--head);
    letter-spacing: -0.02em;
  }

  .name em {
    font: 500 12.5px/1 var(--ui);
    font-style: normal;
    color: var(--red-ink);
    letter-spacing: 0;
  }

  /* The prototype's light red, the one that reads on the night ground in both themes. */
  .free .name em {
    color: var(--night-accent);
  }

  .price {
    margin: 0;
    font: 600 52px/1 var(--head);
    letter-spacing: -0.021em;
  }

  /* A PAID CARD'S PRICE, read and not shouted: Free's $0 is the one figure at headline size. */
  .price.quiet {
    font: 600 22px/1.2 var(--head);
    letter-spacing: -0.02em;
  }

  .price span {
    font: 400 15px/1 var(--ui);
    letter-spacing: 0;
    color: var(--muted);
    margin-inline-start: 6px;
  }

  .free .price span {
    color: var(--on-night-2);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    align-content: start;
    font-size: var(--t-site-15);
    color: var(--ink2);
  }

  .free ul {
    color: var(--on-night-2);
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
    background: var(--page);
  }

  /* In the button's place and the button's size, so the three cards end level; plain words, nothing to press. */
  .soon {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    font: 500 15.5px/1.2 var(--ui);
    color: var(--muted);
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
