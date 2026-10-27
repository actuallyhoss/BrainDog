<!--
  The first-open line for somebody a share let in: "Ada shared Kiln with you. You can edit tasks
  until 1 Dec." Once for each share, on this device, with Close.

  ONLY FOR A GUEST: a person whose access shares made (`me.grant`) and who holds no role on the whole record. An owner, a
  member and an agent are never asked. The sentence is the record's (`myShares`, `welcome`), said to them by name.

  THE ONE BANNER (`Banner.svelte`, 2.A.17) on its quiet note fill, in the flow as the lapse line is: it pushes the screen
  down and never covers the tab bar.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { untrack } from 'svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { markWelcomed, readMine, welcomed, welcomeOf, type MyShare } from './sharing.ts';

  let { shell }: { shell: Shell } = $props();

  const guest = $derived(!shell.refused && !shell.stale && shell.me.grant !== undefined && !shell.me.owner && shell.me.lists !== null);
  let shown = $state<MyShare | null>(null);
  let base = '';

  $effect(() => {
    if (!guest) return;
    void shell.me.grant?.epoch;
    untrack(() => {
      base = apiBase();
      void import('@braindog/client')
        .then(({ createClient }) => readMine(createClient({ base })))
        .then((out) => {
          if (out.ok) shown = welcomeOf(out.value, welcomed(base));
        })
        .catch(() => undefined);
    });
  });

  function close(): void {
    if (shown) markWelcomed(base, shown.id);
    shown = null;
  }
</script>

{#if shown}
  <Banner tone="note" icon="link">
    {shown.welcome}
    {#snippet actions()}<Button weight="quiet" onclick={close}>{copy.sharingWelcomeClose}</Button>{/snippet}
  </Banner>
{/if}
