<!--
  The sidebar: the record at its head, then one flat list, then More.

  ONE FLAT LIST, AND IT WAS THREE. The rail had a spine (Home, Decide, Inbox, Slash, Automations, Jobs), then every
  declared section with its pages under a folding heading, then a foot of Search and a More group, which for a founder
  was some eighteen places across three regions that each looked different. The owner's old tool had six in one bar, and
  that is what he read without thinking. So the list is `flatNav`'s (`lib/nav.ts`): Today, the sections a day runs
  through, Activity, Decide while something waits, and People and Services when there is room, seven at most. A
  section is one row that opens its lead page; a project's own page is not a row, because the Projects page lists them.

  EVERYTHING ELSE IS UNDER MORE, AT THE FOOT, FOLDED: the page Today replaced as the landing, the sections that did not
  fit, a section's other pages, the lists, and the tools nobody opens twice a day (Suggestions, Automations, Jobs,
  Add-ons, Vault, Settings). It opens itself on any of the places it holds, so the rail never loses "here".

  SEARCH IS A BUTTON AT THE HEAD, and `/` or Ctrl K from anywhere. It was a row at the foot that read as a place to go.

  NO CHORD HINTS IN THE ROWS. `g h`, `g d` and `g 1`–`g 9` still work, and the `?` sheet is where they are said.

  EVERY ROW WEARS A GLYPH, declared rather than guessed, and a list with nothing declared gets the glyph for a list.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import { OVERVIEW, isHere, orderLists, placeOf, type FlatItem } from '../nav.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import type { NavEntry } from '../record/api.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  import type { Shell } from '../record/boot-live.ts';
  import type { SpineKey } from '../spine.ts';

  let {
    main,
    more = [],
    pages = [],
    hidden = 0,
    pen,
    record,
    records = [],
    refused,
    registers,
    spine = [],
    inbox = 0,
    icons = false,
    ontoggle,
  }: {
    /** The flat list, as `flatNav` reads it. */
    main: readonly FlatItem[];
    /** The sections that did not fit in it, each one row. */
    more?: readonly FlatItem[] | undefined;
    /** A section's other pages, a Board beside Work. */
    pages?: readonly NavEntry[] | undefined;
    /** How many pages the reader hid from the nav, so the way back is on the rail. */
    hidden?: number | undefined;
    /** The holding pen's offers (`boot`'s `pen`); the rail says only how many (PGS-18). */
    pen: readonly unknown[];
    record: string;
    records?: SwitcherRow[];
    /** Why the rest of the records could not be listed, when they could not: the host's own sentence. */
    refused?: string | undefined;
    registers: { id: string; name: string; count: number; icon: IconName; views?: { key: string; name: string; href: string }[] }[];
    /** The spine as `spineOf` reads it: whether Inbox has been used, which puts its row under More. */
    spine?: readonly SpineKey[] | undefined;
    inbox?: number | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /** The words the rail says itself, kept beside the one component that says them (design DSN-11). */
  const words = {
    unnamed: 'My BrainDog',
    moreLists: (n: number) => `Show ${n} more`,
    fewerLists: 'Show fewer',
    /* FLD-1's row under the lists, said only here. */
    newList: 'New list',
    /* THE HOLDING PEN'S ROW (PGS-18): how many offers wait, and Settings, Navigation says what they are. */
    suggested: (n: number) => `${n} suggested`,
  } as const;

  /**
   * THE HEAD ALWAYS NAMES THE RECORD, beside its tile. The fallback is the owner's first name, then "My BrainDog". `boot`
   * names people by id to the owner, so the caller is the only owner this screen can put a name to.
   */
  const ownerFirst = $derived.by(() => {
    const shell = page.data as unknown as Partial<Shell>;
    const me = shell.me;
    if (!me?.owner || !shell.names || !Object.hasOwn(shell.names, me.person)) return '';
    return (shell.names[me.person] ?? '').trim().split(/\s+/u)[0] ?? '';
  });
  const recordName = $derived(record.trim() || ownerFirst || words.unnamed);

  /** Eight lists, then one row that shows the rest; the list you are in is drawn wherever it sits. */
  const LISTS_SHOWN = 8;
  let listsAll = $state(false);

  /**
   * ANOTHER RECORD OPENS IN THIS BROWSER: the session moves to it, and the app starts again at Today, reading only that
   * record. A refusal is the host's sentence, and a host with no switch door says the record was not opened.
   */
  let opening = false;
  async function openOther(r: { slug: string; name: string }) {
    if (r.name === record || opening) return;
    opening = true;
    const out = await openRecord((url, init) => fetch(url, init), r.slug, location.origin);
    opening = false;
    /* A WHOLE NAVIGATION AND NOT `goto`. Every answer this tab kept was read from the record being left. */
    if (out.from === 'opened') return location.assign(out.to);
    toasts.push(out.from === 'absent' ? copy.recordNotOpened : out.fix, { intent: 'warn' });
  }

  /** The narrow rail's flyout: the name of the row under the pointer or the focus, since the row shows only its glyph. */
  let fly = $state<{ label: string; y: number } | null>(null);

  const flyAt = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.('[data-label]');
    if (!el || !icons) return (fly = null);
    const box = el.getBoundingClientRect();
    fly = { label: el.getAttribute('data-label') ?? '', y: Math.round(box.top + box.height / 2) };
  };

  const lists = $derived(orderLists(registers, navPrefs.order));

  /* COMPARED INSIDE THE RECORD. `page.url` is the address as it came, `/app/acme/decide`, and these links are written
     `/decide`, so the comparison reads the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
  const under = (href: string) => path === href || path.startsWith(`${href}/`);

  /**
   * THE TOOLS UNDER MORE, in the order a person reaches for them. Slash's page is Suggestions here, named for what it
   * offers, with its own name in the tooltip (`copy.slashRail`); the ask bar on Today is where a question is asked now.
   * Inbox joins them once anything has arrived, by the rule the spine keeps (`spineOf`).
   */
  type Tool = { href: string; label: string; icon: IconName; count?: number; title?: string };
  const tools = $derived<Tool[]>([
    ...(spine.includes('inbox') ? [{ href: '/inbox', label: said('inbox'), icon: 'inbox' as const, count: inbox }] : []),
    { href: '/slash', label: copy.suggestions, icon: 'star', title: copy.slashRail },
    { href: '/automations', label: copy.automations, icon: 'refresh' },
    { href: '/jobs', label: copy.jobs, icon: 'play' },
    { href: '/packs', label: copy.packs, icon: 'packs' },
    { href: '/vault', label: copy.vault, icon: 'vault' },
    { href: '/settings', label: copy.settings, icon: 'settings' },
  ]);

  /* THE LISTS DRAWN: the first eight, then the rest once asked, and always the one you are in. The narrow rail draws
     them all, since there is no row there to ask with. */
  const listsShown = $derived(icons || listsAll ? lists : lists.filter((r, i) => i < LISTS_SHOWN || under(`/r/${r.id}`)));
  const listsHidden = $derived(lists.length - listsShown.length);
  const listsFold = $derived(!icons && (listsAll ? lists.length > LISTS_SHOWN : listsHidden > 0));

  /**
   * MORE IS FOLDED UNTIL SOMEBODY OPENS IT, and it opens itself on any place it holds, so the rail never hides where you
   * are. Per visit rather than remembered: what is under it is what nobody opens twice a day. The narrow rail folds
   * nothing, because it has no heading to press.
   */
  let moreAsked = $state(false);
  const inMore = $derived(
    path === OVERVIEW ||
      more.some((i) => isHere(i, path)) ||
      pages.some((e) => under(e.href)) ||
      tools.some((t) => under(t.href)) ||
      path.startsWith('/r/') ||
      path.startsWith('/v/') ||
      path.startsWith('/settings'),
  );
  const moreShut = $derived(!icons && !moreAsked && !inMore);
