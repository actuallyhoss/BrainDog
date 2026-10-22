<!--
  The design book, at `/design` (the UI pass of 20 October, agents F29): the two sheets the product's look is judged by
  (EXP-C01), and the design book beside them. "Controls and lists" and "Charts and marks", each drawn by
  the product's own parts from the record this is opened on. It was a Settings area; it is a reference for designers and
  agents, not a choice, so it is reached from Settings' "⋯ › Design book" and `/settings/look` comes here.

  ONE SHEET AT A TIME, CHOSEN IN THE ADDRESS. `#charts` is the second sheet, `#design` the book and anything else the
  first, so each has an address a person can send and the photographer can open, and the choice survives a reload. The
  address is rewritten in place: choosing a sheet is not a step to go back over.

  THE WORDS ARE IN HERE, with the page.
-->
<script lang="ts">
  import { page } from '$app/state';
  /* THE STYLESHEETS A DECLARED PAGE'S BLOCKS ARE DRAWN WITH, as `PageView` loads them: the sheets and the book draw the
     product's own blocks and charts, and without these a chart showed as its data table. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import '$lib/page/kinds/styles.ts';
  import { titleOf } from '$lib/title.ts';
  import SheetCharts from '$lib/design/SheetCharts.svelte';
  import DesignBook from '$lib/design/DesignBook.svelte';
  import SheetControls from '$lib/design/SheetControls.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';

  /* THE SHELL THE LAYOUT ASKED FOR ONCE: the charts sheet reads the record's pages through it; the others read nothing. */
  const shell = $derived(page.data as unknown as Shell);

  const SHEETS = ['controls', 'charts', 'design'] as const;
  type Sheet = (typeof SHEETS)[number];

  const words = {
    title: 'Design book',
    back: 'Settings',
    lead: 'Every control and every chart, drawn by the product itself from what this record holds.',
    which: 'Which sheet',
    controls: 'Controls and lists',
    charts: 'Charts and marks',
    design: 'Tokens and type',
  } as const;

  const named = (): Sheet => (location.hash === '#charts' ? 'charts' : location.hash === '#design' ? 'design' : 'controls');
  let sheet = $state<Sheet>(named());

  function choose(next: Sheet): void {
    sheet = next;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${next === 'controls' ? '' : `#${next}`}`);
  }

  /* DRAWN AT ONCE: every sheet is the product's own parts, with nothing to wait for. */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<!-- A LINK SOMEBODY FOLLOWS WHILE THE PAGE IS OPEN changes the hash and loads nothing, so the sheet follows it here. -->
<svelte:window onhashchange={() => (sheet = named())} />

{#snippet sheets()}
  <Segmented full class="look-which" role="group" aria-label={words.which}>
    {#each SHEETS as s (s)}
      <button type="button" class="segment" aria-pressed={sheet === s} data-on={sheet === s ? '' : undefined} onclick={() => choose(s)}>{words[s]}</button>
    {/each}
  </Segmented>
{/snippet}

<PageHead icon="eye" kicker={words.back} back="/settings" title={words.title} sentence={words.lead} below={sheets} />

<div class="look">
  {#if sheet === 'charts'}
    <SheetCharts {shell} />
  {:else if sheet === 'design'}
    <DesignBook />
  {:else}
    <SheetControls />
  {/if}
</div>

<style>
  /* THE PAGE'S WIDTH, with its gutter: the sheets lay their own tiles out in it. */
  .look {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }
</style>
