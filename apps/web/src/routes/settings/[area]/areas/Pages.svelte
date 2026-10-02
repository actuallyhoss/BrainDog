<!--
  Settings > Pages: every page this record declares, what the app opens on, and the add-ons the pages came with.

  ONE PLACE TO CHANGE ANY PAGE FROM, without code (DIRECTION §35). A page's own head already offers Edit layout and
  "Change this page", which a person finds only once they are on the page; here every page is one row, with Open in
  reach and the rest behind one menu: Edit layout, Change with Slash, a name of their own in the nav, open it first,
  and Hide. Fewer things on screen: one press is drawn per page, and the menu holds what is done less often.

  WHAT IS A PERSON'S OWN AND WHAT IS THE RECORD'S. The name in the nav, the page it opens on and what is hidden are this
  person's (`nav-prefs.svelte.ts`: `nav.labels`, `home.page`, `nav.hidden`), kept for them on the record and on this
  device without one. The layout and a change through Slash are the page itself, which only an owner may change, so a
  colleague is offered neither.

  THE HOME PAGE AND THE NAMES NEED TWO KEYS THE RECORD DOES NOT TAKE YET. `home.page` and `nav.labels` join
  `PREF_KEYS` in `packages/record/src/index.ts`; until they do, a record refuses them in its own sentence and the screen
  puts the choice back and says so. The shell reads `navPrefs.home` and `navPrefs.relabel` to draw them.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { arrange } from '$lib/nav.ts';
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
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /* THE PAGE ITSELF IS THE OWNER'S TO CHANGE, as the record's `setDeclaration` and `slashDraft` hold. */
  const owner = $derived(ownsRecord(shell.me));
  /* THE SAME FACT A PAGE'S OWN "Change this page" STANDS ON: whether this host has a model behind Slash. */
  const model = $derived((page.data as { slash?: unknown }).slash === true);

  /* THIS AREA'S OWN WORDS, each naming the person's own page. */
  const words = {
    home: 'Home page',
    homeLine: 'The page you see first when you open BrainDog.',
    homeSet: (name: string) => `BrainDog opens on ${name} now.`,
    pages: 'Your pages',
    pagesHint: 'Open a page, change how it is laid out, or describe a change and let Slash draft it.',
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
    all: (n: number) => `Show all ${n}`,
    none: 'No pages yet',
    noneWhy: 'Pages arrive with the add-ons you turn on, and with the pages Slash makes for you.',
    renameTitle: (title: string) => `Rename ${title}`,
    renameLabel: 'Name in your nav',
    renameHint: (own: string) => `Only your nav uses it. The page is still called ${own}, and leaving this empty puts that back.`,
    save: 'Save',
    renamed: (from: string, to: string) => `${from} is ${to} in your nav.`,
    unnamed: (own: string) => `${own} has its own name again.`,
    slashTitle: (title: string) => `Change ${title}`,
    addons: 'Add-ons',
    addonsHint: 'Each add-on brings its own lists and pages. Turn one off and its pages go with it.',
    addonsNone: 'No add-ons yet',
    addonsWhy: 'Add-ons bring the pages for a part of your work, such as money, clients or a project.',
    browse: 'All add-ons',
    off: 'Turned off',
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
  type Listed = { href: string; slug: string | null; own: string; icon: IconName; inNav: boolean };

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
  const groups = $derived(
    arrange(inNav, navPrefs.order).map(
      ([section, list]) =>
        [section, list.map((e): Listed => ({ href: e.href, slug: e.href.startsWith('/p/') ? slugOf(e.href) : null, own: e.title, icon: e.icon, inNav: true }))] as const,
    ),
  );

  /**
   * EVERY OTHER PAGE THE RECORD DECLARES, by the title the record gives it: one `pages` read, asked once for this visit.
   * A shell no record answered has the slugs `boot` sent and nothing more, so a page is named by its address there.
   */
  let titled = $state<{ slug: string; title: string }[] | null>(null);
  $effect(() => {
    if (!shell.live || titled !== null) return;
    let current = true;
    const call = opened();
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

  async function readPages(): Promise<{ slug: string; title: string }[]> {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base: apiBase() }).pages();
    if (!out.ok || !Array.isArray(out.value)) return [];
    return out.value.flatMap((p) => {
      const row = p as { slug?: unknown; title?: unknown };
      return typeof row.slug === 'string' && row.slug !== '' ? [{ slug: row.slug, title: typeof row.title === 'string' ? row.title : '' }] : [];
    });
  }

  const others = $derived.by((): Listed[] => {
    const drawn = new Set(inNav.map((e) => e.href));
    const known = new Map(shell.nav.map((e) => [e.id, e] as const));
    const all = titled ?? shell.pages.map((slug) => ({ slug, title: '' }));
    return all
      .filter((p) => !drawn.has(`/p/${p.slug}`))
      .map((p) => ({
        href: `/p/${p.slug}`,
        slug: p.slug,
        own: p.title || known.get(p.slug)?.title || wordsOf(p.slug),
        icon: known.get(p.slug)?.icon ?? 'doc',
        inNav: false,
      }));
  });

  /* THE OTHER PAGES FOLD PAST EIGHT: a record with a page per project lists them all, and a list that long is read by
     the person who asked for it. */
  const FOLD = 8;
  let unfolded = $state(false);
  const othersShown = $derived(unfolded ? others : others.slice(0, FOLD));
  const total = $derived(inNav.length + others.length);

  /* ── the home page ── */

  /* TODAY IS THE PAGE THE APP DRAWS ITSELF, and every page of the nav is a choice beside them. A home
     set to a page the nav no longer holds is still offered, so the select never shows a choice that is not the one
     kept. */
  const homes = $derived.by(() => {
    const out: { href: string; name: string }[] = [
      { href: '/', name: copy.today },
      ...inNav.map((e) => ({ href: e.href, name: navPrefs.labelOf(e.href, e.title) })),
    ];
    const home = navPrefs.home;
    if (home !== null && !out.some((o) => o.href === home)) {
      const other = others.find((o) => o.href === home);
      out.push({ href: home, name: other?.own ?? home });
    }
    return out;
  });
  const homeNow = $derived(navPrefs.home ?? '/');
  const homeName = $derived(homes.find((h) => h.href === homeNow)?.name ?? copy.today);

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

  type Addon = { id: string; name: string; on: boolean };
  let addons = $state<Addon[] | null>(null);
  $effect(() => {
    if (!shell.live || addons !== null) return;
    let current = true;
    const call = opened();
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
    return out.value.map((p) => ({ id: p.id, name: moduleName(p.id), on: p.disabled_at === null }));
  }

  const ADDONS_MOST = 6;
</script>

<!-- ONE PAGE: its glyph, the name it carries in this person's nav, one line when something about it is theirs, Open,
     and the menu that holds the rest. -->
{#snippet pageRow(p: Listed)}
  {@const title = navPrefs.labelOf(p.href, p.own)}
  {@const hidden = p.inNav && navPrefs.isHidden(p.href)}
  {@const first = navPrefs.home === p.href}
  <li class="page-row" data-hidden={hidden ? '' : undefined}>
    <div class="line" class:line-tall={first || hidden || title !== p.own}>
      <span class="line-mark"><IconWell name={p.icon} size="l" /></span>
      <span class="line-main">
        <span class="line-title">{title}</span>
        {#if first}
          <span class="line-detail">{words.opensFirst}</span>
        {:else if hidden}
          <span class="line-detail">{words.isHidden}</span>
        {:else if title !== p.own}
          <span class="line-detail">{words.called(p.own)}</span>
        {/if}
      </span>
      <span class="line-amount"></span>
      <span class="line-when page-acts">
        <Button weight="quiet" href={p.href}>{words.open}</Button>
        <Menu label={words.more(title)} align="end">
          {#snippet trigger()}
            <span class="page-more"><Icon name="more" size="s" /><span class="vh">{words.more(title)}</span></span>
          {/snippet}
          {#if owner && p.slug !== null}
            <a class="mi wide-only" role="menuitem" href={at(p.href)}>{words.layout}</a>
            <button type="button" class="mi" role="menuitem" onclick={() => startChange(p)}>{words.slash}</button>
          {/if}
          {#if p.inNav}
            <button type="button" class="mi" role="menuitem" onclick={() => startRename(p)}>{words.rename}</button>
          {/if}
          <button type="button" class="mi" role="menuitem" onclick={() => toggleFirst(p)}>{first ? words.notFirst : words.first}</button>
          {#if p.inNav}
            <button type="button" class="mi" role="menuitem" onclick={() => toggleHidden(p, title)}>{hidden ? words.show : words.hide}</button>
          {/if}
        </Menu>
      </span>
    </div>
  </li>
{/snippet}

<!-- WHAT THE APP OPENS ON: one row and one select. -->
{#snippet homeSelect()}
  <select class="home-select" aria-label={words.home} value={homeNow} onchange={(e) => pickHome(e.currentTarget.value)}>
    {#each homes as h (h.href)}<option value={h.href}>{h.name}</option>{/each}
  </select>
{/snippet}

<Section title={words.home}>
  <StateRow icon="home" title={homeName} line={words.homeLine} action={homeSelect} />
  <p class="hint kept">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>
</Section>

<Section title={words.pages} count={total}>
  <p class="hint">{words.pagesHint}</p>
  {#if total === 0}
    <Empty kind="cleared" title={words.none} body={words.noneWhy} />
  {:else}
    {#each groups as [section, list] (section)}
      <p class="group-head">{section}</p>
      <ul class="ledger ledger-lead pages">
        {#each list as p (p.href)}{@render pageRow(p)}{/each}
      </ul>
    {/each}
    {#if others.length > 0}
      <p class="group-head">{words.other}</p>
      <ul class="ledger ledger-lead pages">
        {#each othersShown as p (p.href)}{@render pageRow(p)}{/each}
      </ul>
      {#if !unfolded && others.length > FOLD}
        <div class="fold"><Button weight="bare" onclick={() => (unfolded = true)}>{words.all(others.length)}</Button></div>
      {/if}
    {/if}
  {/if}
</Section>

<!-- THE ADD-ONS THE PAGES CAME WITH, each opening its own screen, where it is turned off or on. -->
<Section title={words.addons} count={addons?.length ?? 0}>
  <p class="hint">{words.addonsHint}</p>
  {#if addons !== null && addons.length === 0}
    <Empty kind="cleared" title={words.addonsNone} body={words.addonsWhy} />
  {:else if addons !== null}
    <ul class="ledger ledger-lead">
      {#each addons.slice(0, ADDONS_MOST) as a (a.id)}
        <li>
          <div class="line" class:line-tall={!a.on}>
            <span class="line-mark"><IconWell name="packs" size="l" /></span>
            <span class="line-main">
              <span class="line-title">{a.name}</span>
              {#if !a.on}<span class="line-detail">{words.off}</span>{/if}
            </span>
            <span class="line-amount"></span>
            <span class="line-when"><Button weight="quiet" href={`/packs/${encodeURIComponent(a.id)}`}>{words.open}</Button></span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="fold"><Button weight="bare" href="/packs">{words.browse}</Button></div>
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

  /* WHERE THE CHOICE IS KEPT, under its row and starting where the row's title starts. */
  .kept {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .group-head {
    margin: 0 0 var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .pages + .group-head {
    margin-block-start: var(--sp-4);
  }

  .page-row[data-hidden] .line-title {
    color: var(--dim);
  }

  .page-acts {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
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

  .fold {
    margin-block-start: var(--sp-2);
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

  @media (pointer: coarse) {
    .page-more {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  /* AT A PHONE'S WIDTH THE SELECT TAKES WHAT IS LEFT OF THE ROW, and a long page name is cut rather than pushing it off. */
  @media (width < 640px) {
    .home-select {
      max-inline-size: 10rem;
    }
  }
</style>