</script>

<nav
  class="rail"
  aria-label="Record"
  data-icons={icons ? '' : undefined}
  onpointerover={(e) => flyAt(e.target)}
  onpointerleave={() => (fly = null)}
  onfocusin={(e) => flyAt(e.target)}
  onfocusout={() => (fly = null)}
>
  <!-- THE RECORD SWITCHER, WHICH IS ALSO THE RAIL'S HEAD: the record is the scope of every row under it. -->
  {#snippet switcher()}
    <Menu label={copy.switchRecord}>
      {#snippet trigger()}
        <span class="record" data-label={recordName}>
          <span class="record-avatar" aria-hidden="true">{recordName.slice(0, 1)}</span>
          <span class="record-name">{recordName}</span>
          <Icon name="chevronDown" size="s" />
        </span>
      {/snippet}

      <!-- A `<button>` a row, because none of these is a link: another record is opened by moving the session. -->
      {#each records as r}
        {@const word = levelWord(r)}
        <button
          type="button"
          class="mi"
          role="menuitem"
          aria-current={r.name === record ? 'true' : undefined}
          onclick={() => void openOther(r)}
        >
          <span class="mi-avatar" aria-hidden="true">{r.name.slice(0, 1)}</span>
          <span class="mi-name">{r.name}</span>
          {#if word !== null}<span class="mi-level">{word}</span>{/if}
          {#if r.name === record}<Icon name="check" size="s" />{/if}
        </button>
      {/each}
      <!-- When the records could not be listed, the host's own sentence says why. -->
      {#if refused}<p class="mi-note">{refused}</p>{/if}
      <hr class="mi-rule" />
      <a class="mi" role="menuitem" href={at('/settings/identity')}><Icon name="settings" size="s" />{copy.recordSettings}</a>
    </Menu>
  {/snippet}

  <div class="top">
    <div class="who">{@render switcher()}</div>
    <!-- SEARCH AT THE HEAD, with its two keys in the tooltip. The palette reaches anything in the record. -->
    <button
      type="button"
      class="collapse tap"
      data-label={copy.paletteLabel}
      aria-label={copy.paletteLabel}
      title={copy.searchKeys}
      onclick={() => (palette.open = true)}
    >
      <Icon name="search" size="s" />
    </button>
    <!-- THE WIDTH CONTROL says what it will do, not what happened. `⌘\` still works. -->
    <button
      type="button"
      class="collapse width tap"
      data-label={icons ? copy.showSidebar : copy.collapseSidebar}
      aria-label={icons ? copy.showSidebar : copy.collapseSidebar}
      title={icons ? copy.showSidebar : copy.collapseSidebar}
      onclick={() => ontoggle?.()}
    >
      <Icon name="chevron" size="s" />
    </button>
  </div>

  <div class="scroll">
    <!-- THE FLAT LIST. Decide carries how many questions wait, in `warn` and named, not only coloured (13 §5.1). -->
    <ul class="group main">
      {#each main as item (item.key)}
        <li>
          <a class="item tap" href={at(item.href)} data-label={item.label} aria-current={isHere(item, path) ? 'page' : undefined}>
            <Icon name={item.icon as IconName} size="m" /><span class="item-name">{item.label}</span>
            {#if item.count}<span class="tally num" data-waiting aria-label={`${item.count} ${copy.openQuestions}`}>{item.count}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>

    <div class="more">
      {#if icons}
        <hr class="sep" />
      {:else}
        <h2 class="section">
          <button type="button" class="fold tap" aria-expanded={!moreShut} onclick={() => (moreAsked = moreShut)}>
            <span class="fold-mark" aria-hidden="true" data-shut={moreShut ? '' : undefined}>
              <Icon name="chevronDown" size="s" />
            </span>
            {copy.more}
          </button>
        </h2>
      {/if}

      <div class="more-body" data-shut={moreShut ? '' : undefined} inert={moreShut || undefined} aria-hidden={moreShut || undefined}>
        <ul class="group">
          <!-- THE PAGE THE RECORD OPENED ON BEFORE TODAY, kept and reachable, not the landing. -->
          <li>
            <a class="item tap" href={at(OVERVIEW)} data-label={copy.overview} aria-current={path === OVERVIEW ? 'page' : undefined}>
              <Icon name="observe" size="m" /><span class="item-name">{copy.overview}</span>
            </a>
          </li>
          {#each more as item (item.key)}
            <li>
              <a class="item tap" href={at(item.href)} data-label={item.label} aria-current={isHere(item, path) ? 'page' : undefined}>
                <Icon name={item.icon as IconName} size="m" /><span class="item-name">{item.label}</span>
              </a>
            </li>
          {/each}
          {#each pages as entry (entry.href)}
            <li>
              <a class="item tap" href={at(entry.href)} data-label={entry.title} aria-current={path === entry.href ? 'page' : undefined}>
                <Icon name={entry.icon} size="m" /><span class="item-name">{entry.title}</span>
              </a>
            </li>
          {/each}
        </ul>

        <!-- THE LISTS, UNDER THEIR OWN WORD. Native, never pack-positioned: a page can go with the add-on that declared
             it, and the rows underneath still have to be reachable. "New list" is the last row (FLD-1). -->
        {#if !icons}<h3 class="sub">{said('lists')}</h3>{:else}<hr class="sep" />{/if}
        <ul class="group">
          {#each listsShown as r}
            <li>
              <a class="item tap" href={at(`/r/${r.id}`)} data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
                <Icon name={r.icon} size="m" />
                <span class="item-name">{r.name}</span>
                <span class="tally num">{r.count}</span>
              </a>
              <!-- A saved view is the same list with a filter, so it lives under the list, indented and without a glyph. -->
              {#each r.views ?? [] as v}
                <a class="item view tap" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}>
                  <span class="item-name">{v.name}</span>
                </a>
              {/each}
            </li>
          {/each}
          {#if listsFold}
            <li>
              <button type="button" class="item tap" aria-expanded={listsAll} onclick={() => (listsAll = !listsAll)}>
                <Icon name="more" size="m" />
                <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
              </button>
            </li>
          {/if}
          <li>
            <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={path === '/r/_new' ? 'page' : undefined}>
              <Icon name="plus" size="m" /><span class="item-name">{words.newList}</span>
            </a>
          </li>
        </ul>

        {#if icons}<hr class="sep" />{/if}
        <ul class="group tools">
          {#each tools as t (t.href)}
            <li>
              <a class="item tap" href={at(t.href)} data-label={t.label} title={t.title} aria-current={under(t.href) ? 'page' : undefined}>
                <Icon name={t.icon} size="m" /><span class="item-name">{t.label}</span>
                {#if t.count}<span class="tally num">{t.count}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>

        {#if hidden > 0}
          <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the nav is findable from the nav. -->
          <a class="pen tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hidden)} data-hidden-row>
            <Icon name="eye" size="m" />
            <span class="pen-text">{copy.hiddenCount(hidden)}</span>
            <span class="pen-action">{copy.showHidden}</span>
          </a>
        {/if}

        {#if pen.length}
          <!-- A holding pen: an update that adds a page lands hidden and nothing moves until somebody keeps it. -->
          <a class="pen tap" href={at('/settings/navigation')} data-label={words.suggested(pen.length)}>
            <Icon name="alert" size="m" />
            <span class="pen-text">{words.suggested(pen.length)}</span>
            <span class="pen-action">{copy.review}</span>
          </a>
        {/if}
      </div>
    </div>
  </div>

  <!-- `position: fixed`, so the one thing in this component that has to escape the scroller can. `aria-hidden`,
       because the row it names already carries that name. -->
  {#if fly}<span class="flyout" aria-hidden="true" style="--fly-y:{fly.y}px">{fly.label}</span>{/if}
</nav>

<style>
  /* The one kind of item in the rail that is a button rather than a link, reset to the item's shape. */
  button.item {
    inline-size: 100%;
    background: none;
    border: 0;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* The rail is the darker ground. Navigation is how you get to the work; the work is what should be bright. */
  .rail {
    --rail-icons: calc(var(--tap) + var(--sp-2) * 2);
    --fly-x: var(--rail);

    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100dvh;
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--sunk);
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin-block-end: var(--sp-2);
  }

  .top .who {
    flex: 1;
    min-inline-size: 0;
  }

  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  :global(.menu-trigger:hover) .record,
  :global(.menu-trigger[aria-expanded='true']) .record {
    background: var(--hover-wash);
    border-color: var(--line);
  }

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

  .mi-avatar,
  .record-avatar {
    display: grid;
    place-items: center;
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
    flex: none;
    background: var(--accent);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .mi-name,
  .record-name {
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

  /* A sentence, not a row: nothing happens when it is pressed. */
  .mi-note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .mi-rule {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  .record :global(.icon) {
    color: var(--dim);
  }

  /* Indented to where a glyph would be, so a saved view reads as belonging to the list above it. */
  .item.view {
    padding-inline-start: calc(var(--sp-2) * 2 + var(--icon-m));
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* AN AUTHOR RULE, because `hidden` is a user-agent one and loses to any `display` written here. */
  .more-body[data-shut] {
    display: none;
  }

  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .main {
    margin-block-start: var(--sp-2);
  }

  /* THE LIST AT THE TOP, MORE AT THE FOOT, and one scroller for both, so an open More scrolls rather than pushing the
     list off the screen. */
  .scroll {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .scroll:hover {
    scrollbar-color: color-mix(in srgb, var(--ink) 16%, transparent) transparent;
  }

  .more {
    margin-block-start: auto;
    padding-block-start: var(--sp-4);
  }

  .section {
    margin: 0 0 var(--sp-1);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .sub {
    margin: var(--sp-3) 0 var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .tools {
    margin-block-start: var(--sp-3);
  }

  /* THE WHOLE HEADING IS THE TARGET, so the padding is on the button and not on the `h2`. */
  .fold {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
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

  /* THE MARK TURNS RATHER THAN BEING SWAPPED, and says which way the group is about to go. */
  .fold-mark {
    display: grid;
    flex: none;
    place-items: center;
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-shut] {
    transform: rotate(-90deg);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--rail-item-h);
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
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

  /* "HERE" IS THE SELECTED SURFACE WITH AN INK GLYPH, never the mark's red (design SYS-1, D-1). */
  .item[aria-current='page'] {
    background: var(--selected);
    color: var(--ink);
  }

  .item[aria-current='page'] :global(.icon) {
    color: var(--ink);
  }

  /* THE FLAT LIST READS A STEP LARGER THAN WHAT IS UNDER MORE: it is the part of the rail read every day. */
  .main .item {
    font-size: var(--t-ui);
  }

  .item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tally {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--tone, var(--dim));
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .tally[data-waiting] {
    color: var(--warn);
    font-weight: 500;
  }

  .item[aria-current='page'] .tally {
    color: inherit;
  }

  .pen {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--rail-item-h);
    margin-block-start: var(--sp-3);
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-sm);
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
    color: var(--ink);
    font-weight: 600;
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

  /* ONE GLYPH THAT TURNS: it points at the wall the rail is about to fold against. */
  .width :global(.icon) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .rail:not([data-icons]) .width :global(.icon) {
    transform: rotate(180deg);
  }

  .sep {
    margin: var(--sp-3) var(--sp-2) var(--sp-2);
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  .rail[data-icons] {
    --fly-x: var(--rail-icons);

    inline-size: var(--rail-icons);
    padding-inline: var(--sp-2);
  }

  .rail[data-icons] .top {
    flex-direction: column;
    justify-content: center;
  }

  .rail[data-icons] .item,
  .rail[data-icons] .pen,
  .rail[data-icons] .record {
    position: relative;
    justify-content: center;
    gap: 0;
    min-block-size: var(--tap);
    padding-inline: 0;
  }

  /* CLIPPED, NEVER REMOVED: the name is the row's accessible name at both widths, and the flyout is a copy for the eye. */
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

  /* A COUNT BECOMES A DOT ON THE CORNER OF THE GLYPH at this width; the figure stays in the row's name. */
  .rail[data-icons] .tally {
    position: absolute;
    inset-block-start: var(--sp-1);
    inset-inline-end: var(--sp-1);
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--tone, var(--dim));
    border-radius: var(--r-pill);
    overflow: hidden;
    text-indent: 100%;
    white-space: nowrap;
  }

  .rail[data-icons] .view {
    display: none;
  }

  .rail[data-icons] .record :global(.icon) {
    display: none;
  }

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
