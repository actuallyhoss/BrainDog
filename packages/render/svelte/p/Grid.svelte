<!--
  `grid` — n cells of label and figure, row-aligned. Kinds: `stat`, `board`.

  `--cells` is set from the DECLARATION, never inferred from the space available. A three-tile stat
  in a 962px column once drew seven auto-fit tracks, four of them holding nothing but the block's
  own border colour: a 550px slab of grey, and every selector was correct (05 §4).

  A BOARD MOVES A CARD NOW, and until it did the block was decoration: `[draggable="true"]` was 0 on
  `/p/work`, 14 cards across 4 state columns, none draggable, none clickable, none focusable. A
  kanban board whose entire purpose is moving a card between columns, with no way to move a card.
  The arithmetic behind the move is in `src/board.ts`, where it can be tested without a DOM.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { inline, text, TONES, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import { columnAt, columnsOf, dropTarget, lanes, moveTarget, type Moves } from '../../src/board.ts';
  import Text from '../Text.svelte';

  let {
    block,
    opts = {},
    onmove,
  }: {
    block: Block;
    opts?: RenderOptions;
    /**
     * WHERE THE MOVE IS REPORTED, and the whole reason a card is draggable at all.
     *
     * This package is a pure renderer that knows nothing about any host's data layer, so it cannot
     * write. Absent this, none of the interactive layer is built: no `draggable`, no `role="grid"`,
     * no tab stop: the same markup the block has always drawn and the same tree `toHTML` produces.
     * `19 §6`'s rule is that a control which cannot act is ABSENT rather than greyed out, and a
     * control that moves a card and tells nobody is worse than either.
     */
    onmove?: ((row: Row, to: string) => void) | undefined;
  } = $props();

  /* Local, because `packages/render` is MIT, embeddable and imports nothing, and `copy.ts` lives in
     the app and cannot be reached from here. The register's receipt chip says the same words. */
  const NOT_SAVED = 'Not saved';
  const BOARD = 'Board';

  const live = $derived(Boolean(onmove));
  const columns = $derived(columnsOf(block.rows));

  /** Moves made since this block was drawn, by row index. Nothing has been written yet. */
  let moved = $state<Moves>({});
  const board = $derived(lanes(block.rows, moved));

  /**
   * ROVING TABINDEX: exactly one card is reachable by Tab and every other is -1, held as the row's
   * index rather than as a position, so focus follows the CARD across a move instead of staying at
   * the hole it left. The pattern is `Table`'s, and for its reason: a grid is a composite widget, so
   * one of its focusable elements is in the page tab sequence rather than all fourteen (19 §4).
   */
  let focus = $state(0);
  let root = $state<HTMLElement | undefined>(undefined);

  /** The row being dragged, and the column the pointer is over. Both null when nothing is in flight. */
  let carrying = $state<number | null>(null);
  let over = $state<string | null>(null);

  /**
   * THE LEDGER BELONGS TO ONE FENCE, and is dropped when that fence changes.
   *
   * Nothing dropped it. `moved` is keyed by ROW INDEX. `board.ts` says why, and `ticks.ts` states
   * the same rule for the package: the dialect is text, a row has no id, so a position is a fact
   * about one document and means nothing over another. `Document.svelte` and `/p/[slug]` both
   * iterate their segments unkeyed, so Svelte reuses this component when the document changes
   * under it, and `{ 2: 'Doing' }` was then applied to whatever row now sits at index 2: a card the
   * reader never touched, drawn in a column it was not declared in, wearing "Not saved". `lanes()`
   * clears a mark only when the new row's cell 0 already equals the stored target, which is the
   * "the host wrote it" case and not this one.
   *
   * The caret and the drag in flight go with it, because both are held by index too: a `carrying`
   * that outlives its rows is a drop onto a card nobody picked up.
   *
   * Same shape, and the same reason, as `List` dropping its ticks when its fence changes.
   */
  let drawn = $state('');
  $effect(() => {
    if (block.raw === drawn) return;
    drawn = block.raw;
    moved = {};
    focus = 0;
    carrying = null;
    over = null;
  });

  /**
   * The column that would take the card if it were released now, or null.
   *
   * A LANE ONLY LIGHTS WHEN THE DROP WOULD DO SOMETHING. The card's own column is a valid place to
   * let go and a move that changes nothing, so it stays dark: the highlight is the answer to "will
   * this land", not to "is the pointer here".
   */
  const dropping = $derived(
    carrying === null || over === null
      ? null
      : dropTarget(columns, columnAt(block.rows, carrying, moved), over),
  );

  /** Where the focused card sits on the screen, which is what the arrow keys move through. */
  const place = $derived.by(() => {
    for (const [col, lane] of board.entries()) {
      const rank = lane.cards.findIndex((c) => c.at === focus);
      if (rank >= 0) return { col, rank };
    }
    return { col: 0, rank: 0 };
  });

  const cardAt = (at: number) => root?.querySelector<HTMLElement>(`[data-at="${at}"]`) ?? null;

  /** Focus a card by column and rank, clamped. An empty column is not somewhere focus can go. */
  function goTo(col: number, rank: number) {
    const cards = board[col]?.cards ?? [];
    const card = cards[Math.max(0, Math.min(rank, cards.length - 1))];
    if (!card) return;
    focus = card.at;
    cardAt(card.at)?.focus();
  }

  /** The next column in `dir` that has anything in it. An empty lane is skipped, never landed on. */
  function stepColumn(dir: 1 | -1) {
    for (let col = place.col + dir; col >= 0 && col < board.length; col += dir)
      if ((board[col]?.cards.length ?? 0) > 0) return goTo(col, place.rank);
  }

  /**
   * THE MOVE, AND IT IS OPTIMISTIC. The card is in its new column on the next frame; nothing waits
   * for a host that may take a second to answer or may refuse (REWORK §4). What it does not do is
   * pretend the move is saved: the card carries a mark until whatever `onmove` reached redraws the
   * block with the new state in cell 0, at which point `moved` is answering about a row that already
   * agrees with it and the mark is gone. There is no confirmation dialog, here or anywhere in this
   * product, on purpose.
   */
  async function commit(at: number, to: string) {
    const row = block.rows[at];
    const target = row ? dropTarget(columns, columnAt(block.rows, at, moved), to) : null;
    if (!row || target === null) return;
    moved = { ...moved, [at]: target };
    focus = at;
    onmove?.(row, target);
    /* The card is a different DOM node in a different column now, so the focus it had went with the
       node that was destroyed. Only when the board already held focus: a pointer drop must not
       yank the caret out of whatever the reader was typing in. */
    if (root?.contains(document.activeElement)) {
      await tick();
      cardAt(at)?.focus();
    }
  }

  /**
   * NO BARE LETTERS, and that is a deliberate gap rather than an oversight.
   *
   * `keys.svelte.ts` binds `j` and `k` in grid scope, and it can only promise them because one
   * dispatcher consults one registry and a `Character keys: off` switch can silence the whole
   * bare-letter namespace. This package cannot see that switch, cannot see that registry, and must
   * not import them. A bare `j` bound here would keep firing for somebody who turned bare letters
   * off, which is the one thing that setting exists to stop, so the board binds arrows, `Home`,
   * `End` and two chords, all of which stay bound in either state.
   *
   * ARROWS FOLLOW THE SCREEN. Left and right walk the columns, up and down walk a column, which is
   * what the reader is looking at.
   *
   * THE MOVE IS `⇧←  ⇧→`, AND ALSO `⌥↑  ⌥↓`. The keymap's answer to "move the focused item" is
   * `⌥↑ ⌥↓` under `nav`, and it is the documented chord, so it is bound. It is also the wrong axis
   * for a board, and its horizontal spelling is unavailable: `Alt+ArrowLeft` and `Alt+ArrowRight`
   * are on `NEVER_BIND`, because they are the browser's own Back and Forward and taking them is how
   * you lose somebody's place. `⇧←  ⇧→` is the move along the axis it is drawn on. Neither is bare,
   * so neither needs WCAG 2.1.4's focus exception to be legal, and the page above stops reading
   * keys the moment either modifier is held.
   */
  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) return;

    const shift = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const alt = e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
    if (shift || alt) {
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const to = moveTarget(columns, columnAt(block.rows, focus, moved), dir);
      /* Swallowed either way. An arrow that is the board's when it works and the page's when it
         hits the last column is a key whose meaning depends on where you already are. */
      e.preventDefault();
      e.stopPropagation();
      if (to !== null) void commit(focus, to);
      return;
    }

    if (e.shiftKey || e.altKey) return;

    switch (e.key) {
      case 'ArrowLeft':
        stepColumn(-1);
        break;
      case 'ArrowRight':
        stepColumn(1);
        break;
      case 'ArrowUp':
        goTo(place.col, place.rank - 1);
        break;
      case 'ArrowDown':
        goTo(place.col, place.rank + 1);
        break;
      case 'Home':
        goTo(place.col, 0);
        break;
      case 'End':
        goTo(place.col, Number.MAX_SAFE_INTEGER);
        break;
      default:
        return;
    }
    /* `stopPropagation` because the page above walks BLOCKS with the same arrows. Without it,
       leaving the last card of a column also scrolled the page to the next block. */
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * The tab stop follows the reader, and entering the grid itself hands focus to a card.
   *
   * `/p/[slug]` enters a block by focusing the first `[role="grid"]` it finds, which is this
   * element and not a cell, so without the forward, pressing `↵` on a board moved focus to a
   * container and the arrows had nothing to move. `focusin` and not `focus` because it is the one
   * that bubbles, so the same handler also keeps `focus` on whichever card was clicked or tabbed to.
   */
  function onfocusin(e: FocusEvent) {
    const el = e.target;
    if (el === root) {
      cardAt(focus)?.focus();
      return;
    }
    const at = el instanceof Element ? el.closest('[data-at]')?.getAttribute('data-at') : null;
    if (at !== null && at !== undefined) focus = Number(at);
  }

  function ondragstart(e: DragEvent, at: number, row: Row) {
    carrying = at;
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    /* A payload, because Firefox starts no drag without one, and the card's own title so that a
       drop outside this board arrives as the words the reader was dragging rather than as nothing. */
    e.dataTransfer.setData('text/plain', text(inline(row.cells[1] ?? '', opts)));
  }
