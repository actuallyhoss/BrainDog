<!--
  The row menu: `⇧F10`, and the context-menu key beside it. It is `Menu.svelte` opened at the row's rect (the UI pass
  of 20 October, 2.A.13: one menu), with one item of its own.

  IT IS ANCHORED TO THE ROW, not to a trigger, because there is no trigger: the row is a grid cell and the menu is
  opened from the keyboard. So it hands `Menu` the row's rect, and `Menu` places the list there, clamped to the screen,
  flipping above the row when the row is near the bottom. Under a thumb it is the bottom sheet, as every menu is.

  EVERY ITEM IS A KEY THAT ALREADY EXISTS. Open is `↵`, Peek is `p`, Copy is `y`, the list is `o`, Archive is `⌫`. The
  menu is not a second set of capabilities; it is the same set, discoverable by looking, and each row prints its own
  key, so using the menu teaches the key that replaces it.

  "HAND TO" IS THIS MENU'S OWN ITEM, last before Cancel, on a row of a list that says who holds its rows and for
  somebody who may change it, at every width. The sheet it opens lives outside the menu, since the menu closes on the
  press, and its code is fetched on the first press, so the rail that also uses this menu carries none of it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import type { Shell } from '../record/boot-live.ts';
  import { may } from '../record/may.ts';
  import type { Entry, RegisterDecl } from '../record/schema.ts';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import { VERB_ICONS } from '../things/verbs.ts';

  type Handed = { register: string; row: Entry; decl: RegisterDecl; onhanded?: ((entry: Entry) => void) | undefined };

  let {
    open = $bindable(false),
    at,
    label,
    onclose,
    hand = null,
    children,
  }: {
    open?: boolean;
    /** The focused row's viewport rect. Taken at open, not tracked: a menu that follows a scrolling row is a menu that
        walks away from the pointer. */
    at: { x: number; y: number; height: number } | null;
    label: string;
    onclose?: () => void;
    /** The row the menu is about, its list, and what to do with the row a hand leaves; absent, there is no "Hand to". */
    hand?: Handed | null | undefined;
    children: Snippet;
  } = $props();

  /* ONLY ON A LIST THAT DECLARES `hand:` AND FOR SOMEBODY WHO MAY CHANGE ITS ROWS: a control that cannot act is absent
     rather than greyed (`19 §6`). The sheet asks both again before it draws anything. */
  const handable = $derived(
    hand != null && (hand.decl as unknown as { hand?: unknown }).hand != null && may(page.data as unknown as Shell, 'write', hand.register),
  );
  /* THE ROW AS IT WAS WHEN "HAND TO" WAS PRESSED, since the menu closing lets its caller forget which row it was on. */
  let handing = $state<Handed | null>(null);
  let handOpen = $state(false);
</script>

<Menu {label} bind:open {at} {onclose}>
  {@render children()}
  {#if handable && hand}
    <button
      type="button"
      role="menuitem"
      onclick={() => {
        handing = hand ?? null;
        handOpen = true;
      }}
    >
      <Icon name={VERB_ICONS.hand} size="s" />
      <span class="mi-name">{copy.handTo}</span>
    </button>
  {/if}
</Menu>

{#if handing}
  {#await import('./HandSheet.svelte') then loaded}
    <loaded.default bind:open={handOpen} register={handing.register} row={handing.row} decl={handing.decl} onhanded={handing.onhanded} />
  {/await}
{/if}
