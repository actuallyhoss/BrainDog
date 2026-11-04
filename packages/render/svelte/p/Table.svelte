<!--
  `table` — real columns, a header, per-column alignment. Kinds: `comparison`, and the page-only
  `table`. It is also the register grid's body, which makes it the one primitive with behaviour.

  NOT a `<table>`. Measured in Chrome 151 at 8 columns, `<table>` layout scales superlinearly —
  26.9 / 59.6 / 149 / 318 / 790 ms across 500 / 1k / 2k / 5k / 10k rows — and `content-visibility`
  does not work on table rows, by spec and by measurement: size containment has no effect on an
  internal table box, and 5,000 `<tr>` with `content-visibility: auto` moved layout from 318 ms to
  337 ms. Grid with chunked CV takes the same 5,000 rows to 0.6 ms of layout (22 §4).

  Which forces the key coupling, and it is the best sentence in that research: because we need
  `content-visibility`, COLUMN WIDTHS MUST BE DECLARED, NOT CONTENT-DERIVED. `subgrid` would be the
  obvious alignment fix and is incompatible with it — a row with both reports computed
  `grid-template-columns: none`. So there is ONE `--cols` track list on the grid root and both the
  header and the body rows read it. The reason the fast path exists is that pages are declared.

  Per-row `content-visibility` is a trap: it fixes layout and produced 17 of 89 frames over 16.7 ms
  during scroll, versus 0 of 89 for chunked. Chunk at ~100 rows.

  A `role="grid"` and not a `role="table"` for two reasons: a grid is composite, so only one of its
  focusable elements is in the page tab sequence — at 500 rows by 8 columns that is the difference
  between one tab stop and four thousand — and a composite widget flips a screen reader out of
  browse mode, which is the only thing that makes bare single-letter row verbs legal under WCAG
  2.1.4 (19 §4).
