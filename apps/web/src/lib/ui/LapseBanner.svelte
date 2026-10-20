<!--
  Where the shell's lapse line goes (`LapseLine.svelte`), and nothing else.

  THE LINE IS LOADED ON THE CLOUD ONLY. Its reader, its words and its buttons rode in front of the first paint on every
  host, and only the Cloud has billing that can lapse (`hostedHere` in `routes/settings/billing.ts`, read here as the
  same two fields so this file stays the size of its job). The line itself still asks the Cloud before it draws, so a
  record in good standing draws nothing either way.
-->
<script lang="ts">
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import type LapseLineView from './LapseLine.svelte';

  let { shell }: { shell: Shell } = $props();

  let Line = $state<typeof LapseLineView | null>(null);

  $effect(() => {
    if (Line !== null || !(shell.live && shell.host === 'cloud')) return;
    void import('./LapseLine.svelte').then((m) => (Line = m.default));
  });
</script>

{#if Line}<Line {shell} />{/if}
