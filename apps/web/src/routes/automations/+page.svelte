<!--
  Automations: `/automations`, one place for everything that runs by itself (`loop/finish/shell.md` EDT-3).

  FIVE TABS IN ONE CONTROL: Automations, Scheduled (calls, polls and pulls), Scripts, Doors, and Runs. They were four
  corners of the product (this list, a project's "Runs on", `/scripts`, and Settings, Ingest) and nowhere listed a run
  of each, so "what does this record do on its own" had no single answer. Each tab draws its kind in the words that
  kind's own screen uses, through one row shape (`HubRows.svelte`), and each row opens that kind's own screen. Runs is
  its own address, `/automations/runs`; the other four are `?tab=` here, and the rules live in `hub.ts`.

  ONE ROW EACH, TWO LINES: its name and what it is, then where it stands. The second line is the verdict and wraps
  rather than losing its end to an ellipsis, which on a phone was exactly the part that said what to do.

  THE NEW-ACTION SHEET OPENS FROM THE ADDRESS, `?new=door` or `?new=action&preset=<id>` (`contracts.md` X57), so a
  declared page links to a sheet already filled in and this hub is the one reader. Closing it takes the two keys off
  the address and redraws the tab under it, so what was just made shows without a reload.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import NewAction from '$lib/ui/NewAction.svelte';
  import WebhookDoors from '$lib/ui/WebhookDoors.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import HubTabs from './HubTabs.svelte';
  import AutomationsTab from './AutomationsTab.svelte';
  import ScheduledTab from './ScheduledTab.svelte';
  import ScriptsTab from './ScriptsTab.svelte';
  import { hubWords as w, newOf, tabOf, withoutNew, type Sentence } from './hub.ts';

  const tab = $derived(tabOf(page.url.searchParams));
  const ask = $derived(newOf(page.url.searchParams));

  /* THE HEADING COUNTS AUTOMATIONS ONLY ON ITS OWN TAB, as it did when this was the list; a count of five kinds at
     once would be a sum nobody asked for. */
  let count = $state<number | undefined>(undefined);
  /* AND THE SENTENCE UNDER IT, from the same read: how many run by themselves, and which one is failing. */
  let said = $state<Sentence | null>(null);

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

<!-- THE TABS ARE THE TOOLBAR'S GLASS SEGMENTED CONTROL, beside the one primary action, which is the tab's own: "New
     automation", "New scheduled action", "New script", and none on Doors, whose section carries "New door" for an owner
     (SCREENS, Automations). -->
<PageHead
  icon="refresh"
  title={words.heading}
  count={tab === 'automations' ? count : undefined}
  sentence={tab === 'automations' ? said?.text : undefined}
  needs={tab === 'automations' && said?.needs ? said.needs : undefined}
>
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
<div class="page">
  {#key drawn}
    {#if tab === 'automations'}
      <AutomationsTab oncount={(n) => (count = n)} onsentence={(s) => (said = s)} />
    {:else if tab === 'scheduled'}
      <ScheduledTab />
    {:else if tab === 'scripts'}
      <ScriptsTab />
    {:else}
      <WebhookDoors {owner} />
    {/if}
  {/key}
</div>

<NewAction open={ask !== null} kind={ask?.kind ?? 'action'} preset={ask?.preset ?? null} onclose={shut} />

<style>
  /* THE LISTS SIT ON THE GROUND UNDER THEIR TILES, 20 apart, as wide as the page allows (SYSTEM §4, §5). */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }
</style>
