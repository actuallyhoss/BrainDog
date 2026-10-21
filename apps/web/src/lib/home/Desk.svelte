<!--
  The desk under Today's page: who is working, the live projects as cards, and what landed. In that order at every
  width, which on a phone is one column from the live thing down to the record of the past.

  LOADED WHEN ASKED FOR, as the other tiles are: Home imports this once the page has answered, so the front door loads
  nothing more. Each part draws nothing where it has nothing, and so a record with none of the three draws no desk.
-->
<script lang="ts">
  import type { Working } from '$lib/record/boot-live.ts';
  import Landed from './Landed.svelte';
  import ProjectCards from './ProjectCards.svelte';
  import WorkingNow from './WorkingNow.svelte';
  import { workingRows } from './desk.ts';
  import type { Cards } from './desk-read.ts';
  import { landedOf, type Line } from './landed.ts';

  let {
    cards,
    working,
    lines,
    lists,
    names,
    me,
    now,
    part = 'all',
    review = 0,
  }: {
    cards: Cards | null;
    working: readonly Working[];
    lines: readonly Line[];
    lists: readonly { id: string; name: string; kernel?: true }[];
    names: Readonly<Record<string, string>>;
    me: string | null;
    now: number;
    /** One part of the three, where Today lays them among the page's tiles; `all` is the three in a row. */
    part?: 'all' | 'working' | 'projects' | 'landed';
    /** What waits in the inbox, which Arrivals' heading opens (today F14). */
    review?: number;
  } = $props();

  /* A working agent's project lends its card's colour to the dot before its name. */
  const hues = $derived(new Map((cards?.cards ?? []).map((c) => [c.name, c.hue] as const)));
  const rows = $derived(workingRows(working, hues, now));
  /* ENOUGH LINES TO GROUP (`arrivalsOf`), which then shows the newest few. */
  const LANDED_READ = 40;
  /* THE KERNEL'S OWN LISTS (runs, what he told them) are nothing he filed, by their declaration (`kernel`). */
  const own = $derived(new Set(lists.filter((l) => l.kernel === true).map((l) => l.id)));
  const landed = $derived(landedOf(lines, new Map(lists.map((l) => [l.id, l.name])), me, now, new Map(Object.entries(names)), LANDED_READ, own));
</script>

{#if part === 'all' || part === 'working'}<WorkingNow {rows} />{/if}
{#if cards && (part === 'all' || part === 'projects')}<ProjectCards cards={cards.cards} more={cards.more} list={cards.list} name={cards.name} {working} />{/if}
{#if part === 'all' || part === 'landed'}<Landed rows={landed} {review} />{/if}
