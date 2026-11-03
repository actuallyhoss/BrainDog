<!--
  A declared page's blocks, laid out: the twelve-column flow and each block's `span`, the main column and the rail a
  `layout` asks for, the boxed runs a `box: true` section opens, and the block cursor `j` and `k` walk. Every block is
  drawn by `BlockSlot.svelte`; while the page is arranged, each carries its bar and takes a drag.

  ONE LAYOUT WHEREVER A DECLARED PAGE IS DRAWN. `/p/<slug>`, Home's body and a preview all lay their blocks out here, so
  a page Slash proposes with a rail is judged in Needs you with its rail, and a use case's Home keeps its columns. It was
  `/p/` alone, and the other two drew a flat stack of blocks.

  A PAGE IS A ROW, NOT A FILE, which is what makes "the Money page" something a freelancer never sees and a studio does
  (06). One request per page load, never one per block: the record answers every block in one read, and this only lays
  out what it answered.
-->
<script lang="ts">
  import { flushSync, tick, untrack, type Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { at as inApp } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import type { Row, WidgetSize } from 'braindog-render';
  import { doorOf } from './door.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { COLUMNS, dropInto, nearestInArea, setAreaAt, type Slot } from '$lib/record/arrange.ts';
  import type { LiveBlock, LivePageDecl, Walked } from '$lib/record/page-live.ts';
  import type { Headed } from '$lib/record/blocks.ts';
  import type { WithRows } from '$lib/home/home-rows.ts';
  import type { Toned } from './tile-head.ts';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import BlockSlot from './BlockSlot.svelte';
  import { areaOf, areasWithFlow, boxesOf, flowAfterRail, layoutOf, leadChartAt, ONE_UNDER, PAIR_FROM, paired, railDrawn, slotOf, snapped, splitAreas, sticks, widened, type Measured, type Run } from './layout.ts';
  import { FOLD_LINES, foldOf, foldWords, linesOf, mayFold } from './fold.ts';
  import { arranged, emptyHidden, openOf, optionOf, rowKeys, stepRow, wholeKey } from './home.ts';
  import type { Writes } from './page-writes.ts';
  import type { Picked } from './picked.svelte.ts';
  import type { RowHost } from './row-host.svelte.ts';
  import { rowOfKey } from './row-verbs.ts';
  import JustChanged from './JustChanged.svelte';
  import Changed from './Changed.svelte';
  import { leadIndex } from './lead.ts';
  import { blockKeys, recomposer, rewritten } from './recompose.ts';
  import { lookOrder, nextOf, placedOf, repeatsFirst } from './look.ts';
  import { asksAside } from './asks.ts';
  import { judgedWith } from './panels.ts';
  import { heldOut, holdsWhole, type Reader } from './held.ts';
  import NextStep from './NextStep.svelte';
  import { COMPACT_MOST } from './queue-answer.ts';
  import { slotPlace } from './slot.ts';
  import { frameResizeObserver } from '$lib/ui/resize.ts';
  import { presses } from '$lib/data/held.svelte.ts';
  import { openPalette } from '$lib/palette/open.svelte.ts';

  let {
    mode,
    page,
    blocks: given,
    held = null,
    now,
    writes,
    arrangement = null,
    ids = '',
    level = 2,
    headed = false,
    leadHead = null,
    leadEnd = null,
    strip = null,
    host = null,
    pick = null,
    onwalk = null,
    whole = false,
    unfolded = false,
    captured = -1,
    under = null,
    opens = null,
    between = null,
    placed = null,
    inside = null,
    bare = false,
  }: {
    /**
     * `page` is `/p/<slug>`, with its block keys. `home` is a home's body: its blocks that hold nothing are not drawn, a
     * long one folds, and the keys walk rows across every block. `preview` is drawn inside another screen and is inert.
     */
    mode: 'page' | 'home' | 'preview';
    /** Questions drawn whole, as Decide's own form draws them, never in the compact form a home uses elsewhere. */
    whole?: boolean;
    /** A home whose lists are drawn whole, never folded under "N more": Scripts, whose rows are the screen. */
    unfolded?: boolean;
    /** The page as the record answered it, whose `layout` says whether there is a rail. */
    page: LivePageDecl;
    /** Every block the page draws, declared then added, each at the index its slot keeps. */
    blocks: readonly LiveBlock[];
    /**
     * The scheduled actions the page's panel would draw, counted by the page before it is judged (`panels.ts`,
     * `PageView.svelte`): a list, of none where the project has none, or `null` where nobody counted.
     */
    held?: readonly unknown[] | null;
    now: number;
    /** The page's writes, or `null` where the page is inert. */
    writes: Writes | null;
    /** The page's arrangement while it can be arranged, or `null` where it cannot. */
    arrangement?: Arrangement | null;
    /** What every id this body writes starts with, so two bodies on one screen never share one. */
    ids?: string;
    /** The level each block's name is drawn at. */
    level?: 2 | 3;
    /** The page's sentence is the header's line (`PageView`'s `led`): lifted out of the board, over both columns. */
    headed?: boolean;
    /**
     * THE LEAD TILE'S HEAD (`PageView`'s): the page's name, its count and its actions on one row, drawn inside the tile
     * the page's sentence opens, over the sentence. Given, the lifted sentence is a tile of its own, the Bento boards'
     * lead tile, and what goes under the sentence goes inside it. `null` keeps the sentence the header's plain line.
     */
    leadHead?: Snippet | null;
    /**
     * THE PAGE'S BUTTONS BESIDE ITS PLAIN SENTENCE (1 Nov): where the sentence is the header's line and not a tile, and
     * the bar already says the name, the head's row held nothing but the buttons, a row of its own over the sentence.
     * Given, they sit at the end of the sentence's first line, and wrap under it only where both do not fit.
     */
    leadEnd?: Snippet | null;
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
    /**
     * The declared index of the line the page opens on to type into, when the page's header holds it (`layout.ts`
     * `headCaptureAt`, `PageView.svelte`): it is not drawn as a tile here, and keeps its place in the list. `-1` for none.
     */
    captured?: number;
    /** What the header hands back to sit under the headline: that same line on a phone, where the name's row has no room for it. */
    under?: Snippet | null;
    /**
     * What the screen draws where the board opens (Today's briefing): straight under the page's own sentence where the
     * page opens on one, so that sentence stays under the screen's head, and before the first block otherwise.
     */
    opens?: Snippet | null;
    /**
     * What the screen draws in the flow of the blocks, straight before the block at an index (Today's desk: the parts that
     * are its own sit between the page's tiles in the order they are seen, so the tab order is the visual order). Called
     * for every block of the list, drawn or not, with its index; a screen that draws nothing there draws nothing.
     */
    between?: Snippet<[number]> | null;
    /**
     * WHERE EACH BLOCK STANDS ON A BOARD (`lib/board`): its widget's key, its grid area and its size, by declared index,
     * or `null` for a block that takes no cell. Given, the page is a board: its blocks are drawn in the order handed and
     * each in its own cell, and the look's order is the board's.
     */
    placed?: ((i: number) => { key: string; area: string; size: string } | null) | null;
    /** What the screen draws inside a block's tile, at its foot: Needs you's foot, a board's editing handles. */
    inside?: Snippet<[number]> | null;
    /**
     * THE BLOCKS AND NOTHING ELSE, for a page laid out as a board (`PageBoard.svelte`): its head (the next step, the slot,
     * what changed, the project's shape) is drawn by the page above the board, so every cell here is a widget.
     */
    bare?: boolean;
  } = $props();

  const arranging = $derived(arrangement?.editing ?? false);

  /* A READER WHO DOES NOT HOLD THE WHOLE RECORD IS NOT DRAWN WHAT IT REFUSED THEM (`held.ts`): a guest's Today has no tile
     saying it drew nothing, each such block left out at its own index. A preview is the author's, and draws every
     refusal; the owner's page is the blocks as handed. */
  const readerWhole = $derived(mode === 'preview' || holdsWhole((route.data as { me?: Reader } | undefined)?.me));
  const blocks = $derived(heldOut(given, readerWhole));
  /* TODAY'S FIRST SCREEN FIRST, ON A PHONE (speed6, 2 Nov). Drawing every tile was one 170 to 240 ms task on a throttled
     phone, and only the first two or three of them are in sight. Every tile's frame is drawn at once, in its cell, but
     only the tiles of the board's first four rows are filled in that task. Then, before the first paint (`firstScreen`),
     each frame still empty whose top is in sight is filled where it stands, a row at a time, until none is; the rest
     fill in the next task, after that paint, under the fold. So what is in sight is drawn whole in the first frame, and never moves after.
     Never while arranging, never on a wider screen, and only on the page's first draw. */
  const FIRST_ROWS = 4;
  const rowOfTile = untrack((): ReadonlyMap<number, number> | null => {
    if (mode !== 'home' || placed === null || typeof window === 'undefined' || !window.matchMedia('(width < 720px)').matches) return null;
    const rows = new Map<number, number>();
    for (let i = 0; i < given.length; i += 1) {
      const top = Number.parseInt(placed(i)?.area ?? '', 10);
      if (top > FIRST_ROWS) rows.set(i, top);
    }
    return rows.size > 0 ? rows : null;
  });
  let later = $state.raw<ReadonlySet<number> | null>(rowOfTile === null ? null : new Set(rowOfTile.keys()));
  if (rowOfTile !== null) requestAnimationFrame(() => firstScreen(rowOfTile));
  function firstScreen(rows: ReadonlyMap<number, number>): void {
    for (let k = 0; later !== null && k < 8; k += 1) {
      const waiting = later;
      const inSight = [...waiting].filter((i) => (document.getElementById(`${ids}b-${i + 1}`)?.getBoundingClientRect().top ?? Infinity) < window.innerHeight);
      if (inSight.length === 0) break;
      const row = Math.min(...inSight.map((i) => rows.get(i) ?? Infinity));
      const rest = new Set([...waiting].filter((i) => rows.get(i) !== row));
      later = rest.size > 0 ? rest : null;
      flushSync();
    }
    if (later !== null) setTimeout(() => (later = null), 0);
  }
  /* A PAGE THAT SAYS WHICH QUESTIONS ARE ITS OWN BORROWS NO OTHER: a queue of questions narrowed by `where` (the Agents
     page's "what a run asked", a project's own) is the page's place for them, and the slot over it drew the first
     question of the whole record, about a mail domain, at the head of Agents. A page with no such queue keeps the slot. */
  const ownQuestions = $derived(given.some((b) => b.kind === 'queue' && (b as { source?: unknown }).source === 'governance.open' && (b as { narrowed?: unknown }).narrowed === true));

  /* ── the main column and the rail ─────────────────────────────────────────
     A PAGE THAT DECLARES `layout` DRAWS TWO COLUMNS; every other page draws the one flow it always has, through the same
     markup, so nothing below changes for it. `layout.ts` says why the rail is a split of the one list and never a
     second list. */
  const layout = $derived(layoutOf(page));

  /**
   * A HEADING THAT HOLDS NOTHING OF ITS OWN IS NOT A TILE (design pass 1 Nov, M28): a section that neither boxes the
   * blocks after it, nor folds them, nor carries a panel or a count drew as a tile with only its name in it, over tiles
   * that each have a heading of their own (Zakat's "How it is worked out" over Step 1 and Step 2). While reading it is
   * left out, at its place; arranging still draws it, as it draws every block.
   */
  const bareHeading = (b: LiveBlock): boolean => {
    if (b.kind !== 'section' || b.drawn === false) return false;
    const k = b as Record<string, unknown>;
    const folds = k.fold === true || b.rows?.[0]?.cells?.[2] === 'fold';
    return k.box !== true && !folds && k.panel === undefined && typeof k.source !== 'string';
  };

  /**
   * THE BLOCKS AS THIS MODE DRAWS THEM. On every page being read, a home or any other, a block that holds nothing and
   * says nothing about it, or that this build cannot draw, is not drawn (an empty or unused part is not
   * drawn), at the index it was declared at, so every id and write on the page still finds it. THE RECORD SAYS WHICH
   * (`drawn: false` with `why`, the kernel's `drawn.ts`), and `emptyHidden` keeps what it left out and judges only what
   * it drew. AUTHORING DRAWS THEM ALL (`arranged`): while the page is arranged, or as a preview of a change, a block that
   * is empty today is still a block somebody is placing, and only one whose `when:` said no stays out.
   *
   * A PAGE AT ITS OWN ADDRESS IS NEVER EMPTIED BY THIS: one whose every block would go keeps the first, which says its
   * one sentence, and still offers the first row, rather than drawing a title over nothing. It kept every block, so an
   * empty Work was a wall of tiles each saying it held nothing.
   *
   * A BOXED SECTION WHOSE PANEL IS THE PROJECT'S SCHEDULED ACTIONS IS JUDGED WITH THEIR COUNT (`panels.ts` `judgedWith`),
   * because the panel reads its actions only once it is drawn: with some it stays over blocks that all went, and with
   * none it goes with them.
   */
  /* A WIDGET THAT SAYS ITS OWN EMPTY LINE (`saysEmpty`, `home/widget-empty.ts`) holds nothing on purpose, and stays drawn. */
  const quiet = $derived(
    judgedWith(blocks, held, (bs) => emptyHidden(bs, mode === 'page')).map((b, i) =>
      bareHeading(b) ? { ...b, drawn: false } : !b.drawn && blocks[i]?.drawn && blocks[i]?.saysEmpty === true ? blocks[i]! : b,
    ),
  );
  const drawable = $derived(mode === 'preview' || arranging ? arranged(blocks) : quiet);
  /* AND THE LINE THE HEADER HOLDS IS NOT A TILE AS WELL (`captured`): not drawn here, and still at its place, so every
     write finds its block. Never while authoring, where it is a block like any other. */
  const tiled = $derived(
    mode !== 'preview' && !arranging && drawable[captured]?.drawn ? drawable.map((b, i) => (i === captured ? { ...b, drawn: false } : b)) : drawable,
  );

  /** The blocks that open a board without being a card on it: a line to type into, a form, a heading. */
  const OPENERS: ReadonlySet<string> = new Set(['capture', 'inputs', 'section']);

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
  const looked = $derived(lookOrder(blocks.map((b, i) => placedOf(b, keys[i]!)), look));

  /**
   * A PAGE'S WAITING QUESTIONS NEVER LEAD IT WHEN IT IS ABOUT SOMETHING ELSE (`asks.ts`): on a page at its
   * own address they are drawn compact, in the side column or after the page's own figures, so Money opens on its cash.
   * Home leads with what needs you, and keeps it there, compact. Not while arranging, where the order is the one being
   * written, and not in a preview.
   */
  /** The work column's width, measured below (`twoUp`); declared here, as the questions' place reads it. */
  let workWidth = $state<number | null>(null);
  const asks = $derived.by(() => {
    if (placed) return { order: blocks.map((_, i) => i), rail: new Set<number>(), compact: new Set<number>(), spans: new Map<number, number>() };
    if (mode !== 'page' || arranging) return { order: looked, rail: new Set<number>(), compact: new Set<number>(), spans: new Map<number, number>() };
    const read = blocks.map((b, i) => {
      const at = tiled[i] as (LiveBlock & { box?: unknown; joins?: unknown; lead?: unknown }) | undefined;
      return {
        kind: b.kind,
        drawn: at?.drawn === true,
        lead: (b as { lead?: unknown }).lead === true,
        box: at?.box === true,
        joins: at?.joins === true,
        area: areaOf(b, layout),
        span: slotOf(b, i, layout).span,
      };
    });
    /* WIDE AS THE PAGE PAIRS ITS BLOCKS (`twoUp`), read off the measure and not off `twoUp`, which reads this order. */
    return asksAside(read, looked, layout !== null, workWidth !== null && workWidth >= PAIR_FROM);
  });
  const order = $derived(asks.order);
  /** Whether a block's questions are drawn compact: every queue on a home, and the questions a page sets aside. */
  /* AND A QUEUE THAT ASKS FOR IT (`compact: true`), as Decide's queue under its lead does, drawn whole or not. */
  const compactAt = (i: number, kind: string): boolean =>
    (blocks[i] as { compact?: unknown } | undefined)?.compact === true || (!whole && (mode === 'home' ? kind === 'queue' : asks.compact.has(i)));
  /** Whether the look's next action is a question the page set aside: it is on the board, and the line would lead with it again. */
  const askedAside = (row: string | undefined): boolean =>
    row !== undefined && blocks.some((b, i) => asks.compact.has(i) && (b.queue ?? []).some((q) => q.id === row));
  /* THE ONE NEXT ACTION THE LOOK NAMES, under the headline: a row of the page, or a question on it waiting on the
     reader. Not in a preview, which is inert. */
  const questions = $derived(new Set(blocks.flatMap((b) => (b.queue ?? []).map((q) => q.id))));
  const nextSaid = $derived(mode === 'preview' ? null : nextOf(look, questions));

  /**
   * The blocks in the order and at the widths currently in force, each carrying the index it had in the declaration.
   *
   * `slot.span` is authoritative whether or not the mode is open: it falls back to the declared span when there is no
   * arrangement. Reading `arranging ? slot.span : spanOf(block)` once meant Done kept the ORDER and silently threw away
   * every width: the layout you confirmed was not the layout you got.
   */
  const laid = $derived.by(() => {
    const slots =
      arrangement?.slots ??
      order.map((i) => {
        const slot = slotOf(tiled[i]!, i, layout);
        return asks.rail.has(i) ? { ...slot, area: 'rail' as const } : slot;
      });
    return slots.map((slot) => ({ slot, block: tiled[slot.i] })).filter((x): x is { slot: Slot; block: LiveBlock } => Boolean(x.block));
  });

  /** Every drawn pair with `at`, its index in `laid`, which is the index the arrangement moves by. */
  type Laid = { slot: Slot; block: LiveBlock; at: number };
  const pairs = $derived<Laid[]>(laid.map((x, at) => ({ ...x, at })));

  /**
   * THE PROJECT'S SHAPE, ITS PARTS AS THE PAGE DECLARES THEM (`{ kind: project, part }`): the hero, Path and
   * Money, Work and Who is on it, Runs on and the agents on it, over both columns and before them, in the order they are
   * declared, as the shape stood over the page when it was drawn by hand. Each row lays its own parts
   * (`ProjectPart.svelte`). On a page at its own address and not while arranging, where each is a block of its column.
   */
  const shapeParts = $derived(mode === 'page' && !arranging ? pairs.filter((x) => x.block.kind === 'project').sort((a, b) => a.slot.i - b.slot.i) : []);
  /** Every pair the columns lay out: all of them, less the shape's parts. */
  const rest = $derived(shapeParts.length === 0 ? pairs : pairs.filter((x) => !shapeParts.includes(x)));

  /** Each area's pairs, in declared order. The slot says where a block is, because a move to the rail is a slot's. */
  const split = $derived(splitAreas(rest, layout, (x) => x.slot.area));

  /**
   * THE HEADLINE, LIFTED: the page's sentence, drawn as the header's line under the page's name and not as a tile
   * (`headed`, `lead.ts`). Over both columns on a page with a rail, and the board starts under it.
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
  /** Whether the lifted sentence is drawn as the lead tile, with the page's head row inside it. */
  const leadTile = $derived(lifted !== null && leadHead !== null);
  /** Where the reserved slot stands on this page, or `null` where it draws none (`slot.ts` `slotPlace`). */
  const slotAt = $derived(slotPlace(page));
  /** Each column's pairs, less the headline lifted over both: a sentence declared in the rail is lifted too, and drawn once. */
  const mainRest = $derived(lifted ? split.main.filter((x) => x !== lifted) : split.main);
  const railRest = $derived(lifted ? split.rail.filter((x) => x !== lifted) : split.rail);

  /**
   * EACH SECTION WITH THE BLOCKS IT HEADS, by its place in `laid`: the drawn blocks after it in its own column, up to the
   * next section, said as a tile's heading reads its own block. The section's row takes its well's tone from them
   * (`blocks.ts` `sectionWell`), so a folded section over what is late does not wear the quiet grey. A section is one
   * block of the list and knows nothing of the next, so the page says it. Held here and not made in the markup, so the
   * block a slot is handed is the same object until the page changes.
   */
  const sectioned = $derived.by(() => {
    const out = new Map<number, LiveBlock>();
    for (const list of layout ? [mainRest, railRest] : [rest]) {
      let open: { at: number; block: LiveBlock; under: Toned[] } | null = null;
      const close = () => {
        if (open && open.under.length > 0) out.set(open.at, { ...open.block, heads: open.under } as Headed<LiveBlock>);
      };
      for (const x of list) {
        if (!x.block.drawn) continue;
        if (x.block.kind === 'section') {
          close();
          open = { at: x.at, block: x.block, under: [] };
        } else if (open) {
          const b = x.block;
          /* NOT A SHELF THAT DOES NOT NEED HIM (leftovers 4): agents' suggestions and what he put off are queues, and a queue
             lends the red of questions waiting, so Needs you's "Suggested by agents" wore a red well over things it says
             are never counted as needing him. Those fold under the quiet grey. */
          if (b.kind === 'queue' && ['governance.apart', 'governance.later'].includes(String((b as { source?: unknown }).source))) continue;
          open.under.push({ kind: b.kind, icon: b.icon, tone: b.tone, where: b.where, late: (b as WithRows).homeRows?.kind === 'late' });
        }
      }
      close();
    }
    return out;
  });

  /**
   * ON A PHONE THE RAIL COMES FIRST, on a page at its own address: its blocks are the page at a glance (Kiln's figures,
   * a desk's pins), and stacked under the main column they were the last thing on a long screen. In the markup and not
   * by `order`, so Tab, a screen reader and `j` meet the blocks in the order the eye does. Home keeps its rail last,
   * because Home's main column is what needs the reader.
   */
  const wide = new MediaQuery('(width >= 900px)', true);
  const railFirst = $derived(mode === 'page' && layout !== null && !wide.current);

  /**
   * AND THE CHART THE MAIN COLUMN OPENS ON COMES BEFORE THE RAIL THERE (`layout.ts` `leadChartAt`): Money's Cash ahead
   * is the page, and it sat under when the cash runs out, the accounts and three questions. `null` where the main
   * column opens on anything else, and off a phone, where the two columns are side by side.
   */
  const leadFirst = $derived.by((): Laid | null => {
    if (!railFirst || !railShown || arranging) return null;
    return mainRest[leadChartAt(mainRest.map((x) => x.block))] ?? null;
  });
  const mainAfter = $derived(leadFirst ? mainRest.filter((x) => x !== leadFirst) : mainRest);

  /**
   * THE ORDER A READER MEETS THE BLOCKS IN, which is the headline, the main column and then the rail (the rail first on
   * a phone), then the board under both: the order the page draws them in, and so the order `j`, `k` and Tab walk. On a
   * page with no rail it is `laid`.
   *
   * ONLY THE BLOCKS THAT ARE DRAWN. A block whose `when:` said no has no element, so a cursor on it is a cursor nobody
   * can see, and `j` on a page that opens with three of them pressed three times before anything moved.
   */
  const reading = $derived.by(() => {
    if (!layout) return [...shapeParts, ...rest].filter((x) => x.block.drawn);
    const top = [...(lifted ? [lifted] : []), ...shapeParts];
    const first = leadFirst ? [leadFirst] : [];
    /* AT A DESK WITH THE COLUMN CLOSED, the board under both columns comes after the rail, where the eye meets it. */
    const desk = [...top, ...flowSplit.beside, ...railRest, ...flowSplit.after];
    return (railFirst ? [...top, ...first, ...railRest, ...mainAfter] : desk).filter((x) => x.block.drawn);
  });

  /**
   * THE ONE NEXT ACTION UNDER THE HEADER, only where it is not the first thing on the board already (`look.ts`
   * `repeatsFirst`): the line said again what the first card asked, straight under it.
   */
  /* THE FIRST CARD, NOT THE FIRST BLOCK: the line a task is typed into and a heading are not what the eye reads first. */
  /* WHERE WHAT THE SCREEN OPENS THE BOARD WITH IS DRAWN (`opens`): under the headline when the headline is the first
     thing a reader meets, by its index in `laid`, and `-1` for the top of the page. The top while arranging, where the
     blocks are a list being moved and nothing stands between two of them. */
  const opensAt = $derived(opens && !arranging && headline && reading[0] === headline ? headline.at : -1);

  const firstTile = $derived(reading.find((x) => x !== headline && !OPENERS.has(x.block.kind))?.block ?? null);
  const next = $derived(nextSaid && !repeatsFirst(look, firstTile) && !askedAside(look?.next?.row) ? nextSaid : null);

  /**
   * The runs an area draws in. A boxed section and the blocks after it share one surface while reading; while arranging
   * every block is loose, because a block being moved is a list item and a list item inside a surface inside the list
   * is a listitem whose parent is not the list.
   */
  const runsOf = (list: Laid[]): Run<Laid>[] => (arranging || placed ? [{ box: false, items: list }] : boxesOf(list, (x) => x.block));

  /**
   * HOW WIDE EACH COLUMN IS DRAWN, `0` for one not drawn: a column whose every block said no to `when:` is not drawn, as
   * an empty one is not, and the other takes the board (`layout.ts` `railDrawn`, which the rule sheet's Layout page holds).
   */
  const columns = $derived(railDrawn(layout, [...mainRest, ...railRest].map((x) => ({ area: x.slot.area, drawn: x.block.drawn }))));
  const railShown = $derived(columns.rail > 0);

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
  $effect(() => {
    const el = pageEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const take = (w: number) => {
      const px = Math.round(w);
      if (px !== workWidth) workWidth = px;
    };
    /* THE FIRST WIDTH IS THE RESIZEOBSERVER'S FIRST ANSWER, TAKEN AT ONCE (speed5): it comes after the browser's own
       layout of the frame and before its paint, so the page is still measured before it is first seen, and nothing makes
       the browser lay the page out in the middle of mounting it, which reading `clientWidth` here did (45 ms on a cold
       phone's Today). Every later answer waits a frame, as before (`frameResizeObserver`). UNTRACKED, or the width this
       writes would be one this effect reads, and every measure would set the watch up again. */
    const watch = frameResizeObserver((seen) => {
      const box = seen.at(-1)?.contentRect;
      if (box) take(box.width);
    });
    const first = new ResizeObserver((seen) => {
      first.disconnect();
      const box = seen.at(-1)?.contentRect;
      if (box) untrack(() => take(box.width));
      watch.observe(el);
    });
    first.observe(el);
    return () => {
      first.disconnect();
      watch.disconnect();
    };
  });
  const twoUp = $derived(workWidth !== null && workWidth >= PAIR_FROM && mode !== 'preview' && (!layout || !railShown));
  /* AND ONE COLUMN IN THE ROOM OF A WINDOW UNDER 900 (`layout.ts` `ONE_UNDER`), beside a docked panel or the rail as much
     as on a phone. Not in a preview, which is drawn at another screen's width. */
  const narrow = $derived(workWidth !== null && workWidth < ONE_UNDER && mode !== 'preview');

  /**
   * THE SIDE COLUMN CLOSES WHERE ITS LAST TILE ENDS (`layout.ts` `flowAfterRail`): the main blocks
   * that start below it are drawn in a third area across the whole board, paired as whole rows are, so Money is not a
   * tall column beside an empty third. Only on a page at its own address at a desk's width, two columns side by side,
   * and never while arranging (each column is a list being moved) or with a rail pinned in view (it would ride over the
   * board under it). `flowAt` is where the main column is cut, by its place in `mainRest`, for the page it was measured
   * on; `null` draws the two columns to the foot, as before. Measured below, before the page is painted.
   */
  let flowAt = $state<{ on: string; at: number } | null>(null);
  const mayFlow = $derived(mode === 'page' && !arranging && layout !== null && railShown && wide.current && !narrow && workWidth !== null);
  const flowSplit = $derived(
    mayFlow && flowAt !== null && flowAt.on === page.page ? areasWithFlow(mainRest, flowAt.at) : { beside: mainRest, after: [] as Laid[] },
  );

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
    /* THE MAIN COLUMN BESIDE THE RAIL AND THE BOARD UNDER IT ARE TWO FLOWS (`flowSplit`), and the one under it pairs its
       whole rows as a page with no rail does, since it has the board's whole width. */
    const after = flowSplit.after;
    const flows = layout ? [flowSplit.beside, after] : [rest];
    for (const run of flows.flatMap((list) => runsOf(list).map((r) => ({ ...r, wide: list === after })))) {
      let got = widened(run.items.map((x) => ({ span: x === lifted ? COLUMNS : x.slot.span, drawn: x.block.drawn })));
      if (twoUp || (run.wide && workWidth !== null && workWidth >= PAIR_FROM)) {
        /* THE QUESTIONS SET BESIDE THE FIGURE THAT OPENS THE PAGE, and the figure beside them (`asks.ts`): set before the
           pairing, so neither is paired with the block after it and that block is not left half a row beside a hole. */
        const now = run.items.map((x, n) => asks.spans.get(x.slot.i) ?? got[n]!);
        got = paired(
          run.items.map((x, n) => ({
            kind: x.block.kind,
            span: now[n]!,
            drawn: x.block.drawn,
            lead: x === lifted || isLead(x.block),
            columns: x.block.columns.length,
            /* A WIDTH ITS AUTHOR WROTE, the whole row included, is never halved beside a neighbour. */
            declared: (x.block as { span?: unknown }).span !== undefined,
          })),
        );
      }
      /* AND EVERY ROW ON THE BOARD'S OWN WIDTHS: a quarter, a third, a half, two thirds or the whole row. */
      const board = snapped(run.items.map((x, n) => ({ span: x === lifted ? COLUMNS : got[n]!, drawn: x.block.drawn })));
      run.items.forEach((x, n) => {
        if (x !== lifted && board[n] !== x.slot.span) out.set(x.slot.i, board[n]!);
      });
    }
    return out;
  });

  /* ── recomposing in place ──────────────────────────────────────────────────
     A NEW ANSWER MOVES THE PAGE, IT DOES NOT REDRAW IT (`recompose.ts`): each block is measured before
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
  /** Where the side column closed when the page was last drawn: a column closing is its first measure, never a move. */
  let wasCut = 0;
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
    const cut = flowSplit.after.length;
    untrack(() => {
      const el = pageEl;
      const same = drewFor === on && wasArranging === moving && wasSized === isSized && wasCut === cut;
      const swap = same ? rewritten(saidWas, said) : new Set<string>();
      drewFor = on;
      wasArranging = moving;
      wasSized = isSized;
      wasCut = cut;
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
    const watch = frameResizeObserver(measure);
    watch.observe(scroller);
    return () => watch.disconnect();
  });
  const stuck = $derived(sticks(layout, railHeight, room));

  /* WHERE THE SIDE COLUMN CLOSES, measured as the pairing measures (`flowAt`, above): each drawn main block by its own
     surface (a boxed run's blocks by their one box, so the column never closes inside it), its top in the main column
     where it is drawn there, and the rail's height. A ResizeObserver answers before the frame is painted, so the page is
     first seen with the column closed; drawn closed, the blocks under the board have no top in the column, and stand
     where they would come back to (`flowAfterRail`), so the cut holds still and never swings back and forth. */
  let mainEl = $state<HTMLElement | null>(null);
  let afterEl = $state<HTMLElement | null>(null);
  /** The desk's main column is the one measured: a phone draws the main column twice, around its rail, and never cuts it. */
  function measuredMain(node: HTMLElement, desk: boolean) {
    const take = (on: boolean) => {
      if (on) mainEl = node;
      else if (mainEl === node) mainEl = null;
    };
    take(desk);
    return {
      update: take,
      destroy: () => take(false),
    };
  }
  $effect(() => {
    const main = mainEl;
    const rail = railEl;
    const under = afterEl;
    const list = mainRest;
    const on = page.page;
    if (!mayFlow || stuck || !main || !rail || typeof ResizeObserver === 'undefined') {
      untrack(() => {
        if (flowAt !== null) flowAt = null;
      });
      return;
    }
    const measure = () => {
      const base = main.getBoundingClientRect().top;
      const gap = Number.parseFloat(getComputedStyle(main).rowGap) || 0;
      const drawn = list.filter((x) => x.block.drawn);
      const seen: Measured[] = drawn.map((x) => {
        const el = slotEl(x.slot.i);
        const unit = el?.parentElement?.classList.contains('box') ? el.parentElement : el;
        if (!unit) return { height: 0 };
        const r = unit.getBoundingClientRect();
        return main.contains(unit) ? { height: r.height, top: r.top - base } : { height: r.height };
      });
      const k = flowAfterRail(seen, rail.getBoundingClientRect().height, gap);
      let at = k < drawn.length ? list.indexOf(drawn[k]!) : -1;
      /* A HIDDEN BLOCK JUST BEFORE THE CUT GOES UNDER WITH WHAT FOLLOWS IT, so a boxed run keeps its section. */
      while (at > 0 && !list[at - 1]!.block.drawn) at--;
      const was = untrack(() => flowAt);
      const next = at > 0 ? { on, at } : null;
      if (next?.at !== was?.at || next?.on !== was?.on) flowAt = next;
    };
    const watch = frameResizeObserver(measure);
    watch.observe(main);
    watch.observe(rail);
    if (under) watch.observe(under);
    return () => watch.disconnect();
  });

  /* ── a long note, folded ───────────────────────────────────────────────────
     A NOTE OR A DOCUMENT OF MORE THAN TWELVE LINES ON A PAGE SHOWS ITS FIRST TWELVE (`fold.ts`): an
     imported document poured down a project page whole. Measured where it is drawn, by its prose's own line, so the
     cut falls under a line and never through one; "Read all" opens it in place. Per visit: what was opened is held
     here by the block's key and goes with the page, never stored. Not while arranging, where a block is being placed.
     A plain Map and Set, replaced whole on each change: Svelte's reactive SvelteMap and SvelteSet put its tracing
     helpers in the chunk every screen loads. */
  let foldSeen = $state.raw<ReadonlyMap<string, { lines: number; clip: number }>>(new Map());
  let foldOpen = $state.raw<ReadonlySet<string>>(new Set());
  /** A block's measure kept, or let go with `null`. */
  function seeFold(at: string, seen: { lines: number; clip: number } | null): void {
    const next = new Map(foldSeen);
    if (seen) next.set(at, seen);
    else next.delete(at);
    foldSeen = next;
  }
  /** A block opened past its fold, or shut again. */
  function openFold(key: string, open: boolean): void {
    if (foldOpen.has(key) === open) return;
    const next = new Set(foldOpen);
    if (open) next.add(key);
    else next.delete(key);
    foldOpen = next;
  }
  let foldFor: string | null = null;
  $effect.pre(() => {
    const on = page.page;
    untrack(() => {
      if (foldFor !== null && foldFor !== on && foldOpen.size > 0) foldOpen = new Set();
      foldFor = on;
    });
  });

  /** Measures a foldable block's lines and where twelve of them end, as it is drawn and each time it changes size. */
  function foldMeasure(el: HTMLElement, key: string) {
    let at = key;
    const measure = () => {
      const text = el.querySelector<HTMLElement>('p, li, pre, blockquote');
      if (!text) return void (foldSeen.has(at) && seeFold(at, null));
      const line = Number.parseFloat(getComputedStyle(text).lineHeight) || 0;
      const top = text.getBoundingClientRect().top - el.getBoundingClientRect().top;
      const lines = linesOf(el.scrollHeight - top, line);
      const clip = Math.round(top + FOLD_LINES * line);
      const was = foldSeen.get(at);
      if (!was || was.lines !== lines || was.clip !== clip) seeFold(at, { lines, clip });
    };
    /* NEXT FRAME: the cut this sets resizes what is watched, and WebKit throws that second round in the same frame as an
       uncaught "ResizeObserver loop" error. */
    let frame = 0;
    const watch =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
          });
    const observe = () => {
      watch?.observe(el);
      for (const child of el.children) watch?.observe(child);
    };
    observe();
    return {
      update(next: string) {
        at = next;
        measure();
      },
      destroy() {
        cancelAnimationFrame(frame);
        watch?.disconnect();
      },
    };
  }

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
  /** The page's keys that write, held while the screen is a saved copy. */
  const HELD_KEYS = new Set(['x', 'e', 'm', 'd', 'Delete', 'Backspace']);
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
    void tiled;
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
    /* WHILE THE SCREEN IS A SAVED COPY (`held.svelte.ts`) THE KEYS THAT WRITE ARE HELD, as a press is: the tick, the
       move, the day, the delete and the row's own action. The cursor still walks, and o and y still go. */
    if (presses.held && HELD_KEYS.has(e.key)) return;
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
        /* A ROW THAT CARRIES ITS OWN ACTIONS PRESSES THE FIRST ONE, as a click on it would. */
        const first = under.querySelector<HTMLElement>('[data-row-action]');
        if (first) {
          first.click();
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
        /* THE LINE A PAGE OPENS ON SITS IN ITS HEAD (`home/HeadCapture.svelte`), outside the body, on a home and on a page. */
        const field = pageEl?.querySelector<HTMLInputElement>('.capture-input') ?? document.querySelector<HTMLInputElement>('.head-capture .capture-input');
        if (field) {
          field.focus();
          break;
        }
        /* AND TODAY'S DESK DRAWS NO LINE (`home/Home.svelte`, since 20 October): a task is added there from the ask bar,
           so on a home with no line `n` opens it, caret in the query, where a typed line is `Add to <list>`. */
        if (mode !== 'home') return;
        openPalette();
        break;
      }
      case 'Escape':
        if (inPanel) return;
        /* THE PANEL FIRST, then the cursor, then the choice of questions. */
        if (host?.panelOpen || host?.changesOpen) {
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
          onmenu: (row: Row, anchor: HTMLElement, point?: { x: number; y: number; height: number }): boolean => {
            const r = host.rowOf(row);
            if (!r) return false;
            rowKey = `${ids}b-${i + 1}|${r.register}#${r.seq}`;
            /* WHAT THE ROW IS CALLED AS DRAWN, for a row this page holds no copy of: its first words, a link taken to its words. */
            const said = (row.cells.find((c) => c) ?? '').replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1').trim();
            return host.openMenu(r, anchor, 'row', point, said);
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
  {@const peers = rail ? split.rail : layout ? split.main : rest}
  {@const pos = peers.findIndex((x) => x.at === at)}
  {@const count = peers.length}
  {@const stacked = rail || slot.span >= COLUMNS}
  <!-- Whether the block folds at twelve lines (`fold.ts`): never the page's sentence, never while arranging. -->
  {@const key = keys[slot.i] ?? String(slot.i)}
  {@const foldable = !arranging && !isLead(block) && mayFold(block.kind, mode)}
  {@const seen = foldable ? foldSeen.get(key) : undefined}
  {@const folds = seen !== undefined && foldOf(block.kind, seen.lines, mode)}
  {@const shut = folds && !foldOpen.has(key)}
  <!-- A PAGE ABOUT ONE ROW THAT LEADS WITH THAT ROW'S OWN CARD names it once, in its title: the card said it twice. -->
  {@const self = block.kind === 'cards' && page.param !== undefined && block.register === page.param.register && block.entries?.length === 1 && block.entries[0]?.seq === page.param.seq}
  {#if between}{@render between(slot.i)}{/if}
  {@const cell = placed ? placed(slot.i) : null}
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
      data-menu-host
      data-key={keys[slot.i]}
      data-source={typeof (block as { source?: unknown }).source === 'string' ? (block as { source: string }).source : undefined}
      aria-labelledby={arranging || block.heading ? `${ids}h-${slot.i + 1}` : undefined}
      style="--span:{spans.get(slot.i) ?? slot.span}{cell ? `;grid-area:${cell.area}` : ''}"
      data-board-key={cell?.key}
      data-size={cell?.size}
      data-full={(spans.get(slot.i) ?? slot.span) >= COLUMNS ? '' : undefined}
      data-arranging={arranging ? '' : undefined}
      data-cursor={!arranging && mode === 'page' && reading[cursor]?.slot.i === slot.i ? '' : undefined}
      role={arranging ? 'listitem' : block.heading ? 'region' : undefined}
      data-dragging={dragging === at ? '' : undefined}
      data-drop={over && over.at === at && dragging !== at ? over.edge : undefined}
      data-stacked={stacked ? '' : undefined}
      data-lead={leadTile && lifted?.at === at ? '' : undefined}
      data-self={self ? '' : undefined}
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
      {#if leadTile && lifted?.at === at}{@render leadHead?.()}{:else if leadEnd && lifted?.at === at}<div class="lead-end head-row-actions">{@render leadEnd()}</div>{/if}
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
      {#if foldable}
        <!-- A LONG NOTE, CUT UNDER ITS TWELFTH LINE on the tile's own ground, and one button under it that says what a
             press does (`fold.ts`). -->
        <div class="fold" id="{ids}f-{slot.i + 1}" data-shut={shut ? '' : undefined} style:--fold-at={seen ? `${seen.clip}px` : undefined}
          use:foldMeasure={key}
          onfocusin={(e) => {
            /* A KEY THAT TABS INTO THE CUT-OFF PART OPENS IT, so nothing focused is out of sight. */
            if (shut && seen && (e.target as HTMLElement).getBoundingClientRect().bottom - e.currentTarget.getBoundingClientRect().top > seen.clip) openFold(key, true);
          }}
        >
          {@render tile(slot, block, at)}
        </div>
        {#if folds}
          <button
            type="button"
            class="fold-toggle tap"
            aria-expanded={!shut}
            aria-controls="{ids}f-{slot.i + 1}"
            onclick={() => {
              if (shut) return void openFold(key, true);
              openFold(key, false);
              slotEl(slot.i)?.scrollIntoView({ block: 'nearest' });
            }}>{shut ? foldWords.open : foldWords.shut}</button
          >
        {/if}
      {:else}
        {@render tile(slot, block, at)}
      {/if}
      <!-- IN THE LEAD TILE, UNDER ITS SENTENCE: the line the page opens on and what narrows it, as the boards draw them. -->
      {#if leadTile && lifted?.at === at}
        <!-- THE NEXT ACTION INSIDE THE HEADER TILE, as its second sentence (Q19 of 29 October): under the tile it floated
             between the header and the first tile as a stray line. -->
        {#if next && !arranging && headline?.at === at}<div class="lead-under"><NextStep {next} host={mode === 'page' ? host : null} /></div>{/if}
        {#if under}<div class="lead-under">{@render under()}</div>{/if}
        {#if strip}<div class="lead-under">{@render strip()}</div>{/if}
      {/if}
      {#if inside}{@render inside(slot.i)}{/if}
    </div>
    <!-- UNDER THE HEADLINE: the one next action the look names, wherever the headline is drawn. -->
    {#if next && !arranging && headline?.at === at && !(leadTile && lifted?.at === at)}<NextStep {next} host={mode === 'page' ? host : null} />{/if}
    <!-- AND WHAT THE SCREEN OPENS THE BOARD WITH, a row of its own under the page's sentence and over the first tile. -->
    {#if opens && opensAt === at}<div class="page-strip" data-opens>{@render opens()}</div>{/if}
    {#if lifted?.at === at}
      <!-- THEN the line the page opens on, on a phone, under its sentence and never between the name and the sentence;
           then what narrows the page, as part of its header, then what was just done on it, before what it holds. -->
      {#if under && !leadTile}<div class="page-strip">{@render under()}</div>{/if}
      {#if strip && !leadTile}<div class="page-strip">{@render strip()}</div>{/if}
      {#if host && mode === 'page'}<JustChanged {host} />{/if}
    {/if}
  {/if}
{/snippet}

<!-- THE BLOCK ITSELF, inside its tile: one snippet, so a folded note and every other block draw the same part. -->
{#snippet tile(slot: Slot, block: LiveBlock, at: number)}
  {#if later === null || arranging || !later.has(slot.i)}<BlockSlot
    block={sectioned.get(at) ?? block}
    i={slot.i}
    {ids}
    {writes}
    param={page.param}
    {arranging}
    {now}
    {level}
    fold={mode === 'home' && !unfolded}
    long={mode === 'page'}
    compact={compactAt(slot.i, block.kind)}
    rows={mode === 'home' || (mode === 'page' && host) ? { cursor: cursorIn(slot.i), onrowfocus: rowFocus(slot.i) } : null}
    verbs={verbsFor(slot.i)}
    pick={mode === 'preview' ? null : pick}
    walk={mode === 'preview' ? null : onwalk}
    slug={mode === 'home' ? page.page : null}
    widget={placed ? ((placed(slot.i)?.size ?? null) as WidgetSize | null) : null}
  />{/if}
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

<!-- THE MAIN COLUMN AND THE RAIL, each a snippet so a phone can draw the rail first without a second copy of either.
     `desk` is passed at every call and has no default: a default makes the build keep Svelte's `fallback` in the chunk
     every screen loads. -->
{#snippet mainArea(list: Laid[], desk: boolean)}
  {#if layout && list.some((x) => x.block.drawn)}
    <div
      class="area"
      data-area="main"
      style="--area-span:{columns.main}"
      role={arranging ? 'list' : undefined}
      aria-label={arranging ? copy.mainColumn : undefined}
      use:measuredMain={desk}
    >
      {@render column(list)}
    </div>
  {/if}
{/snippet}

<!-- THE BOARD UNDER BOTH COLUMNS, once the side column has closed: the main column's later blocks, across the board. -->
{#snippet afterArea(list: Laid[])}
  {#if list.some((x) => x.block.drawn)}
    <div class="area" data-area="after" bind:this={afterEl}>
      {@render column(list)}
    </div>
  {/if}
{/snippet}

{#snippet railArea()}
  {#if layout && railShown}
    <div
      class="area"
      data-area="rail"
      style="--area-span:{columns.rail}"
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
  {#if next && !headline && !arranging && !bare}<NextStep {next} host={mode === 'page' ? host : null} />{/if}
  {#if opens && opensAt < 0 && !bare}<div class="page-strip" data-opens>{@render opens()}</div>{/if}
  <!-- THE PROJECT'S SHAPE OVER BOTH COLUMNS, where the screen's own opening stood, its parts in one flow of their own (`shapeParts`). -->
  {#if shapeParts.some((x) => x.block.drawn) && !bare}
    <div class="area" data-area="shape">
      {#each shapeParts as x (keys[x.slot.i])}{@render slotted(x)}{/each}
    </div>
  {/if}
  {#if under && !lifted}<div class="page-strip">{@render under()}</div>{/if}
  {#if strip && !lifted}<div class="page-strip">{@render strip()}</div>{/if}
  {#if host && mode === 'page' && !arranging && !lifted && !bare}<JustChanged {host} />{/if}
  <!-- THE RESERVED SLOT (`slot.ts`): BrainDog's one suggestion, at the head of a page or a home being read by someone who
       may answer it. It arrives after the page has drawn and draws nothing when there is nothing to suggest, and never
       on a page that is no place to decide (`slotPlace`). ON A HOME EVERY QUESTION ITS QUEUE HOLDS COUNTS AS DRAWN, the
       folded ones too: Today's Needs you is where they are asked, and the slot never asks one of them a second time. -->
  {#if (mode === 'page' || mode === 'home') && writes && readerWhole && !arranging && slotAt && !ownQuestions && !bare}
    <div class="page-strip" data-slot>{#await import('./SuggestionSlot.svelte') then { default: SuggestionSlot }}<SuggestionSlot blocks={given} page={slotAt.page} row={slotAt.row} compact={whole || mode === 'home' ? null : COMPACT_MOST} reread={writes.reread} />{/await}</div>
  {/if}
  {#if layout}
    <!-- TWO COLUMNS, the main one a twelve-column flow of its own so a block's `span` keeps its meaning inside it, and
         the rail one stack. Each is drawn only while it holds a block, so a page whose every block is in one of them
         draws as one column rather than beside an empty part of the screen. The headline is over both. -->
    {#if lifted}{@render slotted(lifted)}{/if}
    {#if railFirst}
      <!-- A PHONE: the chart the main column opens on, the rail, then the rest of the main column. -->
      {#if leadFirst}{@render mainArea([leadFirst], false)}{/if}
      {@render railArea()}
      {@render mainArea(mainAfter, false)}
    {:else}
      <!-- A DESK: the main column beside the rail, and once the rail has ended, the rest of it across the board. -->
      {@render mainArea(flowSplit.beside, true)}
      {@render railArea()}
      {@render afterArea(flowSplit.after)}
    {/if}
  {:else}
    {@render column(rest)}
  {/if}
  <!-- WHAT WAS CHANGED FOR THE READER THIS WEEK, one line at the foot of the board; the list opens in the panel. -->
  {#if host && mode === 'page' && !arranging && !bare}<Changed {host} />{/if}
</div>

<style>
  /* TWELVE COLUMNS, and `span` means something: a block's declared `span`, 1 to 12, is its share of the row.

     A FLOW, not a canvas. Blocks fill the row and wrap; there is no x, no y and no hole. 21 §3.1 rejected free placement
     on measured evidence: in Home Assistant's masonry a one-pixel height difference could move a card from the leftmost
     column to the rightmost, and people lost their spatial memory of where a control lived. A flow cannot do that: the
     order you declared is the order you get, at every width.

     ONE BOARD: EVERY BLOCK IS A TILE ON IT, flat, opaque, no border and no shadow, radius 16, 20 in,
     12 between tiles on both axes. A TILE IS AS TALL AS WHAT IT HOLDS, from the top of its row: stretched to one
     height, a list of one line beside a tile of figures was a tile three quarters empty, and two rows beside eight
     were 400px of white. Nothing floats on the board but the header. The page has no surface of its own; the board's
     colour is the shell's, and the tile's is `--tile` beside it (`packages/skin/tokens.css`).

     NO CAP ON THE PAGE, ONLY ON THE PROSE. The page is as wide as the window, inside the fluid
     gutters, and once the work column is wide enough its full-width blocks pair into two columns (`twoUp`) rather than
     stretching into lines nobody reads to the end; running text keeps its own measure (`--measure`, 72ch) inside the
     block that has it.

     `position: relative` IS FOR A BLOCK FADING OUT, which is laid over the place it held (`recompose.ts`). */
  .page {
    --slot-pad: var(--tile-pad);
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--tile-gap);
    /* THE PAGE'S TOP STEP UNDER THE BAR, as every screen's first content stands (cleanup, 3 Nov): the tile gap put a
       tiled page's first card 16 under the bar at a desk where Today's and Search's stand 24. Under a head that draws
       a row of its own, the head's gap instead. The foot is the page's own step, which clears the phone's tab bar. */
    padding: var(--page-top) var(--gutter) var(--page-bottom);
  }

  :global(.page-head:not([data-tiled])) ~ .page {
    padding-block-start: var(--page-head-gap);
  }

  /* THE ROW CURSOR'S RING, drawn only once a key has moved it: the focus ink, round the row, never the brand's red. */
  .page :global([data-row-cursor]) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: var(--r-xs);
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
    gap: var(--tile-gap);
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

  /* THE PROJECT'S SHAPE, OVER BOTH COLUMNS (`shapeParts`): one row of it under the other, each the whole width, and each
     laying its own parts side by side (`ProjectPart.svelte`). */
  .area[data-area='shape'] {
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr);
  }

  .area[data-area='shape'] > .block-slot {
    grid-column: auto;
  }

  /* THE BOARD UNDER BOTH COLUMNS, once the side column has closed (`flowAfterRail`): the whole width, a twelve-column
     flow of its own as a page with no rail is, so its whole rows pair the same way. */
  .area[data-area='after'] {
    grid-column: 1 / -1;
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  /* ── a long note, folded ───────────────────────────────────────────────────
     CUT UNDER ITS TWELFTH LINE (`--fold-at`, measured), on the tile's own ground: no fade, no veil, since a gradient is
     not the board's. The button under it is words, a press opens the rest in place. */
  .fold[data-shut] {
    max-block-size: var(--fold-at, none);
    overflow: hidden;
  }

  .fold-toggle {
    display: block;
    margin: 0;
    padding: var(--sp-3) 0 0;
    border: 0;
    background: none;
    color: var(--red);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  .fold-toggle:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* STICKY ONLY WHERE THERE ARE TWO COLUMNS. Under 900px the rail follows the main column, and a rail pinned at the top
     of a phone would cover the column it follows. */
  @media (width >= 900px) {
    .area[data-area='rail'][data-sticky] {
      position: sticky;
    }
  }

  /* ── the tile ─────────────────────────────────────────────────────────────
     A BLOCK IS A TILE, whatever it draws: a list, a table, the questions, a figure and a chart alike.
     Lists and tables sat on the ground under their heading and figures sat in tiles, so nothing on a page lined up and
     half of it looked unfinished. Its heading row is `BlockSlot`'s: the icon, the name at 15 and 600, the count. */
  /* TWO TILES SHARING A ROW BETWEEN TWO WHOLE ROWS, ONE OF THEM A PANEL THAT DREW NOTHING (left out whole by
     `BlockSlot`'s rule): the other takes the row, so At work never stands at seven parts beside a gap. */
  :global(.block-slot[data-full] + .block-slot:not([data-full]):has(+ .block-slot > [data-seen-none]):has(+ .block-slot + .block-slot[data-full])),
  :global(.block-slot[data-full] + .block-slot:has(> [data-seen-none]) + .block-slot:not([data-full]):has(+ .block-slot[data-full])) {
    grid-column: 1 / -1;
  }

  .block-slot[data-self] :global(.cards-title) {
    display: none;
  }

  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses to shrink below its
       content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
    /* The landing line is positioned against this. */
    position: relative;
    /* As tall as its own rows, never its neighbour's (above). */
    align-self: start;
    padding: var(--slot-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
    /* ITS EDGE AND LIFT, AS EVERY TILE HAS (rhythm pass, 3 Nov): a block's tile had the fill alone, so in dark it stood
       flatter than the `Tile` cards beside it. */
    box-shadow: var(--card);
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
    padding: var(--slot-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
    box-shadow: var(--card);
  }

  .area[data-area='rail'] .box {
    grid-template-columns: minmax(0, 1fr);
  }

  /* LINES OF ONE BOX READ AS ONE LIST: a note straight after a note sits a small step under it, not a section's gap.
     Money's Heads up drew three one-line warnings 68px apart. */
  .box > .block-slot:has(:global(.block[data-kind='note'])) + .block-slot:has(:global(.block[data-kind='note'])) {
    margin-block-start: calc(var(--sp-1) - var(--sp-5));
  }

  /* FORCED COLOURS DRAW NO FILL, and a tile with no edge would be words on nothing. */
  @media (forced-colors: active) {
    .block-slot,
    .box {
      border: 1px solid CanvasText;
    }
  }

  /* NOT A TILE: a block inside a boxed tile, which is a part of that one surface, and the page's sentence (`note lead`),
     which is the header's line under the page's name. */
  .box > .block-slot,
  .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) {
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
   * THE PAGE'S SENTENCE IS THE HEADER'S LINE, NOT A HERO: once, under the name, at 17 in the body ink
   * and regular weight, at a reading measure, over the whole row, with the board under it. It was 40/600 in a white
   * card of its own, which pushed the work below the fold and read as a slogan. Pulled up under the head, so the name
   * and the line read as one header.
   */
  .block-slot:not([data-arranging]):has(> :global(.block[data-kind='note'][data-form='lead'])) {
    grid-column: 1 / -1;
    margin-block: calc(-1 * var(--sp-2)) var(--sp-1);
  }

  .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(p) {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 400;
    line-height: var(--lh-body);
    letter-spacing: 0;
    text-wrap: pretty;
  }

  /* A FIGURE IN THE LINE READS AT MEDIUM, as the header's own numbers do; never bold. */
  .block-slot:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(strong) {
    font-weight: 500;
  }

  /**
   * THE LEAD TILE (the Bento boards' first tile on every main page): the page's head row, then its sentence at 40/44 and
   * 600, a step under the display weight, and what goes under the sentence. A tile again, 24 in, across the whole row.
   * On a phone the sentence is 32/36 and the tile 16 in, so it still opens the first screen without filling it.
   */
  .block-slot[data-lead]:has(> :global(.block[data-kind='note'][data-form='lead'])) {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: var(--tile-pad-lead);
    background: var(--tile);
    border-radius: var(--r-tile);
    box-shadow: var(--card);
  }

  .block-slot[data-lead]:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(.block p) {
    max-inline-size: 24em;
    font-size: var(--fs-hero);
    font-weight: var(--fw-semi);
    line-height: var(--lead-hero);
    letter-spacing: var(--track-figure);
    text-wrap: balance;
  }

  .block-slot[data-lead]:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(.block strong) {
    font-weight: inherit;
  }

  /**
   * THE SENTENCE AND THE PAGE'S BUTTONS SHARE ONE ROW WHENEVER THEY FIT (1 Nov, "11 people besides you" wrapped while
   * "Add a person" sat on a row of its own above it). Where the bar already says the name (`data-barred`), the head row
   * holds nothing but the buttons, so from 640px up they take the first row's end and the sentence its start: the
   * sentence column is `minmax(0, 1fr)`, so it keeps one line while there is room and wraps only when there is not, and
   * the buttons never shrink. Under 640px the buttons keep their own row over the sentence, which then has the width.
   */
  /* AND THE SAME ROW FOR A PLAIN SENTENCE (`leadEnd`): the sentence at the start, the buttons at the end, centred on its
     first line; a sentence too long for the row wraps in its own column, and under 640px the buttons take a row over
     it. */
  /* ON THE BOARD, NOT A TILE: a quiet button is the tile's colour, as beside the page's name. */
  .lead-end {
    justify-self: end;
  }

  .lead-end :global(.btn:is([data-weight='quiet'], [data-weight='glass'])) {
    --btn-fill: var(--tile);
  }

  /* Where the name's row stood: the head draws no room of its own now, so the row stands on the page's top step, which
     the page's own padding already gives (cleanup, 3 Nov: a 16 of its own put Agents' Share 40 under the bar where
     Settings' ⋯ stands 24). */
  .block-slot:not([data-arranging]):has(> :global(.lead-end + .block[data-kind='note'][data-form='lead'])) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--sp-2);
    margin-block-start: 0;
  }

  @media (width >= 640px) {
    .block-slot:has(> :global(.lead-end + .block[data-kind='note'][data-form='lead'])) {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--sp-5);
    }

    .block-slot:has(> :global(.lead-end + .block[data-kind='note'][data-form='lead'])) > :global(*) {
      grid-column: 1 / -1;
    }

    .block-slot > :global(.lead-end:has(+ .block[data-kind='note'][data-form='lead'])) {
      grid-row: 1;
      grid-column: 2;
      align-self: start;
    }

    .block-slot > :global(.lead-end + .block[data-kind='note'][data-form='lead']) {
      grid-row: 1;
      grid-column: 1;
      align-self: center;
    }
  }

  @media (width >= 640px) {
    .block-slot[data-lead]:has(> :global(.lead-head[data-barred])):has(> :global(.block[data-kind='note'][data-form='lead'])) {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--sp-5);
    }

    .block-slot[data-lead]:has(> :global(.lead-head[data-barred])):has(> :global(.block[data-kind='note'][data-form='lead'])) > :global(*) {
      grid-column: 1 / -1;
    }

    .block-slot[data-lead]:has(> :global(.block[data-kind='note'][data-form='lead'])) > :global(.lead-head[data-barred]) {
      grid-row: 1;
      grid-column: 2;
      align-self: start;
      /* LEVEL WITH THE SENTENCE'S FIRST LINE: its 40px line round the 32px buttons. */
      margin-block-start: calc((40px - var(--ctl-h)) / 2);
    }

    /* THE SENTENCE TAKES THE FIRST ROW'S START even where the page's search stands between it and the buttons in the
       source (Numbers): the search then opens the row under the sentence. */
    .block-slot[data-lead]:has(> :global(.lead-head[data-barred])) > :global(.block[data-kind='note'][data-form='lead']) {
      grid-row: 1;
      grid-column: 1;
    }
  }

  .lead-under {
    min-inline-size: 0;
  }

  .lead-under :global(.next) {
    margin-block-start: 0;
  }

  /* THE LINE TO TYPE INTO, IN THE TILE: the row's width, on the tile's second fill so it reads as a field there. */
  .lead-under :global(.head-capture) {
    inline-size: 100%;
  }

  .lead-under :global(.head-capture .capture-field) {
    background: var(--tile-2);
  }

  @media (width < 640px) {
    .block-slot[data-lead]:has(> :global(.block[data-kind='note'][data-form='lead'])) :global(.block p) {
      font-size: var(--fs-hero-phone);
      line-height: var(--lead-page);
    }
  }

  /* WHAT NARROWS THE PAGE, under its line and across the row: the header's last row. */
  .page-strip {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  /* A STRIP THAT DREW NOTHING TAKES NO ROW, so the page's gap is not spent twice over nothing. */
  .page-strip[data-opens]:empty,
  .page-strip[data-slot]:empty {
    display: none;
  }

  /* ── a section on the board ───────────────────────────────────────────────
     A SECTION IS A TILE TOO, its heading row the same as every tile's: the icon in its well, the name at 15 and 600,
     its count, and Show or Hide at the end as a quiet rectangle (buttons are rectangles). The blocks it
     folds are the tiles after it, which is why it stays their sibling and is not a box round them. No rule under it. */
  .block-slot > :global(.block[data-kind='section'] .sec) {
    padding: 0;
    border: 0;
  }

  .block-slot > :global(.block[data-kind='section'] .sec-title) {
    gap: var(--sp-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  /* THE ONE CARD HEAD HERE TOO (space pass, 4 Nov): a 28 row, `--card-head-gap` over what the slot holds under it. Tell
     an agent's head stood 4 over its field, and Agents at work's on its first row; the slot is a block box, so nothing
     else put air there. */
  .block-slot > :global(.block[data-kind='section'] .sec) {
    min-block-size: var(--well);
  }

  .block-slot > :global(.block.block[data-kind='section']:not(:last-child)) {
    margin-block-end: var(--card-head-gap);
  }

  /* AND ITS GLYPH IS BARE, as `Tile`'s and the block bar's are: 18 of quiet ink, no well behind it. A tone colours the
     glyph, not a fill. */
  .block-slot > :global(.block[data-kind='section'] .sec-glyph:has(> svg)) {
    inline-size: var(--head-glyph);
    block-size: var(--head-glyph);
    background: none;
    border-radius: 0;
    color: var(--ink-3);
  }

  .block-slot > :global(.block[data-kind='section'] .sec-toggle) {
    min-block-size: var(--ctl-h-sm);
    background: var(--tile-2);
    border-radius: var(--r-ctl, 8px);
  }

  @media (pointer: coarse) {
    .block-slot > :global(.block[data-kind='section'] .sec-toggle) {
      min-block-size: var(--tap);
    }
  }

  /* A NOTE WHOSE LINE IS ONE LINK IS A 44 TARGET UNDER A THUMB (13 §7): Today's line on the vital signs is its link and
     nothing else, and measured 19 tall. The link grows, the words stay on their line. */
  @media (pointer: coarse) {
    .block-slot > :global(.block[data-kind='note'] p > a:only-child) {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  /* A NOTE WHOSE LINE IS A ROW OF LINKS IS A FOOT OF DOORS, the Agents page's ("How the brain changed · Learnings ·
     Skills"): only links among its tags. It is drawn on the page's ground and not as a tile, quiet, in the second ink, so
     it reads as the page's foot and not as one more card; under a thumb each door is a 44 by 44 target, centred, the
     dots between them where they were. */
  /* `:has()` NESTS NO `:has()`, so the tile is read off two links side by side, which a sentence with one link never has. */
  .block-slot:not([data-arranging]):has(:global(.block[data-kind='note'] p > a + a)) {
    padding-block: 0;
    background: transparent;
    box-shadow: none;
  }

  .block-slot :global(.block[data-kind='note'] p:has(> a + a):not(:has(> :not(a)))) {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .block-slot :global(.block[data-kind='note'] p:has(> a + a):not(:has(> :not(a))) > a) {
    color: var(--ink-2);
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .block-slot :global(.block[data-kind='note'] p:has(> a + a):not(:has(> :not(a))) > a:hover) {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* AND UNDER A THUMB EVERY LINK OF A NOTE IS 44 BY 44, the foot's doors and a sentence's one link alike ("3 keys have no
     value. Add them in the Keychain", whose number is a tag of its own, so `:only-child` above never reached it). */
  /* A LINK INSIDE A SENTENCE KEEPS ITS LINE (mobile pass, 2 Nov). Grown as a box, Money's opening line ("Invoices late:
     $3,200 to come in. $149 to pay on the card") was two lines 33px apart at 360, and the link could not wrap. Where the
     line holds words as well as links, the target grows by a `::before`, as `.tap` grows one, and the words stay put. */
  @media (pointer: coarse) {
    .block-slot :global(.block[data-kind='note'] p:not(:has(> :not(a))) > a) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }

    .block-slot :global(.block[data-kind='note'] p:has(> :not(a)) > a) {
      position: relative;
    }

    .block-slot :global(.block[data-kind='note'] p:has(> :not(a)) > a::before) {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }

  /* And the same note inside its fold (`fold.ts`), one step down. */
  @media (pointer: coarse) {
    .block-slot > .fold > :global(.block[data-kind='note'] p > a:only-child) {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  /* THE WELL SAYS WHAT IS UNDER IT, in the washes a tile's well takes (`ui/IconWell.svelte`): red where something under
     the section is late or needs the person, the working accent's tint over questions waiting, the earn green over
     cash. The row names the tone (`blocks.ts` `sectionWell`) and the renderer writes it on the well, naming no colour.
     A section that says none keeps the quiet grey. */
  .block-slot > :global(.block[data-kind='section'] .sec-glyph[data-tone='action']) {
    color: var(--red);
  }

  .block-slot > :global(.block[data-kind='section'] .sec-glyph[data-tone='danger']) {
    color: var(--red);
  }

  .block-slot > :global(.block[data-kind='section'] .sec-glyph[data-tone='earn']) {
    color: var(--good);
  }

  /* The figure's own bottom margin is the LIST's spacing, and the grid already provides it. */
  .block-slot :global(.block) {
    margin-block-end: 0;
  }

  /* TWO BLOCKS IN ONE TILE ARE TWO GROUPS, 24 apart (space pass, 4 Nov): on Dashboard's Numbers the chart's dates stood
     on the next number's name with nothing between them, so each figure read as the caption of the chart above it. */
  .block-slot > :global(.block:not([data-kind='section']) + .block) {
    margin-block-start: var(--sp-5);
  }

  /* UNDER A MOUSE A CHART ENDS ON ITS "Show the numbers", which waits unseen for the pointer and already holds 44 of air. */
  @media (hover: hover) and (pointer: fine) {
    .block-slot > :global(.block:has(.lines-numbers) + .block) {
      margin-block-start: 0;
    }
  }

  /* While arranging, the block's way to the other column, under its bar and at its leading edge. */
  .area-move {
    display: flex;
    margin-block-end: var(--sp-2);
  }

  /* THE CURSOR IS THE FOCUS RING, round the tile it is on, in the focus ink and never the brand's red. */
  .block-slot[data-cursor] {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }


  /* ── arranging ────────────────────────────────────────────────────────────
     The tile is marked rather than lifted. A card that grows a shadow the moment a mode opens tells you the mode
     changed the page; a dashed edge a step outside it tells you the mode changed what you can do TO the page. The
     content keeps its contrast, so the words stay readable, which they have to be to know which block you are holding. */
  .block-slot[data-arranging] {
    outline: 1px dashed var(--rule-strong);
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
    --mid: calc(var(--tile-gap) / -2 - 1.5px);
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    background: var(--ink);
    border-radius: var(--r-ctl);
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
    }

    .area,
    .area[data-area='main'],
    .area[data-area='rail'],
    .area[data-area='after'],
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

  .page[data-narrow] :is(.area, .area[data-area='main'], .area[data-area='rail'], .area[data-area='after'], .box) {
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

  /* A BOARD ON A PHONE STACKS ITS LANES. A stat is not restacked here: under 480px of block it is rows, label on the
     left and figure on the right, drawn by stat.css, and above that its own container steps decide. The page's own 288px
     money step is gone: lifted out and measured, it cut no figure (`record/figure-fit.test.ts`). */
  @media (width < 640px) {
    .block-slot :global(.grid:not(:has(> .cell))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* A ROW ANOTHER HAND CHANGED, NOT YET SEEN: the arrival's wash, held faint rather than faded, so the eye finds it and
     reads past it. A shade and a tooltip, never a colour that means trouble; it goes once the row is opened or the page
     is left and come back to. */
  .page :global([data-row][data-by-new]) {
    background-color: color-mix(in oklab, var(--arrived) 60%, transparent);
  }
</style>
