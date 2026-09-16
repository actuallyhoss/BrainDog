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
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* THE PALETTE AND THE `?` SHEET'S BODY ARRIVE AFTER THE SHELL. Both are closed on every first
     paint, and the palette reads the whole sample record to rank what it lists, so importing them
     here put all of that in front of the first screen and in the entry's preload list. They are
     asked for as the shell mounts: a `⌘K` pressed before the palette lands sets `palette.open`,
     and the palette opens on that when it does. */
  /* Named as types, which the compiler erases: the layout still reaches both, as `dead-copy` reads it. */
  import type PaletteView from '$lib/palette/Palette.svelte';
  import type KeymapView from '$lib/ui/Keymap.svelte';
  import { palette } from '$lib/palette/open.svelte.ts';
  import { arrange } from '$lib/nav.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
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
  const bare = $derived(
    page.url.pathname === '/start' || page.url.pathname === '/signin' || page.url.pathname === '/invite' || page.url.pathname.startsWith('/s/'),
  );

  /* THE SHELL'S, AND A PAGE'S. It was local, so a page could not open the palette — which is why
     `/[id]`'s `Search` button navigated Home instead of searching. */
  let keymapOpen = $state(false);
  let moreOpen = $state(false);

  /** The same sectioned grouping AND THE SAME ORDER the rail draws — one nav, not two shapes. It
      was `group(data.nav)`, so the phone's More sheet ignored an arrangement the rail honoured. */
  const grouped = $derived(arrange(data.nav, pref.read().nav ?? []));

  /* `g 1`–`9` COUNT WHAT IS ON SCREEN. This indexed the raw list, so after a reorder the digit
     printed beside a rail row and the row the digit opened were different pages. */
  const numbered = $derived(grouped.flatMap(([, entries]) => entries));
  /* REMEMBERED, because a rail somebody folded is a rail they want folded on the next page too —
     and `app.html` has always read this cookie before first paint, so a remembered fold costs no
     flash. Nothing wrote it until now. */
  /* THE RECORD'S COLOUR, PUT BACK. `app.html` stamps `data-theme` before first paint so there is
     no flash of the wrong palette; this is what puts the custom properties behind that attribute. */
  $effect(() => {
    restoreAccent();
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

  let railOff = $state(pref.read().sidebar === false);

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

  let sampleSaid = $state(pref.read().sampleSaid === true);

  function putSampleAway() {
    sampleSaid = true;
    pref.write({ sampleSaid: true });
  }

  /* One function, because the chord and the restore control are the same act and a second copy of
     two lines is a second place for the preference to be written differently. */
  function toggleRail() {
    railOff = !railOff;
    pref.write({ sidebar: !railOff });
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

    // `overlaid() > 0` silences every hotkey except close. The counter, not a boolean, so two
    // overlays closing in the wrong order do not unlock early.
    if (overlays.depth > 0 && !mod) return;

    // Never while typing. One test, in the registry, and no screen implements its own.
    if (typing() && !mod) return;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.open = true;
      return;
    }

    /* `⌘\` — the rail folds to nothing and the work takes the width. Not a narrow icon rail:
       19 §3's whole argument is that this nav is a QUERY over `page` rows whose length varies per
       customer, and a strip of unlabelled icons is where a variable-length sectioned list goes to
       become unreadable. Hidden, with `g` and the palette still reaching everything. */
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
        goto(target);
      } else if (digit >= 1 && digit <= 9 && numbered[digit - 1]) {
        e.preventDefault();
        goto(numbered[digit - 1]!.href);
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
  <div class="shell" data-rail={railOff ? 'off' : undefined}>
    <div class="rail-slot">
      <Sidebar
        nav={data.nav}
        pen={data.pen}
        record={data.index.name}
        records={data.me.records}
        live={data.live}
        registers={data.index.registers}
        open={data.open}
        inbox={data.inbox}
      />
    </div>

    <!-- The way back, and the only chrome that appears when the rail does not. -->
    <div class="rail-back">
      <button type="button" class="tap" onclick={toggleRail} aria-label={copy.showSidebar} title={copy.showSidebar}>
        <Icon name="rows" size="s" />
      </button>
    </div>

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
            <a class="sample-go" href="/start">{copy.sampleStart}</a>
            <button type="button" class="sample-away" onclick={putSampleAway}>{copy.samplePutAway}</button>
          </span>
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
  <button type="button" class="launcher tap" onclick={() => (palette.open = true)} aria-label={copy.paletteLabel}>
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
      {#each entries as entry}<a href={entry.href} onclick={() => (moreOpen = false)}>{entry.title}</a>{/each}
    {/each}

    <!-- AND THE HEADING GOES WITH THEM. `index.registers` holds only the lists that have something
         in them, so on a young record this section is a title over nothing. -->
    {#if data.index.registers.length > 0}
      <h2 class="more-section">{copy.lists}</h2>
    {/if}
    {#each data.index.registers as r}
      <a href="/r/{r.id}" onclick={() => (moreOpen = false)}>
        {r.name}<span class="more-tally num">{r.count}</span>
      </a>
      <!-- And its saved views, which are the same list with a predicate. -->
      {#each r.views ?? [] as v}
        <a class="more-view" href="/v/{v.key}" onclick={() => (moreOpen = false)}>{v.name}</a>
      {/each}
    {/each}

    <hr />
    <a href="/packs" onclick={() => (moreOpen = false)}>{copy.packs}</a>
    <a href="/vault" onclick={() => (moreOpen = false)}>{copy.vault}</a>
    <a href="/settings/appearance" onclick={() => (moreOpen = false)}>{copy.settings}</a>
    <a href="/audit" onclick={() => (moreOpen = false)}>{copy.audit}</a>
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

  /* Rail on the darker ground, work on the lighter one, one hairline between them, and no inset
     panel: nothing floats, so nothing needs a shadow to explain why it floats. The work area is the
     ONE scroll container, so the rail never moves and the window shows exactly one scrollbar. */
  .shell {
    display: grid;
    /* `--rail-back` is 0 while the rail is here and the width of one control while it is not, so the
       two states are one declaration rather than two grids that can disagree. */
    --rail-back: 0px;
    grid-template-columns: auto minmax(0, 1fr);
    block-size: 100dvh;
    overflow: hidden;
  }

  @media (width >= 900px) {
    .shell[data-rail='off'] {
      --rail-back: 40px;
    }
  }

  /**
   * HIDING THE RAIL LEFT THE COLUMN IT LIVED IN.
   *
   * `display: none` takes the rail out of flow, and `.body` — now the first in-flow grid item —
   * lands in the `auto` track, which sizes to its own content. Measured at a 1,536px window:
   * `grid-template-columns: 692.75px 843.25px`. The whole app rendered in 45% of the window with a
   * dead strip of ground beside it, on the one gesture whose entire purpose is to give the work the
   * width.
   *
   * One column when there is one column.
   */
  /* AND SCOPED TO THE WIDTH THE RAIL EXISTS AT, because the first version of this fix reproduced
     the bug it fixed, one breakpoint down. `.shell[data-rail='off']` is (0,2,0) and the phone rule
     below is (0,1,0), so an unscoped declaration here outranked it — while `--rail-back` was scoped
     to `>= 900px` and stayed `0px`. Below 900 the grid became `0px 1fr` and `.body`, the only
     in-flow item, auto-placed into the ZERO track: measured 0px wide at both 899 and 390, on a
     preference that persists in a cookie. A register rendered thirty-eight cards into nothing. */
  @media (width >= 900px) {
    .shell[data-rail='off'] {
      grid-template-columns: var(--rail-back) minmax(0, 1fr);
    }
  }

  .shell[data-rail='off'] .rail-slot {
    display: none;
  }

  /**
   * AND ONE WAY BACK, because `⌘\` is reachable by accident and the state is a cookie.
   *
   * With the rail gone, a sweep of every visible control on `/vault` returned six: the six *Reveal
   * once* buttons. No nav, no menu, no mark, nothing to restore it — and `pref` had already written
   * `sidebar: false`, so reloading does not clear it. A person who hits the chord by accident is
   * stranded unless they happen to know `⌘\`, `?` or `⌘K`.
   *
   * NOT THE ICON RAIL THE CHORD'S OWN COMMENT REJECTS. `19 §3`'s argument is about the NAV — a query
   * over `page` rows whose length varies per customer, which a strip of unlabelled glyphs makes
   * unreadable. This is not the nav. It is one control, in the gutter the nav used to start in, that
   * does exactly one thing and says so; the same shape as the launcher in the opposite corner.
   *
   * It is 40px wide and only above 900px: below that the rail is already gone and the tab bar is the
   * nav, so a restore control would be offering to bring back something that was never taken.
   */
  .rail-back {
    display: none;
  }

  @media (width >= 900px) {
    .shell[data-rail='off'] .rail-back {
      display: flex;
      align-items: start;
      justify-content: center;
      padding-block-start: var(--sp-3);
      background: var(--s1);
      border-inline-end: 1px solid var(--line);
    }
  }

  .rail-back button {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .rail-back button:hover {
    background: var(--s2);
    color: var(--ink);
  }

  /* THE SAMPLE BAR. A note, not an alarm: nothing is wrong and nothing is urgent, and the day it
     looks like an error is the day it gets dismissed unread. It is the same treatment the register
     screen gives what the record noticed, for the same reason. */
  .sample {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-5);
    align-items: center;
    justify-content: space-between;
    margin: var(--sp-4) var(--sp-6) 0;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
    background: var(--accent-wash);
    border-radius: var(--r-lg);
  }

  .sample-said {
    flex: 1 1 32ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.55;
  }

  .sample-said strong {
    color: var(--ink);
  }

  .sample-acts {
    display: inline-flex;
    gap: var(--sp-3);
    align-items: center;
  }

  /* `--ctl-h`, WHICH IS 44 ON A COARSE POINTER AND 32 ON A FINE ONE. `05 §6` and `13 §7`: density
     follows the POINTER and never the width. These were `padding` alone and measured 122x38 and
     102x36 on a phone, on every screen in the product at once, which is the only reason the number
     was small enough to notice. `min-block-size` and not `block-size`, because a label that wraps
     grows and 44 is the floor rather than the size. */
  .sample-go {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-4);
    background: var(--accent);
    border: 1px solid var(--accent-edge);
    border-radius: var(--r-pill);
    color: var(--accent-ink);
    font-size: var(--t-sm);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .sample-away {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: none;
    border: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    cursor: pointer;
    white-space: nowrap;
  }

  .sample-away:hover {
    color: var(--ink);
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
      margin: var(--sp-3) var(--sp-4) 0;
      padding: var(--sp-2) var(--sp-3);
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

    .sample-go {
      padding: var(--sp-2) var(--sp-3);
    }

    .sample-away {
      padding: var(--sp-2);
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
    background: var(--bg);
    border-inline-start: 1px solid var(--line);
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
    background: var(--s3);
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
    .launcher {
      display: none;
    }
  }


  @media (width < 900px) {
    .rail-slot {
      display: none;
    }

    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .body {
      border: 0;
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
    .sample {
      margin-inline-end: calc(var(--sp-3) + 40px + var(--sp-2));
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