</script>

{#snippet cardBody(row: Row, unsaved: boolean)}
  <span class="card-title"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
  <span class="card-detail"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
  <!-- A WORD, NOT A COLOUR, so it needs no tone and draws no glyph: `13 §5.1` bans colour carrying
       meaning alone, and the way out of that rule is to say the thing rather than to tint it. The
       shape is the register's receipt chip, and it means what that chip means: the card is where
       you put it, and nothing has been written yet. -->
  {#if unsaved}<span class="card-mark">{NOT_SAVED}</span>{/if}
{/snippet}

{#if block.kind === 'board'}
  <!--
    HTML DRAG AND DROP, NOT POINTER EVENTS. The gesture is the platform's: it brings its own drag
    image, its own cursor, `Esc` to cancel and a drop that fires once. A pointer-events version has
    to rebuild all four, hold pointer capture, and then decide on every `pointermove` whether the
    reader meant to drag a card or to scroll the page, which is a judgement it gets wrong on
    exactly the surface that matters, `#main` being the app's one scroll container. What it would
    buy is touch, which native DnD does not do; what it would not buy is a board a keyboard user can
    use, and that is the half of this that was never optional.

    `svelte-ignore` because the linter cannot see through the ternary and reads `tabindex` on a
    non-interactive role as the mistake it usually is. Every value it can actually take here is -1
    or a roving 0 on the one cell that holds the tab stop, which is what the APG grid pattern asks
    for. `Table` carries the same suppression, for the same wrapper, for the same reason.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="grid"
    style="--cells:{columns.length}"
    bind:this={root}
    role={live ? 'grid' : undefined}
    aria-label={live ? (block.heading ?? BOARD) : undefined}
    tabindex={live ? -1 : undefined}
    onkeydown={live ? onkeydown : undefined}
    onfocusin={live ? onfocusin : undefined}
  >
    {#each board as lane (lane.name)}
      <!--
        THE COLUMN IS THE `row`, AND THE BOARD IS TRANSPOSED. A `grid` admits only rows, and a row
        admits only cells, so a board drawn as four vertical stacks has to map its stacks onto one
        or the other. The column is the grouping every card in it shares, which is what a row IS in
        the ARIA sense, and it means the column's name reaches a screen reader as a `rowheader`,
        announced with every card in the lane, so "Doing, Legal review" is what you hear instead of
        a title with no state attached. What it costs is that "row 2" means the second COLUMN. The
        arrow keys follow the screen rather than that mapping, because the reader is looking at the
        screen.
      -->
      <div
        class="board-col"
        role={live ? 'row' : undefined}
        data-drop={dropping === lane.name ? '' : undefined}
        ondragover={live
          ? (e) => {
              if (carrying === null) return;
              /* `preventDefault` on dragover is what makes an element a drop target at all: the
                 default is to refuse, and a column that refuses shows the no-entry cursor over the
                 one gesture the block exists for. */
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              over = lane.name;
            }
          : undefined}
        ondragleave={live
          ? (e) => {
              /* Only when the pointer left the COLUMN. `dragleave` fires for every card and every
                 span inside it, so an unguarded handler put the highlight out on the way in. */
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) over = null;
            }
          : undefined}
        ondrop={live
          ? (e) => {
              e.preventDefault();
              const at = carrying;
              carrying = null;
              over = null;
              if (at !== null) void commit(at, lane.name);
            }
          : undefined}
      >
        <!-- The count is the column's whole reason to have a header. A board is read by comparing
             heights, and heights lie the moment one column scrolls and another does not — so the
             number sits beside the name rather than being inferred from the stack. -->
        <h4 class="board-head" role={live ? 'rowheader' : undefined}>{lane.name}<span class="board-count num">{lane.cards.length}</span></h4>
        {#each lane.cards as card (card.at)}
          <div
            class="card"
            data-at={live ? card.at : undefined}
            data-moved={card.moved ? '' : undefined}
            data-carrying={carrying === card.at ? '' : undefined}
            role={live ? 'gridcell' : undefined}
            tabindex={live ? (card.at === focus ? 0 : -1) : undefined}
            draggable={live ? 'true' : undefined}
            ondragstart={live ? (e) => ondragstart(e, card.at, card.row) : undefined}
            ondragend={live
              ? () => {
                  carrying = null;
                  over = null;
                }
              : undefined}
          >
            {@render cardBody(card.row, card.moved)}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <!--
    A FIGURE IS A DOOR WHEN THE HOST KNOWS WHERE ITS ROWS ARE. "Overdue · GBP 2,340.00" is a number
    somebody immediately wants the four rows behind, and the derivation that guarantees the tile and
    the list cannot disagree is worth nothing behind something unclickable. Where there is no
    address it stays a `div`: a link to nowhere is worse than no link.
  -->
  <div class="grid" style="--cells:{block.rows.length}">
    {#each block.rows as row, i}
      {@const href = opts.cellHref?.(i) ?? null}
      <svelte:element
        this={href ? 'a' : 'div'}
        class="cell"
        class:cell-open={href}
        {href}
        data-intent={row.tone}
      >
        <span class="cell-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="cell-figure num">
          {#if row.cells[1]}<Text nodes={inline(row.cells[1], opts)} {opts} />{:else}{MISSING}{/if}
        </span>
        <span class="cell-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </svelte:element>
    {/each}
  </div>
{/if}
