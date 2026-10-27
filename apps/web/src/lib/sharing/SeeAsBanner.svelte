<!--
  The one line over every screen while the record is seen as somebody: "Seeing as Priya. Nothing
  you do here counts. Exit." Exit loads the page again as yourself (`see-as.svelte.ts`).

  THE ONE BANNER (`Banner.svelte`, 2.A.17), on the warn fill, as offline is: a mode in which nothing he does counts, which
  is a thing to know and not a thing that is late. In the flow, so it never covers the phone's tab bar.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { exitSeeAs, seeingAs } from './see-as.svelte.ts';

  const as = seeingAs();
</script>

{#if as}
  <Banner tone="warn" icon="eye">
    {copy.seeAsBanner(as.name)}
    {#snippet actions()}<Button weight="primary" onclick={() => exitSeeAs()}>{copy.seeAsExit}</Button>{/snippet}
  </Banner>
{/if}
