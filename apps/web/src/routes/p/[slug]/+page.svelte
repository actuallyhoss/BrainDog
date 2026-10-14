<!--
  A declared page, read. What it draws is `$lib/page/PageView.svelte`, moved out of this file whole so
  the pages that are declarations under a different reader draw through the same component rather
  than through a copy of this one.

  THIS FILE KEEPS THE ADDRESS AND THE READ. The slug, `?src=`, the record read and its `opened()`
  and `closed()` bracket, and the rule that an answer for a page somebody has already left draws
  nothing, are all questions about the URL, and the URL is the route's.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { setContext, tick, untrack } from 'svelte';
  import PageView from '$lib/page/PageView.svelte';
  import PageTabs from '$lib/page/PageTabs.svelte';
  import { tabsOf } from '$lib/page/tabs.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { pageReader, type Opened } from '$lib/record/page-live.ts';
  import { filterOf, sameFilter } from '$lib/page/filters.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import OfferCard from '$lib/design/OfferCard.svelte';
  import { offerActs } from '$lib/design/pen.ts';
  import { pageOffer } from '$lib/design/page-offer.ts';
  import { penWords } from '$lib/design/words.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { isDay } from '$lib/record/day-href.ts';

  const slug = $derived(route.params.slug ?? '');
  const showSource = $derived(route.url.searchParams.get('src') === '1');
  /**
   * WHAT THE READER NARROWED THE PAGE TO, kept in the address (`?f.thing=12`) so a narrowed page is a link, Back
   * undoes a choice and a reload keeps it. `filtered` is the choice the last read went out with.
   */
  const filter = $derived(filterOf(route.url.searchParams));
  let filtered: Record<string, string> = {};

  /**
   * THE DAY A DATE OPENED THE PAGE ON (`?day=2026-11-03`, which `dayHref` writes), handed to the page's calendar so it
   * draws that day marked and scrolls it into view. Read by the validator that wrote it, so `?day=2030-13-01` marks
   * nothing. It goes down as a context because the blocks' options are built further in (`BlockSlot.svelte`); the key is
   * `CALENDAR_DAY` in `braindog-render`'s `calendar.ts`, spelled again here until the package exports it.
   */
  const day = $derived.by(() => {
    const asked = route.url.searchParams.get('day')?.trim() ?? '';
    return isDay(asked) ? asked : null;
  });
  setContext('braindog-render.calendar-day', () => day);

  /**
   * WHERE THE PAGE CAME FROM: the record's `page` answer, the record saying it has no such page, or the
   * record's own sentence. Nothing draws until it answers.
   */
  let got = $state<Opened | null>(null);
  let reader: ReturnType<typeof pageReader> | null = null;

  /* A RE-READ OF THE PAGE'S OWN, after one of its writes landed, counted so the record moving under it does not read
     the page a second time while the first is still out. */
  let own = 0;
  /* THE LATEST READ STARTED IS THE ONE DRAWN. A re-read the record moving started just before a tick landed can answer
     after the one the tick started, and drawing it last put the row back as it was before the tick. */
  let started = 0;

  async function readLive(asked: string) {
    const at = opened();
    got = null;
    reader ??= pageReader(apiBase());
    const mine = ++started;
    const out = await reader.read(asked, filtered);
    /* An answer for a page somebody has already left draws nothing, and nor does one a later read, with a choice made
       while this was out, has already drawn over. */
    if ((route.params.slug ?? '') !== asked || (mine !== started && got !== null)) return closed(true, at);
    got = out;
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    const asked = slug;
    untrack(() => {
      /* A new page is read with the choice its address already holds, so the effect below has nothing to read again. */
      filtered = filter;
      void readLive(asked);
    });
  });

  /* A CHOICE CHANGED ON THE SAME PAGE: read again without blanking it, so the strip stays under the finger. */
  $effect(() => {
    const f = filter;
    untrack(() => {
      if (sameFilter(f, filtered)) return;
      filtered = f;
      void reread();
    });
  });

  async function reread() {
    const asked = slug;
    if (!reader) return;
    own += 1;
    const mine = ++started;
    try {
      const out = await reader.read(asked, filtered);
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

  /**
   * THE WEEK OFFER, WHERE SHE IS (use case 6, step 7): her Orders place opens this page, not the list's own screen, so
   * the one offer for the first list the page reads is drawn here too (`pageOffer`), with the same card and the same two
   * presses as on the list's screen (`offerActs`). None on the page the offer made, and none until the page has read.
   */
  let offerTick = $state(0);
  const offerActions = offerActs({
    keep: async (item) => (await import('$lib/design/keep.ts')).keepOffer(apiBase(), item),
    dismiss: (offerId) => navPrefs.dismiss(offerId),
    go: async (made) => {
      forget();
      await goto(at(`/p/${made}`), { invalidateAll: true });
    },
    say: (text, warn) => void toasts.push(text, warn ? { intent: 'warn' } : undefined),
    changed: () => (offerTick += 1),
    words: { made: copy.promoted, dismissed: penWords.dismissed, notReached: copy.recordNotReached },
  });
  /* `offerTick` IS READ so each press redraws: what the actions hold is plain, and the tick is their one signal. */
  const offer = $derived.by(() => {
    void offerTick;
    if (got?.from !== 'live') return null;
    const pen = (route.data as unknown as Shell).pen ?? [];
    return pageOffer(pen, { slug, blocks: got.page.blocks }, { suggest: navPrefs.suggest, gone: (o) => navPrefs.isDismissed(o) || offerActions.hidden(o) });
  });
  const offerBusy = $derived.by(() => {
    void offerTick;
    return offerActions.busy();
  });
</script>

<svelte:window
  onpointerdown={() => (pressing = true)}
  onpointerup={() => (pressing = false)}
  onpointercancel={() => (pressing = false)}
/>

{#if strip}<PageTabs {strip} />{/if}
<!-- THE OFFER SITS UNDER THE PAGE'S OWN BLOCKS (PageView's `offer`), as one quiet line that opens on tap, so the page's
     content comes first on a phone and on a laptop alike. -->
{#snippet offerCard()}{#if offer}<OfferCard item={offer} acts={offerActions} busy={offerBusy} compact />{/if}{/snippet}
<PageView {slug} {showSource} {got} {reread} offer={offer ? offerCard : undefined} />

