<!--
  WHERE THE QUICK-ADD SHEET IS DRAWN FROM: the `+` key and the sheet itself. On a phone a money page's head offers Add a
  movement (`page/PageView.svelte`), which opens the same sheet; the floating + it replaced sat on the rows' amounts.

  A DECLARED PAGE MOUNTS ONE (`page/PageView.svelte`), so the key and the palette's three rows work on every page the
  record draws, Today included, and on none of the hand-written screens. Several readers on one screen mount several;
  the first one draws and answers, the rest wait (`quick.svelte.ts`).

  THE LEDGER IS FOUND ONCE A RECORD, from the declarations the tab already holds (`read.ts` `findLedger`), and the sheet
  and its reads arrive only when it is opened.

  THE KEY STANDS DOWN AS THE SHELL'S OWN KEYS DO: while a box has the caret, while anything is open over the page, with a
  modifier held, and when character keys are switched off (`a11y/chars.ts`).
-->
<script lang="ts">
  import { page } from '$app/state';

  import { apiBase } from '$lib/at.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { inField } from '$lib/a11y/typed.ts';
  import { quick } from './quick.svelte.ts';

  const lists = $derived((page.data as { lists?: { id: string; kernel?: true }[]; live?: boolean } | undefined)?.lists ?? []);
  const live = $derived((page.data as { live?: boolean } | undefined)?.live === true);

  let ticket = $state<number | null>(null);
  $effect(() => {
    const t = quick.join();
    ticket = t;
    return () => {
      quick.leave(t);
      ticket = null;
    };
  });
  const leads = $derived(ticket !== null && quick.leads(ticket));

  /* THE LEDGER OF THIS RECORD, asked once it is known which lists it holds. A record left for another is asked again. */
  $effect(() => {
    if (!leads || !live || lists.length === 0) return;
    const base = apiBase();
    if (quick.base === base) return;
    quick.found(base, null);
    const asked = lists;
    void import('./read.ts')
      .then((m) => m.findLedger(base, asked))
      .then((l) => {
        if (quick.base === base) quick.found(base, l);
      })
      .catch(() => undefined)
      .then(() => quick.settle(base));
  });

  function onkeydown(e: KeyboardEvent) {
    if (!leads || e.key !== '+' || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (covered() || typing() || inField(e.target) || silenced(e)) return;
    if (!quick.start('out')) return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

{#if leads && quick.open && quick.ledger && quick.base}
  {#await import('./QuickAdd.svelte') then { default: QuickAdd }}
    <QuickAdd ledger={quick.ledger} base={quick.base} {lists} />
  {/await}
{/if}
