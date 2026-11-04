<!--
  THE SHELL'S ONE MENU FOR ANYTHING THAT STANDS FOR A THING: a link into the app, or what says `data-thing`. Its items are the
  thing's (`menu-of.ts`), the same as that page's "…", and its own chunk, drawn on the first right-click.

  IT WAITS A MOMENT FOR WHAT IT HAS TO READ, so a row's menu is drawn once with the truth rather than filling in under the
  pointer. Past that moment it opens with the link's three, which need nothing, and a quiet line, and the rest arrive under it;
  a read that fails says so there. Sheets a verb opens live here, since its menu closes on the press.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { here } from '../at.ts';
  import { inIosApp, inMacApp } from '../shell.ts';
  import type { Shell } from '../record/boot-live.ts';
  import Menu from '../ui/Menu.svelte';
  import type { ThingAsk } from '../ui/context-menu.ts';
  import { things } from './asks.svelte.ts';
  import { itemsOf, linkItems, needsRead, type ThingFrom, type ThingItem } from './menu-of.ts';
  import { thingOf } from './thing.ts';
  import ThingItems from './ThingItems.svelte';
  import ThingSheets from './ThingSheets.svelte';
  import { thingWords } from './verbs.ts';

  /** How long the menu holds back for its read before it opens with what it has. */
  const HOLD = 220;

  let point = $state.raw<{ x: number; y: number; height: number } | null>(null);
  let label = $state<string>(thingWords.menuOf);
  let items = $state.raw<ThingItem[]>([]);
  let status = $state<'ready' | 'reading' | 'failed'>('ready');
  let asking: ThingAsk | null = null;
  let turn = 0;

  const fromOf = (a: ThingAsk): ThingFrom => ({
    sidebar: a.from.closest('.s-side, .s-rail, .s-phone') !== null,
    wide: matchMedia('(width >= 900px)').matches,
    oneWindow: inIosApp || inMacApp,
    pathname: here(location.pathname) || '/',
  });

  async function read(a: ThingAsk, mine: number): Promise<void> {
    const from = fromOf(a);
    const link = linkItems(thingOf(a.href).href, from);
    items = link;
    status = 'reading';
    try {
      const rest = await itemsOf(a.href, page.data as unknown as Shell, from, a.name);
      if (mine !== turn) return;
      items = [...link, ...rest];
      status = 'ready';
    } catch {
      if (mine !== turn) return;
      status = 'failed';
    }
  }

  async function open(a: ThingAsk): Promise<void> {
    const mine = ++turn;
    asking = a;
    label = a.name || thingWords.menuOf;
    const reading = read(a, mine);
    if (needsRead(thingOf(a.href))) await Promise.race([reading, new Promise((go) => setTimeout(go, HOLD))]);
    if (mine === turn) point = { x: a.at.x, y: a.at.y, height: a.at.height };
  }

  $effect(() => {
    const a = things.ask;
    if (!a) return;
    untrack(() => {
      things.ask = null;
      void open(a);
    });
  });
</script>

<Menu {label} open={point !== null} at={point} onclose={() => (point = null)}>
  <ThingItems {items} {status} onagain={() => asking && void read(asking, ++turn)} onclose={() => (point = null)} />
</Menu>
<ThingSheets />
