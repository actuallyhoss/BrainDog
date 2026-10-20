<!--
  The Share sheet's way in, without the sheet (sharing plan §3.1): the "Share" button a header draws, and the sheet
  itself loaded by `import()` the first time it is opened. The sheet, its condition picker and the kernel's sentences
  are a chunk nobody who only reads a list or a page waits for.

  THE SAME TWO WAYS IN AS `ShareSheet.svelte`: a menu binds `open`, and a header asks for `trigger`, which draws the
  button here. Drawn only for somebody who may share, and never while the record is seen as somebody.
-->
<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { canShare } from './may-share.ts';
  import { seeingAs } from './see-as.svelte.ts';
  import type { Subject } from './share-state.ts';

  let {
    open = $bindable(false),
    subject,
    trigger,
  }: {
    open?: boolean | undefined;
    subject: Subject;
    /** The button's words, for a header that draws it; absent, a menu opens the sheet by binding `open`. */
    trigger?: string | undefined;
  } = $props();

  const allowed = $derived(seeingAs() === null && canShare((page.data as { me?: Parameters<typeof canShare>[0] }).me));
  /* ONCE OPENED, KEPT: the sheet stays mounted so it can close the way it came and open again at once. */
  let wanted = $state(false);
  $effect(() => {
    if (open) wanted = true;
  });
</script>

{#if allowed}
  {#if trigger}
    <Button onclick={() => (open = true)}><Icon name="external" size="s" />{trigger}</Button>
  {/if}
  {#if wanted}
    {#await import('./ShareSheet.svelte') then { default: ShareSheet }}<ShareSheet bind:open {subject} />{/await}
  {/if}
{/if}
