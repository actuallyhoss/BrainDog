<!--
  Settings > Pages: every page this record declares, what the app opens on, and the add-ons the pages came with.

  ONE PLACE TO CHANGE ANY PAGE FROM, without code. A page's own head already offers Edit layout and
  "Change this page", which a person finds only once they are on the page; here every page is one row, the whole row
  its link, and the rest behind one menu: Edit layout, Change with Slash, a name of their own in the nav, open it
  first, and Hide. Fewer things on screen: Open and the menu wait for the pointer or the keyboard to reach their row,
  and under a thumb, where nothing hovers, the menu is always there.

  CALM, AND IN THE NAV'S ORDER. What the app opens on is one line at the top. Every page is then one row of one list, a
  hairline between each, in the order the nav draws them: Today, the sections, Activity and Decide among them, as the
  top bar and More hold them. A page under a section named otherwise says so on its row rather than under a heading.
  The pages a row made (a person's, a project's) are folded into one "N more pages" row, and the add-ons are one line
  at the foot with their icons, the door to the screen where each is turned off or on.

  WHAT IS A PERSON'S OWN AND WHAT IS THE RECORD'S. The name in the nav, the page it opens on and what is hidden are this
  person's (`nav-prefs.svelte.ts`: `nav.labels`, `home.page`, `nav.hidden`), kept for them on the record and on this
  device without one. The layout and a change through Slash are the page itself, which only an owner may change, so a
  colleague is offered neither.

  THE HOME PAGE AND THE NAMES ARE TWO KEYS THE RECORD KEEPS, `home.page` and `nav.labels` in `PREF_KEYS`
  (`packages/record/src/index.ts`). A record that still refuses one (a host older than the keys) says so in its own
  sentence, and the screen puts the choice back and says so. The shell reads `navPrefs.home` and `navPrefs.relabel` to
  draw them. What a list itself is called, for everybody, is the record's word and lives in Words and money.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { WORK, arrange, flatNav } from '$lib/nav.ts';
  import { agentsHref, railOf } from '$lib/nav/rail.ts';
  import { sideOrder } from '$lib/shell/side.ts';
  import { said as voiced } from '$lib/voice.svelte.ts';
  import { TASKS } from '$lib/work/list.ts';
  import { LABEL_MOST, navPrefs, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { moduleName } from '@braindog/seed/usecases/names';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import { ownsRecord } from '../../levels.ts';
  import { foldSaid } from './pages-fold.ts';
  import { lineIn } from '$lib/motion';

  /**
   * PAGES IS FOLDED INTO NAVIGATION (UI pass 20 Oct, agents F14): Navigation draws this file three times, one `part` each,
   * "Opens on" at the top, then "In your nav", then "Not in your nav", so the two areas can no longer count the same
   * pages two ways ("Your pages 40" here beside "Your pages 8" there). With no `part` all three are drawn, in that order.
   */
  let { shell, part }: AreaProps & { part?: 'opens' | 'nav' | 'others' | undefined } = $props();
  const drawn = (which: 'opens' | 'nav' | 'others'): boolean => part === undefined || part === which;

  /* THE PAGE ITSELF IS THE OWNER'S TO CHANGE, as the record's `setDeclaration` and `slashDraft` hold. */
  const owner = $derived(ownsRecord(shell.me));
  /* THE SAME FACT A PAGE'S OWN "Change this page" STANDS ON: whether this host has a model behind Slash. */
  const model = $derived((page.data as { slash?: unknown }).slash === true);

  /* THIS AREA'S OWN WORDS, each naming the person's own page. */
  const words = {
    opensOn: 'Opens on',
    homeSet: (name: string) => `BrainDog opens on ${name} now.`,
    pages: 'Your pages',
    inNav: 'In the sidebar and the bar',
    inNavHint: 'Hiding deletes nothing.',
    other: 'Add a page',
    otherHint: 'Hidden pages and pages not in the sidebar.',
    find: 'Find a page',
    noMatch: 'No page is called that',
    nothingOut: 'Every page is in your nav',
    up: (title: string) => `Move ${title} up`,
    down: (title: string) => `Move ${title} down`,
    hideOne: (title: string) => `Hide ${title}`,
    upWord: 'Move up',
    downWord: 'Move down',
    hideWord: 'Hide',
    open: 'Open',
    more: (title: string) => `More for ${title}`,
    layout: 'Edit layout',
    slash: 'Change with Slash',
    rename: 'Rename in your nav',
    first: 'Open this first',
    notFirst: 'Stop opening this first',
    hide: 'Hide from your nav',
    show: 'Show in your nav',
    hidden: (title: string) => `${title} is hidden from your nav.`,
    opensFirst: 'Opens first',
    fixed: 'Fixed in place',
    isHidden: 'Hidden from your nav',
    called: (own: string) => `Called ${own} on its page`,
    under: (section: string) => `In ${section}`,
    inSection: (n: number, section: string) => `${n} pages in ${section}`,
    showThem: 'Show',
    none: 'No pages yet',
    noneWhy: 'They come with add-ons and from Slash.',
    renameTitle: (title: string) => `Rename ${title}`,
    renameLabel: 'Name in your nav',
    renameHint: (own: string) => `Only in your nav. Leave it empty for ${own}.`,
    save: 'Save',
    renamed: (from: string, to: string) => `${from} is ${to} in your nav.`,
    unnamed: (own: string) => `${own} has its own name again.`,
    slashTitle: (title: string) => `Change ${title}`,
    addonsOn: (on: number, off: number) =>
      `${on === 0 ? 'No add-ons on' : on === 1 ? '1 add-on on' : `${on} add-ons on`}${off === 0 ? '' : `, ${off} off`}`,
    manage: 'Manage',
    moreLists: 'More lists',
  };

  /** A refusal is the record's own sentence; a change it kept says what it came to. */
  const said = (saved: Saved, done: string, undo?: () => void) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
    else toasts.push(done, undo ? { undo } : {});
  };

  /**
   * One page as this area lists it: where it is, its own title, its glyph, and its slug when it is a declared page
   * (`/p/<slug>`). A thread in the nav is not one, so it has no layout to edit and no page for Slash to change.
   */
  type Listed = { href: string; slug: string | null; own: string; icon: IconName; inNav: boolean; row: boolean; section?: string; app?: true; register?: string | null };

  const slugOf = (href: string): string => href.replace(/^\/p\//u, '');
  /* A PAGE WITH NO TITLE TO READ IS NAMED BY ITS ADDRESS, in words: `client-portal` is Client portal. */
  const wordsOf = (slug: string): string => {
    const plain = slug.replaceAll('-', ' ');
    return plain.charAt(0).toUpperCase() + plain.slice(1);
  };

  /**
   * THE NAV'S PAGES, BY HEADING, IN THE ORDER THE NAV DRAWS THEM: the rail's own set (`+layout.svelte`), with a page cut
   * by the budget, a saved view and a page one row made left to the places that draw them.
   */
  const views = $derived(new Set(shell.index.registers.flatMap((r) => r.views.map((v) => v.href))));
  const inNav = $derived(shell.nav.filter((e) => !e.cut && !e.row && !views.has(e.href)));
  const sections = $derived(arrange(inNav, navPrefs.order));
  /* THE ORDER A MOVE IS MADE IN: the nav's own arrangement, hidden pages in, so a page shown again goes back where it was. */
  const arranged = $derived(arrange(navPrefs.relabel(inNav), navPrefs.order));
  /* WHETHER A PRESS WOULD MOVE ANYTHING, among the pages of its heading still drawn, so an arrow at an edge is not offered. */
  const edge = (href: string, step: -1 | 1): boolean => {
    const list = (arranged.find(([, l]) => l.some((e) => e.href === href))?.[1] ?? []).filter((e) => !navPrefs.isHidden(e.href));
    const at = list.findIndex((e) => e.href === href);
    return at < 0 || (step === -1 ? at <= 0 : at >= list.length - 1);
  };
  function move(href: string, step: -1 | 1) {
    void navPrefs.move(arranged, href, step)?.then((saved) => {
      if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
    });
  }
  const groups = $derived(
    sections.map(
      ([section, list]) =>
        [
          section,
          list.map((e): Listed => ({ href: e.href, slug: e.href.startsWith('/p/') ? slugOf(e.href) : null, own: e.title, icon: e.icon, inNav: true, row: false })),
        ] as const,
    ),
  );

  /* NAMES ARE COMPARED AS A PERSON READS THEM, case and spaces aside. */
  const same = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

  /**
   * EVERY PAGE OF THE NAV AS ONE LIST, IN THE NAV'S OWN ORDER (`flatNav`, the rule the top bar and More draw by): Today,
   * the sections a day runs through, Activity, Decide, then what sits under More. Today, Activity and Decide are the
   * app's own screens, listed with the rest so the list is the whole nav; they open and are chosen to open first, and
   * have no layout of their own to edit yet. A section's pages follow its row, each saying its section when its name
   * does not. Decide is listed whether or not anything waits on it today, since this is where it is found.
   */
  const ordered = $derived.by((): Listed[] => {
    const holdsTasks = shell.index.registers.some((r) => r.id === TASKS);
    const flat = flatNav(sections, 1, { today: copy.today, activity: copy.audit, decide: voiced('decide') }, { work: holdsTasks ? WORK : null });
    const bySection = new Map(groups.map(([section, list]) => [section.trim().toLocaleLowerCase(), { section, list }] as const));
    const app = (href: string, own: string, icon: IconName): Listed => ({ href, slug: null, own, icon, inNav: true, row: false, app: true });
    const out: Listed[] = [];
    /* IN THE SIDEBAR'S ORDER, AND ONLY WHAT IT DRAWS (Q42 of 29 October): this list held Dashboard and Renewals at the
       top level and Activity, none of which the sidebar shows there. The sidebar is the rail (`railOf`): Today, Needs
       you, the places with Agents after Money, then Projects, then whatever it folds under More lists, which each say
       so. Activity is not a row of the sidebar, so it is not one here. */
    const rail = railOf(flat, voiced('decide'));
    const all = [...rail.places, ...rail.rest];
    const plain = (i: { key: string }): string => i.key.replace(/^section:/u, '').trim().toLocaleLowerCase();
    const projectsAt = all.find((i) => rail.things.some(([section]) => section === i.label)) ?? all.find((i) => plain(i) === 'projects') ?? null;
    const agentsKey = all.find((i) => i.href === agentsHref(all))?.key ?? null;
    const moneyKey = all.find((i) => plain(i) === 'money')?.key ?? null;
    const placesIn = sideOrder(
      all.filter((i) => i !== projectsAt && i.key !== 'activity' && (rail.places.includes(i) || i.key === agentsKey)),
      { agents: agentsKey, money: moneyKey },
    );
    const restIn = rail.rest.filter((i) => i !== projectsAt && i.key !== 'activity' && i.key !== agentsKey);
    const folded = new Set(restIn.map((i) => i.key));
    for (const item of [...placesIn, ...(projectsAt ? [projectsAt] : []), ...restIn]) {
      const atMore = folded.has(item.key);
      const start = out.length;
      if (item.key === 'today') out.push(app('/', item.label, 'today'));
      else if (item.key === 'activity') out.push(app('/audit', item.label, 'activity'));
      else if (item.key === 'decide') out.push(app('/decide', item.label, 'decide'));
      else {
        if (item.href === WORK && holdsTasks) out.push(app(WORK, item.label, item.icon as IconName));
        const held = bySection.get(item.label.trim().toLocaleLowerCase());
        if (!held) continue;
        /* A NAME THAT REPEATS SAYS WHERE IT IS (agents F14): Work the screen and Work the page read "Work", then
           "Work" with "In Work" under it, rather than the same word twice. */
        for (const p of held.list) {
          const twin = out.some((o) => same(o.own, p.own));
          /* A PAGE NAMED AS ITS SECTION, WHEN THE APP'S SCREEN OF THAT NAME IS ALREADY LISTED, IS NOT LISTED AGAIN (UI pass
             of 21 October): "Work" then "Work, in Work" was one place said twice. */
          if (twin && same(p.own, held.section)) continue;
          out.push(same(p.own, held.section) && !twin ? p : { ...p, section: held.section });
        }
      }
      /* WHAT THE SIDEBAR FOLDS UNDER MORE LISTS SAYS SO, as a page under a section says its section. */
      if (atMore) for (let i = start; i < out.length; i++) out[i] = { ...out[i]!, section: words.moreLists };
    }
    return out;
  });

  /**
   * EVERY OTHER PAGE THE RECORD DECLARES, by the title the record gives it: one `pages` read, asked once for this visit.
   * A shell no record answered has the slugs `boot` sent and nothing more, so a page is named by its address there.
   */
  let titled = $state<{ slug: string; title: string; row: boolean; register: string | null }[] | null>(null);
  $effect(() => {
    if (!shell.live || titled !== null) return;
    let current = true;
    /* UNTRACKED, or the effect reads the pending count `opened()` writes, opens the read again on every answer, and
       Svelte stops it as a loop before the titles land (the pages were then named by their slugs). */
    const call = untrack(opened);
    void readPages()
      .then((got) => {
        if (current) titled = got;
        closed(true, call);
      })
      .catch(() => closed(true, call));
    return () => {
      current = false;
    };
  });

  /* `about` NAMES THE ROW A PAGE WAS MADE FOR (a person, a project), and is `null` on a page somebody wrote. The record's
     `pages` sends only a slug and a title today, so `others` also asks the nav, whose entries carry it from `boot`. */
  async function readPages(): Promise<{ slug: string; title: string; row: boolean; register: string | null }[]> {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base: apiBase() }).pages();
    if (!out.ok || !Array.isArray(out.value)) return [];
    return out.value.flatMap((p) => {
      const page = p as { slug?: unknown; title?: unknown; about?: unknown };
      return typeof page.slug === 'string' && page.slug !== ''
        ? [
            {
              slug: page.slug,
              title: typeof page.title === 'string' ? page.title : '',
              row: page.about !== null && typeof page.about === 'object',
              register: page.about !== null && typeof page.about === 'object' && typeof (page.about as { register?: unknown }).register === 'string' ? (page.about as { register: string }).register : null,
            },
          ]
        : [];
    });
  }

  const others = $derived.by((): Listed[] => {
    const drawn = new Set(inNav.map((e) => e.href));
    const known = new Map(shell.nav.map((e) => [e.id, e] as const));
    const all = titled ?? shell.pages.map((slug) => ({ slug, title: '', row: known.get(slug)?.row === true, register: null }));
    /* NOR IS A PAGE LISTED HERE UNDER A NAME THE NAV ALREADY SHOWS: Activity was in both lists. */
    const shown = new Set(ordered.map((o) => o.own.trim().toLocaleLowerCase()));
    const listed = all
      .filter((p) => !drawn.has(`/p/${p.slug}`))
      .filter((p) => !shown.has((p.title || known.get(p.slug)?.title || wordsOf(p.slug)).trim().toLocaleLowerCase()))
      .map((p) => ({
        href: `/p/${p.slug}`,
        slug: p.slug,
        own: p.title || known.get(p.slug)?.title || wordsOf(p.slug),
        icon: known.get(p.slug)?.icon ?? 'doc',
        inNav: false,
        row: p.row || known.get(p.slug)?.row === true,
        register: p.register,
      }));
    /* THE PAGES SOMEBODY WROTE FIRST, and the pages a row made after them, each in the record's order. */
    return [...listed.filter((p) => !p.row), ...listed.filter((p) => p.row)];
  });

  /* THE PAGES A ROW MADE ARE FOLDED, and the written ones past eight: a record with a page per person or project lists
     them all, and a list that long is read by the person who asked for it. The fold names only what it hides, so the
     pages drawn and the pages it adds come to the count over the section. */
  const FOLD = 4;
  let unfolded = $state(false);
  /* ADD A PAGE FINDS BY NAME: typing narrows every page not in the sidebar, folded ones too. */
  let finding = $state('');
  const found = (p: Listed): boolean => finding.trim() === '' || `${navPrefs.labelOf(p.href, p.own)} ${p.own}`.toLowerCase().includes(finding.trim().toLowerCase());
  const othersShown = $derived(finding.trim() !== '' ? others.filter(found) : unfolded ? others : others.filter((p) => !p.row).slice(0, FOLD));
  /* WHAT IS IN THE NAV NOW, and the pages hidden from it, which "Not in your nav" leads with. */
  const navShown = $derived(ordered.filter((p) => !navPrefs.isHidden(p.href)));
  const hiddenRows = $derived(ordered.filter((p) => navPrefs.isHidden(p.href)));
  /**
   * A SECTION'S PAGES FOLD UNDER ONE ROW (UI pass 1 Nov): three or more pages in a row under one section ("In Money",
   * nine of them) are one row that names the first few and opens them in place, so the sidebar's list is the sidebar's
   * shape and not every page of Money. Opened, they stay open for the visit; moving one moves it among the others as
   * before, since the order is still `navShown`'s.
   */
  type Run = { kind: 'row'; p: Listed } | { kind: 'fold'; section: string; rows: Listed[] };
  let openSections = $state<readonly string[]>([]);
  const navRuns = $derived.by((): Run[] => {
    const out: Run[] = [];
    let i = 0;
    while (i < navShown.length) {
      const p = navShown[i]!;
      let j = i;
      while (p.section !== undefined && j + 1 < navShown.length && navShown[j + 1]!.section === p.section) j++;
      const run = navShown.slice(i, j + 1);
      if (p.section !== undefined && run.length >= 3 && !openSections.includes(p.section)) out.push({ kind: 'fold', section: p.section, rows: run });
      else for (const q of run) out.push({ kind: 'row', p: q });
      i = j + 1;
    }
    return out;
  });
  const foldNames = (rows: readonly Listed[]): string => {
    const names = rows.map((r) => navPrefs.labelOf(r.href, r.own));
    return names.length <= 3 ? LIST.format(names) : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  };
  const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });
  /* THE PRESS TAKES THE FOCUS TO THE FIRST PAGE IT OPENED: the row pressed is gone, and focus left on nothing falls back
     to the top of the document. */
  async function openSection(section: string, firstHref: string | undefined): Promise<void> {
    openSections = [...openSections, section];
    await tick();
    if (firstHref === undefined) return;
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.pages a.page-link')].find((a) => a.getAttribute('href')?.endsWith(firstHref));
    link?.focus();
  }
  const outCount = $derived(hiddenRows.length + others.length);
  /* WHAT THE FOLD HOLDS, BY KIND: "Pages of 30 projects, 8 people and every agent run", never "1047 more pages". */
  const foldLine = $derived.by(() => {
    const drawn = new Set(othersShown.map((p) => p.href));
    return foldSaid(
      others.filter((p) => !drawn.has(p.href)).map((p) => ({ row: p.row, register: p.register ?? null })),
      shell.index.registers,
    );
  });

  /* ── the home page ── */

  /* TODAY IS THE PAGE THE APP DRAWS ITSELF, and every row of the nav is a choice beside it. A home
     set to a page the nav no longer holds is still offered, so the select never shows a choice that is not the one
     kept. */
  const homes = $derived.by(() => {
    const out: { href: string; name: string }[] = [
      { href: '/', name: copy.today },
      ...ordered.filter((p) => p.href !== '/').map((p) => ({ href: p.href, name: navPrefs.labelOf(p.href, p.own) })),
    ];
    const home = navPrefs.home;
    if (home !== null && !out.some((o) => o.href === home)) {
      const other = others.find((o) => o.href === home);
      out.push({ href: home, name: other?.own ?? home });
    }
    return out;
  });
  const homeNow = $derived(navPrefs.home ?? '/');

  function pickHome(href: string) {
    const before = navPrefs.home;
    const name = homes.find((h) => h.href === href)?.name ?? href;
    void navPrefs.setHome(href).then((saved) => said(saved, words.homeSet(name), () => void navPrefs.setHome(before)));
  }

  /* ── one page's presses ── */

  function toggleHidden(p: Listed, title: string) {
    if (navPrefs.isHidden(p.href)) {
      void navPrefs.show(p.href).then((saved) => said(saved, copy.shownInNav(title), () => void navPrefs.hide(p.href)));
    } else {
      void navPrefs.hide(p.href).then((saved) => said(saved, words.hidden(title), () => void navPrefs.show(p.href)));
    }
  }

  const toggleFirst = (p: Listed) => pickHome(navPrefs.home === p.href ? '/' : p.href);

  /* RENAMING, in a sheet with one field: the person's own name for the page in their nav. */
  let naming = $state<Listed | null>(null);
  let namingOpen = $state(false);
  let name = $state('');
  function startRename(p: Listed) {
    naming = p;
    name = navPrefs.labelOf(p.href, p.own);
    namingOpen = true;
  }

  function saveName(e?: SubmitEvent) {
    e?.preventDefault();
    const p = naming;
    if (p === null) return;
    namingOpen = false;
    const from = navPrefs.labelOf(p.href, p.own);
    const before = navPrefs.labels[p.href] ?? null;
    const to = name.trim();
    if (to === from) return;
    void navPrefs.setLabel(p.href, to, p.own).then((saved) =>
      said(saved, to === '' || to === p.own ? words.unnamed(p.own) : words.renamed(from, to), () => void navPrefs.setLabel(p.href, before, p.own)),
    );
  }

  /* CHANGE WITH SLASH: the page's own "Change this page" sheet, about this page, opened from here. */
  let changing = $state<Listed | null>(null);
  let changingOpen = $state(false);
  function startChange(p: Listed) {
    changing = p;
    changingOpen = true;
  }

  async function kept() {
    forget();
    await invalidateAll();
  }

  /* ── add-ons ── */

  type Addon = { id: string; name: string; on: boolean; registers: string[] };
  let addons = $state<Addon[] | null>(null);
  $effect(() => {
    if (!shell.live || addons !== null) return;
    let current = true;
    /* UNTRACKED for the reason the titles' read gives. */
    const call = untrack(opened);
    void readAddons()
      .then((got) => {
        if (current) addons = got;
        closed(true, call);
      })
      .catch(() => closed(true, call));
    return () => {
      current = false;
    };
  });

  async function readAddons(): Promise<Addon[]> {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base: apiBase() }).packs();
    if (!out.ok) return [];
    return out.value.map((p) => ({ id: p.id, name: moduleName(p.id), on: p.disabled_at === null, registers: p.registers }));
  }

  /* AN ADD-ON WEARS ITS OWN PAGE'S ICON (Money's wallet), else the icon of the first list it holds, else the add-ons'
     own; one of each, at most five, so the line shows what is on rather than a row of the same box. */
  const ADDON_ICONS = 5;
  const addonIcons = $derived.by((): IconName[] => {
    const pageIcon = new Map(shell.nav.map((e) => [e.title.toLocaleLowerCase(), e.icon] as const));
    const listIcon = new Map(shell.index.registers.map((r) => [r.id, r.icon] as const));
    const icons = (addons ?? [])
      .filter((a) => a.on)
      .map((a): IconName => pageIcon.get(a.name.toLocaleLowerCase()) ?? a.registers.map((r) => listIcon.get(r)).find((i) => i !== undefined) ?? 'packs');
    return [...new Set(icons)].slice(0, ADDON_ICONS);
  });
  const addonsOn = $derived((addons ?? []).filter((a) => a.on).length);
