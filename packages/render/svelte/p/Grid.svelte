<!--
  `grid` — n cells of label and figure, row-aligned. Kinds: `stat`, `board`, and `cards` and `heat`, which have
  a drawer of their own (`Cards.svelte`, `p/Heat.svelte`).

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
  import { figureChars, headlineFigure, hrefFor, inline, leadingCode, rowKeys, symbolFigure, symbolText, text, TONES, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import { columnAt, columnsOf, dropTarget, lanes, laneShown, moveTarget, type Moves } from '../../src/board.ts';
  import { takeWorking, WORKING_GLYPH, WORKING_LABEL } from '../../src/working.ts';
  import { TODO_META_JOIN, boardMeta } from '../../src/todo.ts';
  import { valueWord } from '../../src/format.ts';
  import { written } from '../../src/html.ts';
  import { AMOUNT_SPACE } from '../../src/money.ts';
  import { statChange } from '../../src/hero.ts';
  import { drawnRows, emptied, trendWaits } from '../../src/html.ts';
  import { TREND_WAIT } from '../../src/cards.ts';
  import Text from '../Text.svelte';
  import Cards from '../Cards.svelte';
  import Heat from './Heat.svelte';
  import { pointed, type Point } from '../menu-at.ts';
  import Trend from '../Trend.svelte';

  let {
    block,
    opts = {},
    onmove,
    onopen,
    onmenu,
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
    /**
     * A CARD'S TWO VERBS, the ones a `todo` row takes in `List.svelte`, and reads of the host's as they are there: open
     * the card (its title becomes a button) and its menu, anchored to the control pressed. Each is drawn only when it
     * is passed, and neither needs `onmove`: a board the host cannot move may still open a card. With neither a card is
     * the markup it always was, which is what `toHTML` draws.
     */
    onopen?: ((row: Row) => void) | undefined;
    /** The row's menu, at its "…", or at `point` where a right-click or a held thumb opened it. */
    onmenu?: ((row: Row, anchor: HTMLElement, point?: Point) => unknown) | undefined;
  } = $props();

  /* Local, because `packages/render` is MIT, embeddable and imports nothing, and `copy.ts` lives in
     the app and cannot be reached from here. The register's receipt chip says the same words. */
  const NOT_SAVED = 'Not saved';
  const BOARD = 'Board';
  /** The name of each card's lane control, which says what choosing a lane in it does. */
  const MOVE_TO = 'Move to';
  /** The menu control's name, with the card's title after it, as a task's says it in `List.svelte`. */
  const MORE = 'More for';
  /** What a card with no title is called there. */
  const CARD = 'this card';
  /** The name of the switch a narrow board shows one lane at a time with. */
  const LANES = 'Columns';

  const live = $derived(Boolean(onmove));
  const columns = $derived(columnsOf(block.rows));

  /** Moves made since this block was drawn, by row index. Nothing has been written yet. */
  let moved = $state<Moves>({});
  const board = $derived(lanes(block.rows, moved));
  /* A CARD KEYED BY ITS ROW'S OWN KEY (`rowKeys`), not its place in the block, so a card the record added is a new element
     and the cards after it keep theirs, which a host can move in and out. */
  const cardKeys = $derived(rowKeys(block.rows));

  /**
   * ONE LANE AT A TIME ON A PHONE, behind a switch of their names and counts: stacked, the
   * lanes were one list 15,000 px long. Drawn only on a board a host draws, which is a board in the app: the static
   * mirror has nothing to turn a switch with, so it stacks as it always did, and the two stay one tree there. The
   * switch is in the markup at every width and `kinds/board.css` shows it, and hides the other lanes, only where the
   * lanes are stacked. Which lane opens is `laneShown`'s to say.
   */
  const hosted = $derived(live || Boolean(onopen) || Boolean(onmenu));
  const switched = $derived(hosted && board.length > 1);
  let chosen = $state<string | null>(null);
  const shownLane = $derived(switched ? laneShown(board, chosen) : null);

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
    /* A KEY THAT WALKS INTO ANOTHER LANE SHOWS IT, so on a phone the caret never lands on a card that is not drawn. */
    chosen = board[col]?.name ?? chosen;
    cardAt(card.at)?.focus();
  }

  /** The next column in `dir` that has anything in it. An empty lane is skipped, never landed on. */
  function stepColumn(dir: 1 | -1) {
    for (let col = place.col + dir; col >= 0 && col < board.length; col += dir)
      if ((board[col]?.cards.length ?? 0) > 0) return goTo(col, place.rank);
  }

  /**
   * THE MOVE, AND IT IS OPTIMISTIC. The card is in its new column on the next frame; nothing waits
   * for a host that may take a second to answer or may refuse. What it does not do is
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
    /* A CARD'S LANE CONTROL KEEPS ITS OWN KEYS. Its arrows choose a lane, which is the platform's contract for a select,
       and the board taking them would move the card and the caret while the reader was only looking through the list. */
    if (e.target instanceof HTMLSelectElement) return;

    /* `↵` ON A CARD OPENS IT, where the host opens one. On the card itself only: on its title or its menu the key is
       already that button's press, and answering it here too would open the card twice or open it under its menu. */
    if (e.key === 'Enter' && onopen && !e.shiftKey && !e.altKey && e.target instanceof HTMLElement && e.target.hasAttribute('data-at')) {
      const row = block.rows[Number(e.target.getAttribute('data-at'))];
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      onopen(row);
      return;
    }

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
    e.dataTransfer.setData('text/plain', text(inline(takeWorking(row.cells[1] ?? null).text ?? '', opts)));
  }

  /* The figures that hold a value, and what a grid left with none says (`drawnRows`, `emptied` in `src/html.ts`). */
  const shown = $derived(drawnRows(block, opts));
  const left = $derived(emptied(block, opts));
