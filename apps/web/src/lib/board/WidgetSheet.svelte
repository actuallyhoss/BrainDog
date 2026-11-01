<!--
  THE WIDGET SHEET (widgets plan §5.6, batch W3): every widget the record can put on a board, each drawn on the person's
  own data at the size it starts at, grouped, searchable, and one press from the board.

  A DRAWER ON THE LAPTOP, A TALL SHEET ON THE PHONE: `Sheet.svelte` with `wide`, so from 900 up the drawer is 760 across
  and a widget is laid out at the cells it will take (four columns), and below 900 it is the bottom sheet (two columns,
  a Small square, as the phone's board is).

  ONE READ, WHEN IT OPENS (`widgetGallery`), never on Today's open. While it is out the catalogue is laid out with each
  frame waiting, so the sheet is never empty; a read that fails leaves every widget at its example, marked as one.

  AT THE TOP, a search; then Suggested for you, up to three, each with the reason in one line (§6.3); then the groups,
  Money to Life; then what the person drew and kept (Made by you); then Make your own, where the board hands a way to.

  PRESSING A WIDGET opens it whole: drawn at the size picked, the five sizes beside it (the ones it cannot take greyed,
  saying why), the project or currency it is for, and Add to Today. The + on a widget adds it at the size it starts at.

  IT ADDS NOTHING ITSELF. Add hands the board `{ block, size }` through `onadd`, and the board writes it and says Undo
  (the widgets-board lane: `Board.svelte`, `boardSteps`). An offer added is told to the record so no new one comes today.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    GROUP_NAMES,
    WIDGET_GROUPS,
    WIDGET_SIZES,
    SIZE_SAID,
    distill,
    widgetBlock,
    chosenWith,
    type GalleryAnswer,
    type GalleryWidget,
    type WidgetOffer,
    type WidgetReading,
    type WidgetSize,
  } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import WidgetPreview from './WidgetPreview.svelte';
  import WidgetTile from './WidgetTile.svelte';
  import { composeOn, type Made } from './compose.ts';
  import { madeByYou, shelfWords } from '$lib/page/shelf.ts';
  import { drawnWidgetDraft } from '$lib/page/draw.ts';
  import { kept as keptBlock } from 'braindog-render';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { blockAt, catalogueOnly, itemMatches, readGallery, sheetWords, templateOf } from './widget-read.ts';
  import { widgetHeld } from './widget-held.svelte.ts';
  import { WIDGETS_PARAM, sheetAsked } from './offer.svelte.ts';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  let {
    open = $bindable(false),
    onadd,
    board = [],
    onmake,
    home = homeCurrency(),
  }: {
    open?: boolean;
    /** The board adds the widget, writes it once and says Undo. Whatever it returns is waited for before the sheet shuts. */
    onadd: (add: { block: Record<string, unknown>; size: WidgetSize }) => unknown;
    /** The board's widgets as drawn (key, source, where, empty), so what is on it is not suggested again. */
    board?: readonly Record<string, unknown>[];
    /**
     * Make your own (W4): the draft made from what the person said, its `draft` mark on, for the board to place as a draft
     * with Keep, Try again and Throw away (`DraftCell.svelte`). Absent, the draft is handed to `onadd` as it is.
     */
    onmake?: ((draft: { block: Record<string, unknown>; size: WidgetSize; said: string }) => unknown) | undefined;
    home?: string | null;
  } = $props();

  let answer = $state<GalleryAnswer | null>(null);
  let failed = $state(false);
  let reading = $state(false);
  let q = $state('');
  let picked = $state<{ widget: GalleryWidget; offer: WidgetOffer | null } | null>(null);
  let size = $state<WidgetSize>('wide');
  /** The blank picked in the open widget, and its reading once the record drew it for that choice. */
  let chosen = $state<Record<string, string>>({});
  let chosenReading = $state<WidgetReading | null>(null);
  let adding = $state(false);
  let made = $state('');
  /** What Make your own made from it, or the record's sentence why not, and what was turned down for Try again. */
  let making = $state(false);
  let draft = $state<Made | null>(null);
  let makeFix = $state<string | null>(null);
  let turnedDown = $state<Record<string, unknown>[]>([]);

  /** Whether the last ask was to draw it, so Try again draws again. */
  let drawing = $state(false);

  async function makeIt(again = false, draw = again ? drawing : false) {
    const said = made.trim();
    if (said === '' || making) return;
    making = true;
    makeFix = null;
    drawing = draw;
    if (again && draft !== null) turnedDown = [...turnedDown, draft.block];
    else if (!again) turnedDown = [];
    try {
      const got = await composeOn(apiBase(), said, undefined, turnedDown, draw ? { sizes: [size, ...(['small', 'wide', 'tall', 'large'] as const).filter((s) => s !== size)] } : undefined);
      if ('fix' in got) {
        draft = null;
        makeFix = got.fix;
      } else if (got.block.kind === 'drawn') {
        /* A DRAWN ONE IS HELD TO THE DRAWN CHECKS AND ITS FRAMES before it is shown (`drawnWidgetDraft`). */
        const cols = Array.isArray(got.block.columns) ? (got.block.columns as { field?: unknown }[]).flatMap((c) => (typeof c.field === 'string' ? [c.field] : [])) : [];
        const source = typeof got.block.source === 'string' && got.block.source.startsWith('register.') ? got.block.source.slice('register.'.length) : null;
        const checked = drawnWidgetDraft({ name: got.title, list: source ? { id: source, name: source, fields: [] } : null, fields: cols, code: String(got.block.code ?? ''), sizes: got.sizes ?? [got.size] });
        if ('fix' in checked) {
          draft = null;
          makeFix = checked.fix;
        } else draft = { ...got, sizes: checked.sizes };
      } else draft = got;
    } finally {
      making = false;
    }
  }

  /** A drawn widget kept on the shelf, at its sizes, so it is under Made by you and can be put on any board. */
  async function keepMade() {
    if (draft === null) return;
    const saved = await navPrefs.shelve(draft.title, keptBlock(draft.block) as { kind: string }, { sizes: draft.sizes ?? [draft.size] });
    toasts.push(saved.from === 'refused' ? saved.fix : shelfWords.saved(draft.title), saved.from === 'refused' ? { intent: 'warn' } : {});
  }

  async function putMade() {
    if (draft === null || adding) return;
    adding = true;
    try {
      if (onmake) await onmake({ block: draft.block, size: draft.size, said: made.trim() });
      else await onadd({ block: draft.block, size: draft.size });
      draft = null;
      made = '';
      open = false;
    } finally {
      adding = false;
    }
  }

  /* THE ADDRESS MAY ASK FOR IT (`?widgets`, `?widgets=<offer>`): the palette's Add a widget and a Slash answer's Add to
     Today open it on Today this way, so any board that holds the sheet answers them. Closed, the word leaves the address. */
  let askedKey = $state<string | null>(null);
  $effect(() => {
    const asked = sheetAsked(page.url);
    if (!asked.open) return;
    untrack(() => {
      askedKey = asked.key;
      open = true;
    });
  });
  $effect(() => {
    if (open || !page.url.searchParams.has(WIDGETS_PARAM)) return;
    const url = new URL(page.url);
    url.searchParams.delete(WIDGETS_PARAM);
    /* A NAVIGATION THAT REPLACES, NOT A SHALLOW `replaceState`: Kit's shallow state is kept with a serialiser and a
       cloner that every page's entry script then carries (0.2 KB, past the entry's budget). Nothing here loads data. */
    untrack(() => void goto(url, { replaceState: true, keepFocus: true, noScroll: true }));
  });
  /* AND THE OFFER IT NAMED IS OPENED ONCE THE RECORD ANSWERS. */
  $effect(() => {
    if (askedKey === null || answer === null) return;
    const key = askedKey;
    untrack(() => {
      askedKey = null;
      const o = answer?.suggested.find((x) => x.key === key);
      const w = o ? byId.get(o.widget) : undefined;
      if (o && w) openOne({ ...w, block: o.block, title: o.title }, o);
    });
  });

  /* ONE READ EACH TIME IT OPENS, so a widget added a minute ago is not suggested again. */
  $effect(() => {
    if (!open) return;
    untrack(() => {
      if (askedKey === null) picked = null;
      q = '';
      reading = true;
      failed = false;
      void readGallery(apiBase(), board).then((got) => {
        reading = false;
        if (got === null) failed = true;
        else answer = got;
      });
    });
  });

  const widgets = $derived<GalleryWidget[]>(answer?.widgets ?? catalogueOnly());
  const waiting = $derived(answer === null && reading);
  const shown = $derived(q.trim() === '' ? widgets : widgets.filter((w) => itemMatches(w, q)));
  const byId = $derived(new Map(widgets.map((w) => [w.id, w] as const)));
  /** Suggested for you: the record's offers that add a widget, each with its widget, three at most. */
  const suggested = $derived(
    q.trim() !== ''
      ? []
      : (answer?.suggested ?? [])
          .filter((o) => o.remove === undefined && !widgetHeld.gone.includes(o.key))
          .flatMap((o) => {
            const w = byId.get(o.widget);
            return w ? [{ widget: { ...w, block: o.block, title: o.title }, offer: o }] : [];
          })
          .slice(0, 3),
  );
  const groups = $derived(WIDGET_GROUPS.map((g) => ({ id: g, name: GROUP_NAMES[g], items: shown.filter((w) => w.group === g) })).filter((g) => g.items.length > 0));
  /* MADE BY YOU: the widgets kept on the shelf, at the sizes each was kept at (W7's `madeByYou`). */
  const kept = $derived(madeByYou(navPrefs.shelf).filter((s) => q.trim() === '' || s.name.toLowerCase().includes(q.trim().toLowerCase())));
  let keptOpen = $state<string | null>(null);

  /** An earlier version of a kept widget put back, itself a new version. */
  async function putBackOne(id: string, name: string, version: number) {
    const saved = await navPrefs.putBack(id, version);
    toasts.push(saved.from === 'refused' ? saved.fix : shelfWords.putBackDone(name, version), saved.from === 'refused' ? { intent: 'warn' } : {});
  }

  /**
   * SHARE AS AN ADD-ON: the widget saved as the file `braindog addon new --from-widget` reads, and the line that turns it
   * into an add-on (`packFromWidget`, which leaves his own names out as settings). The add-on is made on his machine,
   * where it can be checked and published; nothing leaves the record from here.
   */
  function shareOne(k: { name: string; block: Record<string, unknown>; sizes: readonly WidgetSize[] }) {
    const slug = k.name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'my-widget';
    const file = `${slug}.widget.json`;
    try {
      const url = URL.createObjectURL(new Blob([`${JSON.stringify({ title: k.name, block: k.block, sizes: k.sizes }, null, 2)}\n`], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.push(sheetWords.shared(file, slug));
    } catch {
      toasts.push(sheetWords.shareFailed, { intent: 'warn' });
    }
  }

  /** The frame a widget takes in the sheet's grid: columns, and the shape its preview is drawn in. */
  const spanOf = (s: WidgetSize): number => SIZE_SAID[s].cols;

  function openOne(widget: GalleryWidget, offer: WidgetOffer | null = null) {
    picked = { widget, offer };
    size = offer?.size ?? widget.size;
    chosen = { ...widget.filled };
    chosenReading = null;
  }

  /** The block the open widget adds: its blanks as picked, its rows capped to the size. */
  function blockOf(w: GalleryWidget, at: WidgetSize, values: Record<string, string>): Record<string, unknown> {
    const t = templateOf(w);
    const same = Object.keys(values).every((k) => values[k] === w.filled[k]);
    return t !== null && !same ? widgetBlock(t, at, values) : blockAt(w, at);
  }

  async function add(w: GalleryWidget, at: WidgetSize, offer: WidgetOffer | null, values: Record<string, string> = w.filled) {
    if (adding) return;
    adding = true;
    try {
      await onadd({ block: blockOf(w, at, values), size: at });
      if (offer !== null) void widgetHeld.added(offer.key);
      open = false;
    } finally {
      adding = false;
    }
  }

  /** A blank changed in the open widget: the record draws it for that choice, so the preview is the real one. */
  async function choose(id: string, value: string) {
    if (picked === null) return;
    chosen = chosenWith(picked.widget, chosen, id, value);
    chosenReading = null;
    const t = templateOf(picked.widget);
    if (t === null) return;
    try {
      const { createClient } = await import('@braindog/client');
      const block = widgetBlock(t, t.size, chosen);
      const out = await createClient({ base: apiBase() }).call<{ blocks?: unknown[] }>('previewPage', { body: { page: 'widget', title: picked.widget.title, blocks: [block] } });
      if (out.ok && Array.isArray(out.value.blocks)) chosenReading = distill(t, out.value.blocks[0]);
    } catch {
      /* The preview stays the one the gallery read; the widget is still added for the choice. */
    }
  }

  const forSaid = (f: GalleryWidget['for']): string => (f === 'personal' ? sheetWords.forPersonal : f === 'both' ? sheetWords.forBoth : sheetWords.forBusiness);
</script>

<Sheet bind:open title={picked ? picked.widget.title.replace(/\{\{[a-z_]+\}\}/gu, chosen.project ?? '') : sheetWords.title} wide caret={false}>
  <div class="ws" aria-busy={waiting ? 'true' : undefined}>
    {#if picked}
      {@const w = picked.widget}
      <!-- ONE WIDGET, WHOLE: drawn at the size picked, the sizes beside it, and what it is for. -->
      <button type="button" class="ws-back" onclick={() => (picked = null)}>
        <Icon name="chevron-left" size="s" /><span>{sheetWords.back}</span>
      </button>
      <div class="ws-detail">
        <div class="ws-stage">
          <div class="ws-frame" data-size={size}>
            <WidgetPreview widget={{ ...w, filled: chosen }} {size} reading={chosenReading ?? w.reading} {home} waiting={waiting || (chosenReading === null && Object.keys(chosen).some((k) => chosen[k] !== w.filled[k]))} />
          </div>
        </div>
        <div class="ws-about">
          {#if picked.offer}<p class="ws-why"><Icon name="zap" size="s" /><span>{picked.offer.why}</span></p>{/if}
          <p class="ws-says">{w.says}</p>
          <p class="ws-meta">{[w.onBoard ? (w.onBoardAs ? sheetWords.onTodayAs(w.onBoardAs) : sheetWords.onToday) : null, forSaid(w.for), w.addon ? (w.ready ? w.addon.name : (w.need ?? w.addon.name)) : !w.ready && w.need && !waiting ? w.need : null].filter(Boolean).join(' · ')}</p>

          <fieldset class="ws-sizes">
            <legend>{sheetWords.size}</legend>
            <div class="ws-size-row">
              {#each WIDGET_SIZES as s (s)}
                {@const can = w.sizes.includes(s)}
                <button
                  type="button"
                  class="ws-size"
                  data-size={s}
                  aria-pressed={size === s}
                  disabled={!can}
                  title={can ? sheetWords.sizes[s] : sheetWords.sizeCannot(sheetWords.sizes[s])}
                  onclick={() => (size = s)}
                >
                  <span class="ws-size-box" aria-hidden="true"><span class="ws-size-pic"></span></span>
                  <span class="ws-size-name">{sheetWords.sizes[s]}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          {#each Object.entries(w.choices) as [id, options] (id)}
            {#if options.length > 1}
              <label class="ws-choice">
                <span>{sheetWords.which}</span>
                <select value={chosen[id] ?? ''} onchange={(e) => choose(id, (e.currentTarget as HTMLSelectElement).value)}>
                  {#each options as o (o)}<option value={o}>{o}</option>{/each}
                </select>
              </label>
            {/if}
          {/each}

          <div class="ws-go">
            <Button weight="primary" disabled={adding} onclick={() => add(w, size, picked?.offer ?? null, chosen)}>{sheetWords.add}</Button>
          </div>
        </div>
      </div>
    {:else}
      <div class="ws-search">
        <Icon name="search" size="s" />
        <input type="search" bind:value={q} placeholder={sheetWords.search} aria-label={sheetWords.search} autocomplete="off" spellcheck="false" />
      </div>

      {#if suggested.length > 0}
        <section class="ws-group" aria-labelledby="ws-suggested">
          <h3 class="ws-gh" id="ws-suggested">{sheetWords.suggested}</h3>
          <div class="ws-grid">
            {#each suggested as s (s.offer.key)}
              {@render card(s.widget, s.offer)}
            {/each}
          </div>
        </section>
      {/if}

      {#each groups as g (g.id)}
        <section class="ws-group" aria-labelledby="ws-g-{g.id}">
          <h3 class="ws-gh" id="ws-g-{g.id}">{g.name}</h3>
          <div class="ws-grid">
            {#each g.items as w (w.id)}
              {@render card(w, null)}
            {/each}
          </div>
        </section>
      {/each}

      {#if kept.length > 0}
        <section class="ws-group" aria-labelledby="ws-g-kept">
          <h3 class="ws-gh" id="ws-g-kept">Made by you</h3>
          <div class="ws-kept">
            {#each kept as k (k.id)}
              <div class="ws-kept-one">
                <div class="ws-kept-row">
                  <button type="button" class="ws-kept-item" onclick={() => void onadd({ block: { ...(k.block as Record<string, unknown>) }, size: k.sizes[0] ?? 'wide' })} aria-label={sheetWords.addNamed(k.name)}>
                    <span class="ws-kept-pic" aria-hidden="true"><Icon name="star" size="s" /></span>
                    <span class="ws-kept-name">{k.name}</span>
                    {#if (k.version ?? 1) > 1}<span class="ws-kept-v">{shelfWords.version(k.version ?? 1)}</span>{/if}
                    <Icon name="plus" size="s" />
                  </button>
                  <button type="button" class="ws-kept-more" aria-expanded={keptOpen === k.id} aria-label={sheetWords.keptMore(k.name)} onclick={() => (keptOpen = keptOpen === k.id ? null : k.id)}><Icon name="more" size="s" /></button>
                </div>
                {#if keptOpen === k.id}
                  <div class="ws-kept-acts">
                    {#each k.versions ?? [] as v (v.version)}
                      <Button size="sm" weight="quiet" onclick={() => void putBackOne(k.id, k.name, v.version)}>{shelfWords.putBack(v.version)}</Button>
                    {/each}
                    <Button size="sm" weight="quiet" onclick={() => shareOne({ name: k.name, block: k.block as Record<string, unknown>, sizes: k.sizes })}>{sheetWords.share}</Button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if shown.length === 0 && kept.length === 0}
        <p class="ws-none">{sheetWords.nothing(q.trim())}</p>
      {/if}

      <form class="ws-make" onsubmit={(e) => (e.preventDefault(), void makeIt())}>
        <label for="ws-make-said" class="ws-make-name">{sheetWords.makeOwn}</label>
        <div class="ws-make-row">
          <input id="ws-make-said" bind:value={made} placeholder={sheetWords.makeOwnLine} autocomplete="off" oninput={() => ((draft = null), (makeFix = null))} />
          <Button type="submit" size="sm" disabled={making || made.trim() === ''}>{making && !drawing ? sheetWords.making : sheetWords.makeGo}</Button>
          <Button size="sm" weight="bare" disabled={making || made.trim() === ''} onclick={() => void makeIt(false, true)}>{making && drawing ? sheetWords.drawing : sheetWords.drawGo}</Button>
        </div>
        {#if makeFix}<p class="ws-make-fix" role="status">{makeFix}</p>{/if}
        {#if draft}
          <div class="ws-made">
              <!-- THE TILE THAT WILL LAND, drawn as the board draws it (audit of 30 October, 13). -->
              <WidgetTile block={draft.block} size={draft.size} />
            <div class="ws-made-say">
              <p class="ws-make-note">{sheetWords.makeDraft}</p>
              {#if draft.cost}<p class="ws-make-note">{draft.cost}</p>{/if}
              <div class="ws-made-acts">
                <Button weight="primary" size="sm" disabled={adding} onclick={() => void putMade()}>{sheetWords.makePut}</Button>
                <Button weight="quiet" size="sm" disabled={making} onclick={() => void makeIt(true)}>{sheetWords.makeAgain}</Button>
                {#if draft.block.kind === 'drawn'}<Button weight="bare" size="sm" onclick={() => void keepMade()}>{shelfWords.save}</Button>{/if}
              </div>
            </div>
          </div>
        {/if}
      </form>
      {#if failed}<p class="ws-none" role="status">{sheetWords.notReached.replace(', so nothing was added', '')}</p>{/if}
    {/if}
  </div>
</Sheet>

{#snippet card(w: GalleryWidget, offer: WidgetOffer | null)}
  {@const s = offer?.size ?? w.size}
  {@const live = w.reading ?? (offer?.reading ?? null)}
  <div class="ws-card" data-size={s} style:--span={spanOf(s)}>
    <button type="button" class="ws-open" onclick={() => openOne(w, offer)} aria-label="{w.title}. {offer ? offer.why : w.says}">
      <span class="ws-frame" data-size={s}>
        <WidgetPreview widget={w} size={s} reading={live} {home} waiting={waiting} />
      </span>
      <span class="ws-cap">
        <span class="ws-name">{w.title.replace(/\{\{[a-z_]+\}\}/gu, w.filled.project ?? '')}</span>
        <span class="ws-line">{offer ? offer.why : w.onBoard && w.onBoardAs ? sheetWords.onTodayAs(w.onBoardAs) : !w.onBoard && !w.ready && w.need && !waiting ? w.need : w.says}</span>
      </span>
    </button>
    <!-- ON TODAY ALREADY, IT SAYS SO WHERE THE + WOULD BE (his call, 1 Nov): "Today already shows this." beside a + read as
         an offer to add it twice. -->
    {#if w.onBoard && !offer}
      <span class="ws-on">{sheetWords.onToday}</span>
    {:else if w.ready || waiting}
      <button type="button" class="ws-plus tap" aria-label={sheetWords.addNamed(w.title)} title={sheetWords.add} disabled={adding || waiting} onclick={() => add(w, s, offer)}>
        <Icon name="plus" size="s" />
      </button>
    {/if}
  </div>
{/snippet}

<style>
  /* WHERE THE + STANDS ON A CARD NOT ON TODAY: its corner, ringed in the sheet's colour as the + is. */
  .ws-on {
    position: absolute;
    inset-block-start: -8px;
    inset-inline-end: -8px;
    padding: 3px var(--sp-2);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    box-shadow: 0 0 0 3px var(--tile);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    line-height: 18px;
    pointer-events: none;
  }

  .ws {
    /* THE SHEET'S BOARD: four columns in the drawer, two on the phone, a Small square, gaps as the board's. */
    --ws-gap: 12px;
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5, 20px);
    padding-block-end: var(--sp-4);
  }

  .ws-search {
    position: sticky;
    inset-block-start: 0;
    z-index: calc(var(--z-raise) + 2);
    /* A BAND OF THE SHEET'S OWN FILL ABOVE IT, so what scrolls under the search is hidden, not seen past it. */
    box-shadow: 0 -16px 0 8px var(--tile);
    display: flex;
    align-items: center;
    gap: 8px;
    block-size: 40px;
    padding-inline: 12px;
    background: var(--tile-2, var(--page));
    border-radius: 12px;
    color: var(--ink-3);
  }

  .ws-search input {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .ws-search:focus-within {
    box-shadow:
      0 -16px 0 8px var(--tile),
      0 0 0 2px var(--focus, var(--ink-2));
  }

  .ws-group {
    display: grid;
    gap: 10px;
  }

  .ws-gh {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    letter-spacing: 0.01em;
  }

  .ws-grid {
    --cols: 4;
    --u: calc((100cqi - (var(--cols) - 1) * var(--ws-gap)) / var(--cols));
    display: grid;
    grid-auto-flow: row dense;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 18px var(--ws-gap);
    align-items: start;
  }

  /* ON A PHONE ONE COLUMN, EACH PREVIEW AT THE PHONE TILE'S REAL SIZE (T13): two across, every preview was a quarter of
     a phone's tile. A Small or a Tall is drawn a phone column wide with its name beside it; a Wide, a Large or a Full is
     the phone's full width. */
  @container (width < 560px) {
    .ws-grid {
      --cols: 1;
      --u: calc((100cqi - var(--ws-gap)) / 2);
      gap: var(--sp-4);
    }

    .ws-card:is([data-size='small'], [data-size='tall']) .ws-open {
      grid-template-columns: var(--u) minmax(0, 1fr);
      align-items: center;
      column-gap: var(--ws-gap);
    }
  }

  .ws-card {
    position: relative;
    grid-column: span min(var(--span), var(--cols));
    min-inline-size: 0;
  }

  .ws-open {
    display: grid;
    gap: 8px;
    inline-size: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* THE FRAME IS THE SIZE IT WILL BE ON THE BOARD, in the sheet's cells: a Small square, a Wide two by one, a Tall one by
     two, a Large two by two, a Full four by one (two by one on the phone, as the phone's board draws it). */
  .ws-frame {
    display: block;
    inline-size: 100%;
    aspect-ratio: 1;
    background: var(--page);
    border-radius: 18px;
    transition: transform var(--d-state, 0.15s) var(--ease-out, ease-out);
  }

  .ws-card .ws-frame {
    box-shadow: 0 0 0 1px var(--rule);
  }

  .ws-card .ws-frame {
    block-size: var(--u);
    aspect-ratio: auto;
  }

  .ws-card .ws-frame[data-size='tall'],
  .ws-card .ws-frame[data-size='large'] {
    block-size: calc(2 * var(--u) + var(--ws-gap));
  }

  .ws-open:hover .ws-frame {
    transform: translateY(-2px);
  }

  .ws-open:focus-visible {
    /* focus-ok: `.ws-frame` below draws the ring inside the card. */
    outline: none;
  }

  .ws-open:focus-visible .ws-frame {
    box-shadow: 0 0 0 2px var(--focus, var(--ink));
  }

  @media (prefers-reduced-motion: reduce) {
    .ws-frame {
      transition: none;
    }

    .ws-open:hover .ws-frame {
      transform: none;
    }
  }

  .ws-cap {
    display: grid;
    gap: 1px;
    min-inline-size: 0;
    padding-inline: 2px;
  }

  .ws-name {
    overflow: hidden;
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-line {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* THE + SITS ON THE FRAME'S CORNER, as a home screen's does: one press, the size it starts at. */
  .ws-plus {
    position: absolute;
    inset-block-start: -8px;
    inset-inline-end: -8px;
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--ink);
    box-shadow: 0 0 0 3px var(--tile);
    color: var(--tile);
    cursor: pointer;
  }

  /* UNDER A THUMB THE PLUS IS 32 DRAWN AND 44 TO PRESS (`.tap`), clear of the frame's corner. */
  @media (pointer: coarse) {
    .ws-plus {
      inline-size: 32px;
      block-size: 32px;
    }
  }

  .ws-plus:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ws-plus:focus-visible {
    outline: 2px solid var(--focus, var(--ink));
    outline-offset: 2px;
  }

  /* ── one widget, whole ── */
  .ws-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    padding: 4px 8px 4px 2px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .ws-back:hover {
    background: var(--hover);
  }

  .ws-detail {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: var(--sp-5, 20px);
    align-items: start;
  }

  @container (width < 560px) {
    .ws-detail {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .ws-stage {
    --u: min(150px, calc((100% - var(--ws-gap)) / 2));
    container-type: inline-size;
    display: grid;
    place-items: center;
    min-block-size: calc(2 * 150px + var(--ws-gap) + 48px);
    padding: 24px 16px;
    background: var(--page);
    border-radius: 20px;
  }

  @container (width < 560px) {
    .ws-stage {
      min-block-size: 0;
    }
  }

  .ws-stage .ws-frame {
    box-shadow: 0 0 0 1px var(--rule);
    --su: min(150px, calc((100cqi - var(--ws-gap)) / 2));
    inline-size: var(--su);
    block-size: var(--su);
    aspect-ratio: auto;
    background: none;
    transition:
      inline-size var(--d-state, 0.18s) var(--ease-out, ease-out),
      block-size var(--d-state, 0.18s) var(--ease-out, ease-out);
  }

  .ws-stage .ws-frame[data-size='wide'] {
    inline-size: calc(2 * var(--su) + var(--ws-gap));
  }

  .ws-stage .ws-frame[data-size='tall'] {
    block-size: calc(2 * var(--su) + var(--ws-gap));
  }

  .ws-stage .ws-frame[data-size='large'] {
    inline-size: calc(2 * var(--su) + var(--ws-gap));
    block-size: calc(2 * var(--su) + var(--ws-gap));
  }

  .ws-stage .ws-frame[data-size='full'] {
    inline-size: 100cqi;
    block-size: var(--su);
  }

  .ws-about {
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .ws-why {
    display: flex;
    gap: 8px;
    align-items: start;
    margin: 0;
    padding: 10px 12px;
    background: var(--tile-2, var(--page));
    border-radius: 12px;
    font-size: var(--fs-meta);
    line-height: 1.4;
  }

  .ws-says {
    margin: 0;
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  .ws-meta {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ws-sizes {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .ws-sizes legend {
    margin-block-end: 8px;
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .ws-size-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }

  .ws-size {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 10px 2px 8px;
    border: 0;
    border-radius: 10px;
    background: var(--tile-2, var(--page));
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .ws-size[aria-pressed='true'] {
    background: var(--ink);
    color: var(--tile);
  }

  .ws-size:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ws-size:focus-visible {
    outline: 2px solid var(--focus, var(--ink));
    outline-offset: 2px;
  }

  /* EACH SIZE AS A PICTURE OF ITS CELLS. */
  .ws-size-pic {
    display: block;
    inline-size: 12px;
    block-size: 12px;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }

  .ws-size[data-size='wide'] .ws-size-pic {
    inline-size: 24px;
  }

  .ws-size[data-size='tall'] .ws-size-pic {
    block-size: 24px;
  }

  .ws-size[data-size='large'] .ws-size-pic {
    inline-size: 24px;
    block-size: 24px;
  }

  .ws-size-box {
    display: grid;
    place-items: center;
    block-size: 24px;
  }

  .ws-size[data-size='full'] .ws-size-pic {
    inline-size: 32px;
  }

  .ws-choice {
    display: grid;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .ws-choice select {
    block-size: 36px;
    padding-inline: 10px;
    border: 1px solid var(--rule-strong);
    border-radius: 10px;
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-weight: var(--fw-regular, 400);
  }

  .ws-go {
    display: grid;
    padding-block-start: 4px;
  }

  /* ── made by you, make your own ── */
  .ws-kept {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 8px;
  }

  .ws-kept-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: var(--page);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    text-align: start;
    cursor: pointer;
  }

  .ws-kept-one {
    display: grid;
    gap: 6px;
  }

  .ws-kept-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
  }

  .ws-kept-more {
    display: grid;
    place-items: center;
    inline-size: 36px;
    border: 0;
    border-radius: 12px;
    background: var(--page);
    color: var(--ink-2);
    cursor: pointer;
  }

  .ws-kept-v {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .ws-kept-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ws-kept-pic {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 8px;
    background: var(--tile);
  }

  .ws-kept-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-make {
    display: grid;
    gap: 6px;
    padding: 14px;
    border: 1.5px dashed var(--rule-strong);
    border-radius: 16px;
  }

  .ws-make-name {
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .ws-make-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }

  .ws-make-fix,
  .ws-make-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .ws-made {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    padding-block-start: 6px;
  }


  .ws-made-say {
    display: grid;
    flex: 1 1 200px;
    gap: 6px;
  }

  .ws-made-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ws-make input {
    block-size: 36px;
    padding-inline: 10px;
    border: 1px solid var(--rule);
    border-radius: 10px;
    background: var(--tile);
    color: var(--ink);
    font: inherit;
  }

  .ws-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
