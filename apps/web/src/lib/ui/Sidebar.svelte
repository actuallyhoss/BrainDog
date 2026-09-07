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
  import { group } from '../nav.ts';
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
    registers: { id: string; name: string; count: number; icon: IconName }[];
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

  const ordered = $derived.by(() => {
    const base = [...nav].sort((a, b) => a.order - b.order);
    if (arrangement.length === 0) return base;
    const rank = new Map(arrangement.map((href, i) => [href, i]));
    return base
      .map((e, i) => ({ e, at: rank.get(e.href) ?? Number.MAX_SAFE_INTEGER, i }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
      .map((x) => x.e);
  });

  const sections = $derived(group(nav));

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
      <h2 class="section">{section}</h2>
      <ul class="group">
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
    <h2 class="section">{copy.lists}</h2>
    <ul class="group">
      {#each registers as r}
        <li>
          <a class="item tap" href="/r/{r.id}" aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
            <Icon name={r.icon} size="m" />
            <span class="item-name">{r.name}</span>
            <span class="tally num">{r.count}</span>
          </a>
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

  .scroll {
    flex: 1;
    min-block-size: 0;
    margin-block-start: var(--sp-2);
    padding-block-end: var(--sp-4);
    overflow-y: auto;
  }

  /* Small caps here and nowhere else in the product. A section header is not read — it is a RULER
     the eye uses to find the group it wants, and at that job the boxy silhouette of caps at 11px
     beats sentence case. Column headers and field labels are the opposite case and are set the
     opposite way; see blocks.css. */
  .section {
    margin: var(--sp-5) 0 var(--sp-1);
    padding-inline: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
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
