<!--
  What running out of Slash's asks offers: "Use your own key" and "Settings".

  ONE PAIR, DRAWN WHEREVER THE MONTH IS SPENT: under the Slash section of `/usage`, and under a pass-2 refusal whose
  `pass2Refused(...).spent` is true, in the palette and on `/slash`. Both go to the Agents area of Settings (`outOfAsks`
  in `slash-asks.ts`), where the model is chosen; neither is primary, because the screen it sits on has its own.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import { outOfAsks, words } from '$lib/ui/slash-asks.ts';
</script>

<div class="slash-out">
  <Button href={outOfAsks.key}>{words.outKey}</Button>
  <Button href={outOfAsks.settings}>{words.outSettings}</Button>
</div>

<style>
  .slash-out {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }
</style>
