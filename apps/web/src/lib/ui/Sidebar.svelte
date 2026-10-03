<!--
  The rail: a floating glass card. From the top, the record switcher, the ask field, the places, the agents
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
  Each run is a face in a `--live` ring, the project's name and how long the run has gone. The ring is whole while
  the run is heard from and faint once it has gone quiet: no run reports its steps, so the arc has no progress to draw
  and does not pretend to.

  NO CHORD HINTS IN THE ROWS. `g h`, `g d` and `g 1`–`g 9` still work, and the `?` sheet is where they are said.

  EVERY ROW WEARS A GLYPH, declared rather than guessed, and a list with nothing declared gets the glyph for a list. The
  glyphs sit bare on the glass, with no well round each: the card is the one box, and the rows are a list without boxes.
  The row you are on is an ink wash with its glyph and name in ink, never a filled pill, and the only red on the card is
  the count of what waits on you.

  THE GLASS IS ON A PSEUDO-ELEMENT, NOT ON THE `nav`. A `backdrop-filter` makes its element the box every fixed
  descendant is placed against, and the narrow rail's flyout and the switcher's menu both escape the card. It is also
  what moves when the card narrows or widens: the pseudo-element is scaled, never the card's width (`morphs` below).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import { isHere, orderLists, placeOf, type FlatItem } from '../nav.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import * as pref from '../pref.ts';
  import type { NavEntry } from '../record/api.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import AgentMark from './AgentMark.svelte';
  import { isMarked } from './agent-marks.ts';
  import Kbd from './Kbd.svelte';
  import Mark from './Mark.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  import type { Shell, Working } from '../record/boot-live.ts';
  import type { SpineKey } from '../spine.ts';

  /**
   * One run at work, and how long it has gone in seconds when the read says (`ran_s`, the record's `runAge`): to the
   * clock while it works, and frozen where it was last heard from once it has gone quiet.
   */
  type Run = Working & { ran_s?: number };

  let {
    main,
    more = [],
    groups = [],
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
    /** Each section's pages past the one its row opens, a Board beside Work and a project's own page (`flatNav`). */
    groups?: readonly (readonly [string, readonly NavEntry[]])[] | undefined;
    /** How many pages the reader hid from the nav, so the way back is on the rail. */
    hidden?: number | undefined;
    /** The holding pen's offers (`boot`'s `pen`); the rail says only how many. */
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
    working?: readonly Run[] | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /** The words the rail says itself, kept beside the one component that says them. */
  const words = {
    unnamed: 'My BrainDog',
    ask: 'Ask, add or find',
    moreLists: (n: number) => `Show ${n} more`,
    fewerLists: 'Show fewer',
    /* The new-list row under the lists, said only here. */
    newList: 'New list',
    /* THE HOLDING PEN'S ROW: how many offers wait, and Settings, Navigation says what they are. */
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
    ...(spine.includes('inbox') && !navPrefs.isHidden('/inbox') ? [{ href: '/inbox', label: said('inbox'), icon: 'inbox' as const, count: inbox }] : []),
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
    more.some((i) => isHere(i, path)) ||
      groups.some(([, list]) => list.some((e) => under(e.href))) ||
      tools.some((t) => under(t.href)) ||
      path.startsWith('/r/') ||
      path.startsWith('/v/') ||
      path.startsWith('/settings'),
  );
  const moreShut = $derived(!icons && !moreAsked && !inMore);

  /**
   * A SECTION UNDER MORE FOLDS ON ITS OWN, AND STAYS FOLDED (`railShut`, per device): a person who does not run projects
   * folds Projects once. A section holding the screen you are on is never shut, so the rail never loses "here", and the
   * narrow rail folds nothing, since it has no heading to press.
   */
  let shut = $state(new Set(pref.read().railShut ?? []));
  function fold(section: string) {
    const next = new Set(shut);
    if (!next.delete(section)) next.add(section);
    shut = next;
    pref.write({ railShut: [...next] });
  }
  const isShut = (section: string, list: readonly NavEntry[]) => !icons && shut.has(section) && !list.some((e) => under(e.href));

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

  /* HOW LONG EACH RUN HAS GONE, short: "8 min", "1 h 08", "2 d". The clock moves once a minute while anybody works. */
  let now = $state(Date.now());
  $effect(() => {
    if (working.length === 0) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  /**
   * A RUN'S AGE IS THE RECORD'S `runAge`, AND IT STOPS WHEN THE RUN DOES. A run at work is as old as the clock says, which
   * is the minute tick above; a run gone quiet is as old as it was when last heard from, the `ran_s` its read carries.
   * Counted to the clock, a run quiet since Monday read as three days of work.
   */
  function age(w: Run): string {
    const from = w.since === null ? Number.NaN : Date.parse(w.since);
    const seconds = w.quiet && w.ran_s !== undefined ? w.ran_s : (now - from) / 1000;
    if (!Number.isFinite(seconds)) return '';
    const min = Math.max(1, Math.floor(seconds / 60));
    if (min < 60) return `${min} min`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
    return `${Math.floor(min / (24 * 60))} d`;
  }
  const runName = (w: Working): string => w.project ?? (w.doing || words.agent(w.agent));

  /**
   * THE WIDTH CHANGES ON TRANSFORM AND OPACITY ALONE.
   *
   * The card takes its new width in one frame, because the shell's column is `auto` and a width that animated would lay
   * the whole window out sixty times a second. What moves is the glass: its `::before` is scaled from the width the card
   * had to the one it has, along the inline axis from the card's start, and lands on its own box at scale 1, so the last
   * frame is the card itself. The words fade back as it widens, and go at once as it narrows: a word half gone over a
   * card already narrow reads as a fault.
   *
   * IN SCRIPT AND NOT IN THE STYLESHEET, because the rail's styles ride in the entry stylesheet every visit loads, and
   * because the two widths, the direction and the timing tokens are only known once the card has drawn. MEASURED, NOT
   * ASSUMED: the widths are read off the card before and after, so whatever moves either one moves this with it.
   * Nothing runs on the first draw, for a reader who asked for less motion, or where an animation cannot reach `::before`.
   */
  const WORDS = '.item-name, .tally, .pen-action, .record-name, .ask-words, .ask-key, .me-name, .me-face, .sub, .fold-mark';
  let card = $state<HTMLElement>();
  let drawn: boolean | undefined;
  let morphs: Animation[] = [];
  const moves = (): boolean =>
    typeof matchMedia === 'function' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    typeof KeyframeEffect === 'function' &&
    'pseudoElement' in KeyframeEffect.prototype;
  /* A duration token in milliseconds, whichever unit it is written in. */
  const ms = (style: CSSStyleDeclaration, token: string, fallback: number): number => {
    const raw = style.getPropertyValue(token).trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : fallback;
  };
  $effect.pre(() => {
    const narrow = icons;
    const el = untrack(() => card);
    if (drawn === undefined || drawn === narrow || el === undefined) return void (drawn = narrow);
    drawn = narrow;
    /* A MORPH STILL RUNNING ENDS HERE, so the next one starts from the card and not from its middle. */
    for (const a of morphs.splice(0)) a.cancel();
    if (!moves()) return;
    const was = el.getBoundingClientRect().width;
    void tick().then(() => {
      const width = el.getBoundingClientRect().width;
      if (!(was > 0 && width > 0) || Math.abs(was - width) < 1) return;
      const style = getComputedStyle(el);
      const timing = { duration: ms(style, '--d-move', 220), easing: style.getPropertyValue('--ease-out').trim() || 'ease-out' };
      /* AN ORIGIN HAS NO LOGICAL FORM, so a right-to-left card scales from its right, which is its start. */
      const origin = style.direction === 'rtl' ? '100% 50%' : '0 50%';
      try {
        morphs.push(el.animate({ scale: [`${was / width} 1`, '1 1'], transformOrigin: [origin, origin] }, { ...timing, pseudoElement: '::before' }));
        if (!narrow) for (const w of el.querySelectorAll(WORDS)) morphs.push(w.animate({ opacity: [0, 1] }, timing));
      } catch {
        /* A timing a browser cannot read is a width that changes in one frame, which is what it did before. */
      }
    });
  });
</script>

<nav
  class="rail"
  aria-label="Record"
  bind:this={card}
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
            <span class="glyph"><Icon name={item.icon as IconName} size="l" /></span><span class="item-name">{item.label}</span>
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
            {@const took = age(w)}
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
                  <span class="face-disc" data-marked={isMarked(w.kind) ? '' : undefined}><AgentMark kind={w.kind} size="s" /></span>
                </span>
                <span class="item-name" aria-hidden="true">{name}</span>
                {#if took}<span class="tally num" aria-hidden="true">{took}</span>{/if}
              </svelte:element>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="foot">
      {#if icons}
        <hr class="sep" />
      {:else}
        <h2 class="section" bind:this={foldAt}>
          <button type="button" class="fold item tap" aria-expanded={!moreShut} onclick={() => void toggleMore()}>
            <span class="glyph"><Icon name="more" size="l" /></span>
            <span class="item-name">{copy.more}</span>
            <span class="fold-mark" aria-hidden="true" data-shut={moreShut ? '' : undefined}>
              <Icon name="chevronDown" size="s" />
            </span>
          </button>
        </h2>
      {/if}

      <div class="more-body" data-shut={moreShut ? '' : undefined} inert={moreShut || undefined} aria-hidden={moreShut || undefined}>
        {#if more.length > 0}
          <ul class="group">
            {#each more as item (item.key)}
              <li>
                <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={isHere(item, path) ? 'page' : undefined}>
                  <span class="glyph"><Icon name={item.icon as IconName} size="l" /></span><span class="item-name">{item.label}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}

        <!-- EACH SECTION'S OTHER PAGES UNDER ITS OWN NAME, in the reader's order. A section of one is a row and not a
             folder; the fold's text is the section's name, so it is announced "Projects, collapsed, button". -->
        {#snippet page(entry: NavEntry)}
          <li>
            <a class="item tap" href={at(entry.href)} data-nav data-label={entry.title} aria-current={path === entry.href ? 'page' : undefined}>
              <span class="glyph"><Icon name={entry.icon} size="l" /></span><span class="item-name">{entry.title}</span>
            </a>
          </li>
        {/snippet}
        {#each groups as [section, list] (section)}
          {#if list.length === 1}
            <ul class="group">{@render page(list[0]!)}</ul>
          {:else}
            {@const folded = isShut(section, list)}
            {#if icons}
              <hr class="sep" />
            {:else}
              <h3 class="sub">
                <button type="button" class="fold tap" aria-expanded={!folded} onclick={() => fold(section)}>
                  {section}<span class="fold-mark" aria-hidden="true" data-shut={folded ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
                </button>
              </h3>
            {/if}
            <ul class="group" data-shut={folded ? '' : undefined} inert={folded || undefined}>
              {#each list as entry (entry.href)}{@render page(entry)}{/each}
            </ul>
          {/if}
        {/each}

        <!-- THE LISTS, UNDER THEIR OWN WORD. Native, never pack-positioned: a page can go with the add-on that declared
             it, and the rows underneath still have to be reachable. "New list" is the last row. -->
        {#if !icons}<h3 class="sub">{said('lists')}</h3>{:else}<hr class="sep" />{/if}
        <ul class="group">
          {#each listsShown as r}
            <li>
              <a class="item tap" href={at(`/r/${r.id}`)} data-nav data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
                <span class="glyph"><Icon name={r.icon} size="l" /></span>
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
                <span class="glyph"><Icon name="more" size="l" /></span>
                <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
              </button>
            </li>
          {/if}
          <li>
            <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={path === '/r/_new' ? 'page' : undefined}>
              <span class="glyph"><Icon name="plus" size="l" /></span><span class="item-name">{words.newList}</span>
            </a>
          </li>
        </ul>

        {#if icons}<hr class="sep" />{/if}
        <ul class="group tools">
          {#each tools as t (t.href)}
            <li>
              <a class="item tap" href={at(t.href)} data-label={t.label} title={t.title} aria-current={under(t.href) ? 'page' : undefined}>
                <span class="glyph"><Icon name={t.icon} size="l" /></span><span class="item-name">{t.label}</span>
                {#if t.count}<span class="tally num">{t.count}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>

        {#if hidden > 0}
          <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the nav is findable from the nav. -->
          <a class="item pen tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hidden)} data-hidden-row>
            <span class="glyph"><Icon name="eye" size="l" /></span>
            <span class="item-name">{copy.hiddenCount(hidden)}</span>
            <span class="pen-action">{copy.showHidden}</span>
          </a>
        {/if}

        {#if pen.length}
          <!-- A holding pen: an update that adds a page lands hidden and nothing moves until somebody keeps it. -->
          <a class="item pen tap" href={at('/settings/navigation')} data-label={words.suggested(pen.length)}>
            <span class="glyph"><Icon name="alert" size="l" /></span>
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
  /* The kinds of row in the rail that are buttons rather than links, reset to the row's shape. A control already takes
     the body face (`base.css`), so no rule here restates it. */
  button.item {
    inline-size: 100%;
    background: none;
    border: 0;
    text-align: start;
    cursor: pointer;
  }

  /**
   * THE CARD: glass, 216 wide, radius 22, padding 10, floating on the ground at level 2. The shell places it 12 in from
   * the window on three sides (`.rail-slot`). Its glass is the only glass on it: a row, the ask field and the place you
   * are on are washes laid on the card, never glass on glass.
   *
   * ITS OWN RADII, NOT THE REFERENCE'S: 22 for the card and 12 for a row (`--r-lg`, `--r-md`, `loop/design/SYSTEM.md`),
   * concentric across the card's 10 of padding. DIRECTION 37 keeps the reference's measurements out, as §34 did.
   */
  .rail {
    --fly-x: calc(var(--inset) + var(--rail));
    /* THE CHROME READS A STEP UNDER THE PAGE IT FRAMES: 14 beside the 15 body, one over the meta step, so the names on
       the card stay calm while the reading text grows. */
    --rail-text: calc(var(--t-sm) + 1px);

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
    font-size: var(--t-row);
    font-weight: 600;
    transition: background var(--d-state) var(--ease-out);
  }

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
    font-size: var(--rail-text);
    text-decoration: none;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

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

  .rail:focus-within .width {
    opacity: 1;
  }

  @media (hover: none) {
    .width {
      opacity: 1;
    }
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
    font-size: var(--rail-text);
    text-align: start;
    cursor: text;
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

  /* A LIST WITHOUT BOXES: rows 2 apart on the glass, and the space between groups says where one ends. */
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

  /* AN AUTHOR RULE, because `hidden` is a user-agent one and loses to any `display` written here. */
  .more-body[data-shut],
  .group[data-shut] {
    display: none;
  }

  /* NOT `.more`, which `controls.css` dims on press: a press on any row under it dimmed the whole group. */
  .foot {
    margin-block-start: auto;
    padding-block-start: var(--sp-4);
  }

  .section {
    margin: 0;
    font: inherit;
  }

  /* A QUIET HEADING OVER A GROUP: 13/500 in `--dim`, as Working now's is, and no rule under it. */
  .sub {
    margin: var(--sp-4) 0 var(--sp-1);
    padding-inline: 10px;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  /* A SECTION'S HEADING UNDER MORE IS ITS FOLD: the name, then the mark that turns. */
  .sub .fold {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
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

  /* A PLACE: 36 tall, an 18px glyph, the name 14/500, and a count at the end in `--dim`. */
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--rail-item-h);
    padding: 0 10px 0 5px;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--rail-text);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out),
      scale var(--d-release) var(--ease-out);
  }

  /* THE GLYPH, BARE ON THE GLASS: 18 in a 26 slot, so every name starts on one line whatever its glyph's own width. It
     takes its row's ink, so the glyph and the name are always one colour, at rest, under the pointer and here. */
  .glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
  }

  .glyph :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  /* "HERE" IS AN INK WASH, ink at 8%, with the glyph and the name in ink at 600: the white 8% the design system gives the
     chosen rail row in the dark (SYSTEM §13), and a soft grey on the light card. Never a filled pill, never the red. */
  .item[aria-current='page'] {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
    font-weight: 600;
  }

  /* THE PRESS: a scale of .97 in 70ms, let go in the release time, so a finger sees the row take it as a click does. */
  .item:active,
  a.run:active {
    scale: 0.97;
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .item-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Indented to where a glyph would end, so a saved view reads as belonging to the list above it. */
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

  /* THE ONE FILLED BADGE AND THE ONE RED ON THE CARD: Decide's count as the red square, because it is what needs him. */
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
    font-size: var(--rail-text);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      scale var(--d-release) var(--ease-out);
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

  /* A MAKER'S MARK ON A PLAIN DISC, in its own colours (`AgentMark`): an ink disc would turn Codex's black knot to nothing. */
  .face-disc[data-marked] {
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
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
    font-size: var(--rail-text);
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

  .sep {
    margin: var(--sp-3) var(--sp-2) var(--sp-2);
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /**
   * HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it, so a row a thumb
   * pressed would stay lit after it left; `controls.css` guards its own the same way.
   */
  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger:hover) .record {
      background: var(--hover-wash);
    }

    .mi:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }

    .rail:hover .width {
      opacity: 1;
    }

    .width:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }

    .scroll:hover {
      scrollbar-color: color-mix(in srgb, var(--ink) 16%, transparent) transparent;
    }

    .sub .fold:hover {
      color: var(--ink);
    }

    /* The place you are on keeps its wash under the pointer, so pointing never reads as moving. */
    .item:hover:not([aria-current='page']) {
      background: var(--hover-wash);
      color: var(--ink);
    }

    a.run:hover {
      background: var(--hover-wash);
    }

    .me-more:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
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

  /* CLIPPED, NEVER REMOVED: the name is the row's accessible name at both widths, and the flyout is a copy for the eye.
     A count other than Decide's goes the same way, so it stays in its row's name without a dot on every list. */
  .rail[data-icons] .item-name,
  .rail[data-icons] .pen-action,
  .rail[data-icons] .record-name,
  .rail[data-icons] .ask-words,
  .rail[data-icons] .me-name,
  .rail[data-icons] .item .tally:not([data-waiting]),
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

  /* WHAT WAITS ON YOU IS THE ONE COUNT LEFT TO SEE AT THIS WIDTH: a red dot on the corner of its glyph, the figure still
     in the row's name. */
  .rail[data-icons] .item .tally[data-waiting] {
    position: absolute;
    inset-block-start: var(--sp-1);
    inset-inline-end: var(--sp-1);
    inline-size: var(--dot);
    min-inline-size: 0;
    block-size: var(--dot);
    padding: 0;
    border-radius: var(--r-pill);
    overflow: hidden;
    text-indent: 100%;
    white-space: nowrap;
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

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by,
     and the washes with them, so the place you are on keeps an edge of its own where the focus ring is not drawing one. */
  @media (forced-colors: active) {
    .rail::before {
      border: 1px solid CanvasText;
    }

    .item[aria-current='page']:not(:focus-visible) {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
    }
  }
</style>
