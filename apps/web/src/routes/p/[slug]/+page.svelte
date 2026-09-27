<!--
  A declared page, read. What it draws is `$lib/page/PageView.svelte`, moved out of this file whole so
  the pages that are declarations under a different reader draw through the same component rather
  than through a copy of this one (`loop/research-modules-next.md`, Brief 5).

  THIS FILE KEEPS THE ADDRESS AND THE READ. The slug, `?src=`, the record read and its `opened()`
  and `closed()` bracket, and the rule that an answer for a page somebody has already left draws
  nothing, are all questions about the URL, and the URL is the route's.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { page as route } from '$app/state';
  import { untrack } from 'svelte';
  import PageView from '$lib/page/PageView.svelte';
  import PageTabs from '$lib/page/PageTabs.svelte';
  import { tabsOf } from '$lib/page/tabs.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { pageReader, type Opened } from '$lib/record/page-live.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  const slug = $derived(route.params.slug ?? '');
  const showSource = $derived(route.url.searchParams.get('src') === '1');

  /**
   * WHERE THE PAGE CAME FROM: the record's `page` answer, the record saying it has no such page, or the
   * record's own sentence. Nothing draws until it answers.
   */
  let got = $state<Opened | null>(null);
  let reader: ReturnType<typeof pageReader> | null = null;

  async function readLive(asked: string) {
    const at = opened();
    got = null;
    reader ??= pageReader(apiBase());
    const out = await reader.read(asked);
    /* An answer for a page somebody has already left draws nothing. */
    if ((route.params.slug ?? '') !== asked) return closed(true, at);
    got = out;
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    const asked = slug;
    untrack(() => void readLive(asked));
  });

  async function reread() {
    const asked = slug;
    if (!reader) return;
    const out = await reader.read(asked);
    if ((route.params.slug ?? '') === asked && out.from === 'live') got = out;
  }

  /**
   * DRAWN ONCE THE READ HAS ANSWERED, live or a page the record does not have. The read is
   * bracketed by `opened()` and `closed()`, so a call still out takes `data-screen` away whatever this
   * says; `Empty` says `refused` for the state it draws.
   */
  $effect(() => {
    if (got && got.from !== 'refused') drew('ready');
  });

  /**
   * THE SECTION'S TABS, WHEN IT HAS THEM, READ FROM THE SHELL AND NOT FROM THE PAGE'S OWN ANSWER. Which pages share a
   * section is a fact about the record's nav, which the root layout already holds, so the strip is drawn before the
   * page's read answers and stays put while the next tab's read is out. It is also why it lives in the route: the
   * address is the route's, and a tab is an address.
   */
  const strip = $derived(
    tabsOf((route.data as unknown as Shell).nav ?? [], `/p/${slug}`, { order: navPrefs.order, hidden: navPrefs.hidden }),
  );
</script>

{#if strip}<PageTabs {strip} />{/if}
<PageView {slug} {showSource} {got} {reread} />
