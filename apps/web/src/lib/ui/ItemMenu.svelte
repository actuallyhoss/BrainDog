<!--
  The menu of an item that has verbs and no "…" drawn: `Menu` at a rect, opened where the item was right-clicked or
  held, or at the item from `⇧F10`. The item carries `ownMenu` (`context-menu.ts`), which hands this the point. It holds the
  caller's own verbs first, the ones only this item has where it is drawn; and for an item with a page of its own, the same
  menu that page's "…" has (`things/menu-of.ts`), read as it opens, with Open, Open in new tab and Copy link leading.
-->
<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { here } from '../at.ts';
  import { inIosApp, inMacApp } from '../shell.ts';
  import type { Shell } from '../record/boot-live.ts';
  import { itemsOf, linkItems, needsRead, type ThingFrom, type ThingItem } from '../things/menu-of.ts';
  import { thingOf } from '../things/thing.ts';
  import ThingItems from '../things/ThingItems.svelte';
  import { things } from '../things/asks.svelte.ts';
  import Menu from './Menu.svelte';

  let {
    label,
    at = $bindable(null),
    href = null,
    omit = [],
    children,
  }: {
    label: string;
    /** Where it opens; null while it is closed. */
    at?: { x: number; y: number; height: number } | null;
    /** The thing's own page, in the app's terms (`/jobs/…`): the link's verbs and that page's items. */
    href?: string | null | undefined;
    /** Items of the thing's menu this item says its own way (`state`: its own Mark done), by id or the part before `:`. */
    omit?: readonly string[];
    children?: Snippet | undefined;
  } = $props();

  /** How long the menu holds back for its read before it opens with what it has. */
  const HOLD = 220;

  let drawn = $state.raw<{ x: number; y: number; height: number } | null>(null);
  let items = $state.raw<ThingItem[]>([]);
  let status = $state<'ready' | 'reading' | 'failed'>('ready');
  let turn = 0;

  async function read(to: string, mine: number): Promise<void> {
    const from: ThingFrom = { sidebar: false, wide: matchMedia('(width >= 900px)').matches, oneWindow: inIosApp || inMacApp, pathname: here(location.pathname) || '/' };
    const link = linkItems(thingOf(to).href, from);
    items = link;
    status = 'reading';
    things.wanted = true;
    try {
      const rest = (await itemsOf(to, page.data as unknown as Shell, from, label)).filter((i) => !omit.includes(i.id) && !omit.includes(i.id.split(':')[0]!));
      if (mine !== turn) return;
      items = [...link, ...rest];
      status = 'ready';
    } catch {
      if (mine === turn) status = 'failed';
    }
  }

  $effect(() => {
    const spot = at;
    const to = href;
    const mine = ++turn;
    if (!spot) {
      drawn = null;
      return;
    }
    if (!to) {
      items = [];
      status = 'ready';
      drawn = spot;
      return;
    }
    const reading = read(to, mine);
    void (needsRead(thingOf(to)) ? Promise.race([reading, new Promise((go) => setTimeout(go, HOLD))]) : Promise.resolve()).then(() => {
      if (mine === turn) drawn = spot;
    });
  });
</script>

<Menu {label} open={drawn !== null} at={drawn} onclose={() => (at = null)}>
  {#if children}{@render children()}{#if href}<hr />{/if}{/if}
  {#if href}
    <ThingItems {items} {status} onagain={() => href && void read(href, ++turn)} onclose={() => (at = null)} />
  {/if}
</Menu>
