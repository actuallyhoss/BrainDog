<script lang="ts">
  import { flags } from '$lib/flags.ts';
</script>

{#if flags.shipped}
  <p>The branch one flag guards, so the fixture seeds exactly one violation and not two.</p>
{/if}
