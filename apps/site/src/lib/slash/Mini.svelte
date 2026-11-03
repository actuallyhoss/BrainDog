<!--
  One of Slash's answers drawn small beside its words on the Slash page, the prototype's `.mini` (site.html ~:379-381,
  ~:1296-1299): the question in a bar with its "/", and the answer under it. Nothing types in: the page is for reading,
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
  .mini {
    background: var(--paper);
    border-radius: 22px;
    padding: 14px;
    display: grid;
    gap: 10px;
    min-width: 0;
    color: var(--ink);
  }
  .mini-in {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: 24px;
    background: var(--tile);
    font-size: var(--t-site-15);
    /* THE APP'S SEARCH CAPSULE: a hairline and the raised lift (red is kept for the one ask). */
    box-shadow: inset 0 0 0 1px var(--sep), var(--shadow-raised);
  }
  .sl {
    color: var(--red);
    font: 600 16px/1 var(--head);
  }
</style>