-->
<script lang="ts">
  import { rowsAsCards } from '../rows-as-cards.svelte.ts';
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';
  import type { TransitionConfig } from 'svelte/transition';
  import { TONES, hrefFor, markOf, type RenderOptions } from '../../src/index.ts';
  import { markGlyphOf } from '../../src/cards.ts';
  import { slotOf } from '../../src/slot.ts';
  import { glyphPath } from '../../src/inline.ts';
  import { ariaSort, cardCells, cardPlan, chunkRows, moveCell, type CardCell, type Cell, type Column, type TableRow } from '../types.ts';
  import { glyphColumn, intrinsicRows, sameRows, cellIn, tableCellBody, tracksOf, TABLE_CHUNK, TABLE_ROWS_LABEL } from '../../src/table.ts';
  import { MISSING } from '../../src/format.ts';
  import { rowGroup, tableLines } from '../../src/html.ts';
  import { AMOUNT_SPACE } from '../../src/money.ts';
  import { WORKING_GLYPH, WORKING_LABEL } from '../../src/working.ts';
  import { ROW_ACTIONS_HEAD, rowActionsTrack, type OnAct } from '../../src/actions.ts';
  import Actions from '../Actions.svelte';
  import { pointed, type Point } from '../menu-at.ts';
  import { windowed } from '../../src/rows-window.ts';

  /**
   * What a scope cell draws its chip from. The host's type of the same shape is `ScopeCells` in
   * `apps/web/src/lib/record/page-live.ts`, which builds it; `Cards.svelte` writes the same shape out for the one it
   * reads from `RenderOptions`. Written here rather than imported, because nothing in this package imports the app.
   */
  type ScopeCells = { columns: readonly number[]; everywhere: string; glyph: string | null; marks: ReadonlyMap<string, { mark: string | null; hue: number | null }> };

  let {
    columns,
    rows,
    total = -1,
    cap,
    label,
    sort,
    focus = $bindable(),
    selected,
    menuHost,
    onmenu,
    onheadmenu,
    chunk = TABLE_CHUNK,
    onactivate,
    onsort,
    onmore,
    cellSnippet,
    href,
    scope,
    icon,
    home,
    now,
    rowActions,
    act,
    rowin,
    rowout,
    settle,
    headCells,
  }: {
    columns: readonly Column[];
    rows: readonly TableRow[];
    /**
     * HOW MANY DATA ROWS THERE ARE. `-1` while a filtered total is unknown, which is the honest
     * answer.
     *
     * IT IS THE DATA ROWS, AND `aria-rowcount` IS THE GRID'S ROWS. The header is inside the grid at
     * `aria-rowindex="1"` and every data row is `index + 2`, so the count a screen reader is given
     * has to be one more than this. It was passed straight through, and one caller of six had
     * compensated by adding the one itself; the other five had not, so the last row of a
     * thirty-eight-row register announced as "row 39 of 38". The component knows about its own
     * header and the callers should not have to, so the arithmetic is here.
     */
    total?: number | undefined;
    cap?: number | undefined;
    label?: string | undefined;
    sort?: { field: string; dir: 'asc' | 'desc' } | undefined;
    focus?: { row: number; col: number } | undefined;
    selected?: Set<string> | undefined;
    /** A row's `data-menu-host`, so a right-click on it opens its "…" (or, by selector, another menu); absent, none. */
    menuHost?: ((key: string) => string) | undefined;
    /** A row's menu where it is right-clicked or held, for a row with no "…" of its own; `false` back says it has none. */
    onmenu?: ((key: string, point: Point) => unknown) | undefined;
    /** A column head's menu, where it is right-clicked or held; absent, the head has none. */
    onheadmenu?: ((field: string, point: Point) => unknown) | undefined;
    chunk?: number | undefined;
    onactivate?: ((row: TableRow) => void) | undefined;
    onsort?: ((field: string) => void) | undefined;
    onmore?: (() => void) | undefined;
    cellSnippet?: Snippet<[TableRow, Column, string | null]> | undefined;
    /** Where a row's link goes, as the host serves it: `RenderOptions.href`, which this primitive is not otherwise handed. */
    href?: RenderOptions['href'];
    /**
     * WHERE A ROW APPLIES, AS A CHIP. The columns that hold a project's name or the word for everywhere,
     * each name's mark and hue, and the globe's path, all the host's: a cell there draws the project's mark in its hue
     * beside the name, or the globe beside "Everywhere". Absent, every cell is its words, as it always was.
     */
    scope?: ScopeCells | undefined;
    /** The host's drawing for a picture's name (`RenderOptions.icon`), so a scope chip's mark is its picture, as a card's is. */
    icon?: RenderOptions['icon'];
    /** The record's home currency (`RenderOptions.home`): a money cell is read once and written once against it. */
    home?: RenderOptions['home'];
    /** The reader's clock (`RenderOptions.now`): a day in its year is said without the year. */
    now?: number | undefined;
    /**
     * EACH ROW'S DECLARED ACTIONS and where a press goes, handed the `TableRow` it was on. Drawn in a last
     * column, and at a card's end on a phone, only when both are handed; with either absent the table is as it was.
     */
    rowActions?: readonly unknown[] | null | undefined;
    act?: OnAct | undefined;
    /**
     * HOW A ROW ARRIVES AND LEAVES, AND HOW THE ROWS BESIDE IT CLOSE THE GAP: the host's list motion (`lib/ui/motion.ts`
     * in the app, which this package does not import). Absent, a row is simply there or gone, as it always was.
     */
    rowin?: ((node: Element) => TransitionConfig) | undefined;
    rowout?: ((node: Element) => TransitionConfig) | undefined;
    settle?: (() => { duration: number; easing: (t: number) => number }) | undefined;
    /** A header cell the host draws itself, by its column's field: the select-all box over a column of pickers. */
    headCells?: Readonly<Record<string, Snippet>> | undefined;
  } = $props();

  /**
   * ONE ROW ADDED OR TAKEN AWAY MOVES; A NEW ANSWER DOES NOT. A filter, a search or a page turned swaps most of the rows
   * at once, and thirty rows opening and closing together is noise, so a change of more than three rows is drawn still.
   * Read before the rows are drawn (`$effect.pre`), so the transitions of the change itself see it.
   */
  let still = false;
  let shown: ReadonlySet<string> | null = null;
  $effect.pre(() => {
    const keys = new Set(rows.map((r) => r.key));
    let churn = 0;
    if (shown) {
      for (const k of keys) if (!shown.has(k)) churn += 1;
      for (const k of shown) if (!keys.has(k)) churn += 1;
    }
    still = churn > 3;
    shown = keys;
  });
  const NONE: TransitionConfig = { duration: 0 };
  const rowIn = (node: Element): TransitionConfig => (still || !rowin ? NONE : rowin(node));
  const rowOut = (node: Element): TransitionConfig => (still || !rowout ? NONE : rowout(node));
  const settled = () => (still || !settle ? { duration: 0 } : settle());
  /* A line's key and its row, for the keyed body, where every line is a row (no group heads). */
  type Line = (typeof lines)[number];
  const keyOf = (l: Line): string => (l.kind === 'row' ? l.row.key : `\u0000${l.name}`);
  const rowOf = (l: Line): TableRow => (l.kind === 'row' ? l.row : ({ key: keyOf(l), cells: [] } as unknown as TableRow));

  const acts = $derived(act !== undefined && Array.isArray(rowActions) && rowActions.length > 0);
  /* The actions' column is one past the declared ones, and in the caret's walk like any other. */
  const actsAt = $derived(columns.length);
  const cols = $derived(columns.length + (acts ? 1 : 0));

  /** A mark's picture as the host draws it, or `null`, and the chip's slot stays empty, as `Cards.svelte` leaves it. */
  const markArt = (glyph: string): string | null => glyphPath(glyph, icon ? { icon } : {});

  /* THE FIELDS WHOSE CELLS ARE CHIPS, by field and not by index, because the cell body is handed its column and not
     where the column sits. */
  const scoped = $derived(new Set((scope?.columns ?? []).map((i) => columns[i]?.field).filter((f): f is string => f !== undefined)));

  const tracks = $derived(tracksOf(columns, acts ? rowActionsTrack(rowActions) : undefined));
  /* One function for the groups AND the step they are counted in, because `aria-rowindex` is
     `group * step + i` and the two disagreeing is a table that announces a different row than the
     one on screen. It is also where `chunk={0}` stops being an endless loop during render. */
  /* EACH GROUP UNDER ITS HEADING, where the host put `group` on its rows (`tableLines`, which the static mirror draws
     from too). A heading is a row of the grid, so the chunks are cut from the lines and `aria-rowindex` counts it. NO
     ROW IN A GROUP, and the lines are the rows in their own order: every table that carries none is drawn as it was. */
  /* THE ROWS AS LAST DRAWN, kept while a new answer draws the same (`sameRows`): the keyed body moves nothing then. */
  let drawnRows: readonly TableRow[] = [];
  const steady = $derived.by(() => {
    if (!sameRows(rows, drawnRows)) drawnRows = rows;
    return drawnRows;
  });
  const lines = $derived(tableLines(steady, rowGroup));
  const grouped = $derived(chunkRows(lines, chunk));
  /* THE CARET WALKS THE ROWS AS DRAWN, `at`, which is the rows' own index wherever no row is grouped, so a host that
     binds `focus` to its own rows (the register grid, which groups nothing) reads the same row it always did. Each
     row's `aria-rowindex` is its line plus two, the header being row 1, and the two maps turn one into the other. */
  const ariaAt = $derived(lines.flatMap((l, n) => (l.kind === 'row' ? [n + 2] : [])));
  const atOfAria = $derived(new Map(ariaAt.map((aria, at) => [aria, at])));
  const heads = $derived(lines.length - rows.length);
  /* A GROUP'S COUNT ONLY WHERE THE TABLE HOLDS ALL ITS ROWS: drawn from a slice (a page of a longer list, or a block
     folded to its first few), a count would be the slice's. A cut table heads a group by its name alone, as cards do. */
  const counted = $derived(total === rows.length);

  /**
   * DOES ANY ROW CARRY A TONE? If none does, no row pays for the gutter one would sit in.
   *
   * `13 §5.1` is unambiguous: "Colour never carries meaning alone. The glyph is part of the intent
   * token, not a choice at the call site — a component cannot render `warn` without its glyph
   * because there is no API that lets it." Six primitives keep it. THIS ONE DID NOT. A toned row got
   * a two-pixel bar down its leading edge and nothing else: measured on `/r/obligations`, 16 rows
   * carrying an intent and 0 elements with a name for it, so an overdue invoice and a paid one were
   * the same row to a screen reader and the same row to anybody who does not see red.
   *
   * It is the primitive that carries most of the record — the register grid, every `table` block,
   * and the phone cards — which is why it is the one that mattered.
   */
  const toned = $derived(rows.some((r) => r.tone));

  /* WHERE THE TONE'S GLYPH GOES, decided in `../../src/table.ts` so the static mirror puts it in
     the same cell: the column that declares it carries the tone, and failing that the first column
     that carries a VALUE, which is not always the first column. The register grid leads with a row
     picker, and a glyph there sits on top of a checkbox, qualifying a control instead of a row. */
  const glyphAt = $derived(glyphColumn(columns));

  /* WHICH COLUMNS A PHONE CARD MAY DRAW, decided once from the columns and never from a row. The rules are with
     `cardPlan` in `../types.ts`. */
  const plan = $derived(cardPlan(columns));

  /**
   * Roving tabindex: exactly one cell is reachable by Tab, every other is -1.
   *
   * AND THE COMPONENT MOVES IT NOW. It never did: `focus` was declared `$bindable()` and never
   * written here, so the caret could only move for a caller that drove it from outside, and four
   * of the six do not. The caret is kept locally as well as offered through the binding, so the
   * rover works for a caller that passes nothing, which is every `comparison` block this package
   * draws through `Block.svelte`, and a caller that binds still owns the value.
   */
  let caret = $state<Cell>({ row: 0, col: 0 });
  const at = $derived(focus ?? caret);
  const isFocused = (r: number, c: number) => at.row === r && at.col === c;
  const tabIndex = (r: number, c: number) => (isFocused(r, c) ? 0 : -1);

  /* WHAT EACH HEADER SAYS ABOUT SORTING, and it used to say the same thing on every table: this
     returned `'none'` for any column that was not the sorted one, and `'none'` is the value that
     announces a column as sortable. The rule is in `../types.ts`, next to the roving caret's, and
     for the same reason: an attribute that is absent cannot be seen in a rendered tree. */
  /* A COLUMN HEAD HEARS ITS RIGHT-CLICK AS AN ITEM WITH NO "…" DOES (the app's `menuat`). */
  const headHeard = (field: string) => (node: HTMLElement) => {
    const on = (e: Event) => {
      e.preventDefault();
      onheadmenu?.(field, (e as CustomEvent<Point>).detail);
    };
    node.addEventListener('menuat', on);
    return () => node.removeEventListener('menuat', on);
  };
  const headerSort = (column: Column) => ariaSort(column, sort, onsort !== undefined);

  let grid = $state<HTMLElement | undefined>(undefined);

  /* BY `aria-rowindex`, which every row already carries and which is its line plus two (`ariaAt`), the
     header is row 1. A `data-*` attribute per cell would be the obvious handle and costs one
     attribute on every one of them, which on a 2,614-row register is the measurement this file
     exists to respect. The column is the cell's place among its siblings. */
  const cellAt = (c: Cell): HTMLElement | null =>
    (grid?.querySelector(`.tr[aria-rowindex="${ariaAt[c.row] ?? c.row + 2}"]`)?.children[c.col] as HTMLElement | undefined) ?? null;

  /**
   * The arrows, `Home` and `End`, and nothing else. The move itself is `moveCell` in `../types.ts`.
   *
   * SWALLOWED WHEN IT IS OURS AND UNTOUCHED WHEN IT IS NOT. `stopPropagation` because a page above
   * this one walks its blocks, and on the register its rows, with the same keys: an arrow that
   * is the grid's when it works and the page's when it hits the last column is a key whose meaning
   * depends on where you already are. A modifier is never ours: `⌘Home` and `⌘End` are the whole
   * list's ends and belong to whoever owns the list.
   */
  function onkeydown(e: KeyboardEvent) {
    /* A KEY A ROW'S MENU TOOK (its arrows, its Escape) is the menu's, never a move of the caret. */
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const to = moveCell(at, e.key, rows.length, cols);
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    caret = to;
    if (focus) focus = to;
    cellAt(to)?.focus();
  }

  /**
   * The caret follows whatever was clicked or tabbed to.
   *
   * `focusin` and not `focus` because it is the one that bubbles. Without it the tab stop and the
   * cell the reader is actually in come apart the moment they click one: the next arrow press
   * moves from where the caret was left, and the caret jumps somewhere they were not looking.
   */
  function onfocusin(e: FocusEvent) {
    /* AND ENTERING THE GRID ITSELF HANDS FOCUS TO A CELL. The root is `tabindex="-1"`, which the
       `grid` role requires of an element that listens for keys and which keeps it out of the tab
       order; without the forward, a host that enters a block by focusing its `[role="grid"]`,
       which is what `/p/[slug]` does, would land on the container and the arrows would have
       nothing to move. `Grid` forwards the same way for the same reason. */
    if (e.target === grid) {
      cellAt(at)?.focus();
      return;
    }
    const cell = e.target instanceof Element ? e.target.closest('.td') : null;
    const tr = cell?.parentElement;
    const row = atOfAria.get(Number(tr?.getAttribute('aria-rowindex') ?? Number.NaN)) ?? Number.NaN;
    if (!cell || !tr || !Number.isInteger(row) || row < 0) return;
    const col = [...tr.children].indexOf(cell);
    if (col < 0 || (at.row === row && at.col === col)) return;
    caret = { row, col };
    if (focus) focus = caret;
  }
