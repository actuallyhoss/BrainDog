<!--
  An amount.

  The record's home currency is written the way a person writes it, `£28,320.00`, at the size and in
  the ink of the figure. Any other currency keeps its symbol and puts its ISO code after the figure,
  small and quiet, `$4,800.00 USD`, so two currencies never read alike in one column. The text
  `money()` writes is unchanged; only the drawing is.

  Tabular figures on the PROPORTIONAL face, never mono. A monospace face gives the thousands
  separator a full cell, and the comma floats in the middle of the number (13 §3.2).
-->
<script lang="ts">
  import { integer, money } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { drawn } from '$lib/record/money.ts';

  let {
    minor,
    currency,
    weight = 'normal',
    home = homeCurrency(),
  }: { minor: number; currency: string; weight?: 'normal' | 'strong'; home?: string | null } = $props();

  /* A VALUE WITH NO CODE PRINTS ITS DIGITS AND NO CODE, which is the honest state of a money field
     with no currency. A figure `money()` could not state (`drawn` is null) prints as it was written. */
  const text = $derived(currency ? money(minor, currency) : integer(minor));
  const parts = $derived(currency ? drawn(text, home) : null);
</script>

<span class="money num" data-weight={weight}>
  {#if parts}<span class="amount">{parts.lead}{parts.whole}{parts.fraction}</span>{#if parts.code}<span class="code">{parts.code}</span>{/if}{:else}<span class="amount">{text}</span>{/if}
</span>

<style>
  .money {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* `em` on purpose: `<Money>` renders at whatever size its caller sets, and the code stays a step
     smaller than the figure at every one of them. */
  .code {
    margin-inline-start: 0.3em;
    color: var(--dim);
    font-size: 0.85em;
    letter-spacing: 0;
  }

  .amount {
    color: inherit;
  }

  .money[data-weight='strong'] .amount {
    font-weight: 500;
  }
</style>
