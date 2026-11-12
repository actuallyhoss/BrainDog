<!--
  A PAGE LAID OUT AS A BOARD (widgets plan §4.2, W6): a project's page, Money's home, any page he turns it on for, with
  the same board and editor Today has (`lib/board`): press and hold, drag, pull a corner, hide, Undo, Done.

  ITS HEAD STAYS A PAGE. What a page opens on (the project's shape, the next step, the reserved slot, what changed) is
  drawn above the board as it always was (`head`), and every other block is a widget in its own cell (`body`, a
  `PageBody` drawn `bare` with each block's cell from `placed`).

  ARRANGED PER PAGE, KEPT AS HIS (`page-boards.svelte.ts`): the order, the sizes, what he took off and the phone's own
  arrangement, laid over the page as it is read. Nothing is written into the page, so an add-on's page and a project
  drawn from one template keep their updates, and each project keeps its own board. Done keeps it with an Undo.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { defaultSize, isWidgetSize, nearestSize, sizesOf, type WidgetSize } from 'braindog-render';

  import Board from '$lib/board/Board.svelte';
  import { BoardModel } from '$lib/board/board.svelte.ts';
  import EditCover from '$lib/board/EditCover.svelte';
  import { fitted, headOfBoard, type Widget } from '$lib/board/board-widgets.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { apiBase } from '$lib/at.ts';
  import { blockKeys } from './recompose.ts';
  import { boardSlug, boardWords, pageBoards, type PageBoardKept } from './page-boards.svelte.ts';

  type Placed = (i: number) => { key: string; area: string; size: string; foot?: true } | null;

  let {
    slug,
    title,
    blocks,
    kept,
    mayEdit,
    reread,
    head,
    body,
  }: {
    slug: string;
    title: string;
    /** The page's blocks as the page would draw them, in its order. */
    blocks: readonly LiveBlock[];
    /** His board for this page. */
    kept: PageBoardKept;
    mayEdit: boolean;
    reread: () => Promise<void>;
    /** The page's head: the blocks that are no widget, drawn as the page draws them, above the board. */
    head: Snippet<[LiveBlock[]]>;
    /** The widgets, each in its cell, with the editing handles to draw inside each (`EditCover`). */
    body: Snippet<[Placed, LiveBlock[], Snippet<[number]>]>;
  } = $props();

  /** A key a preference may hold: the record's own where it is one, else a short stable one made from it. */
  const KEY = /^[a-z][a-z0-9_-]{0,47}$/u;
  function keyFor(composite: string): string {
    if (KEY.test(composite)) return composite;
    let h = 0x811c9dc5;
    for (let i = 0; i < composite.length; i++) h = Math.imul(h ^ composite.charCodeAt(i), 0x01000193) >>> 0;
    return `b-${h.toString(16).padStart(8, '0')}`;
  }

  const keys = $derived(blockKeys(blocks as never).map(keyFor));

  /** Whether a block is a widget: not the page's head, not the project's own shape, and a kind that draws in a frame. */
  const widgetLike = (b: LiveBlock): boolean => !headOfBoard(b as never) && b.kind !== 'project' && sizesOf(b.kind).length > 0;

  /** The widgets in his order (any new since, after), at his sizes, less the ones he took off. */
  const widgets = $derived.by((): Widget[] => {
    const hidden = new Set(kept.hidden ?? []);
    const all = blocks.flatMap((b, i) => (widgetLike(b) && !hidden.has(keys[i]!) ? [{ key: keys[i]!, kind: b.kind }] : []));
    const by = new Map(all.map((w) => [w.key, w]));
    const order = [...kept.order.filter((k) => by.has(k)), ...all.map((w) => w.key).filter((k) => !kept.order.includes(k))];
    return order.map((k) => {
      const w = by.get(k)!;
      const said = kept.sizes[k];
      const size: WidgetSize = isWidgetSize(said) ? nearestSize(w.kind, said) : defaultSize(w.kind);
      return { key: k, kind: w.kind, size };
    });
  });
  const shown = $derived(new Set(blocks.flatMap((b, i) => (b.drawn && widgetLike(b) ? [keys[i]!] : []))));
  const names = $derived(
    new Map(
      blocks.map((b, i) => [keys[i]!, typeof b.heading === 'string' && b.heading.trim() !== '' ? b.heading.trim() : b.kind.charAt(0).toUpperCase() + b.kind.slice(1)] as const),
    ),
  );

  const model = new BoardModel();
  model.src = { widgets: () => widgets, phone: () => (kept.phone ?? null) as never, shown: () => shown, names: () => names };
  /* SET ONCE, the page's own: the board is drawn again for another page, never handed one. */
  // svelte-ignore state_referenced_locally
  model.draftKey = `bd_page_board:${apiBase()}:${boardSlug(slug)}`;

  /* THE PAGE JUST LAID OUT AS A BOARD OPENS ITS EDITOR, so the next thing is arranging it. */
  onMount(() => {
    if (pageBoards.fresh === boardSlug(slug) && mayEdit) {
      pageBoards.fresh = null;
      model.enter();
    }
  });

  const placed: Placed = (i) => {
    const k = keys[i];
    return k !== undefined && widgets.some((w) => w.key === k) ? model.placeOf(k) : null;
  };

  /** Every widget at its frame, drawn only where it has a cell; everything else is the head's. */
  const laid = $derived(
    blocks.map((b, i) => {
      const k = keys[i]!;
      const cell = widgetLike(b) ? model.placeOf(k) : null;
      return cell && b.drawn ? (fitted(b as never, model.sizeNow(k), model.onPhone) as LiveBlock) : ({ ...b, drawn: false } as LiveBlock);
    }),
  );
  const heads = $derived(blocks.map((b) => (widgetLike(b) ? ({ ...b, drawn: false } as LiveBlock) : b)));

  /** Done: his arrangement kept for this page, with an Undo that puts back the one before. */
  async function done(): Promise<void> {
    const a = model.now;
    if (!a || model.steps().length === 0) return model.cancel();
    model.close();
    const off = widgets.map((w) => w.key).filter((k) => !a.order.includes(k));
    const hidden = [...new Set([...(kept.hidden ?? []), ...off])];
    const next: PageBoardKept = {
      order: [...a.order],
      sizes: { ...a.sizes },
      ...(hidden.length > 0 ? { hidden } : {}),
      ...(a.phone ? { phone: a.phone as never } : {}),
    };
    const out = await pageBoards.put(slug, next);
    model.landed();
    if (!out.ok) return void toasts.push(out.fix, { intent: 'bad' });
    const before = out.before;
    toasts.push(boardWords.arranged(title), { undo: () => void pageBoards.put(slug, before) });
  }

  /**
   * A WIDGET FROM THE SHEET, on a page he wrote: the block goes into the page's own declaration, at the board's end and
   * the size he picked, with an Undo that takes it back off. An add-on's page is not written into.
   */
  async function add(block: Record<string, unknown>, size: WidgetSize): Promise<void> {
    const { authoredOf, setBody } = await import('$lib/record/page-write.ts');
    const base = apiBase();
    const read = await authoredOf(base, slug);
    if ('from' in read) return void toasts.push(read.fix, { intent: 'warn' });
    if (!read.mine) return void toasts.push(boardWords.addNotMine, { intent: 'warn' });
    const { key: _k, size: _s, draft: _d, span: _span, area: _area, ...own } = block;
    const key = `w-${Math.random().toString(36).slice(2, 6)}`;
    const out = await setBody(base, { ...read.body, blocks: [...read.body.blocks, { ...(own as { kind: string }), key }] }, undefined, read.version);
    if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
    const now = pageBoards.of(slug) ?? kept;
    await pageBoards.put(slug, { ...now, order: [...model.keys, key], sizes: { ...now.sizes, [key]: size } });
    await reread();
    const made = out.version;
    const name = typeof own.heading === 'string' && own.heading.trim() !== '' ? own.heading.trim() : 'The widget';
    toasts.push(boardWords.added(name), { undo: () => void setBody(base, read.body, undefined, made).then(() => reread()) });
  }
</script>

<!-- EACH WIDGET'S HANDLES WHILE THE BOARD IS EDITED: the remove dot and the corner, as Today's widgets have. -->
{#snippet cover(i: number)}
  {@const key = keys[i]}
  {#if model.editing && key && model.placeOf(key)}<EditCover {model} {key} />{/if}
{/snippet}

<div class="page-board-head">{@render head(heads)}</div>
<div class="page-board">
  <Board {model} {mayEdit} ondone={() => void done()} onadd={add} widgets={[]}>{@render body(placed, laid, cover)}</Board>
  {#if mayEdit && !model.editing}
    <div class="page-board-foot"><Button weight="quiet" size="sm" onclick={() => model.enter()}>{boardWords.edit}</Button></div>
  {/if}
</div>

<style>
  /* THE HEAD KEEPS THE PAGE'S GUTTERS AND NOT ITS FOOT: the board follows straight under it. */
  .page-board-head :global(> .page) {
    padding-block-end: 0;
  }

  .page-board-head:not(:has(:global(.block-slot, .page-strip, .area))) {
    display: none;
  }

  .page-board {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--gutter) var(--sp-9);
  }

  /* THE PAGE'S OWN BOX GIVES WAY ON THE BOARD, so each widget is a cell of the board's grid, as Today's are. */
  .page-board :global(.board > .page) {
    display: contents;
  }

  .page-board :global(.board > .page > :not([data-board-key])) {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .page-board-foot {
    display: flex;
    justify-content: flex-end;
  }
</style>
