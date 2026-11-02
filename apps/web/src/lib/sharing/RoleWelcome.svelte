<!--
  The first-open line for somebody given a role on the whole BrainDog (collab pass, 2 Nov): "You're on Kiln Studio as
  Can decide. You can see and change everything, answer what needs a decision, and invite people. You can't open Keys,
  change add-ons or settings, export, or make an owner." With "Who can do what" and Close.

  A NEW COLLEAGUE LANDED ON A TODAY THAT SAID NOTHING ABOUT THEM. The guest a share let in was told what she could do
  (`Welcome.svelte`); somebody invited with a role was not, and found out by pressing. Once for each role on this device,
  so a role changed later is said again, and never to an owner or an agent.

  THE ONE BANNER, on its quiet note fill, as `Welcome.svelte` draws it.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { ROLES } from './roles.ts';
  import type { Level } from '$lib/record/schema.ts';

  let { shell }: { shell: Shell } = $props();

  const level = $derived<Level | null>(
    !shell.refused && !shell.stale && !shell.me.owner && shell.me.lists === null && Object.hasOwn(ROLES, shell.me.level) && shell.me.level !== 'owner'
      ? (shell.me.level as Level)
      : null,
  );
  const key = $derived(`bd_role_welcomed:${apiBase()}`);
  const seen = (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  let closed = $state(false);
  const shown = $derived(level !== null && !closed && seen(key) !== level);
  const where = $derived(shell.index.name || 'this BrainDog');

  function close(): void {
    try {
      if (level !== null) localStorage.setItem(key, level);
    } catch {
      /* blocked storage: the line shows again next open, the safe side */
    }
    closed = true;
  }
</script>

{#if shown && level !== null}
  <Banner tone="note" icon="user-check">
    You're on {where} as <strong>{ROLES[level].name}</strong>. You can {ROLES[level].can.charAt(0).toLowerCase()}{ROLES[level].can.slice(1)}
    {(ROLES[level].cantYou ?? ROLES[level].cant).replace(/^Can't/u, "You can't")}
    {#snippet actions()}
      <Button weight="quiet" href="/settings/roles">Who can do what</Button>
      <Button weight="quiet" onclick={close}>Close</Button>
    {/snippet}
  </Banner>
{/if}
