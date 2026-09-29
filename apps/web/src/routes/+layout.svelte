<!--
  The shell: a skip link, the rail or the tab bar, the phone's More sheet, the palette, the toast
  stack, and one polite live region.

  THE LIVE HAIRLINE ACROSS THE TOP IS DRAWN ONLY WHILE SOMETHING IS WRONG (design SYS-5, DSN-6). It
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
  import { apiBase, at, here } from '$lib/at.ts';
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
  import { restore as restoreAccent } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import { leaving, settled } from '$lib/ui/screen.svelte.ts';
  import { GoPrefix, overlays, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { watchKeyboard } from '$lib/a11y/keyboard.ts';
  import Sidebar from '$lib/ui/Sidebar.svelte';
  import { assets } from '$app/paths';

  import { named } from '$lib/env.ts';
  import TabBar from '$lib/ui/TabBar.svelte';
  import TopBar from '$lib/ui/TopBar.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { follow, live } from '$lib/data/live.svelte.ts';
  /* THE PALETTE AND THE `?` SHEET'S BODY ARRIVE AFTER THE SHELL. Both are closed on every first
     paint, and the palette reads the whole sample record to rank what it lists, so importing them
     here put all of that in front of the first screen and in the entry's preload list. They are
     asked for as the shell mounts: a `⌘K` pressed before the palette lands sets `palette.open`,
     and the palette opens on that when it does. */
  /* Named as types, which the compiler erases: the layout still reaches both, as `dead-copy` reads it. */
  import type PaletteView from '$lib/palette/Palette.svelte';
  import type KeymapView from '$lib/ui/Keymap.svelte';
  import { palette } from '$lib/palette/open.svelte.ts';
  import { levelWord, openRecord } from '$lib/record/switcher.ts';
  import { OVERVIEW, WORK, arrange, flatNav, isHere, orderLists, placeOf, tabsOf } from '$lib/nav.ts';
  import { TASKS } from '$lib/work/list.ts';
  import type { Working } from '$lib/record/boot-live.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { spineOf } from '$lib/spine.ts';
  import { said } from '$lib/voice.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon, { type IconName } from '$lib/ui/Icon.svelte';
  import LapseBanner from '$lib/ui/LapseBanner.svelte';
  import Pull from '$lib/ui/Pull.svelte';
  import { untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data, children } = $props();

  /* Held in state and drawn through `{#if}`, not `{#await}`: an await block is a runtime of its own,
     and it landed in the entry chunk the lazy import was there to shrink. */
  let Palette = $state<typeof PaletteView | null>(null);
  let Keymap = $state<typeof KeymapView | null>(null);
  $effect(() => {
    void import('$lib/palette/Palette.svelte').then((m) => (Palette = m.default));
    void import('$lib/ui/Keymap.svelte').then((m) => (Keymap = m.default));
  });

  /* These surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6),
     and `/signin` because a rail listing somebody else's registers behind a sign-in form is the
     screen claiming you are already in. `/connect`, an app's consent screen, comes before any work
     in a record as sign-in does, and without the rail it fits a phone with Allow in thumb reach (AGT-8). */
  const bare = $derived.by(() => {
    /* Read inside the record: the address is `/app/acme/start` and the rule is about `/start`. */
    const at = here(page.url.pathname);
    return at === '/start' || at === '/signin' || at === '/signup' || at === '/invite' || at === '/connect' || at.startsWith('/s/');
  });

  /* THE SHELL'S, AND A PAGE'S. It was local, so a page could not open the palette — which is why
     `/[id]`'s `Search` button navigated Home instead of searching. */
  let keymapOpen = $state(false);
  let moreOpen = $state(false);

  /**
   * THE MORE SHEET IS THE PHONE'S RAIL (design SYS-4, DSN-6): search at its head, the record and
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

  /* COMPARED INSIDE THE RECORD, as the rail compares: the address with the base and the slug taken off. */
  const current = (href: string) => here(page.url.pathname) === href;
  const under = (href: string) => {
    const where = here(page.url.pathname);
    return where === href || where.startsWith(`${href}/`);
  };

  /* SEARCH FROM MORE IS THE PALETTE, the one surface that reaches anything in the record, opened as
     the sheet closes rather than over it. */
  function find() {
    moreOpen = false;
    palette.open = true;
  }

  /** The same order the rail draws, one nav and not two shapes. */
  /* A SAVED VIEW DRAWN UNDER ITS LIST is not drawn again under Views. The palette still reads every page in `data.nav`. */
  /* AND A TABBED SECTION'S PAGE PAST THE RAIL'S BUDGET IS THE STRIP'S, NOT THE RAIL'S (`cut`, PGS-18). */
  const railNav = $derived.by(() => {
    const placed = new Set(data.index.registers.flatMap((r) => (r.views ?? []).map((v) => v.href)));
    return data.nav.filter((n) => !n.cut && !placed.has(n.href));
  });
  /* THE SPINE'S RULE FOR INBOX (`spine.ts`): it is a row under More once anything has arrived. A shell no record answered
     has no `counts`, and is read from the two numbers it does carry. */
  const spine = $derived(spineOf(data.counts ?? { decide: data.open, inbox: data.inbox }));
  /* THE TOOLS UNDER MORE, IN THE ORDER A PHONE READS THEM, with the rail's glyphs and the rail's words (`Sidebar.svelte`).
     Slash's page is Suggestions there, and Inbox joins once anything has arrived (`spineOf`). USAGE IS HERE (MOD-25): its
     word is written out rather than read from `record/actions.ts`, which would carry the usage reader into the entry
     chunk for one word. Settings goes to `/settings`, the index of areas below 900px (DSN-13). */
  const USAGE = 'Usage';
  const places = $derived([
    ...(spine.includes('inbox') ? ([['/inbox', said('inbox'), 'inbox']] as const) : []),
    ['/slash', copy.suggestions, 'slash'],
    ['/automations', copy.automations, 'refresh'],
    ['/jobs', copy.jobs, 'play'],
    ['/packs', copy.packs, 'packs'],
    ['/vault', copy.vault, 'vault'],
    ['/usage', USAGE, 'observe'],
    ['/settings', copy.settings, 'settings'],
  ] as const);

  /* THE PERSON'S OWN RAIL, as `boot` answered it, before anything draws it (`nav-prefs.svelte.ts`). */
  $effect.pre(() => navPrefs.adopt(data.me.prefs, apiBase()));
  /* A PAGE HIDDEN FROM THE RAIL IS HIDDEN FROM THE TOP BAR AND THE MORE SHEET TOO: one nav, not two. */
  const grouped = $derived(arrange(railNav.filter((e) => !navPrefs.hidden.includes(e.href)), navPrefs.order));
  const hiddenCount = $derived(railNav.filter((e) => navPrefs.hidden.includes(e.href)).length);
  /* THE PHONE'S LISTS IN THE RAIL'S ORDER, from the same preference (`orderLists`). */
  const moreLists = $derived(orderLists(data.index.registers, navPrefs.order));

  /**
   * THE FLAT LIST, ONE RULE FOR THE RAIL, THE TOP BAR, THE TAB BAR AND THE SHEET (`flatNav` in `lib/nav.ts`): Today, the
   * sections a day runs through, Activity, Decide while something waits, seven at most, and everything else under More.
   */
  /* AND WORK OPENS THE WORK SCREEN ON A RECORD THAT HOLDS TASKS (`lib/work/Work.svelte`), empty or not. */
  const holdsTasks = $derived(data.lists.some((l) => l.id === TASKS));
  const flat = $derived(
    flatNav(grouped, data.open, { today: copy.today, activity: copy.audit, decide: said('decide') }, { work: holdsTasks ? WORK : null }),
  );
  const tabs = $derived(tabsOf(flat.main));
  /* WHAT THE TOP BAR SAYS IS UNDER MORE: the sections and pages that are not rows, and the lists. */
  const behind = $derived(flat.more.length + flat.pages.length + moreLists.length);

  /* WHERE THE READER IS, for the sheet's rows: the Overview is a place of its own, so Today is not marked on it too. */
  const place = $derived(placeOf(here(page.url.pathname), page.url.searchParams));

  /* `g 1`–`9` COUNT WHAT IS ON SCREEN: the rows of the flat list, in the order drawn. */
  const numbered = $derived(flat.main);
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
   * refusal away. The four colours the swatch row suggested until 21 September are all refused by
   * check R — Moss is 2.92:1 as a fill against `s1` in dark against a 3:1 floor, and the other three
   * are 2.55, 2.84 and 2.94 — so every browser that pressed one of them loses its colour on the next
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
  $effect(() => {
    const out = restoreAccent();
    if (!out.ok) untrack(() => toasts.push(copy.accentRefused(out.dropped, out.codes), { intent: 'warn' }));
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
   * it is the cookie's first-paint copy, and after it the cookie is only ever written from the record (contracts §7.3).
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
  beforeNavigate(() => {
    leaving();
    moreOpen = false;
    switching = false;
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

  /* THE HAIRLINE READS THE POLL NOW, AND IT WAS A CONSTANT UNTIL W56. `const live = 'open'` stood here with a comment
     saying there was no write and no poll yet, so the `polling` and `offline` rules below could never match
     (`loop/research-living-in-it.md` §1.1). `follow` starts one poll of `/api/version` per tab (`lib/data/live.ts`),
     on a record that answered only. NOT OVER A REFUSAL, though its shell says `live`: `version` is `READ+`, so on the
     signed-out sign-in screen every tick was a 401 and the hairline went to `offline`, which the sample's shell had
     hidden by saying `live: false` until DIRECTION 26 took it away. `page.url` and not `location`, so a move from one
     record to another follows the address being opened. */
  $effect(() => follow(data.live === true ? (data.refused ? null : apiBase(page.url)) : null));

  /**
   * WHO IS WORKING NOW, FOR THE RAIL (SYSTEM §5), asked as Today asks it (`readWorking` in `record/boot-live.ts`) and
   * again whenever the poll hears the record move, so a run that starts or stops shows up without a reload.
   *
   * NOT THROUGH `read()`, WHICH IS A SCREEN'S. `read` brackets every call in the screen's readiness count, and a rail
   * read refused for a colleague who may not see the runs would mark the screen beside it refused. Keyed on the
   * record's address rather than on `page.url`, so moving between screens asks nothing; a refusal is an empty group.
   * Asked only while the rail is drawn, since no other shape has the group.
   */
  let working = $state.raw<Working[]>([]);
  const workingAt = $derived(!bare && shape === 'rail' && data.live === true && !data.refused ? apiBase(page.url) : null);
  $effect(() => {
    const base = workingAt;
    void live.version;
    if (base === null) {
      working = [];
      return;
    }
    let gone = false;
    void import('$lib/record/boot-live.ts')
      .then((m) => m.readWorking(base))
      .then(
        (w) => {
          if (!gone) working = w;
        },
        () => undefined,
      );
    return () => {
      gone = true;
    };
  });

  /** Where `g` then a letter lands. `g 1`–`g 9` address the nth item of YOUR nav, in YOUR order. */
  /* `g s` IS HERE NOW. It was removed on the grounds that "search is not a place you go, it is the
     thing under the launcher" — true while the palette was the only search, and contradicted by
     `19 §2`, which lists `/search?q=` in the screen inventory, and by `19 §4`, which has `g s` in
     its own chord list. The palette caps its record hits; the cap needs somewhere to point. */
  const GOTO: Record<string, string> = { h: '/', d: '/decide', i: '/inbox', s: '/search', v: '/vault', p: '/packs', ',': '/settings/appearance' };

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

    /* `⌘Z` — the newest undo the toast stack is still offering. The stack IS the undo history here,
       which is the honest shape for it: an undo that outlives its own toast is an undo with no
       label, and 02 §8 makes the unit a `batch` rather than a keystroke anyway. */
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (!toasts.undoLast()) toasts.push(copy.nothingToUndo);
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
      const target = GOTO[e.key.toLowerCase()];
      const digit = Number(e.key);
      go.disarm();
      if (target) {
        e.preventDefault();
        goto(at(target));
      } else if (digit >= 1 && digit <= 9 && numbered[digit - 1]) {
        e.preventDefault();
        goto(at(numbered[digit - 1]!.href));
      }
      return;
    }

    if (e.key === 'g') {
      go.arm();
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
      keymapOpen = true;
    }
  }
</script>

<svelte:window {onkeydown} />

<a class="skip" href="#main">Skip to content</a>

<!-- The record's own state, two pixels, drawn only when it has something to say: nothing while the poll answers,
     solid warn when a poll has failed, and never from `navigator.onLine`, which reports online on a LAN with no
     internet. It must not cry wolf: a line that appears and withdraws on every open is a line nobody believes the day
     it is true (19 §6).

     ONE DEPARTURE FROM `50 §2.4`, AND IT IS DELIBERATE. The spec names the state `polling` whenever the fallback runs,
     and `polling` is drawn dashed in `--warn`. With the poll as the only transport that would put a warning on every
     screen at all times, which is an alarm for the state in which nothing is wrong. So a poll that answers is `open`,
     a poll that fails is `offline`, and `polling` is never set: it is kept for a socket's fallback once there is a
     socket to fall back from (`loop/research-living-in-it.md` §1.4). -->
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
      <div class="rail-slot">
        <Sidebar
          icons={railIcons}
          ontoggle={toggleRail}
          main={flat.main}
          more={flat.more}
          pages={flat.pages}
          hidden={hiddenCount}
          pen={data.pen}
          record={data.index.name}
          records={data.me.records}
          refused={data.recordsRefused}
          registers={data.index.registers}
          {spine}
          inbox={data.inbox}
          {working}
        />
      </div>
    {:else}
      <div class="bar-slot">
        {#if shape === 'bar'}
          <TopBar entries={flat.main} {behind} onmore={() => (moreOpen = true)} />
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

      Four pixels and 240ms, which is `--d-move`, already in the token file for exactly this kind
      of distance. `backwards` so the first frame is the start of the animation rather than the
      end of it, which is the difference between a screen sliding in and a screen flickering.

      IT SURVIVES BEING TURNED OFF. `a11y.css` collapses every animation to 1ms under
      `prefers-reduced-motion`, and that is the right outcome here: the movement says nothing the
      screen does not already say, so a reader who does not want it loses nothing at all. Anything
      that carried meaning by moving would have to say it another way as well.
    -->
    {#key page.url.pathname}
    <main id="main" class="body" data-screen={settled()}>
      <Pull />
      <LapseBanner shell={data} />
      {@render children()}
    </main>
    {/key}
  </div>

  <div class="tab-slot">
    <TabBar {tabs} more={moreOpen} onmore={() => (moreOpen = true)} />
  </div>

  <!--
    THE SEARCH BUTTON OF A DESKTOP WITH NO RAIL, and nowhere else.

    The rail carries search as a row at its foot, and below 900px it is the 44px button in each
    screen's head bar. The top bar and the menu shapes have neither, so from 900px up they keep this
    one: a magnifier in a quiet raised circle at the bottom corner, which opens the palette, the one
    surface that reaches anything in the record. Below 900px the rule under it hides it, because the
    tab bar is the navigation there whatever the shape says.
  -->
  {#if shape !== 'rail'}
    <button type="button" class="launcher tap" onclick={() => (palette.open = true)} aria-label={copy.paletteLabel}>
      <Icon name="search" size="l" />
    </button>
  {/if}

  {#if Palette}<Palette bind:open={palette.open} nav={data.nav} />{/if}
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
  {#if Keymap}<Keymap />{/if}
</Sheet>

<!--
  MORE: THE PHONE'S RAIL, IN THE RAIL'S ORDER, WITH THE RAIL'S GLYPHS.

  It carries the declared pages under their section headings AND every list, because a page can be
  uninstalled with the pack that declared it and the lists underneath it still have to be reachable:
  on a phone that second group once did not exist, and the lists that hold every row in the record
  were not in the navigation at all. The headings come too, because they are a grouping over one
  ordered list of `page` rows, and without them "Board" is a bare word. A section's Overview is its
  heading, not a row. It draws the flat list first, then what the rail keeps under More (`flatNav`).

  Every row is 44px or more and wears its glyph, and the row for the screen you are on is marked:
  `aria-current`, the `--selected` ground and an ink glyph, as the rail marks it. A row closes the
  sheet by navigating (`beforeNavigate` above).
-->
<Sheet bind:open={moreOpen} title={copy.more}>
  <nav class="more-nav" aria-label={copy.more}>
    <!-- SEARCH AT THE HEAD, drawn as the field it leads to. It is a button and not an input: an input
         here would be the sheet's first field, and `Sheet.svelte` puts the caret in the first field,
         so every press of More would raise the keyboard over the list somebody came to read. -->
    <button type="button" class="more-find" onclick={find}>
      <Icon name="search" size="m" /><span class="more-find-words">{copy.searchRecord}</span>
    </button>

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
          {#each data.me.records as r}
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
          {#if data.recordsRefused}<li class="more-note">{data.recordsRefused}</li>{/if}
          <li>
            <a class="more-row" href={at('/settings/identity')}><Icon name="settings" size="m" /><span class="more-name">{copy.recordSettings}</span></a>
          </li>
          <!-- NO "NEW RECORD" HERE (MOD-6): it opened this record's own `/start`, and it is drawn only once the host says
               the person may make a record, which `boot` does not carry yet. The rail's copy of it went the same way. -->
        </ul>
      {/if}
    </div>

    <!-- THE FLAT LIST, AS THE RAIL DRAWS IT (`flatNav`). On a phone the tab bar carries the first five and this carries all
         of them, so a row past the fifth is one press from any screen. -->
    <ul class="more-list more-spine">
      {#each flat.main as item (item.key)}
        <li>
          <a class="more-row" href={at(item.href)} aria-current={isHere(item, place) ? 'page' : undefined}>
            <Icon name={item.icon as IconName} size="m" /><span class="more-name">{item.label}</span>
            {#if item.count}<span class="more-tally num">{item.count}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>

    <!-- AND WHAT IS UNDER MORE ON THE RAIL: the page the record opened on before Today, the sections that did not fit, and
         a section's other pages. A project's own page is on the Projects page, not here. -->
    <h3 class="more-section">{copy.otherPages}</h3>
    <ul class="more-list">
      <li>
        <a class="more-row" href={at(OVERVIEW)} aria-current={place === OVERVIEW ? 'page' : undefined}>
          <Icon name="observe" size="m" /><span class="more-name">{copy.overview}</span>
        </a>
      </li>
      {#each flat.more as item (item.key)}
        <li>
          <a class="more-row" href={at(item.href)} aria-current={isHere(item, place) ? 'page' : undefined}>
            <Icon name={item.icon as IconName} size="m" /><span class="more-name">{item.label}</span>
          </a>
        </li>
      {/each}
      {#each flat.pages as entry (entry.href)}
        <li>
          <a class="more-row" href={at(entry.href)} aria-current={current(entry.href) ? 'page' : undefined}>
            <Icon name={entry.icon} size="m" /><span class="more-name">{entry.title}</span>
          </a>
        </li>
      {/each}
    </ul>

    <!-- AND THE HEADING GOES WITH THEM. `index.registers` holds only the lists that have something
         in them, so on a young record this section would be a title over nothing. It is the record's
         own word for its lists, as the rail's heading is (`said('lists')`), not the build's. -->
    {#if moreLists.length > 0}
      <h3 class="more-section">{said('lists')}</h3>
      <ul class="more-list">
        {#each moreLists as r}
          <li>
            <a class="more-row" href={at(`/r/${r.id}`)} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
              <Icon name={r.icon} size="m" />
              <span class="more-name">{r.name}</span>
              <span class="more-tally num">{r.count}</span>
            </a>
            <!-- And its saved views, which are the same list with a predicate: no glyph, and indented. -->
            {#each r.views ?? [] as v}
              <a class="more-row more-view" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}>
                <span class="more-name">{v.name}</span>
              </a>
            {/each}
          </li>
        {/each}
      </ul>
    {/if}

    <ul class="more-list more-places">
      {#each places as [href, label, glyph] (href)}
        <li>
          <a class="more-row" href={at(href)} aria-current={under(href) ? 'page' : undefined}>
            <Icon name={glyph} size="m" /><span class="more-name">{label}</span>
          </a>
        </li>
      {/each}
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
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
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
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, var(--line) 8px 16px);
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
   * THE GROUND, AND ON IT A FLOATING RAIL AND THE WORK (SYSTEM §5).
   *
   * The work no longer sits in a lifted panel: the page IS the ground (`--sunk` with `--ground-light`, painted on
   * `body` in `app.css`), the rail is a glass card floating 12 in from the window, and the content sits straight on the
   * ground 20 from the rail and 28 from the right. `.body` is still the ONE scroll container, so the rail never moves
   * and the window shows exactly one scrollbar.
   *
   * ONE COLUMN THAT SIZES TO THE RAIL, AT BOTH OF THE RAIL'S WIDTHS. `auto` measures whatever the rail says it is, so
   * the narrow width is the rail's own declaration and this grid never has to know which state it is in.
   */
  .shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    block-size: 100dvh;
    overflow: hidden;
  }

  /* The card, 12 in from the window at the top, the start and the bottom.

     AT THE MENU'S LEVEL, because the card is a stacking context of its own (its glass sits under it at `z-index: -1`),
     and the record switcher's menu opens inside it: at `auto` the work's sticky title row, later in the page and at
     `--z-sheet`, was drawn over any part of the menu that reached past the card. */
  .rail-slot {
    position: relative;
    z-index: var(--z-palette);
    display: flex;
    padding-block: var(--inset);
    padding-inline-start: var(--inset);
  }

  /* THE OTHER TWO SHAPES ARE ONE COLUMN WITH A STRIP ON TOP, and the strip is `auto` for the same
     reason the rail's column is: its height is its own declaration, and this grid never has to know
     which of the two is in it. */
  .shell[data-shape='bar'],
  .shell[data-shape='menu'] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* The strip floats 12 in from the window, as the rail does. */
  .bar-slot {
    min-inline-size: 0;
    padding: var(--inset) var(--inset) 0;
  }

  /* One glass pill, at the start of the strip, at the size every other target in the shell is. */
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
    /* A pill, because it is pressed (design D-2). */
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
    cursor: pointer;
  }

  /* THE GLASS ON A PSEUDO-ELEMENT, as the rail's: a `backdrop-filter` on the control would be the box a fixed
     descendant is placed against. */
  .menu-open::before,
  .launcher::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    transition: background var(--d-state) var(--ease-out);
  }

  .menu-open:hover::before,
  .launcher:hover::before {
    background: var(--glass-strong);
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
   * THE GUTTER IS SET HERE, ONCE, for every screen under it. Screens pad their content by `--gutter`, so 20 here puts
   * the content 20 from the rail card, and the 8 at the end makes it 28 from the window's right edge. On the other two
   * shapes nothing is at the start, so the content sits 28 in on both sides.
   */
  .body {
    --gutter: 20px;

    animation: arrive var(--d-move) var(--ease-out) backwards;
    min-inline-size: 0;
    padding-inline-end: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* THE PAGE'S FOOT, and on the top bar and menu shapes the room the search button in the bottom
       corner needs: a floating button over the last row of a list hides exactly the thing a long
       list is scrolled to the bottom to see. */
    padding-block-end: calc(var(--tap) + var(--sp-5));
  }

  .shell[data-shape='bar'] .body,
  .shell[data-shape='menu'] .body {
    --gutter: 28px;

    padding-inline-end: 0;
  }

  /* Below 900px the rail becomes a tab bar; above it, the tab bar does not exist. */
  .tab-slot {
    display: none;
  }

  /* A GLASS CIRCLE WITH A MAGNIFIER, floating over the page in the corner, 44 across. */
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
    border-radius: var(--r-pill);
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

    /* THE PHONE'S OWN GUTTER, 16, whatever the shape (SYSTEM §9). */
    .body,
    .shell[data-shape='bar'] .body,
    .shell[data-shape='menu'] .body {
      --gutter: var(--sp-4);

      padding-inline-end: 0;
      /* THE LAST ROW ENDS 16px ABOVE THE TAB BAR (design 6.6). `--tabbar` is the bar and the home
         indicator under it, summed once in `tokens.css`; the bar floats `--inset` above that. */
      padding-block-end: calc(var(--tabbar) + var(--inset) + var(--sp-4));
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

  /* ── The More sheet ─────────────────────────────────────────────────────── */

  .more-nav {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* SEARCH, DRAWN AS THE FIELD IT OPENS: a field's fill and radius, 44px, the words in `--dim` (SYSTEM §6). */
  .more-find {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    margin-block-end: var(--sp-3);
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--dim);
    font: inherit;
    font-size: var(--t-md);
    text-align: start;
    cursor: pointer;
  }

  .more-find-words {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* The glyph is quiet, and ink on the row you are on, as the rail draws it (design SYS-12). */
  .more-row > :global(.icon) {
    flex: none;
    color: var(--dim);
  }

  .more-row[aria-current='page'] {
    background: var(--selected);
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
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The record's tile: ink with the ground's letter, the rail's own (`Sidebar.svelte`). */
  .more-tile {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
    background: var(--ink);
    border-radius: var(--r-sm);
    color: var(--bg);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .more-who {
    font-weight: 600;
  }

  .more-fold {
    display: inline-grid;
    flex: none;
    color: var(--dim);
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
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The same headings the rail carries, and they are headings: a section title, not an eyebrow. */
  .more-section {
    margin-block: var(--sp-4) 0;
    padding-inline: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* A saved view is its list looked at another way: indented under it, with no glyph of its own. */
  .more-view {
    padding-inline-start: calc(var(--sp-2) + var(--icon-m) + var(--sp-3));
    color: var(--ink2);
  }

  /* The places the rail keeps at its foot, apart from the record's own by a hairline. */
  .more-places {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-row:hover {
      background: var(--hover-wash);
    }

    .more-row[aria-current='page']:hover {
      background: var(--selected);
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
