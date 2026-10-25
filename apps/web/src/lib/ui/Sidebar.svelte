<!--
  The rail: the left column, for somebody who chose it in Settings > Navigation (frame F8, 2.A.22). From the top, the
  record switcher, the ask field, the places, each project, the lists and More, and at the foot one row: the person.

  A FLAT COLUMN ON THE NAV'S OWN SURFACE, 240 wide and the window's height, with a hairline on its end edge in light and
  none in dark. No card, no wells: each place is a 36px row, its 16px glyph in the second ink, its name at 14/500, and
  the place you are on is the nav's selected fill with its name and glyph in ink at 600. A project is an 8px dot of its
  own colour. The one red is Needs you's count, the one `Count`.

  NOTHING SITS UNDER THE FOOT. The "2 working" card and "2 suggested" went (the top bar's chip and Agents say who is
  working; what waits is Needs you's count), and the list ends 64 above the foot with the 24px fade, where a chevron and
  two hairlines cut it before.

  THE PLACES ARE SEVEN (`railOf` in `lib/nav/rail.ts`): Today, Needs you, Work, Projects, Money, People and Agents on a
  record that has them, every other section after them, and what does not fit under More. Under them, each section's
  own things (a project per row under Projects), each folding on its own and remembered per device (`railShut`). Work's
  other pages are views of Work, which the Work screen switches between, so they are not places here too.

  THE LISTS ARE FOLDED UNTIL ASKED FOR, and open themselves while you are in one, so the rail never loses "here". MORE
  IS THE SAME: the places past seven, Activity, and the tools nobody opens twice a day.

  THE ASK FIELD IS THE PALETTE'S DOOR, drawn as the field it opens, with its `/` key. It is a button and not an input:
  the palette owns the typing.

  THE PAGE BESIDE IT MUST NOT JUMP, SO THE RAIL SAYS ITS WIDTH ON THE ROOT. `--rail-w` is the rail's width at whichever
  width it is drawn, and `--rail-d` and `--rail-ease` the time and curve the shell slides the work on when it changes.
  Written by CSS alone (`:root:has(...)`), as `--dock-w` is, so nothing has to be cleaned up.
-->
<script module lang="ts">
  /** THE HOLDING PEN'S ROW: how many offers wait. The frame's sidebar says it in the same words (`design/pen.ts`). */
  import { suggested } from '../design/pen.ts';
  export { suggested };

  /* edge-cue:start (`sidebar-scroll.test.ts` reads the lines between these two marks and runs them) */
  /** How far, in px, the scroller's content fades out at an edge that has more past it. */
  export const EDGE_FADE = 24;
  /**
   * WHICH EDGES OF THE SCROLLER HAVE MORE PAST THEM, from the three numbers a scroller knows. Nothing when everything
   * fits, and nothing at the foot once the end is reached. A pixel of slack, because a zoomed page rests on a fraction.
   */
  export function edgeCue(scrollTop: number, clientHeight: number, scrollHeight: number): { above: boolean; below: boolean } {
    const hidden = scrollHeight - clientHeight;
    if (!(hidden > 1)) return { above: false, below: false };
    return { above: scrollTop > 1, below: hidden - scrollTop > 1 };
  }
  /**
   * HOW FAR TO SCROLL SO A FOCUSED ROW IS WHOLLY IN VIEW AND CLEAR OF THE FADES: the row's top and bottom and the
   * scroller's, all from `getBoundingClientRect`. Negative is up, 0 is "it already is". A row taller than the clear
   * part is taken to its top.
   */
  export function focusShift(top: number, bottom: number, viewTop: number, viewBottom: number, fade: number = EDGE_FADE): number {
    const up = top - (viewTop + fade);
    const down = bottom - (viewBottom - fade);
    if (up < 0) return up;
    return down > 0 ? Math.min(down, up) : 0;
  }
  /* edge-cue:end */

  /* page-line:start (the rail's line that makes a page; kept between two marks so a test can read and run it) */
  /** What the line says: whoever owns the record makes the page, and anybody else suggests it (`page-new.ts`). */
  export function pageLine(owner: boolean, words: { newPage: string; suggestPage: string }): string {
    return owner ? words.newPage : words.suggestPage;
  }
  /** Whether a place is the one made pages sit under: the section of that name, and never Today or Work so named. */
  export function holdsPages(item: { key: string; label: string }, section: string): boolean {
    return item.key === `section:${section}` && item.label === section;
  }
  /* page-line:end */
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { BASE, apiBase, at, here as inside } from '../at.ts';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '../copy/frame.ts';
  import { said } from '../voice.svelte.ts';
  import { isHere, orderLists, placeOf, type FlatItem } from '../nav.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import type { PenItem } from '../design/pen.ts';
  import * as pref from '../pref.ts';
  import type { NavEntry } from '../record/api.ts';
  import Count from './Count.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { hueFor } from './hue.ts';
  import Kbd from './Kbd.svelte';
  import Mark from './Mark.svelte';
  import { palette } from '../palette/open.svelte.ts';
  import Menu from './Menu.svelte';
  import { toasts } from './toast.svelte.ts';
  import { levelWord, openRecord, type SwitcherRow } from '../record/switcher.ts';
  /* THE LINE'S WORDS ONLY: the call that makes a page carries the client, so it is loaded on Enter (`makePage`). */
  import { pageWords } from '../record/page-words.ts';
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
    pen: readonly PenItem[];
    record: string;
    records?: SwitcherRow[];
    /** Why the rest of the records could not be listed, when they could not: the host's own sentence. */
    refused?: string | undefined;
    registers: { id: string; name: string; count: number; icon: IconName; views?: { key: string; name: string; href: string }[]; guessed?: true }[];
    /** The spine as `spineOf` reads it: whether Inbox has been used, which puts its row under More. */
    spine?: readonly SpineKey[] | undefined;
    inbox?: number | undefined;
    /** The agents at work now, as `boot` sends them. Kept for the caller: the top bar and Agents say who is working. */
    working?: readonly Working[] | undefined;
    /** The narrow rail: glyphs, with the names on hover and on focus. Per device, `pref.sidebar`. */
    icons?: boolean | undefined;
    ontoggle?: (() => void) | undefined;
  } = $props();

  /** The words the rail says itself, kept beside the one component that says them. */
  const words = {
    unnamed: 'My BrainDog',
    /* The rail's head says the product; the record it opens is the smaller line under it. */
    brand: 'BrainDog',
    ask: copy.palettePlaceholder,
    moreLists: (n: number) => `Show ${n} more`,
    fewerLists: 'Show fewer',
    /* The new-list row under the lists, said only here. */
    newList: 'New list',
    /* What the box asks for once the new-page line is pressed; the line's own words are `pageWords`. */
    pageName: 'Name the page',
    /* THE HOLDING PEN'S ROW: how many offers wait, and Settings, Navigation says what they are. */
    suggested,
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
  const person = $derived(nameOf(shell.me?.person) || shell.me?.name?.trim() || words.you);

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

  /**
   * A NEW PAGE, FROM THE FOOT OF PAGES (PGS-C30). The line becomes a box for the name, and Enter sends it through
   * `newPage`, the one call the palette makes too: whoever owns the record gets the page and is taken to it, with one
   * toast whose Undo takes it back out; anybody else files it on Decide and stays where they are. A refusal is its own
   * sentence on a toast, and the box keeps what was typed.
   */
  const pageWord = $derived(pageLine(shell.me?.owner === true, pageWords));
  let naming = $state(false);
  let pageTitle = $state('');
  let making = $state(false);
  /* A RECORD WITH NO MADE PAGE HAS NO PAGES PLACE, and the line had nowhere to be drawn: the first page could only be
     made from the palette. So the rail draws the heading itself, with the line under it, until a place of that name
     is there to hold it. */
  const pagesPlaced = $derived([...places, ...more].some((item) => holdsPages(item, pageWords.section)));
  let nameBox = $state<HTMLInputElement | null>(null);

  async function startPage() {
    naming = true;
    await tick();
    nameBox?.focus();
  }
  const stopPage = () => ((naming = false), (pageTitle = ''));

  async function makePage() {
    if (making) return;
    making = true;
    const made = await import('../record/page-new.ts').catch(() => null);
    if (made === null) {
      making = false;
      toasts.push(pageWords.notReached, { intent: 'warn' });
      return void nameBox?.focus();
    }
    const { dropPage, newPage, pageClient } = made;
    const client = pageClient(apiBase());
    const title = pageTitle.replace(/\s+/gu, ' ').trim();
    const out = await newPage(pageTitle, { client, pages: shell.pages ?? [], owner: shell.me?.owner === true, every: true });
    making = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return void nameBox?.focus();
    }
    stopPage();
    if (out.as === 'suggested') return void toasts.push(out.said);
    /* THE SHELL IS KEPT FOR THE TAB (`boot-live.ts`), so the kept answer is dropped before it is read again: the rail
       and the next page's address come from a list that holds this page. */
    const reread = async () => (await import('../record/boot-live.ts')).forget();
    await reread();
    const home = `/p/${out.slug}`;
    toasts.push(out.said, {
      undo: () =>
        void dropPage(out.id, { client }).then(async (back) => {
          if (!back.ok) return void toasts.push(back.fix, { intent: 'warn' });
          await reread();
          /* THE PAGE IS GONE, so a reader still on it is taken to Today, and the rail is read again either way. */
          if (under(home)) await goto(at('/'), { invalidateAll: true });
          else await invalidateAll();
          toasts.push(pageWords.undone(title));
        }),
    });
    /* THE NEW PAGE OPENS ON "Describe it" (`?describe=1`, which `ChangePage` reads and takes out of the address), as
       the palette's New page does. `home` stays the plain address: it is what Undo compares and leaves. */
    await goto(at(`${home}?describe=1`), { invalidateAll: true });
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
   * THE TOOLS UNDER MORE, in the order a person reaches for them. Slash's page is not one: it folded into the palette,
   * the one ask (batch 5d). Inbox joins them once anything has arrived, by the rule the spine keeps (`spineOf`).
   */
  type Tool = { href: string; label: string; icon: IconName; count?: number; title?: string };
  const tools = $derived<Tool[]>([
    ...(spine.includes('inbox') && !navPrefs.isHidden('/inbox') ? [{ href: '/inbox', label: said('inbox'), icon: 'inbox' as const, count: inbox }] : []),
    { href: '/automations', label: copy.automations, icon: 'refresh' },
    { href: '/packs', label: copy.packs, icon: 'packs' },
    { href: '/keychain', label: copy.keychain, icon: 'vault' },
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

  /* THE EDGE CUE: a rail that scrolls says so. The foot fades while there is more below, and the head while there is
     more above (`edgeCue`), measured on every scroll and whenever the rail's height or what is in it changes (a group
     folding, a project arriving). It was a scrollbar drawn only under the pointer, so the last group was cut off
     mid-row with nothing to say it went on. The fade is the whole cue: the chevron and two hairlines that cut the list
     at the foot went (frame F8). */
  let edges = $state({ above: false, below: false });
  function measure() {
    if (!scroller) return;
    const next = edgeCue(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight);
    if (next.above !== edges.above || next.below !== edges.below) edges = next;
  }
  /* IT IS MEASURED BEFORE ANYBODY SCROLLS, AND AGAIN WHENEVER THE ROWS CHANGE HEIGHT. The first build watched the
     scroller's own box and its children coming and going, and on a real record the cue never drew on first paint: the
     rail is `100dvh`, so its box does not change when the rows under it grow (the tokens' sheet or the face landing
     after the first measure, a group's rows filling in), and no row was added or taken away to say so. So the size
     watch is on every group as well as the scroller, and the measure runs once more on the frame after mount, when
     the faces are in, and when the window has loaded or been resized. `untrack`, so writing `edges` does not tear
     these watches down and build them again. */
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const size = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
    const watch = () => {
      size?.observe(el);
      for (const group of el.children) size?.observe(group);
    };
    const kids =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            watch();
            measure();
          })
        : undefined;
    untrack(() => {
      watch();
      measure();
    });
    kids?.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-shut'] });
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(measure) : undefined;
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    return () => {
      size?.disconnect();
      kids?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('load', measure);
    };
  });

  /* THE KEYBOARD NEVER LANDS ON A ROW IT CANNOT SEE. A browser scrolls a focused row to the scroller's edge, which is
     now under the fade, so the rail takes it clear of that (`focusShift`). Only for focus the keyboard gave: a click is
     already on a row in view. */
  function seen(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!scroller || !el || typeof el.matches !== 'function' || !el.matches(':focus-visible')) return;
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const by = focusShift(box.top, box.bottom, view.top, view.bottom);
    if (by !== 0) scroller.scrollTop += by;
  }

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
          <span class="record-name">{recordName || words.brand}</span>
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
      <a class="mi" role="menuitem" href={at('/settings/signing-in')}><Icon name="settings" size="s" />{copy.recordSettings}</a>
      <!-- SIGN OUT AT EVERY WIDTH (LCH-A04): the rail's account menu says it as the phone's More does, with auth.ts loaded
           on the press. A press that did not end the session leaves the page where it is and says so. -->
      <button type="button" class="mi" role="menuitem" onclick={() => void import('../auth.ts').then((m) => m.signOutAndLeave(`${BASE}/signin`)).then((out) => { if (!out.ok) toasts.push(copy.signOutFailed, { intent: 'warn' }); }, () => toasts.push(copy.signOutFailed, { intent: 'warn' }))}><Icon name="lock" size="s" />{copy.signOut}</button>
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

  <!-- THE ASK FIELD: the palette, drawn as the field it opens, and the field it opens out of (`data-palette-from`). Its
       two keys are in the tooltip, and `/` on the cap. -->
  <button type="button" class="ask tap" data-palette-from="bar" data-label={words.ask} aria-label={words.ask} aria-keyshortcuts="/ Control+K Meta+K" title={copy.searchKeys} onclick={() => (palette.open = true)}>
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

  <!-- THE LAST LINE UNDER PAGES: "New page", or "Suggest a page" for anybody who does not own the record. Pressed, it
       is the box the name is typed into: Enter makes the page, Escape or leaving it empty puts the line back. Not on
       the narrow rail, which has no room for a name. -->
  {#snippet pageLineOf(item: FlatItem)}
    {#if !icons && holdsPages(item, pageWords.section)}{@render pageLineDrawn(false)}{/if}
  {/snippet}

  <!-- THE LINE ITSELF. Under the Pages place it is indented as a view is. `headed`, under the rail's own Pages heading
       on a record with no made page, it is a row of its own with a plus, as "New list" is under Lists. -->
  {#snippet pageLineDrawn(headed: boolean)}
    {#if naming}
      <form class={['item page-name', !headed && 'view']} onsubmit={(e) => (e.preventDefault(), void makePage())}>
        {#if headed}<span class="rail-glyph"><Icon name="plus" size="m" /></span>{/if}
        <input
          bind:this={nameBox}
          bind:value={pageTitle}
          class="page-box"
          type="text"
          aria-label={pageWord}
          placeholder={words.pageName}
          maxlength="80"
          autocomplete="off"
          enterkeyhint="done"
          readonly={making}
          onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), stopPage())}
          onblur={() => pageTitle.trim() === '' && !making && stopPage()}
        />
      </form>
    {:else}
      <button type="button" class={['item tap', !headed && 'view']} data-page-line data-label={headed ? pageWord : undefined} onclick={() => void startPage()}>
        {#if headed}<span class="rail-glyph"><Icon name="plus" size="m" /></span>{/if}
        <span class="item-name">{pageWord}</span>
      </button>
    {/if}
  {/snippet}

  <div
    class="scroll"
    bind:this={scroller}
    data-more-above={edges.above ? '' : undefined}
    data-more-below={edges.below ? '' : undefined}
    onscroll={measure}
    onfocusin={(e) => seen(e.target)}
  >
    <!-- THE PLACES. Decide carries how many questions wait, as the red count, and named, not only coloured (13 §5.1). -->
    <ul class="group">
      {#each places as item (item.key)}
        <li>
          <a class="item tap" href={at(item.href)} data-nav data-label={item.label} aria-current={placeHere(item) ? 'page' : undefined}>
            <span class="rail-glyph"><Icon name={item.icon as IconName} size="m" /></span><span class="item-name">{item.label}</span>
            {#if item.count && item.key === 'decide'}<span class="tally" data-waiting><Count n={item.count} label={`${item.count} ${copy.openQuestions}`} /></span>{:else if item.count}<span class="tally num">{item.count}</span>{/if}
          </a>
          {@render viewsOf(item)}
          {@render pageLineOf(item)}
        </li>
      {/each}
    </ul>

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
                  <!-- ITS OWN DOT, 8px in its colour: the hue the record sent, else the one its name is drawn in, so a
                       project does not change colour between one load and the next. -->
                  <span class="hue" style="--hue:{entry.hue ?? hueFor(entry.title)}" aria-hidden="true"></span>
                </span>
                <span class="item-name">{entry.title}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <!-- PAGES, WHEN THE RECORD HAS NONE MADE: the heading and the line that makes the first one. Once a page is made
         the Pages place holds the line and this goes. Not on the narrow rail, which has no room for a name. -->
    {#if !icons && !pagesPlaced}
      <section class="part" data-pages-heading>
        <h2 class="sub"><span class="sub-words">{pageWords.section}</span></h2>
        <ul class="group">
          <li>{@render pageLineDrawn(true)}</li>
        </ul>
      </section>
    {/if}

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
              <span class="rail-glyph"><Icon name={r.icon} size="m" /></span>
              <span class="item-name">{r.name}</span>
              {#if !r.guessed}<span class="tally num">{r.count}</span>{/if}
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
              <span class="rail-glyph"><Icon name="more" size="m" /></span>
              <span class="item-name">{listsAll ? words.fewerLists : words.moreLists(listsHidden)}</span>
            </button>
          </li>
        {/if}
        <li>
          <a class="item tap" href={at('/r/_new?make')} data-label={words.newList} aria-current={path === '/r/_new' ? 'page' : undefined}>
            <span class="rail-glyph"><Icon name="plus" size="m" /></span><span class="item-name">{words.newList}</span>
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
              <span class="rail-glyph"><Icon name={item.icon as IconName} size="m" /></span><span class="item-name">{item.label}</span>
            </a>
            {@render viewsOf(item)}
            {@render pageLineOf(item)}
          </li>
        {/each}
        {#each tools as t (t.href)}
          <li>
            <a class="item tap" href={at(t.href)} data-label={t.label} title={t.title} aria-current={under(t.href) ? 'page' : undefined}>
              <span class="rail-glyph"><Icon name={t.icon} size="m" /></span><span class="item-name">{t.label}</span>
              {#if t.count}<span class="tally num">{t.count}</span>{/if}
            </a>
          </li>
        {/each}
        {#if hidden > 0}
          <!-- THE WAY BACK, WHERE THE PAGE WAS. A page hidden from the nav is findable from the nav. -->
          <li>
            <a class="item tap" href={at('/settings/navigation#hidden')} data-label={copy.hiddenCount(hidden)} data-hidden-row>
              <span class="rail-glyph"><Icon name="eye" size="m" /></span>
              <span class="item-name">{copy.hiddenCount(hidden)}</span>
              <span class="pen-action">{copy.showHidden}</span>
            </a>
          </li>
        {/if}
      </ul>
    </section>
  </div>

  <!-- THE FOOT, ONE 56px ROW: the person's face, their name, and the way to their account and settings. -->
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
   * column. `[data-rail-card]` rather than the rail's class, which another stylesheet may also use.
   */
  :global(:root) {
    --rail-w: var(--rail);
    --rail-d: var(--d-panel);
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
    /* THE NAV'S SELECTED FILL for the place you are on, and the hover step under the pointer. */
    --rail-here: var(--nav-selected);
    --rail-over: var(--hover);

    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: var(--rail-w);
    /* THE WINDOW'S HEIGHT, NOT `100%`: the shell's row is `auto`, so a percentage never resolved, the open list's own
       height set the row, and `.scroll` never had less room than it wanted. The foot went off the bottom with it. */
    block-size: 100dvh;
    padding: var(--sp-3) var(--sp-3) 0;
    background: var(--nav);
    border-inline-end: 1px solid var(--rule);
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
    gap: var(--sp-2);
    min-block-size: 40px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    transition: background var(--d-state) var(--ease-out);
  }

  :global(.menu-trigger[aria-expanded='true']) .record {
    background: var(--rail-over);
  }

  .record :global(.icon) {
    color: var(--ink-3);
  }

  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-xs);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    text-decoration: none;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

  .mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .mi[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }

  .mi :global(.icon) {
    color: var(--ink-3);
  }

  .mi-avatar {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    flex: none;
    background: var(--ink);
    border-radius: var(--r-xs);
    color: var(--on-red);
    font-size: var(--fs-cap);
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
    padding: 0 var(--sp-1);
    background: var(--tile-2);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: 500;
  }

  /* A sentence, not a row: nothing happens when it is pressed. */
  .mi-note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .mi-rule {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--rule);
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
    color: var(--ink-3);
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

  /* THE ASK FIELD: 34 tall, a field in the tile's fill, the search glyph, the words in `--ink-3` and the `/` cap at its end. */
  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    margin-block: var(--sp-2) var(--sp-3);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: var(--rail-here);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* THE KEY, ON HOVER AND FOCUS ONLY: printed at rest it is one more thing to read on every screen. */
  .ask-key {
    display: none;
    flex: none;
  }

  .ask:is(:hover, :focus-visible) .ask-key {
    display: inline-flex;
  }

  /* A LIST WITHOUT BOXES: rows 1 apart, and the space before each heading says where one group ends. */
  .group {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE SCROLLER FOR EVERYTHING BETWEEN THE ASK FIELD AND THE PERSON, so an open group scrolls rather than pushing the
     places off the rail. */
  .scroll {
    /* `EDGE_FADE`, and how much of it each edge takes: none until that edge has more past it. */
    --fade-edge: 24px;
    --edge-above: 0px;
    --edge-below: 0px;

    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    margin-inline: calc(-1 * var(--sp-1));
    padding-inline: var(--sp-1);
    overflow-y: auto;
    /* A THIN THUMB THAT IS ALWAYS THERE while the rail scrolls (a browser draws none when everything fits). It was
       transparent until pointed at, which hid the only sign of a longer rail. */
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--ink) 18%, transparent) transparent;
    /* A row scrolled to by the browser (a focus, a find) stops clear of the fades. */
    scroll-padding-block: var(--fade-edge);
    /* THE LAST ROW STOPS 64 ABOVE THE FOOT, so nothing ever sits under the person's row. */
    padding-block-end: var(--sp-8);
  }

  /* THE EDGE CUE (`edgeCue`): the rows fade out at an edge with more past it. A mask on the rows, not a painted band,
     so the board's colour shows through in both themes and nothing is drawn when everything fits or the end is
     reached. */
  .scroll[data-more-above] {
    --edge-above: var(--fade-edge);
  }

  .scroll[data-more-below] {
    --edge-below: var(--fade-edge);
  }

  .scroll[data-more-above],
  .scroll[data-more-below] {
    mask-image: linear-gradient(to bottom, transparent, var(--ink) var(--edge-above), var(--ink) calc(100% - var(--edge-below)), transparent);
  }

  /* AN AUTHOR RULE, because `hidden` is a user-agent one and loses to any `display` written here. */
  .group[data-shut] {
    display: none;
  }

  .part {
    margin-block-start: var(--sp-4);
  }

  /* A QUIET HEADING OVER A GROUP: 13/500 in `--ink-3`, no rule under it, and its fold mark at the end. */
  .sub {
    display: flex;
    align-items: center;
    margin: 0;
    padding-inline: var(--sp-2);
    min-block-size: 28px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    padding: 0 var(--sp-1) 0 var(--sp-2);
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
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-shut] {
    transform: rotate(-90deg);
  }

  /* A PLACE: 36 tall, radius 8, a 16px glyph in the second ink with no well, 12 to the name at 14/500, and a count at
     the end. */
  .item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 36px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* THE GLYPH WITH NO WELL: 16 in a 16 slot, in the second ink, so every name starts on one line. */
  .rail-glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    color: var(--ink-2);
    transition: color var(--d-state) var(--ease-out);
  }

  /* A PROJECT'S DOT, 8px in its own colour, where a place's glyph would be. */
  .hue {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* "HERE" IS THE NAV'S SELECTED FILL, and ink at 600, glyph and name. Never a pill, never the red. */
  .item[aria-current='page'] {
    background: var(--rail-here);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .item[aria-current='page'] .rail-glyph {
    color: var(--ink);
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
    padding-inline-start: calc(var(--sp-2) + var(--icon-m) + var(--sp-3));
    font-weight: var(--fw-regular);
  }

  /* THE NEW-PAGE LINE reads as an offer and not as a page already there, so it is drawn in `--ink-3`. */
  .item.view[data-page-line] {
    color: var(--ink-3);
  }

  /* ITS BOX, WHERE THE LINE WAS: the row's own height and indent, flat, with the focus ring the board draws. 16px, so a
     phone does not zoom the rail to it. */
  .page-name {
    padding-inline-end: var(--sp-1);
  }

  /* The box is the surface here, so the line around it takes no hover of its own. */
  form.item.page-name:hover {
    background: none;
  }

  .page-box {
    flex: 1;
    min-inline-size: 0;
    block-size: 32px;
    padding: 0 var(--sp-2);
    margin-inline-start: calc(-1 * var(--sp-2));
    border: 0;
    border-radius: var(--r-xs, 8px);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .tally {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE RED ON THE RAIL: Needs you's count, the one `Count`. */
  .tally[data-waiting] {
    display: inline-flex;
  }

  .pen-action {
    flex: none;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* ── The foot ─────────────────────────────────────────────────────────── */

  .me {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 56px;
    padding: 0 var(--sp-1) 0 var(--sp-1);
  }

  /* THE FACE, 28: the person's letter on the field's fill, as the top bar's. */
  .me-face {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  .me-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
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
    color: var(--ink-3);
    transition: background var(--d-state) var(--ease-out);
  }

  .sep {
    margin: var(--sp-3) var(--sp-2) var(--sp-2);
    border: 0;
    border-block-start: 1px solid var(--rule);
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
      background: var(--hover);
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
      scrollbar-color: color-mix(in srgb, var(--ink) 32%, transparent) transparent;
    }

    .fold:hover {
      color: var(--ink);
    }

    /* The place you are on keeps its tile under the pointer, so pointing never reads as moving. */
    .item:hover:not([aria-current='page']) {
      background: var(--rail-over);
      color: var(--ink);
    }

    .item:hover:not([aria-current='page']) .rail-glyph {
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
     A count other than the Needs you one goes the same way, so it stays in its row's name without a figure on every list. */
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
    inset-block-start: var(--sp-1);
    inset-inline-end: var(--sp-1);
  }

  .rail[data-icons] .view {
    display: none;
  }

  /* THE NARROW RAIL'S NAME FOR A GLYPH: over the work, so an opaque tile with one hairline and a shadow, and no glass. */
  .flyout {
    position: fixed;
    inset-block-start: var(--fly-y);
    inset-inline-start: calc(var(--fly-x) + var(--sp-1));
    z-index: var(--z-hint);
    padding: var(--sp-1) var(--sp-3);
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-xs);
    color: var(--ink);
    font-size: var(--fs-meta);
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
