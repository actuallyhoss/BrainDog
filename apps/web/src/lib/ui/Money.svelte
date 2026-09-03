<!--
  An amount.

  The currency code comes FIRST and is always present, because money is an integer in minor units
  with its own currency beside it and a column of figures with the code stripped off is a column
  that can be summed wrongly. But eight repetitions of GBP down one column is eight shouts, so the
  code is set in the quiet ink and the figure in the loud one. The information is identical; only
  the emphasis moves.

  Tabular figures on the PROPORTIONAL face — never mono. A monospace face gives the thousands
  separator a full cell, so GBP 2,869 renders as GBP 2 , 869 at display size, and the comma floats
  in the middle of the number (13 §3.2).
-->
<script lang="ts">
  import { money } from 'braindog-render';

  let { minor, currency, weight = 'normal' }: { minor: number; currency: string; weight?: 'normal' | 'strong' } = $props();

  const text = $derived(money(minor, currency));
  const split = $derived(text.indexOf(' '));
</script>

<span class="money" data-weight={weight}>
  <span class="code">{text.slice(0, split)}</span><span class="amount num">{text.slice(split)}</span>
</span>

<style>
  .money {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .code {
    color: var(--dim);
    font-size: 0.85em;
    letter-spacing: 0.04em;
  }

  .amount {
    color: inherit;
  }

  .money[data-weight='strong'] .amount {
    font-weight: 500;
  }
</style>
