<!--
  Work: the record's tasks, where most writing happens, drawn from the declared page `page.work`.

  ONE READER, AS EVERY PAGE. The page is the work module's declaration (`packages/seed/src/modules/work.ts`): one line
  of what matters, the capture line, Late, Today, This week, With an agent, Waiting on you, Done recently and what is
  further off folded shut. `PageView` draws it in page mode, so Work wears the look every page does and the person or
  an agent can reshape it, and it brings what Work used to build by hand: the project filter as one strip the record
  answers (`filters:` on the page, over the tasks' `thing`, which reads Project, chosen in the address as `?f.thing=12`), a task open in the docked panel, the
  row's menu, and Just changed, which the page's host keeps per page for the life of the tab (`row-host.svelte.ts`).

  THE KEYS ARE THE PAGE'S: j k walk the tasks, x ticks, e edits in the panel, m opens the menu, Delete deletes with an
  Undo, n goes to the capture line, Enter opens and Esc closes. They are listed in the ? sheet and printed nowhere.

  THIS FILE KEEPS THE READ, as `/p/[slug]` does for any other page: the record read with the reader's filter, its
  `opened()` and `closed()` bracket, the re-read after a write, and listening for the record to move. A first open with
  nothing in the tab draws the local copy's page at once, asked behind it as `/p/work` is (`lib/data/local.ts`). The screen as it
  was is gone (24 October): the page narrows by whose work it is and folds what has not moved, and a record with
  tasks and no Work page is sent to its tasks list's own page (`page.ts`).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { apiBase, at as inApp } from '$lib/at.ts';
  import { registerHref } from '$lib/record/where.ts';
  import { TASKS } from './list.ts';
  import { keep, keptAnswer } from '$lib/data/kept.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import { keepLocal, localTicket, nearLocal } from '$lib/data/local-tab.ts';
  import { painted } from '$lib/data/timing.ts';
  import type { Near } from '$lib/data/local.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { pageKey } from '$lib/record/kept-pages.ts';
  import { pageLists } from '$lib/record/page-lists.ts';
  import { plainOf, revivedOf } from '$lib/data/plain.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { pageReader, type Opened } from '$lib/record/page-live.ts';
  import PageView from '$lib/page/PageView.svelte';
  import { filterOf, sameFilter } from '$lib/page/filters.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { WORK_PAGE, workView } from './page.ts';
  import { workKey } from './warm.ts';

  let { data }: { data: Shell } = $props();

  const view = $derived(workView(route.url.searchParams, data.pages));
  const showSource = $derived(route.url.searchParams.get('src') === '1');

  /* A RECORD WITH TASKS AND NO WORK PAGE OPENS ITS LIST'S OWN PAGE, in place of this address, so Back does not return here. */
  $effect(() => {
    if (view === 'list') void goto(inApp(registerHref(TASKS, undefined)), { replaceState: true });
  });

  /* WHAT THE ADDRESS NARROWS THE PAGE TO, held as the last one read so a choice that did not change reads nothing. */
  let filter = $state.raw<Record<string, string>>(untrack(() => filterOf(route.url.searchParams)));
  $effect(() => {
    const next = filterOf(route.url.searchParams);
    untrack(() => {
      if (!sameFilter(next, filter)) filter = next;
    });
  });

  /** The record's answer for the page; `null` while the read is out. */
  let got = $state<Opened | null>(null);
  let reader: ReturnType<typeof pageReader> | null = null;
  /* THE LATEST READ STARTED IS THE ONE DRAWN, as on `/p/[slug]`: a re-read the record moving started just before a tick
     landed can answer after the one the tick started, and drawing it last put the row back as it was. */
  let started = 0;
  /* A RE-READ OF THE PAGE'S OWN, after one of its writes, counted so the record moving does not read it a second time. */
  let own = 0;

  /**
   * THE PAGE AS THE LOCAL COPY LAST HELD IT (`lib/data/local.ts`), kept `always` under the key `/p/work` keeps it under,
   * so either draws what the other read: drawn at once while the record is asked, marked, and kept through an offline
   * refusal. `copied` is up while what is drawn is the copy's.
   */
  const PAGE_COPY = 'Page';
  let copied = $state(false);
  $effect(() => {
    if (!copied) return;
    return untrack(() => holdCopyMark());
  });
  const localKey = (asked: Readonly<Record<string, string>>) => pageKey(apiBase(), WORK_PAGE, asked);
  function keepPage(asked: Readonly<Record<string, string>>, out: Opened, mark: number) {
    if (out.from !== 'live') return;
    /* AS PLAIN JSON (`plain.ts`): its rows name projects by a reference, a `Map` the copy would refuse whole. */
    keepLocal(PAGE_COPY, localKey(asked), pageLists(out.page.blocks), plainOf(out), mark, {}, { always: true });
  }

  /* A FIRST READ BLANKS THE PAGE; A NEW CHOICE OF FILTER DOES NOT, so the strip stays under the finger that chose. */
  /* THE PAGE AS IT WAS LAST DRAWN IN THIS TAB IS DRAWN AT ONCE (`kept.ts`): at the same version nothing is asked, at
     another it is asked over it without blanking. A visit read the whole tasks list again, five times over nine screens. */
  async function readLive(asked: Readonly<Record<string, string>>, blank: boolean) {
    const at = opened();
    const key = workKey(apiBase(), asked);
    const version = live.version;
    /* AND A CHIP PRESSED AGAIN IS THIS TOO: it only looked here on a first read, so going back to a chip just pressed asked
       the record again. */
    const was = keptAnswer<Opened>(WORK_PAGE, key, version);
    if (was !== null && was.got.ok) {
      got = was.got.value;
      painted(WORK_PAGE, 'memory');
      if (was.fresh) return closed(true, at);
      blank = false;
    }
    if (blank) got = null;
    reader ??= pageReader(apiBase());
    const mine = ++started;
    const mark = localTicket();
    /* NOTHING DRAWN: THE LOCAL COPY'S PAGE, not waited on, so the record's answer is never held up by it. One later than
       the wait is drawn when it lands, while nothing is: `got` is the record's answer once it has one. */
    if (got === null) {
      const draw = (near: Near<Opened> | null) => {
        if (near === null || near.value.from !== 'live' || got !== null || mine !== started) return;
        got = revivedOf<Opened>(near.value);
        copied = true;
        painted(WORK_PAGE, 'copy');
      };
      void nearLocal<Opened>(PAGE_COPY, localKey(asked), apiBase(), draw).then(draw);
    }
    const out = await reader.read(WORK_PAGE, asked);
    /* A later read already drew over this one; with nothing drawn yet, this is drawn, so a re-read that did not land
       live never leaves the page waiting. */
    if (mine !== started && got !== null) return closed(true, at);
    /* OFFLINE OVER THE COPY'S PAGE, IT STAYS, until the record answers again. */
    if (out.from === 'refused' && copied && (data.offline === true || live.state === 'offline')) return closed(true, at);
    got = out;
    copied = false;
    if (out.from === 'live') {
      painted(WORK_PAGE, 'network');
      keep(WORK_PAGE, key, version, { ok: true, value: out });
      keepPage(asked, out, mark);
    }
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    /* OFFLINE THE PAGE STILL ASKS, so the local copy is drawn under the refusal of a host nobody reached. */
    if (view !== 'page' || (data.refused && !data.offline)) return;
    const asked = filter;
    untrack(() => void readLive(asked, got === null || got.from !== 'live'));
  });

  async function reread() {
    if (!reader || view !== 'page') return;
    own += 1;
    const mine = ++started;
    try {
      const version = live.version;
      const asked = filter;
      const mark = localTicket();
      const out = await reader.read(WORK_PAGE, asked);
      if (mine === started && out.from === 'live') {
        got = out;
        copied = false;
        keep(WORK_PAGE, workKey(apiBase(), asked), version, { ok: true, value: out });
        keepPage(asked, out, mark);
      }
    } finally {
      own -= 1;
    }
  }

  /* A FINGER DOWN ON THE PAGE: a tick or a drag is under way, and a re-read landing now would move the row from under it. */
  let pressing = false;
  const PRESSED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);
  function typingNow(): boolean {
    const el = document.activeElement;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !PRESSED.has(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
  }

  /* THE RECORD MOVED UNDER THE PAGE: read again without blanking it, keeping the reader's place. */
  listen(
    async () => {
      if (view !== 'page') return;
      const y = window.scrollY;
      await reread();
      await tick();
      if (window.scrollY !== y) window.scrollTo({ top: y });
    },
    () => pressing || own > 0 || typingNow() || document.querySelector('main [aria-busy="true"]') !== null,
  );

  $effect(() => {
    if (view === 'page' && got && got.from !== 'refused') drew('ready');
  });

  /* AN ADDRESS NAMING NO RECORD IS THE SHELL'S REFUSAL, drawn as every page draws one. */
  const shown = $derived<Opened | null>(data.refused && !(data.offline && got?.from === 'live') ? { from: 'refused', fix: data.refused.fix } : got);
</script>

<svelte:window
  onpointerdown={() => (pressing = true)}
  onpointerup={() => (pressing = false)}
  onpointercancel={() => (pressing = false)}
/>

{#if view === 'page'}
  <PageView slug={WORK_PAGE} got={shown} {showSource} {reread} />
{/if}
