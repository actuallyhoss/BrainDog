<!--
  Settings > Pages: every page this record declares, what the app opens on, and the add-ons the pages came with.

  ONE PLACE TO CHANGE ANY PAGE FROM, without code (DIRECTION §35). A page's own head already offers Edit layout and
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
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { WORK, arrange, flatNav } from '$lib/nav.ts';
  import { said as voiced } from '$lib/voice.svelte.ts';
  import { TASKS } from '$lib/work/list.ts';
  import { LABEL_MOST, navPrefs, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { moduleName } from '@braindog/seed/usecases/names';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import { ownsRecord } from '../../levels.ts';

  let { shell }: AreaProps = $props();

  /* THE PAGE ITSELF IS THE OWNER'S TO CHANGE, as the record's `setDeclaration` and `slashDraft` hold. */
  const owner = $derived(ownsRecord(shell.me));
  /* THE SAME FACT A PAGE'S OWN "Change this page" STANDS ON: whether this host has a model behind Slash. */
  const model = $derived((page.data as { slash?: unknown }).slash === true);

  /* THIS AREA'S OWN WORDS, each naming the person's own page. */
  const words = {
    opensOn: 'Opens on',
    homeSet: (name: string) => `BrainDog opens on ${name} now.`,
    pages: 'Your pages',
    other: 'Not in your nav',
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
    isHidden: 'Hidden from your nav',
    called: (own: string) => `Called ${own} on its page`,
    under: (section: string) => `In ${section}`,
    morePages: (n: number) => (n === 1 ? '1 more page' : `${n} more pages`),
    none: 'No pages yet',
    noneWhy: 'Pages arrive with the add-ons you turn on, and with the pages Slash makes for you.',
    renameTitle: (title: string) => `Rename ${title}`,
    renameLabel: 'Name in your nav',
    renameHint: (own: string) => `Only your nav uses it. The page is still called ${own}, and leaving this empty puts that back.`,
    save: 'Save',
    renamed: (from: string, to: string) => `${from} is ${to} in your nav.`,
    unnamed: (own: string) => `${own} has its own name again.`,
    slashTitle: (title: string) => `Change ${title}`,
    addonsOn: (on: number, off: number) =>
      `${on === 0 ? 'No add-ons on' : on === 1 ? '1 add-on on' : `${on} add-ons on`}${off === 0 ? '' : `, ${off} off`}`,
    manage: 'Manage',
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
  type Listed = { href: string; slug: string | null; own: string; icon: IconName; inNav: boolean; row: boolean; section?: string; app?: true };

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
    for (const item of [...flat.main, ...flat.more]) {
      if (item.key === 'today') out.push(app('/', item.label, 'today'));
      else if (item.key === 'activity') out.push(app('/audit', item.label, 'activity'));
      else if (item.key === 'decide') out.push(app('/decide', item.label, 'decide'));
      else {
        if (item.href === WORK && holdsTasks) out.push(app(WORK, item.label, item.icon as IconName));
        const held = bySection.get(item.label.trim().toLocaleLowerCase());
        if (!held) continue;
        for (const p of held.list) out.push(same(p.own, held.section) ? p : { ...p, section: held.section });
      }
    }
    return out;
  });

  /**
   * EVERY OTHER PAGE THE RECORD DECLARES, by the title the record gives it: one `pages` read, asked once for this visit.
   * A shell no record answered has the slugs `boot` sent and nothing more, so a page is named by its address there.
   */
  let titled = $state<{ slug: string; title: string; row: boolean }[] | null>(null);
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
  async function readPages(): Promise<{ slug: string; title: string; row: boolean }[]> {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base: apiBase() }).pages();
    if (!out.ok || !Array.isArray(out.value)) return [];
    return out.value.flatMap((p) => {
      const page = p as { slug?: unknown; title?: unknown; about?: unknown };
      return typeof page.slug === 'string' && page.slug !== ''
        ? [{ slug: page.slug, title: typeof page.title === 'string' ? page.title : '', row: page.about !== null && typeof page.about === 'object' }]
        : [];
    });
  }

  const others = $derived.by((): Listed[] => {
    const drawn = new Set(inNav.map((e) => e.href));
    const known = new Map(shell.nav.map((e) => [e.id, e] as const));
    const all = titled ?? shell.pages.map((slug) => ({ slug, title: '', row: known.get(slug)?.row === true }));
    const listed = all
      .filter((p) => !drawn.has(`/p/${p.slug}`))
      .map((p) => ({
        href: `/p/${p.slug}`,
        slug: p.slug,
        own: p.title || known.get(p.slug)?.title || wordsOf(p.slug),
        icon: known.get(p.slug)?.icon ?? 'doc',
        inNav: false,
        row: p.row || known.get(p.slug)?.row === true,
      }));
    /* THE PAGES SOMEBODY WROTE FIRST, and the pages a row made after them, each in the record's order. */
    return [...listed.filter((p) => !p.row), ...listed.filter((p) => p.row)];
  });

  /* THE PAGES A ROW MADE ARE FOLDED, and the written ones past eight: a record with a page per person or project lists
     them all, and a list that long is read by the person who asked for it. The fold names only what it hides, so the
     pages drawn and the pages it adds come to the count over the section. */
  const FOLD = 8;
  let unfolded = $state(false);
  const othersShown = $derived(unfolded ? others : others.filter((p) => !p.row).slice(0, FOLD));
  const total = $derived(ordered.length + others.length);

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
  <li class="page-row" data-hidden={hidden ? '' : undefined}>
    <div class="line" class:line-tall={first || hidden || title !== p.own || p.section !== undefined}>
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
        {/if}
      </span>
      <span class="line-amount"></span>
      <span class="line-when line-verbs page-acts">
        <span class="page-open" aria-hidden="true">{words.open}</span>
        {#if !(p.app && first)}<span class="page-menu">
          <Menu label={words.more(title)} align="end">
            {#snippet trigger()}
              <span class="page-more"><Icon name="more" size="s" /><span class="vh">{words.more(title)}</span></span>
            {/snippet}
            {#if owner && p.slug !== null}
              <a class="mi wide-only" role="menuitem" href={at(p.href)}>{words.layout}</a>
              <button type="button" class="mi" role="menuitem" onclick={() => startChange(p)}>{words.slash}</button>
            {/if}
            {#if p.inNav && !p.app}
              <button type="button" class="mi" role="menuitem" onclick={() => startRename(p)}>{words.rename}</button>
            {/if}
            <button type="button" class="mi" role="menuitem" onclick={() => toggleFirst(p)}>{first ? words.notFirst : words.first}</button>
            {#if p.inNav && !p.app}
              <button type="button" class="mi" role="menuitem" onclick={() => toggleHidden(p, title)}>{hidden ? words.show : words.hide}</button>
            {/if}
          </Menu>
        </span>{/if}
      </span>
    </div>
  </li>
{/snippet}

<Section title={words.pages} count={total}>
  <!-- WHAT THE APP OPENS ON: one line and one select. -->
  <div class="opens">
    <IconWell name="home" />
    <label class="opens-label" for="home-select">{words.opensOn}</label>
    <select id="home-select" class="home-select" value={homeNow} onchange={(e) => pickHome(e.currentTarget.value)}>
      {#each homes as h (h.href)}<option value={h.href}>{h.name}</option>{/each}
    </select>
  </div>
  {#if total === 0}
    <Empty kind="cleared" title={words.none} body={words.noneWhy} />
  {:else}
    <!-- ONE LIST, ONE RHYTHM: a hairline between every row, the nav's order, and no gap round a page on its own. -->
    <ul class="ledger ledger-lead pages">
      {#each ordered as p (p.href)}{@render pageRow(p)}{/each}
    </ul>
    {#if others.length > 0}
      <p class="group-head">{words.other}</p>
      <ul class="ledger ledger-lead pages">
        {#each othersShown as p (p.href)}{@render pageRow(p)}{/each}
        {#if others.length > othersShown.length}
          <!-- THE REST IS A ROW LIKE THE OTHERS, its chevron saying a press opens more. -->
          <li class="page-row page-fold">
            <button type="button" class="line fold-line" onclick={() => (unfolded = true)}>
              <span class="line-mark"><IconWell name="doc" size="l" /></span>
              <span class="line-main"><span class="line-title">{words.morePages(others.length - othersShown.length)}</span></span>
              <span class="line-amount"></span>
              <span class="line-when fold-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </button>
          </li>
        {/if}
      </ul>
    {/if}
  {/if}
  <!-- THE ADD-ONS THE PAGES CAME WITH, as one line: what is on, and the door to where each is turned off or on. -->
  {#if addons !== null}
    <p class="addons">
      {#if addonIcons.length > 0}<span class="addons-icons" aria-hidden="true">{#each addonIcons as icon (icon)}<Icon name={icon} size="s" />{/each}</span>{/if}
      <span>{words.addonsOn(addonsOn, addons.length - addonsOn)}</span>
      <span class="addons-dot" aria-hidden="true">{' · '}</span>
      <a class="addons-manage" href={at('/packs')}>{words.manage}</a>
    </p>
  {/if}
</Section>

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
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* ONE LINE: the home glyph, "Opens on", and the select, a step clear of the pages under it. */
  .opens {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    margin-block-end: var(--sp-3);
    padding-inline: var(--sp-2);
  }

  .opens-label {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
  }

  .group-head {
    margin: 0 0 var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .pages + .group-head {
    margin-block-start: var(--sp-4);
  }

  .page-row[data-hidden] .page-link {
    color: var(--dim);
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
    outline: 2px solid var(--focus-in);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .page-row > .line:hover {
      background: var(--hover-wash);
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
    color: var(--ink2);
    font-size: var(--t-sm);
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
    color: var(--dim);
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
    color: var(--ink2);
  }

  .fold-go {
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) {
    .fold-line:hover {
      background: var(--hover-wash);
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
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .addons-icons {
    display: inline-flex;
    gap: var(--sp-1);
    color: var(--ink2);
  }

  .addons-dot {
    color: var(--dim);
  }

  .addons-manage {
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .home-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 14rem;
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .rename {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .rename-label {
    color: var(--ink2);
    font-size: var(--t-sm);
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
