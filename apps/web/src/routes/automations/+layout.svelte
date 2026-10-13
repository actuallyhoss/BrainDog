<!--
  The hub's one head: the name, the five tabs and the tab's own action, drawn once over `/automations` and
  `/automations/runs`.

  WHY A LAYOUT. Runs is its own address and so its own page. While each page drew its own head, going to Runs took
  one segmented control off the screen and put another on, and a control that has just been drawn has nowhere to slide
  from: the selection was put down under Runs, it did not move there. Drawn here, the control stays while the page
  under it changes, the address moves `data-on` from one link to the next, and the part (`lib/ui/Segmented.svelte`)
  slides the selection as it does between the other four.

  ONE AUTOMATION'S OWN SCREEN (`[id]`, and `new`) sits under this layout too and draws its own head, with a way back,
  so nothing is drawn here for it.

  WHAT ONLY A PAGE HAS READ (how many, and the sentence) reaches the head through `hub-head.ts`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { words } from '$lib/flow/flow.ts';
  import HubTabs from './HubTabs.svelte';
  import { hubWords as w } from './hub.ts';
  import { emptyHead, headFor, shareHead, tabHere } from './hub-head.ts';

  let { children }: { children: Snippet } = $props();

  const head = $state(emptyHead());
  shareHead(head);

  const tab = $derived(tabHere(page.route.id, page.url.searchParams));
  const shown = $derived(tab ? headFor(tab, head) : null);
</script>

<!-- THE TABS ARE THE TOOLBAR'S SEGMENTED CONTROL, beside the one primary action, which is the tab's own: "New
     automation", "New scheduled action", "New script", and none on Doors, whose section carries "New door" for an
     owner, and none on Runs, where nothing is made. -->
{#if tab && shown}
  <PageHead icon="refresh" title={words.heading} count={shown.count} sentence={shown.sentence} needs={shown.needs}>
    {#snippet actions()}
      <HubTabs here={tab} />
      {#if tab === 'automations'}
        <Button weight="primary" href="/automations/new">{words.newOne}</Button>
      {:else if tab === 'scheduled'}
        <Button weight="primary" href="/automations?tab=scheduled&new=action">{w.newAction}</Button>
      {:else if tab === 'scripts'}
        <Button weight="primary" href="/scripts/new">{w.newScript}</Button>
      {/if}
    {/snippet}
  </PageHead>
{/if}

{@render children()}