</script>

<!-- A labelled, focusable scroll container. `tabindex="0"` is the part that matters and the linter
     is right in general and wrong here: a scrollable region MUST be focusable or a keyboard user
     cannot reach the scrollbar, and the APG grid pattern requires exactly this wrapper.

     `group` AND NOT `region`, which it used to be. `region` is a landmark, and a host that wraps
     each block in its own labelled `<section>` — which is a landmark too, and correctly so — then
     has two landmarks with identical roles and identical names nested one inside the other. A
     screen-reader user gets the same destination twice in the landmark list and no way to tell
     which is which. `group` keeps the accessible name on focus, keeps the scrolling, and stops
     claiming to be a place you can navigate to, which the section above it already is. -->
<!--
  ROWS BECOME CARDS BELOW 640px, WHICH IS `13 §10`'s RULE AND NOT A NEW ONE. "A 500-row table: the
  scroll wrapper survives, but the default view is the card list; the table is an explicit choice."
  A register has had this since it was written, through its declared `mobile:` fields. A table
  rendered from a page block never did — so `/p/money` on a phone showed `3 Sep 2…`, `Legal review,
  Fe…`, `GBP −19,100.00` spilling into the column beside it, and the Balance column, which is the
  entire reason the block exists, off the right edge behind a scrollbar.

  A CARD IS THE LEAD, THE FIGURE AND AT MOST TWO UNLABELLED VALUES. A register's card can pick its
  fields because its declaration names them; a block table has columns and no such declaration, so
  `cardPlan` and `cardCells` in `../types.ts` decide from the alignment and truncation the columns
  already declare. The title and the figure share the first line, and a quiet second line holds the
  first values that are there, text at its start and quantities at its end, each named for a screen
  reader and unlabelled on screen, as the figure is, UNLESS THE VALUE ALONE DOES NOT SAY WHAT IT IS: a
  bare count, or a second figure beside the first, shows its name too (`cardCells`, `data-named`).
