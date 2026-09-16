<!--
  The sidebar, and the spine/body split.

  A LEFT SIDEBAR, not a top nav and not palette-first, and both refusals are structural.

  A top nav cannot hold a variable-length, sectioned, reorderable list — and this nav is a query over
  `page` rows. A freelancer has four entries; a studio with five packs has eighteen across six
  sections. The moment a horizontal strip needs a "More" dropdown, the thing that varies per customer
  is the thing that is hidden.

  Palette-first is a documented failure, not a style: it inverts recognition over recall, and the
  same heuristic set says the quiet part out loud — shortcuts are hidden from novice users. A palette
  is an accelerator OVER visible navigation, never a substitute (19 §3).

  Three rules stop an ecosystem rearranging it: the spine is not extensible; a pack declares content
  and identity, never position or visibility; and position lives in a per-user store and wins.

  NO CHORD HINTS IN THE ROWS. `g h`, `g d` and `g 1`–`g 9` all still work — they are in the keymap,
  which is what `?` is for. Printing them beside the labels put a second column of grey monospace
  down the whole rail, fading in and out as the pointer crossed it, so the rail flickered every time
  you moved the mouse past it. A shortcut is worth advertising in the one place somebody goes
  looking for shortcuts, not in the eleven places they are trying to read a name.

  EVERY ROW WEARS A GLYPH, and it is declared rather than guessed. The first build gave icons to the
  spine and the footer and left the middle — the declared pages and the registers, which is most of
  the rail and all of the part that varies — as bare words. A list where the top three and the
  bottom four are icon rows and the eight between them are not does not read as two kinds of thing.
  It reads as unfinished. So `icon` is a field on the declaration, resolved against the shipped set,
  and a register with nothing declared gets the glyph for "a register" rather than a hole.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { arrange } from '../nav.ts';
  import * as pref from '../pref.ts';
  import type { NavEntry } from '../record/api.ts';
  import type { PageDecl, RegisterDecl } from '../record/schema.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import RowMenu from './RowMenu.svelte';
  import Kbd from './Kbd.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    nav,
    pen,
    record,
    records = [],
    live = false,
    registers,
    open = 0,
    inbox = 0,
    icons = false,
    ontoggle,
  }: {
    nav: NavEntry[];
    pen: PageDecl[];
    record: string;
    records?: { slug: string; name: string; level: string }[];
    /** Whether the rail was drawn from a record rather than from the built-in sample. */
    live?: boolean | undefined;
    registers: { id: string; name: string; count: number; icon: IconName; views?: { key: string; name: string }[] }[];
    open?: number | undefined;
    inbox?: number | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /**
   * ── THE NAME OF THE THING UNDER THE POINTER ────────────────────────────────
   *
   * A glyph on its own is a guess, so the narrow rail owes a reader the name back the moment they
   * ask for it — and asking is hovering OR reaching it with the keyboard, which is why this is not
   * a `:hover` rule and not `title`. `title` never fires for a keyboard, and a CSS flyout is
   * clipped by `.scroll`, which has to keep `overflow-y: auto` because the nav is longer than the
   * window on any real record.
   *
   * THE NAME IS STILL IN THE DOM EITHER WAY. `.item-name` is hidden the way a screen reader can
   * still read it, so nothing here is the accessible name of anything: this is a second copy for
   * the eye, `aria-hidden`, and the row keeps the name it always had.
   *
   * ONE ELEMENT, DELEGATED, because the alternative is a flyout per row and this rail draws
   * thirty. Only the vertical coordinate needs measuring; the horizontal edge is the rail's own
   * width, which CSS already knows.
   */
  let fly = $state<{ label: string; y: number } | null>(null);

  const flyAt = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.('[data-label]');
    /* THE UTILITY STRIP ASKS FOR THIS AT BOTH WIDTHS, because four glyphs in a row at the foot are
       icon-only even when the rail is open. Everything else says its own name until it stops. */
    if (!el || !(icons || el.classList.contains('util'))) return (fly = null);
    const box = el.getBoundingClientRect();
    fly = { label: el.getAttribute('data-label') ?? '', y: Math.round(box.top + box.height / 2) };
  };

  /**
   * ── REORDER WITHOUT A MOUSE ────────────────────────────────────────────────
   *
   * WCAG 2.2 SC 2.5.7, and 19 §3 spells out the answer: pointer drag, `⌥↑`/`⌥↓` to move the focused
   * item, and Move up / Move down / Move to top / Hide in a context menu reachable by `⇧F10` or the
   * context-menu key. The `?` sheet has advertised the whole scope since the registry was written
   * and none of it was bound to anything — a cheat sheet is only a cheat sheet if it is true.
   *
   * The arrangement is a LIST OF HREFS, and position is stored independently of visibility because
   * 19 §3 asks for that by name: hiding an item and showing it again returns it to its stored place,
   * never to the end. Empty means "as declared", so a record that has never been rearranged carries
   * no arrangement at all rather than a copy of its own defaults.
   */
  let arrangement = $state<string[]>(pref.read().nav ?? []);

  /**
   * Keep the order, because this header claims it is kept.
   *
   * *"Position lives in a per-user store and wins"* is two lines above, and there was no store:
   * Move up reordered the rail on screen and a reload put it back, silently — while `Hide`, one item
   * below it in the same menu, was honest about writing nothing. A control that visibly works and
   * quietly does not is the worst of the three states a control can be in.
   *
   * IT IS A LIST OF ADDRESSES rather than of ids, because an address is what the rail already keys
   * on and what survives a pack renaming a page. An entry the list does not name keeps its declared
   * order, so a new page appears where the record put it rather than at the end.
   */
  const remember = (next: string[]) => {
    arrangement = next;
    pref.write({ nav: next });
  };

  const sections = $derived(arrange(nav, arrangement));

  /* THE FLAT LIST IN RENDER ORDER, and it is derived FROM what renders rather than beside it. The
     two were computed separately and disagreed, which is how a move came to be calculated against a
     list nobody could see. One of them has to be the other's source. */
  const ordered = $derived(sections.flatMap(([, entries]) => entries));

  /**
   * Move one item, one place, WITHIN ITS SECTION.
   *
   * The neighbour is the next entry that shares the section rather than the next entry in the list:
   * sections are a grouping over one ordered list, so two of them can interleave, and swapping with
   * a positional neighbour would move an item into a heading it does not belong under.
   */
  function move(href: string, delta: number) {
    const list = ordered;
    const from = list.findIndex((e) => e.href === href);
    const me = list[from];
    if (!me) return;
    let to = from + delta;
    while (to >= 0 && to < list.length && list[to]!.section !== me.section) to += delta;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    next[from] = next[to]!;
    next[to] = me;
    remember(next.map((e) => e.href));
    focusItem(href);
  }

  /** To the top OF ITS SECTION, which is the only top an item in a sectioned list has. */
  function toTop(href: string) {
    const list = ordered;
    const me = list.find((e) => e.href === href);
    if (!me) return;
    const rest = list.filter((e) => e.href !== href);
    const at = rest.findIndex((e) => e.section === me.section);
    rest.splice(at === -1 ? rest.length : at, 0, me);
    remember(rest.map((e) => e.href));
    focusItem(href);
  }

  /* The keyboard moved the item; focus has to move with it or the next press acts on whatever row
     slid into the place under the caret. */
  function focusItem(href: string) {
    queueMicrotask(() => rail?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(href)}"]`)?.focus());
  }

  let rail = $state<HTMLElement>();
  let menuAt = $state<{ x: number; y: number; height: number } | null>(null);
  let menuFor = $state<NavEntry | null>(null);

  function openMenu(entry: NavEntry, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    menuAt = { x: r.left, y: r.top, height: r.height };
    menuFor = entry;
  }

  function onItemKey(e: KeyboardEvent, entry: NavEntry) {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(entry.href, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      openMenu(entry, e.currentTarget as HTMLElement);
    }
  }

  const here = (href: string) => page.url.pathname === href;
  const under = (href: string) => page.url.pathname.startsWith(href);
  /**
   * WHICH SECTIONS THIS PERSON HAS PUT AWAY.
   *
   * THIRTY-FOUR ITEMS OF NAVIGATION, UNCHANGING, ON EVERY SCREEN. A friction pass counted them:
   * twenty-seven links plus the record switcher under seven headings, in a nested scroller whose
   * content is 916px inside 574px of space. The consequence was in every screenshot that pass took:
   * one item sliced horizontally in half by the scroller boundary, permanently, at the default
   * window size. It is tenth of the ten things it found costing a person the most, and it is the
   * only one of the ten that is on screen the entire time.
   *
   * A SECTION AND NOT AN ITEM, because a rail is already the reader's to reorder and to hide from
   * (`19 §3`), one row at a time, and nobody hides twenty rows one at a time. A person who does not
   * run projects wants the whole Projects heading gone, and wants it gone on every screen, and
   * wants it back the day they do.
   *
   * IT IS NOT THE SAME MECHANISM AS `Hide`. Hiding takes a page out of the rail and into a holding
   * pen; this folds a heading somebody still wants. The difference is whether the thing comes back
   * on its own: a folded section opens the moment the reader is looking at something inside it, and
   * a hidden page never returns until they say so.
   *
   * PER DEVICE, like every other key in `pref.ts`, and `19 §3` says it should not be: nav order,
   * hidden pages, pins and dismissals must survive a change of device. `50 §10` owns that deviation
   * and names the migration; this is one more key on the wrong side of it and the screen does not
   * claim otherwise.
   */
  let shut = $state(new Set(pref.read().railShut ?? []));

  function fold(section: string) {
    const next = new Set(shut);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    shut = next;
    pref.write({ railShut: [...next] });
  }

  /**
   * A SECTION HOLDING WHAT YOU ARE LOOKING AT IS NEVER SHUT.
   *
   * Folding is about what a person does not use, and the screen they are on is proof they are using
   * it. Without this, arriving from the palette or from a link inside a folded section shows a rail
   * with no `aria-current` anywhere in it: the product's own answer to "where am I" disappears
   * exactly when a reader is most likely to need it.
   */
  const openHere = (entries: NavEntry[]) => entries.some((e) => here(e.href));
  /* AND NOTHING IS FOLDED IN THE NARROW RAIL, because folding is a heading and the narrow rail has
     no headings to press. A section that stayed shut there would be rows a reader could not get
     back without widening the rail first, which is the all-or-nothing trap one level down. */
  const isShut = (section: string, entries: NavEntry[]) => !icons && shut.has(section) && !openHere(entries);

  /* The registers are not a declared section, so they carry their own test: the same rule, over the
     one list this rail draws without asking `arrange` for it. */
  const listsShut = $derived(!icons && shut.has(copy.lists) && !registers.some((r) => under(`/r/${r.id}`)));

  /* AND THE SECTION ITSELF GOES WHEN THERE IS NOTHING UNDER IT. A heading over an empty group is a
     fold that opens onto nothing, which is worse than the eight links it replaced. */
  const anyList = $derived(registers.length > 0);

  void ({} as RegisterDecl);
