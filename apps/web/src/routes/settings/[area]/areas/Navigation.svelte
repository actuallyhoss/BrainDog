<!--
  Settings > Navigation: the shape of the navigation, the pages hidden from it, and the pages
  waiting to be placed in it.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { apiBase } from '$lib/at.ts';
  import * as pref from '$lib/pref.ts';
  import { copy } from '$lib/copy.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { dismiss as dismissNavRec, dismissedFor, signatureOf } from '$lib/design/dismissed.ts';
  import { navShapeSignals, recommendNavShape, type NavShape, type NavShapeRecommendation } from '$lib/design/nav-shape.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  /* THE DECLARATION CACHE, WHICH ONLY THE RECORD FILLS (`held.ts`). */
  import { REGISTERS } from '$lib/record/held.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE PAGES THIS PERSON HID FROM THEIR NAV, by the name the rail gave them, and the way back. */
  const hiddenPages = $derived(navPrefs.hidden.map((href) => ({ href, title: shell.nav.find((e) => e.href === href)?.title ?? href })));
  function showAgain(p: { href: string; title: string }) {
    void navPrefs.show(p.href).then((saved) => {
      if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
      else toasts.push(copy.shownInNav(p.title), { undo: () => void navPrefs.hide(p.href) });
    });
  }

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  /* ON UNLESS SOMEBODY SAID OTHERWISE. No document states the default; `29 §3`'s triggers are
     described as firing, so on is the only reading consistent with the section. */
  let suggestPages = $state(held.suggestPages ?? true);
  /* THE RAIL UNLESS SOMEBODY SAID OTHERWISE. `19 §3` keeps the sidebar as the default in bold, and
     the other two shapes are offered rather than defaulted. */
  let navShape = $state<'rail' | 'bar' | 'menu'>(held.navShape ?? 'rail');

  /**
   * THE DESIGN AGENT'S OWN RECOMMENDATION, read from the record rather than typed here.
   *
   * `19 §3`: it reads how many declared pages and lists are placed, how many sections they fall
   * into, whether the nav has been arranged by hand, and answers with one shape and one sentence of
   * why. `navShape` above is what it is compared against, not `held.navShape`, so picking the
   * recommended shape by hand in the segmented control makes the recommendation disappear on its
   * own rather than nagging about a choice just made.
   */
  const navRec = $derived(
    recommendNavShape(
      navShapeSignals(
        shell.nav,
        shell.index.registers.length,
        { nav: held.nav, navShape },
        typeof window === 'undefined' ? undefined : window.innerWidth,
      ),
    ),
  );
  /* DISMISS IS TERMINAL, `19 §3`'s own word. `dismissed.ts` explains why that lives in
     `localStorage` keyed by the record rather than in `Pref`: there is no table to hold it and no
     `setPref` yet, the same deviation `navShape` itself already carries. */
  let navRecDismissed = $state<string | null>(null);
  $effect(() => {
    navRecDismissed = dismissedFor(shell.index.slug);
  });
  const navRecShown = $derived(navRec !== null && signatureOf(navRec) !== navRecDismissed);

  const navShapeLabel = (s: NavShape): string => (s === 'rail' ? copy.navShapeRail : s === 'bar' ? copy.navShapeBar : copy.navShapeMenu);

  /** Accepting is the one click `19 §3` allows: it sets the shape, exactly as picking it by hand would. */
  function acceptNavRec(rec: NavShapeRecommendation) {
    navShape = rec.shape;
  }

  function dismissNavRecommendation(rec: NavShapeRecommendation) {
    const sig = signatureOf(rec);
    dismissNavRec(shell.index.slug, sig);
    navRecDismissed = sig;
  }

  /* PLACED IN THIS VISIT. The pen is derived from the declarations this screen was drawn with, so a page just written
     into the nav would sit here until the next full read without somewhere to remember it. */
  let placedHere = $state(new Set<string>());
  let placing = $state<string | null>(null);

  /* THE RECORD'S PEN, AS THE SHELL CARRIES IT. It was every page the sample declares with `placed: false`, resolved against
     the sample's rows, so Settings offered to place the sample's pages into a record's rail. `boot` sends no pen yet, so a
     live shell's is empty (`layoutOf`). */
  const pen = $derived(shell.pen.filter((p) => p.placed === false && !placedHere.has(p.page)));

  /* AND *SUGGEST NEW PAGES* IS REMEMBERED, which is the other switch on this surface and would
     otherwise be the third control in this product to move a tick, write nothing, and come back on. */
  /* AND THE SHAPE OF THE NAVIGATION, which the shell picks up from the write itself rather than on
     the next reload: it is the one preference on this screen that changes the thing this screen is
     drawn inside. */
  $effect(() => {
    pref.write({ suggestPages, navShape });
  });

  /**
   * Put a suggested page in the rail, by writing it.
   *
   * 29 §2's three tiers are derived, proposed and placed, and *"Movement is forward-only and needs a user action."*
   * This is that action. Two rules from §4 govern what it writes: the page appends AT THE END OF ITS SECTION rather
   * than being inserted mid-list (Microsoft's Personalized Menus put items at a different distance down the menu
   * each time, and Jensen Harris announced the reversal in 2006 with that as the first reason), and nothing is ever
   * placed without a person asking, because the system never writes nav order after first install (06 §3).
   *
   * THE SECTION IS THE ONE THE PAGE DECLARES, and a derived page declares none, so it takes the name of the list it
   * was built from, which is the heading Slash files its own drafted pages under and the words this row already says.
   *
   * IT ONCE SAID SO IN THE COMPLETED PAST TENSE AND WROTE NOTHING. The row vanished from the pen because this
   * filtered a local array; the rail reads `boot()`, which filters on the declaration's own `placed` and `nav`,
   * neither of which this could touch, so the page was back in the pen on reload and had never once been in the
   * nav. The write is a whole declaration set at the version the page was read at, so a page somebody else placed
   * first is a conflict and the rail is read again rather than written over.
   */
  async function promote(decl: PageDecl) {
    if (placing !== null) return;
    const built = REGISTERS[String(decl.requires[0] ?? '').replace('register.', '')]?.name;
    const section = decl.nav?.section ?? built ?? decl.title;
    /* THE STEP IS TEN, as the seeded pages are spaced, so there is room to move a page between two without renumbering. */
    const nav = { section, order: shell.nav.reduce((n, e) => (e.section === section ? Math.max(n, e.order) : n), 0) + 10 };

    /* A HOST WITH NO RECORD BEHIND IT IS ASKED LIKE ANY OTHER, and its refusal is the toast below. It had an arm of
       its own that answered with the sample's "nothing was saved yet" and asked nothing (DIRECTION 26). */
    placing = decl.page;
    const at = opened();
    const [write, read] = await Promise.all([import('$lib/record/page-write.ts'), import('$lib/record/pages-live.ts')]);
    const got = await read.pagesReader(apiBase()).readOne(decl.page);
    if (got.from !== 'live') {
      placing = null;
      closed(true, at);
      /* A template is one declaration drawn once per row, and setting the expansion back would delete the other rows' pages. */
      toasts.push(got.from === 'refused' ? got.fix : got.from === 'expanded' ? got.expanded.why : copy.recordNotReached, { intent: 'warn' });
      return;
    }
    const out = await write.setBody(apiBase(), { ...got.page.body, placed: true, nav }, undefined, got.page.version);
    placing = null;
    closed(true, at);
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    placedHere = new Set(placedHere).add(decl.page);
    toasts.push(copy.promoted(decl.title));
    /* The rail draws what `boot` says, so it reads again and the page is in it before the toast has gone. */
    await invalidateAll();
  }
