<!--
  One of Slash's answers drawn small beside its words on the Slash page: the app's palette with the question in its bar
  and the answer under it. Nothing types in: the page is for reading,
  so the answer is there from the start, and a Make draft is still added or left with one press.
-->
<script lang="ts">
  import Answer from './Answer.svelte';
  import { ASKS, FINDS, MAKES } from '../demo/maya.ts';
  import type { Mode } from '../copy/slash.ts';

  let { mode, at = 0 }: { mode: Mode; at?: number } = $props();

  const q = $derived((mode === 'ask' ? ASKS[at]?.q : mode === 'find' ? FINDS[at]?.q : MAKES[at]?.q) ?? '');
</script>

<div class="mini">
  <div class="mini-in"><span class="sl" aria-hidden="true">/</span>{q}</div>
  <Answer {mode} {at} />
</div>

<style>
  /* THE APP'S PALETTE, drawn small: an opaque layer with the 1px edge the design system gives what floats. */
  .mini {
    display: grid;
    gap: 10px;
    min-inline-size: 0;
    padding: 12px;
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink);
  }

  .mini-in {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    font-size: var(--t-site-15);
  }

  /* The bar's "/" in the third ink: red is kept for the page's one ask. */
  .sl {
    color: var(--ink-3);
    font: 600 16px/1 var(--font-display);
  }
</style>
