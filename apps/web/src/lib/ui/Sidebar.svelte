<!--
  The rail: the board's left column (DIRECTION §39). From the top, the record switcher, the ask field, the places, how
  many agents are working, each project, the lists, and at the foot More and the person.

  FLAT, AND THE BOARD'S OWN COLOUR. It was a floating glass card with a shadow, which made the navigation the loudest
  thing on every screen. It is now the left 240 of the board, with no edge, no fill and no shadow, and the place you
  are on is the one thing on it drawn as a tile: the tile's own white (or the dark tile), so "here" is the same surface
  as the work it opens.

  THE PLACES ARE SEVEN (`railOf` in `lib/nav/rail.ts`): Today, Decide, Work, Projects, Money, People and Agents on a
  record that has them, every other section after them, and what does not fit under More. Under them, each section's
  own things (a project per row under Projects), each folding on its own and remembered per device (`railShut`). Work's
  other pages are views of Work, which the Work screen switches between, so they are not places here too.

  THE LISTS ARE FOLDED UNTIL ASKED FOR, and open themselves while you are in one, so the rail never loses "here". MORE
  IS THE SAME: the places past seven, Activity, and the tools nobody opens twice a day.

  THE ASK FIELD IS THE PALETTE'S DOOR, drawn as the field it opens, with its `/` key. It is a button and not an input:
  the palette owns the typing.

  WHO IS WORKING IS ONE ROW, "2 working", with a pulsing dot, and it opens Agents. It was a group of its own, one line a
  run with how long each had gone ("11 h 52"), which repeated the Agents page and disagreed with it on the time ("3 min
  ago" there, for the same run). The runs and their times are Agents' to draw; the rail only says that some are at it,
  counted by the same clause (`RUNS_WORKING`). Absent while nobody works.

  THE PAGE BESIDE IT MUST NOT JUMP, SO THE RAIL SAYS ITS WIDTH ON THE ROOT. `--rail-w` is the rail's width at whichever
  width it is drawn, and `--rail-d` and `--rail-ease` the time and curve the shell slides the work on when it changes.
  Written by CSS alone (`:root:has(...)`), as `--dock-w` is, so nothing has to be cleaned up.
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
  import { hueFor } from './face.ts';
  import { agentsHref } from '../nav/rail.ts';
  import Kbd from './Kbd.svelte';
  import Mark from './Mark.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  import type { Shell, Working } from '../record/boot-live.ts';
  import type { SpineKey } from '../spine.ts';

  let {
    places,
    things = [],
    more = [],
    views = {},
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
    /** Today, Decide and the sections, as `railOf` reads them. */
    places: readonly FlatItem[];
    /** Each section's own things, a project's page per project, under the section's name (`railOf`). */
    things?: readonly (readonly [string, readonly NavEntry[]])[] | undefined;
    /** The places past seven, and Activity, drawn under More (`railOf`). */
    more?: readonly FlatItem[] | undefined;
    /** Each place's views by its key, Board under Work, drawn under the place while it is here (`railOf`). */
    views?: Readonly<Record<string, readonly NavEntry[]>> | undefined;
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
    /** The agents at work now (`readWorking`); the rail says how many, and nothing while this is empty. */
    working?: readonly Working[] | undefined;
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
    /* HOW MANY AGENTS ARE AT IT, the rail's one row about them, and what pressing it opens. */
    working: (n: number) => `${n} working`,
    workingOpen: 'Open Agents',
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
  /* ONE TILE AT A TIME: on Board the tile is Board, under Work, and Work keeps its place without one of its own. The
     narrow rail draws no views, so there Work is the tile. */
  const viewHere = (item: FlatItem) => !icons && (views[item.key] ?? []).some((v) => under(v.href));
  const placeHere = (item: FlatItem) => isHere(item, path) && !viewHere(item);

  /**
   * THE TOOLS UNDER MORE, in the order a person reaches for them. Slash's page is Suggestions here, named for what it
   * offers, with its own name in the tooltip (`copy.slashRail`). Inbox joins them once anything has arrived, by the rule
   * the spine keeps (`spineOf`).
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
   * THE LISTS AND MORE ARE FOLDED UNTIL SOMEBODY OPENS THEM, and each opens itself on any place it holds. Per visit
   * rather than remembered: what is under them is what nobody opens twice a day. The narrow rail folds nothing, because
   * it has no heading to press.
   */
  let listsAsked = $state(false);
  let moreAsked = $state(false);
  const inLists = $derived(lists.some((r) => under(`/r/${r.id}`) || (r.views ?? []).some((v) => under(v.href))) || path === '/r/_new');
  const inMore = $derived(
    more.some((i) => isHere(i, path)) || tools.some((t) => under(t.href)) || path.startsWith('/settings'),
  );
  const listsShut = $derived(!icons && !listsAsked && !inLists);
  const moreShut = $derived(!icons && !moreAsked && !inMore);

  /**
   * A SECTION'S THINGS FOLD ON THEIR OWN, AND STAY FOLDED (`railShut`, per device): a person who does not run projects
   * folds Projects once. A section holding the screen you are on is never shut, so the rail never loses "here".
   */
  let shut = $state(new Set(pref.read().railShut ?? []));
  function fold(section: string) {
    const next = new Set(shut);
    if (!next.delete(section)) next.add(section);
    shut = next;
    pref.write({ railShut: [...next] });
  }
  const isShut = (section: string, list: readonly NavEntry[]) => !icons && shut.has(section) && !list.some((e) => under(e.href));

  /* A GROUP OPENED AT THE FOOT IS SCROLLED INTO VIEW, by hand and not `scrollIntoView`, which would also scroll the
     window this shell holds still. */
  let scroller = $state<HTMLElement>();
  async function reveal(heading: EventTarget | null) {
    await tick();
    const el = (heading as HTMLElement | null)?.closest('h2');
    if (!scroller || !el) return;
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const body = el.nextElementSibling?.getBoundingClientRect();
    const bottom = body ? body.bottom : box.bottom;
    if (bottom > view.bottom) scroller.scrollTop += Math.min(bottom - view.bottom, box.top - view.top);
  }

  /* WHERE "2 WORKING" GOES: the Agents place, among the seven or under More (`agentsHref`). */
  const agentsAt = $derived(agentsHref([...places, ...more]));

  /**
   * THE WORDS COME BACK AS THE RAIL WIDENS. The rail takes its new width in one frame (the shell slides the work beside
   * it, `+layout.svelte`), and the names fade in over the same step, so a word is never drawn half cut over a column
   * still narrow. They go at once as it narrows. Nothing runs on the first draw or for a reader who asked for less motion.
   */
  const WORDS = '.item-name, .tally, .pen-action, .record-name, .ask-words, .ask-key, .me-name, .me-face, .sub';
  let card = $state<HTMLElement>();
  let drawn: boolean | undefined;
  let fades: Animation[] = [];
  /* A duration token in milliseconds, whichever unit it is written in. The fallback is the panel's step, which is what
     `--rail-d` names. */
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
    for (const a of fades.splice(0)) a.cancel();
    if (narrow || typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void tick().then(() => {
      const style = getComputedStyle(el);
      const timing = { duration: ms(style, '--rail-d', 240), easing: style.getPropertyValue('--rail-ease').trim() || 'ease-out' };
      try {
        for (const w of el.querySelectorAll(WORDS)) fades.push(w.animate({ opacity: [0, 1] }, timing));
      } catch {
        /* A timing a browser cannot read is words that arrive in one frame, which is what they did before. */
      }
    });
  });
</script>

<nav
  class="rail"
  aria-label="Record"
  data-rail-card
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
    <!-- THE WIDTH CONTROL says what it will do, not what happened. `⌘\` still works. It shows on the rail's hover and
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

  <!-- A PLACE'S VIEWS, Board under Work, while the place is here: indented and without a glyph, as a list's saved view. -->
  {#snippet viewsOf(item: FlatItem)}
    {#if !icons && isHere(item, path)}
      {#each views[item.key] ?? [] as v (v.href)}
        <a class="item view tap" href={at(v.href)} aria-current={under(v.href) ? 'page' : undefined}>
          <span class="item-name">{v.title}</span>
        </a>
      {/each}
    {/if}
  {/snippet}

  <div class="scroll" bind:this={scroller}>
    <!-- THE PLACES. Decide carries how many questions wait, as the red count, and named, not only coloured (13 §5.1). -->
    <ul class="group">
      {#each places as item (item.key)}
        <li>
          <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={placeHere(item) ? 'page' : undefined}>
            <span class="rail-glyph"><Icon name={item.icon as IconName} size="l" /></span><span class="item-name">{item.label}</span>
            {#if item.count}<span
                class="tally num"
                data-waiting={item.key === 'decide' ? '' : undefined}
                aria-label={item.key === 'decide' ? `${item.count} ${copy.openQuestions}` : undefined}>{item.count}</span
              >{/if}
          </a>
          {@render viewsOf(item)}
        </li>
      {/each}
    </ul>

    <!-- WHO IS WORKING, AS ONE ROW: how many, a dot that pulses while they are at it, and the door to Agents. Nothing
         while nobody is. -->
    {#if working.length > 0}
      <div class="part">
        <a class="item working tap" href={at(agentsAt)} data-label={words.working(working.length)} title={words.workingOpen}>
          <span class="rail-glyph" aria-hidden="true"><span class="pulse"></span></span><span class="item-name">{words.working(working.length)}</span>
        </a>
      </div>
    {/if}

    <!-- EACH SECTION'S OWN THINGS UNDER ITS NAME, a project per row under Projects, each in its own colour. The fold's
         text is the section's name, so it is announced "Projects, collapsed, button". -->
    {#each things as [section, list] (section)}
      {@const folded = isShut(section, list)}
      <section class="part">
        {#if icons}
          <hr class="sep" />
        {:else}
          <h2 class="sub">
            <button type="button" class="fold tap" aria-expanded={!folded} onclick={() => fold(section)}>
              <span class="sub-words">{section}</span><span class="fold-mark" aria-hidden="true" data-shut={folded ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
            </button>
          </h2>
        {/if}
        <ul class="group" data-shut={folded ? '' : undefined} inert={folded || undefined}>
          {#each list as entry (entry.href)}
            <li>
              <a class="item tap" href={at(entry.href)} data-nav data-label={entry.title} aria-current={under(entry.href) ? 'page' : undefined}>
                <span class="rail-glyph">
                  <!-- ALWAYS ITS DOT, never a glyph: the hue the record sent, else the one its name is drawn in, so a
                       project does not change face between one load and the next. -->
                  <span class="hue" style="--hue:{entry.hue ?? hueFor(entry.title)}" aria-hidden="true"></span>
                </span>
                <span class="item-name">{entry.title}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <!-- THE LISTS, UNDER THEIR OWN WORD AND FOLDED. Native, never pack-positioned: a page can go with the add-on that
         declared it, and the rows underneath still have to be reachable. "New list" is the last row. -->
    <section class="part">
      {#if icons}
        <hr class="sep" />
      {:else}
        <h2 class="sub">
          <button type="button" class="fold tap" aria-expanded={!listsShut} onclick={(e) => ((listsAsked = listsShut), void reveal(e.currentTarget))}>
            <span class="sub-words">{said('lists')}</span><span class="fold-mark" aria-hidden="true" data-shut={listsShut ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
          </button>
        </h2>
      {/if}
      <ul class="group" data-shut={listsShut ? '' : undefined} inert={listsShut || undefined}>
        {#each listsShown as r}
          <li>
            <a class="item tap" href={at(`/r/${r.id}`)} data-nav data-label={r.name} aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
              <span class="rail-glyph"><Icon name={r.icon} size="l" /></span>
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
              <span class="rail-glyph"><Icon name="more" size="l" /></span>
              <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
            </button>
          </li>
        {/if}
        <li>
          <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={path === '/r/_new' ? 'page' : undefined}>
            <span class="rail-glyph"><Icon name="plus" size="l" /></span><span class="item-name">{words.newList}</span>
          </a>
        </li>
      </ul>
    </section>

    <!-- MORE: the places past seven, Activity, and the tools, folded at the foot of the list. -->
    <section class="part">
      {#if icons}
        <hr class="sep" />
      {:else}
        <h2 class="sub">
          <button type="button" class="fold tap" aria-expanded={!moreShut} onclick={(e) => ((moreAsked = moreShut), void reveal(e.currentTarget))}>
            <span class="sub-words">{copy.more}</span><span class="fold-mark" aria-hidden="true" data-shut={moreShut ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
          </button>
        </h2>
      {/if}
      <ul class="group" data-shut={moreShut ? '' : undefined} inert={moreShut || undefined}>
        {#each more as item (item.key)}
          <li>
            <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={placeHere(item) ? 'page' : undefined}>
              <span class="rail-glyph"><Icon name={item.icon as IconName} size="l" /></span><span class="item-name">{item.label}</span>
            </a>
            {@render viewsOf(item)}
          </li>
        {/each}
        {#each tools as t (t.href)}
          <li>
            <a class="item tap" href={at(t.href)} data-label={t.label} title={t.title} aria-current={under(t.href) ? 'page' : undefined}>
              <span class="rail-glyph"><Icon name={t.icon} size="l" /></span><span class="item-name">{t.label}</span>
              {#if t.count}<span class="tally num">{t.count}</span>{/if}
            </a>
          </li>
        {/each}
        {#if hidden > 0}
          <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the nav is findable from the nav. -->
          <li>
            <a class="item tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hidden)} data-hidden-row>
              <span class="rail-glyph"><Icon name="eye" size="l" /></span>
              <span class="item-name">{copy.hiddenCount(hidden)}</span>
              <span class="pen-action">{copy.showHidden}</span>
            </a>
          </li>
        {/if}
      </ul>
    </section>
  </div>

  {#if pen.length}
    <!-- A holding pen: an update that adds a page lands hidden and nothing moves until somebody keeps it. Outside the
         fold, because it is the one thing at the foot that is news. -->
    <a class="item pen tap" href={at('/settings/navigation')} data-label={words.suggested(pen.length)}>
      <span class="rail-glyph"><Icon name="alert" size="l" /></span>
      <span class="item-name">{words.suggested(pen.length)}</span>
      <span class="pen-action">{copy.review}</span>
    </a>
  {/if}

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
  /**
   * THE RAIL'S WIDTH, TIME AND CURVE, SAID ON THE ROOT for the shell and the toast stack to read. 240, the board's left
   * column (DIRECTION §39). `[data-rail-card]` rather than the rail's class, which another stylesheet may also use.
   */
  :global(:root) {
    --rail-w: var(--rail);
    --rail-d: var(--d-move);
    --rail-ease: var(--ease-out);
  }

  :global(:root:has(nav[data-rail-card][data-icons])) {
    --rail-w: var(--rail-icons);
  }

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
   * THE RAIL: the board's left column, flat. No fill (the board shows through), no edge, no shadow. The tile colour is
   * the place you are on, and nothing else on the rail is a surface.
   */
  .rail {
    --fly-x: var(--rail-w);
    /* The tile's own fill, for the place you are on, and a lighter step of it under the pointer. */
    --rail-here: var(--tile);
    --rail-over: color-mix(in srgb, var(--rail-here) 55%, transparent);

    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: var(--rail-w);
    block-size: 100%;
    padding: var(--sp-3) var(--sp-3) var(--sp-2);
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

  /* The mark, the record's name in 600 and a small chevron, 40 tall. */
  .record {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 40px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    transition: background var(--d-state) var(--ease-out);
  }

  :global(.menu-trigger[aria-expanded='true']) .record {
    background: var(--rail-over);
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
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
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

  /* THE WIDTH CONTROL, quiet until the rail is pointed at or holds the focus. A thumb has no pointing, so it stays. */
  .width {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
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

  /* THE ASK FIELD: 34 tall, a field in the tile's fill, the search glyph, the words in `--dim` and the `/` cap at its end. */
  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 34px;
    margin-block: var(--sp-2) var(--sp-3);
    padding: 0 6px 0 10px;
    background: var(--rail-here);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: start;
    cursor: text;
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

  /* A LIST WITHOUT BOXES: rows 1 apart, and the space before each heading says where one group ends. */
  .group {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE SCROLLER FOR EVERYTHING BETWEEN THE ASK FIELD AND THE PERSON, so an open group scrolls rather than pushing the
     places off the rail. */
  .scroll {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    margin-inline: calc(-1 * var(--sp-1));
    padding-inline: var(--sp-1);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  /* AN AUTHOR RULE, because `hidden` is a user-agent one and loses to any `display` written here. */
  .group[data-shut] {
    display: none;
  }

  .part {
    margin-block-start: var(--sp-4);
  }

  /* A QUIET HEADING OVER A GROUP: 13/500 in `--dim`, no rule under it, and its fold mark at the end. */
  .sub {
    display: flex;
    align-items: center;
    margin: 0 0 2px;
    padding-inline: 10px;
    min-block-size: 28px;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  .sub-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A HEADING THAT FOLDS IS ITS WHOLE WIDTH, so it is a target and not a word. */
  .sub:has(.fold) {
    padding-inline: 0;
  }

  .fold {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 28px;
    padding: 0 6px 0 10px;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out);
  }

  /* A coarse pointer gets the floor every target keeps. */
  @media (pointer: coarse) {
    .fold,
    .item,
    .me-more,
    .width {
      min-block-size: var(--tap);
    }
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

  /* A PLACE: 34 tall, an 18px glyph in `--dim`, the name 14/500 in `--ink2`, and a count at the end. */
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 34px;
    padding: 0 10px 0 6px;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: calc(var(--t-sm) + 1px);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* THE GLYPH: 18 in a 24 slot, so every name starts on one line whatever its glyph's own width. */
  .rail-glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 24px;
    block-size: 24px;
    color: var(--dim);
    transition: color var(--d-state) var(--ease-out);
  }

  .rail-glyph :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  /* A THING'S OWN COLOUR, a small dot where a place's glyph would be: a project is told from its neighbours by it. */
  .hue {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* "HERE" IS A TILE: the tile's own fill under the name and the glyph in ink. Never a pill, never the red. */
  .item[aria-current='page'] {
    background: var(--rail-here);
    color: var(--ink);
  }

  /* AND ITS GLYPH IN THE ACCENT, the working colour's one use on the rail. */
  .item[aria-current='page'] .rail-glyph {
    color: var(--action);
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
    padding-inline-start: calc(6px + 24px + 10px);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .tally {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE RED ON THE RAIL: Decide's count, because it is what needs him. Text, not a filled badge. */
  .tally[data-waiting] {
    color: var(--danger-text);
    font-weight: 600;
  }

  .pen-action {
    flex: none;
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .pen {
    margin-block-start: var(--sp-2);
  }

  /* ── Who is working ─────────────────────────────────────────────────── */

  /* A 6px DOT IN THE WORKING COLOUR, where a place's glyph would be, breathing while the agents are at it. Its opacity
     moves and nothing else: no ring, no glow, no change of size that would nudge the name beside it. */
  .pulse {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: var(--status-working);
    animation: rail-pulse calc(var(--d-panel) * 8) var(--ease-standard) infinite;
  }

  @keyframes rail-pulse {
    50% {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }

  /* ── The foot ─────────────────────────────────────────────────────────── */

  .me {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 40px;
    margin-block-start: var(--sp-2);
    padding: 0 var(--sp-1) 0 6px;
  }

  .me-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 24px;
    block-size: 24px;
    background: var(--ink);
    border-radius: var(--r-round);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .me-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: calc(var(--t-sm) + 1px);
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
    border-radius: var(--r-ctl);
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
      background: var(--rail-over);
    }

    .mi:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }

    .rail:hover .width {
      opacity: 1;
    }

    .width:hover,
    .me-more:hover {
      background: var(--rail-over);
      color: var(--ink);
    }

    .scroll:hover {
      scrollbar-color: color-mix(in srgb, var(--ink) 16%, transparent) transparent;
    }

    .fold:hover {
      color: var(--ink);
    }

    /* The place you are on keeps its tile under the pointer, so pointing never reads as moving. */
    .item:hover:not([aria-current='page']) {
      background: var(--rail-over);
      color: var(--ink);
    }

    .item:hover .rail-glyph {
      color: var(--ink);
    }
  }

  /* ── The narrow rail ──────────────────────────────────────────────────── */

  .rail[data-icons] {
    padding-inline: var(--sp-2);
  }

  .rail[data-icons] .top {
    flex-direction: column;
    justify-content: center;
  }

  .rail[data-icons] .item,
  .rail[data-icons] .record,
  .rail[data-icons] .ask,
  .rail[data-icons] .me {
    position: relative;
    justify-content: center;
    gap: 0;
    min-block-size: var(--tap);
    padding-inline: 0;
  }

  /* CLIPPED, NEVER REMOVED: the name is the row's accessible name at both widths, and the flyout is a copy for the eye.
     A count other than Decide's goes the same way, so it stays in its row's name without a figure on every list. */
  .rail[data-icons] .item-name,
  .rail[data-icons] .pen-action,
  .rail[data-icons] .record-name,
  .rail[data-icons] .ask-words,
  .rail[data-icons] .me-name,
  .rail[data-icons] .item .tally:not([data-waiting]) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rail[data-icons] .ask-key,
  .rail[data-icons] .me-face,
  .rail[data-icons] .record :global(.icon) {
    display: none;
  }

  /* WHAT WAITS ON YOU IS THE ONE COUNT LEFT TO SEE AT THIS WIDTH: a red dot on the corner of its glyph, the figure still
     in the row's name. */
  .rail[data-icons] .item .tally[data-waiting] {
    position: absolute;
    inset-block-start: var(--sp-2);
    inset-inline-end: var(--sp-2);
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--danger);
    border-radius: var(--r-round);
    overflow: hidden;
    text-indent: 100%;
    white-space: nowrap;
  }

  .rail[data-icons] .view {
    display: none;
  }

  /* THE NARROW RAIL'S NAME FOR A GLYPH: over the work, so an opaque tile with one hairline and a shadow, and no glass
     (DIRECTION §39). */
  .flyout {
    position: fixed;
    inset-block-start: var(--fly-y);
    inset-inline-start: calc(var(--fly-x) + var(--sp-1));
    z-index: var(--z-hint);
    padding: var(--sp-1) var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-sm);
    box-shadow: var(--glass-edge), var(--e2);
    color: var(--ink);
    font-size: var(--t-sm);
    white-space: nowrap;
    pointer-events: none;
    translate: 0 -50%;
  }

  /* FORCED COLOURS DROP THE FILLS, so the place you are on keeps an edge of its own where the focus ring is not
     drawing one. */
  @media (forced-colors: active) {
    .item[aria-current='page']:not(:focus-visible) {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
    }
  }
</style>