</script>

<!--
  THE SWITCH THIS AREA WAS ADDED TO HOLD, and the area shipped without it.

  `19 §2`: *"`navigation` was missing too: it holds the *Suggest new pages* switch that `29 §4`
  places there."* `29 §4` gives its shape exactly, *"one global switch, the same shape as
  `Character keys: off`"*, so it is the same control, not a new one.

  WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. `29 §2`: movement is forward-only and needs
  a user action, and *"the system never writes nav order after first install"*. So off empties
  the holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
  Saying that is the whole difference between a switch somebody turns off once and a switch
  somebody is afraid of.
-->
<!--
  WHERE THE NAVIGATION LIVES, which is this area's own subject and was not on it.

  `19 §3` carries five shapes and three conditions. Two of the five are not choices: the tab
  bar is what a narrow screen gets whatever is picked here, and the collapsed rail is a width
  rather than a shape, set by `⌘\` and by the control at the head of the rail because a wide
  monitor and a laptop honestly want different answers. The three that are choices are here.

  AND THE PHONE SENTENCE IS NOT A DISCLAIMER. A reader who picks a top bar and then opens the
  same record on a phone should have been told what they will find, rather than discovering
  that the setting they chose is one this product quietly overrules.
-->
<Section title={copy.navShape}>
  <!-- ON A PHONE THE SHAPE IS ONE SENTENCE (DSN-13). A phone always draws the tab bar, so a picker
       there offers a choice the phone would not draw; `wide-only` (`settings.css`) leaves the picker,
       its explanation and where the choice is kept to the screens that use them. -->
  <div class="wide-only">
    <p class="hint">{copy.navShapeHint}</p>
    <div class="segmented" role="group" aria-label={copy.navShape}>
      {#each [['rail', copy.navShapeRail, 'rows'], ['bar', copy.navShapeBar, 'grid'], ['menu', copy.navShapeMenu, 'more']] as const as [v, label, icon]}
        <button type="button" class="segment" aria-pressed={navShape === v} data-on={navShape === v ? '' : undefined} onclick={() => (navShape = v)}>
          <Icon name={icon} size="s" />
          {label}
        </button>
      {/each}
    </div>
  </div>
  <p class="hint">{copy.navShapeOnPhone}</p>
  <p class="hint wide-only">{copy.perDevice}</p>
</Section>

{#if navRecShown && navRec}
  <!--
    THE DESIGN AGENT'S RECOMMENDATION, drawn the same way this area already draws a proposed
    page below: one row in a `.ledger`, a plain sentence, and a button that acts rather than a
    switch that silently rearranges anything (`19 §3`).

    NEVER APPLIED. `acceptNavRec` only sets the value the segmented control above already
    writes through; there is no second path into `navShape`, so the recommendation can never
    take effect without this click.

    NOT ON A PHONE, where the picker it would switch is not drawn either.
  -->
  <div class="wide-only">
  <Section title={copy.navShapeRecommend}>
    <ul class="ledger ledger-glyph">
      <li>
        <div class="line">
          <span class="seq"><Icon name="learning" size="s" /></span>
          <span class="line-main">
            <span class="line-title">{navShapeLabel(navRec.shape)}</span>
            <span class="line-detail">{navRec.reason}</span>
          </span>
          <span class="line-amount"></span>
          <span class="line-when">
            <Button weight="quiet" onclick={() => acceptNavRec(navRec)}>{copy.navShapeRecommendAccept(navShapeLabel(navRec.shape))}</Button>
            <Button weight="bare" onclick={() => dismissNavRecommendation(navRec)}>{copy.navShapeRecommendDismiss}</Button>
          </span>
        </div>
      </li>
    </ul>
  </Section>
  </div>
{/if}

<!-- THE WAY BACK FOR A HIDDEN PAGE, which the rail's "pages hidden" row opens at. -->
<div id="hidden">
  <Section title={copy.hiddenPages} count={hiddenPages.length}>
    <p class="hint">{copy.hiddenPagesHint}</p>
    {#if hiddenPages.length === 0}
      <Empty kind="cleared" title={copy.hiddenNone} body={copy.hiddenNoneWhy} />
    {:else}
      <ul class="ledger ledger-glyph">
        {#each hiddenPages as p (p.href)}
          <li>
            <div class="line">
              <span class="seq"><Icon name="doc" size="s" /></span>
              <span class="line-main"><span class="line-title">{p.title}</span></span>
              <span class="line-amount"></span>
              <span class="line-when"><Button weight="quiet" onclick={() => showAgain(p)}>{copy.showAgain}</Button></span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="hint">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>
  </Section>
</div>

<Section title={copy.suggestPages}>
  <div class="setting-row">
    <p class="hint">{copy.suggestPagesHint}</p>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={suggestPages}
      aria-label={copy.suggestPages}
      onclick={() => (suggestPages = !suggestPages)}><span class="switch-track"></span></button
    >
  </div>
  <!-- `19 §3` and `29 §4` both say this belongs to the record and not to the device, and there
       is no table in `30 §1` that could hold it: `50 §10` owns the deviation. The screen says
       which it is rather than letting somebody assume the durable one. -->
  <p class="hint">{copy.perDevice}</p>
</Section>

<Section title={copy.suggested} count={suggestPages ? pen.length : 0}>
  {#if !suggestPages}
    <!-- NOT `no-data-yet`, WHICH WOULD BE A LIE ABOUT THE RECORD. `19 §6` separates the five
         empty states precisely so that "nothing has happened yet" and "you turned this off"
         cannot read the same. -->
    <Empty kind="cleared" title={copy.suggestOff} body={copy.suggestOffWhy} />
  {:else if pen.length === 0}
    <Empty kind="cleared" title="Nothing waiting" />
  {:else}
    <ul class="ledger ledger-glyph">
      {#each pen as p}
        <li>
          <div class="line">
            <span class="seq"><Icon name="doc" size="s" /></span>
            <span class="line-main">
              <span class="line-title">{p.title}</span>
              <!-- `register.people` is the requirement's own qualified id. What a reader
                   wants is which of their lists it was built from. -->
              <span class="line-detail">
                {copy.holdingPen} Built from your {REGISTERS[String(p.requires[0] ?? '').replace('register.', '')]?.name ?? 'rows'}.
              </span>
            </span>
            <span class="line-amount"></span>
            <span class="line-when">
              <Button weight="quiet" disabled={placing !== null} onclick={() => promote(p)}>Place in nav</Button>
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Section>

<style>
  /* THE SENTENCE AND ITS SWITCH (`.setting-row`) ARE LAID OUT BY `settings.css`, which every area shares. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* THE SHARED PILLS FROM `controls.css`, with two things this screen needs on top: the track hugs
     its options, and a segment is 44 on BOTH axes under a thumb (the reason is written beside the
     same rule in `Appearance.svelte`). */
  .segmented {
    margin-block-end: var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: var(--ctl-h);
  }
</style>
