<!--
  THE APP'S FRAME, drawn by the root layout (`routes/+layout.svelte`) around every screen but sign-in and sign-up, which
  draw in the light frame beside it (`LightFrame.svelte`) and never load this file or what it imports. It was the root
  layout itself until 30 Oct, so a stranger's first visit waited for the whole shell before seeing a field (E14). The
  global stylesheets and the Mac app's title-bar room stay in the root layout, which both frames share.

  The shell: a skip link, the sidebar with the top bar beside it (or the side rail somebody kept), the tab bar, the
  palette, the toast stack, and one polite live region. THE SIDEBAR HOLDS EVERY PLACE, the window's full height on the
  left; the top bar runs across the work's column only and says where you are and lets you ask. The two are one surface
  (`--nav`), and only the work sits on the board.

  THE LIVE HAIRLINE ACROSS THE TOP IS DRAWN ONLY WHILE SOMETHING IS WRONG. It
  was two pixels in the boundary colour on every screen at all times, on the argument that a
  healthy state should still be visible; what it drew was a line across the top of every window
  that said nothing. A healthy connection is the ordinary state and carries no mark. The line
  appears while a poll stands in for a socket (dashed) and when a poll has failed (solid), each in
  `--warn`, so the only time a person sees it is the time it has something to say.

  The offline signal must not cry wolf, which is a detection rule and not a styling one:
  `navigator.onLine` reports online on a LAN with no internet, so the real signal is a failed write
  or a failed poll of `/api/version`, never the browser's guess. Once it IS detected, it is shown as
  what it is: writes will fail.

  THE PHONE HAS NO FLOATING SEARCH DISC. Below 900px search is the 44px button in each screen's
  head bar (`PageHead.svelte`); the disc sat over the header of every screen, under the 44px floor,
  and twice on `/search`.
