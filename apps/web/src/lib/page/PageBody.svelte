<!--
  A declared page's blocks, laid out: the twelve-column flow and each block's `span`, the main column and the rail a
  `layout` asks for, the boxed runs a `box: true` section opens, and the block cursor `j` and `k` walk. Every block is
  drawn by `BlockSlot.svelte`; while the page is arranged, each carries its bar and takes a drag.

  ONE LAYOUT WHEREVER A DECLARED PAGE IS DRAWN. `/p/<slug>`, Home's body and a preview all lay their blocks out here, so
  a page Slash proposes with a rail is judged on Decide with its rail, and a use case's Home keeps its columns. It was
  `/p/` alone, and the other two drew a flat stack of blocks.

  A PAGE IS A ROW, NOT A FILE, which is what makes "the Money page" something a freelancer never sees and a studio does
  (06). One request per page load, never one per block: the record answers every block in one read, and this only lays
  out what it answered.
-->
<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { at as inApp } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import type { Row } from 'braindog-render';
  import { doorOf } from './door.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { COLUMNS, dropInto, nearestInArea, setAreaAt, type Slot } from '$lib/record/arrange.ts';
  import type { LiveBlock, LivePageDecl, Walked } from '$lib/record/page-live.ts';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import BlockSlot from './BlockSlot.svelte';
  import { boxesOf, layoutOf, mainSpan, ONE_UNDER, PAIR_FROM, paired, slotOf, splitAreas, sticks, widened, type Run } from './layout.ts';
  import { emptyHidden, openOf, optionOf, rowKeys, stepRow, wholeKey } from './home.ts';
  import type { Writes } from './page-writes.ts';
  import type { Picked } from './picked.svelte.ts';
  import type { RowHost } from './row-host.svelte.ts';
  import { rowOfKey } from './row-verbs.ts';
  import JustChanged from './JustChanged.svelte';
  import Changed from './Changed.svelte';
  import { leadIndex } from './lead.ts';
  import { blockKeys, recomposer, rewritten } from './recompose.ts';
  import { lookOrder, nextOf, placedOf } from './look.ts';
  import NextStep from './NextStep.svelte';

  let {
    mode,
    page,
    blocks,
    now,
    writes,
    arrangement = null,
    ids = '',
    level = 2,
    headed = false,
    strip = null,
    host = null,
    pick = null,
    onwalk = null,
  }: {
    /**
     * `page` is `/p/<slug>`, with its block keys. `home` is a home's body: its blocks that hold nothing are not drawn, a
     * long one folds, and the keys walk rows across every block. `preview` is drawn inside another screen and is inert.
     */
    mode: 'page' | 'home' | 'preview';
    /** The page as the record answered it, whose `layout` says whether there is a rail. */
    page: LivePageDecl;
    /** Every block the page draws, declared then added, each at the index its slot keeps. */
    blocks: readonly LiveBlock[];
    now: number;
    /** The page's writes, or `null` where the page is inert. */
    writes: Writes | null;
    /** The page's arrangement while it can be arranged, or `null` where it cannot. */
    arrangement?: Arrangement | null;
    /** What every id this body writes starts with, so two bodies on one screen never share one. */
    ids?: string;
    /** The level each block's name is drawn at. */
    level?: 2 | 3;
    /** The page's head rides over the top of the lead tile on a wide screen (`PageHead`'s `over`), so the tile leaves it room. */
    headed?: boolean;
    /** What narrows the page (its filter strip), drawn under the headline on a page whose head rides over it. */
    strip?: Snippet | null;
    /**
     * The page's hold on one row at a time (`row-host.svelte.ts`): the docked panel, the row menu and Just changed, which
     * the row keys and the renderer's `onopen` and `onmenu` reach. `null` where rows are only ticked.
     */
    host?: RowHost | null;
    /** The page's choice of questions to answer at once, or `null` where a queue answers one card at a time. */
    pick?: Picked | null;
    /**
     * Reads the page again walking a forecast as far as a reader picked, past where it reaches unasked (`page-live.ts`
     * `askWalk`), or `null` where the page is not read again (a preview).
     */
    onwalk?: ((length: Walked) => void) | null;
  } = $props();

  const arranging = $derived(arrangement?.editing ?? false);

  /* ── the main column and the rail ─────────────────────────────────────────
     A PAGE THAT DECLARES `layout` DRAWS TWO COLUMNS; every other page draws the one flow it always has, through the same
     markup, so nothing below changes for it. `layout.ts` says why the rail is a split of the one list and never a
     second list. */
  const layout = $derived(layoutOf(page));

  /**
   * THE BLOCKS AS THIS MODE DRAWS THEM. On every page being read, a home or any other, a block that holds nothing and
   * says nothing about it, or that this build cannot draw, is not drawn (`home.ts` `emptyHidden`, DIRECTION §35: an
   * empty or unused part is not drawn), at the index it was declared at, so every id and write on the page still finds
   * it. AUTHORING DRAWS THEM ALL: while the page is arranged, or as a preview of a change, a block that is empty today is
   * still a block somebody is placing.
   *
   * A PAGE AT ITS OWN ADDRESS IS NEVER EMPTIED BY THIS: one whose every block would go keeps the first, which says its
   * one sentence, and still offers the first row, rather than drawing a title over nothing. It kept every block, so an
   * empty Work was a wall of tiles each saying it held nothing.
   */
  const quiet = $derived(emptyHidden(blocks, mode === 'page'));
  const drawable = $derived(mode === 'preview' || arranging ? blocks : quiet);

  /** Whether a block leads the page (its line, a lead figure row, a lead queue), which keeps the whole row. */
  const isLead = (b: LiveBlock): boolean => (b as { lead?: unknown }).lead === true;

  /**
   * EACH BLOCK'S KEY, by declared index: the record's own where it answered one (`recompose.ts` `blockKeys`). What the
   * page's elements are keyed by, so a block the look moves is the same element moving, and what the look orders by.
   */
  const keys = $derived(blockKeys(blocks));

  /* ── the look ──────────────────────────────────────────────────────────────
     HOW THE ENGINE ARRANGED THE PAGE (`look.ts`): its lead under the page's sentence and the order it named, applied as
     a view over the declared blocks, so every index the page writes by stays the block's own. Not while arranging,
     where the order on screen is the one being written. */
  const look = $derived(page.look ?? null);
  const order = $derived(lookOrder(blocks.map((b, i) => placedOf(b, keys[i]!)), look));
  /* THE ONE NEXT ACTION THE LOOK NAMES, under the headline: a row of the page, or a question on it waiting on the
     reader. Not in a preview, which is inert. */
  const questions = $derived(new Set(blocks.flatMap((b) => (b.queue ?? []).map((q) => q.id))));
  const next = $derived(mode === 'preview' ? null : nextOf(look, questions));

  /**
   * The blocks in the order and at the widths currently in force, each carrying the index it had in the declaration.
   *
   * `slot.span` is authoritative whether or not the mode is open: it falls back to the declared span when there is no
   * arrangement. Reading `arranging ? slot.span : spanOf(block)` once meant Done kept the ORDER and silently threw away
   * every width: the layout you confirmed was not the layout you got.
   */
  const laid = $derived.by(() => {
    const slots = arrangement?.slots ?? order.map((i) => slotOf(drawable[i]!, i, layout));
    return slots.map((slot) => ({ slot, block: drawable[slot.i] })).filter((x): x is { slot: Slot; block: LiveBlock } => Boolean(x.block));
  });

  /** Every drawn pair with `at`, its index in `laid`, which is the index the arrangement moves by. */
  type Laid = { slot: Slot; block: LiveBlock; at: number };
  const pairs = $derived<Laid[]>(laid.map((x, at) => ({ ...x, at })));

  /** Each area's pairs, in declared order. The slot says where a block is, because a move to the rail is a slot's. */
  const split = $derived(splitAreas(pairs, layout, (x) => x.slot.area));

  /**
   * THE HEADLINE, LIFTED: the page's sentence when the head rides over it (`headed`, `lead.ts`). On a page with a rail it
   * is drawn across the page over both columns, so the head's row and its tools sit over a tile as wide as they are,
   * and the main column starts under it.
   */
  const lifted = $derived.by((): Laid | null => {
    if (!headed) return null;
    const at = leadIndex(pairs.map((x) => x.block));
    return at < 0 ? null : (pairs[at] ?? null);
  });
  /**
   * THE HEADLINE WHEREVER IT IS DRAWN: lifted over the page, or the page's sentence in the flow. The look's next action
   * sits straight under it.
   */
  const headline = $derived(lifted ?? pairs.find((x) => x.block.drawn && x.block.kind === 'note' && isLead(x.block)) ?? null);
  /** Each column's pairs, less the headline lifted over both: a sentence declared in the rail is lifted too, and drawn once. */
  const mainRest = $derived(lifted ? split.main.filter((x) => x !== lifted) : split.main);
  const railRest = $derived(lifted ? split.rail.filter((x) => x !== lifted) : split.rail);

  /**
   * ON A PHONE THE RAIL COMES FIRST, on a page at its own address: its blocks are the page at a glance (Kiln's figures,
   * a desk's pins), and stacked under the main column they were the last thing on a long screen. In the markup and not
   * by `order`, so Tab, a screen reader and `j` meet the blocks in the order the eye does. Home keeps its rail last,
   * because Home's main column is what needs the reader.
   */
  const wide = new MediaQuery('(width >= 900px)', true);
  const railFirst = $derived(mode === 'page' && layout !== null && !wide.current);

  /**
   * THE ORDER A READER MEETS THE BLOCKS IN, which is the headline, the main column and then the rail (the rail first on
   * a phone): the order the page draws them in, and so the order `j` and `k` walk. On a page with no rail it is `laid`.
   *
   * ONLY THE BLOCKS THAT ARE DRAWN. A block whose `when:` said no has no element, so a cursor on it is a cursor nobody
   * can see, and `j` on a page that opens with three of them pressed three times before anything moved.
   */
  const reading = $derived.by(() => {
    if (!layout) return pairs.filter((x) => x.block.drawn);
    const top = lifted ? [lifted] : [];
    return (railFirst ? [...top, ...railRest, ...mainRest] : [...top, ...mainRest, ...railRest]).filter((x) => x.block.drawn);
  });

  /**
   * The runs an area draws in. A boxed section and the blocks after it share one surface while reading; while arranging
   * every block is loose, because a block being moved is a list item and a list item inside a surface inside the list
   * is a listitem whose parent is not the list.
   */
  const runsOf = (list: Laid[]): Run<Laid>[] => (arranging ? [{ box: false, items: list }] : boxesOf(list, (x) => x.block));

  /** Whether each column draws anything: a column whose every block said no to `when:` is not drawn, as an empty one is not. */
  const mainShown = $derived(mainRest.some((x) => x.block.drawn));
  const railShown = $derived(railRest.some((x) => x.block.drawn));

  /* THE PAGE'S OWN ELEMENT, declared before the effects that read it: a `$effect.pre` runs while the component is
     still being set up, and reading a `let` the script has not reached yet is a TDZ error that blanks the page. */
  let pageEl = $state<HTMLElement | null>(null);
  /**
   * A ROW ANOTHER HAND CHANGED WEARS A FAINT TINT UNTIL IT IS SEEN (`byline.ts`): an agent, a rule or Slash, on a page at
   * its own address. The renderer draws its rows and takes no word from the host about them, so the tint is an attribute
   * set on the rows it drew (`data-row`, the row's own key), with the byline as their tooltip; the words and the Undo are
   * in Changed for you and in the row's panel. A row the renderer draws again later (a list unfolded, a page read again)
   * is found as it lands, by watching the page for rows added under it.
   */
  $effect(() => {
    const el = pageEl;
    const lines = mode === 'page' && host ? host.bylines : null;
    if (!el || !lines) return;
    const wear = () => {
      for (const row of el.querySelectorAll<HTMLElement>('[data-row]')) {
        const key = row.dataset.row ?? '';
        const line = lines.get(key);
        if (line?.unseen) {
          row.dataset.byNew = '';
          row.title = line.said;
        } else if (row.dataset.byNew !== undefined) {
          delete row.dataset.byNew;
          row.removeAttribute('title');
        }
      }
    };
    let frame = 0;
    const later = () => {
      if (frame === 0) frame = requestAnimationFrame(() => ((frame = 0), wear()));
    };
    wear();
    const watch = new MutationObserver(later);
    watch.observe(el, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  });

  /**
   * WHETHER THE PAGE IS TWO COLUMNS OF BLOCKS: once the work column itself is `PAIR_FROM` wide, on a page whose one flow
   * has the whole width, because no rail is declared or the rail draws nothing (`layout.ts` `paired`). A page with a
   * rail is already a lead column and a side column. Not in a preview, which is drawn inside another screen at half its
   * width.
   *
   * THE COLUMN, MEASURED, AND NOT THE WINDOW. A docked panel takes its own column beside the work (`+layout.svelte`), and
   * the rail its own, so a 1,440 window with a task open is a work column of about 740: paired by the window's width,
   * each half was 340 and a table or a forecast was squeezed into it. Measured, the page pairs where there is room for
   * two and goes back to one as a panel opens, the change played as a recomposition (below). `null` until the page is
   * first measured, which happens before it is first painted.
   */
  let workWidth = $state<number | null>(null);
  $effect(() => {
    const el = pageEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const take = (w: number) => {
      const px = Math.round(w);
      if (px !== workWidth) workWidth = px;
    };
    const s = getComputedStyle(el);
    /* UNTRACKED, or the width this writes would be one this effect reads, and every measure would set the watch up again. */
    untrack(() => take(el.clientWidth - (Number.parseFloat(s.paddingInlineStart) || 0) - (Number.parseFloat(s.paddingInlineEnd) || 0)));
    const watch = new ResizeObserver((seen) => {
      const box = seen.at(-1)?.contentRect;
      if (box) take(box.width);
    });
    watch.observe(el);
    return () => watch.disconnect();
  });
  const twoUp = $derived(workWidth !== null && workWidth >= PAIR_FROM && mode !== 'preview' && (!layout || !railShown));
  /* AND ONE COLUMN IN THE ROOM OF A WINDOW UNDER 900 (`layout.ts` `ONE_UNDER`), beside a docked panel or the rail as much
     as on a phone. Not in a preview, which is drawn at another screen's width. */
  const narrow = $derived(workWidth !== null && workWidth < ONE_UNDER && mode !== 'preview');

  /**
   * THE WIDTHS A ROW IS DRAWN AT ONCE ITS HIDDEN BLOCKS ARE GONE, by declared index, for the blocks whose width changes
   * (`layout.ts` `widened`): a half whose partner's `when:` said no takes the whole row rather than sitting beside a
   * hole. Each twelve-column flow on its own: the main column (or the page, with no rail) and each box in it. The rail
   * is one stack and has no rows. NOT WHILE ARRANGING, where the bar names a block's own width and that is what is drawn.
   *
   * AND ON A WIDE SCREEN, TWO WHOLE-ROW BLOCKS ONE AFTER THE OTHER ARE TWO HALVES (`twoUp`), so a 1,728 window is used
   * rather than drawn as lines across it.
   */
  const spans = $derived.by(() => {
    const out = new Map<number, number>();
    if (arranging) return out;
    for (const run of runsOf(layout ? mainRest : pairs)) {
      let got = widened(run.items.map((x) => ({ span: x === lifted ? COLUMNS : x.slot.span, drawn: x.block.drawn })));
      if (twoUp) {
        const now = got;
        got = paired(
          run.items.map((x, n) => ({
            kind: x.block.kind,
            span: now[n]!,
            drawn: x.block.drawn,
            lead: x === lifted || isLead(x.block),
            columns: x.block.columns.length,
          })),
        );
      }
      run.items.forEach((x, n) => {
        if (x !== lifted && got[n] !== x.slot.span) out.set(x.slot.i, got[n]!);
      });
    }
    return out;
  });

  /* ── recomposing in place ──────────────────────────────────────────────────
     A NEW ANSWER MOVES THE PAGE, IT DOES NOT REDRAW IT (DIRECTION §38, `recompose.ts`): each block is measured before
     the page draws the answer and played from where it was to where it is, a new block fades and rises in, and one
     that left fades out where it stood. Never on the first draw of a page, never on a page that is another page, never
     as the arrange mode opens or shuts (every block takes a bar, which is the mode and not the record moving), and
     never in a preview.

     A HEADLINE WRITTEN AGAIN CROSSFADES where it stands (`rewritten`): the sentence the look or the model wrote anew
     fades over the one it replaces, and the blocks under it move to where the new answer puts them. */
  const motion = recomposer();
  let drewFor: string | null = null;
  let wasArranging = false;
  /** Whether the work column had been measured when the page was last drawn: its first measure is part of the first draw. */
  let wasSized = false;
  /* A YES OR NO, DERIVED, so the change below reads whether the column is measured and not its width: read as the
     width, every frame of a window being dragged wider ran it again, and its `stop` cut short the recomposition that
     pairing or unpairing the page had just started. */
  const sized = $derived(workWidth !== null);
  /** What each drawn headline said when the page was last drawn, by key. */
  let saidWas = new Map<string, string>();
  $effect.pre(() => {
    void spans;
    void narrow;
    const drawnNow = laid.filter((x) => x.block.drawn);
    const shown = new Set(drawnNow.map((x) => keys[x.slot.i]!));
    const said = new Map(drawnNow.filter((x) => x.block.kind === 'note' && isLead(x.block)).map((x) => [keys[x.slot.i]!, x.block.body ?? '']));
    const on = page.page;
    const moving = arranging;
    const isSized = sized;
    untrack(() => {
      const el = pageEl;
      const same = drewFor === on && wasArranging === moving && wasSized === isSized;
      const swap = same ? rewritten(saidWas, said) : new Set<string>();
      drewFor = on;
      wasArranging = moving;
      wasSized = isSized;
      saidWas = said;
      if (mode === 'preview' || !el || !same) return motion.stop();
      const play = motion.before(el, shown, swap);
      if (play) void tick().then(play);
    });
  });
  $effect(() => () => motion.stop());

  /* WHETHER THE RAIL STAYS IN VIEW, measured, since `sticky: true` is honoured only while the rail fits (`sticks`). The
     room is the scrolling column's height under the page head, the same `--sticky` offset the rail sticks at. */
  let railEl = $state<HTMLElement | null>(null);
  let railHeight = $state(0);
  let room = $state(0);
  $effect(() => {
    const el = railEl;
    if (!el || !layout?.sticky) return;
    const scroller = el.closest('main') ?? document.documentElement;
    const root = getComputedStyle(document.documentElement);
    const px = (token: string) => Number.parseFloat(root.getPropertyValue(token)) || 0;
    const measure = () => {
      room = scroller.clientHeight - px('--sticky') - 2 * px('--sp-4');
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(scroller);
    return () => watch.disconnect();
  });
  const stuck = $derived(sticks(layout, railHeight, room));

  /** A block's element, by the id its slot writes. */
  const slotEl = (i: number): HTMLElement | null => document.getElementById(`${ids}b-${i + 1}`);

  /**
   * The other area, which is where the block's move button sends it.
   *
   * AND FOCUS GOES WITH THE BLOCK. The block leaves one column's keyed list and is made again in the other, so the button
   * just pressed is destroyed and keyboard focus fell to the page's body: the reader who moved a block to the rail had
   * to tab from the top of the page to find it again. Once the page has drawn the move, the same control on the moved
   * block takes focus, so a second press sends it back. `i` is the declared index its slot keeps, which is its id.
   */
  async function toOtherArea(at: number, from: 'main' | 'rail', i: number) {
    if (!arrangement?.slots) return;
    arrangement.slots = setAreaAt(arrangement.slots, at, from === 'rail' ? 'main' : 'rail');
    await tick();
    slotEl(i)?.querySelector<HTMLElement>('.area-move button')?.focus();
  }

  /**
   * One step up or down inside the block's own area. `to` is the position the bar asked for within that area; the
   * arrangement moves by `laid` index, so the step is found there. With no rail this is `at - 1` and `at + 1`.
   */
  function stepInArea(at: number, pos: number, to: number) {
    if (!arrangement) return;
    arrangement.move(at, nearestInArea(arrangement.slots ?? [], at, to < pos ? -1 : 1));
  }

  /** Held while a handle is down, so the drop target knows what is moving. */
  let dragging = $state<number | null>(null);

  /* WHERE IT WILL LAND. A drag with no target shown is a drag you have to complete to find out what it did, and then
     undo. The block under the pointer takes an edge on the side the block will arrive, so the answer is on screen before
     the reader lets go.

     Which edge depends on the block's own width, not on a fixed axis. A full-width block stacks, so top and bottom are
     what "before" and "after" mean and the pointer's Y decides. A block sharing its row reads left to right, so X
     decides. Using one axis for both puts the line on the short edge of half the blocks on the page. */
  let over = $state<{ at: number; edge: 'before' | 'after' } | null>(null);

  /* `stacked` IS WHETHER THE BLOCK HAS THE WHOLE ROW, which a full-width block does and every block in the rail does,
     since the rail is one stack whatever a block's span says. */
  function trackDrop(e: DragEvent, at: number, stacked: boolean) {
    if (!arranging || dragging === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const past = stacked ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    over = { at, edge: past ? 'after' : 'before' };
  }

  /* A DROP ON A BLOCK IN THE OTHER COLUMN MOVES THE HELD BLOCK INTO THAT COLUMN, at the edge it was let go on. With no
     rail it is the drag it always was: `dropInto` is `moveAt` at `dropIndex` when the two areas are the same. */
  function drop() {
    if (arrangement && dragging !== null && over && arrangement.slots) arrangement.slots = dropInto(arrangement.slots, dragging, over.at, over.edge);
    dragging = null;
    over = null;
  }

  /**
   * The block cursor, and the page-scope keys the keymap advertises: `j k`, `↵ Esc`, `o` and `y`.
   *
   * ONLY ON `/p/<slug>`. Home and a preview are drawn inside screens with keys of their own, and a bare `j` that walked
   * a page's blocks there would take the key from the screen it belongs to.
   *
   * It starts at -1, meaning NOWHERE. A cursor drawn on the first block before anybody has pressed a key is a selection
   * state nobody chose.
   */
  let cursor = $state(-1);

  function onkeydown(e: KeyboardEvent) {
    if (mode === 'home') return homeKey(e);
    if (mode !== 'page') return;
    /* A PAGE THAT DRAWS ROWS IS WORKED ROW BY ROW, as a home is and as Work was: `j` and `k` walk its rows, and the
       block keys below are for a page of figures and prose with no row to stop on. */
    if (host && rowsNow().length > 0) return homeKey(e);
    /* THE ONE TEST FOR WHETHER SOMEBODY IS TYPING, rather than a narrower copy of it: `typing()` covers an open select
       and a contenteditable block as well as a field. */
    if (typing()) return;
    if (e.metaKey || e.ctrlKey) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`. */
    if (covered()) return;
    /* ⇧E, the source, is the frame's (`PageView.svelte`); every other chord here is bare. */
    if (e.altKey || e.shiftKey || arranging) return;
    if (silenced(e)) return;

    /* THE READING ORDER, so on a page with a rail `j` walks the main column and then the rail, as the page draws them. */
    const list = reading;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, list.length - 1);
      focusBlock();
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      focusBlock();
    } else if (e.key === 'o') {
      const held = list[cursor]?.block;
      const to = held ? doorOf(held) : null;
      if (to) {
        e.preventDefault();
        void goto(inApp(to));
      }
    } else if (e.key === 'y') {
      const slotIndex = list[cursor]?.slot.i;
      if (slotIndex !== undefined) {
        e.preventDefault();
        void copyBlockLink(slotIndex);
      }
    } else if (e.key === 'Enter') {
      /* ENTER THE BLOCK: move real focus inside it, so the block's own keys take over. `j`/`k` walk blocks and the
         letters are bare; once focus is inside a `role="grid"`, `j`/`k` walk ROWS and the same bare letters are the
         grid's. WCAG 2.1.4's focus exception is what makes bare single letters legal at all, and it is satisfied by
         focus actually being somewhere rather than by a variable saying it is. */
      const held = list[cursor];
      if (!held) return;
      e.preventDefault();
      enter(held.slot.i);
    } else if (e.key === 'Escape') {
      /* LEAVE IT. Focus returns to the document and the cursor stays where it was, so Escape is a step back out rather
         than a reset: a mode you leave by losing your place is a mode people stop entering. */
      const inside = document.activeElement;
      if (inside instanceof HTMLElement && inside !== document.body) {
        e.preventDefault();
        inside.blur();
      }
    }
  }

  /**
   * The first thing inside a block that can take focus.
   *
   * A `table` block's region is `tabindex="0"` and is the right target; a `bar`'s hole row is a button; a `note` has
   * nothing focusable at all and the block is simply scrolled to, because moving focus to a paragraph and announcing it
   * is worse than not moving. The block's BODY, not its bar: the bar carries a link to the list, which is the `o` key's
   * job and the opposite of entering.
   */
  function enter(slotIndex: number) {
    const section = slotEl(slotIndex);
    const body = section?.querySelector<HTMLElement>('.block, .table-region');
    const target =
      body?.matches('[tabindex]:not([tabindex="-1"])') === true
        ? body
        : (body?.querySelector<HTMLElement>('[role="grid"], a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? null);
    if (target) target.focus();
    else section?.scrollIntoView({ block: 'nearest' });
  }

  /** Scrolls the cursor into view under the sticky head. `.block-slot` already carries the margin. */
  function focusBlock() {
    const slot = reading[cursor]?.slot.i;
    if (slot !== undefined) slotEl(slot)?.scrollIntoView({ block: 'nearest' });
  }

  /* ── the row cursor, on a home ────────────────────────────────────────────
     A HOME IS WORKED ROW BY ROW, as Today was: `j` and `k` walk every row of every block in the order the page draws
     them, `x` ticks a task, Enter opens the row, `1` to `9` answer the question under the cursor, and `n` puts the caret
     in the page's capture. A block is not a stop of its own here: on the page everybody opens first, what is wanted is
     the next thing, not the next box.

     THE ROWS ARE FOUND IN THE PAGE AS DRAWN: every element that says it is a row (`data-row`, which the renderer's
     primitives and `QueueAnswer` carry), and a list item of the renderer's lists where a primitive does not say so yet.
     The cursor is kept by the row's own id and its block, so a page read again keeps it on the same row, and a row that
     left (a task ticked away) hands it to the row that took its place.

     AND ON A PAGE AT ITS OWN ADDRESS, A BLOCK THAT DRAWS RECORDS FROM A LIST BUT NO ROW TO STOP ON IS A STOP OF ITS OWN
     (`whole`): cards, a table, a plan. A page that draws rows is walked row by row and the block cursor is off, so `o`
     and `y` are the block's the row sits in. Kiln's lists are drawn as cards and tables, and its only rows are in its
     feed and its notes, which have no list behind them, so `o` and `y` could not reach a single block of it. A block
     that holds no records (Work's capture line) is still no stop. Enter on a whole block goes into it, as the block
     cursor's Enter does. */
  let rowKey = $state<string | null>(null);
  let rowAt = -1;
  /* THE RING IS THE KEYS' MARK: a row a pointer pressed in keeps the cursor, so `x` ticks it, but draws no ring that
     stays after the click. Only `j` and `k` turn it on. */
  let keyed = false;
  let goAt = 0;
  const ROW = '[data-row], .block .list > li.item';

  /** Every row the page draws now, in reading order, each with the key the cursor holds it by. */
  function rowsNow(): { el: HTMLElement; key: string; whole?: true }[] {
    if (!pageEl) return [];
    /* A BLOCK FADING OUT (`recompose.ts`) has left the page, and its rows with it. */
    const all = [...pageEl.querySelectorAll<HTMLElement>(ROW)].filter((el) => !el.closest('[data-leaving]'));
    const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    const keys = rowKeys(outer.map((el) => ({ slot: el.closest('.block-slot')?.id ?? '', row: el.dataset.row })));
    const rows: { el: HTMLElement; key: string; whole?: true }[] = outer.map((el, i) => ({ el, key: keys[i]! }));
    if (mode !== 'page' || !host || rows.length === 0) return rows;
    const wholes = [...pageEl.querySelectorAll<HTMLElement>('.block-slot')]
      .filter((s) => {
        const b = blocks[Number(s.id.slice(`${ids}b-`.length)) - 1];
        /* THE DOOR ITS BAR DRAWS, and not `doorOf` alone: a source the record answers across its lists has no list to
           open (`BlockSlot.svelte`, `listNamed`), and its bar says so by drawing none. */
        return b !== undefined && b.rows.length > 0 && s.querySelector('a.block-source') !== null && !outer.some((r) => s.contains(r));
      })
      .map((el) => ({ el, key: wholeKey(el.id), whole: true as const }));
    return [...rows, ...wholes].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  /** Draws the cursor on the row it holds, or on the row that took its place, and takes focus there when asked. */
  function markRow(focus: boolean) {
    if (!pageEl) return;
    for (const el of pageEl.querySelectorAll('[data-row-cursor]')) el.removeAttribute('data-row-cursor');
    if (rowKey === null) return;
    const rows = rowsNow();
    let at = rows.findIndex((r) => r.key === rowKey);
    if (at < 0 && rowAt >= 0 && rows.length > 0) at = Math.min(rowAt, rows.length - 1);
    const row = rows[at];
    if (!row) return void ((rowKey = null), (rowAt = -1));
    rowKey = row.key;
    rowAt = at;
    if (keyed) row.el.setAttribute('data-row-cursor', '');
    if (!focus) return;
    if (!row.el.hasAttribute('tabindex')) row.el.tabIndex = -1;
    row.el.focus({ preventScroll: true });
    row.el.scrollIntoView({ block: 'nearest' });
  }

  /* AND AGAIN EACH TIME THE PAGE IS DRAWN AGAIN, since a re-read draws new elements and the mark was on the old ones. */
  $effect(() => {
    if (mode === 'preview') return;
    void drawable;
    void rowKey;
    void tick().then(() => markRow(false));
  });

  /**
   * THE RENDERER'S HALF OF THE CURSOR: the row id a block's primitive draws the cursor on, when it is that block's, and
   * the call it makes when one of its rows takes focus. A primitive that does not take them is walked through the page
   * as drawn, above, so the keys work either way.
   */
  const cursorIn = (i: number): string | null => {
    const lead = `${ids}b-${i + 1}|`;
    return rowKey?.startsWith(lead) && !rowKey.startsWith(`${lead}@`) ? rowKey.slice(lead.length) : null;
  };
  const rowFocus = (i: number) => (row: string) => {
    const key = `${ids}b-${i + 1}|${row}`;
    if (key !== rowKey) keyed = false;
    rowKey = key;
    rowAt = rowsNow().findIndex((r) => r.key === rowKey);
  };

  /**
   * THE ROW KEYS, on a home and on a page that draws rows. On a page at its own address the row under the cursor is the
   * page's to change as well (`host`): `e` opens it in the docked panel with the caret in its words, Enter opens it
   * there, `m` opens its menu, and Delete deletes it with an Undo, and `o` and `y` are the block's it sits in. A home
   * has none of those, and Enter follows the row to its own page as it always did.
   */
  function homeKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || covered() || typing() || arranging) return;
    if (host?.menuOpen) return;
    if (silenced(e)) return;
    /* A `g` PRESSED FIRST IS THE SHELL'S, and so is the key after it: `g 1` goes to the first place in the nav. */
    if (e.key === 'g') {
      goAt = Date.now();
      return;
    }
    if (Date.now() - goAt < 1000) {
      goAt = 0;
      return;
    }
    const on = document.activeElement;
    /* INSIDE A TABLE THE KEYS ARE THE TABLE'S: its grid walks its own rows with the same letters. */
    if (on instanceof HTMLElement && on.closest('[role="grid"]')) return;
    const control = on instanceof HTMLElement && on.closest('button, a[href], select, summary') !== null;
    /* FROM A BUTTON IN THE PANEL the page's letters still walk the page, and the panel follows; Esc is the panel's own,
       and Delete never reaches past it to a row. */
    const inPanel = on instanceof HTMLElement && on.closest('dialog') !== null;
    const rows = rowsNow();
    const at = rows.findIndex((r) => r.key === rowKey);
    const under = rows[at]?.el;
    /* A BLOCK THE CURSOR HOLDS AS A WHOLE (`rowsNow`) is no row: its boxes and its options are its rows', not its own. */
    const whole = rows[at]?.whole === true;
    const row = whole ? undefined : under;
    /* THE ROW OF THE RECORD UNDER THE CURSOR, where it is one: a question or a line of an author's fence is not. */
    const record = host && under ? rowOfKey(under.dataset.row) : null;
    switch (e.key) {
      case 'j':
      case 'k': {
        const next = rows[stepRow(rows.length, at < 0 && rowAt >= 0 ? Math.min(rowAt, rows.length - 1) : at, e.key === 'j' ? 1 : -1)];
        if (!next) return;
        rowKey = next.key;
        keyed = true;
        markRow(!inPanel);
        host?.follow(rowOfKey(next.el.dataset.row));
        break;
      }
      case 'x': {
        /* THE ROW'S OWN BOX, pressed, so the tick is the one a pointer makes, with its receipt and its Undo. On a
           question it is the box that chooses it for an answer with others. */
        const box = row?.querySelector<HTMLElement>('[role="checkbox"]');
        if (!box) return;
        box.click();
        break;
      }
      case 'e': {
        if (!host || !record || !host.open(record, true)) return;
        break;
      }
      case 'm': {
        if (!host || !record || !host.openMenu(record, under ?? null, 'move')) return;
        break;
      }
      case 'd': {
        /* THE DAY IT IS DUE, as Work keeps it, on a list that has one. */
        if (!host || !record || !host.shapeOf(record.register)?.due || !host.openMenu(record, under ?? null, 'due')) return;
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (inPanel || !host || !record || !host.remove(record)) return;
        break;
      }
      case 'o':
      case 'y': {
        /* THE BLOCK THE ROW IS IN, on a page: where its rows come from (`door.ts`), or a link to it. */
        if (mode !== 'page') return;
        const slot = under?.closest('.block-slot')?.id.slice(`${ids}b-`.length);
        const i = slot ? Number(slot) - 1 : Number.NaN;
        const held = blocks[i];
        if (!Number.isInteger(i) || !held) return;
        if (e.key === 'y') void copyBlockLink(i);
        else {
          const to = doorOf(held);
          if (!to) return;
          void goto(inApp(to));
        }
        break;
      }
      case 'Enter': {
        if (control || !under) return;
        if (whole) {
          enter(Number(under.id.slice(`${ids}b-`.length)) - 1);
          break;
        }
        /* ON A PAGE A ROW OF THE RECORD OPENS BESIDE THE PAGE, in the panel, and the page stays where it was. */
        if (record && host?.open(record)) break;
        const to = openOf(under.dataset.open, under.dataset.row);
        const link = under.querySelector<HTMLAnchorElement>('a[href]');
        if (to) void goto(inApp(to));
        else if (link) link.click();
        else return;
        break;
      }
      case 'n': {
        const field = pageEl?.querySelector<HTMLInputElement>('.capture-input');
        if (!field) return;
        field.focus();
        break;
      }
      case 'Escape':
        if (inPanel) return;
        /* THE PANEL FIRST, then the cursor, then the choice of questions. */
        if (host?.panelOpen) {
          host.close();
          break;
        }
        if (rowKey === null) {
          if (!pick || pick.chosen.size === 0) return;
          pick.clear();
          break;
        }
        rowKey = null;
        rowAt = -1;
        markRow(false);
        if (on instanceof HTMLElement && (on.hasAttribute('data-row') || on === under)) on.blur();
        break;
      default: {
        /* THE OPTION BY ITS NUMBER, pressed, so the answer is the one the card's own button sends. */
        const n = optionOf(e.key);
        const option = n === null ? null : row?.querySelectorAll<HTMLElement>('.queue-act')[n];
        if (!option) return;
        option.click();
      }
    }
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * THE RENDERER'S TWO ROW VERBS, handed to every block on a page at its own address: a row's title opens it in the
   * panel, and its quiet trailing control opens its menu there. The cursor goes to the row either way, so the keys
   * carry on from it. A row the record did not name is left alone.
   */
  const verbsFor = (i: number) =>
    host && mode === 'page' && writes
      ? {
          onopen: (row: Row) => {
            const r = host.rowOf(row);
            if (!r) return;
            rowKey = `${ids}b-${i + 1}|${r.register}#${r.seq}`;
            host.open(r);
          },
          onmenu: (row: Row, anchor: HTMLElement) => {
            const r = host.rowOf(row);
            if (!r) return;
            rowKey = `${ids}b-${i + 1}|${r.register}#${r.seq}`;
            host.openMenu(r, anchor);
          },
        }
      : null;

  async function copyBlockLink(slotIndex: number) {
    const url = `${route.url.origin}${route.url.pathname}#${ids}b-${slotIndex + 1}`;
    try {
      await navigator.clipboard.writeText(url);
      toasts.push(copy.copied(copy.blockLink));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- ONE BLOCK, WHEREVER IT IS DRAWN. A snippet, so the main column, the rail and a boxed run draw the same markup, and a
     page with no rail draws exactly what it drew before. -->
{#snippet slotted({ slot, block, at }: Laid)}
  <!-- `rail` is whether the block is drawn in the rail; `pos` and `count` are its place in its own column, which is what
       Move up and Move down step through. -->
  {@const rail = layout !== null && slot.area === 'rail'}
  {@const peers = rail ? split.rail : layout ? split.main : pairs}
  {@const pos = peers.findIndex((x) => x.at === at)}
  {@const count = peers.length}
  {@const stacked = rail || slot.span >= COLUMNS}
  <!-- `drawn: false` means the record evaluated `when:` and said no. A page that shows a warning that does not apply
       teaches people to ignore warnings (06 §1). -->
  {#if block.drawn}
    <!-- A `div` that takes `region` or `listitem`, and NOT a `<section>`. A section is already a region landmark once it
         is named, and ARIA does not let one be a `listitem`, so while arranging every block would carry a role its
         element could not have. `div` and an explicit role say the same thing in both modes and, unlike swapping the
         tag, do not tear the node down and drop focus when the mode changes. -->
    <!-- A BLOCK IS A LANDMARK ONLY UNDER A NAME OF ITS OWN, its authored heading. One with none was a region named for
         its kind, so Money's lead and the notes under Heads up were four regions all called "Note", and a landmark
         list of four alike says nothing about where each one goes. It is still a part of the page under its clipped
         heading, and while arranging it is still a listitem named by it. -->
    <div
      class="block-slot"
      id="{ids}b-{slot.i + 1}"
      data-key={keys[slot.i]}
      aria-labelledby={arranging || block.heading ? `${ids}h-${slot.i + 1}` : undefined}
      style="--span:{spans.get(slot.i) ?? slot.span}"
      data-arranging={arranging ? '' : undefined}
      data-cursor={!arranging && mode === 'page' && reading[cursor]?.slot.i === slot.i ? '' : undefined}
      role={arranging ? 'listitem' : block.heading ? 'region' : undefined}
      data-dragging={dragging === at ? '' : undefined}
      data-drop={over && over.at === at && dragging !== at ? over.edge : undefined}
      data-stacked={stacked ? '' : undefined}
      draggable={arranging}
      ondragstart={() => (dragging = at)}
      ondragend={() => ((dragging = null), (over = null))}
      ondragover={(e) => trackDrop(e, at, stacked)}
      ondrop={(e) => {
        e.preventDefault();
        drop();
      }}
      onkeydown={(e) => {
        /* `⌥↑` / `⌥↓`, WCAG 2.5.7's single-pointer alternative, calling the same `move` the drag calls. No `tabindex`
           on the slot: keydown BUBBLES from whichever control inside it has focus, and a listitem that is itself a tab
           stop puts a stop in the sequence that does nothing when you land on it. */
        if (!arranging || !e.altKey) return;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          stepInArea(at, pos, pos - 1);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          stepInArea(at, pos, pos + 1);
        }
      }}
    >
      {#if arranging && arrangement}
        <!-- `a` IS A CONSTANT so the callbacks below keep the narrowing they were built under. -->
        {@const a = arrangement}
        <BlockBar
          kind={block.kind}
          span={slot.span}
          columns={block.columns.length}
          at={pos}
          {count}
          onmove={(to) => stepInArea(at, pos, to)}
          onspan={(span) => a.setSpan(at, span)}
          onedit={() => a.edit(at)}
          onremove={() => a.remove(at)}
          widths={!rail}
        />
        <!-- THE KEYBOARD'S WAY ACROSS, as Move up is its way along: a drag onto the other column does the same, and WCAG
             2.5.7 asks for the control that is not a drag. Only on a page with a rail, since a page without one has
             nowhere to send a block. -->
        {#if layout}
          <div class="area-move">
            <Button weight="bare" onclick={() => void toOtherArea(at, rail ? 'rail' : 'main', slot.i)}>
              <Icon name={rail ? 'back' : 'arrow'} size="s" />
              {rail ? copy.moveToMain : copy.moveToRail}
            </Button>
          </div>
        {/if}
      {/if}
      <BlockSlot
        {block}
        i={slot.i}
        {ids}
        {writes}
        param={page.param}
        {arranging}
        {now}
        {level}
        fold={mode === 'home'}
        rows={mode === 'home' || (mode === 'page' && host) ? { cursor: cursorIn(slot.i), onrowfocus: rowFocus(slot.i) } : null}
        verbs={verbsFor(slot.i)}
        pick={mode === 'preview' ? null : pick}
        walk={mode === 'preview' ? null : onwalk}
      />
    </div>
    <!-- UNDER THE HEADLINE: the one next action the look names, wherever the headline is drawn. -->
    {#if next && !arranging && headline?.at === at}<NextStep {next} host={mode === 'page' ? host : null} />{/if}
    {#if lifted?.at === at}
      <!-- THEN what narrows the page, then what changed on it, before what it holds. -->
      {#if strip}<div class="page-strip">{@render strip()}</div>{/if}
      {#if host && mode === 'page'}<Changed {host} /><JustChanged {host} />{/if}
    {/if}
  {/if}
{/snippet}

<!-- A COLUMN'S BLOCKS, run by run. A boxed section and the blocks after it are one surface, drawn only when one of them
     is drawn, so a box whose every block said no to `when:` leaves no empty panel behind. -->
{#snippet column(list: Laid[])}
  {#each runsOf(list) as run}
    {#if run.box}
      {#if run.items.some((x) => x.block.drawn)}
        <div class="box">
          {#each run.items as x (keys[x.slot.i])}{@render slotted(x)}{/each}
        </div>
      {/if}
    {:else}
      {#each run.items as x (keys[x.slot.i])}{@render slotted(x)}{/each}
    {/if}
  {/each}
{/snippet}

<!-- THE MAIN COLUMN AND THE RAIL, each a snippet so a phone can draw the rail first without a second copy of either. -->
{#snippet mainArea()}
  {#if layout && mainShown}
    <div
      class="area"
      data-area="main"
      style="--area-span:{railShown ? mainSpan(layout) : COLUMNS}"
      role={arranging ? 'list' : undefined}
      aria-label={arranging ? copy.mainColumn : undefined}
    >
      {@render column(mainRest)}
    </div>
  {/if}
{/snippet}

{#snippet railArea()}
  {#if layout && railShown}
    <div
      class="area"
      data-area="rail"
      style="--area-span:{mainShown ? layout.rail : COLUMNS}"
      data-sticky={stuck ? '' : undefined}
      role={arranging ? 'list' : undefined}
      aria-label={arranging ? copy.sideRail : undefined}
      bind:this={railEl}
      bind:clientHeight={railHeight}
    >
      {@render column(railRest)}
    </div>
  {/if}
{/snippet}

<!-- A LIST while arranging, and nothing while reading. The blocks become a reorderable list only in the mode where they
     are reorderable; announcing "list, 5 items" to somebody reading a page is describing the furniture. ON A PAGE WITH A
     RAIL EACH COLUMN IS ITS OWN LIST while arranging, named, and the page is neither. -->
<div class="page" data-mode={mode} data-narrow={narrow ? '' : undefined} data-headed={lifted ? '' : undefined} role={arranging && !layout ? 'list' : undefined} bind:this={pageEl}>
  <!-- JUST CHANGED OPENS THE PAGE, before what it holds; on a page whose head rides over its lead tile it follows that
       tile instead, or the head would sit over it. -->
  <!-- A PAGE WITH NO HEADLINE STILL OPENS ON THE LOOK'S NEXT ACTION, before what narrows it. -->
  {#if next && !headline && !arranging}<NextStep {next} host={mode === 'page' ? host : null} />{/if}
  {#if strip && !lifted}<div class="page-strip">{@render strip()}</div>{/if}
  {#if host && mode === 'page' && !arranging && !lifted}<Changed {host} /><JustChanged {host} />{/if}
  {#if layout}
    <!-- TWO COLUMNS, the main one a twelve-column flow of its own so a block's `span` keeps its meaning inside it, and
         the rail one stack. Each is drawn only while it holds a block, so a page whose every block is in one of them
         draws as one column rather than beside an empty part of the screen. The headline is over both. -->
    {#if lifted}{@render slotted(lifted)}{/if}
    {#if railFirst}
      {@render railArea()}
      {@render mainArea()}
    {:else}
      {@render mainArea()}
      {@render railArea()}
    {/if}
  {:else}
    {@render column(pairs)}
  {/if}
</div>

<style>
  /* TWELVE COLUMNS, and `span` means something: a block's declared `span`, 1 to 12, is its share of the row.

     A FLOW, not a canvas. Blocks fill the row and wrap; there is no x, no y and no hole. 21 §3.1 rejected free placement
     on measured evidence: in Home Assistant's masonry a one-pixel height difference could move a card from the leftmost
     column to the rightmost, and people lost their spatial memory of where a control lived. A flow cannot do that: the
     order you declared is the order you get, at every width.

     THE PAGE SITS ON THE GROUND AND EVERY BLOCK IS A TILE ON IT: 12 between tiles on both axes, and the
     tiles of one row stretch to one height, so a row reads as a row of tiles rather than a skyline. The page has no
     surface of its own; the ground and its light are the shell's.

     NO CAP ON THE PAGE, ONLY ON THE PROSE (DIRECTION §36, §38). The page is as wide as the window, inside the fluid
     gutters, and once the work column is wide enough its full-width blocks pair into two columns (`twoUp`) rather than
     stretching into lines nobody reads to the end; running text keeps its own measure (`--measure`, 72ch) inside the
     block that has it.

     `position: relative` IS FOR A BLOCK FADING OUT, which is laid over the place it held (`recompose.ts`). */
  .page {
    --tile-pad: 20px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--sp-3);
    padding: var(--sp-3) var(--gutter) var(--sp-9);
  }

  /* THE ROW CURSOR'S RING, drawn only once a key has moved it: the focus ink, round the row, never the brand's red. */
  .page :global([data-row-cursor]) {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
    border-radius: var(--r-sm);
  }

  /* INSIDE ANOTHER SCREEN THE PAGE TAKES THAT SCREEN'S COLUMN: Home's body and a preview already sit inside a gutter and
     the width of their own, and a second gutter inside it would indent the blocks twice. */
  .page[data-mode='home'],
  .page[data-mode='preview'] {
    padding: 0;
  }

  /* ── the main column and the rail ─────────────────────────────────────────
     THE TWO COLUMNS ARE SPANS OF THE PAGE'S OWN TWELVE, so the rail's `4` is four of the same twelfths a block's span is
     counted in. THE MAIN COLUMN IS A TWELVE-COLUMN FLOW OF ITS OWN, so `span: 6` there is half the main column, not half
     the page. THE RAIL IS ONE STACK, and a block's span means nothing in it. Each area is its own height, which a sticky
     rail depends on. */
  .area {
    display: grid;
    grid-column: span var(--area-span, 12);
    align-self: start;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .area[data-area='main'] {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  /* A RAIL WITH NOTHING IN IT IS NOT DRAWN, and the main column then takes the page rather than leaving a third of it
     empty beside itself. A MAIN COLUMN WITH NOTHING IN IT is not drawn either, and the rail takes the page the same way. */
  /* BY THE AREAS AND NOT BY THE PAGE'S CHILDREN, since a block fading out is laid in the page as a child of its own
     (`recompose.ts`), and `:last-child` lost the main column its width for the length of the fade. */
  .area[data-area='main']:not(:has(~ .area)),
  .area[data-area='rail']:not(.area ~ .area) {
    grid-column: 1 / -1;
  }

  .area[data-area='rail'] {
    grid-template-columns: minmax(0, 1fr);
    /* Where it sticks, set whether or not it does: under the page head, and the offset this component subtracts when it
       measures whether the rail fits. */
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .area[data-area='rail'] .block-slot {
    grid-column: auto;
  }

  /* STICKY ONLY WHERE THERE ARE TWO COLUMNS. Under 900px the rail follows the main column, and a rail pinned at the top
     of a phone would cover the column it follows. */
  @media (width >= 900px) {
    .area[data-area='rail'][data-sticky] {
      position: sticky;
    }
  }

  /* ── the tile ─────────────────────────────────────────────────────────────
     A BLOCK IS A TILE: the tile surface at the large radius, 20 in, at the first level of depth, and no
     border. Its heading row is `BlockSlot`'s. */
  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses to shrink below its
       content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
    /* The landing line is positioned against this. */
    position: relative;
    padding: var(--tile-pad);
    background: var(--bg);
    border-radius: var(--r-lg);
    /* `#b-4` must not scroll underneath the sticky header. Paid once, per anchor. */
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* A BOXED SECTION IS ONE TILE: the section and the blocks after it, up to the next section, and no tile inside it.
     Its blocks are sections of the one surface, still laid out by their spans as twelfths of it. */
  .box {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--sp-5);
    min-inline-size: 0;
    padding: var(--tile-pad);
    background: var(--bg);
    border-radius: var(--r-lg);
  }

  .area[data-area='rail'] .box {
    grid-template-columns: minmax(0, 1fr);
  }

  /* FORCED COLOURS DELETE THE SHADOW, and a tile with no edge would be words on nothing. */
  @media (forced-colors: active) {
    .block-slot,
    .box {
      border: 1px solid CanvasText;
    }
  }

  /* NOT A TILE: a block inside a boxed tile, a section, which is a group heading on the ground, the page's
     sentence (`note lead`), which is the title row's line under the title, and a list, a table or rows, which sit on
     the ground under their quiet heading so only figures and charts keep a tile (DIRECTION §37, less bento). */
  .box > .block-slot,
  .block-slot:has(> :global(.block[data-kind='section'])),
  .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])),
  .block-slot:has(> :global(.block:is([data-primitive='list'], [data-primitive='table'], [data-primitive='rows']):not([data-kind='inputs']))) {
    padding: 0;
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  /* The sentence is its own line and carries no name over it. The region keeps its name: a reference to a hidden
     heading still reads its text. */
  .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) > :global(.block-bar) {
    display: none;
  }

  /**
   * ON A WIDE SCREEN THE PAGE'S SENTENCE IS A HEADLINE IN A WHITE TILE OF ITS OWN, 40/600, so the screen opens on what
   * is true and the figures behind it follow.
   */
  @media (width >= 900px) {
    .page[data-mode='page'] > .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) {
      padding: var(--sp-5) var(--sp-5) var(--sp-5);
      background: var(--bg);
      border-radius: var(--r-lg);
    }

    /* THE HEAD'S ROW IS THE TOP OF THIS TILE, when the page says so: the name and the tools over the headline. */
    .page[data-mode='page'][data-headed] > .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) {
      padding-block-start: calc(var(--head-over) + var(--sp-2));
    }

    .page[data-mode='page'] > .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(p) {
      max-inline-size: 22em;
      margin: 0;
      color: var(--ink);
      font-size: var(--t-3xl);
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.03em;
      text-wrap: balance;
    }
  }

  /* THE HEADLINE TAKES THE WHOLE ROW, over both columns on a page with a rail, whatever span its author gave it. */
  .page[data-headed] > .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) {
    grid-column: 1 / -1;
  }

  /* WHAT NARROWS THE PAGE, under its headline and across the row, with the gap a row of tiles keeps. */
  .page-strip {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  /**
   * ON A PHONE THE PAGE'S SENTENCE IS THE HEADLINE TOO, at `--t-title` in ink, as it is at 40 from 900px up. It was
   * body size under the 30px name, so the one line that says what is true read as a caption, and the questions under
   * it read louder than it. The name steps down to the label over it (`PageHead`'s `over`).
   */
  @media (width < 900px) {
    .page[data-mode='page'] > .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(p) {
      margin: 0;
      color: var(--ink);
      font-size: var(--t-title);
      font-weight: 600;
      line-height: calc(34 / 28);
      letter-spacing: -0.02em;
      text-wrap: pretty;
    }
  }

  /* A group heading keeps air above it and none below, so it reads as the head of the tiles after it. */
  .block-slot:not(.box > *):has(> :global(.block[data-kind='section'])) {
    padding-block-start: var(--sp-5);
  }

  /* The figure's own bottom margin is the LIST's spacing, and the grid already provides it. */
  .block-slot :global(.block) {
    margin-block-end: 0;
  }

  /* While arranging, the block's way to the other column, under its bar and at its leading edge. */
  .area-move {
    display: flex;
    margin-block-end: var(--sp-2);
  }

  /* THE CURSOR IS THE FOCUS RING, round the tile it is on, in the focus ink and never the brand's red. */
  .block-slot[data-cursor] {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }


  /* ── arranging ────────────────────────────────────────────────────────────
     The tile is marked rather than lifted. A card that grows a shadow the moment a mode opens tells you the mode
     changed the page; a dashed edge a step outside it tells you the mode changed what you can do TO the page. The
     content keeps its contrast, so the words stay readable, which they have to be to know which block you are holding. */
  .block-slot[data-arranging] {
    outline: 1px dashed var(--edge);
    outline-offset: 3px;
    cursor: grab;
  }

  .block-slot[data-arranging] :global(.block) {
    pointer-events: none;
  }

  /* The one moving. Half-visible rather than hidden, so the row you are dragging out of does not collapse under the
     pointer. */
  .block-slot[data-dragging] {
    opacity: 0.45;
    outline-style: solid;
    outline-color: var(--ink);
  }

  /* THE LANDING LINE, a 3px ink bar in the middle of the gap on the edge the held block will arrive at, drawn on a
     pseudo-element so nothing reflows under the pointer. `--z-raise` clears its own sibling and stays under every
     overlay. */
  .block-slot[data-drop]::after {
    --mid: calc(var(--sp-3) / -2 - 1.5px);
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    background: var(--ink);
    border-radius: var(--r-pill);
    pointer-events: none;
  }

  /* Side by side: a vertical line on the leading or trailing edge. */
  .block-slot[data-drop='before']::after,
  .block-slot[data-drop='after']::after {
    inset-block: 0;
    inline-size: 3px;
  }

  .block-slot[data-drop='before']::after {
    inset-inline-start: var(--mid);
  }

  .block-slot[data-drop='after']::after {
    inset-inline-end: var(--mid);
  }

  /* Full width: it stacks, so the line goes across the top or the bottom instead. */
  .block-slot[data-stacked][data-drop]::after {
    inset-inline: 0;
    inset-block: auto;
    inline-size: auto;
    block-size: 3px;
  }

  .block-slot[data-stacked][data-drop='before']::after {
    inset-block-start: var(--mid);
  }

  .block-slot[data-stacked][data-drop='after']::after {
    inset-block-end: var(--mid);
  }

  /* ONE COLUMN below 900px, in declaration order (a page's rail first, `railFirst`), the tiles full width in the 16 gutters. 13 §10 has two
     breakpoints and 05 §6 allows width to change LAYOUT but never size. There is no second stored layout for narrow,
     because a second layout is a second thing to keep in sync and nobody ever does. */
  @media (width < 900px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }

    .area,
    .area[data-area='main'],
    .area[data-area='rail'],
    .box {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr);
    }

    .block-slot {
      grid-column: auto;
    }
  }

  /* AND IN THE ROOM OF A WINDOW UNDER 900 (`data-narrow`, the work column measured against `ONE_UNDER`), as a phone is:
     beside a docked panel or the rail, the work is laid out by the room it has and not by the window around it. */
  .page[data-narrow] {
    grid-template-columns: minmax(0, 1fr);
  }

  .page[data-narrow] :is(.area, .area[data-area='main'], .area[data-area='rail'], .box) {
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr);
  }

  .page[data-narrow] .block-slot {
    grid-column: auto;
  }

  /* One column, so the rail is not pinned over the work it now follows, as under 900. */
  .page[data-narrow] .area[data-area='rail'] {
    position: static;
  }

  /**
   * A STAT IN A NARROW SLOT STACKS ITS FIGURES, because a slot on this page is narrower than a phone long before the
   * window is, and every rule above this one is keyed to the VIEWPORT. Two figures side by side need their two cells and
   * the gap between them; under 288px of block they take a row each, at the size every other figure on the page reads
   * at, rather than a cut one. `record/figure-fit.test.ts` measures every stat a declared page draws against this and
   * `blocks.css`'s own steps. px AND NOT rem: the figure it guards is px wide at any root size, so a rem threshold would
   * be the only thing that moved when a reader sets her text smaller.
   */
  @container (inline-size < 288px) {
    .block-slot :global(.grid:has(> .cell:nth-child(2))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* A BOARD ON A PHONE STACKS ITS LANES. A stat is not restacked here: under 480px of block it is rows, label on the
     left and figure on the right, drawn by blocks.css, and above that its own container steps decide. */
  @media (width < 640px) {
    .block-slot :global(.grid:not(:has(> .cell))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* A ROW ANOTHER HAND CHANGED, NOT YET SEEN: the arrival's wash, held faint rather than faded, so the eye finds it and
     reads past it. A shade and a tooltip, never a colour that means trouble; it goes once the row is opened or the page
     is left and come back to. */
  .page :global([data-row][data-by-new]) {
    background-color: color-mix(in oklab, var(--arrived-wash) 60%, transparent);
  }
</style>
