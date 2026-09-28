<!--
  One thing an area states about this record, drawn as a row: its glyph, a short title, one line of
  what is true, and the one action that exists for it (DSN-18).

  WHY A ROW AND NOT A PARAGRAPH. Backups, Export and Billing said what a host does not do yet in
  paragraphs, three to a section and identical on both hosts, so a person had to read every sentence to
  learn there was nothing to press (design §2.12). A row says the same thing at the size of a setting:
  the title is what somebody scans for, the line is the one sentence that matters, and the action, when
  one exists, sits at the end of the row where a thumb or a pointer expects it.

  ROWS STACK WITH A HAIRLINE BETWEEN THEM and nothing around them (design brief §11.6: no panel around a
  group of rows). Two rows written one after the other draw as one list; the separator is this file's own
  `.state-row + .state-row`, so the area around them writes no list of its own.

  AT 390 THE ACTION TAKES ITS OWN LINE under the words, starting where the title starts, so a long title
  never squeezes a button off the edge and the button keeps its full label.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let {
    icon,
    title,
    line,
    action,
  }: {
    icon: IconName;
    title: string;
    /** The one sentence under the title; a row with nothing more to say leaves it out. */
    line?: string | undefined;
    /** The one action this row offers, a `Button` as a rule; a row with nothing to press leaves it out. */
    action?: Snippet | undefined;
  } = $props();
</script>

<div class="state-row" class:has-action={!!action}>
  <span class="state-icon"><Icon name={icon} size="m" /></span>
  <span class="state-words">
    <span class="state-title" dir="auto">{title}</span>
    {#if line}<span class="state-line" dir="auto">{line}</span>{/if}
  </span>
  {#if action}<span class="state-act">{@render action()}</span>{/if}
</div>

<style>
  /* THE ROW'S ANATOMY, at the height of a two-line row (`--row-h-2`), which is also the settings index's row, so an
     area's rows and the index beside it share one rhythm at 1440. The glyph sits on the title's line rather than the
     row's middle, so a line that wraps to three does not float the glyph away from the name it belongs to. */
  .state-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    column-gap: var(--sp-3);
    row-gap: var(--sp-2);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-3);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .state-row.has-action {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }

  .state-row + .state-row {
    border-block-start: 1px solid var(--line-soft);
  }

  .state-icon {
    display: inline-flex;
    align-self: start;
    padding-block-start: 2px;
    color: var(--dim);
  }

  .state-words {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .state-title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: var(--lh-tight);
    overflow-wrap: anywhere;
  }

  .state-line {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .state-act {
    display: flex;
    justify-content: end;
  }

  /* ON A PHONE, 16PX WORDS AND THE ACTION UNDER THEM. The title takes the phone's body size as every other row does
     under a thumb, and the action moves to a line of its own under the words, starting at the title's edge. */
  @media (width < 640px) {
    .state-row.has-action {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }

    .state-title {
      font-size: var(--t-md);
    }

    .state-act {
      grid-column: 2;
      justify-content: start;
    }
  }
</style>
