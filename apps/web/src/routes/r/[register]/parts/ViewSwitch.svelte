<!--
  How the list is drawn, from 640px up: the table, the board or the cards, and first, on a list of people that says who
  is with which organisation, those people in groups. ONE SEGMENTED CONTROL at the end of the list's toolbar:
  one rectangle in the field's fill, and the chosen view the tile's colour on it, which slides to the
  view chosen next (`Segmented.svelte`, `controls.css`).

  THE CHOICE IS THE ADDRESS'S (`?view=`), written by the page's `setView`, so a link to a board opens on the board and
  Back undoes a switch. The board is offered only where the list has lanes to draw (`laneFieldOf`). Below 640 there is
  no choice to make: a phone draws the list as cards, so the control is not drawn there.

  A SEGMENT IS ITS GLYPH AND ITS WORD, and the word goes below 900 where the toolbar is short of room; it stays in the
  button for a screen reader, and the glyph keeps a tooltip.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import type { View } from './list.ts';

  let {
    view,
    board,
    groups = null,
    groupsWord = 'Groups',
    onview,
  }: {
    view: View;
    board: boolean;
    /** A list of people by organisation, which opens grouped and offers it first: the list's own glyph, or null. */
    groups?: IconName | null;
    /** What the grouped view is called: "Groups" for people, "List" for the runs' ledger. */
    groupsWord?: string;
    onview: (view: View) => void;
  } = $props();

  /* This part's own words. */
  const words = { group: 'Show the list as', groups: 'Groups', table: 'Table', board: 'Board', cards: 'Cards' } as const;

  const views = $derived(
    (
      [
        ['groups', groups ?? 'rows'],
        ['table', 'rows'],
        ['board', 'board'],
        ['cards', 'grid'],
      ] as const satisfies readonly (readonly [View, IconName])[]
    ).filter(([v]) => (v !== 'board' || board) && (v !== 'groups' || groups !== null)),
  );
</script>

<Segmented class="view-switch" role="group" aria-label={words.group}>
  {#each views as [v, glyph] (v)}
    <button
      type="button"
      class="segment view-seg"
      data-on={view === v ? '' : undefined}
      aria-pressed={view === v ? 'true' : 'false'}
      title={v === 'groups' ? groupsWord : words[v]}
      onclick={() => {
        if (view !== v) onview(v);
      }}
    >
      <Icon name={glyph} size="s" /><span class="view-word">{v === 'groups' ? groupsWord : words[v]}</span>
    </button>
  {/each}
</Segmented>

<style>
  /* ONE ROW, THE TOOLBAR'S HEIGHT: the track and its segments are `controls.css`'s; this only keeps it on one line and
     sets the glyph beside the word. The track is `Segmented`'s own element, so its rules reach it by this part's name. */
  :global(.view-switch) {
    flex-wrap: nowrap;
    flex: none;
  }

  .view-seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  @media (width < 900px) {
    .view-seg {
      padding-inline: var(--sp-2);
    }

    .view-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* A PHONE DRAWS CARDS, so there is nothing here to choose. */
  @media (width < 640px) {
    :global(.view-switch) {
      display: none;
    }
  }
</style>
