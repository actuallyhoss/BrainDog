<!--
  `RowsWindow` — `Table` for a long list: the same props, the same cell body, the same grid and the same phone cards,
  but only the rows on screen are built. The rest of the height is two spacers, so the scrollbar is as long as
  the whole list, and a sentinel past the last row asks the host for more (`onmore`), as `Table`'s does.

  WHAT IT KEEPS OF `Table`. One tab stop and the arrows (`moveCell`), walking every row of the list and not only the
  drawn ones: a caret moved onto a row not yet drawn scrolls it in first (`revealTop`) and focuses it once it is there.
  `aria-rowcount` is the whole list's and each row's `aria-rowindex` is its own place in it, so a screen reader says
  "row 1,204 of 2,528" on the row that is there. A phone card says its place too (`aria-posinset`, `aria-setsize`).

  WHAT IT GIVES UP, and why only past `ROWS_WINDOW_FROM`: find-in-page reaches the drawn rows alone. Under that count a
  host draws `Table`, which builds every row. The window is computed in `../../src/rows-window.ts`, which a test holds.
-->
<script lang="ts">
  import { rowsAsCards } from '../rows-as-cards.svelte.ts';
  import { tick, untrack, type Snippet } from 'svelte';
  import { TONES, hrefFor, markOf, type RenderOptions } from '../../src/index.ts';
  import { markGlyphOf } from '../../src/cards.ts';
  import { slotOf } from '../../src/slot.ts';
  import { glyphPath } from '../../src/inline.ts';
  import { ariaSort, cardCells, cardPlan, moveCell, type CardCell, type Cell, type Column, type TableRow } from '../types.ts';
  import { glyphColumn, cellIn, tableCellBody, TABLE_ROWS_LABEL } from '../../src/table.ts';
  import { MISSING } from '../../src/format.ts';
  import { rowGroup, tableLines } from '../../src/html.ts';
  import { AMOUNT_SPACE } from '../../src/money.ts';
  import { WORKING_GLYPH, WORKING_LABEL } from '../../src/working.ts';
  import { ROW_ACTIONS_HEAD, rowActionsTrack, type OnAct } from '../../src/actions.ts';
  import { revealTop, windowOf, ROW_PX, ROWS_OVERSCAN } from '../../src/rows-window.ts';
  import Actions from '../Actions.svelte';
  import { pointed, type Point } from '../menu-at.ts';

  /** `Table`'s own shape for a scope cell, written out here for the reason it is written out there. */
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
    onheadmenu,
    onmenu,
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
    rowPx = ROW_PX,
    overscan = ROWS_OVERSCAN,
    screen = 1000,
  }: {
    columns: readonly Column[];
    rows: readonly TableRow[];
    /** The data rows in all, `-1` while unknown, as `Table` takes it; the grid's count adds its header and headings. */
    total?: number | undefined;
    cap?: number | undefined;
    label?: string | undefined;
    sort?: { field: string; dir: 'asc' | 'desc' } | undefined;
    focus?: { row: number; col: number } | undefined;
    selected?: Set<string> | undefined;
    /** A row's `data-menu-host`, so a right-click on it opens its "…" (or, by selector, another menu); absent, none. */
    menuHost?: ((key: string) => string) | undefined;
    onheadmenu?: ((field: string, point: { x: number; y: number; height: number; back: HTMLElement | null }) => unknown) | undefined;
    /** A row's menu where it is right-clicked or held (`Table`'s). */
    onmenu?: ((key: string, point: Point) => unknown) | undefined;
    onactivate?: ((row: TableRow) => void) | undefined;
    onsort?: ((field: string) => void) | undefined;
    onmore?: (() => void) | undefined;
    cellSnippet?: Snippet<[TableRow, Column, string | null]> | undefined;
    href?: RenderOptions['href'];
    scope?: ScopeCells | undefined;
    icon?: RenderOptions['icon'];
    home?: RenderOptions['home'];
    /** The reader's clock (`RenderOptions.now`): a day in its year is said without the year. */
    now?: number | undefined;
    rowActions?: readonly unknown[] | null | undefined;
    act?: OnAct | undefined;
    /** A row's height before one is measured; the drawn rows' own pitch replaces it once they are on screen. */
    rowPx?: number | undefined;
    overscan?: number | undefined;
    /** The screen's height before one is measured: what a server draws, and the first paint draws. */
    screen?: number | undefined;
  } = $props();

  const acts = $derived(act !== undefined && Array.isArray(rowActions) && rowActions.length > 0);
  const actsAt = $derived(columns.length);
  const cols = $derived(columns.length + (acts ? 1 : 0));
  const markArt = (glyph: string): string | null => glyphPath(glyph, icon ? { icon } : {});
  const scoped = $derived(new Set((scope?.columns ?? []).map((i) => columns[i]?.field).filter((f): f is string => f !== undefined)));
  const template = $derived(columns.map((c) => c.width).join(' ') + (acts ? ` ${rowActionsTrack(rowActions)}` : ''));

  /* THE LINES AS `Table` DRAWS THEM: each group under its heading, a heading being a line of the grid. The window is
     cut from the lines, so a heading takes its place in the height like any row. */
  const lines = $derived(tableLines(rows, rowGroup));
  const ariaAt = $derived(lines.flatMap((l, n) => (l.kind === 'row' ? [n + 2] : [])));
  const atOfAria = $derived(new Map(ariaAt.map((aria, at) => [aria, at])));
  const heads = $derived(lines.length - rows.length);
  const counted = $derived(total === rows.length);
  const toned = $derived(rows.some((r) => r.tone));
  const glyphAt = $derived(glyphColumn(columns));
  const plan = $derived(cardPlan(columns));
  const capped = $derived(cap !== undefined && rows.length >= cap);
  const setsize = $derived(total === undefined || total < 0 ? -1 : total);

  /* WHERE THE SCREEN IS OVER THE LINES, measured from the live page; before it is, the first `screen` pixels. */
  let view = $state({ top: 0, height: 0 });
  /* THE SAME TOP, SIGNED: below zero while the table starts below the top of the screen. The window is cut from `view`,
     which holds it at zero so a scroll above the table draws nothing again; a caret's scroll needs the real distance. */
  let exact = 0;
  let pitch = $state(0);
  const px = $derived(pitch > 0 ? pitch : rowPx);
  const win = $derived(windowOf({ count: lines.length, rowPx: px, top: view.top, height: view.height || screen, overscan }));
  const onScreen = $derived(lines.slice(win.from, win.to).map((line, i) => ({ line, n: win.from + i })));

  let caret = $state<Cell>({ row: 0, col: 0 });
  const at = $derived(focus ?? caret);
  /** The line a row of the walk stands on: its `aria-rowindex` less the header's one and the first index's one. */
  const lineOf = (row: number): number => (ariaAt[row] ?? row + 2) - 2;
  /* THE ROW THAT HOLDS THE ONE TAB STOP: the caret's while it is drawn, else the first drawn row, so the grid is never
     left with no stop at all because the caret's row scrolled away. Entering it moves the caret there. */
  const stopRow = $derived.by(() => {
    const line = lineOf(at.row);
    if (line >= win.from && line < win.to) return at.row;
    const first = onScreen.find((d) => d.line.kind === 'row')?.line;
    return first?.kind === 'row' ? first.at : at.row;
  });
  const tabIndex = (r: number, c: number) => (stopRow === r && at.col === c ? 0 : -1);
  const headHeard = (field: string) => (node: HTMLElement) => {
    const on = (e: Event) => {
      e.preventDefault();
      onheadmenu?.(field, (e as CustomEvent<{ x: number; y: number; height: number; back: HTMLElement | null }>).detail);
    };
    node.addEventListener('menuat', on);
    return () => node.removeEventListener('menuat', on);
  };
  const headerSort = (column: Column) => ariaSort(column, sort, onsort !== undefined);

  let grid = $state<HTMLElement | undefined>(undefined);
  let body = $state<HTMLElement | undefined>(undefined);
  let scroller: HTMLElement | null = null;
  /* SET WHILE FOCUS IS PARKED ON THE GRID because the focused row scrolled out of the window: entering the grid then is
     not a reader arriving, and is not forwarded to a cell. */
  let parked = false;

  const cellAt = (c: Cell): HTMLElement | null =>
    (grid?.querySelector(`.tr[aria-rowindex="${ariaAt[c.row] ?? c.row + 2}"]`)?.children[c.col] as HTMLElement | undefined) ?? null;

  /* THE SCROLLER IS THE APP'S `#main` where there is one (`+layout.svelte` makes it the one scroll container, so the
     window never scrolls: the register's sentinel learnt that by measurement), else the nearest ancestor that scrolls,
     else the window. */
  function scrollerOf(el: HTMLElement): HTMLElement | null {
    const main = el.closest<HTMLElement>('#main');
    if (main) return main;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const y = getComputedStyle(p).overflowY;
      if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  }

  /** Where the screen stands over the lines, read from the page: how far the first line is above its top, and its height. */
  function measure() {
    if (!body) return;
    const edge = scroller ? scroller.getBoundingClientRect().top : 0;
    const height = scroller ? scroller.clientHeight : window.innerHeight;
    exact = edge - body.getBoundingClientRect().top;
    const next = { top: Math.max(0, exact), height };
    park(windowOf({ count: lines.length, rowPx: px, top: next.top, height: next.height || screen, overscan }));
    if (next.top !== view.top || next.height !== view.height) view = next;
  }

  /* A FOCUSED ROW ABOUT TO LEAVE THE WINDOW hands focus to the grid, or the cards' list, before it goes, so focus is not
     dropped on the page with it. The arrows go on from the caret, and the first one scrolls its row back. */
  function park(next: { from: number; to: number }) {
    const active = document.activeElement;
    if (!body || !(active instanceof HTMLElement) || !body.contains(active)) return;
    const line = Number(active.closest('[data-line]')?.getAttribute('data-line') ?? Number.NaN);
    if (!Number.isInteger(line) || (line >= next.from && line < next.to)) return;
    parked = true;
    (rowsAsCards() ? body : grid)?.focus({ preventScroll: true });
  }

  /* THE LINES' OWN PITCH, first drawn to last, so a density or a card's height is what the spacers are cut by. Once a
     mount and again on a resize, never on every scroll: a pitch that moved with the window would move every row above it. */
  function measurePitch() {
    if (!body) return;
    const items = body.querySelectorAll<HTMLElement>(':scope > [data-line]');
    const first = items[0]?.getBoundingClientRect();
    const last = items[items.length - 1]?.getBoundingClientRect();
    if (!first || !last) return;
    const got = items.length > 1 ? (last.top - first.top) / (items.length - 1) : first.height;
    if (got > 0) pitch = got;
  }

  /* THE SCREEN IS READ FROM THE SCROLLER at most once a frame, and again when the window is resized. */
  $effect(() => {
    if (!body) return;
    void rowsAsCards();
    scroller = scrollerOf(body);
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    const onscroll = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), measure()));
    };
    const onresize = () => ((pitch = 0), onscroll());
    target.addEventListener('scroll', onscroll, { passive: true });
    window.addEventListener('resize', onresize);
    untrack(measure);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onscroll);
      window.removeEventListener('resize', onresize);
    };
  });

  $effect(() => {
    void onScreen;
    if (pitch === 0) untrack(measurePitch);
  });

  /* THE SENTINEL ASKS FOR MORE as it nears the screen, watched from the scroller and watched afresh whenever rows arrive,
     so a page too short to push it away asks again rather than stopping at one. */
  let sentinel = $state<HTMLElement | undefined>(undefined);
  $effect(() => {
    void rows.length;
    if (!sentinel || !onmore) return;
    const more = onmore;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && more(), { root: scroller, rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  /** The arrows, `Home` and `End`, as `Table` takes them, over every row of the list. */
  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const to = moveCell(at, e.key, rows.length, cols);
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    caret = to;
    if (focus) focus = to;
    void reveal(to);
  }

  /* THE CARET'S ROW ONTO THE SCREEN, THEN ITS CELL FOCUSED: at once where it is drawn, and after the scroll has moved the
     window over it where it is not. */
  async function reveal(c: Cell) {
    const to = revealTop({ index: lineOf(c.row), rowPx: px, top: exact, height: view.height || screen });
    if (to !== null) {
      const by = to - exact;
      if (scroller) scroller.scrollTop += by;
      else window.scrollBy(0, by);
      measure();
      await tick();
    }
    parked = false;
    cellAt(c)?.focus({ preventScroll: to !== null });
  }

  /* `Table`'s `focusin`, with the stop's row standing in for the caret's when the caret's is not drawn. */
  function onfocusin(e: FocusEvent) {
    if (e.target === grid) {
      if (!parked) cellAt({ row: stopRow, col: at.col })?.focus();
      return;
    }
    parked = false;
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

<!-- `Table`'s SCOPE CHIP, CELL BODY AND CARD, the same markup, so a table drawn through the window reads as one drawn without. -->
{#snippet scopeChip(cells: ScopeCells, said: string)}{@const everywhere = said === cells.everywhere}{@const m = everywhere ? undefined : cells.marks.get(said)}<span class="scope-chip" data-everywhere={everywhere ? '' : undefined}>{#if everywhere && cells.glyph}<svg class="scope-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={cells.glyph} /></svg>{:else if m?.mark}{@const sm = markOf(m.mark, said)}{@const sg = markGlyphOf(sm)}{#if sm}<span class="scope-mark" data-glyph={sg ?? undefined} style={m.hue === null ? undefined : `--hue:${m.hue}`} data-slot={m.hue === null ? undefined : slotOf(m.hue)} aria-hidden="true">{#if sg}{@const d = markArt(sg)}{#if d}<svg class="scope-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path {d} /></svg>{/if}{:else}{sm}{/if}</span>{/if}{/if}<span class="scope-name">{said}</span></span>{/snippet}

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

<!-- ONE BODY AT A TIME, as `Table` draws it, and each a window: the spacers stand for the lines not built. -->
{#if rowsAsCards()}
<ul class="table-cards rw-cards" bind:this={body} tabindex="-1" aria-label={label ?? TABLE_ROWS_LABEL}>
  {#if win.before > 0}<li class="rw-spacer" aria-hidden="true" style="block-size:{win.before}px"></li>{/if}
  {#each onScreen as { line, n } (line.kind === 'group' ? `\u0000${line.name}` : line.row.key)}
    {#if line.kind === 'group'}
      <li class="table-card-group" data-line={n}><span class="group-name">{line.name}</span>{#if counted}{' '}<span class="group-count">{line.count}</span>{/if}</li>
    {:else}
    {@const row = line.row}
    <li data-line={n} aria-posinset={line.at + 1} aria-setsize={setsize}>
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
      {#if acts}<div class="table-card-acts"><Actions actions={rowActions} {row} onact={act} size="row" narrow /></div>{/if}
    </li>
    {/if}
  {/each}
  {#if win.after > 0}<li class="rw-spacer" aria-hidden="true" style="block-size:{win.after}px"></li>{/if}
  {#if onmore && !capped}<li class="sentinel" aria-hidden="true" bind:this={sentinel}></li>{/if}
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
    style="--cols:{template}"
    tabindex="-1"
    {onkeydown}
    {onfocusin}
  >
    <div class="tr th-row" role="row" aria-rowindex="1">
      {#each columns as column}
        <span class="th" role="columnheader" aria-sort={headerSort(column)} data-align={column.align ?? 'start'} data-menu-host={onheadmenu && !column.hideLabel ? 'self' : undefined} {@attach headHeard(column.field)}>
          {#if column.hideLabel}
            <span class="th-name">{column.label}</span>
          {:else if onsort}
            <button type="button" class="th-sort tap" onclick={() => onsort(column.field)}>{column.label}</button>
          {:else}{column.label}{/if}
        </span>
      {/each}
      {#if acts}<span class="th" role="columnheader" data-align="end"><span class="th-name">{ROW_ACTIONS_HEAD}</span></span>{/if}
    </div>

    <div class="rowgroup rw-body" role="rowgroup" bind:this={body}>
      {#if win.before > 0}<div class="rw-spacer" aria-hidden="true" style="block-size:{win.before}px"></div>{/if}
      {#each onScreen as { line, n } (line.kind === 'group' ? `\u0000${line.name}` : line.row.key)}
        {#if line.kind === 'group'}
          <div class="tr tr-group" role="row" aria-rowindex={n + 2} data-line={n}><span class="td" role="gridcell" aria-colspan={cols} style="grid-column:1/-1"><span class="group-name">{line.name}</span>{#if counted}{' '}<span class="group-count">{line.count}</span>{/if}</span></div>
        {:else}
        {@const row = line.row}
        {@const index = line.at}
        <div
          class="tr"
          role="row"
          aria-rowindex={n + 2}
          aria-selected={selected ? selected.has(row.key) : undefined}
          data-menu-host={onmenu ? 'self' : menuHost?.(row.key)}
          data-menu-thing={row.href ?? undefined}
          {@attach onmenu && pointed((p) => onmenu(row.key, p))}
          data-line={n}
          data-intent={row.tone}
          data-focused={focus?.row === index ? '' : undefined}
          data-arrived={row.arrived ? '' : undefined}
        >
          {#each columns as column, c}
            {@const value = row.cells[c] ?? null}
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
            >{#if c === glyphAt && row.tone}<span class="td-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}{@render cellBody(row, column, value)}</span>
          {/each}{#if acts}<span
              class="td td-acts"
              role="gridcell"
              tabindex={tabIndex(index, actsAt)}
              data-align="end"
              onkeydown={(e) => e.key === 'Enter' && e.target === e.currentTarget && e.currentTarget.querySelector<HTMLElement>('[data-row-action]')?.click()}
              ><Actions actions={rowActions} {row} onact={act} size="row" narrow={false} tabindex={stopRow === index && at.col === actsAt ? 0 : -1} /></span
            >{/if}
        </div>
        {/if}
      {/each}
      {#if win.after > 0}<div class="rw-spacer" aria-hidden="true" style="block-size:{win.after}px"></div>{/if}
    </div>

    {#if onmore && !capped}
      <div class="sentinel" aria-hidden="true" bind:this={sentinel}></div>
    {/if}
  </div>
</div>
{/if}

<style>
  /* THE WINDOW'S BODY IS ALWAYS LAID OUT. `.rowgroup`'s `content-visibility: auto` is `Table`'s answer to building every
     row; here only a screenful is built, and a body skipped while off screen would report no height, so the spacers
     would stop holding the scrollbar to the list's length. */
  .rowgroup.rw-body {
    content-visibility: visible;
  }

  .rw-spacer {
    display: block;
    inline-size: 100%;
    list-style: none;
  }
</style>