-->
<script lang="ts">
  import { BASE, apiBase, at, here, slugOf } from '$lib/at.ts';
  import { appPath, isApp, macNotifications, notify, onShell, setBadge, windowFocused } from '$lib/shell.ts';
  import { handoffAlert, instructionAlert, questionAlert, ring, type Alert } from '$lib/shell/alerts.ts';
  /* THE STYLESHEETS AND `applyInset()` ARE THE ROOT LAYOUT'S (`routes/+layout.svelte`), in the order they always had,
     so the light frame and this one draw on the same skin. */

  import * as pref from '$lib/pref.ts';
  import { copy } from '$lib/copy/frame.ts';
  import { callsOut, leaving, quiet, rested, settled } from '$lib/ui/screen.svelte.ts';
  import { copyMark } from '$lib/data/copy-mark.svelte.ts';
  import { onCallsOut } from '@braindog/client';
  import { GoPrefix, overlays, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { inField, notTheShells } from '$lib/a11y/typed.ts';
  import { watchKeyboard } from '$lib/a11y/keyboard.ts';
  import { watchMenus } from '$lib/ui/context-menu.ts';
  import TopBar from '$lib/ui/TopBar.svelte';
  import { assets } from '$app/paths';

  import { named } from '$lib/env.ts';
  import TabBar from '$lib/shell/TabBar.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import StepUp from '$lib/reauth/StepUp.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { follow, followGrant, live, readingAs } from '$lib/data/live.svelte.ts';
  import { timingOpened } from '$lib/data/timing.ts';
  /* THE PALETTE AND THE `?` SHEET'S BODY ARRIVE AFTER THE SHELL. Both are closed on every first
     paint, and the palette carries its commands, its search and Slash's drawing, so importing them
     here put all of that in front of the first screen and in the entry's preload list. They are
     asked for as the shell mounts: a `⌘K` pressed before the palette lands sets `palette.open`,
     and the palette opens on that when it does. */
  /* Named as types, which the compiler erases: the layout still reaches both, as `dead-copy` reads it. */
  import type PaletteView from '$lib/palette/Palette.svelte';
  import type KeymapView from '$lib/ui/Keymap.svelte';
  import type SideBarView from '$lib/shell/SideBar.svelte';
  import { SIDE_KEY, sideKept } from '$lib/shell/side.ts';
  import type CopyMarkView from '$lib/ui/CopyMark.svelte';
  import { openAsk, openPalette, palette } from '$lib/palette/open.svelte.ts';
  import { frame } from '$lib/shell/frame.svelte.ts';
  import { KEYS_REGISTER } from '$lib/record/keys-register.ts';
  import { FACTS_KEY, IN_MORE, moneyLead, crumbOf, factsKept, homesOf, litOf, sideModel, sideOrder, type NavPlace, type SideLink, type SideList } from '$lib/shell/side.ts';
  import { openRecord } from '$lib/record/switcher.ts';
  import { MENU, WORK, arrange, flatNav, isHere, listCounts, orderLists, placeOf, tabsOf, type FlatItem } from '$lib/nav.ts';
  import { byUse, keptUses, noteUse } from '$lib/shell/tab-use.ts';
  import { AGENTS_PAGE, agentsHref, agentsPlace, heldHref, railOf } from '$lib/nav/rail.ts';
  import { TASKS } from '$lib/work/list.ts';
  import { needYouCount, toldReadable } from '$lib/home/need-you.ts';
  import { heardWaits, waitsNow, waitsTicket, workingNow } from '$lib/home/waits.svelte.ts';
  import { heardTold, toldNow } from '$lib/home/told-now.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { penCount, suggested } from '$lib/design/pen.ts';
  import { spineOf } from '$lib/spine.ts';
  import { said } from '$lib/voice.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import LapseBanner from '$lib/ui/LapseBanner.svelte';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';
  import Pull from '$lib/ui/Pull.svelte';
  import { words as offlineWords } from '$lib/data/offline.ts';
  import { holdIn, presses } from '$lib/data/held.svelte.ts';
  import { drewFirst } from '$lib/data/first-drawn.ts';
  import { tick, untrack, type Snippet } from 'svelte';
  import type { FrameData } from '$lib/shell/light.ts';
  import { afterNavigate, beforeNavigate, goto, invalidate, onNavigate } from '$app/navigation';
  import { noteOpened } from '$lib/palette/opened.ts';
  import { heard, quietFocus } from '$lib/ui/quiet-focus.ts';
  import { hush } from '$lib/motion/index.ts';
  import { PRODUCT } from '$lib/title.ts';
  import { navigating, page } from '$app/state';
  /* The Mac app's Go menu, a notification's click and braindog://goto: only an address of the app moves the window
     (`appPath`), and it stays in the BrainDog on screen (`at`), as the `g` chords do. */
  $effect(() => onShell('goto', (to) => {
    const path = appPath(to);
    if (path !== null) void goto(at(path));
  }));
  /* ⌥SPACE AND THE MENU'S "ASK SLASH" (⌘J) OPEN ASK, and its "Search" (⌘K) opens the search: the same surfaces the keys
     open in the page. Only the Mac app sends these; a browser never does. */
  $effect(() => {
    if (!isApp) return;
    const stops = [
      onShell('slash', () => openAsk()),
      onShell('search', () => openPalette()),
      /* A download has no browser bar to show it in the app: say where the file went. */
      onShell('saved', (name) => toasts.push(copy.savedToDownloads(name ?? ''))),
      onShell('unsaved', (name) => toasts.push(copy.notSaved(name ?? ''), { intent: 'warn' })),
    ];
    return () => stops.forEach((stop) => stop());
  });

  /* THE ROOT LOAD'S ANSWER (`routes/+layout.ts`), handed over by the root layout as Kit hands a layout its `data`. */
  let { data, children }: { data: FrameData; children: Snippet } = $props();

  /* Held in state and drawn through `{#if}`, not `{#await}`: an await block is a runtime of its own,
     and it landed in the entry chunk the lazy import was there to shrink. */
  let Palette = $state<typeof PaletteView | null>(null);
  let Keymap = $state<typeof KeymapView | null>(null);
  /* AND THE COPY'S HAIRLINE: invisible until a screen drawn from the local copy holds it, so it can land after the shell. */
  let CopyMark = $state<typeof CopyMarkView | null>(null);
  /* THE FRAME'S OWN CODE THAT NO SCREEN DRAWS FROM WAITS FOR THE FIRST SCREEN TO BE DRAWN AND AT REST (`rested`, 5 s at
     most), or for the moment it is asked for. Asked as the shell mounted, the palette (and the decision card and Slash
     it carries), the key sheet, the copy's mark, the freeze watchdog and the link reads were about 150 KB racing
     Today's own code and reads on a cold phone, and Today settled that much later (speed-d SD1, 30 Oct). */
  const atRest = rested();
  const later = (load: () => void): void => void atRest.then(load);
  let frameRested = $state(false);
  let paletteAsked = false;
  const loadPalette = (): void => {
    if (paletteAsked) return;
    paletteAsked = true;
    void import('$lib/palette/Palette.svelte').then(
      (m) => (Palette = m.default),
      () => (paletteAsked = false),
    );
  };
  let keymapAsked = false;
  const loadKeymap = (): void => {
    if (keymapAsked) return;
    keymapAsked = true;
    void import('$lib/ui/Keymap.svelte').then(
      (m) => (Keymap = m.default),
      () => (keymapAsked = false),
    );
  };
  $effect(() => {
    later(loadPalette);
    later(loadKeymap);
    later(() => (frameRested = true));
  });
  /* THE COPY'S MARK LOADS ONLY WHEN A SCREEN WAS DRAWN FROM THE LOCAL COPY AND IS STILL ASKING (polish-l, PL3), and no
     sooner than the frame's other extras. Loaded on every visit at rest, it was Today's last change on a visit that
     drew nothing from the copy, a hairline that never shows; now such a visit never asks for it at all. */
  let copyMarkAsked = false;
  $effect(() => {
    if (!frameRested || !copyMark.on || copyMarkAsked) return;
    copyMarkAsked = true;
    void import('$lib/ui/CopyMark.svelte').then(
      (m) => (CopyMark = m.default),
      () => (copyMarkAsked = false),
    );
  });
  /* OPENED BEFORE IT LANDED: asked now, and drawn open the moment it arrives. */
  $effect(() => {
    if (palette.open) loadPalette();
  });

  /* FRAME B'S SIDEBAR (23 October): under the top bar, the record's projects. Shown or hidden and its width are this
     device's (pick 5), read before the first draw so the work does not jump; its chunk loads only once it is drawn. */
  const sideFirst = (() => {
    try {
      return sideKept(localStorage.getItem(SIDE_KEY));
    } catch {
      return sideKept(null);
    }
  })();
  let sideShown = $state(!sideFirst.hidden);
  let sideWidth = $state(sideFirst.width);
  let SideBar = $state<typeof SideBarView | null>(null);
  function keepSide(): void {
    try {
      localStorage.setItem(SIDE_KEY, JSON.stringify({ hidden: !sideShown, width: sideWidth }));
    } catch {
      /* A browser that keeps nothing keeps the sidebar as it is for this tab. */
    }
  }

  /* These surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6),
     and `/signin` because a rail listing somebody else's registers behind a sign-in form is the
     screen claiming you are already in. `/connect`, an app's consent screen, and `/connect/approve`, the six digits a
     terminal prints, come before any work in a record as sign-in does, and without the rail it fits a phone with Allow in thumb reach. AND EVERY SCREEN UNDER
     `/signin/`: the desktop app's return drew inside the shell, the top bar's counts over a "Signing in" (first F12). */
  const bare = $derived.by(() => {
    /* Read inside the record: the address is `/acme/start` and the rule is about `/start`. */
    const at = here(page.url.pathname);
    return at === '/start' || at === '/signin' || at.startsWith('/signin/') || at === '/signup' || at === '/invite' || at === '/connect' || at === '/connect/approve' || at === '/s' || at.startsWith('/s/');
  });

  /* THE SHELL'S, AND A PAGE'S. It was local, so a page could not open the palette — which is why
     `/[id]`'s `Search` button navigated Home instead of searching. */
  let keymapOpen = $state(false);
  $effect(() => {
    if (keymapOpen) loadKeymap();
  });
  /* THE FACE'S "KEYBOARD KEYS" ASKS FOR THE SHEET (`shell/frame.svelte.ts`): opened here, with this rail's `g` letters. */
  $effect(() => {
    if (!frame.keys) return;
    frame.keys = false;
    void leadIn()
      .then((m) => (m.sayGoto(railRows()), sheetSays++))
      .finally(() => (keymapOpen = true));
  });

  /* THE SAME DOOR AND THE SAME SENTENCES AS THE RAIL'S SWITCHER (`Sidebar.svelte`): the session moves to the other
     record and the app starts again at its Home, by a whole load, because every answer this tab holds was read from the
     record being left. A host with no switch door says the record was not opened. `/auth/switch` is at the root, and a
     root-relative address reaches it from the page the browser is on. */
  let opening = false;
  async function openOther(r: { slug: string; name: string }) {
    if (r.name === data.index.name || opening) return;
    opening = true;
    const out = await openRecord((url, init) => fetch(url, init), r.slug);
    opening = false;
    if (out.from === 'opened') return location.assign(out.to);
    toasts.push(out.from === 'absent' ? copy.recordNotOpened : out.fix, { intent: 'warn' });
  }


  /** The same order the rail draws, one nav and not two shapes. */
  /* A SAVED VIEW DRAWN UNDER ITS LIST is not drawn again under Views. The palette still reads every page in `data.nav`. */
  /* AND A TABBED SECTION'S PAGE PAST THE RAIL'S BUDGET IS THE STRIP'S, NOT THE RAIL'S (`cut`). */
  /* UNDER THE NAMES THIS PERSON GAVE THEIR PAGES (`nav.labels`), in the rail, the top bar and the sidebar alike. */
  const railNav = $derived.by(() => {
    const placed = new Set(data.index.registers.flatMap((r) => (r.views ?? []).map((v) => v.href)));
    return navPrefs.relabel(data.nav.filter((n) => !n.cut && !placed.has(n.href)));
  });
  /* WHAT WAITS, AS THE NEWEST `boot` SAID IT (`waits.svelte.ts`): the shell's, and then the poll's re-read of `boot`, so
     the badge moves with the record and says the number Today's header and the sentence in Needs you say. */
  $effect.pre(() => heardWaits({ waits: data.waits ?? null, working: data.working ?? [] }));
  /* AND WHAT A RUN ANSWERED NEEDS YOU ON, of what he told it (`told-now.svelte.ts`): counted in the same number. */
  const open = $derived(needYouCount(waitsNow(), data.open, toldNow().needs.length));
  /* THE DOCK BADGE FOLLOWS THE NEEDS YOU COUNT (the PWA badge in a browser that has one); 0 clears it. */
  $effect(() => setBadge(open));
  /* THE PHONE'S OWN WAYS ARE LOADED A MOMENT AFTER THE SHELL, so their chunk never holds up a first screen. */
  let phoneWays = $state(false);
  $effect(() => {
    const t = setTimeout(() => (phoneWays = true), 800);
    return () => clearTimeout(t);
  });
  /* A NEW QUESTION OR HANDOFF RINGS ONCE (`alerts.ts` dedups by id and seeds on the first hearing), never while this
     window is in front, and only with the Settings switch on. A click goes to the item through the shell's `goto`. */
  let rung: Set<string> | null = null;
  /* AN ALERT OPENS A PAGE THE RECORD HOLDS: a handoff or a finished instruction goes to the agents page where there is
     one, else to Settings › Agents (`agentsPlace`), never to "No page called agents". */
  const landed = (goto: string): string => heldHref(data.pages, goto) ?? (goto.startsWith(AGENTS_PAGE) ? agentsPlace(data.pages) : '/');
  const hear = (items: Alert[]): void => {
    rung = ring(rung, items.map((a) => ({ ...a, goto: landed(a.goto) })), { on: macNotifications, focused: windowFocused, send: notify });
  };
  $effect.pre(() => {
    const asked = (data.questions ?? []).map((q) => questionAlert({ id: q.id, question: q.title }));
    untrack(() => hear(asked));
  });

  /**
   * WHAT CAME BACK FROM WHAT HE TOLD AGENTS (`record/told-live.ts`): the instructions a run answered Needs you, which
   * count in the badge and on Today, and the ones it finished, which Handled lists. Read with the shell and again
   * whenever the poll re-reads `boot`, and only where `boot` lists his instructions and says he owns the list, so a
   * record where he never told an agent anything is asked nothing. A Done or a Needs you moved in the last two minutes
   * rings as the app's alert (`instructionAlert`), once per state.
   */
  const toldBack = (base: string): void => {
    void import('$lib/record/told-live.ts')
      .then(async (m) => {
        const back = await m.readToldBack(base);
        if (back === null) return;
        heardTold(back);
        hear(m.toldMoves(back, m.recordNow()).flatMap((t) => instructionAlert(t) ?? []));
      })
      .catch(() => undefined);
  };
  $effect(() => {
    if (bare || data.live !== true || data.refused) return;
    const base = apiBase(page.url);
    const reads = data.index.registers;
    const levels = data.me?.levels;
    if (toldReadable(reads, levels)) untrack(() => toldBack(base));
  });
  const inbox = $derived(waitsNow()?.inbox ?? data.inbox);
  /* THE SPINE'S RULE FOR INBOX (`spine.ts`): it is a tool once anything has arrived. A shell no record answered has no
     `counts`, and is read from the two numbers it does carry. */
  const spine = $derived(spineOf(data.counts ? { ...data.counts, decide: open, inbox } : { decide: open, inbox }));
  /* THE SIDEBAR'S FOOT: what the record is run with, then Settings, the one door to it. USAGE'S WORD IS WRITTEN OUT
     rather than read from `record/actions.ts`, which would carry the usage reader into the entry chunk for one word. */
  const USAGE = 'Usage';
  const foot = $derived<SideLink[]>([
    ...(spine.includes('inbox') && !navPrefs.isHidden('/inbox') ? [{ href: '/inbox', label: said('inbox'), icon: 'inbox' }] : []),
    /* ADD-ONS AND USAGE ARE THE OWNER'S (collab pass, 2 Nov): a colleague can install nothing and pays for nothing. */
    ...(data.me.owner ? [{ href: '/packs', label: copy.packs, icon: 'packs' } as SideLink, { href: '/usage', label: USAGE, icon: 'observe' } as SideLink] : []),
    { href: '/settings', label: copy.settings, icon: 'settings' },
  ]);

  /* THE PERSON'S OWN RAIL, as `boot` answered it, before anything draws it (`nav-prefs.svelte.ts`). */
  $effect.pre(() => navPrefs.adopt(data.me.prefs, apiBase()));
  /* SCREENSHOT MODE WHEN THE PERSON'S OWN `look.shot` SAYS SO (`lib/shot/mode.ts`), loaded only then, so the own words and
     the plate's sheet stay out of the entry. A boolean, so a navigation with the same answer starts nothing, and a bare
     surface (a shared page) never takes it. The palette, the key and Settings turn it on and off themselves. */
  const shotWanted = $derived(data.me.prefs?.['look.shot'] === true && !bare);
  $effect(() => {
    if (!shotWanted) return;
    let stop: (() => void) | null = null;
    let gone = false;
    void import('$lib/shot/mode.ts')
      .then((m) => m.applyShot(true, document.body))
      .then((s) => (gone ? s() : (stop = s)))
      .catch(() => undefined);
    return () => {
      gone = true;
      stop?.();
    };
  });
  /* THE PAGE THIS PERSON OPENS ON (`home.page`): once per tab, and only when the tab opened on the bare front door, so
     the Today item still opens Today. */
  let homed = false;
  $effect(() => {
    if (homed) return;
    homed = true;
    const home = navPrefs.home;
    if (home !== null && home !== '/' && here(page.url.pathname) === '/' && page.url.search === '') void goto(at(home), { replaceState: true });
  });
  /* A PAGE HIDDEN FROM THE RAIL IS HIDDEN FROM THE TOP BAR AND THE SIDEBAR TOO: one nav, not two. */
  const grouped = $derived(arrange(railNav.filter((e) => !navPrefs.hidden.includes(e.href)), navPrefs.order));
  /* THE SIDEBAR'S LISTS IN THE RAIL'S ORDER, from the same preference (`orderLists`), the kernel's own marked, each with
     what its declaration says of where it belongs: as the sidebar learnt it, else as this device last kept it, so every
     list is drawn in its home at once, from the shell's own index, and never pops in after a read. */
  const kernelLists = $derived(new Set(data.lists.filter((l) => l.kernel).map((l) => l.id)));
  const keptFacts = $derived.by(() => {
    try {
      return factsKept(localStorage.getItem(FACTS_KEY), apiBase(page.url));
    } catch {
      return {};
    }
  });
  /* WHAT EACH LIST DECLARES, READ ONCE THE FIRST SCREEN HAS RESTED (`later`), on the desk and the phone alike, and kept on
     this device so the next draw places each list at once. Its reader is the sidebar's own chunk, asked for here, never
     in the entry, and never in the first screen's way: it carries the projects' cards' readers, about 20 KB. */
  /* WHETHER THAT READ HAS ANSWERED, either way. A FIRST VISIT KEEPS NO FACTS, so every list stood under More lists ("More
     lists 18") until the read placed them and the row said "1": the sidebar holds More lists until the lists are placed
     (`listsPlaced`), so the row is drawn once with its true count. */
  let factsSettled = $state(false);
  $effect(() => {
    if (bare || data.live !== true || data.refused) return void (factsSettled = true);
    const base = apiBase(page.url);
    const lists = data.lists;
    let gone = false;
    later(() =>
      void import('$lib/shell/side-read.ts')
        .then((m) => m.readFacts(base, lists))
        .then((facts) => {
          if (gone) return;
          factsSettled = true;
          if (Object.keys(facts).length === 0) return;
          frame.facts = facts;
          try {
            const all = JSON.parse(localStorage.getItem(FACTS_KEY) ?? '{}') as Record<string, unknown>;
            all[base] = facts;
            localStorage.setItem(FACTS_KEY, JSON.stringify(all));
          } catch {
            /* Kept for this tab only. */
          }
        })
        .catch(() => void (factsSettled = true)),
    );
    return () => {
      gone = true;
    };
  });
  /** Every list is in its home: the read has answered, or this device kept where each one belongs. */
  const listsPlaced = $derived(factsSettled || Object.keys(keptFacts).length > 0);
  const sideLists = $derived<SideList[]>(
    /* ONE ENTRY FOR THE KEYS (Q28 of 29 October): the Keychain below is where keys are, so the list of them is not a
       second row ("Keys 176" over "Keychain"). The list still opens from the Keychain. */
    orderLists(data.index.registers.filter((r) => r.id !== KEYS_REGISTER), navPrefs.order).map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      count: r.count,
      ...(typeof r.open === 'number' ? { open: r.open } : {}),
      views: r.views,
      kernel: kernelLists.has(r.id),
      facts: frame.facts[r.id] ?? keptFacts[r.id] ?? null,
    })),
  );

  /**
   * THE FLAT LIST, ONE RULE FOR THE RAIL, THE TOP BAR, THE TAB BAR AND THE SHEET (`flatNav` in `lib/nav.ts`): Today, the
   * sections a day runs through, Activity, Decide while something waits, seven at most, and everything else under More.
   */
  /* AND WORK OPENS THE WORK SCREEN ON A RECORD WHOSE TASKS LIST HOLDS SOMETHING (`lib/work/Work.svelte`). A list with
     nothing in it is a part the record does not use yet, so it is not drawn: Work with no tasks drew a
     row of zeros and empty bands. `index.registers` carries each list's count, which `data.lists` does not; the first
     task brings Work back, and until then the palette and Today's capture line both add one. */
  const holdsTasks = $derived(data.index.registers.some((r) => r.id === TASKS && r.count > 0));
  /* AND HOW MANY ROWS EACH LIST HOLDS, so Projects takes its slot on a starter's bar by its projects and not its pages
     (RM10). From the shell's own index, never the facts read later, so the bar is drawn once and does not move after. */
  const counts = $derived(listCounts(data.index.registers));
  const flat = $derived(
    flatNav(grouped, open, { today: copy.today, activity: copy.audit, decide: said('decide') }, { work: holdsTasks ? WORK : null, counts }),
  );
  /**
   * THE RAIL'S SECTIONS (`railOf`): the seven places, each section's own things under its name, and the
   * rest under More. One reading for the rail, the tab bar and the sidebar, so a place is in the same spot on each.
   */
  const rail = $derived(railOf(flat, said('decide')));
  /* A BAR HAS NO ROW FOR KILN, SO ON KILN'S PAGE ITS SECTION IS WHERE YOU ARE: the rail marks Kiln under Projects
     (`railOf`), and the top bar and the tab bar, which draw no Kiln, mark Projects in its ink block. */
  const withThings = (items: FlatItem[]): FlatItem[] =>
    items.map((i) => {
      const own = rail.things.find(([section]) => section === i.label)?.[1] ?? [];
      return own.length > 0 ? { ...i, near: [...i.near, ...own.map((e) => e.href)] } : i;
    });
  /* READ AT ONCE, so a phone's first draw is already a phone's (the Projects tab draws the list, not the desk page). */
  let narrow = $state(typeof matchMedia === 'function' && matchMedia('(width < 900px)').matches);
  $effect(() => {
    const mq = matchMedia('(width < 900px)');
    const set = (): void => void (narrow = mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  });

  /* THE BANNERS, HANDED TO THE PAGE'S HEAD for a phone to draw under its bar (`frame.banners`, collab pass 2). */
  $effect(() => {
    frame.banners = shellBanners;
    return () => {
      frame.banners = null;
    };
  });

  /* AND WHETHER THE SIDEBAR CAN STAND BESIDE THE WORK: from 1,280 up. Narrower it slides in from the left over the page. */
  let deskWide = $state(typeof matchMedia === 'function' && matchMedia('(width >= 1280px)').matches);
  $effect(() => {
    const mq = matchMedia('(width >= 1280px)');
    const set = (): void => void (deskWide = mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  });

  /* THE SIDEBAR IS THE BAR SHAPE'S: the full column beside the work from 1,280 (`sideOn`), and narrower, or hidden, its
     56px rail of the places (`railOn`), never nothing. From the rail the full sidebar opens as a drawer over the page
     from the left (`sideOver`), never from the right, and the menu shape's one button opens the same drawer. */
  let sideOver = $state(false);
  const sideOn = $derived(navPrefs.shape === 'bar' && !narrow && deskWide && sideShown);
  const railOn = $derived(navPrefs.shape === 'bar' && !narrow && !sideOn);
  const overOn = $derived(!narrow && sideOver && !sideOn);
  /* THE PROJECTS PLACE is the one whose own things are projects' pages, else the section called Projects: its heading
     is the sidebar's projects part, never a place of its own. */
  /* ONLY A PLACE WHOSE THINGS ARE PROJECTS (AH13): a Guide's milestone pages are its things too, and taken for projects
     its place left the sidebar while the phone's bar kept it, so a laptop found the podcast plan two clicks into More. */
  const projectsLists = $derived(new Set(sideLists.filter((l) => l.facts?.projects === true).map((l) => l.id)));
  const projectsPlace = $derived(
    [...rail.places, ...rail.rest].find((p) => rail.things.some(([section, list]) => section === p.label && list.some((e) => typeof e.register === 'string' && projectsLists.has(e.register)))) ??
      [...rail.places, ...rail.rest].find((p) => p.key.replace(/^section:/u, '').trim().toLowerCase() === 'projects') ??
      null,
  );
  /* AND ANY OTHER PLACE'S THINGS ARE ITS OWN ROWS in the sidebar, as a view is (a Guide's milestone underway). */
  const thingViews = $derived(
    Object.fromEntries(
      [...rail.places, ...rail.rest]
        .filter((p) => p !== projectsPlace)
        .flatMap((p) => {
          const own = rail.things.find(([section]) => section === p.label)?.[1] ?? [];
          return own.length > 0 ? [[p.key, own.map((e) => ({ href: e.href, label: e.title, icon: 'doc' }))] as const] : [];
        }),
    ),
  );
  /* A RECORD THAT KEEPS NO PROJECT HAS NO PROJECTS TAB (first-hour audit E7): the sidebar opens its projects only once
     one is kept (`holdsProjects`), and the phone's bar put an empty Projects where the rail has Money. Known by a project's
     own page under the place, or the projects list's count; the first project brings the tab back. */
  const keepsNoProject = $derived(
    projectsPlace !== null && !rail.things.some(([section]) => section === projectsPlace.label) && !sideLists.some((l) => l.facts?.projects === true && l.count > 0),
  );
  /* THE PHONE'S FOUR, and Menu after them (`TabBar.svelte`): Today, Needs you, Projects, Money, or the four picked. WITH
     NONE PICKED THEY FOLLOW WHAT HE OPENS MOST (`tab-use.ts`, plan F7), read once as the shell opens so the bar holds
     still through a session; Today stays first. */
  const tabUses = typeof window === 'undefined' ? [] : keptUses();
  const tabs = $derived.by(() => {
    const main = withThings(keepsNoProject ? rail.places.filter((p) => p !== projectsPlace) : rail.places);
    const chosen = tabsOf(main, 4, navPrefs.tabs);
    return navPrefs.tabs.length > 0 ? chosen : byUse(main, chosen, tabUses);
  });
  /** The place of the rail a page sits in, past Today: its own address, its section's pages, or a list under it. */
  const placeAt = (path: string): FlatItem | undefined =>
    withThings(rail.places)
      .slice(1)
      .find((p) => {
        if (p.key === 'activity') return false;
        if (isHere(p, path)) return true;
        const own = model.places.find((m) => m.key === p.key)?.kids ?? (projectsPlace?.key === p.key ? (model.projects?.kids ?? []) : []);
        return own.some((k) => path === k.href || path.startsWith(`${k.href}/`));
      });
  /* ON A PHONE THE MENU TAB IS THE SIDEBAR AS A PAGE, at its own address (`MENU`); the desk draws Today there. */
  const phoneMenu = $derived(narrow && placeOf(here(page.url.pathname), page.url.searchParams) === MENU);
  $effect(() => {
    if ((sideOn || railOn || overOn || phoneMenu) && SideBar === null) void import('$lib/shell/SideBar.svelte').then((m) => (SideBar = m.default));
  });

  /* THE PROJECTS AN AGENT IS AT WORK ON, by name, for the sidebar's green dots. */
  const workingOn = $derived(workingNow().map((w) => w.project));

  /* HIDE OR SHOW, BY ITS BUTTON OR `[`: the column narrows to its rail or widens again, and the work slides from where
     its edge was (`slide`); under 1,280 the full sidebar opens or closes as a drawer over the rail. */
  const RAIL_W = 56;
  async function toggleSide(): Promise<void> {
    if (narrow) return;
    if (shape !== 'bar' || !deskWide) return void (sideOver = !sideOver);
    const was = sideShown ? sideWidth : RAIL_W;
    sideShown = !sideShown;
    keepSide();
    await tick();
    const el = document.getElementById('main');
    const now = sideShown ? sideWidth : RAIL_W;
    if (el) slide(el, getComputedStyle(el).direction === 'rtl' ? now - was : was - now);
  }

  /* WHERE THE AGENTS PLACE IS, wherever the rail put it: the place that carries the live dot. */
  const agentsAt = $derived(agentsHref([...rail.places, ...rail.rest], data.pages));

  /**
   * THE SIDEBAR, ONE MODEL (`side.ts` `sideModel`): Today, Needs you and the record's places, each with its count and the
   * lists that are its own (`homesOf`); the projects' part; the sections and lists with no place under More lists; and
   * the foot. EACH PLACE COUNTS ONE THING, said the same wherever it is said: what needs you on Needs you, who is at work
   * on Agents, the open tasks on Work and the people on People (read by the sidebar, `side-read.ts`).
   */
  const placed = $derived.by(() => {
    const all = [...rail.places, ...rail.rest];
    const agents = all.find((i) => i.href === agentsAt)?.key ?? null;
    const money = all.find((i) => i.key.replace(/^section:/u, '').trim().toLowerCase() === 'money')?.key ?? null;
    const at = { agents, money };
    const working = workingNow().length;
    const places: NavPlace[] = all
      .filter((i) => i !== projectsPlace && i.key !== 'activity' && (rail.places.includes(i) || i.key === agents))
      .map((i) => (i.key === 'decide' ? { ...i, count: open } : i.key === agents ? { ...i, count: working, live: working > 0 } : i));
    const others: NavPlace[] = rail.rest.filter((i) => i !== projectsPlace && i.key !== 'activity' && i.key !== agents);
    return { at, places: sideOrder(places, at), others };
  });
  const sideHomes = $derived(homesOf(sideLists, placed.places, placed.at));
  /* A PAGE HELD OFF THE RAIL WHILE ITS LISTS ARE EMPTY (`waits`, audit 31 Oct f, AF7) goes under its section's place, at
     the end of that place's rows (under Money's More), or under More lists where its section is no place: Splits and
     Weather, just installed, had no row and no crumb. Hidden pages stay hidden. */
  const waiting = $derived.by(() => {
    const byName = new Map(placed.places.map((p) => [p.label.trim().toLowerCase(), p.key] as const));
    return navPrefs
      .relabel(data.nav.filter((n) => n.waits === true && !navPrefs.hidden.includes(n.href)))
      .map((n) => ({ href: n.href, label: n.title, icon: n.icon, section: n.section, home: byName.get(n.section.trim().toLowerCase()) ?? IN_MORE }));
  });
  const model = $derived(
    sideModel({
      places: placed.places,
      others: placed.others,
      projects: projectsPlace
        ? {
            href: projectsPlace.href,
            label: projectsPlace.label,
            things: (rail.things.find(([section]) => section === projectsPlace.label)?.[1] ?? []).map((e) => ({ href: e.href, label: e.title, icon: 'doc' })),
          }
        : null,
      lists: sideLists,
      homes: sideHomes,
      views: Object.fromEntries(
        [...new Set([...Object.keys(rail.views), ...Object.keys(thingViews)])].map((key) => [
          key,
          [...(rail.views[key] ?? []).map((v) => ({ href: v.href, label: v.title, icon: 'doc' })), ...(thingViews[key] ?? [])],
        ]),
      ),
      /* THE AGENTS' TOOLS ARE THE AGENTS': what runs by itself, and the keys they use. */
      tools: [
        /* A SCRIPT'S PAGE IS AUTOMATIONS' TOO (its Scripts tab), so it lights this row and its crumb reads "Agents ›
           Automations › <script>" where it was the title alone (audit 6g, AG30). */
        { href: '/automations', label: copy.automations, icon: 'refresh', home: placed.at.agents ?? IN_MORE, near: ['/scripts'] },
        /* THE KEYS LIST IS THE KEYCHAIN'S TABLE VIEW (AG16), so the Keychain is lit there and on a key's own page too. */
        { href: '/keychain', label: copy.keysPlace, icon: 'vault', home: placed.at.agents ?? IN_MORE, near: ['/r/credentials'] },
      ],
      foot,
      counted: holdsTasks ? { work: TASKS } : {},
      /* MONEY KEEPS ITS PAGES OPEN AND ITS LISTS FOLDED (Q35 of the 29 Oct audit): the places he goes stand under it,
         and Snapshots, Books, Exchange rates, Categories and the rest wait under its More. */
      leads: placed.at.money ? { [placed.at.money]: moneyLead(rail.views[placed.at.money], [...rail.places, ...rail.rest].find((i) => i.key === placed.at.money)?.href) } : {},
      waiting,
    }),
  );
  /* A TAB IS LIT ON ITS PLACE'S OWN LISTS TOO, as the sidebar's place unfolds there: Money's tab on its ledger. */
  const phoneTabs = $derived(
    tabs.map((t) => {
      const own = model.places.find((p) => p.key === t.key)?.kids ?? (projectsPlace?.key === t.key ? (model.projects?.kids ?? []) : []);
      return own.length > 0 ? { ...t, near: [...t.near, ...own.map((k) => k.href)] } : t;
    }),
  );
  /* THE ONE LIT ROW, and the crumb the bar says it in. */
  /* AN ADDRESS WHOSE FIRST WORD NAMES NO RECORD THAT ANSWERED is a page that is not here (`routes/+page.svelte`), not this
     record's Today: the bar said "Today" and lit it over "No page called nope-not-here" (skills pass 2 Nov). Nothing is
     lit, and the bar says the page's own name. */
  const stray = $derived.by(() => {
    const named = slugOf(page.url.pathname);
    return named !== null && here(page.url.pathname) === '/' && data.index.slug !== '' && named !== data.index.slug;
  });
  const spot = $derived(stray ? '' : placeOf(here(page.url.pathname), page.url.searchParams));
  const lit = $derived(litOf(spot, model));
  const crumb = $derived(crumbOf(spot, model, lit, frame.title || null, frame.heading || null, frame.up));
  /* A PAGE ABOUT A ROW LIGHTS THE ROW ITS LIST SITS UNDER (F33): an account's page opened Money with Accounts lit, as its
     crumb says, where it lit nothing and Money stayed shut. */
  const sideLit = $derived(lit ?? (frame.up?.href ? litOf(frame.up.href, model) : null));
  $effect.pre(() => {
    frame.here = crumb.at(-1)?.label ?? '';
  });
  /* SUGGESTED CHANGES, AT THE SIDEBAR'S FOOT WHEN ANY WAIT: an update that adds a page lands hidden. */
  const penWaits = $derived(penCount(data.pen, (id) => navPrefs.isDismissed(id)));
  const sidePen = $derived(penWaits > 0 ? { label: suggested(penWaits), href: '/settings/navigation#suggestions' } : null);

  /* WHERE THE PALETTE'S "GO TO" LEADS WITH NOTHING TYPED: the sidebar's places, the projects, and Settings. */
  const sidePlaces = $derived<FlatItem[]>([...model.places.map((p) => ({ key: p.key, href: p.href, label: p.label, icon: p.icon, near: p.near })), ...(projectsPlace ? [projectsPlace] : [])]);
  const goPlaces = $derived([...sidePlaces, { key: 'settings', href: '/settings', label: copy.settings, icon: 'settings', near: ['/settings'] }]);

  /**
   * A PLACE THAT COMES INTO THE RAIL IS SAID ONCE: a place is drawn when it has something to show, so the day
   * the first account is typed Money appears, and one toast says "Money is in your sidebar now." No badge and no count.
   *
   * `arrivedIn` IS THE WHOLE RULE, and `place-arrived.test.ts` cuts it out of this file and runs it, so it stays one
   * pure arrow. A place is Work or a section, first seven or under More, told by its key: a place somebody renamed or
   * that moved between the two has not come. The rail holds those and the three it always draws (`railOf`), so a
   * place is whatever is none of the three. The first draw in a tab says nothing, and neither does a place the person
   * brought back from hidden themselves. THAT IS READ FROM EVERY ADDRESS THE PLACE ANSWERS TO (`near`), not only the
   * one its row opens: a section opens on its Overview, so when its second page is brought back in the draw its
   * Overview first has something to show, the page that was hidden is not the row's own and the address alone
   * missed it. `near` holds the row's own address too, and only pages drawn now, so a page still hidden silences nothing. A
   * screen with no rail and a record that refused are no draw at all, so the rail that follows them is a first one.
   * Three places in one draw are one sentence.
   */
  /* AND A PLACE ALREADY DRAWN BY ITS NAME HAS NOT COME (AH13): a team's Tickets turns into the Work screen's row with its
     first ticket, a new key under the same name, and was said as arriving. */
  const arrivedIn = (was: { keys: ReadonlySet<string>; hidden: readonly string[]; labels?: ReadonlySet<string> } | null, now: readonly { key: string; label: string; near: readonly string[] }[]): string[] =>
    now
      .filter((i) => was !== null && !['today', 'decide', 'activity'].includes(i.key) && !was.keys.has(i.key) && !(was.labels?.has(i.label) ?? false) && !i.near.some((h) => was.hidden.includes(h)))
      .map((i) => i.label);
  let drawn: { keys: ReadonlySet<string>; hidden: readonly string[]; labels?: ReadonlySet<string> } | null = null;
  $effect(() => {
    if (bare || data.refused) return void (drawn = null);
    const now = [...rail.places, ...rail.rest];
    /* A PLACE A TOAST ALREADY NAMED IS NOT SAID AGAIN (AM4): "Turned on Money. Added a payment" is the one toast. */
    const names = arrivedIn(drawn, now.filter((i) => !i.near.some((h) => toasts.wasNamed(h))));
    drawn = { keys: new Set(now.map((i) => i.key)), hidden: [...navPrefs.hidden], labels: new Set(now.map((i) => i.label)) };
    if (names.length > 0) toasts.push(copy.placeArrived(names, untrack(() => (!narrow ? 'sidebar' : names.every((n) => phoneTabs.some((t) => t.label === n)) ? 'bar' : 'menu'))));
  });
  /* THE PERSON READING, by the name the record told them, for the face: a guest's own name comes with `me`, since
     `names` names nobody to her, so her face is her own letter and never the "Y" of "You". */
  const personName = $derived((data.me.person && Object.hasOwn(data.names, data.me.person) ? (data.names[data.me.person] ?? '') : '').trim() || (data.me.name ?? '').trim());

  /* `g 1`–`9` COUNT WHAT IS ON SCREEN: the places, in the order drawn, the sidebar's on the bar shape. */
  const numbered = $derived(navPrefs.shape === 'bar' ? sidePlaces : rail.places);
  /* REMEMBERED, because a rail somebody folded is a rail they want folded on the next page too —
     and `app.html` has always read this cookie before first paint, so a remembered fold costs no
     flash. Nothing wrote it until now. */
  /**
   * THE RECORD'S COLOUR, PUT BACK — AND SAID OUT LOUD WHEN IT CANNOT BE.
   *
   * `app.html` stamps `data-theme` before first paint so there is no flash of the wrong palette;
   * `restoreAccent` is what puts the custom properties behind that attribute.
   *
   * IT ALSO DROPS A STORED COLOUR THE CONTRAST FLOOR NOW REFUSES, and this shell used to throw that
   * refusal away. The four colours the swatch row once suggested are all refused by
   * check R: Moss is 2.92:1 as a fill against `s1` in dark against a 3:1 floor, and the other three
   * are 2.55, 2.84 and 2.94, so every browser that pressed one of them loses its colour on the next
   * load. `accent.ts` writes a `console.warn` naming the ratio, which is the right account for
   * whoever can move a lightness axis and no account at all for the person who chose the green.
   *
   * A TOAST, AND IT IS THE STACK'S OWN DIALECT RATHER THAN A NEW ONE. `Sidebar.svelte:134` says the
   * same kind of thing in the same shape — "a change the record refused is already put back on
   * screen; this says why", `intent: 'warn'` — and that is exactly this case: the colour is already
   * back to House by the time the toast is pushed. The stack is one polite live region for the whole
   * product, so this reaches a screen reader without a second one being invented, and `warn` draws
   * the `alert` glyph so the meaning is not carried by colour alone.
   *
   * ONCE, AND THE CLEARING IS WHAT MAKES IT ONCE. `restoreAccent` empties the preference before it
   * answers, so the next load holds nothing to refuse and says nothing; a sentence on every load
   * for ever would be worse than the silence being repaired here. This shell mounts once for the
   * life of the tab, so a load says it at most one time.
   *
   * AND THE SAYING IS `untrack`ED, WHICH IS THE RULE `Empty.svelte:98` ALREADY PAID FOR. `push` reads
   * `this.items` before it writes them and `#arm` reads `this.held` (`toast.svelte.ts:43` and `:109`),
   * so a toast pushed from inside an effect makes that effect depend on the stack it just pushed to
   * and Svelte schedules it again. Empty's version of the same shape ran until
   * `effect_update_depth_exceeded` on four of the five states it draws. This one would have stopped
   * on its second run, because the cookie is empty by then and `restoreAccent` answers `{ ok: true }`,
   * but that is the clearing rescuing a dependency nobody wanted: a browser whose cookie can be read
   * and not written would refuse, push, and loop into the blank screen `pref.ts` says a preference
   * must never be able to cause. Saying something is not a dependency.
   *
   * THE NAME IN THE SENTENCE IS A HEX AND NOT "MOSS", WHICH IS MEASURED AND NOT AN OVERSIGHT. The
   * swatch row can say "Moss" because it is naming a swatch somebody just pressed; here the colour
   * is a hex from a cookie written by an older build, and `theme.test.ts:684` asserts every current
   * `ACCENTS` entry passes `recordTheme`, so a lookup against that row can never hit for a colour
   * that got this far. Dead flexibility, left out.
   *
   * AND THE SENTENCE SAYS THE HOUSE COLOUR IS BACK, the colour that was refused and why, in one line.
   */
  /* LOADED ONLY WHEN THE COOKIE HOLDS A COLOUR: the contrast checks behind `restoreAccent` are the theme builder's, and a
     browser on the house colour has nothing for them to check. */
  $effect(() => {
    if (!pref.read().theme) return;
    void import('$lib/accent.ts').then(({ restore: restoreAccent }) => {
      const out = restoreAccent();
      if (!out.ok) untrack(() => toasts.push(copy.accentRefused(out.dropped, out.codes), { intent: 'warn' }));
    });
  });

  /**
   * THE SOFT KEYBOARD'S HEIGHT, WRITTEN AT LAST.
   *
   * `--kb` was declared in `tokens.css` and subtracted by `Sheet.svelte`, and nothing in either
   * app ever wrote it, so the term subtracted zero and the submit button of every sheet in the
   * product sat underneath the keyboard somebody had just used to fill the form. Measured on a
   * phone with the keyboard up: the visible viewport is about 508px and the sheet is 743.
   *
   * `visualViewport` is the only source of that number on iOS. The module is a plain `.ts` with
   * no runes so a test runner can load it, it takes the window as an argument so a test can hand
   * it one it owns, and its return value is the teardown, which is its whole public surface.
   */
  $effect(() => watchKeyboard(window));

  /**
   * THE FREEZE WATCHDOG (`lib/watchdog.ts`): the first block of the page over two seconds is said once, with the path
   * inside the record and what the screen held, so the next freeze names itself where the last one could not be made
   * to happen again.
   *
   * ASKED ONCE THE FIRST SCREEN HAS RESTED, as the palette is, so it is never in that screen's way; it reads the browser's
   * record from the start of the load, so a block before it arrived is still seen. The words are asked when the freeze
   * is said, because the screen it is about is the one on show when the page came back.
   */
  $effect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    later(() => void import('$lib/watchdog.ts').then((dog) => {
      if (gone) return;
      stop = dog.watchFreezes(window, () => ({ route: here(page.url.pathname), rendering: dog.drawingOf(document) }));
    }));
    return () => {
      gone = true;
      stop?.();
    };
  });

  /**
   * WHICH SHAPE OF NAVIGATION THIS PERSON CHOSE, from `19 §3`'s three.
   *
   * The top bar is the default, with the sidebar on the left; the menu keeps nothing on screen and
   * opens that same sidebar over the page. Both lean on the sidebar rather than on a second nav of
   * their own, because it already holds the projects, every list and the tools, in the reader's order.
   *
   * BELOW 900px NONE OF THIS APPLIES AND THE TAB BAR STAYS, which is §3's second condition and is
   * enforced in CSS a few rules down rather than here: a shape that let somebody put an
   * eighteen-entry strip across a phone would be a shape that breaks their phone.
   */
  /*
   * THE RECORD'S WORD, `nav.shape`, held for the tab by `navPrefs` and adopted from `boot` above. Before `boot` answers
   * it is the cookie's first-paint copy, and after it the cookie is only ever written from the record.
   *
   * AND IT REDRAWS WHEN IT IS SET, because the control that sets it is INSIDE the thing it changes: `/settings/navigation`
   * is a screen in this shell, and this shell mounts once for the life of the tab. Reading the field rather than the
   * cookie is what makes choosing Top bar move the navigation at once instead of on the next reload.
   */
  const shape = $derived(navPrefs.shape);

  /* CLEARED ON EVERY NEW SCREEN, or `data-screen` is the PREVIOUS screen's answer for exactly as
     long as this one takes to arrive, which is the window every browser gate measures in.

     AND THE SIDEBAR'S DRAWER CLOSES ON ONE, whichever of its rows started it: it belongs to the shell, which outlives
     every screen, so a row that navigated would leave it open over the new screen. */
  beforeNavigate((nav) => {
    moves += 1;
    /* A NEW SCREEN ONLY (skills pass follow-up, 2 Nov). A changed `?view=` or filter is the same screen answering, and a
       view that reads nothing new (Tasks' Board) never said it drew again, so `data-screen` stayed off for good and
       `calm()` held every arrival on it still. A read the change starts still takes the mark away until it lands. */
    if (newScreen(nav.from?.url, nav.to?.url)) leaving();
    /* The dev timing hook measures the next screen from here (`timing.ts`); off, it does nothing. */
    timingOpened();
    sideOver = false;
    keepPlace(nav);
  });

  /**
   * BACK TAKES YOU BACK TO WHERE YOU WERE, AND A NEW PAGE STARTS AT ITS NAME (motion F4).
   *
   * The window never scrolls here: `.body` is the one scroll container, so the browser's own restoring and SvelteKit's
   * restore nothing, and every Back landed at the top. So the place each screen was read to is kept as it is left (the
   * last fifty), and on Back the screen is waited for (`data-screen`, at most 1.5s, and long enough to scroll that far)
   * and put back there.
   *
   * FOCUS WENT TO THE BODY after every move, so a keyboard started again from the skip link and a screen reader heard
   * nothing of the new page. After a link or a `goto` it lands on the page's `h1` (`PageHead` makes it focusable by
   * script, with no ring for a pointer); on Back it lands on the link that was pressed to leave, when that is on screen.
   * Not when the palette moved: it was the thing in the reader's hands.
   */
  const scrolls = new Map<string, number>();
  const leftBy = new Map<string, string>();
  /* HOW MANY MOVES THIS TAB HAS MADE, so a place put back for one screen is never put back over the next one. */
  let moves = 0;
  const placeKey = (u: URL): string => u.pathname + u.search;
  /** Whether a move opens another screen: another path, or another place at the same path (Work and Menu at `/`). */
  const newScreen = (from: URL | undefined, to: URL | undefined): boolean =>
    !from || !to || from.pathname !== to.pathname || placeOf(here(from.pathname), from.searchParams) !== placeOf(here(to.pathname), to.searchParams);
  const scroller = (): HTMLElement | null => document.getElementById('main');
  let fromPalette = false;

  /**
   * Resolves once `ok()` holds, or at `ms` whichever is first, checking about once a frame.
   *
   * ON A TIMER, NOT `requestAnimationFrame`: inside a view transition's update the browser draws no frames, so a frame
   * loop there never ticked, the cross-fade waited for its own 4s timeout, and Back to Needs you landed late and at the
   * top (VERIFY H4).
   */
  function waitFor(ok: () => boolean, ms: number): Promise<boolean> {
    return new Promise((done) => {
      const until = performance.now() + ms;
      const tick = (): void => {
        if (ok()) return done(true);
        if (performance.now() >= until) return done(false);
        setTimeout(tick, 16);
      };
      tick();
    });
  }

  /** A bounded map: the newest fifty places, so a long session does not keep every address it saw. */
  function remember<V>(map: Map<string, V>, key: string, value: V): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > 50) map.delete(map.keys().next().value!);
  }

  function keepPlace(nav: { from: { url: URL } | null; to: { url: URL } | null; type: string }): void {
    const el = scroller();
    if (!el || !nav.from) return;
    const from = placeKey(nav.from.url);
    remember(scrolls, from, el.scrollTop);
    if (nav.to && nav.type === 'link') remember(leftBy, from, placeKey(nav.to.url));
    fromPalette = document.activeElement?.closest('dialog.palette') != null;
  }

  /* WHAT THE READER LAST DID, A KEY OR A PRESS, heard before anything else hears it, so a page's name focused after a
     move wears its ring only for a keyboard (`quiet-focus.ts`). */
  $effect(() => {
    const opts = { capture: true, passive: true } as const;
    addEventListener('keydown', heard, opts);
    addEventListener('pointerdown', heard, opts);
    return () => {
      removeEventListener('keydown', heard, opts);
      removeEventListener('pointerdown', heard, opts);
    };
  });

  /* WHERE HE WENT, KEPT ON THIS DEVICE for the empty palette's Recent. The first screen counts too. */
  afterNavigate((nav) => {
    if (nav.to) noteOpened(`${nav.to.url.pathname}${nav.to.url.search}`, PRODUCT);
    /* AND WHICH PLACE IT WAS IN, for the phone's four (`tab-use.ts`). */
    const went = nav.to ? placeAt(placeOf(here(nav.to.url.pathname), nav.to.url.searchParams)) : undefined;
    if (went) noteUse(went.href);
    /* THE RECORD FORMING (`$lib/motion`): a screen's first second draws still, so what was already there never flies in.
       ONLY A NEW SCREEN (skills pass follow-up, 2 Nov): a changed `?view=`, `?tab=` or filter is the same screen
       answering a press, and hushing it too stopped every Swap and arrival on a same-page switch (0 animations measured
       on People's Recent to A to Z and the store's chips). A new path, or another place at the same path (Work and the
       phone's Menu at `/`), is a new screen and still draws still. */
    if (newScreen(nav.from?.url, nav.to?.url)) hush();
  });
  /* AND FIGURES COUNT AND BARS GROW when the record changes them, from one watcher on the window, fetched after the
     first draw so Today's first load does not wait for it. */
  $effect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    void import('$lib/motion/watch.ts').then((m) => !gone && (stop = m.watchChanges()), () => undefined);
    return () => ((gone = true), stop?.());
  });

  /* THE PAGE ASKED BEFORE THE APP ARRIVED (`app.html`) IS FOR THE ADDRESS THE TAB OPENED ON, so a move inside the app lets
     it go unread (RF6, `page-live.ts` `earlyPage`), written here rather than imported so the frame loads no page reader. */
  beforeNavigate(() => {
    (globalThis as { __bdPage?: unknown }).__bdPage = undefined;
  });

  afterNavigate((nav) => {
    if (nav.type === 'enter' || nav.to === null || nav.from === null) return;
    const to = placeKey(nav.to.url);
    const moved = nav.from.url.pathname !== nav.to.url.pathname;
    if (nav.type === 'popstate') {
      const y = scrolls.get(to) ?? 0;
      const link = leftBy.get(to);
      const move = moves;
      void waitFor(() => {
        const el = scroller();
        return moves !== move || (el !== null && el.dataset.screen !== undefined && el.scrollHeight - el.clientHeight >= y);
      }, 1500).then(() => {
        const el = scroller();
        if (!el || moves !== move) return;
        el.scrollTop = y;
        /* A SCREEN THAT DRAWS AGAIN WHEN ITS FRESH ANSWER LANDS (Needs you's queue) is short for a frame and drops the
           place to the top (VERIFY H4). So for 1.5s a drop below `y` is put back, until the reader scrolls themselves. */
        let own = false;
        const mine = (): void => void (own = true);
        const hands = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
        for (const h of hands) addEventListener(h, mine, { capture: true, passive: true, once: true });
        void waitFor(() => {
          const now = scroller();
          /* AND NEVER OVER THE NEXT SCREEN: two Backs in a row put the second screen at the first one's place. */
          if (own || now === null || moves !== move) return true;
          if (now.scrollTop < y - 1 && now.scrollHeight - now.clientHeight >= y) now.scrollTop = y;
          return false;
        }, 1500).then(() => {
          for (const h of hands) removeEventListener(h, mine, { capture: true });
        });
        /* THE LINK THAT LEFT, by where it went, if it is on screen. */
        const back = link ? [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => placeKey(new URL(a.href)) === link) : undefined;
        const r = back?.getBoundingClientRect();
        if (back && r && r.bottom > 0 && r.top < innerHeight) back.focus({ preventScroll: true });
      });
      return;
    }
    if (!moved || nav.to.url.hash || fromPalette) return;
    /* A SCREEN THAT DRAWS ITS HEAD AGAIN WHEN ITS FRESH ANSWER LANDS takes the focused `h1` away with the old one, so for
       a moment after the move a focus dropped on the body goes back to the `h1` there now. Never once the reader has
       pressed or typed anything, and never off something they moved to.

       AFTER THE CROSS-FADE, NOT DURING IT: focus given inside a running view transition did not hold, so a press on a
       list item left focus on the body with motion on (VERIFY H3). The 1.5s is counted from when the fade ends.

       EVERY PAGE NAME TAKES IT, not only `PageHead`'s: an `h1` with no `tabindex` (a project's hero) is made focusable
       by script here, with no ring for a pointer (the rule at the foot of this file). */
    let touched = false;
    const touch = (): void => void (touched = true);
    addEventListener('pointerdown', touch, { capture: true, once: true });
    addEventListener('keydown', touch, { capture: true, once: true });
    const fade = crossing;
    void (fade ? fade.finished.catch(() => undefined) : Promise.resolve())
      .then(() =>
        waitFor(() => {
          if (touched) return true;
          const h1 = scroller()?.querySelector<HTMLElement>('h1');
          const now = document.activeElement;
          if (h1 && (now === null || now === document.body)) {
            if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
            /* QUIET UNLESS THE LAST THING WAS A KEY (`quiet-focus.ts`): script focus with no press before it counts as
               `:focus-visible`, so a cold open drew a ring round the name. */
            quietFocus(h1);
          }
          return false;
        }, 1500),
      )
      .then(() => {
        removeEventListener('pointerdown', touch, { capture: true });
        removeEventListener('keydown', touch, { capture: true });
      });
  });

  /**
   * A NEW SCREEN CROSS-FADES IN, AND ONLY THE WORK MOVES (the shell holds still, what fills it recomposes).
   *
   * Where the browser has the View Transitions API, a navigation to another screen is wrapped in one: the browser
   * takes a picture of the work as it was, Kit draws the new screen, the screen is given a moment to draw
   * (`DRAWN_WITHIN_MS`), and the old picture leaves over `--d-exit` before the new one rises in, the two together
   * lasting `--d-page` (`app.css`). The tab bar and the toasts are named and held still. `#main` is
   * named `page` for as long as that takes and the root is told not to animate (`app.css`), so the rail, the strip and
   * a docked panel do not take part. A browser without it gets the cut it always had, with `arrive`'s settle.
   *
   * THE NAME IS WORN ONLY WHILE A TRANSITION RUNS (`data-moving` on the root). A named element is a stacking context
   * and a backdrop root, and worn all the time that would put the docked panel inside the work's stacking order and cut
   * its glass off from the ground. The newest transition takes the name off, so one that is skipped for a second
   * navigation does not take it from the one that replaced it.
   *
   * ONLY WHEN THE SCREEN CHANGES. `{#key}` redraws the work on a new path and nothing else, and a filter written to
   * the query is the same screen answering, which a fade would make look like a page load.
   *
   * NOTHING IS LEFT TO REJECT. A navigation that fails, or a transition the browser skips (a hidden tab, a second
   * navigation before the first one drew), ends the transition and says nothing on the console.
   */
  let crossing: ViewTransition | null = null;
  /* HOW LONG THE FADE WAITS FOR THE NEW SCREEN TO SAY IT HAS DRAWN. The browser draws nothing while it waits, so the wait is
     a freeze (fluid F1): a screen this tab has seen draws within a frame or two, and one that must read first never does. */
  const DRAWN_WITHIN_MS = 50;
  onNavigate((nav) => {
    if (typeof document.startViewTransition !== 'function') return;
    /* Asked for less motion: the page just changes, no fade stands in for it. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    /* A PLACE, NOT A PATH (skills pass, 2 Nov): Work (`/?work`) and the phone's Menu (`/?menu`) are places of their own
       at Today's path, and they cut while every other place cross-faded. `placeOf` tells them apart; any other query is
       the same screen answering a filter, and stays still. */
    if (nav.from === null || nav.to === null) return;
    if (placeOf(here(nav.from.url.pathname), nav.from.url.searchParams) === placeOf(here(nav.to.url.pathname), nav.to.url.searchParams)) return;
    const root = document.documentElement;
    return new Promise<void>((done) => {
      root.dataset.moving = '';
      const moving = document.startViewTransition(async () => {
        done();
        await nav.complete.catch(() => undefined);
        /* THE NEW PICTURE IS THE REAL PAGE when it is quick to draw: the screen is given `DRAWN_WITHIN_MS` to say so
           (`data-screen`), so the fade does not end on a half-built page it had in hand (motion F6). */
        await waitFor(() => scroller()?.dataset.screen !== undefined, DRAWN_WITHIN_MS);
        /* A ROW OF TABS PRESSED TO GET HERE IS ONE PICTURE ON BOTH SIDES (`pressTab` below), found on the new screen by
           its name, so it holds still while the work under it changes. */
        const was = tabsHeld;
        const label = was?.getAttribute('aria-label');
        if (was && label) {
          const find = (): HTMLElement | undefined => [...(scroller()?.querySelectorAll<HTMLElement>('[data-tabs]') ?? [])].find((r) => r.getAttribute('aria-label') === label);
          /* A ROW THE NEXT SCREEN DRAWS A BEAT AFTER ITS FIRST FRAME (Money's book row waits on the page's declaration) is
             waited for a moment: the old picture already shows the press answered, so the wait is not a silence. */
          await waitFor(() => find() !== undefined, TAB_ROW_WITHIN_MS);
          const now = find();
          if (now && now !== was) now.style.viewTransitionName = TAB_ROW;
        }
      });
      crossing = moving;
      moving.ready.catch(() => undefined);
      void moving.finished
        .catch(() => undefined)
        .then(() => {
          for (const r of document.querySelectorAll<HTMLElement>('[data-tabs]')) if (r.style.viewTransitionName === TAB_ROW) r.style.viewTransitionName = '';
          tabsHeld = null;
          if (crossing !== moving) return;
          crossing = null;
          delete root.dataset.moving;
        });
    });
  });

  /**
   * A TAB THAT GOES TO ANOTHER ADDRESS ANSWERS ITS PRESS AT ONCE (skills pass follow-up, 2 Nov).
   *
   * Money's book tabs, a section's page tabs, the Keychain's views, the automations hub, Usage's months: each tab is a
   * link (`data-tabs` on the row, which `Segmented` gives every `nav` track), and the next page has to read before it
   * draws. Until it did, nothing moved: the press showed nothing for about 240ms, and inside a view transition the
   * browser holds the old picture, so the tab could not even be drawn chosen. Now, on the press itself:
   *
   *   - the pressed tab takes the chosen mark (`data-on` where the row uses it, `aria-current`), so the thumb slides to
   *     it on its own steps and the old picture the browser keeps already shows it;
   *   - what the row stands over goes quiet (`data-waiting`: 0.6 after `--d-exit`, so a page that draws at once never
   *     dims) and the work says it is busy (`aria-busy`), until the next screen is drawn;
   *   - the row is named for the move (`TAB_ROW`), and the same row on the next screen too, so it holds still while the
   *     work under it cross-fades rather than fading out and back in.
   *
   * A NAVIGATION THAT FAILS OR IS TURNED ELSEWHERE PUTS IT ALL BACK. A press with a modifier, a link that opens
   * elsewhere, or the tab already chosen is left alone.
   */
  const TAB_ROW = 'tab-row';
  /** How long the fade waits for the pressed row to be drawn on the next screen. */
  const TAB_ROW_WITHIN_MS = 120;
  let tabsHeld: HTMLElement | null = null;
  let tabPress: { href: string; undo: () => void; settle: () => void } | null = null;

  function pressTab(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || (link.target !== '' && link.target !== '_self') || link.hasAttribute('download')) return;
    const main = scroller();
    const row = link.closest<HTMLElement>('[data-tabs]');
    if (!main || !row || !main.contains(row) || link.getAttribute('aria-current') === 'page') return;
    const to = new URL(link.href);
    if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
    tabPress?.undo();

    const tabs = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const marks = tabs.map((a) => [a, a.getAttribute('data-on'), a.getAttribute('aria-current')] as const);
    const onMark = marks.some(([, on]) => on !== null);
    for (const [a] of marks) {
      a.removeAttribute('data-on');
      a.removeAttribute('aria-current');
    }
    if (onMark) link.setAttribute('data-on', '');
    link.setAttribute('aria-current', 'page');

    /* WHAT THE ROW STANDS OVER, step by step up to the work: every sibling of the row and of each box holding it. */
    const quiet: Element[] = [];
    for (let at: Element | null = row; at && at !== main; at = at.parentElement)
      for (const sib of at.parentElement?.children ?? []) if (sib !== at && !sib.contains(row)) quiet.push(sib);
    for (const q of quiet) q.setAttribute('data-waiting', '');
    main.setAttribute('aria-busy', 'true');
    if (typeof document.startViewTransition === 'function') {
      row.style.viewTransitionName = TAB_ROW;
      tabsHeld = row;
    }

    const settle = (): void => {
      for (const q of quiet) q.removeAttribute('data-waiting');
      main.removeAttribute('aria-busy');
      if (tabPress?.settle === settle) tabPress = null;
    };
    const undo = (): void => {
      settle();
      for (const [a, on, current] of marks) {
        if (on === null) a.removeAttribute('data-on');
        else a.setAttribute('data-on', on);
        if (current === null) a.removeAttribute('aria-current');
        else a.setAttribute('aria-current', current);
      }
      if (tabsHeld === row && !document.documentElement.hasAttribute('data-moving')) {
        row.style.viewTransitionName = '';
        tabsHeld = null;
      }
    };
    tabPress = { href: to.href, undo, settle };
  }

  $effect(() => {
    /* CAPTURED, so the tab is marked before Kit's own click handler starts the move. */
    addEventListener('click', pressTab, { capture: true });
    return () => removeEventListener('click', pressTab, { capture: true });
  });

  beforeNavigate((nav) => {
    const press = tabPress;
    if (!press) return;
    if (nav.to?.url.href !== press.href) return void press.undo();
    void nav.complete.then(press.settle, press.undo);
  });

  /**
   * THE WORK SLIDES WITH THE RAIL (a fluid shell).
   *
   * The rail card takes its new width in one frame and its glass is scaled from the old width to the new one
   * (`Sidebar.svelte`), so without this the work jumped 156 pixels sideways at the start of a movement the rail then
   * made smoothly. This is the same movement told from the other side, FLIP: the rail's column is watched, and when it
   * changes width the work is played from where its edge was to where it is on `translate`, over `--rail-d` on
   * `--rail-ease`, which are the rail's own timing, so the two edges travel together. Nothing is laid out again while it
   * moves. WATCHED RATHER THAN TOLD, so the chord, a Settings change and anything else that moves the rail all slide
   * the same way; the observer answers after layout and before paint, so the jump is never drawn.
   *
   * NOT WHEN THE WINDOW CHANGED, which moves the rail for a reason of its own (crossing to the phone's tab bar), and not
   * for somebody who asked for less motion: the work is simply where it is, with no fade standing in for the move.
   *
   * NOR WHILE SOMETHING IS PLACED ON THE WINDOW from inside the work (a docked panel, the bar of picked items): a
   * `translate` on `#main` makes it the box a fixed descendant is placed against, which would carry the panel along
   * with the work and put it in the work's column. Then the work takes its place in one frame. Asked of the few things
   * that can be so placed, never of every node in the work.
   */
  let sliding: Animation | null = null;

  /** What inside the work can be placed on the window: an open non-modal dialog, or what says it is (`data-fixed`). */
  const PINNED = 'dialog[open]:not(:modal), [data-fixed]';

  function holdsFixed(el: HTMLElement): boolean {
    /* Drawn, and not merely declared: a closed panel is `position: fixed` and `display: none`, and has no box. */
    for (const n of el.querySelectorAll(PINNED)) if (getComputedStyle(n).position === 'fixed' && n.getClientRects().length > 0) return true;
    return false;
  }

  /** A duration token in milliseconds, whichever unit it is written in (`240ms`, `0.24s`), as `Sidebar.svelte` reads it. */
  function ms(raw: string, fallback: number): number {
    const said = raw.trim();
    const n = Number.parseFloat(said);
    if (!Number.isFinite(n)) return fallback;
    return said.endsWith('ms') ? n : said.endsWith('s') ? n * 1000 : n;
  }

  /** How far the work is drawn from where it stands now, mid-slide, on the inline axis. */
  function offset(el: HTMLElement): number {
    const n = Number.parseFloat(getComputedStyle(el).translate);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Plays the work from `dx` pixels off where it stands, back to it. A slide still running ends first, and the new one
   * starts from where the old one had the work drawn, so a second press mid-flight turns round rather than jumping.
   */
  function slide(el: HTMLElement, dx: number) {
    const from = dx + (sliding ? offset(el) : 0);
    sliding?.cancel();
    sliding = null;
    if (Math.abs(from) < 1 || matchMedia('(prefers-reduced-motion: reduce)').matches || holdsFixed(el)) return;
    const style = getComputedStyle(el);
    try {
      sliding = el.animate(
        { translate: [`${from}px 0`, '0 0'] },
        { duration: ms(style.getPropertyValue('--rail-d'), 240), easing: style.getPropertyValue('--rail-ease').trim() || 'ease-out' },
      );
      const done = sliding;
      void done.finished.then(
        () => {
          if (sliding === done) sliding = null;
        },
        () => undefined,
      );
    } catch {
      /* A timing the browser cannot read is the old jump, and nothing worse. */
    }
  }


  const go = new GoPrefix();

  /* THE HAIRLINE READS THE POLL NOW, AND IT WAS ONCE A CONSTANT. `const live = 'open'` stood here with a comment
     saying there was no write and no poll yet, so the `polling` and `offline` rules below could never match.
     `follow` starts one poll of `/api/version` per tab (`lib/data/live.ts`),
     on a record that answered only. NOT OVER A REFUSAL, though its shell says `live`: `version` is `READ+`, so on the
     signed-out sign-in screen every tick was a 401 and the hairline went to `offline`. A refused shell polls
     nothing. `page.url` and not `location`, so a move from one
     record to another follows the address being opened. */
  $effect(() => follow(data.live === true ? (data.refused ? null : apiBase(page.url)) : null));

  /* A SCREEN'S FIRST READ IS ASKED WHILE ITS LINK IS HOVERED, FOCUSED OR TOUCHED (`preload.ts`), on a live record
     whose access has not ended, and loaded once the first screen has rested, so the entry carries none of it. */
  const readsAhead = $derived(data.live === true && !data.refused && live.ended === null);
  $effect(() => {
    if (!readsAhead) return;
    let stop: (() => void) | null = null;
    let gone = false;
    later(() => void import('$lib/data/preload.ts').then((m) => {
      if (!gone) stop = m.watch(document);
    }));
    return () => {
      gone = true;
      stop?.();
    };
  });

  /**
   * THE DOOR SAID THIS PERSON'S ACCESS ENDED: the poll heard it (`live.ended`) or `boot` was refused
   * `at: 'access'`, and the window is the ended screen in the door's own sentence. `undefined` for everybody else.
   */
  const endedSaid = $derived(live.ended !== null ? live.ended.said : data.refused?.at === 'access' ? data.refused.fix : undefined);

  /* OFFLINE, THE SHELL ASKS AGAIN when the browser says it is back and every twenty seconds, since a boot nobody
     reached is never kept: the load that answers draws the record's own shell, and its screens read again. */
  $effect(() => {
    if (data.offline !== true) return;
    const again = () => void invalidate('braindog:boot');
    addEventListener('online', again);
    const timer = setInterval(again, 20_000);
    return () => {
      removeEventListener('online', again);
      clearInterval(timer);
    };
  });

  /* THE QUIET MARK (`screen.svelte.ts`): `data-quiet` on the document while no call is out and none is promised. It is a
     second answer beside `data-screen`, for what looks at a page at rest; nothing in the app waits on it. */
  $effect(() => onCallsOut(callsOut));
  $effect(() => {
    document.documentElement.toggleAttribute('data-quiet', quiet());
  });

  /* THE FIRST SCREEN SETTLED IS THE FIRST SCREEN DRAWN (`first-drawn.ts`), for a screen that says so no sooner itself. */
  $effect(() => {
    if (settled() !== undefined) untrack(drewFirst);
  });

  /* A SHELL DRAWN FROM THE LAST COPY IS REPLACED ONCE `boot` ANSWERS, and from here, after the first navigation has drawn:
     the load that drew it asked `boot` and must not invalidate before that navigation lands (`+layout.ts`).

     NOR OVER A MOVE IN FLIGHT: an `invalidate` takes the place of a navigation under way (Kit's `_invalidate`), so a tap on a
     place made while `boot` was out went nowhere (fluid F6). That move's own load reads the live `boot`, kept by now. */
  const replaceNow = (heard: boolean, stale: boolean | undefined, moving: boolean): boolean => heard && stale === true && !moving;
  let bootHeard = $state(false);
  $effect(() => {
    if (data.stale !== true) return;
    const base = untrack(() => apiBase(page.url));
    let gone = false;
    void import('$lib/record/boot-live.ts')
      .then((m) => m.readBoot(base))
      .then(() => {
        if (!gone) bootHeard = true;
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      bootHeard = false;
    };
  });
  $effect(() => {
    if (replaceNow(bootHeard, data.stale, navigating.to !== null)) void invalidate('braindog:boot');
  });

  /* THE LOCAL COPY IS CLAIMED BY THE READER A LIVE BOOT NAMES, never by a drawn copy: another person, record or scope
     wipes it before it is drawn from again (`lib/data/local.ts`). */
  $effect(() => {
    if (data.live !== true || data.refused || data.stale) return;
    const base = apiBase(page.url);
    const me = data.me;
    /* THE LOCAL COPY'S READER AND ITS PREDICATES ARRIVE AFTER THE SHELL: nothing on the first paint is drawn from here. */
    untrack(() => {
      void import('$lib/data/local-tab.ts').then((m) => m.claimLocal(base, me));
      /* AND THE ACCESS EPOCH IT BOOTED WITH, which the version poll compares: a move boots the tab again (§2.8). */
      followGrant(me.grant?.epoch ?? null, () => invalidate('braindog:boot'));
      /* AND THE READS KEPT BY THE VERSION ARE THIS READER'S ALONE: anybody else, or a new grant, keeps none of them. */
      readingAs(me, seeingAs()?.id ?? null);
    });
  });

  /**
   * WHO IS WORKING AND WHAT WAITS, READ AGAIN WITH `boot` WHENEVER THE POLL HEARS THE RECORD MOVE, so a run that
   * starts or stops and a question answered elsewhere show up without a reload. One request, the shell's own, in place
   * of the page the rail asked the record to draw on every screen and every version; the answer is kept for the tab, so
   * the next screen's shell is the record as it is now.
   *
   * NOT THROUGH `read()`, WHICH IS A SCREEN'S. `read` brackets every call in the screen's readiness count. Keyed on the
   * record's address rather than on `page.url`, so moving between screens asks nothing; a refusal keeps what was heard.
   * The version the shell was read at is not asked again.
   */
  const pollAt = $derived(!bare && data.live === true && !data.refused ? apiBase(page.url) : null);
  let heardAt: { base: string | null; version: unknown } = { base: null, version: undefined };
  $effect(() => {
    const base = pollAt;
    const version = live.version;
    const first = heardAt.base !== base;
    heardAt = { base, version };
    if (base === null || first) return;
    let gone = false;
    /* THE TICKET BEFORE THE READ, so an answer written while it is out stays taken off the count (`waits.svelte.ts`). */
    const asked = waitsTicket();
    void import('$lib/record/boot-live.ts')
      .then(async (m) => {
        const got = await m.rereadBoot(base);
        if (!gone && got.from === 'live') {
          heardWaits({ waits: m.waitsOf(got.boot), working: m.workingOf(got.boot) }, asked);
          if (toldReadable(got.boot.registers, got.boot.me?.levels as Readonly<Record<string, string>> | undefined)) toldBack(base);
          hear([
            ...(got.boot.waiting ?? []).map(questionAlert),
            /* ONLY RECENT HANDOFFS: the feed holds old ones, and the first poll would otherwise ring for all of them. */
            ...(got.boot.whatsNew?.events ?? []).filter((e) => Date.now() - Date.parse(e.ts) < 120_000).flatMap((e) => handoffAlert(e) ?? []),
          ]);
        }
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  });

  /**
   * THE RECORDS THIS PERSON CAN REACH, read after the shell has drawn: the root load asks and does not wait, so
   * the switcher starts with the record in the address and fills in once the account answers. A load after that carries
   * the list itself.
   */
  let reachable = $state.raw<{ records: Shell['me']['records']; refused: string | undefined } | null>(null);
  $effect(() => {
    void data;
    reachable = null;
    let gone = false;
    void import('$lib/record/boot-live.ts').then((m) =>
      m.recordsAsked()?.then((listed) => {
        if (gone) return;
        if (!listed.ok) reachable = { records: data.me.records, refused: listed.refusal.fix };
        else if (listed.value.length > 0) reachable = { records: listed.value, refused: undefined };
      }),
    );
    return () => {
      gone = true;
    };
  });
  const records = $derived(reachable?.records ?? data.me.records);
  const recordsRefused = $derived(reachable ? reachable.refused : data.recordsRefused);
  /* WHAT "BRAINDOG ▾" AND THE FACE READ, on the desk's bar and in the phone's head (`shell/frame.svelte.ts`). */
  $effect.pre(() => {
    frame.record = data.index.name;
    frame.records = records;
    frame.refused = recordsRefused;
    frame.person = personName;
    frame.actor = data.me.person;
    frame.open = (r) => void openOther(r);
    frame.news = data.whatsNew ?? [];
    frame.asks = open;
    frame.upTo = data.upTo ?? null;
    frame.crumbed = shape === 'bar';
  });

  /** Where `g` then a letter lands. `g 1`–`g 9` address the nth item of YOUR nav, in YOUR order. */
  /* EVERY PLACE IN THE RAIL HAS A LETTER NOW, read from the rail by `lib/a11y/goto.ts`: the seven of the old
     table first and unmoved, `g s` among them, then a letter of each place's own name. It was a table of seven here, so
     Money, Work or a page somebody put in the rail had none. Loaded when `g` arms or `?` asks for the sheet, never in
     the entry; the sheet is drawn again (`sheetSays`) once its `g` row says this rail's letters. */
  let lead: typeof import('$lib/a11y/goto.ts') | undefined;
  let sheetSays = $state(0);
  const leadIn = () => import('$lib/a11y/goto.ts').then((m) => (lead = m));
  const railRows = () => [...rail.places, ...rail.rest].map((i) => ({ href: i.href, name: i.label }));

  /* A RIGHT-CLICK, A HELD THUMB OR `⇧F10` ON AN ITEM WITH A "…" OPENS THAT MENU (`context-menu.ts`), once for every screen. */
  $effect(() => watchMenus());

  /** When a key was last typed in a field, in event time: read before any screen's own handler can move the focus. */
  let typedAt = Number.NEGATIVE_INFINITY;
  function ontyped(e: KeyboardEvent) {
    if (!e.metaKey && !e.ctrlKey && inField(e.target)) typedAt = e.timeStamp;
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    /* Esc PUTS THE SIDEBAR'S DRAWER AWAY, the one layer here that is not a `<dialog>`. */
    if (e.key === 'Escape' && sideOver) {
      sideOver = false;
      return;
    }

    // `covered()` drops every UNMODIFIED key, which is what the line below says and not what this
    // comment used to claim: a modified chord still runs under an open layer, and Esc is the
    // `<dialog>`’s own. The depth is a counter rather than a boolean so two overlays closing in
    // the wrong order do not unlock early.
    if (overlays.depth > 0 && !mod) return;

    // Never while typing. One test, in the registry, and no screen implements its own.
    if (typing() && !mod) return;

    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }

    /* `⌘J` OPENS STRAIGHT INTO ASK, where the conversation with Slash was left; with the palette open it moves there. */
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      openAsk();
      return;
    }

    /* `⌘Z` — the newest undo the toast stack is still offering, and past the stack the newest change this tab wrote. The
       toast stack is no longer the whole undo history: `lib/data/undo.ts` holds the last sixty batches this tab wrote, and
       `undo-replay.ts` takes back the newest of them when no toast offers one (02 §8 makes the unit a `batch`). */
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (!toasts.undoLast())
        void import('$lib/data/undo-replay.ts').then(async (m) => {
          if (!(await m.undoNewest())) toasts.push(copy.nothingToUndo);
        });
      return;
    }
    if (typing()) return;
    /* NOR WHILE THE HANDS ARE STILL TYPING (`typed.ts`): a key begun in a field, one mid-composition, or one pressed just
       after a key typed in a box that went away under it, as the palette's does on its way to a question. Its `?` opened
       the keys sheet over the question it had just opened. */
    if (notTheShells(e, typedAt)) return;

    /* AND THE SWITCH. Every chord above this line still works with character keys off; nothing below
       it does, which is the whole of what `Character keys: Off` promises. */
    if (silenced(e)) return;

    if (go.armed) {
      /* A CHORD IS NOT THE SECOND HALF OF A SEQUENCE. `g` armed, then `Ctrl+H`, navigated Home —
         `Mod+H` is on `NEVER_BIND`'s list precisely because the browser owns it, and the arm read
         the key without asking whether a modifier was held. Any chord disarms and is left alone. */
      if (e.metaKey || e.ctrlKey || e.altKey) {
        go.disarm();
        return;
      }
      const key = e.key;
      const digit = Number(key);
      go.disarm();
      /* Taken at once, as the table's letters were, so a screen's own `d` stands down (`defaultPrevented`); a key
         pressed before the file has landed is taken too, and goes where it leads when it does. */
      const target = digit >= 1 && digit <= 9 ? numbered[digit - 1]?.href : lead?.hrefOf(railRows(), key);
      if (target || !lead) e.preventDefault();
      if (target) goto(at(target));
      else if (!lead)
        void leadIn().then((m) => {
          const href = m.hrefOf(railRows(), key);
          if (href) goto(at(href));
        });
      return;
    }

    if (e.key === 'g') {
      go.arm();
      void leadIn();
      return;
    }
    /* `[` HIDES OR SHOWS THE SIDEBAR, a character key, so `Character keys: Off` silences it too. */
    if (e.key === '[' && !mod && !e.altKey && !narrow) {
      e.preventDefault();
      void toggleSide();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      openPalette();
      return;
    }
    // `?` is help. It is never "ask the assistant".
    if (e.key === '?') {
      e.preventDefault();
      void leadIn()
        .then((m) => (m.sayGoto(railRows()), sheetSays++))
        .finally(() => (keymapOpen = true));
    }
  }

  /* WORK IS READ AHEAD OF THE PRESS (`lib/work/warm.ts`): a pointer resting on a link to it for 60 ms, a finger down on
     one, or the keyboard reaching one. Only on a live record the poll has heard, and loaded on the first, so the shell
     carries none of it. */
  let ahead: ReturnType<typeof setTimeout> | undefined;
  function readAhead(e: Event, wait: number): void {
    clearTimeout(ahead);
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== page.url.origin || data.live !== true || data.refused || live.version === null) return;
    if (placeOf('/', new URLSearchParams(link.search)) !== WORK) return;
    ahead = setTimeout(() => void import('$lib/work/warm.ts').then((m) => m.warmWork(apiBase(), live.version)), wait);
  }
