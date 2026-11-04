<!--
  THE PHONE'S WAY IN TO ADDING A ROW: a "+" in the head's action slot.

  Below 640px the capture line is not drawn over the list, because it stood above the search box and
  the filters and put three rows of controls before the first card. This opens `CaptureLine`'s sheet,
  with the field focused and "All fields" beside Add. From 640px up it is not drawn at all: the line
  is on the page there, and it is the list's one way to add.

  A BUTTON NAMED BY WHAT IT DOES, "Add an item", since a bare "+" says nothing to a screen reader.
  The page owns whether the sheet is open, so this only asks for it.

  IT IS THE PHONE'S ONE PRIMARY: the accent's square with the plus in the tile's colour.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let { one, onclick }: { one: string; onclick: () => void } = $props();
</script>

<button type="button" class="capture-open tap" aria-label={copy.captureIn(one)} title={copy.captureIn(one)} aria-haspopup="dialog" {onclick}>
  <Icon name="plus" size="l" />
</button>

<style>
  .capture-open {
    display: none;
  }

  /* 44 ON BOTH AXES UNDER A THUMB, IN THE ACCENT: the head's one primary as a circle, as every "+" is. */
  @media (width < 640px) {
    .capture-open {
      display: inline-grid;
      place-items: center;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: var(--red-fill);
      border: 0;
      border-radius: var(--r-pill);
      color: var(--on-red);
      cursor: pointer;
    }
  }

  @media (forced-colors: active) {
    .capture-open {
      border: 1px solid ButtonText;
    }
  }
</style>
