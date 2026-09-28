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
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import { arrange, orderLists } from '../nav.ts';
  import * as pref from '../pref.ts';
  import { navPrefs, type Saved } from '../nav-prefs.svelte.ts';
  import type { NavEntry } from '../record/api.ts';
  import type { RegisterDecl } from '../record/schema.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import RowMenu from './RowMenu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  import { nameWords } from '../record/names.ts';
  import type { Shell } from '../record/boot-live.ts';
  import type { SpineKey } from '../spine.ts';

  let {
    nav,
    pen,
    record,
    records = [],
    refused,
    registers,
    spine = ['home', 'decide', 'inbox', 'slash', 'automations'],
    open = 0,
    inbox = 0,
    icons = false,
    ontoggle,
  }: {
    nav: NavEntry[];
    /** The holding pen's offers (`boot`'s `pen`); the rail says only how many (PGS-18). */
    pen: readonly unknown[];
    record: string;
    records?: SwitcherRow[];
    /** Why the rest of the records could not be listed, when they could not: the host's own sentence. */
    refused?: string | undefined;
    registers: { id: string; name: string; count: number; icon: IconName; views?: { key: string; name: string; href: string }[] }[];
    /** The spine as `spineOf` reads it, which the tab bar and the top bar read too (PGS-18). */
    spine?: readonly SpineKey[] | undefined;
    open?: number | undefined;
    inbox?: number | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /**
   * THE WORDS THE RAIL SAYS ITSELF, kept beside the one component that says them (design DSN-11). The fallback name is
   * what a record with no name and no owner this caller can name is called, and the other two are the Lists fold.
   */
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
   * THE HEAD ALWAYS NAMES THE RECORD, beside its tile. It read "Switch record" and nothing else on a record with no name,
   * the seeded one included, so the first thing on every screen at 1440 was a verb where the name of the place belongs
   * (design SYS-12). The fallback is the owner's first name, then "My BrainDog".
   *
   * THE OWNER'S NAME IS THE SHELL'S, READ WHERE THE RAIL ALREADY READS THE ADDRESS. `boot` names people by id to the
   * owner, so the caller is the only owner this screen can put a name to; a colleague on an unnamed record reads the
   * fallback rather than a name guessed from somebody else's row.
   */
  const ownerFirst = $derived.by(() => {
    const shell = page.data as unknown as Partial<Shell>;
    const me = shell.me;
    if (!me?.owner || !shell.names || !Object.hasOwn(shell.names, me.person)) return '';
    return (shell.names[me.person] ?? '').trim().split(/\s+/u)[0] ?? '';
  });
  const recordName = $derived(record.trim() || ownerFirst || words.unnamed);

  /**
   * A LONG LISTS GROUP FOLDS AFTER EIGHT. Lists run off the fold on any record that keeps a dozen of them, with the rail
   * cut mid-row and nothing below the cut said to exist (design SYS-12). Eight are drawn, then one row that shows the rest;
   * the list you are in is drawn wherever it sits, so the rail never loses "here". Per visit, since it is a glance and
   * not an arrangement: `railShut` already keeps the whole group folded for somebody who wants it gone.
   */
  const LISTS_SHOWN = 8;
  let listsAll = $state(false);

  /**
   * ANOTHER RECORD OPENS IN THIS BROWSER: the session moves to it, and the app starts again at Home, reading only that record.
   * A refusal is the host's sentence.
   *
   * A HOST WITH NO SWITCH DOOR (`absent`) SAYS THE RECORD WAS NOT OPENED. It toasted "Kiln would open, with its own lists
   * and pages, but nothing was saved yet.", the sample's receipt for a press that did nothing, on a static host or a
   * self-host nobody signs in to; there is no sample now to have opened anything in (DIRECTION 26).
   */
  let opening = false;
  async function openOther(r: { slug: string; name: string }) {
    if (r.name === record || opening) return;
    opening = true;
    const out = await openRecord((url, init) => fetch(url, init), r.slug, location.origin);
    opening = false;
    /* A WHOLE NAVIGATION AND NOT `goto`. Every answer this tab kept (the record's `boot`, its voice, the rail's prefs) was
       read from the record being left, and a load is the one thing that forgets all of them at once. */
    if (out.from === 'opened') return location.assign(out.to);
    toasts.push(out.from === 'absent' ? copy.recordNotOpened : out.fix, { intent: 'warn' });
  }

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
    /* ONLY THE NARROW RAIL ASKS FOR THIS. Every row of the open rail says its own name, the foot's included, since the
       glyph strip that was icon-only at both widths became labelled rows in "More". */
    if (!el || !icons) return (fly = null);
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
   *
   * BOTH ARE THE PERSON'S, on a record: `navPrefs` sends each change to `setPref` and `boot` answers them on every
   * device. With no record they stay on this one.
   */
  const arrangement = $derived(navPrefs.order);

  /* A CHANGE THE RECORD REFUSED IS ALREADY PUT BACK on screen; this says why. */
  const refusedSay = (saved: Saved) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
  };

  /**
   * TAKE A PAGE OUT OF THE RAIL, and say where it went. It stays in the record, in search and in the palette, and
   * Settings, Navigation lists it with Show again, which is also what the toast's Undo does.
   */
  function hide(entry: NavEntry) {
    void navPrefs.hide(entry.href).then((saved) => {
      if (saved.from === 'refused') return refusedSay(saved);
      toasts.push(copy.hiddenFromNav(entry.title), { undo: () => void navPrefs.show(entry.href).then(refusedSay) });
    });
  }

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
    /* THE LISTS' ORDER RIDES IN THE SAME PREFERENCE (`orderLists`), and a move here only knows the pages, so the list
       addresses already held are kept rather than dropped by the next Move up. */
    const kept = arrangement.filter((href) => href.startsWith('/r/') && !next.includes(href));
    void navPrefs.setOrder([...next, ...kept]).then(refusedSay);
  };

  /* A HIDDEN PAGE IS NOT DRAWN, and the count below says how many are not, so the way back is on the rail itself. */
  const shown = $derived(nav.filter((e) => !navPrefs.hidden.includes(e.href)));
  const hiddenHere = $derived(nav.length - shown.length);
  const sections = $derived(arrange(shown, arrangement));
  const lists = $derived(orderLists(registers, arrangement));

  /**
   * A GROUP WITH AN OVERVIEW OPENS IT FROM ITS HEADING, so "Overview" is not a row under it.
   *
   * Money, Projects and Work each declare their first page as "Overview", so the open rail read "Overview" three times,
   * each under the name that already said which one it was (design SYS-12). The heading is the section's name, and the
   * section's name is what a person calls that page, so the heading is the link and the page leaves the rows. The
   * narrow rail has no headings to press, so there the Overview stays a row with its glyph.
   *
   * THE DECLARED TITLE IS THE TEST, because it is the only thing that marks a section's own page: a page declares a
   * title and a section and nothing that says "I am this section's front".
   */
  const OVERVIEW = 'overview';
  const groups = $derived(
    sections.map(([section, entries]) => {
      const lead = icons || entries.length < 2 ? undefined : entries.find((e) => e.title.trim().toLowerCase() === OVERVIEW);
      return { section, entries, lead, rows: lead ? entries.filter((e) => e !== lead) : entries };
    }),
  );
  const leads = $derived(new Set(groups.flatMap((g) => (g.lead ? [g.lead.href] : []))));

  /* THE FLAT LIST IN RENDER ORDER, and it is derived FROM what renders rather than beside it. The
     two were computed separately and disagreed, which is how a move came to be calculated against a
     list nobody could see. One of them has to be the other's source. A heading's Overview stays in
     it, so a move keeps the Overview's place in the arrangement; `move` and `toTop` step over it. */
  const ordered = $derived(groups.flatMap((g) => g.entries));

  /* THE LISTS DRAWN: the first eight, then the rest once asked, and always the one you are in. The narrow rail draws
     them all, for the reason it folds no section: there is no row there to ask with. */
  const listsShown = $derived(
    icons || listsAll ? lists : lists.filter((r, i) => i < LISTS_SHOWN || inside(page.url.pathname).startsWith(`/r/${r.id}`)),
  );
  const listsHidden = $derived(lists.length - listsShown.length);
  /* THE ROW STAYS WHILE THERE IS SOMETHING TO SHOW OR TO FOLD AGAIN, and never offers "Show 0 more" when the list you
     are in was the only one past eight. */
  const listsFold = $derived(!icons && (listsAll ? lists.length > LISTS_SHOWN : listsHidden > 0));

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
    /* A HEADING'S OVERVIEW IS NOT A NEIGHBOUR: swapping with it moves nothing a reader can see. */
    while (to >= 0 && to < list.length && (list[to]!.section !== me.section || leads.has(list[to]!.href))) to += delta;
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
    const at = rest.findIndex((e) => e.section === me.section && !leads.has(e.href));
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

  /* COMPARED INSIDE THE RECORD. `page.url` is the address as it came, `/app/acme/decide`, and these links are written
     `/decide`, so the comparison reads the address with the base and the slug taken off (`lib/at.ts`). */
  const here = (href: string) => inside(page.url.pathname) === href;
  const under = (href: string) => inside(page.url.pathname).startsWith(href);
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

  /* THE FOOT'S "MORE" FOLDS BY THE SAME RULE, and opens itself on any of its four places. */
  const moreShut = $derived(!icons && shut.has(copy.more) && ['/audit', '/packs', '/vault', '/settings'].every((area) => !under(area)));

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
    THE RECORD SWITCHER, WHICH IS ALSO THE RAIL'S HEAD.

    The record is the scope of every row under it, so its name heads the column beside its tile, and
    the tile is one of the few places the brand's colour belongs (design D-1). Most people have one
    record and will open this menu never, so it is drawn as a name rather than as a control that
    shouts; pressing it still lists every record this person can reach.
  -->
  {#snippet switcher()}
    <Menu label={copy.switchRecord}>
      {#snippet trigger()}
        <!-- THE NAME, ALWAYS, BESIDE ITS TILE (`recordName`). The menu itself is still labelled "Switch record", which is
             what it does; the trigger says where you are. -->
        <span class="record" data-label={recordName}>
          <span class="record-avatar" aria-hidden="true">{recordName.slice(0, 1)}</span>
          <span class="record-name">{recordName}</span>
          <Icon name="chevronDown" size="s" />
        </span>
      {/snippet}

      <!-- THE ONE CONTROL THAT ASSERTS THIS PRODUCT HOLDS MORE THAN ONE BUSINESS could not reach the
           second one: every row was `href="/"`, so choosing another record left you in this one with
           the name unchanged and no toast. On a record the other row opens that record now, through
           `/auth/switch`, and a host that cannot says so instead of pretending: a control that silently does nothing is the
           failure this app's own rule is written about. -->
      <!--
        AND THE RECORD YOU ARE ALREADY IN TOOK YOU SOMEWHERE ELSE.

        Every row was an `<a href="/">`, and the handler called `preventDefault` for the rows that
        are NOT current and returned early for the one that is. So the only row that ever reached
        the anchor's default action was the one wearing the tick, and pressing "you are here" from a
        register put you on the dashboard.

        IT IS A `<button>` NOW, because none of these rows is a link: another record is opened by
        moving the session and starting again at Home, and the current one has nowhere to go. A menu item that is a link to
        a place it does not take you is the shape a reader learns not to trust.
      -->
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
          <!-- The level is on the ROW, not on a settings screen. Which record you are in and what
               you are allowed to do in it are one fact, and separating them is how somebody edits
               the wrong record's rows. A colleague who holds lists and not the record has no level,
               and the row printed an empty span for them; it wears the host's `held` word now. -->
          {#if word !== null}<span class="mi-level">{word}</span>{/if}
          {#if r.name === record}<Icon name="check" size="s" />{/if}
        </button>
      {/each}
      <!--
        AND WHEN THE LIST COULD NOT BE READ, THE MENU SAYS SO IN THE HOST'S OWN WORDS.

        The rows come from the account, which is the only thing that knows there is more than one
        record: `boot` names the one you are in and `whoami` says who you are on it. When that read
        is refused the switcher still holds the record you are inside, and a menu one row long with
        nothing to explain it reads as a product that holds one business. A signed-out session is
        the common case and the sentence for it is "sign in again", which is something a reader can
        act on.
      -->
      {#if refused}<p class="mi-note">{refused}</p>{/if}
      <hr class="mi-rule" />
      <a class="mi" role="menuitem" href={at('/settings/identity')}><Icon name="settings" size="s" />{copy.recordSettings}</a>
      <!-- NO "New record" HERE UNTIL THE HOST SAYS THIS PERSON MAY MAKE ONE (`loop/finish/modules.md` MOD-6). It opened
           this record's own `/start`, which answered "This BrainDog is already made.", because only the operator can
           make a record today; `boot` carries no answer to "may this person make one", so the item is absent. -->
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
    <!-- THE RECORD IS THE SCOPE OF EVERYTHING BELOW IT, so it heads the rail (DESIGN-BRIEF 4.4). -->
    <div class="who">{@render switcher()}</div>
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
       different product, so no pack may add to it, reorder it or badge it. Slash and Automations
       follow them: they were two glyphs in a strip at the foot that nobody could tell apart, and
       they are what fits the record to how a person works (design SYS-12). Decide and Inbox are
       drawn once they have been used, by the rule the tab bar and the top bar read too (`spine.ts`,
       PGS-18); both still answer by address and by `g then d` / `g then i`. -->
  <ul class="group spine">
    <li>
      <a class="item tap" href={at('/')} data-label={said('home')} aria-current={here('/') ? 'page' : undefined}>
        <Icon name="home" size="m" /><span class="item-name">{said('home')}</span>
      </a>
    </li>
    {#if spine.includes('decide')}
    <li>
      <a class="item tap" href={at('/decide')} data-label={said('decide')} aria-current={under('/decide') ? 'page' : undefined}>
        <Icon name="decide" size="m" /><span class="item-name">{said('decide')}</span>
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
        {#if open}<span class="tally num" data-waiting aria-label={`${open} ${copy.openQuestions}`}>{open}</span>{/if}
      </a>
    </li>
    {/if}
    {#if spine.includes('inbox')}
    <li>
      <a class="item tap" href={at('/inbox')} data-label={said('inbox')} aria-current={under('/inbox') ? 'page' : undefined}>
        <Icon name="inbox" size="m" /><span class="item-name">{said('inbox')}</span>
        {#if inbox}<span class="tally num">{inbox}</span>{/if}
      </a>
    </li>
    {/if}
    <li>
      <!-- ITS LABEL IS ITS NAME, and its tooltip says what it is, since Slash is not a word a person uses about their
           own work. The tooltip is `title` and not the accessible name, so the name read aloud is the name on screen. -->
      <a class="item tap" href={at('/slash')} data-label={nameWords.slash} title={copy.slashRail} aria-current={under('/slash') ? 'page' : undefined}>
        <Icon name="star" size="m" /><span class="item-name">{nameWords.slash}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href={at('/automations')} data-label={copy.automations} aria-current={under('/automations') ? 'page' : undefined}>
        <Icon name="refresh" size="m" /><span class="item-name">{copy.automations}</span>
      </a>
    </li>
    <li>
      <!-- JOBS BESIDE AUTOMATIONS (AGT-23): an agent's job runs on its own once started, and while one is running it is
           the screen somebody keeps going back to, so it sits with the other things that run rather than under More. -->
      <a class="item tap" href={at('/jobs')} data-label={copy.jobs} aria-current={under('/jobs') ? 'page' : undefined}>
        <Icon name="play" size="m" /><span class="item-name">{copy.jobs}</span>
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
              href={at(entry.href)}
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
              <!-- A PROJECT IS A SQUARE OF ITS OWN COLOUR, not a tinted cube glyph (DESIGN-BRIEF 4.4). -->
              {#if entry.hue === undefined}<Icon name={entry.icon} size="m" />{:else}<span class="swatch" aria-hidden="true"></span>{/if}
              <span class="item-name">{label}</span>
            </a>
    {/snippet}
    {#each groups as { section, entries, lead, rows }}
      {#if entries.length === 1}
        <!-- A SECTION OF ONE IS A ROW, NOT A FOLDER. A section that declares one page drew a folding
             heading over a single row, `Services` then `Renewals`, which is the look of a file tree.
             A section holding one page is that page, named by its section, and there is nothing to
             fold. -->
        <ul class="group solo">
          <li>{@render navItem(entries[0]!, section)}</li>
        </ul>
      {:else}
      <!--
        THE HEADING IS THE CONTROL. A separate chevron beside it would be a second target the width
        of a glyph, on a row that is already exactly the right size to press, and `19 §3` gives the
        rail a right-click menu for the per-item verbs rather than a column of controls. The one
        exception is a section with an Overview, whose name opens that page (`groups`), so its fold
        is the mark alone, grown to a whole target by `.tap`.

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
      <!-- A HEADING THAT OPENS ITS OVERVIEW IS TWO CONTROLS, the fold's mark and the name, because one press cannot both
           fold a section and open its page. The fold keeps the section's name in its text, hidden, so it is announced
           "Money, expanded, button" and `railShut`'s probe still reads which sections are folded by name. -->
      {#if icons}
        <hr class="sep" />
      {:else}
      <h2 class="section" data-opens={lead ? '' : undefined}>
        <button
          type="button"
          class="fold tap"
          aria-expanded={!folded}
          onclick={() => fold(section)}
        >
          <span class="fold-mark" aria-hidden="true" data-shut={folded ? '' : undefined}>
            <Icon name="chevronDown" size="s" />
          </span>
          {#if lead}<span class="fold-name">{section}</span>{:else}{section}{/if}
        </button>
        {#if lead}
          <a class="section-link tap" href={at(lead.href)} aria-current={here(lead.href) ? 'page' : undefined}>{section}</a>
        {/if}
      </h2>
      {/if}
      <ul class="group" data-shut={folded ? '' : undefined} inert={folded || undefined} aria-hidden={folded || undefined}>
        {#each rows as entry}
          <li>
            {@render navItem(entry, entry.title)}
          </li>
        {/each}
      </ul>
      {/if}
    {/each}

    <!-- The registers themselves. Native, never pack-positioned: a page can be uninstalled with the
         pack that declared it, and the collections underneath it still have to be reachable. -->
    <!-- "NEW LIST" SITS UNDER THE LISTS IT JOINS (FLD-1), the last row of the group. It opens the list screen on the
         new-list sheet at `NEW_LIST_PATH` in `record/list-write.ts`, written out here because importing that file would
         pull the record's write path into the shell's entry chunk (see `nav.ts`). -->
    {#snippet newListItem()}
      <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={here('/r/_new') ? 'page' : undefined}>
        <Icon name="plus" size="m" /><span class="item-name">{words.newList}</span>
      </a>
    {/snippet}
    {#if anyList}
    {#if icons}
      <hr class="sep" />
    {:else}
    <h2 class="section">
      <button type="button" class="fold tap" aria-expanded={!listsShut} onclick={() => fold(copy.lists)}>
        <span class="fold-mark" aria-hidden="true" data-shut={listsShut ? '' : undefined}>
          <Icon name="chevronDown" size="s" />
        </span>
        {said('lists')}
      </button>
    </h2>
    {/if}
    <ul class="group" data-shut={listsShut ? '' : undefined} inert={listsShut || undefined} aria-hidden={listsShut || undefined}>
      <!-- Every list this rail is given, and it is given only the ones that hold something: the
           filter is on `index.registers` in `api.ts`, because the phone's More sheet draws the same
           list and the two must not be able to disagree. -->
      {#each listsShown as r}
        <li>
          <a class="item tap" href={at(`/r/${r.id}`)} data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
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
            <a class="item view tap" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}>
              <span class="item-name">{v.name}</span>
            </a>
          {/each}
        </li>
      {/each}
      {#if listsFold}
        <!-- THE REST OF THE LISTS, ASKED FOR IN WORDS. It says how many are behind it, so the fold is a count and not a
             cliff, and it turns back into "Show fewer" once they are out. -->
        <li>
          <button type="button" class="item tap" aria-expanded={listsAll} onclick={() => (listsAll = !listsAll)}>
            <Icon name="more" size="m" />
            <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
          </button>
        </li>
      {/if}
      <li>{@render newListItem()}</li>
    </ul>
    {:else}
      <!-- A RECORD WITH NO LIST YET STILL HAS THE WAY TO MAKE ONE, which is when it is wanted most. -->
      <ul class="group">
        <li>{@render newListItem()}</li>
      </ul>
    {/if}

    {#if hiddenHere > 0}
      <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the rail is findable from the rail. -->
      <a class="pen tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hiddenHere)} data-hidden-row>
        <Icon name="eye" size="m" />
        <span class="pen-text">{copy.hiddenCount(hiddenHere)}</span>
        <span class="pen-action">{copy.showHidden}</span>
      </a>
    {/if}

    {#if pen.length}
      <!-- A holding pen. An update that adds a page lands HIDDEN and nothing moves; re-showing one
           returns it to its stored order, never to the end of the list (19 §3). -->
      <!-- The one row in this rail that had no glyph, sitting between groups that all have one.
           This file's own header argues against exactly that. -->
      <a class="pen tap" href={at('/settings/navigation')} data-label={words.suggested(pen.length)}>
        <Icon name="alert" size="m" />
        <span class="pen-text">{words.suggested(pen.length)}</span>
        <span class="pen-action">{copy.review}</span>
      </a>
    {/if}
  </div>

  <!--
    THE FOOT: SEARCH, THEN "MORE".

    SEARCH KEEPS ITS ROW. It is the one control here somebody presses all day, and it is the reason
    the disc fixed to the bottom-right corner could be taken off a desktop: that disc sat on top of
    whatever row happened to be beneath it. `⌘K` still opens the same surface from anywhere, and the
    row does not print the chord, because a key cap in the rail reads as a tool for people who
    already know the keys.

    "MORE" IS THE TOOLS NOBODY OPENS TWICE A DAY, AS LABELLED ROWS. They were six 16px glyphs in one
    strip (a clock, a star, a grid, two arrows, a shield, sliders), and nobody could tell History,
    Slash, Add-ons, Automations, Vault and Settings apart without hovering each one (design SYS-12).
    Slash and Automations went up to the spine; the four left are rows that say their names, in a
    group that folds like any other, under the heading the phone's sheet already uses for them.

    THE PROVENANCE SURFACE IS STILL HERE, which is worth saying because it was once reachable only
    by `⌘K`. "What happened to this record" is not an advanced feature.
  -->
  <div class="foot">
    <ul class="group">
      <li>
        <button type="button" class="item tap" data-label={copy.paletteLabel} onclick={() => (palette.open = true)}>
          <Icon name="search" size="m" /><span class="item-name">{copy.paletteLabel}</span>
        </button>
      </li>
    </ul>

    {#if icons}
      <hr class="sep" />
    {:else}
      <h2 class="section">
        <button type="button" class="fold tap" aria-expanded={!moreShut} onclick={() => fold(copy.more)}>
          <span class="fold-mark" aria-hidden="true" data-shut={moreShut ? '' : undefined}>
            <Icon name="chevronDown" size="s" />
          </span>
          {copy.more}
        </button>
      </h2>
    {/if}
    <ul class="group" data-shut={moreShut ? '' : undefined} inert={moreShut || undefined} aria-hidden={moreShut || undefined}>
      <li>
        <a class="item tap" href={at('/audit')} data-label={copy.audit} aria-current={under('/audit') ? 'page' : undefined}>
          <Icon name="clock" size="m" /><span class="item-name">{copy.audit}</span>
        </a>
      </li>
      <li>
        <a class="item tap" href={at('/packs')} data-label={copy.packs} aria-current={under('/packs') ? 'page' : undefined}>
          <Icon name="packs" size="m" /><span class="item-name">{copy.packs}</span>
        </a>
      </li>
      <li>
        <a class="item tap" href={at('/vault')} data-label={copy.vault} aria-current={under('/vault') ? 'page' : undefined}>
          <Icon name="vault" size="m" /><span class="item-name">{copy.vault}</span>
        </a>
      </li>
      <li>
        <!-- SETTINGS OPENS ON APPEARANCE AND IS "HERE" ON EVERY AREA, as the glyph it replaces was. -->
        <a class="item tap" href={at('/settings/appearance')} data-label={copy.settings} aria-current={under('/settings') ? 'page' : undefined}>
          <Icon name="settings" size="m" /><span class="item-name">{copy.settings}</span>
        </a>
      </li>
    </ul>
  </div>

  <!-- EVERY ITEM IS A KEY THAT ALREADY EXISTS, the same rule the row menu follows: the menu is not
       a second set of capabilities, it is the same set, discoverable by looking. Hide takes the page
       out of the rail and keeps it: Undo in the toast, the hidden row at the foot of the list, and
       Settings, Navigation all bring it back to the place it had. -->
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
      <!-- NO KEY CAPS IN THE MENU. `⌥↑` and `⌥↓` still move the focused row, and the `?` sheet is where they are said
           (design-brief §4, `Kbd`). -->
      <button class="mi" role="menuitem" type="button" onclick={() => move(entry.href, -1)}>
        <Icon name="arrowUp" size="s" />
        <span class="mi-name">{copy.moveUp}</span>
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => move(entry.href, 1)}>
        <Icon name="arrowDown" size="s" />
        <span class="mi-name">{copy.moveDown}</span>
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
        onclick={() => {
          /* TAKEN BEFORE THE MENU CLOSES: `entry` is read from `menuFor`, which closing empties. */
          const leaving = entry;
          menuFor = null;
          hide(leaving);
        }}
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
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--sunk);
  }

  /* THE HEAD OF THE RAIL: the record's name beside its tile, which is also the switcher, and the
     width control at the edge the rail ends at. */
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

  /* THE RECORD'S NAME HEADS THE RAIL, a step above the rows and at a title's weight.

     The first build drew it as letterspaced grey small caps under the logo, the shape of a label,
     sized as if the record's name were a footnote to the product's. It is the other way round: the
     record is what you are in, and the product is what you opened once. So it is the body step at
     600 beside a 20px tile with the record's initial, on the 44px height of a real target. */
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

  /* EVERY RECORD'S TILE IS DRAWN THE ONE WAY, in the menu as at the head, because it is the same
     mark for the same thing. `--t-xs` is the step `Face.svelte` uses for every letter in a tile. */
  .mi-avatar {
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
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* THE RECORD TILE WEARS THE ACCENT, one of the few places it may (design D-1). It was ink, the
     same fill as every "on" control, so the one mark that says which record this is read as one
     more switch. */
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
  /* `.item.view` AND NOT `.view`: `.item` is declared further down with `padding: 0 var(--sp-2)` at
     the same specificity, so the indent lost and every saved view sat flush against the rail edge. */
  .item.view {
    padding-inline-start: calc(var(--sp-2) * 2 + var(--icon-m));
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
   * THE CLIPPED EDGE FADES, AND THE SCROLL DRIVES IT, NOT SCRIPT (design SYS-12). The scroller's own
   * block timeline moves two fade lengths, the table region's technique in `lib/blocks.css`: the far
   * edge fades until the end is reached, the near edge once the list has left the start. A rail that
   * fits has no timeline, both lengths stay 0, and nothing fades. A row cut in half at the fold reads
   * as a broken screen; a row fading into the ground reads as "more below".
   */
  .scroll {
    flex: 1;
    min-block-size: 0;
    margin-block-start: var(--sp-2);
    padding-block-end: var(--sp-4);
    overflow-y: auto;
    /* A THIN BAR IN THE RAIL'S OWN INK. Without these Windows draws the classic 17px scrollbar with
       arrow buttons down the middle of the navigation. */
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  @property --rail-fade-start {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }

  @property --rail-fade-end {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }

  @keyframes rail-edges {
    0% {
      --rail-fade-start: 0px;
      --rail-fade-end: var(--sp-7);
    }

    4% {
      --rail-fade-start: var(--sp-7);
    }

    96% {
      --rail-fade-end: var(--sp-7);
    }

    100% {
      --rail-fade-start: var(--sp-7);
      --rail-fade-end: 0px;
    }
  }

  /* THE MASK READS ONLY ALPHA, so any opaque token draws the kept part; `--ink` is one. */
  @supports (animation-timeline: scroll()) {
    .scroll {
      mask-image: linear-gradient(
        to bottom,
        transparent,
        var(--ink) var(--rail-fade-start),
        var(--ink) calc(100% - var(--rail-fade-end)),
        transparent
      );
      animation: rail-edges linear both;
      animation-timeline: scroll(self block);
    }
  }

  /* A BROWSER WITHOUT SCROLL TIMELINES KEEPS THE OLD SIGNAL: two `local` covers in the rail's ground
     scroll with the content over two fixed shadows, so each shadow shows only while something is
     past its edge (Komarov's technique). */
  @supports not (animation-timeline: scroll()) {
    .scroll {
      background:
        linear-gradient(var(--sunk) 30%, transparent) top / 100% 20px no-repeat local,
        linear-gradient(transparent, var(--sunk) 70%) bottom / 100% 20px no-repeat local,
        linear-gradient(color-mix(in srgb, var(--ink) 10%, transparent), transparent) top / 100% 8px no-repeat scroll,
        linear-gradient(transparent, color-mix(in srgb, var(--ink) 10%, transparent)) bottom / 100% 8px no-repeat scroll;
    }
  }

  /* The bar appears only while the pointer is over the list, which is when it is any use. */
  .scroll:hover {
    scrollbar-color: color-mix(in srgb, var(--ink) 16%, transparent) transparent;
  }

  /* SENTENCE CASE, AND A STEP UP FROM WHERE IT WAS. It was letterspaced caps at 11px, on the
     argument that a group header is a ruler the eye scans rather than words it reads. Five of them
     down the rail read as a filing cabinet. The product this one is measured against names its
     sections in plain words and lets weight and space do the separating, and so does this. */
  .section {
    margin: var(--sp-4) 0 var(--sp-1);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
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

  /**
   * A HEADING THAT OPENS ITS OVERVIEW: the fold's mark, then the name as a link the rest of the row
   * wide. The fold shrinks to its mark and `.tap` grows it to a whole target; the name it still
   * carries is clipped rather than removed, so the button keeps its accessible name and the `prefs`
   * gate's `railShut` probe still reads the section from it.
   */
  .section[data-opens] {
    display: flex;
    align-items: center;
  }

  .section[data-opens] .fold {
    flex: none;
    inline-size: auto;
    padding-inline-end: 0;
  }

  .fold-name {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .section-link {
    display: flex;
    flex: 1;
    align-items: center;
    min-inline-size: 0;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    color: inherit;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .section-link:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* THE OVERVIEW IS "HERE" ON ITS HEADING the way any other page is on its row. */
  .section-link[aria-current='page'] {
    background: var(--selected);
    color: var(--ink);
  }

  .scroll .section:first-child {
    margin-block-start: var(--sp-2);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--rail-item-h);
    padding: 0 var(--sp-2);
    /* `blocks.css` draws a rule under every `.item` for its own lists, and that class name reaches
       this rail too, so rows followed by a saved view grew a line. The rail draws no rules. */
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

  /* "HERE" IS THE SELECTED SURFACE WITH AN INK GLYPH, AND IT WAS THE MARK'S RED. The glyph of the
     current row took the accent, the same red as an overdue dot in the table beside the rail, so
     "you are here" and "this is late" were one colour on every screen (design SYS-1, D-1).
     `--selected` is the one surface for what is on or current, mixed into the ground so it darkens
     in light and lightens in dark, and it comes after `:hover` so the current row keeps it under
     the pointer. */
  .item[aria-current='page'] {
    background: var(--selected);
    color: var(--ink);
  }

  .item[aria-current='page'] :global(.icon) {
    color: var(--ink);
  }

  /* Only the glyph takes it. The label stays `ink` so the row still reads as a row, and a rail of
     coloured words would be a rail nobody can scan. Same lightness and chroma as `IdentityMark`,
     which is what makes the mark in the grid and the row in the rail the same colour. */
  .swatch {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  .swatch::before {
    content: '';
    inline-size: var(--dot);
    block-size: var(--dot);
    border-radius: 2px;
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
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

  /* Questions waiting on you: the same quiet figure, in full ink and weight, so it is noticed
     without a glyph or a colour standing in for the meaning. */
  .tally[data-waiting] {
    color: var(--warn);
    font-weight: 500;
  }

  .item[aria-current='page'] .tally {
    color: inherit;
  }

  /* DRAWN AS A RAIL ROW, NOT A BOXED NOTICE, and on a rail row's measures. The glyph and the action
     word already say something is waiting; a wash and a border on top of them made it the loudest
     thing in the rail. */
  .pen {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--rail-item-h);
    margin-block-start: var(--sp-5);
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

  /* THE ACTION WORD IS INK AT A TITLE'S WEIGHT. It was the accent, which belongs only to the mark,
     the record tile, /start, /signin and `::selection` (design D-1). */
  .pen-action {
    color: var(--ink);
    font-weight: 600;
  }

  .foot {
    padding-block-start: var(--sp-2);
  }

  /* THE FOOT'S "MORE" HEADING SITS CLOSER THAN A SECTION IN THE SCROLLER DOES, because Search is
     directly above it and the foot is pinned: every step of space here is a row the lists lose. */
  .foot .section {
    margin-block-start: var(--sp-2);
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
    flex-direction: column;
    justify-content: center;
  }

  .rail[data-icons] .item,
  .rail[data-icons] .pen,
  .rail[data-icons] .record {
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
    inline-size: var(--dot);
    block-size: var(--dot);
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
