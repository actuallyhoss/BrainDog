<!--
  The list as white cards on the ground, from 640px up: in lanes by state (the board), or in one wrapping grid (the
  cards). The design system draws content on white and lists on the ground, and a board is both: each lane is a column of the
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
  import { display, identityFor } from '$lib/record/api.ts';
  import type { Names } from '$lib/record/remote.ts';
  import { isMoney, type Entry, type RegisterDecl } from '$lib/record/schema.ts';
  import Chip from '$lib/ui/Chip.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ofPeople } from '$lib/ui/RowCards.svelte';
  import { deadlineOf, dueOf, isDone, laneFieldOf, lanesOf, type Receipt } from './list.ts';

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
    setRowState,
  }: {
    register: string;
    decl: RegisterDecl;
    /** Lanes by state, or one grid. */
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
    openCardMenu: (seq: number, el: HTMLElement) => void;
    /** Absent for a caller whose level cannot change the list, and no card is draggable then. */
    setRowState?: ((seq: number, state: string) => void) | undefined;
  } = $props();

  /* This part's own words. */
  const words = {
    board: (name: string) => `${name} by state`,
    unset: 'Not set',
    empty: 'Nothing here',
  } as const;

  const laneField = $derived(laneFieldOf(decl));
  const lanes = $derived(mode === 'board' ? lanesOf(decl, entries) : []);
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

  /** What a lane is called: the state's own label, or "Not set" for the rows whose state is none of them. */
  const laneSaid = (value: string | null): string => (value === null || !laneField ? words.unset : valueSaid(laneField, value));

  /* ── moving a card between lanes ────────────────────────────────────────── */

  /** The card being dragged, by number, and the lane it is over. Nothing else reads either. */
  let dragging = $state<number | null>(null);
  let over = $state<string | null>(null);

  function dropOn(value: string | null) {
    const seq = dragging;
    dragging = null;
    over = null;
    if (seq === null || value === null || !setRowState || !decl.state) return;
    const row = entries.find((e) => e.seq === seq);
    if (row && String(row.fields[decl.state] ?? '') !== value) setRowState(seq, value);
  }
</script>

{#snippet card(e: Entry)}
  {@const title = titleOf(e)}
  {@const name = title ?? copy.thisRow}
  {@const own = faced ? null : identityFor(register, e.fields, names)}
  {@const due = dueOf(decl, e, now)}
  {@const word = mode === 'cards' && decl.state ? saidOf(e, decl.state) : null}
  {@const extra = detail ? saidOf(e, detail) : null}
  {@const said = receiptFor(e.seq)}
  {@const value = figure ? e.fields[figure] : undefined}
  <!-- THE DRAG IS THE POINTER'S WAY BETWEEN LANES, and "Set to" in the card's menu is everybody's. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <li
    class="bcard"
    data-row-seq={e.seq}
    data-picked={selected.has(e.seq) ? '' : undefined}
    data-cursor={cursor === e.seq ? '' : undefined}
    data-done={isDone(decl, e) ? '' : undefined}
    data-arrived={arrived.has(`${register}#${e.seq}`) ? '' : undefined}
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
        {#if faced}<span class="bcard-face"><Face name={title ?? ''} kind="person" size="s" /></span
          >{:else if own}<span
            class="bcard-mark thing-glyph"
            data-shape={own.mark}
            style={own.retired ? undefined : `--hue:${own.hue}`}
            data-retired={own.retired ? '' : undefined}
            role="img"
            aria-label={own.name}></span>{/if}
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
    <button type="button" class="bcard-more tap" aria-label={copy.moreOn(name)} title={copy.moreOn(name)} onclick={(ev) => openCardMenu(e.seq, ev.currentTarget)}>
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
  <div class="board" role="region" aria-label={words.board(decl.name)} tabindex="0">
    {#each lanes as lane (lane.value ?? '')}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <section
        class="lane"
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
    border-radius: var(--r-lg);
    transition: background var(--d-state) var(--ease-out);
  }

  /* THE LANE A CARD WOULD LAND IN, while one is dragged over it: the ground's wash, rounded as a tile is. */
  .lane[data-over] {
    background: var(--hover-wash);
  }

  /* A GROUP'S HEADING ON THE GROUND: the name at `--t-group`, its count quiet, and a hairline under it. */
  .lane-head {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    margin: 0 var(--sp-1) var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  .lane-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
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
    color: var(--dim);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .lane-empty {
    margin: 0;
    padding: var(--sp-3) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
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

  .bgrid {
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
    gap: var(--sp-3);
  }

  /* ── a card: white, level 1, told from the ground by its fill ───────────── */

  .bcard {
    position: relative;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    background: var(--bg);
    border-radius: var(--r-md);
    box-shadow: var(--e1);
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
    font-size: var(--t-row);
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
    color: var(--dim);
    font-weight: 400;
  }

  /* THE FIGURE ENDS THE FIRST LINE, tabular, never cut. */
  .bcard-figure {
    grid-column: 2;
    grid-row: 1;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* THE META LINE: `t-meta` in the quiet ink, one line. */
  .bcard-meta {
    grid-column: 1 / -1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "2 DAYS LATE", THE CARD'S ONE RED, carried by its words at 500. */
  .bcard-due[data-late] {
    color: var(--danger);
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
    color: var(--ink2);
  }

  .bcard-mark {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .bcard-mark[data-retired] {
    color: var(--dim);
  }

  .bcard-face {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
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
    border-radius: var(--r-pill);
    color: var(--ink2);
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
    border-block-start: 1px solid var(--line);
  }

  .bcard-undo {
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  /* THE KEYBOARD'S CARD AND A SELECTED ONE: a ring round the white, since a wash over white is no mark at all. The
     caret's is the quiet boundary ink, as the table's caret row is only a wash at rest; a selected card's is ink, with
     its tick, and it wins when a card is both. */
  .bcard[data-cursor] {
    box-shadow:
      var(--e1),
      0 0 0 1.5px var(--edge);
  }

  .bcard[data-picked] {
    box-shadow:
      var(--e1),
      0 0 0 2px var(--ink);
  }

  /* A CARD THAT ARRIVED WHILE THE READER LOOKED: the arrival's tint, fading over a second and a half. */
  .bcard[data-arrived] {
    animation: bcard-arrived 1.5s var(--ease-out);
  }

  @keyframes bcard-arrived {
    from {
      background-color: var(--arrived-wash);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .bcard:not(:hover, :focus-within, [data-cursor]) .bcard-more {
      opacity: 0;
    }

    .bcard:not([data-picked], [data-cursor]):hover {
      box-shadow:
        var(--e1),
        0 0 0 1px var(--line);
    }

    .bcard-more:hover,
    .bcard-undo:hover {
      background: var(--s1);
      color: var(--ink);
    }
  }

  /* THE MARK OF A ROW JUST ADDED: a dot in the info ink before its title, as the table draws it. */
  .fresh {
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-2);
    background: var(--info-fill);
    border-radius: var(--r-pill);
    vertical-align: middle;
    animation: fresh-in var(--d-enter) var(--ease-out);
  }

  @keyframes fresh-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fresh,
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
