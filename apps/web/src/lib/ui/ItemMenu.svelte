<!--
  The menu of an item that has verbs and no "…" drawn: `Menu` at a rect, opened where the item was right-clicked or
  held, or at the item from `⇧F10`. The item carries `ownMenu` (`context-menu.ts`), which hands this the point. Each
  item is one of the thing's own verbs, so the menu adds no capability: it gathers the ones it already has where the
  pointer is. It leads with "Send to…" for a thing that can be sent (a row, by its page's address, or what the caller
  names), then Open for an item with a page of its own; the caller's verbs follow, and Copy link ends it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { at as inApp } from '../at.ts';
  import { putHref } from '../clipboard.ts';
  import { copy } from '../copy.ts';
  import SendItem from '../send/SendItem.svelte';
  import { refOfHref, refs } from '../send/send.ts';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';

  let {
    label,
    at = $bindable(null),
    href = null,
    send,
    children,
  }: {
    label: string;
    /** Where it opens; null while it is closed. */
    at?: { x: number; y: number; height: number } | null;
    /** The thing's own page, in the app's terms (`/jobs/…`): Open and Copy link. */
    href?: string | null | undefined;
    /** What "Send to…" attaches, by its ref (`list#4`, `decide:…`, `run:…`); left out, a row's or a run's page names
        it, and `null` says there is nothing to send. */
    send?: string | null | undefined;
    children?: Snippet | undefined;
  } = $props();

  const RUN = /^\/jobs\/([^/?#]+)$/u;
  const sent = $derived.by(() => {
    const run = href ? RUN.exec(href) : null;
    const ref = send !== undefined ? send : run ? refs.run(decodeURIComponent(run[1]!)) : href ? refOfHref(href) : null;
    /* A ROW'S KIND IS ITS LIST, and a question's or a run's is the word before its colon. */
    return ref ? { kind: ref.split(/[#:]/u)[0]!, attach: [{ ref, label }] } : null;
  });
</script>

<Menu {label} open={at !== null} {at} onclose={() => (at = null)}>
  {#if sent}<SendItem kind={sent.kind} attach={sent.attach} />{/if}
  {#if href}<a role="menuitem" href={inApp(href)}><Icon name="external" size="s" /><span class="mi-name">{copy.openRow}</span></a>{/if}
  {@render children?.()}
  {#if href}
    {@const to = href}
    <button role="menuitem" type="button" onclick={() => void putHref(to)}><Icon name="link" size="s" /><span class="mi-name">{copy.copyLink}</span></button>
  {/if}
</Menu>
