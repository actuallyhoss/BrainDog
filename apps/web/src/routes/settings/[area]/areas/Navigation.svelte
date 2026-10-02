<!--
  Settings > Navigation: the shape of the navigation, the order of its pages, the pages hidden from it, the switch that
  lets the record offer anything, and the holding pen itself.

  EVERY SETTING HERE IS THE PERSON'S OWN ON A RECORD (`nav-prefs.svelte.ts`): the shape is `nav.shape`, the switch is
  `pen.suggest`, and every "Not this one" is appended to `pen.dismissed`, so a choice made on the laptop holds on the
  phone. The sample has no record, so there they stay on this device, and the screen says which it is.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { said as voiceSaid } from '$lib/voice.svelte.ts';
  import { navShapeSignals, recommendNavShape, type NavShape } from '$lib/design/nav-shape.ts';
  import { glyphOf, iconOf, iconOffers, shapeOffer, waiting, type HeldList, type HeldPage, type Offer, type PenItem } from '$lib/design/pen.ts';
  import { penWords } from '$lib/design/words.ts';
  import type { Undone } from '$lib/design/keep.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import type { Rehearsed } from '../../../decide/[id]/proposed.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { navPrefs, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { arrange } from '$lib/nav.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /* THIS AREA'S OWN WORDS: the group the switch sits in, so the row inside can carry the switch's own name, and the
     order of the pages, which says what a press does in the person's own page names. */
  const words = {
    offers: 'Suggestions',
    yours: 'Your pages',
    yoursHint: 'Move a page up or down under its heading, or hide it. Nothing is deleted.',
    up: (title: string) => `Move ${title} up`,
    down: (title: string) => `Move ${title} down`,
    hide: 'Hide',
    hideOne: (title: string) => `Hide ${title}`,
    hidden: (title: string) => `${title} is hidden from your nav.`,
    none: 'No pages in your nav yet',
    noneWhy: 'Pages arrive with the add-ons you turn on, and with the pages you make.',
  };

  /* THE MOST LISTS WHOSE ICON IS READ FOR AN OFFER, one `schema` read each, the record's own cap on the pen. */
  const ICON_LISTS_MOST = 24;

  /** A refusal is the record's own sentence, and a change it kept is said only once it kept it. */
  const said = (saved: Saved, done?: string) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
    else if (done !== undefined) toasts.push(done);
  };

  /**
   * THE PAGES OF THE NAV, IN THE ORDER IT DRAWS THEM, under the names this person gave them.
   *
   * THE RAIL'S OWN SET (`+layout.svelte`): a page the budget cut is drawn by its strip of tabs and not the rail, and a
   * saved view is drawn under its list. A page one row made is left to its list's page, as the flat nav leaves it, so
   * moving it here would move nothing anybody sees. Arranged with the hidden ones in, so the order kept places a hidden
   * page where it was when it is shown again; drawn without them, since they have their own section below.
   */
  const views = $derived(new Set(shell.index.registers.flatMap((r) => r.views.map((v) => v.href))));
  const arranged = $derived(arrange(navPrefs.relabel(shell.nav.filter((e) => !e.cut && !e.row && !views.has(e.href))), navPrefs.order));
  const shown = $derived(
    arranged.flatMap(([section, list]) => {
      const seen = list.filter((e) => !navPrefs.isHidden(e.href));
      return seen.length > 0 ? [[section, seen] as const] : [];
    }),
  );
  const shownCount = $derived(shown.reduce((n, [, list]) => n + list.length, 0));
  /* WHETHER A PRESS WOULD MOVE ANYTHING, so the arrow at a heading's edge is not offered. */
  const edge = (href: string, step: -1 | 1): boolean => {
    const list = shown.find(([, l]) => l.some((e) => e.href === href))?.[1] ?? [];
    const at = list.findIndex((e) => e.href === href);
    return step === -1 ? at <= 0 : at >= list.length - 1;
  };

  function move(href: string, step: -1 | 1) {
    void navPrefs.move(arranged, href, step)?.then((saved) => said(saved));
  }

  function hidePage(p: { href: string; title: string }) {
    void navPrefs.hide(p.href).then((saved) => {
      if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
      else toasts.push(words.hidden(p.title), { undo: () => void navPrefs.show(p.href) });
    });
  }

  /* THE PAGES THIS PERSON HID FROM THEIR NAV, by the name the rail gave them, and the way back. */
  const hiddenPages = $derived(
    navPrefs.hidden.map((href) => ({ href, title: navPrefs.labelOf(href, shell.nav.find((e) => e.href === href)?.title ?? (href === '/inbox' ? voiceSaid('inbox') : href)) })),
  );
  function showAgain(p: { href: string; title: string }) {
    void navPrefs.show(p.href).then((saved) => {
      if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
      else toasts.push(copy.shownInNav(p.title), { undo: () => void navPrefs.hide(p.href) });
    });
  }

  const navShapeLabel = (s: NavShape): string => (s === 'rail' ? copy.navShapeRail : s === 'bar' ? copy.navShapeBar : copy.navShapeMenu);

  /* THE SHAPE, AS THE RECORD KEEPS IT. Picking one writes `nav.shape`, and the shell redraws from the same field. */
  const pickShape = (v: NavShape) => void navPrefs.setShape(v).then((saved) => said(saved));

  /* THE SWITCH. Off empties the pen and stops it refilling; the record's own offers come back with the next `boot`, so it
     is read again once the switch is kept. */
  async function flipSuggest() {
    const saved = await navPrefs.setSuggest(!navPrefs.suggest);
    said(saved);
    if (saved.from === 'kept') {
      forget();
      await invalidateAll();
    }
  }

  /**
   * THE DESIGN AGENT'S NAVIGATION RECOMMENDATION, one more offer in the pen (`nav-shape.ts`, rules unchanged).
   *
   * It is made here and not by the record because it reads the screen as well as the record: below 900px the tab bar is
   * drawn whatever is chosen, so it answers nothing there. It is compared with the shape set now, so choosing the
   * recommended shape by hand makes the offer go on its own rather than nag about a choice just made.
   */
  const navRec = $derived(
    recommendNavShape(
      navShapeSignals(
        shell.nav,
        shell.index.registers.length,
        { nav: navPrefs.order, navShape: navPrefs.shape },
        typeof window === 'undefined' ? undefined : window.innerWidth,
      ),
    ),
  );
  const shapeRow = $derived(navRec === null ? null : shapeOffer(navRec, copy.navShapeRecommend));

  /**
   * AN ICON FOR EVERY RAIL PAGE AND LIST THAT HAS NONE, read from the glyph set (`pen.ts` `iconOffers`).
   *
   * READ HERE, AND ONLY FOR AN OWNER ON A RECORD WITH THE SWITCH ON. Keeping one writes a declaration, which only an owner
   * may do, and the whole bodies it needs are one `pages` read and one `schema` read per list, which is not a cost every
   * screen of the shell should pay for a list nobody is looking at.
   */
  let icons = $state<PenItem[]>([]);
  $effect(() => {
    const lists = shell.index.registers.slice(0, ICON_LISTS_MOST).map((r) => ({ id: r.id, name: r.name }));
    if (!navPrefs.suggest || !shell.me.owner || !shell.live) {
      icons = [];
      return;
    }
    let current = true;
    void readIcons(lists)
      .then((got) => {
        if (current) icons = got;
      })
      .catch(() => {
        /* An icon offer that cannot be read is an offer not made, which is the direction to fail in. */
      });
    return () => {
      current = false;
    };
  });

  async function readIcons(lists: readonly { id: string; name: string }[]): Promise<PenItem[]> {
    const base = apiBase();
    const [{ pagesReader }, { createClient }] = await Promise.all([import('$lib/record/pages-live.ts'), import('@braindog/client')]);
    const client = createClient({ base });
    const [read, schemas] = await Promise.all([
      pagesReader(base).read(),
      Promise.all(lists.map((l) => client.schema(l.id).catch(() => null))),
    ]);
    const pages: HeldPage[] = read.from === 'live' ? read.pages.map((p) => ({ slug: p.slug, title: p.title, body: { ...p.body } })) : [];
    const held: HeldList[] = lists.flatMap((l, i) => {
      const out = schemas[i];
      return out?.ok && out.value !== null && typeof out.value === 'object' ? [{ id: l.id, name: l.name, body: { ...(out.value as Record<string, unknown>) } }] : [];
    });
    return iconOffers(pages, held, penWords.iconWhy);
  }

  /* KEPT IN THIS VISIT, each with the one call that puts it back. The record stops offering a kept item on the next
     `boot`, so without this the row and its Put back would vanish together. */
  type KeptRow = { item: PenItem; putBack: () => Promise<Undone>; busy: boolean };
  let kept = $state<KeptRow[]>([]);
  /* ONE KEEP AT A TIME, so a double press writes once. */
  let keeping = $state<string | null>(null);

  const offers = $derived(
    navPrefs.suggest ? waiting(shapeRow, shell.pen, icons, (id) => navPrefs.isDismissed(id) || kept.some((k) => k.item.id === id)) : [],
  );
  const idOf = (o: Offer): string => (o.from === 'shape' ? o.id : o.item.id);
  const titleOf = (o: Offer): string => (o.from === 'shape' ? o.title : o.item.title);
  const whyOf = (o: Offer): string => (o.from === 'shape' ? `${navShapeLabel(o.shape)}. ${o.why}` : o.item.why);

  /**
   * "Keep it": the offer's whole declaration, written by the owner (`keep.ts`), or for the shape, `nav.shape` set.
   *
   * NOTHING IS SAID UNTIL IT HAPPENED. The toast is the record's answer, and the shell reads `boot` again so a page kept
   * into the nav is in the rail before the toast has gone.
   */
  async function keep(o: Offer) {
    if (keeping !== null) return;
    if (o.from === 'shape') {
      const before = navPrefs.shape;
      const saved = await navPrefs.setShape(o.shape);
      if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
      else toasts.push(penWords.kept(navShapeLabel(o.shape)), { undo: () => void navPrefs.setShape(before).then((s) => said(s)) });
      return;
    }
    const item = o.item;
    keeping = item.id;
    const at = opened();
    try {
      const { keepOffer } = await import('$lib/design/keep.ts');
      const out = await keepOffer(apiBase(), item);
      if (out.from === 'refused') {
        toasts.push(out.fix, { intent: 'warn' });
        return;
      }
      kept = [...kept, { item, putBack: out.putBack, busy: false }];
      const nav = item.change.to.body.nav;
      toasts.push(
        item.kind === 'icon'
          ? penWords.iconKept(item.title)
          : item.kind === 'page' && nav !== null && typeof nav === 'object'
            ? copy.promoted(item.title)
            : penWords.kept(item.title),
      );
      forget();
      await invalidateAll();
    } catch {
      toasts.push(copy.recordNotReached, { intent: 'warn' });
    } finally {
      keeping = null;
      closed(true, at);
    }
  }

  async function putBack(row: KeptRow) {
    if (row.busy) return;
    kept = kept.map((k) => (k === row ? { ...k, busy: true } : k));
    const out = await row.putBack().catch((): Undone => ({ from: 'refused', fix: copy.recordNotReached }));
    if (out.from === 'refused') {
      kept = kept.map((k) => (k.item.id === row.item.id ? { ...k, busy: false } : k));
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    kept = kept.filter((k) => k.item.id !== row.item.id);
    toasts.push(penWords.putBackDone(row.item.title));
    forget();
    await invalidateAll();
  }

  /** "Not this one": terminal, on every device, and never undone from a toast, because terminal is the promise. */
  function dismissOffer(o: Offer) {
    const title = titleOf(o);
    if (showing !== null && idOf(o) === showing.item.id) sheetOpen = false;
    void navPrefs.dismiss(idOf(o)).then((saved) => said(saved, penWords.dismissed(title)));
  }

  /**
   * "Show it": what keeping would draw, rehearsed by the record and thrown away (`previewChange`), drawn through the one
   * page reader in its preview mode, with the page as it stands beside it when the offer changes one.
   */
  let showing = $state<{ item: PenItem; drawn: Rehearsed | null } | null>(null);
  let sheetOpen = $state(false);
  async function show(item: PenItem) {
    showing = { item, drawn: null };
    sheetOpen = true;
    try {
      const { previewOf } = await import('../../../decide/[id]/proposed.ts');
      const drawn = await previewOf({ to: item.change.to } as Parameters<typeof previewOf>[0], apiBase());
      if (showing?.item.id === item.id) showing = { item, drawn };
    } catch {
      if (showing?.item.id === item.id) showing = { item, drawn: { from: 'refused', fix: copy.recordNotReached } };
    }
  }
</script>

<!--
  WHERE THE NAVIGATION LIVES, which is this area's own subject.

  `19 §3` carries five shapes and three conditions. Two of the five are not choices: the tab bar is what a narrow screen
  gets whatever is picked here, and the collapsed rail is a width rather than a shape. The three that are choices are
  here, and the phone sentence says what a phone draws rather than letting the choice look ignored there.
-->
<!-- ONE SHAPE, DRAWN: the ground, the navigation where that shape puts it, and a page beside or under it. Shapes, never
     words, so it is hidden from a screen reader; the button it sits in names the shape. -->
{#snippet shapeOf(v: NavShape)}
  <span class="nav-look" data-shape={v}>
    {#if v === 'rail'}
      <span class="nav-chrome nav-rail"><span class="nav-mark"></span><span class="nav-place" data-on></span><span class="nav-place"></span><span class="nav-place"></span><span class="nav-place"></span></span>
    {:else if v === 'bar'}
      <span class="nav-chrome nav-bar"><span class="nav-mark"></span><span class="nav-place" data-on></span><span class="nav-place"></span><span class="nav-place"></span></span>
    {:else}
      <span class="nav-chrome nav-menu"><span class="nav-lines"></span></span>
    {/if}
    <span class="nav-page">
      <span class="nav-title"></span>
      <span class="nav-tiles"><span class="nav-tile"></span><span class="nav-tile"></span></span>
      <span class="nav-row"></span>
      <span class="nav-row"></span>
    </span>
  </span>
{/snippet}

<Section title={copy.navShape}>
  <!-- ON A PHONE THE SHAPE IS ONE SENTENCE. A phone always draws the tab bar, so a picker there offers a choice
       the phone would not draw; `wide-only` (`settings.css`) leaves the picker to the screens that use it. -->
  <!-- ONE HINT A SECTION: the picker's own on the screens that draw it, and the phone's one sentence on a phone. -->
  <div class="wide-only">
    <p class="hint">{copy.navShapeHint}</p>
    <div class="pictures" role="group" aria-label={copy.navShape}>
      {#each [['rail', copy.navShapeRail, 'rows'], ['bar', copy.navShapeBar, 'grid'], ['menu', copy.navShapeMenu, 'more']] as const as [v, label, icon] (v)}
        <button type="button" class="picture" aria-pressed={navPrefs.shape === v} data-on={navPrefs.shape === v ? '' : undefined} onclick={() => pickShape(v)}>
          <span class="picture-shot" aria-hidden="true">{@render shapeOf(v)}</span>
          <span class="picture-name"><Icon name={icon} size="m" /><span>{label}</span></span>
        </button>
      {/each}
    </div>
  </div>
  <p class="hint phone-only">{copy.navShapeOnPhone}</p>
</Section>

<!--
  THE ORDER OF THE NAV, which `nav.order` has kept since the rail's own menu lost Move up and Hide. Each heading's pages
  in the order drawn, an arrow up and down that moves one a place inside its heading, and Hide. The arrows are there on
  hover and on focus under a pointer, and always under a thumb.
-->
<Section title={words.yours} count={shownCount}>
  <p class="hint">{words.yoursHint}</p>
  {#if shown.length === 0}
    <Empty kind="cleared" title={words.none} body={words.noneWhy} />
  {:else}
    {#each shown as [section, list] (section)}
      <p class="order-head">{section}</p>
      <ul class="ledger ledger-lead order">
        {#each list as p (p.href)}
          <li class="order-row">
            <div class="line">
              <span class="line-mark"><IconWell name={p.icon} size="l" /></span>
              <span class="line-main"><span class="line-title">{p.title}</span></span>
              <span class="line-amount"></span>
              <span class="line-when order-acts">
                <button type="button" class="step" aria-label={words.up(p.title)} disabled={edge(p.href, -1)} onclick={() => move(p.href, -1)}
                  ><Icon name="arrow-up" size="s" /></button
                >
                <button type="button" class="step" aria-label={words.down(p.title)} disabled={edge(p.href, 1)} onclick={() => move(p.href, 1)}
                  ><Icon name="arrow-down" size="s" /></button
                >
                <Button weight="bare" aria-label={words.hideOne(p.title)} onclick={() => hidePage(p)}>{words.hide}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</Section>

<!-- THE WAY BACK FOR A HIDDEN PAGE, which the rail's "pages hidden" row opens at. -->
<div id="hidden">
  <Section title={copy.hiddenPages} count={hiddenPages.length}>
    <p class="hint">{copy.hiddenPagesHint}</p>
    {#if hiddenPages.length === 0}
      <Empty kind="cleared" title={copy.hiddenNone} body={copy.hiddenNoneWhy} />
    {:else}
      <ul class="ledger ledger-lead">
        {#each hiddenPages as p (p.href)}
          <li>
            <div class="line">
              <span class="line-mark"><IconWell name="doc" size="l" /></span>
              <span class="line-main"><span class="line-title">{p.title}</span></span>
              <span class="line-amount"></span>
              <span class="line-when"><Button weight="quiet" onclick={() => showAgain(p)}>{copy.showAgain}</Button></span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Section>
</div>

<!--
  THE SWITCH THIS AREA WAS ADDED TO HOLD (`19 §2`, `29 §4`: "one global switch, the same shape as Character keys: off").

  WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. Movement is forward-only and needs a user action, so off empties the
  holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
-->
{#snippet suggestSwitch()}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={navPrefs.suggest}
    aria-label={copy.suggestPages}
    onclick={() => void flipSuggest()}><span class="switch-track"></span></button
  >
{/snippet}

<Section title={words.offers}>
  <StateRow icon="learning" title={copy.suggestPages} line={copy.suggestPagesHint} action={suggestSwitch} />
</Section>

<!--
  THE HOLDING PEN. Every offer, whatever its kind, is one row: what it is, one sentence of why, and three presses, "Show
  it", "Keep it" and "Not this one". Nothing in it is ever applied without the second (`19 §3`).
-->
<Section title={copy.suggested} count={navPrefs.suggest ? offers.length : 0}>
  {#if !navPrefs.suggest}
    <!-- NOT `no-data-yet`, WHICH WOULD BE A LIE ABOUT THE RECORD. `19 §6` separates the empty states precisely so that
         "nothing has happened yet" and "you turned this off" cannot read the same. -->
    <Empty kind="cleared" title={copy.suggestOff} body={copy.suggestOffWhy} />
  {:else}
    <p class="hint">{penWords.hint} {copy.holdingPen}</p>
    {#if kept.length > 0}
      <ul class="ledger ledger-lead pen">
        {#each kept as row (row.item.id)}
          <li class="pen-row">
            <div class="line line-tall">
              <span class="line-mark"><IconWell name="check" size="l" tone="earn" /></span>
              <span class="line-main">
                <span class="line-title">{row.item.title}</span>
                <span class="line-detail">{penWords.kept(row.item.title)}</span>
              </span>
              <span class="line-amount"></span>
              <span class="line-when pen-acts">
                <Button weight="quiet" disabled={row.busy} onclick={() => void putBack(row)}>{penWords.putBack}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    {#if offers.length === 0}
      <Empty kind="cleared" title={voiceSaid('pen_nothing')} body={voiceSaid('pen_waits')} />
    {:else}
      <ul class="ledger ledger-lead pen">
        {#each offers as o (idOf(o))}
          <li class="pen-row" data-pen={idOf(o)}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name={glyphOf(o)} size="l" /></span>
              <span class="line-main">
                <span class="line-title">{titleOf(o)}</span>
                <span class="line-detail">{whyOf(o)}</span>
              </span>
              <span class="line-amount"></span>
              <span class="line-when pen-acts">
                {#if o.from === 'change'}
                  <Button weight="quiet" onclick={() => void show(o.item)}>{penWords.show}</Button>
                {/if}
                <Button weight="quiet" disabled={keeping !== null} onclick={() => void keep(o)}>
                  {o.from === 'shape' ? copy.navShapeRecommendAccept(navShapeLabel(o.shape)) : keeping === o.item.id ? penWords.keeping : penWords.keep}
                </Button>
                <Button weight="bare" onclick={() => dismissOffer(o)}>{penWords.dismiss}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Section>

<!-- WHERE EVERY CHOICE ABOVE IS KEPT, SAID ONCE FOR THE AREA. It was under three sections, and the page's own footer
     said the opposite under a fourth. -->
<p class="kept">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>

{#if showing}
  {@const s = showing}
  {@const icon = iconOf(s.item)}
  <Sheet bind:open={sheetOpen} title={penWords.sheetTitle(s.item.title)}>
    <div class="pen-sheet">
      <p class="hint">{s.item.why}</p>
      {#if icon !== null}
        <p class="pen-glyph"><Icon name={icon} size="xl" /><span>{penWords.iconShown(s.item.title)}</span></p>
      {/if}
      {#if s.drawn === null}
        <p class="hint" role="status">{penWords.drawing}</p>
      {:else if s.drawn.from === 'refused'}
        <p class="hint">{s.drawn.fix}</p>
      {:else if s.drawn.from === 'live' && s.drawn.pages.length > 0}
        {#each s.drawn.pages as t (t.id)}
          <PageView slug={t.slug} got={t.got} mode="preview" was={t.was} />
        {/each}
      {:else if icon === null}
        <p class="hint">{penWords.noPage}</p>
      {/if}
    </div>
    {#snippet footer()}
      <div class="pen-acts">
        <Button
          weight="primary"
          disabled={keeping !== null}
          onclick={() => {
            sheetOpen = false;
            void keep({ from: 'change', item: s.item });
          }}>{penWords.keep}</Button
        >
        <Button weight="bare" onclick={() => dismissOffer({ from: 'change', item: s.item })}>{penWords.dismiss}</Button>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  /* THE FRAME OF A CHOICE SHOWN AS PICTURES (`.pictures`) IS `settings.css`'s, which every area shares; the drawing
     inside it is this file's. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* WHERE THE AREA'S CHOICES ARE KEPT, once, as the line under every area that keeps its own is drawn. */
  .kept {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* THE PHONE'S ONE SENTENCE ABOUT THE SHAPE, where the picker is not drawn. */
  @media (width >= 900px) {
    .phone-only {
      display: none;
    }
  }

  /* ── one shape of the navigation, drawn in proportions of the picture's own width (`cqi`) ── */

  .nav-look {
    position: absolute;
    inset: 0;
    display: grid;
    gap: 4cqi;
    padding: 4cqi;
    background: radial-gradient(90cqi 40cqi at 50% -12cqi, var(--ground-glow), transparent), var(--sunk);
  }

  .nav-look[data-shape='rail'] {
    grid-template-columns: 23cqi minmax(0, 1fr);
  }

  .nav-look[data-shape='bar'] {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .nav-look[data-shape='menu'] {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  /* THE CHROME IS GLASS, as the shell's is: the frosted fill and its hairline pair. */
  .nav-chrome {
    display: flex;
    gap: 2.2cqi;
    background: var(--glass);
    box-shadow:
      0 0 0 0.4cqi color-mix(in srgb, var(--ink) 7%, transparent),
      0 0.4cqi 1.6cqi color-mix(in srgb, var(--ink) 8%, transparent);
  }

  .nav-rail {
    flex-direction: column;
    padding: 3cqi 2.2cqi;
    border-radius: 3.4cqi;
  }

  .nav-bar {
    align-items: center;
    padding: 1.8cqi 2.4cqi;
    border-radius: 3.4cqi;
  }

  .nav-menu {
    display: grid;
    place-items: center;
    inline-size: 7cqi;
    block-size: 7cqi;
    border-radius: 50%;
  }

  .nav-lines {
    inline-size: 3cqi;
    block-size: 2.4cqi;
    border-block: 0.5cqi solid var(--ink);
  }

  .nav-mark {
    flex: none;
    inline-size: 5.4cqi;
    block-size: 3.8cqi;
    border-radius: 1cqi;
    background: var(--accent);
  }

  .nav-rail .nav-mark {
    margin-block-end: 1.4cqi;
  }

  .nav-place {
    display: flex;
    align-items: center;
    gap: 1.6cqi;
  }

  .nav-place::before {
    content: '';
    flex: none;
    inline-size: 3.6cqi;
    block-size: 3.6cqi;
    border-radius: 1.1cqi;
    background: color-mix(in srgb, var(--ink) 14%, transparent);
  }

  .nav-place::after {
    content: '';
    flex: 1;
    max-inline-size: 9cqi;
    min-inline-size: 5cqi;
    block-size: 1.3cqi;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .nav-place[data-on]::before,
  .nav-place[data-on]::after {
    background: var(--ink);
  }

  .nav-page {
    display: flex;
    flex-direction: column;
    gap: 2.4cqi;
    min-inline-size: 0;
  }

  .nav-title {
    inline-size: 26cqi;
    block-size: 3.4cqi;
    border-radius: 1cqi;
    background: var(--ink);
  }

  .nav-tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.4cqi;
  }

  .nav-tile {
    block-size: 14cqi;
    border-radius: 3cqi;
    background: var(--bg);
    box-shadow: var(--e1);
  }

  .nav-row {
    block-size: 1.4cqi;
    inline-size: 60%;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--ink) 20%, transparent);
  }

  /* ── the order of the nav ── */

  .order-head {
    margin: 0 0 var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .order + .order-head {
    margin-block-start: var(--sp-4);
  }

  .order-acts {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* AN ARROW IS A SQUARE THE SIZE OF A CONTROL, with its glyph in the quiet ink until it is pointed at. */
  .step {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--dim);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      opacity var(--d-state) var(--ease-out);
  }

  .step:hover:not(:disabled) {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .step:disabled {
    cursor: default;
    opacity: 0.3;
  }

  /* UNDER A POINTER THE PRESSES WAIT FOR THE PAGE THEY MOVE, and come with hover or focus, so the list reads as the
     names of the pages. Under a thumb there is no hover, and they are always there. */
  @media (pointer: fine) {
    .order-row .order-acts {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    .order-row:hover .order-acts,
    .order-row:focus-within .order-acts {
      opacity: 1;
    }
  }

  @media (pointer: coarse) {
    .step {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  .pen-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .pen-glyph {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* AT 390 THE PEN IS A LIST OF FULL-WIDTH ROWS, the three presses on their own line under the why, each 44 tall so a
     thumb lands on the one it meant; and "Show it" is a whole screen, because a page drawn in a sheet two thirds tall
     is a page nobody can judge. */
  @media (width < 640px) {
    .pen-row .pen-acts {
      grid-column: 2 / -1;
      grid-row: 3;
      justify-content: flex-start;
      inline-size: 100%;
      padding-block-start: var(--sp-2);
    }

    .pen-acts :global(button) {
      min-block-size: 44px;
    }

    :global(dialog.sheet:has(.pen-sheet)) {
      block-size: calc(100dvh - var(--kb));
      max-block-size: 100dvh;
    }
  }
</style>
