<!--
  A declared page, read. What it draws is `$lib/page/PageView.svelte`, moved out of this file whole so
  the pages that are declarations under a different reader draw through the same component rather
  than through a copy of this one.

  THIS FILE KEEPS THE ADDRESS AND THE READ. The slug, `?src=`, the record read and its `opened()`
  and `closed()` bracket, and the rule that an answer for a page somebody has already left draws
  nothing, are all questions about the URL, and the URL is the route's.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { page as route } from '$app/state';
  import { tick, untrack } from 'svelte';
  import PageView from '$lib/page/PageView.svelte';
  import PageTabs from '$lib/page/PageTabs.svelte';
  import { tabsOf } from '$lib/page/tabs.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
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

  /* A RE-READ OF THE PAGE'S OWN, after one of its writes landed, counted so the record moving under it does not read
     the page a second time while the first is still out. */
  let own = 0;
  /* THE LATEST READ STARTED IS THE ONE DRAWN. A re-read the record moving started just before a tick landed can answer
     after the one the tick started, and drawing it last put the row back as it was before the tick. */
  let started = 0;

  async function reread() {
    const asked = slug;
    if (!reader) return;
    own += 1;
    const mine = ++started;
    try {
      const out = await reader.read(asked);
      if (mine === started && (route.params.slug ?? '') === asked && out.from === 'live') got = out;
    } finally {
      own -= 1;
    }
  }

  /* A FINGER DOWN ON THE PAGE. A tick or a drag is under way, and its write goes out when it lifts, so a re-read that
     landed now would move the row from under it. */
  let pressing = false;

  /* The inputs a press finishes with, rather than typing. */
  const PRESSED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

  /**
   * A FIELD BEING TYPED INTO. A checkbox, a radio or a button keeps focus after it is pressed, and a press has already
   * written, so only a control that takes text holds a re-read back; otherwise one tick would stop the page listening
   * until the reader clicked somewhere else.
   */
  function typing(): boolean {
    const at = document.activeElement;
    if (at instanceof HTMLTextAreaElement) return true;
    if (at instanceof HTMLInputElement) return !PRESSED.has(at.type);
    return at instanceof HTMLElement && at.isContentEditable;
  }

  /**
   * THE RECORD MOVED UNDER THE PAGE: somebody else, or an agent, wrote. It is read again without blanking it, and the
   * reader's place is kept: a re-read can grow a block above the one they are reading, and the page should not scroll
   * them off it. `aria-busy` is the mark a card with a write out wears (`QueueAnswer.svelte`), so its answer is waited
   * for too.
   */
  listen(
    async () => {
      const y = window.scrollY;
      await reread();
      await tick();
      if (window.scrollY !== y) window.scrollTo({ top: y });
    },
    () => pressing || own > 0 || typing() || document.querySelector('main [aria-busy="true"]') !== null,
  );

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

<svelte:window
  onpointerdown={() => (pressing = true)}
  onpointerup={() => (pressing = false)}
  onpointercancel={() => (pressing = false)}
/>

{#if strip}<PageTabs {strip} />{/if}
<PageView {slug} {showSource} {got} {reread} />
