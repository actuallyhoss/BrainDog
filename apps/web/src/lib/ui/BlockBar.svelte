<!--
  The arrange bar: the controls that appear on a block while a page is being arranged.

  DRAG AND KEYBOARD ARE THE SAME OPERATION, not one plus a simulation of it. Reordering a flow is a
  `splice`; the handle computes an index and calls it, and `⌥↑` calls it with `at - 1`. WCAG 2.5.7
  asks for a single-pointer alternative to dragging, and the honest form of that is a control that
  performs the same edit rather than a second implementation that drifts from the first.

  The buttons are ALWAYS VISIBLE while arranging, never on hover. A control that appears under the
  pointer cannot be reached by a keyboard user looking for it, and cannot be reached at all by
  somebody on a touch screen — where 13 §10 says authoring is read-and-approve anyway, but the bar
  still has to not lie about what exists.
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { spanLabel, stepsFor } from '../record/arrange.ts';
  import { blockWords } from '../record/block-edit.ts';

  let {
    kind,
    span,
    columns,
    at,
    count,
    onmove,
    onspan,
    onremove,
    onedit,
    widths = true,
  }: {
    /**
     * Opens the block editor on this block. ABSENT, THE BUTTON IS ABSENT, as the moves are at the ends: a body that
     * cannot edit a block (a preview) draws a bar with no Edit rather than one whose Edit does nothing.
     */
    onedit?: (() => void) | undefined;
    kind: string;
    span: number;
    /**
     * Whether Full, Half and Third are offered. NOT IN THE SIDE RAIL, which is one stack: every block there is the rail's
     * width whatever its span says, so the buttons pressed there changed a number and nothing on the screen. The span is
     * kept all the same, for the day the block is moved back to the main column.
     */
    widths?: boolean;
    /** How many columns the block declares — a table's width floor is a property of the block. */
    columns: number;
    at: number;
    count: number;
    onmove: (to: number) => void;
    onspan: (span: number) => void;
    onremove: () => void;
  } = $props();

  const steps = $derived(stepsFor(kind, columns));
</script>

<div class="bar">
  <span class="handle" aria-hidden="true"><Icon name="drag" size="s" /></span>

  <span class="kind">{copy.kindNames[kind] ?? blockWords.kindNames[kind] ?? kind}</span>

  {#if widths}
    <div class="widths" role="group" aria-label={copy.width}>
      {#each steps as step}
        <button
          type="button"
          class="width"
          data-on={span === step ? '' : undefined}
          aria-pressed={span === step ? 'true' : 'false'}
          onclick={() => onspan(step)}
        >
          {spanLabel(step)}
        </button>
      {/each}
      <!-- A span a pack wrote as 5 keeps its own number rather than being rounded onto a button.
           Inferred from the value, never stored — 21 §3.1. -->
      {#if !steps.includes(span)}
        <span class="width" data-on aria-current="true">{spanLabel(span)}</span>
      {/if}
    </div>
  {/if}

  <!--
    ABSENT AT THE ENDS, NOT GREYED THERE.

    These were the only disabled controls in the product carrying no explanation. `19 §6`'s rule is
    that a control which cannot act is absent rather than greyed out, and every other disabled
    control here points at a sentence saying why with `aria-describedby`. There is no sentence to
    write for this one: "this block is already first" is a fact the reader can see, from the block's
    position, which is the thing they are looking at.

    A DISABLED CONTROL TELLS YOU A THING EXISTS AND REFUSES TO SAY WHY IT WILL NOT WORK, and at the
    end of a list of three that is two grey buttons out of six on the screen. Absent, the bar has
    the verbs that can act and nothing else.
  -->
  <!-- WITH NO WIDTHS THE MOVES TAKE THEIR PLACE AT THE END, where the widths' own margin used to push them. -->
  <div class="moves" data-alone={widths ? undefined : ''}>
    <!-- EDIT IS A WORD, NOT A PENCIL ALONE: it opens a whole sheet about the block, which is a bigger thing than the
         three icon buttons beside it, and a reader looking for "change what this shows" reads for the word. -->
    {#if onedit}
      <button type="button" class="edit-btn" onclick={onedit} aria-label={blockWords.editLabel(copy.kindNames[kind] ?? blockWords.kindNames[kind] ?? kind)}>
        <Icon name="edit" size="s" />
        <span>{blockWords.edit}</span>
      </button>
    {/if}
    {#if at > 0}
      <button type="button" class="icon-btn" onclick={() => onmove(at - 1)} aria-label={copy.moveUp}>
        <Icon name="arrowUp" size="s" />
      </button>
    {/if}
    {#if at < count - 1}
      <button type="button" class="icon-btn" onclick={() => onmove(at + 1)} aria-label={copy.moveDown}>
        <Icon name="arrowDown" size="s" />
      </button>
    {/if}
    <button type="button" class="icon-btn" onclick={onremove} aria-label={copy.removeBlock}>
      <Icon name="close" size="s" />
    </button>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    padding: 4px 4px 4px var(--sp-2);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
  }

  .handle {
    display: grid;
    place-items: center;
    color: var(--ink-3);
    cursor: grab;
  }

  .kind {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .widths {
    display: flex;
    gap: 2px;
    margin-inline-start: auto;
    padding: 3px;
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
  }

  .width {
    min-block-size: 22px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-cap);
    font-weight: 500;
    cursor: pointer;
  }

  .width:hover:not([data-on]) {
    background: var(--hover);
    color: var(--ink-2);
  }

  /* THE CHOSEN WIDTH IS THE SEGMENTED CONTROL'S CHOSEN PILL: the tile's colour with a hairline ring, no shadow. */
  .width[data-on] {
    background: var(--tile);
    box-shadow: 0 0 0 0.5px var(--rule);
    color: var(--ink);
  }

  .moves {
    display: flex;
    gap: 2px;
  }

  .moves[data-alone] {
    margin-inline-start: auto;
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 26px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-cap);
    font-weight: 500;
    cursor: pointer;
  }

  .edit-btn:hover {
    background: var(--hover);
    color: var(--ink);
  }

  /* A THUMB'S TARGET under a coarse pointer, at any width a tablet arranges at. */
  @media (pointer: coarse) {
    .edit-btn {
      min-block-size: var(--tap);
    }
  }

  .icon-btn {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--hover);
    color: var(--ink);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* A THUMB'S TARGETS, on a touch screen of 900 and up, where the bar is drawn (below 900 it is hidden). A width was
     22px tall and a move or remove 26px square, the only controls on an arranged page a finger could miss. They follow their base rules, so the pointer's rule is the one that holds. */
  @media (pointer: coarse) {
    .width {
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }

    .icon-btn {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }
</style>
