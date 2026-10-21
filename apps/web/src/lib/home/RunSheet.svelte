<!--
  One run's controls from Today (agents and MCP plan §2.1: "Tell, Pause and Stop on any live run row, on Today and on
  the Agents page"): the run as the Agents page draws it, with Pause and Stop and the honest line about what reaches
  it, then the box to tell it something, aimed at it, and what he told it already.

  NOTHING OF ITS OWN. Both halves are the Agents page's panels scoped to the run (`PresencePanel`, `TellPanel` with
  `run`), so a stop pressed here asks the same question and says the same thing as one pressed there. Read only while
  open: a closed sheet draws nothing and asks the record nothing.
-->
<script lang="ts">
  import Sheet from '$lib/ui/Sheet.svelte';
  import PresencePanel from '$lib/page/panels/PresencePanel.svelte';
  import TellPanel from '$lib/page/panels/TellPanel.svelte';

  let {
    open = $bindable(false),
    run,
    title,
  }: {
    open?: boolean;
    /** The run, by handle (`S883`), handed to the panels and never drawn. */
    run: string;
    /** "Claude on Kiln". */
    title: string;
  } = $props();
</script>

<Sheet bind:open {title}>
  {#if open}
    <div class="run-sheet" data-run-sheet>
      <PresencePanel owner {run} />
      <TellPanel owner {run} first={3} />
    </div>
  {/if}
</Sheet>

<style>
  .run-sheet {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* THE RUN'S ROW STARTS THE SHEET: no step under a heading, since the sheet's title is its heading. */
  .run-sheet :global(.pres) {
    margin-block-start: 0;
  }
</style>
