<!--
  A declared page, read. What it draws is `$lib/page/PageView.svelte`, moved out of this file whole so
  the pages that are declarations under a different reader draw through the same component rather
  than through a copy of this one.

  THIS FILE KEEPS THE ADDRESS AND THE READ. The slug, `?src=`, the record read and its `opened()`
  and `closed()` bracket, and the rule that an answer for a page somebody has already left draws
  nothing, are all questions about the URL, and the URL is the route's.
-->
<script lang="ts" module>
  /**
   * THE HEAD'S SEARCH PARAM OF EACH PAGE THIS TAB READ, by the record's address and the slug, held as long as the tab's
   * kept answers are (`kept-pages.ts`), so a page opened again after another screen is asked with its word at once.
   */
  const heads = new Map<string, string | null>();
</script>

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
  import { filterOf, sameFilter, searchOf, withSearch } from '$lib/page/filters.ts';
  import { headOf } from '$lib/page/declared-head.ts';
  import { HOLD_MS, leaving, type Shown } from '$lib/page/leaving.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import OfferCard from '$lib/design/OfferCard.svelte';
  import { offerActs } from '$lib/design/pen.ts';
  import { pageOffer } from '$lib/design/page-offer.ts';
  import { penWords } from '$lib/design/words.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { isDay } from '$lib/record/day-href.ts';
  import { pageKey } from '$lib/record/kept-pages.ts';
  import { pageLists } from '$lib/record/page-lists.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { plainOf, revivedOf } from '$lib/data/plain.ts';
  import { keepLocal, localTicket, nearLocal, settledLocal } from '$lib/data/local-tab.ts';
  import { painted } from '$lib/data/timing.ts';
  import { looks as moneyLooks } from '$lib/money/looks.svelte.ts';
  import { quick } from '$lib/money/quick.svelte.ts';
  import { askBooks } from '$lib/money/books.ts';
  import type { Near } from '$lib/data/local.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { holdPresses } from '$lib/data/held.svelte.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import Told from '$lib/home/Told.svelte';
  import type { LessonsTile } from '$lib/home/told.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ProjectWaiting from '$lib/page/ProjectWaiting.svelte';
  import { knownProject, projectsPlace } from '$lib/page/known-project.ts';

  const slug = $derived(route.params.slug ?? '');
  const showSource = $derived(route.url.searchParams.get('src') === '1');

  /**
   * WHERE THE PAGE CAME FROM: the record's `page` answer, the record saying it has no such page, or the
   * record's own sentence, with the slug it answered for. It is not let go when the reader opens another page: the
   * page being left stays a moment while the next one reads (`leaving.ts`), so no frame between two pages is blank.
   */
  let answer = $state<Shown<Opened> | null>(null);
  /* The answer for the page at this address, `null` until it has one. */
  const got = $derived(answer?.slug === slug ? answer.got : null);

  /**
   * THE HEAD'S SEARCH PARAM, as the page's own answer declares it (`header: { search: { param } }`), and as
   * the last answer of each page said it, so a page opened again is asked with its word from the first read and its
   * kept copy is found under that word. A page this tab has not read yet is asked without one, and again with it once
   * its head is known.
   */
  const paramOf = (o: Opened | null): string | null => (o?.from === 'live' ? (headOf(o.page.page)?.search?.param ?? null) : null);
  const searchParam = $derived(got ? paramOf(got) : (heads.get(`${apiBase()} ${slug}`) ?? null));
  function answered(asked: string, out: Opened) {
    if (out.from === 'live') heads.set(`${apiBase()} ${asked}`, paramOf(out));
    answer = { slug: asked, got: out };
  }

  /**
   * WHAT THE READER NARROWED THE PAGE TO, kept in the address (`?f.thing=12`, and the head's word under its own param,
   * `?q=kiln`) so a narrowed page is a link, Back undoes a choice and a reload keeps it. `filtered` is the choice the
   * last read went out with.
   */
  const filter = $derived(
    withSearch(filterOf(route.url.searchParams), searchParam, searchOf(route.url.searchParams, searchParam)),
  );
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

  /* A READ IS OUT OVER A PAGE DRAWN FROM WHAT THIS TAB KEPT OF IT (`kept-pages.ts`): marked busy, never dimmed. */
  let reading = $state(false);
  let reader: ReturnType<typeof pageReader> | null = null;

  /* A RE-READ OF THE PAGE'S OWN, after one of its writes landed, counted so the record moving under it does not read
     the page a second time while the first is still out. */
  let own = 0;
  /* THE LATEST READ STARTED IS THE ONE DRAWN. A re-read the record moving started just before a tick landed can answer
     after the one the tick started, and drawing it last put the row back as it was before the tick. */
  let started = 0;

  /**
   * HOW LONG THE PAGE BEING LEFT HAS STOOD, as far as `leaving` asks: none when the next page is opened, and
   * `HOLD_MS` once that long has gone without its answer, when the next page's head and bars take its place.
   */
  let waited = $state(0);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(holdTimer));

  /**
   * A PROJECT THIS TAB HAS DRAWN (the sidebar, the Projects cards), whose page opens in its own shape before the record
   * answers (`ProjectWaiting`), with its name, mark and colour, and not on the page being left: there is a picture of
   * it to draw at once.
   */
  const known = $derived(knownProject(apiBase(), `/p/${slug}`));
  const backTo = $derived(projectsPlace(apiBase()) ?? undefined);
  /* The way back by the place's own name, as the landed page's head says it (its section). */
  const backName = $derived(((route.data as unknown as Shell).nav ?? []).find((n) => `/p/${n.id}` === backTo)?.title);
  /* ITS SHAPE'S CODE IS ASKED AS IT OPENS, so the page landing does not wait on the chunk with nothing drawn. */
  $effect(() => {
    if (known) void Promise.all([import('$lib/page/shape-hold.svelte.ts'), import('$lib/page/ProjectPart.svelte')]);
  });

  /**
   * WHAT IS DRAWN: this page's answer or kept copy, else the page being left for a moment, else this page's head and
   * bars, never an empty frame (`leaving.ts`). The page being left draws under its own slug, untouched. A known
   * project is not held: its own shape is drawn at once.
   */
  const view = $derived(leaving(answer, { slug, got, reading }, known ? HOLD_MS : waited));

  /**
   * THE PAGE AS THE LOCAL COPY LAST HELD IT, for a page this tab has not drawn yet (`lib/data/local.ts`): drawn while
   * the read is out, marked, and never written from, since a page's figures are not a thing a change line can place.
   * `copied` is the slug it was drawn for, until the record answers.
   */
  const PAGE_COPY = 'Page';
  let copied = $state<string | null>(null);
  $effect(() => {
    if (copied === null) return;
    return untrack(() => holdCopyMark());
  });
  /* AND A PAGE DRAWN FROM WHAT THIS TAB KEPT OF IT holds its presses until the read behind it answers (`held.svelte.ts`). */
  let remembered = $state<string | null>(null);
  $effect(() => {
    if (remembered === null) return;
    return untrack(() => holdPresses());
  });
  /**
   * THE CODE A DRAWN PAGE'S PARTS ARE DRAWN BY, each fetched as its block draws (`BlockSlot.svelte`): a project's parts
   * and its shape, the desk's tiles, the projects board. The same addresses, so it is the chunks the page asks anyway.
   */
  function partsCode(page: Opened): Promise<unknown> {
    if (page.from !== 'live') return Promise.resolve();
    const blocks = page.page.blocks as readonly { kind?: unknown; key?: unknown; desk?: { kind?: unknown } }[];
    const code: Promise<unknown>[] = [];
    if (blocks.some((b) => b.kind === 'project')) code.push(import('$lib/page/shape-hold.svelte.ts'), import('$lib/page/ProjectPart.svelte'));
    if (blocks.some((b) => b.key === 'board')) code.push(import('$lib/home/ProjectsBoard.svelte'));
    const desks = new Set(blocks.map((b) => b.desk?.kind));
    if (desks.has('late')) code.push(import('$lib/home/LateNow.svelte'));
    if (desks.has('working')) code.push(import('$lib/home/WorkingNow.svelte'));
    if (desks.has('projects')) code.push(import('$lib/home/ProjectCards.svelte'));
    return Promise.all(code);
  }
  function fromLocal(asked: string, choice: Record<string, string>, drawn: () => void) {
    /* One later than the wait is drawn when it lands, while the record has not answered: `got` is its answer once it has. */
    const draw = (near: Near<Opened> | null) => {
      if (near === null || near.value.from !== 'live' || (route.params.slug ?? '') !== asked || got !== null) return;
      /* KEPT AS PLAIN JSON (`plain.ts`), its `Map`s written as entries, and read back into them here. */
      const page = revivedOf<Opened>(near.value);
      answered(asked, page);
      copied = asked;
      painted('page', 'copy');
      /* SETTLED ONCE THE CODE ITS PARTS ARE DRAWN BY HAS LANDED, and a frame after it: the record's answer took long
         enough for it to arrive, and a copy drawn at once said the screen was ready over a project page with no parts. */
      void partsCode(page)
        .then(() => tick())
        .then(drawn, drawn);
    };
    void nearLocal<Opened>(PAGE_COPY, pageKey(apiBase(), asked, choice), apiBase(), draw).then(draw);
  }
  /** Keep a live answer in the local copy, `always`, so it is only ever drawn while the page asks again. */
  async function keepPage(asked: string, choice: Record<string, string>, out: Opened, mark: number) {
    if (out.from !== 'live') return;
    /* A CATCH-UP WHILE IT WAS OUT, OR THE COPY CLAIMED UNDER IT, DOES NOT COST IT ITS PLACE, as Today's does not
       (`Home.svelte`): it is never drawn as current, only while the page asks again, so it is kept under the ticket
       the copy holds once it has settled. On a record its agents write to all day, a page's read almost always met
       one, and was never kept for the next open. */
    let ticket = mark;
    if (localTicket() !== mark) {
      await settledLocal();
      ticket = localTicket();
    }
    /* AND IT NAMES THE LISTS THE COPY KEEPS, as Today's does: a page with the runs on it (a project, Agents) or a list
       that seals a value named one the copy never keeps, so the whole page was never kept. The rows it draws of them
       go with it as drawn, and are asked again with the rest on every open. */
    const l = await import('$lib/data/local.ts');
    const lists = pageLists(out.page.blocks).filter((id) => !l.NEVER_KEPT.has(id) && (REGISTERS[id] === undefined || !l.holdsSecret(REGISTERS[id])));
    /* AS PLAIN JSON: a page whose blocks name rows by a reference carries a `Map` of their names, and the copy keeps
       nothing that is not plain, so Money and Projects were never kept at all. */
    keepLocal(PAGE_COPY, pageKey(apiBase(), asked, choice), lists, plainOf(out), ticket, {}, { always: true });
  }

  async function readLive(asked: string) {
    const at = opened();
    reader ??= pageReader(apiBase());
    copied = null;
    /* THE PAGE BEING LEFT IS KEPT, not let go: what this tab kept of the next page replaces it at once, and where it
       kept nothing the old page stands until the hold runs out, or the local copy's page takes its place. */
    const keptCopy = reader.kept(asked, filtered);
    const choice = filtered;
    const mark = localTicket();
    /* A PAGE DRAWN FROM WHAT THIS TAB KEPT IS THE SCREEN, and the read behind it lands over it: the bracket is closed now
       and not when the record answers, as Today's is (`Home.svelte`), so Back to Money is settled when it is drawn and
       not after the figures have been worked out again. A refusal of that read is still said (`closeRead`). THE SAME
       FOR THE LOCAL COPY'S PAGE on a reload: it is drawn and marked, so the screen is settled, and the copy's own mark
       stays up over it until the record answers (`holdCopyMark`). */
    let released = false;
    const closeRead = (ok: boolean): void => {
      if (released) return ok ? undefined : closed(false, opened());
      released = true;
      closed(ok, at);
    };
    if (keptCopy) {
      answered(asked, keptCopy);
      remembered = asked;
      painted('page', 'memory');
      closeRead(true);
    } else fromLocal(asked, choice, () => closeRead(true));
    waited = 0;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => (waited = HOLD_MS), HOLD_MS);
    reading = true;
    const mine = ++started;
    /* MONEY'S CHIPS AND ITS ROW OF BOOKS ARE ASKED WITH ITS OWN READ (speed-e SE3): each was asked once its part had
       drawn, a round trip after the page. The chips are once a record (`looks.svelte.ts`); the books only where the
       ledger is known by now (`books.ts`), and the row takes them when it draws. */
    if (/^money(-|$)/u.test(asked)) {
      moneyLooks.ask();
      if (asked === 'money' && quick.base === apiBase() && quick.ledger?.book) askBooks(apiBase(), quick.ledger.book);
    }
    /* A PAGE ABOUT A PROJECT'S ROW CARRIES ITS SHAPE IN ITS OWN ANSWER (`page-live.ts`, `shape-answer.ts`), so nothing is
       asked for it beside the page. */
    const out = await reader.read(asked, filtered).finally(() => {
      if (remembered === asked) remembered = null;
    });
    /* An answer for a page somebody has already left draws nothing, and nor does one a later read, with a choice made
       while this was out, has already drawn over. */
    if ((route.params.slug ?? '') !== asked || (mine !== started && got !== null)) return closeRead(true);
    /* OFFLINE OVER THE COPY'S PAGE, IT STAYS, until the record answers again. */
    if (out.from === 'refused' && copied === asked && ((route.data as unknown as Shell).offline === true || live.state === 'offline')) {
      reading = false;
      return closeRead(true);
    }
    answered(asked, out);
    copied = null;
    if (out.from === 'live') painted('page', 'network');
    void keepPage(asked, choice, out, mark);
    reading = false;
    closeRead(out.from !== 'refused');
  }

  $effect(() => {
    const asked = slug;
    untrack(() => {
      /* A new page is read with the choice its address already holds, so the effect below has nothing to read again. */
      filtered = filter;
      void readLive(asked);
    });
  });

  /* AND MONEY'S BOOKS THE MOMENT ITS LEDGER IS FOUND, where that was after Money's read went out (a cold open): the row
     read them for itself as it drew, a read of the screen's own in the gap the frame's rest waits for, and once the
     page drew sooner (speed-g SG2) it filled that gap and the frame's extras waited another poll. Taken by the row. */
  $effect(() => {
    const book = quick.ledger?.book;
    if (slug !== 'money' || !book || quick.base !== apiBase()) return;
    untrack(() => askBooks(apiBase(), book));
  });

  /* A CHOICE CHANGED ON THE SAME PAGE: read again without blanking it, so the strip stays under the finger. */
  $effect(() => {
    const f = filter;
    untrack(() => {
      if (sameFilter(f, filtered)) return;
      filtered = f;
      /* A CHIP THIS TAB HAS ALREADY READ IS DRAWN AT ONCE, and asked again behind it. */
      const was = reader?.kept(slug, f);
      if (was) answered(slug, was);
      void reread();
    });
  });

  async function reread() {
    const asked = slug;
    if (!reader) return;
    own += 1;
    const mine = ++started;
    const choice = filtered;
    const mark = localTicket();
    try {
      const out = await reader.read(asked, choice);
      if (mine === started && (route.params.slug ?? '') === asked) {
        reading = false;
        if (out.from === 'live') {
          answered(asked, out);
          copied = null;
          void keepPage(asked, choice, out, mark);
        }
      }
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
    if (got && got.from !== 'refused' && !reading) drew('ready');
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
  /**
   * WHAT EVERY AGENT IS TOLD, UNDER THE RUNS ON AGENTS (today F19): the record's lessons as
   * one tile after the page's blocks, read once a record when the agents page has drawn. `told.ts` is route-only (it
   * carries the client), so it is imported here and only for this page. Nothing at nought or on a refusal.
   *
   * THE PAGE OF RUNS IS KNOWN BY WHAT IT DRAWS, never by its slug, which is a pack's word: the page whose lanes are
   * the record's own runs (`register.session`).
   */
  const ofRuns = $derived(got?.from === 'live' && got.page.blocks.some((b) => b.kind === 'lanes' && (b as { source?: unknown }).source === 'register.session'));
  /* THE AGENTS PAGE, KNOWN THE SAME WAY, by the list of every run it draws (`panel: run-list`), opens on the plain head the
     hand-written screens beside it have (Needs you, Automations), not the lead tile (`PageView`'s `plain`). */
  const plainHead = $derived(got?.from === 'live' && got.page.blocks.some((b) => (b as { panel?: unknown }).panel === 'run-list'));
  let told = $state<{ base: string; tile: LessonsTile | null } | null>(null);
  $effect(() => {
    if (!ofRuns) return;
    const base = apiBase();
    if (untrack(() => told?.base) === base) return;
    told = { base, tile: null };
    void import('$lib/home/told.ts').then(async (m) => {
      const tile = m.lessonsTile(await m.loadLessons(base));
      if (told?.base === base) told = { base, tile };
    });
  });
  const lessons = $derived(ofRuns && told?.base === apiBase() ? told.tile : null);
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
{#snippet offerCard()}{#if lessons}<Told tile={lessons} />{/if}{#if offer}<OfferCard item={offer} acts={offerActions} busy={offerBusy} compact />{/if}{/snippet}
<!-- THE PROJECT IN ITS OWN SHAPE UNTIL ITS SHAPE IS READ: the page's read, and then the shape's code, draw the same. -->
{#snippet shaped()}{#if known}<ProjectWaiting project={known} />{/if}{/snippet}
{#if view.got === null && known && !showSource}
  <div class="shaped">
    <PageHead title={known.name} headless kicker={backName} back={backName ? backTo : undefined} sentence="" />
    <div class="shaped-body">{@render shaped()}</div>
  </div>
{:else}
  <div class="read" aria-busy={reading ? 'true' : undefined}><PageView slug={view.slug} {showSource} got={view.got} {reread} offer={offer || lessons ? offerCard : undefined} waiting={known ? shaped : undefined} plain={plainHead} /></div>
{/if}

<style>
  .read {
    display: contents;
  }

  /* WHERE THE PROJECT'S HERO LANDS: the board's gutter and top, as `PageBody` lays a page's blocks. */
  .shaped {
    min-inline-size: 0;
  }

  /* A TILE GAP UNDER THE CARD ABOVE IT (rhythm pass, 3 Nov): at 12 it stood closer to the banner than the tiles stand to
     each other; and the page's foot is the page's own, which clears the phone's tab bar. */
  .shaped-body {
    padding: var(--tile-gap) var(--gutter) var(--page-bottom);
  }

  /* WHAT EVERY AGENT IS TOLD IS THE PAGE'S LAST TILE, one tile gap under the blocks: the page's end space moves under
     it, where it stood between the two as 96px of nothing. The offer, when there is one, one tile gap below it. */
  .read :global(.body-wrap:has(+ .page-offer > [data-lessons]) .page) {
    padding-block-end: 0;
  }

  .read :global(.page-offer:has(> [data-lessons])) {
    padding-block-end: var(--page-bottom);
  }

  .read :global([data-lessons] + *) {
    margin-block-start: var(--tile-gap);
  }
</style>
