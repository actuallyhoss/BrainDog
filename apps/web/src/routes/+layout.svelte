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
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';

  import '../app.css';
  import '$lib/blocks.css';
  import '$lib/ui/rows.css';
  import '$lib/ui/controls.css';

  import * as pref from '$lib/pref.ts';
  import { restore as restoreAccent } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import { GoPrefix, overlays, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import Sidebar from '$lib/ui/Sidebar.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import TabBar from '$lib/ui/TabBar.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Palette from '$lib/palette/Palette.svelte';
  import { palette } from '$lib/palette/open.svelte.ts';
  import { arrange } from '$lib/nav.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Keymap from '$lib/ui/Keymap.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data, children } = $props();

  /* Two surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     and `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6). */
  const bare = $derived(page.url.pathname === '/start' || page.url.pathname.startsWith('/s/'));

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

  let railOff = $state(pref.read().sidebar === false);

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
     polling, dim when a write has actually failed — never from `navigator.onLine`, which reports
     online on a LAN with no internet. And the chip must not cry wolf: one that appears and withdraws
     on every open is a chip nobody believes the day it is true (19 §6). -->
<div class="live" data-state={live} aria-hidden="true"></div>

{#if bare}
  <!-- ITS OWN SCROLL CONTAINER, because `html, body` are `overflow: hidden` — the shell's `.body`
       panel is the one thing that scrolls, and a bare surface has no panel. So a page taller than
       the window simply had two thirds of itself below a fold that could not be crossed: `/s/<token>`
       is 2,628px of projected page in a 993px window, and the only part anybody could read was the
       first third. That is the artefact somebody hands an accountant. -->
  <main id="main" class="bare">{@render children()}</main>
{:else}
  <div class="shell" data-rail={railOff ? 'off' : undefined}>
    <div class="rail-slot">
      <Sidebar
        nav={data.nav}
        pen={data.pen}
        record={data.index.name}
        records={data.me.records}
        registers={data.index.registers}
        open={data.questions.length}
        inbox={data.inbox}
      />
    </div>

    <!-- The way back, and the only chrome that appears when the rail does not. -->
    <div class="rail-back">
      <button type="button" class="tap" onclick={toggleRail} aria-label={copy.showSidebar} title={copy.showSidebar}>
        <Icon name="rows" size="s" />
      </button>
    </div>

    <main id="main" class="body">
      {@render children()}
    </main>
  </div>

  <div class="tab-slot">
    <TabBar open={data.questions.length} inbox={data.inbox} onmore={() => (moreOpen = true)} />
  </div>

  <!--
    The mark, and the only place it appears in the app chrome.

    It used to sit at the top of the rail, where a logo is decoration: it names the product you are
    already inside, and spends the most valuable sixty pixels on the screen doing it. Here it has a
    job. It opens the palette — the one surface that reaches anything in the record — from the
    corner every product has trained people to look in.

    NOT AN ASSISTANT AND NOT A PANEL OF ITS OWN. There was a version of this with a prompt field and
    four suggested questions, and it was wrong twice over: a record you talk to instead of read is
    a different product, and a second overlay that does most of what the palette does is a second
    place to look for one thing. The button opens the palette that already exists.
  -->
  <button type="button" class="launcher tap" onclick={() => (palette.open = true)} aria-label={copy.paletteLabel}>
    <Mark height={26} tone="inherit" />
  </button>

  <Palette bind:open={palette.open} nav={data.nav} />
{/if}

<Sheet bind:open={keymapOpen} title={copy.keymap} subtitle={copy.keymapHint}>
  <Keymap />
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

    <h2 class="more-section">{copy.lists}</h2>
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
    min-block-size: var(--ctl-h);
    inset-block-start: var(--sp-2);
    inset-inline-start: var(--sp-2);
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
    inset-block-start: 0;
    inset-inline: 0;
    z-index: var(--z-hint);
    block-size: 2px;
    background: var(--line);
  }

  .live[data-state='polling'] {
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, var(--line) 8px 16px);
  }

  .live[data-state='offline'] {
    background: var(--danger);
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

  .body {
    min-inline-size: 0;
    background: var(--bg);
    border-inline-start: 1px solid var(--line);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* The launcher floats over the bottom-right corner of every surface, so every surface ends
       above it. A floating button that covers the last row of a list hides exactly the thing a long
       list is scrolled to the bottom to see. */
    padding-block-end: calc(var(--tap) + var(--sp-5));
  }

  /* Below 900px the rail becomes a tab bar; above it, the tab bar does not exist. */
  .tab-slot {
    display: none;
  }

  /* A RED CIRCLE. The mark reversed out of its own colour, 52px, bottom-right, and nothing else in
     it: no label, no count, no chevron. It is the product's own drawing, so the drawing is the
     whole affordance, and a word beside it would be explaining a logo.

     NO SHADOW. It had one, on the argument that a floating thing which casts nothing reads as
     stuck to the glass. That argument is fine in the abstract and wrong in this app: nothing else
     here casts a shadow, so the one that did read as a control borrowed from a different product
     rather than as the one thing allowed to float. A solid disc of the only saturated colour on
     the screen already sits above everything; it does not need help.

     It lifts on hover instead. Motion says "this is a control" without adding a material the rest
     of the interface does not have. */
  .launcher {
    position: fixed;
    inset-block-end: var(--sp-5);
    inset-inline-end: var(--sp-5);
    z-index: var(--z-hint);
    display: grid;
    place-items: center;
    inline-size: 52px;
    block-size: 52px;
    padding: 0;
    background: var(--brand);
    border: 0;
    border-radius: 999px;
    color: var(--accent-ink);
    cursor: pointer;
    transition:
      transform var(--d-state) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  .launcher:hover {
    transform: translateY(-2px);
  }

  .launcher:active {
    transition-duration: var(--d-press);
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .launcher,
    .launcher:hover,
    .launcher:active {
      transform: none;
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
      padding-block-end: calc(56px + var(--sp-6));
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
      inset-block-start: var(--sp-2);
      inset-block-end: auto;
      inset-inline-end: var(--sp-3);
      inline-size: 40px;
      block-size: 40px;
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
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