</script>

<nav
  class="rail"
  aria-label="Record"
  data-icons={icons ? '' : undefined}
  bind:this={rail}
  onpointerover={(e) => flyAt(e.target)}
  onpointerleave={() => (fly = null)}
  onfocusin={(e) => flyAt(e.target)}
  onfocusout={() => (fly = null)}
>
  <!--
    THE RECORD SWITCHER, AND IT HAS MOVED TO THE FOOT.

    It sat at the top of the rail, in the first position anybody's eye lands on, drawn as the
    largest thing in the column — and it is the least-pressed control in it. Most people have one
    record and will press this never; the three rows it was pushing down are the three surfaces
    whose absence would make this a different product. The name of the thing you are inside is
    still worth showing, so it keeps its tile and its name; it keeps them at the bottom, where
    every other product puts the identity you rarely change.

    NO LOCKUP EITHER WAY. The mark is the red circle in the corner, where it is an affordance
    rather than a caption.
  -->
  {#snippet switcher()}
    <Menu label={copy.switchRecord}>
      {#snippet trigger()}
        <span class="record" data-label={record || copy.switchRecord}>
          {#if record}
            <span class="record-avatar" aria-hidden="true">{record.slice(0, 1)}</span>
            <span class="record-name">{record}</span>
          {:else}
            <!-- A RECORD WITH NO NAME YET still needs a trigger that says what it does, or the button is empty. -->
            <span class="record-name">{copy.switchRecord}</span>
          {/if}
          <Icon name="chevronDown" size="s" />
        </span>
      {/snippet}

      <!-- THE ONE CONTROL THAT ASSERTS THIS PRODUCT HOLDS MORE THAN ONE BUSINESS could not reach the
           second one: every row was `href="/"`, so choosing another record left you in this one with
           the name unchanged and no toast. The record this app draws is a fixture, so the other row
           says so instead of pretending — a control that silently does nothing is the failure this
           app's own rule is written about. -->
      <!--
        AND THE RECORD YOU ARE ALREADY IN TOOK YOU SOMEWHERE ELSE.

        Every row was an `<a href="/">`, and the handler called `preventDefault` for the rows that
        are NOT current and returned early for the one that is. So the only row that ever reached
        the anchor's default action was the one wearing the tick, and pressing "you are here" from a
        register put you on the dashboard.

        IT IS A `<button>` NOW, because none of these rows navigates: the other records cannot be
        opened yet and say so, and the current one has nowhere to go. A menu item that is a link to
        a place it does not take you is the shape a reader learns not to trust.
      -->
      {#each records as r}
        <button
          type="button"
          class="mi"
          role="menuitem"
          aria-current={r.name === record ? 'true' : undefined}
          onclick={() => {
            if (r.name === record) return;
            toasts.push(copy.notWritten(copy.otherRecord(r.name)));
          }}
        >
          <span class="mi-avatar" aria-hidden="true">{r.name.slice(0, 1)}</span>
          <span class="mi-name">{r.name}</span>
          <!-- The level is on the ROW, not on a settings screen. Which record you are in and what
               you are allowed to do in it are one fact, and separating them is how somebody edits
               the wrong record's rows. -->
          {#if r.level !== 'owner'}<span class="mi-level">{r.level}</span>{/if}
          {#if r.name === record}<Icon name="check" size="s" />{/if}
        </button>
      {/each}
      <!--
        AND ON A REAL RECORD THE MENU SAYS WHY IT IS ONE ROW LONG.

        `boot` names the record you are in and no other, and the record's surface has no method that
        answers which records a person can reach: `whoami` says who you are on THIS one. So a live
        switcher can only ever list the record you are already in, and a control called "Switch
        record" that silently offers nothing to switch to is the shape this app's own rule is
        written about. It says the fact instead, and the sample keeps the rows and the toast it had.
      -->
      {#if live}<p class="mi-note">{copy.recordsUnlisted}</p>{/if}
      <hr class="mi-rule" />
      <a class="mi" role="menuitem" href="/settings/identity"><Icon name="settings" size="s" />{copy.recordSettings}</a>
      <a class="mi" role="menuitem" href="/start"><Icon name="plus" size="s" />{copy.newRecord}</a>
    </Menu>
  {/snippet}

  <!--
    THE WIDTH CONTROL, WHICH WAS A CHORD AND NOTHING ELSE.

    `⌘\` has always toggled the rail and is in the `?` sheet, and a keyboard shortcut is not a
    control: nothing on the screen said the rail had two widths, so the only people who knew were
    the ones who had read the sheet. It is a button at the head of the rail now, the place every
    reader of this kind of software already looks for one, and the chord still works.

    IT SAYS WHAT IT WILL DO, NOT WHAT HAPPENED. "Collapse the sidebar" and "Show the sidebar" are
    two whole sentences rather than one word that flips, because the name is what a screen reader
    announces and "Toggle" tells nobody which way they are about to go.
  -->
  <div class="top">
    <button
      type="button"
      class="collapse tap"
      data-label={icons ? copy.showSidebar : copy.collapseSidebar}
      aria-label={icons ? copy.showSidebar : copy.collapseSidebar}
      title={icons ? copy.showSidebar : copy.collapseSidebar}
      onclick={() => ontoggle?.()}
    >
      <Icon name="chevron" size="s" />
    </button>
  </div>

  <!-- The spine. Home, Decide and Inbox are the three surfaces whose absence would make this a
       different product, so no pack may add to it, reorder it or badge it. -->
  <ul class="group spine">
    <li>
      <a class="item tap" href="/" data-label={copy.home} aria-current={here('/') ? 'page' : undefined}>
        <Icon name="home" size="m" /><span class="item-name">{copy.home}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/decide" data-label={copy.decide} aria-current={under('/decide') ? 'page' : undefined}>
        <Icon name="decide" size="m" /><span class="item-name">{copy.decide}</span>
        <!-- ONE TREATMENT FOR EVERY NUMBER IN THIS RAIL. These two were bordered pills and the
             registers' were bare tabular figures, so the same fact — how many rows are behind this
             row — was drawn two ways in one column, and the pill read as an alert rather than a
             count. The figure is quiet everywhere and the INTENT carries the difference, which is
             the one thing that really is different about the questions waiting on you. -->
        <!-- AND THE INTENT IS NAMED, NOT ONLY COLOURED (13 §5.1). `--tone` alone made this the one
             element in the rail whose meaning was carried by colour and nothing else, which `a11y`
             reported as serious on two hundred page-runs. The glyph sits INSIDE the figure so the
             collapsed rail's `text-indent` and `overflow` swallow it with the digits, and the dot
             on the corner of the icon is unchanged. -->
        {#if open}<span class="tally num" data-intent="warn">{open}<Icon name="decide" size="s" title={copy.openQuestions} /></span>{/if}
      </a>
    </li>
    <li>
      <a class="item tap" href="/inbox" data-label={copy.inbox} aria-current={under('/inbox') ? 'page' : undefined}>
        <Icon name="inbox" size="m" /><span class="item-name">{copy.inbox}</span>
        {#if inbox}<span class="tally num">{inbox}</span>{/if}
      </a>
    </li>
  </ul>

  <div class="scroll">
    <!-- Declared. Sections and order come from `page` rows, and the user's arrangement wins. -->
    {#snippet navItem(entry: NavEntry, label: string)}
            <!-- A page about a THING wears that thing's colour. The hue is chosen once at create
                 and frozen, and it is the only colour in the product that means something specific
                 rather than something general: not "this is important", but "this is Kiln". Using
                 it here is the difference between a rail of grey rows and a rail where the project
                 you are looking for is the one you already recognise. -->
            <a
              class="item tap"
              href={entry.href}
              data-nav={entry.href}
              data-label={label}
              aria-current={here(entry.href) ? 'page' : undefined}
              style={entry.hue === undefined ? undefined : `--hue:${entry.hue}`}
              data-hued={entry.hue === undefined ? undefined : ''}
              onkeydown={(e) => onItemKey(e, entry)}
              oncontextmenu={(e) => {
                e.preventDefault();
                openMenu(entry, e.currentTarget);
              }}
            >
              <Icon name={entry.icon} size="m" />
              <span class="item-name">{label}</span>
            </a>
    {/snippet}
    {#each sections as [section, entries]}
      {#if entries.length === 1}
        <!-- A SECTION OF ONE IS A ROW, NOT A FOLDER. Money, Services and Work each declare one page,
             so the rail drew a folding heading over a single row three times, `Money` then
             `Overview`, `Services` then `Renewals`, which is the look of a file tree. A section
             holding one page is that page, named by its section, and there is nothing to fold. -->
        <ul class="group solo">
          <li>{@render navItem(entries[0]!, section)}</li>
        </ul>
      {:else}
      <!--
        THE HEADING IS THE CONTROL. A separate chevron beside it would be a second target the width
        of a glyph, on a row that is already exactly the right size to press, and `19 §3` gives the
        rail a right-click menu for the per-item verbs rather than a column of controls.

        `aria-expanded` ON A BUTTON INSIDE THE HEADING, not on the heading itself: a `<h2>` is not
        interactive and giving it a role would take the heading out of the document outline, which
        is what a screen reader uses to skip a section it does not want. The button names what it
        controls, so "Projects, collapsed, button" is the whole announcement.
      -->
      {@const folded = isShut(section, entries)}
      <!-- `data-shut` AND NOT `hidden`. `hidden` is a user-agent rule, `[hidden] { display: none }`,
           and this component sets an author-origin `display: flex` on the same element: author
           beats user agent at every specificity, so the list stayed on screen at full height while
           `aria-expanded="false"` sat over it. Worse than inert, because a screen reader was told
           the section was collapsed and then walked into every link in it. Nothing in this
           repository defines `[hidden]`, so the attribute has never worked on a styled element
           here. -->
      <!-- A HEADING WITH NOWHERE TO PUT ITS WORDS IS A HAIRLINE, and it is not an empty `<h2>`: a
           heading whose text is hidden is a heading with no accessible name, which is a defect
           rather than a narrow rail. A rule says the one thing left to say at this width, that
           these rows belong together, and claims nothing it cannot draw. -->
      {#if icons}
        <hr class="sep" />
      {:else}
      <h2 class="section">
        <button
          type="button"
          class="fold"
          aria-expanded={!folded}
          onclick={() => fold(section)}
        >
          <span class="fold-mark" aria-hidden="true" data-shut={folded ? '' : undefined}>
            <Icon name="chevronDown" size="s" />
          </span>
          {section}
        </button>
      </h2>
      {/if}
      <ul class="group" data-shut={folded ? '' : undefined} inert={folded || undefined} aria-hidden={folded || undefined}>
        {#each entries as entry}
          <li>
            {@render navItem(entry, entry.title)}
          </li>
        {/each}
      </ul>
      {/if}
    {/each}

    <!-- The registers themselves. Native, never pack-positioned: a page can be uninstalled with the
         pack that declared it, and the collections underneath it still have to be reachable. -->
    {#if anyList}
    {#if icons}
      <hr class="sep" />
    {:else}
    <h2 class="section">
      <button type="button" class="fold" aria-expanded={!listsShut} onclick={() => fold(copy.lists)}>
        <span class="fold-mark" aria-hidden="true" data-shut={listsShut ? '' : undefined}>
          <Icon name="chevronDown" size="s" />
        </span>
        {copy.lists}
      </button>
    </h2>
    {/if}
    <ul class="group" data-shut={listsShut ? '' : undefined} inert={listsShut || undefined} aria-hidden={listsShut || undefined}>
      <!-- Every list this rail is given, and it is given only the ones that hold something: the
           filter is on `index.registers` in `api.ts`, because the phone's More sheet draws the same
           list and the two must not be able to disagree. -->
      {#each registers as r}
        <li>
          <a class="item tap" href="/r/{r.id}" data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
            <Icon name={r.icon} size="m" />
            <span class="item-name">{r.name}</span>
            <span class="tally num">{r.count}</span>
          </a>
          <!-- A SAVED VIEW IS THE SAME LIST WITH A PREDICATE, so it lives under the list. There were
               two in the record and zero `/v/` links in this rail, while the `?` sheet documents
               `⌥V` as "Save the filter as a view" — the product taught somebody to make a thing and
               then never showed it to them again.

               NO GLYPH, AND INDENTED. It is not a sibling of the list; it is a way of looking at it,
               and the indent is what says so without a second section to read. -->
          {#each r.views ?? [] as v}
            <a class="item view tap" href="/v/{v.key}" aria-current={under(`/v/${v.key}`) ? 'page' : undefined}>
              <span class="item-name">{v.name}</span>
            </a>
          {/each}
        </li>
      {/each}
    </ul>
    {/if}

    {#if pen.length}
      <!-- A holding pen. An update that adds a page lands HIDDEN and nothing moves; re-showing one
           returns it to its stored order, never to the end of the list (19 §3). -->
      <!-- The one row in this rail that had no glyph, sitting between groups that all have one.
           This file's own header argues against exactly that. -->
      <a class="pen tap" href="/settings/navigation" data-label={copy.suggested}>
        <Icon name="alert" size="m" />
        <span class="pen-text">{pen.length === 1 ? copy.suggestedPage : `${pen.length} suggested pages.`}</span>
        <span class="pen-action">{copy.review}</span>
      </a>
    {/if}
  </div>

  <!--
    THE FOOT: ONE ROW, ONE STRIP, AND THE RECORD YOU ARE IN.

    It was five full-width rows carrying Audit, Packs, Vault, Settings and Search, and the count is
    the whole point. A friction pass counted thirty-four items of navigation on every screen, in a
    scroller whose content did not fit its own height, and four of those items were utilities
    nobody opens twice a day drawn at exactly the weight of the lists that hold the record. Four
    rows are one strip now, and nothing was taken away: each glyph is its own target, says its name
    on hover and on focus, and still wears `aria-current` on the screen you are looking at.

    SEARCH KEEPS ITS ROW. It is the one control here somebody presses all day, and it is the reason
    the disc fixed to the bottom-right corner could be taken off a desktop — that disc sat on top of
    whatever row happened to be beneath it, four controls' worth at 1440 by 900. `⌘K` still opens
    the same surface from anywhere, and the row does not print the chord: a key cap in the rail
    reads as a tool for people who already know the keys.

    THE PROVENANCE SURFACE IS STILL HERE, which is worth saying because it was once reachable only
    by `⌘K`: this list opened with an empty `<li>` where the audit belonged. "What happened to this
    record" is not an advanced feature.
  -->
  <div class="foot">
    <ul class="group">
      <li>
        <button type="button" class="item tap" data-label={copy.paletteLabel} onclick={() => (palette.open = true)}>
          <Icon name="search" size="m" /><span class="item-name">{copy.paletteLabel}</span>
        </button>
      </li>
    </ul>

    <div class="utils">
      {#each [['/audit', copy.audit, 'clock', '/audit'], ['/packs', copy.packs, 'packs', '/packs'], ['/vault', copy.vault, 'vault', '/vault'], ['/settings/appearance', copy.settings, 'settings', '/settings']] as const as [href, label, glyph, at]}
        <a class="util tap" {href} data-label={label} aria-label={label} title={label} aria-current={under(at) ? 'page' : undefined}>
          <Icon name={glyph} size="m" />
        </a>
      {/each}
    </div>

    <div class="who">{@render switcher()}</div>
  </div>

  <!-- EVERY ITEM IS A KEY THAT ALREADY EXISTS, the same rule the row menu follows: the menu is not
       a second set of capabilities, it is the same set, discoverable by looking. Hide is the one
       that says what it would have done instead of doing it — the mock has nowhere to bring a
       hidden item back from, and an irreversible control in a mock-up is a trap. -->
  <RowMenu
    open={menuFor !== null}
    at={menuAt}
    label={menuFor ? `${menuFor.title} in your nav` : 'Nav item'}
    onclose={() => {
      const back = menuFor?.href;
      menuFor = null;
      if (back) focusItem(back);
    }}
  >
    {#if menuFor}
      {@const entry = menuFor}
      <button class="mi" role="menuitem" type="button" onclick={() => move(entry.href, -1)}>
        <Icon name="arrowUp" size="s" />
        <span class="mi-name">{copy.moveUp}</span><Kbd keys="⌥↑" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => move(entry.href, 1)}>
        <Icon name="arrowDown" size="s" />
        <span class="mi-name">{copy.moveDown}</span><Kbd keys="⌥↓" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => toTop(entry.href)}>
        <Icon name="star" size="s" />
        <span class="mi-name">{copy.moveToTop}</span>
      </button>
      <hr class="mi-rule" />
      <button
        class="mi"
        role="menuitem"
        type="button"
        onclick={() => toasts.push(copy.notWritten(`${entry.title} would be hidden from your nav`), { intent: 'warn' })}
      >
        <Icon name="ban" size="s" />
        <span class="mi-name">{copy.hide}</span>
      </button>
    {/if}
  </RowMenu>

  <!-- `position: fixed`, so the one thing in this component that has to escape the scroller can.
       `aria-hidden`, because the row it names already carries that name. -->
  {#if fly}<span class="flyout" aria-hidden="true" style="--fly-y:{fly.y}px">{fly.label}</span>{/if}
</nav>

<style>
  /* The one item in the rail that is a button rather than a link. Reset to the item's shape so it
     reads as another row of the rail and not as a control dropped into it. */
  button.item {
    inline-size: 100%;
    background: none;
    border: 0;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* The rail is the darker ground. Navigation is how you get to the work; the work is what should
     be bright. */
  .rail {
    /* ONE TAP TARGET AND ITS GUTTERS. The narrow rail is not a smaller rail: every row in it is
       still exactly the square `13 §7` designs a target at, and the width is that square plus the
       padding the open rail already has. */
    --rail-icons: calc(var(--tap) + var(--sp-2) * 2);
    /* Where a flyout starts, which is the edge the rail ends at, whichever width it is. */
    --fly-x: var(--rail);

    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100dvh;
    padding: var(--sp-4) var(--sp-3) var(--sp-3);
    background: var(--sunk);
  }

  /* THE HEAD OF THE RAIL, WHICH USED TO BE THE RECORD SWITCHER. One control, at the edge the rail
     ends at, so the biggest thing at the top of the column is the work rather than the chrome. */
  .top {
    display: flex;
    justify-content: flex-end;
    padding-inline: var(--sp-2);
  }

  /* A CONTROL, not a caption, and now the largest thing in the rail.

     The first build drew it as letterspaced grey small caps under the logo — the shape of a label,
     so nobody would ever click it, sized as if the record's name were a footnote to the product's.
     It is the other way round. The record is what you are in and what you switch between; the
     product is what you opened once. So it gets the display face at 17px, a 28px tile with the
     record's initial, and the 44px height of a real target. */
  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    padding: 0 var(--sp-2);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.018em;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  :global(.menu-trigger:hover) .record,
  :global(.menu-trigger[aria-expanded='true']) .record {
    background: var(--hover-wash);
    border-color: var(--line);
  }

  /* The menu rows. Same 32px height and same tint-on-hover as a rail item, because they are the
     same kind of thing: a list of places, one of which you are in. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-ui);
    text-decoration: none;
    cursor: pointer;
  }

  /* 34 MEASURED, AND `13 §7` ASKS FOR 44 UNDER A THUMB. The register's copy of this control
     carries the same rule; the two have been a pair since the second one was written. */
  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }

  .mi :global(.icon) {
    color: var(--dim);
  }

  .mi-avatar {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    flex: none;
    background: var(--accent-wash);
    border-radius: var(--r-sm);
    color: var(--accent-text);
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .mi-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mi-level {
    padding: 1px 6px;
    background: var(--hold-wash);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  /* A SENTENCE, NOT A ROW. It is not a menu item and must not look like one or be reachable as one:
     nothing happens when it is pressed, and the whole point of it is that there is nothing to press. */
  .mi-note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  .record-avatar {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    flex: none;
    background: var(--accent-wash);
    border-radius: var(--r-md);
    color: var(--accent-text);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
  }

  .record-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record :global(.icon) {
    color: var(--dim);
  }

  /* Indented to where a glyph would be, so the name lines up with the names above it and the row
     reads as belonging to the one before it rather than following it. */
  .view {
    padding-inline-start: calc(var(--sp-3) + 20px + var(--sp-3));
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE SHUT SECTION, AND IT IS AN AUTHOR RULE BECAUSE THE RULE BELOW IS ONE. `hidden` did nothing
     here: it is a user-agent declaration and `display: flex` two lines down is an author one, so
     the list stayed at full height under a heading announcing itself collapsed. */
  .group[data-shut] {
    display: none;
  }

  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A row that stands for a whole section follows a folder with the space a heading would take. */
  .group:not(.solo) + .solo {
    margin-block-start: var(--sp-4);
  }
  .spine {
    margin-block-start: var(--sp-4);
  }

  /**
   * THE RAIL SCROLLS, AND IT DID NOT SAY SO.
   *
   * `19 §3`'s whole argument for a vertical rail is that this nav is a QUERY over `page` rows whose
   * length varies per customer — so it scrolls, and that is correct. What was wrong is that nothing
   * on the screen said it did. Measured at 1920×993, a laptop: `clientHeight` 664 against
   * `scrollHeight` 852. A hundred and eighty-eight pixels, about five rows, gone with no edge, no
   * shadow and (on macOS, and on Windows with overlay scrollbars) no scrollbar until you move the
   * pointer into it. The spine and the foot are pinned, so the part that gets cut is the part that
   * varies per customer: their own lists.
   *
   * FOUR LAYERS, NO SCRIPT. Two `local` gradients scroll with the content and sit ON TOP of two
   * fixed shadows — so at the top of the list the first gradient covers the first shadow, and both
   * uncover themselves as you scroll. It is Komarov's technique and it is the only pure-CSS way to
   * make a shadow that knows whether there is anything past the edge; the alternative is a scroll
   * listener that has to be right on resize, on zoom, and on every nav change.
   */
  .scroll {
    flex: 1;
    min-block-size: 0;
    margin-block-start: var(--sp-2);
    padding-block-end: var(--sp-4);
    overflow-y: auto;
    background:
      linear-gradient(var(--bg) 30%, transparent) top / 100% 20px no-repeat local,
      linear-gradient(transparent, var(--bg) 70%) bottom / 100% 20px no-repeat local,
      linear-gradient(color-mix(in srgb, var(--ink) 10%, transparent), transparent) top / 100% 8px no-repeat scroll,
      linear-gradient(transparent, color-mix(in srgb, var(--ink) 10%, transparent)) bottom / 100% 8px no-repeat scroll;
  }

  /* SENTENCE CASE, AND A STEP UP FROM WHERE IT WAS. It was letterspaced caps at 11px, on the
     argument that a group header is a ruler the eye scans rather than words it reads. Five of them
     down the rail read as a filing cabinet. The product this one is measured against names its
     sections in plain words and lets weight and space do the separating, and so does this. */
  .section {
    margin: var(--sp-5) 0 var(--sp-1);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* THE WHOLE HEADING IS THE TARGET, so the padding moves off the `h2` and onto the button: a
     control the width of its own text, in a rail, is a control people miss. `--tap` is the floor on
     a coarse pointer and this row is eleven-point type, so the invisible hit box is doing the work
     the drawing cannot. */
  .fold {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: start;
    text-transform: inherit;
    cursor: pointer;
  }

  .fold:hover {
    color: var(--ink2);
  }

  /* THE MARK TURNS RATHER THAN BEING SWAPPED. Two glyphs would be two things to keep in step and
     one of them would eventually be the wrong way round; a rotation is the same drawing making the
     same promise, and it says which way the section is about to go. */
  .fold-mark {
    display: grid;
    flex: none;
    place-items: center;
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-shut] {
    transform: rotate(-90deg);
  }

  .scroll .section:first-child {
    margin-block-start: var(--sp-2);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .item :global(.icon) {
    color: var(--dim);
    transition: color var(--d-state) var(--ease-out);
  }

  .item:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .item:hover :global(.icon) {
    color: var(--ink2);
  }

  /* "HERE" IS A RAISED PILL IN INK, AND IT WAS THE MARK'S RED. A red word on a red wash was the
     loudest thing in the rail on every screen, and the place you already are is the one row that
     needs no shouting. A lifted surface says "you are here" the way a tab does. */
  .item[aria-current='page'] {
    background: var(--s2);
    color: var(--ink);
    font-weight: 600;
    box-shadow: var(--e1);
  }
  .item[aria-current='page'] :global(.icon) {
    color: var(--ink);
  }

  /* Only the glyph takes it. The label stays `ink` so the row still reads as a row, and a rail of
     coloured words would be a rail nobody can scan. Same lightness and chroma as `IdentityMark`,
     which is what makes the mark in the grid and the row in the rail the same colour. */
  .item[data-hued] :global(svg),
  .item[data-hued][aria-current] :global(svg) {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /**
   * A COUNT, NOT A BADGE, AND THERE USED TO BE TWO OF THESE.
   *
   * The spine drew `.count` — an 18px bordered pill with its own 10px face — and the registers drew
   * `.tally`, bare tabular figures in `dim`. One column, one fact (how many rows are behind this
   * row), two drawings, and the pill read as an alert for something that is not one. It is one
   * treatment now: the body's tabular figures, quiet, right where the eye already scans for them.
   *
   * INTENT IS THE ONLY DIFFERENCE LEFT, and it is carried by `--tone` rather than by a border, so
   * the questions waiting on you read as urgent and the number of invoices does not.
   */
  .tally {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--tone, var(--dim));
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .item[aria-current='page'] .tally {
    color: inherit;
  }

  /* DRAWN AS A RAIL ROW, NOT A BOXED NOTICE. The glyph and the accent word already say something
     is waiting; a wash and a border on top of them made it the loudest thing in the rail. */
  .pen {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 32px;
    margin-block-start: var(--sp-5);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .pen :global(.icon) {
    color: var(--dim);
  }

  .pen:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .pen-text {
    flex: 1;
  }

  .pen-action {
    color: var(--accent-text);
    font-weight: 600;
  }

  .foot {
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--line);
  }

  /* FOUR UTILITIES ON ONE ROW, each an equal share of the width so the strip reads as one control
     with four positions rather than four things that happen to be beside each other. */
  .utils {
    display: flex;
    gap: var(--sp-1);
  }

  .util {
    display: grid;
    flex: 1;
    place-items: center;
    min-block-size: var(--ctl-h);
    border-radius: var(--r-md);
    color: var(--dim);
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .util:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* The same raised pill the rows wear, because it is the same fact: this is where you are. */
  .util[aria-current='page'] {
    background: var(--s2);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .who {
    padding-block-start: var(--sp-1);
  }

  .collapse {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .collapse:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* ONE GLYPH THAT TURNS, NOT TWO THAT CAN DISAGREE — the same argument the fold mark makes eighty
     lines up. It points at the wall the rail is about to fold against. */
  .collapse :global(.icon) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .rail:not([data-icons]) .collapse :global(.icon) {
    transform: rotate(180deg);
  }

  /* What a section heading becomes when there is no room for its words. */
  .sep {
    margin: var(--sp-4) var(--sp-2) var(--sp-2);
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /**
   * ── THE NARROW RAIL ────────────────────────────────────────────────────────
   *
   * Every row survives, every glyph survives, and the names go behind the pointer and the focus
   * ring. This is what `⌘\` does now; the state it replaced took the whole nav off the screen and
   * left one button, which is the thing nobody means by "collapsed".
   */
  .rail[data-icons] {
    --fly-x: var(--rail-icons);

    inline-size: var(--rail-icons);
    padding-inline: var(--sp-2);
  }

  .rail[data-icons] .top {
    justify-content: center;
    padding-inline: 0;
  }

  .rail[data-icons] .item,
  .rail[data-icons] .pen,
  .rail[data-icons] .record,
  .rail[data-icons] .util {
    /* `relative`, so the clipped name below anchors to its own row rather than escaping to the
       viewport, and so the count has a corner to sit in. */
    position: relative;
    justify-content: center;
    gap: 0;
    min-block-size: var(--tap);
    padding-inline: 0;
  }

  /* CLIPPED, NEVER REMOVED. The name is the row's accessible name — a screen reader reads exactly
     the same rail at both widths — and the flyout is a second copy for the eye. `display: none`
     here would leave a column of links called nothing at all. */
  .rail[data-icons] .item-name,
  .rail[data-icons] .pen-text,
  .rail[data-icons] .pen-action,
  .rail[data-icons] .record-name {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A COUNT HAS NO ROOM AND STILL HAS TO BE SEEN, so it becomes a dot on the corner of the glyph.
     The figure itself is still in the row's name for a screen reader; what the eye needs at this
     width is that there is something waiting, not how many. */
  .rail[data-icons] .tally {
    position: absolute;
    inset-block-start: var(--sp-1);
    inset-inline-end: var(--sp-1);
    inline-size: 6px;
    block-size: 6px;
    background: var(--tone, var(--dim));
    border-radius: var(--r-pill);
    overflow: hidden;
    text-indent: 100%;
    white-space: nowrap;
  }

  /* AND THE GLYPH GOES WITH THE DIGITS. `text-indent` pushes a text run out of an overflow-hidden
     box, which is what hides the figure here, and it does nothing to a flex ITEM — so the glyph
     that names the intent at full width would sit in the middle of the 6px dot. It is hidden
     rather than unset, because the name it carries is for the full-width rail; at this width the
     row's own name carries the meaning and the dot only says that something is waiting. */
  .rail[data-icons] .tally > :global(svg) {
    display: none;
  }

  /* A saved view has no glyph, deliberately — it is a way of looking at the list above it rather
     than a sibling of it — so at this width it would be a blank square. It comes back with the
     names. */
  .rail[data-icons] .view {
    display: none;
  }

  .rail[data-icons] .record :global(.icon) {
    display: none;
  }

  .rail[data-icons] .utils {
    flex-direction: column;
  }

  /**
   * THE NAME OF THE THING UNDER THE POINTER, OR UNDER THE FOCUS RING.
   *
   * Fixed, because `.scroll` has to keep `overflow-y: auto` and a flyout inside it is cut off at
   * the rail's own edge. The vertical coordinate is measured; the horizontal one is `--fly-x`,
   * which is the rail's width, so this is correct at both widths and under `dir="rtl"` without
   * arithmetic.
   */
  .flyout {
    position: fixed;
    inset-block-start: var(--fly-y);
    inset-inline-start: calc(var(--fly-x) + var(--sp-1));
    z-index: var(--z-hint);
    padding: var(--sp-1) var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    box-shadow: var(--e2);
    color: var(--ink);
    font-size: var(--t-sm);
    white-space: nowrap;
    pointer-events: none;
    translate: 0 -50%;
  }
</style>
