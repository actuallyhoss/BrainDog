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

  WHAT ONLY A PAGE HAS READ (how many, and the sentence) reaches the head through `hub-head.ts`, and is cleared when
  the tab changes, so the head says nothing a page has not read on this visit.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { words } from '$lib/flow/flow.ts';
  import HubTabs from './HubTabs.svelte';
  import { hubWords as w, type Tab } from './hub.ts';
  import { clearHead, emptyHead, headFor, shareHead, tabHere } from './hub-head.ts';

  let { children }: { children: Snippet } = $props();

  /* THE PHONE'S HEAD (PageHead under 900px, agents F8): the tabs go under the sentence, the whole width, and the tab's
     one primary is the 44px button with the plus on the name's row. Beside the name they cut "Automations" in two and
     left the primary on a row of its own. */
  const phone = new MediaQuery('(width < 900px)', false);

  const head = $state(emptyHead());
  shareHead(head);

  const tab = $derived(tabHere(page.route.id, page.url.searchParams));
  const shown = $derived(tab ? headFor(tab, head) : null);
  const make = $derived(
    tab === 'automations'
      ? { href: '/automations/new', label: words.newOne }
      : tab === 'scheduled'
        ? { href: '/automations?tab=scheduled&new=action', label: w.newAction }
        : tab === 'scripts'
          ? { href: '/scripts/new', label: w.newScript }
          : null,
  );

  /* A TAB LEFT TAKES ITS FIGURES WITH IT. The head lives as long as this layout, so the count and the sentence read
     on one visit to a tab were still here on the next, shown as today's until the page had read again. `$effect.pre`,
     not `$effect`: a page says its count in a plain effect as it is drawn, and a clear that ran after that would wipe
     the fresh figure for good. It follows the tab alone, so a sheet opening over a tab blanks nothing. */
  $effect.pre(() => {
    void tab;
    clearHead(head);
  });
</script>

<!-- THE TABS ARE THE TOOLBAR'S SEGMENTED CONTROL, beside the one primary action, which is the tab's own: "New
     automation", "New scheduled action", "New script", and none on Doors, whose section carries "New door" for an
     owner, and none on Runs, where nothing is made. -->
<!-- THE TABS ARE DRAWN ONCE, UNDER THE SENTENCE AT EVERY WIDTH (1 Nov): beside it at a desk they took 360px of the
     sentence's row, so "23 scripts ran 472 times this month, on their clocks and when an automation started one." broke
     onto a second line at 1440 beside four tabs and New script. The row is the sentence and the tab's one primary; the
     tabs are the row under it, at their own width on a desk and the whole width on a phone. -->
{#snippet tabs(at: Tab)}<HubTabs here={at} full={phone.current} />{/snippet}

<!-- ON RUNS THE NAME IS "Runs": its count is the runs', and "Automations 4" over a list of
     runs said a number of something else. -->
{#if tab && shown}
  <PageHead icon="refresh" title={tab === 'runs' ? w.tab.runs : words.heading} count={shown.count} sentence={shown.sentence} needs={shown.needs}>
    {#snippet actions()}
      {#if make && phone.current}
        <Button weight="primary" href={make.href} aria-label={make.label} data-circle><Icon name="plus" size="s" /></Button>
      {:else if make}
        <Button weight="primary" href={make.href}>{make.label}</Button>
      {/if}
    {/snippet}
    {#snippet below()}{@render tabs(tab)}{/snippet}
  </PageHead>
{/if}

{@render children()}