</script>

<!-- ONE PAGE: its glyph, the name it carries in this person's nav, one line when something about it is theirs, and the
     menu that holds the rest. THE WHOLE ROW IS THE LINK (the title's link reaches over it), so Open is a word that
     shows where the pointer is and not a second stop for the keyboard. -->
{#snippet pageRow(p: Listed)}
  {@const title = navPrefs.labelOf(p.href, p.own)}
  {@const hidden = p.inNav && navPrefs.isHidden(p.href)}
  {@const first = navPrefs.home === p.href || (p.href === '/' && navPrefs.home === null)}
  <li class="page-row" data-hidden={hidden ? '' : undefined} in:lineIn>
    <div class="line" class:line-tall={first || hidden || title !== p.own || p.section !== undefined || p.app === true}>
      <span class="line-mark"><IconWell name={p.icon} size="l" /></span>
      <span class="line-main">
        <a class="line-title page-link" href={at(p.href)}>{title}</a>
        {#if first}
          <span class="line-detail">{words.opensFirst}</span>
        {:else if hidden}
          <span class="line-detail">{words.isHidden}</span>
        {:else if title !== p.own}
          <span class="line-detail">{words.called(p.own)}</span>
        {:else if p.section}
          <span class="line-detail">{words.under(p.section)}</span>
        {:else if p.app}
          <span class="line-detail">{words.fixed}</span>
        {/if}
      </span>
      <span class="line-amount"></span>
      <span class="line-when line-verbs page-acts">
        {#if hidden}
          <!-- A HIDDEN PAGE'S ONE PRESS, drawn and not in a menu: the way back. -->
          <span class="moves"><Button size="sm" onclick={() => toggleHidden(p, title)}>{copy.showAgain}</Button></span>
        {:else if p.inNav && !p.app}
          <!-- MOVE AND HIDE ARE ALWAYS DRAWN (agents F18), 32px, 44 under a thumb; below 640px they live in the menu. -->
          <span class="moves" data-moves="">
            <button type="button" class="step tap" aria-label={words.up(title)} disabled={edge(p.href, -1)} onclick={() => move(p.href, -1)}><Icon name="arrow-up" size="s" /></button>
            <button type="button" class="step tap" aria-label={words.down(title)} disabled={edge(p.href, 1)} onclick={() => move(p.href, 1)}><Icon name="arrow-down" size="s" /></button>
            <Button size="sm" weight="bare" aria-label={words.hideOne(title)} onclick={() => toggleHidden(p, title)}>{words.hideWord}</Button>
          </span>
        {:else}
          <span class="page-open" aria-hidden="true">{words.open}</span>
        {/if}
        {#if !(p.app && first)}<span class="page-menu">
          <Menu label={words.more(title)} align="end">
            {#snippet trigger()}
              <span class="page-more"><Icon name="more" size="s" /><span class="vh">{words.more(title)}</span></span>
            {/snippet}
            {#if owner && p.slug !== null}
              <a class="mi wide-only" role="menuitem" href={at(p.href)}>{words.layout}</a>
              <button type="button" class="mi" role="menuitem" onclick={() => startChange(p)}>{words.slash}</button>
            {/if}
            {#if p.inNav && !p.app && !hidden}
              <button type="button" class="mi mi-phone" role="menuitem" disabled={edge(p.href, -1)} onclick={() => move(p.href, -1)}>{words.upWord}</button>
              <button type="button" class="mi mi-phone" role="menuitem" disabled={edge(p.href, 1)} onclick={() => move(p.href, 1)}>{words.downWord}</button>
            {/if}
            {#if p.inNav && !p.app}
              <button type="button" class="mi" role="menuitem" onclick={() => startRename(p)}>{words.rename}</button>
            {/if}
            <button type="button" class="mi" role="menuitem" onclick={() => toggleFirst(p)}>{first ? words.notFirst : words.first}</button>
            {#if p.inNav && !p.app && !hidden}
              <button type="button" class="mi mi-phone" role="menuitem" onclick={() => toggleHidden(p, title)}>{words.hide}</button>
            {/if}
          </Menu>
        </span>{/if}
      </span>
    </div>
  </li>
{/snippet}

{#snippet addonsLine()}
  <!-- THE ADD-ONS THE PAGES CAME WITH, as one line: what is on, and the door to where each is turned off or on. -->
  {#if addons !== null}
    <p class="addons">
      {#if addonIcons.length > 0}<span class="addons-icons" aria-hidden="true">{#each addonIcons as icon (icon)}<Icon name={icon} size="s" />{/each}</span>{/if}
      <span>{words.addonsOn(addonsOn, addons.length - addonsOn)}</span>
      <span class="addons-dot" aria-hidden="true">{' · '}</span>
      <a class="addons-manage" href={at('/settings/addons')}>{words.manage}</a>
    </p>
  {/if}
{/snippet}

<!-- WHAT THE APP OPENS ON, one select: the sidebar tile's action (G9), where it was a whole tile for itself. -->
{#snippet opensAction()}
  <span class="opens-inline">
    <label class="opens-label" for="home-select">{words.opensOn}</label>
    <select id="home-select" class="home-select" value={homeNow} onchange={(e) => pickHome(e.currentTarget.value)}>
      {#each homes as h (h.href)}<option value={h.href}>{h.name}</option>{/each}
    </select>
  </span>
{/snippet}

{#if part === 'opens'}
  <!-- WHAT THE APP OPENS ON on its own, for a caller that draws it apart from the sidebar's list. -->
  <Tile>
    <div class="opens">
      <IconWell name="home" />
      <label class="opens-label" for="home-select">{words.opensOn}</label>
      <select id="home-select" class="home-select" value={homeNow} onchange={(e) => pickHome(e.currentTarget.value)}>
        {#each homes as h (h.href)}<option value={h.href}>{h.name}</option>{/each}
      </select>
    </div>
  </Tile>
{/if}

{#if drawn('nav')}
  <Tile icon="rows" title={words.inNav} actions={opensAction}>
    <p class="hint">{words.inNavHint}</p>
    {#if navShown.length === 0}
      <Empty kind="cleared" title={words.none} body={words.noneWhy} />
    {:else}
      <!-- ONE LIST, ONE RHYTHM: a hairline between every row, the nav's order, and a page under a section named
           otherwise says where it is ("In Work"). -->
      <ul class="ledger ledger-lead pages">
        {#each navRuns as r (r.kind === 'row' ? r.p.href : `fold:${r.section}`)}
          {#if r.kind === 'row'}
            {@render pageRow(r.p)}
          {:else}
            <li class="page-row page-fold">
              <button type="button" class="line line-tall fold-line" aria-expanded="false" onclick={() => void openSection(r.section, r.rows[0]?.href)}>
                <span class="line-mark"><IconWell name="rows" size="l" /></span>
                <span class="line-main">
                  <span class="line-title">{foldNames(r.rows)}</span>
                  <span class="line-detail">{words.inSection(r.rows.length, r.section)}</span>
                </span>
                <span class="line-amount"></span>
                <span class="line-when fold-go" aria-hidden="true">{words.showThem}<Icon name="chevron" size="s" /></span>
              </button>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  </Tile>
{/if}

{#if drawn('others')}
  <div id="hidden">
    <Tile icon="plus" title={words.other}>
      <p class="hint">{words.otherHint}</p>
      {#if outCount === 0}
        <p class="nothing-out">{words.nothingOut}</p>
      {:else}
        <!-- A FIELD THAT LOOKS LIKE ONE: the input stood bare on the tile, read as a line of grey words. -->
        <div class="find field">
          <Icon name="search" size="s" />
          <input class="field-input" type="search" aria-label={words.find} placeholder={words.find} autocomplete="off" spellcheck="false" bind:value={finding} />
        </div>
        {#if finding.trim() !== '' && hiddenRows.filter(found).length + othersShown.length === 0}<p class="nothing-out">{words.noMatch}</p>{/if}
        <ul class="ledger ledger-lead pages">
          {#each hiddenRows.filter(found) as p (p.href)}{@render pageRow(p)}{/each}
          {#each othersShown as p (p.href)}{@render pageRow(p)}{/each}
          {#if finding.trim() === '' && others.length > othersShown.length}
            <!-- THE REST IS A ROW LIKE THE OTHERS, its chevron saying a press opens more. -->
            <li class="page-row page-fold">
              <button type="button" class="line fold-line" onclick={() => (unfolded = true)}>
                <span class="line-mark"><IconWell name="doc" size="l" /></span>
                <span class="line-main"><span class="line-title">{foldLine}</span></span>
                <span class="line-amount"></span>
                <span class="line-when fold-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
              </button>
            </li>
          {/if}
        </ul>
      {/if}
      {@render addonsLine()}
    </Tile>
  </div>
{/if}

{#if naming}
  {@const n = naming}
  <Sheet bind:open={namingOpen} title={words.renameTitle(navPrefs.labelOf(n.href, n.own))}>
    <form id="rename-page" class="rename" onsubmit={saveName}>
      <label class="rename-label" for="rename-input">{words.renameLabel}</label>
      <div class="field">
        <!-- svelte-ignore a11y_autofocus -->
        <input id="rename-input" class="field-input" bind:value={name} maxlength={LABEL_MOST} placeholder={n.own} autocomplete="off" autofocus />
      </div>
      <p class="hint">{words.renameHint(n.own)}</p>
    </form>
    {#snippet footer()}
      <Button weight="primary" type="submit" form="rename-page">{words.save}</Button>
    {/snippet}
  </Sheet>
{/if}

{#if owner && changing?.slug}
  {@const c = changing}
  {@const slug = changing.slug}
  <Sheet bind:open={changingOpen} title={words.slashTitle(navPrefs.labelOf(c.href, c.own))}>
    {#key slug}
      {#await import('$lib/page/AskPage.svelte') then ask}
        <ask.default
          page={slug}
          {model}
          onsource={() => {
            changingOpen = false;
            void goto(at(`${c.href}?src=1`));
          }}
          onkept={kept}
        />
      {/await}
    {/key}
  </Sheet>
{/if}

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .find {
    margin-block-end: var(--sp-3);
  }

  .find input {
    inline-size: 100%;
  }

  .nothing-out {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* A ROW THAT CAN BE MOVED KEEPS ITS PRESSES IN SIGHT (agents F18): `rows.css` waits for the pointer, these do not. */
  .page-acts:has(.moves) {
    opacity: 1;
  }

  /* MOVE AND HIDE, over the row's link so each press is its own. */
  .moves {
    position: relative;
    z-index: var(--z-raise);
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .step {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .step:hover:not(:disabled) {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .step:disabled {
    cursor: default;
    opacity: 0.35;
  }

  @media (pointer: coarse) {
    .step {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  /* BELOW 640PX THE ROW HAS ONE "⋯" (agents F18): moves and Hide are its first items there, and not drawn on the row. */
  @media (width < 640px) {
    .moves[data-moves] {
      display: none;
    }
  }

  @media (width >= 640px) {
    :global(.mi.mi-phone) {
      display: none;
    }
  }

  /* ONE LINE: the home glyph, "Opens on", and the select, a step clear of the pages under it. */
  .opens {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
  }

  .opens-label {
    flex: 1 1 auto;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  /* IN THE HEADING ROW: "Opens on" in the meta ink, then the select, a control's height. */
  .opens-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .opens-inline .opens-label {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  .opens-inline .home-select {
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
  }

  .page-row[data-hidden] .page-link {
    color: var(--ink-3);
  }

  /* THE TITLE'S LINK REACHES OVER ITS ROW, so a press anywhere on the row opens the page. On `::before`, because that is
     the box a target is measured by (`13 §7`, the layout gate): on `::after` the link measured its words alone. */
  .page-link {
    color: inherit;
    text-decoration: none;
  }

  .page-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .page-link:focus-visible {
    /* focus-ok: the link is stretched over its row, so the row's line carries the ring instead
       (`.line:has(.page-link:focus-visible)` below), where it outlines what a press would open. */
    outline: none;
  }

  .line:has(.page-link:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .page-row > .line:hover {
      background: var(--hover);
    }

    .page-row:has(> .line:hover) > .line::after,
    .page-row:has(> .line:hover) + .page-row > .line::after {
      opacity: 0;
    }
  }

  .page-acts {
    gap: var(--sp-1);
  }

  /* AN OPEN MENU KEEPS ITS ROW'S TOOLS IN SIGHT, wherever the pointer went. */
  .page-row:has(:global([aria-expanded='true'])) .page-acts {
    opacity: 1;
  }

  /* OPEN IS A WORD ON THE LINK, and a press on it falls through to the link under it. */
  .page-open {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    pointer-events: none;
  }

  /* THE MENU SITS OVER THE ROW'S LINK, so its press is its own. */
  .page-menu {
    position: relative;
    z-index: var(--z-raise);
  }

  .page-more {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    color: var(--ink-3);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE FOLD IS A ROW: the row's own grid and hairline, a button so a key and a thumb both open it. */
  .fold-line {
    inline-size: 100%;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .fold-line .line-title {
    color: var(--ink-2);
  }

  .fold-go {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  @media (hover: hover) and (pointer: fine) {
    .fold-line:hover {
      background: var(--hover);
    }
  }

  /* THE ADD-ONS' LINE, at the foot and quiet: their icons, how many are on, and Manage. */
  .addons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-4) 0 0;
    padding: var(--sp-3) var(--sp-2) 0;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .addons-icons {
    display: inline-flex;
    gap: var(--sp-1);
    color: var(--ink-2);
  }

  .addons-dot {
    color: var(--ink-3);
  }

  .addons-manage {
    color: var(--red);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .home-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 14rem;
    padding: 0 var(--sp-3);
    background: var(--tile);
    border: 1px solid var(--switch-off);
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .rename {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .rename-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* UNDER A THUMB THE ROW IS ITS OWN OPEN, so the word is not drawn; the menu is, at a thumb's size. */
  @media (hover: none) {
    .page-open {
      display: none;
    }
  }

  @media (pointer: coarse) {
    .page-more {
      inline-size: var(--tap);
      block-size: var(--tap);
    }

    .addons-manage {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  /* AT A PHONE'S WIDTH THE SELECT TAKES WHAT IS LEFT OF THE LINE, and a long page name is cut rather than pushing it off. */
  @media (width < 640px) {
    .home-select {
      flex: 1 1 auto;
      min-inline-size: 0;
      max-inline-size: 12rem;
    }
  }
</style>
