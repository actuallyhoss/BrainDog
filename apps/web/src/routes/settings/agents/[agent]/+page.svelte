<!--
  `/settings/agents/<agent>`: one agent's settings on a page of its own (G14), so a link to "Claude's settings" exists
  and Back works. The same screen as every Settings area (`[area]/+page.svelte`), which reads the agent off the address
  and has the Agents area draw that agent's page in place of the list.
-->
<script lang="ts">
  import Settings from '../../[area]/+page.svelte';
</script>

<Settings />
