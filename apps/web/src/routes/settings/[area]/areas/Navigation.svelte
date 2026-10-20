<!--
  Settings > Navigation: what the app opens on, the phone bar drawn live with its switches, the pages in the nav and the
  ones not in it (Pages folded in here, UI pass 20 Oct, agents F14 and F18), where the navigation lives, the switch that
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
  import { glyphOf, iconOf, penCount, shapeOffer, waiting, type Offer, type PenItem } from '$lib/design/pen.ts';
  import { cardWords, todayOf } from '$lib/decide/card.ts';
  import { shortDay } from 'braindog-render';
  import { penWords } from '$lib/design/words.ts';
  import type { Undone } from '$lib/design/keep.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import type { Rehearsed } from '../../../decide/[id]/proposed.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { navPrefs, TABS_MOST, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { arrange, tabsOf, type FlatItem } from '$lib/nav.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';
  import Pages from './Pages.svelte';

  let { shell, area }: AreaProps = $props();

  /* THIS AREA'S OWN WORDS: the group the switch sits in, so the row inside can carry the switch's own name, and the
     order of the pages, which says what a press does in the person's own page names. */
  const words = {
    offers: 'Suggestions',
    bar: 'Phone bar',
    barHint: 'Today is always first, then up to four more. The bar above is what a phone draws.',
    barOn: (title: string) => `${title} on the phone bar`,
    barFull: 'Today is always first. Four at most after it; turn one off first.',
    barReset: 'Use the default bar',
    barNow: 'The phone bar as it is now',
    under: (section: string) => `In ${section}`,
  };

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

  /**
   * THE PHONE BAR, DRAWN AS IT IS (agents F18). Today is always first; after it, the four the person picked, or with none
   * picked the default `tabsOf` (`lib/nav.ts`) draws: Needs you, then Projects, Money and Agents by their sections, then
   * the next pages in the nav's order. The switches start as the bar is, so turning one on or off changes one tab, and a
   * fifth is refused in words beside its switch rather than silently dropping three.
   */
  const NEEDS = '/decide';
  type BarRow = { href: string; title: string; icon: IconName; section?: string | undefined };
  const barRows = $derived<BarRow[]>([
    { href: NEEDS, title: voiceSaid('decide'), icon: 'inbox' },
    ...shown.flatMap(([section, list]) => list.map((p) => ({ href: p.href, title: p.title, icon: p.icon as IconName, section }))),
  ]);
  const plain = (x: string | undefined): string => (x ?? '').trim().toLowerCase();
  /* THE DEFAULT IS `tabsOf`'S OWN ANSWER, asked of these pages as the rail hands them: Today, Needs you by its key, each
     section's first page by its section, and every other page as itself. One rule for the bar and this screen. */
  const defaultBar = $derived.by((): string[] => {
    const led = new Set<string>();
    const main: FlatItem[] = [
      { key: 'today', href: '/', label: copy.today, icon: 'today', near: [] },
      ...barRows.map((r): FlatItem => {
        const section = plain(r.section);
        const lead = r.href !== NEEDS && section !== '' && !led.has(section);
        if (lead) led.add(section);
        return { key: r.href === NEEDS ? 'decide' : lead ? `section:${section}` : `page:${r.href}`, href: r.href, label: r.title, icon: r.icon, near: [] };
      }),
    ];
    return tabsOf(main, TABS_MOST + 1)
      .slice(1)
      .map((i) => i.href);
  });
  const picked = $derived(navPrefs.tabs.filter((h) => barRows.some((r) => r.href === h)));
  const barNow = $derived(picked.length > 0 ? picked : defaultBar);
  const sameBar = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((h, i) => h === b[i]);
  const isDefault = $derived(sameBar(barNow, defaultBar));
  const barFull = $derived(barNow.length >= TABS_MOST);
  const onBar = (href: string): boolean => barNow.includes(href);
  /* THE PREVIEW: Today and the four, each its glyph over its caption, as the tab bar draws them. */
  const preview = $derived<BarRow[]>([
    { href: '/', title: copy.today, icon: 'today' },
    ...barNow.flatMap((h) => barRows.filter((r) => r.href === h)),
  ]);
  function flipBar(href: string) {
    const next = onBar(href) ? barNow.filter((h) => h !== href) : [...barNow, href];
    /* BACK TO THE DEFAULT IS NO PICK AT ALL, so a bar that matches it follows it when the record's places change. */
    void navPrefs.setTabs(sameBar(next, defaultBar) ? [] : next).then((saved) => said(saved));
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
   * THE DESIGN AGENT'S NAVIGATION RECOMMENDATION, the one offer the browser may add (`nav-shape.ts`), and only while the
   * record sends no shape of its own (`waiting`). Icons and every other kind are the record's to offer.
   *
   * It reads the screen as well as the record: below `SHAPE_MIN_WIDTH` the tab bar is drawn whatever is chosen, so it
   * answers nothing there. It is compared with the shape set now, so choosing the
   * recommended shape by hand makes the offer go on its own rather than nag about a choice just made.
   *
   * THE SHAPE SOMEBODY CHOSE, NOT THE ONE DRAWN (`navPrefs.chosen`). The drawn shape is the rail for a record that never
   * chose, and handed in, it said that record had picked the rail by hand: the top bar is offered only to a rail
   * somebody picked, so it was offered to every record that never chose at all.
   */
  const navRec = $derived(
    recommendNavShape(
      navShapeSignals(
        shell.nav,
        shell.index.registers.length,
        { nav: navPrefs.order, navShape: navPrefs.chosen },
        typeof window === 'undefined' ? undefined : window.innerWidth,
      ),
    ),
  );
  const shapeRow = $derived(navRec === null ? null : shapeOffer(navRec, copy.navShapeRecommend));

  /* KEPT IN THIS VISIT, each with the one call that puts it back. The record stops offering a kept item on the next
     `boot`, so without this the row and its Put back would vanish together. */
  type KeptRow = { item: PenItem; putBack: () => Promise<Undone>; busy: boolean };
  let kept = $state<KeptRow[]>([]);
  /* ONE KEEP AT A TIME, so a double press writes once. */
  let keeping = $state<string | null>(null);

  /* ONE COUNT (ENG-B14): the list and its number read the same three inputs, so they cannot say two things. */
  const gone = (id: string): boolean => navPrefs.isDismissed(id) || kept.some((k) => k.item.id === id);
  const offers = $derived(navPrefs.suggest ? waiting(shapeRow, shell.pen, gone) : []);
  const waitingCount = $derived(navPrefs.suggest ? penCount(shell.pen, shapeRow, gone) : 0);
  const idOf = (o: Offer): string => (o.from === 'shape' ? o.id : o.item.id);
  const titleOf = (o: Offer): string => (o.from === 'shape' ? o.title : o.item.title);
  const whyOf = (o: Offer): string => (o.from === 'shape' ? `${navShapeLabel(o.shape)}. ${o.why}` : o.item.why);
  /**
   * THE DAY AN OFFER STOPS WAITING, in Decide's own words ("Waits until 27 Oct", `card.ts`), on the reader's own calendar:
   * a day already come is said as today. The browser's shape, and an offer from a host older than `lapses`, say nothing.
   */
  const lapseOf = (o: Offer): string | null => {
    const last = o.from === 'change' ? o.item.lapses : undefined;
    if (last === undefined) return null;
    const today = todayOf(Date.now());
    return last <= today ? cardWords.lapsesToday : cardWords.lapses(shortDay(last, today));
  };

  /**
   * "Keep it": the offer's whole declaration, written by the owner (`keep.ts`), or for the shape, `nav.shape` set.
   *
   * NOTHING IS SAID UNTIL IT HAPPENED. The toast is the record's answer, and the shell reads `boot` again so a page kept
   * into the nav is in the rail before the toast has gone.
   */
  async function keep(o: Offer) {
    if (keeping !== null) return;
    if (o.from === 'shape') {
      /* WHAT WAS CHOSEN BEFORE, nothing included, so the Undo puts a record that never chose back to no choice. */
      const before = navPrefs.chosen;
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

<!-- WHAT THE APP OPENS ON, first: Pages folded in here (agents F14). -->
<Pages {shell} {area} part="opens" />

<!-- THE PHONE BAR, drawn live above one switch for each page: his pick wins over the five of 19 October. -->
{#snippet barSwitch(r: BarRow)}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={onBar(r.href)}
    aria-label={words.barOn(r.title)}
    disabled={!onBar(r.href) && barFull}
    onclick={() => flipBar(r.href)}><span class="switch-track"></span></button
  >
{/snippet}
<Tile icon="monitor" title={words.bar}>
  {#snippet actions()}
    {#if !isDefault}<Button size="sm" weight="quiet" onclick={() => void navPrefs.setTabs([]).then((saved) => said(saved))}>{words.barReset}</Button>{/if}
  {/snippet}
  <div class="bar-preview" role="img" aria-label={`${words.barNow}: ${preview.map((t) => t.title).join(', ')}`}>
    {#each preview as t, i (t.href)}
      <span class="bar-slot" data-on={i === 0 ? '' : undefined}><Icon name={t.icon} size="m" /><span class="bar-cap">{t.title}</span></span>
    {/each}
  </div>
  <!-- WHEN THE BAR IS FULL THE LINE SAYS SO ONCE, over the switches it disables, rather than under each of them. -->
  <p class="hint" role="status">{barFull ? words.barFull : words.barHint}</p>
  <ul class="bar-rows">
    {#each barRows as r (r.href)}
      {@const line = r.section && plain(r.section) !== plain(r.title) ? words.under(r.section) : undefined}
      <li class="switch-row bar-row">
        <span class="bar-row-main">
          <IconWell name={r.icon} />
          <span class="switch-row-words">
            <span class="switch-row-title">{r.title}</span>
            {#if line}<span class="bar-row-line">{line}</span>{/if}
          </span>
        </span>
        {@render barSwitch(r)}
      </li>
    {/each}
  </ul>
</Tile>

<!-- THE PAGES IN THE NAV, their order and Hide, then every page not in it with the way back (Pages folded in here). -->
<Pages {shell} {area} part="nav" />
<Pages {shell} {area} part="others" />

<!--
  WHERE THE NAVIGATION LIVES. `19 §3` carries five shapes and three conditions; the three that are choices are here,
  and on a phone, which always draws the tab bar, it is one sentence.
-->
<Tile icon="rows" title={copy.navShape}>
  <div class="wide-only">
    <p class="hint">{copy.navShapeHint}</p>
    <div class="pictures" role="group" aria-label={copy.navShape}>
      {#each [['bar', copy.navShapeBar, 'grid'], ['rail', copy.navShapeRail, 'rows'], ['menu', copy.navShapeMenu, 'more']] as const as [v, label, icon] (v)}
        <button type="button" class="picture" aria-pressed={navPrefs.shape === v} data-on={navPrefs.shape === v ? '' : undefined} onclick={() => pickShape(v)}>
          <span class="picture-shot" aria-hidden="true">{@render shapeOf(v)}</span>
          <span class="picture-name"><Icon name={icon} size="m" /><span>{label}</span></span>
        </button>
      {/each}
    </div>
  </div>
  <p class="hint phone-only">{copy.navShapeOnPhone}</p>
</Tile>

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

<Tile icon="learning" title={words.offers}>
  <StateRow icon="learning" title={copy.suggestPages} line={copy.suggestPagesHint} action={suggestSwitch} />
</Tile>

<!--
  THE HOLDING PEN. Every offer, whatever its kind, is one row: what it is, one sentence of why, and three presses, "Show
  it", "Keep it" and "Not this one". Nothing in it is ever applied without the second (`19 §3`).
-->
<Tile icon="inbox" title={copy.suggested} count={waitingCount}>
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
                {#if lapseOf(o) !== null}<span class="line-detail pen-lapse">{lapseOf(o)}</span>{/if}
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
</Tile>

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
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  /* WHERE THE AREA'S CHOICES ARE KEPT, once, as the line under every area that keeps its own is drawn. */
  .kept {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    background: var(--board);
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

  /* THE CHROME IS THE NAV'S OWN SURFACE, flat with its hairline, as the shell's is now: no glass, no shadow. */
  .nav-chrome {
    display: flex;
    gap: 2.2cqi;
    background: var(--nav);
    outline: 0.4cqi solid var(--rule);
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
    background: var(--red-fill);
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
    background: var(--tile);
  }

  .nav-row {
    block-size: 1.4cqi;
    inline-size: 60%;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--ink) 20%, transparent);
  }

  /* ── the phone bar ── */

  /* THE BAR AS A PHONE DRAWS IT: five equal slots on the nav's surface, a 20px glyph over a 12px caption, Today in ink
     and the rest in the second ink, as `TabBar.svelte` draws the bar you are not on. 390 wide at most, so it reads as the
     phone's and not as a toolbar across the desk. */
  .bar-preview {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-inline-size: 390px;
    margin-block-end: var(--sp-4);
    padding-block: var(--sp-2);
    background: var(--nav);
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
  }

  .bar-slot {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    color: var(--ink-2);
  }

  .bar-slot[data-on] {
    color: var(--ink);
  }

  .bar-cap {
    max-inline-size: 100%;
    overflow: hidden;
    font-size: var(--fs-cap);
    font-weight: 500;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-slot[data-on] .bar-cap {
    font-weight: 600;
  }

  .bar-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bar-row-main {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .bar-row-main > :global(.well) {
    flex: none;
    margin-block-start: -4px;
  }

  .bar-row-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
