<!--
  The list as white cards on the ground, from 640px up: in lanes by state, or by the choice field Display chose (the
  board), or in one wrapping grid (the cards). The design system draws content on white and lists on the ground, and a board is both: each lane is a column of the
  ground with its heading and a hairline under it, as a group on the ground is, and each row is a white card at level 1.

  A CARD SAYS WHAT A ROW IS AND WHEN IT IS DUE. The project's mark or the person's face, the title, the figure at the
  end of the first line, then one quiet line: "2 days late" in red when it is past its deadline (the one red on a card),
  else when it falls due, and one declared detail. A card is a link to the row, as a table row is; its
  verbs are the same row menu the table's ⋯ opens, and what just happened to it is the same receipt, under it.

  A CARD MOVES LANES BY BEING DRAGGED, and by "Set to …" in its menu, which is the way that needs no pointer. Both are
  the page's `setRowState`, which draws the move at once and puts it back if the record says no. A reader whose level
  cannot change the list is handed no `setRowState`, and nothing is draggable.

  THE PAGE HOLDS EVERYTHING THIS DRAWS, as it does for the table: the rows already cut to the cap, the selection, the
  keyboard's row, the receipts and every write.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { display, identityFor, labelOf } from '$lib/record/api.ts';
  import type { Names } from '$lib/record/remote.ts';
  import { isMoney, type Entry, type RegisterDecl } from '$lib/record/schema.ts';
  import Chip from '$lib/ui/Chip.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ofPeople } from '$lib/ui/RowCards.svelte';
  import { rowIn, rowOut } from '$lib/ui/motion.ts';
  import { menuAt, type MenuAt } from '$lib/ui/context-menu.ts';
  import { SELECTION_MENU, deadlineOf, dueOf, isDone, laneFieldOf, lanesOf, type Receipt } from './list.ts';

  let {
    register,
    decl,
    mode,
    entries,
    now,
    names,
    selected,
    cursor,
    fresh,
    arrived,
    more,
    receiptFor,
    openCardMenu,
    lane,
    setRowState,
  }: {
    register: string;
    decl: RegisterDecl;
    /** Lanes, or one grid. */
    mode: 'board' | 'cards';
    /** The rows to draw, already cut to `DOM_CAP` by the page. */
    entries: readonly Entry[];
    now: number;
    names: Names | undefined;
    selected: ReadonlySet<number>;
    /** The row the keyboard is on, which wears the caret's ring. */
    cursor: number | null;
    /** The rows just added, marked for a moment so the eye can find them. */
    fresh: ReadonlyMap<number, number>;
    /** The rows that arrived while the reader looked, by the key the table speaks in (`register#seq`). */
    arrived: ReadonlySet<string>;
    /** There may be another page, so the cards end in a sentinel the page's observer watches. */
    more: boolean;
    receiptFor: (seq: number) => Receipt | undefined;
    /** The row's menu, hung from its "…", or at the pointer when a right-click or a held thumb opened it. */
    openCardMenu: (seq: number, el: HTMLElement, point?: MenuAt) => void;
    /** The field the lanes are, as Display chose it; absent is the list's state (`laneFieldOf`). */
    lane?: string | undefined;
    /** Absent for a caller whose level cannot change the list, and no card is draggable then. A card dropped in a
        lane takes that lane's value of the lane field. */
    setRowState?: ((seq: number, value: string, field?: string) => void) | undefined;
  } = $props();

  /* This part's own words. */
  const words = {
    board: (name: string, by: string) => `${name} by ${by.toLowerCase()}`,
    unset: 'Not set',
    empty: 'Nothing here',
  } as const;

  const laneField = $derived(laneFieldOf(decl, lane));
  const lanes = $derived(mode === 'board' ? lanesOf(decl, entries, lane) : []);
  const faced = $derived(ofPeople(decl));
  const dated = $derived(deadlineOf(decl));

  /* THE FIGURE THAT ENDS A CARD'S FIRST LINE, and the one detail after its date: the list's own `mobile:` fields, as the
     phone's card reads them, so a card here and a card on a phone say the same things about a row. */
  const FIGURES = new Set(['money', 'int', 'decimal']);
  const figure = $derived(decl.mobile.slice(1).find((id) => FIGURES.has(decl.fields.find((f) => f.id === id)?.type ?? '')));
  const detail = $derived(
    decl.mobile.slice(1).find((id) => id !== figure && id !== dated && id !== decl.title && id !== decl.state),
  );

  const titleOf = (e: Entry): string | null => display(register, decl.title, e.fields[decl.title], now, names);

  /** A field's words on a card: a declared value by its label, anything else as `display` says it. */
  function saidOf(e: Entry, id: string): string | null {
    const field = decl.fields.find((f) => f.id === id);
    const raw = e.fields[id];
    if (field?.type === 'enum' && typeof raw === 'string' && raw !== '') return valueSaid(field, raw);
    return display(register, id, raw, now, names);
  }

  /** What a lane is called: the value's own label, or "Not set" for the rows whose value is none of them. */
  const laneSaid = (value: string | null): string => (value === null || !laneField ? words.unset : valueSaid(laneField, value));

  /* ── moving a card between lanes ────────────────────────────────────────── */

  /** The card being dragged, by number, and the lane it is over. Nothing else reads either. */
  let dragging = $state<number | null>(null);
  let over = $state<string | null>(null);

  function dropOn(value: string | null) {
    const seq = dragging;
    dragging = null;
    over = null;
    const field = laneField?.id;
    if (seq === null || value === null || !setRowState || !field) return;
    const row = entries.find((e) => e.seq === seq);
    if (row && String(row.fields[field] ?? '') !== value) setRowState(seq, value, field);
  }
