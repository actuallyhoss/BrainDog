<!--
  What somebody who may only add sees in place of a page that reads the record (collab pass 3): the record's own sentence
  ("You can add to this BrainDog and you cannot read it here...") and the one thing that is hers to do, make her agent's
  key, as Today already drew it. The page under it is never mounted, so nothing is asked that she would be refused.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  let { fix }: { fix: string } = $props();
</script>

<div class="append-only">
  <Empty kind="no-permission" title={fix}>
    {#snippet actions()}<Button weight="primary" href="/settings/agents">{copy.inviteMakeAgentKey}</Button>{/snippet}
  </Empty>
</div>

<style>
  .append-only {
    max-inline-size: 640px;
    margin: var(--inset) auto 0;
    padding-inline: var(--gutter);
  }
</style>