</script>

<!-- THE SHELL'S BANNERS, as one snippet the page's head can draw on a phone (`frame.banners`, collab pass 2). -->
{#snippet shellBanners()}
  <!-- SEEING AS SOMEBODY (§3.3): the banner is its own chunk, since only an owner or an Admin trying it loads it. -->
  {#if seeingAs() !== null}
    {#await import('$lib/sharing/SeeAsBanner.svelte') then { default: SeeAsBanner }}<SeeAsBanner />{/await}
  {/if}
  <LapseBanner shell={data} />
  <!-- WHAT WAS SHARED WITH A GUEST, ONCE A SHARE (§3.4). Its own chunk: only somebody a share let in loads it. -->
  {#if data.me.grant !== undefined && !data.me.owner}
    {#await import('$lib/sharing/Welcome.svelte') then { default: Welcome }}<Welcome shell={data} />{/await}
  {:else if !data.me.owner && data.me.lists === null && data.me.level !== 'owner' && page.route.id === '/'}
    <!-- AND WHAT A ROLE LETS A NEW COLLEAGUE DO, once a role on this device (collab pass, 2 Nov). Its own chunk too. -->
    {#await import('$lib/sharing/RoleWelcome.svelte') then { default: RoleWelcome }}<RoleWelcome shell={data} />{/await}
  {/if}
{/snippet}

<svelte:window {onkeydown} onkeydowncapture={ontyped} />
<svelte:document onpointerover={(e) => readAhead(e, 60)} ontouchstart={(e) => readAhead(e, 0)} onfocusin={(e) => readAhead(e, 0)} />

<a class="skip" href="#main">Skip to content</a>

<!-- The record's own state, two pixels, drawn only when it has something to say: nothing while the poll answers,
     solid warn when a poll has failed, and never from `navigator.onLine`, which reports online on a LAN with no
     internet. It must not cry wolf: a line that appears and withdraws on every open is a line nobody believes the day
     it is true (19 §6).

     ONE DEPARTURE FROM `50 §2.4`, AND IT IS DELIBERATE. The spec names the state `polling` whenever the fallback runs,
     and `polling` is drawn dashed in `--warn`. With the poll as the only transport that would put a warning on every
     screen at all times, which is an alarm for the state in which nothing is wrong. So a poll that answers is `open`,
     a poll that fails is `offline`, and `polling` is never set: it is kept for a socket's fallback once there is a
     socket to fall back from. -->
<div class="live" data-state={live.state} aria-hidden="true"></div>

{#if endedSaid !== undefined}
  <!-- THEIR ACCESS ENDED: the whole window says so in the door's sentence, and nothing of the record
       is drawn under it. Its own chunk, since nobody else ever loads it. -->
  <main id="main" class="bare" data-screen={settled()}>
    {#await import('$lib/sharing/AccessEnded.svelte') then { default: AccessEnded }}<AccessEnded said={endedSaid} />{/await}
  </main>
{:else if bare}
  <!-- ITS OWN SCROLL CONTAINER, because `html, body` are `overflow: hidden` — the shell's `.body`
       panel is the one thing that scrolls, and a bare surface has no panel. So a page taller than
       the window simply had two thirds of itself below a fold that could not be crossed: `/s/<token>`
       is 2,628px of projected page in a 993px window, and the only part anybody could read was the
       first third. That is the artefact somebody hands an accountant. -->
  <main id="main" class="bare" data-screen={settled()}>{@render children()}</main>
{:else}
  <div class="shell" data-shape={shape} data-side={sideOn ? '' : railOn ? 'rail' : undefined} style:--side-col={sideOn ? `${sideWidth}px` : railOn ? `${RAIL_W}px` : undefined}>
      {#if sideOn || railOn}
        <!-- THE SIDEBAR, THE WINDOW'S FULL HEIGHT: the full column from 1,280, else its rail; its width held while its
             chunk arrives. -->
        <div class="side-slot">
          {#if SideBar}
            <SideBar
              base={apiBase(page.url)}
              lists={data.lists}
              {model}
              lit={sideLit}
              working={workingOn}
              version={live.version}
              mode={sideOn ? 'full' : 'rail'}
              shown={sideOn}
              pen={sidePen}
              placed={listsPlaced}
              width={sideWidth}
              onwidth={(n, done) => {
                sideWidth = n;
                if (done) keepSide();
              }}
              ontoggle={() => void toggleSide()}
            />
          {/if}
        </div>
      {/if}
      <div class="bar-slot">
        {#if shape === 'bar'}
          <TopBar {crumb} onfind={openPalette} />
        {:else}
          <!--
            THE MENU SHAPE IS ONE BUTTON AND NOTHING ELSE, which is the whole of what it promises:
            the smallest chrome there is, for somebody who lives in the palette. It opens the sidebar
            over the page from the left, the one place that holds what the record owns.
          -->
          <button type="button" class="menu-open tap" aria-expanded={sideOver} onclick={() => void toggleSide()}>
            <Icon name="more" size="m" /><span>{copy.more}</span>
          </button>
        {/if}
      </div>
      {#if overOn}
        <!-- UNDER 1,280, OR ON THE MENU SHAPE, THE FULL SIDEBAR SLIDES IN FROM THE LEFT over its rail and the page; a press
             beside it, Esc or a move closes it. -->
        <button type="button" class="side-scrim" aria-label={copy.close} tabindex="-1" onclick={() => (sideOver = false)}></button>
        <div class="side-over" style:--side-col={`${sideWidth}px`}>
          {#if SideBar}
            <SideBar
              base={apiBase(page.url)}
              lists={data.lists}
              {model}
              lit={sideLit}
              working={workingOn}
              version={live.version}
              shown={true}
              pen={sidePen}
              placed={listsPlaced}
              width={sideWidth}
              ontoggle={() => (sideOver = false)}
            />
          {/if}
        </div>
      {/if}

    <!--
      `{#key}`, SO ARRIVING SOMEWHERE IS AN EVENT AND NOT A REPAINT.

      Every navigation in this product was a hard cut: the old screen was replaced by the new one
      between two frames, with nothing at all to say a thing had happened. On a laptop that reads
      as fast. On a phone, where the tap that caused it gave no feedback either, it reads as the
      product having ignored you and then something changing on its own.

      Four pixels and 240ms, which is `--d-panel`, already in the token file for exactly this kind
      of distance. `backwards` so the first frame is the start of the animation rather than the
      end of it, which is the difference between a screen sliding in and a screen flickering.

      IT SURVIVES BEING TURNED OFF. `a11y.css` collapses every animation to 1ms under
      `prefers-reduced-motion`, and that is the right outcome here: the movement says nothing the
      screen does not already say, so a reader who does not want it loses nothing at all. Anything
      that carried meaning by moving would have to say it another way as well.
    -->
    {#key page.url.pathname}
    <!-- NOTHING THAT WRITES IS PRESSED WHILE THE SCREEN IS A SAVED COPY (`held.svelte.ts`): the quiet mark is up, a screen
         draws what it kept and asks again, or the shell is the last copy. Links still go. -->
    <main id="main" class="body" data-screen={settled()} {@attach holdIn(() => presses.held || data.stale === true)}>
      <!-- THE QUIET MARK, over the work while something drawn from the local copy is asked again (`CopyMark.svelte`). -->
      {#if CopyMark}<CopyMark />{/if}
      <Pull />
      {#if data.offline}
        <!-- OFFLINE, CALMLY, as one line over what the local copy drew: what it shows, and that nothing saves until back. -->
        <p class="offline-line" role="status">{offlineWords.lastSaw} {offlineWords.cannotSave}</p>
      {/if}
      <!-- THE BANNERS, here on a desk and under the page's own bar on a phone (`frame.banners`, collab pass 2). -->
      {#if !(narrow && frame.heads > 0)}{@render shellBanners()}{/if}
      {#if phoneMenu}
        <!-- ON A PHONE THE MENU TAB IS THE SIDEBAR AS A PAGE: every place, the projects, every list and Settings. -->
        {#if SideBar}<SideBar mode="phone" base={apiBase(page.url)} lists={data.lists} {model} lit={sideLit} working={workingOn} version={live.version} pen={sidePen} placed={listsPlaced} />{/if}
      {:else}
        {@render children()}
      {/if}
    </main>
    {/key}
  </div>

  <div class="tab-slot">
    <TabBar tabs={phoneTabs} menu={MENU} live={workingNow().length > 0} nowhere={stray} />
  </div>

  <!-- THE PHONE'S OWN WAYS (`lib/phone/Phone.svelte`): the status bar's colour, the iPhone's launch pictures, back from the
       left edge in the Home Screen app, and the two asks. Its own chunk, a moment after the shell has drawn. -->
  {#if phoneWays}
    {#await import('$lib/phone/Phone.svelte') then { default: Phone }}<Phone waiting={open} path={page.url.pathname} host={data.host} />{/await}
  {/if}

  <!--
    THE SEARCH BUTTON OF A DESKTOP WITH NO RAIL, and nowhere else.

    The rail carries search as a row at its foot, and below 900px it is the 44px button in each
    screen's head bar. The top bar and the menu shapes have neither, so from 900px up they keep this
    one: a magnifier in a quiet raised circle at the bottom corner, which opens the palette, the one
    surface that reaches anything in the record. Below 900px the rule under it hides it, because the
    tab bar is the navigation there whatever the shape says.
  -->
  {#if shape === 'menu'}
    <button type="button" class="launcher tap" onclick={openPalette} aria-label={copy.paletteLabel}>
      <Icon name="search" size="l" />
    </button>
  {/if}

  {#if Palette}<Palette bind:open={palette.open} nav={data.nav} places={goPlaces} />{/if}
{/if}

<!--
  AND THE FAVICON, WHICH IS WHAT A TAB SHOWS WHEN IT IS NOT THE ACTIVE ONE.

  `app.html` names `mark.svg` and cannot know which deployment this build is: it is static HTML, and
  the environment is a `define`. `packages/theme` has generated `mark-alpha.svg` in the alpha accent
  since the accent was measured, and the only thing that referenced it was its own filename.

  `named` folds to `false` in the shipped build, so this element is not in the production bundle at
  all — production keeps `app.html`'s icon and gains nothing. In alpha this link comes later in the
  head than `app.html`'s, which is the one that wins.
-->
<svelte:head>
  {#if named}
    <link rel="icon" href="{assets}/mark-alpha.svg" type="image/svg+xml" />
  {/if}
</svelte:head>

<Sheet bind:open={keymapOpen} title={copy.keymap} subtitle={copy.keymapHint}>
  {#if Keymap}{#key sheetSays}<Keymap />{/key}{/if}
</Sheet>

<!-- One stack, one live region, on every surface including the two that carry no shell: an action
     taken from a shared page still has to be able to report itself. ITS START IS CLEAR OF THE SIDEBAR OR ITS RAIL
     (AM19), whose width it is handed here, since the stack stands outside the shell. -->
<div class="toasts-at" style:--toast-side={bare || endedSaid !== undefined ? undefined : sideOn ? `${sideWidth}px` : railOn ? `${RAIL_W}px` : undefined}><Toasts /></div>

<!-- "CONFIRM IT'S YOU", ASKED IN PLACE (`lib/reauth`): a call refused for a stale sign-in is proved again here and sent
     once more, on every surface the frame draws, the bare ones included. -->
<StepUp />

<!-- Debounced elsewhere; a live region that announces on every keystroke is unusable (13 §7). -->
<div class="sr-only" role="status" aria-live="polite"></div>

<style>
  /* 127x41 ON EVERY ROUTE, and it is the first target a keyboard user reaches. It sat four pixels
     under `13 §7`'s floor for the life of the build, on the control whose entire audience is people
     who cannot use a pointer — and the layout gate could not see it, because the scan was scoped to
     `#main` and the shell is not in it. */
  .skip {
    position: fixed;
    display: inline-flex;
    align-items: center;
    /* `--tap`, NOT `--ctl-h`. `--ctl-h` is 44 on a coarse pointer and 36 on a fine one, and this
       control's entire audience is somebody using a keyboard on a laptop — a FINE pointer. It
       measured 41 there after being "fixed", which is the number the fix was written against, for
       the reader it was written for. The layout gate runs the target rule only below 640px, so it
       could not see the half that mattered. */
    min-block-size: var(--tap);
    /* AND THE FIRST CONTROL ON THE PAGE WAS UNDER THE NOTCH TOO. `max()` of the two horizontal
       insets rather than one per side, because `env()` has no logical spelling: a `padding-inline`
       that maps `left` to the start puts the notch padding on the wrong side under `dir="rtl"`. */
    inset-block-start: calc(env(safe-area-inset-top) + var(--sp-2));
    inset-inline-start: calc(max(env(safe-area-inset-left), env(safe-area-inset-right)) + var(--sp-2));
    z-index: var(--z-hint);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-xs);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* NOT DRAWN WHILE THE CONNECTION IS WELL; the two rules after this one draw it when it is not. */
  .live {
    display: none;
    position: fixed;
    /* UNDER THE NOTCH, AND THEREFORE NEVER SEEN. `app.html` sets `viewport-fit=cover`, so a 2px
       hairline at y=0 is fifty-seven pixels above the first pixel of an iPhone 14 anybody can look
       at. `env()` is 0 everywhere else, so this costs nothing on a laptop. */
    inset-block-start: env(safe-area-inset-top);
    inset-inline: 0;
    z-index: var(--z-hint);
    block-size: 2px;
  }

  .live[data-state='polling'] {
    display: block;
    background: repeating-linear-gradient(90deg, var(--warn-fill) 0 8px, var(--rule) 8px 16px);
  }

  /* WARN, NOT DANGER: a dropped connection is a condition to wait out, not a loss. Solid where
     polling is dashed, so the two states differ by shape as well as by colour. */
  .live[data-state='offline'] {
    display: block;
    background: var(--warn-fill);
  }

  /* A SURFACE WITH NO SHELL SCROLLS ITSELF. Same architecture as `.body` below — one container, one
     scrollbar — and `100dvh` rather than `100%` because a phone's address bar is part of the window
     and a page that ends under it ends where nobody can reach. */
  .bare {
    block-size: 100dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /**
   * ONE BOARD, AND ON IT THE RAIL AND THE WORK.
   *
   * The page IS the board (painted on `body` in the skin's `base.css`). The rail is the board's left column, flat and
   * the board's own colour, and the work sits straight on the board, the skin's fluid `--gutter` from the rail and from
   * the window. `.body` is the ONE scroll container, so the rail never moves and the window shows exactly one
   * scrollbar.
   *
   * ONE COLUMN THAT SIZES TO THE RAIL, AT BOTH OF THE RAIL'S WIDTHS. `auto` measures whatever the rail says it is, so
   * the narrow width is the rail's own declaration and this grid never has to know which state it is in.
   *
   * AND FROM 1,280 UP, A THIRD COLUMN FOR THE DOCKED PANEL, further down. Nothing is in it until a panel opens.
   */
  .shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    block-size: 100dvh;
    overflow: hidden;
  }

  /* THE OTHER TWO SHAPES ARE ONE COLUMN WITH A STRIP ON TOP, and the strip is `auto` for the same
     reason the rail's column is: its height is its own declaration, and this grid never has to know
     which of the two is in it. */
  .shell[data-shape='bar'],
  .shell[data-shape='menu'] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* The menu's strip sits on the ground, lined up with the work under it. */
  .bar-slot {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--inset) var(--inset) 0;
  }

  /* THE TOP BAR RUNS ACROSS THE WORK'S COLUMN ONLY, from the sidebar's edge, on the nav's surface with one hairline
     under it, on the line of the hairline under the sidebar's head: the two are one surface, in light and in dark. The
     Mac app's title bar is paid here, once: the work under the bar pays none. */
  .shell[data-shape='bar'] .bar-slot {
    position: relative;
    z-index: var(--z-palette);
    grid-column: 1 / -1;
    grid-row: 1;
    padding: var(--shell-inset, 0px) 0 0;
    background: var(--nav);
    border-block-end: 1px solid var(--rule);
  }

  .shell[data-shape='bar'] .body {
    --shell-inset: 0px;
  }

  /* THE SIDEBAR'S COLUMN, THE WINDOW'S FULL HEIGHT: its width the device's (`--side-col`), or the rail's 56. The bar and
     the work take the column after it, so the bar's start follows the sidebar's edge wherever it is dragged. Below
     900px there is no bar and no sidebar, and the rule further down gives the work the one column. */
  @media (width >= 900px) {
    .shell[data-shape='bar'] {
      grid-template-columns: var(--side-col, 0px) minmax(0, 1fr);
    }

    .shell[data-shape='bar'] .bar-slot {
      grid-column: 2 / -1;
    }

    .shell[data-shape='bar'] .body {
      grid-column: 2;
      grid-row: 2;
    }
  }

  .side-slot {
    position: relative;
    z-index: var(--z-palette);
    grid-column: 1;
    grid-row: 1 / -1;
    display: flex;
    min-block-size: 0;
    overflow: hidden;
    background: var(--nav);
  }

  /* A DOCKED PANEL STANDS UNDER THE BAR, not under its edge. On a phone it is the bottom sheet (`Panel.svelte`,
     `PHONE`), which hangs from the screen's foot and is left alone. */
  @media (width >= 900px) {
    .shell[data-shape='bar'] :global(dialog.dock) {
      inset-block: calc(56px + var(--shell-inset, 0px) + var(--inset)) var(--inset);
      block-size: auto;
    }
  }

  /* One control, at the start of the strip, at the size every other target in the shell is. */
  .menu-open {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: var(--sp-3) var(--sp-4);
    background: none;
    border: 0;
    /* A rectangle, as every button is. */
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  /* THE SURFACE ON A PSEUDO-ELEMENT: an opaque tile with one hairline, no glass, and a step of ink
     under a pointer. */
  .menu-open::before,
  .launcher::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    transition: background var(--d-state) var(--ease-out);
  }

  /* ONLY UNDER A POINTER THAT HOVERS (skills pass follow-up, 2 Nov): on a phone a tap left the fill latched on the menu
     button until the next tap elsewhere. */
  @media (hover: hover) and (pointer: fine) {
    .menu-open:hover::before,
    .launcher:hover::before {
      background: color-mix(in srgb, var(--ink) 5%, var(--tile));
    }
  }

  /**
   * MOVEMENT ONLY, AND IT USED TO FADE.
   *
   * `from { opacity: 0 }` with `backwards` holds the screen at zero until the animation gets its
   * first frame, and on a cold load that is not 0ms. Measured: `/r/obligations` fills `#main`
   * 1,952ms after DOMContentLoaded on a cold cache, because that is what parsing and hydrating
   * this app costs, and the fade does not begin until the work is done. So the arrival cue turned
   * a screen that painted progressively into a screen that was blank for two seconds and then
   * appeared. An animation that hides a slow page is worse than the hard cut it replaced.
   *
   * A held `translateY(4px)` is invisible for those two seconds and then reads as an arrival for
   * the 240ms it is meant to. The cue is the movement, which is also the half `a11y.css` is right
   * to delete: under `prefers-reduced-motion` there is simply no cue, and there is nothing here a
   * reader needs that the screen does not already say.
   */
  @keyframes arrive {
    from {
      transform: translateY(4px);
    }
  }

  /**
   * THE WORK, ON THE GROUND. No fill, no hairline, no radius: the tiles in it are the only raised things.
   *
   * THE GUTTER IS THE SKIN'S, AND IT IS FLUID (`--gutter` in `tokens.css`): 16 on a phone, about 22 at 900, 36 at
   * 1,512 and 40 from 1,667 up. Screens pad their content by it, so the work fills the window edge to edge at every
   * width with the same air either side, and grows with the window instead of stepping. It was a fixed 20 from the
   * rail and 28 from the window, set here over the skin's, which made a 1,728 laptop's page the same tight frame as a
   * 1,280 one's.
   *
   * NAMED `page` WHILE ONE SCREEN CROSS-FADES TO THE NEXT (`onNavigate` above, `app.css`): the work is the one part of
   * the window that takes part in it, and only for as long as it does.
   */
  :global(html[data-moving]) .body {
    view-transition-name: page;
  }

  /* A page's name given focus by script after a move shows no ring to a pointer (`afterNavigate` above). */
  :global(main h1[tabindex='-1']:focus:not(:focus-visible)) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  /* NOR ON A COLD OPEN, which the browser counts as `:focus-visible` (`quiet-focus.ts`). */
  :global(main h1[data-quiet]:focus) {
    /* focus-ok: marked only while the reader's last act was not a key; Tab takes the mark off and the ring shows. */
    outline: none;
  }

  /* The offline line: the page's gutter, muted words, the measure of a sentence. */
  .offline-line {
    margin: 0;
    padding: var(--sp-3) var(--gutter) 0;
    color: var(--ink-3);
  }

  /* ONE MOTION PER CHANGE (motion F6): where a page change is a view transition the transition is the arrival, and the
     work's own settle would be a second one inside it. */
  @supports not (view-transition-name: none) {
    .body {
      animation: arrive var(--d-page) var(--ease-out) backwards;
    }
  }

  .body {
    min-inline-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* A PHONE ON ITS SIDE HAS ITS NOTCH AT ONE END: the work steps in by the notch's inset there, and by nothing in
     portrait, where both insets are 0. The tab bar pays its own. */
  @media (width < 900px) {
    .body {
      padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
    }
  }

  /* THE ROOM THE SEARCH BUTTON IN THE BOTTOM CORNER NEEDS, and only on the shape that draws it: a floating button over
     the last row of a list hides exactly the thing a long list is scrolled to the bottom to see. Every other shape
     ends where the page's own foot does (48px under its last tile), not 68px further down (Today polish, 21 Oct). */
  @media (width >= 900px) {
    .shell[data-shape='menu'] .body {
      padding-block-end: calc(var(--tap) + var(--sp-5));
    }
  }

  /* Below 900px the rail becomes a tab bar; above it, the tab bar does not exist. */
  .tab-slot {
    display: none;
  }

  /* A TILE WITH A MAGNIFIER, floating over the page in the corner, 44 across. */
  .launcher {
    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--inset) * 2);
    inset-inline-end: calc(var(--inset) * 2);
    z-index: var(--z-hint);
    isolation: isolate;
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    cursor: pointer;
  }

  @media (width < 900px) {
    /* `19 §3`'S SECOND CONDITION, AND IT IS ONE RULE. Below 900px the tab bar is the navigation
       whatever the shape says, so the strip goes and the grid is one column with one row again —
       without the second half of that, `main` would sit in an `auto` row inside a `100dvh` box with
       `overflow: hidden` and every screen would end where the window does. */
    .bar-slot,
    .side-slot {
      display: none;
    }

    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .shell[data-shape='bar'],
    .shell[data-shape='menu'] {
      grid-template-rows: minmax(0, 1fr);
    }

    .body {
      /* THE LAST ROW ENDS 16px ABOVE THE TAB BAR (design 6.6). `--tabbar` is the bar and the home
         indicator under it, summed once in `tokens.css`; the bar sits on the window's bottom edge. */
      padding-block-end: calc(var(--tabbar) + var(--sp-4));
    }

    .tab-slot {
      display: block;
    }

    /* The tab bar is the navigation below 900px whatever the shape, and each screen's head bar
       carries search, so the corner button goes with the strip it stood in for. */
    .launcher {
      display: none;
    }
  }

  /**
   * THE DOCKED PANEL'S OWN COLUMN, FROM 1,280 UP (a docked right panel; `DOCKS` in `panel.ts`).
   *
   * `Panel.svelte` is a fixed card at the window's end edge, and it writes `--dock-w` on the root while it is open
   * docked: its width and the inset either side, `0px` otherwise. `--dock-col` is the same width for this column, so
   * opening a task or a question narrows the work beside it rather than drawing over it, and the work's scrollbar, a
   * sticky head and anything full width all stop where the panel starts, which page padding could not do.
   *
   * THE ROOM OPENS WITH THE SLIDE. Given when the slide was over, the whole list jumped 360px in one frame
   * after the panel landed (fluid F13, CLS 0.11), so `--dock-col` now opens over the panel's step on its curve and the
   * work narrows as the panel's edge comes. Closing, the column goes at once and the panel slides out over the work as
   * it widens.
   *
   * THE WORK THEN PADS NOTHING EXTRA. A screen that draws a panel pads its end by `max(var(--gutter), var(--dock-w))`,
   * which was how it kept clear before the panel had a column; inside `#main` that is `0px` here, so the space is given
   * up once and not twice. The root keeps the real width, for the toasts that centre beside it.
   *
   * BELOW 1,280 THE PANEL IS A SHEET over the screen (`panel.ts`), a drawer at the end edge from 900 and a bottom
   * sheet on a phone. A window that narrow has no width to give a column.
   *
   * ON THE OTHER TWO SHAPES the strip sits over the work's column only, so both are placed by hand: left to the grid,
   * the work would take the second column of the strip's row.
   */
  @media (width >= 1280px) {
    .shell {
      grid-template-columns: auto minmax(0, 1fr) var(--dock-col, 0px);
    }

    .shell[data-shape='menu'] {
      grid-template-columns: minmax(0, 1fr) var(--dock-col, 0px);
    }

    .shell[data-shape='menu'] .bar-slot {
      grid-area: 1 / 1;
    }

    .shell[data-shape='menu'] .body {
      grid-area: 2 / 1;
    }

    /* THE SIDEBAR, THE WORK UNDER THE BAR, and the docked panel's column at the end, the bar over both. */
    .shell[data-shape='bar'] {
      grid-template-columns: var(--side-col, 0px) minmax(0, 1fr) var(--dock-col, 0px);
    }

    .body {
      --dock-w: 0px;
    }
  }

  /* THE SIDEBAR'S DRAWER, under 1,280 and on the menu shape: the full sidebar slides in from the left over its rail and
     the page, the window's full height, and a quiet scrim over the rest takes the press that closes it. AT THE BAR'S
     LEVEL AND AFTER IT IN THE PAGE, so both are drawn over the bar, the rail and the work's sticky head. */
  .side-scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-palette);
    padding: 0;
    border: 0;
    background: color-mix(in srgb, var(--ink) 16%, transparent);
    animation: side-fade var(--d-panel) var(--ease-out);
  }

  .side-over {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: var(--z-palette);
    display: flex;
    inline-size: min(var(--side-col, 248px), calc(100vw - 2 * var(--tap)));
    background: var(--nav);
    animation: side-in var(--d-panel) var(--ease-out);
  }

  :global([dir='rtl']) .side-over {
    animation-name: side-in-rtl;
  }

  @keyframes side-in {
    from {
      translate: -100% 0;
    }
  }

  @keyframes side-in-rtl {
    from {
      translate: 100% 0;
    }
  }

  @keyframes side-fade {
    from {
      opacity: 0;
    }
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A PRESS HELD WHILE THE SAVED COPY IS DRAWN (`held.svelte.ts`): the same box, quiet, and nothing presses it. Quiet
     only once it has been held a moment, so a page this tab kept, whose answer lands at once, does not flicker; and
     back at once when the answer lands, since the transition is only the held state's. */
  :global(#main[data-held] [data-held-press]) {
    cursor: default;
    opacity: 0.6;
    transition: opacity 0s 0.3s;
  }

  /* THE TOASTS' HOLDER DRAWS NOTHING: it only hands the stack where the sidebar ends. */
  .toasts-at {
    display: contents;
  }
</style>