</script>

{#snippet card(e: Entry)}
  {@const title = titleOf(e)}
  {@const name = title ?? copy.thisRow}
  {@const own = faced ? null : identityFor(register, e.fields, names)}
  {@const due = dueOf(decl, e, now)}
  {@const word = mode === 'cards' && decl.state ? saidOf(e, decl.state) : null}
  <!-- THE DETAIL, or where the list names none, the project the row is about, by name: its shape led the title once, and
       told nobody which project without a key. -->
  {@const extra = (detail ? saidOf(e, detail) : null) || (own?.name ?? null)}
  {@const said = receiptFor(e.seq)}
  {@const value = figure ? e.fields[figure] : undefined}
  <!-- THE DRAG IS THE POINTER'S WAY BETWEEN LANES, and "Set to" in the card's menu is everybody's. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <li
    in:rowIn
    out:rowOut
    class="bcard"
    data-mode={mode}
    data-row-seq={e.seq}
    data-menu-host={selected.size > 1 && selected.has(e.seq) ? SELECTION_MENU : ''}
    data-picked={selected.has(e.seq) ? '' : undefined}
    data-cursor={cursor === e.seq ? '' : undefined}
    data-done={isDone(decl, e) ? '' : undefined}
    data-arrived={arrived.has(`${register}#${e.seq}`) || fresh.has(e.seq) ? '' : undefined}
    draggable={setRowState && mode === 'board' ? 'true' : undefined}
    ondragstart={(ev) => {
      if (!setRowState || mode !== 'board') return;
      dragging = e.seq;
      ev.dataTransfer?.setData('text/plain', `${register}#${e.seq}`);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    }}
    ondragend={() => {
      dragging = null;
      over = null;
    }}
  >
    <a class="bcard-open" href={at(`/r/${register}/${e.seq}`)} draggable="false">
      <span class="bcard-title" dir="auto">
        {#if fresh.has(e.seq)}<span class="fresh" data-fresh={e.seq} aria-hidden="true"></span>{/if}
        {#if faced}<span class="bcard-face"><Face name={title ?? ''} kind="person" size="s" /></span>{/if}
        <!-- A LOCK ON A ROW ITS MAKER KEPT PRIVATE, as the grid draws one. -->
        {#if e.private}<span class="bcard-lock" title={copy.rowPrivateLock} role="img" aria-label={copy.rowPrivateLock}><Icon name="lock" size="s" /></span>{/if}
        {#if title === null}<span class="bcard-missing">{words.unset}</span>{:else}{title}{/if}
      </span>
      {#if value !== undefined && value !== null && value !== ''}
        <span class="bcard-figure">
          {#if isMoney(value)}<Money minor={value.amount} currency={value.currency} />{:else}{display(register, figure ?? '', value, now, names) ?? ''}{/if}
        </span>
      {/if}
      {#if due || word || extra}
        <span class="bcard-meta">
          {#if due}<span class="bcard-due" data-late={due.late ? '' : undefined}>{due.text}</span>{/if}
          {#if word}{#if due}<span aria-hidden="true">{' · '}</span>{/if}<span>{word}</span>{/if}
          {#if extra}{#if due || word}<span aria-hidden="true">{' · '}</span>{/if}<span dir="auto">{extra}</span>{/if}
        </span>
      {/if}
      {#if selected.has(e.seq)}<span class="bcard-tick" role="img" aria-label={copy.selected}><Icon name="check" size="s" /></span>{/if}
    </a>
    <!-- OUTSIDE THE LINK, because a button inside a link is neither. The same menu the table's ⋯ opens. -->
    <button
      type="button"
      class="bcard-more tap"
      aria-label={copy.moreOn(name)}
      title={copy.moreOn(name)}
      aria-haspopup="menu"
      aria-expanded="false"
      {@attach menuAt((p) => openCardMenu(e.seq, p.back ?? document.body, p))}
      onclick={(ev) => openCardMenu(e.seq, ev.currentTarget)}
    >
      <Icon name="more" size="m" />
    </button>
    {#if said}
      <div class="bcard-note">
        <Chip label={said.mark} tone={said.intent} />
        {#if said.undo}
          <button
            type="button"
            class="bcard-undo tap"
            aria-label={copy.undoRowOf(name)}
            onmousedown={(ev) => ev.preventDefault()}
            onclick={(ev) => {
              ev.stopPropagation();
              said.undo?.();
            }}>{copy.undoRow}</button
          >
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

{#if mode === 'board'}
  <!-- A REGION THAT SCROLLS SIDEWAYS, so a keyboard can reach it and a screen reader can name it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- A LANE WITH NOTHING IN IT IS NOT DRAWN (money F16): "Written off 0, Nothing here" took a quarter of the width.
       While a card is dragged it comes back as a 120px column, a place to drop on. -->
  {@const drawn = lanes.filter((l) => l.entries.length > 0 || dragging !== null)}
  <div
    class="board"
    role="region"
    aria-label={words.board(decl.name, laneField ? labelOf(laneField) : 'state')}
    tabindex="0"
    style:--lanes={drawn.map((l) => (l.entries.length > 0 ? 'minmax(264px, 1fr)' : '120px')).join(' ')}
  >
    {#each drawn as lane (lane.value ?? '')}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <section
        class="lane"
        data-empty={lane.entries.length === 0 ? '' : undefined}
        aria-label={laneSaid(lane.value)}
        data-over={dragging !== null && over === lane.value && lane.value !== null ? '' : undefined}
        ondragover={(ev) => {
          if (dragging === null || lane.value === null) return;
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
          over = lane.value;
        }}
        ondragleave={(ev) => {
          if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) over = null;
        }}
        ondrop={(ev) => {
          ev.preventDefault();
          dropOn(lane.value);
        }}
      >
        <header class="lane-head">
          <h2 class="lane-title"><span class="lane-name">{laneSaid(lane.value)}</span><span class="lane-count num">{lane.entries.length}</span></h2>
        </header>
        {#if lane.entries.length > 0}
          <ul class="lane-cards">
            {#each lane.entries as e (e.seq)}{@render card(e)}{/each}
          </ul>
        {:else}
          <p class="lane-empty">{words.empty}</p>
        {/if}
      </section>
    {/each}
  </div>
{:else}
  <ul class="bgrid">
    {#each entries as e (e.seq)}{@render card(e)}{/each}
  </ul>
{/if}

<!-- THERE MAY BE MORE, and the page's observer watches this for the next page, as it watches the table's. -->
{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  /* ── the board: lanes of the ground, side by side ───────────────────────── */

  /* THE LANES SHARE THE WIDTH WHILE THEY FIT AND SCROLL SIDEWAYS ONCE THEY DO NOT: never narrower than a card that can
     hold a title, 12 apart. The region hangs a step into the gutter on each side so
     the first lane's words line up with the title above it. */
  .board {
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: var(--lanes, none);
    grid-auto-columns: minmax(264px, 1fr);
    gap: var(--sp-3);
    align-items: start;
    margin-inline: calc(-1 * var(--sp-1));
    padding: var(--sp-1) var(--sp-1) var(--sp-3);
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }

  .lane {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    min-block-size: calc(var(--row-h-2) * 2);
    border-radius: var(--r-tile);
    transition: background var(--d-state) var(--ease-out);
  }

  /* THE LANE A CARD WOULD LAND IN, while one is dragged over it: the ground's wash, rounded as a tile is. */
  .lane[data-over] {
    background: var(--hover);
  }

  /* A GROUP'S HEADING ON THE GROUND: the name at `--fs-head`, its count quiet, and a hairline under it. */
  .lane-head {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    margin: 0 var(--sp-1) var(--sp-2);
    border-block-end: 1px solid var(--rule);
  }

  .lane-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .lane-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lane-count {
    flex: none;
    color: var(--ink-3);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .lane-empty {
    margin: 0;
    padding: var(--sp-3) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .lane-cards,
  .bgrid {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── the cards: one grid, as many across as fit ─────────────────────────── */

  /* THREE TO A ROW AT 1512 (money F16): five narrow cards a row was a grid of identical cards, every title wrapping. */
  .bgrid {
    grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
    gap: var(--sp-3);
  }

  /* ON A CARD OF THE GRID THE AMOUNT HAS A LINE OF ITS OWN, at 20 in the display face, and when it is due is the third. */
  .bcard[data-mode='cards'] .bcard-title {
    grid-column: 1 / -1;
  }

  .bcard[data-mode='cards'] .bcard-figure {
    grid-column: 1 / -1;
    grid-row: 2;
    font-family: var(--font-display);
    font-size: calc(var(--fs-figure) - 2px);
    font-weight: var(--fw-semi);
    line-height: 28px;
  }

  .bcard[data-mode='cards'] .bcard-meta {
    grid-row: 3;
  }

  /* A LANE THAT IS ONLY A PLACE TO DROP, while a card is dragged: its name and its nought, nothing under them. */
  .lane[data-empty] .lane-empty {
    display: none;
  }

  /* ── a card: a tile on the board, flat, told from the board by its fill ── */

  .bcard {
    position: relative;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    background: var(--tile);
    border-radius: var(--r-pop);
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .bcard[draggable='true'] {
    cursor: grab;
  }

  .bcard[draggable='true']:active {
    cursor: grabbing;
  }

  /* THE WHOLE CARD OPENS THE ROW, and the ⋯ is laid over its corner: the link keeps room for it at the end. */
  .bcard-open {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    padding: var(--sp-3);
    padding-inline-end: calc(var(--sp-3) + var(--ctl-h-sm));
    border-radius: inherit;
    color: var(--ink);
    text-decoration: none;
  }

  .bcard-title {
    grid-column: 1;
    min-inline-size: 0;
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .bcard-missing {
    color: var(--ink-3);
    font-weight: 400;
  }

  /* THE FIGURE ENDS THE FIRST LINE, tabular, never cut. */
  .bcard-figure {
    grid-column: 2;
    grid-row: 1;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* THE META LINE: `t-meta` in the quiet ink, one line. */
  .bcard-meta {
    grid-column: 1 / -1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "2 DAYS LATE", THE CARD'S ONE RED, carried by its words at 500. */
  .bcard-due[data-late] {
    color: var(--red);
    font-weight: 500;
  }

  .bcard-tick {
    position: absolute;
    inset-block-end: var(--sp-3);
    inset-inline-end: var(--sp-3);
    display: inline-grid;
    place-items: center;
    color: var(--ink);
  }

  /* A FINISHED ROW'S TITLE STEPS BACK to the second ink, as a done task does on Work. */
  .bcard[data-done] .bcard-title {
    color: var(--ink-2);
  }

  /* A PERSON'S FACE ON ONE NEUTRAL TINT, as on every list of people. */
  .bcard-lock {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
    color: var(--ink-2);
  }

  .bcard-face {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
  }

  .bcard .bcard-face :global(.face[data-kind='person']) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  /* THE ⋯, 28 at the card's top corner, quiet until the card is pointed at, and always there under a finger. */
  .bcard-more {
    position: absolute;
    inset-block-start: calc(var(--sp-3) - var(--sp-1));
    inset-inline-end: var(--sp-2);
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h-sm);
    block-size: var(--ctl-h-sm);
    padding: 0;
    background: none;
    border: 0;
    border-radius: calc(var(--r-ctl) - 2px);
    color: var(--ink-2);
    cursor: pointer;
    transition:
      opacity var(--d-state) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  .bcard-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 var(--sp-3);
    padding: var(--sp-2) 0 var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .bcard-undo {
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: calc(var(--r-ctl) - 2px);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
  }

  /* THE KEYBOARD'S CARD AND A SELECTED ONE: a ring round the tile, since a wash over it is no mark at all. The caret's is
     the quiet boundary ink, as the table's caret row is only a wash at rest; a selected card's is the accent, which is
     what selection looks like, with its tick, and it wins when a card is both. */
  .bcard[data-cursor] {
    box-shadow: 0 0 0 1.5px var(--rule-strong);
  }

  .bcard[data-picked] {
    box-shadow: 0 0 0 2px var(--on);
  }

  /* THE CARET'S RING ONLY WHILE THE KEYBOARD IS ON THE BOARD. At rest it sat round the first card, which nobody chose,
     and read as a card already picked. */
  :is(.board, .bgrid):not(:focus-within) .bcard[data-cursor]:not([data-picked], :hover) {
    box-shadow: none;
  }

  /* A CARD THAT ARRIVED WHILE THE READER LOOKED: the arrival's tint, fading over a second and a half. */
  .bcard[data-arrived] {
    animation: bcard-arrived 1.5s var(--ease-out);
  }

  @keyframes bcard-arrived {
    from {
      background-color: var(--arrived);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .bcard:not(:hover, :focus-within, [data-cursor]) .bcard-more,
    :is(.board, .bgrid):not(:focus-within) .bcard[data-cursor]:not(:hover) .bcard-more {
      opacity: 0;
    }

    .bcard:not([data-picked], [data-cursor]):hover {
      box-shadow: 0 0 0 1px var(--rule);
    }

    .bcard-more:hover,
    .bcard-undo:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  /* THE MARK OF A ROW JUST ADDED is how the page finds it; the eye finds it by the neutral arrival wash on the card. */
  .fresh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  @media (prefers-reduced-motion: reduce) {
    .bcard[data-arrived] {
      animation-timing-function: step-end;
    }
  }

  @media (forced-colors: active) {
    .bcard {
      border: 1px solid CanvasText;
    }
  }
</style>
