<!--
  `panel: new-action`: one button that opens the "New scheduled action" sheet (`NewAction.svelte`), on any page that
  names it.

  THE SHEET IS MOUNTED AND NOT REWRITTEN. It is handed what the automations hub hands it, `open`, `kind` and `onclose`,
  and asks its own questions; this panel draws only its button, under the heading its section already gives it.

  ONLY THE OWNER, as the kernel's table says (`level: owner`): `BlockSlot.svelte` mounts it for the owner alone and hands
  `owner`, and the button is drawn only when it is true, so a page read by anyone else shows nothing here.

  REACHED BY `import()` FROM `index.ts`, so neither this button nor the sheet behind it is in the entry chunk.
-->
<script lang="ts">
  import { actionWords as w } from '$lib/record/action-draft.ts';
  import Button from '$lib/ui/Button.svelte';
  import NewAction from '$lib/ui/NewAction.svelte';

  let { owner = false }: { owner?: boolean } = $props();

  let open = $state(false);
</script>

{#if owner}
  <div class="new-action" data-part="new-action">
    <Button weight="primary" onclick={() => (open = true)}>{w.newAction}</Button>
  </div>
  <NewAction {open} kind="action" onclose={() => (open = false)} />
{/if}

<style>
  .new-action {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding-block: var(--sp-1);
  }
</style>
