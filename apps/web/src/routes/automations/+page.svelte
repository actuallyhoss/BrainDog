<!--
  Automations: `/automations`, one place for everything that runs by itself.

  FIVE TABS IN ONE CONTROL: Automations, Scheduled (calls, polls and pulls), Scripts, Doors, and Runs. They were four
  corners of the product (this list, a project's "Runs on", `/scripts`, and Settings, Ingest) and nowhere listed a run
  of each, so "what does this record do on its own" had no single answer. Each tab draws its kind in the words that
  kind's own screen uses, through one row shape (`HubRows.svelte`), and each row opens that kind's own screen. Runs is
  its own address, `/automations/runs`; the other four are `?tab=` here, and the rules live in `hub.ts`.

  ONE ROW EACH, TWO LINES: its name and what it is, then where it stands. The second line is the verdict and wraps
  rather than losing its end to an ellipsis, which on a phone was exactly the part that said what to do.

  THE NAME, THE TABS AND THE TAB'S OWN ACTION ARE DRAWN ONCE, IN `+layout.svelte`, over this page and Runs alike, so
  the selection slides to Runs as it does between the other four.

  THE NEW-ACTION SHEET OPENS FROM THE ADDRESS, `?new=door` or `?new=action&preset=<id>`, so a
  declared page links to a sheet already filled in and this hub is the one reader. Closing it takes the two keys off
  the address and redraws the tab under it, so what was just made shows without a reload.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import NewAction from '$lib/ui/NewAction.svelte';
  import WebhookDoors from '$lib/ui/WebhookDoors.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import AutomationsTab from './AutomationsTab.svelte';
  import ScheduledTab from './ScheduledTab.svelte';
  import ScriptsTab from './ScriptsTab.svelte';
  import { newOf, tabOf, withoutNew } from './hub.ts';
  import { hubHead } from './hub-head.ts';
  import { tick } from 'svelte';
  import { swapUp } from '$lib/page/swap-up.ts';

  const tab = $derived(tabOf(page.url.searchParams));

  /* THE TAB LAST DRAWN, so a press fades the new one up and the first draw does not (`swapUp`). */
  let tabBody = $state<HTMLElement>();
  let tabSeen: string | null = null;
  $effect(() => {
    const now = tab;
    const was = tabSeen;
    tabSeen = now;
    if (was !== null && was !== now) void tick().then(() => swapUp(tabBody));
  });
  const ask = $derived(newOf(page.url.searchParams));

  /* THE HEAD IS THE LAYOUT'S (`+layout.svelte`), so the tabs stay while this page and Runs change under them. It counts
     automations only on their own tab, as it did when this was the list (a count of five kinds at once would be a sum
     nobody asked for), and says the sentence from the same read: how many run by themselves, and which one is failing. */
  const head = hubHead();

  /* BUMPED WHEN THE SHEET CLOSES, so the tab under it reads again and a door or an action just made is listed. */
  let drawn = $state(0);

  /* THE OWNER'S CONTROLS ON THE DOORS TAB, read as Settings reads them (`routes/settings/levels.ts` `ownsRecord`). */
  const me = $derived((page.data as unknown as Partial<Shell>).me);
  const owner = $derived(Boolean(me && (me.owner || me.level === 'owner')));

  /* THE DOORS SECTION READS ITS OWN LIST AND SAYS NOTHING TO THE READINESS COUNT, so the tab says it drew: the heading
     and the tabs are on screen, and the section's own waiting line covers the rest. */
  $effect(() => {
    if (tab === 'doors') drew('ready');
  });

  function shut() {
    drawn += 1;
    void goto(at(withoutNew(page.url)), { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

<div class="page">
  <!-- A TAB PRESSED FADES ITS TILES UP where the last tab's stood (`swapUp`, skills pass 2 Nov), where they changed in one
       frame. The head and its tabs stay. -->
  <div class="tab-body" bind:this={tabBody}>
  {#key drawn}
    {#if tab === 'automations'}
      <AutomationsTab {owner} oncount={(n) => (head.automations = n)} onsentence={(s) => (head.said = s)} />
    {:else if tab === 'scheduled'}
      <ScheduledTab />
    {:else if tab === 'scripts'}
      <ScriptsTab />
    {:else}
      <WebhookDoors {owner} />
    {/if}
  {/key}
  </div>
</div>

<NewAction open={ask !== null} kind={ask?.kind ?? 'action'} preset={ask?.preset ?? null} onclose={shut} />

<style>
  /* THE LISTS ARE TILES UNDER THEIR CHARTS, 12 apart as every board's tiles are (`--tile-gap`), as wide as the page
     allows. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }
</style>
