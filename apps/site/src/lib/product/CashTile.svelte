<!--
  Today's Cash ahead tile, as the app draws it: the cash now as the tile's one big figure, how long it lasts at this
  pace, and beside it what comes in and goes out in the next 30 days, in with its plus in green and out in ink with its
  minus (the design system's money). Maya's figures, from `demo/maya.ts`.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { CENTS, usd } from '../demo/maya.ts';
  import { today as w } from '../copy/product.ts';
</script>

<section class="tile cash" aria-labelledby="cash-title">
  <h3 class="tile-head">
    <span class="well"><Icon name="wallet" /></span>
    <span class="tile-title" id="cash-title">{w.cash}</span>
  </h3>
  <div class="body">
    <div class="now">
      <p class="label">{w.cashNow}</p>
      <p class="figure num">{usd(CENTS.cashAhead)}</p>
      <p class="reading">{w.lasts}</p>
    </div>
    <dl class="flows">
      <div><dt>{w.in30}</dt><dd class="num good">+{usd(CENTS.in30)}</dd></div>
      <div><dt>{w.out30}</dt><dd class="num">−{usd(CENTS.out30)}</dd></div>
    </dl>
  </div>
</section>

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: end;
  }

  .label {
    margin: 0 0 2px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .figure {
    font-size: var(--fs-page);
    line-height: 34px;
  }

  .reading {
    margin-block-start: 4px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  dl {
    display: grid;
    margin: 0;
  }

  dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding-block: 9px;
  }

  dl div + div {
    border-block-start: 1px solid var(--rule);
  }

  dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  dd.good {
    color: var(--good);
  }

  @container desk (width < 420px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-3);
    }
  }
</style>
