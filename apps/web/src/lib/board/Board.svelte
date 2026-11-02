<!--
  A BOARD OF WIDGETS (the widgets plan of 29 October, §3.2 and §5): Today first.

  THE GRID: four columns on a laptop and from 720px, two on a phone; a row unit of about half a column (a phone's is a
  column, so a small is square); the gap the tiles keep. Each widget is placed in its cells by the packer (`pack.ts`),
  read by the reader through `placeOf`, so the board and the page's blocks are one grid and the document is written in
  the order the board is read.

  EDITING: press and hold a widget, or Edit; the bar over the board (Add widget, Undo, Redo, the phone's board on a
  laptop, the list, Cancel, Done), each widget's cover with its handles (`EditCover.svelte`), and the tray under the
  board the hidden ones wait in. ⌘Z and ⌘⇧Z step back and on; Esc leaves without writing. Every move is said in the live
  region. The children are the reader; the board only lays it out.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { SIZE_WORDS, type WidgetSize } from 'braindog-render';

  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { page } from '$app/state';
  import { boardWords, type BoardModel } from './board.svelte.ts';
  import { WIDGETS_PARAM } from './sheet-address.ts';
  import { todayOffer } from './offer.svelte.ts';
  import { fitBoard } from './fit.ts';
  import { calm, ms, play, still as lessMotion } from '$lib/motion';

  /* THE SHEET AND THE SUGGESTION ARE FETCHED WHEN ASKED FOR, not with Today: the catalogue, its previews and the
     compose step are the sheet's, and Today draws without them (the bundle gate's first-load row). */
  const sheetPart = () => import('./WidgetSheet.svelte');
  const suggestPart = () => import('./SuggestCell.svelte');

  let {
    model,
    children,
    mayEdit,
    ondone,
    onadd,
    onremove,
    onmake,
    widgets = [],
    loading = false,
  }: {
    model: BoardModel;
    children: Snippet;
    /** Whether this reader may arrange the board: the owner. */
    mayEdit: boolean;
    /** Done: write what the editor made. */
    ondone: () => void;
    /** A widget the sheet added: the screen writes it at once (`add-today.ts`) and reads the board again. */
    onadd?: ((block: Record<string, unknown>, size: WidgetSize) => unknown) | undefined;
    /** A widget Slash suggests taking off (it stayed empty), by its key. */
    onremove?: ((key: string) => unknown) | undefined;
    /** Make your own (W4): the sheet's draft, from what he said, landed on the board as a draft. */
    onmake?: ((draft: { block: Record<string, unknown>; size: WidgetSize; said: string }) => unknown) | undefined;
    /** The board's widgets as drawn (key, heading, source, where, empty), so the sheet does not offer what is on it. */
    widgets?: readonly Record<string, unknown>[];
    /** Whether the screen is still waiting for the record's own answer (a copy or this tab's memory drawn meanwhile). */
    loading?: boolean;
  } = $props();

  /* THE BOARD HOLDS ITS CELLS WHILE IT LOADS (live check of 30 October, item 8): every widget drawn keeps its cell
     (`holdCells`) until the record's own answer is in and nothing has changed for `SETTLE_MS`; then what is drawn is what
     takes a cell (`settle`). Nothing slides meanwhile: the board is marked still (`data-still`), which the page's
     recomposition reads (`recompose.ts`), and stays so a frame past the settling, so its last packing is not played. */
  const SETTLE_MS = 1200;
  $effect(() => {
    void model.shown;
    untrack(() => model.holdCells());
  });
  $effect(() => {
    if (!model.settling) return;
    void model.shown;
    if (loading) return;
    const t = setTimeout(() => model.settle(), SETTLE_MS);
    return () => clearTimeout(t);
  });
  /* AND NEVER LONGER THAN `SETTLE_MOST_MS`, whatever the screen still waits for. */
  const SETTLE_MOST_MS = 10_000;
  onMount(() => {
    const t = setTimeout(() => model.settle(), SETTLE_MOST_MS);
    return () => clearTimeout(t);
  });
  let still = $state(true);
  $effect(() => {
    if (model.settling) {
      still = true;
      return;
    }
    let on = true;
    requestAnimationFrame(() => requestAnimationFrame(() => on && (still = false)));
    return () => (on = false);
  });

  /* A WIDGET THAT COMES ONTO A BOARD ALREADY OPEN ARRIVES (UI pass 1 Nov). On a first Today the first thing told adds
     Money this week and People to the board, and while the board settles (`data-still`, which keeps the page's own
     recomposition off it) they were simply there in one frame. Each widget the board had not drawn before now rises
     10px and fades in on the record's spring, 40ms after the one before and the fourth and on together. What a screen
     draws as it opens (`calm`) is still, as is everything under reduced motion; and one the page's recomposition is
     already playing is left to it, so nothing is played twice. */
  let drawnKeys: Set<string> | null = null;
  $effect(() => {
    void model.shown;
    const root = el;
    if (!root) return;
    let frame = requestAnimationFrame(() => {
      frame = 0;
      const tiles = [...root.querySelectorAll<HTMLElement>('[data-board-key]')];
      const was = drawnKeys;
      drawnKeys = new Set(tiles.map((t) => t.dataset.boardKey!));
      if (was === null || calm() || lessMotion() || model.editing) return;
      tiles
        .filter((t) => !was.has(t.dataset.boardKey!) && t.getAnimations().length === 0)
        .forEach((t, i) => {
          play(t, { opacity: [0, 1], transform: ['translateY(10px) scale(0.97)', 'none'] }, { duration: ms('--form-in', 320), delay: Math.min(i, 3) * 40, fill: 'backwards' });
        });
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  });

  /* FOUR COLUMNS FROM 720px, TWO UNDER IT (§3.2). */
  const four = new MediaQuery('(width >= 720px)', true);
  $effect(() => {
    model.cols = four.current ? 4 : 2;
  });

  let el = $state<HTMLElement | null>(null);
  $effect(() => {
    model.el = el;
  });

  /* EVERY WIDGET'S CONTENT FITS ITS FRAME (`fit.ts`): measured once a frame after the board or its content changes. */
  $effect(() => {
    const node = el;
    if (!node) return;
    let frame = 0;
    const fit = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitBoard(node);
      });
    };
    const sized = new ResizeObserver(fit);
    sized.observe(node);
    const changed = new MutationObserver(fit);
    changed.observe(node, { childList: true, subtree: true, characterData: true });
    fit();
    return () => {
      sized.disconnect();
      changed.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  });
  $effect(() => {
    void model.packed;
    if (el) requestAnimationFrame(() => el && fitBoard(el));
  });

  let sheetOpen = $state(false);
  /* HELD ONCE ASKED FOR, by the button or by the address (`?widgets`), so closing it keeps what it read. */
  let sheetHeld = $state(false);
  $effect(() => {
    if (sheetOpen || page.url.searchParams.has(WIDGETS_PARAM)) sheetHeld = true;
  });
  let kept = $state<ReturnType<BoardModel['keptDraft']>>(null);

  /* A DRAFT A CLOSED TAB LEFT (§5.5): offered once, Keep editing or Throw it away. */
  onMount(() => {
    if (mayEdit) kept = model.keptDraft();
  });

  /* THE MODE'S KEYS: ⌘Z, ⌘⇧Z, Esc; and E opens it from the board at rest. */
  function keys(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = t?.closest('input, textarea, select, [contenteditable="true"]');
    if (model.editing) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) model.redo();
        else model.undo();
        return;
      }
      if (e.key === 'Escape' && model.held === null && !sheetOpen && model.inspected === null && !document.querySelector('[role="dialog"][open], dialog[open]')) {
        e.preventDefault();
        model.cancel();
      }
      return;
    }
    if (!typing && mayEdit && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'e' && t?.closest('[data-board-root]')) {
      e.preventDefault();
      model.enter();
    }
  }

  /* THE PAGE HOLDS STILL WHILE A WIDGET IS DRAGGED UNDER A THUMB. */
  $effect(() => {
    if (!model.editing) return;
    const stop = (e: Event) => {
      if (model.held !== null && model.heldBy === 'pointer') e.preventDefault();
    };
    addEventListener('touchmove', stop, { passive: false });
    return () => removeEventListener('touchmove', stop);
  });

  /* THE KEYS AS THIS DEVICE SAYS THEM, by the same test as `Kbd` and so the toasts: ⌘ on a Mac, Ctrl elsewhere. The
     edit bar is only drawn in the browser, so this is asked where the answer is. */
  const mac = typeof navigator !== 'undefined' && /mac/i.test((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '');
  const mod = mac ? '⌘' : 'Ctrl+';
  const shift = mac ? '⇧' : 'Shift+';

  const cols = $derived(model.onPhone ? 2 : 4);
  const rows = $derived(model.packed.rows);
  const listed = $derived(model.keys);

  /* A WIDGET FROM THE SHEET GOES ON AT ONCE, with its Undo (§5.6): written by the screen, and drawn where the board ends. */
  async function added(got: { block: Record<string, unknown>; size: WidgetSize }): Promise<void> {
    await onadd?.(got.block, got.size);
  }
  /*
   * FOCUS FOLLOWS THE EDIT (skills pass, accessibility-review, 2 Nov): Edit Today is gone the moment it is pressed, and
   * focus fell to the page, so a keyboard started again from the top; leaving, the bar went and the same happened.
   * Entering, focus goes to the bar's first control (Add widget); leaving, back to Edit Today. Only where focus was lost
   * to the page or sat in what is going: a press elsewhere keeps its own.
   */
  let bar = $state<HTMLElement | undefined>(undefined);
  let wasEditing: boolean | null = null;
  $effect(() => {
    const now = model.editing;
    const was = wasEditing;
    wasEditing = now;
    if (was === null || was === now) return;
    const lost = () => {
      const a = document.activeElement;
      return !a || a === document.body || !a.isConnected || (bar !== undefined && bar.contains(a));
    };
    void tick().then(() => {
      if (now) {
        if (lost()) bar?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
      } else if (lost()) {
        document.querySelector<HTMLElement>('.board-foot button')?.focus();
      }
    });
  });
</script>

<svelte:window onkeydown={keys} />

<div class="board-root" data-board-root data-still={still && !model.editing ? '' : undefined} data-editing={model.editing ? '' : undefined} data-phone-view={model.phoneView ? '' : undefined}>
  {#if kept && !model.editing}
    <div class="draft-left" role="status">
      <span>{boardWords.draftLeft}</span>
      <Button weight="primary" size="sm" onclick={() => (model.resume(kept!), (kept = null))}>{boardWords.keepEditing}</Button>
      <Button weight="quiet" size="sm" onclick={() => (model.dropDraft(), (kept = null))}>{boardWords.throwAway}</Button>
    </div>
  {/if}

  {#if model.editing}
    <!-- THE EDIT BAR (§5.1), sticky over the board while it is edited. -->
    <div class="edit-bar" role="toolbar" aria-label={boardWords.editToday} bind:this={bar}>
      <Button weight="quiet" size="sm" onclick={() => (sheetOpen = true)} aria-label={boardWords.addWidget}><Icon name="plus" size="s" /><span class="wide-only">{boardWords.addWidget}</span></Button>
      <span class="sep" aria-hidden="true"></span>
      <button type="button" class="ico" aria-label={boardWords.undo} title="{boardWords.undo} ({mod}Z)" disabled={model.past.length === 0} onclick={() => model.undo()}><Icon name="undo-2" size="s" /></button>
      <button type="button" class="ico" aria-label={boardWords.redo} title="{boardWords.redo} ({mod}{shift}Z)" disabled={model.future.length === 0} onclick={() => model.redo()}><Icon name="redo-2" size="s" /></button>
      {#if four.current}
        <span class="seg" role="group" aria-label={boardWords.showing(model.phoneView)}>
          <button type="button" aria-pressed={!model.phoneView} onclick={() => (model.phoneView = false)}><Icon name="monitor" size="s" />{boardWords.laptop}</button>
          <button type="button" aria-pressed={model.phoneView} onclick={() => (model.phoneView = true)}><Icon name="rows-3" size="s" />{boardWords.phone}</button>
        </span>
      {/if}
      <button type="button" class="ico" aria-pressed={model.asList} aria-label={model.asList ? boardWords.asBoard : boardWords.asList} title={model.asList ? boardWords.asBoard : boardWords.asList} onclick={() => (model.asList = !model.asList)}><Icon name={model.asList ? 'layout-grid' : 'list-ordered'} size="s" /></button>
      <span class="grow"></span>
      <Button weight="quiet" size="sm" onclick={() => model.cancel()}>{boardWords.cancel}</Button>
      <Button weight="primary" size="sm" onclick={ondone}>{boardWords.done}</Button>
    </div>
    <p id="board-hint" class="hint">{boardWords.widgetHint}</p>
  {/if}

  {#if model.editing && model.asList}
    <!-- THE PLAIN LIST (§5.8): every widget a row, with its size and its moves, for anyone who does not drag. -->
    <ol class="as-list" aria-label={boardWords.editToday}>
      {#each listed as key, i (key)}
        <li class="row">
          <span class="row-name">{model.nameOf(key)}</span>
          <label class="row-size">
            <span class="visually-hidden">{boardWords.size}</span>
            <select value={model.sizeNow(key)} onchange={(e) => model.sizeTo(key, (e.currentTarget as HTMLSelectElement).value as WidgetSize)}>
              {#each model.sizesFor(key) as s (s)}<option value={s}>{SIZE_WORDS[s]}</option>{/each}
            </select>
          </label>
          <Button weight="quiet" size="sm" disabled={i === 0} onclick={() => ((model.moveTo(key, i - 1, false)), (model.said = boardWords.movedTo(model.nameOf(key), i, listed.length)))}>{boardWords.moveUp}</Button>
          <Button weight="quiet" size="sm" disabled={i === listed.length - 1} onclick={() => ((model.moveTo(key, i + 1, false)), (model.said = boardWords.movedTo(model.nameOf(key), i + 2, listed.length)))}>{boardWords.moveDown}</Button>
          {#if key !== 'needs-you' && key !== 'late'}<Button weight="quiet" size="sm" onclick={() => model.hide(key)}>{boardWords.remove('')}</Button>{/if}
        </li>
      {/each}
    </ol>
  {/if}

  <div class="frame" hidden={model.editing && model.asList}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="board"
      bind:this={el}
      style="--cols:{cols};--rows:{Math.max(rows, 1)}"
      data-cols={cols}
      onpointerdown={(e) => model.holdOn(e, mayEdit)}
      oncontextmenu={(e) => {
        if (model.editing) e.preventDefault();
      }}
    >
      {@render children()}
      <!-- A CELL HELD WHILE TODAY LOADS for a widget being read again: a quiet empty tile, so the board keeps its shape. -->
      {#each model.reserved as r (r.key)}<div class="reserve" data-size={r.size} style="grid-area:{r.area}" aria-hidden="true"></div>{/each}
      {#if model.editing && !model.asList}
        <!-- A CELL NOTHING FILLS, while editing: drawn, so a gap a smaller size left is seen as room, not as a fault. -->
        {#if model.held !== null}{#each model.holes as h (h)}<div class="cell-hole" style="grid-area:{h}" aria-hidden="true"></div>{/each}{/if}
      {/if}
    </div>
    {#if mayEdit && !model.editing && todayOffer.offer !== null}
      <!-- ONE QUIET SUGGESTION AT THE BOARD'S END (§6.3), its widget drawn at the board's own cell. ITS CODE ONLY ONCE
           THERE IS ONE: it is asked after Today has drawn, and loading the cell before then put it on a cold open's path. -->
      <div class="suggest">{#await suggestPart() then { default: SuggestCell }}<SuggestCell line onadd={added} {onremove} />{/await}</div>
    {/if}
  </div>

  {#if model.editing && model.quietNow.length > 0}
    <!-- ON THE BOARD WITH NOTHING TO SHOW NOW (audit 31 Oct, A17): each by its name and why, so the empty widget is not an
         unnamed box on the board, and taking no cell it moves nothing. It shows again where it stands once it has
         something; Hide takes it off as the tray does. -->
    <div class="quiet" role="group" aria-label={boardWords.quietHead}>
      <span class="tray-name"><Icon name="clock" size="s" />{boardWords.quietHead}</span>
      {#each model.quietNow as w (w.key)}
        <span class="quiet-one">
          <span class="quiet-name">{model.nameOf(w.key)}</span>
          <span class="quiet-said">{boardWords.quiet(w.key)}</span>
          <button type="button" class="ico" aria-label={boardWords.remove(model.nameOf(w.key))} title={boardWords.remove(model.nameOf(w.key))} onclick={() => model.hide(w.key)}><Icon name="x" size="s" /></button>
        </span>
      {/each}
    </div>
  {/if}

  {#if model.editing && !model.asList}
    <!-- THE TRAY (§5.2): drag a widget here to hide it; it keeps its setup, and a press puts it back. -->
    <div class="tray" data-board-tray aria-label={boardWords.hidden} role="group">
      <span class="tray-name"><Icon name="eye-off" size="s" />{boardWords.hidden}</span>
      {#if model.tray.length === 0}
        <span class="tray-empty">{boardWords.hiddenEmpty}</span>
      {:else}
        {#each model.tray as w (w.key)}
          <button type="button" class="chip" onclick={() => model.unhide(w.key)} aria-label={boardWords.putBack(model.nameOf(w.key))}><Icon name="plus" size="s" />{model.nameOf(w.key)}</button>
        {/each}
      {/if}
    </div>
  {/if}

  <p class="visually-hidden" aria-live="assertive" role="status">{model.said}</p>
</div>

<!-- ALWAYS HELD FOR THE OWNER, so the palette's "Add a widget" and Slash's "Add it to Today" (`?widgets`) open it here. -->
{#if mayEdit && sheetHeld}{#await sheetPart() then { default: WidgetSheet }}<WidgetSheet bind:open={sheetOpen} onadd={added} {onmake} board={widgets} />{/await}{/if}

<style>
  .board-root {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* ── the grid ── */

  .frame {
    position: relative;
    container: board / inline-size;
    min-inline-size: 0;
  }

  .board-root[data-phone-view] .frame {
    inline-size: min(390px, 100%);
    margin-inline: auto;
    padding: var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: 28px;
  }

  .board {
    --gap: var(--tile-gap, 12px);
    /* A ROW IS ABOUT HALF A COLUMN ON A LAPTOP, and a whole one on a phone, so a small is square there (§3.2). */
    --row: clamp(164px, calc((100cqi - 3 * var(--gap)) / 4 * 0.64), 200px);
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    grid-auto-rows: var(--row);
    grid-auto-flow: row;
    gap: var(--gap);
    min-inline-size: 0;
  }

  .board[data-cols='2'] {
    --row: clamp(150px, calc((100cqi - var(--gap)) / 2), 190px);
  }

  /* THE SUGGESTION UNDER THE BOARD draws its widget a row tall a cell, as the board's own rows are. */
  .suggest {
    --gap: var(--tile-gap, 12px);
    --board-u: clamp(164px, calc((100cqi - 3 * var(--gap)) / 4 * 0.64), 200px);
    margin-block-start: var(--gap);
  }

  .board-root:has(.board[data-cols='2']) .suggest {
    --board-u: clamp(150px, calc((100cqi - var(--gap)) / 2), 190px);
  }

  .suggest:empty {
    display: none;
  }

  /* A WIDGET AN AGENT DRAFTED (`DraftMark.svelte`) IS DASHED, told from his own by its edge. */
  .board :global([data-board-key]:has(> [data-draft-mark])) {
    outline: 1.5px dashed var(--rule-strong);
    outline-offset: 2px;
    border-radius: 22px;
  }

  /* THE READER'S OWN BOXES GIVE WAY, so each widget is a cell of this grid. */
  .board :global(:is(.home-page, .home-page > .page)) {
    display: contents;
  }

  .board :global(.home-page > *),
  .board :global(.home-page > .page > *) {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  /* NOT THE PAGE'S ⋯ ON A BOARD: Edit is the way to arrange it, and Add to Today the way to add to it. */
  .board :global(.home-page > .home-tools) {
    display: none;
  }

  /* EVERY WIDGET IS ITS FRAME (§3.3): fixed, the content fitting it and never scrolling inside it, so nothing shifts
     when its rows land. What it holds past the frame is its "N more", pinned to its foot. */
  .board :global([data-board-key][data-board-key]) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-self: stretch;
    justify-self: stretch;
    block-size: auto;
    min-block-size: 0;
    max-block-size: 100%;
    overflow: hidden;
    contain: layout paint;
    will-change: auto;
    /* EACH WIDGET IS THE CONTAINER ITS OWN PARTS ASK (UI pass 1 Nov): with none of its own, a card's `@container` read
       the whole board's width, so at 1280 Needs you laid a money question as if it were 34rem wide (its answers beside
       the amount) inside a tile half that, and cut the question to "Invoice 2026-041: bran…". */
    container-type: inline-size;
  }

  /* ON A PHONE AT REST A TILE ENDS WHERE WHAT IT SHOWS ENDS (audit 31 Oct, A16): the phone's tiles are one column of
     full-width frames, and a frame of fixed rows left Late and handed back one line and 200px of nothing over its
     "5 more", and Your work this week its two tasks over 350px of it. So the rows are as tall as what is drawn in them,
     and each frame is held to its cells as most (`--most`): what runs past that is cut by `fit.ts` as before, and the
     frame then closes up under what it kept. Two smalls side by side share their row, as tall as the taller.
     EDITING, THE CELLS ARE FIXED, so a drag or a resize is measured in whole cells and every frame shows its size. */
  .board-root:not([data-editing]) .board[data-cols='2'] {
    grid-auto-rows: auto;
  }

  .board-root:not([data-editing]) .board[data-cols='2'] :global([data-board-key][data-board-key]) {
    --most: var(--row);
    max-block-size: var(--most);
  }

  .board-root:not([data-editing]) .board[data-cols='2'] :global([data-board-key]:is([data-size='tall'], [data-size='large'])) {
    --most: calc(2 * var(--row) + var(--gap));
  }

  /* AND ON A LAPTOP AT REST A TILE CLOSES UP UNDER WHAT IT SHOWS TOO (next steps 1 Nov, T5): a row's tiles stretched to
     the tallest, so Your work and People ended in 150px of nothing beside Coming up, and Late with one invoice stood as
     tall as Needs you. The packer's grid is the same and editing still shows each size whole; at rest the rows are as
     tall as the tallest thing that starts in them, and each frame as tall as what it draws, the rows it was laid across
     at most (`--span`, by its size here and by its laid rows in `fit.ts`, which still cuts what runs past them). */
  .board-root:not([data-editing]) .board:not([data-cols='2']) {
    grid-auto-rows: auto;
  }

  .board-root:not([data-editing]) .board:not([data-cols='2']) :global([data-board-key][data-board-key]) {
    --span: 1;
    align-self: start;
    max-block-size: calc(var(--span) * var(--row) + (var(--span) - 1) * var(--gap));
  }

  .board-root:not([data-editing]) .board:not([data-cols='2']) :global([data-board-key][data-board-key]:is([data-size='tall'], [data-size='large'])) {
    --span: 2;
  }

  .board-root:not([data-editing]) .board:not([data-cols='2']) .reserve {
    min-block-size: var(--row);
  }

  .board-root:not([data-editing]) .board:not([data-cols='2']) .reserve:is([data-size='tall'], [data-size='large']) {
    min-block-size: calc(2 * var(--row) + var(--gap));
  }

  /* A DRAFT TAKES A ROW MORE (`grow` in `board.svelte.ts`), so its Keep bar sits under the widget it asks about. */
  .board-root:not([data-editing]) .board[data-cols='2'] :global([data-board-key]:has(> [data-draft-mark])) {
    max-block-size: calc(var(--most) + var(--row) + var(--gap));
  }

  /* AND ON A LAPTOP AT REST, THE BAR'S HEIGHT MORE (leftovers 4): the frame is held to the rows it was laid across, and
     the bar in the flow took its room out of them, so Spending's "$19,736" was cut in half under Keep. `--bar` is the bar
     as drawn, measured by `fit.ts`. */
  .board-root:not([data-editing]) .board:not([data-cols='2']) :global([data-board-key][data-board-key]:has(> [data-draft-mark])) {
    max-block-size: calc(var(--span) * var(--row) + (var(--span) - 1) * var(--gap) + var(--bar, 0px) + var(--sp-2));
  }

  /* AND 8 BETWEEN THE WIDGET'S LAST LINE AND THE BAR'S DASHED RULE, which sat on the figures' feet (design review). */
  .board-root:not([data-editing]) .board :global([data-board-key] > [data-draft-mark]) {
    margin-block-start: auto;
  }

  .board-root:not([data-editing]) .board :global([data-board-key]:has(> [data-draft-mark]) > :not([data-draft-mark]):nth-last-child(2)) {
    margin-block-end: var(--sp-2);
  }

  /* AND THE BAR IS IN THE FLOW, UNDER WHAT IT ASKS ABOUT (Maya's Today at 390): a phone's frame is as tall as what is drawn
     in it, so a bar laid over its foot covered the widget's own figures ("Spent, 30 days $19,901" under Keep). A laptop's
     frame at rest closes up the same way (T5), and its Spending lost the same figures under Keep (live check of 2 Nov). */
  .board-root:not([data-editing]) .board :global([data-board-key] > [data-draft-mark]) {
    position: static;
    order: 2;
    flex: none;
    margin-block-start: auto;
  }

  /* AND THE "N MORE" A FRAME WITH NONE OF ITS OWN IS GIVEN (`fit.ts`) TAKES ITS OWN LINE under what it kept, as the
     frame no longer ends below the rows with room for it laid over: in the flow, after the block. On a laptop at rest too
     (live check of 2 Nov): Your work this week's "1 more" sat on its last task, and Projects' "2 more" on a card. A part of Today's own
     (Working now) is a card inside a bare frame, so its count stays laid over the card's foot, and the card makes room. */
  .board-root:not([data-editing]) .board :global([data-board-key][data-more]::after) {
    position: static;
    order: 1;
    flex: none;
    padding-block-start: var(--sp-2);
  }

  /* CARDS ON THE BOARD SAY IT ON THEIR HEAD'S ROW, at its end (`fit.ts` `HEAD_COUNT`): they stand in no tile, so under
     them the count had neither padding nor room, and was cut or not drawn (live verify, 2 Nov). The list's door takes
     that place while the pointer is on the frame, so the two never sit on each other. */
  .board-root:not([data-editing]) .board :global([data-board-key][data-more]:has(.project-cards)::after) {
    position: absolute;
    inset-block: 0 auto;
    inset-inline: auto 0;
    padding-block-start: 0;
    line-height: 28px;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .board-root:not([data-editing]) .board :global([data-board-key][data-more]:has(.project-cards):is(:hover, :focus-within)::after) {
    opacity: 0;
  }

  .board-root:not([data-editing]) .board :global([data-board-key][data-more]:has(> .desk-part)::after) {
    position: absolute;
    inset-inline-start: var(--sp-4);
    padding-block-start: 0;
  }

  .board-root:not([data-editing]) .board :global([data-board-key][data-more] > .desk-part > .tile) {
    padding-block-end: calc(var(--sp-4) + 24px);
  }

  /* A CELL HELD WHILE TODAY LOADS KEEPS ITS SIZE'S HEIGHT, having nothing in it to be as tall as. */
  .board-root:not([data-editing]) .board[data-cols='2'] .reserve {
    min-block-size: var(--row);
  }

  .board-root:not([data-editing]) .board[data-cols='2'] .reserve:is([data-size='tall'], [data-size='large']) {
    min-block-size: calc(2 * var(--row) + var(--gap));
  }

  .board :global([data-board-key] > :is(.block-slice, .block-more)) {
    flex: none;
    margin-block-start: auto;
  }

  /* WHAT A FRAME HOLDS FILLS IT AND STOPS AT ITS FOOT, fading over its last few pixels rather than cutting a line in
     half, with "N more" under it whatever it held. */
  /* NO FADE AT THE FOOT: a row that does not fit is not drawn (`fit.ts`), so what is drawn is whole, and a kind's own
     "N more" at its end is never faded under it (audit 30 Oct, item 9). */
  .board :global([data-board-key] > .block) {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow: hidden;
  }

  /* HOW MANY A WIDGET LEFT OUT, where it has no "N more" of its own (`fit.ts` writes it). */
  .board :global([data-board-key][data-more]::after) {
    content: attr(data-more);
    position: absolute;
    inset-inline-start: 20px;
    inset-block-end: var(--sp-3, 12px);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 20px;
    pointer-events: none;
  }

  /* AND WHERE THE WIDGET HAS A QUIET FOOT, the count sits just above it, in the room `fit.ts` kept for it. */
  .board :global([data-board-key] [data-more-before]) {
    position: relative;
    margin-block-start: 24px !important;
  }

  .board :global([data-board-key] [data-more-before]::before) {
    content: attr(data-more-before);
    position: absolute;
    inset-inline-start: 0;
    inset-block-end: 100%;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 20px;
    white-space: nowrap;
    pointer-events: none;
  }

  /* ONE "MORE" ON EVERY WIDGET (audit Q36, Q59): the word and an arrow, in the quiet ink, never underlined, and a thumb's
     44px to press however small it is drawn (the margin gives back what the height took). */
  .board :global(:is(.late-more, .queue-more, .tile-link, .block-more, .kb-all, .p-more)) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-block-size: 44px;
    margin-block: -12px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  /* LATE'S "N MORE" SITS AT THE TILE'S FOOT, as All people and Activity do beside it, not under its last line with an
     empty band below it (live check of 30 October, 22: the phone's Late and urgent). */
  .board :global([data-board-key] .tile > .late-more) {
    margin-block-start: auto;
  }

  .board :global(:is(.late-more, .queue-more, .tile-link, .block-more, .kb-all, .p-more):not(:has(svg))::after) {
    content: '→';
  }

  .board :global(:is(.late-more, .queue-more, .tile-link, .block-more, .kb-all, .p-more):hover) {
    color: var(--ink);
  }

  /* A CHART FITS ITS FRAME: a week-by-week chart's plot is the room a one-row frame has under its heading, and two rows'
     in a Tall or a Large (the validator's recheck of 30 October, N1). `WidgetTile.svelte` draws its preview the same. */
  .board :global([data-board-key] .series) {
    --series-h: 60px;
  }

  /* ITS TOP LINE'S FIGURE SITS HALF ABOVE THE PLOT: room for it under the heading. */
  .board :global([data-board-key] .series-plot) {
    margin-block-start: var(--sp-2);
  }

  .board :global([data-board-key]:is([data-size='tall'], [data-size='large']) .series) {
    --series-h: 232px;
  }

  /* THE PHONE'S ROW IS SHORTER (170px): the plot gives way so the weeks under it still show. */
  @media (width < 720px) {
    .board :global([data-board-key]:not([data-size='tall'], [data-size='large']) .series) {
      --series-h: 52px;
    }
  }

  /* A ROW ITS FRAME CANNOT HOLD WHOLE IS NOT DRAWN (`fit.ts`), and the frame's foot rises to meet what is. */
  .board :global([data-board-key] [data-cut]) {
    display: none;
  }

  .reserve {
    border-radius: var(--r-tile);
    background: var(--tile);
    pointer-events: none;
  }

  /* A NARROW WIDGET'S NAME STAYS ON ONE LINE (UI pass 1 Nov): a small at 1280 is 234 wide, and "Your work this week 2"
     wanted 159px of the 154 its heading row left it, so it broke over two lines and pushed its rows down. Under 250px the
     well sits 8 from the name and the count 6 from it, which gives the name back its line. */
  @container (inline-size < 250px) {
    .board :global([data-board-key] > .block-bar) {
      gap: var(--sp-2);
    }

    .board :global([data-board-key] > .block-bar .block-name) {
      max-inline-size: calc(100% - var(--well) - var(--sp-2));
    }

    .board :global([data-board-key] > .block-bar .block-count) {
      margin-inline-start: 6px;
    }
  }

  /* ── editing ── */

  /* NOT `.hole`, which is the skin's red word to fill in (`blocks.css`) and drew every empty cell as a pink box. */
  .cell-hole {
    border: 1.5px dashed var(--rule);
    border-radius: 22px;
    pointer-events: none;
  }

  /* THE WIDGETS WITH NOTHING TO SHOW NOW, over the tray: a line each, its name, why, and Hide. */
  .quiet {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .quiet-one {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .quiet-name {
    flex: none;
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .quiet-said {
    min-inline-size: 0;
    color: var(--ink-3);
  }

  /* ON A PHONE A LINE EACH, the name whole, why beside it, Hide at the end. */
  @media (width < 720px) {
    .quiet-one {
      flex: 1 1 100%;
    }

    .quiet-said {
      flex: 1;
    }
  }

  /* THE BAR FLOATS OVER THE BOARD'S FOOT, so the board keeps room under its last row and the tray for it. */
  .board-root[data-editing] {
    padding-block-end: 96px;
  }

  .board-root[data-editing] .board :global([data-board-key]) {
    -webkit-user-select: none;
    user-select: none;
  }

  /* WHILE EDITING A FRAME LETS ITS REMOVE BUTTON SIT ON ITS CORNER, half outside it, clear of the tile's icon and its
     "All …" link (recheck 15). What it holds is still cut to it: its rows by `fit.ts`, a block by its own overflow. */
  .board-root[data-editing] .board :global([data-board-key][data-board-key]) {
    overflow: visible;
    contain: layout;
  }

  /* ITS CONTENT STAYS CUT TO IT: only the cover is let out. */
  .board-root[data-editing] .board :global([data-board-key] > :not([data-edit-cover])) {
    min-block-size: 0;
    overflow: clip;
  }

  /* THE HELD ONE LIFTS: a shadow, over the rest, and the pointer's. Its cell is drawn dashed where it will land. */
  .board :global([data-board-key][data-lifted]) {
    z-index: var(--z-sheet);
    overflow: visible;
    outline: 2px solid var(--rule-strong);
    cursor: grabbing;
  }

  .board-root[data-editing] .board::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-tile);
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--rule) 60%, transparent) 1px, transparent 1px);
    background-size: calc((100% + var(--gap)) / var(--cols)) 100%;
    opacity: 0.35;
    pointer-events: none;
  }

  /* WIGGLE-FREE: the board says it is being edited by its outlines and its bar, not by moving under him (Call 19). */

  /* THE BAR FLOATS AT THE FOOT OF THE SCREEN, over the board and not above it, so entering the mode moves nothing
     (§5.1, under 100 ms and no reflow). */
  .edit-bar {
    position: fixed;
    inset-block-end: max(var(--sp-4), env(safe-area-inset-bottom));
    inset-inline-start: 50%;
    translate: -50% 0;
    z-index: var(--z-palette);
    max-inline-size: calc(100vw - 2 * var(--sp-4));
    animation: bar-in var(--d-page, 200ms) var(--ease-out, ease-out) both;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
    background: var(--tile);
  }

  .edit-bar :global(button) {
    gap: 6px;
  }

  /* ON A PHONE ONE ROW OVER THE TAB BAR, the whole width, Add widget its glyph. */
  @media (width < 720px) {
    .edit-bar {
      flex-wrap: nowrap;
      inset-block-end: calc(var(--tabbar, 64px) + env(safe-area-inset-bottom) + var(--sp-2));
      inline-size: calc(100vw - 2 * var(--sp-3));
      gap: var(--sp-1);
      padding: var(--sp-1) var(--sp-2);
    }

    .wide-only {
      display: none;
    }

    .board-root[data-editing] {
      padding-block-end: 140px;
    }
  }

  @keyframes bar-in {
    from {
      opacity: 0;
      translate: -50% 12px;
    }
  }

  .sep {
    inline-size: 1px;
    block-size: 20px;
    background: var(--rule);
  }

  .grow {
    flex: 1;
  }

  .ico {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }

  .ico:hover:not(:disabled) {
    background: var(--tile-2);
  }

  .ico:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  .ico[aria-pressed='true'] {
    background: var(--tile-2);
  }

  @media (pointer: coarse) {
    .ico {
      inline-size: var(--tap, 44px);
      block-size: var(--tap, 44px);
    }
  }

  .seg {
    display: inline-flex;
    padding: 2px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 28px;
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .seg button[aria-pressed='true'] {
    background: var(--tile);
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .hint {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .tray {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 56px;
    padding: var(--sp-2) var(--sp-3);
    border: 1px dashed var(--rule-strong, var(--rule));
    border-radius: var(--r-tile);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .tray-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .tray-empty {
    color: var(--ink-3);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .chip {
      min-block-size: var(--tap, 44px);
    }
  }

  .draft-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink-2);
  }

  .draft-left > span {
    flex: 1;
  }

  .as-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
  }

  .row + .row {
    border-block-start: 1px solid var(--rule);
  }

  .row-name {
    flex: 1;
    min-inline-size: 10ch;
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .row-size select {
    min-block-size: 32px;
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
  }

  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .board :global([data-board-key][data-lifted]) {
      transition: none;
    }

    .edit-bar {
      animation: none;
    }
  }
</style>
