<!--
  A key binding, printed where the thing it operates is.

  Every palette row prints its binding on its trailing edge, and this is the highest-leverage single
  component in the spec. Superhuman's own words: "If you don't know a shortcut, just hit Cmd+K …
  type in what you want to do. You can see the shortcut for next time."

  So the palette becomes the shortcut teacher, the slow path and the fast path are the same list,
  and there is no cheat sheet to keep in sync (19 §4).
-->
<script lang="ts">
  let { keys }: { keys: string } = $props();

  /** Two spaces separate alternatives; a single space separates a sequence. */
  const parts = $derived(keys.split('  '));
</script>

<span class="kbd-run">
  {#each parts as part, i}
    {#if i > 0}<span class="kbd-or">or</span>{/if}
    <kbd class="kbd">{part}</kbd>
  {/each}
</span>

<style>
  .kbd-run {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .kbd {
    display: inline-block;
    min-inline-size: 20px;
    padding: 1px 5px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-block-end-width: 2px;
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 1.5;
    text-align: center;
  }

  .kbd-or {
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
