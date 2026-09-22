<!--
  A declared page, read. What it draws is `$lib/page/PageView.svelte`, moved out of this file whole so
  the pages that are declarations under a different reader draw through the same component rather
  than through a copy of this one (`loop/research-modules-next.md`, Brief 5).

  THIS FILE KEEPS THE ADDRESS AND THE READ. The slug, `?src=`, the record read and its `opened()`
  and `closed()` bracket, and the rule that an answer for a page somebody has already left draws
  nothing, are all questions about the URL, and the URL is the route's.
-->
<script lang="ts">
  import { page as route } from '$app/state';
  import { untrack } from 'svelte';
  import PageView from '$lib/page/PageView.svelte';
  import { pageReader, type Opened } from '$lib/record/page-live.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  const slug = $derived(route.params.slug ?? '');
  const showSource = $derived(route.url.searchParams.get('src') === '1');

  /**
   * WHERE THE PAGE CAME FROM: the record's `page` answer, the sample when there is no record here, the
   * record saying it has no such page, or the record's own sentence. Nothing draws until it answers.
   */
  let got = $state<Opened | null>(null);
  let reader: ReturnType<typeof pageReader> | null = null;

  async function readLive(asked: string) {
    const at = opened();
    got = null;
    reader ??= pageReader(location.origin);
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
   * DRAWN ONCE THE READ HAS ANSWERED, live, the sample, or a page the record does not have. The read is
   * bracketed by `opened()` and `closed()`, so a call still out takes `data-screen` away whatever this
   * says; `Empty` says `refused` for the state it draws.
   */
  $effect(() => {
    if (got && got.from !== 'refused') drew('ready');
  });
</script>

<PageView {slug} {showSource} {got} {reread} />
