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
  import Menu from './Menu.svelte';
  import RowMenu from './RowMenu.svelte';
  import Kbd from './Kbd.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    nav,
    pen,
    record,
    records = [],
    registers,
    open = 0,
    inbox = 0,
  }: {
    nav: NavEntry[];
    pen: PageDecl[];
    record: string;
    records?: { slug: string; name: string; level: string }[];
    registers: { id: string; name: string; count: number; icon: IconName; views?: { key: string; name: string }[] }[];
    open?: number | undefined;
    inbox?: number | undefined;
  } = $props();

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
  const isShut = (section: string, entries: NavEntry[]) => shut.has(section) && !openHere(entries);

  /* The registers are not a declared section, so they carry their own test: the same rule, over the
     one list this rail draws without asking `arrange` for it. */
  const listsShut = $derived(shut.has(copy.lists) && !registers.some((r) => under(`/r/${r.id}`)));

  void ({} as RegisterDecl);
</script>

<nav class="rail" aria-label="Record" bind:this={rail}>
  <!-- No lockup. The mark is the red circle in the bottom-right corner, where it is an affordance
       rather than a caption, and the record switcher takes the space it used to occupy. The name of
       the thing you are inside is worth more here than the name of the software you are inside: you
       chose the software once, and you switch records every day. -->
  <div class="top">
    <Menu label={copy.switchRecord}>
      {#snippet trigger()}
        <span class="record">
          <span class="record-avatar" aria-hidden="true">{record.slice(0, 1)}</span>
          <span class="record-name">{record}</span>
          <Icon name="chevronDown" size="s" />
        </span>
      {/snippet}

      <!-- THE ONE CONTROL THAT ASSERTS THIS PRODUCT HOLDS MORE THAN ONE BUSINESS could not reach the
           second one: every row was `href="/"`, so choosing another record left you in this one with
           the name unchanged and no toast. The record this app draws is a fixture, so the other row
           says so instead of pretending — a control that silently does nothing is the failure this
           app's own rule is written about. -->
      {#each records as r}
        <a
          class="mi"
          role="menuitem"
          href="/"
          aria-current={r.name === record ? 'true' : undefined}
          onclick={(e) => {
            if (r.name === record) return;
            e.preventDefault();
            toasts.push(copy.notWritten(`${r.name} would open, with its own registers and pages`));
          }}
        >
          <span class="mi-avatar" aria-hidden="true">{r.name.slice(0, 1)}</span>
          <span class="mi-name">{r.name}</span>
          <!-- The level is on the ROW, not on a settings screen. Which record you are in and what
               you are allowed to do in it are one fact, and separating them is how somebody edits
               the wrong record's rows. -->
          {#if r.level !== 'owner'}<span class="mi-level">{r.level}</span>{/if}
          {#if r.name === record}<Icon name="check" size="s" />{/if}
        </a>
      {/each}
      <hr class="mi-rule" />
      <a class="mi" role="menuitem" href="/settings/identity"><Icon name="settings" size="s" />{copy.recordSettings}</a>
      <a class="mi" role="menuitem" href="/start"><Icon name="plus" size="s" />{copy.newRecord}</a>
    </Menu>
  </div>

  <!-- The spine. Home, Decide and Inbox are the three surfaces whose absence would make this a
       different product, so no pack may add to it, reorder it or badge it. -->
  <ul class="group spine">
    <li>
      <a class="item tap" href="/" aria-current={here('/') ? 'page' : undefined}>
        <Icon name="home" size="m" /><span class="item-name">{copy.home}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/decide" aria-current={under('/decide') ? 'page' : undefined}>
        <Icon name="decide" size="m" /><span class="item-name">{copy.decide}</span>
        {#if open}<span class="count" data-intent="warn">{open}</span>{/if}
      </a>
    </li>
    <li>
      <a class="item tap" href="/inbox" aria-current={under('/inbox') ? 'page' : undefined}>
        <Icon name="inbox" size="m" /><span class="item-name">{copy.inbox}</span>
        {#if inbox}<span class="count">{inbox}</span>{/if}
      </a>
    </li>
  </ul>

  <div class="scroll">
    <!-- Declared. Sections and order come from `page` rows, and the user's arrangement wins. -->
    {#each sections as [section, entries]}
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
      <ul class="group" hidden={folded}>
        {#each entries as entry}
          <li>
            <!-- A page about a THING wears that thing's colour. The hue is chosen once at create
                 and frozen, and it is the only colour in the product that means something specific
                 rather than something general: not "this is important", but "this is Kiln". Using
                 it here is the difference between a rail of grey rows and a rail where the project
                 you are looking for is the one you already recognise. -->
            <a
              class="item tap"
              href={entry.href}
              data-nav={entry.href}
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
              <span class="item-name">{entry.title}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/each}

    <!-- The registers themselves. Native, never pack-positioned: a page can be uninstalled with the
         pack that declared it, and the collections underneath it still have to be reachable. -->
    <h2 class="section">
      <button type="button" class="fold" aria-expanded={!listsShut} onclick={() => fold(copy.lists)}>
        <span class="fold-mark" aria-hidden="true" data-shut={listsShut ? '' : undefined}>
          <Icon name="chevronDown" size="s" />
        </span>
        {copy.lists}
      </button>
    </h2>
    <ul class="group" hidden={listsShut}>
      {#each registers as r}
        <li>
          <a class="item tap" href="/r/{r.id}" aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
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

    {#if pen.length}
      <!-- A holding pen. An update that adds a page lands HIDDEN and nothing moves; re-showing one
           returns it to its stored order, never to the end of the list (19 §3). -->
      <!-- The one row in this rail that had no glyph, sitting between groups that all have one.
           This file's own header argues against exactly that. -->
      <a class="pen" href="/settings/navigation">
        <Icon name="alert" size="s" />
        <span class="pen-text">{pen.length === 1 ? copy.suggestedPage : `${pen.length} suggested pages.`}</span>
        <span class="pen-action">{copy.review}</span>
      </a>
    {/if}
  </div>

  <ul class="group foot">
    <!-- THE PROVENANCE SURFACE WAS REACHABLE ONLY BY ⌘K on a desktop, because this list opened with
         an EMPTY `<li>` — a blank row, announced as a blank list item, where the audit belonged.
         "What happened to this record" is not an advanced feature. -->
    <li>
      <a class="item tap" href="/audit" aria-current={under('/audit') ? 'page' : undefined}>
        <Icon name="clock" size="m" /><span class="item-name">{copy.audit}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/packs" aria-current={under('/packs') ? 'page' : undefined}>
        <Icon name="packs" size="m" /><span class="item-name">{copy.packs}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/vault" aria-current={under('/vault') ? 'page' : undefined}>
        <Icon name="vault" size="m" /><span class="item-name">{copy.vault}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/settings/appearance" aria-current={under('/settings') ? 'page' : undefined}>
        <Icon name="settings" size="m" /><span class="item-name">{copy.settings}</span>
      </a>
    </li>
  </ul>

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
</nav>

<style>
  /* The rail is the darker ground. Navigation is how you get to the work; the work is what should
     be bright. */
  .rail {
    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100dvh;
    padding: var(--sp-4) var(--sp-3) var(--sp-3);
    background: var(--sunk);
  }

  .top {
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
    background: color-mix(in srgb, var(--ink) 5%, transparent);
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

  .mi:hover,
  .mi:focus-visible {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
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
    background: color-mix(in srgb, var(--accent) 16%, transparent);
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
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
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
    background: color-mix(in srgb, var(--accent) 16%, transparent);
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

  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
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

  /* Small caps here and nowhere else in the product. A section header is not read — it is a RULER
     the eye uses to find the group it wants, and at that job the boxy silhouette of caps at 11px
     beats sentence case. Column headers and field labels are the opposite case and are set the
     opposite way; see blocks.css. */
  .section {
    margin: var(--sp-5) 0 var(--sp-1);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
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
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .item:hover :global(.icon) {
    color: var(--ink2);
  }

  /* "Here" is the mark's colour. It is the one place in the rail that is allowed to be loud, and it
     is the cheapest way for a product to look like itself on every screen. */
  .item[aria-current='page'] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .item[aria-current='page'] :global(.icon) {
    color: var(--accent-text);
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

  .count {
    min-inline-size: 18px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--tone, var(--line)) 55%, var(--line));
    border-radius: 999px;
    color: var(--tone, var(--dim));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 15px;
    text-align: center;
  }

  /* A count, not a badge: it says how many rows the register holds, which is a fact and not an
     alert. Tabular so the column of them lines up down the rail. */
  .tally {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .item[aria-current='page'] .tally {
    color: inherit;
  }

  .pen {
    gap: var(--sp-2);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
    padding: var(--sp-2) var(--sp-3);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .pen:hover {
    border-color: var(--edge);
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
</style>
