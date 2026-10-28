<!--
  The menu of an item that has verbs and no "…" drawn: `Menu` at a rect, opened where the item was right-clicked or
  held, or at the item from `⇧F10`. The item carries `ownMenu` (`context-menu.ts`), which hands this the point. Each
  item is one of the thing's own verbs, so the menu adds no capability: it gathers the ones it already has where the
  pointer is. An item with a page of its own leads with Open and ends with Copy link; the caller's verbs go between.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { at as inApp } from '../at.ts';
  import { putHref } from '../clipboard.ts';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';

  let {
    label,
    at = $bindable(null),
    href = null,
    children,
  }: {
    label: string;
    /** Where it opens; null while it is closed. */
    at?: { x: number; y: number; height: number } | null;
    /** The thing's own page, in the app's terms (`/jobs/…`): Open and Copy link. */
    href?: string | null | undefined;
    children?: Snippet | undefined;
  } = $props();
</script>

<Menu {label} open={at !== null} {at} onclose={() => (at = null)}>
  {#if href}<a role="menuitem" href={inApp(href)}><Icon name="external" size="s" /><span class="mi-name">{copy.openRow}</span></a>{/if}
  {@render children?.()}
  {#if href}
    {@const to = href}
    <button role="menuitem" type="button" onclick={() => void putHref(to)}><Icon name="link" size="s" /><span class="mi-name">{copy.copyLink}</span></button>
  {/if}
</Menu>
