<!--
  The rail: a floating glass card (SYSTEM §5). From the top, the record switcher, the ask field, the places, the agents
  working now, and at the foot More and the person.

  ONE FLAT LIST, AND IT WAS THREE. The rail had a spine (Home, Decide, Inbox, Slash, Automations, Jobs), then every
  declared section with its pages under a folding heading, then a foot of Search and a More group, which for a founder
  was some eighteen places across three regions that each looked different. The owner's old tool had six in one bar, and
  that is what he read without thinking. So the list is `flatNav`'s (`lib/nav.ts`): Today, the sections a day runs
  through, Activity, Decide while something waits, and People and Services when there is room, seven at most. A
  section is one row that opens its lead page; a project's own page is not a row, because the Projects page lists them.

  EVERYTHING ELSE IS UNDER MORE, AT THE FOOT, FOLDED: the page Today replaced as the landing, the sections that did not
  fit, a section's other pages, the lists, and the tools nobody opens twice a day (Suggestions, Automations, Jobs,
  Add-ons, Vault, Settings). It opens itself on any of the places it holds, so the rail never loses "here".

  THE ASK FIELD IS THE PALETTE'S DOOR, drawn as the field it opens, with its `/` key. `/` or Ctrl K from anywhere opens
  the same palette. It is a button and not an input: the palette owns the typing.

  WORKING NOW IS WHO IS AT IT, read as Today reads it (`readWorking` in `record/boot-live.ts`), and absent when nobody is.
  Each run is a face in a `--live` ring, the project's name and how long the run has been open. The ring is whole while
  the run is heard from and faint once it has gone quiet: no run reports its steps, so the arc has no progress to draw
  and does not pretend to.

  NO CHORD HINTS IN THE ROWS. `g h`, `g d` and `g 1`–`g 9` still work, and the `?` sheet is where they are said.

  EVERY ROW WEARS A GLYPH IN A WELL, declared rather than guessed, and a list with nothing declared gets the glyph for a
  list. The chosen row's well is ink.

  THE GLASS IS ON A PSEUDO-ELEMENT, NOT ON THE `nav`. A `backdrop-filter` makes its element the box every fixed
  descendant is placed against, and the narrow rail's flyout and the switcher's menu both escape the card.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import { OVERVIEW, isHere, orderLists, placeOf, type FlatItem } from '../nav.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import type { NavEntry } from '../record/api.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import IconWell from './IconWell.svelte';
  import Kbd from './Kbd.svelte';
  import Mark from './Mark.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  import type { Shell, Working } from '../record/boot-live.ts';
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
    working = [],
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
    /** The agents at work now (`readWorking`); the group is not drawn while this is empty. */
    working?: readonly Working[] | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /** The words the rail says itself, kept beside the one component that says them (design DSN-11). */
  const words = {
    unnamed: 'My BrainDog',
    ask: 'Ask, add or find',
    moreLists: (n: number) => `Show ${n} more`,
    fewerLists: 'Show fewer',
    /* FLD-1's row under the lists, said only here. */
    newList: 'New list',
    /* THE HOLDING PEN'S ROW (PGS-18): how many offers wait, and Settings, Navigation says what they are. */
    suggested: (n: number) => `${n} suggested`,
    working: 'Working now',
    quiet: 'gone quiet',
    agent: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
    you: 'You',
    account: 'Your account and settings',
  } as const;

  /**
   * THE HEAD ALWAYS NAMES THE RECORD, beside the mark. The fallback is the owner's first name, then "My BrainDog". `boot`
   * names people by id to the owner, so the caller is the only owner this screen can put a name to.
   */
  const shell = $derived(page.data as unknown as Partial<Shell>);
  const nameOf = (id: string | undefined): string =>
    id && shell.names && Object.hasOwn(shell.names, id) ? (shell.names[id] ?? '').trim() : '';
  const ownerFirst = $derived(shell.me?.owner ? (nameOf(shell.me.person).split(/\s+/u)[0] ?? '') : '');
  const recordName = $derived(record.trim() || ownerFirst || words.unnamed);
  /* THE PERSON AT THE FOOT, by the name the record told this reader, else "You". */
  const person = $derived(nameOf(shell.me?.person) || words.you);

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
    { href: '/slash', label: copy.suggestions, icon: 'slash', title: copy.slashRail },
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

  /* MORE OPENS DOWNWARDS FROM THE FOOT, so the rail's scroller is moved to put its heading at the top and what it
     holds in view. By hand and not `scrollIntoView`, which would also scroll the window this shell holds still. */
  let scroller = $state<HTMLElement>();
  let foldAt = $state<HTMLElement>();
  async function toggleMore() {
    const opening = moreShut;
    moreAsked = opening;
    if (!opening) return;
    await tick();
    if (scroller && foldAt) scroller.scrollTop += foldAt.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  }

  /* HOW LONG EACH RUN HAS BEEN OPEN, short: "8 min", "1 h 08", "2 d". The clock moves once a minute while anybody works. */
  let now = $state(Date.now());
  $effect(() => {
    if (working.length === 0) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  function lasted(since: string | null): string {
    const from = since === null ? Number.NaN : Date.parse(since);
    if (!Number.isFinite(from)) return '';
    const min = Math.max(1, Math.floor((now - from) / 60_000));
    if (min < 60) return `${min} min`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
    return `${Math.floor(min / (24 * 60))} d`;
  }
  const runName = (w: Working): string => w.project ?? (w.doing || words.agent(w.agent));
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
          <Mark height={20} />
          <span class="record-name">{recordName}</span>
          <Icon name="chevronDown" size="m" />
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
    <!-- THE WIDTH CONTROL says what it will do, not what happened. `⌘\` still works. It shows on the card's hover and
         focus, and is always there under a thumb. -->
    <button
      type="button"
      class="width tap"
      data-label={icons ? copy.showSidebar : copy.collapseSidebar}
      aria-label={icons ? copy.showSidebar : copy.collapseSidebar}
      title={icons ? copy.showSidebar : copy.collapseSidebar}
      onclick={() => ontoggle?.()}
    >
      <Icon name="chevron" size="s" />
    </button>
  </div>

  <!-- THE ASK FIELD: the palette, drawn as the field it opens. Its two keys are in the tooltip, and `/` on the cap. -->
  <button type="button" class="ask tap" data-label={words.ask} aria-label={words.ask} aria-keyshortcuts="/ Control+K Meta+K" title={copy.searchKeys} onclick={() => (palette.open = true)}>
    <Icon name="search" size="m" />
    <span class="ask-words">{words.ask}</span>
    <span class="ask-key" aria-hidden="true"><Kbd keys="/" /></span>
  </button>

  <div class="scroll" bind:this={scroller}>
    <!-- THE PLACES. Decide carries how many questions wait, as the red square, and named, not only coloured (13 §5.1). -->
    <ul class="group main">
      {#each main as item (item.key)}
        <li>
          <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={isHere(item, path) ? 'page' : undefined}>
            <IconWell name={item.icon as IconName} tone={isHere(item, path) ? 'ink' : undefined} /><span class="item-name">{item.label}</span>
            {#if item.count}<span
                class="tally num"
                data-waiting={item.key === 'decide' ? '' : undefined}
                aria-label={item.key === 'decide' ? `${item.count} ${copy.openQuestions}` : undefined}>{item.count}</span
              >{/if}
          </a>
        </li>
      {/each}
    </ul>

    <!-- WORKING NOW: one row per run at work, and nothing at all while nobody is. -->
    {#if working.length > 0}
      <section class="working" aria-labelledby="rail-working">
        {#if icons}<hr class="sep" />{/if}
        <h2 class="sub" id="rail-working" data-clip={icons ? '' : undefined}>{words.working}</h2>
        <ul class="group">
          {#each working as w, i (w.seq ?? `run-${i}`)}
            {@const name = runName(w)}
            {@const took = lasted(w.since)}
            <li>
              <svelte:element
                this={w.seq === null ? 'div' : 'a'}
                class="run tap"
                href={w.seq === null ? undefined : at(`/r/session/${w.seq}`)}
                data-label={name}
                aria-label={[`${words.agent(w.agent)}: ${name}`, took, w.quiet ? words.quiet : ''].filter(Boolean).join(', ')}
              >
                <span class="face" data-quiet={w.quiet ? '' : undefined} aria-hidden="true">
                  <svg class="ring" viewBox="0 0 28 28" focusable="false"><circle cx="14" cy="14" r="13" /></svg>
                  <span class="face-disc"><Icon name={w.glyph} size="s" /></span>
                </span>
                <span class="item-name" aria-hidden="true">{name}</span>
                {#if took}<span class="tally num" aria-hidden="true">{took}</span>{/if}
              </svelte:element>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="more">
      {#if icons}
        <hr class="sep" />
      {:else}
        <h2 class="section" bind:this={foldAt}>
          <button type="button" class="fold item tap" aria-expanded={!moreShut} onclick={() => void toggleMore()}>
            <span class="more-glyph"><Icon name="more" size="l" /></span>
            <span class="item-name">{copy.more}</span>
            <span class="fold-mark" aria-hidden="true" data-shut={moreShut ? '' : undefined}>
              <Icon name="chevronDown" size="s" />
            </span>
          </button>
        </h2>
      {/if}

      <div class="more-body" data-shut={moreShut ? '' : undefined} inert={moreShut || undefined} aria-hidden={moreShut || undefined}>
        <ul class="group">
          <!-- THE PAGE THE RECORD OPENED ON BEFORE TODAY, kept and reachable, not the landing. -->
          <li>
            <a class="item tap" href={at(OVERVIEW)} data-nav data-label={copy.overview} aria-current={path === OVERVIEW ? 'page' : undefined}>
              <IconWell name="observe" tone={path === OVERVIEW ? 'ink' : undefined} /><span class="item-name">{copy.overview}</span>
            </a>
          </li>
          {#each more as item (item.key)}
            <li>
              <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={isHere(item, path) ? 'page' : undefined}>
                <IconWell name={item.icon as IconName} tone={isHere(item, path) ? 'ink' : undefined} /><span class="item-name">{item.label}</span>
              </a>
            </li>
          {/each}
          {#each pages as entry (entry.href)}
            <li>
              <a class="item tap" href={at(entry.href)} data-nav data-label={entry.title} aria-current={path === entry.href ? 'page' : undefined}>
                <IconWell name={entry.icon} tone={path === entry.href ? 'ink' : undefined} /><span class="item-name">{entry.title}</span>
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
              <a class="item tap" href={at(`/r/${r.id}`)} data-nav data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
                <IconWell name={r.icon} tone={under(`/r/${r.id}`) ? 'ink' : undefined} />
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
                <IconWell name="more" />
                <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
              </button>
            </li>
          {/if}
          <li>
            <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={path === '/r/_new' ? 'page' : undefined}>
              <IconWell name="plus" tone={path === '/r/_new' ? 'ink' : undefined} /><span class="item-name">{words.newList}</span>
            </a>
          </li>
        </ul>

        {#if icons}<hr class="sep" />{/if}
        <ul class="group tools">
          {#each tools as t (t.href)}
            <li>
              <a class="item tap" href={at(t.href)} data-label={t.label} title={t.title} aria-current={under(t.href) ? 'page' : undefined}>
                <IconWell name={t.icon} tone={under(t.href) ? 'ink' : undefined} /><span class="item-name">{t.label}</span>
                {#if t.count}<span class="tally num">{t.count}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>

        {#if hidden > 0}
          <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the nav is findable from the nav. -->
          <a class="item pen tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hidden)} data-hidden-row>
            <IconWell name="eye" />
            <span class="item-name">{copy.hiddenCount(hidden)}</span>
            <span class="pen-action">{copy.showHidden}</span>
          </a>
        {/if}

        {#if pen.length}
          <!-- A holding pen: an update that adds a page lands hidden and nothing moves until somebody keeps it. -->
          <a class="item pen tap" href={at('/settings/navigation')} data-label={words.suggested(pen.length)}>
            <IconWell name="alert" />
            <span class="item-name">{words.suggested(pen.length)}</span>
            <span class="pen-action">{copy.review}</span>
          </a>
        {/if}
      </div>
    </div>
  </div>

  <!-- THE PERSON: a face, the name, and the way to their account and settings. -->
  <div class="me">
    <span class="me-face" aria-hidden="true">{person.slice(0, 1)}</span>
    <span class="me-name">{person}</span>
    <a class="me-more tap" href={at('/settings')} data-label={words.account} aria-label={words.account} title={words.account}>
      <Icon name="more" size="m" />
    </a>
  </div>

  <!-- `position: fixed`, so the one thing in this component that has to escape the scroller can. `aria-hidden`,
       because the row it names already carries that name. -->
  {#if fly}<span class="flyout" aria-hidden="true" style="--fly-y:{fly.y}px">{fly.label}</span>{/if}
</nav>

<style>
  /* The kinds of row in the rail that are buttons rather than links, reset to the row's shape. */
  button.item {
    inline-size: 100%;
    background: none;
    border: 0;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /**
   * THE CARD: glass, 216 wide, radius 22, padding 10, floating on the ground at level 2. The shell places it 12 in from
   * the window on three sides (`.rail-slot`).
   */
  .rail {
    --rail-icons: calc(var(--tap) + var(--sp-2) * 2);
    --fly-x: calc(var(--inset) + var(--rail));

    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100%;
    padding: 10px;
    border-radius: var(--r-lg);
  }

  .rail::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    pointer-events: none;
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .top .who {
    flex: 1;
    min-inline-size: 0;
  }

  /* The mark, the record's name in Geist 600 and a chevron, 40 tall. */
  .record {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 40px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
    transition: background var(--d-state) var(--ease-out);
  }

  :global(.menu-trigger:hover) .record,
  :global(.menu-trigger[aria-expanded='true']) .record {
    background: var(--hover-wash);
  }

  .record :global(.icon) {
    color: var(--dim);
  }

  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-base);
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

  .mi-avatar {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    flex: none;
    background: var(--ink);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .mi-name,
  .record-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mi-level {
    padding: 1px 6px;
    background: var(--s1);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  /* A sentence, not a row: nothing happens when it is pressed. */
  .mi-note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .mi-rule {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* THE WIDTH CONTROL, quiet until the card is pointed at or holds the focus. A thumb has no pointing, so it stays. */
  .width {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--dim);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--d-state) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  .rail:hover .width,
  .rail:focus-within .width {
    opacity: 1;
  }

  @media (hover: none) {
    .width {
      opacity: 1;
    }
  }

  .width:hover {
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

  /* THE ASK FIELD: 36 tall, the wash on glass, the search glyph, the words in `--dim` and the `/` cap at its end. */
  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    margin-block-start: 6px;
    padding: 0 6px 0 10px;
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-md);
    color: var(--dim);
    font: inherit;
    font-size: var(--t-base);
    text-align: start;
    cursor: text;
    transition: background var(--d-state) var(--ease-out);
  }

  .ask:hover {
    background: var(--selected);
  }

  .ask :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ask-key {
    display: inline-flex;
    flex: none;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .main {
    margin-block-start: var(--sp-3);
  }

  /* THE PLACES AT THE TOP, MORE AT THE FOOT, and one scroller for both, so an open More scrolls rather than pushing the
     places off the card. */
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

  /* AN AUTHOR RULE, because `hidden` is a user-agent one and loses to any `display` written here. */
  .more-body[data-shut] {
    display: none;
  }

  .more {
    margin-block-start: auto;
    padding-block-start: var(--sp-4);
  }

  .section {
    margin: 0;
    font: inherit;
  }

  /* A group heading on the card: 13/500 in `--dim`, as Working now's is. */
  .sub {
    margin: var(--sp-4) 0 var(--sp-1);
    padding-inline: 10px;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  .tools {
    margin-block-start: var(--sp-3);
  }

  /* THE MARK TURNS RATHER THAN BEING SWAPPED, and says which way the group is about to go. */
  .fold-mark {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--dim);
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-shut] {
    transform: rotate(-90deg);
  }

  /* A PLACE: 36 tall, an 18px glyph in a 26px well, the name 14/500, and a count at the end in `--dim`. */
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--rail-item-h);
    padding: 0 10px 0 5px;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* THE RAIL'S WELL IS 26, TWO UNDER A TILE'S (SYSTEM §5), and on glass its rest fill is the wash rather than
     `tile-2`, which would read as a white chip on the card. The chosen well is `IconWell`'s own ink. */
  .item :global(.well) {
    inline-size: 26px;
    block-size: 26px;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .item :global(.well:not([data-tone])) {
    background: var(--hover-wash);
  }

  /* More's own glyph needs no well: it is the foot of the card, not a place. */
  .more-glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    color: var(--ink2);
  }

  .more-glyph :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .item:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* "HERE" IS AN INK WELL, THE NAME AT 600 AND A WHITE ROW, never the mark's red (design SYS-1, D-1). */
  .item[aria-current='page'] {
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    color: var(--ink);
    font-weight: 600;
  }

  .item-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Indented to where a well would end, so a saved view reads as belonging to the list above it. */
  .item.view {
    padding-inline-start: calc(5px + 26px + 10px);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .tally {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE FILLED BADGE: Decide's count as the red square, because it is the count that needs him. */
  .tally[data-waiting] {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 20px;
    block-size: 20px;
    padding: 0 5px;
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-weight: 600;
    line-height: 1;
  }

  .pen-action {
    flex: none;
    color: var(--ink);
    font-weight: 600;
  }

  /* ── Working now ─────────────────────────────────────────────────────────── */

  .working {
    margin-block-start: var(--sp-2);
  }

  /* One run, 32 tall: the face in its ring, the project, and how long, right-aligned. */
  .run {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    padding: 0 10px 0 4px;
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  a.run:hover {
    background: var(--hover-wash);
  }

  /* A 22px disc inside a 2px `--live` ring: whole while the run is heard from, faint once it has gone quiet. */
  .face {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
  }

  .ring {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    fill: none;
    stroke: var(--live);
    stroke-width: 2;
  }

  .face[data-quiet] .ring {
    stroke-opacity: 0.35;
  }

  .face-disc {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    background: var(--ink2);
    border-radius: var(--r-pill);
    color: var(--on-ink);
  }

  /* ── The foot ─────────────────────────────────────────────────────────── */

  .me {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--tap);
    padding: 0 var(--sp-1);
  }

  .me-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    background: var(--ink);
    border-radius: var(--r-pill);
    color: var(--on-ink);
    font-size: var(--t-sm);
    font-weight: 600;
    line-height: 1;
  }

  .me-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .me-more {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    color: var(--dim);
    transition: background var(--d-state) var(--ease-out);
  }

  .me-more:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .sep {
    margin: var(--sp-3) var(--sp-2) var(--sp-2);
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* ── The narrow rail ──────────────────────────────────────────────────── */

  .rail[data-icons] {
    --fly-x: calc(var(--inset) + var(--rail-icons));

    inline-size: var(--rail-icons);
    padding-inline: var(--sp-2);
  }

  .rail[data-icons] .top {
    flex-direction: column;
    justify-content: center;
  }

  .rail[data-icons] .item,
  .rail[data-icons] .run,
  .rail[data-icons] .record,
  .rail[data-icons] .ask,
  .rail[data-icons] .me {
    position: relative;
    justify-content: center;
    gap: 0;
    min-block-size: var(--tap);
    padding-inline: 0;
  }

  .rail[data-icons] .ask {
    border-radius: var(--r-pill);
  }

  /* CLIPPED, NEVER REMOVED: the name is the row's accessible name at both widths, and the flyout is a copy for the eye. */
  .rail[data-icons] .item-name,
  .rail[data-icons] .pen-action,
  .rail[data-icons] .record-name,
  .rail[data-icons] .ask-words,
  .rail[data-icons] .me-name,
  .sub[data-clip] {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rail[data-icons] .ask-key,
  .rail[data-icons] .me-face,
  .rail[data-icons] .run .tally,
  .rail[data-icons] .record :global(.icon) {
    display: none;
  }

  /* A COUNT BECOMES A DOT ON THE CORNER OF THE GLYPH at this width; the figure stays in the row's name. */
  .rail[data-icons] .item .tally {
    position: absolute;
    inset-block-start: var(--sp-1);
    inset-inline-end: var(--sp-1);
    inline-size: var(--dot);
    min-inline-size: 0;
    block-size: var(--dot);
    padding: 0;
    background: var(--dim);
    border-radius: var(--r-pill);
    overflow: hidden;
    text-indent: 100%;
    white-space: nowrap;
  }

  .rail[data-icons] .item .tally[data-waiting] {
    background: var(--danger);
  }

  .rail[data-icons] .view {
    display: none;
  }

  .flyout {
    position: fixed;
    inset-block-start: var(--fly-y);
    inset-inline-start: calc(var(--fly-x) + var(--sp-2));
    z-index: var(--z-hint);
    padding: var(--sp-1) var(--sp-3);
    background: var(--glass-strong);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    color: var(--ink);
    font-size: var(--t-sm);
    white-space: nowrap;
    pointer-events: none;
    translate: 0 -50%;
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .rail::before {
      border: 1px solid CanvasText;
    }
  }
</style>
