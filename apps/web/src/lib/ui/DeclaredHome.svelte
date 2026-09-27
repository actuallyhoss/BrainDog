<!--
  Home as a use case declares it (`loop/research-spark.md` S13): its `home-<use case>` page, drawn in the column where
  the house Home draws its figures and what needs you.

  A WRAPPER OVER THE ONE PAGE READER, `PageView mode="home"`. This drew the page a second way, as a flat stack of
  blocks, so a use case's Home lost its rail, its spans and its boxes, and every page word added to the reader had to be
  added here again. It keeps its props, `{ blocks, now }`, so Home mounts it as it did; Home mounts the reader itself
  once it reads the whole page (MOD-8), and this file goes.

  THE PAGE ITSELF IS OPTIONAL. `layout` is a key of the page, not of a block, so a Home that hands only the blocks draws
  them in one column with their spans and boxes, and a Home that hands `page` as well draws its rail too.

  HOME'S WRITES ARE ON, SO HOME READS AGAIN AFTER ONE. A tick, a moved card, a captured line or a typed field lands and
  then asks the page again, and only Home knows how it read the page, so `reread` is Home's. Without it the write still
  lands and says so, but the rows stay as they were read until Home loads again: a captured line does not appear, and
  a conflict is said over rows that are already stale.
-->
<script lang="ts">
  import PageView from '$lib/page/PageView.svelte';
  import type { LiveBlock, LivePageDecl, Opened } from '$lib/record/page-live.ts';

  let {
    blocks,
    now,
    page = null,
    reread = async () => {},
  }: {
    blocks: readonly LiveBlock[];
    now: number;
    /** The page the blocks were answered for, whose `layout` draws the rail. */
    page?: LivePageDecl | null;
    /** Reads Home's page again after a write lands, without blanking it. */
    reread?: () => Promise<void>;
  } = $props();

  /* THE ADDRESS A TICKED ROW IS HELD UNDER, and never a word a reader sees: Home's body has no head and no source. */
  const slug = $derived(page?.page ?? 'home');

  const got = $derived<Opened>({ from: 'live', page: { page: page ?? { page: slug, title: '' }, blocks: [...blocks] }, now });
</script>

<PageView {slug} {got} mode="home" {reread} />
