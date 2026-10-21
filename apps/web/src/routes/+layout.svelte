<!--
  The shell: a skip link, the rail or the tab bar, the phone's More sheet, the palette, the toast
  stack, and one polite live region.

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
  head bar (`PageHead.svelte`) and the first row of the More sheet; the disc sat over the header of
  every screen, under the 44px floor, and twice on `/search`.
-->
<script lang="ts">
  import { BASE, apiBase, at, here } from '$lib/at.ts';
  import { appPath, applyInset, macNotifications, notify, onShell, setBadge, windowFocused } from '$lib/shell.ts';
  import { handoffAlert, instructionAlert, questionAlert, ring, type Alert } from '$lib/shell/alerts.ts';
  /* Title-bar room for the Mac app: sets --shell-inset once, 0 in a browser. */
  applyInset();
  /* The shared skin first: `tokens.css` opens with the `@layer` statement, so the layer ORDER — and
     with it the rule that no installed theme can reach the a11y layer — is established before any
     other stylesheet is parsed. */
  import '@braindog/skin/tokens.css';
  /* AND THE PALETTE THIS BUILD IS FOR, which `tokens.css` used to `@import` on everybody's behalf.
     `BRAINDOG_ENV` aliases this specifier, so an alpha build resolves it to `alpha.css` and ships
     one palette rather than two — 28 §4. */
  import '@braindog/skin/house.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';

  import '../app.css';
  import '@braindog/skin/blocks.css';
  import '$lib/ui/rows.css';
  import '$lib/ui/controls.css';

  import * as pref from '$lib/pref.ts';
  import { copy } from '$lib/copy/frame.ts';
  import { leaving, settled } from '$lib/ui/screen.svelte.ts';
  import { GoPrefix, overlays, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { watchKeyboard } from '$lib/a11y/keyboard.ts';
  import TopBar from '$lib/ui/TopBar.svelte';
  import { assets } from '$app/paths';

  import { named } from '$lib/env.ts';
  import TabBar from '$lib/shell/TabBar.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { follow, live } from '$lib/data/live.svelte.ts';
  import { timingOpened } from '$lib/data/timing.ts';
  /* THE PALETTE AND THE `?` SHEET'S BODY ARRIVE AFTER THE SHELL. Both are closed on every first
     paint, and the palette carries its commands, its search and Slash's drawing, so importing them
     here put all of that in front of the first screen and in the entry's preload list. They are
     asked for as the shell mounts: a `⌘K` pressed before the palette lands sets `palette.open`,
     and the palette opens on that when it does. */
  /* Named as types, which the compiler erases: the layout still reaches both, as `dead-copy` reads it. */
  import type PaletteView from '$lib/palette/Palette.svelte';
  import type KeymapView from '$lib/ui/Keymap.svelte';
  import type SidebarView from '$lib/ui/Sidebar.svelte';
  import type CopyMarkView from '$lib/ui/CopyMark.svelte';
  import { palette } from '$lib/palette/open.svelte.ts';
  import { moreSheet } from '$lib/shell/more.svelte.ts';
  import { levelWord, openRecord } from '$lib/record/switcher.ts';
  import { WORK, arrange, flatNav, isHere, orderLists, placeOf, tabsOf } from '$lib/nav.ts';
  import { agentsHref, railOf } from '$lib/nav/rail.ts';
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
  import Count from '$lib/ui/Count.svelte';
  import Icon, { type IconName } from '$lib/ui/Icon.svelte';
  import LapseBanner from '$lib/ui/LapseBanner.svelte';
  import Pull from '$lib/ui/Pull.svelte';
  import { untrack } from 'svelte';
  import { afterNavigate, beforeNavigate, goto, invalidate, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  /* The Mac app's Go menu and braindog://goto: only an address under /app moves the window (`appPath`). */
  $effect(() => onShell('goto', (to) => {
    const path = appPath(to);
    if (path !== null) void goto(path);
  }));

  let { data, children } = $props();

  /* Held in state and drawn through `{#if}`, not `{#await}`: an await block is a runtime of its own,
     and it landed in the entry chunk the lazy import was there to shrink. */
  let Palette = $state<typeof PaletteView | null>(null);
  let Keymap = $state<typeof KeymapView | null>(null);
  /* AND THE COPY'S HAIRLINE: invisible until a screen drawn from the local copy holds it, so it can land after the shell. */
  let CopyMark = $state<typeof CopyMarkView | null>(null);
  $effect(() => {
    void import('$lib/palette/Palette.svelte').then((m) => (Palette = m.default));
    void import('$lib/ui/Keymap.svelte').then((m) => (Keymap = m.default));
    void import('$lib/ui/CopyMark.svelte').then((m) => (CopyMark = m.default));
  });

  /* THE SIDE RAIL, AND ONLY FOR SOMEBODY WHO CHOSE IT. The top bar is the shell again (his call 1, 20 October) and the
     rail is one choice away in Settings, so its script and its styles would ride in the entry every visit loads, for
     the few who pick it, and the entry has a budget (`tools/gates/budgets.json`). Asked for once the shape says `rail`.

     AND THE SCREEN IS NOT SETTLED UNTIL IT IS THERE. `data-screen` is what a gate waits for before it reads the window,
     and a screen that computes its content at once settles on its first frame, before the rail's chunk can land: the
     `prefs` gate's shape probe counts `nav.rail` at that moment. So the claim waits for the rail, as it would for a
     call the screen made. */
  let Sidebar = $state<typeof SidebarView | null>(null);
  $effect(() => {
    if (shape === 'rail' && Sidebar === null) void import('$lib/ui/Sidebar.svelte').then((m) => (Sidebar = m.default));
  });

  /* These surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6),
     and `/signin` because a rail listing somebody else's registers behind a sign-in form is the
     screen claiming you are already in. `/connect`, an app's consent screen, comes before any work
     in a record as sign-in does, and without the rail it fits a phone with Allow in thumb reach. AND EVERY SCREEN UNDER
     `/signin/`: the desktop app's return drew inside the shell, the top bar's counts over a "Signing in" (first F12). */
  const bare = $derived.by(() => {
    /* Read inside the record: the address is `/app/acme/start` and the rule is about `/start`. */
    const at = here(page.url.pathname);
    return at === '/start' || at === '/signin' || at.startsWith('/signin/') || at === '/signup' || at === '/invite' || at === '/connect' || at === '/s' || at.startsWith('/s/');
  });

  /* THE SHELL'S, AND A PAGE'S. It was local, so a page could not open the palette — which is why
     `/[id]`'s `Search` button navigated Home instead of searching. */
  let keymapOpen = $state(false);
  let moreOpen = $state(false);
  /* THE FACE ON A PHONE'S SCREEN ASKS FOR THE SHEET (`shell/more.svelte.ts`): it is opened here and the ask put back. */
  $effect(() => {
    if (!moreSheet.asked) return;
    moreSheet.asked = false;
    moreOpen = true;
  });

  /**
   * THE MORE SHEET IS THE PHONE'S RAIL: search at its head, the record and
   * its switcher, the rail's groups with the rail's glyphs and counts, the current page marked, then
   * the places the rail keeps at its foot (`PLACES`). It was a bare list of words with no glyphs, no
   * current place, no switcher and no search.
   *
   * THE SWITCHER IS A DISCLOSURE, NOT A MENU. A menu is an overlay, and one opened inside a sheet is
   * an overlay on an overlay under a thumb; the other records open in place under the record's own
   * row instead.
   */
  let switching = $state(false);

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

  /**
   * SIGN OUT IN THE FRAME (LCH-A04): one press in the account menu, the session ends, and the sign-in screen is loaded in
   * full (`signOutAndLeave`), so nothing this tab read under the session is drawn again. `lib/auth.ts` is imported on
   * the press and not before, which keeps it out of the entry chunk every screen waits for. A press that did not end the
   * session, or a chunk that would not load, leaves the page where it is and says so.
   */
  let signingOut = $state(false);
  async function signOutHere() {
    if (signingOut) return;
    signingOut = true;
    const out = await import('$lib/auth.ts').then((m) => m.signOutAndLeave(`${BASE}/signin`)).catch(() => null);
    if (out?.ok) return;
    signingOut = false;
    toasts.push(copy.signOutFailed, { intent: 'warn' });
  }

  /* COMPARED INSIDE THE RECORD, as the rail compares: the address with the base and the slug taken off. */
  const under = (href: string) => {
    const where = here(page.url.pathname);
    return where === href || where.startsWith(`${href}/`);
  };

  /** The same order the rail draws, one nav and not two shapes. */
  /* A SAVED VIEW DRAWN UNDER ITS LIST is not drawn again under Views. The palette still reads every page in `data.nav`. */
  /* AND A TABBED SECTION'S PAGE PAST THE RAIL'S BUDGET IS THE STRIP'S, NOT THE RAIL'S (`cut`). */
  /* UNDER THE NAMES THIS PERSON GAVE THEIR PAGES (`nav.labels`), in the rail, the top bar and the More sheet alike. */
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
  /* A NEW QUESTION OR HANDOFF RINGS ONCE (`alerts.ts` dedups by id and seeds on the first hearing), never while this
     window is in front, and only with the Settings switch on. A click goes to the item through the shell's `goto`. */
  let rung: Set<string> | null = null;
  const hear = (items: Alert[]): void => {
    rung = ring(rung, items, { on: macNotifications, focused: windowFocused, send: notify });
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
  /* THE SPINE'S RULE FOR INBOX (`spine.ts`): it is a row under More once anything has arrived. A shell no record answered
     has no `counts`, and is read from the two numbers it does carry. */
  const spine = $derived(spineOf(data.counts ? { ...data.counts, decide: open, inbox } : { decide: open, inbox }));
  /* THE TOOLS UNDER MORE, IN THE ORDER A PHONE READS THEM, with the rail's glyphs and the rail's words (`Sidebar.svelte`).
     Slash's page is Suggestions there, and Inbox joins once anything has arrived (`spineOf`). USAGE IS HERE: its
     word is written out rather than read from `record/actions.ts`, which would carry the usage reader into the entry
     chunk for one word. Settings goes to `/settings`, the index of areas below 900px. */
  const USAGE = 'Usage';
  /* SETTINGS IS NOT A TOOL: it stands at the sheet's foot with Sign out. */
  const tools = $derived([
    ...(spine.includes('inbox') && !navPrefs.isHidden('/inbox') ? ([['/inbox', said('inbox'), 'inbox']] as const) : []),
    ['/automations', copy.automations, 'refresh'],
    ['/jobs', copy.jobs, 'play'],
    ['/packs', copy.packs, 'packs'],
    ['/vault', copy.vault, 'vault'],
    ['/usage', USAGE, 'observe'],
  ] as const);

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
  /* A PAGE HIDDEN FROM THE RAIL IS HIDDEN FROM THE TOP BAR AND THE MORE SHEET TOO: one nav, not two. */
  const grouped = $derived(arrange(railNav.filter((e) => !navPrefs.hidden.includes(e.href)), navPrefs.order));
  const hiddenCount = $derived(railNav.filter((e) => navPrefs.hidden.includes(e.href)).length);
  /* THE PHONE'S LISTS IN THE RAIL'S ORDER, from the same preference (`orderLists`). */
  const moreLists = $derived(orderLists(data.index.registers, navPrefs.order));

  /**
   * THE FLAT LIST, ONE RULE FOR THE RAIL, THE TOP BAR, THE TAB BAR AND THE SHEET (`flatNav` in `lib/nav.ts`): Today, the
   * sections a day runs through, Activity, Decide while something waits, seven at most, and everything else under More.
   */
  /* AND WORK OPENS THE WORK SCREEN ON A RECORD WHOSE TASKS LIST HOLDS SOMETHING (`lib/work/Work.svelte`). A list with
     nothing in it is a part the record does not use yet, so it is not drawn (DIRECTION §35): Work with no tasks drew a
     row of zeros and empty bands. `index.registers` carries each list's count, which `data.lists` does not; the first
     task brings Work back, and until then the palette and Today's capture line both add one. */
  const holdsTasks = $derived(data.index.registers.some((r) => r.id === TASKS && r.count > 0));
  const flat = $derived(
    flatNav(grouped, open, { today: copy.today, activity: copy.audit, decide: said('decide') }, { work: holdsTasks ? WORK : null }),
  );
  /**
   * THE RAIL'S SECTIONS (DIRECTION §39, `railOf`): the seven places, each section's own things under its name, and the
   * rest under More. One reading for the rail, the tab bar and the More sheet, so a place is in the same spot on each.
   */
  const rail = $derived(railOf(flat, said('decide')));
  const tabs = $derived(tabsOf(rail.places, 5, navPrefs.tabs));
  /* THE TOP BAR'S FIVE: the same places in the same order, without the phone's own pick, which Settings names for the
     phone. Agents may sit past the rail's seven, so the places under More are read too. */
  const barPlaces = $derived(tabsOf([...rail.places, ...rail.more]));
  /* WHAT THE MORE SHEET HOLDS IS WHAT THE BAR ON SCREEN DOES NOT (frame F7): the tab bar's five below 900px, the top
     bar's five above it, nothing at all beside a rail, which draws every place itself. */
  let narrow = $state(false);
  $effect(() => {
    const mq = matchMedia('(width < 900px)');
    const set = (): void => void (narrow = mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  });
  const onBar = $derived(new Set((narrow ? tabs : navPrefs.shape === 'rail' ? [] : barPlaces).map((i) => i.key)));
  const moreBeyond = $derived(rail.places.filter((i) => !onBar.has(i.key)));
  const moreViews = $derived(rail.places.flatMap((i) => rail.views[i.key] ?? []));
  const moreOther = $derived(rail.more.filter((i) => !onBar.has(i.key)));
  /* WHERE THE PALETTE'S "GO TO" LEADS WITH NOTHING TYPED: the bar's five places, and Settings (2.A.15). */
  const goPlaces = $derived([...barPlaces, { key: 'settings', href: '/settings', label: copy.settings, icon: 'settings' }]);
  /* WHERE THE TOP BAR'S WORKING CHIP GOES: the Agents place, wherever the rail put it. */
  const agentsAt = $derived(agentsHref([...rail.places, ...rail.more]));

  /**
   * A PLACE THAT COMES INTO THE RAIL IS SAID ONCE (USE-B02): a place is drawn when it has something to show, so the day
   * the first account is typed Money appears, and one toast says "Money is in your rail now." No badge and no count.
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
  const arrivedIn = (was: { keys: ReadonlySet<string>; hidden: readonly string[] } | null, now: readonly { key: string; label: string; near: readonly string[] }[]): string[] =>
    now
      .filter((i) => was !== null && !['today', 'decide', 'activity'].includes(i.key) && !was.keys.has(i.key) && !i.near.some((h) => was.hidden.includes(h)))
      .map((i) => i.label);
  let drawn: { keys: ReadonlySet<string>; hidden: readonly string[] } | null = null;
  $effect(() => {
    if (bare || data.refused) return void (drawn = null);
    const now = [...rail.places, ...rail.more];
    const names = arrivedIn(drawn, now);
    drawn = { keys: new Set(now.map((i) => i.key)), hidden: [...navPrefs.hidden] };
    if (names.length > 0) toasts.push(copy.placeArrived(names));
  });
  /* THE PERSON READING, by the name the record told them, for the top bar's face. */
  const personName = $derived((data.me.person && Object.hasOwn(data.names, data.me.person) ? (data.names[data.me.person] ?? '') : '').trim());

  /* WHERE THE READER IS, for the sheet's rows: the Work screen is a place of its own, so Today is not marked on it too. */
  const place = $derived(placeOf(here(page.url.pathname), page.url.searchParams));

  /* `g 1`–`9` COUNT WHAT IS ON SCREEN: the places, in the order drawn, and the top bar's own rows on the top bar. */
  const numbered = $derived(navPrefs.shape === 'bar' ? barPlaces : rail.places);
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
   * AND THE SENTENCE IS BORROWED FROM THE SWATCH ROW, which is the one part of this that is not
   * finished. `copy.accentRefused` closes with "The other colours are unaffected", which is written
   * for somebody looking at a row of swatches and says nothing about the house colour being back or
   * where to choose another; a key of its own belongs in `copy.ts`. What it does carry is the colour
   * and the reason, which is the half a reader cannot get from anywhere else, so it is the right
   * thing to say until that key exists.
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
   * ASKED FOR AS THE SHELL MOUNTS, as the palette is, so it is never in the first screen's way; it reads the browser's
   * record from the start of the load, so a block before it arrived is still seen. The words are asked when the freeze
   * is said, because the screen it is about is the one on show when the page came back.
   */
  $effect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    void import('$lib/watchdog.ts').then((dog) => {
      if (gone) return;
      stop = dog.watchFreezes(window, () => ({ route: here(page.url.pathname), rendering: dog.drawingOf(document) }));
    });
    return () => {
      gone = true;
      stop?.();
    };
  });

  /**
   * THE RAIL AT ITS NARROW WIDTH, WHICH IS WHAT "COLLAPSED" MEANS TO EVERYBODY WHO SAYS IT.
   *
   * This was `railOff`, and `sidebar: false` took the entire rail out of the shell and left one
   * button in an empty gutter. Two things were wrong with that. It is not the state people ask for
   * — a collapsed sidebar is the one that keeps its glyphs — and it stranded anybody who pressed
   * the chord by accident, because the preference persists and the only ways back were a second
   * chord, the palette, or noticing a 40px gutter with one control in it.
   *
   * SO THE SAME PREFERENCE NARROWS THE RAIL INSTEAD. Every row survives, the spine survives, the
   * record switcher survives, and `Sidebar` gives the names back on hover and on focus. There is
   * nothing to strand somebody with, so there is nothing to rescue them from either, and the
   * restore button that used to live in the gutter is gone with the state that needed it.
   */
  let railIcons = $state(pref.read().sidebar === false);

  /**
   * WHICH SHAPE OF NAVIGATION THIS PERSON CHOSE, from `19 §3`'s three.
   *
   * The rail is the default and stays the default. A top bar is one strip that says how many pages
   * it has put behind More; the menu keeps nothing on screen and opens the whole sectioned list as
   * the sheet below. Both lean on that sheet rather than on a second nav of their own, because the
   * sheet is already every section, every list and the places the rail keeps at its foot, in the
   * reader's own order.
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

  /* CLEARED ON EVERY NAVIGATION, or `data-screen` is the PREVIOUS screen's answer for exactly as
     long as this one takes to arrive, which is the window every browser gate measures in.

     AND THE MORE SHEET CLOSES ON ONE, whichever of its rows started it: the sheet belongs to the
     shell, which outlives every screen, so a row that navigated left it open over the new screen
     unless each row closed it by hand. */
  beforeNavigate((nav) => {
    moves += 1;
    leaving();
    /* The dev timing hook measures the next screen from here (`timing.ts`); off, it does nothing. */
    timingOpened();
    moreOpen = false;
    switching = false;
    keepPlace(nav);
  });

  /**
   * BACK TAKES YOU BACK TO WHERE YOU WERE, AND A NEW PAGE STARTS AT ITS NAME (motion F4, F5.1).
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
            h1.focus({ preventScroll: true });
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
   * A NEW SCREEN CROSS-FADES IN, AND ONLY THE WORK MOVES (DIRECTION 38: the shell holds still, what fills it recomposes).
   *
   * Where the browser has the View Transitions API, a navigation to another screen is wrapped in one: the browser
   * takes a picture of the work as it was, Kit draws the new screen, the screen is given 250ms to draw, and the old
   * picture leaves over `--d-exit` as the new one rises in over `--d-page` (`app.css`). The tab bar and the toasts are
   * named and held still. `#main` is
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
  onNavigate((nav) => {
    if (typeof document.startViewTransition !== 'function') return;
    /* Asked for less motion: the page just changes, no fade stands in for it. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (nav.from === null || nav.to === null || nav.from.url.pathname === nav.to.url.pathname) return;
    const root = document.documentElement;
    return new Promise<void>((done) => {
      root.dataset.moving = '';
      const moving = document.startViewTransition(async () => {
        done();
        await nav.complete.catch(() => undefined);
        /* THE NEW PICTURE IS THE REAL PAGE: the screen is given up to 250ms to say it has drawn (`data-screen`), so the
           fade never ends on a half-built page (motion F6). */
        await waitFor(() => scroller()?.dataset.screen !== undefined, 250);
      });
      crossing = moving;
      moving.ready.catch(() => undefined);
      void moving.finished
        .catch(() => undefined)
        .then(() => {
          if (crossing !== moving) return;
          crossing = null;
          delete root.dataset.moving;
        });
    });
  });

  /**
   * THE WORK SLIDES WITH THE RAIL (DIRECTION 38's fluid shell).
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
  let railSlot = $state<HTMLElement>();

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

  $effect(() => {
    const slot = railSlot;
    if (!slot || typeof ResizeObserver !== 'function') return;
    let width = -1;
    let view = window.innerWidth;
    const seen = new ResizeObserver(() => {
      const now = slot.getBoundingClientRect().width;
      const was = width;
      const viewWas = view;
      width = now;
      view = window.innerWidth;
      /* The first answer is the rail as it was drawn; a rail that is not drawn (a phone) has no edge to slide. */
      if (was <= 0 || now <= 0 || view !== viewWas) return;
      const el = document.getElementById('main');
      if (!el) return;
      /* THE EDGE BESIDE THE RAIL, which is the right one under `dir="rtl"`: a wider rail moves it the other way. */
      slide(el, getComputedStyle(el).direction === 'rtl' ? now - was : was - now);
    });
    seen.observe(slot);
    return () => seen.disconnect();
  });

  /* One function, because the chord and the restore control are the same act and a second copy of
     two lines is a second place for the preference to be written differently. */
  function toggleRail() {
    /* A WIDTH IS NOT A THING A TOP BAR HAS. `⌘\` is the rail's own chord, and on the other two
       shapes it wrote a preference that nothing on screen could show, so the one feedback the chord
       gives was that nothing happened. It does nothing where there is no rail to narrow. */
    if (shape !== 'rail') return;
    railIcons = !railIcons;
    pref.write({ sidebar: !railIcons });
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

  /* A SCREEN'S FIRST READ IS ASKED WHILE ITS LINK IS HOVERED, FOCUSED OR TOUCHED (`preload.ts`), on a live record only,
     and loaded after the first paint, so the entry carries none of it. */
  const readsAhead = $derived(data.live === true && !data.refused);
  $effect(() => {
    if (!readsAhead) return;
    let stop: (() => void) | null = null;
    let gone = false;
    void import('$lib/data/preload.ts').then((m) => {
      if (!gone) stop = m.watch(document);
    });
    return () => {
      gone = true;
      stop?.();
    };
  });

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

  /* A SHELL DRAWN FROM THE LAST COPY IS REPLACED ONCE `boot` ANSWERS, and from here, after the first navigation has drawn:
     the load that drew it asked `boot` and must not invalidate before that navigation lands (`+layout.ts`). */
  $effect(() => {
    if (data.stale !== true) return;
    const base = untrack(() => apiBase(page.url));
    let gone = false;
    void import('$lib/record/boot-live.ts')
      .then((m) => m.readBoot(base))
      .then(() => {
        if (!gone) void invalidate('braindog:boot');
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  });

  /* THE LOCAL COPY IS CLAIMED BY THE READER A LIVE BOOT NAMES, never by a drawn copy: another person, record or scope
     wipes it before it is drawn from again (`lib/data/local.ts`). */
  $effect(() => {
    if (data.live !== true || data.refused || data.stale) return;
    const base = apiBase(page.url);
    const me = data.me;
    /* THE LOCAL COPY'S READER AND ITS PREDICATES ARRIVE AFTER THE SHELL: nothing on the first paint is drawn from here. */
    untrack(() => void import('$lib/data/local-tab.ts').then((m) => m.claimLocal(base, me)));
  });

  /**
   * WHO IS WORKING AND WHAT WAITS, READ AGAIN WITH `boot` WHENEVER THE POLL HEARS THE RECORD MOVE (EXP-D03), so a run that
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
   * THE RECORDS THIS PERSON CAN REACH, read after the shell has drawn (EXP-D03): the root load asks and does not wait, so
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

  /** Where `g` then a letter lands. `g 1`–`g 9` address the nth item of YOUR nav, in YOUR order. */
  /* EVERY PLACE IN THE RAIL HAS A LETTER NOW, read from the rail by `lib/a11y/goto.ts` (EXP-D09): the seven of the old
     table first and unmoved, `g s` among them, then a letter of each place's own name. It was a table of seven here, so
     Money, Work or a page somebody put in the rail had none. Loaded when `g` arms or `?` asks for the sheet, never in
     the entry; the sheet is drawn again (`sheetSays`) once its `g` row says this rail's letters. */
  let lead: typeof import('$lib/a11y/goto.ts') | undefined;
  let sheetSays = $state(0);
  const leadIn = () => import('$lib/a11y/goto.ts').then((m) => (lead = m));
  const railRows = () => [...rail.places, ...rail.more].map((i) => ({ href: i.href, name: i.label }));

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    // `covered()` drops every UNMODIFIED key, which is what the line below says and not what this
    // comment used to claim: a modified chord still runs under an open layer, and Esc is the
    // `<dialog>`’s own. The depth is a counter rather than a boolean so two overlays closing in
    // the wrong order do not unlock early.
    if (overlays.depth > 0 && !mod) return;

    // Never while typing. One test, in the registry, and no screen implements its own.
    if (typing() && !mod) return;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.open = true;
      return;
    }

    /* `⌘\` — the rail narrows to its glyphs and the work takes the width.
       IT USED TO FOLD TO NOTHING, on the argument that `19 §3` forbids an icon rail. That is not
       what §3 says. §3 argues that a nav which is a QUERY over `page` rows, variable in length and
       sectioned, cannot be the kind of thing a strip of UNLABELLED icons holds — and it is arguing
       about the DEFAULT. This is neither: it is a state a person chooses, it keeps the sections and
       the order, and every glyph says its name on hover and on focus. What §3 does rule out is what
       was built instead, a nav with nothing in it at all. */
    if (mod && e.key === '\\') {
      e.preventDefault();
      toggleRail();
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
    if (e.key === '/') {
      e.preventDefault();
      palette.open = true;
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
    if (placeOf('/', new URLSearchParams(link.search)) !== WORK || new URLSearchParams(link.search).has('classic')) return;
    ahead = setTimeout(() => void import('$lib/work/warm.ts').then((m) => m.warmWork(apiBase(), live.version)), wait);
  }
</script>

<svelte:window {onkeydown} />
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

{#if bare}
  <!-- ITS OWN SCROLL CONTAINER, because `html, body` are `overflow: hidden` — the shell's `.body`
       panel is the one thing that scrolls, and a bare surface has no panel. So a page taller than
       the window simply had two thirds of itself below a fold that could not be crossed: `/s/<token>`
       is 2,628px of projected page in a 993px window, and the only part anybody could read was the
       first third. That is the artefact somebody hands an accountant. -->
  <main id="main" class="bare" data-screen={settled()}>{@render children()}</main>
{:else}
  <div class="shell" data-rail={railIcons ? 'icons' : undefined} data-shape={shape}>
    {#if shape === 'rail'}
      <div class="rail-slot" bind:this={railSlot}>
        {#if Sidebar}
        <Sidebar
          icons={railIcons}
          ontoggle={toggleRail}
          places={rail.places}
          things={rail.things}
          more={rail.more}
          views={rail.views}
          hidden={hiddenCount}
          pen={data.pen}
          record={data.index.name}
          {records}
          refused={recordsRefused}
          registers={data.index.registers}
          {spine}
          {inbox}
          working={workingNow()}
        />
        {/if}
      </div>
    {:else}
      <div class="bar-slot">
        {#if shape === 'bar'}
          <TopBar
            entries={barPlaces}
            record={data.index.name || personName}
            person={personName}
            working={workingNow()}
            agents={agentsAt}
            onmore={() => (moreOpen = true)}
            onfind={() => (palette.open = true)}
          />
        {:else}
          <!--
            THE MENU SHAPE IS ONE BUTTON AND NOTHING ELSE, which is the whole of what it promises:
            the smallest chrome there is, for somebody who lives in the palette.

            IT IS NAMED FOR THE SHEET IT OPENS. The control said "Menu" and opened a sheet titled
            "More" in an early draft, which is two words for one place. `19 §9`'s rule is that the
            interface says the word a person would say, and there is only one word here to say.
          -->
          <button type="button" class="menu-open tap" onclick={() => (moreOpen = true)}>
            <Icon name="more" size="m" /><span>{copy.more}</span>
          </button>
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
    <main id="main" class="body" data-screen={shape === 'rail' && Sidebar === null ? undefined : settled()}>
      <!-- THE QUIET MARK, over the work while something drawn from the local copy is asked again (`CopyMark.svelte`). -->
      {#if CopyMark}<CopyMark />{/if}
      <Pull />
      {#if data.offline}
        <!-- OFFLINE, THE ERROR PAGE'S OWN WORDS, as one line over what the local copy drew. -->
        <p class="offline-line" role="status">{copy.errorPage.offline.title}. {copy.errorPage.offline.body}</p>
      {/if}
      <LapseBanner shell={data} />
      {@render children()}
    </main>
    {/key}
  </div>

  <div class="tab-slot">
    <TabBar {tabs} />
  </div>

  <!--
    THE SEARCH BUTTON OF A DESKTOP WITH NO RAIL, and nowhere else.

    The rail carries search as a row at its foot, and below 900px it is the 44px button in each
    screen's head bar. The top bar and the menu shapes have neither, so from 900px up they keep this
    one: a magnifier in a quiet raised circle at the bottom corner, which opens the palette, the one
    surface that reaches anything in the record. Below 900px the rule under it hides it, because the
    tab bar is the navigation there whatever the shape says.
  -->
  {#if shape === 'menu'}
    <button type="button" class="launcher tap" onclick={() => (palette.open = true)} aria-label={copy.paletteLabel}>
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

<!--
  MORE: WHAT THE BAR DOES NOT HOLD (frame F7, 2.A.24).

  It repeated the nav and the palette: a second "Ask or change anything" field, then the five places already in the bar,
  then words with no glyph. Now, under "BrainDog": the record and its switcher on one row; each project with its colour;
  "Your things", which is every place the bar or the tab bar leaves out, their views, the lists and the tools; and at the
  foot Settings and Sign out. No search: the bar and each screen's head carry it. Every row is 44 or more and wears a
  glyph (`doc` for a page with none of its own), and the row for the screen you are on is marked: `aria-current`, the
  selected fill and an ink glyph. A row closes the sheet by navigating (`beforeNavigate` above). From 900px it is 360
  wide at the window's end edge.

  THE LISTS COME WITH IT, because a page can be uninstalled with the pack that declared it and the lists underneath it
  still have to be reachable.
-->
<Sheet bind:open={moreOpen} title={copy.product}>
  <nav class="more-nav" aria-label={copy.more}>
    <!-- THE RECORD, AND UNDER IT THE OTHER RECORDS THIS PERSON CAN OPEN. The tile is ink with the
         ground's letter, as the rail's is; the brand red belongs to the mark. -->
    <div class="more-record">
      <button type="button" class="more-row more-who" aria-expanded={switching} onclick={() => (switching = !switching)}>
        <span class="more-tile" aria-hidden="true">{(data.index.name || copy.switchRecord).slice(0, 1)}</span>
        <span class="more-name">{data.index.name || copy.switchRecord}</span>
        <span class="more-fold" data-open={switching ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
      </button>
      {#if switching}
        <ul class="more-list more-records">
          {#each records as r}
            {@const word = levelWord(r)}
            {#if r.name !== data.index.name}
              <li>
                <button type="button" class="more-row" onclick={() => void openOther(r)}>
                  <span class="more-tile" aria-hidden="true">{r.name.slice(0, 1)}</span>
                  <span class="more-name">{r.name}</span>
                  {#if word !== null}<span class="more-tally">{word}</span>{/if}
                </button>
              </li>
            {/if}
          {/each}
          <!-- The host's own sentence when the records could not be listed, as the rail's switcher says it. -->
          {#if recordsRefused}<li class="more-note">{recordsRefused}</li>{/if}
          <li>
            <a class="more-row" href={at('/settings/signing-in')}><Icon name="settings" size="m" /><span class="more-name">{copy.recordSettings}</span></a>
          </li>
          <!-- NO "NEW RECORD" HERE: it opened this record's own `/start`, and it is drawn only once the host says
               the person may make a record, which `boot` does not carry yet. The rail's copy of it went the same way. -->
        </ul>
      {/if}
    </div>

    <!-- THE HOLDING PEN, IN THE RAIL'S WORDS (USE-B03): an update that adds a page lands hidden, and on a phone this is
         the one line that says so. Near the head, because it is news, and only when something waits. -->
    {#if penCount(data.pen, null, (id) => navPrefs.isDismissed(id)) > 0}
      <a class="more-row more-pen" href={at('/settings/navigation')}>
        <Icon name="alert" size="m" /><span class="more-name">{suggested(penCount(data.pen, null, (id) => navPrefs.isDismissed(id)))}</span><span class="more-tally">{copy.review}</span>
      </a>
    {/if}

    <!-- EACH SECTION'S OWN THINGS UNDER ITS NAME, a project per row under Projects, in the thing's own colour. -->
    {#each rail.things as [section, list] (section)}
      <h3 class="more-section">{section}</h3>
      <ul class="more-list">
        {#each list as entry (entry.href)}
          <li>
            <a class="more-row" href={at(entry.href)} aria-current={under(entry.href) ? 'page' : undefined}>
              {#if entry.hue !== undefined}<span class="more-hue" style="--hue:{entry.hue}" aria-hidden="true"></span>{:else}<Icon name={entry.icon} size="m" />{/if}
              <span class="more-name">{entry.title}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/each}

    <!-- YOUR THINGS: the places the bar leaves out with their views, every list with its views, and the tools. -->
    <h3 class="more-section">{said('lists')}</h3>
    <ul class="more-list">
      {#each moreBeyond as item (item.key)}
        <li>
          <a class="more-row" href={at(item.href)} aria-current={isHere(item, place) && !(rail.views[item.key] ?? []).some((v) => under(v.href)) ? 'page' : undefined}>
            <Icon name={item.icon as IconName} size="m" /><span class="more-name">{item.label}</span>
            {#if item.count && item.key === 'decide'}<Count n={item.count} />{:else if item.count}<span class="more-tally num">{item.count}</span>{/if}
          </a>
        </li>
      {/each}
      {#each moreViews as v (v.href)}
        <li>
          <a class="more-row" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}><Icon name="doc" size="m" /><span class="more-name">{v.title}</span></a>
        </li>
      {/each}
      {#each moreLists as r}
        <li>
          <a class="more-row" href={at(`/r/${r.id}`)} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
            <Icon name={r.icon} size="m" />
            <span class="more-name">{r.name}</span>
            <span class="more-tally num">{r.count}</span>
          </a>
        </li>
        <!-- And its saved views, which are the same list with a predicate. -->
        {#each r.views ?? [] as v}
          <li>
            <a class="more-row" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}><Icon name="doc" size="m" /><span class="more-name">{v.name}</span></a>
          </li>
        {/each}
      {/each}
      {#each tools as [href, label, glyph] (href)}
        <li>
          <a class="more-row" href={at(href)} aria-current={under(href) ? 'page' : undefined}>
            <Icon name={glyph} size="m" /><span class="more-name">{label}</span>
          </a>
        </li>
      {/each}
    </ul>

    <!-- THE PLACES PAST SEVEN, AND ACTIVITY, as the rail keeps them under More. -->
    {#if moreOther.length > 0}
      <h3 class="more-section">{copy.otherPages}</h3>
      <ul class="more-list">
        {#each moreOther as item (item.key)}
          <li>
            <a class="more-row" href={at(item.href)} aria-current={isHere(item, place) ? 'page' : undefined}>
              <Icon name={item.icon as IconName} size="m" /><span class="more-name">{item.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- AT THE FOOT, THE ACCOUNT'S TWO: Settings, and Sign out (LCH-A04), a press and not a link, 44 under a thumb. -->
    <ul class="more-list more-places">
      <li>
        <a class="more-row" href={at('/settings')} aria-current={under('/settings') ? 'page' : undefined}>
          <Icon name="settings" size="m" /><span class="more-name">{copy.settings}</span>
        </a>
      </li>
      <li>
        <button type="button" class="more-row" onclick={() => void signOutHere()} aria-busy={signingOut}>
          <Icon name="lock" size="m" /><span class="more-name">{signingOut ? copy.signingOut : copy.signOut}</span>
        </button>
      </li>
    </ul>
  </nav>
</Sheet>

<!-- One stack, one live region, on every surface including the two that carry no shell: an action
     taken from a shared page still has to be able to report itself. -->
<Toasts />

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
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, var(--rule) 8px 16px);
  }

  /* WARN, NOT DANGER: a dropped connection is a condition to wait out, not a loss. Solid where
     polling is dashed, so the two states differ by shape as well as by colour. */
  .live[data-state='offline'] {
    display: block;
    background: var(--warn);
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
   * ONE BOARD, AND ON IT THE RAIL AND THE WORK (DIRECTION §39).
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

  /* The rail's column, the window's full height, with nothing round it: the rail pads itself.

     AT THE MENU'S LEVEL, because the record switcher's menu opens inside it: at `auto` the work's sticky title row,
     later in the page and at `--z-sheet`, was drawn over any part of the menu that reached past the rail. */
  .rail-slot {
    position: relative;
    z-index: var(--z-palette);
    display: flex;
  }

  /* THE RAIL'S WIDTH, HELD WHILE ITS CHUNK ARRIVES, so the work beside it does not start at the window's edge and jump. */
  .rail-slot:empty {
    inline-size: var(--rail, 216px);
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

  /* THE TOP BAR IS THE WINDOW'S WIDTH, on the nav's surface with one hairline under it in light; in dark the surface
     alone parts it from the board (frame F4). Its own gutter lines its edges up with the work under it. The Mac app's
     title bar is paid here, once: the work under the bar pays none. */
  .shell[data-shape='bar'] .bar-slot {
    position: relative;
    z-index: var(--z-palette);
    padding: var(--shell-inset, 0px) 0 0;
    background: var(--nav);
    border-block-end: 1px solid var(--rule);
  }

  :global(html[data-scheme='dark']) .shell[data-shape='bar'] .bar-slot {
    border-block-end-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    :global(html:not([data-scheme])) .shell[data-shape='bar'] .bar-slot {
      border-block-end-color: transparent;
    }
  }

  .shell[data-shape='bar'] .body {
    --shell-inset: 0px;
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
    /* A rectangle, as every button is (DIRECTION §39). */
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  /* THE SURFACE ON A PSEUDO-ELEMENT: an opaque tile with one hairline, no glass (DIRECTION §39), and a step of ink
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

  .menu-open:hover::before,
  .launcher:hover::before {
    background: color-mix(in srgb, var(--ink) 5%, var(--tile));
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
    .rail-slot {
      display: none;
    }

    /* `19 §3`'S SECOND CONDITION, AND IT IS ONE RULE. Below 900px the tab bar is the navigation
       whatever the shape says, so the strip goes and the grid is one column with one row again —
       without the second half of that, `main` would sit in an `auto` row inside a `100dvh` box with
       `overflow: hidden` and every screen would end where the window does. */
    .bar-slot {
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
   * THE DOCKED PANEL'S OWN COLUMN, FROM 1,280 UP (DIRECTION 37: a docked right panel; `DOCKS` in `panel.ts`).
   *
   * `Panel.svelte` is a fixed card at the window's end edge, and it writes `--dock-w` on the root while it is open
   * docked: its width and the inset either side, `0px` otherwise. `--dock-col` is the same width for this column, so
   * opening a task or a question narrows the work beside it rather than drawing over it, and the work's scrollbar, a
   * sticky head and anything full width all stop where the panel starts, which page padding could not do.
   *
   * ONE REFLOW, IN STEP WITH THE SLIDE. Animating the column would lay the whole work out again on every frame, and
   * taking it at once left an empty band of ground where the panel had yet to arrive. So the column is given when the
   * panel's slide is over (`--dock-col` waits `--d-panel`), and until then the panel slides in over the work's end; the
   * work narrows once, under a panel that is already there. Closing, the column goes at once and the panel slides out
   * over the work as it widens.
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

    .shell[data-shape='bar'],
    .shell[data-shape='menu'] {
      grid-template-columns: minmax(0, 1fr) var(--dock-col, 0px);
    }

    .shell[data-shape='bar'] .bar-slot,
    .shell[data-shape='menu'] .bar-slot {
      grid-area: 1 / 1;
    }

    .shell[data-shape='bar'] .body,
    .shell[data-shape='menu'] .body {
      grid-area: 2 / 1;
    }

    .body {
      --dock-w: 0px;
    }
  }

  /* ── The More sheet ─────────────────────────────────────────────────────── */

  .more-nav {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* FROM 900px THE SHEET IS 360 WIDE at the window's end edge: a list of places, not a form. */
  @media (width >= 900px) {
    :global(dialog:has(.more-nav)) {
      inline-size: min(360px, calc(100vw - 2 * var(--inset)));
    }
  }

  .more-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE ROW SHAPE FOR EVERY PLACE: a glyph, the name, and a count or a level at the end. A button
     row (the record) and a link row look the same, because both are a place to go. */
  .more-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* The glyph is quiet, and ink on the row you are on, as the rail draws it. */
  .more-row > :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  .more-row[aria-current='page'] {
    background: var(--red-tint);
  }

  .more-row[aria-current='page'] > :global(.icon) {
    color: var(--ink);
  }

  .more-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .more-tally {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* The holding pen's line sits apart from the places under it, as the rail's sits apart at its foot. */
  .more-pen {
    margin-block-end: var(--sp-2);
  }

  /* A thing's own colour, where a place's glyph would be, as the rail draws it. */
  .more-hue {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    margin-inline: calc((var(--icon-m) - 8px) / 2);
    border-radius: var(--r-round);
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* The record's tile: ink with the ground's letter, the rail's own (`Sidebar.svelte`). */
  .more-tile {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
    background: var(--ink);
    border-radius: var(--r-xs);
    color: var(--tile);
    font-size: var(--fs-cap);
    font-weight: 600;
    line-height: 1;
  }

  .more-who {
    font-weight: 600;
  }

  .more-fold {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-out);
  }

  .more-fold[data-open] {
    transform: rotate(180deg);
  }

  /* The other records sit under the record's row, indented to its name. */
  .more-records {
    padding-inline-start: var(--sp-5);
  }

  .more-note {
    padding: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* The same headings the rail carries, and they are headings: a section title, not an eyebrow. */
  .more-section {
    margin-block: var(--sp-4) 0;
    padding-inline: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  /* The places the rail keeps at its foot, apart from the record's own by a hairline. */
  .more-places {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-row:hover {
      background: var(--hover);
    }

    .more-row[aria-current='page']:hover {
      background: var(--red-tint);
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
</style>