</script>

{#snippet cardBody(row: Row, unsaved: boolean, stop: 0 | -1 | undefined)}
  <!-- `working: true`'s dot, on the cell the kind calls the card by, which `workingCell` settles for
       both sides of the convention. Read off that cell and no other: a dot found on the detail and
       drawn on the title would be this drawer disagreeing with `html.ts`, which draws each cell where
       it found it, and the two are held equal by `src/parity.test.ts`. -->
  {@const title = takeWorking(row.cells[1] ?? null)}
  {#if onopen}
    <!-- THE TITLE OPENS THE CARD, as a button inside the title's own span and in the class a task's title wears
         (`item-open`), so the card keeps its face. A link in the title is drawn as its words: two targets on one line
         is a press that lands on the wrong one. On a live board it is a tab stop only on the card that holds the
         board's one, as the lane control is. -->
    <span class="card-title"
      ><button type="button" class="item-open" tabindex={stop} onclick={() => onopen?.(row)}
        >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}{text(
          inline(title.text ?? '', opts),
        )}</button
      ></span
    >
  {:else}
    <span class="card-title">
      {#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text nodes={inline(title.text ?? '', opts)} {opts} />
    </span>
  {/if}
  <!-- THE FOURTH CELL JOINS THE THIRD ON THE ONE LINE, by the dot a `todo`'s two facts are joined with, and a
       card without one draws the line it always drew. -->
  <!-- A PAST DAY ON A CARD STILL TO DO IS SAID LATE, in red, and nothing else on the board is (`boardMeta`). -->
  {@const meta = boardMeta(row.cells, opts.now)}
  {#if (row.cells[3] ?? '').trim() !== ''}
    <span class="card-detail">{#each meta as part, n}{#if n > 0}{TODO_META_JOIN}{/if}<Text nodes={inline(part, opts)} {opts} />{/each}</span>
  {:else}
    <span class="card-detail"><Text nodes={inline(meta[0] ?? '', opts)} {opts} /></span>
  {/if}
  <!-- A WORD, NOT A COLOUR, so it needs no tone and draws no glyph: `13 §5.1` bans colour carrying
       meaning alone, and the way out of that rule is to say the thing rather than to tint it. The
       shape is the register's receipt chip, and it means what that chip means: the card is where
       you put it, and nothing has been written yet. -->
  {#if unsaved}<span class="card-mark">{NOT_SAVED}</span>{/if}
{/snippet}

{#snippet laneHead(name: string, count: number)}
  <h3 class="board-head">{valueWord(name, true)}<span class="board-count num">{count}</span></h3>
{/snippet}

{#if block.kind === 'cards'}
  <Cards {block} {opts} />
{:else if block.kind === 'heat'}
  <Heat {block} {opts} />
{:else if block.kind === 'board'}
  <!--
    HTML DRAG AND DROP, NOT POINTER EVENTS. The gesture is the platform's: it brings its own drag
    image, its own cursor, `Esc` to cancel and a drop that fires once. A pointer-events version has
    to rebuild all four, hold pointer capture, and then decide on every `pointermove` whether the
    reader meant to drag a card or to scroll the page, which is a judgement it gets wrong on
    exactly the surface that matters, `#main` being the app's one scroll container. What it would
    buy is touch, which native DnD does not do, and each card's "Move to" select below buys that
    without a gesture to misread; what it would not buy is a board a keyboard user can use, and that
    is the half of this that was never optional.

    `svelte-ignore` because the linter cannot see through the ternary and reads `tabindex` on a
    non-interactive role as the mistake it usually is. Every value it can actually take here is -1
    or a roving 0 on the one cell that holds the tab stop, which is what the APG grid pattern asks
    for. `Table` carries the same suppression, for the same wrapper, for the same reason.
  -->
  {#if switched}
    <!-- THE LANES' SWITCH, each a toggle with its count, as a lane's head says it. Outside the grid, so its buttons are
         tab stops of their own and the board's arrows never reach them. -->
    <div class="board-lanes" role="group" aria-label={LANES}>
      {#each board as lane (lane.name)}
        <button type="button" class="board-lane" aria-pressed={lane.name === shownLane} onclick={() => (chosen = lane.name)}
          >{valueWord(lane.name, true)}<span class="board-count num">{lane.cards.length}</span></button
        >
      {/each}
    </div>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="grid"
    style="--cells:{columns.length}"
    data-lanes={switched ? '' : undefined}
    data-menu={live && onmenu ? '' : undefined}
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
        data-shown={shownLane === lane.name ? '' : undefined}
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
             number sits beside the name rather than being inferred from the stack.
             An `h3`, one step under the block's own `h2` title, so the outline never skips a level. A live
             board wraps it in the `rowheader` the grid needs, because a heading element cannot take that
             role itself, and the heading stays a heading inside it. -->
        {#if live}
          <div role="rowheader">{@render laneHead(lane.name, lane.cards.length)}</div>
        {:else}
          {@render laneHead(lane.name, lane.cards.length)}
        {/if}
        {#each lane.cards as card (cardKeys[card.at] ?? card.at)}
          <!-- The card's controls are tab stops only on the card that holds the board's one; on a board nothing moves,
               each is its own stop. -->
          {@const stop = live ? (card.at === focus ? 0 : -1) : undefined}
          <div
            class="card"
            data-menu-host={onmenu ? '' : undefined}
            data-arrived={card.row.arrived ? '' : undefined}
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
            {@render cardBody(card.row, card.moved, stop)}
            {#if live}
              <!--
                THE TOUCH PATH. HTML drag and drop does nothing under a finger, so on a phone the board's one action did
                not exist; each card carries its lanes as a native select, which every touch screen opens as its own
                picker, and choosing one calls the same `commit` a drop and `⇧→` do. Its 44px is the host's select rule,
                because a select draws no `::before` for `tap` to grow; `tap` is here for a host that draws it another
                way. It is a tab stop only beside the card that holds the board's one, so a keyboard
                walking the board meets it there and nowhere else, and a pointer that can drag still can.

                NOT DRAWN WHERE A POINTER CAN DRAG (`kinds/board.css`): it said the lane's name again under every card.
                Nor where the card has a menu (`data-menu`), whose Move to is the touch path there.
                It stays in the tree for that, never `hidden`, so the tab stop and a screen reader still have it and it
                shows itself when a keyboard lands on it.
              -->
              <select
                class="board-move tap"
                aria-label={MOVE_TO}
                tabindex={card.at === focus ? 0 : -1}
                onchange={(e) => void commit(card.at, e.currentTarget.value)}
              >
                {#each columns as col (col)}
                  <option value={col} selected={col === lane.name}>{valueWord(col, true)}</option>
                {/each}
              </select>
            {/if}
            {#if onmenu}
              <!-- LAST, AND QUIET: the three dots a task's row ends on (`item-more`), waiting for the pointer or the
                   keyboard to reach the card (`data-calm`), named for the card, with the 44px hit box `tap` gives. -->
              <button
                type="button"
                class="card-more item-more tap"
                data-calm=""
                aria-haspopup="menu"
                aria-label="{MORE} {text(inline(takeWorking(card.row.cells[1] ?? null).text ?? '', opts)) || CARD}"
                tabindex={stop}
                {@attach pointed((p) => onmenu?.(card.row, root ?? document.body, p))}
                onclick={(e) => onmenu?.(card.row, e.currentTarget)}
                ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"
                  ><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg
                ></button
              >
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else if left !== undefined}
  <!-- A FIGURE GRID LEFT WITH NOTHING says the host's `empty:` line, or nothing (`emptied`), as `toHTML` draws it. -->
  {#if left !== null}<p class="block-empty">{left}</p>{/if}
{:else}
  <!--
    A FIGURE IS A DOOR WHEN THE HOST KNOWS WHERE ITS ROWS ARE. "Overdue · GBP 2,340.00" is a number
    somebody immediately wants the four rows behind, and the derivation that guarantees the tile and
    the list cannot disagree is worth nothing behind something unclickable. Where there is no
    address it stays a `div`: a link to nowhere is worse than no link.
  -->
  <!-- A FIGURE WITH NO VALUE IS NOT DRAWN (`drawnRows`) and the tiles are counted after, as `toHTML` counts them. Each
       keeps its place in the block, which is what `cellHref` is keyed by. -->
  <div class="grid" style="--cells:{shown.length}">
    {#each shown as { row, at: i }, n}
      {@const to = opts.cellHref?.(i) ?? null}
      <!-- THE SAME FIGURE IN THE HOME CURRENCY under one in another (`opts.approx`), and the lead figure's change as a
           chip in front of the rest of its note (`statChange`), as `html.ts` draws them. -->
      {@const approx = row.cells[1] && opts.approx ? opts.approx(row.cells[1].trim()) : null}
      {@const note = row.cells[2] ? symbolText(row.cells[2], true, opts.home) : ''}
      {@const change = block.form === 'lead' && n === 0 ? statChange(note) : null}
      {@const href = to === null ? null : hrefFor(opts, to)}
      <!-- THE CURRENCY CODE IS PRESENT AND QUIET. A figure the size of this one read "GBP" as loudly
           as the number, three capitals in front of every headline on the screen. The code stays,
           because money is never a bare number, and the text is unchanged; only the emphasis moves,
           the way `Money` already sets a row's amount. -->
      <!-- A STAT'S FIGURE IS A HEADLINE, said the way `headlineFigure` says one: `£33,850`, `EGP 412,300`. -->
      <!-- TOLD THE RECORD'S HOME, THE ONE WRITER SAYS IT (`written`, html.ts): its code quiet where it stands in front,
           and its text as it is where a sign says the currency. Not told, the figure is drawn as it always was. -->
      {@const w = written(row.cells[1] ?? '', opts, 'read')}
      {@const figure = w ? w.text : headlineFigure(row.cells[1] ?? '', opts.home)}
      {@const symbol = w ? (w.codePlace === 'before' ? null : w.text) : symbolFigure(figure)}
      {@const coded = w ? null : leadingCode(figure)}
      <!-- `.amount` holds the code and its first figure on one line; ` · £24,800` after it wraps (`figureEnd`, html.ts). -->
      {@const end = coded ? coded.rest.search(/\s|$/u) : 0}
      {@const chars = figureChars(figure)}
      <svelte:element
        this={href ? 'a' : 'div'}
        class="cell"
        class:cell-open={href}
        {href}
        data-intent={row.tone}
        data-dir={(w ? w.minus : coded?.sign) === '+' ? 'in' : undefined}
      >
        <span class="cell-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="cell-figure num" data-fit={chars === null ? undefined : ''} style={chars === null ? undefined : `--chars:${chars}`}>
          {#if !row.cells[1]}{MISSING}{:else if symbol}{symbol}{:else if w}<span class="amount"
              >{w.minus}<span class="amount-code">{w.code}</span>{AMOUNT_SPACE}{w.whole}{w.fraction}</span
            >{:else if coded}<span class="amount"
              >{coded.sign}<span class="amount-code">{coded.currency}</span>
              <Text nodes={inline(coded.rest.slice(0, end), opts)} {opts} /></span
            ><Text nodes={inline(coded.rest.slice(end), opts)} {opts} />{:else}<Text
              nodes={inline(figure, opts)}
              {opts}
            />{/if}
        </span>
        {#if approx}<span class="cell-approx num">{approx}</span>{/if}
        {#if trendWaits(row.cells[3] ?? '')}<span class="cell-trend-wait">{TREND_WAIT}</span>{:else}<Trend cls="cell-trend" label={row.cells[0] ?? ''} value={row.cells[3] ?? ''} {opts} dated={shown.length === 1 && block.form !== 'lead'} />{/if}
        {#if change}<span class="cell-note"
            ><span class="cell-change num" data-dir={change.dir}>{change.change}</span>{#if change.rest}{' '}<Text nodes={inline(change.rest, opts)} {opts} />{/if}</span
          >{:else}<span class="cell-note"><Text nodes={inline(note, opts)} {opts} /></span>{/if}
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </svelte:element>
    {/each}
  </div>
{/if}
