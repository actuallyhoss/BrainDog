<!--
  Settings > Navigation: the shape of the navigation, the pages hidden from it, the switch that lets the record offer
  anything, and the holding pen itself.

  EVERY SETTING HERE IS THE PERSON'S OWN ON A RECORD (`nav-prefs.svelte.ts`): the shape is `nav.shape`, the switch is
  `pen.suggest`, and every "Not this one" is appended to `pen.dismissed`, so a choice made on the laptop holds on the
  phone. The sample has no record, so there they stay on this device, and the screen says which it is.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { navShapeSignals, recommendNavShape, type NavShape } from '$lib/design/nav-shape.ts';
  import { glyphOf, iconOf, iconOffers, shapeOffer, waiting, type HeldList, type HeldPage, type Offer, type PenItem } from '$lib/design/pen.ts';
  import { penWords } from '$lib/design/words.ts';
  import type { Undone } from '$lib/design/keep.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import type { Rehearsed } from '../../../decide/[id]/proposed.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { navPrefs, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE MOST LISTS WHOSE ICON IS READ FOR AN OFFER, one `schema` read each, the record's own cap on the pen. */
  const ICON_LISTS_MOST = 24;

  /** A refusal is the record's own sentence, and a change it kept is said only once it kept it. */
  const said = (saved: Saved, done?: string) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
    else if (done !== undefined) toasts.push(done);
  };

  /* THE PAGES THIS PERSON HID FROM THEIR NAV, by the name the rail gave them, and the way back. */
  const hiddenPages = $derived(navPrefs.hidden.map((href) => ({ href, title: shell.nav.find((e) => e.href === href)?.title ?? href })));
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
<Section title={copy.navShape}>
  <!-- ON A PHONE THE SHAPE IS ONE SENTENCE (DSN-13). A phone always draws the tab bar, so a picker there offers a choice
       the phone would not draw; `wide-only` (`settings.css`) leaves the picker to the screens that use it. -->
  <div class="wide-only">
    <p class="hint">{copy.navShapeHint}</p>
    <div class="segmented" role="group" aria-label={copy.navShape}>
      {#each [['rail', copy.navShapeRail, 'rows'], ['bar', copy.navShapeBar, 'grid'], ['menu', copy.navShapeMenu, 'more']] as const as [v, label, icon]}
        <button type="button" class="segment" aria-pressed={navPrefs.shape === v} data-on={navPrefs.shape === v ? '' : undefined} onclick={() => pickShape(v)}>
          <Icon name={icon} size="s" />
          {label}
        </button>
      {/each}
    </div>
  </div>
  <p class="hint">{copy.navShapeOnPhone}</p>
  <p class="hint wide-only">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>
</Section>

<!-- THE WAY BACK FOR A HIDDEN PAGE, which the rail's "pages hidden" row opens at. -->
<div id="hidden">
  <Section title={copy.hiddenPages} count={hiddenPages.length}>
    <p class="hint">{copy.hiddenPagesHint}</p>
    {#if hiddenPages.length === 0}
      <Empty kind="cleared" title={copy.hiddenNone} body={copy.hiddenNoneWhy} />
    {:else}
      <ul class="ledger ledger-glyph">
        {#each hiddenPages as p (p.href)}
          <li>
            <div class="line">
              <span class="seq"><Icon name="doc" size="s" /></span>
              <span class="line-main"><span class="line-title">{p.title}</span></span>
              <span class="line-amount"></span>
              <span class="line-when"><Button weight="quiet" onclick={() => showAgain(p)}>{copy.showAgain}</Button></span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="hint">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>
  </Section>
</div>

<!--
  THE SWITCH THIS AREA WAS ADDED TO HOLD (`19 §2`, `29 §4`: "one global switch, the same shape as Character keys: off").

  WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. Movement is forward-only and needs a user action, so off empties the
  holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
-->
<Section title={copy.suggestPages}>
  <div class="setting-row">
    <p class="hint">{copy.suggestPagesHint}</p>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={navPrefs.suggest}
      aria-label={copy.suggestPages}
      onclick={() => void flipSuggest()}><span class="switch-track"></span></button
    >
  </div>
  <p class="hint">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>
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
      <ul class="ledger ledger-glyph pen">
        {#each kept as row (row.item.id)}
          <li class="pen-row">
            <div class="line">
              <span class="seq"><Icon name="check" size="s" /></span>
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
      <Empty kind="cleared" title={penWords.nothing} body={penWords.nothingWhy} />
    {:else}
      <ul class="ledger ledger-glyph pen">
        {#each offers as o (idOf(o))}
          <li class="pen-row" data-pen={idOf(o)}>
            <div class="line">
              <span class="seq"><Icon name={glyphOf(o)} size="s" /></span>
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
  /* THE SENTENCE AND ITS SWITCH (`.setting-row`) ARE LAID OUT BY `settings.css`, which every area shares. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* THE SHARED PILLS FROM `controls.css`, with two things this screen needs on top: the track hugs its options, and a
     segment is 44 on BOTH axes under a thumb (the reason is written beside the same rule in `Appearance.svelte`). */
  .segmented {
    margin-block-end: var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: var(--ctl-h);
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
    color: var(--text);
    font-size: var(--t-sm);
  }

  /* AT 390 THE PEN IS A LIST OF FULL-WIDTH ROWS, the three presses on their own line under the why, each 44 tall so a
     thumb lands on the one it meant; and "Show it" is a whole screen, because a page drawn in a sheet two thirds tall
     is a page nobody can judge. */
  @media (width < 640px) {
    .pen-row .pen-acts {
      grid-column: 1 / -1;
      inline-size: 100%;
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