-->
<!--
  A SCOPE CELL IS A CHIP: the globe beside "Everywhere", or the project's mark in its own hue beside its name. The
  mark is the project's character, drawn as `Cards.svelte` draws a card's, and hidden from a screen reader, which reads
  the name. The same markup as `Cards.svelte`'s chip, so a scope reads alike in a table and on a card.
-->
{#snippet scopeChip(cells: ScopeCells, said: string)}{@const everywhere = said === cells.everywhere}{@const m = everywhere ? undefined : cells.marks.get(said)}<span class="scope-chip" data-everywhere={everywhere ? '' : undefined}>{#if everywhere && cells.glyph}<svg class="scope-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={cells.glyph} /></svg>{:else if m?.mark}{@const sm = markOf(m.mark, said)}{@const sg = markGlyphOf(sm)}{#if sm}<span class="scope-mark" data-glyph={sg ?? undefined} style={m.hue === null ? undefined : `--hue:${m.hue}`} data-slot={m.hue === null ? undefined : slotOf(m.hue)} aria-hidden="true">{#if sg}{@const d = markArt(sg)}{#if d}<svg class="scope-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path {d} /></svg>{/if}{:else}{sm}{/if}</span>{/if}{/if}<span class="scope-name">{said}</span></span>{/snippet}

<!--
  ONE CELL BODY, DRAWN BY BOTH ARMS.

  THE CARD ARM DREW CELLS ITS OWN WAY AND THAT IS THE WHOLE DEFECT. It never called `cellSnippet`,
  which the grid arm has always called, so a caller that hands this component a snippet to draw a
  cell with got it on a desktop and got raw text on a phone: the register supplies one, and its row
  picker, its identity links and its in-place editor all came out as the string behind them below
  640px. And it dropped a pair whose value was empty rather than drawing the record's own missing
  mark, so a column disappeared from the card and a reader could not tell an empty cell from a
  column that is not in the table. Two renderings of one cell is the same class of fault as two
  renderings of one figure, and `13 §10` puts the decision in the declaration rather than in the
  width: a card shows what the declaration says, and this is the same declaration at both widths.

  Rendering it once is also the only form of the fix that stays fixed. The two arms are two hundred
  lines apart and the next change to a cell will be made in whichever one the author is reading.
-->
{#snippet cellBody(row: TableRow, column: Column, value: string | null)}{#if cellSnippet}{@render cellSnippet(row, column, value)}{:else if scope && value && scoped.has(column.field)}{@render scopeChip(scope, value)}{:else}{@const drawn = tableCellBody(value, home, now)}{#if drawn.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}{#if drawn.body.kind === 'missing'}<span class="missing">{MISSING}</span>{:else if drawn.body.kind === 'coded'}{@const end = drawn.body.rest.search(/\s|$/u)}<span class="amount" data-sign={cellIn(drawn.body) ? 'in' : undefined}>{drawn.body.sign}<span class="amount-code">{drawn.body.currency}</span>{AMOUNT_SPACE}{drawn.body.rest.slice(0, end)}</span>{drawn.body.rest.slice(end)}{:else if cellIn(drawn.body)}<span class="amount" data-sign="in">{drawn.body.text}</span>{:else}{drawn.body.text}{/if}{/if}{/snippet}

{#snippet pair(row: TableRow, cell: CardCell)}
  <span class="table-card-pair" data-truncate={cell.column.truncate ?? 'end'} data-named={cell.named ? '' : undefined}>
    <span class="table-card-name">{cell.column.label}</span>
    <span class="table-card-value">{@render cellBody(row, cell.column, cell.value)}</span>
  </span>
{/snippet}

{#snippet card(row: TableRow)}
  {@const drawn = cardCells(row, columns, plan)}
  {@const title = drawn.title}
  {@const mark = drawn.mark}
  <span class="table-card-head">
    <span class="table-card-lead">
      {#if row.tone}
        <span class="td-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
      {#if title}{@render cellBody(row, title.column, title.value)}{/if}
    </span>
    <!-- THE FIGURE'S NAME IS HIDDEN, NOT GONE. Beside a title an amount reads as that thing's amount
         to anybody who can see the line, which is what it is. A screen reader hears the card as one
         link in one breath, and a bare `GBP −9,190.00` in the middle of it is a number without a
         name, so the column's label is there for it and only for it. -->
    {#if mark}
      <span class="table-card-mark" data-truncate={mark.column.truncate} data-named={mark.named ? '' : undefined}>
        <span class="table-card-name">{mark.column.label}</span> {@render cellBody(row, mark.column, mark.value)}
      </span>
    {/if}
  </span>
  {#if drawn.start.length + drawn.end.length > 0}
    <span class="table-card-rest">
      {#if drawn.start.length > 0}
        <span class="table-card-start">{#each drawn.start as cell}{@render pair(row, cell)}{/each}</span>
      {/if}
      {#if drawn.end.length > 0}
        <span class="table-card-end">{#each drawn.end as cell}{@render pair(row, cell)}{/each}</span>
      {/if}
    </span>
  {/if}
{/snippet}

<!--
  ONE BODY AT A TIME, IN THE DOCUMENT AND NOT ONLY IN THE STYLESHEET.

  `blocks.css` hides whichever of these two does not belong at the current width, which builds both
  and shows one. Measured on a desktop register of 2,614 rows: the hidden `.table-cards` subtree was
  **54,786 nodes of the 83,871 under `#main` — 65% of the document**, none of it on the screen, and
  `13 §4.3`'s cap on the DOM was therefore being paid twice at every width.

  The stylesheet rules stay as the safety net they should always have been: a host that renders this
  without the branch gets one body rather than two stacked on each other.
-->
{#snippet cellsOf(row: TableRow, index: number)}
            {#each columns as column, c}
              {@const value = row.cells[c] ?? null}
              <!--
                THE HANDLERS ARE THERE ONLY WHERE THERE IS SOMETHING TO ACTIVATE, and they used to be
                unconditional. The card branch above records the same defect and fixes its own half:
                `onactivate` is supplied by two call sites, the register grid and a saved view, and a
                declared page passes none, so every cell of every table on `/p/*` carried a click
                handler and an Enter handler that called nothing. A cell that answers a press by
                doing nothing is indistinguishable from a broken one, which is the rule this whole
                product is built on.

                THE ROVING `tabindex` STAYS EITHER WAY, and that is not an inconsistency. It is what
                makes a grid navigable for READING: a composite widget with one tab stop, arrow keys
                inside it, and a caret a screen reader can follow along a row. A table you cannot put
                the caret in is a table a keyboard cannot read, which is a bigger loss than a cell
                that is focusable and has nothing to do.

                THAT PARAGRAPH WAS TRUE OF ONE CALLER OUT OF SIX. The arrow keys it names were never
                written: the only handler in this file was `Enter`, `focus` was `$bindable()` and
                never assigned, and a keyboard user on the four callers that bring no arrows of
                their own tabbed to cell (0,0) and tabbed out again with every other cell in the
                table unreachable. The rover is `onkeydown` on the grid root above, and its
                arithmetic is `moveCell` in `../types.ts`, where a caret walking off the end of a
                row can be asserted without a DOM.

                `data-acts` IS FOR THE POINTER. Without it the cursor is the only thing left saying a
                cell can be pressed, and it was saying it everywhere.
              -->
              <span
                class="td"
                role="gridcell"
                tabindex={tabIndex(index, c)}
                data-align={column.align ?? 'start'}
                data-truncate={column.truncate ?? 'end'}
                data-glyph={c === glyphAt ? '' : undefined}
                data-tone={column.tone ? '' : undefined}
                data-acts={onactivate ? '' : undefined}
                onclick={onactivate ? () => onactivate(row) : undefined}
                onkeydown={onactivate ? (e) => e.key === 'Enter' && onactivate(row) : undefined}
              >
                <!-- IN THE CELL IT QUALIFIES, AND AT ITS HEAD.

                     Inside a cell because the only children `role="row"` admits are cells: a glyph
                     hung on the row itself is a stray node in the accessibility tree, which is the
                     same mistake the cap line was making one element up.

                     In the cell it qualifies because that is `List`'s rule and it says why: "a
                     tone belongs to the thing it qualifies, and five hundred pixels away it belongs
                     to nothing". That is the column declaring `tone` where there is one, a
                     register's state, and the first value where there is not. At its head because
                     the rest of that cell truncates: a glyph after the text is a glyph the ellipsis
                     eats on exactly the narrow rows that needed it.

                     THE GUTTER IS RESERVED FOR THE COLUMN, NOT FOR THE ROW. Otherwise the toned rows
                     indent and the column's left edge goes ragged, which reads as five different
                     columns rather than one column with five marks in it.

                     AND THE CHILDREN TOUCH THE TAG, which is not a formatting preference. A line
                     break between `>` and the first child is a space inside the cell, so every
                     value in every table was drawn one space in from its own left edge and the
                     static mirror, which emits no such space, drew a different tree. Found by
                     giving `parity.test.ts` its first `comparison` shape. -->
                {#if c === glyphAt && row.tone}<span class="td-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}{@render cellBody(row, column, value)}</span>
            {/each}{#if acts}<span
                class="td td-acts"
                role="gridcell"
                tabindex={tabIndex(index, actsAt)}
                data-align="end"
                onkeydown={(e) => e.key === 'Enter' && e.target === e.currentTarget && e.currentTarget.querySelector<HTMLElement>('[data-row-action]')?.click()}
                ><Actions actions={rowActions} {row} onact={act} size="row" narrow={false} tabindex={at.row === index && at.col === actsAt ? 0 : -1} /></span
              >{/if}
{/snippet}

{#if windowed(rows.length)}{#await import('./RowsWindow.svelte') then m}<m.default {columns} {rows} {total} {cap} {label} {sort} bind:focus {selected} {menuHost} {onmenu} {onheadmenu} {onactivate} {onsort} {onmore} {cellSnippet} {href} {scope} {icon} {home} {now} {rowActions} {act} />{/await}{:else if rowsAsCards()}
<ul class="table-cards">
  {#each lines as line (line.kind === 'group' ? `\u0000${line.name}` : line.row.key)}
    {#if line.kind === 'group'}
      <!-- THE SAME HEADING ON A PHONE, over its group's cards. -->
      <li class="table-card-group"><span class="group-name">{line.name}</span>{#if counted}{' '}<span class="group-count">{line.count}</span>{/if}</li>
    {:else}
    {@const row = line.row}
    <li>
      <!-- AN ANCHOR OR A BUTTON, never a `div` with a click handler. A row that has somewhere to go
           is a link and gets the browser's whole contract — middle-click, copy the address, the
           status bar; one that is only activated is a button. Both carry a role without being told
           one, which a `svelte:element` with an `onclick` does not.

           AND NEITHER, WHEN THERE IS NOTHING TO ACTIVATE. `onactivate` is supplied by two call
           sites — the register grid and a saved view — and a declared page passes none, so every
           hrefless row on `/p/*` became a focusable, pressable no-op. Measured on `/p/money` at
           390: the opening-balance card, "What is liquid today", sitting among nine siblings that
           all navigate, is a button that does nothing when pressed. At 1440 the same row is a
           `div[role=row]` with `cursor: auto` and makes no promise at all, which is what this
           branch now matches. A row that cannot be activated is not a control. -->
      {#if row.href}
        <a class="table-card" href={hrefFor({ href }, row.href)} data-intent={row.tone} data-arrived={row.arrived ? '' : undefined}>
          {@render card(row)}
        </a>
      {:else if onactivate}
        <button type="button" class="table-card" data-intent={row.tone} data-arrived={row.arrived ? '' : undefined} onclick={() => onactivate(row)}>
          {@render card(row)}
        </button>
      {:else}
        <div class="table-card" data-intent={row.tone} data-arrived={row.arrived ? '' : undefined}>
          {@render card(row)}
        </div>
      {/if}
      <!-- BESIDE THE CARD AND NOT INSIDE IT, because a card can be a link or a button and a control inside one is a press
           that lands on both. On a phone the row's actions are its one menu button. -->
      {#if acts}<div class="table-card-acts"><Actions actions={rowActions} {row} onact={act} size="row" narrow /></div>{/if}
    </li>
    {/if}
  {/each}

  <!-- THE PHONE PAGES TOO, and this sentinel was deleted while the grid's was kept.

       It was added the day paging was built and removed the next, as collateral in a change about
       the CAP LINE — so `Table`'s own surviving comment (*"`cap` stays here, because its other job
       is deciding whether there is a sentinel to observe"*) was true of one body out of two. Not
       reachable from this repository today, because the one route that pages branches on
       `rowsAsCards()` itself and never asks this component for cards; reachable by the first caller
       that passes `onmore` and is read on a phone, which gets a list that stops at page one with
       nothing on screen saying so. That is the exact bug the deleted line was written for. -->
  {#if onmore && !(cap !== undefined && rows.length >= cap)}
    <li class="sentinel" aria-hidden="true"></li>
  {/if}
</ul>
{:else}
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-region" role="group" tabindex="0" aria-label={label ?? TABLE_ROWS_LABEL}>
  <div
    class="table"
    role="grid"
    bind:this={grid}
    data-toned={toned ? '' : undefined}
    aria-rowcount={total === undefined || total < 0 ? -1 : total + 1 + heads}
    aria-colcount={cols}
    style="--cols:{tracks}"
    tabindex="-1"
    {onkeydown}
    {onfocusin}
  >
    <div class="tr th-row" role="row" aria-rowindex="1">
      {#each columns as column}
        <span
          class="th"
          role="columnheader"
          aria-sort={headerSort(column)}
          data-align={column.align ?? 'start'}
          data-menu-host={onheadmenu && !column.hideLabel ? 'self' : undefined}
          {@attach headHeard(column.field)}
        >
          {#if headCells?.[column.field]}
            {@render headCells[column.field]!()}
          {:else if column.hideLabel}
            <span class="th-name">{column.label}</span>
          {:else if onsort}
            <button type="button" class="th-sort tap" onclick={() => onsort(column.field)}>{column.label}</button>
          {:else}{column.label}{/if}
        </span>
      {/each}
      {#if acts}<span class="th" role="columnheader" data-align="end"><span class="th-name">{ROW_ACTIONS_HEAD}</span></span>{/if}
    </div>

    {#each grouped.groups as group, g}
      <!-- contain-intrinsic-size is set from the row height so the scrollbar is honest before the
           rows in this group have ever been laid out. Every box is reserved: CLS <= 0.02. -->
      <div
        class="rowgroup"
        role="rowgroup"
        style={intrinsicRows(group.length)}
      >
        {#if heads === 0}
          <!-- A TABLE WITH NO GROUP HEADINGS IS KEYED BY ITS ROWS, so a row added or archived arrives and leaves with the
               host's list motion and the rows beside it close the gap (`rowin`, `rowout`, `settle`). -->
          {#each group as line, i (keyOf(line))}
            {@const row = rowOf(line)}
            {@const index = line.kind === 'row' ? line.at : -1}
            <div
              class="tr"
              role="row"
              aria-rowindex={g * grouped.step + i + 2}
              aria-selected={selected ? selected.has(row.key) : undefined}
              data-menu-host={onmenu ? 'self' : menuHost?.(row.key)}
              {@attach onmenu && pointed((p) => onmenu(row.key, p))}
              data-intent={row.tone}
              data-focused={focus?.row === index ? '' : undefined}
              data-arrived={row.arrived ? '' : undefined}
              in:rowIn
              out:rowOut
              animate:flip={settled()}
            >{@render cellsOf(row, index)}</div>
          {/each}
        {:else}
        {#each group as line, i}
          {#if line.kind === 'group'}
            <!-- A GROUP'S HEADING, ONE CELL ACROSS THE COLUMNS: its name and, where the table holds all its rows, its
                 count. Not in the caret's walk, which is the rows'; `groupHead` in `../../src/html.ts` is its mirror. -->
            <div class="tr tr-group" role="row" aria-rowindex={g * grouped.step + i + 2}><span class="td" role="gridcell" aria-colspan={cols} style="grid-column:1/-1"><span class="group-name">{line.name}</span>{#if counted}{' '}<span class="group-count">{line.count}</span>{/if}</span></div>
          {:else}
          {@const row = line.row}
          {@const index = line.at}
          <!-- `data-focused` IS THE HOST'S CARET, and deliberately not the internal one. A caller
               that binds `focus` is drawing a caret line down its list and this marks it; a caller
               that binds nothing never drew one, and marking row 0 of every `comparison` block on
               every page would be a highlight nobody asked for on a row nobody chose. The roving
               tab stop moves either way; only the paint belongs to the host.

               THE ROW'S OWN ACTIONS ARE ITS LAST CELL, after the declared ones and touching them. The cell is in the
               caret's walk, Enter on it presses the first, and its controls take the tab stop only on the caret's row,
               so the grid is still one stop and not two a row. -->
          <div
            class="tr"
            role="row"
            aria-rowindex={g * grouped.step + i + 2}
            aria-selected={selected ? selected.has(row.key) : undefined}
            data-menu-host={onmenu ? 'self' : menuHost?.(row.key)}
              {@attach onmenu && pointed((p) => onmenu(row.key, p))}
            data-intent={row.tone}
            data-focused={focus?.row === index ? '' : undefined}
            data-arrived={row.arrived ? '' : undefined}
          >{@render cellsOf(row, index)}</div>
          {/if}
        {/each}
        {/if}
      </div>
    {/each}

    {#if onmore && !(cap !== undefined && rows.length >= cap)}
      <div class="sentinel" aria-hidden="true"></div>
    {/if}
  </div>
</div>

{/if}

<!-- THE CAP LINE IS THE HOST'S, NOT THIS COMPONENT'S.

     Past ROWS_WINDOW_FROM rows (120, `../../src/rows-window.ts`) the table is drawn through
     `RowsWindow.svelte`, which builds the rows on screen between two spacers that keep the scrollbar
     the whole list's length; find-in-page then reaches the drawn rows alone, which is why the window
     starts at 120 and not at one. This component used to draw that sentence from its own `total`
     prop — which is `aria-rowcount`, and `aria-rowcount` is deliberately `-1` while a filtered list
     is still paging, so `2000 < -1` was false and the line disappeared in exactly the state it was
     written for. A cap line is about the LIST; the host has the answer's real size and draws one for
     whichever body it rendered. `cap` stays here, because its other job is deciding whether there is
     a sentinel to observe. -->

<style>
  /**
   * THE KEYBOARD'S PLACE IS ONE RING, ON THE CELL. The row and its cell each drew a
   * 2px ring, one inside the other, so the caret looked doubled. The focused cell takes the ring, inset so the next cell
   * never covers it, and the caret's row takes the hover wash and nothing louder. GLOBAL, as every rule here is, so no
   * scoping class lands on a cell `toHTML` draws too (the two renderers draw one tree, `parity.test.ts`).
   */
  :global(.table-region:focus-within .tr[data-focused]) {
    /* focus-ok: the focused cell inside the row wears the ring (`.td:focus-visible` below). */
    outline: none;
  }

  :global(.rowgroup .tr[data-focused]) {
    background: var(--hover);
  }

  :global(.table .td:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  /**
   * A HEADER THAT SORTS SAYS SO BEFORE IT IS USED: a quiet "↕" after its name under the pointer or the keyboard, and the
   * hover wash round it, over `--d-state`. A sorted column keeps its own arrow (`blocks.css`), so the hint is only on the
   * others.
   */
  :global(.th .th-sort) {
    margin-inline: calc(-1 * var(--sp-1));
    padding-inline: var(--sp-1);
    border-radius: var(--r-xs);
    transition: background var(--d-state) var(--ease-out);
  }

  :global(.th .th-sort:is(:hover, :focus-visible)) {
    background: var(--hover);
  }

  :global(.th:not([aria-sort='ascending'], [aria-sort='descending']) .th-sort:is(:hover, :focus-visible)::after) {
    content: ' ↕';
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* A CARD WITH ITS ROW'S ACTIONS keeps the card's width and puts the one menu button at its end, centred on it. Global, so no scoping
     class lands on a card `toHTML` draws too. */
  :global(.table-cards > li:has(> .table-card-acts)) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  :global(.table-cards > li:has(> .table-card-acts) > .table-card) {
    flex: 1;
    min-inline-size: 0;
  }

  :global(.table-cards > li > .table-card-acts) {
    flex: none;
  }

  /* A ROW'S ONE ACTION, SHOWN ON A PHONE (`rowActionsPlan`), goes under the card's words rather than beside them, so a
     label such as "Mark as a subscription" never squeezes the title into a column. */
  :global(.table-cards > li:has(> .table-card-acts > .actions:not([data-fold]))) {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }

  :global(.table-cards > li > .table-card-acts:has(> .actions:not([data-fold]))) {
    padding: 0 var(--sp-1) var(--sp-2);
  }

  /* AT THE START OF THE LINE, UNDER THE TITLE, AND TOLD AS A PRESS BY ITS FILL: quiet grey words at the far edge of a
     line of their own read as a note, not a button. */
  :global(.table-cards > li > .table-card-acts > .actions:not([data-fold])) {
    justify-content: flex-start;
  }

  :global(.table-cards > li > .table-card-acts > .actions:not([data-fold]) .actions-btn) {
    background: var(--tile-2);
    color: var(--ink);
  }

  @layer components {
    /* WHERE A ROW APPLIES: a column `as: scope`, drawn here and in `RowsWindow.svelte` (only ever loaded by this file),
       the render package's twin of `lib/ui/ScopeChip.svelte`. The project's mark in its own hue or the globe, then the
       name, and nothing round them (a category is its small coloured mark and its name, not a chip). HERE AND NOT IN
       `blocks.css` (speed4, 2 Nov), so the sheet every screen waits on does not carry them; in the same layer it was in,
       so what overrides it still does. Global, so no scoping class lands on a chip `toHTML` draws too. */
    :global(.scope-chip) {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      min-inline-size: 0;
      max-inline-size: 100%;
      min-block-size: var(--ctl-h-sm);
      color: var(--ink-2);
      font-size: var(--fs-meta);
      font-weight: 500;
      line-height: var(--lh-tight);
      vertical-align: middle;
    }

    :global(.scope-glyph) {
      flex: none;
      inline-size: var(--icon-s);
      block-size: var(--icon-s);
    }

    :global(.scope-mark) {
      flex: none;
      color: oklch(var(--mark-l) var(--mark-c) var(--hue));
    }

    /* A PROJECT'S MARK IN A SCOPE CHIP IS ITS SLOT'S COLOUR (domains lane, 2 Nov), the colour its well and its dot wear. */
    :global(.scope-mark[data-slot='blue']) { color: var(--cat-blue); }
    :global(.scope-mark[data-slot='violet']) { color: var(--cat-violet); }
    :global(.scope-mark[data-slot='pink']) { color: var(--cat-pink); }
    :global(.scope-mark[data-slot='teal']) { color: var(--cat-teal); }
    :global(.scope-mark[data-slot='sky']) { color: var(--cat-sky); }
    :global(.scope-mark[data-slot='yellow']) { color: var(--cat-yellow); }
    :global(.scope-mark[data-slot='lime']) { color: var(--cat-lime); }
    :global(.scope-mark[data-slot='slate']) { color: var(--cat-slate); }

    :global(.scope-name) {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
