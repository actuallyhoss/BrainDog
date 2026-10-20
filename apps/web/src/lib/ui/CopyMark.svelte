<!--
  THE QUIET MARK (`copy-mark.svelte.ts`): something on this screen was drawn from the local copy and the record is being
  asked again. Sticky and no taller than nothing, so it moves no row; it fades out once every answer has landed.

  ITS OWN FILE SO ITS STYLES ARE NOT THE ENTRY'S. The root layout asks for it as the shell mounts, as it does the
  palette, so the hairline arrives beside the first screen rather than in the stylesheet every visit waits for.
-->
<script lang="ts">
  import { copyMark } from '$lib/data/copy-mark.svelte.ts';
</script>

<div class="copy-mark" aria-hidden="true" data-on={copyMark.on ? '' : undefined}></div>

<style>
  /* A HAIRLINE OVER THE WORK, NOT ITS OWN ROW: a sticky box of no height, and its line drawn out of it. */
  .copy-mark {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-hint);
    block-size: 0;
    pointer-events: none;
  }

  .copy-mark::after {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 2px;
    content: '';
    background: var(--line);
    opacity: 0;
    transition: opacity var(--d-move) var(--ease-out);
  }

  .copy-mark[data-on]::after {
    opacity: 1;
  }
</style>
