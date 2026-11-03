<!--
  Changed for you, as one line at the foot of the board: "5 changes on this page by your rules this week", and
  Review, which opens the list in the docked panel (`ChangesPanel.svelte`). It was five lines over the page's questions,
  each with a bank's name in capitals and "Categorise what cleared · 5w ago Undo", and it was noise above the work.

  THE ROWS THEMSELVES STILL WEAR A FAINT TINT until they are seen (`PageBody.svelte`), and each row's panel still says
  who changed it with its Undo, so nothing is lost by saying the week once. Not drawn while the week holds none.

  A TILE OF ITS OWN, as everything on the board is: the history glyph in its well, the sentence, and the one action.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { RowHost } from './row-host.svelte.ts';
  import { bylineWords, changedLine } from './byline.ts';

  let { host }: { host: RowHost } = $props();

  const line = $derived(changedLine(host.bylines.values(), host.readAt()));
  /* WHETHER ANY OF THEM IS NEW TO THE READER, which the line says with one dot and no more. */
  const fresh = $derived([...host.bylines.values()].some((b) => b.unseen));
</script>

{#if line}
  <section class="changed" aria-labelledby="changed-h">
    <IconWell name="history" />
    <h2 class="changed-said" id="changed-h">
      {#if fresh}<span class="changed-new" aria-hidden="true"></span>{/if}{line.text}
    </h2>
    <Button size="sm" onclick={() => host.openChanges()}>{bylineWords.review}</Button>
  </section>
{/if}

<style>
  /* THE LAST TILE ON THE BOARD, the whole row, one line high: the glyph, the sentence and Review at its end. */
  .changed {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  /* NOT DRAWN WHILE A BLOCK ABOVE IT IS STILL READING (nojump, 2 Nov): the line stands at the foot of the board, so it was
     drawn under a board that held its heading alone, then pushed down by the board's Loading and again, off a phone's
     screen, by the board (Projects, 0.080). It keeps its place in the layout, unseen, until nothing on the page says it
     is reading, and never longer than 5s, so a read that hangs hides it for no longer than that. */
  :global(.page:has(.block-slot [aria-busy='true'])) > .changed {
    visibility: hidden;
    animation: changed-shown 0s linear 5s forwards;
  }
  @keyframes changed-shown {
    to {
      visibility: visible;
    }
  }

  .changed-said {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  /* SOMETHING IN IT IS NEW SINCE THE READER LAST LOOKED: a small dot in ink, never the red that means late. */
  .changed-new {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--ink);
    border-radius: var(--r-round);
  }

  @media (forced-colors: active) {
    .changed {
      border: 1px solid CanvasText;
    }
  }
</style>
