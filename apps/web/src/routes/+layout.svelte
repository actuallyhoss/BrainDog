<!--
  The shell: a skip link, the rail or the tab bar, the palette, the toast stack, and one polite live
  region.

  The live hairline across the top is the record's own state. It is two pixels and it is ALWAYS
  there, because "a surface showing nothing must never be indistinguishable from a surface with
  nothing to show" (19 §6) — but "always there" is not the same as "always coloured", and it was
  built the wrong way round once. A saturated stripe across the full width of every screen, painted
  in the one colour reserved for *this is interactive*, is a permanent alarm for the state in which
  nothing is wrong. So the healthy state is the boundary colour, indistinguishable from the chrome
  it sits in, and the bar takes an intent only when the connection has actually taken one.

  The offline signal must not cry wolf, which is a detection rule and not a styling one:
  `navigator.onLine` reports online on a LAN with no internet, so the real signal is a failed write,
  never the browser's guess. Once it IS detected, it is shown as what it is — writes will fail.
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
  import '$lib/blocks.css';
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
  /* `pending-held` AND NOT `pending`, AND THE DIFFERENCE IS 27 KB. `pending.svelte.ts` stamps a row
     with the sample's clock, so importing it here would put the whole synthetic record in the
     shell's chunk, which is the thing the comment above and `+layout.ts` both refuse to do. The rows
     and the count live in a file that imports types and nothing else. */
  import { anyPending } from '$lib/record/pending-held.svelte.ts';
  /* THE PALETTE AND THE `?` SHEET'S BODY ARRIVE AFTER THE SHELL. Both are closed on every first
     paint, and the palette reads the whole sample record to rank what it lists, so importing them
     here put all of that in front of the first screen and in the entry's preload list. They are
     asked for as the shell mounts: a `⌘K` pressed before the palette lands sets `palette.open`,
     and the palette opens on that when it does. */
  /* Named as types, which the compiler erases: the layout still reaches both, as `dead-copy` reads it. */
  import type PaletteView from '$lib/palette/Palette.svelte';
  import type KeymapView from '$lib/ui/Keymap.svelte';
  import { palette } from '$lib/palette/open.svelte.ts';
  import { arrange, orderLists } from '$lib/nav.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
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

  /* Three surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6),
     and `/signin` because a rail listing somebody else's registers behind a sign-in form is the
     screen claiming you are already in. */
  const bare = $derived.by(() => {
    /* Read inside the record: the address is `/app/acme/start` and the rule is about `/start`. */
    const at = here(page.url.pathname);
    return at === '/start' || at === '/signin' || at === '/invite' || at.startsWith('/s/');
  });

  /* THE SHELL'S, AND A PAGE'S. It was local, so a page could not open the palette — which is why
     `/[id]`'s `Search` button navigated Home instead of searching. */
  let keymapOpen = $state(false);
  let moreOpen = $state(false);

  /** The same sectioned grouping AND THE SAME ORDER the rail draws — one nav, not two shapes. It
      was `group(data.nav)`, so the phone's More sheet ignored an arrangement the rail honoured. */
  /* A SAVED VIEW DRAWN UNDER ITS LIST is not drawn again under Views. The palette still reads every page in `data.nav`. */
  const railNav = $derived.by(() => {
    const placed = new Set(data.index.registers.flatMap((r) => (r.views ?? []).map((v) => v.href)));
    return placed.size ? data.nav.filter((n) => !placed.has(n.href)) : data.nav;
  });
  /* THE PERSON'S OWN RAIL, as `boot` answered it, before anything draws it (`nav-prefs.svelte.ts`). */
  $effect.pre(() => navPrefs.adopt(data.me.prefs, apiBase()));
  /* A PAGE HIDDEN FROM THE RAIL IS HIDDEN FROM THE TOP BAR AND THE MORE SHEET TOO: one nav, not two. */
  const grouped = $derived(arrange(railNav.filter((e) => !navPrefs.hidden.includes(e.href)), navPrefs.order));
  /* THE PHONE'S LISTS IN THE RAIL'S ORDER, from the same preference (`orderLists`). */
  const moreLists = $derived(orderLists(data.index.registers, navPrefs.order));

  /* `g 1`–`9` COUNT WHAT IS ON SCREEN. This indexed the raw list, so after a reorder the digit
     printed beside a rail row and the row the digit opened were different pages. */
  const numbered = $derived(grouped.flatMap(([, entries]) => entries));
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
   * sheet is already every section, every list and the four utilities, in the reader's own order.
   *
   * BELOW 900px NONE OF THIS APPLIES AND THE TAB BAR STAYS, which is §3's second condition and is
   * enforced in CSS a few rules down rather than here: a shape that let somebody put an
   * eighteen-entry strip across a phone would be a shape that breaks their phone.
   */
  let shape = $state<'rail' | 'bar' | 'menu'>(pref.read().navShape ?? 'rail');

  /**
   * AND IT IS RE-READ WHEN IT IS WRITTEN, because the control that sets it is INSIDE the thing it
   * changes.
   *
   * `/settings/navigation` is a screen in this shell, and this shell mounts once for the life of the
   * tab. So choosing Top bar wrote the cookie, left the rail exactly where it was, and came back
   * correct on the next reload: a control that works and looks broken. `pref.write` announces every
   * write for exactly this, and the listener re-reads rather than being told, so nothing here has to
   * know which key moved.
   */
  $effect(() => {
    const reread = () => (shape = pref.read().navShape ?? 'rail');
    window.addEventListener('bdpref', reread);
    return () => window.removeEventListener('bdpref', reread);
  });

  /**
   * The bar saying this is a sample record, and the way out of it.
   *
   * A STRANGER LANDED ON SOMEBODY ELSE'S COMPANY WITH NO EXPLANATION. Booting into a complete
   * synthetic business is the right decision, because an empty product demonstrates nothing: the
   * missing half was the sentence saying what it is. Without it the first screen reads as a product
   * that has already decided who you are, which `loop/REWORK.md` names as the single largest piece
   * of the onboarding friction.
   *
   * IT GOES AWAY WHEN THE RECORD IS SOMEBODY'S. Every record this build can open is the sample, so
   * the test is the dismissal and not a property of the data. When a real record can be opened the
   * test becomes whether this one is it, and the bar disappears on its own for everybody who has
   * one, which is the state that needs no dismissal at all.
   */
  /* CLEARED ON EVERY NAVIGATION, or `data-screen` is the PREVIOUS screen's answer for exactly as
     long as this one takes to arrive, which is the window every browser gate measures in. */
  beforeNavigate(leaving);

  let dismissed = $state(pref.read().sampleSaid === true);
  /* AND A LIVE RECORD IS NOT THE SAMPLE: the bar told somebody reading their own record that nothing they did was saved. */
  const sampleSaid = $derived(dismissed || data.live === true);

  function putSampleAway() {
    dismissed = true;
    pref.write({ sampleSaid: true });
  }

  /* HOW MANY ROWS ARE WAITING, ANYWHERE. A row typed on the first run and left behind was known only
     to the list it belongs to, which is the one screen the person is no longer on. This is the read
     that makes it true from every other one, and it tracks because the rows are in a `SvelteMap`. */
  const unsaved = $derived(anyPending(!data.live));

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

  /** `ponytail:` a constant in the mock-up. The live channel is `lib/data/live.ts` in the real app:
      a hibernatable WebSocket carrying `{ version, registers }` and nothing else. */
  /* ONE STATE, AND THE HEADER ABOVE DESCRIBED THREE. `polling` and `offline` are what a real
     transport produces; this app has none, so nothing could ever reassign this and two of the three
     rules below it could never match. `50 §2.4` is explicit that `offline` is set "only after a
     failed write or failed poll, never from `navigator.onLine` alone" — there is no write and no
     poll here yet. Stated as one value rather than described as three. */
  const live: 'open' | 'polling' | 'offline' = 'open';

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

