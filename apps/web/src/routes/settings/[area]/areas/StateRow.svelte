<!--
  One thing an area states about this record, drawn as a row: its glyph in a well, a short title, one line of what is
  true, and the one action that exists for it (the design system's row).

  WHY A ROW AND NOT A PARAGRAPH. Backups, Export and Billing said what a host does not do yet in
  paragraphs, three to a section and identical on both hosts, so a person had to read every sentence to
  learn there was nothing to press. A row says the same thing at the size of a setting:
  the title is what somebody scans for, the line is the one sentence that matters, and the action, when
  one exists, sits at the end of the row where a thumb or a pointer expects it.

  A ROW ON THE GROUND: a 28px icon well, the title at `--fs-body` 500, the line in the meta size and the
  quiet ink, 56 tall with both. Rows stack with a hairline between them and nothing around them, so two rows written
  one after the other draw as one list; the separator is this file's own `.state-row + .state-row`, and the area
  around them writes no list of its own.

  EVERY SETTINGS ROW IS THIS ROW. A switch is an action too: `action` holding a `.switch` keeps it at the row's end at
  every width, beside the sentence it governs, and the row's measure keeps it from standing a page away from it. The
  trailing edge is one x on every area, so a person's eye finds the control where it found the last one.

  AT 390 A BUTTON TAKES ITS OWN LINE under the words, starting where the title starts, so a long title never squeezes
  a button off the edge and the button keeps its full label. A switch stays where it is: it is 44 wide and a line of
  its own would part it from its sentence.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let {
    icon,
    title,
    line,
    action,
    tone,
  }: {
    icon: IconName;
    /** `warn` on the one row that waits on the reader (a night that did not run); every other row is untoned. */
    tone?: 'warn' | undefined;
    title: string;
    /** The one sentence under the title; a row with nothing more to say leaves it out. */
    line?: string | undefined;
    /** The one action this row offers, a `Button` or a switch as a rule; a row with nothing to press leaves it out. */
    action?: Snippet | undefined;
  } = $props();
</script>

<div class="state-row" class:has-action={!!action}>
  <span class="state-icon"><IconWell name={icon} {tone} /></span>
  <span class="state-words">
    <span class="state-title" dir="auto">{title}</span>
    {#if line}<span class="state-line" dir="auto">{line}</span>{/if}
  </span>
  {#if action}<span class="state-act">{@render action()}</span>{/if}
</div>

<style>
  /* THE ROW'S ANATOMY, at the height of a two-line row (`--row-h-2`). The well sits on the title's line rather than the
     row's middle, so a line that wraps to three does not float the glyph away from the name it belongs to: the well is
     28 and the title's line is 20, so it starts 4 above the title and ends 4 below it.

     THE WHOLE TILE WIDE (agents F19): the words keep to 75 characters, and the action, a switch or a button, stands at
     the tile's end edge, where every settings row puts it, never 350px short of it. */
  .state-row {
    position: relative;
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr);
    align-items: start;
    column-gap: var(--sp-3);
    row-gap: var(--sp-2);
    min-block-size: var(--row-h-2);
    /* EQUAL AIR EACH SIDE OF THE HAIRLINE between two rows (`--divider-space`). */
    padding-block: var(--divider-space);
  }

  .state-row.has-action {
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
  }

  /* A ROW OF ONE LINE IS CENTRED ON ITS HEIGHT (P42): its title, well and switch on the row's
     middle, not its words at the top of a 56px row with the space under them. */
  .state-row:not(:has(.state-line)) {
    align-items: center;
  }

  .state-row:not(:has(.state-line)) .state-icon {
    align-self: center;
    margin-block-start: 0;
  }

  .state-row:not(:has(.state-line)) .state-act {
    margin-block: 0;
  }

  /* THE HAIRLINE RUNS UNDER THE WORDS, from the title's edge, as a list's does on the ground: the well column is the
     group's margin, and a line cut through it reads as a table's rule. */
  /* `:global` ON THE ONE BEFORE, because it is another instance of this component: a row cannot see its sibling from
     inside itself, so a scoped `.state-row + .state-row` matches nothing the compiler can find and is dropped. */
  :global(.state-row) + .state-row::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--well) + var(--sp-3)) 0;
    block-size: 1px;
    background: var(--rule);
    pointer-events: none;
  }

  .state-icon {
    display: inline-flex;
    align-self: start;
    margin-block-start: calc((var(--lead-ui) - var(--well)) / 2);
  }

  .state-words {
    display: grid;
    gap: var(--row-stack);
    min-inline-size: 0;
  }

  .state-title {
    max-inline-size: 75ch;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  .state-line {
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE ACTION ON THE TITLE'S LINE, and a control taller than the line centred on it rather than hanging below it. */
  .state-act {
    display: flex;
    align-items: center;
    justify-content: end;
    min-block-size: var(--lead-ui);
    margin-block: calc((var(--lead-ui) - var(--ctl-h)) / 2);
  }

  /* ON A PHONE: a button on a line of its own under the words. The row keeps the desk's 56 (`--row-h-2`): 60 on a phone
     made a one-line row taller there than the same row at a desk. */
  @media (width < 640px) {
    .state-row.has-action:not(:has(.state-act :global(.switch))) {
      grid-template-columns: var(--well) minmax(0, 1fr);
    }

    .state-row:not(:has(.state-act :global(.switch))) .state-act {
      grid-column: 2;
      justify-content: start;
      margin-block: 0;
    }
  }
</style>
