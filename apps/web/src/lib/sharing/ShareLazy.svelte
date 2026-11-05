<!--
  The Share sheet's way in, without the sheet: the "Share" button a header draws, and the sheet
  itself loaded by `import()` the first time it is opened. The sheet, its condition picker and the kernel's sentences
  are a chunk nobody who only reads a list or a page waits for.

  THE SAME TWO WAYS IN AS `ShareSheet.svelte`: a menu binds `open`, and a header asks for `trigger`, which draws the
  button here. Drawn only for somebody who may share, and never while the record is seen as somebody.

  ON FREE OR CLOUD, SHARING IS PLUS'S: the button is one plain line, "Sharing comes with Plus", and a menu that asks to
  open the sheet gets the same line as a toast. The sheet is never opened to refuse. IN THE IPHONE APP NO PLAN IS NAMED
  (App Store 3.1.1): the button is not drawn, and a menu's ask says only that sharing is not on here.
-->
<script module lang="ts">
  import { readBilling } from '../../routes/settings/billing.ts';

  /* THE PLAN, ASKED ONCE FOR THE TAB. */
  let asked: ReturnType<typeof readBilling> | null = null;
</script>

<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { inStoreApp } from '$lib/shell.ts';
  import { hostedHere, type BillingAnswer } from '../../routes/settings/billing.ts';
  import { canShare, needsPlus } from './may-share.ts';
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

  const shell = $derived(page.data as Shell);
  const allowed = $derived(seeingAs() === null && canShare(shell.me));
  /* ONLY THE CLOUD HAS A PLAN TO ASK ABOUT; an answer that does not come leaves the sheet to open and the record's own refusal to speak. */
  let billing = $state.raw<BillingAnswer | null>(null);
  $effect(() => {
    if (!allowed || !hostedHere(shell)) return;
    void (asked ??= readBilling()).then((out) => {
      if (out.ok) billing = out.value;
    });
  });
  const plus = $derived(needsPlus(billing, shell.index?.slug));
  $effect(() => {
    if (open && plus) {
      open = false;
      toasts.push(inStoreApp ? copy.shareNotOnPlan : copy.shareNeedsPlus);
    }
  });
  /* ONCE OPENED, KEPT: the sheet stays mounted so it can close the way it came and open again at once. */
  let wanted = $state(false);
  $effect(() => {
    if (open) wanted = true;
  });
</script>

{#if allowed}
  {#if trigger && plus && inStoreApp}
    <!-- NOTHING TO PRESS AND NO PLAN NAMED. -->
  {:else if trigger && plus}
    <span class="share-plus">{copy.shareNeedsPlus}</span>
  {:else if trigger}
    <Button onclick={() => (open = true)}><Icon name="external" size="s" />{trigger}</Button>
  {/if}
  {#if wanted && !plus}
    {#await import('./ShareSheet.svelte') then { default: ShareSheet }}<ShareSheet bind:open {subject} />{/await}
  {/if}
{/if}

<style>
  .share-plus {
    color: var(--ink-3);
    font-size: 0.875em;
  }
</style>