<!-- The record's own state, two pixels, always there. Solid while the socket is open, dashed while
     polling, solid warn when a write has actually failed — never from `navigator.onLine`, which reports
     online on a LAN with no internet. And the chip must not cry wolf: one that appears and withdraws
     on every open is a chip nobody believes the day it is true (19 §6). -->
<div class="live" data-state={live} aria-hidden="true"></div>

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
          nav={railNav}
          pen={data.pen}
          record={data.index.name}
          records={data.me.records}
          refused={data.recordsRefused}
          registers={data.index.registers}
          open={data.open}
          inbox={data.inbox}
        />
      </div>
    {:else}
      <div class="bar-slot">
        {#if shape === 'bar'}
          <TopBar entries={numbered} open={data.open} inbox={data.inbox} onmore={() => (moreOpen = true)} />
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
      <!-- ABOVE THE SCREEN AND INSIDE THE SCROLLER, so it is the first thing read and the first
           thing to leave when the reader scrolls. A fixed strip across the top of every screen is a
           permanent tax on the height of every screen, and this is a sentence somebody reads once. -->
      {#if !sampleSaid}
        <aside class="sample" role="note">
          <p class="sample-said">
            <strong>{copy.sampleWhat}</strong>
            <span class="sample-why">{copy.sampleWhy}</span>
          </p>
          <span class="sample-acts">
            <a class="sample-go" href={at('/start')}>{copy.sampleStart}</a>
            <button type="button" class="sample-away" aria-label={copy.samplePutAway} title={copy.samplePutAway} onclick={putSampleAway}>
              <span class="sample-away-word">{copy.samplePutAway}</span>
              <span class="sample-away-glyph"><Icon name="close" size="m" /></span>
            </button>
          </span>
        </aside>
      {/if}
      <!-- AND WHAT IS WAITING, WHEREVER YOU ARE. It sits under the sample bar rather than above it
           because that bar is read once and dismissed, and this is a fact about the last thing the
           person did. It is a note and never an alarm: no intent colour, no control, and nothing is
           broken. Only the one screen it belongs to can put it right, and it says which. -->
      {#if unsaved > 0}
        <aside class="unsaved" role="note">
          <p class="unsaved-said">
            <strong>{copy.unsavedRows(unsaved)}</strong>
            <span class="unsaved-why">{copy.unsavedRowsWhy}</span>
          </p>
        </aside>
      {/if}
      {@render children()}
    </main>
    {/key}
  </div>

  <div class="tab-slot">
    <TabBar open={data.open} inbox={data.inbox} onmore={() => (moreOpen = true)} />
  </div>

  <!--
    The search button, below 900px only. At 900 and up the rail carries the same button as a row
    at its foot.

    IT WAS THE MARK, a red disc with the dog in it, on the argument that the product's own drawing
    is the whole affordance. On a phone that was an unlabelled red circle in the top corner, over
    the sample bar, and nobody guesses that a logo opens search. A magnifier in a quiet raised
    circle says what it does. It opens the palette, the one surface that reaches anything in the
    record.

    NOT AN ASSISTANT AND NOT A PANEL OF ITS OWN. There was a version of this with a prompt field and
    four suggested questions, and it was wrong twice over: a record you talk to instead of read is
    a different product, and a second overlay that does most of what the palette does is a second
    place to look for one thing. The button opens the palette that already exists.
  -->
  <!-- `data-shape`, BECAUSE THE RAIL IS WHAT REPLACED THIS BUTTON ABOVE 900px AND THE OTHER TWO
       SHAPES HAVE NO RAIL. The rule below hides it only where a rail is carrying the same control at
       its foot; on a top bar or a menu the search this product makes the primary way to reach a row
       would otherwise have no visible control at all on a desktop. -->
  <button type="button" class="launcher tap" data-shape={shape} onclick={() => (palette.open = true)} aria-label={copy.paletteLabel}>
    <Icon name="search" size="l" />
  </button>

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
  THE PHONE HAD NO ROUTE TO ANY LIST.

  This iterated `data.nav` — the DECLARED pages — and stopped. The rail beside it renders those and
  then a second group, `Lists`, holding every register, because a page can be uninstalled with the
  pack that declared it and the collections underneath it still have to be reachable. On a phone that
  second group did not exist, so Obligations, Services, Projects, People, Sessions, Tracks, Updates
  and Tasks — the eight lists that hold every row in the record — were not in the navigation at all.
  The only way to one was the palette, whose label is "Search, or run a command".

  ON A FRESH RECORD IT WAS WORSE. One register, no declared pages: this sheet would have held Packs,
  Vault, Settings and Audit, and nothing belonging to the person using it.

  THE SECTION HEADINGS COME TOO. They are a grouping over one ordered list of `page` rows, and
  dropping them delivered "Overview" and "Board" as bare words with no idea what they were about.
-->
<Sheet bind:open={moreOpen} title={copy.more}>
  <nav class="more-nav">
    {#each grouped as [section, entries]}
      <h2 class="more-section">{section}</h2>
      {#each entries as entry}<a href={at(entry.href)} onclick={() => (moreOpen = false)}>{entry.title}</a>{/each}
    {/each}

    <!-- AND THE HEADING GOES WITH THEM. `index.registers` holds only the lists that have something
         in them, so on a young record this section is a title over nothing. -->
    {#if data.index.registers.length > 0}
      <h2 class="more-section">{copy.lists}</h2>
    {/if}
    {#each moreLists as r}
      <a href={at(`/r/${r.id}`)} onclick={() => (moreOpen = false)}>
        {r.name}<span class="more-tally num">{r.count}</span>
      </a>
      <!-- And its saved views, which are the same list with a predicate. -->
      {#each r.views ?? [] as v}
        <a class="more-view" href={at(v.href)} onclick={() => (moreOpen = false)}>{v.name}</a>
      {/each}
    {/each}

    <hr />
    <a href={at('/packs')} onclick={() => (moreOpen = false)}>{copy.packs}</a>
    <a href={at('/vault')} onclick={() => (moreOpen = false)}>{copy.vault}</a>
    <a href={at('/settings/appearance')} onclick={() => (moreOpen = false)}>{copy.settings}</a>
    <a href={at('/audit')} onclick={() => (moreOpen = false)}>{copy.audit}</a>
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

  .live {
    position: fixed;
    /* UNDER THE NOTCH, AND THEREFORE NEVER SEEN. `app.html` sets `viewport-fit=cover`, so a 2px
       hairline at y=0 is fifty-seven pixels above the first pixel of an iPhone 14 anybody can look
       at: the one element in the product whose whole job is to be visible at all times was the one
       element that never was. `env()` is 0 everywhere else, so this costs nothing on a laptop. */
    inset-block-start: env(safe-area-inset-top);
    inset-inline: 0;
    z-index: var(--z-hint);
    block-size: 2px;
    background: var(--line);
  }

  .live[data-state='polling'] {
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, var(--line) 8px 16px);
  }

  /* WARN, NOT DANGER: a dropped connection is a condition to wait out, not a loss. Solid where
     polling is dashed, so the two states differ by shape as well as by colour. */
  .live[data-state='offline'] {
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

  /* Rail and canvas on the sunk ground, the work lifted onto `bg` in its own panel. The panel is the
     ONE scroll container, so the rail never moves and the window shows exactly one scrollbar. */
  /**
   * ONE COLUMN THAT SIZES TO THE RAIL, AT BOTH OF THE RAIL'S WIDTHS.
   *
   * There were four rules here and a `--rail-back` variable, all of them arithmetic for the state
   * where the rail was gone: a grid that had to be rewritten to one column, a 40px gutter for the
   * restore button, and a note recording that the first version of the fix reproduced its own bug
   * one breakpoint down. None of it is needed to make a rail narrower. `auto` measures whatever the
   * rail says it is, so the collapsed width is the rail's own declaration and this grid never has
   * to know which state it is in.
   */
  .shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    block-size: 100dvh;
    overflow: hidden;
    background: var(--sunk);
  }

  /* THE OTHER TWO SHAPES ARE ONE COLUMN WITH A STRIP ON TOP, and the strip is `auto` for the same
     reason the rail's column is: its height is its own declaration, and this grid never has to know
     which of the two is in it. */
  .shell[data-shape='bar'],
  .shell[data-shape='menu'] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .bar-slot {
    min-inline-size: 0;
  }

  /* The hairline belongs to the boundary between the nav and the work, and with the nav above the
     work that boundary is the strip's own bottom edge rather than a line down the left of the page. */
  .shell[data-shape='bar'] .body,
  .shell[data-shape='menu'] .body {
    margin-block-start: 0;
    margin-inline-start: var(--sp-2);
  }

  /* One button, at the start of the strip, at the size every other target in the shell is. */
  .menu-open {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    margin: var(--sp-2) var(--sp-3);
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .menu-open:hover {
    background: var(--s2);
  }

  /* THE SAMPLE BAR. A note, not an alarm: nothing is wrong and nothing is urgent, and the day it
     looks like an error is the day it gets dismissed unread. It is the same treatment the register
     screen gives what the record noticed, for the same reason. */
  /* A page-level banner (DESIGN-BRIEF 4.9): a full-width strip at the top of the panel, `s1` and a
     bottom hairline only. Not a floating card, and no accent wash. */
  /* ONE LINE ON A LAPTOP (DESIGN-SYSTEM 4.9, APPENDIX C2). It wrapped to two at 1440, so the bar was
     taller than the page head's own gap on every screen; the sentence now truncates before it wraps. */
  .sample {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--sp-1) var(--sp-5);
    align-items: center;
    justify-content: space-between;
    min-block-size: 40px;
    padding: var(--sp-1) var(--sp-4) var(--sp-1) var(--sp-6);
    background: var(--s1);
    border-block-end: 1px solid var(--line);
  }

  .sample-said {
    flex: 1 1 0;
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sample-away-glyph {
    display: none;
  }

  .sample-said strong {
    color: var(--ink);
    font-weight: 500;
  }

  .sample-acts {
    display: inline-flex;
    gap: var(--sp-1);
    align-items: center;
  }

  /* THE SAME TREATMENT THE REGISTER SCREEN GIVES WHAT THE RECORD NOTICED: a line, not a wash, and no
     intent colour. The day a standing note looks like an error is the day it is dismissed unread,
     and this one stands on every screen for as long as the rows are unwritten. */
  .unsaved {
    margin: var(--sp-4) var(--sp-6) 0;
    padding: var(--sp-2) var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .unsaved-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.55;
  }

  .unsaved-said strong {
    color: var(--ink);
  }

  @media (width < 640px) {
    .unsaved {
      margin: var(--sp-3) var(--sp-4) 0;
      padding: var(--sp-2) var(--sp-3);
    }
  }

  /* `--ctl-h`, WHICH IS 44 ON A COARSE POINTER AND 32 ON A FINE ONE. `05 §6` and `13 §7`: density
     follows the POINTER and never the width. These were `padding` alone and measured 122x38 and
     102x36 on a phone, on every screen in the product at once, which is the only reason the number
     was small enough to notice. `min-block-size` and not `block-size`, because a label that wraps
     grows and 44 is the floor rather than the size. */
  .sample-go,
  .sample-away {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* The page's one primary: ink fill, never a pill. */
  .sample-go {
    background: var(--ink);
    color: var(--bg);
  }

  .sample-go:hover {
    background: var(--primary-hover);
  }

  .sample-away {
    background: none;
    color: var(--ink2);
  }

  .sample-away:hover {
    background: var(--s2);
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .sample-go,
    .sample-away {
      min-block-size: var(--ctl-h);
    }
  }

  /**
   * ON A PHONE IT IS ONE LINE, because at 390 by 844 it was a hundred and ninety pixels.
   *
   * Measured: the sentence wrapped to five lines, the two controls dropped to a sixth, and the
   * card took the top quarter of the first screen of the product. On `/r/obligations` that pushed
   * the heading, the count, the filter bar and the capture field down with it, and the first row
   * of the register began at 700px. The first thing a person saw on their phone was a paragraph
   * explaining that what they could not yet see was made up.
   *
   * THE FIRST SENTENCE IS THE ONE THAT DOES THE WORK. "This is a sample record" is the whole fact;
   * the rest is the reassurance, and reassurance is what a small screen can afford to lose. It is
   * still on the page for a screen reader rather than removed from the markup, because the reader
   * who cannot see the layout is not the one short of room.
   *
   * The comment above this bar says it is "a sentence somebody reads once". A sentence read once
   * that costs a quarter of every screen until it is dismissed is being charged for by the day.
   */
  @media (width < 640px) {
    .sample {
      gap: var(--sp-2) var(--sp-3);
      align-items: center;
      /* 56px AT THE END, THE SAME ROOM `PageHead` LEAVES, because the search button is fixed in that
         corner at this width and sat on top of the bar's sentence. */
      padding: var(--sp-1) 56px var(--sp-1) var(--gutter);
      /* It still WRAPS, because "Start your own" and "Put this away" beside a bold sentence do not
         fit 390px and shrinking either below the 44px floor is the one thing a small screen may
         not trade. Two rows instead of six is the whole of the fix. */
      justify-content: flex-start;
    }

    .sample-said {
      flex: 1 1 auto;
      min-inline-size: 0;
    }

    .sample-why {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .sample-acts {
      flex: 0 0 auto;
      gap: 0;
    }

    /* ONE ROW OF 52, NOT TWO OF 80 (APPENDIX C2). The dismiss keeps its name for a screen reader and
       its 44px target, and draws the close glyph instead of three words the row had no room for. */
    .sample-away {
      justify-content: center;
      min-inline-size: var(--ctl-h);
      padding: 0;
    }

    .sample-away-word {
      display: none;
    }

    .sample-away-glyph {
      display: inline-flex;
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

  .body {
    animation: arrive var(--d-move) var(--ease-out) backwards;
    min-inline-size: 0;
    /* The lifted panel (DESIGN-BRIEF 4.4): `bg` on the sunk canvas, a hairline, `--r-md`, inset from
       the window edges, and no shadow. */
    margin: var(--sp-2) var(--sp-2) var(--sp-2) 0;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Below 900px the launcher floats over the bottom-right corner of every surface, so every
       surface ends above it: a floating button over the last row of a list hides exactly the thing
       a long list is scrolled to the bottom to see. Above 900 the launcher is a row in the rail, and
       the same space is the page's foot. */
    padding-block-end: calc(var(--tap) + var(--sp-5));
  }

  /* Below 900px the rail becomes a tab bar; above it, the tab bar does not exist. */
  .tab-slot {
    display: none;
  }

  /* A QUIET RAISED CIRCLE WITH A MAGNIFIER, AND IT WAS A RED ONE WITH THE LOGO. The red disc was
     argued as "the only saturated colour on the screen", which is exactly what made it read as an
     alert rather than as search. It is a surface a step above the page now, with the soft shadow a
     sheet has, because a thing that floats over the page should look like it does. */
  .launcher {
    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--sp-5));
    inset-inline-end: var(--sp-5);
    z-index: var(--z-hint);
    display: grid;
    place-items: center;
    inline-size: 52px;
    block-size: 52px;
    padding: 0;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    box-shadow: var(--e2);
    color: var(--ink);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .launcher:hover {
    background: var(--s2);
  }

  /* NOT WHERE THERE IS A RAIL. At 900px and up the rail carries the palette at its foot, and the
     disc fixed to this corner sat on top of whatever row was beneath it: four controls on
     `/r/obligations` at 1440 by 900. Below 900 there is no rail and the button stays, in the header. */
  @media (width >= 900px) {
    .launcher[data-shape='rail'] {
      display: none;
    }
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
      margin: 0;
      border: 0;
      border-radius: 0;
      /* IT RESERVED 88px FOR A BAR THAT IS 90 ON AN IPHONE AND 56 ON A PHONE WITH NO HOME
         INDICATOR: two pixels of the last row under the bar on one, and thirty-two pixels of
         nothing on the other. Three files were each doing this sum and two of them got a
         different answer, so the sum is `--tabbar` now and this adds only the breathing room it
         always meant to add. */
      padding-block-end: calc(var(--tabbar) + var(--sp-6));
    }

    .tab-slot {
      display: block;
    }

    /* THE TOP OF A PHONE, WHERE THE HEADER ALREADY KEEPS ROOM FOR IT. `PageHead` reserves 56px of
       trailing padding below 900px and says why in its own comment — "the palette launcher is a fixed
       header button at this width, so the title clears it" — and the launcher was at the bottom, so
       the reservation held empty space at the top while the circle sat on the rows.

       AND ON A PHONE IT COVERED THEM ALWAYS, not just at the end of a scroll. `.body`'s bottom
       padding clears the launcher for the LAST row; a floating circle in the bottom-right corner is
       over whatever is there the rest of the time — it took the final digit off a money figure on
       Home and a row's own id on a register. The tab bar owns the bottom of a phone; the header owns
       the top, and the space was already made. */
    .launcher {
      /* AND ON A PHONE IT MOVED TO THE TOP, WHICH IS WHERE THE NOTCH IS. It sat at y 8 to 48 on a
         device whose first visible pixel is 59. */
      inset-block-start: calc(env(safe-area-inset-top) + var(--sp-2));
      inset-block-end: auto;
      inset-inline-end: calc(max(env(safe-area-inset-left), env(safe-area-inset-right)) + var(--sp-3));
      inline-size: 40px;
      block-size: 40px;
    }

    /* The sample bar is the first thing at the top of a phone, which is where that button floats,
       so it ends before it, as the page head already does. */
    .unsaved {
      margin-inline-end: calc(var(--sp-3) + 40px + var(--sp-2));
    }

    .sample {
      padding-inline-end: calc(var(--sp-3) + 40px + var(--sp-2));
    }
  }

  .more-nav {
    display: flex;
    flex-direction: column;
  }

  .more-nav a {
    min-block-size: var(--tap);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--ink);
    text-decoration: none;
  }

  /* The same headings the rail carries. They are a grouping over one ordered list of pages, so
     dropping them delivered "Overview" and "Board" as bare words. */
  .more-section {
    margin-block: var(--sp-4) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .more-section:first-child {
    margin-block-start: 0;
  }

  .more-view {
    padding-inline-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .more-tally {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .more-nav hr {
    inline-size: 100%;
    border: 0;
    border-block-start: 1px solid var(--line);
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
