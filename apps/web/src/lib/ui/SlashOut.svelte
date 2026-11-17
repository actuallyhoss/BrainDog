<!--
  What running out of Slash's questions offers: "Use your own key", "Settings", and on the Cloud "See plans".

  ONE ROW, DRAWN WHEREVER THE MONTH IS SPENT: under the Slash section of `/usage`, and under a pass-2 refusal whose
  `pass2Refused(...).spent` is true, in the palette and on `/slash`. The first two go to the Agents area of Settings
  (`outOfAsks` in `slash-asks.ts`), where the model is chosen; the third to Settings > Billing, where the plans and the
  packs of questions are, and only on the Cloud, the one host that sells them, and never in the iPhone app (App Store
  3.1.1). None is primary, because the screen it sits on has its own.
-->
<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import { inStoreApp } from '$lib/shell.ts';
  import { outOfAsks, words } from '$lib/ui/slash-asks.ts';
  import { sellsHere } from '../../routes/settings/billing.ts';

  /* "SEE PLANS" ONLY WHILE THE CLOUD SELLS THEM (`sellsHere`): with billing off there is no plan to see. */
  let selling = $state(false);
  $effect(() => {
    if (page.data.host === 'cloud' && !inStoreApp) void sellsHere().then((v) => (selling = v));
  });
  const cloud = $derived(page.data.host === 'cloud' && !inStoreApp && selling);
</script>

<div class="slash-out">
  <Button href={outOfAsks.key}>{words.outKey}</Button>
  <Button href={outOfAsks.settings}>{words.outSettings}</Button>
  {#if cloud}<Button href={outOfAsks.plans}>{words.outPlans}</Button>{/if}
</div>

<style>
  .slash-out {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }
</style>
